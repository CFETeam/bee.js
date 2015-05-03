(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Bee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var doc = require('./env.js').document
  , utils = require('./utils.js')
  , Event = require('./event.js')
  , Class = require('./class.js')
  , Dir = require('./directive.js')
  , Com = require('./component.js')
  , Watcher = require('./watcher.js')

  , dirs = require('./directives')
  , token = require('./token.js')
  ;


var isObject = utils.isObject
  , isUndefined = utils.isUndefined
  , isFunction = utils.isFunction
  , isPlainObject = utils.isPlainObject
  , parseKeyPath = utils.parseKeyPath
  , deepSet = utils.deepSet
  , deepGet = utils.deepGet
  , extend = utils.extend
  , create = utils.create
  ;


var NODETYPE = {
    ELEMENT: 1
  , ATTR: 2
  , TEXT: 3
  , COMMENT: 8
  , FRAGMENT: 11
};

//设置 directive 前缀
function setPrefix(newPrefix) {
  if(newPrefix){
    this.prefix = newPrefix;
  }
}

/**
 * 构造函数
 * ---
 * @param {String|Element} [tpl] 模板. 等同于 props.$tpl
 * @param {Object} [props] 属性/方法
 **/
function Bee(tpl, props) {
  if(isPlainObject(tpl)) {
    props = tpl;
    tpl = props.$tpl;
  }
  props = props || {};

  var defaults = {
    //$ 开头的是共有属性/方法
    $data: this.$data || {}
  , $el: this.$el || null
  , $target: this.$target || null
  , $tpl: this.$tpl || ''
  , $children: null
  , $filters: this.$filters || {}
  , $parent: null

    //私有属性/方法
  , _watchers: this._watchers || {}
  , _assignments: null//当前 vm 的别名
  , _relativePath: []
  };

  var el;

  //合并所有到当前空间下
  extend(this, defaults, props);
  extend(this, this.$data);

  tpl = tpl || this.$tpl;
  el = tplParse(tpl, this.$target);

  if(this.$el){
    this.$el.appendChild(el.el);
  }else{
    this.$el = el.el;
  }
  this.$tpl = el.tpl;
  this.$children = el.children;

  walk.call(this, this.$el);

  this.$render(this.$data || {});
  this._isRendered = true;
}

//静态属性
extend(Bee, Class, Dir, Com, {
  setPrefix: setPrefix
, prefix: ''
, doc: doc
, directives: {}
, components: {}
});


Bee.setPrefix('a-');

//内置 directive
for(var dir in dirs) {
  Bee.directive(dir, dirs[dir]);
}

//实例方法
//----
extend(Bee.prototype, Event, {
  /**
   * ### ant.render
   * 渲染模板
   */
  $render: function(data) {
    data = data || this.$data;
    this.$replace(data);
    return this;
  }

, $get: function(key) {
    return deepGet(key, this);
  }

  /**
   * ### bee.$set
   * 更新合并 `.data` 中的数据. 如果只有一个参数, 那么这个参数将并入 .$data
   * @param {String} [key] 数据路径.
   * @param {AnyType|Object} val 数据内容.
   */
, $set: function(key, val) {
    var add, keys, hasKey = false;
    if(isUndefined(key)){ return this; }

    if(arguments.length === 1){
      extend(true, this.$data, key);
      extend(true, this, key);
    }else{
      hasKey = true;
      keys = parseKeyPath(key);
      add = deepSet(key, val, {});
      keys[0] !== '$data' && extend(true, this.$data, add);
      extend(true, this, add);
    }
    hasKey ? update.call(this, key, val) : update.call(this, key);
    return this;
  }
  /**
   * 数据替换
   */
, $replace: function (key, val) {
    var keys, hasKey = false;

    if(isUndefined(key)){ return this; }

    if(arguments.length === 1){
      this.$data = key;
    }else{
      hasKey = true;
      keys = parseKeyPath(key);
      if(keys[0] !== 'data') {
        deepSet(key, null, this.$data);
        deepSet(key, val, this.$data);
      }
      deepSet(key, null, this);
      deepSet(key, val, this);
    }
    hasKey ? update.call(this, key, val) : update.call(this, key);
    return this;
  }
  /**
   * 手动更新某部分数据
   * @param {String} keyPath 指定更新数据的 keyPath
   * @param {Boolean} [isBubble=true] 是否更新 keyPath 的父级
   */
, $update: function (keyPath, isBubble) {
    isBubble = isBubble !== false;

    var keys = parseKeyPath(keyPath), key, attrs;
    var watchers;

    while(key = keys.join('.')) {
      watchers = this._watchers[key];

      if (watchers) {
        for (var i = 0, l = watchers.length; i < l; i++) {
          watchers[i].update();
        }
      }

      if(isBubble) {
        keys.pop();
        //最终都冒泡到 $data
        if(!keys.length && key !== '$data'){
          keys.push('$data');
        }
      }else{
        break;
      }
    }
    attrs = this.$get(keyPath);

    //同时更新子路径
    if(isObject(attrs)) {
      Object.keys(attrs).forEach(function(attr) {
        this.$update(keyPath + '.' + attr, false);
      }.bind(this))
    }

    if(isBubble) {
      if(this.$parent) {
        //同步更新父 vm 对应部分
        this._relativePath.forEach(function (path) {
          this.$parent.$update(path);
        }.bind(this))
      }
    }

    return this;
  }
, $watch: function (keyPath, callback) {
    if(callback) {
      addWatcher.call(this, {path: keyPath, update: callback, watch: true})
    }
  }
, $unwatch: function (keyPath, callback) {
    var watchers = this._watchers[keyPath] || [];

    for(var i = watchers.length - 1; i >= 0; i--){
      if(watchers[i].dir.update === callback){
        watchers.splice(i, 1);
      }
    }
  }
});

function update (keyPath, data) {
  var keyPaths;

  if(arguments.length === 1) {
    data = keyPath;
  }else{
    keyPaths = [keyPath];
  }

  if(!keyPaths) {
    if(isObject(data)) {
      keyPaths = Object.keys(data);
    }else{
      //.$data 有可能是基本类型数据
      keyPaths = ['$data'];
    }
  }

  for(var i = 0, path; path = keyPaths[i]; i++){
    this.$update(path, true);
  }

}

//遍历 dom 树
function walk(el) {

  if(el.nodeType === NODETYPE.FRAGMENT) {
    el = el.childNodes;
  }

  if(('length' in el) && isUndefined(el.nodeType)){
    //node list
    //对于 nodelist 如果其中有包含 {{text}} 直接量的表达式, 文本节点会被分割, 其节点数量可能会动态增加
    for(var i = 0; i < el.length; i++) {
      walk.call(this, el[i]);
    }
    return;
  }

  switch (el.nodeType) {
    case NODETYPE.ELEMENT:
        break;
    case NODETYPE.COMMENT:
      //注释节点
      return;
        break;
    case NODETYPE.TEXT:
      //文本节点
      checkText.call(this, el);
      return;
        break;
  }

  if(checkAttr.call(this, el).terminal){
    return;
  }

  //template
  //meta element has content, too.
  if(el.content && el.content.nodeType) {
    walk.call(this, el.content);
    el.parentNode && el.parentNode.replaceChild(el.content, el);
    return;
  }

  for(var child = el.firstChild, next; child; ){
    next = child.nextSibling;
    walk.call(this, child);
    child = next;
  }
}

//遍历属性
function checkAttr(el) {
  var cstr = this.constructor
    , prefix = cstr.prefix
    , dirs = cstr.directive.getDir(el, cstr.directives, cstr.components, prefix)
    , dir
    , terminalPriority, terminal
    , result = {};
    ;

  for (var i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i];
    dir.__dirs = dirs;

    //对于 terminal 为 true 的 directive, 在解析完其相同权重的 directive 后中断遍历该元素
    if(terminalPriority > dir.priority) {
      break;
    }

    el.removeAttribute(dir.nodeName);

    setBinding.call(this, dir);

    if(dir.terminal) {
      terminal = true;
      terminalPriority = dir.priority;
    }
  }

  result.dirs = dirs;
  if(terminal) {
    result.terminal = true;
  }
  return result;
}

//处理文本节点中的绑定占位符({{...}})
function checkText(node) {
  if(token.hasToken(node.nodeValue)) {
    var tokens = token.parseToken(node.nodeValue)
      , textMap = tokens.textMap
      , el = node.parentNode
      , dirs = this.constructor.directives
      , t, dir
      ;

    //将{{key}}分割成单独的文本节点
    if(textMap.length > 1) {
      textMap.forEach(function(text) {
        var tn = doc.createTextNode(text);
        el.insertBefore(tn, node);
        checkText.call(this, tn);
      }.bind(this));
      el.removeChild(node);
    }else{
      t = tokens[0];
      //内置各占位符处理.
      dir = create(t.escape ? dirs.text : dirs.html);
      setBinding.call(this, extend(dir, t, {
        el: node
      }));
    }
  }
}

function setBinding(dir) {
  if(dir.replace) {
    var el = dir.el;
    if(isFunction(dir.replace)) {
      dir.node = dir.replace();
    }else if(dir.replace){
      //dir.node = doc.createComment(dir.type + ' = ' + dir.path);
      dir.node = doc.createTextNode('');
    }

    dir.el = dir.el.parentNode;
    dir.el.replaceChild(dir.node, el);
  }

  dir.link(this);

  if(dir.dirs) {
    //属性表达式
    dir.dirs.forEach(function(d) {
      addWatcher.call(this, extend(create(dir), d));
    }.bind(this));
  }else{
    addWatcher.call(this, dir);
  }
}

function addWatcher(dir) {
  if(dir.path && dir.watch) {
    return new Watcher(this, dir);
  }
}


//target: el 替换的目标
function tplParse(tpl, target) {
  var el, children = null, wraper;
  if(isObject(target) && target.children) {
    children = [];
    for(var i = 0, l = target.children.length; i < l; i++) {
      children.push(target.children[i].cloneNode(true));
    }
  }
  if(isObject(tpl)){
    el = tpl;
    tpl = el.outerHTML;
  }else{
    wraper = doc.createElement('div');
    wraper.innerHTML = tpl;

    el = wraper.firstElementChild || wraper.children[0];

  }
  if(target){
    target.parentNode && target.parentNode.replaceChild(el, target);
  }

  return {el: el, tpl: tpl, children: children};
}

Bee.version = '0.1.0';

