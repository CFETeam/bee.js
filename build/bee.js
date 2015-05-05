(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Bee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var env = require('./env.js')
  , doc = env.document
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
  , _isRendered: false
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

  this.$el.bee = this;

  walk.call(this, this.$el);

  this.$render(this.$data || {});
  this._isRendered = true;
  this.$init();
}

//静态属性
extend(Bee, Class, Dir, Com, {
  setPrefix: setPrefix
, prefix: ''
, doc: doc
, directives: {}
, components: {}
, mount: function(id, props) {
    var el = doc.getElementById(id);
    var Comp = this.components[el.tagName.toLowerCase()];
    var instance
    if(Comp) {
      instance = new Comp(extend({$target: el}, props))
    }else{
      instance = null;
    }
    return instance
  }
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
, $init: utils.noop
  /**
   * 获取属性/方法
   * @param {String} keyPath 路径
   * @param {Boolean} [strict=false] 是否严格在自身中查找.
   * @return {*}
   */
, $get: function(keyPath, strict) {
    strict = strict === true;

    var scope = this
      , path = keyPath
      , paths, headPath
      ;

    if(!strict) {
      if(this.$parent) {
        paths = parseKeyPath(path);
        headPath = paths[0]
        if(scope._assignments && scope._assignments.length) {
          // 具名 repeat 不会直接查找自身作用域
          if(headPath === this._assignments[0]) {
            scope = {};
            scope[headPath] = this;
          }else{
            return this.$parent.$get(keyPath, strict)
          }
        }else{
          //匿名 repeat
          return (headPath in this) ? this.$get(keyPath) : this.$parent.$get(keyPath, strict)
        }
      }
    }

    return deepGet(path, scope);
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
      Object.keys(this.$data).forEach(function(key) {
        delete this[key];
      }.bind(this))
      this.$data = key;
      extend(this, key);
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

    //更新数组长度
    if(utils.isArray(attrs)) {
      this.$update(keyPath + '.length', false);
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
 * @return {Function} 自定义组件的构造函数
 */
function tag(tagName, Component, statics) {
  var tags = this.components = this.components || {};

  this.doc.createElement(tagName);//for old IE

  if(utils.isObject(Component)) {
    Component = this.extend(Component, statics);
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
      Comp = components[comName];

      if(Comp === vm.constructor) {
        return;
      }

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
                $data = Object(val)
              }else {
                $data[pathConfig.componentPath] = val;
              }
            }
          })
        });
      });

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
    var paths = utils.parseKeyPath(keyPath);
    var headPath = paths[0];

    if(!keyPath) { return false; }

    //TODO 实现类似 .$get 的 .$set
    if(vm.$parent) {
      if (vm._assignments && vm._assignments[0] === headPath) {
        keyPath = paths.slice(1).join('.') || '$data';
      }else{
        vm = vm.$parent;
      }
    }

    var el = this.el
      , ev = 'change'
      , attr, value = attr = 'value'
      , ant = vm
      //, cur = vm.$getVM(keyPath, {assignment: this.assignment})
      , isSetDefaut = utils.isUndefined(ant.$get(keyPath, false))//界面的初始值不会覆盖 model 的初始值
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

//这些数组操作方法被重写成自动触发更新
var arrayMethods = ['splice', 'push', 'pop', 'shift', 'unshift', 'sort', 'reverse'];

