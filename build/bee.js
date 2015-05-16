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

var mergeProps = {
  $data: 1, $filter: 1, $watchers: 1
};

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
  , $filters: this.$filters || {}
  , $watchers: this.$watchers || {}

  , $el: this.$el || null
  , $target: this.$target || null
  , $tpl: this.$tpl || '<div></div>'
  , $content: null
  , $parent: null
  , $root: this

    //私有属性/方法
  , _watchers: this._watchers || {}
  , _assignments: null//当前 vm 的别名
  , _relativePath: []
  , _isRendered: false
  };

  var el;

  for(var propKey in props) {
    if(propKey in mergeProps) {
      extend(defaults[propKey], props[propKey])
      defaults[propKey] = extend(props[propKey], defaults[propKey]);
    }else{
      defaults[propKey] = props[propKey];
    }
  }

  //合并所有到当前空间下
  extend(this, defaults);
  extend(this, this.$data);

  tpl = tpl || this.$tpl;
  el = tplParse(tpl, this.$target);

  if(this.$el){
    this.$el.appendChild(el.el);
  }else{
    this.$el = el.el;
  }
  this.$tpl = el.tpl;
  this.$content = el.content;

  this.$el.bee = this;

  this.$content && walk.call(this.$root, this.$content);
  walk.call(this, this.$el);

  for(var key in this.$watchers) {
    this.$watch(key, this.$watchers[key])
  }

  this.$render(this.$data);
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
    var el = id.nodeType ? id : doc.getElementById(id);
    var Comp = this.components[el.tagName.toLowerCase()];
    var instance
    if(Comp) {
      instance = new Comp(extend({$target: el}, props))
    }else{
      instance = new Bee(el, props);
    }
    return instance
  }
});


Bee.setPrefix('b-');

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
      var update = callback.bind(this);
      update._originFn = callback;
      addWatcher.call(this, new Dir('watcher', {path: keyPath, update: update}))
    }
  }
  //TODO 支持 表达式 keyPath ?