module.exports = Bee;

},{"./class.js":2,"./component.js":3,"./directive.js":4,"./directives":7,"./env.js":12,"./event.js":15,"./token.js":17,"./utils.js":18,"./watcher.js":19}],2:[function(require,module,exports){
var extend = require('./utils.js').extend;

var Class = {
  /** 
   * 构造函数继承. 
   * 如: `var Car = Ant.extend({drive: function(){}}); new Car();`
   * @param {Object} [protoProps] 子构造函数的扩展原型对象
   * @param {Object} [staticProps] 子构造函数的扩展静态属性
   * @return {Function} 子构造函数
   */
  extend: function (protoProps, staticProps) {
    protoProps = protoProps || {};
    var constructor = protoProps.hasOwnProperty('constructor') ? protoProps.constructor : function(){ return sup.apply(this, arguments); }
    var sup = this;
    var Fn = function() { this.constructor = constructor; };
    
    Fn.prototype = sup.prototype;
    constructor.prototype = new Fn();
    extend(constructor.prototype, protoProps);
    extend(constructor, sup, staticProps, {__super__: sup.prototype});
    
    return constructor;
  }
};

module.exports = Class;
},{"./utils.js":18}],3:[function(require,module,exports){
"use strict";

var utils = require('./utils.js');

/**
 * 注册组件
 * @param {String} tagName 自定义组件的标签名
 * @param {Function|props} Component 自定义组件的构造函数 / 构造函数参数
 */
function tag(tagName, Component) {
  var tags = this.components = this.components || {};

  this.doc.createElement(tagName);//for old IE

  if(utils.isObject(Component)) {
    Component = this.extend(Component);
  }
  return tags[tagName] = Component;
}

exports.tag = exports.component = tag;

},{"./utils.js":18}],4:[function(require,module,exports){
"use strict";

var utils = require('./utils.js')
  , token = require('./token.js')
  , doc = require('./env.js').document
  ;

/**
 * 为 Ant 构造函数添加指令 (directive). `Ant.directive`
 * @param {String} key directive 名称
 * @param {Object} [opts] directive 参数
 * @param {Number} opts.priority=0 directive 优先级. 同一个元素上的指令按照优先级顺序执行.
 * @param {Boolean} opts.terminal=false 执行该 directive 后, 是否终止后续 directive 执行.
 *   terminal 为真时, 与该 directive 优先级相同的 directive 仍会继续执行, 较低优先级的才会被忽略.
 * @param {Boolean} opts.anchor anchor 为 true 时, 会在指令节点前后各产生一个空白的标记节点. 分别对应 `anchors.start` 和 `anchors.end`
 */
function directive(key, opts) {
  var dirs = this.directives = this.directives || {};

  return dirs[key] = new Directive(key, opts);
}

function Directive(key, opts) {
  this.type = key;
  utils.extend(this, opts);
}

Directive.prototype = {
  priority: 0//权重
, link: utils.noop//初始化方法
, update: utils.noop//更新方法
, tearDown: utils.noop
, terminal: false//是否终止
, replace: false//是否替换当前元素
, watch: true//是否监控 key 的变化

, anchor: false
, anchors: null

  //当 anchor 为 true 时, 获取两个锚点之间的所有节点.
, getNodes: function() {
    var nodes = [], node = this.anchors.start.nextSibling;
    if(this.anchor && node) {
      while(node !== this.anchors.end){
        nodes.push(node);
        node = node.nextSibling;
      }

      return nodes;
    }else{
      return null;
    }
  }
};

//获取一个元素上所有用 HTML 属性定义的指令
function getDir(el, directives, components, prefix) {
  prefix = prefix || '';
  directives = directives || {};

  var attr, attrName, dirName
    , dirs = [], dir, anchors = {}
    , parent = el.parentNode
    , nodeName = el.nodeName.toLowerCase()
    ;

  //对于自定义标签, 将其转为 directive
  if(nodeName in components) {
    el.setAttribute(prefix + 'component', nodeName);
  }

  for(var i = el.attributes.length - 1; i >= 0; i--){
    attr = el.attributes[i];
    attrName = attr.nodeName;
    dirName = attrName.slice(prefix.length);

    if(attrName.indexOf(prefix) === 0 && (dirName in directives)) {
      //指令
      dir = utils.create(directives[dirName]);
      dir.dirName = dirName
    }else if(token.hasToken(attr.value)) {
      //属性表达式可能有多个表达式区
      dir = utils.create(directives['attr']);
      dir.dirs = token.parseToken(attr.value);
      dir.dirName = attrName.indexOf(prefix) === 0 ? dirName : attrName ;
    }else{
      dir = false;
    }

    if(dir) {
      if(dir.anchor && !anchors.start) {
        //同一个元素上的 directive 共享同一对锚点
        anchors.start = doc.createComment(dir.dirName + ' start');
        parent.insertBefore(anchors.start, el);

        anchors.end = doc.createComment(dir.dirName + ' end');
        if(el.nextSibling) {
          parent.insertBefore(anchors.end, el.nextSibling);
        }else{
          parent.appendChild(anchors.end);
        }
      }
      dirs.push(utils.extend(dir, {el: el, node: attr, nodeName: attrName, path: attr.value, anchors: dir.anchor ? anchors : null}));
    }
  }
  dirs.sort(function(d0, d1) {
    return d1.priority - d0.priority;
  });
  return dirs;
}

directive.getDir = getDir;

exports.directive = directive;

},{"./env.js":12,"./token.js":17,"./utils.js":18}],5:[function(require,module,exports){
"use strict";

//属性指令

var utils = require('../utils.js');

var attrPostReg = /\?$/;

module.exports = {
  link: function() {
    if(this.dirName === this.type) {//attr binding
      this.attrs = {};
    }else {
      //条件属性
      if(attrPostReg.test(this.dirName)) {// someAttr? condition binding
        this.dirName = this.dirName.replace(attrPostReg, '');
        this.conditionalAttr = true;
      }
    }
  }
, update: function(val) {
    var el = this.el;
    var newAttrs = {};
    if(this.dirName === this.type) {
      for(var attr in val) {
        setAttr(el, attr, val[attr]);
        //if(val[attr]) {
          delete this.attrs[attr];
        //}
        newAttrs[attr] = true;
      }

      //移除不在上次记录中的属性
      for(var attr in this.attrs) {
        removeAttr(el, attr);
      }
      this.attrs = newAttrs;
    }else{
      if(this.conditionalAttr) {
        val ? setAttr(el, this.dirName, val) : removeAttr(el, this.dirName);
      }else{
        this.textMap[this.position] = val && (val + '');
        setAttr(el, this.dirName, this.textMap.join(''));
      }
    }
  }
};


//IE 浏览器很多属性通过 `setAttribute` 设置后无效. 
//这些通过 `el[attr] = value` 设置的属性却能够通过 `removeAttribute` 清除.
function setAttr(el, attr, val){
  try{
    if(((attr in el) || attr === 'class')){
      if(attr === 'style' && el.style.setAttribute){
        el.style.setAttribute('cssText', val);
      }else if(attr === 'class'){
        el.className = val;
      }else{
        el[attr] = typeof el[attr] === 'boolean' ? true : val;
      }
    }
  }catch(e){}
  try{
    //chrome setattribute with `{{}}` will throw an error
    el.setAttribute(attr, val);
  }catch(e){ console.warn(e) }
}

function removeAttr(el, attr) {
  el.removeAttribute(attr);
  delete el[attr];
}
},{"../utils.js":18}],6:[function(require,module,exports){
//component as directive
var utils = require('../utils.js');

module.exports = {
  priority: -10
, watch: false
, terminal: true
, link: function(vm) {
    var el = this.el;
    var comName = this.path;
    var components = vm.constructor.components;
    var Comp, comp;
    var dirs = [], $data = {};
    var attrs;

    if(comName in components) {

      dirs = this.__dirs;

      dirs = dirs.filter(function (dir) {
        return dir.type == 'attr' || dir.type == 'with';
      });

      attrs = el.attributes;

      //普通属性
      for(var i = attrs.length - 1; i >= 0; i--) {
        $data[attrs[0].nodeName] = attrs[0].value;
      }

      dirs.forEach(function (dir) {
        var withMap = [];
        //属性表达式
        if(dir.dirs) {
          withMap = dir.dirs.map(function (token) {
            return {path: token.path, componentPath: dir.nodeName};
          });
        }else{
          //a-with directive
          withMap = dir.locals.map(function(local) {
            return {path: local, componentPath: local};
          });
        }

        //监听父组件更新
        withMap.forEach(function (pathConfig) {
          vm.$watch(pathConfig.path, function (val) {
            if (comp) {
              comp.$set(pathConfig.componentPath, val);
            } else {
              if(pathConfig.componentPath === '$data'){
                $data = val
              }else {
                $data[pathConfig.componentPath] = val;
              }
            }
          })
        });
      });

      Comp = components[comName];
      comp = new Comp({$target: el, $data: utils.extend({}, Comp.prototype.$data, $data)});

      //直接将component 作为根元素时, 同步跟新容器 .$el 引用
      if(vm.$el === el) {
        vm.$el = comp.$el;
      }
      return true;
    }else{
      console.warn('Component: ' + comName + ' not defined! Ignore');
    }
  }
};
},{"../utils.js":18}],7:[function(require,module,exports){
"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  , token = require('../token.js')
  ;

var dirs = {};


dirs.text = {
  terminal: true
, replace: true
, update: function(val) {
    this.node.nodeValue = utils.isUndefined(val) ? '' : val;
  }
};


dirs.html = {
  terminal: true
, replace: true
, link: function() {
    this.nodes = [];
  }
, update: function(val) {
    var el = doc.createElement('div');
    el.innerHTML = utils.isUndefined(val) ? '' : val;

    var node;
    while(node = this.nodes.pop()) {
      node.parentNode && node.parentNode.removeChild(node);
    }

    var nodes = el.childNodes;
    while(node = nodes[0]) {
      this.nodes.push(node);
      this.el.insertBefore(node, this.node);
    }
  }
};


dirs['if'] = {
  anchor: true
, link: function() {
    if(this.el.content) {
      this.frag = this.el.content;
      this.el.parentNode.removeChild(this.el);
    }else{
      this.frag = doc.createDocumentFragment()
      this.hide();
    }
  }
, update: function(val) {
    if(val) {
      if(!this.state) { this.show() }
    }else{
      if(this.state) { this.hide(); }
    }
    this.state = val;
  }

, show: function() {
    var anchor = this.anchors.end;

    anchor.parentNode && anchor.parentNode.insertBefore(this.frag, anchor);
  }
, hide: function() {
    var nodes = this.getNodes();

    if(nodes) {
      for(var i = 0, l = nodes.length; i < l; i++) {
        this.frag.appendChild(nodes[i]);
      }
    }
  }
};

dirs.template = {
  priority: 10000
, link: function() {
    var nodes = this.el.childNodes
      , frag = doc.createDocumentFragment()
      ;

    while(nodes[0]) {
      frag.appendChild(nodes[0]);
    }

    this.el.content = frag;

    //this.el.setAttribute(this.nodeName, '');
  }
};

//图片用, 避免加载大括号的原始模板内容
dirs.src = {
  update: function(val) {
    this.el.src = val;
  }
};

dirs['with'] = {};

//dirs.partial = require('./partial.js');
dirs.repeat = require('./repeat.js');
dirs.attr = require('./attr.js');
dirs.model = require('./model.js');
dirs.style = require('./style.js');
dirs.on = require('./on.js');
dirs.component = require('./component.js');

module.exports = dirs;

},{"../env.js":12,"../token.js":17,"../utils.js":18,"./attr.js":5,"./component.js":6,"./model.js":8,"./on.js":9,"./repeat.js":10,"./style.js":11}],8:[function(require,module,exports){
"use strict";

var utils = require('../utils.js')
  , hasToken = require('../token.js').hasToken
  , events = require('../event-bind.js')
  ;

module.exports = {
  teminal: true
, priority: 1
, link: function(vm) {
    var keyPath = this.path;

    if(!keyPath) { return false; }

    var el = this.el
      , ev = 'change'
      , attr, value = attr = 'value'
      , ant = vm
      //, cur = vm.$getVM(keyPath, {assignment: this.assignment})
      , isSetDefaut = utils.isUndefined(ant.$get(keyPath))//界面的初始值不会覆盖 model 的初始值
      , crlf = /\r\n/g//IE 8 下 textarea 会自动将 \n 换行符换成 \r\n. 需要将其替换回来
      , callback = function(val) {
          var newVal = (val || '') + ''
            , val = el[attr]
            ;
          val && val.replace && (val = val.replace(crlf, '\n'));
          if(newVal !== val){ el[attr] = newVal; }
        }
      , handler = function(isInit) {
          var val = el[value];

          val.replace && (val = val.replace(crlf, '\n'));
          ant.$set(keyPath, val, {isBubble: isInit !== true});
        }
      , callHandler = function(e) {
          if(e && e.propertyName && e.propertyName !== attr) {
            return;
          }
          handler.apply(this, arguments)
        }
      , ie = utils.ie
      ;

    switch(el.tagName) {
      default:
        value = attr = 'innerHTML';
        //ev += ' blur';
      case 'INPUT':
      case 'TEXTAREA':
        switch(el.type) {
          case 'checkbox':
            value = attr = 'checked';
            //IE6, IE7 下监听 propertychange 会挂?
            if(ie) { ev += ' click'; }
          break;
          case 'radio':
            attr = 'checked';
            if(ie) { ev += ' click'; }
            callback = function(val) {
              el.checked = el.value === val + '';
            };
            isSetDefaut = el.checked;
          break;
          default:
            if(!ant.$lazy){
              if('oninput' in el){
                ev += ' input';
              }
              //IE 下的 input 事件替代
              if(ie) {
                ev += ' keyup propertychange cut';
              }
            }
          break;
        }
      break;
      case 'SELECT':
        if(el.multiple){
          handler = function(isInit) {
            var vals = [];
            for(var i = 0, l = el.options.length; i < l; i++){
              if(el.options[i].selected){ vals.push(el.options[i].value) }
            }
            ant.$set(keyPath, vals, {isBubble: isInit !== true});
          };
          callback = function(vals){
            if(vals && vals.length){
              for(var i = 0, l = el.options.length; i < l; i++){
                el.options[i].selected = vals.indexOf(el.options[i].value) !== -1;
              }
            }
          };
        }
        isSetDefaut = isSetDefaut && !hasToken(el[value]);
      break;
    }

    this.update = callback;

    ev.split(/\s+/g).forEach(function(e){
      events.removeEvent(el, e, callHandler);
      events.addEvent(el, e, callHandler);
    });

    //根据表单元素的初始化默认值设置对应 model 的值
    if(el[value] && isSetDefaut){
       handler(true);
    }

  }
};

},{"../event-bind.js":14,"../token.js":17,"../utils.js":18}],9:[function(require,module,exports){
"use strict";

//事件监听

var eventBind = require('../event-bind.js');

//TODO 移除时的情况
module.exports = {
  link: function(vm) {
    //this.events = {};
    this.vm = vm;
  }
, update: function(events) {
    for(var name in events) {
      eventBind.addEvent(this.el, name, events[name].bind(this.vm));
    }
    //this.events = events;
  }
}
},{"../event-bind.js":14}],10:[function(require,module,exports){
"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  ;

module.exports = {
  priority: 1000
, anchor: true
, terminal: true
, link: function(vm) {

    this.vm = vm;

    this.cstr = vm.constructor;

    this.curArr = [];
    this.list = [];//[{el:el, vm: vm}]

    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    if(utils.isArray(items)) {

      //删除元素
      arrDiff(curArr, items).forEach(function(item) {
        var pos = curArr.indexOf(item)
        curArr.splice(pos, 1)
        parentNode.removeChild(this.list[pos].el)
        this.list.splice(pos, 1)

      }.bind(this))

      items.forEach(function(item, i) {
        var pos = items.indexOf(item, i)
          , oldPos = curArr.indexOf(item, i)
          , vm, el
          ;

        pos < 0 && (pos = items.lastIndexOf(item, i));
        oldPos < 0 && (oldPos = curArr.lastIndexOf(item, i));

        //新增元素
        if(oldPos < 0) {

          // 在 repeat 指令表达式中
          this.listPath = this.locals.filter(function(path) {
            return utils.isArray(this.vm.$get(path))
          }.bind(this));

          el = this.el.cloneNode(true)


          vm = new this.cstr(el, {$data: item, $parent: this.vm, _assignments: this.assignments});
          parentNode.insertBefore(vm.$el, this.list[pos] && this.list[pos].el || this.anchors.end)
          this.list.splice(pos, 0, {el: el, vm: vm});
          curArr.splice(pos, 0, item)

          //延时赋值给 `_relativePath`, 避免出现死循环
          //如果在上面实例化时当参数传入, 会冒泡到父级 vm 递归调用这里的 update 方法, 造成死循环.
          vm._relativePath = this.listPath;
        }else {

          //调序
          if (pos !== oldPos) {
            parentNode.insertBefore(this.list[oldPos].el, this.list[pos].el || this.anchor.end)
            parentNode.insertBefore(this.list[pos].el, this.list[oldPos + 1].el || this.anchor.end)
            this.list[oldPos] = [this.list[pos], this.list[pos] = this.list[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
          }
        }
      }.bind(this))
    }else{
      //TODO 普通对象的遍历
    }
  }
};


function arrDiff(arr1, arr2) {
  return arr1.filter(function(el) {
    return arr2.indexOf(el) < 0
  })
}


},{"../env.js":12,"../utils.js":18}],11:[function(require,module,exports){
"use strict";

//样式指令

var camelReg = /([A-Z])/g;

//默认单位为 px 的属性
//TODO 待完善
var pixelAttrs = [
  'width','height',
  'margin', 'margin-top', 'margin-right', 'margin-left', 'margin-bottom',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'
]

module.exports = {
  link: function() {

  }
, update: function(styles) {
    var el = this.el;
    var styleStr = '';
    var dashKey, val;

    for(var key in styles) {
      val = styles[key];

      dashKey = key.replace(camelReg, function (upperChar) {
        return '-' + upperChar.toLowerCase();
      });

      if(!isNaN(val) && pixelAttrs.indexOf(dashKey) >= 0) {
        val += 'px';
      }
      styleStr += dashKey + ': ' + val + '; ';
    }
    if(el.style.setAttribute){
      //老 IE
      el.style.setAttribute('cssText', styleStr);
    }else{
      el.setAttribute('style', styleStr);
    }
  }
};
},{}],12:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":undefined}],13:[function(require,module,exports){
"use strict";

var operators = {
  'unary': {
    '+': function(v) { return +v; }
  , '-': function(v) { return -v; }
  , '!': function(v) { return !v; }

  , '[': function(v){ return v; }
  , '{': function(v){
      var r = {};
      for(var i = 0, l = v.length; i < l; i++) {
        r[v[i][0]] = v[i][1];
      }
      return r;
    }
  , 'typeof': function(v){ return typeof v; }
  , 'new': function(v){ return new v }
  }

, 'binary': {
    '+': function(l, r) { return l + r; }
  , '-': function(l, r) { return l - r; }
  , '*': function(l, r) { return l * r; }
  , '/': function(l, r) { return l / r; }
  , '%': function(l, r) { return l % r; }
  , '<': function(l, r) { return l < r; }
  , '>': function(l, r) { return l > r; }
  , '<=': function(l, r) { return l <= r; }
  , '>=': function(l, r) { return l >= r; }
  , '==': function(l, r) { return l == r; }
  , '!=': function(l, r) { return l != r; }
  , '===': function(l, r) { return l === r; }
  , '!==': function(l, r) { return l !== r; }
  , '&&': function(l, r) { return l && r; }
  , '||': function(l, r) { return l || r; }

  , '.': function(l, r) {
      if(r){
        path = path + '.' + r;
      }
      return l[r];
    }
  , '[': function(l, r) {
      if(typeof r !== 'undefined'){
        path = path + '.' + r;
      }
      return l[r];
    }

  , '(': function(l, r){ return l.apply(context.locals, r) }
  , '|': function(l, r){ return r.call(context.locals, l) }//filter. name|filter
  , 'new': function(l, r){
      return l === Date ? new Function('return new Date(' + r.join(', ') + ')')() : new (Function.prototype.bind.apply(l, r));
    }

  , 'in': function(l, r){
      if(this.assignment) {
        //repeat
        return r;
      }else{
        return l in r;
      }
    }
  }

, 'ternary': {
    '?': function(f, s, t) { return f ? s : t; }
  , '(': function(f, s, t) { return f[s].apply(f, t) }

  //filter. name | filter : arg2 : arg3
  , '|': function(f, s, t){ return s.apply(context.locals, [f].concat(t)); }
  }
};

var argName = ['first', 'second', 'third']
  , context, summary
  , path
  , self
  ;

//遍历 ast
var evaluate = function(tree) {
  var arity = tree.arity
    , value = tree.value
    , args = []
    , n = 0
    , arg
    , res
    ;

  //操作符最多只有三元
  for(; n < 3; n++){
    arg = tree[argName[n]];
    if(arg){
      if(Array.isArray(arg)){
        args[n] = [];
        for(var i = 0, l = arg.length; i < l; i++){
          args[n].push(typeof arg[i].key === 'undefined' ?
            evaluate(arg[i]) : [arg[i].key, evaluate(arg[i])]);
        }
      }else{
        args[n] = evaluate(arg);
      }
    }
  }

  if(arity !== 'literal') {
    if(path && value !== '.' && value !== '[') {
      summary.paths[path] = true;
    }
    if(arity === 'name') {
      path = value;
    }
  }

  switch(arity){
    case 'unary':
    case 'binary':
    case 'ternary':
      try{
        res = getOperator(arity, value).apply(tree, args);
      }catch(e){
        //console.debug(e);
      }
    break;
    case 'literal':
      res = value;
    break;
    case 'assignment':
      summary.assignments[value] = true;
    break;
    case 'name':
      summary.locals[value] = true;
      res = getValue(value, context.locals);
    break;
    case 'filter':
      summary.filters[value] = true;
      res = context.filters[value];
    break;
    case 'this':
      res = context.locals;//TODO this 指向 vm 还是 dir?
    break;
  }
  return res;
};

function getOperator(arity, value){
  return operators[arity][value] || function() { return; }
}

function reset(scope, that) {
  if(scope) {
    context = {locals: scope || {}, filters: scope.$filters || {}};
  }else{
    context = {filters: {}, locals: {}};
  }
  if(that){
    self = that;
  }

  summary = {filters: {}, locals: {}, paths: {}, assignments: {}};
  path = '';
}

//在作用域中查找值
var getValue = function (key, scope) {
  //对于具名 repeat 查找顺序为 别名, 父级 scope, 自身 scope
  if(scope._assignments && scope._assignments[0] === key) {
    return scope
  }else if(scope.$parent) {
    return getValue(key, scope.$parent);
  }else  if(typeof scope[key] !== 'undefined') {
    return scope[key];
  }else{
    return;
  }
}

//表达式求值
//tree: parser 生成的 ast
//scope 执行环境
exports.eval = function(tree, scope, that) {
  reset(scope || {}, that);

  return evaluate(tree);
};

//表达式摘要
//return: {filters:[], locals:[], paths: [], assignments: []}
exports.summary = function(tree) {
  reset();

  evaluate(tree);

  if(path) {
    summary.paths[path] = true;
  }
  for(var key in summary) {
    summary[key] = Object.keys(summary[key]);
  }
  return summary;
};

},{}],14:[function(require,module,exports){
"use strict";

exports.addEvent = function addEvent(el, event, handler) {
  if(el.addEventListener) {
    el.addEventListener(event, handler, false);
  }else{
    el.attachEvent('on' + event, handler);
  }
}

exports.removeEvent = function removeEvent(el, event, handler) {
  if(el.removeEventListener) {
    el.removeEventListener(event, handler);
  }else{
    el.detachEvent('on' + event, handler);
  }
}
},{}],15:[function(require,module,exports){
var utils = require('./utils.js');

var Event = {
  //监听自定义事件.
  on: function(name, handler, context) {
    var ctx = context || this
      ;

    ctx._handlers = ctx._handlers || {};
    ctx._handlers[name] = ctx._handlers[name] || [];

    ctx._handlers[name].push({handler: handler, context: context, ctx: ctx});
    return this;
  },
  one: function (name, handler, context) {
    if(handler){
      handler.one = true;
    }
    return this.on(name, handler, context);
  },
  //移除监听事件.
  off: function(name, handler, context) {
    var ctx = context || this
      , handlers = ctx._handlers
      ;

    if(name && handlers[name]){
      if(utils.isFunction(handler)){
        for(var i = handlers[name].length - 1; i >=0; i--) {
          if(handlers[name][i].handler === handler){
            handlers[name].splice(i, 1);
          }
        }
      }else{
        handlers[name] = [];
      }
    }
    return this;
  },
  //触发自定义事件.
  //该方法没有提供静态化的 context 参数. 如要静态化使用, 应该: `Event.trigger.call(context, name, data)`
  trigger: function(name, data) {
    var args = [].slice.call(arguments, 1)
      , handlers = this._handlers && this._handlers[name]
      ;

    if(handlers){
      for(var i = 0, item; item = handlers[i]; i++) {
        item.handler.apply(this, args);
        if(item.handler.one) {
          handlers.splice(i, 1);
          i--;
        }
      }
    }
    return this;
  }
};

module.exports = Event;

},{"./utils.js":18}],16:[function(require,module,exports){
"use strict";
//Javascript expression parser modified form Crockford's TDOP parser
var create = Object.create || function (o) {
	function F() {}
	F.prototype = o;
	return new F();
};

var source;

var error = function (message, t) {
	t = t || this;
  var msg = message += " But found '" + t.value + "'" + (t.from ? " at " + t.from : "") + " in '" + source + "'";
  var e = new Error(msg);
	e.name = t.name = "SyntaxError";
	t.message = message;
  throw e;
};

var tokenize = function (code, prefix, suffix) {
	var c; // The current character.
	var from; // The index of the start of the token.
	var i = 0; // The index of the current character.
	var length = code.length;
	var n; // The number value.
	var q; // The quote character.
	var str; // The string value.
	var f; //The regexp flag.

	var result = []; // An array to hold the results.

	// Make a token object.
	var make = function (type, value) {
		return {
			type : type,
			value : value,
			from : from,
			to : i
		};
	};

	// Begin tokenization. If the source string is empty, return nothing.
	if (!code) {
		return;
	}

	// Loop through code text, one character at a time.
	c = code.charAt(i);
	while (c) {
		from = i;

		if (c <= ' ') { // Ignore whitespace.
			i += 1;
			c = code.charAt(i);
		} else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '$' || c === '_') { // name.
			str = c;
			i += 1;
			for (; ; ) {
				c = code.charAt(i);
				if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
					(c >= '0' && c <= '9') || c === '_') {
					str += c;
					i += 1;
				} else {
					break;
				}
			}
			result.push(make('name', str));
		} else if (c >= '0' && c <= '9') {
			// number.

			// A number cannot start with a decimal point. It must start with a digit,
			// possibly '0'.
			str = c;
			i += 1;

			// Look for more digits.
			for (; ; ) {
				c = code.charAt(i);
				if (c < '0' || c > '9') {
					break;
				}
				i += 1;
				str += c;
			}

			// Look for a decimal fraction part.
			if (c === '.') {
				i += 1;
				str += c;
				for (; ; ) {
					c = code.charAt(i);
					if (c < '0' || c > '9') {
						break;
					}
					i += 1;
					str += c;
				}
			}

			// Look for an exponent part.
			if (c === 'e' || c === 'E') {
				i += 1;
				str += c;
				c = code.charAt(i);
				if (c === '-' || c === '+') {
					i += 1;
					str += c;
					c = code.charAt(i);
				}
				if (c < '0' || c > '9') {
					error("Bad exponent", make('number', str));
				}
				do {
					i += 1;
					str += c;
					c = code.charAt(i);
				} while (c >= '0' && c <= '9');
			}

			// Make sure the next character is not a letter.

			if (c >= 'a' && c <= 'z') {
				str += c;
				i += 1;
				error("Bad number", make('number', str));
			}

			// Convert the string value to a number. If it is finite, then it is a good
			// token.

			n = +str;
			if (isFinite(n)) {
				result.push(make('number', n));
			} else {
				error("Bad number", make('number', str));
			}

			// string

		} else if (c === '\'' || c === '"') {
			str = '';
			q = c;
			i += 1;
			for (; ; ) {
				c = code.charAt(i);
				if (c < ' ') {
					make('string', str);
					error(c === '\n' || c === '\r' || c === '' ?
						"Unterminated string." :
						"Control character in string.", make('', str));
				}

				// Look for the closing quote.

				if (c === q) {
					break;
				}

				// Look for escapement.

				if (c === '\\') {
					i += 1;
					if (i >= length) {
						error("Unterminated string", make('string', str));
					}
					c = code.charAt(i);
					switch (c) {
					case 'b':
						c = '\b';
						break;
					case 'f':
						c = '\f';
						break;
					case 'n':
						c = '\n';
						break;
					case 'r':
						c = '\r';
						break;
					case 't':
						c = '\t';
						break;
					case 'u':
						if (i >= length) {
							error("Unterminated string", make('string', str));
						}
						c = parseInt(code.substr(i + 1, 4), 16);
						if (!isFinite(c) || c < 0) {
							error("Unterminated string", make('string', str));
						}
						c = String.fromCharCode(c);
						i += 4;
						break;
					}
				}
				str += c;
				i += 1;
			}
			i += 1;
			result.push(make('string', str));
			c = code.charAt(i);

			// regexp
		}else if(c === '/' && false){
			i += 1;
			str = '';
			f = '';
			for(; ; ) {
				c = code.charAt(i);

				// Look for close slash

				if(c === '/') {
					for(; ; ) {
						c = code.charAt(i + 1);
						if((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '$' || c === '_') {
							f += c;
							i += 1;
						}else{
							break;
						}
					}
					break;
				}

				if(c === '\\') {
					i += 1;
					if (i >= length) {
						error("Unterminated regexp", make('string', str));
					}
					c = code.charAt(i);
					c = '\\' + c;
				}
				str += c;
				i += 1;
			}
			i += 1;
			result.push(make('regexp', new RegExp(str, f)));
			c = code.charAt(i);

			// combining

		} else if (prefix.indexOf(c) >= 0) {
			str = c;
			i += 1;
			while (true) {
				c = code.charAt(i);
				if (i >= length || suffix.indexOf(c) < 0) {
					break;
				}
				str += c;
				i += 1;
			}
			result.push(make('operator', str));

			// single-character operator

		} else {
			i += 1;
			result.push(make('operator', c));
			c = code.charAt(i);
		}
	}
	return result;
};

var make_parse = function (vars) {
	vars = vars || {};//预定义的变量
	var symbol_table = {};
	var token;
	var tokens;
	var token_nr;
	var context;

	var itself = function () {
		return this;
	};

	var find = function (n) {
		n.nud = itself;
		n.led = null;
		n.std = null;
		n.lbp = 0;
		return n;
	};

	var advance = function (id) {
		var a, o, t, v;
		if (id && token.id !== id) {
			error("Expected '" + id + "'.", token);
		}
		if (token_nr >= tokens.length) {
			token = symbol_table["(end)"];
			return;
		}
		t = tokens[token_nr];
		token_nr += 1;
		v = t.value;
		a = t.type;
		if ((a === "operator" || a !== 'string') && v in symbol_table) {
			//true, false 等直接量也会进入此分支
			o = symbol_table[v];
			if (!o) {
				error("Unknown operator.", t);
			}
		} else if (a === "name") {
			o = find(t);
		} else if (a === "string" || a === "number" || a === "regexp") {
			o = symbol_table["(literal)"];
			a = "literal";
		} else {
			error("Unexpected token.", t);
		}
		token = create(o);
		token.from = t.from;
		token.to = t.to;
		token.value = v;
		token.arity = a;
		return token;
	};

	var expression = function (rbp) {
		var left;
		var t = token;
		advance();
		left = t.nud();
		while (rbp < token.lbp) {
			t = token;
			advance();
			left = t.led(left);
		}
		return left;
	};

	var original_symbol = {
		nud : function () {
			error("Undefined.", this);
		},
		led : function (left) {
			error("Missing operator.", this);
		}
	};

	var symbol = function (id, bp) {
		var s = symbol_table[id];
		bp = bp || 0;
		if (s) {
			if (bp >= s.lbp) {
				s.lbp = bp;
			}
		} else {
			s = create(original_symbol);
			s.id = s.value = id;
			s.lbp = bp;
			symbol_table[id] = s;
		}
		return s;
	};

	var constant = function (s, v, a) {
		var x = symbol(s);
		x.nud = function () {
			this.value = symbol_table[this.id].value;
			this.arity = "literal";
			return this;
		};
		x.value = v;
		return x;
	};

	var infix = function (id, bp, led) {
		var s = symbol(id, bp);
		s.led = led || function (left) {
			this.first = left;
			this.second = expression(bp);
			this.arity = "binary";
			return this;
		};
		return s;
	};

	var infixr = function (id, bp, led) {
		var s = symbol(id, bp);
		s.led = led || function (left) {
			this.first = left;
			this.second = expression(bp - 1);
			this.arity = "binary";
			return this;
		};
		return s;
	};

	var prefix = function (id, nud) {
		var s = symbol(id);
		s.nud = nud || function () {
			this.first = expression(70);
			this.arity = "unary";
			return this;
		};
		return s;
	};

	symbol("(end)");
	symbol("(name)");
	symbol(":");
	symbol(")");
	symbol("]");
	symbol("}");
	symbol(",");

	constant("true", true);
	constant("false", false);
	constant("null", null);
	constant("undefined");

	constant("Math", Math);
	constant("Date", Date);
	for(var v in vars) {
		constant(v, vars[v]);
	}

	symbol("(literal)").nud = itself;

	symbol("this").nud = function () {
	  this.arity = "this";
	  return this;
	};

	//Operator Precedence:
	//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence

	infix("?", 20, function (left) {
		this.first = left;
		this.second = expression(0);
		advance(":");
		this.third = expression(0);
		this.arity = "ternary";
		return this;
	});

	infixr("&&", 31);
	infixr("||", 30);

	infixr("===", 40);
	infixr("!==", 40);

	infixr("==", 40);
	infixr("!=", 40);

	infixr("<", 40);
	infixr("<=", 40);
	infixr(">", 40);
	infixr(">=", 40);

	infix("in", 45, function (left) {
		this.first = left;
		this.second = expression(0);
		this.arity = "binary";
		if (context === 'repeat') {
			// `in` at repeat block
			left.arity = 'assignment';
			this.assignment = true;
		}
		return this;
	});

	infix("+", 50);
	infix("-", 50);

	infix("*", 60);
	infix("/", 60);
	infix("%", 60);

	infix("(", 70, function (left) {
		var a = [];
		if (left.id === "." || left.id === "[") {
			this.arity = "ternary";
			this.first = left.first;
			this.second = left.second;
			this.third = a;
		} else {
			this.arity = "binary";
			this.first = left;
			this.second = a;
			if ((left.arity !== "unary" || left.id !== "function") &&
				left.arity !== "name" && left.arity !== "literal" && left.id !== "(" &&
				left.id !== "&&" && left.id !== "||" && left.id !== "?") {
				error("Expected a variable name.", left);
			}
		}
		if (token.id !== ")") {
			while (true) {
				a.push(expression(0));
				if (token.id !== ",") {
					break;
				}
				advance(",");
			}
		}
		advance(")");
		return this;
	});

	infix(".", 80, function (left) {
		this.first = left;
		if (token.arity !== "name") {
			error("Expected a property name.", token);
		}
		token.arity = "literal";
		this.second = token;
		this.arity = "binary";
		advance();
		return this;
	});

	infix("[", 80, function (left) {
		this.first = left;
		this.second = expression(0);
		this.arity = "binary";
		advance("]");
		return this;
	});

	//filter
	infix("|", 10, function (left) {
		var a;
		this.first = left;
		token.arity = 'filter';
		this.second = expression(10);
		this.arity = 'binary';
		if (token.id === ':') {
			this.arity = 'ternary';
			this.third = a = [];
			while (true) {
				advance(':');
				a.push(expression(0));
				if (token.id !== ":") {
					break;
				}
			}
		}
		return this;
	});

	prefix("!");
	prefix("-");
	prefix("typeof");

	prefix("(", function () {
		var e = expression(0);
		advance(")");
		return e;
	});

	prefix("[", function () {
		var a = [];
		if (token.id !== "]") {
			while (true) {
				a.push(expression(0));
				if (token.id !== ",") {
					break;
				}
				advance(",");
			}
		}
		advance("]");
		this.first = a;
		this.arity = "unary";
		return this;
	});

	prefix("{", function () {
		var a = [],	n, v;
		if (token.id !== "}") {
			while (true) {
				n = token;
				if (n.arity !== "name" && n.arity !== "literal") {
					error("Bad property name: ", token);
				}
				advance();
				advance(":");
				v = expression(0);
				v.key = n.value;
				a.push(v);
				if (token.id !== ",") {
					break;
				}
				advance(",");
			}
		}
		advance("}");
		this.first = a;
		this.arity = "unary";
		return this;
	});

	prefix('new', function () {
		var a = [];
		this.first = expression(79);
		if(token.id === '(') {
			advance("(");
			this.arity = 'binary';
			this.second = a;
			while (true) {
				a.push(expression(0));
				if (token.id !== ",") {
					break;
				}
				advance(",");
			}
			advance(")");
		}else{
			this.arity = "unary";
		}
		return this;
	});

  //prefix('/', function() {
  //  var a = [], n, v;
  //  if(token.id !== '/') {
  //    while(true) {
  //      n = token;
  //      advance();
  //    }
  //  }
  //  advance('/');
  //  this.first = a;
  //  return this;
  //})

	//_source: 表达式代码字符串
	//_context: 表达式的语句环境
	return function (_source, _context) {
    source = _source;
		tokens = tokenize(_source, '=<>!+-*&|/%^', '=<>&|');
		token_nr = 0;
		context = _context;
		advance();
		var s = expression(0);
		advance("(end)");
		return s;
	};
};

exports.parse = make_parse();

},{}],17:[function(require,module,exports){
var tokenReg = /{{({([^}\n]+)}|[^}\n]+)}}/g;