module.exports = {
  priority: 1000
, anchor: true
, terminal: true
, link: function(vm) {
    var cstr = this.cstr = vm.constructor;
    this.vm = vm;

    while(cstr.__super__){
      cstr = this.cstr = cstr.__super__.constructor;
    }


    this.curArr = [];
    this.list = [];//[{el:el, vm: vm}]

    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    var that = this;

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

          vm = new this.cstr(el, {$data: item, $parent: this.vm, _assignments: this.assignments, $index: pos});
          parentNode.insertBefore(vm.$el, this.list[pos] && this.list[pos].el || this.anchors.end)
          this.list.splice(pos, 0, {el: el, vm: vm});
          curArr.splice(pos, 0, item)

          //延时赋值给 `_relativePath`, 避免出现死循环
          //如果在上面实例化时当参数传入, 会冒泡到父级 vm 递归调用这里的 update 方法, 造成死循环.
          vm._relativePath = this.listPath;
        }else {

          //调序
          if (pos !== oldPos) {
            parentNode.insertBefore(this.list[oldPos].el, this.list[pos] && this.list[pos].el || this.anchor.end)
            parentNode.insertBefore(this.list[pos].el, this.list[oldPos + 1] && this.list[oldPos + 1].el || this.anchor.end)
            this.list[oldPos] = [this.list[pos], this.list[pos] = this.list[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
            this.list[pos].vm.$index = pos
            this.list[pos].vm.$update('$index')
          }
        }
      }.bind(this))

      //更新索引
      this.list.forEach(function(item, i) {
        item.vm.$index = i
        item.vm.$update('$index', false)
      });

      //数组操作方法
      utils.extend(items, {
        $set: function(i, item) {
          that.list[i].vm.$set(item);
        },
        $replace: function(i, item) {
          that.list[i].vm.$replace(item)
        },
        $remove: function(i) {
          items.splice(i, 1);
          that.listPath.forEach(function(path) {
            that.vm.$update(path)
          });
        }
      });
      arrayMethods.forEach(function(method) {
        items[method] = utils.afterFn(items[method], function() {
          that.listPath.forEach(function(path) {
            that.vm.$update(path)
          })
        })
      })
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
  if(scope.$get) {
    return scope.$get(key, false)
  }else{
    return scope[key]
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
        if(cur){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY29tcG9uZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvaW5kZXguanMiLCJzcmMvZGlyZWN0aXZlcy9tb2RlbC5qcyIsInNyYy9kaXJlY3RpdmVzL29uLmpzIiwic3JjL2RpcmVjdGl2ZXMvcmVwZWF0LmpzIiwic3JjL2RpcmVjdGl2ZXMvc3R5bGUuanMiLCJzcmMvZW52LmpzIiwic3JjL2V2YWwuanMiLCJzcmMvZXZlbnQtYmluZC5qcyIsInNyYy9ldmVudC5qcyIsInNyYy9wYXJzZS5qcyIsInNyYy90b2tlbi5qcyIsInNyYy91dGlscy5qcyIsInNyYy93YXRjaGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0b0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBlbnYgPSByZXF1aXJlKCcuL2Vudi5qcycpXG4gICwgZG9jID0gZW52LmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBFdmVudCA9IHJlcXVpcmUoJy4vZXZlbnQuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgRGlyID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi90b2tlbi5qcycpXG4gIDtcblxuXG52YXIgaXNPYmplY3QgPSB1dGlscy5pc09iamVjdFxuICAsIGlzVW5kZWZpbmVkID0gdXRpbHMuaXNVbmRlZmluZWRcbiAgLCBpc0Z1bmN0aW9uID0gdXRpbHMuaXNGdW5jdGlvblxuICAsIGlzUGxhaW5PYmplY3QgPSB1dGlscy5pc1BsYWluT2JqZWN0XG4gICwgcGFyc2VLZXlQYXRoID0gdXRpbHMucGFyc2VLZXlQYXRoXG4gICwgZGVlcFNldCA9IHV0aWxzLmRlZXBTZXRcbiAgLCBkZWVwR2V0ID0gdXRpbHMuZGVlcEdldFxuICAsIGV4dGVuZCA9IHV0aWxzLmV4dGVuZFxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cblxudmFyIE5PREVUWVBFID0ge1xuICAgIEVMRU1FTlQ6IDFcbiAgLCBBVFRSOiAyXG4gICwgVEVYVDogM1xuICAsIENPTU1FTlQ6IDhcbiAgLCBGUkFHTUVOVDogMTFcbn07XG5cbi8v6K6+572uIGRpcmVjdGl2ZSDliY3nvIBcbmZ1bmN0aW9uIHNldFByZWZpeChuZXdQcmVmaXgpIHtcbiAgaWYobmV3UHJlZml4KXtcbiAgICB0aGlzLnByZWZpeCA9IG5ld1ByZWZpeDtcbiAgfVxufVxuXG4vKipcbiAqIOaehOmAoOWHveaVsFxuICogLS0tXG4gKiBAcGFyYW0ge1N0cmluZ3xFbGVtZW50fSBbdHBsXSDmqKHmnb8uIOetieWQjOS6jiBwcm9wcy4kdHBsXG4gKiBAcGFyYW0ge09iamVjdH0gW3Byb3BzXSDlsZ7mgKcv5pa55rOVXG4gKiovXG5mdW5jdGlvbiBCZWUodHBsLCBwcm9wcykge1xuICBpZihpc1BsYWluT2JqZWN0KHRwbCkpIHtcbiAgICBwcm9wcyA9IHRwbDtcbiAgICB0cGwgPSBwcm9wcy4kdHBsO1xuICB9XG4gIHByb3BzID0gcHJvcHMgfHwge307XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIC8vJCDlvIDlpLTnmoTmmK/lhbHmnInlsZ7mgKcv5pa55rOVXG4gICAgJGRhdGE6IHRoaXMuJGRhdGEgfHwge31cbiAgLCAkZWw6IHRoaXMuJGVsIHx8IG51bGxcbiAgLCAkdGFyZ2V0OiB0aGlzLiR0YXJnZXQgfHwgbnVsbFxuICAsICR0cGw6IHRoaXMuJHRwbCB8fCAnJ1xuICAsICRjaGlsZHJlbjogbnVsbFxuICAsICRmaWx0ZXJzOiB0aGlzLiRmaWx0ZXJzIHx8IHt9XG4gICwgJHBhcmVudDogbnVsbFxuXG4gICAgLy/np4HmnInlsZ7mgKcv5pa55rOVXG4gICwgX3dhdGNoZXJzOiB0aGlzLl93YXRjaGVycyB8fCB7fVxuICAsIF9hc3NpZ25tZW50czogbnVsbC8v5b2T5YmNIHZtIOeahOWIq+WQjVxuICAsIF9yZWxhdGl2ZVBhdGg6IFtdXG4gICwgX2lzUmVuZGVyZWQ6IGZhbHNlXG4gIH07XG5cbiAgdmFyIGVsO1xuXG4gIC8v5ZCI5bm25omA5pyJ5Yiw5b2T5YmN56m66Ze05LiLXG4gIGV4dGVuZCh0aGlzLCBkZWZhdWx0cywgcHJvcHMpO1xuICBleHRlbmQodGhpcywgdGhpcy4kZGF0YSk7XG5cbiAgdHBsID0gdHBsIHx8IHRoaXMuJHRwbDtcbiAgZWwgPSB0cGxQYXJzZSh0cGwsIHRoaXMuJHRhcmdldCk7XG5cbiAgaWYodGhpcy4kZWwpe1xuICAgIHRoaXMuJGVsLmFwcGVuZENoaWxkKGVsLmVsKTtcbiAgfWVsc2V7XG4gICAgdGhpcy4kZWwgPSBlbC5lbDtcbiAgfVxuICB0aGlzLiR0cGwgPSBlbC50cGw7XG4gIHRoaXMuJGNoaWxkcmVuID0gZWwuY2hpbGRyZW47XG5cbiAgdGhpcy4kZWwuYmVlID0gdGhpcztcblxuICB3YWxrLmNhbGwodGhpcywgdGhpcy4kZWwpO1xuXG4gIHRoaXMuJHJlbmRlcih0aGlzLiRkYXRhIHx8IHt9KTtcbiAgdGhpcy5faXNSZW5kZXJlZCA9IHRydWU7XG4gIHRoaXMuJGluaXQoKTtcbn1cblxuLy/pnZnmgIHlsZ7mgKdcbmV4dGVuZChCZWUsIENsYXNzLCBEaXIsIENvbSwge1xuICBzZXRQcmVmaXg6IHNldFByZWZpeFxuLCBwcmVmaXg6ICcnXG4sIGRvYzogZG9jXG4sIGRpcmVjdGl2ZXM6IHt9XG4sIGNvbXBvbmVudHM6IHt9XG4sIG1vdW50OiBmdW5jdGlvbihpZCwgcHJvcHMpIHtcbiAgICB2YXIgZWwgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBDb21wID0gdGhpcy5jb21wb25lbnRzW2VsLnRhZ05hbWUudG9Mb3dlckNhc2UoKV07XG4gICAgdmFyIGluc3RhbmNlXG4gICAgaWYoQ29tcCkge1xuICAgICAgaW5zdGFuY2UgPSBuZXcgQ29tcChleHRlbmQoeyR0YXJnZXQ6IGVsfSwgcHJvcHMpKVxuICAgIH1lbHNle1xuICAgICAgaW5zdGFuY2UgPSBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gaW5zdGFuY2VcbiAgfVxufSk7XG5cblxuQmVlLnNldFByZWZpeCgnYS0nKTtcblxuLy/lhoXnva4gZGlyZWN0aXZlXG5mb3IodmFyIGRpciBpbiBkaXJzKSB7XG4gIEJlZS5kaXJlY3RpdmUoZGlyLCBkaXJzW2Rpcl0pO1xufVxuXG4vL+WunuS+i+aWueazlVxuLy8tLS0tXG5leHRlbmQoQmVlLnByb3RvdHlwZSwgRXZlbnQsIHtcbiAgLyoqXG4gICAqICMjIyBhbnQucmVuZGVyXG4gICAqIOa4suafk+aooeadv1xuICAgKi9cbiAgJHJlbmRlcjogZnVuY3Rpb24oZGF0YSkge1xuICAgIGRhdGEgPSBkYXRhIHx8IHRoaXMuJGRhdGE7XG4gICAgdGhpcy4kcmVwbGFjZShkYXRhKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuLCAkaW5pdDogdXRpbHMubm9vcFxuICAvKipcbiAgICog6I635Y+W5bGe5oCnL+aWueazlVxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDot6/lvoRcbiAgICogQHBhcmFtIHtCb29sZWFufSBbc3RyaWN0PWZhbHNlXSDmmK/lkKbkuKXmoLzlnKjoh6rouqvkuK3mn6Xmib4uXG4gICAqIEByZXR1cm4geyp9XG4gICAqL1xuLCAkZ2V0OiBmdW5jdGlvbihrZXlQYXRoLCBzdHJpY3QpIHtcbiAgICBzdHJpY3QgPSBzdHJpY3QgPT09IHRydWU7XG5cbiAgICB2YXIgc2NvcGUgPSB0aGlzXG4gICAgICAsIHBhdGggPSBrZXlQYXRoXG4gICAgICAsIHBhdGhzLCBoZWFkUGF0aFxuICAgICAgO1xuXG4gICAgaWYoIXN0cmljdCkge1xuICAgICAgaWYodGhpcy4kcGFyZW50KSB7XG4gICAgICAgIHBhdGhzID0gcGFyc2VLZXlQYXRoKHBhdGgpO1xuICAgICAgICBoZWFkUGF0aCA9IHBhdGhzWzBdXG4gICAgICAgIGlmKHNjb3BlLl9hc3NpZ25tZW50cyAmJiBzY29wZS5fYXNzaWdubWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgLy8g5YW35ZCNIHJlcGVhdCDkuI3kvJrnm7TmjqXmn6Xmib7oh6rouqvkvZznlKjln59cbiAgICAgICAgICBpZihoZWFkUGF0aCA9PT0gdGhpcy5fYXNzaWdubWVudHNbMF0pIHtcbiAgICAgICAgICAgIHNjb3BlID0ge307XG4gICAgICAgICAgICBzY29wZVtoZWFkUGF0aF0gPSB0aGlzO1xuICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHBhcmVudC4kZ2V0KGtleVBhdGgsIHN0cmljdClcbiAgICAgICAgICB9XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIC8v5Yy/5ZCNIHJlcGVhdFxuICAgICAgICAgIHJldHVybiAoaGVhZFBhdGggaW4gdGhpcykgPyB0aGlzLiRnZXQoa2V5UGF0aCkgOiB0aGlzLiRwYXJlbnQuJGdldChrZXlQYXRoLCBzdHJpY3QpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGVlcEdldChwYXRoLCBzY29wZSk7XG4gIH1cblxuICAvKipcbiAgICogIyMjIGJlZS4kc2V0XG4gICAqIOabtOaWsOWQiOW5tiBgLmRhdGFgIOS4reeahOaVsOaNri4g5aaC5p6c5Y+q5pyJ5LiA5Liq5Y+C5pWwLCDpgqPkuYjov5nkuKrlj4LmlbDlsIblubblhaUgLiRkYXRhXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBba2V5XSDmlbDmja7ot6/lvoQuXG4gICAqIEBwYXJhbSB7QW55VHlwZXxPYmplY3R9IHZhbCDmlbDmja7lhoXlrrkuXG4gICAqL1xuLCAkc2V0OiBmdW5jdGlvbihrZXksIHZhbCkge1xuICAgIHZhciBhZGQsIGtleXMsIGhhc0tleSA9IGZhbHNlO1xuICAgIGlmKGlzVW5kZWZpbmVkKGtleSkpeyByZXR1cm4gdGhpczsgfVxuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICBleHRlbmQodHJ1ZSwgdGhpcy4kZGF0YSwga2V5KTtcbiAgICAgIGV4dGVuZCh0cnVlLCB0aGlzLCBrZXkpO1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5KTtcbiAgICAgIGFkZCA9IGRlZXBTZXQoa2V5LCB2YWwsIHt9KTtcbiAgICAgIGtleXNbMF0gIT09ICckZGF0YScgJiYgZXh0ZW5kKHRydWUsIHRoaXMuJGRhdGEsIGFkZCk7XG4gICAgICBleHRlbmQodHJ1ZSwgdGhpcywgYWRkKTtcbiAgICB9XG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwodGhpcywga2V5LCB2YWwpIDogdXBkYXRlLmNhbGwodGhpcywga2V5KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICAvKipcbiAgICog5pWw5o2u5pu/5o2iXG4gICAqL1xuLCAkcmVwbGFjZTogZnVuY3Rpb24gKGtleSwgdmFsKSB7XG4gICAgdmFyIGtleXMsIGhhc0tleSA9IGZhbHNlO1xuXG4gICAgaWYoaXNVbmRlZmluZWQoa2V5KSl7IHJldHVybiB0aGlzOyB9XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIE9iamVjdC5rZXlzKHRoaXMuJGRhdGEpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzW2tleV07XG4gICAgICB9LmJpbmQodGhpcykpXG4gICAgICB0aGlzLiRkYXRhID0ga2V5O1xuICAgICAgZXh0ZW5kKHRoaXMsIGtleSk7XG4gICAgfWVsc2V7XG4gICAgICBoYXNLZXkgPSB0cnVlO1xuICAgICAga2V5cyA9IHBhcnNlS2V5UGF0aChrZXkpO1xuICAgICAgaWYoa2V5c1swXSAhPT0gJ2RhdGEnKSB7XG4gICAgICAgIGRlZXBTZXQoa2V5LCBudWxsLCB0aGlzLiRkYXRhKTtcbiAgICAgICAgZGVlcFNldChrZXksIHZhbCwgdGhpcy4kZGF0YSk7XG4gICAgICB9XG4gICAgICBkZWVwU2V0KGtleSwgbnVsbCwgdGhpcyk7XG4gICAgICBkZWVwU2V0KGtleSwgdmFsLCB0aGlzKTtcbiAgICB9XG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwodGhpcywga2V5LCB2YWwpIDogdXBkYXRlLmNhbGwodGhpcywga2V5KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICAvKipcbiAgICog5omL5Yqo5pu05paw5p+Q6YOo5YiG5pWw5o2uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrZXlQYXRoIOaMh+WumuabtOaWsOaVsOaNrueahCBrZXlQYXRoXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2lzQnViYmxlPXRydWVdIOaYr+WQpuabtOaWsCBrZXlQYXRoIOeahOeItue6p1xuICAgKi9cbiwgJHVwZGF0ZTogZnVuY3Rpb24gKGtleVBhdGgsIGlzQnViYmxlKSB7XG4gICAgaXNCdWJibGUgPSBpc0J1YmJsZSAhPT0gZmFsc2U7XG5cbiAgICB2YXIga2V5cyA9IHBhcnNlS2V5UGF0aChrZXlQYXRoKSwga2V5LCBhdHRycztcbiAgICB2YXIgd2F0Y2hlcnM7XG5cbiAgICB3aGlsZShrZXkgPSBrZXlzLmpvaW4oJy4nKSkge1xuICAgICAgd2F0Y2hlcnMgPSB0aGlzLl93YXRjaGVyc1trZXldO1xuXG4gICAgICBpZiAod2F0Y2hlcnMpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSB3YXRjaGVycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICB3YXRjaGVyc1tpXS51cGRhdGUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZihpc0J1YmJsZSkge1xuICAgICAgICBrZXlzLnBvcCgpO1xuICAgICAgICAvL+acgOe7iOmDveWGkuazoeWIsCAkZGF0YVxuICAgICAgICBpZigha2V5cy5sZW5ndGggJiYga2V5ICE9PSAnJGRhdGEnKXtcbiAgICAgICAgICBrZXlzLnB1c2goJyRkYXRhJyk7XG4gICAgICAgIH1cbiAgICAgIH1lbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgYXR0cnMgPSB0aGlzLiRnZXQoa2V5UGF0aCk7XG5cbiAgICAvL+WQjOaXtuabtOaWsOWtkOi3r+W+hFxuICAgIGlmKGlzT2JqZWN0KGF0dHJzKSkge1xuICAgICAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuICAgICAgICB0aGlzLiR1cGRhdGUoa2V5UGF0aCArICcuJyArIGF0dHIsIGZhbHNlKTtcbiAgICAgIH0uYmluZCh0aGlzKSlcbiAgICB9XG5cbiAgICBpZihpc0J1YmJsZSkge1xuICAgICAgaWYodGhpcy4kcGFyZW50KSB7XG4gICAgICAgIC8v5ZCM5q2l5pu05paw54i2IHZtIOWvueW6lOmDqOWIhlxuICAgICAgICB0aGlzLl9yZWxhdGl2ZVBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgIHRoaXMuJHBhcmVudC4kdXBkYXRlKHBhdGgpO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy/mm7TmlrDmlbDnu4Tplb/luqZcbiAgICBpZih1dGlscy5pc0FycmF5KGF0dHJzKSkge1xuICAgICAgdGhpcy4kdXBkYXRlKGtleVBhdGggKyAnLmxlbmd0aCcsIGZhbHNlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuLCAkd2F0Y2g6IGZ1bmN0aW9uIChrZXlQYXRoLCBjYWxsYmFjaykge1xuICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICBhZGRXYXRjaGVyLmNhbGwodGhpcywge3BhdGg6IGtleVBhdGgsIHVwZGF0ZTogY2FsbGJhY2ssIHdhdGNoOiB0cnVlfSlcbiAgICB9XG4gIH1cbiwgJHVud2F0Y2g6IGZ1bmN0aW9uIChrZXlQYXRoLCBjYWxsYmFjaykge1xuICAgIHZhciB3YXRjaGVycyA9IHRoaXMuX3dhdGNoZXJzW2tleVBhdGhdIHx8IFtdO1xuXG4gICAgZm9yKHZhciBpID0gd2F0Y2hlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgaWYod2F0Y2hlcnNbaV0uZGlyLnVwZGF0ZSA9PT0gY2FsbGJhY2spe1xuICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59KTtcblxuZnVuY3Rpb24gdXBkYXRlIChrZXlQYXRoLCBkYXRhKSB7XG4gIHZhciBrZXlQYXRocztcblxuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZGF0YSA9IGtleVBhdGg7XG4gIH1lbHNle1xuICAgIGtleVBhdGhzID0gW2tleVBhdGhdO1xuICB9XG5cbiAgaWYoIWtleVBhdGhzKSB7XG4gICAgaWYoaXNPYmplY3QoZGF0YSkpIHtcbiAgICAgIGtleVBhdGhzID0gT2JqZWN0LmtleXMoZGF0YSk7XG4gICAgfWVsc2V7XG4gICAgICAvLy4kZGF0YSDmnInlj6/og73mmK/ln7rmnKznsbvlnovmlbDmja5cbiAgICAgIGtleVBhdGhzID0gWyckZGF0YSddO1xuICAgIH1cbiAgfVxuXG4gIGZvcih2YXIgaSA9IDAsIHBhdGg7IHBhdGggPSBrZXlQYXRoc1tpXTsgaSsrKXtcbiAgICB0aGlzLiR1cGRhdGUocGF0aCwgdHJ1ZSk7XG4gIH1cblxufVxuXG4vL+mBjeWOhiBkb20g5qCRXG5mdW5jdGlvbiB3YWxrKGVsKSB7XG5cbiAgaWYoZWwubm9kZVR5cGUgPT09IE5PREVUWVBFLkZSQUdNRU5UKSB7XG4gICAgZWwgPSBlbC5jaGlsZE5vZGVzO1xuICB9XG5cbiAgaWYoKCdsZW5ndGgnIGluIGVsKSAmJiBpc1VuZGVmaW5lZChlbC5ub2RlVHlwZSkpe1xuICAgIC8vbm9kZSBsaXN0XG4gICAgLy/lr7nkuo4gbm9kZWxpc3Qg5aaC5p6c5YW25Lit5pyJ5YyF5ZCrIHt7dGV4dH19IOebtOaOpemHj+eahOihqOi+vuW8jywg5paH5pys6IqC54K55Lya6KKr5YiG5YmyLCDlhbboioLngrnmlbDph4/lj6/og73kvJrliqjmgIHlop7liqBcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWwubGVuZ3RoOyBpKyspIHtcbiAgICAgIHdhbGsuY2FsbCh0aGlzLCBlbFtpXSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN3aXRjaCAoZWwubm9kZVR5cGUpIHtcbiAgICBjYXNlIE5PREVUWVBFLkVMRU1FTlQ6XG4gICAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuQ09NTUVOVDpcbiAgICAgIC8v5rOo6YeK6IqC54K5XG4gICAgICByZXR1cm47XG4gICAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuVEVYVDpcbiAgICAgIC8v5paH5pys6IqC54K5XG4gICAgICBjaGVja1RleHQuY2FsbCh0aGlzLCBlbCk7XG4gICAgICByZXR1cm47XG4gICAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYoY2hlY2tBdHRyLmNhbGwodGhpcywgZWwpLnRlcm1pbmFsKXtcbiAgICByZXR1cm47XG4gIH1cblxuICAvL3RlbXBsYXRlXG4gIC8vbWV0YSBlbGVtZW50IGhhcyBjb250ZW50LCB0b28uXG4gIGlmKGVsLmNvbnRlbnQgJiYgZWwuY29udGVudC5ub2RlVHlwZSkge1xuICAgIHdhbGsuY2FsbCh0aGlzLCBlbC5jb250ZW50KTtcbiAgICBlbC5wYXJlbnROb2RlICYmIGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGVsLmNvbnRlbnQsIGVsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBmb3IodmFyIGNoaWxkID0gZWwuZmlyc3RDaGlsZCwgbmV4dDsgY2hpbGQ7ICl7XG4gICAgbmV4dCA9IGNoaWxkLm5leHRTaWJsaW5nO1xuICAgIHdhbGsuY2FsbCh0aGlzLCBjaGlsZCk7XG4gICAgY2hpbGQgPSBuZXh0O1xuICB9XG59XG5cbi8v6YGN5Y6G5bGe5oCnXG5mdW5jdGlvbiBjaGVja0F0dHIoZWwpIHtcbiAgdmFyIGNzdHIgPSB0aGlzLmNvbnN0cnVjdG9yXG4gICAgLCBwcmVmaXggPSBjc3RyLnByZWZpeFxuICAgICwgZGlycyA9IGNzdHIuZGlyZWN0aXZlLmdldERpcihlbCwgY3N0ci5kaXJlY3RpdmVzLCBjc3RyLmNvbXBvbmVudHMsIHByZWZpeClcbiAgICAsIGRpclxuICAgICwgdGVybWluYWxQcmlvcml0eSwgdGVybWluYWxcbiAgICAsIHJlc3VsdCA9IHt9O1xuICAgIDtcblxuICBmb3IgKHZhciBpID0gMCwgbCA9IGRpcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgZGlyID0gZGlyc1tpXTtcbiAgICBkaXIuX19kaXJzID0gZGlycztcblxuICAgIC8v5a+55LqOIHRlcm1pbmFsIOS4uiB0cnVlIOeahCBkaXJlY3RpdmUsIOWcqOino+aekOWujOWFtuebuOWQjOadg+mHjeeahCBkaXJlY3RpdmUg5ZCO5Lit5pat6YGN5Y6G6K+l5YWD57SgXG4gICAgaWYodGVybWluYWxQcmlvcml0eSA+IGRpci5wcmlvcml0eSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZWwucmVtb3ZlQXR0cmlidXRlKGRpci5ub2RlTmFtZSk7XG5cbiAgICBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKTtcblxuICAgIGlmKGRpci50ZXJtaW5hbCkge1xuICAgICAgdGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQuZGlycyA9IGRpcnM7XG4gIGlmKHRlcm1pbmFsKSB7XG4gICAgcmVzdWx0LnRlcm1pbmFsID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vL+WkhOeQhuaWh+acrOiKgueCueS4reeahOe7keWumuWNoOS9jeespih7ey4uLn19KVxuZnVuY3Rpb24gY2hlY2tUZXh0KG5vZGUpIHtcbiAgaWYodG9rZW4uaGFzVG9rZW4obm9kZS5ub2RlVmFsdWUpKSB7XG4gICAgdmFyIHRva2VucyA9IHRva2VuLnBhcnNlVG9rZW4obm9kZS5ub2RlVmFsdWUpXG4gICAgICAsIHRleHRNYXAgPSB0b2tlbnMudGV4dE1hcFxuICAgICAgLCBlbCA9IG5vZGUucGFyZW50Tm9kZVxuICAgICAgLCBkaXJzID0gdGhpcy5jb25zdHJ1Y3Rvci5kaXJlY3RpdmVzXG4gICAgICAsIHQsIGRpclxuICAgICAgO1xuXG4gICAgLy/lsIZ7e2tleX195YiG5Ymy5oiQ5Y2V54us55qE5paH5pys6IqC54K5XG4gICAgaWYodGV4dE1hcC5sZW5ndGggPiAxKSB7XG4gICAgICB0ZXh0TWFwLmZvckVhY2goZnVuY3Rpb24odGV4dCkge1xuICAgICAgICB2YXIgdG4gPSBkb2MuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG4gICAgICAgIGVsLmluc2VydEJlZm9yZSh0biwgbm9kZSk7XG4gICAgICAgIGNoZWNrVGV4dC5jYWxsKHRoaXMsIHRuKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICBlbC5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9ZWxzZXtcbiAgICAgIHQgPSB0b2tlbnNbMF07XG4gICAgICAvL+WGhee9ruWQhOWNoOS9jeespuWkhOeQhi5cbiAgICAgIGRpciA9IGNyZWF0ZSh0LmVzY2FwZSA/IGRpcnMudGV4dCA6IGRpcnMuaHRtbCk7XG4gICAgICBzZXRCaW5kaW5nLmNhbGwodGhpcywgZXh0ZW5kKGRpciwgdCwge1xuICAgICAgICBlbDogbm9kZVxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRCaW5kaW5nKGRpcikge1xuICBpZihkaXIucmVwbGFjZSkge1xuICAgIHZhciBlbCA9IGRpci5lbDtcbiAgICBpZihpc0Z1bmN0aW9uKGRpci5yZXBsYWNlKSkge1xuICAgICAgZGlyLm5vZGUgPSBkaXIucmVwbGFjZSgpO1xuICAgIH1lbHNlIGlmKGRpci5yZXBsYWNlKXtcbiAgICAgIC8vZGlyLm5vZGUgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIudHlwZSArICcgPSAnICsgZGlyLnBhdGgpO1xuICAgICAgZGlyLm5vZGUgPSBkb2MuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgIH1cblxuICAgIGRpci5lbCA9IGRpci5lbC5wYXJlbnROb2RlO1xuICAgIGRpci5lbC5yZXBsYWNlQ2hpbGQoZGlyLm5vZGUsIGVsKTtcbiAgfVxuXG4gIGRpci5saW5rKHRoaXMpO1xuXG4gIGlmKGRpci5kaXJzKSB7XG4gICAgLy/lsZ7mgKfooajovr7lvI9cbiAgICBkaXIuZGlycy5mb3JFYWNoKGZ1bmN0aW9uKGQpIHtcbiAgICAgIGFkZFdhdGNoZXIuY2FsbCh0aGlzLCBleHRlbmQoY3JlYXRlKGRpciksIGQpKTtcbiAgICB9LmJpbmQodGhpcykpO1xuICB9ZWxzZXtcbiAgICBhZGRXYXRjaGVyLmNhbGwodGhpcywgZGlyKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRXYXRjaGVyKGRpcikge1xuICBpZihkaXIucGF0aCAmJiBkaXIud2F0Y2gpIHtcbiAgICByZXR1cm4gbmV3IFdhdGNoZXIodGhpcywgZGlyKTtcbiAgfVxufVxuXG5cbi8vdGFyZ2V0OiBlbCDmm7/mjaLnmoTnm67moIdcbmZ1bmN0aW9uIHRwbFBhcnNlKHRwbCwgdGFyZ2V0KSB7XG4gIHZhciBlbCwgY2hpbGRyZW4gPSBudWxsLCB3cmFwZXI7XG4gIGlmKGlzT2JqZWN0KHRhcmdldCkgJiYgdGFyZ2V0LmNoaWxkcmVuKSB7XG4gICAgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IodmFyIGkgPSAwLCBsID0gdGFyZ2V0LmNoaWxkcmVuLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgY2hpbGRyZW4ucHVzaCh0YXJnZXQuY2hpbGRyZW5baV0uY2xvbmVOb2RlKHRydWUpKTtcbiAgICB9XG4gIH1cbiAgaWYoaXNPYmplY3QodHBsKSl7XG4gICAgZWwgPSB0cGw7XG4gICAgdHBsID0gZWwub3V0ZXJIVE1MO1xuICB9ZWxzZXtcbiAgICB3cmFwZXIgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgd3JhcGVyLmlubmVySFRNTCA9IHRwbDtcblxuICAgIGVsID0gd3JhcGVyLmZpcnN0RWxlbWVudENoaWxkIHx8IHdyYXBlci5jaGlsZHJlblswXTtcblxuICB9XG4gIGlmKHRhcmdldCl7XG4gICAgdGFyZ2V0LnBhcmVudE5vZGUgJiYgdGFyZ2V0LnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGVsLCB0YXJnZXQpO1xuICB9XG5cbiAgcmV0dXJuIHtlbDogZWwsIHRwbDogdHBsLCBjaGlsZHJlbjogY2hpbGRyZW59O1xufVxuXG5CZWUudmVyc2lvbiA9ICcwLjEuMCc7XG5cbm1vZHVsZS5leHBvcnRzID0gQmVlO1xuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKS5leHRlbmQ7XG5cbnZhciBDbGFzcyA9IHtcbiAgLyoqIFxuICAgKiDmnoTpgKDlh73mlbDnu6fmib8uIFxuICAgKiDlpoI6IGB2YXIgQ2FyID0gQW50LmV4dGVuZCh7ZHJpdmU6IGZ1bmN0aW9uKCl7fX0pOyBuZXcgQ2FyKCk7YFxuICAgKiBAcGFyYW0ge09iamVjdH0gW3Byb3RvUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxleWOn+Wei+WvueixoVxuICAgKiBAcGFyYW0ge09iamVjdH0gW3N0YXRpY1Byb3BzXSDlrZDmnoTpgKDlh73mlbDnmoTmianlsZXpnZnmgIHlsZ7mgKdcbiAgICogQHJldHVybiB7RnVuY3Rpb259IOWtkOaehOmAoOWHveaVsFxuICAgKi9cbiAgZXh0ZW5kOiBmdW5jdGlvbiAocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICBwcm90b1Byb3BzID0gcHJvdG9Qcm9wcyB8fCB7fTtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBwcm90b1Byb3BzLmhhc093blByb3BlcnR5KCdjb25zdHJ1Y3RvcicpID8gcHJvdG9Qcm9wcy5jb25zdHJ1Y3RvciA6IGZ1bmN0aW9uKCl7IHJldHVybiBzdXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfVxuICAgIHZhciBzdXAgPSB0aGlzO1xuICAgIHZhciBGbiA9IGZ1bmN0aW9uKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY29uc3RydWN0b3I7IH07XG4gICAgXG4gICAgRm4ucHJvdG90eXBlID0gc3VwLnByb3RvdHlwZTtcbiAgICBjb25zdHJ1Y3Rvci5wcm90b3R5cGUgPSBuZXcgRm4oKTtcbiAgICBleHRlbmQoY29uc3RydWN0b3IucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcbiAgICBleHRlbmQoY29uc3RydWN0b3IsIHN1cCwgc3RhdGljUHJvcHMsIHtfX3N1cGVyX186IHN1cC5wcm90b3R5cGV9KTtcbiAgICBcbiAgICByZXR1cm4gY29uc3RydWN0b3I7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2xhc3M7IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxuLyoqXG4gKiDms6jlhoznu4Tku7ZcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWdOYW1lIOiHquWumuS5iee7hOS7tueahOagh+etvuWQjVxuICogQHBhcmFtIHtGdW5jdGlvbnxwcm9wc30gQ29tcG9uZW50IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsCAvIOaehOmAoOWHveaVsOWPguaVsFxuICogQHJldHVybiB7RnVuY3Rpb259IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsFxuICovXG5mdW5jdGlvbiB0YWcodGFnTmFtZSwgQ29tcG9uZW50LCBzdGF0aWNzKSB7XG4gIHZhciB0YWdzID0gdGhpcy5jb21wb25lbnRzID0gdGhpcy5jb21wb25lbnRzIHx8IHt9O1xuXG4gIHRoaXMuZG9jLmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7Ly9mb3Igb2xkIElFXG5cbiAgaWYodXRpbHMuaXNPYmplY3QoQ29tcG9uZW50KSkge1xuICAgIENvbXBvbmVudCA9IHRoaXMuZXh0ZW5kKENvbXBvbmVudCwgc3RhdGljcyk7XG4gIH1cbiAgcmV0dXJuIHRhZ3NbdGFnTmFtZV0gPSBDb21wb25lbnQ7XG59XG5cbmV4cG9ydHMudGFnID0gZXhwb3J0cy5jb21wb25lbnQgPSB0YWc7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuL3Rva2VuLmpzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gIDtcblxuLyoqXG4gKiDkuLogQW50IOaehOmAoOWHveaVsOa3u+WKoOaMh+S7pCAoZGlyZWN0aXZlKS4gYEFudC5kaXJlY3RpdmVgXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IGRpcmVjdGl2ZSDlkI3np7BcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0c10gZGlyZWN0aXZlIOWPguaVsFxuICogQHBhcmFtIHtOdW1iZXJ9IG9wdHMucHJpb3JpdHk9MCBkaXJlY3RpdmUg5LyY5YWI57qnLiDlkIzkuIDkuKrlhYPntKDkuIrnmoTmjIfku6TmjInnhafkvJjlhYjnuqfpobrluo/miafooYwuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMudGVybWluYWw9ZmFsc2Ug5omn6KGM6K+lIGRpcmVjdGl2ZSDlkI4sIOaYr+WQpue7iOatouWQjue7rSBkaXJlY3RpdmUg5omn6KGMLlxuICogICB0ZXJtaW5hbCDkuLrnnJ/ml7YsIOS4juivpSBkaXJlY3RpdmUg5LyY5YWI57qn55u45ZCM55qEIGRpcmVjdGl2ZSDku43kvJrnu6fnu63miafooYwsIOi+g+S9juS8mOWFiOe6p+eahOaJjeS8muiiq+W/veeVpS5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy5hbmNob3IgYW5jaG9yIOS4uiB0cnVlIOaXtiwg5Lya5Zyo5oyH5Luk6IqC54K55YmN5ZCO5ZCE5Lqn55Sf5LiA5Liq56m655m955qE5qCH6K6w6IqC54K5LiDliIbliKvlr7nlupQgYGFuY2hvcnMuc3RhcnRgIOWSjCBgYW5jaG9ycy5lbmRgXG4gKi9cbmZ1bmN0aW9uIGRpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdmFyIGRpcnMgPSB0aGlzLmRpcmVjdGl2ZXMgPSB0aGlzLmRpcmVjdGl2ZXMgfHwge307XG5cbiAgcmV0dXJuIGRpcnNba2V5XSA9IG5ldyBEaXJlY3RpdmUoa2V5LCBvcHRzKTtcbn1cblxuZnVuY3Rpb24gRGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB0aGlzLnR5cGUgPSBrZXk7XG4gIHV0aWxzLmV4dGVuZCh0aGlzLCBvcHRzKTtcbn1cblxuRGlyZWN0aXZlLnByb3RvdHlwZSA9IHtcbiAgcHJpb3JpdHk6IDAvL+adg+mHjVxuLCBsaW5rOiB1dGlscy5ub29wLy/liJ3lp4vljJbmlrnms5VcbiwgdXBkYXRlOiB1dGlscy5ub29wLy/mm7TmlrDmlrnms5VcbiwgdGVhckRvd246IHV0aWxzLm5vb3BcbiwgdGVybWluYWw6IGZhbHNlLy/mmK/lkKbnu4jmraJcbiwgcmVwbGFjZTogZmFsc2UvL+aYr+WQpuabv+aNouW9k+WJjeWFg+e0oFxuLCB3YXRjaDogdHJ1ZS8v5piv5ZCm55uR5o6nIGtleSDnmoTlj5jljJZcblxuLCBhbmNob3I6IGZhbHNlXG4sIGFuY2hvcnM6IG51bGxcblxuICAvL+W9kyBhbmNob3Ig5Li6IHRydWUg5pe2LCDojrflj5bkuKTkuKrplJrngrnkuYvpl7TnmoTmiYDmnInoioLngrkuXG4sIGdldE5vZGVzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSBbXSwgbm9kZSA9IHRoaXMuYW5jaG9ycy5zdGFydC5uZXh0U2libGluZztcbiAgICBpZih0aGlzLmFuY2hvciAmJiBub2RlKSB7XG4gICAgICB3aGlsZShub2RlICE9PSB0aGlzLmFuY2hvcnMuZW5kKXtcbiAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dFNpYmxpbmc7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBub2RlcztcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxufTtcblxuLy/ojrflj5bkuIDkuKrlhYPntKDkuIrmiYDmnInnlKggSFRNTCDlsZ7mgKflrprkuYnnmoTmjIfku6RcbmZ1bmN0aW9uIGdldERpcihlbCwgZGlyZWN0aXZlcywgY29tcG9uZW50cywgcHJlZml4KSB7XG4gIHByZWZpeCA9IHByZWZpeCB8fCAnJztcbiAgZGlyZWN0aXZlcyA9IGRpcmVjdGl2ZXMgfHwge307XG5cbiAgdmFyIGF0dHIsIGF0dHJOYW1lLCBkaXJOYW1lXG4gICAgLCBkaXJzID0gW10sIGRpciwgYW5jaG9ycyA9IHt9XG4gICAgLCBwYXJlbnQgPSBlbC5wYXJlbnROb2RlXG4gICAgLCBub2RlTmFtZSA9IGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKClcbiAgICA7XG5cbiAgLy/lr7nkuo7oh6rlrprkuYnmoIfnrb4sIOWwhuWFtui9rOS4uiBkaXJlY3RpdmVcbiAgaWYobm9kZU5hbWUgaW4gY29tcG9uZW50cykge1xuICAgIGVsLnNldEF0dHJpYnV0ZShwcmVmaXggKyAnY29tcG9uZW50Jywgbm9kZU5hbWUpO1xuICB9XG5cbiAgZm9yKHZhciBpID0gZWwuYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgYXR0ciA9IGVsLmF0dHJpYnV0ZXNbaV07XG4gICAgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuICAgIGRpck5hbWUgPSBhdHRyTmFtZS5zbGljZShwcmVmaXgubGVuZ3RoKTtcblxuICAgIGlmKGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCAmJiAoZGlyTmFtZSBpbiBkaXJlY3RpdmVzKSkge1xuICAgICAgLy/mjIfku6RcbiAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZShkaXJlY3RpdmVzW2Rpck5hbWVdKTtcbiAgICAgIGRpci5kaXJOYW1lID0gZGlyTmFtZVxuICAgIH1lbHNlIGlmKHRva2VuLmhhc1Rva2VuKGF0dHIudmFsdWUpKSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+WPr+iDveacieWkmuS4quihqOi+vuW8j+WMulxuICAgICAgZGlyID0gdXRpbHMuY3JlYXRlKGRpcmVjdGl2ZXNbJ2F0dHInXSk7XG4gICAgICBkaXIuZGlycyA9IHRva2VuLnBhcnNlVG9rZW4oYXR0ci52YWx1ZSk7XG4gICAgICBkaXIuZGlyTmFtZSA9IGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCA/IGRpck5hbWUgOiBhdHRyTmFtZSA7XG4gICAgfWVsc2V7XG4gICAgICBkaXIgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZihkaXIpIHtcbiAgICAgIGlmKGRpci5hbmNob3IgJiYgIWFuY2hvcnMuc3RhcnQpIHtcbiAgICAgICAgLy/lkIzkuIDkuKrlhYPntKDkuIrnmoQgZGlyZWN0aXZlIOWFseS6q+WQjOS4gOWvuemUmueCuVxuICAgICAgICBhbmNob3JzLnN0YXJ0ID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyLmRpck5hbWUgKyAnIHN0YXJ0Jyk7XG4gICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoYW5jaG9ycy5zdGFydCwgZWwpO1xuXG4gICAgICAgIGFuY2hvcnMuZW5kID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyLmRpck5hbWUgKyAnIGVuZCcpO1xuICAgICAgICBpZihlbC5uZXh0U2libGluZykge1xuICAgICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoYW5jaG9ycy5lbmQsIGVsLm5leHRTaWJsaW5nKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKGFuY2hvcnMuZW5kKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZGlycy5wdXNoKHV0aWxzLmV4dGVuZChkaXIsIHtlbDogZWwsIG5vZGU6IGF0dHIsIG5vZGVOYW1lOiBhdHRyTmFtZSwgcGF0aDogYXR0ci52YWx1ZSwgYW5jaG9yczogZGlyLmFuY2hvciA/IGFuY2hvcnMgOiBudWxsfSkpO1xuICAgIH1cbiAgfVxuICBkaXJzLnNvcnQoZnVuY3Rpb24oZDAsIGQxKSB7XG4gICAgcmV0dXJuIGQxLnByaW9yaXR5IC0gZDAucHJpb3JpdHk7XG4gIH0pO1xuICByZXR1cm4gZGlycztcbn1cblxuZGlyZWN0aXZlLmdldERpciA9IGdldERpcjtcblxuZXhwb3J0cy5kaXJlY3RpdmUgPSBkaXJlY3RpdmU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/lsZ7mgKfmjIfku6RcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxudmFyIGF0dHJQb3N0UmVnID0gL1xcPyQvO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbGluazogZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy5kaXJOYW1lID09PSB0aGlzLnR5cGUpIHsvL2F0dHIgYmluZGluZ1xuICAgICAgdGhpcy5hdHRycyA9IHt9O1xuICAgIH1lbHNlIHtcbiAgICAgIC8v5p2h5Lu25bGe5oCnXG4gICAgICBpZihhdHRyUG9zdFJlZy50ZXN0KHRoaXMuZGlyTmFtZSkpIHsvLyBzb21lQXR0cj8gY29uZGl0aW9uIGJpbmRpbmdcbiAgICAgICAgdGhpcy5kaXJOYW1lID0gdGhpcy5kaXJOYW1lLnJlcGxhY2UoYXR0clBvc3RSZWcsICcnKTtcbiAgICAgICAgdGhpcy5jb25kaXRpb25hbEF0dHIgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIG5ld0F0dHJzID0ge307XG4gICAgaWYodGhpcy5kaXJOYW1lID09PSB0aGlzLnR5cGUpIHtcbiAgICAgIGZvcih2YXIgYXR0ciBpbiB2YWwpIHtcbiAgICAgICAgc2V0QXR0cihlbCwgYXR0ciwgdmFsW2F0dHJdKTtcbiAgICAgICAgLy9pZih2YWxbYXR0cl0pIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5hdHRyc1thdHRyXTtcbiAgICAgICAgLy99XG4gICAgICAgIG5ld0F0dHJzW2F0dHJdID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgLy/np7vpmaTkuI3lnKjkuIrmrKHorrDlvZXkuK3nmoTlsZ7mgKdcbiAgICAgIGZvcih2YXIgYXR0ciBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHJlbW92ZUF0dHIoZWwsIGF0dHIpO1xuICAgICAgfVxuICAgICAgdGhpcy5hdHRycyA9IG5ld0F0dHJzO1xuICAgIH1lbHNle1xuICAgICAgaWYodGhpcy5jb25kaXRpb25hbEF0dHIpIHtcbiAgICAgICAgdmFsID8gc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB2YWwpIDogcmVtb3ZlQXR0cihlbCwgdGhpcy5kaXJOYW1lKTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLnRleHRNYXBbdGhpcy5wb3NpdGlvbl0gPSB2YWwgJiYgKHZhbCArICcnKTtcbiAgICAgICAgc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB0aGlzLnRleHRNYXAuam9pbignJykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuXG4vL0lFIOa1j+iniOWZqOW+iOWkmuWxnuaAp+mAmui/hyBgc2V0QXR0cmlidXRlYCDorr7nva7lkI7ml6DmlYguIFxuLy/ov5nkupvpgJrov4cgYGVsW2F0dHJdID0gdmFsdWVgIOiuvue9rueahOWxnuaAp+WNtOiDveWkn+mAmui/hyBgcmVtb3ZlQXR0cmlidXRlYCDmuIXpmaQuXG5mdW5jdGlvbiBzZXRBdHRyKGVsLCBhdHRyLCB2YWwpe1xuICB0cnl7XG4gICAgaWYoKChhdHRyIGluIGVsKSB8fCBhdHRyID09PSAnY2xhc3MnKSl7XG4gICAgICBpZihhdHRyID09PSAnc3R5bGUnICYmIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHZhbCk7XG4gICAgICB9ZWxzZSBpZihhdHRyID09PSAnY2xhc3MnKXtcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gdmFsO1xuICAgICAgfWVsc2V7XG4gICAgICAgIGVsW2F0dHJdID0gdHlwZW9mIGVsW2F0dHJdID09PSAnYm9vbGVhbicgPyB0cnVlIDogdmFsO1xuICAgICAgfVxuICAgIH1cbiAgfWNhdGNoKGUpe31cbiAgdHJ5e1xuICAgIC8vY2hyb21lIHNldGF0dHJpYnV0ZSB3aXRoIGB7e319YCB3aWxsIHRocm93IGFuIGVycm9yXG4gICAgZWwuc2V0QXR0cmlidXRlKGF0dHIsIHZhbCk7XG4gIH1jYXRjaChlKXsgY29uc29sZS53YXJuKGUpIH1cbn1cblxuZnVuY3Rpb24gcmVtb3ZlQXR0cihlbCwgYXR0cikge1xuICBlbC5yZW1vdmVBdHRyaWJ1dGUoYXR0cik7XG4gIGRlbGV0ZSBlbFthdHRyXTtcbn0iLCIvL2NvbXBvbmVudCBhcyBkaXJlY3RpdmVcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcmlvcml0eTogLTEwXG4sIHdhdGNoOiBmYWxzZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIGNvbU5hbWUgPSB0aGlzLnBhdGg7XG4gICAgdmFyIGNvbXBvbmVudHMgPSB2bS5jb25zdHJ1Y3Rvci5jb21wb25lbnRzO1xuICAgIHZhciBDb21wLCBjb21wO1xuICAgIHZhciBkaXJzID0gW10sICRkYXRhID0ge307XG4gICAgdmFyIGF0dHJzO1xuXG4gICAgaWYoY29tTmFtZSBpbiBjb21wb25lbnRzKSB7XG4gICAgICBDb21wID0gY29tcG9uZW50c1tjb21OYW1lXTtcblxuICAgICAgaWYoQ29tcCA9PT0gdm0uY29uc3RydWN0b3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkaXJzID0gdGhpcy5fX2RpcnM7XG5cbiAgICAgIGRpcnMgPSBkaXJzLmZpbHRlcihmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGF0dHJzID0gZWwuYXR0cmlidXRlcztcblxuICAgICAgLy/mma7pgJrlsZ7mgKdcbiAgICAgIGZvcih2YXIgaSA9IGF0dHJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICRkYXRhW2F0dHJzWzBdLm5vZGVOYW1lXSA9IGF0dHJzWzBdLnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBkaXJzLmZvckVhY2goZnVuY3Rpb24gKGRpcikge1xuICAgICAgICB2YXIgd2l0aE1hcCA9IFtdO1xuICAgICAgICAvL+WxnuaAp+ihqOi+vuW8j1xuICAgICAgICBpZihkaXIuZGlycykge1xuICAgICAgICAgIHdpdGhNYXAgPSBkaXIuZGlycy5tYXAoZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4ge3BhdGg6IHRva2VuLnBhdGgsIGNvbXBvbmVudFBhdGg6IGRpci5ub2RlTmFtZX07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIC8vYS13aXRoIGRpcmVjdGl2ZVxuICAgICAgICAgIHdpdGhNYXAgPSBkaXIubG9jYWxzLm1hcChmdW5jdGlvbihsb2NhbCkge1xuICAgICAgICAgICAgcmV0dXJuIHtwYXRoOiBsb2NhbCwgY29tcG9uZW50UGF0aDogbG9jYWx9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy/nm5HlkKzniLbnu4Tku7bmm7TmlrBcbiAgICAgICAgd2l0aE1hcC5mb3JFYWNoKGZ1bmN0aW9uIChwYXRoQ29uZmlnKSB7XG4gICAgICAgICAgdm0uJHdhdGNoKHBhdGhDb25maWcucGF0aCwgZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgICAgaWYgKGNvbXApIHtcbiAgICAgICAgICAgICAgY29tcC4kc2V0KHBhdGhDb25maWcuY29tcG9uZW50UGF0aCwgdmFsKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmKHBhdGhDb25maWcuY29tcG9uZW50UGF0aCA9PT0gJyRkYXRhJyl7XG4gICAgICAgICAgICAgICAgJGRhdGEgPSBPYmplY3QodmFsKVxuICAgICAgICAgICAgICB9ZWxzZSB7XG4gICAgICAgICAgICAgICAgJGRhdGFbcGF0aENvbmZpZy5jb21wb25lbnRQYXRoXSA9IHZhbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbXAgPSBuZXcgQ29tcCh7JHRhcmdldDogZWwsICRkYXRhOiB1dGlscy5leHRlbmQoe30sIENvbXAucHJvdG90eXBlLiRkYXRhLCAkZGF0YSl9KTtcblxuICAgICAgLy/nm7TmjqXlsIZjb21wb25lbnQg5L2c5Li65qC55YWD57Sg5pe2LCDlkIzmraXot5/mlrDlrrnlmaggLiRlbCDlvJXnlKhcbiAgICAgIGlmKHZtLiRlbCA9PT0gZWwpIHtcbiAgICAgICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgY29tTmFtZSArICcgbm90IGRlZmluZWQhIElnbm9yZScpO1xuICAgIH1cbiAgfVxufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4uL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpXG4gIDtcblxudmFyIGRpcnMgPSB7fTtcblxuXG5kaXJzLnRleHQgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLm5vZGUubm9kZVZhbHVlID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuICB9XG59O1xuXG5cbmRpcnMuaHRtbCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5vZGVzID0gW107XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWwuaW5uZXJIVE1MID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuXG4gICAgdmFyIG5vZGU7XG4gICAgd2hpbGUobm9kZSA9IHRoaXMubm9kZXMucG9wKCkpIHtcbiAgICAgIG5vZGUucGFyZW50Tm9kZSAmJiBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfVxuXG4gICAgdmFyIG5vZGVzID0gZWwuY2hpbGROb2RlcztcbiAgICB3aGlsZShub2RlID0gbm9kZXNbMF0pIHtcbiAgICAgIHRoaXMubm9kZXMucHVzaChub2RlKTtcbiAgICAgIHRoaXMuZWwuaW5zZXJ0QmVmb3JlKG5vZGUsIHRoaXMubm9kZSk7XG4gICAgfVxuICB9XG59O1xuXG5cbmRpcnNbJ2lmJ10gPSB7XG4gIGFuY2hvcjogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmVsLmNvbnRlbnQpIHtcbiAgICAgIHRoaXMuZnJhZyA9IHRoaXMuZWwuY29udGVudDtcbiAgICAgIHRoaXMuZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmVsKTtcbiAgICB9ZWxzZXtcbiAgICAgIHRoaXMuZnJhZyA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgICAgIHRoaXMuaGlkZSgpO1xuICAgIH1cbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIGlmKHZhbCkge1xuICAgICAgaWYoIXRoaXMuc3RhdGUpIHsgdGhpcy5zaG93KCkgfVxuICAgIH1lbHNle1xuICAgICAgaWYodGhpcy5zdGF0ZSkgeyB0aGlzLmhpZGUoKTsgfVxuICAgIH1cbiAgICB0aGlzLnN0YXRlID0gdmFsO1xuICB9XG5cbiwgc2hvdzogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9ycy5lbmQ7XG5cbiAgICBhbmNob3IucGFyZW50Tm9kZSAmJiBhbmNob3IucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5mcmFnLCBhbmNob3IpO1xuICB9XG4sIGhpZGU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKTtcblxuICAgIGlmKG5vZGVzKSB7XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gbm9kZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHRoaXMuZnJhZy5hcHBlbmRDaGlsZChub2Rlc1tpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5kaXJzLnRlbXBsYXRlID0ge1xuICBwcmlvcml0eTogMTAwMDBcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5lbC5jaGlsZE5vZGVzXG4gICAgICAsIGZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICA7XG5cbiAgICB3aGlsZShub2Rlc1swXSkge1xuICAgICAgZnJhZy5hcHBlbmRDaGlsZChub2Rlc1swXSk7XG4gICAgfVxuXG4gICAgdGhpcy5lbC5jb250ZW50ID0gZnJhZztcblxuICAgIC8vdGhpcy5lbC5zZXRBdHRyaWJ1dGUodGhpcy5ub2RlTmFtZSwgJycpO1xuICB9XG59O1xuXG4vL+WbvueJh+eUqCwg6YG/5YWN5Yqg6L295aSn5ous5Y+355qE5Y6f5aeL5qih5p2/5YaF5a65XG5kaXJzLnNyYyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLmVsLnNyYyA9IHZhbDtcbiAgfVxufTtcblxuZGlyc1snd2l0aCddID0ge307XG5cbi8vZGlycy5wYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsLmpzJyk7XG5kaXJzLnJlcGVhdCA9IHJlcXVpcmUoJy4vcmVwZWF0LmpzJyk7XG5kaXJzLmF0dHIgPSByZXF1aXJlKCcuL2F0dHIuanMnKTtcbmRpcnMubW9kZWwgPSByZXF1aXJlKCcuL21vZGVsLmpzJyk7XG5kaXJzLnN0eWxlID0gcmVxdWlyZSgnLi9zdHlsZS5qcycpO1xuZGlycy5vbiA9IHJlcXVpcmUoJy4vb24uanMnKTtcbmRpcnMuY29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBkaXJzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgLCBoYXNUb2tlbiA9IHJlcXVpcmUoJy4uL3Rva2VuLmpzJykuaGFzVG9rZW5cbiAgLCBldmVudHMgPSByZXF1aXJlKCcuLi9ldmVudC1iaW5kLmpzJylcbiAgO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtaW5hbDogdHJ1ZVxuLCBwcmlvcml0eTogMVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBrZXlQYXRoID0gdGhpcy5wYXRoO1xuICAgIHZhciBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aChrZXlQYXRoKTtcbiAgICB2YXIgaGVhZFBhdGggPSBwYXRoc1swXTtcblxuICAgIGlmKCFrZXlQYXRoKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgLy9UT0RPIOWunueOsOexu+S8vCAuJGdldCDnmoQgLiRzZXRcbiAgICBpZih2bS4kcGFyZW50KSB7XG4gICAgICBpZiAodm0uX2Fzc2lnbm1lbnRzICYmIHZtLl9hc3NpZ25tZW50c1swXSA9PT0gaGVhZFBhdGgpIHtcbiAgICAgICAga2V5UGF0aCA9IHBhdGhzLnNsaWNlKDEpLmpvaW4oJy4nKSB8fCAnJGRhdGEnO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHZtID0gdm0uJHBhcmVudDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZWwgPSB0aGlzLmVsXG4gICAgICAsIGV2ID0gJ2NoYW5nZSdcbiAgICAgICwgYXR0ciwgdmFsdWUgPSBhdHRyID0gJ3ZhbHVlJ1xuICAgICAgLCBhbnQgPSB2bVxuICAgICAgLy8sIGN1ciA9IHZtLiRnZXRWTShrZXlQYXRoLCB7YXNzaWdubWVudDogdGhpcy5hc3NpZ25tZW50fSlcbiAgICAgICwgaXNTZXREZWZhdXQgPSB1dGlscy5pc1VuZGVmaW5lZChhbnQuJGdldChrZXlQYXRoLCBmYWxzZSkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG4gICAgICAsIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gZWxbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBlbFthdHRyXSA9IG5ld1ZhbDsgfVxuICAgICAgICB9XG4gICAgICAsIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICB2YXIgdmFsID0gZWxbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFsLCB7aXNCdWJibGU6IGlzSW5pdCAhPT0gdHJ1ZX0pO1xuICAgICAgICB9XG4gICAgICAsIGNhbGxIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgIGlmKGUgJiYgZS5wcm9wZXJ0eU5hbWUgJiYgZS5wcm9wZXJ0eU5hbWUgIT09IGF0dHIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgIH1cbiAgICAgICwgaWUgPSB1dGlscy5pZVxuICAgICAgO1xuXG4gICAgc3dpdGNoKGVsLnRhZ05hbWUpIHtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHZhbHVlID0gYXR0ciA9ICdpbm5lckhUTUwnO1xuICAgICAgICAvL2V2ICs9ICcgYmx1cic7XG4gICAgICBjYXNlICdJTlBVVCc6XG4gICAgICBjYXNlICdURVhUQVJFQSc6XG4gICAgICAgIHN3aXRjaChlbC50eXBlKSB7XG4gICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxuICAgICAgICAgICAgdmFsdWUgPSBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgLy9JRTYsIElFNyDkuIvnm5HlkKwgcHJvcGVydHljaGFuZ2Ug5Lya5oyCP1xuICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdyYWRpbyc6XG4gICAgICAgICAgICBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgIGVsLmNoZWNrZWQgPSBlbC52YWx1ZSA9PT0gdmFsICsgJyc7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaXNTZXREZWZhdXQgPSBlbC5jaGVja2VkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZighYW50LiRsYXp5KXtcbiAgICAgICAgICAgICAgaWYoJ29uaW5wdXQnIGluIGVsKXtcbiAgICAgICAgICAgICAgICBldiArPSAnIGlucHV0JztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvL0lFIOS4i+eahCBpbnB1dCDkuovku7bmm7/ku6NcbiAgICAgICAgICAgICAgaWYoaWUpIHtcbiAgICAgICAgICAgICAgICBldiArPSAnIGtleXVwIHByb3BlcnR5Y2hhbmdlIGN1dCc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUxFQ1QnOlxuICAgICAgICBpZihlbC5tdWx0aXBsZSl7XG4gICAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKGlzSW5pdCkge1xuICAgICAgICAgICAgdmFyIHZhbHMgPSBbXTtcbiAgICAgICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBlbC5vcHRpb25zLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgICAgIGlmKGVsLm9wdGlvbnNbaV0uc2VsZWN0ZWQpeyB2YWxzLnB1c2goZWwub3B0aW9uc1tpXS52YWx1ZSkgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFscywge2lzQnViYmxlOiBpc0luaXQgIT09IHRydWV9KTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFscyl7XG4gICAgICAgICAgICBpZih2YWxzICYmIHZhbHMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGVsLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgICBlbC5vcHRpb25zW2ldLnNlbGVjdGVkID0gdmFscy5pbmRleE9mKGVsLm9wdGlvbnNbaV0udmFsdWUpICE9PSAtMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaXNTZXREZWZhdXQgPSBpc1NldERlZmF1dCAmJiAhaGFzVG9rZW4oZWxbdmFsdWVdKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlID0gY2FsbGJhY2s7XG5cbiAgICBldi5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKGUpe1xuICAgICAgZXZlbnRzLnJlbW92ZUV2ZW50KGVsLCBlLCBjYWxsSGFuZGxlcik7XG4gICAgICBldmVudHMuYWRkRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICB9KTtcblxuICAgIC8v5qC55o2u6KGo5Y2V5YWD57Sg55qE5Yid5aeL5YyW6buY6K6k5YC86K6+572u5a+55bqUIG1vZGVsIOeahOWAvFxuICAgIGlmKGVsW3ZhbHVlXSAmJiBpc1NldERlZmF1dCl7XG4gICAgICAgaGFuZGxlcih0cnVlKTtcbiAgICB9XG5cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxuLy/kuovku7bnm5HlkKxcclxuXHJcbnZhciBldmVudEJpbmQgPSByZXF1aXJlKCcuLi9ldmVudC1iaW5kLmpzJyk7XHJcblxyXG4vL1RPRE8g56e76Zmk5pe255qE5oOF5Ya1XHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIGxpbms6IGZ1bmN0aW9uKHZtKSB7XHJcbiAgICAvL3RoaXMuZXZlbnRzID0ge307XHJcbiAgICB0aGlzLnZtID0gdm07XHJcbiAgfVxyXG4sIHVwZGF0ZTogZnVuY3Rpb24oZXZlbnRzKSB7XHJcbiAgICBmb3IodmFyIG5hbWUgaW4gZXZlbnRzKSB7XHJcbiAgICAgIGV2ZW50QmluZC5hZGRFdmVudCh0aGlzLmVsLCBuYW1lLCBldmVudHNbbmFtZV0uYmluZCh0aGlzLnZtKSk7XHJcbiAgICB9XHJcbiAgICAvL3RoaXMuZXZlbnRzID0gZXZlbnRzO1xyXG4gIH1cclxufSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgO1xuXG4vL+i/meS6m+aVsOe7hOaTjeS9nOaWueazleiiq+mHjeWGmeaIkOiHquWKqOinpuWPkeabtOaWsFxudmFyIGFycmF5TWV0aG9kcyA9IFsnc3BsaWNlJywgJ3B1c2gnLCAncG9wJywgJ3NoaWZ0JywgJ3Vuc2hpZnQnLCAnc29ydCcsICdyZXZlcnNlJ107XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcmlvcml0eTogMTAwMFxuLCBhbmNob3I6IHRydWVcbiwgdGVybWluYWw6IHRydWVcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICB2YXIgY3N0ciA9IHRoaXMuY3N0ciA9IHZtLmNvbnN0cnVjdG9yO1xuICAgIHRoaXMudm0gPSB2bTtcblxuICAgIHdoaWxlKGNzdHIuX19zdXBlcl9fKXtcbiAgICAgIGNzdHIgPSB0aGlzLmNzdHIgPSBjc3RyLl9fc3VwZXJfXy5jb25zdHJ1Y3RvcjtcbiAgICB9XG5cblxuICAgIHRoaXMuY3VyQXJyID0gW107XG4gICAgdGhpcy5saXN0ID0gW107Ly9be2VsOmVsLCB2bTogdm19XVxuXG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcblxuICAgICAgLy/liKDpmaTlhYPntKBcbiAgICAgIGFyckRpZmYoY3VyQXJyLCBpdGVtcykuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgIHZhciBwb3MgPSBjdXJBcnIuaW5kZXhPZihpdGVtKVxuICAgICAgICBjdXJBcnIuc3BsaWNlKHBvcywgMSlcbiAgICAgICAgcGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmxpc3RbcG9zXS5lbClcbiAgICAgICAgdGhpcy5saXN0LnNwbGljZShwb3MsIDEpXG4gICAgICB9LmJpbmQodGhpcykpXG5cbiAgICAgIGl0ZW1zLmZvckVhY2goZnVuY3Rpb24oaXRlbSwgaSkge1xuICAgICAgICB2YXIgcG9zID0gaXRlbXMuaW5kZXhPZihpdGVtLCBpKVxuICAgICAgICAgICwgb2xkUG9zID0gY3VyQXJyLmluZGV4T2YoaXRlbSwgaSlcbiAgICAgICAgICAsIHZtLCBlbFxuICAgICAgICAgIDtcblxuICAgICAgICBwb3MgPCAwICYmIChwb3MgPSBpdGVtcy5sYXN0SW5kZXhPZihpdGVtLCBpKSk7XG4gICAgICAgIG9sZFBvcyA8IDAgJiYgKG9sZFBvcyA9IGN1ckFyci5sYXN0SW5kZXhPZihpdGVtLCBpKSk7XG5cbiAgICAgICAgLy/mlrDlop7lhYPntKBcbiAgICAgICAgaWYob2xkUG9zIDwgMCkge1xuXG4gICAgICAgICAgLy8g5ZyoIHJlcGVhdCDmjIfku6Tooajovr7lvI/kuK1cbiAgICAgICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5sb2NhbHMuZmlsdGVyKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB1dGlscy5pc0FycmF5KHRoaXMudm0uJGdldChwYXRoKSlcbiAgICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgZWwgPSB0aGlzLmVsLmNsb25lTm9kZSh0cnVlKVxuXG4gICAgICAgICAgdm0gPSBuZXcgdGhpcy5jc3RyKGVsLCB7JGRhdGE6IGl0ZW0sICRwYXJlbnQ6IHRoaXMudm0sIF9hc3NpZ25tZW50czogdGhpcy5hc3NpZ25tZW50cywgJGluZGV4OiBwb3N9KTtcbiAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh2bS4kZWwsIHRoaXMubGlzdFtwb3NdICYmIHRoaXMubGlzdFtwb3NdLmVsIHx8IHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgdGhpcy5saXN0LnNwbGljZShwb3MsIDAsIHtlbDogZWwsIHZtOiB2bX0pO1xuICAgICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAwLCBpdGVtKVxuXG4gICAgICAgICAgLy/lu7bml7botYvlgLznu5kgYF9yZWxhdGl2ZVBhdGhgLCDpgb/lhY3lh7rnjrDmrbvlvqrnjq9cbiAgICAgICAgICAvL+WmguaenOWcqOS4iumdouWunuS+i+WMluaXtuW9k+WPguaVsOS8oOWFpSwg5Lya5YaS5rOh5Yiw54i257qnIHZtIOmAkuW9kuiwg+eUqOi/memHjOeahCB1cGRhdGUg5pa55rOVLCDpgKDmiJDmrbvlvqrnjq8uXG4gICAgICAgICAgdm0uX3JlbGF0aXZlUGF0aCA9IHRoaXMubGlzdFBhdGg7XG4gICAgICAgIH1lbHNlIHtcblxuICAgICAgICAgIC8v6LCD5bqPXG4gICAgICAgICAgaWYgKHBvcyAhPT0gb2xkUG9zKSB7XG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLmxpc3Rbb2xkUG9zXS5lbCwgdGhpcy5saXN0W3Bvc10gJiYgdGhpcy5saXN0W3Bvc10uZWwgfHwgdGhpcy5hbmNob3IuZW5kKVxuICAgICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5saXN0W3Bvc10uZWwsIHRoaXMubGlzdFtvbGRQb3MgKyAxXSAmJiB0aGlzLmxpc3Rbb2xkUG9zICsgMV0uZWwgfHwgdGhpcy5hbmNob3IuZW5kKVxuICAgICAgICAgICAgdGhpcy5saXN0W29sZFBvc10gPSBbdGhpcy5saXN0W3Bvc10sIHRoaXMubGlzdFtwb3NdID0gdGhpcy5saXN0W29sZFBvc11dWzBdXG4gICAgICAgICAgICBjdXJBcnJbb2xkUG9zXSA9IFtjdXJBcnJbcG9zXSwgY3VyQXJyW3Bvc10gPSBjdXJBcnJbb2xkUG9zXV1bMF1cbiAgICAgICAgICAgIHRoaXMubGlzdFtwb3NdLnZtLiRpbmRleCA9IHBvc1xuICAgICAgICAgICAgdGhpcy5saXN0W3Bvc10udm0uJHVwZGF0ZSgnJGluZGV4JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSlcblxuICAgICAgLy/mm7TmlrDntKLlvJVcbiAgICAgIHRoaXMubGlzdC5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0sIGkpIHtcbiAgICAgICAgaXRlbS52bS4kaW5kZXggPSBpXG4gICAgICAgIGl0ZW0udm0uJHVwZGF0ZSgnJGluZGV4JywgZmFsc2UpXG4gICAgICB9KTtcblxuICAgICAgLy/mlbDnu4Tmk43kvZzmlrnms5VcbiAgICAgIHV0aWxzLmV4dGVuZChpdGVtcywge1xuICAgICAgICAkc2V0OiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgdGhhdC5saXN0W2ldLnZtLiRzZXQoaXRlbSk7XG4gICAgICAgIH0sXG4gICAgICAgICRyZXBsYWNlOiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgdGhhdC5saXN0W2ldLnZtLiRyZXBsYWNlKGl0ZW0pXG4gICAgICAgIH0sXG4gICAgICAgICRyZW1vdmU6IGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgICBpdGVtcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgdGhhdC5saXN0UGF0aC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgIHRoYXQudm0uJHVwZGF0ZShwYXRoKVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGFycmF5TWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgICAgICBpdGVtc1ttZXRob2RdID0gdXRpbHMuYWZ0ZXJGbihpdGVtc1ttZXRob2RdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICB0aGF0Lmxpc3RQYXRoLmZvckVhY2goZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICAgICAgdGhhdC52bS4kdXBkYXRlKHBhdGgpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfWVsc2V7XG4gICAgICAvL1RPRE8g5pmu6YCa5a+56LGh55qE6YGN5Y6GXG4gICAgfVxuICB9XG59O1xuXG5cbmZ1bmN0aW9uIGFyckRpZmYoYXJyMSwgYXJyMikge1xuICByZXR1cm4gYXJyMS5maWx0ZXIoZnVuY3Rpb24oZWwpIHtcbiAgICByZXR1cm4gYXJyMi5pbmRleE9mKGVsKSA8IDBcbiAgfSlcbn1cblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG4vL+agt+W8j+aMh+S7pFxyXG5cclxudmFyIGNhbWVsUmVnID0gLyhbQS1aXSkvZztcclxuXHJcbi8v6buY6K6k5Y2V5L2N5Li6IHB4IOeahOWxnuaAp1xyXG4vL1RPRE8g5b6F5a6M5ZaEXHJcbnZhciBwaXhlbEF0dHJzID0gW1xyXG4gICd3aWR0aCcsJ2hlaWdodCcsXHJcbiAgJ21hcmdpbicsICdtYXJnaW4tdG9wJywgJ21hcmdpbi1yaWdodCcsICdtYXJnaW4tbGVmdCcsICdtYXJnaW4tYm90dG9tJyxcclxuICAncGFkZGluZycsICdwYWRkaW5nLXRvcCcsICdwYWRkaW5nLXJpZ2h0JywgJ3BhZGRpbmctYm90dG9tJywgJ3BhZGRpbmctbGVmdCdcclxuXVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgbGluazogZnVuY3Rpb24oKSB7XHJcblxyXG4gIH1cclxuLCB1cGRhdGU6IGZ1bmN0aW9uKHN0eWxlcykge1xyXG4gICAgdmFyIGVsID0gdGhpcy5lbDtcclxuICAgIHZhciBzdHlsZVN0ciA9ICcnO1xyXG4gICAgdmFyIGRhc2hLZXksIHZhbDtcclxuXHJcbiAgICBmb3IodmFyIGtleSBpbiBzdHlsZXMpIHtcclxuICAgICAgdmFsID0gc3R5bGVzW2tleV07XHJcblxyXG4gICAgICBkYXNoS2V5ID0ga2V5LnJlcGxhY2UoY2FtZWxSZWcsIGZ1bmN0aW9uICh1cHBlckNoYXIpIHtcclxuICAgICAgICByZXR1cm4gJy0nICsgdXBwZXJDaGFyLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYoIWlzTmFOKHZhbCkgJiYgcGl4ZWxBdHRycy5pbmRleE9mKGRhc2hLZXkpID49IDApIHtcclxuICAgICAgICB2YWwgKz0gJ3B4JztcclxuICAgICAgfVxyXG4gICAgICBzdHlsZVN0ciArPSBkYXNoS2V5ICsgJzogJyArIHZhbCArICc7ICc7XHJcbiAgICB9XHJcbiAgICBpZihlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xyXG4gICAgICAvL+iAgSBJRVxyXG4gICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCBzdHlsZVN0cik7XHJcbiAgICB9ZWxzZXtcclxuICAgICAgZWwuc2V0QXR0cmlidXRlKCdzdHlsZScsIHN0eWxlU3RyKTtcclxuICAgIH1cclxuICB9XHJcbn07IiwiKGZ1bmN0aW9uKHJvb3Qpe1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBleHBvcnRzLnJvb3QgPSByb290O1xuICBleHBvcnRzLmRvY3VtZW50ID0gcm9vdC5kb2N1bWVudCB8fCByZXF1aXJlKCdqc2RvbScpLmpzZG9tKCk7XG5cbn0pKChmdW5jdGlvbigpIHtyZXR1cm4gdGhpc30pKCkpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBvcGVyYXRvcnMgPSB7XG4gICd1bmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICt2OyB9XG4gICwgJy0nOiBmdW5jdGlvbih2KSB7IHJldHVybiAtdjsgfVxuICAsICchJzogZnVuY3Rpb24odikgeyByZXR1cm4gIXY7IH1cblxuICAsICdbJzogZnVuY3Rpb24odil7IHJldHVybiB2OyB9XG4gICwgJ3snOiBmdW5jdGlvbih2KXtcbiAgICAgIHZhciByID0ge307XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gdi5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgclt2W2ldWzBdXSA9IHZbaV1bMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gcjtcbiAgICB9XG4gICwgJ3R5cGVvZic6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdHlwZW9mIHY7IH1cbiAgLCAnbmV3JzogZnVuY3Rpb24odil7IHJldHVybiBuZXcgdiB9XG4gIH1cblxuLCAnYmluYXJ5Jzoge1xuICAgICcrJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCArIHI7IH1cbiAgLCAnLSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLSByOyB9XG4gICwgJyonOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICogcjsgfVxuICAsICcvJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAvIHI7IH1cbiAgLCAnJSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJSByOyB9XG4gICwgJzwnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIDwgcjsgfVxuICAsICc+JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+IHI7IH1cbiAgLCAnPD0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIDw9IHI7IH1cbiAgLCAnPj0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID49IHI7IH1cbiAgLCAnPT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID09IHI7IH1cbiAgLCAnIT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICE9IHI7IH1cbiAgLCAnPT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PT0gcjsgfVxuICAsICchPT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICE9PSByOyB9XG4gICwgJyYmJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAmJiByOyB9XG4gICwgJ3x8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCB8fCByOyB9XG5cbiAgLCAnLic6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKHIpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG4gICwgJ1snOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZih0eXBlb2YgciAhPT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG5cbiAgLCAnKCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gbC5hcHBseShjb250ZXh0LmxvY2FscywgcikgfVxuICAsICd8JzogZnVuY3Rpb24obCwgcil7IHJldHVybiByLmNhbGwoY29udGV4dC5sb2NhbHMsIGwpIH0vL2ZpbHRlci4gbmFtZXxmaWx0ZXJcbiAgLCAnbmV3JzogZnVuY3Rpb24obCwgcil7XG4gICAgICByZXR1cm4gbCA9PT0gRGF0ZSA/IG5ldyBGdW5jdGlvbigncmV0dXJuIG5ldyBEYXRlKCcgKyByLmpvaW4oJywgJykgKyAnKScpKCkgOiBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KGwsIHIpKTtcbiAgICB9XG5cbiAgLCAnaW4nOiBmdW5jdGlvbihsLCByKXtcbiAgICAgIGlmKHRoaXMuYXNzaWdubWVudCkge1xuICAgICAgICAvL3JlcGVhdFxuICAgICAgICByZXR1cm4gcjtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm4gbCBpbiByO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4sICd0ZXJuYXJ5Jzoge1xuICAgICc/JzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZiA/IHMgOiB0OyB9XG4gICwgJygnOiBmdW5jdGlvbihmLCBzLCB0KSB7IHJldHVybiBmW3NdLmFwcGx5KGYsIHQpIH1cblxuICAvL2ZpbHRlci4gbmFtZSB8IGZpbHRlciA6IGFyZzIgOiBhcmczXG4gICwgJ3wnOiBmdW5jdGlvbihmLCBzLCB0KXsgcmV0dXJuIHMuYXBwbHkoY29udGV4dC5sb2NhbHMsIFtmXS5jb25jYXQodCkpOyB9XG4gIH1cbn07XG5cbnZhciBhcmdOYW1lID0gWydmaXJzdCcsICdzZWNvbmQnLCAndGhpcmQnXVxuICAsIGNvbnRleHQsIHN1bW1hcnlcbiAgLCBwYXRoXG4gICwgc2VsZlxuICA7XG5cbi8v6YGN5Y6GIGFzdFxudmFyIGV2YWx1YXRlID0gZnVuY3Rpb24odHJlZSkge1xuICB2YXIgYXJpdHkgPSB0cmVlLmFyaXR5XG4gICAgLCB2YWx1ZSA9IHRyZWUudmFsdWVcbiAgICAsIGFyZ3MgPSBbXVxuICAgICwgbiA9IDBcbiAgICAsIGFyZ1xuICAgICwgcmVzXG4gICAgO1xuXG4gIC8v5pON5L2c56ym5pyA5aSa5Y+q5pyJ5LiJ5YWDXG4gIGZvcig7IG4gPCAzOyBuKyspe1xuICAgIGFyZyA9IHRyZWVbYXJnTmFtZVtuXV07XG4gICAgaWYoYXJnKXtcbiAgICAgIGlmKEFycmF5LmlzQXJyYXkoYXJnKSl7XG4gICAgICAgIGFyZ3Nbbl0gPSBbXTtcbiAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGFyZy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgIGFyZ3Nbbl0ucHVzaCh0eXBlb2YgYXJnW2ldLmtleSA9PT0gJ3VuZGVmaW5lZCcgP1xuICAgICAgICAgICAgZXZhbHVhdGUoYXJnW2ldKSA6IFthcmdbaV0ua2V5LCBldmFsdWF0ZShhcmdbaV0pXSk7XG4gICAgICAgIH1cbiAgICAgIH1lbHNle1xuICAgICAgICBhcmdzW25dID0gZXZhbHVhdGUoYXJnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZihhcml0eSAhPT0gJ2xpdGVyYWwnKSB7XG4gICAgaWYocGF0aCAmJiB2YWx1ZSAhPT0gJy4nICYmIHZhbHVlICE9PSAnWycpIHtcbiAgICAgIHN1bW1hcnkucGF0aHNbcGF0aF0gPSB0cnVlO1xuICAgIH1cbiAgICBpZihhcml0eSA9PT0gJ25hbWUnKSB7XG4gICAgICBwYXRoID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgc3dpdGNoKGFyaXR5KXtcbiAgICBjYXNlICd1bmFyeSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICd0ZXJuYXJ5JzpcbiAgICAgIHRyeXtcbiAgICAgICAgcmVzID0gZ2V0T3BlcmF0b3IoYXJpdHksIHZhbHVlKS5hcHBseSh0cmVlLCBhcmdzKTtcbiAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgLy9jb25zb2xlLmRlYnVnKGUpO1xuICAgICAgfVxuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2xpdGVyYWwnOlxuICAgICAgcmVzID0gdmFsdWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnYXNzaWdubWVudCc6XG4gICAgICBzdW1tYXJ5LmFzc2lnbm1lbnRzW3ZhbHVlXSA9IHRydWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbmFtZSc6XG4gICAgICBzdW1tYXJ5LmxvY2Fsc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gZ2V0VmFsdWUodmFsdWUsIGNvbnRleHQubG9jYWxzKTtcbiAgICBicmVhaztcbiAgICBjYXNlICdmaWx0ZXInOlxuICAgICAgc3VtbWFyeS5maWx0ZXJzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBjb250ZXh0LmZpbHRlcnNbdmFsdWVdO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RoaXMnOlxuICAgICAgcmVzID0gY29udGV4dC5sb2NhbHM7Ly9UT0RPIHRoaXMg5oyH5ZCRIHZtIOi/mOaYryBkaXI/XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cbmZ1bmN0aW9uIGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSl7XG4gIHJldHVybiBvcGVyYXRvcnNbYXJpdHldW3ZhbHVlXSB8fCBmdW5jdGlvbigpIHsgcmV0dXJuOyB9XG59XG5cbmZ1bmN0aW9uIHJlc2V0KHNjb3BlLCB0aGF0KSB7XG4gIGlmKHNjb3BlKSB7XG4gICAgY29udGV4dCA9IHtsb2NhbHM6IHNjb3BlIHx8IHt9LCBmaWx0ZXJzOiBzY29wZS4kZmlsdGVycyB8fCB7fX07XG4gIH1lbHNle1xuICAgIGNvbnRleHQgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge319O1xuICB9XG4gIGlmKHRoYXQpe1xuICAgIHNlbGYgPSB0aGF0O1xuICB9XG5cbiAgc3VtbWFyeSA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fSwgcGF0aHM6IHt9LCBhc3NpZ25tZW50czoge319O1xuICBwYXRoID0gJyc7XG59XG5cbi8v5Zyo5L2c55So5Z+f5Lit5p+l5om+5YC8XG52YXIgZ2V0VmFsdWUgPSBmdW5jdGlvbiAoa2V5LCBzY29wZSkge1xuICBpZihzY29wZS4kZ2V0KSB7XG4gICAgcmV0dXJuIHNjb3BlLiRnZXQoa2V5LCBmYWxzZSlcbiAgfWVsc2V7XG4gICAgcmV0dXJuIHNjb3BlW2tleV1cbiAgfVxufVxuXG4vL+ihqOi+vuW8j+axguWAvFxuLy90cmVlOiBwYXJzZXIg55Sf5oiQ55qEIGFzdFxuLy9zY29wZSDmiafooYznjq/looNcbmV4cG9ydHMuZXZhbCA9IGZ1bmN0aW9uKHRyZWUsIHNjb3BlLCB0aGF0KSB7XG4gIHJlc2V0KHNjb3BlIHx8IHt9LCB0aGF0KTtcblxuICByZXR1cm4gZXZhbHVhdGUodHJlZSk7XG59O1xuXG4vL+ihqOi+vuW8j+aRmOimgVxuLy9yZXR1cm46IHtmaWx0ZXJzOltdLCBsb2NhbHM6W10sIHBhdGhzOiBbXSwgYXNzaWdubWVudHM6IFtdfVxuZXhwb3J0cy5zdW1tYXJ5ID0gZnVuY3Rpb24odHJlZSkge1xuICByZXNldCgpO1xuXG4gIGV2YWx1YXRlKHRyZWUpO1xuXG4gIGlmKHBhdGgpIHtcbiAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgfVxuICBmb3IodmFyIGtleSBpbiBzdW1tYXJ5KSB7XG4gICAgc3VtbWFyeVtrZXldID0gT2JqZWN0LmtleXMoc3VtbWFyeVtrZXldKTtcbiAgfVxuICByZXR1cm4gc3VtbWFyeTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcclxuXHJcbmV4cG9ydHMuYWRkRXZlbnQgPSBmdW5jdGlvbiBhZGRFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcclxuICBpZihlbC5hZGRFdmVudExpc3RlbmVyKSB7XHJcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyLCBmYWxzZSk7XHJcbiAgfWVsc2V7XHJcbiAgICBlbC5hdHRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0cy5yZW1vdmVFdmVudCA9IGZ1bmN0aW9uIHJlbW92ZUV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xyXG4gIGlmKGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcclxuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIpO1xyXG4gIH1lbHNle1xyXG4gICAgZWwuZGV0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcclxuICB9XHJcbn0iLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbnZhciBFdmVudCA9IHtcbiAgLy/nm5HlkKzoh6rlrprkuYnkuovku7YuXG4gIG9uOiBmdW5jdGlvbihuYW1lLCBoYW5kbGVyLCBjb250ZXh0KSB7XG4gICAgdmFyIGN0eCA9IGNvbnRleHQgfHwgdGhpc1xuICAgICAgO1xuXG4gICAgY3R4Ll9oYW5kbGVycyA9IGN0eC5faGFuZGxlcnMgfHwge307XG4gICAgY3R4Ll9oYW5kbGVyc1tuYW1lXSA9IGN0eC5faGFuZGxlcnNbbmFtZV0gfHwgW107XG5cbiAgICBjdHguX2hhbmRsZXJzW25hbWVdLnB1c2goe2hhbmRsZXI6IGhhbmRsZXIsIGNvbnRleHQ6IGNvbnRleHQsIGN0eDogY3R4fSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG4gIG9uZTogZnVuY3Rpb24gKG5hbWUsIGhhbmRsZXIsIGNvbnRleHQpIHtcbiAgICBpZihoYW5kbGVyKXtcbiAgICAgIGhhbmRsZXIub25lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMub24obmFtZSwgaGFuZGxlciwgY29udGV4dCk7XG4gIH0sXG4gIC8v56e76Zmk55uR5ZCs5LqL5Lu2LlxuICBvZmY6IGZ1bmN0aW9uKG5hbWUsIGhhbmRsZXIsIGNvbnRleHQpIHtcbiAgICB2YXIgY3R4ID0gY29udGV4dCB8fCB0aGlzXG4gICAgICAsIGhhbmRsZXJzID0gY3R4Ll9oYW5kbGVyc1xuICAgICAgO1xuXG4gICAgaWYobmFtZSAmJiBoYW5kbGVyc1tuYW1lXSl7XG4gICAgICBpZih1dGlscy5pc0Z1bmN0aW9uKGhhbmRsZXIpKXtcbiAgICAgICAgZm9yKHZhciBpID0gaGFuZGxlcnNbbmFtZV0ubGVuZ3RoIC0gMTsgaSA+PTA7IGktLSkge1xuICAgICAgICAgIGlmKGhhbmRsZXJzW25hbWVdW2ldLmhhbmRsZXIgPT09IGhhbmRsZXIpe1xuICAgICAgICAgICAgaGFuZGxlcnNbbmFtZV0uc3BsaWNlKGksIDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGhhbmRsZXJzW25hbWVdID0gW107XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9LFxuICAvL+inpuWPkeiHquWumuS5ieS6i+S7ti5cbiAgLy/or6Xmlrnms5XmsqHmnInmj5DkvpvpnZnmgIHljJbnmoQgY29udGV4dCDlj4LmlbAuIOWmguimgemdmeaAgeWMluS9v+eUqCwg5bqU6K+lOiBgRXZlbnQudHJpZ2dlci5jYWxsKGNvbnRleHQsIG5hbWUsIGRhdGEpYFxuICB0cmlnZ2VyOiBmdW5jdGlvbihuYW1lLCBkYXRhKSB7XG4gICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSlcbiAgICAgICwgaGFuZGxlcnMgPSB0aGlzLl9oYW5kbGVycyAmJiB0aGlzLl9oYW5kbGVyc1tuYW1lXVxuICAgICAgO1xuXG4gICAgaWYoaGFuZGxlcnMpe1xuICAgICAgZm9yKHZhciBpID0gMCwgaXRlbTsgaXRlbSA9IGhhbmRsZXJzW2ldOyBpKyspIHtcbiAgICAgICAgaXRlbS5oYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgICAgICBpZihpdGVtLmhhbmRsZXIub25lKSB7XG4gICAgICAgICAgaGFuZGxlcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFdmVudDtcbiIsIlwidXNlIHN0cmljdFwiO1xuLy9KYXZhc2NyaXB0IGV4cHJlc3Npb24gcGFyc2VyIG1vZGlmaWVkIGZvcm0gQ3JvY2tmb3JkJ3MgVERPUCBwYXJzZXJcbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG5cdGZ1bmN0aW9uIEYoKSB7fVxuXHRGLnByb3RvdHlwZSA9IG87XG5cdHJldHVybiBuZXcgRigpO1xufTtcblxudmFyIHNvdXJjZTtcblxudmFyIGVycm9yID0gZnVuY3Rpb24gKG1lc3NhZ2UsIHQpIHtcblx0dCA9IHQgfHwgdGhpcztcbiAgdmFyIG1zZyA9IG1lc3NhZ2UgKz0gXCIgQnV0IGZvdW5kICdcIiArIHQudmFsdWUgKyBcIidcIiArICh0LmZyb20gPyBcIiBhdCBcIiArIHQuZnJvbSA6IFwiXCIpICsgXCIgaW4gJ1wiICsgc291cmNlICsgXCInXCI7XG4gIHZhciBlID0gbmV3IEVycm9yKG1zZyk7XG5cdGUubmFtZSA9IHQubmFtZSA9IFwiU3ludGF4RXJyb3JcIjtcblx0dC5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhyb3cgZTtcbn07XG5cbnZhciB0b2tlbml6ZSA9IGZ1bmN0aW9uIChjb2RlLCBwcmVmaXgsIHN1ZmZpeCkge1xuXHR2YXIgYzsgLy8gVGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgZnJvbTsgLy8gVGhlIGluZGV4IG9mIHRoZSBzdGFydCBvZiB0aGUgdG9rZW4uXG5cdHZhciBpID0gMDsgLy8gVGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGNoYXJhY3Rlci5cblx0dmFyIGxlbmd0aCA9IGNvZGUubGVuZ3RoO1xuXHR2YXIgbjsgLy8gVGhlIG51bWJlciB2YWx1ZS5cblx0dmFyIHE7IC8vIFRoZSBxdW90ZSBjaGFyYWN0ZXIuXG5cdHZhciBzdHI7IC8vIFRoZSBzdHJpbmcgdmFsdWUuXG5cdHZhciBmOyAvL1RoZSByZWdleHAgZmxhZy5cblxuXHR2YXIgcmVzdWx0ID0gW107IC8vIEFuIGFycmF5IHRvIGhvbGQgdGhlIHJlc3VsdHMuXG5cblx0Ly8gTWFrZSBhIHRva2VuIG9iamVjdC5cblx0dmFyIG1ha2UgPSBmdW5jdGlvbiAodHlwZSwgdmFsdWUpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZSA6IHR5cGUsXG5cdFx0XHR2YWx1ZSA6IHZhbHVlLFxuXHRcdFx0ZnJvbSA6IGZyb20sXG5cdFx0XHR0byA6IGlcblx0XHR9O1xuXHR9O1xuXG5cdC8vIEJlZ2luIHRva2VuaXphdGlvbi4gSWYgdGhlIHNvdXJjZSBzdHJpbmcgaXMgZW1wdHksIHJldHVybiBub3RoaW5nLlxuXHRpZiAoIWNvZGUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBMb29wIHRocm91Z2ggY29kZSB0ZXh0LCBvbmUgY2hhcmFjdGVyIGF0IGEgdGltZS5cblx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHR3aGlsZSAoYykge1xuXHRcdGZyb20gPSBpO1xuXG5cdFx0aWYgKGMgPD0gJyAnKSB7IC8vIElnbm9yZSB3aGl0ZXNwYWNlLlxuXHRcdFx0aSArPSAxO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH0gZWxzZSBpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8IGMgPT09ICckJyB8fCBjID09PSAnXycpIHsgLy8gbmFtZS5cblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8XG5cdFx0XHRcdFx0KGMgPj0gJzAnICYmIGMgPD0gJzknKSB8fCBjID09PSAnXycpIHtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ25hbWUnLCBzdHIpKTtcblx0XHR9IGVsc2UgaWYgKGMgPj0gJzAnICYmIGMgPD0gJzknKSB7XG5cdFx0XHQvLyBudW1iZXIuXG5cblx0XHRcdC8vIEEgbnVtYmVyIGNhbm5vdCBzdGFydCB3aXRoIGEgZGVjaW1hbCBwb2ludC4gSXQgbXVzdCBzdGFydCB3aXRoIGEgZGlnaXQsXG5cdFx0XHQvLyBwb3NzaWJseSAnMCcuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXG5cdFx0XHQvLyBMb29rIGZvciBtb3JlIGRpZ2l0cy5cblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIGZvciBhIGRlY2ltYWwgZnJhY3Rpb24gcGFydC5cblx0XHRcdGlmIChjID09PSAnLicpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYW4gZXhwb25lbnQgcGFydC5cblx0XHRcdGlmIChjID09PSAnZScgfHwgYyA9PT0gJ0UnKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPT09ICctJyB8fCBjID09PSAnKycpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBleHBvbmVudFwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fSB3aGlsZSAoYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlIG5leHQgY2hhcmFjdGVyIGlzIG5vdCBhIGxldHRlci5cblxuXHRcdFx0aWYgKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlIHRvIGEgbnVtYmVyLiBJZiBpdCBpcyBmaW5pdGUsIHRoZW4gaXQgaXMgYSBnb29kXG5cdFx0XHQvLyB0b2tlbi5cblxuXHRcdFx0biA9ICtzdHI7XG5cdFx0XHRpZiAoaXNGaW5pdGUobikpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnbnVtYmVyJywgbikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXJyb3IoXCJCYWQgbnVtYmVyXCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzdHJpbmdcblxuXHRcdH0gZWxzZSBpZiAoYyA9PT0gJ1xcJycgfHwgYyA9PT0gJ1wiJykge1xuXHRcdFx0c3RyID0gJyc7XG5cdFx0XHRxID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJyAnKSB7XG5cdFx0XHRcdFx0bWFrZSgnc3RyaW5nJywgc3RyKTtcblx0XHRcdFx0XHRlcnJvcihjID09PSAnXFxuJyB8fCBjID09PSAnXFxyJyB8fCBjID09PSAnJyA/XG5cdFx0XHRcdFx0XHRcIlVudGVybWluYXRlZCBzdHJpbmcuXCIgOlxuXHRcdFx0XHRcdFx0XCJDb250cm9sIGNoYXJhY3RlciBpbiBzdHJpbmcuXCIsIG1ha2UoJycsIHN0cikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgdGhlIGNsb3NpbmcgcXVvdGUuXG5cblx0XHRcdFx0aWYgKGMgPT09IHEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIGVzY2FwZW1lbnQuXG5cblx0XHRcdFx0aWYgKGMgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdHN3aXRjaCAoYykge1xuXHRcdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcZic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICduJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndCc6XG5cdFx0XHRcdFx0XHRjID0gJ1xcdCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1Jzpcblx0XHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gcGFyc2VJbnQoY29kZS5zdWJzdHIoaSArIDEsIDQpLCAxNik7XG5cdFx0XHRcdFx0XHRpZiAoIWlzRmluaXRlKGMpIHx8IGMgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuXHRcdFx0XHRcdFx0aSArPSA0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0Ly8gcmVnZXhwXG5cdFx0fWVsc2UgaWYoYyA9PT0gJy8nICYmIGZhbHNlKXtcblx0XHRcdGkgKz0gMTtcblx0XHRcdHN0ciA9ICcnO1xuXHRcdFx0ZiA9ICcnO1xuXHRcdFx0Zm9yKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXG5cdFx0XHRcdC8vIExvb2sgZm9yIGNsb3NlIHNsYXNoXG5cblx0XHRcdFx0aWYoYyA9PT0gJy8nKSB7XG5cdFx0XHRcdFx0Zm9yKDsgOyApIHtcblx0XHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpICsgMSk7XG5cdFx0XHRcdFx0XHRpZigoYyA+PSAnYScgJiYgYyA8PSAneicpIHx8IChjID49ICdBJyAmJiBjIDw9ICdaJykgfHwgYyA9PT0gJyQnIHx8IGMgPT09ICdfJykge1xuXHRcdFx0XHRcdFx0XHRmICs9IGM7XG5cdFx0XHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRcdH1lbHNle1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZihjID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCByZWdleHBcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRjID0gJ1xcXFwnICsgYztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgncmVnZXhwJywgbmV3IFJlZ0V4cChzdHIsIGYpKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdC8vIGNvbWJpbmluZ1xuXG5cdFx0fSBlbHNlIGlmIChwcmVmaXguaW5kZXhPZihjKSA+PSAwKSB7XG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoaSA+PSBsZW5ndGggfHwgc3VmZml4LmluZGV4T2YoYykgPCAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgc3RyKSk7XG5cblx0XHRcdC8vIHNpbmdsZS1jaGFyYWN0ZXIgb3BlcmF0b3JcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdvcGVyYXRvcicsIGMpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBtYWtlX3BhcnNlID0gZnVuY3Rpb24gKHZhcnMpIHtcblx0dmFycyA9IHZhcnMgfHwge307Ly/pooTlrprkuYnnmoTlj5jph49cblx0dmFyIHN5bWJvbF90YWJsZSA9IHt9O1xuXHR2YXIgdG9rZW47XG5cdHZhciB0b2tlbnM7XG5cdHZhciB0b2tlbl9ucjtcblx0dmFyIGNvbnRleHQ7XG5cblx0dmFyIGl0c2VsZiA9IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHR2YXIgZmluZCA9IGZ1bmN0aW9uIChuKSB7XG5cdFx0bi5udWQgPSBpdHNlbGY7XG5cdFx0bi5sZWQgPSBudWxsO1xuXHRcdG4uc3RkID0gbnVsbDtcblx0XHRuLmxicCA9IDA7XG5cdFx0cmV0dXJuIG47XG5cdH07XG5cblx0dmFyIGFkdmFuY2UgPSBmdW5jdGlvbiAoaWQpIHtcblx0XHR2YXIgYSwgbywgdCwgdjtcblx0XHRpZiAoaWQgJiYgdG9rZW4uaWQgIT09IGlkKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkICdcIiArIGlkICsgXCInLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICh0b2tlbl9uciA+PSB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHR0b2tlbiA9IHN5bWJvbF90YWJsZVtcIihlbmQpXCJdO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ID0gdG9rZW5zW3Rva2VuX25yXTtcblx0XHR0b2tlbl9uciArPSAxO1xuXHRcdHYgPSB0LnZhbHVlO1xuXHRcdGEgPSB0LnR5cGU7XG5cdFx0aWYgKChhID09PSBcIm9wZXJhdG9yXCIgfHwgYSAhPT0gJ3N0cmluZycpICYmIHYgaW4gc3ltYm9sX3RhYmxlKSB7XG5cdFx0XHQvL3RydWUsIGZhbHNlIOetieebtOaOpemHj+S5n+S8mui/m+WFpeatpOWIhuaUr1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVt2XTtcblx0XHRcdGlmICghbykge1xuXHRcdFx0XHRlcnJvcihcIlVua25vd24gb3BlcmF0b3IuXCIsIHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJuYW1lXCIpIHtcblx0XHRcdG8gPSBmaW5kKHQpO1xuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJzdHJpbmdcIiB8fCBhID09PSBcIm51bWJlclwiIHx8IGEgPT09IFwicmVnZXhwXCIpIHtcblx0XHRcdG8gPSBzeW1ib2xfdGFibGVbXCIobGl0ZXJhbClcIl07XG5cdFx0XHRhID0gXCJsaXRlcmFsXCI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVycm9yKFwiVW5leHBlY3RlZCB0b2tlbi5cIiwgdCk7XG5cdFx0fVxuXHRcdHRva2VuID0gY3JlYXRlKG8pO1xuXHRcdHRva2VuLmZyb20gPSB0LmZyb207XG5cdFx0dG9rZW4udG8gPSB0LnRvO1xuXHRcdHRva2VuLnZhbHVlID0gdjtcblx0XHR0b2tlbi5hcml0eSA9IGE7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9O1xuXG5cdHZhciBleHByZXNzaW9uID0gZnVuY3Rpb24gKHJicCkge1xuXHRcdHZhciBsZWZ0O1xuXHRcdHZhciB0ID0gdG9rZW47XG5cdFx0YWR2YW5jZSgpO1xuXHRcdGxlZnQgPSB0Lm51ZCgpO1xuXHRcdHdoaWxlIChyYnAgPCB0b2tlbi5sYnApIHtcblx0XHRcdHQgPSB0b2tlbjtcblx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdGxlZnQgPSB0LmxlZChsZWZ0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGxlZnQ7XG5cdH07XG5cblx0dmFyIG9yaWdpbmFsX3N5bWJvbCA9IHtcblx0XHRudWQgOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlcnJvcihcIlVuZGVmaW5lZC5cIiwgdGhpcyk7XG5cdFx0fSxcblx0XHRsZWQgOiBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0ZXJyb3IoXCJNaXNzaW5nIG9wZXJhdG9yLlwiLCB0aGlzKTtcblx0XHR9XG5cdH07XG5cblx0dmFyIHN5bWJvbCA9IGZ1bmN0aW9uIChpZCwgYnApIHtcblx0XHR2YXIgcyA9IHN5bWJvbF90YWJsZVtpZF07XG5cdFx0YnAgPSBicCB8fCAwO1xuXHRcdGlmIChzKSB7XG5cdFx0XHRpZiAoYnAgPj0gcy5sYnApIHtcblx0XHRcdFx0cy5sYnAgPSBicDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cyA9IGNyZWF0ZShvcmlnaW5hbF9zeW1ib2wpO1xuXHRcdFx0cy5pZCA9IHMudmFsdWUgPSBpZDtcblx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHRzeW1ib2xfdGFibGVbaWRdID0gcztcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGNvbnN0YW50ID0gZnVuY3Rpb24gKHMsIHYsIGEpIHtcblx0XHR2YXIgeCA9IHN5bWJvbChzKTtcblx0XHR4Lm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBzeW1ib2xfdGFibGVbdGhpcy5pZF0udmFsdWU7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHgudmFsdWUgPSB2O1xuXHRcdHJldHVybiB4O1xuXHR9O1xuXG5cdHZhciBpbmZpeCA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgaW5maXhyID0gZnVuY3Rpb24gKGlkLCBicCwgbGVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQsIGJwKTtcblx0XHRzLmxlZCA9IGxlZCB8fCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oYnAgLSAxKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgcHJlZml4ID0gZnVuY3Rpb24gKGlkLCBudWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCk7XG5cdFx0cy5udWQgPSBudWQgfHwgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzApO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0c3ltYm9sKFwiKGVuZClcIik7XG5cdHN5bWJvbChcIihuYW1lKVwiKTtcblx0c3ltYm9sKFwiOlwiKTtcblx0c3ltYm9sKFwiKVwiKTtcblx0c3ltYm9sKFwiXVwiKTtcblx0c3ltYm9sKFwifVwiKTtcblx0c3ltYm9sKFwiLFwiKTtcblxuXHRjb25zdGFudChcInRydWVcIiwgdHJ1ZSk7XG5cdGNvbnN0YW50KFwiZmFsc2VcIiwgZmFsc2UpO1xuXHRjb25zdGFudChcIm51bGxcIiwgbnVsbCk7XG5cdGNvbnN0YW50KFwidW5kZWZpbmVkXCIpO1xuXG5cdGNvbnN0YW50KFwiTWF0aFwiLCBNYXRoKTtcblx0Y29uc3RhbnQoXCJEYXRlXCIsIERhdGUpO1xuXHRmb3IodmFyIHYgaW4gdmFycykge1xuXHRcdGNvbnN0YW50KHYsIHZhcnNbdl0pO1xuXHR9XG5cblx0c3ltYm9sKFwiKGxpdGVyYWwpXCIpLm51ZCA9IGl0c2VsZjtcblxuXHRzeW1ib2woXCJ0aGlzXCIpLm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0ICB0aGlzLmFyaXR5ID0gXCJ0aGlzXCI7XG5cdCAgcmV0dXJuIHRoaXM7XG5cdH07XG5cblx0Ly9PcGVyYXRvciBQcmVjZWRlbmNlOlxuXHQvL2h0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL09wZXJhdG9ycy9PcGVyYXRvcl9QcmVjZWRlbmNlXG5cblx0aW5maXgoXCI/XCIsIDIwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHR0aGlzLnRoaXJkID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4cihcIiYmXCIsIDMxKTtcblx0aW5maXhyKFwifHxcIiwgMzApO1xuXG5cdGluZml4cihcIj09PVwiLCA0MCk7XG5cdGluZml4cihcIiE9PVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPFwiLCA0MCk7XG5cdGluZml4cihcIjw9XCIsIDQwKTtcblx0aW5maXhyKFwiPlwiLCA0MCk7XG5cdGluZml4cihcIj49XCIsIDQwKTtcblxuXHRpbmZpeChcImluXCIsIDQ1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRpZiAoY29udGV4dCA9PT0gJ3JlcGVhdCcpIHtcblx0XHRcdC8vIGBpbmAgYXQgcmVwZWF0IGJsb2NrXG5cdFx0XHRsZWZ0LmFyaXR5ID0gJ2Fzc2lnbm1lbnQnO1xuXHRcdFx0dGhpcy5hc3NpZ25tZW50ID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiK1wiLCA1MCk7XG5cdGluZml4KFwiLVwiLCA1MCk7XG5cblx0aW5maXgoXCIqXCIsIDYwKTtcblx0aW5maXgoXCIvXCIsIDYwKTtcblx0aW5maXgoXCIlXCIsIDYwKTtcblxuXHRpbmZpeChcIihcIiwgNzAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAobGVmdC5pZCA9PT0gXCIuXCIgfHwgbGVmdC5pZCA9PT0gXCJbXCIpIHtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0LmZpcnN0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBsZWZ0LnNlY29uZDtcblx0XHRcdHRoaXMudGhpcmQgPSBhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0aWYgKChsZWZ0LmFyaXR5ICE9PSBcInVuYXJ5XCIgfHwgbGVmdC5pZCAhPT0gXCJmdW5jdGlvblwiKSAmJlxuXHRcdFx0XHRsZWZ0LmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBsZWZ0LmFyaXR5ICE9PSBcImxpdGVyYWxcIiAmJiBsZWZ0LmlkICE9PSBcIihcIiAmJlxuXHRcdFx0XHRsZWZ0LmlkICE9PSBcIiYmXCIgJiYgbGVmdC5pZCAhPT0gXCJ8fFwiICYmIGxlZnQuaWQgIT09IFwiP1wiKSB7XG5cdFx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSB2YXJpYWJsZSBuYW1lLlwiLCBsZWZ0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIilcIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIi5cIiwgODAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0aWYgKHRva2VuLmFyaXR5ICE9PSBcIm5hbWVcIikge1xuXHRcdFx0ZXJyb3IoXCJFeHBlY3RlZCBhIHByb3BlcnR5IG5hbWUuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0dG9rZW4uYXJpdHkgPSBcImxpdGVyYWxcIjtcblx0XHR0aGlzLnNlY29uZCA9IHRva2VuO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCJbXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0Ly9maWx0ZXJcblx0aW5maXgoXCJ8XCIsIDEwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhO1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRva2VuLmFyaXR5ID0gJ2ZpbHRlcic7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDEwKTtcblx0XHR0aGlzLmFyaXR5ID0gJ2JpbmFyeSc7XG5cdFx0aWYgKHRva2VuLmlkID09PSAnOicpIHtcblx0XHRcdHRoaXMuYXJpdHkgPSAndGVybmFyeSc7XG5cdFx0XHR0aGlzLnRoaXJkID0gYSA9IFtdO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YWR2YW5jZSgnOicpO1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigwKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCI6XCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KFwiIVwiKTtcblx0cHJlZml4KFwiLVwiKTtcblx0cHJlZml4KFwidHlwZW9mXCIpO1xuXG5cdHByZWZpeChcIihcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBlID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gZTtcblx0fSk7XG5cblx0cHJlZml4KFwiW1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwiXVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigwKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0dGhpcy5maXJzdCA9IGE7XG5cdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KFwie1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXSxcdG4sIHY7XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIn1cIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0biA9IHRva2VuO1xuXHRcdFx0XHRpZiAobi5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbi5hcml0eSAhPT0gXCJsaXRlcmFsXCIpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBwcm9wZXJ0eSBuYW1lOiBcIiwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdFx0YWR2YW5jZShcIjpcIik7XG5cdFx0XHRcdHYgPSBleHByZXNzaW9uKDApO1xuXHRcdFx0XHR2LmtleSA9IG4udmFsdWU7XG5cdFx0XHRcdGEucHVzaCh2KTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwifVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoJ25ldycsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDc5KTtcblx0XHRpZih0b2tlbi5pZCA9PT0gJygnKSB7XG5cdFx0XHRhZHZhbmNlKFwiKFwiKTtcblx0XHRcdHRoaXMuYXJpdHkgPSAnYmluYXJ5Jztcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdFx0YWR2YW5jZShcIilcIik7XG5cdFx0fWVsc2V7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cbiAgLy9wcmVmaXgoJy8nLCBmdW5jdGlvbigpIHtcbiAgLy8gIHZhciBhID0gW10sIG4sIHY7XG4gIC8vICBpZih0b2tlbi5pZCAhPT0gJy8nKSB7XG4gIC8vICAgIHdoaWxlKHRydWUpIHtcbiAgLy8gICAgICBuID0gdG9rZW47XG4gIC8vICAgICAgYWR2YW5jZSgpO1xuICAvLyAgICB9XG4gIC8vICB9XG4gIC8vICBhZHZhbmNlKCcvJyk7XG4gIC8vICB0aGlzLmZpcnN0ID0gYTtcbiAgLy8gIHJldHVybiB0aGlzO1xuICAvL30pXG5cblx0Ly9fc291cmNlOiDooajovr7lvI/ku6PnoIHlrZfnrKbkuLJcblx0Ly9fY29udGV4dDog6KGo6L6+5byP55qE6K+t5Y+l546v5aKDXG5cdHJldHVybiBmdW5jdGlvbiAoX3NvdXJjZSwgX2NvbnRleHQpIHtcbiAgICBzb3VyY2UgPSBfc291cmNlO1xuXHRcdHRva2VucyA9IHRva2VuaXplKF9zb3VyY2UsICc9PD4hKy0qJnwvJV4nLCAnPTw+JnwnKTtcblx0XHR0b2tlbl9uciA9IDA7XG5cdFx0Y29udGV4dCA9IF9jb250ZXh0O1xuXHRcdGFkdmFuY2UoKTtcblx0XHR2YXIgcyA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIihlbmQpXCIpO1xuXHRcdHJldHVybiBzO1xuXHR9O1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IG1ha2VfcGFyc2UoKTtcbiIsInZhciB0b2tlblJlZyA9IC97eyh7KFtefVxcbl0rKX18W159XFxuXSspfX0vZztcblxuLy/lrZfnrKbkuLLkuK3mmK/lkKbljIXlkKvmqKHmnb/ljaDkvY3nrKbmoIforrBcbmZ1bmN0aW9uIGhhc1Rva2VuKHN0cikge1xuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICByZXR1cm4gc3RyICYmIHRva2VuUmVnLnRlc3Qoc3RyKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VUb2tlbih2YWx1ZSkge1xuICB2YXIgdG9rZW5zID0gW11cbiAgICAsIHRleHRNYXAgPSBbXVxuICAgICwgc3RhcnQgPSAwXG4gICAgLCB2YWwsIHRva2VuXG4gICAgO1xuICBcbiAgdG9rZW5SZWcubGFzdEluZGV4ID0gMDtcbiAgXG4gIHdoaWxlKCh2YWwgPSB0b2tlblJlZy5leGVjKHZhbHVlKSkpe1xuICAgIGlmKHRva2VuUmVnLmxhc3RJbmRleCAtIHN0YXJ0ID4gdmFsWzBdLmxlbmd0aCl7XG4gICAgICB0ZXh0TWFwLnB1c2godmFsdWUuc2xpY2Uoc3RhcnQsIHRva2VuUmVnLmxhc3RJbmRleCAtIHZhbFswXS5sZW5ndGgpKTtcbiAgICB9XG4gICAgXG4gICAgdG9rZW4gPSB7XG4gICAgICBlc2NhcGU6ICF2YWxbMl1cbiAgICAsIHBhdGg6ICh2YWxbMl0gfHwgdmFsWzFdKS50cmltKClcbiAgICAsIHBvc2l0aW9uOiB0ZXh0TWFwLmxlbmd0aFxuICAgICwgdGV4dE1hcDogdGV4dE1hcFxuICAgIH07XG4gICAgXG4gICAgdG9rZW5zLnB1c2godG9rZW4pO1xuICAgIFxuICAgIC8v5LiA5Liq5byV55So57G75Z6LKOaVsOe7hCnkvZzkuLroioLngrnlr7nosaHnmoTmlofmnKzlm74sIOi/meagt+W9k+afkOS4gOS4quW8leeUqOaUueWPmOS6huS4gOS4quWAvOWQjiwg5YW25LuW5byV55So5Y+W5b6X55qE5YC86YO95Lya5ZCM5pe25pu05pawXG4gICAgdGV4dE1hcC5wdXNoKHZhbFswXSk7XG4gICAgXG4gICAgc3RhcnQgPSB0b2tlblJlZy5sYXN0SW5kZXg7XG4gIH1cbiAgXG4gIGlmKHZhbHVlLmxlbmd0aCA+IHN0YXJ0KXtcbiAgICB0ZXh0TWFwLnB1c2godmFsdWUuc2xpY2Uoc3RhcnQsIHZhbHVlLmxlbmd0aCkpO1xuICB9XG4gIFxuICB0b2tlbnMudGV4dE1hcCA9IHRleHRNYXA7XG4gIFxuICByZXR1cm4gdG9rZW5zO1xufVxuXG5leHBvcnRzLmhhc1Rva2VuID0gaGFzVG9rZW47XG5cbmV4cG9ydHMucGFyc2VUb2tlbiA9IHBhcnNlVG9rZW47IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8vdXRpbHNcbi8vLS0tXG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50O1xuXG52YXIga2V5UGF0aFJlZyA9IC8oPzpcXC58XFxbKS9nXG4gICwgYnJhID0gL1xcXS9nXG4gIDtcblxuLy/lsIYga2V5UGF0aCDovazkuLrmlbDnu4TlvaLlvI9cbi8vcGF0aC5rZXksIHBhdGhba2V5XSAtLT4gWydwYXRoJywgJ2tleSddXG5mdW5jdGlvbiBwYXJzZUtleVBhdGgoa2V5UGF0aCl7XG4gIHJldHVybiBrZXlQYXRoLnJlcGxhY2UoYnJhLCAnJykuc3BsaXQoa2V5UGF0aFJlZyk7XG59XG5cbi8qKlxuICog5ZCI5bm25a+56LGhXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtkZWVwPWZhbHNlXSDmmK/lkKbmt7HluqblkIjlubZcbiAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQg55uu5qCH5a+56LGhXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdC4uLl0g5p2l5rqQ5a+56LGhXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0g5ZCI5bm25ZCO55qEIHRhcmdldCDlr7nosaFcbiAqL1xuZnVuY3Rpb24gZXh0ZW5kKC8qIGRlZXAsIHRhcmdldCwgb2JqZWN0Li4uICovKSB7XG4gIHZhciBvcHRpb25zXG4gICAgLCBuYW1lLCBzcmMsIGNvcHksIGNvcHlJc0FycmF5LCBjbG9uZVxuICAgICwgdGFyZ2V0ID0gYXJndW1lbnRzWzBdIHx8IHt9XG4gICAgLCBpID0gMVxuICAgICwgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aFxuICAgICwgZGVlcCA9IGZhbHNlXG4gICAgO1xuXG4gIC8vIEhhbmRsZSBhIGRlZXAgY29weSBzaXR1YXRpb25cbiAgaWYgKHR5cGVvZiB0YXJnZXQgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgZGVlcCA9IHRhcmdldDtcblxuICAgIC8vIHNraXAgdGhlIGJvb2xlYW4gYW5kIHRoZSB0YXJnZXRcbiAgICB0YXJnZXQgPSBhcmd1bWVudHNbIGkgXSB8fCB7fTtcbiAgICBpKys7XG4gIH1cblxuICBpZih1dGlscy5pc0Z1bmN0aW9uKGFyZ3VtZW50c1tsZW5ndGggLSAxXSkpIHtcbiAgICBsZW5ndGgtLTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBjYXNlIHdoZW4gdGFyZ2V0IGlzIGEgc3RyaW5nIG9yIHNvbWV0aGluZyAocG9zc2libGUgaW4gZGVlcCBjb3B5KVxuICBpZiAodHlwZW9mIHRhcmdldCAhPT0gXCJvYmplY3RcIiAmJiAhdXRpbHMuaXNGdW5jdGlvbih0YXJnZXQpKSB7XG4gICAgdGFyZ2V0ID0ge307XG4gIH1cblxuICBmb3IgKCA7IGkgPCBsZW5ndGg7IGkrKyApIHtcbiAgICAvLyBPbmx5IGRlYWwgd2l0aCBub24tbnVsbC91bmRlZmluZWQgdmFsdWVzXG4gICAgaWYgKCAob3B0aW9ucyA9IGFyZ3VtZW50c1sgaSBdKSAhPSBudWxsICkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBiYXNlIG9iamVjdFxuICAgICAgZm9yICggbmFtZSBpbiBvcHRpb25zICkge1xuICAgICAgICAvL2FuZHJvaWQgMi4zIGJyb3dzZXIgY2FuIGVudW0gdGhlIHByb3RvdHlwZSBvZiBjb25zdHJ1Y3Rvci4uLlxuICAgICAgICBpZihvcHRpb25zLmhhc093blByb3BlcnR5KG5hbWUpICYmIG5hbWUgIT09ICdwcm90b3R5cGUnKXtcbiAgICAgICAgICBzcmMgPSB0YXJnZXRbIG5hbWUgXTtcbiAgICAgICAgICBjb3B5ID0gb3B0aW9uc1sgbmFtZSBdO1xuXG5cbiAgICAgICAgICAvLyBSZWN1cnNlIGlmIHdlJ3JlIG1lcmdpbmcgcGxhaW4gb2JqZWN0cyBvciBhcnJheXNcbiAgICAgICAgICBpZiAoIGRlZXAgJiYgY29weSAmJiAoIHV0aWxzLmlzUGxhaW5PYmplY3QoY29weSkgfHwgKGNvcHlJc0FycmF5ID0gdXRpbHMuaXNBcnJheShjb3B5KSkgKSApIHtcblxuICAgICAgICAgICAgLy8gUHJldmVudCBuZXZlci1lbmRpbmcgbG9vcFxuICAgICAgICAgICAgaWYgKCB0YXJnZXQgPT09IGNvcHkgKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCBjb3B5SXNBcnJheSApIHtcbiAgICAgICAgICAgICAgY29weUlzQXJyYXkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNBcnJheShzcmMpID8gc3JjIDogW107XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzUGxhaW5PYmplY3Qoc3JjKSA/IHNyYyA6IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZXZlciBtb3ZlIG9yaWdpbmFsIG9iamVjdHMsIGNsb25lIHRoZW1cbiAgICAgICAgICAgIHRhcmdldFsgbmFtZSBdID0gZXh0ZW5kKCBkZWVwLCBjbG9uZSwgY29weSk7XG5cbiAgICAgICAgICAgIC8vIERvbid0IGJyaW5nIGluIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2UgaWYgKCAhdXRpbHMuaXNVbmRlZmluZWQoY29weSkgKSB7XG4gICAgICAgICAgICB0YXJnZXRbIG5hbWUgXSA9IGNvcHk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBtb2RpZmllZCBvYmplY3RcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcbiAgZnVuY3Rpb24gRigpIHt9XG4gIEYucHJvdG90eXBlID0gbztcbiAgcmV0dXJuIG5ldyBGKCk7XG59O1xuXG5cbnZhciB1dGlscyA9IHtcbiAgbm9vcDogZnVuY3Rpb24gKCl7fVxuLCBpZTogISFkb2MuYXR0YWNoRXZlbnRcblxuLCBpc09iamVjdDogZnVuY3Rpb24gKHZhbCkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnb2JqZWN0JyAmJiB2YWwgIT09IG51bGw7XG4gIH1cblxuLCBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKHZhbCkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJztcbiAgfVxuXG4sIGlzRnVuY3Rpb246IGZ1bmN0aW9uICh2YWwpe1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnZnVuY3Rpb24nO1xuICB9XG5cbiwgaXNBcnJheTogZnVuY3Rpb24gKHZhbCkge1xuICAgIGlmKHV0aWxzLmllKXtcbiAgICAgIC8vSUUgOSDlj4rku6XkuIsgSUUg6Leo56qX5Y+j5qOA5rWL5pWw57uEXG4gICAgICByZXR1cm4gdmFsICYmIHZhbC5jb25zdHJ1Y3RvciArICcnID09PSBBcnJheSArICcnO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsKTtcbiAgICB9XG4gIH1cblxuICAvL+eugOWNleWvueixoeeahOeugOaYk+WIpOaWrVxuLCBpc1BsYWluT2JqZWN0OiBmdW5jdGlvbiAobyl7XG4gICAgaWYgKCFvIHx8ICh7fSkudG9TdHJpbmcuY2FsbChvKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgfHwgby5ub2RlVHlwZSB8fCBvID09PSBvLndpbmRvdykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy/lh73mlbDliIfpnaIuIG9yaUZuIOWOn+Wni+WHveaVsCwgZm4g5YiH6Z2i6KGl5YWF5Ye95pWwXG4gIC8v5YmN6Z2i55qE5Ye95pWw6L+U5Zue5YC85Lyg5YWlIGJyZWFrQ2hlY2sg5Yik5patLCBicmVha0NoZWNrIOi/lOWbnuWAvOS4uuecn+aXtuS4jeaJp+ihjOWIh+mdouihpeWFheeahOWHveaVsFxuLCBiZWZvcmVGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0KSl7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gb3JpRm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiwgYWZ0ZXJGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0KSl7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH1cblxuLCBwYXJzZUtleVBhdGg6IHBhcnNlS2V5UGF0aFxuXG4sIGRlZXBTZXQ6IGZ1bmN0aW9uIChrZXlTdHIsIHZhbHVlLCBvYmopIHtcbiAgICBpZihrZXlTdHIpe1xuICAgICAgdmFyIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cilcbiAgICAgICAgLCBjdXIgPSBvYmpcbiAgICAgICAgO1xuICAgICAgY2hhaW4uZm9yRWFjaChmdW5jdGlvbihrZXksIGkpIHtcbiAgICAgICAgaWYoaSA9PT0gY2hhaW4ubGVuZ3RoIC0gMSl7XG4gICAgICAgICAgY3VyW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgaWYoY3VyICYmIGN1ci5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgY3VyW2tleV0gPSB7fTtcbiAgICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfWVsc2V7XG4gICAgICBleHRlbmQob2JqLCB2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH1cbiwgZGVlcEdldDogZnVuY3Rpb24gKGtleVN0ciwgb2JqKSB7XG4gICAgdmFyIGNoYWluLCBjdXIgPSBvYmosIGtleTtcbiAgICBpZihrZXlTdHIpe1xuICAgICAgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKTtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBjaGFpbi5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAga2V5ID0gY2hhaW5baV07XG4gICAgICAgIGlmKGN1cil7XG4gICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY3VyO1xuICB9XG4sIGNsb25lOiBmdW5jdGlvbiBjbG9uZSAob2JqKSB7XG5cdFx0aWYob2JqID09IG51bGwgfHwgdHlwZW9mKG9iaikgIT0gJ29iamVjdCcpeyByZXR1cm4gb2JqIH1cblx0XHR2YXIgdGVtcCA9IG5ldyBvYmouY29uc3RydWN0b3IoKTtcblx0XHRmb3IodmFyIGtleSBpbiBvYmopeyB0ZW1wW2tleV0gPSBjbG9uZShvYmpba2V5XSkgfVxuXHRcdHJldHVybiB0ZW1wO1xuXHR9XG4sIGV4dGVuZDogZXh0ZW5kXG4sIGNyZWF0ZTogY3JlYXRlXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHV0aWxzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gIDtcblxudmFyIGV4dGVuZCA9IHV0aWxzLmV4dGVuZDtcblxuLy/ooajovr7lvI/op6PmnpBcbmZ1bmN0aW9uIGV4UGFyc2UocGF0aCkge1xuICB2YXIgYXN0ID0ge31cbiAgICAsIHN1bW1hcnlcbiAgICA7XG5cbiAgdHJ5e1xuICAgIGFzdCA9IHBhcnNlKHBhdGgsIHRoaXMuZGlyLnR5cGUpO1xuICB9Y2F0Y2goZSkge1xuICAgIGUubWVzc2FnZSA9ICdTeW50YXhFcnJvciBpbiBcIicgKyBwYXRoICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG5cbiAgc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkoYXN0KTtcbiAgZXh0ZW5kKHRoaXMuZGlyLCBzdW1tYXJ5KTtcbiAgZXh0ZW5kKHRoaXMsIHN1bW1hcnkpO1xuICB0aGlzLmFzdCA9IGFzdDtcbn07XG5cbmZ1bmN0aW9uIFdhdGNoZXIodm0sIGRpcikge1xuICB2YXIgcGF0aCwgc2NvcGUgPSB2bSwgY3VyVm0sIGxvY2FsS2V5LCB3aWxsVXBkYXRlLCBhc3MsIHBhdGhzO1xuXG4gIHRoaXMuZGlyID0gZGlyO1xuICB0aGlzLnZtID0gdm07XG5cbiAgdGhpcy52YWwgPSBOYU47XG5cbiAgdGhpcy5zdGF0ZSA9IFdhdGNoZXIuU1RBVEVfUkVBRFk7XG5cbiAgZXhQYXJzZS5jYWxsKHRoaXMsIGRpci5wYXRoKTtcblxuICBmb3IodmFyIGkgPSAwLCBsID0gdGhpcy5wYXRocy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aCh0aGlzLnBhdGhzW2ldKTtcbiAgICBsb2NhbEtleSA9IHBhdGhzWzBdO1xuXG4gICAgd2hpbGUoc2NvcGUpIHtcbiAgICAgIGN1clZtID0gc2NvcGU7XG4gICAgICBhc3MgPSBzY29wZS5fYXNzaWdubWVudHM7XG5cbiAgICAgIGlmKGFzcyAmJiBhc3MubGVuZ3RoKSB7XG4gICAgICAgIC8v5YW35ZCNIHJlcGVhdFxuICAgICAgICBpZihhc3NbMF0gPT09IGxvY2FsS2V5KSB7XG4gICAgICAgICAgaWYocGF0aHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgIHBhdGhzWzBdID0gJyRkYXRhJztcbiAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHBhdGhzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9ZWxzZSBpZihsb2NhbEtleSBpbiBzY29wZSl7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICAvL+WQkeS4iuafpeaJvlxuICAgICAgc2NvcGUgPSBzY29wZS4kcGFyZW50O1xuICAgIH1cbiAgICBwYXRoID0gcGF0aHMuam9pbignLicpO1xuICAgIGN1clZtLl93YXRjaGVyc1twYXRoXSA9IGN1clZtLl93YXRjaGVyc1twYXRoXSB8fCBbXTtcbiAgICBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0ucHVzaCh0aGlzKTtcbiAgfVxuXG4gIC8v5rKh5pyJ5Y+Y6YePIC8g5Y+Y6YeP5LiN5Zyo5b2T5YmN5L2c55So5Z+f55qE6KGo6L6+5byP56uL5Y2z5rGC5YC8XG4gIGZvcih2YXIgaSA9IDAsIGwgPSB0aGlzLmxvY2Fscy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBpZih1dGlscy5pc09iamVjdCh0aGlzLnZtLiRkYXRhKSAmJiAodGhpcy5sb2NhbHNbaV0gaW4gdGhpcy52bS4kZGF0YSkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZihpID09IGwpIHtcbiAgICB3aWxsVXBkYXRlID0gdHJ1ZTtcbiAgfVxuXG4gIGlmKHdpbGxVcGRhdGUgfHwgdGhpcy52bS5faXNSZW5kZXJlZCkge1xuICAgIHRoaXMudXBkYXRlKCk7XG4gIH1cbn1cblxuLy9UT0RPXG5leHRlbmQoV2F0Y2hlciwge1xuICBTVEFURV9SRUFEWTogMFxuLCBTVEFURV9DQUxMRUQ6IDFcbn0sIENsYXNzKTtcblxuZnVuY3Rpb24gd2F0Y2hlclVwZGF0ZSAodmFsKSB7XG4gIHRyeXtcbiAgICB0aGlzLmRpci51cGRhdGUodmFsLCB0aGlzLnZhbCk7XG4gICAgdGhpcy52YWwgPSB2YWw7XG4gIH1jYXRjaChlKXtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG59XG5cbmV4dGVuZChXYXRjaGVyLnByb3RvdHlwZSwge1xuICAvL+ihqOi+vuW8j+aJp+ihjFxuICB1cGRhdGU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuICAgICAgLCBuZXdWYWxcbiAgICAgIDtcblxuICAgIG5ld1ZhbCA9IHRoaXMuZ2V0VmFsdWUodGhpcy52bSk7XG5cbiAgICBpZihuZXdWYWwgJiYgbmV3VmFsLnRoZW4pIHtcbiAgICAgIC8vYSBwcm9taXNlXG4gICAgICBuZXdWYWwudGhlbihmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoYXQsIHZhbCk7XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGlzLCBuZXdWYWwpO1xuICAgIH1cblxuICAgIHRoaXMuc3RhdGUgPSBXYXRjaGVyLlNUQVRFX0NBTExFRDtcbiAgfVxuLCBnZXRWYWx1ZTogZnVuY3Rpb24oc2NvcGUpIHtcbiAgICB2YXIgdmFsO1xuXG4gICAgdHJ5e1xuICAgICAgdmFsID0gZXZhbHVhdGUuZXZhbCh0aGlzLmFzdCwgc2NvcGUsIHRoaXMuZGlyKTtcbiAgICB9Y2F0Y2goZSl7XG4gICAgICB2YWwgPSAnJztcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICAgIGlmKHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSB7XG4gICAgICB2YWwgPSAnJztcbiAgICB9XG4gICAgcmV0dXJuIHZhbDtcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2F0Y2hlciJdfQ==