, $unwatch: function (keyPath, callback) {
    var watchers = this._watchers[keyPath] || [], update;

    for(var i = watchers.length - 1; i >= 0; i--){
      update = watchers[i].dir.update;
      if(update === callback || update._originFn === callback){
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
doc.createElement('template')
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

  if(el.nodeName.toLowerCase() === 'template') {
    //template shim
    if(!el.content) {
      el.content = doc.createDocumentFragment();
      while(el.childNodes[0]) {
        el.content.appendChild(el.childNodes[0])
      }
    }
  }

  if(checkAttr.call(this, el)){
    return;
  }

  if(el.nodeName.toLowerCase() === 'template') {
    walk.call(this, el.content)
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
    dir.dirs = dirs;

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

  return terminal
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
      dir.node = doc.createTextNode('');
    }

    dir.el = dir.el.parentNode;
    dir.el.replaceChild(dir.node, el);
  }

  dir.link(this);

  addWatcher.call(this, dir)
}

function addWatcher(dir) {
  if(dir.path && dir.watch) {
    return new Watcher(this, dir);
  }
}


//target: el 替换的目标
function tplParse(tpl, target) {
  var el, wraper;
  var content = null;
  if(isObject(target) && target.childNodes) {
    content = doc.createDocumentFragment();
    while(target.childNodes[0]) {
      content.appendChild(target.childNodes[0]);
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

  return {el: el, tpl: tpl, content: content};
}

Bee.version = '0.1.2';

module.exports = Bee;

},{"./class.js":3,"./component.js":4,"./directive.js":5,"./directives":9,"./env.js":14,"./event.js":17,"./token.js":19,"./utils.js":20,"./watcher.js":21}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
var extend = require('./utils.js').extend;

var Class = {
  /** 
   * 构造函数继承. 
   * 如: `var Car = Bee.extend({drive: function(){}}); new Car();`
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
},{"./utils.js":20}],4:[function(require,module,exports){
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

},{"./utils.js":20}],5:[function(require,module,exports){
"use strict";

var utils = require('./utils.js')
  , token = require('./token.js')
  , doc = require('./env.js').document
  , parse = require('./parse.js').parse
  , evaluate = require('./eval.js')

  , create = utils.create
  ;

/**
 * 为 Bee 构造函数添加指令 (directive). `Bee.directive`
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
, replace: false//是否替换当前元素. 如果是, 将用一个空的文本节点替换当前元素
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
  //解析表达式
, parse: function() {
    try{
      this.ast = parse(this.path, this.type);
    }catch(e) {
      this.ast = {};
      e.message = 'SyntaxError in "' + this.path + '" | ' + e.message;
      console.error(e);
    }
  }
  //表达式求值
, getValue: function(scope) {
    var val;

    try{
      val = evaluate.eval(this.ast, scope, this);
    }catch(e){
      val = '';
      console.error(e);
    }
    if(utils.isUndefined(val) || val === null) {
      val = '';
    }
    return val;
  }
};

var attrPostReg = /\?$/;

//获取一个元素上所有用 HTML 属性定义的指令
function getDir(el, directives, components, prefix) {
  prefix = prefix || '';
  directives = directives || {};

  var attr, attrName, dirName, proto
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
    proto = {el: el, node: attr, nodeName: attrName, path: attr.value};
    dir = null;

    if(attrName.indexOf(prefix) === 0 && (dirName in directives)) {
      //指令
      dir = create(directives[dirName]);
      dir.dirName = dirName//dir 名
    }else if(token.hasToken(attr.value)) {
      //属性表达式可能有多个表达式区
      token.parseToken(attr.value).forEach(function(origin) {
        origin.dirName = attrName.indexOf(prefix) === 0 ? dirName : attrName ;
        dirs.push(utils.extend(create(directives.attr), proto, origin))
      });
      //由于已知属性表达式不存在 anchor, 所以直接跳过下面的检测
    }else if(attrPostReg.test(attrName)) {
      //条件属性指令
      dir = utils.extend(create(directives.attr), { dirName: attrName.replace(attrPostReg, ''), conditional: true });
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
      dir.anchors = dir.anchor ? anchors : null;
      dirs.push(utils.extend(dir, proto));
    }
  }
  dirs.sort(function(d0, d1) {
    return d1.priority - d0.priority;
  });
  return dirs;
}

Directive.directive = directive;
directive.getDir = getDir;

module.exports = Directive;

},{"./env.js":14,"./eval.js":15,"./parse.js":18,"./token.js":19,"./utils.js":20}],6:[function(require,module,exports){
"use strict";

//属性指令

var utils = require('../utils.js');

module.exports = {
  link: function() {
    if(this.dirName === this.type) {//attr binding
      this.attrs = {};
    }else {
      //属性表达式默认将值置空, 防止表达式内变量不存在
      this.update('')
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
      if(this.conditional) {
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
  //chrome setattribute with `{{}}` will throw an error
  el.setAttribute(attr, val);
}

function removeAttr(el, attr) {
  el.removeAttribute(attr);
  delete el[attr];
}
},{"../utils.js":20}],7:[function(require,module,exports){
//component as directive
var utils = require('../utils.js');

module.exports = {
  priority: -10
, watch: false
, link: function(vm) {
    var el = this.el;
    var comName = this.path;
    var components = vm.constructor.components;
    var Comp, comp;
    var dirs = [], $data = {};
    var attrs;

    if(comName in components) {
      Comp = components[comName];

      //TODO
      if(Comp === vm.constructor) {
        return;
      }

      dirs = this.dirs;

      dirs = dirs.filter(function (dir) {
        return dir.type == 'attr' || dir.type == 'with';
      });

      dirs.forEach(function (dir) {
        var curPath, comPath;

        curPath = dir.path;
        if(dir.type === 'with' || dir.dirName === 'attr') {
          //这里 attr 及 with 指令效果一样
          comPath = '$data'
          utils.extend($data, vm.$get(curPath))
        }else{
          comPath = dir.dirName;
          $data[comPath] = vm.$get(curPath);
        }

        //监听父组件更新, 同步数据
        vm.$watch(curPath, function (val) {
          if(comp){
            val = dir.textMap ? dir.textMap.join('') : val;
            comp.$set(comPath, val);
          }
        })
      });

      attrs = el.attributes;
      //普通属性
      for(var i = attrs.length - 1; i >= 0; i--) {
        $data[attrs[0].nodeName] = attrs[0].value;
      }

      comp = new Comp({
        $target: el,
        $root: vm.$root,
        $data: utils.extend({}, Comp.prototype.$data, $data)
      });

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

},{"../utils.js":20}],8:[function(require,module,exports){
"use strict";

module.exports = {
  replace: true
, anchor: true
  //content: dom 对象
, update: function(content) {
    var nodes = this.getNodes()
    var parent = this.anchors.end.parentNode;
    nodes.forEach(function(node) {
      parent.removeChild(node);
    })
    parent.insertBefore(content, this.anchors.end)
  }
}
},{}],9:[function(require,module,exports){
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
dirs.content = require('./content.js')

module.exports = dirs;

},{"../env.js":14,"../token.js":19,"../utils.js":20,"./attr.js":6,"./component.js":7,"./content.js":8,"./model.js":10,"./on.js":11,"./repeat.js":12,"./style.js":13}],10:[function(require,module,exports){
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
          ant.$set(keyPath, val);
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
            ant.$set(keyPath, vals);
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

},{"../event-bind.js":16,"../token.js":19,"../utils.js":20}],11:[function(require,module,exports){
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
    var selector, eventType;
    for(var name in events) {
      selector = name.split(/\s+/);
      eventType = selector[0];
      selector = selector[1];
      eventBind.addEvent(this.el, eventType, callHandler(this, selector, events[name]));
    }
  }
}

//委托事件
function callHandler (dir, selector, callback) {
  return function(e) {
    var els = selector ? [].slice.call(dir.el.querySelectorAll(selector)) : [e.target];
    var cur = e.target;
    do{
      if(els.indexOf(cur) >= 0) {
        e.delegateTarget = cur;//委托元素
        return callback.call(dir.vm, e)
      }
    }while(cur = cur.parentNode)
  }
}

},{"../event-bind.js":16}],12:[function(require,module,exports){
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
    var that = this, list = this.list;

    if(utils.isArray(items)) {
      // 在 repeat 指令表达式中
      this.listPath = this.locals.filter(function(path) {
        return !utils.isFunction(that.vm.$get(path))
      });

      //删除元素
      arrDiff(curArr, items).forEach(function(item) {
        var pos = curArr.indexOf(item)
        curArr.splice(pos, 1)
        parentNode.removeChild(list[pos].el)
        list.splice(pos, 1)
      })

      items.forEach(function(item, i) {
        var pos = items.indexOf(item, i)
          , oldPos = curArr.indexOf(item, i)
          , vm, el
          ;

        pos < 0 && (pos = items.lastIndexOf(item, i));
        oldPos < 0 && (oldPos = curArr.lastIndexOf(item, i));

        //新增元素
        if(oldPos < 0) {


          el = this.el.cloneNode(true)

          vm = new this.cstr(el, {
            $data: item, _assignments: this.assignments, $index: pos,
            $root: this.vm.$root, $parent: this.vm
          });
          parentNode.insertBefore(vm.$el, list[pos] && list[pos].el || this.anchors.end)
          list.splice(pos, 0, {el: el, vm: vm});
          curArr.splice(pos, 0, item)

          //延时赋值给 `_relativePath`, 避免出现死循环
          //如果在上面实例化时当参数传入, 会冒泡到父级 vm 递归调用这里的 update 方法, 造成死循环.
          vm._relativePath = this.listPath;
        }else {

          //调序
          if (pos !== oldPos) {
            parentNode.insertBefore(list[oldPos].el, list[pos] && list[pos].el || that.anchor.end)
            parentNode.insertBefore(list[pos].el, list[oldPos + 1] && list[oldPos + 1].el || that.anchor.end)
            list[oldPos] = [list[pos], list[pos] = list[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
            list[pos].vm.$index = pos
            list[pos].vm.$update('$index')
          }
        }
      }.bind(this))

      //更新索引
      this.list.forEach(function(item, i) {
        item.vm.$index = i
        item.el.$index = i
        item.vm.$update('$index', false)
      });

      if(!items.__bee__){
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
        });
        items.__bee__  = true;
      }
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

},{"../env.js":14,"../utils.js":20}],13:[function(require,module,exports){
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
  update: function(styles) {
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
},{}],14:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":2}],15:[function(require,module,exports){
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
  , context, summary, summaryCall
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
        summaryCall || console.warn(e);
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
  summaryCall = true;
  if(scope) {
    summaryCall = false;
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

},{}],16:[function(require,module,exports){
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
},{}],17:[function(require,module,exports){
var utils = require('./utils.js');

var Event = {
  //监听自定义事件.
  $on: function(name, handler, context) {
    var ctx = context || this
      ;

    ctx._handlers = ctx._handlers || {};
    ctx._handlers[name] = ctx._handlers[name] || [];

    ctx._handlers[name].push({handler: handler, context: context, ctx: ctx});
    return this;
  },
  $one: function (name, handler, context) {
    if(handler){
      handler.one = true;
    }
    return this.on(name, handler, context);
  },
  //移除监听事件.
  $off: function(name, handler, context) {
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
  $trigger: function(name, data) {
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

},{"./utils.js":20}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
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
},{}],20:[function(require,module,exports){
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
, extend: extend
, create: create
};

module.exports = utils;

},{"./env.js":14}],21:[function(require,module,exports){
"use strict";

var evaluate = require('./eval.js')
  , utils = require('./utils.js')
  , Class = require('./class.js')
  ;

var extend = utils.extend;

//表达式解析
function exParse() {
  var summary
    , dir = this.dir
    ;

  dir.parse();

  summary = evaluate.summary(dir.ast);
  extend(dir, summary);
  extend(this, summary);
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
  //for(var i = 0, l = this.locals.length; i < l; i++) {
  //  if(utils.isObject(this.vm.$data) && (this.locals[i] in this.vm.$data)) {
  //    break;
  //  }
  //}
  //if(i == l) {
  //  willUpdate = true;
  //}

  //if(willUpdate || this.vm._isRendered) {
    this.update();
  //}
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

    newVal = this.dir.getValue(this.vm);

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
});

module.exports = Watcher

},{"./class.js":3,"./eval.js":15,"./utils.js":20}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jbGFzcy5qcyIsInNyYy9jb21wb25lbnQuanMiLCJzcmMvZGlyZWN0aXZlLmpzIiwic3JjL2RpcmVjdGl2ZXMvYXR0ci5qcyIsInNyYy9kaXJlY3RpdmVzL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmVzL2NvbnRlbnQuanMiLCJzcmMvZGlyZWN0aXZlcy9pbmRleC5qcyIsInNyYy9kaXJlY3RpdmVzL21vZGVsLmpzIiwic3JjL2RpcmVjdGl2ZXMvb24uanMiLCJzcmMvZGlyZWN0aXZlcy9yZXBlYXQuanMiLCJzcmMvZGlyZWN0aXZlcy9zdHlsZS5qcyIsInNyYy9lbnYuanMiLCJzcmMvZXZhbC5qcyIsInNyYy9ldmVudC1iaW5kLmpzIiwic3JjL2V2ZW50LmpzIiwic3JjL3BhcnNlLmpzIiwic3JjL3Rva2VuLmpzIiwic3JjL3V0aWxzLmpzIiwic3JjL3dhdGNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Z0JBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdG9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBlbnYgPSByZXF1aXJlKCcuL2Vudi5qcycpXG4gICwgZG9jID0gZW52LmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBFdmVudCA9IHJlcXVpcmUoJy4vZXZlbnQuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgRGlyID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi90b2tlbi5qcycpXG4gIDtcblxuXG52YXIgaXNPYmplY3QgPSB1dGlscy5pc09iamVjdFxuICAsIGlzVW5kZWZpbmVkID0gdXRpbHMuaXNVbmRlZmluZWRcbiAgLCBpc0Z1bmN0aW9uID0gdXRpbHMuaXNGdW5jdGlvblxuICAsIGlzUGxhaW5PYmplY3QgPSB1dGlscy5pc1BsYWluT2JqZWN0XG4gICwgcGFyc2VLZXlQYXRoID0gdXRpbHMucGFyc2VLZXlQYXRoXG4gICwgZGVlcFNldCA9IHV0aWxzLmRlZXBTZXRcbiAgLCBkZWVwR2V0ID0gdXRpbHMuZGVlcEdldFxuICAsIGV4dGVuZCA9IHV0aWxzLmV4dGVuZFxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cblxudmFyIE5PREVUWVBFID0ge1xuICAgIEVMRU1FTlQ6IDFcbiAgLCBBVFRSOiAyXG4gICwgVEVYVDogM1xuICAsIENPTU1FTlQ6IDhcbiAgLCBGUkFHTUVOVDogMTFcbn07XG5cbi8v6K6+572uIGRpcmVjdGl2ZSDliY3nvIBcbmZ1bmN0aW9uIHNldFByZWZpeChuZXdQcmVmaXgpIHtcbiAgaWYobmV3UHJlZml4KXtcbiAgICB0aGlzLnByZWZpeCA9IG5ld1ByZWZpeDtcbiAgfVxufVxuXG52YXIgbWVyZ2VQcm9wcyA9IHtcbiAgJGRhdGE6IDEsICRmaWx0ZXI6IDEsICR3YXRjaGVyczogMVxufTtcblxuLyoqXG4gKiDmnoTpgKDlh73mlbBcbiAqIC0tLVxuICogQHBhcmFtIHtTdHJpbmd8RWxlbWVudH0gW3RwbF0g5qih5p2/LiDnrYnlkIzkuo4gcHJvcHMuJHRwbFxuICogQHBhcmFtIHtPYmplY3R9IFtwcm9wc10g5bGe5oCnL+aWueazlVxuICoqL1xuZnVuY3Rpb24gQmVlKHRwbCwgcHJvcHMpIHtcbiAgaWYoaXNQbGFpbk9iamVjdCh0cGwpKSB7XG4gICAgcHJvcHMgPSB0cGw7XG4gICAgdHBsID0gcHJvcHMuJHRwbDtcbiAgfVxuICBwcm9wcyA9IHByb3BzIHx8IHt9O1xuXG4gIHZhciBkZWZhdWx0cyA9IHtcbiAgICAvLyQg5byA5aS055qE5piv5YWx5pyJ5bGe5oCnL+aWueazlVxuICAgICRkYXRhOiB0aGlzLiRkYXRhIHx8IHt9XG4gICwgJGZpbHRlcnM6IHRoaXMuJGZpbHRlcnMgfHwge31cbiAgLCAkd2F0Y2hlcnM6IHRoaXMuJHdhdGNoZXJzIHx8IHt9XG5cbiAgLCAkZWw6IHRoaXMuJGVsIHx8IG51bGxcbiAgLCAkdGFyZ2V0OiB0aGlzLiR0YXJnZXQgfHwgbnVsbFxuICAsICR0cGw6IHRoaXMuJHRwbCB8fCAnPGRpdj48L2Rpdj4nXG4gICwgJGNvbnRlbnQ6IG51bGxcbiAgLCAkcGFyZW50OiBudWxsXG4gICwgJHJvb3Q6IHRoaXNcblxuICAgIC8v56eB5pyJ5bGe5oCnL+aWueazlVxuICAsIF93YXRjaGVyczogdGhpcy5fd2F0Y2hlcnMgfHwge31cbiAgLCBfYXNzaWdubWVudHM6IG51bGwvL+W9k+WJjSB2bSDnmoTliKvlkI1cbiAgLCBfcmVsYXRpdmVQYXRoOiBbXVxuICAsIF9pc1JlbmRlcmVkOiBmYWxzZVxuICB9O1xuXG4gIHZhciBlbDtcblxuICBmb3IodmFyIHByb3BLZXkgaW4gcHJvcHMpIHtcbiAgICBpZihwcm9wS2V5IGluIG1lcmdlUHJvcHMpIHtcbiAgICAgIGV4dGVuZChkZWZhdWx0c1twcm9wS2V5XSwgcHJvcHNbcHJvcEtleV0pXG4gICAgICBkZWZhdWx0c1twcm9wS2V5XSA9IGV4dGVuZChwcm9wc1twcm9wS2V5XSwgZGVmYXVsdHNbcHJvcEtleV0pO1xuICAgIH1lbHNle1xuICAgICAgZGVmYXVsdHNbcHJvcEtleV0gPSBwcm9wc1twcm9wS2V5XTtcbiAgICB9XG4gIH1cblxuICAvL+WQiOW5tuaJgOacieWIsOW9k+WJjeepuumXtOS4i1xuICBleHRlbmQodGhpcywgZGVmYXVsdHMpO1xuICBleHRlbmQodGhpcywgdGhpcy4kZGF0YSk7XG5cbiAgdHBsID0gdHBsIHx8IHRoaXMuJHRwbDtcbiAgZWwgPSB0cGxQYXJzZSh0cGwsIHRoaXMuJHRhcmdldCk7XG5cbiAgaWYodGhpcy4kZWwpe1xuICAgIHRoaXMuJGVsLmFwcGVuZENoaWxkKGVsLmVsKTtcbiAgfWVsc2V7XG4gICAgdGhpcy4kZWwgPSBlbC5lbDtcbiAgfVxuICB0aGlzLiR0cGwgPSBlbC50cGw7XG4gIHRoaXMuJGNvbnRlbnQgPSBlbC5jb250ZW50O1xuXG4gIHRoaXMuJGVsLmJlZSA9IHRoaXM7XG5cbiAgdGhpcy4kY29udGVudCAmJiB3YWxrLmNhbGwodGhpcy4kcm9vdCwgdGhpcy4kY29udGVudCk7XG4gIHdhbGsuY2FsbCh0aGlzLCB0aGlzLiRlbCk7XG5cbiAgZm9yKHZhciBrZXkgaW4gdGhpcy4kd2F0Y2hlcnMpIHtcbiAgICB0aGlzLiR3YXRjaChrZXksIHRoaXMuJHdhdGNoZXJzW2tleV0pXG4gIH1cblxuICB0aGlzLiRyZW5kZXIodGhpcy4kZGF0YSk7XG4gIHRoaXMuX2lzUmVuZGVyZWQgPSB0cnVlO1xuICB0aGlzLiRpbml0KCk7XG59XG5cbi8v6Z2Z5oCB5bGe5oCnXG5leHRlbmQoQmVlLCBDbGFzcywgRGlyLCBDb20sIHtcbiAgc2V0UHJlZml4OiBzZXRQcmVmaXhcbiwgcHJlZml4OiAnJ1xuLCBkb2M6IGRvY1xuLCBkaXJlY3RpdmVzOiB7fVxuLCBjb21wb25lbnRzOiB7fVxuLCBtb3VudDogZnVuY3Rpb24oaWQsIHByb3BzKSB7XG4gICAgdmFyIGVsID0gaWQubm9kZVR5cGUgPyBpZCA6IGRvYy5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIENvbXAgPSB0aGlzLmNvbXBvbmVudHNbZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpXTtcbiAgICB2YXIgaW5zdGFuY2VcbiAgICBpZihDb21wKSB7XG4gICAgICBpbnN0YW5jZSA9IG5ldyBDb21wKGV4dGVuZCh7JHRhcmdldDogZWx9LCBwcm9wcykpXG4gICAgfWVsc2V7XG4gICAgICBpbnN0YW5jZSA9IG5ldyBCZWUoZWwsIHByb3BzKTtcbiAgICB9XG4gICAgcmV0dXJuIGluc3RhbmNlXG4gIH1cbn0pO1xuXG5cbkJlZS5zZXRQcmVmaXgoJ2ItJyk7XG5cbi8v5YaF572uIGRpcmVjdGl2ZVxuZm9yKHZhciBkaXIgaW4gZGlycykge1xuICBCZWUuZGlyZWN0aXZlKGRpciwgZGlyc1tkaXJdKTtcbn1cblxuLy/lrp7kvovmlrnms5Vcbi8vLS0tLVxuZXh0ZW5kKEJlZS5wcm90b3R5cGUsIEV2ZW50LCB7XG4gIC8qKlxuICAgKiAjIyMgYW50LnJlbmRlclxuICAgKiDmuLLmn5PmqKHmnb9cbiAgICovXG4gICRyZW5kZXI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICBkYXRhID0gZGF0YSB8fCB0aGlzLiRkYXRhO1xuICAgIHRoaXMuJHJlcGxhY2UoZGF0YSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiwgJGluaXQ6IHV0aWxzLm5vb3BcbiAgLyoqXG4gICAqIOiOt+WPluWxnuaApy/mlrnms5VcbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleVBhdGgg6Lev5b6EXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3N0cmljdD1mYWxzZV0g5piv5ZCm5Lil5qC85Zyo6Ieq6Lqr5Lit5p+l5om+LlxuICAgKiBAcmV0dXJuIHsqfVxuICAgKi9cbiwgJGdldDogZnVuY3Rpb24oa2V5UGF0aCwgc3RyaWN0KSB7XG4gICAgc3RyaWN0ID0gc3RyaWN0ID09PSB0cnVlO1xuXG4gICAgdmFyIHNjb3BlID0gdGhpc1xuICAgICAgLCBwYXRoID0ga2V5UGF0aFxuICAgICAgLCBwYXRocywgaGVhZFBhdGhcbiAgICAgIDtcblxuICAgIGlmKCFzdHJpY3QpIHtcbiAgICAgIGlmKHRoaXMuJHBhcmVudCkge1xuICAgICAgICBwYXRocyA9IHBhcnNlS2V5UGF0aChwYXRoKTtcbiAgICAgICAgaGVhZFBhdGggPSBwYXRoc1swXVxuICAgICAgICBpZihzY29wZS5fYXNzaWdubWVudHMgJiYgc2NvcGUuX2Fzc2lnbm1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgIC8vIOWFt+WQjSByZXBlYXQg5LiN5Lya55u05o6l5p+l5om+6Ieq6Lqr5L2c55So5Z+fXG4gICAgICAgICAgaWYoaGVhZFBhdGggPT09IHRoaXMuX2Fzc2lnbm1lbnRzWzBdKSB7XG4gICAgICAgICAgICBzY29wZSA9IHt9O1xuICAgICAgICAgICAgc2NvcGVbaGVhZFBhdGhdID0gdGhpcztcbiAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRwYXJlbnQuJGdldChrZXlQYXRoLCBzdHJpY3QpXG4gICAgICAgICAgfVxuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAvL+WMv+WQjSByZXBlYXRcbiAgICAgICAgICByZXR1cm4gKGhlYWRQYXRoIGluIHRoaXMpID8gdGhpcy4kZ2V0KGtleVBhdGgpIDogdGhpcy4kcGFyZW50LiRnZXQoa2V5UGF0aCwgc3RyaWN0KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZXBHZXQocGF0aCwgc2NvcGUpO1xuICB9XG5cbiAgLyoqXG4gICAqICMjIyBiZWUuJHNldFxuICAgKiDmm7TmlrDlkIjlubYgYC5kYXRhYCDkuK3nmoTmlbDmja4uIOWmguaenOWPquacieS4gOS4quWPguaVsCwg6YKj5LmI6L+Z5Liq5Y+C5pWw5bCG5bm25YWlIC4kZGF0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2tleV0g5pWw5o2u6Lev5b6ELlxuICAgKiBAcGFyYW0ge0FueVR5cGV8T2JqZWN0fSB2YWwg5pWw5o2u5YaF5a65LlxuICAgKi9cbiwgJHNldDogZnVuY3Rpb24oa2V5LCB2YWwpIHtcbiAgICB2YXIgYWRkLCBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcbiAgICBpZihpc1VuZGVmaW5lZChrZXkpKXsgcmV0dXJuIHRoaXM7IH1cblxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpe1xuICAgICAgZXh0ZW5kKHRydWUsIHRoaXMuJGRhdGEsIGtleSk7XG4gICAgICBleHRlbmQodHJ1ZSwgdGhpcywga2V5KTtcbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICBrZXlzID0gcGFyc2VLZXlQYXRoKGtleSk7XG4gICAgICBhZGQgPSBkZWVwU2V0KGtleSwgdmFsLCB7fSk7XG4gICAgICBrZXlzWzBdICE9PSAnJGRhdGEnICYmIGV4dGVuZCh0cnVlLCB0aGlzLiRkYXRhLCBhZGQpO1xuICAgICAgZXh0ZW5kKHRydWUsIHRoaXMsIGFkZCk7XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSwgdmFsKSA6IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgLyoqXG4gICAqIOaVsOaNruabv+aNolxuICAgKi9cbiwgJHJlcGxhY2U6IGZ1bmN0aW9uIChrZXksIHZhbCkge1xuICAgIHZhciBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcblxuICAgIGlmKGlzVW5kZWZpbmVkKGtleSkpeyByZXR1cm4gdGhpczsgfVxuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICBPYmplY3Qua2V5cyh0aGlzLiRkYXRhKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICBkZWxldGUgdGhpc1trZXldO1xuICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICAgIGV4dGVuZCh0aGlzLCBrZXkpO1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5KTtcbiAgICAgIGlmKGtleXNbMF0gIT09ICdkYXRhJykge1xuICAgICAgICBkZWVwU2V0KGtleSwgbnVsbCwgdGhpcy4kZGF0YSk7XG4gICAgICAgIGRlZXBTZXQoa2V5LCB2YWwsIHRoaXMuJGRhdGEpO1xuICAgICAgfVxuICAgICAgZGVlcFNldChrZXksIG51bGwsIHRoaXMpO1xuICAgICAgZGVlcFNldChrZXksIHZhbCwgdGhpcyk7XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSwgdmFsKSA6IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgLyoqXG4gICAqIOaJi+WKqOabtOaWsOafkOmDqOWIhuaVsOaNrlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDmjIflrprmm7TmlrDmlbDmja7nmoQga2V5UGF0aFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpc0J1YmJsZT10cnVlXSDmmK/lkKbmm7TmlrAga2V5UGF0aCDnmoTniLbnuqdcbiAgICovXG4sICR1cGRhdGU6IGZ1bmN0aW9uIChrZXlQYXRoLCBpc0J1YmJsZSkge1xuICAgIGlzQnViYmxlID0gaXNCdWJibGUgIT09IGZhbHNlO1xuXG4gICAgdmFyIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5UGF0aCksIGtleSwgYXR0cnM7XG4gICAgdmFyIHdhdGNoZXJzO1xuXG4gICAgd2hpbGUoa2V5ID0ga2V5cy5qb2luKCcuJykpIHtcbiAgICAgIHdhdGNoZXJzID0gdGhpcy5fd2F0Y2hlcnNba2V5XTtcblxuICAgICAgaWYgKHdhdGNoZXJzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gd2F0Y2hlcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgd2F0Y2hlcnNbaV0udXBkYXRlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYoaXNCdWJibGUpIHtcbiAgICAgICAga2V5cy5wb3AoKTtcbiAgICAgICAgLy/mnIDnu4jpg73lhpLms6HliLAgJGRhdGFcbiAgICAgICAgaWYoIWtleXMubGVuZ3RoICYmIGtleSAhPT0gJyRkYXRhJyl7XG4gICAgICAgICAga2V5cy5wdXNoKCckZGF0YScpO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGF0dHJzID0gdGhpcy4kZ2V0KGtleVBhdGgpO1xuXG4gICAgLy/lkIzml7bmm7TmlrDlrZDot6/lvoRcbiAgICBpZihpc09iamVjdChhdHRycykpIHtcbiAgICAgIE9iamVjdC5rZXlzKGF0dHJzKS5mb3JFYWNoKGZ1bmN0aW9uKGF0dHIpIHtcbiAgICAgICAgdGhpcy4kdXBkYXRlKGtleVBhdGggKyAnLicgKyBhdHRyLCBmYWxzZSk7XG4gICAgICB9LmJpbmQodGhpcykpXG4gICAgfVxuXG4gICAgaWYoaXNCdWJibGUpIHtcbiAgICAgIGlmKHRoaXMuJHBhcmVudCkge1xuICAgICAgICAvL+WQjOatpeabtOaWsOeItiB2bSDlr7nlupTpg6jliIZcbiAgICAgICAgdGhpcy5fcmVsYXRpdmVQYXRoLmZvckVhY2goZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgICAgICB0aGlzLiRwYXJlbnQuJHVwZGF0ZShwYXRoKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8v5pu05paw5pWw57uE6ZW/5bqmXG4gICAgaWYodXRpbHMuaXNBcnJheShhdHRycykpIHtcbiAgICAgIHRoaXMuJHVwZGF0ZShrZXlQYXRoICsgJy5sZW5ndGgnLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiwgJHdhdGNoOiBmdW5jdGlvbiAoa2V5UGF0aCwgY2FsbGJhY2spIHtcbiAgICBpZihjYWxsYmFjaykge1xuICAgICAgdmFyIHVwZGF0ZSA9IGNhbGxiYWNrLmJpbmQodGhpcyk7XG4gICAgICB1cGRhdGUuX29yaWdpbkZuID0gY2FsbGJhY2s7XG4gICAgICBhZGRXYXRjaGVyLmNhbGwodGhpcywgbmV3IERpcignd2F0Y2hlcicsIHtwYXRoOiBrZXlQYXRoLCB1cGRhdGU6IHVwZGF0ZX0pKVxuICAgIH1cbiAgfVxuICAvL1RPRE8g5pSv5oyBIOihqOi+vuW8jyBrZXlQYXRoID9cbiwgJHVud2F0Y2g6IGZ1bmN0aW9uIChrZXlQYXRoLCBjYWxsYmFjaykge1xuICAgIHZhciB3YXRjaGVycyA9IHRoaXMuX3dhdGNoZXJzW2tleVBhdGhdIHx8IFtdLCB1cGRhdGU7XG5cbiAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICB1cGRhdGUgPSB3YXRjaGVyc1tpXS5kaXIudXBkYXRlO1xuICAgICAgaWYodXBkYXRlID09PSBjYWxsYmFjayB8fCB1cGRhdGUuX29yaWdpbkZuID09PSBjYWxsYmFjayl7XG4gICAgICAgIHdhdGNoZXJzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiB1cGRhdGUgKGtleVBhdGgsIGRhdGEpIHtcbiAgdmFyIGtleVBhdGhzO1xuXG4gIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICBkYXRhID0ga2V5UGF0aDtcbiAgfWVsc2V7XG4gICAga2V5UGF0aHMgPSBba2V5UGF0aF07XG4gIH1cblxuICBpZigha2V5UGF0aHMpIHtcbiAgICBpZihpc09iamVjdChkYXRhKSkge1xuICAgICAga2V5UGF0aHMgPSBPYmplY3Qua2V5cyhkYXRhKTtcbiAgICB9ZWxzZXtcbiAgICAgIC8vLiRkYXRhIOacieWPr+iDveaYr+WfuuacrOexu+Wei+aVsOaNrlxuICAgICAga2V5UGF0aHMgPSBbJyRkYXRhJ107XG4gICAgfVxuICB9XG5cbiAgZm9yKHZhciBpID0gMCwgcGF0aDsgcGF0aCA9IGtleVBhdGhzW2ldOyBpKyspe1xuICAgIHRoaXMuJHVwZGF0ZShwYXRoLCB0cnVlKTtcbiAgfVxuXG59XG5kb2MuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKVxuLy/pgY3ljoYgZG9tIOagkVxuZnVuY3Rpb24gd2FsayhlbCkge1xuXG4gIGlmKGVsLm5vZGVUeXBlID09PSBOT0RFVFlQRS5GUkFHTUVOVCkge1xuICAgIGVsID0gZWwuY2hpbGROb2RlcztcbiAgfVxuXG4gIGlmKCgnbGVuZ3RoJyBpbiBlbCkgJiYgaXNVbmRlZmluZWQoZWwubm9kZVR5cGUpKXtcbiAgICAvL25vZGUgbGlzdFxuICAgIC8v5a+55LqOIG5vZGVsaXN0IOWmguaenOWFtuS4reacieWMheWQqyB7e3RleHR9fSDnm7TmjqXph4/nmoTooajovr7lvI8sIOaWh+acrOiKgueCueS8muiiq+WIhuWJsiwg5YW26IqC54K55pWw6YeP5Y+v6IO95Lya5Yqo5oCB5aKe5YqgXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGVsLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3YWxrLmNhbGwodGhpcywgZWxbaV0pO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBzd2l0Y2ggKGVsLm5vZGVUeXBlKSB7XG4gICAgY2FzZSBOT0RFVFlQRS5FTEVNRU5UOlxuICAgICAgICBicmVhaztcbiAgICBjYXNlIE5PREVUWVBFLkNPTU1FTlQ6XG4gICAgICAvL+azqOmHiuiKgueCuVxuICAgICAgcmV0dXJuO1xuICAgICAgICBicmVhaztcbiAgICBjYXNlIE5PREVUWVBFLlRFWFQ6XG4gICAgICAvL+aWh+acrOiKgueCuVxuICAgICAgY2hlY2tUZXh0LmNhbGwodGhpcywgZWwpO1xuICAgICAgcmV0dXJuO1xuICAgICAgICBicmVhaztcbiAgfVxuXG4gIGlmKGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICAvL3RlbXBsYXRlIHNoaW1cbiAgICBpZighZWwuY29udGVudCkge1xuICAgICAgZWwuY29udGVudCA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICB3aGlsZShlbC5jaGlsZE5vZGVzWzBdKSB7XG4gICAgICAgIGVsLmNvbnRlbnQuYXBwZW5kQ2hpbGQoZWwuY2hpbGROb2Rlc1swXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZihjaGVja0F0dHIuY2FsbCh0aGlzLCBlbCkpe1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmKGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICB3YWxrLmNhbGwodGhpcywgZWwuY29udGVudClcbiAgfVxuXG4gIGZvcih2YXIgY2hpbGQgPSBlbC5maXJzdENoaWxkLCBuZXh0OyBjaGlsZDsgKXtcbiAgICBuZXh0ID0gY2hpbGQubmV4dFNpYmxpbmc7XG4gICAgd2Fsay5jYWxsKHRoaXMsIGNoaWxkKTtcbiAgICBjaGlsZCA9IG5leHQ7XG4gIH1cbn1cblxuLy/pgY3ljoblsZ7mgKdcbmZ1bmN0aW9uIGNoZWNrQXR0cihlbCkge1xuICB2YXIgY3N0ciA9IHRoaXMuY29uc3RydWN0b3JcbiAgICAsIHByZWZpeCA9IGNzdHIucHJlZml4XG4gICAgLCBkaXJzID0gY3N0ci5kaXJlY3RpdmUuZ2V0RGlyKGVsLCBjc3RyLmRpcmVjdGl2ZXMsIGNzdHIuY29tcG9uZW50cywgcHJlZml4KVxuICAgICwgZGlyXG4gICAgLCB0ZXJtaW5hbFByaW9yaXR5LCB0ZXJtaW5hbFxuICAgICwgcmVzdWx0ID0ge307XG4gICAgO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsID0gZGlycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBkaXIgPSBkaXJzW2ldO1xuICAgIGRpci5kaXJzID0gZGlycztcblxuICAgIC8v5a+55LqOIHRlcm1pbmFsIOS4uiB0cnVlIOeahCBkaXJlY3RpdmUsIOWcqOino+aekOWujOWFtuebuOWQjOadg+mHjeeahCBkaXJlY3RpdmUg5ZCO5Lit5pat6YGN5Y6G6K+l5YWD57SgXG4gICAgaWYodGVybWluYWxQcmlvcml0eSA+IGRpci5wcmlvcml0eSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZWwucmVtb3ZlQXR0cmlidXRlKGRpci5ub2RlTmFtZSk7XG5cbiAgICBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKTtcblxuICAgIGlmKGRpci50ZXJtaW5hbCkge1xuICAgICAgdGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQuZGlycyA9IGRpcnM7XG5cbiAgcmV0dXJuIHRlcm1pbmFsXG59XG5cbi8v5aSE55CG5paH5pys6IqC54K55Lit55qE57uR5a6a5Y2g5L2N56ymKHt7Li4ufX0pXG5mdW5jdGlvbiBjaGVja1RleHQobm9kZSkge1xuICBpZih0b2tlbi5oYXNUb2tlbihub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICB2YXIgdG9rZW5zID0gdG9rZW4ucGFyc2VUb2tlbihub2RlLm5vZGVWYWx1ZSlcbiAgICAgICwgdGV4dE1hcCA9IHRva2Vucy50ZXh0TWFwXG4gICAgICAsIGVsID0gbm9kZS5wYXJlbnROb2RlXG4gICAgICAsIGRpcnMgPSB0aGlzLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXNcbiAgICAgICwgdCwgZGlyXG4gICAgICA7XG5cbiAgICAvL+Wwhnt7a2V5fX3liIblibLmiJDljZXni6znmoTmlofmnKzoioLngrlcbiAgICBpZih0ZXh0TWFwLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRleHRNYXAuZm9yRWFjaChmdW5jdGlvbih0ZXh0KSB7XG4gICAgICAgIHZhciB0biA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKHRuLCBub2RlKTtcbiAgICAgICAgY2hlY2tUZXh0LmNhbGwodGhpcywgdG4pO1xuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgIGVsLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH1lbHNle1xuICAgICAgdCA9IHRva2Vuc1swXTtcbiAgICAgIC8v5YaF572u5ZCE5Y2g5L2N56ym5aSE55CGLlxuICAgICAgZGlyID0gY3JlYXRlKHQuZXNjYXBlID8gZGlycy50ZXh0IDogZGlycy5odG1sKTtcbiAgICAgIHNldEJpbmRpbmcuY2FsbCh0aGlzLCBleHRlbmQoZGlyLCB0LCB7XG4gICAgICAgIGVsOiBub2RlXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldEJpbmRpbmcoZGlyKSB7XG4gIGlmKGRpci5yZXBsYWNlKSB7XG4gICAgdmFyIGVsID0gZGlyLmVsO1xuICAgIGlmKGlzRnVuY3Rpb24oZGlyLnJlcGxhY2UpKSB7XG4gICAgICBkaXIubm9kZSA9IGRpci5yZXBsYWNlKCk7XG4gICAgfWVsc2UgaWYoZGlyLnJlcGxhY2Upe1xuICAgICAgZGlyLm5vZGUgPSBkb2MuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgIH1cblxuICAgIGRpci5lbCA9IGRpci5lbC5wYXJlbnROb2RlO1xuICAgIGRpci5lbC5yZXBsYWNlQ2hpbGQoZGlyLm5vZGUsIGVsKTtcbiAgfVxuXG4gIGRpci5saW5rKHRoaXMpO1xuXG4gIGFkZFdhdGNoZXIuY2FsbCh0aGlzLCBkaXIpXG59XG5cbmZ1bmN0aW9uIGFkZFdhdGNoZXIoZGlyKSB7XG4gIGlmKGRpci5wYXRoICYmIGRpci53YXRjaCkge1xuICAgIHJldHVybiBuZXcgV2F0Y2hlcih0aGlzLCBkaXIpO1xuICB9XG59XG5cblxuLy90YXJnZXQ6IGVsIOabv+aNoueahOebruagh1xuZnVuY3Rpb24gdHBsUGFyc2UodHBsLCB0YXJnZXQpIHtcbiAgdmFyIGVsLCB3cmFwZXI7XG4gIHZhciBjb250ZW50ID0gbnVsbDtcbiAgaWYoaXNPYmplY3QodGFyZ2V0KSAmJiB0YXJnZXQuY2hpbGROb2Rlcykge1xuICAgIGNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgIHdoaWxlKHRhcmdldC5jaGlsZE5vZGVzWzBdKSB7XG4gICAgICBjb250ZW50LmFwcGVuZENoaWxkKHRhcmdldC5jaGlsZE5vZGVzWzBdKTtcbiAgICB9XG4gIH1cbiAgaWYoaXNPYmplY3QodHBsKSl7XG4gICAgZWwgPSB0cGw7XG4gICAgdHBsID0gZWwub3V0ZXJIVE1MO1xuICB9ZWxzZXtcbiAgICB3cmFwZXIgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgd3JhcGVyLmlubmVySFRNTCA9IHRwbDtcblxuICAgIGVsID0gd3JhcGVyLmZpcnN0RWxlbWVudENoaWxkIHx8IHdyYXBlci5jaGlsZHJlblswXTtcblxuICB9XG4gIGlmKHRhcmdldCl7XG4gICAgdGFyZ2V0LnBhcmVudE5vZGUgJiYgdGFyZ2V0LnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGVsLCB0YXJnZXQpO1xuICB9XG5cbiAgcmV0dXJuIHtlbDogZWwsIHRwbDogdHBsLCBjb250ZW50OiBjb250ZW50fTtcbn1cblxuQmVlLnZlcnNpb24gPSAnMC4xLjInO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJlZTtcbiIsbnVsbCwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKS5leHRlbmQ7XG5cbnZhciBDbGFzcyA9IHtcbiAgLyoqIFxuICAgKiDmnoTpgKDlh73mlbDnu6fmib8uIFxuICAgKiDlpoI6IGB2YXIgQ2FyID0gQmVlLmV4dGVuZCh7ZHJpdmU6IGZ1bmN0aW9uKCl7fX0pOyBuZXcgQ2FyKCk7YFxuICAgKiBAcGFyYW0ge09iamVjdH0gW3Byb3RvUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxleWOn+Wei+WvueixoVxuICAgKiBAcGFyYW0ge09iamVjdH0gW3N0YXRpY1Byb3BzXSDlrZDmnoTpgKDlh73mlbDnmoTmianlsZXpnZnmgIHlsZ7mgKdcbiAgICogQHJldHVybiB7RnVuY3Rpb259IOWtkOaehOmAoOWHveaVsFxuICAgKi9cbiAgZXh0ZW5kOiBmdW5jdGlvbiAocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICBwcm90b1Byb3BzID0gcHJvdG9Qcm9wcyB8fCB7fTtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBwcm90b1Byb3BzLmhhc093blByb3BlcnR5KCdjb25zdHJ1Y3RvcicpID8gcHJvdG9Qcm9wcy5jb25zdHJ1Y3RvciA6IGZ1bmN0aW9uKCl7IHJldHVybiBzdXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfVxuICAgIHZhciBzdXAgPSB0aGlzO1xuICAgIHZhciBGbiA9IGZ1bmN0aW9uKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY29uc3RydWN0b3I7IH07XG4gICAgXG4gICAgRm4ucHJvdG90eXBlID0gc3VwLnByb3RvdHlwZTtcbiAgICBjb25zdHJ1Y3Rvci5wcm90b3R5cGUgPSBuZXcgRm4oKTtcbiAgICBleHRlbmQoY29uc3RydWN0b3IucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcbiAgICBleHRlbmQoY29uc3RydWN0b3IsIHN1cCwgc3RhdGljUHJvcHMsIHtfX3N1cGVyX186IHN1cC5wcm90b3R5cGV9KTtcbiAgICBcbiAgICByZXR1cm4gY29uc3RydWN0b3I7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2xhc3M7IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxuLyoqXG4gKiDms6jlhoznu4Tku7ZcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWdOYW1lIOiHquWumuS5iee7hOS7tueahOagh+etvuWQjVxuICogQHBhcmFtIHtGdW5jdGlvbnxwcm9wc30gQ29tcG9uZW50IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsCAvIOaehOmAoOWHveaVsOWPguaVsFxuICogQHJldHVybiB7RnVuY3Rpb259IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsFxuICovXG5mdW5jdGlvbiB0YWcodGFnTmFtZSwgQ29tcG9uZW50LCBzdGF0aWNzKSB7XG4gIHZhciB0YWdzID0gdGhpcy5jb21wb25lbnRzID0gdGhpcy5jb21wb25lbnRzIHx8IHt9O1xuXG4gIHRoaXMuZG9jLmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7Ly9mb3Igb2xkIElFXG5cbiAgaWYodXRpbHMuaXNPYmplY3QoQ29tcG9uZW50KSkge1xuICAgIENvbXBvbmVudCA9IHRoaXMuZXh0ZW5kKENvbXBvbmVudCwgc3RhdGljcyk7XG4gIH1cbiAgcmV0dXJuIHRhZ3NbdGFnTmFtZV0gPSBDb21wb25lbnQ7XG59XG5cbmV4cG9ydHMudGFnID0gZXhwb3J0cy5jb21wb25lbnQgPSB0YWc7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuL3Rva2VuLmpzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gICwgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlLmpzJykucGFyc2VcbiAgLCBldmFsdWF0ZSA9IHJlcXVpcmUoJy4vZXZhbC5qcycpXG5cbiAgLCBjcmVhdGUgPSB1dGlscy5jcmVhdGVcbiAgO1xuXG4vKipcbiAqIOS4uiBCZWUg5p6E6YCg5Ye95pWw5re75Yqg5oyH5LukIChkaXJlY3RpdmUpLiBgQmVlLmRpcmVjdGl2ZWBcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgZGlyZWN0aXZlIOWQjeensFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRzXSBkaXJlY3RpdmUg5Y+C5pWwXG4gKiBAcGFyYW0ge051bWJlcn0gb3B0cy5wcmlvcml0eT0wIGRpcmVjdGl2ZSDkvJjlhYjnuqcuIOWQjOS4gOS4quWFg+e0oOS4iueahOaMh+S7pOaMieeFp+S8mOWFiOe6p+mhuuW6j+aJp+ihjC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy50ZXJtaW5hbD1mYWxzZSDmiafooYzor6UgZGlyZWN0aXZlIOWQjiwg5piv5ZCm57uI5q2i5ZCO57utIGRpcmVjdGl2ZSDmiafooYwuXG4gKiAgIHRlcm1pbmFsIOS4uuecn+aXtiwg5LiO6K+lIGRpcmVjdGl2ZSDkvJjlhYjnuqfnm7jlkIznmoQgZGlyZWN0aXZlIOS7jeS8mue7p+e7reaJp+ihjCwg6L6D5L2O5LyY5YWI57qn55qE5omN5Lya6KKr5b+955WlLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLmFuY2hvciBhbmNob3Ig5Li6IHRydWUg5pe2LCDkvJrlnKjmjIfku6ToioLngrnliY3lkI7lkITkuqfnlJ/kuIDkuKrnqbrnmb3nmoTmoIforrDoioLngrkuIOWIhuWIq+WvueW6lCBgYW5jaG9ycy5zdGFydGAg5ZKMIGBhbmNob3JzLmVuZGBcbiAqL1xuZnVuY3Rpb24gZGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB2YXIgZGlycyA9IHRoaXMuZGlyZWN0aXZlcyA9IHRoaXMuZGlyZWN0aXZlcyB8fCB7fTtcblxuICByZXR1cm4gZGlyc1trZXldID0gbmV3IERpcmVjdGl2ZShrZXksIG9wdHMpO1xufVxuXG5mdW5jdGlvbiBEaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHRoaXMudHlwZSA9IGtleTtcbiAgdXRpbHMuZXh0ZW5kKHRoaXMsIG9wdHMpO1xufVxuXG5EaXJlY3RpdmUucHJvdG90eXBlID0ge1xuICBwcmlvcml0eTogMC8v5p2D6YeNXG4sIGxpbms6IHV0aWxzLm5vb3AvL+WIneWni+WMluaWueazlVxuLCB1cGRhdGU6IHV0aWxzLm5vb3AvL+abtOaWsOaWueazlVxuLCB0ZWFyRG93bjogdXRpbHMubm9vcFxuLCB0ZXJtaW5hbDogZmFsc2UvL+aYr+WQpue7iOatolxuLCByZXBsYWNlOiBmYWxzZS8v5piv5ZCm5pu/5o2i5b2T5YmN5YWD57SgLiDlpoLmnpzmmK8sIOWwhueUqOS4gOS4quepuueahOaWh+acrOiKgueCueabv+aNouW9k+WJjeWFg+e0oFxuLCB3YXRjaDogdHJ1ZS8v5piv5ZCm55uR5o6nIGtleSDnmoTlj5jljJZcblxuLCBhbmNob3I6IGZhbHNlXG4sIGFuY2hvcnM6IG51bGxcblxuICAvL+W9kyBhbmNob3Ig5Li6IHRydWUg5pe2LCDojrflj5bkuKTkuKrplJrngrnkuYvpl7TnmoTmiYDmnInoioLngrkuXG4sIGdldE5vZGVzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSBbXSwgbm9kZSA9IHRoaXMuYW5jaG9ycy5zdGFydC5uZXh0U2libGluZztcbiAgICBpZih0aGlzLmFuY2hvciAmJiBub2RlKSB7XG4gICAgICB3aGlsZShub2RlICE9PSB0aGlzLmFuY2hvcnMuZW5kKXtcbiAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dFNpYmxpbmc7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBub2RlcztcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuICAvL+ino+aekOihqOi+vuW8j1xuLCBwYXJzZTogZnVuY3Rpb24oKSB7XG4gICAgdHJ5e1xuICAgICAgdGhpcy5hc3QgPSBwYXJzZSh0aGlzLnBhdGgsIHRoaXMudHlwZSk7XG4gICAgfWNhdGNoKGUpIHtcbiAgICAgIHRoaXMuYXN0ID0ge307XG4gICAgICBlLm1lc3NhZ2UgPSAnU3ludGF4RXJyb3IgaW4gXCInICsgdGhpcy5wYXRoICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICB9XG4gIC8v6KGo6L6+5byP5rGC5YC8XG4sIGdldFZhbHVlOiBmdW5jdGlvbihzY29wZSkge1xuICAgIHZhciB2YWw7XG5cbiAgICB0cnl7XG4gICAgICB2YWwgPSBldmFsdWF0ZS5ldmFsKHRoaXMuYXN0LCBzY29wZSwgdGhpcyk7XG4gICAgfWNhdGNoKGUpe1xuICAgICAgdmFsID0gJyc7XG4gICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgIH1cbiAgICBpZih1dGlscy5pc1VuZGVmaW5lZCh2YWwpIHx8IHZhbCA9PT0gbnVsbCkge1xuICAgICAgdmFsID0gJyc7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG4gIH1cbn07XG5cbnZhciBhdHRyUG9zdFJlZyA9IC9cXD8kLztcblxuLy/ojrflj5bkuIDkuKrlhYPntKDkuIrmiYDmnInnlKggSFRNTCDlsZ7mgKflrprkuYnnmoTmjIfku6RcbmZ1bmN0aW9uIGdldERpcihlbCwgZGlyZWN0aXZlcywgY29tcG9uZW50cywgcHJlZml4KSB7XG4gIHByZWZpeCA9IHByZWZpeCB8fCAnJztcbiAgZGlyZWN0aXZlcyA9IGRpcmVjdGl2ZXMgfHwge307XG5cbiAgdmFyIGF0dHIsIGF0dHJOYW1lLCBkaXJOYW1lLCBwcm90b1xuICAgICwgZGlycyA9IFtdLCBkaXIsIGFuY2hvcnMgPSB7fVxuICAgICwgcGFyZW50ID0gZWwucGFyZW50Tm9kZVxuICAgICwgbm9kZU5hbWUgPSBlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpXG4gICAgO1xuXG4gIC8v5a+55LqO6Ieq5a6a5LmJ5qCH562+LCDlsIblhbbovazkuLogZGlyZWN0aXZlXG4gIGlmKG5vZGVOYW1lIGluIGNvbXBvbmVudHMpIHtcbiAgICBlbC5zZXRBdHRyaWJ1dGUocHJlZml4ICsgJ2NvbXBvbmVudCcsIG5vZGVOYW1lKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IGVsLmF0dHJpYnV0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgIGF0dHIgPSBlbC5hdHRyaWJ1dGVzW2ldO1xuICAgIGF0dHJOYW1lID0gYXR0ci5ub2RlTmFtZTtcbiAgICBkaXJOYW1lID0gYXR0ck5hbWUuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gICAgcHJvdG8gPSB7ZWw6IGVsLCBub2RlOiBhdHRyLCBub2RlTmFtZTogYXR0ck5hbWUsIHBhdGg6IGF0dHIudmFsdWV9O1xuICAgIGRpciA9IG51bGw7XG5cbiAgICBpZihhdHRyTmFtZS5pbmRleE9mKHByZWZpeCkgPT09IDAgJiYgKGRpck5hbWUgaW4gZGlyZWN0aXZlcykpIHtcbiAgICAgIC8v5oyH5LukXG4gICAgICBkaXIgPSBjcmVhdGUoZGlyZWN0aXZlc1tkaXJOYW1lXSk7XG4gICAgICBkaXIuZGlyTmFtZSA9IGRpck5hbWUvL2RpciDlkI1cbiAgICB9ZWxzZSBpZih0b2tlbi5oYXNUb2tlbihhdHRyLnZhbHVlKSkge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/lj6/og73mnInlpJrkuKrooajovr7lvI/ljLpcbiAgICAgIHRva2VuLnBhcnNlVG9rZW4oYXR0ci52YWx1ZSkuZm9yRWFjaChmdW5jdGlvbihvcmlnaW4pIHtcbiAgICAgICAgb3JpZ2luLmRpck5hbWUgPSBhdHRyTmFtZS5pbmRleE9mKHByZWZpeCkgPT09IDAgPyBkaXJOYW1lIDogYXR0ck5hbWUgO1xuICAgICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGNyZWF0ZShkaXJlY3RpdmVzLmF0dHIpLCBwcm90bywgb3JpZ2luKSlcbiAgICAgIH0pO1xuICAgICAgLy/nlLHkuo7lt7Lnn6XlsZ7mgKfooajovr7lvI/kuI3lrZjlnKggYW5jaG9yLCDmiYDku6Xnm7TmjqXot7Pov4fkuIvpnaLnmoTmo4DmtYtcbiAgICB9ZWxzZSBpZihhdHRyUG9zdFJlZy50ZXN0KGF0dHJOYW1lKSkge1xuICAgICAgLy/mnaHku7blsZ7mgKfmjIfku6RcbiAgICAgIGRpciA9IHV0aWxzLmV4dGVuZChjcmVhdGUoZGlyZWN0aXZlcy5hdHRyKSwgeyBkaXJOYW1lOiBhdHRyTmFtZS5yZXBsYWNlKGF0dHJQb3N0UmVnLCAnJyksIGNvbmRpdGlvbmFsOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGlmKGRpcikge1xuICAgICAgaWYoZGlyLmFuY2hvciAmJiAhYW5jaG9ycy5zdGFydCkge1xuICAgICAgICAvL+WQjOS4gOS4quWFg+e0oOS4iueahCBkaXJlY3RpdmUg5YWx5Lqr5ZCM5LiA5a+56ZSa54K5XG4gICAgICAgIGFuY2hvcnMuc3RhcnQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLnN0YXJ0LCBlbCk7XG5cbiAgICAgICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgZW5kJyk7XG4gICAgICAgIGlmKGVsLm5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLmVuZCwgZWwubmV4dFNpYmxpbmcpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoYW5jaG9ycy5lbmQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkaXIuYW5jaG9ycyA9IGRpci5hbmNob3IgPyBhbmNob3JzIDogbnVsbDtcbiAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoZGlyLCBwcm90bykpO1xuICAgIH1cbiAgfVxuICBkaXJzLnNvcnQoZnVuY3Rpb24oZDAsIGQxKSB7XG4gICAgcmV0dXJuIGQxLnByaW9yaXR5IC0gZDAucHJpb3JpdHk7XG4gIH0pO1xuICByZXR1cm4gZGlycztcbn1cblxuRGlyZWN0aXZlLmRpcmVjdGl2ZSA9IGRpcmVjdGl2ZTtcbmRpcmVjdGl2ZS5nZXREaXIgPSBnZXREaXI7XG5cbm1vZHVsZS5leHBvcnRzID0gRGlyZWN0aXZlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5bGe5oCn5oyH5LukXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkgey8vYXR0ciBiaW5kaW5nXG4gICAgICB0aGlzLmF0dHJzID0ge307XG4gICAgfWVsc2Uge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/pu5jorqTlsIblgLznva7nqbosIOmYsuatouihqOi+vuW8j+WGheWPmOmHj+S4jeWtmOWcqFxuICAgICAgdGhpcy51cGRhdGUoJycpXG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgbmV3QXR0cnMgPSB7fTtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkge1xuICAgICAgZm9yKHZhciBhdHRyIGluIHZhbCkge1xuICAgICAgICBzZXRBdHRyKGVsLCBhdHRyLCB2YWxbYXR0cl0pO1xuICAgICAgICAvL2lmKHZhbFthdHRyXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmF0dHJzW2F0dHJdO1xuICAgICAgICAvL31cbiAgICAgICAgbmV3QXR0cnNbYXR0cl0gPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvL+enu+mZpOS4jeWcqOS4iuasoeiusOW9leS4reeahOWxnuaAp1xuICAgICAgZm9yKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgcmVtb3ZlQXR0cihlbCwgYXR0cik7XG4gICAgICB9XG4gICAgICB0aGlzLmF0dHJzID0gbmV3QXR0cnM7XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLmNvbmRpdGlvbmFsKSB7XG4gICAgICAgIHZhbCA/IHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdmFsKSA6IHJlbW92ZUF0dHIoZWwsIHRoaXMuZGlyTmFtZSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy50ZXh0TWFwW3RoaXMucG9zaXRpb25dID0gdmFsICYmICh2YWwgKyAnJyk7XG4gICAgICAgIHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdGhpcy50ZXh0TWFwLmpvaW4oJycpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblxuLy9JRSDmtY/op4jlmajlvojlpJrlsZ7mgKfpgJrov4cgYHNldEF0dHJpYnV0ZWAg6K6+572u5ZCO5peg5pWILiBcbi8v6L+Z5Lqb6YCa6L+HIGBlbFthdHRyXSA9IHZhbHVlYCDorr7nva7nmoTlsZ7mgKfljbTog73lpJ/pgJrov4cgYHJlbW92ZUF0dHJpYnV0ZWAg5riF6ZmkLlxuZnVuY3Rpb24gc2V0QXR0cihlbCwgYXR0ciwgdmFsKXtcbiAgdHJ5e1xuICAgIGlmKCgoYXR0ciBpbiBlbCkgfHwgYXR0ciA9PT0gJ2NsYXNzJykpe1xuICAgICAgaWYoYXR0ciA9PT0gJ3N0eWxlJyAmJiBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCB2YWwpO1xuICAgICAgfWVsc2UgaWYoYXR0ciA9PT0gJ2NsYXNzJyl7XG4gICAgICAgIGVsLmNsYXNzTmFtZSA9IHZhbDtcbiAgICAgIH1lbHNle1xuICAgICAgICBlbFthdHRyXSA9IHR5cGVvZiBlbFthdHRyXSA9PT0gJ2Jvb2xlYW4nID8gdHJ1ZSA6IHZhbDtcbiAgICAgIH1cbiAgICB9XG4gIH1jYXRjaChlKXt9XG4gIC8vY2hyb21lIHNldGF0dHJpYnV0ZSB3aXRoIGB7e319YCB3aWxsIHRocm93IGFuIGVycm9yXG4gIGVsLnNldEF0dHJpYnV0ZShhdHRyLCB2YWwpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBdHRyKGVsLCBhdHRyKSB7XG4gIGVsLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgZGVsZXRlIGVsW2F0dHJdO1xufSIsIi8vY29tcG9uZW50IGFzIGRpcmVjdGl2ZVxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAtMTBcbiwgd2F0Y2g6IGZhbHNlXG4sIGxpbms6IGZ1bmN0aW9uKHZtKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgY29tTmFtZSA9IHRoaXMucGF0aDtcbiAgICB2YXIgY29tcG9uZW50cyA9IHZtLmNvbnN0cnVjdG9yLmNvbXBvbmVudHM7XG4gICAgdmFyIENvbXAsIGNvbXA7XG4gICAgdmFyIGRpcnMgPSBbXSwgJGRhdGEgPSB7fTtcbiAgICB2YXIgYXR0cnM7XG5cbiAgICBpZihjb21OYW1lIGluIGNvbXBvbmVudHMpIHtcbiAgICAgIENvbXAgPSBjb21wb25lbnRzW2NvbU5hbWVdO1xuXG4gICAgICAvL1RPRE9cbiAgICAgIGlmKENvbXAgPT09IHZtLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGlycyA9IHRoaXMuZGlycztcblxuICAgICAgZGlycyA9IGRpcnMuZmlsdGVyKGZ1bmN0aW9uIChkaXIpIHtcbiAgICAgICAgcmV0dXJuIGRpci50eXBlID09ICdhdHRyJyB8fCBkaXIudHlwZSA9PSAnd2l0aCc7XG4gICAgICB9KTtcblxuICAgICAgZGlycy5mb3JFYWNoKGZ1bmN0aW9uIChkaXIpIHtcbiAgICAgICAgdmFyIGN1clBhdGgsIGNvbVBhdGg7XG5cbiAgICAgICAgY3VyUGF0aCA9IGRpci5wYXRoO1xuICAgICAgICBpZihkaXIudHlwZSA9PT0gJ3dpdGgnIHx8IGRpci5kaXJOYW1lID09PSAnYXR0cicpIHtcbiAgICAgICAgICAvL+i/memHjCBhdHRyIOWPiiB3aXRoIOaMh+S7pOaViOaenOS4gOagt1xuICAgICAgICAgIGNvbVBhdGggPSAnJGRhdGEnXG4gICAgICAgICAgdXRpbHMuZXh0ZW5kKCRkYXRhLCB2bS4kZ2V0KGN1clBhdGgpKVxuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBjb21QYXRoID0gZGlyLmRpck5hbWU7XG4gICAgICAgICAgJGRhdGFbY29tUGF0aF0gPSB2bS4kZ2V0KGN1clBhdGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy/nm5HlkKzniLbnu4Tku7bmm7TmlrAsIOWQjOatpeaVsOaNrlxuICAgICAgICB2bS4kd2F0Y2goY3VyUGF0aCwgZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgIGlmKGNvbXApe1xuICAgICAgICAgICAgdmFsID0gZGlyLnRleHRNYXAgPyBkaXIudGV4dE1hcC5qb2luKCcnKSA6IHZhbDtcbiAgICAgICAgICAgIGNvbXAuJHNldChjb21QYXRoLCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0pO1xuXG4gICAgICBhdHRycyA9IGVsLmF0dHJpYnV0ZXM7XG4gICAgICAvL+aZrumAmuWxnuaAp1xuICAgICAgZm9yKHZhciBpID0gYXR0cnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgJGRhdGFbYXR0cnNbMF0ubm9kZU5hbWVdID0gYXR0cnNbMF0udmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGNvbXAgPSBuZXcgQ29tcCh7XG4gICAgICAgICR0YXJnZXQ6IGVsLFxuICAgICAgICAkcm9vdDogdm0uJHJvb3QsXG4gICAgICAgICRkYXRhOiB1dGlscy5leHRlbmQoe30sIENvbXAucHJvdG90eXBlLiRkYXRhLCAkZGF0YSlcbiAgICAgIH0pO1xuXG4gICAgICAvL+ebtOaOpeWwhmNvbXBvbmVudCDkvZzkuLrmoLnlhYPntKDml7YsIOWQjOatpei3n+aWsOWuueWZqCAuJGVsIOW8leeUqFxuICAgICAgaWYodm0uJGVsID09PSBlbCkge1xuICAgICAgICB2bS4kZWwgPSBjb21wLiRlbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1lbHNle1xuICAgICAgY29uc29sZS53YXJuKCdDb21wb25lbnQ6ICcgKyBjb21OYW1lICsgJyBub3QgZGVmaW5lZCEgSWdub3JlJyk7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICByZXBsYWNlOiB0cnVlXHJcbiwgYW5jaG9yOiB0cnVlXHJcbiAgLy9jb250ZW50OiBkb20g5a+56LGhXHJcbiwgdXBkYXRlOiBmdW5jdGlvbihjb250ZW50KSB7XHJcbiAgICB2YXIgbm9kZXMgPSB0aGlzLmdldE5vZGVzKClcclxuICAgIHZhciBwYXJlbnQgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XHJcbiAgICBub2Rlcy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcclxuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKG5vZGUpO1xyXG4gICAgfSlcclxuICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoY29udGVudCwgdGhpcy5hbmNob3JzLmVuZClcclxuICB9XHJcbn0iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4uL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpXG4gIDtcblxudmFyIGRpcnMgPSB7fTtcblxuXG5kaXJzLnRleHQgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLm5vZGUubm9kZVZhbHVlID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuICB9XG59O1xuXG5cbmRpcnMuaHRtbCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5vZGVzID0gW107XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWwuaW5uZXJIVE1MID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuXG4gICAgdmFyIG5vZGU7XG4gICAgd2hpbGUobm9kZSA9IHRoaXMubm9kZXMucG9wKCkpIHtcbiAgICAgIG5vZGUucGFyZW50Tm9kZSAmJiBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfVxuXG4gICAgdmFyIG5vZGVzID0gZWwuY2hpbGROb2RlcztcbiAgICB3aGlsZShub2RlID0gbm9kZXNbMF0pIHtcbiAgICAgIHRoaXMubm9kZXMucHVzaChub2RlKTtcbiAgICAgIHRoaXMuZWwuaW5zZXJ0QmVmb3JlKG5vZGUsIHRoaXMubm9kZSk7XG4gICAgfVxuICB9XG59O1xuXG5cbmRpcnNbJ2lmJ10gPSB7XG4gIGFuY2hvcjogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmVsLmNvbnRlbnQpIHtcbiAgICAgIHRoaXMuZnJhZyA9IHRoaXMuZWwuY29udGVudDtcbiAgICAgIHRoaXMuZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmVsKTtcbiAgICB9ZWxzZXtcbiAgICAgIHRoaXMuZnJhZyA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgICAgIHRoaXMuaGlkZSgpO1xuICAgIH1cbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIGlmKHZhbCkge1xuICAgICAgaWYoIXRoaXMuc3RhdGUpIHsgdGhpcy5zaG93KCkgfVxuICAgIH1lbHNle1xuICAgICAgaWYodGhpcy5zdGF0ZSkgeyB0aGlzLmhpZGUoKTsgfVxuICAgIH1cbiAgICB0aGlzLnN0YXRlID0gdmFsO1xuICB9XG5cbiwgc2hvdzogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9ycy5lbmQ7XG5cbiAgICBhbmNob3IucGFyZW50Tm9kZSAmJiBhbmNob3IucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5mcmFnLCBhbmNob3IpO1xuICB9XG4sIGhpZGU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKTtcblxuICAgIGlmKG5vZGVzKSB7XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gbm9kZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHRoaXMuZnJhZy5hcHBlbmRDaGlsZChub2Rlc1tpXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5kaXJzLnRlbXBsYXRlID0ge1xuICBwcmlvcml0eTogMTAwMDBcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5lbC5jaGlsZE5vZGVzXG4gICAgICAsIGZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICA7XG5cbiAgICB3aGlsZShub2Rlc1swXSkge1xuICAgICAgZnJhZy5hcHBlbmRDaGlsZChub2Rlc1swXSk7XG4gICAgfVxuXG4gICAgdGhpcy5lbC5jb250ZW50ID0gZnJhZztcblxuICAgIC8vdGhpcy5lbC5zZXRBdHRyaWJ1dGUodGhpcy5ub2RlTmFtZSwgJycpO1xuICB9XG59O1xuXG4vL+WbvueJh+eUqCwg6YG/5YWN5Yqg6L295aSn5ous5Y+355qE5Y6f5aeL5qih5p2/5YaF5a65XG5kaXJzLnNyYyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLmVsLnNyYyA9IHZhbDtcbiAgfVxufTtcblxuZGlyc1snd2l0aCddID0ge307XG5cbi8vZGlycy5wYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsLmpzJyk7XG5kaXJzLnJlcGVhdCA9IHJlcXVpcmUoJy4vcmVwZWF0LmpzJyk7XG5kaXJzLmF0dHIgPSByZXF1aXJlKCcuL2F0dHIuanMnKTtcbmRpcnMubW9kZWwgPSByZXF1aXJlKCcuL21vZGVsLmpzJyk7XG5kaXJzLnN0eWxlID0gcmVxdWlyZSgnLi9zdHlsZS5qcycpO1xuZGlycy5vbiA9IHJlcXVpcmUoJy4vb24uanMnKTtcbmRpcnMuY29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQuanMnKTtcbmRpcnMuY29udGVudCA9IHJlcXVpcmUoJy4vY29udGVudC5qcycpXG5cbm1vZHVsZS5leHBvcnRzID0gZGlycztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgaGFzVG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpLmhhc1Rva2VuXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbWluYWw6IHRydWVcbiwgcHJpb3JpdHk6IDFcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICB2YXIga2V5UGF0aCA9IHRoaXMucGF0aDtcbiAgICB2YXIgcGF0aHMgPSB1dGlscy5wYXJzZUtleVBhdGgoa2V5UGF0aCk7XG4gICAgdmFyIGhlYWRQYXRoID0gcGF0aHNbMF07XG5cbiAgICBpZigha2V5UGF0aCkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgIC8vVE9ETyDlrp7njrDnsbvkvLwgLiRnZXQg55qEIC4kc2V0XG4gICAgaWYodm0uJHBhcmVudCkge1xuICAgICAgaWYgKHZtLl9hc3NpZ25tZW50cyAmJiB2bS5fYXNzaWdubWVudHNbMF0gPT09IGhlYWRQYXRoKSB7XG4gICAgICAgIGtleVBhdGggPSBwYXRocy5zbGljZSgxKS5qb2luKCcuJykgfHwgJyRkYXRhJztcbiAgICAgIH1lbHNle1xuICAgICAgICB2bSA9IHZtLiRwYXJlbnQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGVsID0gdGhpcy5lbFxuICAgICAgLCBldiA9ICdjaGFuZ2UnXG4gICAgICAsIGF0dHIsIHZhbHVlID0gYXR0ciA9ICd2YWx1ZSdcbiAgICAgICwgYW50ID0gdm1cbiAgICAgICwgaXNTZXREZWZhdXQgPSB1dGlscy5pc1VuZGVmaW5lZChhbnQuJGdldChrZXlQYXRoLCBmYWxzZSkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG4gICAgICAsIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gZWxbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBlbFthdHRyXSA9IG5ld1ZhbDsgfVxuICAgICAgICB9XG4gICAgICAsIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICB2YXIgdmFsID0gZWxbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFsKTtcbiAgICAgICAgfVxuICAgICAgLCBjYWxsSGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICBpZihlICYmIGUucHJvcGVydHlOYW1lICYmIGUucHJvcGVydHlOYW1lICE9PSBhdHRyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICB9XG4gICAgICAsIGllID0gdXRpbHMuaWVcbiAgICAgIDtcblxuICAgIHN3aXRjaChlbC50YWdOYW1lKSB7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnaW5uZXJIVE1MJztcbiAgICAgICAgLy9ldiArPSAnIGJsdXInO1xuICAgICAgY2FzZSAnSU5QVVQnOlxuICAgICAgY2FzZSAnVEVYVEFSRUEnOlxuICAgICAgICBzd2l0Y2goZWwudHlwZSkge1xuICAgICAgICAgIGNhc2UgJ2NoZWNrYm94JzpcbiAgICAgICAgICAgIHZhbHVlID0gYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgIC8vSUU2LCBJRTcg5LiL55uR5ZCsIHByb3BlcnR5Y2hhbmdlIOS8muaMgj9cbiAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAncmFkaW8nOlxuICAgICAgICAgICAgYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICBlbC5jaGVja2VkID0gZWwudmFsdWUgPT09IHZhbCArICcnO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlzU2V0RGVmYXV0ID0gZWwuY2hlY2tlZDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYoIWFudC4kbGF6eSl7XG4gICAgICAgICAgICAgIGlmKCdvbmlucHV0JyBpbiBlbCl7XG4gICAgICAgICAgICAgICAgZXYgKz0gJyBpbnB1dCc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy9JRSDkuIvnmoQgaW5wdXQg5LqL5Lu25pu/5LujXG4gICAgICAgICAgICAgIGlmKGllKSB7XG4gICAgICAgICAgICAgICAgZXYgKz0gJyBrZXl1cCBwcm9wZXJ0eWNoYW5nZSBjdXQnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VMRUNUJzpcbiAgICAgICAgaWYoZWwubXVsdGlwbGUpe1xuICAgICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICAgIHZhciB2YWxzID0gW107XG4gICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gZWwub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICBpZihlbC5vcHRpb25zW2ldLnNlbGVjdGVkKXsgdmFscy5wdXNoKGVsLm9wdGlvbnNbaV0udmFsdWUpIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFudC4kc2V0KGtleVBhdGgsIHZhbHMpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbih2YWxzKXtcbiAgICAgICAgICAgIGlmKHZhbHMgJiYgdmFscy5sZW5ndGgpe1xuICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gZWwub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICAgIGVsLm9wdGlvbnNbaV0uc2VsZWN0ZWQgPSB2YWxzLmluZGV4T2YoZWwub3B0aW9uc1tpXS52YWx1ZSkgIT09IC0xO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpc1NldERlZmF1dCA9IGlzU2V0RGVmYXV0ICYmICFoYXNUb2tlbihlbFt2YWx1ZV0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgdGhpcy51cGRhdGUgPSBjYWxsYmFjaztcblxuICAgIGV2LnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24oZSl7XG4gICAgICBldmVudHMucmVtb3ZlRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgIGV2ZW50cy5hZGRFdmVudChlbCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgIH0pO1xuXG4gICAgLy/moLnmja7ooajljZXlhYPntKDnmoTliJ3lp4vljJbpu5jorqTlgLzorr7nva7lr7nlupQgbW9kZWwg55qE5YC8XG4gICAgaWYoZWxbdmFsdWVdICYmIGlzU2V0RGVmYXV0KXtcbiAgICAgICBoYW5kbGVyKHRydWUpO1xuICAgIH1cblxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5LqL5Lu255uR5ZCsXG5cbnZhciBldmVudEJpbmQgPSByZXF1aXJlKCcuLi9ldmVudC1iaW5kLmpzJyk7XG5cbi8vVE9ETyDnp7vpmaTml7bnmoTmg4XlhrVcbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIC8vdGhpcy5ldmVudHMgPSB7fTtcbiAgICB0aGlzLnZtID0gdm07XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbihldmVudHMpIHtcbiAgICB2YXIgc2VsZWN0b3IsIGV2ZW50VHlwZTtcbiAgICBmb3IodmFyIG5hbWUgaW4gZXZlbnRzKSB7XG4gICAgICBzZWxlY3RvciA9IG5hbWUuc3BsaXQoL1xccysvKTtcbiAgICAgIGV2ZW50VHlwZSA9IHNlbGVjdG9yWzBdO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3RvclsxXTtcbiAgICAgIGV2ZW50QmluZC5hZGRFdmVudCh0aGlzLmVsLCBldmVudFR5cGUsIGNhbGxIYW5kbGVyKHRoaXMsIHNlbGVjdG9yLCBldmVudHNbbmFtZV0pKTtcbiAgICB9XG4gIH1cbn1cblxuLy/lp5TmiZjkuovku7ZcbmZ1bmN0aW9uIGNhbGxIYW5kbGVyIChkaXIsIHNlbGVjdG9yLCBjYWxsYmFjaykge1xuICByZXR1cm4gZnVuY3Rpb24oZSkge1xuICAgIHZhciBlbHMgPSBzZWxlY3RvciA/IFtdLnNsaWNlLmNhbGwoZGlyLmVsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSA6IFtlLnRhcmdldF07XG4gICAgdmFyIGN1ciA9IGUudGFyZ2V0O1xuICAgIGRve1xuICAgICAgaWYoZWxzLmluZGV4T2YoY3VyKSA+PSAwKSB7XG4gICAgICAgIGUuZGVsZWdhdGVUYXJnZXQgPSBjdXI7Ly/lp5TmiZjlhYPntKBcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoZGlyLnZtLCBlKVxuICAgICAgfVxuICAgIH13aGlsZShjdXIgPSBjdXIucGFyZW50Tm9kZSlcbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICA7XG5cbi8v6L+Z5Lqb5pWw57uE5pON5L2c5pa55rOV6KKr6YeN5YaZ5oiQ6Ieq5Yqo6Kem5Y+R5pu05pawXG52YXIgYXJyYXlNZXRob2RzID0gWydzcGxpY2UnLCAncHVzaCcsICdwb3AnLCAnc2hpZnQnLCAndW5zaGlmdCcsICdzb3J0JywgJ3JldmVyc2UnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAxMDAwXG4sIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBjc3RyID0gdGhpcy5jc3RyID0gdm0uY29uc3RydWN0b3I7XG4gICAgdGhpcy52bSA9IHZtO1xuXG4gICAgd2hpbGUoY3N0ci5fX3N1cGVyX18pe1xuICAgICAgY3N0ciA9IHRoaXMuY3N0ciA9IGNzdHIuX19zdXBlcl9fLmNvbnN0cnVjdG9yO1xuICAgIH1cblxuXG4gICAgdGhpcy5jdXJBcnIgPSBbXTtcbiAgICB0aGlzLmxpc3QgPSBbXTsvL1t7ZWw6ZWwsIHZtOiB2bX1dXG5cbiAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbihpdGVtcykge1xuICAgIHZhciBjdXJBcnIgPSB0aGlzLmN1ckFycjtcbiAgICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZTtcbiAgICB2YXIgdGhhdCA9IHRoaXMsIGxpc3QgPSB0aGlzLmxpc3Q7XG5cbiAgICBpZih1dGlscy5pc0FycmF5KGl0ZW1zKSkge1xuICAgICAgLy8g5ZyoIHJlcGVhdCDmjIfku6Tooajovr7lvI/kuK1cbiAgICAgIHRoaXMubGlzdFBhdGggPSB0aGlzLmxvY2Fscy5maWx0ZXIoZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICByZXR1cm4gIXV0aWxzLmlzRnVuY3Rpb24odGhhdC52bS4kZ2V0KHBhdGgpKVxuICAgICAgfSk7XG5cbiAgICAgIC8v5Yig6Zmk5YWD57SgXG4gICAgICBhcnJEaWZmKGN1ckFyciwgaXRlbXMpLmZvckVhY2goZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICB2YXIgcG9zID0gY3VyQXJyLmluZGV4T2YoaXRlbSlcbiAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDEpXG4gICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobGlzdFtwb3NdLmVsKVxuICAgICAgICBsaXN0LnNwbGljZShwb3MsIDEpXG4gICAgICB9KVxuXG4gICAgICBpdGVtcy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0sIGkpIHtcbiAgICAgICAgdmFyIHBvcyA9IGl0ZW1zLmluZGV4T2YoaXRlbSwgaSlcbiAgICAgICAgICAsIG9sZFBvcyA9IGN1ckFyci5pbmRleE9mKGl0ZW0sIGkpXG4gICAgICAgICAgLCB2bSwgZWxcbiAgICAgICAgICA7XG5cbiAgICAgICAgcG9zIDwgMCAmJiAocG9zID0gaXRlbXMubGFzdEluZGV4T2YoaXRlbSwgaSkpO1xuICAgICAgICBvbGRQb3MgPCAwICYmIChvbGRQb3MgPSBjdXJBcnIubGFzdEluZGV4T2YoaXRlbSwgaSkpO1xuXG4gICAgICAgIC8v5paw5aKe5YWD57SgXG4gICAgICAgIGlmKG9sZFBvcyA8IDApIHtcblxuXG4gICAgICAgICAgZWwgPSB0aGlzLmVsLmNsb25lTm9kZSh0cnVlKVxuXG4gICAgICAgICAgdm0gPSBuZXcgdGhpcy5jc3RyKGVsLCB7XG4gICAgICAgICAgICAkZGF0YTogaXRlbSwgX2Fzc2lnbm1lbnRzOiB0aGlzLmFzc2lnbm1lbnRzLCAkaW5kZXg6IHBvcyxcbiAgICAgICAgICAgICRyb290OiB0aGlzLnZtLiRyb290LCAkcGFyZW50OiB0aGlzLnZtXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodm0uJGVsLCBsaXN0W3Bvc10gJiYgbGlzdFtwb3NdLmVsIHx8IHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgbGlzdC5zcGxpY2UocG9zLCAwLCB7ZWw6IGVsLCB2bTogdm19KTtcbiAgICAgICAgICBjdXJBcnIuc3BsaWNlKHBvcywgMCwgaXRlbSlcblxuICAgICAgICAgIC8v5bu25pe26LWL5YC857uZIGBfcmVsYXRpdmVQYXRoYCwg6YG/5YWN5Ye6546w5q275b6q546vXG4gICAgICAgICAgLy/lpoLmnpzlnKjkuIrpnaLlrp7kvovljJbml7blvZPlj4LmlbDkvKDlhaUsIOS8muWGkuazoeWIsOeItue6pyB2bSDpgJLlvZLosIPnlKjov5nph4znmoQgdXBkYXRlIOaWueazlSwg6YCg5oiQ5q275b6q546vLlxuICAgICAgICAgIHZtLl9yZWxhdGl2ZVBhdGggPSB0aGlzLmxpc3RQYXRoO1xuICAgICAgICB9ZWxzZSB7XG5cbiAgICAgICAgICAvL+iwg+W6j1xuICAgICAgICAgIGlmIChwb3MgIT09IG9sZFBvcykge1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobGlzdFtvbGRQb3NdLmVsLCBsaXN0W3Bvc10gJiYgbGlzdFtwb3NdLmVsIHx8IHRoYXQuYW5jaG9yLmVuZClcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3RbcG9zXS5lbCwgbGlzdFtvbGRQb3MgKyAxXSAmJiBsaXN0W29sZFBvcyArIDFdLmVsIHx8IHRoYXQuYW5jaG9yLmVuZClcbiAgICAgICAgICAgIGxpc3Rbb2xkUG9zXSA9IFtsaXN0W3Bvc10sIGxpc3RbcG9zXSA9IGxpc3Rbb2xkUG9zXV1bMF1cbiAgICAgICAgICAgIGN1ckFycltvbGRQb3NdID0gW2N1ckFycltwb3NdLCBjdXJBcnJbcG9zXSA9IGN1ckFycltvbGRQb3NdXVswXVxuICAgICAgICAgICAgbGlzdFtwb3NdLnZtLiRpbmRleCA9IHBvc1xuICAgICAgICAgICAgbGlzdFtwb3NdLnZtLiR1cGRhdGUoJyRpbmRleCcpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpXG5cbiAgICAgIC8v5pu05paw57Si5byVXG4gICAgICB0aGlzLmxpc3QuZm9yRWFjaChmdW5jdGlvbihpdGVtLCBpKSB7XG4gICAgICAgIGl0ZW0udm0uJGluZGV4ID0gaVxuICAgICAgICBpdGVtLmVsLiRpbmRleCA9IGlcbiAgICAgICAgaXRlbS52bS4kdXBkYXRlKCckaW5kZXgnLCBmYWxzZSlcbiAgICAgIH0pO1xuXG4gICAgICBpZighaXRlbXMuX19iZWVfXyl7XG4gICAgICAgIC8v5pWw57uE5pON5L2c5pa55rOVXG4gICAgICAgIHV0aWxzLmV4dGVuZChpdGVtcywge1xuICAgICAgICAgICRzZXQ6IGZ1bmN0aW9uKGksIGl0ZW0pIHtcbiAgICAgICAgICAgIHRoYXQubGlzdFtpXS52bS4kc2V0KGl0ZW0pO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgJHJlcGxhY2U6IGZ1bmN0aW9uKGksIGl0ZW0pIHtcbiAgICAgICAgICAgIHRoYXQubGlzdFtpXS52bS4kcmVwbGFjZShpdGVtKVxuICAgICAgICAgIH0sXG4gICAgICAgICAgJHJlbW92ZTogZnVuY3Rpb24oaSkge1xuICAgICAgICAgICAgaXRlbXMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgdGhhdC5saXN0UGF0aC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgICAgdGhhdC52bS4kdXBkYXRlKHBhdGgpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcnJheU1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgICAgICAgICBpdGVtc1ttZXRob2RdID0gdXRpbHMuYWZ0ZXJGbihpdGVtc1ttZXRob2RdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoYXQubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgICAgICAgIHRoYXQudm0uJHVwZGF0ZShwYXRoKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICAgICAgaXRlbXMuX19iZWVfXyAgPSB0cnVlO1xuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgLy9UT0RPIOaZrumAmuWvueixoeeahOmBjeWOhlxuICAgIH1cbiAgfVxufTtcblxuXG5mdW5jdGlvbiBhcnJEaWZmKGFycjEsIGFycjIpIHtcbiAgcmV0dXJuIGFycjEuZmlsdGVyKGZ1bmN0aW9uKGVsKSB7XG4gICAgcmV0dXJuIGFycjIuaW5kZXhPZihlbCkgPCAwXG4gIH0pXG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/moLflvI/mjIfku6RcblxudmFyIGNhbWVsUmVnID0gLyhbQS1aXSkvZztcblxuLy/pu5jorqTljZXkvY3kuLogcHgg55qE5bGe5oCnXG4vL1RPRE8g5b6F5a6M5ZaEXG52YXIgcGl4ZWxBdHRycyA9IFtcbiAgJ3dpZHRoJywnaGVpZ2h0JyxcbiAgJ21hcmdpbicsICdtYXJnaW4tdG9wJywgJ21hcmdpbi1yaWdodCcsICdtYXJnaW4tbGVmdCcsICdtYXJnaW4tYm90dG9tJyxcbiAgJ3BhZGRpbmcnLCAncGFkZGluZy10b3AnLCAncGFkZGluZy1yaWdodCcsICdwYWRkaW5nLWJvdHRvbScsICdwYWRkaW5nLWxlZnQnXG5dXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB1cGRhdGU6IGZ1bmN0aW9uKHN0eWxlcykge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIHN0eWxlU3RyID0gJyc7XG4gICAgdmFyIGRhc2hLZXksIHZhbDtcblxuICAgIGZvcih2YXIga2V5IGluIHN0eWxlcykge1xuICAgICAgdmFsID0gc3R5bGVzW2tleV07XG5cbiAgICAgIGRhc2hLZXkgPSBrZXkucmVwbGFjZShjYW1lbFJlZywgZnVuY3Rpb24gKHVwcGVyQ2hhcikge1xuICAgICAgICByZXR1cm4gJy0nICsgdXBwZXJDaGFyLnRvTG93ZXJDYXNlKCk7XG4gICAgICB9KTtcblxuICAgICAgaWYoIWlzTmFOKHZhbCkgJiYgcGl4ZWxBdHRycy5pbmRleE9mKGRhc2hLZXkpID49IDApIHtcbiAgICAgICAgdmFsICs9ICdweCc7XG4gICAgICB9XG4gICAgICBzdHlsZVN0ciArPSBkYXNoS2V5ICsgJzogJyArIHZhbCArICc7ICc7XG4gICAgfVxuICAgIGlmKGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAvL+iAgSBJRVxuICAgICAgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0Jywgc3R5bGVTdHIpO1xuICAgIH1lbHNle1xuICAgICAgZWwuc2V0QXR0cmlidXRlKCdzdHlsZScsIHN0eWxlU3RyKTtcbiAgICB9XG4gIH1cbn07IiwiKGZ1bmN0aW9uKHJvb3Qpe1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBleHBvcnRzLnJvb3QgPSByb290O1xuICBleHBvcnRzLmRvY3VtZW50ID0gcm9vdC5kb2N1bWVudCB8fCByZXF1aXJlKCdqc2RvbScpLmpzZG9tKCk7XG5cbn0pKChmdW5jdGlvbigpIHtyZXR1cm4gdGhpc30pKCkpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBvcGVyYXRvcnMgPSB7XG4gICd1bmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICt2OyB9XG4gICwgJy0nOiBmdW5jdGlvbih2KSB7IHJldHVybiAtdjsgfVxuICAsICchJzogZnVuY3Rpb24odikgeyByZXR1cm4gIXY7IH1cblxuICAsICdbJzogZnVuY3Rpb24odil7IHJldHVybiB2OyB9XG4gICwgJ3snOiBmdW5jdGlvbih2KXtcbiAgICAgIHZhciByID0ge307XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gdi5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgclt2W2ldWzBdXSA9IHZbaV1bMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gcjtcbiAgICB9XG4gICwgJ3R5cGVvZic6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdHlwZW9mIHY7IH1cbiAgLCAnbmV3JzogZnVuY3Rpb24odil7IHJldHVybiBuZXcgdiB9XG4gIH1cblxuLCAnYmluYXJ5Jzoge1xuICAgICcrJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCArIHI7IH1cbiAgLCAnLSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLSByOyB9XG4gICwgJyonOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICogcjsgfVxuICAsICcvJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAvIHI7IH1cbiAgLCAnJSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJSByOyB9XG4gICwgJzwnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIDwgcjsgfVxuICAsICc+JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+IHI7IH1cbiAgLCAnPD0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIDw9IHI7IH1cbiAgLCAnPj0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID49IHI7IH1cbiAgLCAnPT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID09IHI7IH1cbiAgLCAnIT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICE9IHI7IH1cbiAgLCAnPT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PT0gcjsgfVxuICAsICchPT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICE9PSByOyB9XG4gICwgJyYmJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAmJiByOyB9XG4gICwgJ3x8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCB8fCByOyB9XG5cbiAgLCAnLic6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKHIpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG4gICwgJ1snOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZih0eXBlb2YgciAhPT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG5cbiAgLCAnKCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gbC5hcHBseShjb250ZXh0LmxvY2FscywgcikgfVxuICAsICd8JzogZnVuY3Rpb24obCwgcil7IHJldHVybiByLmNhbGwoY29udGV4dC5sb2NhbHMsIGwpIH0vL2ZpbHRlci4gbmFtZXxmaWx0ZXJcbiAgLCAnbmV3JzogZnVuY3Rpb24obCwgcil7XG4gICAgICByZXR1cm4gbCA9PT0gRGF0ZSA/IG5ldyBGdW5jdGlvbigncmV0dXJuIG5ldyBEYXRlKCcgKyByLmpvaW4oJywgJykgKyAnKScpKCkgOiBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KGwsIHIpKTtcbiAgICB9XG5cbiAgLCAnaW4nOiBmdW5jdGlvbihsLCByKXtcbiAgICAgIGlmKHRoaXMuYXNzaWdubWVudCkge1xuICAgICAgICAvL3JlcGVhdFxuICAgICAgICByZXR1cm4gcjtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm4gbCBpbiByO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4sICd0ZXJuYXJ5Jzoge1xuICAgICc/JzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZiA/IHMgOiB0OyB9XG4gICwgJygnOiBmdW5jdGlvbihmLCBzLCB0KSB7IHJldHVybiBmW3NdLmFwcGx5KGYsIHQpIH1cblxuICAvL2ZpbHRlci4gbmFtZSB8IGZpbHRlciA6IGFyZzIgOiBhcmczXG4gICwgJ3wnOiBmdW5jdGlvbihmLCBzLCB0KXsgcmV0dXJuIHMuYXBwbHkoY29udGV4dC5sb2NhbHMsIFtmXS5jb25jYXQodCkpOyB9XG4gIH1cbn07XG5cbnZhciBhcmdOYW1lID0gWydmaXJzdCcsICdzZWNvbmQnLCAndGhpcmQnXVxuICAsIGNvbnRleHQsIHN1bW1hcnksIHN1bW1hcnlDYWxsXG4gICwgcGF0aFxuICAsIHNlbGZcbiAgO1xuXG4vL+mBjeWOhiBhc3RcbnZhciBldmFsdWF0ZSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdmFyIGFyaXR5ID0gdHJlZS5hcml0eVxuICAgICwgdmFsdWUgPSB0cmVlLnZhbHVlXG4gICAgLCBhcmdzID0gW11cbiAgICAsIG4gPSAwXG4gICAgLCBhcmdcbiAgICAsIHJlc1xuICAgIDtcblxuICAvL+aTjeS9nOespuacgOWkmuWPquacieS4ieWFg1xuICBmb3IoOyBuIDwgMzsgbisrKXtcbiAgICBhcmcgPSB0cmVlW2FyZ05hbWVbbl1dO1xuICAgIGlmKGFyZyl7XG4gICAgICBpZihBcnJheS5pc0FycmF5KGFyZykpe1xuICAgICAgICBhcmdzW25dID0gW107XG4gICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBhcmcubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICBhcmdzW25dLnB1c2godHlwZW9mIGFyZ1tpXS5rZXkgPT09ICd1bmRlZmluZWQnID9cbiAgICAgICAgICAgIGV2YWx1YXRlKGFyZ1tpXSkgOiBbYXJnW2ldLmtleSwgZXZhbHVhdGUoYXJnW2ldKV0pO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYXJnc1tuXSA9IGV2YWx1YXRlKGFyZyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoYXJpdHkgIT09ICdsaXRlcmFsJykge1xuICAgIGlmKHBhdGggJiYgdmFsdWUgIT09ICcuJyAmJiB2YWx1ZSAhPT0gJ1snKSB7XG4gICAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYoYXJpdHkgPT09ICduYW1lJykge1xuICAgICAgcGF0aCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHN3aXRjaChhcml0eSl7XG4gICAgY2FzZSAndW5hcnknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAndGVybmFyeSc6XG4gICAgICB0cnl7XG4gICAgICAgIHJlcyA9IGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSkuYXBwbHkodHJlZSwgYXJncyk7XG4gICAgICB9Y2F0Y2goZSl7XG4gICAgICAgIHN1bW1hcnlDYWxsIHx8IGNvbnNvbGUud2FybihlKTtcbiAgICAgIH1cbiAgICBicmVhaztcbiAgICBjYXNlICdsaXRlcmFsJzpcbiAgICAgIHJlcyA9IHZhbHVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2Fzc2lnbm1lbnQnOlxuICAgICAgc3VtbWFyeS5hc3NpZ25tZW50c1t2YWx1ZV0gPSB0cnVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ25hbWUnOlxuICAgICAgc3VtbWFyeS5sb2NhbHNbdmFsdWVdID0gdHJ1ZTtcbiAgICAgIHJlcyA9IGdldFZhbHVlKHZhbHVlLCBjb250ZXh0LmxvY2Fscyk7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnZmlsdGVyJzpcbiAgICAgIHN1bW1hcnkuZmlsdGVyc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gY29udGV4dC5maWx0ZXJzW3ZhbHVlXTtcbiAgICBicmVhaztcbiAgICBjYXNlICd0aGlzJzpcbiAgICAgIHJlcyA9IGNvbnRleHQubG9jYWxzOy8vVE9ETyB0aGlzIOaMh+WQkSB2bSDov5jmmK8gZGlyP1xuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpe1xuICByZXR1cm4gb3BlcmF0b3JzW2FyaXR5XVt2YWx1ZV0gfHwgZnVuY3Rpb24oKSB7IHJldHVybjsgfVxufVxuXG5mdW5jdGlvbiByZXNldChzY29wZSwgdGhhdCkge1xuICBzdW1tYXJ5Q2FsbCA9IHRydWU7XG4gIGlmKHNjb3BlKSB7XG4gICAgc3VtbWFyeUNhbGwgPSBmYWxzZTtcbiAgICBjb250ZXh0ID0ge2xvY2Fsczogc2NvcGUgfHwge30sIGZpbHRlcnM6IHNjb3BlLiRmaWx0ZXJzIHx8IHt9fTtcbiAgfWVsc2V7XG4gICAgY29udGV4dCA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fX07XG4gIH1cbiAgaWYodGhhdCl7XG4gICAgc2VsZiA9IHRoYXQ7XG4gIH1cblxuICBzdW1tYXJ5ID0ge2ZpbHRlcnM6IHt9LCBsb2NhbHM6IHt9LCBwYXRoczoge30sIGFzc2lnbm1lbnRzOiB7fX07XG4gIHBhdGggPSAnJztcbn1cblxuLy/lnKjkvZznlKjln5/kuK3mn6Xmib7lgLxcbnZhciBnZXRWYWx1ZSA9IGZ1bmN0aW9uIChrZXksIHNjb3BlKSB7XG4gIGlmKHNjb3BlLiRnZXQpIHtcbiAgICByZXR1cm4gc2NvcGUuJGdldChrZXksIGZhbHNlKVxuICB9ZWxzZXtcbiAgICByZXR1cm4gc2NvcGVba2V5XVxuICB9XG59XG5cbi8v6KGo6L6+5byP5rGC5YC8XG4vL3RyZWU6IHBhcnNlciDnlJ/miJDnmoQgYXN0XG4vL3Njb3BlIOaJp+ihjOeOr+Wig1xuZXhwb3J0cy5ldmFsID0gZnVuY3Rpb24odHJlZSwgc2NvcGUsIHRoYXQpIHtcbiAgcmVzZXQoc2NvcGUgfHwge30sIHRoYXQpO1xuXG4gIHJldHVybiBldmFsdWF0ZSh0cmVlKTtcbn07XG5cbi8v6KGo6L6+5byP5pGY6KaBXG4vL3JldHVybjoge2ZpbHRlcnM6W10sIGxvY2FsczpbXSwgcGF0aHM6IFtdLCBhc3NpZ25tZW50czogW119XG5leHBvcnRzLnN1bW1hcnkgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHJlc2V0KCk7XG5cbiAgZXZhbHVhdGUodHJlZSk7XG5cbiAgaWYocGF0aCkge1xuICAgIHN1bW1hcnkucGF0aHNbcGF0aF0gPSB0cnVlO1xuICB9XG4gIGZvcih2YXIga2V5IGluIHN1bW1hcnkpIHtcbiAgICBzdW1tYXJ5W2tleV0gPSBPYmplY3Qua2V5cyhzdW1tYXJ5W2tleV0pO1xuICB9XG4gIHJldHVybiBzdW1tYXJ5O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5leHBvcnRzLmFkZEV2ZW50ID0gZnVuY3Rpb24gYWRkRXZlbnQoZWwsIGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmKGVsLmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyLCBmYWxzZSk7XG4gIH1lbHNle1xuICAgIGVsLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudCwgaGFuZGxlcik7XG4gIH1cbn1cblxuZXhwb3J0cy5yZW1vdmVFdmVudCA9IGZ1bmN0aW9uIHJlbW92ZUV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xuICBpZihlbC5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlcik7XG4gIH1lbHNle1xuICAgIGVsLmRldGFjaEV2ZW50KCdvbicgKyBldmVudCwgaGFuZGxlcik7XG4gIH1cbn0iLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbnZhciBFdmVudCA9IHtcbiAgLy/nm5HlkKzoh6rlrprkuYnkuovku7YuXG4gICRvbjogZnVuY3Rpb24obmFtZSwgaGFuZGxlciwgY29udGV4dCkge1xuICAgIHZhciBjdHggPSBjb250ZXh0IHx8IHRoaXNcbiAgICAgIDtcblxuICAgIGN0eC5faGFuZGxlcnMgPSBjdHguX2hhbmRsZXJzIHx8IHt9O1xuICAgIGN0eC5faGFuZGxlcnNbbmFtZV0gPSBjdHguX2hhbmRsZXJzW25hbWVdIHx8IFtdO1xuXG4gICAgY3R4Ll9oYW5kbGVyc1tuYW1lXS5wdXNoKHtoYW5kbGVyOiBoYW5kbGVyLCBjb250ZXh0OiBjb250ZXh0LCBjdHg6IGN0eH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9LFxuICAkb25lOiBmdW5jdGlvbiAobmFtZSwgaGFuZGxlciwgY29udGV4dCkge1xuICAgIGlmKGhhbmRsZXIpe1xuICAgICAgaGFuZGxlci5vbmUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBoYW5kbGVyLCBjb250ZXh0KTtcbiAgfSxcbiAgLy/np7vpmaTnm5HlkKzkuovku7YuXG4gICRvZmY6IGZ1bmN0aW9uKG5hbWUsIGhhbmRsZXIsIGNvbnRleHQpIHtcbiAgICB2YXIgY3R4ID0gY29udGV4dCB8fCB0aGlzXG4gICAgICAsIGhhbmRsZXJzID0gY3R4Ll9oYW5kbGVyc1xuICAgICAgO1xuXG4gICAgaWYobmFtZSAmJiBoYW5kbGVyc1tuYW1lXSl7XG4gICAgICBpZih1dGlscy5pc0Z1bmN0aW9uKGhhbmRsZXIpKXtcbiAgICAgICAgZm9yKHZhciBpID0gaGFuZGxlcnNbbmFtZV0ubGVuZ3RoIC0gMTsgaSA+PTA7IGktLSkge1xuICAgICAgICAgIGlmKGhhbmRsZXJzW25hbWVdW2ldLmhhbmRsZXIgPT09IGhhbmRsZXIpe1xuICAgICAgICAgICAgaGFuZGxlcnNbbmFtZV0uc3BsaWNlKGksIDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGhhbmRsZXJzW25hbWVdID0gW107XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9LFxuICAvL+inpuWPkeiHquWumuS5ieS6i+S7ti5cbiAgLy/or6Xmlrnms5XmsqHmnInmj5DkvpvpnZnmgIHljJbnmoQgY29udGV4dCDlj4LmlbAuIOWmguimgemdmeaAgeWMluS9v+eUqCwg5bqU6K+lOiBgRXZlbnQudHJpZ2dlci5jYWxsKGNvbnRleHQsIG5hbWUsIGRhdGEpYFxuICAkdHJpZ2dlcjogZnVuY3Rpb24obmFtZSwgZGF0YSkge1xuICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXG4gICAgICAsIGhhbmRsZXJzID0gdGhpcy5faGFuZGxlcnMgJiYgdGhpcy5faGFuZGxlcnNbbmFtZV1cbiAgICAgIDtcblxuICAgIGlmKGhhbmRsZXJzKXtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGl0ZW07IGl0ZW0gPSBoYW5kbGVyc1tpXTsgaSsrKSB7XG4gICAgICAgIGl0ZW0uaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgaWYoaXRlbS5oYW5kbGVyLm9uZSkge1xuICAgICAgICAgIGhhbmRsZXJzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICBpLS07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnQ7XG4iLCJcInVzZSBzdHJpY3RcIjtcbi8vSmF2YXNjcmlwdCBleHByZXNzaW9uIHBhcnNlciBtb2RpZmllZCBmb3JtIENyb2NrZm9yZCdzIFRET1AgcGFyc2VyXG52YXIgY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAobykge1xuXHRmdW5jdGlvbiBGKCkge31cblx0Ri5wcm90b3R5cGUgPSBvO1xuXHRyZXR1cm4gbmV3IEYoKTtcbn07XG5cbnZhciBzb3VyY2U7XG5cbnZhciBlcnJvciA9IGZ1bmN0aW9uIChtZXNzYWdlLCB0KSB7XG5cdHQgPSB0IHx8IHRoaXM7XG4gIHZhciBtc2cgPSBtZXNzYWdlICs9IFwiIEJ1dCBmb3VuZCAnXCIgKyB0LnZhbHVlICsgXCInXCIgKyAodC5mcm9tID8gXCIgYXQgXCIgKyB0LmZyb20gOiBcIlwiKSArIFwiIGluICdcIiArIHNvdXJjZSArIFwiJ1wiO1xuICB2YXIgZSA9IG5ldyBFcnJvcihtc2cpO1xuXHRlLm5hbWUgPSB0Lm5hbWUgPSBcIlN5bnRheEVycm9yXCI7XG5cdHQubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIHRocm93IGU7XG59O1xuXG52YXIgdG9rZW5pemUgPSBmdW5jdGlvbiAoY29kZSwgcHJlZml4LCBzdWZmaXgpIHtcblx0dmFyIGM7IC8vIFRoZSBjdXJyZW50IGNoYXJhY3Rlci5cblx0dmFyIGZyb207IC8vIFRoZSBpbmRleCBvZiB0aGUgc3RhcnQgb2YgdGhlIHRva2VuLlxuXHR2YXIgaSA9IDA7IC8vIFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBjaGFyYWN0ZXIuXG5cdHZhciBsZW5ndGggPSBjb2RlLmxlbmd0aDtcblx0dmFyIG47IC8vIFRoZSBudW1iZXIgdmFsdWUuXG5cdHZhciBxOyAvLyBUaGUgcXVvdGUgY2hhcmFjdGVyLlxuXHR2YXIgc3RyOyAvLyBUaGUgc3RyaW5nIHZhbHVlLlxuXHR2YXIgZjsgLy9UaGUgcmVnZXhwIGZsYWcuXG5cblx0dmFyIHJlc3VsdCA9IFtdOyAvLyBBbiBhcnJheSB0byBob2xkIHRoZSByZXN1bHRzLlxuXG5cdC8vIE1ha2UgYSB0b2tlbiBvYmplY3QuXG5cdHZhciBtYWtlID0gZnVuY3Rpb24gKHR5cGUsIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGUgOiB0eXBlLFxuXHRcdFx0dmFsdWUgOiB2YWx1ZSxcblx0XHRcdGZyb20gOiBmcm9tLFxuXHRcdFx0dG8gOiBpXG5cdFx0fTtcblx0fTtcblxuXHQvLyBCZWdpbiB0b2tlbml6YXRpb24uIElmIHRoZSBzb3VyY2Ugc3RyaW5nIGlzIGVtcHR5LCByZXR1cm4gbm90aGluZy5cblx0aWYgKCFjb2RlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGNvZGUgdGV4dCwgb25lIGNoYXJhY3RlciBhdCBhIHRpbWUuXG5cdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0d2hpbGUgKGMpIHtcblx0XHRmcm9tID0gaTtcblxuXHRcdGlmIChjIDw9ICcgJykgeyAvLyBJZ25vcmUgd2hpdGVzcGFjZS5cblx0XHRcdGkgKz0gMTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9IGVsc2UgaWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7IC8vIG5hbWUuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fFxuXHRcdFx0XHRcdChjID49ICcwJyAmJiBjIDw9ICc5JykgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCduYW1lJywgc3RyKSk7XG5cdFx0fSBlbHNlIGlmIChjID49ICcwJyAmJiBjIDw9ICc5Jykge1xuXHRcdFx0Ly8gbnVtYmVyLlxuXG5cdFx0XHQvLyBBIG51bWJlciBjYW5ub3Qgc3RhcnQgd2l0aCBhIGRlY2ltYWwgcG9pbnQuIEl0IG11c3Qgc3RhcnQgd2l0aCBhIGRpZ2l0LFxuXHRcdFx0Ly8gcG9zc2libHkgJzAnLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblxuXHRcdFx0Ly8gTG9vayBmb3IgbW9yZSBkaWdpdHMuXG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYSBkZWNpbWFsIGZyYWN0aW9uIHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJy4nKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGFuIGV4cG9uZW50IHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJ2UnIHx8IGMgPT09ICdFJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjID09PSAnLScgfHwgYyA9PT0gJysnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgZXhwb25lbnRcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH0gd2hpbGUgKGMgPj0gJzAnICYmIGMgPD0gJzknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBuZXh0IGNoYXJhY3RlciBpcyBub3QgYSBsZXR0ZXIuXG5cblx0XHRcdGlmIChjID49ICdhJyAmJiBjIDw9ICd6Jykge1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZSB0byBhIG51bWJlci4gSWYgaXQgaXMgZmluaXRlLCB0aGVuIGl0IGlzIGEgZ29vZFxuXHRcdFx0Ly8gdG9rZW4uXG5cblx0XHRcdG4gPSArc3RyO1xuXHRcdFx0aWYgKGlzRmluaXRlKG4pKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ251bWJlcicsIG4pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc3RyaW5nXG5cblx0XHR9IGVsc2UgaWYgKGMgPT09ICdcXCcnIHx8IGMgPT09ICdcIicpIHtcblx0XHRcdHN0ciA9ICcnO1xuXHRcdFx0cSA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcgJykge1xuXHRcdFx0XHRcdG1ha2UoJ3N0cmluZycsIHN0cik7XG5cdFx0XHRcdFx0ZXJyb3IoYyA9PT0gJ1xcbicgfHwgYyA9PT0gJ1xccicgfHwgYyA9PT0gJycgP1xuXHRcdFx0XHRcdFx0XCJVbnRlcm1pbmF0ZWQgc3RyaW5nLlwiIDpcblx0XHRcdFx0XHRcdFwiQ29udHJvbCBjaGFyYWN0ZXIgaW4gc3RyaW5nLlwiLCBtYWtlKCcnLCBzdHIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIHRoZSBjbG9zaW5nIHF1b3RlLlxuXG5cdFx0XHRcdGlmIChjID09PSBxKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciBlc2NhcGVtZW50LlxuXG5cdFx0XHRcdGlmIChjID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRzd2l0Y2ggKGMpIHtcblx0XHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxiJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2YnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGYnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcbic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxyJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3QnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndSc6XG5cdFx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IHBhcnNlSW50KGNvZGUuc3Vic3RyKGkgKyAxLCA0KSwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0Zpbml0ZShjKSB8fCBjIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcblx0XHRcdFx0XHRcdGkgKz0gNDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdC8vIHJlZ2V4cFxuXHRcdH1lbHNlIGlmKGMgPT09ICcvJyAmJiBmYWxzZSl7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRzdHIgPSAnJztcblx0XHRcdGYgPSAnJztcblx0XHRcdGZvcig7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0XHQvLyBMb29rIGZvciBjbG9zZSBzbGFzaFxuXG5cdFx0XHRcdGlmKGMgPT09ICcvJykge1xuXHRcdFx0XHRcdGZvcig7IDsgKSB7XG5cdFx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSArIDEpO1xuXHRcdFx0XHRcdFx0aWYoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8IGMgPT09ICckJyB8fCBjID09PSAnXycpIHtcblx0XHRcdFx0XHRcdFx0ZiArPSBjO1xuXHRcdFx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0XHR9ZWxzZXtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYoYyA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgcmVnZXhwXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdFx0YyA9ICdcXFxcJyArIGM7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ3JlZ2V4cCcsIG5ldyBSZWdFeHAoc3RyLCBmKSkpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXG5cdFx0XHQvLyBjb21iaW5pbmdcblxuXHRcdH0gZWxzZSBpZiAocHJlZml4LmluZGV4T2YoYykgPj0gMCkge1xuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoIHx8IHN1ZmZpeC5pbmRleE9mKGMpIDwgMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdvcGVyYXRvcicsIHN0cikpO1xuXG5cdFx0XHQvLyBzaW5nbGUtY2hhcmFjdGVyIG9wZXJhdG9yXG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnb3BlcmF0b3InLCBjKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59O1xuXG52YXIgbWFrZV9wYXJzZSA9IGZ1bmN0aW9uICh2YXJzKSB7XG5cdHZhcnMgPSB2YXJzIHx8IHt9Oy8v6aKE5a6a5LmJ55qE5Y+Y6YePXG5cdHZhciBzeW1ib2xfdGFibGUgPSB7fTtcblx0dmFyIHRva2VuO1xuXHR2YXIgdG9rZW5zO1xuXHR2YXIgdG9rZW5fbnI7XG5cdHZhciBjb250ZXh0O1xuXG5cdHZhciBpdHNlbGYgPSBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG5cblx0dmFyIGZpbmQgPSBmdW5jdGlvbiAobikge1xuXHRcdG4ubnVkID0gaXRzZWxmO1xuXHRcdG4ubGVkID0gbnVsbDtcblx0XHRuLnN0ZCA9IG51bGw7XG5cdFx0bi5sYnAgPSAwO1xuXHRcdHJldHVybiBuO1xuXHR9O1xuXG5cdHZhciBhZHZhbmNlID0gZnVuY3Rpb24gKGlkKSB7XG5cdFx0dmFyIGEsIG8sIHQsIHY7XG5cdFx0aWYgKGlkICYmIHRva2VuLmlkICE9PSBpZCkge1xuXHRcdFx0ZXJyb3IoXCJFeHBlY3RlZCAnXCIgKyBpZCArIFwiJy5cIiwgdG9rZW4pO1xuXHRcdH1cblx0XHRpZiAodG9rZW5fbnIgPj0gdG9rZW5zLmxlbmd0aCkge1xuXHRcdFx0dG9rZW4gPSBzeW1ib2xfdGFibGVbXCIoZW5kKVwiXTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dCA9IHRva2Vuc1t0b2tlbl9ucl07XG5cdFx0dG9rZW5fbnIgKz0gMTtcblx0XHR2ID0gdC52YWx1ZTtcblx0XHRhID0gdC50eXBlO1xuXHRcdGlmICgoYSA9PT0gXCJvcGVyYXRvclwiIHx8IGEgIT09ICdzdHJpbmcnKSAmJiB2IGluIHN5bWJvbF90YWJsZSkge1xuXHRcdFx0Ly90cnVlLCBmYWxzZSDnrYnnm7TmjqXph4/kuZ/kvJrov5vlhaXmraTliIbmlK9cblx0XHRcdG8gPSBzeW1ib2xfdGFibGVbdl07XG5cdFx0XHRpZiAoIW8pIHtcblx0XHRcdFx0ZXJyb3IoXCJVbmtub3duIG9wZXJhdG9yLlwiLCB0KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGEgPT09IFwibmFtZVwiKSB7XG5cdFx0XHRvID0gZmluZCh0KTtcblx0XHR9IGVsc2UgaWYgKGEgPT09IFwic3RyaW5nXCIgfHwgYSA9PT0gXCJudW1iZXJcIiB8fCBhID09PSBcInJlZ2V4cFwiKSB7XG5cdFx0XHRvID0gc3ltYm9sX3RhYmxlW1wiKGxpdGVyYWwpXCJdO1xuXHRcdFx0YSA9IFwibGl0ZXJhbFwiO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlcnJvcihcIlVuZXhwZWN0ZWQgdG9rZW4uXCIsIHQpO1xuXHRcdH1cblx0XHR0b2tlbiA9IGNyZWF0ZShvKTtcblx0XHR0b2tlbi5mcm9tID0gdC5mcm9tO1xuXHRcdHRva2VuLnRvID0gdC50bztcblx0XHR0b2tlbi52YWx1ZSA9IHY7XG5cdFx0dG9rZW4uYXJpdHkgPSBhO1xuXHRcdHJldHVybiB0b2tlbjtcblx0fTtcblxuXHR2YXIgZXhwcmVzc2lvbiA9IGZ1bmN0aW9uIChyYnApIHtcblx0XHR2YXIgbGVmdDtcblx0XHR2YXIgdCA9IHRva2VuO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRsZWZ0ID0gdC5udWQoKTtcblx0XHR3aGlsZSAocmJwIDwgdG9rZW4ubGJwKSB7XG5cdFx0XHR0ID0gdG9rZW47XG5cdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRsZWZ0ID0gdC5sZWQobGVmdCk7XG5cdFx0fVxuXHRcdHJldHVybiBsZWZ0O1xuXHR9O1xuXG5cdHZhciBvcmlnaW5hbF9zeW1ib2wgPSB7XG5cdFx0bnVkIDogZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXJyb3IoXCJVbmRlZmluZWQuXCIsIHRoaXMpO1xuXHRcdH0sXG5cdFx0bGVkIDogZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdGVycm9yKFwiTWlzc2luZyBvcGVyYXRvci5cIiwgdGhpcyk7XG5cdFx0fVxuXHR9O1xuXG5cdHZhciBzeW1ib2wgPSBmdW5jdGlvbiAoaWQsIGJwKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2xfdGFibGVbaWRdO1xuXHRcdGJwID0gYnAgfHwgMDtcblx0XHRpZiAocykge1xuXHRcdFx0aWYgKGJwID49IHMubGJwKSB7XG5cdFx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHMgPSBjcmVhdGUob3JpZ2luYWxfc3ltYm9sKTtcblx0XHRcdHMuaWQgPSBzLnZhbHVlID0gaWQ7XG5cdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0c3ltYm9sX3RhYmxlW2lkXSA9IHM7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBjb25zdGFudCA9IGZ1bmN0aW9uIChzLCB2LCBhKSB7XG5cdFx0dmFyIHggPSBzeW1ib2wocyk7XG5cdFx0eC5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gc3ltYm9sX3RhYmxlW3RoaXMuaWRdLnZhbHVlO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHR4LnZhbHVlID0gdjtcblx0XHRyZXR1cm4geDtcblx0fTtcblxuXHR2YXIgaW5maXggPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGluZml4ciA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwIC0gMSk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIHByZWZpeCA9IGZ1bmN0aW9uIChpZCwgbnVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQpO1xuXHRcdHMubnVkID0gbnVkIHx8IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDcwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHN5bWJvbChcIihlbmQpXCIpO1xuXHRzeW1ib2woXCIobmFtZSlcIik7XG5cdHN5bWJvbChcIjpcIik7XG5cdHN5bWJvbChcIilcIik7XG5cdHN5bWJvbChcIl1cIik7XG5cdHN5bWJvbChcIn1cIik7XG5cdHN5bWJvbChcIixcIik7XG5cblx0Y29uc3RhbnQoXCJ0cnVlXCIsIHRydWUpO1xuXHRjb25zdGFudChcImZhbHNlXCIsIGZhbHNlKTtcblx0Y29uc3RhbnQoXCJudWxsXCIsIG51bGwpO1xuXHRjb25zdGFudChcInVuZGVmaW5lZFwiKTtcblxuXHRjb25zdGFudChcIk1hdGhcIiwgTWF0aCk7XG5cdGNvbnN0YW50KFwiRGF0ZVwiLCBEYXRlKTtcblx0Zm9yKHZhciB2IGluIHZhcnMpIHtcblx0XHRjb25zdGFudCh2LCB2YXJzW3ZdKTtcblx0fVxuXG5cdHN5bWJvbChcIihsaXRlcmFsKVwiKS5udWQgPSBpdHNlbGY7XG5cblx0c3ltYm9sKFwidGhpc1wiKS5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdCAgdGhpcy5hcml0eSA9IFwidGhpc1wiO1xuXHQgIHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdC8vT3BlcmF0b3IgUHJlY2VkZW5jZTpcblx0Ly9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvT3BlcmF0b3JfUHJlY2VkZW5jZVxuXG5cdGluZml4KFwiP1wiLCAyMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIjpcIik7XG5cdFx0dGhpcy50aGlyZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwidGVybmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeHIoXCImJlwiLCAzMSk7XG5cdGluZml4cihcInx8XCIsIDMwKTtcblxuXHRpbmZpeHIoXCI9PT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPT1cIiwgNDApO1xuXG5cdGluZml4cihcIj09XCIsIDQwKTtcblx0aW5maXhyKFwiIT1cIiwgNDApO1xuXG5cdGluZml4cihcIjxcIiwgNDApO1xuXHRpbmZpeHIoXCI8PVwiLCA0MCk7XG5cdGluZml4cihcIj5cIiwgNDApO1xuXHRpbmZpeHIoXCI+PVwiLCA0MCk7XG5cblx0aW5maXgoXCJpblwiLCA0NSwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0aWYgKGNvbnRleHQgPT09ICdyZXBlYXQnKSB7XG5cdFx0XHQvLyBgaW5gIGF0IHJlcGVhdCBibG9ja1xuXHRcdFx0bGVmdC5hcml0eSA9ICdhc3NpZ25tZW50Jztcblx0XHRcdHRoaXMuYXNzaWdubWVudCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIitcIiwgNTApO1xuXHRpbmZpeChcIi1cIiwgNTApO1xuXG5cdGluZml4KFwiKlwiLCA2MCk7XG5cdGluZml4KFwiL1wiLCA2MCk7XG5cdGluZml4KFwiJVwiLCA2MCk7XG5cblx0aW5maXgoXCIoXCIsIDcwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKGxlZnQuaWQgPT09IFwiLlwiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdC5maXJzdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gbGVmdC5zZWNvbmQ7XG5cdFx0XHR0aGlzLnRoaXJkID0gYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdGlmICgobGVmdC5hcml0eSAhPT0gXCJ1bmFyeVwiIHx8IGxlZnQuaWQgIT09IFwiZnVuY3Rpb25cIikgJiZcblx0XHRcdFx0bGVmdC5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbGVmdC5hcml0eSAhPT0gXCJsaXRlcmFsXCIgJiYgbGVmdC5pZCAhPT0gXCIoXCIgJiZcblx0XHRcdFx0bGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIikge1xuXHRcdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgdmFyaWFibGUgbmFtZS5cIiwgbGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCIpXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIuXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdGlmICh0b2tlbi5hcml0eSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSBwcm9wZXJ0eSBuYW1lLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRva2VuLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0dGhpcy5zZWNvbmQgPSB0b2tlbjtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiW1wiLCA4MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vZmlsdGVyXG5cdGluZml4KFwifFwiLCAxMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYTtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0b2tlbi5hcml0eSA9ICdmaWx0ZXInO1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigxMCk7XG5cdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdGlmICh0b2tlbi5pZCA9PT0gJzonKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ3Rlcm5hcnknO1xuXHRcdFx0dGhpcy50aGlyZCA9IGEgPSBbXTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGFkdmFuY2UoJzonKTtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiOlwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeChcIiFcIik7XG5cdHByZWZpeChcIi1cIik7XG5cdHByZWZpeChcInR5cGVvZlwiKTtcblxuXHRwcmVmaXgoXCIoXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgZSA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIilcIik7XG5cdFx0cmV0dXJuIGU7XG5cdH0pO1xuXG5cdHByZWZpeChcIltcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIl1cIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJdXCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeChcIntcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW10sXHRuLCB2O1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJ9XCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdG4gPSB0b2tlbjtcblx0XHRcdFx0aWYgKG4uYXJpdHkgIT09IFwibmFtZVwiICYmIG4uYXJpdHkgIT09IFwibGl0ZXJhbFwiKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgcHJvcGVydHkgbmFtZTogXCIsIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRcdGFkdmFuY2UoXCI6XCIpO1xuXHRcdFx0XHR2ID0gZXhwcmVzc2lvbigwKTtcblx0XHRcdFx0di5rZXkgPSBuLnZhbHVlO1xuXHRcdFx0XHRhLnB1c2godik7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIn1cIik7XG5cdFx0dGhpcy5maXJzdCA9IGE7XG5cdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KCduZXcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHR0aGlzLmZpcnN0ID0gZXhwcmVzc2lvbig3OSk7XG5cdFx0aWYodG9rZW4uaWQgPT09ICcoJykge1xuXHRcdFx0YWR2YW5jZShcIihcIik7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ2JpbmFyeSc7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigwKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdH1lbHNle1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG4gIC8vcHJlZml4KCcvJywgZnVuY3Rpb24oKSB7XG4gIC8vICB2YXIgYSA9IFtdLCBuLCB2O1xuICAvLyAgaWYodG9rZW4uaWQgIT09ICcvJykge1xuICAvLyAgICB3aGlsZSh0cnVlKSB7XG4gIC8vICAgICAgbiA9IHRva2VuO1xuICAvLyAgICAgIGFkdmFuY2UoKTtcbiAgLy8gICAgfVxuICAvLyAgfVxuICAvLyAgYWR2YW5jZSgnLycpO1xuICAvLyAgdGhpcy5maXJzdCA9IGE7XG4gIC8vICByZXR1cm4gdGhpcztcbiAgLy99KVxuXG5cdC8vX3NvdXJjZTog6KGo6L6+5byP5Luj56CB5a2X56ym5LiyXG5cdC8vX2NvbnRleHQ6IOihqOi+vuW8j+eahOivreWPpeeOr+Wig1xuXHRyZXR1cm4gZnVuY3Rpb24gKF9zb3VyY2UsIF9jb250ZXh0KSB7XG4gICAgc291cmNlID0gX3NvdXJjZTtcblx0XHR0b2tlbnMgPSB0b2tlbml6ZShfc291cmNlLCAnPTw+ISstKiZ8LyVeJywgJz08PiZ8Jyk7XG5cdFx0dG9rZW5fbnIgPSAwO1xuXHRcdGNvbnRleHQgPSBfY29udGV4dDtcblx0XHRhZHZhbmNlKCk7XG5cdFx0dmFyIHMgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIoZW5kKVwiKTtcblx0XHRyZXR1cm4gcztcblx0fTtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBtYWtlX3BhcnNlKCk7XG4iLCJ2YXIgdG9rZW5SZWcgPSAve3soeyhbXn1cXG5dKyl9fFtefVxcbl0rKX19L2c7XG5cbi8v5a2X56ym5Liy5Lit5piv5ZCm5YyF5ZCr5qih5p2/5Y2g5L2N56ym5qCH6K6wXG5mdW5jdGlvbiBoYXNUb2tlbihzdHIpIHtcbiAgdG9rZW5SZWcubGFzdEluZGV4ID0gMDtcbiAgcmV0dXJuIHN0ciAmJiB0b2tlblJlZy50ZXN0KHN0cik7XG59XG5cbmZ1bmN0aW9uIHBhcnNlVG9rZW4odmFsdWUpIHtcbiAgdmFyIHRva2VucyA9IFtdXG4gICAgLCB0ZXh0TWFwID0gW11cbiAgICAsIHN0YXJ0ID0gMFxuICAgICwgdmFsLCB0b2tlblxuICAgIDtcbiAgXG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIFxuICB3aGlsZSgodmFsID0gdG9rZW5SZWcuZXhlYyh2YWx1ZSkpKXtcbiAgICBpZih0b2tlblJlZy5sYXN0SW5kZXggLSBzdGFydCA+IHZhbFswXS5sZW5ndGgpe1xuICAgICAgdGV4dE1hcC5wdXNoKHZhbHVlLnNsaWNlKHN0YXJ0LCB0b2tlblJlZy5sYXN0SW5kZXggLSB2YWxbMF0ubGVuZ3RoKSk7XG4gICAgfVxuICAgIFxuICAgIHRva2VuID0ge1xuICAgICAgZXNjYXBlOiAhdmFsWzJdXG4gICAgLCBwYXRoOiAodmFsWzJdIHx8IHZhbFsxXSkudHJpbSgpXG4gICAgLCBwb3NpdGlvbjogdGV4dE1hcC5sZW5ndGhcbiAgICAsIHRleHRNYXA6IHRleHRNYXBcbiAgICB9O1xuICAgIFxuICAgIHRva2Vucy5wdXNoKHRva2VuKTtcbiAgICBcbiAgICAvL+S4gOS4quW8leeUqOexu+WeiyjmlbDnu4Qp5L2c5Li66IqC54K55a+56LGh55qE5paH5pys5Zu+LCDov5nmoLflvZPmn5DkuIDkuKrlvJXnlKjmlLnlj5jkuobkuIDkuKrlgLzlkI4sIOWFtuS7luW8leeUqOWPluW+l+eahOWAvOmDveS8muWQjOaXtuabtOaWsFxuICAgIHRleHRNYXAucHVzaCh2YWxbMF0pO1xuICAgIFxuICAgIHN0YXJ0ID0gdG9rZW5SZWcubGFzdEluZGV4O1xuICB9XG4gIFxuICBpZih2YWx1ZS5sZW5ndGggPiBzdGFydCl7XG4gICAgdGV4dE1hcC5wdXNoKHZhbHVlLnNsaWNlKHN0YXJ0LCB2YWx1ZS5sZW5ndGgpKTtcbiAgfVxuICBcbiAgdG9rZW5zLnRleHRNYXAgPSB0ZXh0TWFwO1xuICBcbiAgcmV0dXJuIHRva2Vucztcbn1cblxuZXhwb3J0cy5oYXNUb2tlbiA9IGhhc1Rva2VuO1xuXG5leHBvcnRzLnBhcnNlVG9rZW4gPSBwYXJzZVRva2VuOyIsIlwidXNlIHN0cmljdFwiO1xuXG4vL3V0aWxzXG4vLy0tLVxuXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudDtcblxudmFyIGtleVBhdGhSZWcgPSAvKD86XFwufFxcWykvZ1xuICAsIGJyYSA9IC9cXF0vZ1xuICA7XG5cbi8v5bCGIGtleVBhdGgg6L2s5Li65pWw57uE5b2i5byPXG4vL3BhdGgua2V5LCBwYXRoW2tleV0gLS0+IFsncGF0aCcsICdrZXknXVxuZnVuY3Rpb24gcGFyc2VLZXlQYXRoKGtleVBhdGgpe1xuICByZXR1cm4ga2V5UGF0aC5yZXBsYWNlKGJyYSwgJycpLnNwbGl0KGtleVBhdGhSZWcpO1xufVxuXG4vKipcbiAqIOWQiOW5tuWvueixoVxuICogQHN0YXRpY1xuICogQHBhcmFtIHtCb29sZWFufSBbZGVlcD1mYWxzZV0g5piv5ZCm5rex5bqm5ZCI5bm2XG4gKiBAcGFyYW0ge09iamVjdH0gdGFyZ2V0IOebruagh+WvueixoVxuICogQHBhcmFtIHtPYmplY3R9IFtvYmplY3QuLi5dIOadpea6kOWvueixoVxuICogQHJldHVybiB7RnVuY3Rpb259IOWQiOW5tuWQjueahCB0YXJnZXQg5a+56LGhXG4gKi9cbmZ1bmN0aW9uIGV4dGVuZCgvKiBkZWVwLCB0YXJnZXQsIG9iamVjdC4uLiAqLykge1xuICB2YXIgb3B0aW9uc1xuICAgICwgbmFtZSwgc3JjLCBjb3B5LCBjb3B5SXNBcnJheSwgY2xvbmVcbiAgICAsIHRhcmdldCA9IGFyZ3VtZW50c1swXSB8fCB7fVxuICAgICwgaSA9IDFcbiAgICAsIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGhcbiAgICAsIGRlZXAgPSBmYWxzZVxuICAgIDtcblxuICAvLyBIYW5kbGUgYSBkZWVwIGNvcHkgc2l0dWF0aW9uXG4gIGlmICh0eXBlb2YgdGFyZ2V0ID09PSBcImJvb2xlYW5cIikge1xuICAgIGRlZXAgPSB0YXJnZXQ7XG5cbiAgICAvLyBza2lwIHRoZSBib29sZWFuIGFuZCB0aGUgdGFyZ2V0XG4gICAgdGFyZ2V0ID0gYXJndW1lbnRzWyBpIF0gfHwge307XG4gICAgaSsrO1xuICB9XG5cbiAgaWYodXRpbHMuaXNGdW5jdGlvbihhcmd1bWVudHNbbGVuZ3RoIC0gMV0pKSB7XG4gICAgbGVuZ3RoLS07XG4gIH1cblxuICAvLyBIYW5kbGUgY2FzZSB3aGVuIHRhcmdldCBpcyBhIHN0cmluZyBvciBzb21ldGhpbmcgKHBvc3NpYmxlIGluIGRlZXAgY29weSlcbiAgaWYgKHR5cGVvZiB0YXJnZXQgIT09IFwib2JqZWN0XCIgJiYgIXV0aWxzLmlzRnVuY3Rpb24odGFyZ2V0KSkge1xuICAgIHRhcmdldCA9IHt9O1xuICB9XG5cbiAgZm9yICggOyBpIDwgbGVuZ3RoOyBpKysgKSB7XG4gICAgLy8gT25seSBkZWFsIHdpdGggbm9uLW51bGwvdW5kZWZpbmVkIHZhbHVlc1xuICAgIGlmICggKG9wdGlvbnMgPSBhcmd1bWVudHNbIGkgXSkgIT0gbnVsbCApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgYmFzZSBvYmplY3RcbiAgICAgIGZvciAoIG5hbWUgaW4gb3B0aW9ucyApIHtcbiAgICAgICAgLy9hbmRyb2lkIDIuMyBicm93c2VyIGNhbiBlbnVtIHRoZSBwcm90b3R5cGUgb2YgY29uc3RydWN0b3IuLi5cbiAgICAgICAgaWYob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShuYW1lKSAmJiBuYW1lICE9PSAncHJvdG90eXBlJyl7XG4gICAgICAgICAgc3JjID0gdGFyZ2V0WyBuYW1lIF07XG4gICAgICAgICAgY29weSA9IG9wdGlvbnNbIG5hbWUgXTtcblxuXG4gICAgICAgICAgLy8gUmVjdXJzZSBpZiB3ZSdyZSBtZXJnaW5nIHBsYWluIG9iamVjdHMgb3IgYXJyYXlzXG4gICAgICAgICAgaWYgKCBkZWVwICYmIGNvcHkgJiYgKCB1dGlscy5pc1BsYWluT2JqZWN0KGNvcHkpIHx8IChjb3B5SXNBcnJheSA9IHV0aWxzLmlzQXJyYXkoY29weSkpICkgKSB7XG5cbiAgICAgICAgICAgIC8vIFByZXZlbnQgbmV2ZXItZW5kaW5nIGxvb3BcbiAgICAgICAgICAgIGlmICggdGFyZ2V0ID09PSBjb3B5ICkge1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICggY29weUlzQXJyYXkgKSB7XG4gICAgICAgICAgICAgIGNvcHlJc0FycmF5ID0gZmFsc2U7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzQXJyYXkoc3JjKSA/IHNyYyA6IFtdO1xuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjbG9uZSA9IHNyYyAmJiB1dGlscy5pc1BsYWluT2JqZWN0KHNyYykgPyBzcmMgOiB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTmV2ZXIgbW92ZSBvcmlnaW5hbCBvYmplY3RzLCBjbG9uZSB0aGVtXG4gICAgICAgICAgICB0YXJnZXRbIG5hbWUgXSA9IGV4dGVuZCggZGVlcCwgY2xvbmUsIGNvcHkpO1xuXG4gICAgICAgICAgICAvLyBEb24ndCBicmluZyBpbiB1bmRlZmluZWQgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIGlmICggIXV0aWxzLmlzVW5kZWZpbmVkKGNvcHkpICkge1xuICAgICAgICAgICAgdGFyZ2V0WyBuYW1lIF0gPSBjb3B5O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybiB0aGUgbW9kaWZpZWQgb2JqZWN0XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG4gIGZ1bmN0aW9uIEYoKSB7fVxuICBGLnByb3RvdHlwZSA9IG87XG4gIHJldHVybiBuZXcgRigpO1xufTtcblxuXG52YXIgdXRpbHMgPSB7XG4gIG5vb3A6IGZ1bmN0aW9uICgpe31cbiwgaWU6ICEhZG9jLmF0dGFjaEV2ZW50XG5cbiwgaXNPYmplY3Q6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsICE9PSBudWxsO1xuICB9XG5cbiwgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuLCBpc0Z1bmN0aW9uOiBmdW5jdGlvbiAodmFsKXtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ2Z1bmN0aW9uJztcbiAgfVxuXG4sIGlzQXJyYXk6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICBpZih1dGlscy5pZSl7XG4gICAgICAvL0lFIDkg5Y+K5Lul5LiLIElFIOi3qOeql+WPo+ajgOa1i+aVsOe7hFxuICAgICAgcmV0dXJuIHZhbCAmJiB2YWwuY29uc3RydWN0b3IgKyAnJyA9PT0gQXJyYXkgKyAnJztcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCk7XG4gICAgfVxuICB9XG5cbiAgLy/nroDljZXlr7nosaHnmoTnroDmmJPliKTmlq1cbiwgaXNQbGFpbk9iamVjdDogZnVuY3Rpb24gKG8pe1xuICAgIGlmICghbyB8fCAoe30pLnRvU3RyaW5nLmNhbGwobykgIT09ICdbb2JqZWN0IE9iamVjdF0nIHx8IG8ubm9kZVR5cGUgfHwgbyA9PT0gby53aW5kb3cpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIC8v5Ye95pWw5YiH6Z2iLiBvcmlGbiDljp/lp4vlh73mlbAsIGZuIOWIh+mdouihpeWFheWHveaVsFxuICAvL+WJjemdoueahOWHveaVsOi/lOWbnuWAvOS8oOWFpSBicmVha0NoZWNrIOWIpOaWrSwgYnJlYWtDaGVjayDov5Tlm57lgLzkuLrnnJ/ml7bkuI3miafooYzliIfpnaLooaXlhYXnmoTlh73mlbBcbiwgYmVmb3JlRm46IGZ1bmN0aW9uIChvcmlGbiwgZm4sIGJyZWFrQ2hlY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcmV0ID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGlmKGJyZWFrQ2hlY2sgJiYgYnJlYWtDaGVjay5jYWxsKHRoaXMsIHJldCkpe1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4sIGFmdGVyRm46IGZ1bmN0aW9uIChvcmlGbiwgZm4sIGJyZWFrQ2hlY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcmV0ID0gb3JpRm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGlmKGJyZWFrQ2hlY2sgJiYgYnJlYWtDaGVjay5jYWxsKHRoaXMsIHJldCkpe1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfVxuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICB9XG5cbiwgcGFyc2VLZXlQYXRoOiBwYXJzZUtleVBhdGhcblxuLCBkZWVwU2V0OiBmdW5jdGlvbiAoa2V5U3RyLCB2YWx1ZSwgb2JqKSB7XG4gICAgaWYoa2V5U3RyKXtcbiAgICAgIHZhciBjaGFpbiA9IHBhcnNlS2V5UGF0aChrZXlTdHIpXG4gICAgICAgICwgY3VyID0gb2JqXG4gICAgICAgIDtcbiAgICAgIGNoYWluLmZvckVhY2goZnVuY3Rpb24oa2V5LCBpKSB7XG4gICAgICAgIGlmKGkgPT09IGNoYWluLmxlbmd0aCAtIDEpe1xuICAgICAgICAgIGN1cltrZXldID0gdmFsdWU7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGlmKGN1ciAmJiBjdXIuaGFzT3duUHJvcGVydHkoa2V5KSl7XG4gICAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGN1cltrZXldID0ge307XG4gICAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1lbHNle1xuICAgICAgZXh0ZW5kKG9iaiwgdmFsdWUpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9XG4sIGRlZXBHZXQ6IGZ1bmN0aW9uIChrZXlTdHIsIG9iaikge1xuICAgIHZhciBjaGFpbiwgY3VyID0gb2JqLCBrZXk7XG4gICAgaWYoa2V5U3RyKXtcbiAgICAgIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cik7XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gY2hhaW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGtleSA9IGNoYWluW2ldO1xuICAgICAgICBpZihjdXIpe1xuICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGN1cjtcbiAgfVxuLCBleHRlbmQ6IGV4dGVuZFxuLCBjcmVhdGU6IGNyZWF0ZVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB1dGlscztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgQ2xhc3MgPSByZXF1aXJlKCcuL2NsYXNzLmpzJylcbiAgO1xuXG52YXIgZXh0ZW5kID0gdXRpbHMuZXh0ZW5kO1xuXG4vL+ihqOi+vuW8j+ino+aekFxuZnVuY3Rpb24gZXhQYXJzZSgpIHtcbiAgdmFyIHN1bW1hcnlcbiAgICAsIGRpciA9IHRoaXMuZGlyXG4gICAgO1xuXG4gIGRpci5wYXJzZSgpO1xuXG4gIHN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KGRpci5hc3QpO1xuICBleHRlbmQoZGlyLCBzdW1tYXJ5KTtcbiAgZXh0ZW5kKHRoaXMsIHN1bW1hcnkpO1xufTtcblxuZnVuY3Rpb24gV2F0Y2hlcih2bSwgZGlyKSB7XG4gIHZhciBwYXRoLCBzY29wZSA9IHZtLCBjdXJWbSwgbG9jYWxLZXksIHdpbGxVcGRhdGUsIGFzcywgcGF0aHM7XG5cbiAgdGhpcy5kaXIgPSBkaXI7XG4gIHRoaXMudm0gPSB2bTtcblxuICB0aGlzLnZhbCA9IE5hTjtcblxuICB0aGlzLnN0YXRlID0gV2F0Y2hlci5TVEFURV9SRUFEWTtcblxuICBleFBhcnNlLmNhbGwodGhpcywgZGlyLnBhdGgpO1xuXG4gIGZvcih2YXIgaSA9IDAsIGwgPSB0aGlzLnBhdGhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKHRoaXMucGF0aHNbaV0pO1xuICAgIGxvY2FsS2V5ID0gcGF0aHNbMF07XG5cbiAgICB3aGlsZShzY29wZSkge1xuICAgICAgY3VyVm0gPSBzY29wZTtcbiAgICAgIGFzcyA9IHNjb3BlLl9hc3NpZ25tZW50cztcblxuICAgICAgaWYoYXNzICYmIGFzcy5sZW5ndGgpIHtcbiAgICAgICAgLy/lhbflkI0gcmVwZWF0XG4gICAgICAgIGlmKGFzc1swXSA9PT0gbG9jYWxLZXkpIHtcbiAgICAgICAgICBpZihwYXRocy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgcGF0aHNbMF0gPSAnJGRhdGEnO1xuICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcGF0aHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1lbHNlIGlmKGxvY2FsS2V5IGluIHNjb3BlKXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8v5ZCR5LiK5p+l5om+XG4gICAgICBzY29wZSA9IHNjb3BlLiRwYXJlbnQ7XG4gICAgfVxuICAgIHBhdGggPSBwYXRocy5qb2luKCcuJyk7XG4gICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdID0gY3VyVm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdO1xuICAgIGN1clZtLl93YXRjaGVyc1twYXRoXS5wdXNoKHRoaXMpO1xuICB9XG5cbiAgLy/msqHmnInlj5jph48gLyDlj5jph4/kuI3lnKjlvZPliY3kvZznlKjln5/nmoTooajovr7lvI/nq4vljbPmsYLlgLxcbiAgLy9mb3IodmFyIGkgPSAwLCBsID0gdGhpcy5sb2NhbHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gIC8vICBpZih1dGlscy5pc09iamVjdCh0aGlzLnZtLiRkYXRhKSAmJiAodGhpcy5sb2NhbHNbaV0gaW4gdGhpcy52bS4kZGF0YSkpIHtcbiAgLy8gICAgYnJlYWs7XG4gIC8vICB9XG4gIC8vfVxuICAvL2lmKGkgPT0gbCkge1xuICAvLyAgd2lsbFVwZGF0ZSA9IHRydWU7XG4gIC8vfVxuXG4gIC8vaWYod2lsbFVwZGF0ZSB8fCB0aGlzLnZtLl9pc1JlbmRlcmVkKSB7XG4gICAgdGhpcy51cGRhdGUoKTtcbiAgLy99XG59XG5cbi8vVE9ET1xuZXh0ZW5kKFdhdGNoZXIsIHtcbiAgU1RBVEVfUkVBRFk6IDBcbiwgU1RBVEVfQ0FMTEVEOiAxXG59LCBDbGFzcyk7XG5cbmZ1bmN0aW9uIHdhdGNoZXJVcGRhdGUgKHZhbCkge1xuICB0cnl7XG4gICAgdGhpcy5kaXIudXBkYXRlKHZhbCwgdGhpcy52YWwpO1xuICAgIHRoaXMudmFsID0gdmFsO1xuICB9Y2F0Y2goZSl7XG4gICAgY29uc29sZS5lcnJvcihlKTtcbiAgfVxufVxuXG5leHRlbmQoV2F0Y2hlci5wcm90b3R5cGUsIHtcbiAgLy/ooajovr7lvI/miafooYxcbiAgdXBkYXRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICwgbmV3VmFsXG4gICAgICA7XG5cbiAgICBuZXdWYWwgPSB0aGlzLmRpci5nZXRWYWx1ZSh0aGlzLnZtKTtcblxuICAgIGlmKG5ld1ZhbCAmJiBuZXdWYWwudGhlbikge1xuICAgICAgLy9hIHByb21pc2VcbiAgICAgIG5ld1ZhbC50aGVuKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB3YXRjaGVyVXBkYXRlLmNhbGwodGhhdCwgdmFsKTtcbiAgICAgIH0pO1xuICAgIH1lbHNle1xuICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoaXMsIG5ld1ZhbCk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZSA9IFdhdGNoZXIuU1RBVEVfQ0FMTEVEO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyXG4iXX0=