//字符串中是否包含模板占位符标记
function hasToken(str) {
  tokenReg.lastIndex = 0;
  return str && tokenReg.test(str);
}

function parseToken(value) {
  var tokens = []
    , textMap = []
    , start = 0
    , val, token
    ;
  
  tokenReg.lastIndex = 0;
  
  while((val = tokenReg.exec(value))){
    if(tokenReg.lastIndex - start > val[0].length){
      textMap.push(value.slice(start, tokenReg.lastIndex - val[0].length));
    }
    
    token = {
      escape: !val[2]
    , path: (val[2] || val[1]).trim()
    , position: textMap.length
    , textMap: textMap
    };
    
    tokens.push(token);
    
    //一个引用类型(数组)作为节点对象的文本图, 这样当某一个引用改变了一个值后, 其他引用取得的值都会同时更新
    textMap.push(val[0]);
    
    start = tokenReg.lastIndex;
  }
  
  if(value.length > start){
    textMap.push(value.slice(start, value.length));
  }
  
  tokens.textMap = textMap;
  
  return tokens;
}

exports.hasToken = hasToken;

exports.parseToken = parseToken;
},{}],18:[function(require,module,exports){
"use strict";

//utils
//---

var doc = require('./env.js').document;

var keyPathReg = /(?:\.|\[)/g
  , bra = /\]/g
  ;

//将 keyPath 转为数组形式
//path.key, path[key] --> ['path', 'key']
function parseKeyPath(keyPath){
  return keyPath.replace(bra, '').split(keyPathReg);
}

/**
 * 合并对象
 * @static
 * @param {Boolean} [deep=false] 是否深度合并
 * @param {Object} target 目标对象
 * @param {Object} [object...] 来源对象
 * @return {Function} 合并后的 target 对象
 */
function extend(/* deep, target, object... */) {
  var options
    , name, src, copy, copyIsArray, clone
    , target = arguments[0] || {}
    , i = 1
    , length = arguments.length
    , deep = false
    ;

  // Handle a deep copy situation
  if (typeof target === "boolean") {
    deep = target;

    // skip the boolean and the target
    target = arguments[ i ] || {};
    i++;
  }

  if(utils.isFunction(arguments[length - 1])) {
    length--;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if (typeof target !== "object" && !utils.isFunction(target)) {
    target = {};
  }

  for ( ; i < length; i++ ) {
    // Only deal with non-null/undefined values
    if ( (options = arguments[ i ]) != null ) {
      // Extend the base object
      for ( name in options ) {
        //android 2.3 browser can enum the prototype of constructor...
        if(options.hasOwnProperty(name) && name !== 'prototype'){
          src = target[ name ];
          copy = options[ name ];


          // Recurse if we're merging plain objects or arrays
          if ( deep && copy && ( utils.isPlainObject(copy) || (copyIsArray = utils.isArray(copy)) ) ) {

            // Prevent never-ending loop
            if ( target === copy ) {
              continue;
            }
            if ( copyIsArray ) {
              copyIsArray = false;
              clone = src && utils.isArray(src) ? src : [];

            } else {
              clone = src && utils.isPlainObject(src) ? src : {};
            }

            // Never move original objects, clone them
            target[ name ] = extend( deep, clone, copy);

            // Don't bring in undefined values
          } else if ( !utils.isUndefined(copy) ) {
            target[ name ] = copy;
          }
        }
      }
    }
  }

  // Return the modified object
  return target;
}

var create = Object.create || function (o) {
  function F() {}
  F.prototype = o;
  return new F();
};


var utils = {
  noop: function (){}
, ie: !!doc.attachEvent

, isObject: function (val) {
    return typeof val === 'object' && val !== null;
  }

, isUndefined: function (val) {
    return typeof val === 'undefined';
  }

, isFunction: function (val){
    return typeof val === 'function';
  }

, isArray: function (val) {
    if(utils.ie){
      //IE 9 及以下 IE 跨窗口检测数组
      return val && val.constructor + '' === Array + '';
    }else{
      return Array.isArray(val);
    }
  }

  //简单对象的简易判断
, isPlainObject: function (o){
    if (!o || ({}).toString.call(o) !== '[object Object]' || o.nodeType || o === o.window) {
      return false;
    }else{
      return true;
    }
  }

  //函数切面. oriFn 原始函数, fn 切面补充函数
  //前面的函数返回值传入 breakCheck 判断, breakCheck 返回值为真时不执行切面补充的函数
, beforeFn: function (oriFn, fn, breakCheck) {
    return function() {
      var ret = fn.apply(this, arguments);
      if(breakCheck && breakCheck.call(this, ret)){
        return ret;
      }
      return oriFn.apply(this, arguments);
    };
  }

, afterFn: function (oriFn, fn, breakCheck) {
    return function() {
      var ret = oriFn.apply(this, arguments);
      if(breakCheck && breakCheck.call(this, ret)){
        return ret;
      }
      fn.apply(this, arguments);
      return ret;
    }
  }

, parseKeyPath: parseKeyPath

, deepSet: function (keyStr, value, obj) {
    if(keyStr){
      var chain = parseKeyPath(keyStr)
        , cur = obj
        ;
      chain.forEach(function(key, i) {
        if(i === chain.length - 1){
          cur[key] = value;
        }else{
          if(cur && cur.hasOwnProperty(key)){
            cur = cur[key];
          }else{
            cur[key] = {};
            cur = cur[key];
          }
        }
      });
    }else{
      extend(obj, value);
    }
    return obj;
  }
, deepGet: function (keyStr, obj) {
    var chain, cur = obj, key;
    if(keyStr){
      chain = parseKeyPath(keyStr);
      for(var i = 0, l = chain.length; i < l; i++) {
        key = chain[i];
        if(cur && cur.hasOwnProperty(key)){
          cur = cur[key];
        }else{
          return;
        }
      }
    }
    return cur;
  }
, clone: function clone (obj) {
		if(obj == null || typeof(obj) != 'object'){ return obj }
		var temp = new obj.constructor();
		for(var key in obj){ temp[key] = clone(obj[key]) }
		return temp;
	}
, extend: extend
, create: create
};

module.exports = utils;

},{"./env.js":12}],19:[function(require,module,exports){
"use strict";

var parse = require('./parse.js').parse
  , evaluate = require('./eval.js')
  , utils = require('./utils.js')
  , Class = require('./class.js')
  ;

var extend = utils.extend;

//表达式解析
function exParse(path) {
  var ast = {}
    , summary
    ;

  try{
    ast = parse(path, this.dir.type);
  }catch(e) {
    e.message = 'SyntaxError in "' + path + '" | ' + e.message;
    console.error(e);
  }

  summary = evaluate.summary(ast);
  extend(this.dir, summary);
  extend(this, summary);
  this.ast = ast;
};

function Watcher(vm, dir) {
  var path, scope = vm, curVm, localKey, willUpdate, ass, paths;

  this.dir = dir;
  this.vm = vm;

  this.val = NaN;

  this.state = Watcher.STATE_READY;

  exParse.call(this, dir.path);

  for(var i = 0, l = this.paths.length; i < l; i++) {
    paths = utils.parseKeyPath(this.paths[i]);
    localKey = paths[0];

    while(scope) {
      curVm = scope;
      ass = scope._assignments;

      if(ass && ass.length) {
        //具名 repeat
        if(ass[0] === localKey) {
          if(paths.length == 1) {
            paths[0] = '$data';
          }else{
            paths.shift();
          }
          break;
        }
      }else if(localKey in scope){
        break;
      }

      //向上查找
      scope = scope.$parent;
    }
    path = paths.join('.');
    curVm._watchers[path] = curVm._watchers[path] || [];
    curVm._watchers[path].push(this);
  }

  //没有变量 / 变量不在当前作用域的表达式立即求值
  for(var i = 0, l = this.locals.length; i < l; i++) {
    if(utils.isObject(this.vm.$data) && (this.locals[i] in this.vm.$data)) {
      break;
    }
  }
  if(i == l) {
    willUpdate = true;
  }

  if(willUpdate || this.vm._isRendered) {
    this.update();
  }
}

//TODO
extend(Watcher, {
  STATE_READY: 0
, STATE_CALLED: 1
}, Class);

function watcherUpdate (val) {
  try{
    this.dir.update(val, this.val);
    this.val = val;
  }catch(e){
    console.error(e);
  }
}

extend(Watcher.prototype, {
  //表达式执行
  update: function() {
    var that = this
      , newVal
      ;

    newVal = this.getValue(this.vm);

    if(newVal && newVal.then) {
      //a promise
      newVal.then(function(val) {
        watcherUpdate.call(that, val);
      });
    }else{
      watcherUpdate.call(this, newVal);
    }

    this.state = Watcher.STATE_CALLED;
  }
, getValue: function(scope) {
    var val;

    try{
      val = evaluate.eval(this.ast, scope, this.dir);
    }catch(e){
      val = '';
      console.error(e);
    }
    if(utils.isUndefined(val) || val === null) {
      val = '';
    }
    return val;
  }
});

module.exports = Watcher
},{"./class.js":2,"./eval.js":13,"./parse.js":16,"./utils.js":18}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY29tcG9uZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvaW5kZXguanMiLCJzcmMvZGlyZWN0aXZlcy9tb2RlbC5qcyIsInNyYy9kaXJlY3RpdmVzL29uLmpzIiwic3JjL2RpcmVjdGl2ZXMvcmVwZWF0LmpzIiwic3JjL2RpcmVjdGl2ZXMvc3R5bGUuanMiLCJzcmMvZW52LmpzIiwic3JjL2V2YWwuanMiLCJzcmMvZXZlbnQtYmluZC5qcyIsInNyYy9ldmVudC5qcyIsInNyYy9wYXJzZS5qcyIsInNyYy90b2tlbi5qcyIsInNyYy91dGlscy5qcyIsInNyYy93YXRjaGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0b0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBFdmVudCA9IHJlcXVpcmUoJy4vZXZlbnQuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgRGlyID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi90b2tlbi5qcycpXG4gIDtcblxuXG52YXIgaXNPYmplY3QgPSB1dGlscy5pc09iamVjdFxuICAsIGlzVW5kZWZpbmVkID0gdXRpbHMuaXNVbmRlZmluZWRcbiAgLCBpc0Z1bmN0aW9uID0gdXRpbHMuaXNGdW5jdGlvblxuICAsIGlzUGxhaW5PYmplY3QgPSB1dGlscy5pc1BsYWluT2JqZWN0XG4gICwgcGFyc2VLZXlQYXRoID0gdXRpbHMucGFyc2VLZXlQYXRoXG4gICwgZGVlcFNldCA9IHV0aWxzLmRlZXBTZXRcbiAgLCBkZWVwR2V0ID0gdXRpbHMuZGVlcEdldFxuICAsIGV4dGVuZCA9IHV0aWxzLmV4dGVuZFxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cblxudmFyIE5PREVUWVBFID0ge1xuICAgIEVMRU1FTlQ6IDFcbiAgLCBBVFRSOiAyXG4gICwgVEVYVDogM1xuICAsIENPTU1FTlQ6IDhcbiAgLCBGUkFHTUVOVDogMTFcbn07XG5cbi8v6K6+572uIGRpcmVjdGl2ZSDliY3nvIBcbmZ1bmN0aW9uIHNldFByZWZpeChuZXdQcmVmaXgpIHtcbiAgaWYobmV3UHJlZml4KXtcbiAgICB0aGlzLnByZWZpeCA9IG5ld1ByZWZpeDtcbiAgfVxufVxuXG4vKipcbiAqIOaehOmAoOWHveaVsFxuICogLS0tXG4gKiBAcGFyYW0ge1N0cmluZ3xFbGVtZW50fSBbdHBsXSDmqKHmnb8uIOetieWQjOS6jiBwcm9wcy4kdHBsXG4gKiBAcGFyYW0ge09iamVjdH0gW3Byb3BzXSDlsZ7mgKcv5pa55rOVXG4gKiovXG5mdW5jdGlvbiBCZWUodHBsLCBwcm9wcykge1xuICBpZihpc1BsYWluT2JqZWN0KHRwbCkpIHtcbiAgICBwcm9wcyA9IHRwbDtcbiAgICB0cGwgPSBwcm9wcy4kdHBsO1xuICB9XG4gIHByb3BzID0gcHJvcHMgfHwge307XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIC8vJCDlvIDlpLTnmoTmmK/lhbHmnInlsZ7mgKcv5pa55rOVXG4gICAgJGRhdGE6IHRoaXMuJGRhdGEgfHwge31cbiAgLCAkZWw6IHRoaXMuJGVsIHx8IG51bGxcbiAgLCAkdGFyZ2V0OiB0aGlzLiR0YXJnZXQgfHwgbnVsbFxuICAsICR0cGw6IHRoaXMuJHRwbCB8fCAnJ1xuICAsICRjaGlsZHJlbjogbnVsbFxuICAsICRmaWx0ZXJzOiB0aGlzLiRmaWx0ZXJzIHx8IHt9XG4gICwgJHBhcmVudDogbnVsbFxuXG4gICAgLy/np4HmnInlsZ7mgKcv5pa55rOVXG4gICwgX3dhdGNoZXJzOiB0aGlzLl93YXRjaGVycyB8fCB7fVxuICAsIF9hc3NpZ25tZW50czogbnVsbC8v5b2T5YmNIHZtIOeahOWIq+WQjVxuICAsIF9yZWxhdGl2ZVBhdGg6IFtdXG4gIH07XG5cbiAgdmFyIGVsO1xuXG4gIC8v5ZCI5bm25omA5pyJ5Yiw5b2T5YmN56m66Ze05LiLXG4gIGV4dGVuZCh0aGlzLCBkZWZhdWx0cywgcHJvcHMpO1xuICBleHRlbmQodGhpcywgdGhpcy4kZGF0YSk7XG5cbiAgdHBsID0gdHBsIHx8IHRoaXMuJHRwbDtcbiAgZWwgPSB0cGxQYXJzZSh0cGwsIHRoaXMuJHRhcmdldCk7XG5cbiAgaWYodGhpcy4kZWwpe1xuICAgIHRoaXMuJGVsLmFwcGVuZENoaWxkKGVsLmVsKTtcbiAgfWVsc2V7XG4gICAgdGhpcy4kZWwgPSBlbC5lbDtcbiAgfVxuICB0aGlzLiR0cGwgPSBlbC50cGw7XG4gIHRoaXMuJGNoaWxkcmVuID0gZWwuY2hpbGRyZW47XG5cbiAgd2Fsay5jYWxsKHRoaXMsIHRoaXMuJGVsKTtcblxuICB0aGlzLiRyZW5kZXIodGhpcy4kZGF0YSB8fCB7fSk7XG4gIHRoaXMuX2lzUmVuZGVyZWQgPSB0cnVlO1xufVxuXG4vL+mdmeaAgeWxnuaAp1xuZXh0ZW5kKEJlZSwgQ2xhc3MsIERpciwgQ29tLCB7XG4gIHNldFByZWZpeDogc2V0UHJlZml4XG4sIHByZWZpeDogJydcbiwgZG9jOiBkb2NcbiwgZGlyZWN0aXZlczoge31cbiwgY29tcG9uZW50czoge31cbn0pO1xuXG5cbkJlZS5zZXRQcmVmaXgoJ2EtJyk7XG5cbi8v5YaF572uIGRpcmVjdGl2ZVxuZm9yKHZhciBkaXIgaW4gZGlycykge1xuICBCZWUuZGlyZWN0aXZlKGRpciwgZGlyc1tkaXJdKTtcbn1cblxuLy/lrp7kvovmlrnms5Vcbi8vLS0tLVxuZXh0ZW5kKEJlZS5wcm90b3R5cGUsIEV2ZW50LCB7XG4gIC8qKlxuICAgKiAjIyMgYW50LnJlbmRlclxuICAgKiDmuLLmn5PmqKHmnb9cbiAgICovXG4gICRyZW5kZXI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICBkYXRhID0gZGF0YSB8fCB0aGlzLiRkYXRhO1xuICAgIHRoaXMuJHJlcGxhY2UoZGF0YSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuLCAkZ2V0OiBmdW5jdGlvbihrZXkpIHtcbiAgICByZXR1cm4gZGVlcEdldChrZXksIHRoaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqICMjIyBiZWUuJHNldFxuICAgKiDmm7TmlrDlkIjlubYgYC5kYXRhYCDkuK3nmoTmlbDmja4uIOWmguaenOWPquacieS4gOS4quWPguaVsCwg6YKj5LmI6L+Z5Liq5Y+C5pWw5bCG5bm25YWlIC4kZGF0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2tleV0g5pWw5o2u6Lev5b6ELlxuICAgKiBAcGFyYW0ge0FueVR5cGV8T2JqZWN0fSB2YWwg5pWw5o2u5YaF5a65LlxuICAgKi9cbiwgJHNldDogZnVuY3Rpb24oa2V5LCB2YWwpIHtcbiAgICB2YXIgYWRkLCBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcbiAgICBpZihpc1VuZGVmaW5lZChrZXkpKXsgcmV0dXJuIHRoaXM7IH1cblxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpe1xuICAgICAgZXh0ZW5kKHRydWUsIHRoaXMuJGRhdGEsIGtleSk7XG4gICAgICBleHRlbmQodHJ1ZSwgdGhpcywga2V5KTtcbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICBrZXlzID0gcGFyc2VLZXlQYXRoKGtleSk7XG4gICAgICBhZGQgPSBkZWVwU2V0KGtleSwgdmFsLCB7fSk7XG4gICAgICBrZXlzWzBdICE9PSAnJGRhdGEnICYmIGV4dGVuZCh0cnVlLCB0aGlzLiRkYXRhLCBhZGQpO1xuICAgICAgZXh0ZW5kKHRydWUsIHRoaXMsIGFkZCk7XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSwgdmFsKSA6IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgLyoqXG4gICAqIOaVsOaNruabv+aNolxuICAgKi9cbiwgJHJlcGxhY2U6IGZ1bmN0aW9uIChrZXksIHZhbCkge1xuICAgIHZhciBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcblxuICAgIGlmKGlzVW5kZWZpbmVkKGtleSkpeyByZXR1cm4gdGhpczsgfVxuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICB0aGlzLiRkYXRhID0ga2V5O1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5KTtcbiAgICAgIGlmKGtleXNbMF0gIT09ICdkYXRhJykge1xuICAgICAgICBkZWVwU2V0KGtleSwgbnVsbCwgdGhpcy4kZGF0YSk7XG4gICAgICAgIGRlZXBTZXQoa2V5LCB2YWwsIHRoaXMuJGRhdGEpO1xuICAgICAgfVxuICAgICAgZGVlcFNldChrZXksIG51bGwsIHRoaXMpO1xuICAgICAgZGVlcFNldChrZXksIHZhbCwgdGhpcyk7XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSwgdmFsKSA6IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgLyoqXG4gICAqIOaJi+WKqOabtOaWsOafkOmDqOWIhuaVsOaNrlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDmjIflrprmm7TmlrDmlbDmja7nmoQga2V5UGF0aFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpc0J1YmJsZT10cnVlXSDmmK/lkKbmm7TmlrAga2V5UGF0aCDnmoTniLbnuqdcbiAgICovXG4sICR1cGRhdGU6IGZ1bmN0aW9uIChrZXlQYXRoLCBpc0J1YmJsZSkge1xuICAgIGlzQnViYmxlID0gaXNCdWJibGUgIT09IGZhbHNlO1xuXG4gICAgdmFyIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5UGF0aCksIGtleSwgYXR0cnM7XG4gICAgdmFyIHdhdGNoZXJzO1xuXG4gICAgd2hpbGUoa2V5ID0ga2V5cy5qb2luKCcuJykpIHtcbiAgICAgIHdhdGNoZXJzID0gdGhpcy5fd2F0Y2hlcnNba2V5XTtcblxuICAgICAgaWYgKHdhdGNoZXJzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gd2F0Y2hlcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgd2F0Y2hlcnNbaV0udXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYoaXNCdWJibGUpIHtcbiAgICAgICAga2V5cy5wb3AoKTtcbiAgICAgICAgLy/mnIDnu4jpg73lhpLms6HliLAgJGRhdGFcbiAgICAgICAgaWYoIWtleXMubGVuZ3RoICYmIGtleSAhPT0gJyRkYXRhJyl7XG4gICAgICAgICAga2V5cy5wdXNoKCckZGF0YScpO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGF0dHJzID0gdGhpcy4kZ2V0KGtleVBhdGgpO1xuXG4gICAgLy/lkIzml7bmm7TmlrDlrZDot6/lvoRcbiAgICBpZihpc09iamVjdChhdHRycykpIHtcbiAgICAgIE9iamVjdC5rZXlzKGF0dHJzKS5mb3JFYWNoKGZ1bmN0aW9uKGF0dHIpIHtcbiAgICAgICAgdGhpcy4kdXBkYXRlKGtleVBhdGggKyAnLicgKyBhdHRyLCBmYWxzZSk7XG4gICAgICB9LmJpbmQodGhpcykpXG4gICAgfVxuXG4gICAgaWYoaXNCdWJibGUpIHtcbiAgICAgIGlmKHRoaXMuJHBhcmVudCkge1xuICAgICAgICAvL+WQjOatpeabtOaWsOeItiB2bSDlr7nlupTpg6jliIZcbiAgICAgICAgdGhpcy5fcmVsYXRpdmVQYXRoLmZvckVhY2goZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgICAgICB0aGlzLiRwYXJlbnQuJHVwZGF0ZShwYXRoKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG4sICR3YXRjaDogZnVuY3Rpb24gKGtleVBhdGgsIGNhbGxiYWNrKSB7XG4gICAgaWYoY2FsbGJhY2spIHtcbiAgICAgIGFkZFdhdGNoZXIuY2FsbCh0aGlzLCB7cGF0aDoga2V5UGF0aCwgdXBkYXRlOiBjYWxsYmFjaywgd2F0Y2g6IHRydWV9KVxuICAgIH1cbiAgfVxuLCAkdW53YXRjaDogZnVuY3Rpb24gKGtleVBhdGgsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHdhdGNoZXJzID0gdGhpcy5fd2F0Y2hlcnNba2V5UGF0aF0gfHwgW107XG5cbiAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICBpZih3YXRjaGVyc1tpXS5kaXIudXBkYXRlID09PSBjYWxsYmFjayl7XG4gICAgICAgIHdhdGNoZXJzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiB1cGRhdGUgKGtleVBhdGgsIGRhdGEpIHtcbiAgdmFyIGtleVBhdGhzO1xuXG4gIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICBkYXRhID0ga2V5UGF0aDtcbiAgfWVsc2V7XG4gICAga2V5UGF0aHMgPSBba2V5UGF0aF07XG4gIH1cblxuICBpZigha2V5UGF0aHMpIHtcbiAgICBpZihpc09iamVjdChkYXRhKSkge1xuICAgICAga2V5UGF0aHMgPSBPYmplY3Qua2V5cyhkYXRhKTtcbiAgICB9ZWxzZXtcbiAgICAgIC8vLiRkYXRhIOacieWPr+iDveaYr+WfuuacrOexu+Wei+aVsOaNrlxuICAgICAga2V5UGF0aHMgPSBbJyRkYXRhJ107XG4gICAgfVxuICB9XG5cbiAgZm9yKHZhciBpID0gMCwgcGF0aDsgcGF0aCA9IGtleVBhdGhzW2ldOyBpKyspe1xuICAgIHRoaXMuJHVwZGF0ZShwYXRoLCB0cnVlKTtcbiAgfVxuXG59XG5cbi8v6YGN5Y6GIGRvbSDmoJFcbmZ1bmN0aW9uIHdhbGsoZWwpIHtcblxuICBpZihlbC5ub2RlVHlwZSA9PT0gTk9ERVRZUEUuRlJBR01FTlQpIHtcbiAgICBlbCA9IGVsLmNoaWxkTm9kZXM7XG4gIH1cblxuICBpZigoJ2xlbmd0aCcgaW4gZWwpICYmIGlzVW5kZWZpbmVkKGVsLm5vZGVUeXBlKSl7XG4gICAgLy9ub2RlIGxpc3RcbiAgICAvL+WvueS6jiBub2RlbGlzdCDlpoLmnpzlhbbkuK3mnInljIXlkKsge3t0ZXh0fX0g55u05o6l6YeP55qE6KGo6L6+5byPLCDmlofmnKzoioLngrnkvJrooqvliIblibIsIOWFtuiKgueCueaVsOmHj+WPr+iDveS8muWKqOaAgeWinuWKoFxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbC5sZW5ndGg7IGkrKykge1xuICAgICAgd2Fsay5jYWxsKHRoaXMsIGVsW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoIChlbC5ub2RlVHlwZSkge1xuICAgIGNhc2UgTk9ERVRZUEUuRUxFTUVOVDpcbiAgICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5DT01NRU5UOlxuICAgICAgLy/ms6jph4roioLngrlcbiAgICAgIHJldHVybjtcbiAgICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5URVhUOlxuICAgICAgLy/mlofmnKzoioLngrlcbiAgICAgIGNoZWNrVGV4dC5jYWxsKHRoaXMsIGVsKTtcbiAgICAgIHJldHVybjtcbiAgICAgICAgYnJlYWs7XG4gIH1cblxuICBpZihjaGVja0F0dHIuY2FsbCh0aGlzLCBlbCkudGVybWluYWwpe1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vdGVtcGxhdGVcbiAgLy9tZXRhIGVsZW1lbnQgaGFzIGNvbnRlbnQsIHRvby5cbiAgaWYoZWwuY29udGVudCAmJiBlbC5jb250ZW50Lm5vZGVUeXBlKSB7XG4gICAgd2Fsay5jYWxsKHRoaXMsIGVsLmNvbnRlbnQpO1xuICAgIGVsLnBhcmVudE5vZGUgJiYgZWwucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoZWwuY29udGVudCwgZWwpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZvcih2YXIgY2hpbGQgPSBlbC5maXJzdENoaWxkLCBuZXh0OyBjaGlsZDsgKXtcbiAgICBuZXh0ID0gY2hpbGQubmV4dFNpYmxpbmc7XG4gICAgd2Fsay5jYWxsKHRoaXMsIGNoaWxkKTtcbiAgICBjaGlsZCA9IG5leHQ7XG4gIH1cbn1cblxuLy/pgY3ljoblsZ7mgKdcbmZ1bmN0aW9uIGNoZWNrQXR0cihlbCkge1xuICB2YXIgY3N0ciA9IHRoaXMuY29uc3RydWN0b3JcbiAgICAsIHByZWZpeCA9IGNzdHIucHJlZml4XG4gICAgLCBkaXJzID0gY3N0ci5kaXJlY3RpdmUuZ2V0RGlyKGVsLCBjc3RyLmRpcmVjdGl2ZXMsIGNzdHIuY29tcG9uZW50cywgcHJlZml4KVxuICAgICwgZGlyXG4gICAgLCB0ZXJtaW5hbFByaW9yaXR5LCB0ZXJtaW5hbFxuICAgICwgcmVzdWx0ID0ge307XG4gICAgO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsID0gZGlycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBkaXIgPSBkaXJzW2ldO1xuICAgIGRpci5fX2RpcnMgPSBkaXJzO1xuXG4gICAgLy/lr7nkuo4gdGVybWluYWwg5Li6IHRydWUg55qEIGRpcmVjdGl2ZSwg5Zyo6Kej5p6Q5a6M5YW255u45ZCM5p2D6YeN55qEIGRpcmVjdGl2ZSDlkI7kuK3mlq3pgY3ljobor6XlhYPntKBcbiAgICBpZih0ZXJtaW5hbFByaW9yaXR5ID4gZGlyLnByaW9yaXR5KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoZGlyLm5vZGVOYW1lKTtcblxuICAgIHNldEJpbmRpbmcuY2FsbCh0aGlzLCBkaXIpO1xuXG4gICAgaWYoZGlyLnRlcm1pbmFsKSB7XG4gICAgICB0ZXJtaW5hbCA9IHRydWU7XG4gICAgICB0ZXJtaW5hbFByaW9yaXR5ID0gZGlyLnByaW9yaXR5O1xuICAgIH1cbiAgfVxuXG4gIHJlc3VsdC5kaXJzID0gZGlycztcbiAgaWYodGVybWluYWwpIHtcbiAgICByZXN1bHQudGVybWluYWwgPSB0cnVlO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8v5aSE55CG5paH5pys6IqC54K55Lit55qE57uR5a6a5Y2g5L2N56ymKHt7Li4ufX0pXG5mdW5jdGlvbiBjaGVja1RleHQobm9kZSkge1xuICBpZih0b2tlbi5oYXNUb2tlbihub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICB2YXIgdG9rZW5zID0gdG9rZW4ucGFyc2VUb2tlbihub2RlLm5vZGVWYWx1ZSlcbiAgICAgICwgdGV4dE1hcCA9IHRva2Vucy50ZXh0TWFwXG4gICAgICAsIGVsID0gbm9kZS5wYXJlbnROb2RlXG4gICAgICAsIGRpcnMgPSB0aGlzLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXNcbiAgICAgICwgdCwgZGlyXG4gICAgICA7XG5cbiAgICAvL+Wwhnt7a2V5fX3liIblibLmiJDljZXni6znmoTmlofmnKzoioLngrlcbiAgICBpZih0ZXh0TWFwLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRleHRNYXAuZm9yRWFjaChmdW5jdGlvbih0ZXh0KSB7XG4gICAgICAgIHZhciB0biA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKHRuLCBub2RlKTtcbiAgICAgICAgY2hlY2tUZXh0LmNhbGwodGhpcywgdG4pO1xuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgIGVsLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH1lbHNle1xuICAgICAgdCA9IHRva2Vuc1swXTtcbiAgICAgIC8v5YaF572u5ZCE5Y2g5L2N56ym5aSE55CGLlxuICAgICAgZGlyID0gY3JlYXRlKHQuZXNjYXBlID8gZGlycy50ZXh0IDogZGlycy5odG1sKTtcbiAgICAgIHNldEJpbmRpbmcuY2FsbCh0aGlzLCBleHRlbmQoZGlyLCB0LCB7XG4gICAgICAgIGVsOiBub2RlXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldEJpbmRpbmcoZGlyKSB7XG4gIGlmKGRpci5yZXBsYWNlKSB7XG4gICAgdmFyIGVsID0gZGlyLmVsO1xuICAgIGlmKGlzRnVuY3Rpb24oZGlyLnJlcGxhY2UpKSB7XG4gICAgICBkaXIubm9kZSA9IGRpci5yZXBsYWNlKCk7XG4gICAgfWVsc2UgaWYoZGlyLnJlcGxhY2Upe1xuICAgICAgLy9kaXIubm9kZSA9IGRvYy5jcmVhdGVDb21tZW50KGRpci50eXBlICsgJyA9ICcgKyBkaXIucGF0aCk7XG4gICAgICBkaXIubm9kZSA9IGRvYy5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gICAgfVxuXG4gICAgZGlyLmVsID0gZGlyLmVsLnBhcmVudE5vZGU7XG4gICAgZGlyLmVsLnJlcGxhY2VDaGlsZChkaXIubm9kZSwgZWwpO1xuICB9XG5cbiAgZGlyLmxpbmsodGhpcyk7XG5cbiAgaWYoZGlyLmRpcnMpIHtcbiAgICAvL+WxnuaAp+ihqOi+vuW8j1xuICAgIGRpci5kaXJzLmZvckVhY2goZnVuY3Rpb24oZCkge1xuICAgICAgYWRkV2F0Y2hlci5jYWxsKHRoaXMsIGV4dGVuZChjcmVhdGUoZGlyKSwgZCkpO1xuICAgIH0uYmluZCh0aGlzKSk7XG4gIH1lbHNle1xuICAgIGFkZFdhdGNoZXIuY2FsbCh0aGlzLCBkaXIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFkZFdhdGNoZXIoZGlyKSB7XG4gIGlmKGRpci5wYXRoICYmIGRpci53YXRjaCkge1xuICAgIHJldHVybiBuZXcgV2F0Y2hlcih0aGlzLCBkaXIpO1xuICB9XG59XG5cblxuLy90YXJnZXQ6IGVsIOabv+aNoueahOebruagh1xuZnVuY3Rpb24gdHBsUGFyc2UodHBsLCB0YXJnZXQpIHtcbiAgdmFyIGVsLCBjaGlsZHJlbiA9IG51bGwsIHdyYXBlcjtcbiAgaWYoaXNPYmplY3QodGFyZ2V0KSAmJiB0YXJnZXQuY2hpbGRyZW4pIHtcbiAgICBjaGlsZHJlbiA9IFtdO1xuICAgIGZvcih2YXIgaSA9IDAsIGwgPSB0YXJnZXQuY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBjaGlsZHJlbi5wdXNoKHRhcmdldC5jaGlsZHJlbltpXS5jbG9uZU5vZGUodHJ1ZSkpO1xuICAgIH1cbiAgfVxuICBpZihpc09iamVjdCh0cGwpKXtcbiAgICBlbCA9IHRwbDtcbiAgICB0cGwgPSBlbC5vdXRlckhUTUw7XG4gIH1lbHNle1xuICAgIHdyYXBlciA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB3cmFwZXIuaW5uZXJIVE1MID0gdHBsO1xuXG4gICAgZWwgPSB3cmFwZXIuZmlyc3RFbGVtZW50Q2hpbGQgfHwgd3JhcGVyLmNoaWxkcmVuWzBdO1xuXG4gIH1cbiAgaWYodGFyZ2V0KXtcbiAgICB0YXJnZXQucGFyZW50Tm9kZSAmJiB0YXJnZXQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoZWwsIHRhcmdldCk7XG4gIH1cblxuICByZXR1cm4ge2VsOiBlbCwgdHBsOiB0cGwsIGNoaWxkcmVuOiBjaGlsZHJlbn07XG59XG5cbkJlZS52ZXJzaW9uID0gJzAuMS4wJztcblxubW9kdWxlLmV4cG9ydHMgPSBCZWU7XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlscy5qcycpLmV4dGVuZDtcblxudmFyIENsYXNzID0ge1xuICAvKiogXG4gICAqIOaehOmAoOWHveaVsOe7p+aJvy4gXG4gICAqIOWmgjogYHZhciBDYXIgPSBBbnQuZXh0ZW5kKHtkcml2ZTogZnVuY3Rpb24oKXt9fSk7IG5ldyBDYXIoKTtgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvdG9Qcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV5Y6f5Z6L5a+56LGhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbc3RhdGljUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxlemdmeaAgeWxnuaAp1xuICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0g5a2Q5p6E6YCg5Ye95pWwXG4gICAqL1xuICBleHRlbmQ6IGZ1bmN0aW9uIChwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuICAgIHByb3RvUHJvcHMgPSBwcm90b1Byb3BzIHx8IHt9O1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IHByb3RvUHJvcHMuaGFzT3duUHJvcGVydHkoJ2NvbnN0cnVjdG9yJykgPyBwcm90b1Byb3BzLmNvbnN0cnVjdG9yIDogZnVuY3Rpb24oKXsgcmV0dXJuIHN1cC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgdmFyIHN1cCA9IHRoaXM7XG4gICAgdmFyIEZuID0gZnVuY3Rpb24oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjb25zdHJ1Y3RvcjsgfTtcbiAgICBcbiAgICBGbi5wcm90b3R5cGUgPSBzdXAucHJvdG90eXBlO1xuICAgIGNvbnN0cnVjdG9yLnByb3RvdHlwZSA9IG5ldyBGbigpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdGF0aWNQcm9wcywge19fc3VwZXJfXzogc3VwLnByb3RvdHlwZX0pO1xuICAgIFxuICAgIHJldHVybiBjb25zdHJ1Y3RvcjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4vKipcbiAqIOazqOWGjOe7hOS7tlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWUg6Ieq5a6a5LmJ57uE5Lu255qE5qCH562+5ZCNXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHByb3BzfSBDb21wb25lbnQg6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwIC8g5p6E6YCg5Ye95pWw5Y+C5pWwXG4gKi9cbmZ1bmN0aW9uIHRhZyh0YWdOYW1lLCBDb21wb25lbnQpIHtcbiAgdmFyIHRhZ3MgPSB0aGlzLmNvbXBvbmVudHMgPSB0aGlzLmNvbXBvbmVudHMgfHwge307XG5cbiAgdGhpcy5kb2MuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTsvL2ZvciBvbGQgSUVcblxuICBpZih1dGlscy5pc09iamVjdChDb21wb25lbnQpKSB7XG4gICAgQ29tcG9uZW50ID0gdGhpcy5leHRlbmQoQ29tcG9uZW50KTtcbiAgfVxuICByZXR1cm4gdGFnc1t0YWdOYW1lXSA9IENvbXBvbmVudDtcbn1cblxuZXhwb3J0cy50YWcgPSBleHBvcnRzLmNvbXBvbmVudCA9IHRhZztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgO1xuXG4vKipcbiAqIOS4uiBBbnQg5p6E6YCg5Ye95pWw5re75Yqg5oyH5LukIChkaXJlY3RpdmUpLiBgQW50LmRpcmVjdGl2ZWBcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgZGlyZWN0aXZlIOWQjeensFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRzXSBkaXJlY3RpdmUg5Y+C5pWwXG4gKiBAcGFyYW0ge051bWJlcn0gb3B0cy5wcmlvcml0eT0wIGRpcmVjdGl2ZSDkvJjlhYjnuqcuIOWQjOS4gOS4quWFg+e0oOS4iueahOaMh+S7pOaMieeFp+S8mOWFiOe6p+mhuuW6j+aJp+ihjC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy50ZXJtaW5hbD1mYWxzZSDmiafooYzor6UgZGlyZWN0aXZlIOWQjiwg5piv5ZCm57uI5q2i5ZCO57utIGRpcmVjdGl2ZSDmiafooYwuXG4gKiAgIHRlcm1pbmFsIOS4uuecn+aXtiwg5LiO6K+lIGRpcmVjdGl2ZSDkvJjlhYjnuqfnm7jlkIznmoQgZGlyZWN0aXZlIOS7jeS8mue7p+e7reaJp+ihjCwg6L6D5L2O5LyY5YWI57qn55qE5omN5Lya6KKr5b+955WlLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLmFuY2hvciBhbmNob3Ig5Li6IHRydWUg5pe2LCDkvJrlnKjmjIfku6ToioLngrnliY3lkI7lkITkuqfnlJ/kuIDkuKrnqbrnmb3nmoTmoIforrDoioLngrkuIOWIhuWIq+WvueW6lCBgYW5jaG9ycy5zdGFydGAg5ZKMIGBhbmNob3JzLmVuZGBcbiAqL1xuZnVuY3Rpb24gZGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB2YXIgZGlycyA9IHRoaXMuZGlyZWN0aXZlcyA9IHRoaXMuZGlyZWN0aXZlcyB8fCB7fTtcblxuICByZXR1cm4gZGlyc1trZXldID0gbmV3IERpcmVjdGl2ZShrZXksIG9wdHMpO1xufVxuXG5mdW5jdGlvbiBEaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHRoaXMudHlwZSA9IGtleTtcbiAgdXRpbHMuZXh0ZW5kKHRoaXMsIG9wdHMpO1xufVxuXG5EaXJlY3RpdmUucHJvdG90eXBlID0ge1xuICBwcmlvcml0eTogMC8v5p2D6YeNXG4sIGxpbms6IHV0aWxzLm5vb3AvL+WIneWni+WMluaWueazlVxuLCB1cGRhdGU6IHV0aWxzLm5vb3AvL+abtOaWsOaWueazlVxuLCB0ZWFyRG93bjogdXRpbHMubm9vcFxuLCB0ZXJtaW5hbDogZmFsc2UvL+aYr+WQpue7iOatolxuLCByZXBsYWNlOiBmYWxzZS8v5piv5ZCm5pu/5o2i5b2T5YmN5YWD57SgXG4sIHdhdGNoOiB0cnVlLy/mmK/lkKbnm5Hmjqcga2V5IOeahOWPmOWMllxuXG4sIGFuY2hvcjogZmFsc2VcbiwgYW5jaG9yczogbnVsbFxuXG4gIC8v5b2TIGFuY2hvciDkuLogdHJ1ZSDml7YsIOiOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gdGhpcy5hbmNob3JzLnN0YXJ0Lm5leHRTaWJsaW5nO1xuICAgIGlmKHRoaXMuYW5jaG9yICYmIG5vZGUpIHtcbiAgICAgIHdoaWxlKG5vZGUgIT09IHRoaXMuYW5jaG9ycy5lbmQpe1xuICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG59O1xuXG4vL+iOt+WPluS4gOS4quWFg+e0oOS4iuaJgOacieeUqCBIVE1MIOWxnuaAp+WumuS5ieeahOaMh+S7pFxuZnVuY3Rpb24gZ2V0RGlyKGVsLCBkaXJlY3RpdmVzLCBjb21wb25lbnRzLCBwcmVmaXgpIHtcbiAgcHJlZml4ID0gcHJlZml4IHx8ICcnO1xuICBkaXJlY3RpdmVzID0gZGlyZWN0aXZlcyB8fCB7fTtcblxuICB2YXIgYXR0ciwgYXR0ck5hbWUsIGRpck5hbWVcbiAgICAsIGRpcnMgPSBbXSwgZGlyLCBhbmNob3JzID0ge31cbiAgICAsIHBhcmVudCA9IGVsLnBhcmVudE5vZGVcbiAgICAsIG5vZGVOYW1lID0gZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKVxuICAgIDtcblxuICAvL+WvueS6juiHquWumuS5ieagh+etviwg5bCG5YW26L2s5Li6IGRpcmVjdGl2ZVxuICBpZihub2RlTmFtZSBpbiBjb21wb25lbnRzKSB7XG4gICAgZWwuc2V0QXR0cmlidXRlKHByZWZpeCArICdjb21wb25lbnQnLCBub2RlTmFtZSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSBlbC5hdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICBhdHRyID0gZWwuYXR0cmlidXRlc1tpXTtcbiAgICBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG4gICAgZGlyTmFtZSA9IGF0dHJOYW1lLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xuXG4gICAgaWYoYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwICYmIChkaXJOYW1lIGluIGRpcmVjdGl2ZXMpKSB7XG4gICAgICAvL+aMh+S7pFxuICAgICAgZGlyID0gdXRpbHMuY3JlYXRlKGRpcmVjdGl2ZXNbZGlyTmFtZV0pO1xuICAgICAgZGlyLmRpck5hbWUgPSBkaXJOYW1lXG4gICAgfWVsc2UgaWYodG9rZW4uaGFzVG9rZW4oYXR0ci52YWx1ZSkpIHtcbiAgICAgIC8v5bGe5oCn6KGo6L6+5byP5Y+v6IO95pyJ5aSa5Liq6KGo6L6+5byP5Yy6XG4gICAgICBkaXIgPSB1dGlscy5jcmVhdGUoZGlyZWN0aXZlc1snYXR0ciddKTtcbiAgICAgIGRpci5kaXJzID0gdG9rZW4ucGFyc2VUb2tlbihhdHRyLnZhbHVlKTtcbiAgICAgIGRpci5kaXJOYW1lID0gYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwID8gZGlyTmFtZSA6IGF0dHJOYW1lIDtcbiAgICB9ZWxzZXtcbiAgICAgIGRpciA9IGZhbHNlO1xuICAgIH1cblxuICAgIGlmKGRpcikge1xuICAgICAgaWYoZGlyLmFuY2hvciAmJiAhYW5jaG9ycy5zdGFydCkge1xuICAgICAgICAvL+WQjOS4gOS4quWFg+e0oOS4iueahCBkaXJlY3RpdmUg5YWx5Lqr5ZCM5LiA5a+56ZSa54K5XG4gICAgICAgIGFuY2hvcnMuc3RhcnQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLnN0YXJ0LCBlbCk7XG5cbiAgICAgICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgZW5kJyk7XG4gICAgICAgIGlmKGVsLm5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLmVuZCwgZWwubmV4dFNpYmxpbmcpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoYW5jaG9ycy5lbmQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGRpciwge2VsOiBlbCwgbm9kZTogYXR0ciwgbm9kZU5hbWU6IGF0dHJOYW1lLCBwYXRoOiBhdHRyLnZhbHVlLCBhbmNob3JzOiBkaXIuYW5jaG9yID8gYW5jaG9ycyA6IG51bGx9KSk7XG4gICAgfVxuICB9XG4gIGRpcnMuc29ydChmdW5jdGlvbihkMCwgZDEpIHtcbiAgICByZXR1cm4gZDEucHJpb3JpdHkgLSBkMC5wcmlvcml0eTtcbiAgfSk7XG4gIHJldHVybiBkaXJzO1xufVxuXG5kaXJlY3RpdmUuZ2V0RGlyID0gZ2V0RGlyO1xuXG5leHBvcnRzLmRpcmVjdGl2ZSA9IGRpcmVjdGl2ZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+WxnuaAp+aMh+S7pFxuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpO1xuXG52YXIgYXR0clBvc3RSZWcgPSAvXFw/JC87XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkgey8vYXR0ciBiaW5kaW5nXG4gICAgICB0aGlzLmF0dHJzID0ge307XG4gICAgfWVsc2Uge1xuICAgICAgLy/mnaHku7blsZ7mgKdcbiAgICAgIGlmKGF0dHJQb3N0UmVnLnRlc3QodGhpcy5kaXJOYW1lKSkgey8vIHNvbWVBdHRyPyBjb25kaXRpb24gYmluZGluZ1xuICAgICAgICB0aGlzLmRpck5hbWUgPSB0aGlzLmRpck5hbWUucmVwbGFjZShhdHRyUG9zdFJlZywgJycpO1xuICAgICAgICB0aGlzLmNvbmRpdGlvbmFsQXR0ciA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgbmV3QXR0cnMgPSB7fTtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkge1xuICAgICAgZm9yKHZhciBhdHRyIGluIHZhbCkge1xuICAgICAgICBzZXRBdHRyKGVsLCBhdHRyLCB2YWxbYXR0cl0pO1xuICAgICAgICAvL2lmKHZhbFthdHRyXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmF0dHJzW2F0dHJdO1xuICAgICAgICAvL31cbiAgICAgICAgbmV3QXR0cnNbYXR0cl0gPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvL+enu+mZpOS4jeWcqOS4iuasoeiusOW9leS4reeahOWxnuaAp1xuICAgICAgZm9yKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgcmVtb3ZlQXR0cihlbCwgYXR0cik7XG4gICAgICB9XG4gICAgICB0aGlzLmF0dHJzID0gbmV3QXR0cnM7XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLmNvbmRpdGlvbmFsQXR0cikge1xuICAgICAgICB2YWwgPyBzZXRBdHRyKGVsLCB0aGlzLmRpck5hbWUsIHZhbCkgOiByZW1vdmVBdHRyKGVsLCB0aGlzLmRpck5hbWUpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHRoaXMudGV4dE1hcFt0aGlzLnBvc2l0aW9uXSA9IHZhbCAmJiAodmFsICsgJycpO1xuICAgICAgICBzZXRBdHRyKGVsLCB0aGlzLmRpck5hbWUsIHRoaXMudGV4dE1hcC5qb2luKCcnKSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5cbi8vSUUg5rWP6KeI5Zmo5b6I5aSa5bGe5oCn6YCa6L+HIGBzZXRBdHRyaWJ1dGVgIOiuvue9ruWQjuaXoOaViC4gXG4vL+i/meS6m+mAmui/hyBgZWxbYXR0cl0gPSB2YWx1ZWAg6K6+572u55qE5bGe5oCn5Y206IO95aSf6YCa6L+HIGByZW1vdmVBdHRyaWJ1dGVgIOa4hemZpC5cbmZ1bmN0aW9uIHNldEF0dHIoZWwsIGF0dHIsIHZhbCl7XG4gIHRyeXtcbiAgICBpZigoKGF0dHIgaW4gZWwpIHx8IGF0dHIgPT09ICdjbGFzcycpKXtcbiAgICAgIGlmKGF0dHIgPT09ICdzdHlsZScgJiYgZWwuc3R5bGUuc2V0QXR0cmlidXRlKXtcbiAgICAgICAgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0JywgdmFsKTtcbiAgICAgIH1lbHNlIGlmKGF0dHIgPT09ICdjbGFzcycpe1xuICAgICAgICBlbC5jbGFzc05hbWUgPSB2YWw7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgZWxbYXR0cl0gPSB0eXBlb2YgZWxbYXR0cl0gPT09ICdib29sZWFuJyA/IHRydWUgOiB2YWw7XG4gICAgICB9XG4gICAgfVxuICB9Y2F0Y2goZSl7fVxuICB0cnl7XG4gICAgLy9jaHJvbWUgc2V0YXR0cmlidXRlIHdpdGggYHt7fX1gIHdpbGwgdGhyb3cgYW4gZXJyb3JcbiAgICBlbC5zZXRBdHRyaWJ1dGUoYXR0ciwgdmFsKTtcbiAgfWNhdGNoKGUpeyBjb25zb2xlLndhcm4oZSkgfVxufVxuXG5mdW5jdGlvbiByZW1vdmVBdHRyKGVsLCBhdHRyKSB7XG4gIGVsLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgZGVsZXRlIGVsW2F0dHJdO1xufSIsIi8vY29tcG9uZW50IGFzIGRpcmVjdGl2ZVxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAtMTBcbiwgd2F0Y2g6IGZhbHNlXG4sIHRlcm1pbmFsOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKHZtKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgY29tTmFtZSA9IHRoaXMucGF0aDtcbiAgICB2YXIgY29tcG9uZW50cyA9IHZtLmNvbnN0cnVjdG9yLmNvbXBvbmVudHM7XG4gICAgdmFyIENvbXAsIGNvbXA7XG4gICAgdmFyIGRpcnMgPSBbXSwgJGRhdGEgPSB7fTtcbiAgICB2YXIgYXR0cnM7XG5cbiAgICBpZihjb21OYW1lIGluIGNvbXBvbmVudHMpIHtcblxuICAgICAgZGlycyA9IHRoaXMuX19kaXJzO1xuXG4gICAgICBkaXJzID0gZGlycy5maWx0ZXIoZnVuY3Rpb24gKGRpcikge1xuICAgICAgICByZXR1cm4gZGlyLnR5cGUgPT0gJ2F0dHInIHx8IGRpci50eXBlID09ICd3aXRoJztcbiAgICAgIH0pO1xuXG4gICAgICBhdHRycyA9IGVsLmF0dHJpYnV0ZXM7XG5cbiAgICAgIC8v5pmu6YCa5bGe5oCnXG4gICAgICBmb3IodmFyIGkgPSBhdHRycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAkZGF0YVthdHRyc1swXS5ub2RlTmFtZV0gPSBhdHRyc1swXS52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgZGlycy5mb3JFYWNoKGZ1bmN0aW9uIChkaXIpIHtcbiAgICAgICAgdmFyIHdpdGhNYXAgPSBbXTtcbiAgICAgICAgLy/lsZ7mgKfooajovr7lvI9cbiAgICAgICAgaWYoZGlyLmRpcnMpIHtcbiAgICAgICAgICB3aXRoTWFwID0gZGlyLmRpcnMubWFwKGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIHtwYXRoOiB0b2tlbi5wYXRoLCBjb21wb25lbnRQYXRoOiBkaXIubm9kZU5hbWV9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAvL2Etd2l0aCBkaXJlY3RpdmVcbiAgICAgICAgICB3aXRoTWFwID0gZGlyLmxvY2Fscy5tYXAoZnVuY3Rpb24obG9jYWwpIHtcbiAgICAgICAgICAgIHJldHVybiB7cGF0aDogbG9jYWwsIGNvbXBvbmVudFBhdGg6IGxvY2FsfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8v55uR5ZCs54i257uE5Lu25pu05pawXG4gICAgICAgIHdpdGhNYXAuZm9yRWFjaChmdW5jdGlvbiAocGF0aENvbmZpZykge1xuICAgICAgICAgIHZtLiR3YXRjaChwYXRoQ29uZmlnLnBhdGgsIGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgICAgIGlmIChjb21wKSB7XG4gICAgICAgICAgICAgIGNvbXAuJHNldChwYXRoQ29uZmlnLmNvbXBvbmVudFBhdGgsIHZhbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZihwYXRoQ29uZmlnLmNvbXBvbmVudFBhdGggPT09ICckZGF0YScpe1xuICAgICAgICAgICAgICAgICRkYXRhID0gdmFsXG4gICAgICAgICAgICAgIH1lbHNlIHtcbiAgICAgICAgICAgICAgICAkZGF0YVtwYXRoQ29uZmlnLmNvbXBvbmVudFBhdGhdID0gdmFsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgQ29tcCA9IGNvbXBvbmVudHNbY29tTmFtZV07XG4gICAgICBjb21wID0gbmV3IENvbXAoeyR0YXJnZXQ6IGVsLCAkZGF0YTogdXRpbHMuZXh0ZW5kKHt9LCBDb21wLnByb3RvdHlwZS4kZGF0YSwgJGRhdGEpfSk7XG5cbiAgICAgIC8v55u05o6l5bCGY29tcG9uZW50IOS9nOS4uuagueWFg+e0oOaXtiwg5ZCM5q2l6Lef5paw5a655ZmoIC4kZWwg5byV55SoXG4gICAgICBpZih2bS4kZWwgPT09IGVsKSB7XG4gICAgICAgIHZtLiRlbCA9IGNvbXAuJGVsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfWVsc2V7XG4gICAgICBjb25zb2xlLndhcm4oJ0NvbXBvbmVudDogJyArIGNvbU5hbWUgKyAnIG5vdCBkZWZpbmVkISBJZ25vcmUnKTtcbiAgICB9XG4gIH1cbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKVxuICA7XG5cbnZhciBkaXJzID0ge307XG5cblxuZGlycy50ZXh0ID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdGhpcy5ub2RlLm5vZGVWYWx1ZSA9IHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgPyAnJyA6IHZhbDtcbiAgfVxufTtcblxuXG5kaXJzLmh0bWwgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5ub2RlcyA9IFtdO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsLmlubmVySFRNTCA9IHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgPyAnJyA6IHZhbDtcblxuICAgIHZhciBub2RlO1xuICAgIHdoaWxlKG5vZGUgPSB0aGlzLm5vZGVzLnBvcCgpKSB7XG4gICAgICBub2RlLnBhcmVudE5vZGUgJiYgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH1cblxuICAgIHZhciBub2RlcyA9IGVsLmNoaWxkTm9kZXM7XG4gICAgd2hpbGUobm9kZSA9IG5vZGVzWzBdKSB7XG4gICAgICB0aGlzLm5vZGVzLnB1c2gobm9kZSk7XG4gICAgICB0aGlzLmVsLmluc2VydEJlZm9yZShub2RlLCB0aGlzLm5vZGUpO1xuICAgIH1cbiAgfVxufTtcblxuXG5kaXJzWydpZiddID0ge1xuICBhbmNob3I6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICB0aGlzLmhpZGUoKTtcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICBpZih2YWwpIHtcbiAgICAgIGlmKCF0aGlzLnN0YXRlKSB7IHRoaXMuc2hvdygpIH1cbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuc3RhdGUpIHsgdGhpcy5oaWRlKCk7IH1cbiAgICB9XG4gICAgdGhpcy5zdGF0ZSA9IHZhbDtcbiAgfVxuXG4sIHNob3c6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcnMuZW5kO1xuXG4gICAgYW5jaG9yLnBhcmVudE5vZGUgJiYgYW5jaG9yLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMuZnJhZywgYW5jaG9yKTtcbiAgfVxuLCBoaWRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSB0aGlzLmdldE5vZGVzKCk7XG5cbiAgICBpZihub2Rlcykge1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IG5vZGVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB0aGlzLmZyYWcuYXBwZW5kQ2hpbGQobm9kZXNbaV0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuZGlycy50ZW1wbGF0ZSA9IHtcbiAgcHJpb3JpdHk6IDEwMDAwXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZWwuY2hpbGROb2Rlc1xuICAgICAgLCBmcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICAgICAgO1xuXG4gICAgd2hpbGUobm9kZXNbMF0pIHtcbiAgICAgIGZyYWcuYXBwZW5kQ2hpbGQobm9kZXNbMF0pO1xuICAgIH1cblxuICAgIHRoaXMuZWwuY29udGVudCA9IGZyYWc7XG5cbiAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKHRoaXMubm9kZU5hbWUsICcnKTtcbiAgfVxufTtcblxuLy/lm77niYfnlKgsIOmBv+WFjeWKoOi9veWkp+aLrOWPt+eahOWOn+Wni+aooeadv+WGheWuuVxuZGlycy5zcmMgPSB7XG4gIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdGhpcy5lbC5zcmMgPSB2YWw7XG4gIH1cbn07XG5cbmRpcnNbJ3dpdGgnXSA9IHt9O1xuXG4vL2RpcnMucGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbC5qcycpO1xuZGlycy5yZXBlYXQgPSByZXF1aXJlKCcuL3JlcGVhdC5qcycpO1xuZGlycy5hdHRyID0gcmVxdWlyZSgnLi9hdHRyLmpzJyk7XG5kaXJzLm1vZGVsID0gcmVxdWlyZSgnLi9tb2RlbC5qcycpO1xuZGlycy5zdHlsZSA9IHJlcXVpcmUoJy4vc3R5bGUuanMnKTtcbmRpcnMub24gPSByZXF1aXJlKCcuL29uLmpzJyk7XG5kaXJzLmNvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZGlycztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgaGFzVG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpLmhhc1Rva2VuXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbWluYWw6IHRydWVcbiwgcHJpb3JpdHk6IDFcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICB2YXIga2V5UGF0aCA9IHRoaXMucGF0aDtcblxuICAgIGlmKCFrZXlQYXRoKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgdmFyIGVsID0gdGhpcy5lbFxuICAgICAgLCBldiA9ICdjaGFuZ2UnXG4gICAgICAsIGF0dHIsIHZhbHVlID0gYXR0ciA9ICd2YWx1ZSdcbiAgICAgICwgYW50ID0gdm1cbiAgICAgIC8vLCBjdXIgPSB2bS4kZ2V0Vk0oa2V5UGF0aCwge2Fzc2lnbm1lbnQ6IHRoaXMuYXNzaWdubWVudH0pXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQoYW50LiRnZXQoa2V5UGF0aCkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG4gICAgICAsIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gZWxbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBlbFthdHRyXSA9IG5ld1ZhbDsgfVxuICAgICAgICB9XG4gICAgICAsIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICB2YXIgdmFsID0gZWxbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFsLCB7aXNCdWJibGU6IGlzSW5pdCAhPT0gdHJ1ZX0pO1xuICAgICAgICB9XG4gICAgICAsIGNhbGxIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgIGlmKGUgJiYgZS5wcm9wZXJ0eU5hbWUgJiYgZS5wcm9wZXJ0eU5hbWUgIT09IGF0dHIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgIH1cbiAgICAgICwgaWUgPSB1dGlscy5pZVxuICAgICAgO1xuXG4gICAgc3dpdGNoKGVsLnRhZ05hbWUpIHtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHZhbHVlID0gYXR0ciA9ICdpbm5lckhUTUwnO1xuICAgICAgICAvL2V2ICs9ICcgYmx1cic7XG4gICAgICBjYXNlICdJTlBVVCc6XG4gICAgICBjYXNlICdURVhUQVJFQSc6XG4gICAgICAgIHN3aXRjaChlbC50eXBlKSB7XG4gICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxuICAgICAgICAgICAgdmFsdWUgPSBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgLy9JRTYsIElFNyDkuIvnm5HlkKwgcHJvcGVydHljaGFuZ2Ug5Lya5oyCP1xuICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdyYWRpbyc6XG4gICAgICAgICAgICBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgIGVsLmNoZWNrZWQgPSBlbC52YWx1ZSA9PT0gdmFsICsgJyc7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaXNTZXREZWZhdXQgPSBlbC5jaGVja2VkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZighYW50LiRsYXp5KXtcbiAgICAgICAgICAgICAgaWYoJ29uaW5wdXQnIGluIGVsKXtcbiAgICAgICAgICAgICAgICBldiArPSAnIGlucHV0JztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvL0lFIOS4i+eahCBpbnB1dCDkuovku7bmm7/ku6NcbiAgICAgICAgICAgICAgaWYoaWUpIHtcbiAgICAgICAgICAgICAgICBldiArPSAnIGtleXVwIHByb3BlcnR5Y2hhbmdlIGN1dCc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUxFQ1QnOlxuICAgICAgICBpZihlbC5tdWx0aXBsZSl7XG4gICAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKGlzSW5pdCkge1xuICAgICAgICAgICAgdmFyIHZhbHMgPSBbXTtcbiAgICAgICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBlbC5vcHRpb25zLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgICAgIGlmKGVsLm9wdGlvbnNbaV0uc2VsZWN0ZWQpeyB2YWxzLnB1c2goZWwub3B0aW9uc1tpXS52YWx1ZSkgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFscywge2lzQnViYmxlOiBpc0luaXQgIT09IHRydWV9KTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFscyl7XG4gICAgICAgICAgICBpZih2YWxzICYmIHZhbHMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGVsLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgICBlbC5vcHRpb25zW2ldLnNlbGVjdGVkID0gdmFscy5pbmRleE9mKGVsLm9wdGlvbnNbaV0udmFsdWUpICE9PSAtMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaXNTZXREZWZhdXQgPSBpc1NldERlZmF1dCAmJiAhaGFzVG9rZW4oZWxbdmFsdWVdKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlID0gY2FsbGJhY2s7XG5cbiAgICBldi5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKGUpe1xuICAgICAgZXZlbnRzLnJlbW92ZUV2ZW50KGVsLCBlLCBjYWxsSGFuZGxlcik7XG4gICAgICBldmVudHMuYWRkRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICB9KTtcblxuICAgIC8v5qC55o2u6KGo5Y2V5YWD57Sg55qE5Yid5aeL5YyW6buY6K6k5YC86K6+572u5a+55bqUIG1vZGVsIOeahOWAvFxuICAgIGlmKGVsW3ZhbHVlXSAmJiBpc1NldERlZmF1dCl7XG4gICAgICAgaGFuZGxlcih0cnVlKTtcbiAgICB9XG5cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxuLy/kuovku7bnm5HlkKxcclxuXHJcbnZhciBldmVudEJpbmQgPSByZXF1aXJlKCcuLi9ldmVudC1iaW5kLmpzJyk7XHJcblxyXG4vL1RPRE8g56e76Zmk5pe255qE5oOF5Ya1XHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIGxpbms6IGZ1bmN0aW9uKHZtKSB7XHJcbiAgICAvL3RoaXMuZXZlbnRzID0ge307XHJcbiAgICB0aGlzLnZtID0gdm07XHJcbiAgfVxyXG4sIHVwZGF0ZTogZnVuY3Rpb24oZXZlbnRzKSB7XHJcbiAgICBmb3IodmFyIG5hbWUgaW4gZXZlbnRzKSB7XHJcbiAgICAgIGV2ZW50QmluZC5hZGRFdmVudCh0aGlzLmVsLCBuYW1lLCBldmVudHNbbmFtZV0uYmluZCh0aGlzLnZtKSk7XHJcbiAgICB9XHJcbiAgICAvL3RoaXMuZXZlbnRzID0gZXZlbnRzO1xyXG4gIH1cclxufSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcHJpb3JpdHk6IDEwMDBcbiwgYW5jaG9yOiB0cnVlXG4sIHRlcm1pbmFsOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKHZtKSB7XG5cbiAgICB0aGlzLnZtID0gdm07XG5cbiAgICB0aGlzLmNzdHIgPSB2bS5jb25zdHJ1Y3RvcjtcblxuICAgIHRoaXMuY3VyQXJyID0gW107XG4gICAgdGhpcy5saXN0ID0gW107Ly9be2VsOmVsLCB2bTogdm19XVxuXG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcblxuICAgICAgLy/liKDpmaTlhYPntKBcbiAgICAgIGFyckRpZmYoY3VyQXJyLCBpdGVtcykuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgIHZhciBwb3MgPSBjdXJBcnIuaW5kZXhPZihpdGVtKVxuICAgICAgICBjdXJBcnIuc3BsaWNlKHBvcywgMSlcbiAgICAgICAgcGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmxpc3RbcG9zXS5lbClcbiAgICAgICAgdGhpcy5saXN0LnNwbGljZShwb3MsIDEpXG5cbiAgICAgIH0uYmluZCh0aGlzKSlcblxuICAgICAgaXRlbXMuZm9yRWFjaChmdW5jdGlvbihpdGVtLCBpKSB7XG4gICAgICAgIHZhciBwb3MgPSBpdGVtcy5pbmRleE9mKGl0ZW0sIGkpXG4gICAgICAgICAgLCBvbGRQb3MgPSBjdXJBcnIuaW5kZXhPZihpdGVtLCBpKVxuICAgICAgICAgICwgdm0sIGVsXG4gICAgICAgICAgO1xuXG4gICAgICAgIHBvcyA8IDAgJiYgKHBvcyA9IGl0ZW1zLmxhc3RJbmRleE9mKGl0ZW0sIGkpKTtcbiAgICAgICAgb2xkUG9zIDwgMCAmJiAob2xkUG9zID0gY3VyQXJyLmxhc3RJbmRleE9mKGl0ZW0sIGkpKTtcblxuICAgICAgICAvL+aWsOWinuWFg+e0oFxuICAgICAgICBpZihvbGRQb3MgPCAwKSB7XG5cbiAgICAgICAgICAvLyDlnKggcmVwZWF0IOaMh+S7pOihqOi+vuW8j+S4rVxuICAgICAgICAgIHRoaXMubGlzdFBhdGggPSB0aGlzLmxvY2Fscy5maWx0ZXIoZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHV0aWxzLmlzQXJyYXkodGhpcy52bS4kZ2V0KHBhdGgpKVxuICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgICBlbCA9IHRoaXMuZWwuY2xvbmVOb2RlKHRydWUpXG5cblxuICAgICAgICAgIHZtID0gbmV3IHRoaXMuY3N0cihlbCwgeyRkYXRhOiBpdGVtLCAkcGFyZW50OiB0aGlzLnZtLCBfYXNzaWdubWVudHM6IHRoaXMuYXNzaWdubWVudHN9KTtcbiAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh2bS4kZWwsIHRoaXMubGlzdFtwb3NdICYmIHRoaXMubGlzdFtwb3NdLmVsIHx8IHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgdGhpcy5saXN0LnNwbGljZShwb3MsIDAsIHtlbDogZWwsIHZtOiB2bX0pO1xuICAgICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAwLCBpdGVtKVxuXG4gICAgICAgICAgLy/lu7bml7botYvlgLznu5kgYF9yZWxhdGl2ZVBhdGhgLCDpgb/lhY3lh7rnjrDmrbvlvqrnjq9cbiAgICAgICAgICAvL+WmguaenOWcqOS4iumdouWunuS+i+WMluaXtuW9k+WPguaVsOS8oOWFpSwg5Lya5YaS5rOh5Yiw54i257qnIHZtIOmAkuW9kuiwg+eUqOi/memHjOeahCB1cGRhdGUg5pa55rOVLCDpgKDmiJDmrbvlvqrnjq8uXG4gICAgICAgICAgdm0uX3JlbGF0aXZlUGF0aCA9IHRoaXMubGlzdFBhdGg7XG4gICAgICAgIH1lbHNlIHtcblxuICAgICAgICAgIC8v6LCD5bqPXG4gICAgICAgICAgaWYgKHBvcyAhPT0gb2xkUG9zKSB7XG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLmxpc3Rbb2xkUG9zXS5lbCwgdGhpcy5saXN0W3Bvc10uZWwgfHwgdGhpcy5hbmNob3IuZW5kKVxuICAgICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5saXN0W3Bvc10uZWwsIHRoaXMubGlzdFtvbGRQb3MgKyAxXS5lbCB8fCB0aGlzLmFuY2hvci5lbmQpXG4gICAgICAgICAgICB0aGlzLmxpc3Rbb2xkUG9zXSA9IFt0aGlzLmxpc3RbcG9zXSwgdGhpcy5saXN0W3Bvc10gPSB0aGlzLmxpc3Rbb2xkUG9zXV1bMF1cbiAgICAgICAgICAgIGN1ckFycltvbGRQb3NdID0gW2N1ckFycltwb3NdLCBjdXJBcnJbcG9zXSA9IGN1ckFycltvbGRQb3NdXVswXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKVxuICAgIH1lbHNle1xuICAgICAgLy9UT0RPIOaZrumAmuWvueixoeeahOmBjeWOhlxuICAgIH1cbiAgfVxufTtcblxuXG5mdW5jdGlvbiBhcnJEaWZmKGFycjEsIGFycjIpIHtcbiAgcmV0dXJuIGFycjEuZmlsdGVyKGZ1bmN0aW9uKGVsKSB7XG4gICAgcmV0dXJuIGFycjIuaW5kZXhPZihlbCkgPCAwXG4gIH0pXG59XG5cbiIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxuLy/moLflvI/mjIfku6RcclxuXHJcbnZhciBjYW1lbFJlZyA9IC8oW0EtWl0pL2c7XHJcblxyXG4vL+m7mOiupOWNleS9jeS4uiBweCDnmoTlsZ7mgKdcclxuLy9UT0RPIOW+heWujOWWhFxyXG52YXIgcGl4ZWxBdHRycyA9IFtcclxuICAnd2lkdGgnLCdoZWlnaHQnLFxyXG4gICdtYXJnaW4nLCAnbWFyZ2luLXRvcCcsICdtYXJnaW4tcmlnaHQnLCAnbWFyZ2luLWxlZnQnLCAnbWFyZ2luLWJvdHRvbScsXHJcbiAgJ3BhZGRpbmcnLCAncGFkZGluZy10b3AnLCAncGFkZGluZy1yaWdodCcsICdwYWRkaW5nLWJvdHRvbScsICdwYWRkaW5nLWxlZnQnXHJcbl1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIGxpbms6IGZ1bmN0aW9uKCkge1xyXG5cclxuICB9XHJcbiwgdXBkYXRlOiBmdW5jdGlvbihzdHlsZXMpIHtcclxuICAgIHZhciBlbCA9IHRoaXMuZWw7XHJcbiAgICB2YXIgc3R5bGVTdHIgPSAnJztcclxuICAgIHZhciBkYXNoS2V5LCB2YWw7XHJcblxyXG4gICAgZm9yKHZhciBrZXkgaW4gc3R5bGVzKSB7XHJcbiAgICAgIHZhbCA9IHN0eWxlc1trZXldO1xyXG5cclxuICAgICAgZGFzaEtleSA9IGtleS5yZXBsYWNlKGNhbWVsUmVnLCBmdW5jdGlvbiAodXBwZXJDaGFyKSB7XHJcbiAgICAgICAgcmV0dXJuICctJyArIHVwcGVyQ2hhci50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmKCFpc05hTih2YWwpICYmIHBpeGVsQXR0cnMuaW5kZXhPZihkYXNoS2V5KSA+PSAwKSB7XHJcbiAgICAgICAgdmFsICs9ICdweCc7XHJcbiAgICAgIH1cclxuICAgICAgc3R5bGVTdHIgKz0gZGFzaEtleSArICc6ICcgKyB2YWwgKyAnOyAnO1xyXG4gICAgfVxyXG4gICAgaWYoZWwuc3R5bGUuc2V0QXR0cmlidXRlKXtcclxuICAgICAgLy/ogIEgSUVcclxuICAgICAgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0Jywgc3R5bGVTdHIpO1xyXG4gICAgfWVsc2V7XHJcbiAgICAgIGVsLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBzdHlsZVN0cik7XHJcbiAgICB9XHJcbiAgfVxyXG59OyIsIihmdW5jdGlvbihyb290KXtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZXhwb3J0cy5yb290ID0gcm9vdDtcbiAgZXhwb3J0cy5kb2N1bWVudCA9IHJvb3QuZG9jdW1lbnQgfHwgcmVxdWlyZSgnanNkb20nKS5qc2RvbSgpO1xuXG59KSgoZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXN9KSgpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgb3BlcmF0b3JzID0ge1xuICAndW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbih2KSB7IHJldHVybiArdjsgfVxuICAsICctJzogZnVuY3Rpb24odikgeyByZXR1cm4gLXY7IH1cbiAgLCAnISc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICF2OyB9XG5cbiAgLCAnWyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdjsgfVxuICAsICd7JzogZnVuY3Rpb24odil7XG4gICAgICB2YXIgciA9IHt9O1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IHYubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHJbdltpXVswXV0gPSB2W2ldWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICAsICd0eXBlb2YnOiBmdW5jdGlvbih2KXsgcmV0dXJuIHR5cGVvZiB2OyB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gbmV3IHYgfVxuICB9XG5cbiwgJ2JpbmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKyByOyB9XG4gICwgJy0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC0gcjsgfVxuICAsICcqJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAqIHI7IH1cbiAgLCAnLyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLyByOyB9XG4gICwgJyUnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICUgcjsgfVxuICAsICc8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8IHI7IH1cbiAgLCAnPic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPiByOyB9XG4gICwgJzw9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8PSByOyB9XG4gICwgJz49JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+PSByOyB9XG4gICwgJz09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PSByOyB9XG4gICwgJyE9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPSByOyB9XG4gICwgJz09PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT09IHI7IH1cbiAgLCAnIT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPT0gcjsgfVxuICAsICcmJic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJiYgcjsgfVxuICAsICd8fCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgfHwgcjsgfVxuXG4gICwgJy4nOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihyKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuICAsICdbJzogZnVuY3Rpb24obCwgcikge1xuICAgICAgaWYodHlwZW9mIHIgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuXG4gICwgJygnOiBmdW5jdGlvbihsLCByKXsgcmV0dXJuIGwuYXBwbHkoY29udGV4dC5sb2NhbHMsIHIpIH1cbiAgLCAnfCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gci5jYWxsKGNvbnRleHQubG9jYWxzLCBsKSB9Ly9maWx0ZXIuIG5hbWV8ZmlsdGVyXG4gICwgJ25ldyc6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgcmV0dXJuIGwgPT09IERhdGUgPyBuZXcgRnVuY3Rpb24oJ3JldHVybiBuZXcgRGF0ZSgnICsgci5qb2luKCcsICcpICsgJyknKSgpIDogbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShsLCByKSk7XG4gICAgfVxuXG4gICwgJ2luJzogZnVuY3Rpb24obCwgcil7XG4gICAgICBpZih0aGlzLmFzc2lnbm1lbnQpIHtcbiAgICAgICAgLy9yZXBlYXRcbiAgICAgICAgcmV0dXJuIHI7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIGwgaW4gcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLCAndGVybmFyeSc6IHtcbiAgICAnPyc6IGZ1bmN0aW9uKGYsIHMsIHQpIHsgcmV0dXJuIGYgPyBzIDogdDsgfVxuICAsICcoJzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZltzXS5hcHBseShmLCB0KSB9XG5cbiAgLy9maWx0ZXIuIG5hbWUgfCBmaWx0ZXIgOiBhcmcyIDogYXJnM1xuICAsICd8JzogZnVuY3Rpb24oZiwgcywgdCl7IHJldHVybiBzLmFwcGx5KGNvbnRleHQubG9jYWxzLCBbZl0uY29uY2F0KHQpKTsgfVxuICB9XG59O1xuXG52YXIgYXJnTmFtZSA9IFsnZmlyc3QnLCAnc2Vjb25kJywgJ3RoaXJkJ11cbiAgLCBjb250ZXh0LCBzdW1tYXJ5XG4gICwgcGF0aFxuICAsIHNlbGZcbiAgO1xuXG4vL+mBjeWOhiBhc3RcbnZhciBldmFsdWF0ZSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdmFyIGFyaXR5ID0gdHJlZS5hcml0eVxuICAgICwgdmFsdWUgPSB0cmVlLnZhbHVlXG4gICAgLCBhcmdzID0gW11cbiAgICAsIG4gPSAwXG4gICAgLCBhcmdcbiAgICAsIHJlc1xuICAgIDtcblxuICAvL+aTjeS9nOespuacgOWkmuWPquacieS4ieWFg1xuICBmb3IoOyBuIDwgMzsgbisrKXtcbiAgICBhcmcgPSB0cmVlW2FyZ05hbWVbbl1dO1xuICAgIGlmKGFyZyl7XG4gICAgICBpZihBcnJheS5pc0FycmF5KGFyZykpe1xuICAgICAgICBhcmdzW25dID0gW107XG4gICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBhcmcubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICBhcmdzW25dLnB1c2godHlwZW9mIGFyZ1tpXS5rZXkgPT09ICd1bmRlZmluZWQnID9cbiAgICAgICAgICAgIGV2YWx1YXRlKGFyZ1tpXSkgOiBbYXJnW2ldLmtleSwgZXZhbHVhdGUoYXJnW2ldKV0pO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYXJnc1tuXSA9IGV2YWx1YXRlKGFyZyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoYXJpdHkgIT09ICdsaXRlcmFsJykge1xuICAgIGlmKHBhdGggJiYgdmFsdWUgIT09ICcuJyAmJiB2YWx1ZSAhPT0gJ1snKSB7XG4gICAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYoYXJpdHkgPT09ICduYW1lJykge1xuICAgICAgcGF0aCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHN3aXRjaChhcml0eSl7XG4gICAgY2FzZSAndW5hcnknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAndGVybmFyeSc6XG4gICAgICB0cnl7XG4gICAgICAgIHJlcyA9IGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSkuYXBwbHkodHJlZSwgYXJncyk7XG4gICAgICB9Y2F0Y2goZSl7XG4gICAgICAgIC8vY29uc29sZS5kZWJ1ZyhlKTtcbiAgICAgIH1cbiAgICBicmVhaztcbiAgICBjYXNlICdsaXRlcmFsJzpcbiAgICAgIHJlcyA9IHZhbHVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2Fzc2lnbm1lbnQnOlxuICAgICAgc3VtbWFyeS5hc3NpZ25tZW50c1t2YWx1ZV0gPSB0cnVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ25hbWUnOlxuICAgICAgc3VtbWFyeS5sb2NhbHNbdmFsdWVdID0gdHJ1ZTtcbiAgICAgIHJlcyA9IGdldFZhbHVlKHZhbHVlLCBjb250ZXh0LmxvY2Fscyk7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnZmlsdGVyJzpcbiAgICAgIHN1bW1hcnkuZmlsdGVyc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gY29udGV4dC5maWx0ZXJzW3ZhbHVlXTtcbiAgICBicmVhaztcbiAgICBjYXNlICd0aGlzJzpcbiAgICAgIHJlcyA9IGNvbnRleHQubG9jYWxzOy8vVE9ETyB0aGlzIOaMh+WQkSB2bSDov5jmmK8gZGlyP1xuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpe1xuICByZXR1cm4gb3BlcmF0b3JzW2FyaXR5XVt2YWx1ZV0gfHwgZnVuY3Rpb24oKSB7IHJldHVybjsgfVxufVxuXG5mdW5jdGlvbiByZXNldChzY29wZSwgdGhhdCkge1xuICBpZihzY29wZSkge1xuICAgIGNvbnRleHQgPSB7bG9jYWxzOiBzY29wZSB8fCB7fSwgZmlsdGVyczogc2NvcGUuJGZpbHRlcnMgfHwge319O1xuICB9ZWxzZXtcbiAgICBjb250ZXh0ID0ge2ZpbHRlcnM6IHt9LCBsb2NhbHM6IHt9fTtcbiAgfVxuICBpZih0aGF0KXtcbiAgICBzZWxmID0gdGhhdDtcbiAgfVxuXG4gIHN1bW1hcnkgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge30sIHBhdGhzOiB7fSwgYXNzaWdubWVudHM6IHt9fTtcbiAgcGF0aCA9ICcnO1xufVxuXG4vL+WcqOS9nOeUqOWfn+S4reafpeaJvuWAvFxudmFyIGdldFZhbHVlID0gZnVuY3Rpb24gKGtleSwgc2NvcGUpIHtcbiAgLy/lr7nkuo7lhbflkI0gcmVwZWF0IOafpeaJvumhuuW6j+S4uiDliKvlkI0sIOeItue6pyBzY29wZSwg6Ieq6LqrIHNjb3BlXG4gIGlmKHNjb3BlLl9hc3NpZ25tZW50cyAmJiBzY29wZS5fYXNzaWdubWVudHNbMF0gPT09IGtleSkge1xuICAgIHJldHVybiBzY29wZVxuICB9ZWxzZSBpZihzY29wZS4kcGFyZW50KSB7XG4gICAgcmV0dXJuIGdldFZhbHVlKGtleSwgc2NvcGUuJHBhcmVudCk7XG4gIH1lbHNlICBpZih0eXBlb2Ygc2NvcGVba2V5XSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gc2NvcGVba2V5XTtcbiAgfWVsc2V7XG4gICAgcmV0dXJuO1xuICB9XG59XG5cbi8v6KGo6L6+5byP5rGC5YC8XG4vL3RyZWU6IHBhcnNlciDnlJ/miJDnmoQgYXN0XG4vL3Njb3BlIOaJp+ihjOeOr+Wig1xuZXhwb3J0cy5ldmFsID0gZnVuY3Rpb24odHJlZSwgc2NvcGUsIHRoYXQpIHtcbiAgcmVzZXQoc2NvcGUgfHwge30sIHRoYXQpO1xuXG4gIHJldHVybiBldmFsdWF0ZSh0cmVlKTtcbn07XG5cbi8v6KGo6L6+5byP5pGY6KaBXG4vL3JldHVybjoge2ZpbHRlcnM6W10sIGxvY2FsczpbXSwgcGF0aHM6IFtdLCBhc3NpZ25tZW50czogW119XG5leHBvcnRzLnN1bW1hcnkgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHJlc2V0KCk7XG5cbiAgZXZhbHVhdGUodHJlZSk7XG5cbiAgaWYocGF0aCkge1xuICAgIHN1bW1hcnkucGF0aHNbcGF0aF0gPSB0cnVlO1xuICB9XG4gIGZvcih2YXIga2V5IGluIHN1bW1hcnkpIHtcbiAgICBzdW1tYXJ5W2tleV0gPSBPYmplY3Qua2V5cyhzdW1tYXJ5W2tleV0pO1xuICB9XG4gIHJldHVybiBzdW1tYXJ5O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxuZXhwb3J0cy5hZGRFdmVudCA9IGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xyXG4gIGlmKGVsLmFkZEV2ZW50TGlzdGVuZXIpIHtcclxuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIGZhbHNlKTtcclxuICB9ZWxzZXtcclxuICAgIGVsLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudCwgaGFuZGxlcik7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnRzLnJlbW92ZUV2ZW50ID0gZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIGV2ZW50LCBoYW5kbGVyKSB7XHJcbiAgaWYoZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xyXG4gICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlcik7XHJcbiAgfWVsc2V7XHJcbiAgICBlbC5kZXRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xyXG4gIH1cclxufSIsInZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxudmFyIEV2ZW50ID0ge1xuICAvL+ebkeWQrOiHquWumuS5ieS6i+S7ti5cbiAgb246IGZ1bmN0aW9uKG5hbWUsIGhhbmRsZXIsIGNvbnRleHQpIHtcbiAgICB2YXIgY3R4ID0gY29udGV4dCB8fCB0aGlzXG4gICAgICA7XG5cbiAgICBjdHguX2hhbmRsZXJzID0gY3R4Ll9oYW5kbGVycyB8fCB7fTtcbiAgICBjdHguX2hhbmRsZXJzW25hbWVdID0gY3R4Ll9oYW5kbGVyc1tuYW1lXSB8fCBbXTtcblxuICAgIGN0eC5faGFuZGxlcnNbbmFtZV0ucHVzaCh7aGFuZGxlcjogaGFuZGxlciwgY29udGV4dDogY29udGV4dCwgY3R4OiBjdHh9KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcbiAgb25lOiBmdW5jdGlvbiAobmFtZSwgaGFuZGxlciwgY29udGV4dCkge1xuICAgIGlmKGhhbmRsZXIpe1xuICAgICAgaGFuZGxlci5vbmUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBoYW5kbGVyLCBjb250ZXh0KTtcbiAgfSxcbiAgLy/np7vpmaTnm5HlkKzkuovku7YuXG4gIG9mZjogZnVuY3Rpb24obmFtZSwgaGFuZGxlciwgY29udGV4dCkge1xuICAgIHZhciBjdHggPSBjb250ZXh0IHx8IHRoaXNcbiAgICAgICwgaGFuZGxlcnMgPSBjdHguX2hhbmRsZXJzXG4gICAgICA7XG5cbiAgICBpZihuYW1lICYmIGhhbmRsZXJzW25hbWVdKXtcbiAgICAgIGlmKHV0aWxzLmlzRnVuY3Rpb24oaGFuZGxlcikpe1xuICAgICAgICBmb3IodmFyIGkgPSBoYW5kbGVyc1tuYW1lXS5sZW5ndGggLSAxOyBpID49MDsgaS0tKSB7XG4gICAgICAgICAgaWYoaGFuZGxlcnNbbmFtZV1baV0uaGFuZGxlciA9PT0gaGFuZGxlcil7XG4gICAgICAgICAgICBoYW5kbGVyc1tuYW1lXS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgaGFuZGxlcnNbbmFtZV0gPSBbXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG4gIC8v6Kem5Y+R6Ieq5a6a5LmJ5LqL5Lu2LlxuICAvL+ivpeaWueazleayoeacieaPkOS+m+mdmeaAgeWMlueahCBjb250ZXh0IOWPguaVsC4g5aaC6KaB6Z2Z5oCB5YyW5L2/55SoLCDlupTor6U6IGBFdmVudC50cmlnZ2VyLmNhbGwoY29udGV4dCwgbmFtZSwgZGF0YSlgXG4gIHRyaWdnZXI6IGZ1bmN0aW9uKG5hbWUsIGRhdGEpIHtcbiAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuICAgICAgLCBoYW5kbGVycyA9IHRoaXMuX2hhbmRsZXJzICYmIHRoaXMuX2hhbmRsZXJzW25hbWVdXG4gICAgICA7XG5cbiAgICBpZihoYW5kbGVycyl7XG4gICAgICBmb3IodmFyIGkgPSAwLCBpdGVtOyBpdGVtID0gaGFuZGxlcnNbaV07IGkrKykge1xuICAgICAgICBpdGVtLmhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgIGlmKGl0ZW0uaGFuZGxlci5vbmUpIHtcbiAgICAgICAgICBoYW5kbGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG4vL0phdmFzY3JpcHQgZXhwcmVzc2lvbiBwYXJzZXIgbW9kaWZpZWQgZm9ybSBDcm9ja2ZvcmQncyBURE9QIHBhcnNlclxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcblx0ZnVuY3Rpb24gRigpIHt9XG5cdEYucHJvdG90eXBlID0gbztcblx0cmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgc291cmNlO1xuXG52YXIgZXJyb3IgPSBmdW5jdGlvbiAobWVzc2FnZSwgdCkge1xuXHR0ID0gdCB8fCB0aGlzO1xuICB2YXIgbXNnID0gbWVzc2FnZSArPSBcIiBCdXQgZm91bmQgJ1wiICsgdC52YWx1ZSArIFwiJ1wiICsgKHQuZnJvbSA/IFwiIGF0IFwiICsgdC5mcm9tIDogXCJcIikgKyBcIiBpbiAnXCIgKyBzb3VyY2UgKyBcIidcIjtcbiAgdmFyIGUgPSBuZXcgRXJyb3IobXNnKTtcblx0ZS5uYW1lID0gdC5uYW1lID0gXCJTeW50YXhFcnJvclwiO1xuXHR0Lm1lc3NhZ2UgPSBtZXNzYWdlO1xuICB0aHJvdyBlO1xufTtcblxudmFyIHRva2VuaXplID0gZnVuY3Rpb24gKGNvZGUsIHByZWZpeCwgc3VmZml4KSB7XG5cdHZhciBjOyAvLyBUaGUgY3VycmVudCBjaGFyYWN0ZXIuXG5cdHZhciBmcm9tOyAvLyBUaGUgaW5kZXggb2YgdGhlIHN0YXJ0IG9mIHRoZSB0b2tlbi5cblx0dmFyIGkgPSAwOyAvLyBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgbGVuZ3RoID0gY29kZS5sZW5ndGg7XG5cdHZhciBuOyAvLyBUaGUgbnVtYmVyIHZhbHVlLlxuXHR2YXIgcTsgLy8gVGhlIHF1b3RlIGNoYXJhY3Rlci5cblx0dmFyIHN0cjsgLy8gVGhlIHN0cmluZyB2YWx1ZS5cblx0dmFyIGY7IC8vVGhlIHJlZ2V4cCBmbGFnLlxuXG5cdHZhciByZXN1bHQgPSBbXTsgLy8gQW4gYXJyYXkgdG8gaG9sZCB0aGUgcmVzdWx0cy5cblxuXHQvLyBNYWtlIGEgdG9rZW4gb2JqZWN0LlxuXHR2YXIgbWFrZSA9IGZ1bmN0aW9uICh0eXBlLCB2YWx1ZSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlIDogdHlwZSxcblx0XHRcdHZhbHVlIDogdmFsdWUsXG5cdFx0XHRmcm9tIDogZnJvbSxcblx0XHRcdHRvIDogaVxuXHRcdH07XG5cdH07XG5cblx0Ly8gQmVnaW4gdG9rZW5pemF0aW9uLiBJZiB0aGUgc291cmNlIHN0cmluZyBpcyBlbXB0eSwgcmV0dXJuIG5vdGhpbmcuXG5cdGlmICghY29kZSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIExvb3AgdGhyb3VnaCBjb2RlIHRleHQsIG9uZSBjaGFyYWN0ZXIgYXQgYSB0aW1lLlxuXHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdHdoaWxlIChjKSB7XG5cdFx0ZnJvbSA9IGk7XG5cblx0XHRpZiAoYyA8PSAnICcpIHsgLy8gSWdub3JlIHdoaXRlc3BhY2UuXG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0fSBlbHNlIGlmICgoYyA+PSAnYScgJiYgYyA8PSAneicpIHx8IChjID49ICdBJyAmJiBjIDw9ICdaJykgfHwgYyA9PT0gJyQnIHx8IGMgPT09ICdfJykgeyAvLyBuYW1lLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmICgoYyA+PSAnYScgJiYgYyA8PSAneicpIHx8IChjID49ICdBJyAmJiBjIDw9ICdaJykgfHxcblx0XHRcdFx0XHQoYyA+PSAnMCcgJiYgYyA8PSAnOScpIHx8IGMgPT09ICdfJykge1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnbmFtZScsIHN0cikpO1xuXHRcdH0gZWxzZSBpZiAoYyA+PSAnMCcgJiYgYyA8PSAnOScpIHtcblx0XHRcdC8vIG51bWJlci5cblxuXHRcdFx0Ly8gQSBudW1iZXIgY2Fubm90IHN0YXJ0IHdpdGggYSBkZWNpbWFsIHBvaW50LiBJdCBtdXN0IHN0YXJ0IHdpdGggYSBkaWdpdCxcblx0XHRcdC8vIHBvc3NpYmx5ICcwJy5cblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cblx0XHRcdC8vIExvb2sgZm9yIG1vcmUgZGlnaXRzLlxuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPCAnMCcgfHwgYyA+ICc5Jykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGEgZGVjaW1hbCBmcmFjdGlvbiBwYXJ0LlxuXHRcdFx0aWYgKGMgPT09ICcuJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdFx0aWYgKGMgPCAnMCcgfHwgYyA+ICc5Jykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIGZvciBhbiBleHBvbmVudCBwYXJ0LlxuXHRcdFx0aWYgKGMgPT09ICdlJyB8fCBjID09PSAnRScpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA9PT0gJy0nIHx8IGMgPT09ICcrJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGMgPCAnMCcgfHwgYyA+ICc5Jykge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIGV4cG9uZW50XCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHR9IHdoaWxlIChjID49ICcwJyAmJiBjIDw9ICc5Jyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgbmV4dCBjaGFyYWN0ZXIgaXMgbm90IGEgbGV0dGVyLlxuXG5cdFx0XHRpZiAoYyA+PSAnYScgJiYgYyA8PSAneicpIHtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0ZXJyb3IoXCJCYWQgbnVtYmVyXCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb252ZXJ0IHRoZSBzdHJpbmcgdmFsdWUgdG8gYSBudW1iZXIuIElmIGl0IGlzIGZpbml0ZSwgdGhlbiBpdCBpcyBhIGdvb2Rcblx0XHRcdC8vIHRva2VuLlxuXG5cdFx0XHRuID0gK3N0cjtcblx0XHRcdGlmIChpc0Zpbml0ZShuKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChtYWtlKCdudW1iZXInLCBuKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHN0cmluZ1xuXG5cdFx0fSBlbHNlIGlmIChjID09PSAnXFwnJyB8fCBjID09PSAnXCInKSB7XG5cdFx0XHRzdHIgPSAnJztcblx0XHRcdHEgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPCAnICcpIHtcblx0XHRcdFx0XHRtYWtlKCdzdHJpbmcnLCBzdHIpO1xuXHRcdFx0XHRcdGVycm9yKGMgPT09ICdcXG4nIHx8IGMgPT09ICdcXHInIHx8IGMgPT09ICcnID9cblx0XHRcdFx0XHRcdFwiVW50ZXJtaW5hdGVkIHN0cmluZy5cIiA6XG5cdFx0XHRcdFx0XHRcIkNvbnRyb2wgY2hhcmFjdGVyIGluIHN0cmluZy5cIiwgbWFrZSgnJywgc3RyKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciB0aGUgY2xvc2luZyBxdW90ZS5cblxuXHRcdFx0XHRpZiAoYyA9PT0gcSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgZXNjYXBlbWVudC5cblxuXHRcdFx0XHRpZiAoYyA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdFx0c3dpdGNoIChjKSB7XG5cdFx0XHRcdFx0Y2FzZSAnYic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcYic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdmJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxmJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ24nOlxuXHRcdFx0XHRcdFx0YyA9ICdcXG4nO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncic6XG5cdFx0XHRcdFx0XHRjID0gJ1xccic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd0Jzpcblx0XHRcdFx0XHRcdGMgPSAnXFx0Jztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3UnOlxuXHRcdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMgPSBwYXJzZUludChjb2RlLnN1YnN0cihpICsgMSwgNCksIDE2KTtcblx0XHRcdFx0XHRcdGlmICghaXNGaW5pdGUoYykgfHwgYyA8IDApIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYyk7XG5cdFx0XHRcdFx0XHRpICs9IDQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXG5cdFx0XHQvLyByZWdleHBcblx0XHR9ZWxzZSBpZihjID09PSAnLycgJiYgZmFsc2Upe1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0c3RyID0gJyc7XG5cdFx0XHRmID0gJyc7XG5cdFx0XHRmb3IoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgY2xvc2Ugc2xhc2hcblxuXHRcdFx0XHRpZihjID09PSAnLycpIHtcblx0XHRcdFx0XHRmb3IoOyA7ICkge1xuXHRcdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkgKyAxKTtcblx0XHRcdFx0XHRcdGlmKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0XHRcdGYgKz0gYztcblx0XHRcdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdFx0fWVsc2V7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmKGMgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHJlZ2V4cFwiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdGMgPSAnXFxcXCcgKyBjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdyZWdleHAnLCBuZXcgUmVnRXhwKHN0ciwgZikpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0Ly8gY29tYmluaW5nXG5cblx0XHR9IGVsc2UgaWYgKHByZWZpeC5pbmRleE9mKGMpID49IDApIHtcblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChpID49IGxlbmd0aCB8fCBzdWZmaXguaW5kZXhPZihjKSA8IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnb3BlcmF0b3InLCBzdHIpKTtcblxuXHRcdFx0Ly8gc2luZ2xlLWNoYXJhY3RlciBvcGVyYXRvclxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgYykpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIG1ha2VfcGFyc2UgPSBmdW5jdGlvbiAodmFycykge1xuXHR2YXJzID0gdmFycyB8fCB7fTsvL+mihOWumuS5ieeahOWPmOmHj1xuXHR2YXIgc3ltYm9sX3RhYmxlID0ge307XG5cdHZhciB0b2tlbjtcblx0dmFyIHRva2Vucztcblx0dmFyIHRva2VuX25yO1xuXHR2YXIgY29udGV4dDtcblxuXHR2YXIgaXRzZWxmID0gZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdHZhciBmaW5kID0gZnVuY3Rpb24gKG4pIHtcblx0XHRuLm51ZCA9IGl0c2VsZjtcblx0XHRuLmxlZCA9IG51bGw7XG5cdFx0bi5zdGQgPSBudWxsO1xuXHRcdG4ubGJwID0gMDtcblx0XHRyZXR1cm4gbjtcblx0fTtcblxuXHR2YXIgYWR2YW5jZSA9IGZ1bmN0aW9uIChpZCkge1xuXHRcdHZhciBhLCBvLCB0LCB2O1xuXHRcdGlmIChpZCAmJiB0b2tlbi5pZCAhPT0gaWQpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgJ1wiICsgaWQgKyBcIicuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuX25yID49IHRva2Vucy5sZW5ndGgpIHtcblx0XHRcdHRva2VuID0gc3ltYm9sX3RhYmxlW1wiKGVuZClcIl07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHQgPSB0b2tlbnNbdG9rZW5fbnJdO1xuXHRcdHRva2VuX25yICs9IDE7XG5cdFx0diA9IHQudmFsdWU7XG5cdFx0YSA9IHQudHlwZTtcblx0XHRpZiAoKGEgPT09IFwib3BlcmF0b3JcIiB8fCBhICE9PSAnc3RyaW5nJykgJiYgdiBpbiBzeW1ib2xfdGFibGUpIHtcblx0XHRcdC8vdHJ1ZSwgZmFsc2Ug562J55u05o6l6YeP5Lmf5Lya6L+b5YWl5q2k5YiG5pSvXG5cdFx0XHRvID0gc3ltYm9sX3RhYmxlW3ZdO1xuXHRcdFx0aWYgKCFvKSB7XG5cdFx0XHRcdGVycm9yKFwiVW5rbm93biBvcGVyYXRvci5cIiwgdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhID09PSBcIm5hbWVcIikge1xuXHRcdFx0byA9IGZpbmQodCk7XG5cdFx0fSBlbHNlIGlmIChhID09PSBcInN0cmluZ1wiIHx8IGEgPT09IFwibnVtYmVyXCIgfHwgYSA9PT0gXCJyZWdleHBcIikge1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVtcIihsaXRlcmFsKVwiXTtcblx0XHRcdGEgPSBcImxpdGVyYWxcIjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXJyb3IoXCJVbmV4cGVjdGVkIHRva2VuLlwiLCB0KTtcblx0XHR9XG5cdFx0dG9rZW4gPSBjcmVhdGUobyk7XG5cdFx0dG9rZW4uZnJvbSA9IHQuZnJvbTtcblx0XHR0b2tlbi50byA9IHQudG87XG5cdFx0dG9rZW4udmFsdWUgPSB2O1xuXHRcdHRva2VuLmFyaXR5ID0gYTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH07XG5cblx0dmFyIGV4cHJlc3Npb24gPSBmdW5jdGlvbiAocmJwKSB7XG5cdFx0dmFyIGxlZnQ7XG5cdFx0dmFyIHQgPSB0b2tlbjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0bGVmdCA9IHQubnVkKCk7XG5cdFx0d2hpbGUgKHJicCA8IHRva2VuLmxicCkge1xuXHRcdFx0dCA9IHRva2VuO1xuXHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0bGVmdCA9IHQubGVkKGxlZnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGVmdDtcblx0fTtcblxuXHR2YXIgb3JpZ2luYWxfc3ltYm9sID0ge1xuXHRcdG51ZCA6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGVycm9yKFwiVW5kZWZpbmVkLlwiLCB0aGlzKTtcblx0XHR9LFxuXHRcdGxlZCA6IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHRlcnJvcihcIk1pc3Npbmcgb3BlcmF0b3IuXCIsIHRoaXMpO1xuXHRcdH1cblx0fTtcblxuXHR2YXIgc3ltYm9sID0gZnVuY3Rpb24gKGlkLCBicCkge1xuXHRcdHZhciBzID0gc3ltYm9sX3RhYmxlW2lkXTtcblx0XHRicCA9IGJwIHx8IDA7XG5cdFx0aWYgKHMpIHtcblx0XHRcdGlmIChicCA+PSBzLmxicCkge1xuXHRcdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzID0gY3JlYXRlKG9yaWdpbmFsX3N5bWJvbCk7XG5cdFx0XHRzLmlkID0gcy52YWx1ZSA9IGlkO1xuXHRcdFx0cy5sYnAgPSBicDtcblx0XHRcdHN5bWJvbF90YWJsZVtpZF0gPSBzO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgY29uc3RhbnQgPSBmdW5jdGlvbiAocywgdiwgYSkge1xuXHRcdHZhciB4ID0gc3ltYm9sKHMpO1xuXHRcdHgubnVkID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy52YWx1ZSA9IHN5bWJvbF90YWJsZVt0aGlzLmlkXS52YWx1ZTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImxpdGVyYWxcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0eC52YWx1ZSA9IHY7XG5cdFx0cmV0dXJuIHg7XG5cdH07XG5cblx0dmFyIGluZml4ID0gZnVuY3Rpb24gKGlkLCBicCwgbGVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQsIGJwKTtcblx0XHRzLmxlZCA9IGxlZCB8fCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oYnApO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBpbmZpeHIgPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCAtIDEpO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBwcmVmaXggPSBmdW5jdGlvbiAoaWQsIG51ZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkKTtcblx0XHRzLm51ZCA9IG51ZCB8fCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gZXhwcmVzc2lvbig3MCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHRzeW1ib2woXCIoZW5kKVwiKTtcblx0c3ltYm9sKFwiKG5hbWUpXCIpO1xuXHRzeW1ib2woXCI6XCIpO1xuXHRzeW1ib2woXCIpXCIpO1xuXHRzeW1ib2woXCJdXCIpO1xuXHRzeW1ib2woXCJ9XCIpO1xuXHRzeW1ib2woXCIsXCIpO1xuXG5cdGNvbnN0YW50KFwidHJ1ZVwiLCB0cnVlKTtcblx0Y29uc3RhbnQoXCJmYWxzZVwiLCBmYWxzZSk7XG5cdGNvbnN0YW50KFwibnVsbFwiLCBudWxsKTtcblx0Y29uc3RhbnQoXCJ1bmRlZmluZWRcIik7XG5cblx0Y29uc3RhbnQoXCJNYXRoXCIsIE1hdGgpO1xuXHRjb25zdGFudChcIkRhdGVcIiwgRGF0ZSk7XG5cdGZvcih2YXIgdiBpbiB2YXJzKSB7XG5cdFx0Y29uc3RhbnQodiwgdmFyc1t2XSk7XG5cdH1cblxuXHRzeW1ib2woXCIobGl0ZXJhbClcIikubnVkID0gaXRzZWxmO1xuXG5cdHN5bWJvbChcInRoaXNcIikubnVkID0gZnVuY3Rpb24gKCkge1xuXHQgIHRoaXMuYXJpdHkgPSBcInRoaXNcIjtcblx0ICByZXR1cm4gdGhpcztcblx0fTtcblxuXHQvL09wZXJhdG9yIFByZWNlZGVuY2U6XG5cdC8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvT3BlcmF0b3JzL09wZXJhdG9yX1ByZWNlZGVuY2VcblxuXHRpbmZpeChcIj9cIiwgMjAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCI6XCIpO1xuXHRcdHRoaXMudGhpcmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXhyKFwiJiZcIiwgMzEpO1xuXHRpbmZpeHIoXCJ8fFwiLCAzMCk7XG5cblx0aW5maXhyKFwiPT09XCIsIDQwKTtcblx0aW5maXhyKFwiIT09XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI9PVwiLCA0MCk7XG5cdGluZml4cihcIiE9XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI8XCIsIDQwKTtcblx0aW5maXhyKFwiPD1cIiwgNDApO1xuXHRpbmZpeHIoXCI+XCIsIDQwKTtcblx0aW5maXhyKFwiPj1cIiwgNDApO1xuXG5cdGluZml4KFwiaW5cIiwgNDUsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGlmIChjb250ZXh0ID09PSAncmVwZWF0Jykge1xuXHRcdFx0Ly8gYGluYCBhdCByZXBlYXQgYmxvY2tcblx0XHRcdGxlZnQuYXJpdHkgPSAnYXNzaWdubWVudCc7XG5cdFx0XHR0aGlzLmFzc2lnbm1lbnQgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIrXCIsIDUwKTtcblx0aW5maXgoXCItXCIsIDUwKTtcblxuXHRpbmZpeChcIipcIiwgNjApO1xuXHRpbmZpeChcIi9cIiwgNjApO1xuXHRpbmZpeChcIiVcIiwgNjApO1xuXG5cdGluZml4KFwiKFwiLCA3MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmIChsZWZ0LmlkID09PSBcIi5cIiB8fCBsZWZ0LmlkID09PSBcIltcIikge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidGVybmFyeVwiO1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQuZmlyc3Q7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGxlZnQuc2Vjb25kO1xuXHRcdFx0dGhpcy50aGlyZCA9IGE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGE7XG5cdFx0XHRpZiAoKGxlZnQuYXJpdHkgIT09IFwidW5hcnlcIiB8fCBsZWZ0LmlkICE9PSBcImZ1bmN0aW9uXCIpICYmXG5cdFx0XHRcdGxlZnQuYXJpdHkgIT09IFwibmFtZVwiICYmIGxlZnQuYXJpdHkgIT09IFwibGl0ZXJhbFwiICYmIGxlZnQuaWQgIT09IFwiKFwiICYmXG5cdFx0XHRcdGxlZnQuaWQgIT09IFwiJiZcIiAmJiBsZWZ0LmlkICE9PSBcInx8XCIgJiYgbGVmdC5pZCAhPT0gXCI/XCIpIHtcblx0XHRcdFx0ZXJyb3IoXCJFeHBlY3RlZCBhIHZhcmlhYmxlIG5hbWUuXCIsIGxlZnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodG9rZW4uaWQgIT09IFwiKVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigwKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIilcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiLlwiLCA4MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRpZiAodG9rZW4uYXJpdHkgIT09IFwibmFtZVwiKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgcHJvcGVydHkgbmFtZS5cIiwgdG9rZW4pO1xuXHRcdH1cblx0XHR0b2tlbi5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdHRoaXMuc2Vjb25kID0gdG9rZW47XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIltcIiwgODAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGFkdmFuY2UoXCJdXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHQvL2ZpbHRlclxuXHRpbmZpeChcInxcIiwgMTAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dmFyIGE7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dG9rZW4uYXJpdHkgPSAnZmlsdGVyJztcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMTApO1xuXHRcdHRoaXMuYXJpdHkgPSAnYmluYXJ5Jztcblx0XHRpZiAodG9rZW4uaWQgPT09ICc6Jykge1xuXHRcdFx0dGhpcy5hcml0eSA9ICd0ZXJuYXJ5Jztcblx0XHRcdHRoaXMudGhpcmQgPSBhID0gW107XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhZHZhbmNlKCc6Jyk7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIjpcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCIhXCIpO1xuXHRwcmVmaXgoXCItXCIpO1xuXHRwcmVmaXgoXCJ0eXBlb2ZcIik7XG5cblx0cHJlZml4KFwiKFwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGUgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiBlO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJbXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJdXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJ7XCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdLFx0biwgdjtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwifVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRuID0gdG9rZW47XG5cdFx0XHRcdGlmIChuLmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBuLmFyaXR5ICE9PSBcImxpdGVyYWxcIikge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIHByb3BlcnR5IG5hbWU6IFwiLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHRcdFx0diA9IGV4cHJlc3Npb24oMCk7XG5cdFx0XHRcdHYua2V5ID0gbi52YWx1ZTtcblx0XHRcdFx0YS5wdXNoKHYpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJ9XCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeCgnbmV3JywgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzkpO1xuXHRcdGlmKHRva2VuLmlkID09PSAnKCcpIHtcblx0XHRcdGFkdmFuY2UoXCIoXCIpO1xuXHRcdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHR9ZWxzZXtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuICAvL3ByZWZpeCgnLycsIGZ1bmN0aW9uKCkge1xuICAvLyAgdmFyIGEgPSBbXSwgbiwgdjtcbiAgLy8gIGlmKHRva2VuLmlkICE9PSAnLycpIHtcbiAgLy8gICAgd2hpbGUodHJ1ZSkge1xuICAvLyAgICAgIG4gPSB0b2tlbjtcbiAgLy8gICAgICBhZHZhbmNlKCk7XG4gIC8vICAgIH1cbiAgLy8gIH1cbiAgLy8gIGFkdmFuY2UoJy8nKTtcbiAgLy8gIHRoaXMuZmlyc3QgPSBhO1xuICAvLyAgcmV0dXJuIHRoaXM7XG4gIC8vfSlcblxuXHQvL19zb3VyY2U6IOihqOi+vuW8j+S7o+eggeWtl+espuS4slxuXHQvL19jb250ZXh0OiDooajovr7lvI/nmoTor63lj6Xnjq/looNcblx0cmV0dXJuIGZ1bmN0aW9uIChfc291cmNlLCBfY29udGV4dCkge1xuICAgIHNvdXJjZSA9IF9zb3VyY2U7XG5cdFx0dG9rZW5zID0gdG9rZW5pemUoX3NvdXJjZSwgJz08PiErLSomfC8lXicsICc9PD4mfCcpO1xuXHRcdHRva2VuX25yID0gMDtcblx0XHRjb250ZXh0ID0gX2NvbnRleHQ7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHZhciBzID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKGVuZClcIik7XG5cdFx0cmV0dXJuIHM7XG5cdH07XG59O1xuXG5leHBvcnRzLnBhcnNlID0gbWFrZV9wYXJzZSgpO1xuIiwidmFyIHRva2VuUmVnID0gL3t7KHsoW159XFxuXSspfXxbXn1cXG5dKyl9fS9nO1xuXG4vL+Wtl+espuS4suS4reaYr+WQpuWMheWQq+aooeadv+WNoOS9jeespuagh+iusFxuZnVuY3Rpb24gaGFzVG9rZW4oc3RyKSB7XG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIHJldHVybiBzdHIgJiYgdG9rZW5SZWcudGVzdChzdHIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRva2VuKHZhbHVlKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgdGV4dE1hcCA9IFtdXG4gICAgLCBzdGFydCA9IDBcbiAgICAsIHZhbCwgdG9rZW5cbiAgICA7XG4gIFxuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICBcbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cbiAgICBcbiAgICB0b2tlbiA9IHtcbiAgICAgIGVzY2FwZTogIXZhbFsyXVxuICAgICwgcGF0aDogKHZhbFsyXSB8fCB2YWxbMV0pLnRyaW0oKVxuICAgICwgcG9zaXRpb246IHRleHRNYXAubGVuZ3RoXG4gICAgLCB0ZXh0TWFwOiB0ZXh0TWFwXG4gICAgfTtcbiAgICBcbiAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcbiAgICBcbiAgICBzdGFydCA9IHRva2VuUmVnLmxhc3RJbmRleDtcbiAgfVxuICBcbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cbiAgXG4gIHRva2Vucy50ZXh0TWFwID0gdGV4dE1hcDtcbiAgXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydHMuaGFzVG9rZW4gPSBoYXNUb2tlbjtcblxuZXhwb3J0cy5wYXJzZVRva2VuID0gcGFyc2VUb2tlbjsiLCJcInVzZSBzdHJpY3RcIjtcblxuLy91dGlsc1xuLy8tLS1cblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnQ7XG5cbnZhciBrZXlQYXRoUmVnID0gLyg/OlxcLnxcXFspL2dcbiAgLCBicmEgPSAvXFxdL2dcbiAgO1xuXG4vL+WwhiBrZXlQYXRoIOi9rOS4uuaVsOe7hOW9ouW8j1xuLy9wYXRoLmtleSwgcGF0aFtrZXldIC0tPiBbJ3BhdGgnLCAna2V5J11cbmZ1bmN0aW9uIHBhcnNlS2V5UGF0aChrZXlQYXRoKXtcbiAgcmV0dXJuIGtleVBhdGgucmVwbGFjZShicmEsICcnKS5zcGxpdChrZXlQYXRoUmVnKTtcbn1cblxuLyoqXG4gKiDlkIjlubblr7nosaFcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2RlZXA9ZmFsc2VdIOaYr+WQpua3seW6puWQiOW5tlxuICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0Li4uXSDmnaXmupDlr7nosaFcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSDlkIjlubblkI7nmoQgdGFyZ2V0IOWvueixoVxuICovXG5mdW5jdGlvbiBleHRlbmQoLyogZGVlcCwgdGFyZ2V0LCBvYmplY3QuLi4gKi8pIHtcbiAgdmFyIG9wdGlvbnNcbiAgICAsIG5hbWUsIHNyYywgY29weSwgY29weUlzQXJyYXksIGNsb25lXG4gICAgLCB0YXJnZXQgPSBhcmd1bWVudHNbMF0gfHwge31cbiAgICAsIGkgPSAxXG4gICAgLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoXG4gICAgLCBkZWVwID0gZmFsc2VcbiAgICA7XG5cbiAgLy8gSGFuZGxlIGEgZGVlcCBjb3B5IHNpdHVhdGlvblxuICBpZiAodHlwZW9mIHRhcmdldCA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBkZWVwID0gdGFyZ2V0O1xuXG4gICAgLy8gc2tpcCB0aGUgYm9vbGVhbiBhbmQgdGhlIHRhcmdldFxuICAgIHRhcmdldCA9IGFyZ3VtZW50c1sgaSBdIHx8IHt9O1xuICAgIGkrKztcbiAgfVxuXG4gIGlmKHV0aWxzLmlzRnVuY3Rpb24oYXJndW1lbnRzW2xlbmd0aCAtIDFdKSkge1xuICAgIGxlbmd0aC0tO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2Ugd2hlbiB0YXJnZXQgaXMgYSBzdHJpbmcgb3Igc29tZXRoaW5nIChwb3NzaWJsZSBpbiBkZWVwIGNvcHkpXG4gIGlmICh0eXBlb2YgdGFyZ2V0ICE9PSBcIm9iamVjdFwiICYmICF1dGlscy5pc0Z1bmN0aW9uKHRhcmdldCkpIHtcbiAgICB0YXJnZXQgPSB7fTtcbiAgfVxuXG4gIGZvciAoIDsgaSA8IGxlbmd0aDsgaSsrICkge1xuICAgIC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICBpZiAoIChvcHRpb25zID0gYXJndW1lbnRzWyBpIF0pICE9IG51bGwgKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG4gICAgICBmb3IgKCBuYW1lIGluIG9wdGlvbnMgKSB7XG4gICAgICAgIC8vYW5kcm9pZCAyLjMgYnJvd3NlciBjYW4gZW51bSB0aGUgcHJvdG90eXBlIG9mIGNvbnN0cnVjdG9yLi4uXG4gICAgICAgIGlmKG9wdGlvbnMuaGFzT3duUHJvcGVydHkobmFtZSkgJiYgbmFtZSAhPT0gJ3Byb3RvdHlwZScpe1xuICAgICAgICAgIHNyYyA9IHRhcmdldFsgbmFtZSBdO1xuICAgICAgICAgIGNvcHkgPSBvcHRpb25zWyBuYW1lIF07XG5cblxuICAgICAgICAgIC8vIFJlY3Vyc2UgaWYgd2UncmUgbWVyZ2luZyBwbGFpbiBvYmplY3RzIG9yIGFycmF5c1xuICAgICAgICAgIGlmICggZGVlcCAmJiBjb3B5ICYmICggdXRpbHMuaXNQbGFpbk9iamVjdChjb3B5KSB8fCAoY29weUlzQXJyYXkgPSB1dGlscy5pc0FycmF5KGNvcHkpKSApICkge1xuXG4gICAgICAgICAgICAvLyBQcmV2ZW50IG5ldmVyLWVuZGluZyBsb29wXG4gICAgICAgICAgICBpZiAoIHRhcmdldCA9PT0gY29weSApIHtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIGNvcHlJc0FycmF5ICkge1xuICAgICAgICAgICAgICBjb3B5SXNBcnJheSA9IGZhbHNlO1xuICAgICAgICAgICAgICBjbG9uZSA9IHNyYyAmJiB1dGlscy5pc0FycmF5KHNyYykgPyBzcmMgOiBbXTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNQbGFpbk9iamVjdChzcmMpID8gc3JjIDoge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5ldmVyIG1vdmUgb3JpZ2luYWwgb2JqZWN0cywgY2xvbmUgdGhlbVxuICAgICAgICAgICAgdGFyZ2V0WyBuYW1lIF0gPSBleHRlbmQoIGRlZXAsIGNsb25lLCBjb3B5KTtcblxuICAgICAgICAgICAgLy8gRG9uJ3QgYnJpbmcgaW4gdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSBpZiAoICF1dGlscy5pc1VuZGVmaW5lZChjb3B5KSApIHtcbiAgICAgICAgICAgIHRhcmdldFsgbmFtZSBdID0gY29weTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIG1vZGlmaWVkIG9iamVjdFxuICByZXR1cm4gdGFyZ2V0O1xufVxuXG52YXIgY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAobykge1xuICBmdW5jdGlvbiBGKCkge31cbiAgRi5wcm90b3R5cGUgPSBvO1xuICByZXR1cm4gbmV3IEYoKTtcbn07XG5cblxudmFyIHV0aWxzID0ge1xuICBub29wOiBmdW5jdGlvbiAoKXt9XG4sIGllOiAhIWRvYy5hdHRhY2hFdmVudFxuXG4sIGlzT2JqZWN0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbCAhPT0gbnVsbDtcbiAgfVxuXG4sIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiwgaXNGdW5jdGlvbjogZnVuY3Rpb24gKHZhbCl7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG4gIH1cblxuLCBpc0FycmF5OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYodXRpbHMuaWUpe1xuICAgICAgLy9JRSA5IOWPiuS7peS4iyBJRSDot6jnqpflj6Pmo4DmtYvmlbDnu4RcbiAgICAgIHJldHVybiB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yICsgJycgPT09IEFycmF5ICsgJyc7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpO1xuICAgIH1cbiAgfVxuXG4gIC8v566A5Y2V5a+56LGh55qE566A5piT5Yik5patXG4sIGlzUGxhaW5PYmplY3Q6IGZ1bmN0aW9uIChvKXtcbiAgICBpZiAoIW8gfHwgKHt9KS50b1N0cmluZy5jYWxsKG8pICE9PSAnW29iamVjdCBPYmplY3RdJyB8fCBvLm5vZGVUeXBlIHx8IG8gPT09IG8ud2luZG93KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvL+WHveaVsOWIh+mdoi4gb3JpRm4g5Y6f5aeL5Ye95pWwLCBmbiDliIfpnaLooaXlhYXlh73mlbBcbiAgLy/liY3pnaLnmoTlh73mlbDov5Tlm57lgLzkvKDlhaUgYnJlYWtDaGVjayDliKTmlq0sIGJyZWFrQ2hlY2sg6L+U5Zue5YC85Li655yf5pe25LiN5omn6KGM5YiH6Z2i6KGl5YWF55qE5Ye95pWwXG4sIGJlZm9yZUZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuLCBhZnRlckZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfVxuXG4sIHBhcnNlS2V5UGF0aDogcGFyc2VLZXlQYXRoXG5cbiwgZGVlcFNldDogZnVuY3Rpb24gKGtleVN0ciwgdmFsdWUsIG9iaikge1xuICAgIGlmKGtleVN0cil7XG4gICAgICB2YXIgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKVxuICAgICAgICAsIGN1ciA9IG9ialxuICAgICAgICA7XG4gICAgICBjaGFpbi5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgaSkge1xuICAgICAgICBpZihpID09PSBjaGFpbi5sZW5ndGggLSAxKXtcbiAgICAgICAgICBjdXJba2V5XSA9IHZhbHVlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBpZihjdXIgJiYgY3VyLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBjdXJba2V5XSA9IHt9O1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIGV4dGVuZChvYmosIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuLCBkZWVwR2V0OiBmdW5jdGlvbiAoa2V5U3RyLCBvYmopIHtcbiAgICB2YXIgY2hhaW4sIGN1ciA9IG9iaiwga2V5O1xuICAgIGlmKGtleVN0cil7XG4gICAgICBjaGFpbiA9IHBhcnNlS2V5UGF0aChrZXlTdHIpO1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGNoYWluLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBrZXkgPSBjaGFpbltpXTtcbiAgICAgICAgaWYoY3VyICYmIGN1ci5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjdXI7XG4gIH1cbiwgY2xvbmU6IGZ1bmN0aW9uIGNsb25lIChvYmopIHtcblx0XHRpZihvYmogPT0gbnVsbCB8fCB0eXBlb2Yob2JqKSAhPSAnb2JqZWN0Jyl7IHJldHVybiBvYmogfVxuXHRcdHZhciB0ZW1wID0gbmV3IG9iai5jb25zdHJ1Y3RvcigpO1xuXHRcdGZvcih2YXIga2V5IGluIG9iail7IHRlbXBba2V5XSA9IGNsb25lKG9ialtrZXldKSB9XG5cdFx0cmV0dXJuIHRlbXA7XG5cdH1cbiwgZXh0ZW5kOiBleHRlbmRcbiwgY3JlYXRlOiBjcmVhdGVcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbHM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZS5qcycpLnBhcnNlXG4gICwgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgQ2xhc3MgPSByZXF1aXJlKCcuL2NsYXNzLmpzJylcbiAgO1xuXG52YXIgZXh0ZW5kID0gdXRpbHMuZXh0ZW5kO1xuXG4vL+ihqOi+vuW8j+ino+aekFxuZnVuY3Rpb24gZXhQYXJzZShwYXRoKSB7XG4gIHZhciBhc3QgPSB7fVxuICAgICwgc3VtbWFyeVxuICAgIDtcblxuICB0cnl7XG4gICAgYXN0ID0gcGFyc2UocGF0aCwgdGhpcy5kaXIudHlwZSk7XG4gIH1jYXRjaChlKSB7XG4gICAgZS5tZXNzYWdlID0gJ1N5bnRheEVycm9yIGluIFwiJyArIHBhdGggKyAnXCIgfCAnICsgZS5tZXNzYWdlO1xuICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gIH1cblxuICBzdW1tYXJ5ID0gZXZhbHVhdGUuc3VtbWFyeShhc3QpO1xuICBleHRlbmQodGhpcy5kaXIsIHN1bW1hcnkpO1xuICBleHRlbmQodGhpcywgc3VtbWFyeSk7XG4gIHRoaXMuYXN0ID0gYXN0O1xufTtcblxuZnVuY3Rpb24gV2F0Y2hlcih2bSwgZGlyKSB7XG4gIHZhciBwYXRoLCBzY29wZSA9IHZtLCBjdXJWbSwgbG9jYWxLZXksIHdpbGxVcGRhdGUsIGFzcywgcGF0aHM7XG5cbiAgdGhpcy5kaXIgPSBkaXI7XG4gIHRoaXMudm0gPSB2bTtcblxuICB0aGlzLnZhbCA9IE5hTjtcblxuICB0aGlzLnN0YXRlID0gV2F0Y2hlci5TVEFURV9SRUFEWTtcblxuICBleFBhcnNlLmNhbGwodGhpcywgZGlyLnBhdGgpO1xuXG4gIGZvcih2YXIgaSA9IDAsIGwgPSB0aGlzLnBhdGhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKHRoaXMucGF0aHNbaV0pO1xuICAgIGxvY2FsS2V5ID0gcGF0aHNbMF07XG5cbiAgICB3aGlsZShzY29wZSkge1xuICAgICAgY3VyVm0gPSBzY29wZTtcbiAgICAgIGFzcyA9IHNjb3BlLl9hc3NpZ25tZW50cztcblxuICAgICAgaWYoYXNzICYmIGFzcy5sZW5ndGgpIHtcbiAgICAgICAgLy/lhbflkI0gcmVwZWF0XG4gICAgICAgIGlmKGFzc1swXSA9PT0gbG9jYWxLZXkpIHtcbiAgICAgICAgICBpZihwYXRocy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgcGF0aHNbMF0gPSAnJGRhdGEnO1xuICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcGF0aHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1lbHNlIGlmKGxvY2FsS2V5IGluIHNjb3BlKXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8v5ZCR5LiK5p+l5om+XG4gICAgICBzY29wZSA9IHNjb3BlLiRwYXJlbnQ7XG4gICAgfVxuICAgIHBhdGggPSBwYXRocy5qb2luKCcuJyk7XG4gICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdID0gY3VyVm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdO1xuICAgIGN1clZtLl93YXRjaGVyc1twYXRoXS5wdXNoKHRoaXMpO1xuICB9XG5cbiAgLy/msqHmnInlj5jph48gLyDlj5jph4/kuI3lnKjlvZPliY3kvZznlKjln5/nmoTooajovr7lvI/nq4vljbPmsYLlgLxcbiAgZm9yKHZhciBpID0gMCwgbCA9IHRoaXMubG9jYWxzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGlmKHV0aWxzLmlzT2JqZWN0KHRoaXMudm0uJGRhdGEpICYmICh0aGlzLmxvY2Fsc1tpXSBpbiB0aGlzLnZtLiRkYXRhKSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmKGkgPT0gbCkge1xuICAgIHdpbGxVcGRhdGUgPSB0cnVlO1xuICB9XG5cbiAgaWYod2lsbFVwZGF0ZSB8fCB0aGlzLnZtLl9pc1JlbmRlcmVkKSB7XG4gICAgdGhpcy51cGRhdGUoKTtcbiAgfVxufVxuXG4vL1RPRE9cbmV4dGVuZChXYXRjaGVyLCB7XG4gIFNUQVRFX1JFQURZOiAwXG4sIFNUQVRFX0NBTExFRDogMVxufSwgQ2xhc3MpO1xuXG5mdW5jdGlvbiB3YXRjaGVyVXBkYXRlICh2YWwpIHtcbiAgdHJ5e1xuICAgIHRoaXMuZGlyLnVwZGF0ZSh2YWwsIHRoaXMudmFsKTtcbiAgICB0aGlzLnZhbCA9IHZhbDtcbiAgfWNhdGNoKGUpe1xuICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gIH1cbn1cblxuZXh0ZW5kKFdhdGNoZXIucHJvdG90eXBlLCB7XG4gIC8v6KGo6L6+5byP5omn6KGMXG4gIHVwZGF0ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAsIG5ld1ZhbFxuICAgICAgO1xuXG4gICAgbmV3VmFsID0gdGhpcy5nZXRWYWx1ZSh0aGlzLnZtKTtcblxuICAgIGlmKG5ld1ZhbCAmJiBuZXdWYWwudGhlbikge1xuICAgICAgLy9hIHByb21pc2VcbiAgICAgIG5ld1ZhbC50aGVuKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB3YXRjaGVyVXBkYXRlLmNhbGwodGhhdCwgdmFsKTtcbiAgICAgIH0pO1xuICAgIH1lbHNle1xuICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoaXMsIG5ld1ZhbCk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZSA9IFdhdGNoZXIuU1RBVEVfQ0FMTEVEO1xuICB9XG4sIGdldFZhbHVlOiBmdW5jdGlvbihzY29wZSkge1xuICAgIHZhciB2YWw7XG5cbiAgICB0cnl7XG4gICAgICB2YWwgPSBldmFsdWF0ZS5ldmFsKHRoaXMuYXN0LCBzY29wZSwgdGhpcy5kaXIpO1xuICAgIH1jYXRjaChlKXtcbiAgICAgIHZhbCA9ICcnO1xuICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICB9XG4gICAgaWYodXRpbHMuaXNVbmRlZmluZWQodmFsKSB8fCB2YWwgPT09IG51bGwpIHtcbiAgICAgIHZhbCA9ICcnO1xuICAgIH1cbiAgICByZXR1cm4gdmFsO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyIl19
