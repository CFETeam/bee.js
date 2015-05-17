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
  , domUtils = require('./dom-utils.js')
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

  //.$data 必须为对象. 基础类型的将被转成对象, 这时候 this.$data 和 props.$data 会不等
  if(!isUndefined(props.$data)) {
    props.$data = Object(props.$data)
  }

  //保持对传入属性的引用
  for(var propKey in props) {
    if(propKey in mergeProps) {
      //mergeProps 中的属性会被默认值扩展
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
  el = domUtils.tplParse(tpl, this.$target, this.$content);

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

  this.$replace(this.$data);
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
  $init: utils.noop
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
      if(this.__repeat) {
        paths = parseKeyPath(path);
        headPath = paths[0]
        if(scope._assignments && scope._assignments.length) {
          if(headPath === this._assignments[0]) {
            // 具名 repeat 不会直接查找自身作用域
            scope = {};
            scope[headPath] = this.$data;
          }else if(headPath === '$index') {
            scope = this;
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
      if(keys[0] === '$data') {
        add = add.$data
      }
      extend(true, this.$data, add);
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
      if(keys[0] !== '$data') {
        deepSet(key, null, this.$data);
        deepSet(key, val, this.$data);
      }
      //TODO 清除历史数据
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

    var keys = parseKeyPath(keyPath.replace(/^\$data\./, '')), key, attrs;
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

Bee.version = '0.1.2';

module.exports = Bee;

},{"./class.js":3,"./component.js":4,"./directive.js":5,"./directives":9,"./dom-utils.js":14,"./env.js":15,"./event.js":18,"./token.js":20,"./utils.js":21,"./watcher.js":22}],2:[function(require,module,exports){

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
},{"./utils.js":21}],4:[function(require,module,exports){
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

},{"./utils.js":21}],5:[function(require,module,exports){
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

},{"./env.js":15,"./eval.js":16,"./parse.js":19,"./token.js":20,"./utils.js":21}],6:[function(require,module,exports){
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
},{"../utils.js":21}],7:[function(require,module,exports){
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
        //$root: vm.$root,
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

},{"../utils.js":21}],8:[function(require,module,exports){
"use strict";

module.exports = {
  replace: true
, anchor: true
  //content: dom 对象
  //TODO 接收任意类型参数转成 dom 对象?
, update: function(content) {
    var nodes = this.getNodes()
    var parent = this.anchors.end.parentNode;
    nodes.forEach(function(node) {
      parent.removeChild(node);
    })
    content && parent.insertBefore(content, this.anchors.end)
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

},{"../env.js":15,"../token.js":20,"../utils.js":21,"./attr.js":6,"./component.js":7,"./content.js":8,"./model.js":10,"./on.js":11,"./repeat.js":12,"./style.js":13}],10:[function(require,module,exports){
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

},{"../event-bind.js":17,"../token.js":20,"../utils.js":21}],11:[function(require,module,exports){
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

},{"../event-bind.js":17}],12:[function(require,module,exports){
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

        //pos < 0 && (pos = items.lastIndexOf(item, i));
        //oldPos < 0 && (oldPos = curArr.lastIndexOf(item, i));

        //新增元素
        if(oldPos < 0) {


          el = this.el.cloneNode(true)

          vm = new this.cstr(el, {
            $data: item, _assignments: this.assignments, $index: pos,
            $root: this.vm.$root, $parent: this.vm,
            __repeat: true
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
  var arr2Copy = arr2.slice();
  return arr1.filter(function(el) {
    var result, index = arr2Copy.indexOf(el)
    if(index < 0) {
      result = true
    }else{
      arr2Copy.splice(index, 1)
    }
    return result
  })
}

},{"../env.js":15,"../utils.js":21}],13:[function(require,module,exports){
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
"use strict";

var doc = require('./env.js').document
var utils = require('./utils')

//处理 $target,  $content, $tpl
//target: el 替换的目标
function tplParse(tpl, target, content) {
  var el, contents
    , frag = doc.createDocumentFragment();
  if(utils.isObject(target) && target.childNodes) {
    content = frag;
    contents = target.childNodes;
  }else{
    if(typeof content == 'string') {
      contents = createElementByTpl(content)
      content = frag;
    }
  }
  if(contents) {
    while (contents[0]) {
      content.appendChild(contents[0]);
    }
  }
  if(utils.isObject(tpl)){
    el = tpl;
    tpl = el.outerHTML;
  }else{
    el = createElementByTpl(tpl)[0]
  }
  if(target){
    target.parentNode && target.parentNode.replaceChild(el, target);
  }

  return {el: el, tpl: tpl, content: content};
}

function createElementByTpl(tpl) {
  var wraper = doc.createElement('div');
  //自定义标签在 IE8 下无效. 使用 component 指令替代
  wraper.innerHTML = tpl.trim();
  return wraper.childNodes;
}

module.exports = {
  tplParse: tplParse,
  createElementByTpl: createElementByTpl
}
},{"./env.js":15,"./utils":21}],15:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":2}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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
},{}],18:[function(require,module,exports){
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

},{"./utils.js":21}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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
},{}],21:[function(require,module,exports){
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
            try {
              //一些情下, 比如 firefox 下给字符串对象赋值时会异常
              target[name] = copy;
            }catch (e) {}
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

},{"./env.js":15}],22:[function(require,module,exports){
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
        }else if(localKey === '$index') {
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

},{"./class.js":3,"./eval.js":16,"./utils.js":21}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jbGFzcy5qcyIsInNyYy9jb21wb25lbnQuanMiLCJzcmMvZGlyZWN0aXZlLmpzIiwic3JjL2RpcmVjdGl2ZXMvYXR0ci5qcyIsInNyYy9kaXJlY3RpdmVzL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmVzL2NvbnRlbnQuanMiLCJzcmMvZGlyZWN0aXZlcy9pbmRleC5qcyIsInNyYy9kaXJlY3RpdmVzL21vZGVsLmpzIiwic3JjL2RpcmVjdGl2ZXMvb24uanMiLCJzcmMvZGlyZWN0aXZlcy9yZXBlYXQuanMiLCJzcmMvZGlyZWN0aXZlcy9zdHlsZS5qcyIsInNyYy9kb20tdXRpbHMuanMiLCJzcmMvZW52LmpzIiwic3JjL2V2YWwuanMiLCJzcmMvZXZlbnQtYmluZC5qcyIsInNyYy9ldmVudC5qcyIsInNyYy9wYXJzZS5qcyIsInNyYy90b2tlbi5qcyIsInNyYy91dGlscy5qcyIsInNyYy93YXRjaGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoZkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN01BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGVudiA9IHJlcXVpcmUoJy4vZW52LmpzJylcbiAgLCBkb2MgPSBlbnYuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIEV2ZW50ID0gcmVxdWlyZSgnLi9ldmVudC5qcycpXG4gICwgQ2xhc3MgPSByZXF1aXJlKCcuL2NsYXNzLmpzJylcbiAgLCBEaXIgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZS5qcycpXG4gICwgQ29tID0gcmVxdWlyZSgnLi9jb21wb25lbnQuanMnKVxuICAsIFdhdGNoZXIgPSByZXF1aXJlKCcuL3dhdGNoZXIuanMnKVxuXG4gICwgZGlycyA9IHJlcXVpcmUoJy4vZGlyZWN0aXZlcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuL3Rva2VuLmpzJylcbiAgLCBkb21VdGlscyA9IHJlcXVpcmUoJy4vZG9tLXV0aWxzLmpzJylcbiAgO1xuXG5cbnZhciBpc09iamVjdCA9IHV0aWxzLmlzT2JqZWN0XG4gICwgaXNVbmRlZmluZWQgPSB1dGlscy5pc1VuZGVmaW5lZFxuICAsIGlzRnVuY3Rpb24gPSB1dGlscy5pc0Z1bmN0aW9uXG4gICwgaXNQbGFpbk9iamVjdCA9IHV0aWxzLmlzUGxhaW5PYmplY3RcbiAgLCBwYXJzZUtleVBhdGggPSB1dGlscy5wYXJzZUtleVBhdGhcbiAgLCBkZWVwU2V0ID0gdXRpbHMuZGVlcFNldFxuICAsIGRlZXBHZXQgPSB1dGlscy5kZWVwR2V0XG4gICwgZXh0ZW5kID0gdXRpbHMuZXh0ZW5kXG4gICwgY3JlYXRlID0gdXRpbHMuY3JlYXRlXG4gIDtcblxuXG52YXIgTk9ERVRZUEUgPSB7XG4gICAgRUxFTUVOVDogMVxuICAsIEFUVFI6IDJcbiAgLCBURVhUOiAzXG4gICwgQ09NTUVOVDogOFxuICAsIEZSQUdNRU5UOiAxMVxufTtcblxuLy/orr7nva4gZGlyZWN0aXZlIOWJjee8gFxuZnVuY3Rpb24gc2V0UHJlZml4KG5ld1ByZWZpeCkge1xuICBpZihuZXdQcmVmaXgpe1xuICAgIHRoaXMucHJlZml4ID0gbmV3UHJlZml4O1xuICB9XG59XG5cbnZhciBtZXJnZVByb3BzID0ge1xuICAkZGF0YTogMSwgJGZpbHRlcjogMSwgJHdhdGNoZXJzOiAxXG59O1xuXG4vKipcbiAqIOaehOmAoOWHveaVsFxuICogLS0tXG4gKiBAcGFyYW0ge1N0cmluZ3xFbGVtZW50fSBbdHBsXSDmqKHmnb8uIOetieWQjOS6jiBwcm9wcy4kdHBsXG4gKiBAcGFyYW0ge09iamVjdH0gW3Byb3BzXSDlsZ7mgKcv5pa55rOVXG4gKiovXG5mdW5jdGlvbiBCZWUodHBsLCBwcm9wcykge1xuICBpZihpc1BsYWluT2JqZWN0KHRwbCkpIHtcbiAgICBwcm9wcyA9IHRwbDtcbiAgICB0cGwgPSBwcm9wcy4kdHBsO1xuICB9XG4gIHByb3BzID0gcHJvcHMgfHwge307XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIC8vJCDlvIDlpLTnmoTmmK/lhbHmnInlsZ7mgKcv5pa55rOVXG4gICAgJGRhdGE6IHRoaXMuJGRhdGEgfHwge31cbiAgLCAkZmlsdGVyczogdGhpcy4kZmlsdGVycyB8fCB7fVxuICAsICR3YXRjaGVyczogdGhpcy4kd2F0Y2hlcnMgfHwge31cblxuICAsICRlbDogdGhpcy4kZWwgfHwgbnVsbFxuICAsICR0YXJnZXQ6IHRoaXMuJHRhcmdldCB8fCBudWxsXG4gICwgJHRwbDogdGhpcy4kdHBsIHx8ICc8ZGl2PjwvZGl2PidcbiAgLCAkY29udGVudDogbnVsbFxuICAsICRwYXJlbnQ6IG51bGxcbiAgLCAkcm9vdDogdGhpc1xuXG4gICAgLy/np4HmnInlsZ7mgKcv5pa55rOVXG4gICwgX3dhdGNoZXJzOiB0aGlzLl93YXRjaGVycyB8fCB7fVxuICAsIF9hc3NpZ25tZW50czogbnVsbC8v5b2T5YmNIHZtIOeahOWIq+WQjVxuICAsIF9yZWxhdGl2ZVBhdGg6IFtdXG4gICwgX2lzUmVuZGVyZWQ6IGZhbHNlXG4gIH07XG5cbiAgdmFyIGVsO1xuXG4gIC8vLiRkYXRhIOW/hemhu+S4uuWvueixoS4g5Z+656GA57G75Z6L55qE5bCG6KKr6L2s5oiQ5a+56LGhLCDov5nml7blgJkgdGhpcy4kZGF0YSDlkowgcHJvcHMuJGRhdGEg5Lya5LiN562JXG4gIGlmKCFpc1VuZGVmaW5lZChwcm9wcy4kZGF0YSkpIHtcbiAgICBwcm9wcy4kZGF0YSA9IE9iamVjdChwcm9wcy4kZGF0YSlcbiAgfVxuXG4gIC8v5L+d5oyB5a+55Lyg5YWl5bGe5oCn55qE5byV55SoXG4gIGZvcih2YXIgcHJvcEtleSBpbiBwcm9wcykge1xuICAgIGlmKHByb3BLZXkgaW4gbWVyZ2VQcm9wcykge1xuICAgICAgLy9tZXJnZVByb3BzIOS4reeahOWxnuaAp+S8muiiq+m7mOiupOWAvOaJqeWxlVxuICAgICAgZXh0ZW5kKGRlZmF1bHRzW3Byb3BLZXldLCBwcm9wc1twcm9wS2V5XSlcbiAgICAgIGRlZmF1bHRzW3Byb3BLZXldID0gZXh0ZW5kKHByb3BzW3Byb3BLZXldLCBkZWZhdWx0c1twcm9wS2V5XSk7XG4gICAgfWVsc2V7XG4gICAgICBkZWZhdWx0c1twcm9wS2V5XSA9IHByb3BzW3Byb3BLZXldO1xuICAgIH1cbiAgfVxuXG4gIC8v5ZCI5bm25omA5pyJ5Yiw5b2T5YmN56m66Ze05LiLXG4gIGV4dGVuZCh0aGlzLCBkZWZhdWx0cyk7XG4gIGV4dGVuZCh0aGlzLCB0aGlzLiRkYXRhKTtcblxuICB0cGwgPSB0cGwgfHwgdGhpcy4kdHBsO1xuICBlbCA9IGRvbVV0aWxzLnRwbFBhcnNlKHRwbCwgdGhpcy4kdGFyZ2V0LCB0aGlzLiRjb250ZW50KTtcblxuICBpZih0aGlzLiRlbCl7XG4gICAgdGhpcy4kZWwuYXBwZW5kQ2hpbGQoZWwuZWwpO1xuICB9ZWxzZXtcbiAgICB0aGlzLiRlbCA9IGVsLmVsO1xuICB9XG4gIHRoaXMuJHRwbCA9IGVsLnRwbDtcbiAgdGhpcy4kY29udGVudCA9IGVsLmNvbnRlbnQ7XG5cbiAgdGhpcy4kZWwuYmVlID0gdGhpcztcblxuICB0aGlzLiRjb250ZW50ICYmIHdhbGsuY2FsbCh0aGlzLiRyb290LCB0aGlzLiRjb250ZW50KTtcbiAgd2Fsay5jYWxsKHRoaXMsIHRoaXMuJGVsKTtcblxuICBmb3IodmFyIGtleSBpbiB0aGlzLiR3YXRjaGVycykge1xuICAgIHRoaXMuJHdhdGNoKGtleSwgdGhpcy4kd2F0Y2hlcnNba2V5XSlcbiAgfVxuXG4gIHRoaXMuJHJlcGxhY2UodGhpcy4kZGF0YSk7XG4gIHRoaXMuX2lzUmVuZGVyZWQgPSB0cnVlO1xuICB0aGlzLiRpbml0KCk7XG59XG5cbi8v6Z2Z5oCB5bGe5oCnXG5leHRlbmQoQmVlLCBDbGFzcywgRGlyLCBDb20sIHtcbiAgc2V0UHJlZml4OiBzZXRQcmVmaXhcbiwgcHJlZml4OiAnJ1xuLCBkb2M6IGRvY1xuLCBkaXJlY3RpdmVzOiB7fVxuLCBjb21wb25lbnRzOiB7fVxuLCBtb3VudDogZnVuY3Rpb24oaWQsIHByb3BzKSB7XG4gICAgdmFyIGVsID0gaWQubm9kZVR5cGUgPyBpZCA6IGRvYy5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIENvbXAgPSB0aGlzLmNvbXBvbmVudHNbZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpXTtcbiAgICB2YXIgaW5zdGFuY2VcbiAgICBpZihDb21wKSB7XG4gICAgICBpbnN0YW5jZSA9IG5ldyBDb21wKGV4dGVuZCh7JHRhcmdldDogZWx9LCBwcm9wcykpXG4gICAgfWVsc2V7XG4gICAgICBpbnN0YW5jZSA9IG5ldyBCZWUoZWwsIHByb3BzKTtcbiAgICB9XG4gICAgcmV0dXJuIGluc3RhbmNlXG4gIH1cbn0pO1xuXG5cbkJlZS5zZXRQcmVmaXgoJ2ItJyk7XG5cbi8v5YaF572uIGRpcmVjdGl2ZVxuZm9yKHZhciBkaXIgaW4gZGlycykge1xuICBCZWUuZGlyZWN0aXZlKGRpciwgZGlyc1tkaXJdKTtcbn1cblxuLy/lrp7kvovmlrnms5Vcbi8vLS0tLVxuZXh0ZW5kKEJlZS5wcm90b3R5cGUsIEV2ZW50LCB7XG4gICRpbml0OiB1dGlscy5ub29wXG4gIC8qKlxuICAgKiDojrflj5blsZ7mgKcv5pa55rOVXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrZXlQYXRoIOi3r+W+hFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtzdHJpY3Q9ZmFsc2VdIOaYr+WQpuS4peagvOWcqOiHqui6q+S4reafpeaJvi5cbiAgICogQHJldHVybiB7Kn1cbiAgICovXG4sICRnZXQ6IGZ1bmN0aW9uKGtleVBhdGgsIHN0cmljdCkge1xuICAgIHN0cmljdCA9IHN0cmljdCA9PT0gdHJ1ZTtcblxuICAgIHZhciBzY29wZSA9IHRoaXNcbiAgICAgICwgcGF0aCA9IGtleVBhdGhcbiAgICAgICwgcGF0aHMsIGhlYWRQYXRoXG4gICAgICA7XG5cbiAgICBpZighc3RyaWN0KSB7XG4gICAgICBpZih0aGlzLl9fcmVwZWF0KSB7XG4gICAgICAgIHBhdGhzID0gcGFyc2VLZXlQYXRoKHBhdGgpO1xuICAgICAgICBoZWFkUGF0aCA9IHBhdGhzWzBdXG4gICAgICAgIGlmKHNjb3BlLl9hc3NpZ25tZW50cyAmJiBzY29wZS5fYXNzaWdubWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgaWYoaGVhZFBhdGggPT09IHRoaXMuX2Fzc2lnbm1lbnRzWzBdKSB7XG4gICAgICAgICAgICAvLyDlhbflkI0gcmVwZWF0IOS4jeS8muebtOaOpeafpeaJvuiHqui6q+S9nOeUqOWfn1xuICAgICAgICAgICAgc2NvcGUgPSB7fTtcbiAgICAgICAgICAgIHNjb3BlW2hlYWRQYXRoXSA9IHRoaXMuJGRhdGE7XG4gICAgICAgICAgfWVsc2UgaWYoaGVhZFBhdGggPT09ICckaW5kZXgnKSB7XG4gICAgICAgICAgICBzY29wZSA9IHRoaXM7XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kcGFyZW50LiRnZXQoa2V5UGF0aCwgc3RyaWN0KVxuICAgICAgICAgIH1cbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgLy/ljL/lkI0gcmVwZWF0XG4gICAgICAgICAgcmV0dXJuIChoZWFkUGF0aCBpbiB0aGlzKSA/IHRoaXMuJGdldChrZXlQYXRoKSA6IHRoaXMuJHBhcmVudC4kZ2V0KGtleVBhdGgsIHN0cmljdClcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkZWVwR2V0KHBhdGgsIHNjb3BlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiAjIyMgYmVlLiRzZXRcbiAgICog5pu05paw5ZCI5bm2IGAuZGF0YWAg5Lit55qE5pWw5o2uLiDlpoLmnpzlj6rmnInkuIDkuKrlj4LmlbAsIOmCo+S5iOi/meS4quWPguaVsOWwhuW5tuWFpSAuJGRhdGFcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtrZXldIOaVsOaNrui3r+W+hC5cbiAgICogQHBhcmFtIHtBbnlUeXBlfE9iamVjdH0gdmFsIOaVsOaNruWGheWuuS5cbiAgICovXG4sICRzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsKSB7XG4gICAgdmFyIGFkZCwga2V5cywgaGFzS2V5ID0gZmFsc2U7XG4gICAgaWYoaXNVbmRlZmluZWQoa2V5KSl7IHJldHVybiB0aGlzOyB9XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIGV4dGVuZCh0cnVlLCB0aGlzLiRkYXRhLCBrZXkpO1xuICAgICAgZXh0ZW5kKHRydWUsIHRoaXMsIGtleSk7XG4gICAgfWVsc2V7XG4gICAgICBoYXNLZXkgPSB0cnVlO1xuICAgICAga2V5cyA9IHBhcnNlS2V5UGF0aChrZXkpO1xuICAgICAgYWRkID0gZGVlcFNldChrZXksIHZhbCwge30pO1xuICAgICAgaWYoa2V5c1swXSA9PT0gJyRkYXRhJykge1xuICAgICAgICBhZGQgPSBhZGQuJGRhdGFcbiAgICAgIH1cbiAgICAgIGV4dGVuZCh0cnVlLCB0aGlzLiRkYXRhLCBhZGQpO1xuICAgICAgZXh0ZW5kKHRydWUsIHRoaXMsIGFkZCk7XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSwgdmFsKSA6IHVwZGF0ZS5jYWxsKHRoaXMsIGtleSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgLyoqXG4gICAqIOaVsOaNruabv+aNolxuICAgKi9cbiwgJHJlcGxhY2U6IGZ1bmN0aW9uIChrZXksIHZhbCkge1xuICAgIHZhciBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcblxuICAgIGlmKGlzVW5kZWZpbmVkKGtleSkpeyByZXR1cm4gdGhpczsgfVxuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICBPYmplY3Qua2V5cyh0aGlzLiRkYXRhKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICBkZWxldGUgdGhpc1trZXldO1xuICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICAgIGV4dGVuZCh0aGlzLCBrZXkpO1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5KTtcbiAgICAgIGlmKGtleXNbMF0gIT09ICckZGF0YScpIHtcbiAgICAgICAgZGVlcFNldChrZXksIG51bGwsIHRoaXMuJGRhdGEpO1xuICAgICAgICBkZWVwU2V0KGtleSwgdmFsLCB0aGlzLiRkYXRhKTtcbiAgICAgIH1cbiAgICAgIC8vVE9ETyDmuIXpmaTljoblj7LmlbDmja5cbiAgICAgIGRlZXBTZXQoa2V5LCBudWxsLCB0aGlzKTtcbiAgICAgIGRlZXBTZXQoa2V5LCB2YWwsIHRoaXMpO1xuICAgIH1cbiAgICBoYXNLZXkgPyB1cGRhdGUuY2FsbCh0aGlzLCBrZXksIHZhbCkgOiB1cGRhdGUuY2FsbCh0aGlzLCBrZXkpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIC8qKlxuICAgKiDmiYvliqjmm7TmlrDmn5Dpg6jliIbmlbDmja5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleVBhdGgg5oyH5a6a5pu05paw5pWw5o2u55qEIGtleVBhdGhcbiAgICogQHBhcmFtIHtCb29sZWFufSBbaXNCdWJibGU9dHJ1ZV0g5piv5ZCm5pu05pawIGtleVBhdGgg55qE54i257qnXG4gICAqL1xuLCAkdXBkYXRlOiBmdW5jdGlvbiAoa2V5UGF0aCwgaXNCdWJibGUpIHtcbiAgICBpc0J1YmJsZSA9IGlzQnViYmxlICE9PSBmYWxzZTtcblxuICAgIHZhciBrZXlzID0gcGFyc2VLZXlQYXRoKGtleVBhdGgucmVwbGFjZSgvXlxcJGRhdGFcXC4vLCAnJykpLCBrZXksIGF0dHJzO1xuICAgIHZhciB3YXRjaGVycztcblxuICAgIHdoaWxlKGtleSA9IGtleXMuam9pbignLicpKSB7XG4gICAgICB3YXRjaGVycyA9IHRoaXMuX3dhdGNoZXJzW2tleV07XG5cbiAgICAgIGlmICh3YXRjaGVycykge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHdhdGNoZXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgIHdhdGNoZXJzW2ldLnVwZGF0ZSgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICAgIGtleXMucG9wKCk7XG4gICAgICAgIC8v5pyA57uI6YO95YaS5rOh5YiwICRkYXRhXG4gICAgICAgIGlmKCFrZXlzLmxlbmd0aCAmJiBrZXkgIT09ICckZGF0YScpe1xuICAgICAgICAgIGtleXMucHVzaCgnJGRhdGEnKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBhdHRycyA9IHRoaXMuJGdldChrZXlQYXRoKTtcblxuICAgIC8v5ZCM5pe25pu05paw5a2Q6Lev5b6EXG4gICAgaWYoaXNPYmplY3QoYXR0cnMpKSB7XG4gICAgICBPYmplY3Qua2V5cyhhdHRycykuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG4gICAgICAgIHRoaXMuJHVwZGF0ZShrZXlQYXRoICsgJy4nICsgYXR0ciwgZmFsc2UpO1xuICAgICAgfS5iaW5kKHRoaXMpKVxuICAgIH1cblxuICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICBpZih0aGlzLiRwYXJlbnQpIHtcbiAgICAgICAgLy/lkIzmraXmm7TmlrDniLYgdm0g5a+55bqU6YOo5YiGXG4gICAgICAgIHRoaXMuX3JlbGF0aXZlUGF0aC5mb3JFYWNoKGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgICAgICAgdGhpcy4kcGFyZW50LiR1cGRhdGUocGF0aCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL+abtOaWsOaVsOe7hOmVv+W6plxuICAgIGlmKHV0aWxzLmlzQXJyYXkoYXR0cnMpKSB7XG4gICAgICB0aGlzLiR1cGRhdGUoa2V5UGF0aCArICcubGVuZ3RoJywgZmFsc2UpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG4sICR3YXRjaDogZnVuY3Rpb24gKGtleVBhdGgsIGNhbGxiYWNrKSB7XG4gICAgaWYoY2FsbGJhY2spIHtcbiAgICAgIHZhciB1cGRhdGUgPSBjYWxsYmFjay5iaW5kKHRoaXMpO1xuICAgICAgdXBkYXRlLl9vcmlnaW5GbiA9IGNhbGxiYWNrO1xuICAgICAgYWRkV2F0Y2hlci5jYWxsKHRoaXMsIG5ldyBEaXIoJ3dhdGNoZXInLCB7cGF0aDoga2V5UGF0aCwgdXBkYXRlOiB1cGRhdGV9KSlcbiAgICB9XG4gIH1cbiAgLy9UT0RPIOaUr+aMgSDooajovr7lvI8ga2V5UGF0aCA/XG4sICR1bndhdGNoOiBmdW5jdGlvbiAoa2V5UGF0aCwgY2FsbGJhY2spIHtcbiAgICB2YXIgd2F0Y2hlcnMgPSB0aGlzLl93YXRjaGVyc1trZXlQYXRoXSB8fCBbXSwgdXBkYXRlO1xuXG4gICAgZm9yKHZhciBpID0gd2F0Y2hlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgdXBkYXRlID0gd2F0Y2hlcnNbaV0uZGlyLnVwZGF0ZTtcbiAgICAgIGlmKHVwZGF0ZSA9PT0gY2FsbGJhY2sgfHwgdXBkYXRlLl9vcmlnaW5GbiA9PT0gY2FsbGJhY2spe1xuICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59KTtcblxuZnVuY3Rpb24gdXBkYXRlIChrZXlQYXRoLCBkYXRhKSB7XG4gIHZhciBrZXlQYXRocztcblxuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZGF0YSA9IGtleVBhdGg7XG4gIH1lbHNle1xuICAgIGtleVBhdGhzID0gW2tleVBhdGhdO1xuICB9XG5cbiAgaWYoIWtleVBhdGhzKSB7XG4gICAgaWYoaXNPYmplY3QoZGF0YSkpIHtcbiAgICAgIGtleVBhdGhzID0gT2JqZWN0LmtleXMoZGF0YSk7XG4gICAgfWVsc2V7XG4gICAgICAvLy4kZGF0YSDmnInlj6/og73mmK/ln7rmnKznsbvlnovmlbDmja5cbiAgICAgIGtleVBhdGhzID0gWyckZGF0YSddO1xuICAgIH1cbiAgfVxuXG4gIGZvcih2YXIgaSA9IDAsIHBhdGg7IHBhdGggPSBrZXlQYXRoc1tpXTsgaSsrKXtcbiAgICB0aGlzLiR1cGRhdGUocGF0aCwgdHJ1ZSk7XG4gIH1cblxufVxuZG9jLmNyZWF0ZUVsZW1lbnQoJ3RlbXBsYXRlJylcbi8v6YGN5Y6GIGRvbSDmoJFcbmZ1bmN0aW9uIHdhbGsoZWwpIHtcblxuICBpZihlbC5ub2RlVHlwZSA9PT0gTk9ERVRZUEUuRlJBR01FTlQpIHtcbiAgICBlbCA9IGVsLmNoaWxkTm9kZXM7XG4gIH1cblxuICBpZigoJ2xlbmd0aCcgaW4gZWwpICYmIGlzVW5kZWZpbmVkKGVsLm5vZGVUeXBlKSl7XG4gICAgLy9ub2RlIGxpc3RcbiAgICAvL+WvueS6jiBub2RlbGlzdCDlpoLmnpzlhbbkuK3mnInljIXlkKsge3t0ZXh0fX0g55u05o6l6YeP55qE6KGo6L6+5byPLCDmlofmnKzoioLngrnkvJrooqvliIblibIsIOWFtuiKgueCueaVsOmHj+WPr+iDveS8muWKqOaAgeWinuWKoFxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbC5sZW5ndGg7IGkrKykge1xuICAgICAgd2Fsay5jYWxsKHRoaXMsIGVsW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoIChlbC5ub2RlVHlwZSkge1xuICAgIGNhc2UgTk9ERVRZUEUuRUxFTUVOVDpcbiAgICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5DT01NRU5UOlxuICAgICAgLy/ms6jph4roioLngrlcbiAgICAgIHJldHVybjtcbiAgICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5URVhUOlxuICAgICAgLy/mlofmnKzoioLngrlcbiAgICAgIGNoZWNrVGV4dC5jYWxsKHRoaXMsIGVsKTtcbiAgICAgIHJldHVybjtcbiAgICAgICAgYnJlYWs7XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgLy90ZW1wbGF0ZSBzaGltXG4gICAgaWYoIWVsLmNvbnRlbnQpIHtcbiAgICAgIGVsLmNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgd2hpbGUoZWwuY2hpbGROb2Rlc1swXSkge1xuICAgICAgICBlbC5jb250ZW50LmFwcGVuZENoaWxkKGVsLmNoaWxkTm9kZXNbMF0pXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoY2hlY2tBdHRyLmNhbGwodGhpcywgZWwpKXtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgd2Fsay5jYWxsKHRoaXMsIGVsLmNvbnRlbnQpXG4gIH1cblxuICBmb3IodmFyIGNoaWxkID0gZWwuZmlyc3RDaGlsZCwgbmV4dDsgY2hpbGQ7ICl7XG4gICAgbmV4dCA9IGNoaWxkLm5leHRTaWJsaW5nO1xuICAgIHdhbGsuY2FsbCh0aGlzLCBjaGlsZCk7XG4gICAgY2hpbGQgPSBuZXh0O1xuICB9XG59XG5cbi8v6YGN5Y6G5bGe5oCnXG5mdW5jdGlvbiBjaGVja0F0dHIoZWwpIHtcbiAgdmFyIGNzdHIgPSB0aGlzLmNvbnN0cnVjdG9yXG4gICAgLCBwcmVmaXggPSBjc3RyLnByZWZpeFxuICAgICwgZGlycyA9IGNzdHIuZGlyZWN0aXZlLmdldERpcihlbCwgY3N0ci5kaXJlY3RpdmVzLCBjc3RyLmNvbXBvbmVudHMsIHByZWZpeClcbiAgICAsIGRpclxuICAgICwgdGVybWluYWxQcmlvcml0eSwgdGVybWluYWxcbiAgICAsIHJlc3VsdCA9IHt9O1xuICAgIDtcblxuICBmb3IgKHZhciBpID0gMCwgbCA9IGRpcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgZGlyID0gZGlyc1tpXTtcbiAgICBkaXIuZGlycyA9IGRpcnM7XG5cbiAgICAvL+WvueS6jiB0ZXJtaW5hbCDkuLogdHJ1ZSDnmoQgZGlyZWN0aXZlLCDlnKjop6PmnpDlrozlhbbnm7jlkIzmnYPph43nmoQgZGlyZWN0aXZlIOWQjuS4reaWremBjeWOhuivpeWFg+e0oFxuICAgIGlmKHRlcm1pbmFsUHJpb3JpdHkgPiBkaXIucHJpb3JpdHkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGVsLnJlbW92ZUF0dHJpYnV0ZShkaXIubm9kZU5hbWUpO1xuXG4gICAgc2V0QmluZGluZy5jYWxsKHRoaXMsIGRpcik7XG5cbiAgICBpZihkaXIudGVybWluYWwpIHtcbiAgICAgIHRlcm1pbmFsID0gdHJ1ZTtcbiAgICAgIHRlcm1pbmFsUHJpb3JpdHkgPSBkaXIucHJpb3JpdHk7XG4gICAgfVxuICB9XG5cbiAgcmVzdWx0LmRpcnMgPSBkaXJzO1xuXG4gIHJldHVybiB0ZXJtaW5hbFxufVxuXG4vL+WkhOeQhuaWh+acrOiKgueCueS4reeahOe7keWumuWNoOS9jeespih7ey4uLn19KVxuZnVuY3Rpb24gY2hlY2tUZXh0KG5vZGUpIHtcbiAgaWYodG9rZW4uaGFzVG9rZW4obm9kZS5ub2RlVmFsdWUpKSB7XG4gICAgdmFyIHRva2VucyA9IHRva2VuLnBhcnNlVG9rZW4obm9kZS5ub2RlVmFsdWUpXG4gICAgICAsIHRleHRNYXAgPSB0b2tlbnMudGV4dE1hcFxuICAgICAgLCBlbCA9IG5vZGUucGFyZW50Tm9kZVxuICAgICAgLCBkaXJzID0gdGhpcy5jb25zdHJ1Y3Rvci5kaXJlY3RpdmVzXG4gICAgICAsIHQsIGRpclxuICAgICAgO1xuXG4gICAgLy/lsIZ7e2tleX195YiG5Ymy5oiQ5Y2V54us55qE5paH5pys6IqC54K5XG4gICAgaWYodGV4dE1hcC5sZW5ndGggPiAxKSB7XG4gICAgICB0ZXh0TWFwLmZvckVhY2goZnVuY3Rpb24odGV4dCkge1xuICAgICAgICB2YXIgdG4gPSBkb2MuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG4gICAgICAgIGVsLmluc2VydEJlZm9yZSh0biwgbm9kZSk7XG4gICAgICAgIGNoZWNrVGV4dC5jYWxsKHRoaXMsIHRuKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICBlbC5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9ZWxzZXtcbiAgICAgIHQgPSB0b2tlbnNbMF07XG4gICAgICAvL+WGhee9ruWQhOWNoOS9jeespuWkhOeQhi5cbiAgICAgIGRpciA9IGNyZWF0ZSh0LmVzY2FwZSA/IGRpcnMudGV4dCA6IGRpcnMuaHRtbCk7XG4gICAgICBzZXRCaW5kaW5nLmNhbGwodGhpcywgZXh0ZW5kKGRpciwgdCwge1xuICAgICAgICBlbDogbm9kZVxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRCaW5kaW5nKGRpcikge1xuICBpZihkaXIucmVwbGFjZSkge1xuICAgIHZhciBlbCA9IGRpci5lbDtcbiAgICBpZihpc0Z1bmN0aW9uKGRpci5yZXBsYWNlKSkge1xuICAgICAgZGlyLm5vZGUgPSBkaXIucmVwbGFjZSgpO1xuICAgIH1lbHNlIGlmKGRpci5yZXBsYWNlKXtcbiAgICAgIGRpci5ub2RlID0gZG9jLmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICB9XG5cbiAgICBkaXIuZWwgPSBkaXIuZWwucGFyZW50Tm9kZTtcbiAgICBkaXIuZWwucmVwbGFjZUNoaWxkKGRpci5ub2RlLCBlbCk7XG4gIH1cblxuICBkaXIubGluayh0aGlzKTtcblxuICBhZGRXYXRjaGVyLmNhbGwodGhpcywgZGlyKVxufVxuXG5mdW5jdGlvbiBhZGRXYXRjaGVyKGRpcikge1xuICBpZihkaXIucGF0aCAmJiBkaXIud2F0Y2gpIHtcbiAgICByZXR1cm4gbmV3IFdhdGNoZXIodGhpcywgZGlyKTtcbiAgfVxufVxuXG5CZWUudmVyc2lvbiA9ICcwLjEuMic7XG5cbm1vZHVsZS5leHBvcnRzID0gQmVlO1xuIixudWxsLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlscy5qcycpLmV4dGVuZDtcblxudmFyIENsYXNzID0ge1xuICAvKiogXG4gICAqIOaehOmAoOWHveaVsOe7p+aJvy4gXG4gICAqIOWmgjogYHZhciBDYXIgPSBCZWUuZXh0ZW5kKHtkcml2ZTogZnVuY3Rpb24oKXt9fSk7IG5ldyBDYXIoKTtgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvdG9Qcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV5Y6f5Z6L5a+56LGhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbc3RhdGljUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxlemdmeaAgeWxnuaAp1xuICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0g5a2Q5p6E6YCg5Ye95pWwXG4gICAqL1xuICBleHRlbmQ6IGZ1bmN0aW9uIChwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuICAgIHByb3RvUHJvcHMgPSBwcm90b1Byb3BzIHx8IHt9O1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IHByb3RvUHJvcHMuaGFzT3duUHJvcGVydHkoJ2NvbnN0cnVjdG9yJykgPyBwcm90b1Byb3BzLmNvbnN0cnVjdG9yIDogZnVuY3Rpb24oKXsgcmV0dXJuIHN1cC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgdmFyIHN1cCA9IHRoaXM7XG4gICAgdmFyIEZuID0gZnVuY3Rpb24oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjb25zdHJ1Y3RvcjsgfTtcbiAgICBcbiAgICBGbi5wcm90b3R5cGUgPSBzdXAucHJvdG90eXBlO1xuICAgIGNvbnN0cnVjdG9yLnByb3RvdHlwZSA9IG5ldyBGbigpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdGF0aWNQcm9wcywge19fc3VwZXJfXzogc3VwLnByb3RvdHlwZX0pO1xuICAgIFxuICAgIHJldHVybiBjb25zdHJ1Y3RvcjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4vKipcbiAqIOazqOWGjOe7hOS7tlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWUg6Ieq5a6a5LmJ57uE5Lu255qE5qCH562+5ZCNXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHByb3BzfSBDb21wb25lbnQg6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwIC8g5p6E6YCg5Ye95pWw5Y+C5pWwXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0g6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwXG4gKi9cbmZ1bmN0aW9uIHRhZyh0YWdOYW1lLCBDb21wb25lbnQsIHN0YXRpY3MpIHtcbiAgdmFyIHRhZ3MgPSB0aGlzLmNvbXBvbmVudHMgPSB0aGlzLmNvbXBvbmVudHMgfHwge307XG5cbiAgdGhpcy5kb2MuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTsvL2ZvciBvbGQgSUVcblxuICBpZih1dGlscy5pc09iamVjdChDb21wb25lbnQpKSB7XG4gICAgQ29tcG9uZW50ID0gdGhpcy5leHRlbmQoQ29tcG9uZW50LCBzdGF0aWNzKTtcbiAgfVxuICByZXR1cm4gdGFnc1t0YWdOYW1lXSA9IENvbXBvbmVudDtcbn1cblxuZXhwb3J0cy50YWcgPSBleHBvcnRzLmNvbXBvbmVudCA9IHRhZztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcblxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8qKlxuICog5Li6IEJlZSDmnoTpgKDlh73mlbDmt7vliqDmjIfku6QgKGRpcmVjdGl2ZSkuIGBCZWUuZGlyZWN0aXZlYFxuICogQHBhcmFtIHtTdHJpbmd9IGtleSBkaXJlY3RpdmUg5ZCN56ewXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdHNdIGRpcmVjdGl2ZSDlj4LmlbBcbiAqIEBwYXJhbSB7TnVtYmVyfSBvcHRzLnByaW9yaXR5PTAgZGlyZWN0aXZlIOS8mOWFiOe6py4g5ZCM5LiA5Liq5YWD57Sg5LiK55qE5oyH5Luk5oyJ54Wn5LyY5YWI57qn6aG65bqP5omn6KGMLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLnRlcm1pbmFsPWZhbHNlIOaJp+ihjOivpSBkaXJlY3RpdmUg5ZCOLCDmmK/lkKbnu4jmraLlkI7nu60gZGlyZWN0aXZlIOaJp+ihjC5cbiAqICAgdGVybWluYWwg5Li655yf5pe2LCDkuI7or6UgZGlyZWN0aXZlIOS8mOWFiOe6p+ebuOWQjOeahCBkaXJlY3RpdmUg5LuN5Lya57un57ut5omn6KGMLCDovoPkvY7kvJjlhYjnuqfnmoTmiY3kvJrooqvlv73nlaUuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMuYW5jaG9yIGFuY2hvciDkuLogdHJ1ZSDml7YsIOS8muWcqOaMh+S7pOiKgueCueWJjeWQjuWQhOS6p+eUn+S4gOS4quepuueZveeahOagh+iusOiKgueCuS4g5YiG5Yir5a+55bqUIGBhbmNob3JzLnN0YXJ0YCDlkowgYGFuY2hvcnMuZW5kYFxuICovXG5mdW5jdGlvbiBkaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHZhciBkaXJzID0gdGhpcy5kaXJlY3RpdmVzID0gdGhpcy5kaXJlY3RpdmVzIHx8IHt9O1xuXG4gIHJldHVybiBkaXJzW2tleV0gPSBuZXcgRGlyZWN0aXZlKGtleSwgb3B0cyk7XG59XG5cbmZ1bmN0aW9uIERpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdGhpcy50eXBlID0ga2V5O1xuICB1dGlscy5leHRlbmQodGhpcywgb3B0cyk7XG59XG5cbkRpcmVjdGl2ZS5wcm90b3R5cGUgPSB7XG4gIHByaW9yaXR5OiAwLy/mnYPph41cbiwgbGluazogdXRpbHMubm9vcC8v5Yid5aeL5YyW5pa55rOVXG4sIHVwZGF0ZTogdXRpbHMubm9vcC8v5pu05paw5pa55rOVXG4sIHRlYXJEb3duOiB1dGlscy5ub29wXG4sIHRlcm1pbmFsOiBmYWxzZS8v5piv5ZCm57uI5q2iXG4sIHJlcGxhY2U6IGZhbHNlLy/mmK/lkKbmm7/mjaLlvZPliY3lhYPntKAuIOWmguaenOaYrywg5bCG55So5LiA5Liq56m655qE5paH5pys6IqC54K55pu/5o2i5b2T5YmN5YWD57SgXG4sIHdhdGNoOiB0cnVlLy/mmK/lkKbnm5Hmjqcga2V5IOeahOWPmOWMllxuXG4sIGFuY2hvcjogZmFsc2VcbiwgYW5jaG9yczogbnVsbFxuXG4gIC8v5b2TIGFuY2hvciDkuLogdHJ1ZSDml7YsIOiOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gdGhpcy5hbmNob3JzLnN0YXJ0Lm5leHRTaWJsaW5nO1xuICAgIGlmKHRoaXMuYW5jaG9yICYmIG5vZGUpIHtcbiAgICAgIHdoaWxlKG5vZGUgIT09IHRoaXMuYW5jaG9ycy5lbmQpe1xuICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG4gIC8v6Kej5p6Q6KGo6L6+5byPXG4sIHBhcnNlOiBmdW5jdGlvbigpIHtcbiAgICB0cnl7XG4gICAgICB0aGlzLmFzdCA9IHBhcnNlKHRoaXMucGF0aCwgdGhpcy50eXBlKTtcbiAgICB9Y2F0Y2goZSkge1xuICAgICAgdGhpcy5hc3QgPSB7fTtcbiAgICAgIGUubWVzc2FnZSA9ICdTeW50YXhFcnJvciBpbiBcIicgKyB0aGlzLnBhdGggKyAnXCIgfCAnICsgZS5tZXNzYWdlO1xuICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICB9XG4gIH1cbiAgLy/ooajovr7lvI/msYLlgLxcbiwgZ2V0VmFsdWU6IGZ1bmN0aW9uKHNjb3BlKSB7XG4gICAgdmFyIHZhbDtcblxuICAgIHRyeXtcbiAgICAgIHZhbCA9IGV2YWx1YXRlLmV2YWwodGhpcy5hc3QsIHNjb3BlLCB0aGlzKTtcbiAgICB9Y2F0Y2goZSl7XG4gICAgICB2YWwgPSAnJztcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICAgIGlmKHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSB7XG4gICAgICB2YWwgPSAnJztcbiAgICB9XG4gICAgcmV0dXJuIHZhbDtcbiAgfVxufTtcblxudmFyIGF0dHJQb3N0UmVnID0gL1xcPyQvO1xuXG4vL+iOt+WPluS4gOS4quWFg+e0oOS4iuaJgOacieeUqCBIVE1MIOWxnuaAp+WumuS5ieeahOaMh+S7pFxuZnVuY3Rpb24gZ2V0RGlyKGVsLCBkaXJlY3RpdmVzLCBjb21wb25lbnRzLCBwcmVmaXgpIHtcbiAgcHJlZml4ID0gcHJlZml4IHx8ICcnO1xuICBkaXJlY3RpdmVzID0gZGlyZWN0aXZlcyB8fCB7fTtcblxuICB2YXIgYXR0ciwgYXR0ck5hbWUsIGRpck5hbWUsIHByb3RvXG4gICAgLCBkaXJzID0gW10sIGRpciwgYW5jaG9ycyA9IHt9XG4gICAgLCBwYXJlbnQgPSBlbC5wYXJlbnROb2RlXG4gICAgLCBub2RlTmFtZSA9IGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKClcbiAgICA7XG5cbiAgLy/lr7nkuo7oh6rlrprkuYnmoIfnrb4sIOWwhuWFtui9rOS4uiBkaXJlY3RpdmVcbiAgaWYobm9kZU5hbWUgaW4gY29tcG9uZW50cykge1xuICAgIGVsLnNldEF0dHJpYnV0ZShwcmVmaXggKyAnY29tcG9uZW50Jywgbm9kZU5hbWUpO1xuICB9XG5cbiAgZm9yKHZhciBpID0gZWwuYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgYXR0ciA9IGVsLmF0dHJpYnV0ZXNbaV07XG4gICAgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuICAgIGRpck5hbWUgPSBhdHRyTmFtZS5zbGljZShwcmVmaXgubGVuZ3RoKTtcbiAgICBwcm90byA9IHtlbDogZWwsIG5vZGU6IGF0dHIsIG5vZGVOYW1lOiBhdHRyTmFtZSwgcGF0aDogYXR0ci52YWx1ZX07XG4gICAgZGlyID0gbnVsbDtcblxuICAgIGlmKGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCAmJiAoZGlyTmFtZSBpbiBkaXJlY3RpdmVzKSkge1xuICAgICAgLy/mjIfku6RcbiAgICAgIGRpciA9IGNyZWF0ZShkaXJlY3RpdmVzW2Rpck5hbWVdKTtcbiAgICAgIGRpci5kaXJOYW1lID0gZGlyTmFtZS8vZGlyIOWQjVxuICAgIH1lbHNlIGlmKHRva2VuLmhhc1Rva2VuKGF0dHIudmFsdWUpKSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+WPr+iDveacieWkmuS4quihqOi+vuW8j+WMulxuICAgICAgdG9rZW4ucGFyc2VUb2tlbihhdHRyLnZhbHVlKS5mb3JFYWNoKGZ1bmN0aW9uKG9yaWdpbikge1xuICAgICAgICBvcmlnaW4uZGlyTmFtZSA9IGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCA/IGRpck5hbWUgOiBhdHRyTmFtZSA7XG4gICAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoY3JlYXRlKGRpcmVjdGl2ZXMuYXR0ciksIHByb3RvLCBvcmlnaW4pKVxuICAgICAgfSk7XG4gICAgICAvL+eUseS6juW3suefpeWxnuaAp+ihqOi+vuW8j+S4jeWtmOWcqCBhbmNob3IsIOaJgOS7peebtOaOpei3s+i/h+S4i+mdoueahOajgOa1i1xuICAgIH1lbHNlIGlmKGF0dHJQb3N0UmVnLnRlc3QoYXR0ck5hbWUpKSB7XG4gICAgICAvL+adoeS7tuWxnuaAp+aMh+S7pFxuICAgICAgZGlyID0gdXRpbHMuZXh0ZW5kKGNyZWF0ZShkaXJlY3RpdmVzLmF0dHIpLCB7IGRpck5hbWU6IGF0dHJOYW1lLnJlcGxhY2UoYXR0clBvc3RSZWcsICcnKSwgY29uZGl0aW9uYWw6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgaWYoZGlyKSB7XG4gICAgICBpZihkaXIuYW5jaG9yICYmICFhbmNob3JzLnN0YXJ0KSB7XG4gICAgICAgIC8v5ZCM5LiA5Liq5YWD57Sg5LiK55qEIGRpcmVjdGl2ZSDlhbHkuqvlkIzkuIDlr7nplJrngrlcbiAgICAgICAgYW5jaG9ycy5zdGFydCA9IGRvYy5jcmVhdGVDb21tZW50KGRpci5kaXJOYW1lICsgJyBzdGFydCcpO1xuICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGFuY2hvcnMuc3RhcnQsIGVsKTtcblxuICAgICAgICBhbmNob3JzLmVuZCA9IGRvYy5jcmVhdGVDb21tZW50KGRpci5kaXJOYW1lICsgJyBlbmQnKTtcbiAgICAgICAgaWYoZWwubmV4dFNpYmxpbmcpIHtcbiAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGFuY2hvcnMuZW5kLCBlbC5uZXh0U2libGluZyk7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChhbmNob3JzLmVuZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGRpci5hbmNob3JzID0gZGlyLmFuY2hvciA/IGFuY2hvcnMgOiBudWxsO1xuICAgICAgZGlycy5wdXNoKHV0aWxzLmV4dGVuZChkaXIsIHByb3RvKSk7XG4gICAgfVxuICB9XG4gIGRpcnMuc29ydChmdW5jdGlvbihkMCwgZDEpIHtcbiAgICByZXR1cm4gZDEucHJpb3JpdHkgLSBkMC5wcmlvcml0eTtcbiAgfSk7XG4gIHJldHVybiBkaXJzO1xufVxuXG5EaXJlY3RpdmUuZGlyZWN0aXZlID0gZGlyZWN0aXZlO1xuZGlyZWN0aXZlLmdldERpciA9IGdldERpcjtcblxubW9kdWxlLmV4cG9ydHMgPSBEaXJlY3RpdmU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/lsZ7mgKfmjIfku6RcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7Ly9hdHRyIGJpbmRpbmdcbiAgICAgIHRoaXMuYXR0cnMgPSB7fTtcbiAgICB9ZWxzZSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+m7mOiupOWwhuWAvOe9ruepuiwg6Ziy5q2i6KGo6L6+5byP5YaF5Y+Y6YeP5LiN5a2Y5ZyoXG4gICAgICB0aGlzLnVwZGF0ZSgnJylcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBuZXdBdHRycyA9IHt9O1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7XG4gICAgICBmb3IodmFyIGF0dHIgaW4gdmFsKSB7XG4gICAgICAgIHNldEF0dHIoZWwsIGF0dHIsIHZhbFthdHRyXSk7XG4gICAgICAgIC8vaWYodmFsW2F0dHJdKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuYXR0cnNbYXR0cl07XG4gICAgICAgIC8vfVxuICAgICAgICBuZXdBdHRyc1thdHRyXSA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8v56e76Zmk5LiN5Zyo5LiK5qyh6K6w5b2V5Lit55qE5bGe5oCnXG4gICAgICBmb3IodmFyIGF0dHIgaW4gdGhpcy5hdHRycykge1xuICAgICAgICByZW1vdmVBdHRyKGVsLCBhdHRyKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYXR0cnMgPSBuZXdBdHRycztcbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuY29uZGl0aW9uYWwpIHtcbiAgICAgICAgdmFsID8gc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB2YWwpIDogcmVtb3ZlQXR0cihlbCwgdGhpcy5kaXJOYW1lKTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLnRleHRNYXBbdGhpcy5wb3NpdGlvbl0gPSB2YWwgJiYgKHZhbCArICcnKTtcbiAgICAgICAgc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB0aGlzLnRleHRNYXAuam9pbignJykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuXG4vL0lFIOa1j+iniOWZqOW+iOWkmuWxnuaAp+mAmui/hyBgc2V0QXR0cmlidXRlYCDorr7nva7lkI7ml6DmlYguIFxuLy/ov5nkupvpgJrov4cgYGVsW2F0dHJdID0gdmFsdWVgIOiuvue9rueahOWxnuaAp+WNtOiDveWkn+mAmui/hyBgcmVtb3ZlQXR0cmlidXRlYCDmuIXpmaQuXG5mdW5jdGlvbiBzZXRBdHRyKGVsLCBhdHRyLCB2YWwpe1xuICB0cnl7XG4gICAgaWYoKChhdHRyIGluIGVsKSB8fCBhdHRyID09PSAnY2xhc3MnKSl7XG4gICAgICBpZihhdHRyID09PSAnc3R5bGUnICYmIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHZhbCk7XG4gICAgICB9ZWxzZSBpZihhdHRyID09PSAnY2xhc3MnKXtcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gdmFsO1xuICAgICAgfWVsc2V7XG4gICAgICAgIGVsW2F0dHJdID0gdHlwZW9mIGVsW2F0dHJdID09PSAnYm9vbGVhbicgPyB0cnVlIDogdmFsO1xuICAgICAgfVxuICAgIH1cbiAgfWNhdGNoKGUpe31cbiAgLy9jaHJvbWUgc2V0YXR0cmlidXRlIHdpdGggYHt7fX1gIHdpbGwgdGhyb3cgYW4gZXJyb3JcbiAgZWwuc2V0QXR0cmlidXRlKGF0dHIsIHZhbCk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUF0dHIoZWwsIGF0dHIpIHtcbiAgZWwucmVtb3ZlQXR0cmlidXRlKGF0dHIpO1xuICBkZWxldGUgZWxbYXR0cl07XG59IiwiLy9jb21wb25lbnQgYXMgZGlyZWN0aXZlXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcHJpb3JpdHk6IC0xMFxuLCB3YXRjaDogZmFsc2VcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBjb21OYW1lID0gdGhpcy5wYXRoO1xuICAgIHZhciBjb21wb25lbnRzID0gdm0uY29uc3RydWN0b3IuY29tcG9uZW50cztcbiAgICB2YXIgQ29tcCwgY29tcDtcbiAgICB2YXIgZGlycyA9IFtdLCAkZGF0YSA9IHt9O1xuICAgIHZhciBhdHRycztcblxuICAgIGlmKGNvbU5hbWUgaW4gY29tcG9uZW50cykge1xuICAgICAgQ29tcCA9IGNvbXBvbmVudHNbY29tTmFtZV07XG5cbiAgICAgIC8vVE9ET1xuICAgICAgaWYoQ29tcCA9PT0gdm0uY29uc3RydWN0b3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkaXJzID0gdGhpcy5kaXJzO1xuXG4gICAgICBkaXJzID0gZGlycy5maWx0ZXIoZnVuY3Rpb24gKGRpcikge1xuICAgICAgICByZXR1cm4gZGlyLnR5cGUgPT0gJ2F0dHInIHx8IGRpci50eXBlID09ICd3aXRoJztcbiAgICAgIH0pO1xuXG4gICAgICBkaXJzLmZvckVhY2goZnVuY3Rpb24gKGRpcikge1xuICAgICAgICB2YXIgY3VyUGF0aCwgY29tUGF0aDtcblxuICAgICAgICBjdXJQYXRoID0gZGlyLnBhdGg7XG4gICAgICAgIGlmKGRpci50eXBlID09PSAnd2l0aCcgfHwgZGlyLmRpck5hbWUgPT09ICdhdHRyJykge1xuICAgICAgICAgIC8v6L+Z6YeMIGF0dHIg5Y+KIHdpdGgg5oyH5Luk5pWI5p6c5LiA5qC3XG4gICAgICAgICAgY29tUGF0aCA9ICckZGF0YSdcbiAgICAgICAgICB1dGlscy5leHRlbmQoJGRhdGEsIHZtLiRnZXQoY3VyUGF0aCkpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGNvbVBhdGggPSBkaXIuZGlyTmFtZTtcbiAgICAgICAgICAkZGF0YVtjb21QYXRoXSA9IHZtLiRnZXQoY3VyUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL+ebkeWQrOeItue7hOS7tuabtOaWsCwg5ZCM5q2l5pWw5o2uXG4gICAgICAgIHZtLiR3YXRjaChjdXJQYXRoLCBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgaWYoY29tcCl7XG4gICAgICAgICAgICB2YWwgPSBkaXIudGV4dE1hcCA/IGRpci50ZXh0TWFwLmpvaW4oJycpIDogdmFsO1xuICAgICAgICAgICAgY29tcC4kc2V0KGNvbVBhdGgsIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSk7XG5cbiAgICAgIGF0dHJzID0gZWwuYXR0cmlidXRlcztcbiAgICAgIC8v5pmu6YCa5bGe5oCnXG4gICAgICBmb3IodmFyIGkgPSBhdHRycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAkZGF0YVthdHRyc1swXS5ub2RlTmFtZV0gPSBhdHRyc1swXS52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgY29tcCA9IG5ldyBDb21wKHtcbiAgICAgICAgJHRhcmdldDogZWwsXG4gICAgICAgIC8vJHJvb3Q6IHZtLiRyb290LFxuICAgICAgICAkZGF0YTogdXRpbHMuZXh0ZW5kKHt9LCBDb21wLnByb3RvdHlwZS4kZGF0YSwgJGRhdGEpXG4gICAgICB9KTtcblxuICAgICAgLy/nm7TmjqXlsIZjb21wb25lbnQg5L2c5Li65qC55YWD57Sg5pe2LCDlkIzmraXot5/mlrDlrrnlmaggLiRlbCDlvJXnlKhcbiAgICAgIGlmKHZtLiRlbCA9PT0gZWwpIHtcbiAgICAgICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgY29tTmFtZSArICcgbm90IGRlZmluZWQhIElnbm9yZScpO1xuICAgIH1cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgcmVwbGFjZTogdHJ1ZVxyXG4sIGFuY2hvcjogdHJ1ZVxyXG4gIC8vY29udGVudDogZG9tIOWvueixoVxyXG4gIC8vVE9ETyDmjqXmlLbku7vmhI/nsbvlnovlj4LmlbDovazmiJAgZG9tIOWvueixoT9cclxuLCB1cGRhdGU6IGZ1bmN0aW9uKGNvbnRlbnQpIHtcclxuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKVxyXG4gICAgdmFyIHBhcmVudCA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZTtcclxuICAgIG5vZGVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xyXG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobm9kZSk7XHJcbiAgICB9KVxyXG4gICAgY29udGVudCAmJiBwYXJlbnQuaW5zZXJ0QmVmb3JlKGNvbnRlbnQsIHRoaXMuYW5jaG9ycy5lbmQpXHJcbiAgfVxyXG59IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKVxuICA7XG5cbnZhciBkaXJzID0ge307XG5cblxuZGlycy50ZXh0ID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdGhpcy5ub2RlLm5vZGVWYWx1ZSA9IHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgPyAnJyA6IHZhbDtcbiAgfVxufTtcblxuXG5kaXJzLmh0bWwgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5ub2RlcyA9IFtdO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsLmlubmVySFRNTCA9IHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgPyAnJyA6IHZhbDtcblxuICAgIHZhciBub2RlO1xuICAgIHdoaWxlKG5vZGUgPSB0aGlzLm5vZGVzLnBvcCgpKSB7XG4gICAgICBub2RlLnBhcmVudE5vZGUgJiYgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH1cblxuICAgIHZhciBub2RlcyA9IGVsLmNoaWxkTm9kZXM7XG4gICAgd2hpbGUobm9kZSA9IG5vZGVzWzBdKSB7XG4gICAgICB0aGlzLm5vZGVzLnB1c2gobm9kZSk7XG4gICAgICB0aGlzLmVsLmluc2VydEJlZm9yZShub2RlLCB0aGlzLm5vZGUpO1xuICAgIH1cbiAgfVxufTtcblxuXG5kaXJzWydpZiddID0ge1xuICBhbmNob3I6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICB0aGlzLmhpZGUoKTtcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICBpZih2YWwpIHtcbiAgICAgIGlmKCF0aGlzLnN0YXRlKSB7IHRoaXMuc2hvdygpIH1cbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuc3RhdGUpIHsgdGhpcy5oaWRlKCk7IH1cbiAgICB9XG4gICAgdGhpcy5zdGF0ZSA9IHZhbDtcbiAgfVxuXG4sIHNob3c6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcnMuZW5kO1xuXG4gICAgYW5jaG9yLnBhcmVudE5vZGUgJiYgYW5jaG9yLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMuZnJhZywgYW5jaG9yKTtcbiAgfVxuLCBoaWRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSB0aGlzLmdldE5vZGVzKCk7XG5cbiAgICBpZihub2Rlcykge1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IG5vZGVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB0aGlzLmZyYWcuYXBwZW5kQ2hpbGQobm9kZXNbaV0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuZGlycy50ZW1wbGF0ZSA9IHtcbiAgcHJpb3JpdHk6IDEwMDAwXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZWwuY2hpbGROb2Rlc1xuICAgICAgLCBmcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICAgICAgO1xuXG4gICAgd2hpbGUobm9kZXNbMF0pIHtcbiAgICAgIGZyYWcuYXBwZW5kQ2hpbGQobm9kZXNbMF0pO1xuICAgIH1cblxuICAgIHRoaXMuZWwuY29udGVudCA9IGZyYWc7XG5cbiAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKHRoaXMubm9kZU5hbWUsICcnKTtcbiAgfVxufTtcblxuLy/lm77niYfnlKgsIOmBv+WFjeWKoOi9veWkp+aLrOWPt+eahOWOn+Wni+aooeadv+WGheWuuVxuZGlycy5zcmMgPSB7XG4gIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdGhpcy5lbC5zcmMgPSB2YWw7XG4gIH1cbn07XG5cbmRpcnNbJ3dpdGgnXSA9IHt9O1xuXG4vL2RpcnMucGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbC5qcycpO1xuZGlycy5yZXBlYXQgPSByZXF1aXJlKCcuL3JlcGVhdC5qcycpO1xuZGlycy5hdHRyID0gcmVxdWlyZSgnLi9hdHRyLmpzJyk7XG5kaXJzLm1vZGVsID0gcmVxdWlyZSgnLi9tb2RlbC5qcycpO1xuZGlycy5zdHlsZSA9IHJlcXVpcmUoJy4vc3R5bGUuanMnKTtcbmRpcnMub24gPSByZXF1aXJlKCcuL29uLmpzJyk7XG5kaXJzLmNvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJyk7XG5kaXJzLmNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQuanMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpcnM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIGhhc1Rva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKS5oYXNUb2tlblxuICAsIGV2ZW50cyA9IHJlcXVpcmUoJy4uL2V2ZW50LWJpbmQuanMnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0ZW1pbmFsOiB0cnVlXG4sIHByaW9yaXR5OiAxXG4sIGxpbms6IGZ1bmN0aW9uKHZtKSB7XG4gICAgdmFyIGtleVBhdGggPSB0aGlzLnBhdGg7XG4gICAgdmFyIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKGtleVBhdGgpO1xuICAgIHZhciBoZWFkUGF0aCA9IHBhdGhzWzBdO1xuXG4gICAgaWYoIWtleVBhdGgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICAvL1RPRE8g5a6e546w57G75Ly8IC4kZ2V0IOeahCAuJHNldFxuICAgIGlmKHZtLiRwYXJlbnQpIHtcbiAgICAgIGlmICh2bS5fYXNzaWdubWVudHMgJiYgdm0uX2Fzc2lnbm1lbnRzWzBdID09PSBoZWFkUGF0aCkge1xuICAgICAgICBrZXlQYXRoID0gcGF0aHMuc2xpY2UoMSkuam9pbignLicpIHx8ICckZGF0YSc7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdm0gPSB2bS4kcGFyZW50O1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBlbCA9IHRoaXMuZWxcbiAgICAgICwgZXYgPSAnY2hhbmdlJ1xuICAgICAgLCBhdHRyLCB2YWx1ZSA9IGF0dHIgPSAndmFsdWUnXG4gICAgICAsIGFudCA9IHZtXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQoYW50LiRnZXQoa2V5UGF0aCwgZmFsc2UpKS8v55WM6Z2i55qE5Yid5aeL5YC85LiN5Lya6KaG55uWIG1vZGVsIOeahOWIneWni+WAvFxuICAgICAgLCBjcmxmID0gL1xcclxcbi9nLy9JRSA4IOS4iyB0ZXh0YXJlYSDkvJroh6rliqjlsIYgXFxuIOaNouihjOespuaNouaIkCBcXHJcXG4uIOmcgOimgeWwhuWFtuabv+aNouWbnuadpVxuICAgICAgLCBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIHZhciBuZXdWYWwgPSAodmFsIHx8ICcnKSArICcnXG4gICAgICAgICAgICAsIHZhbCA9IGVsW2F0dHJdXG4gICAgICAgICAgICA7XG4gICAgICAgICAgdmFsICYmIHZhbC5yZXBsYWNlICYmICh2YWwgPSB2YWwucmVwbGFjZShjcmxmLCAnXFxuJykpO1xuICAgICAgICAgIGlmKG5ld1ZhbCAhPT0gdmFsKXsgZWxbYXR0cl0gPSBuZXdWYWw7IH1cbiAgICAgICAgfVxuICAgICAgLCBoYW5kbGVyID0gZnVuY3Rpb24oaXNJbml0KSB7XG4gICAgICAgICAgdmFyIHZhbCA9IGVsW3ZhbHVlXTtcblxuICAgICAgICAgIHZhbC5yZXBsYWNlICYmICh2YWwgPSB2YWwucmVwbGFjZShjcmxmLCAnXFxuJykpO1xuICAgICAgICAgIGFudC4kc2V0KGtleVBhdGgsIHZhbCk7XG4gICAgICAgIH1cbiAgICAgICwgY2FsbEhhbmRsZXIgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgaWYoZSAmJiBlLnByb3BlcnR5TmFtZSAmJiBlLnByb3BlcnR5TmFtZSAhPT0gYXR0cikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICAgICAgfVxuICAgICAgLCBpZSA9IHV0aWxzLmllXG4gICAgICA7XG5cbiAgICBzd2l0Y2goZWwudGFnTmFtZSkge1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdmFsdWUgPSBhdHRyID0gJ2lubmVySFRNTCc7XG4gICAgICAgIC8vZXYgKz0gJyBibHVyJztcbiAgICAgIGNhc2UgJ0lOUFVUJzpcbiAgICAgIGNhc2UgJ1RFWFRBUkVBJzpcbiAgICAgICAgc3dpdGNoKGVsLnR5cGUpIHtcbiAgICAgICAgICBjYXNlICdjaGVja2JveCc6XG4gICAgICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnY2hlY2tlZCc7XG4gICAgICAgICAgICAvL0lFNiwgSUU3IOS4i+ebkeWQrCBwcm9wZXJ0eWNoYW5nZSDkvJrmjII/XG4gICAgICAgICAgICBpZihpZSkgeyBldiArPSAnIGNsaWNrJzsgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3JhZGlvJzpcbiAgICAgICAgICAgIGF0dHIgPSAnY2hlY2tlZCc7XG4gICAgICAgICAgICBpZihpZSkgeyBldiArPSAnIGNsaWNrJzsgfVxuICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgZWwuY2hlY2tlZCA9IGVsLnZhbHVlID09PSB2YWwgKyAnJztcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpc1NldERlZmF1dCA9IGVsLmNoZWNrZWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGlmKCFhbnQuJGxhenkpe1xuICAgICAgICAgICAgICBpZignb25pbnB1dCcgaW4gZWwpe1xuICAgICAgICAgICAgICAgIGV2ICs9ICcgaW5wdXQnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vSUUg5LiL55qEIGlucHV0IOS6i+S7tuabv+S7o1xuICAgICAgICAgICAgICBpZihpZSkge1xuICAgICAgICAgICAgICAgIGV2ICs9ICcga2V5dXAgcHJvcGVydHljaGFuZ2UgY3V0JztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1NFTEVDVCc6XG4gICAgICAgIGlmKGVsLm11bHRpcGxlKXtcbiAgICAgICAgICBoYW5kbGVyID0gZnVuY3Rpb24oaXNJbml0KSB7XG4gICAgICAgICAgICB2YXIgdmFscyA9IFtdO1xuICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGVsLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgaWYoZWwub3B0aW9uc1tpXS5zZWxlY3RlZCl7IHZhbHMucHVzaChlbC5vcHRpb25zW2ldLnZhbHVlKSB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbnQuJHNldChrZXlQYXRoLCB2YWxzKTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFscyl7XG4gICAgICAgICAgICBpZih2YWxzICYmIHZhbHMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGVsLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgICBlbC5vcHRpb25zW2ldLnNlbGVjdGVkID0gdmFscy5pbmRleE9mKGVsLm9wdGlvbnNbaV0udmFsdWUpICE9PSAtMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaXNTZXREZWZhdXQgPSBpc1NldERlZmF1dCAmJiAhaGFzVG9rZW4oZWxbdmFsdWVdKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlID0gY2FsbGJhY2s7XG5cbiAgICBldi5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKGUpe1xuICAgICAgZXZlbnRzLnJlbW92ZUV2ZW50KGVsLCBlLCBjYWxsSGFuZGxlcik7XG4gICAgICBldmVudHMuYWRkRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICB9KTtcblxuICAgIC8v5qC55o2u6KGo5Y2V5YWD57Sg55qE5Yid5aeL5YyW6buY6K6k5YC86K6+572u5a+55bqUIG1vZGVsIOeahOWAvFxuICAgIGlmKGVsW3ZhbHVlXSAmJiBpc1NldERlZmF1dCl7XG4gICAgICAgaGFuZGxlcih0cnVlKTtcbiAgICB9XG5cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+S6i+S7tuebkeWQrFxuXG52YXIgZXZlbnRCaW5kID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpO1xuXG4vL1RPRE8g56e76Zmk5pe255qE5oOF5Ya1XG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICAvL3RoaXMuZXZlbnRzID0ge307XG4gICAgdGhpcy52bSA9IHZtO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3RvclswXTtcbiAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3JbMV07XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG5mdW5jdGlvbiBjYWxsSGFuZGxlciAoZGlyLCBzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICB2YXIgZWxzID0gc2VsZWN0b3IgPyBbXS5zbGljZS5jYWxsKGRpci5lbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkgOiBbZS50YXJnZXRdO1xuICAgIHZhciBjdXIgPSBlLnRhcmdldDtcbiAgICBkb3tcbiAgICAgIGlmKGVscy5pbmRleE9mKGN1cikgPj0gMCkge1xuICAgICAgICBlLmRlbGVnYXRlVGFyZ2V0ID0gY3VyOy8v5aeU5omY5YWD57SgXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKGRpci52bSwgZSlcbiAgICAgIH1cbiAgICB9d2hpbGUoY3VyID0gY3VyLnBhcmVudE5vZGUpXG4gIH1cbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgO1xuXG4vL+i/meS6m+aVsOe7hOaTjeS9nOaWueazleiiq+mHjeWGmeaIkOiHquWKqOinpuWPkeabtOaWsFxudmFyIGFycmF5TWV0aG9kcyA9IFsnc3BsaWNlJywgJ3B1c2gnLCAncG9wJywgJ3NoaWZ0JywgJ3Vuc2hpZnQnLCAnc29ydCcsICdyZXZlcnNlJ107XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcmlvcml0eTogMTAwMFxuLCBhbmNob3I6IHRydWVcbiwgdGVybWluYWw6IHRydWVcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICB2YXIgY3N0ciA9IHRoaXMuY3N0ciA9IHZtLmNvbnN0cnVjdG9yO1xuICAgIHRoaXMudm0gPSB2bTtcblxuICAgIHdoaWxlKGNzdHIuX19zdXBlcl9fKXtcbiAgICAgIGNzdHIgPSB0aGlzLmNzdHIgPSBjc3RyLl9fc3VwZXJfXy5jb25zdHJ1Y3RvcjtcbiAgICB9XG5cblxuICAgIHRoaXMuY3VyQXJyID0gW107XG4gICAgdGhpcy5saXN0ID0gW107Ly9be2VsOmVsLCB2bTogdm19XVxuXG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgdmFyIHRoYXQgPSB0aGlzLCBsaXN0ID0gdGhpcy5saXN0O1xuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcbiAgICAgIC8vIOWcqCByZXBlYXQg5oyH5Luk6KGo6L6+5byP5LitXG4gICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5sb2NhbHMuZmlsdGVyKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgcmV0dXJuICF1dGlscy5pc0Z1bmN0aW9uKHRoYXQudm0uJGdldChwYXRoKSlcbiAgICAgIH0pO1xuXG4gICAgICAvL+WIoOmZpOWFg+e0oFxuICAgICAgYXJyRGlmZihjdXJBcnIsIGl0ZW1zKS5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgdmFyIHBvcyA9IGN1ckFyci5pbmRleE9mKGl0ZW0pXG4gICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAxKVxuICAgICAgICBwYXJlbnROb2RlLnJlbW92ZUNoaWxkKGxpc3RbcG9zXS5lbClcbiAgICAgICAgbGlzdC5zcGxpY2UocG9zLCAxKVxuICAgICAgfSlcblxuICAgICAgaXRlbXMuZm9yRWFjaChmdW5jdGlvbihpdGVtLCBpKSB7XG4gICAgICAgIHZhciBwb3MgPSBpdGVtcy5pbmRleE9mKGl0ZW0sIGkpXG4gICAgICAgICAgLCBvbGRQb3MgPSBjdXJBcnIuaW5kZXhPZihpdGVtLCBpKVxuICAgICAgICAgICwgdm0sIGVsXG4gICAgICAgICAgO1xuXG4gICAgICAgIC8vcG9zIDwgMCAmJiAocG9zID0gaXRlbXMubGFzdEluZGV4T2YoaXRlbSwgaSkpO1xuICAgICAgICAvL29sZFBvcyA8IDAgJiYgKG9sZFBvcyA9IGN1ckFyci5sYXN0SW5kZXhPZihpdGVtLCBpKSk7XG5cbiAgICAgICAgLy/mlrDlop7lhYPntKBcbiAgICAgICAgaWYob2xkUG9zIDwgMCkge1xuXG5cbiAgICAgICAgICBlbCA9IHRoaXMuZWwuY2xvbmVOb2RlKHRydWUpXG5cbiAgICAgICAgICB2bSA9IG5ldyB0aGlzLmNzdHIoZWwsIHtcbiAgICAgICAgICAgICRkYXRhOiBpdGVtLCBfYXNzaWdubWVudHM6IHRoaXMuYXNzaWdubWVudHMsICRpbmRleDogcG9zLFxuICAgICAgICAgICAgJHJvb3Q6IHRoaXMudm0uJHJvb3QsICRwYXJlbnQ6IHRoaXMudm0sXG4gICAgICAgICAgICBfX3JlcGVhdDogdHJ1ZVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHZtLiRlbCwgbGlzdFtwb3NdICYmIGxpc3RbcG9zXS5lbCB8fCB0aGlzLmFuY2hvcnMuZW5kKVxuICAgICAgICAgIGxpc3Quc3BsaWNlKHBvcywgMCwge2VsOiBlbCwgdm06IHZtfSk7XG4gICAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDAsIGl0ZW0pXG5cbiAgICAgICAgICAvL+W7tuaXtui1i+WAvOe7mSBgX3JlbGF0aXZlUGF0aGAsIOmBv+WFjeWHuueOsOatu+W+queOr1xuICAgICAgICAgIC8v5aaC5p6c5Zyo5LiK6Z2i5a6e5L6L5YyW5pe25b2T5Y+C5pWw5Lyg5YWlLCDkvJrlhpLms6HliLDniLbnuqcgdm0g6YCS5b2S6LCD55So6L+Z6YeM55qEIHVwZGF0ZSDmlrnms5UsIOmAoOaIkOatu+W+queOry5cbiAgICAgICAgICB2bS5fcmVsYXRpdmVQYXRoID0gdGhpcy5saXN0UGF0aDtcbiAgICAgICAgfWVsc2Uge1xuXG4gICAgICAgICAgLy/osIPluo9cbiAgICAgICAgICBpZiAocG9zICE9PSBvbGRQb3MpIHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3Rbb2xkUG9zXS5lbCwgbGlzdFtwb3NdICYmIGxpc3RbcG9zXS5lbCB8fCB0aGF0LmFuY2hvci5lbmQpXG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShsaXN0W3Bvc10uZWwsIGxpc3Rbb2xkUG9zICsgMV0gJiYgbGlzdFtvbGRQb3MgKyAxXS5lbCB8fCB0aGF0LmFuY2hvci5lbmQpXG4gICAgICAgICAgICBsaXN0W29sZFBvc10gPSBbbGlzdFtwb3NdLCBsaXN0W3Bvc10gPSBsaXN0W29sZFBvc11dWzBdXG4gICAgICAgICAgICBjdXJBcnJbb2xkUG9zXSA9IFtjdXJBcnJbcG9zXSwgY3VyQXJyW3Bvc10gPSBjdXJBcnJbb2xkUG9zXV1bMF1cbiAgICAgICAgICAgIGxpc3RbcG9zXS52bS4kaW5kZXggPSBwb3NcbiAgICAgICAgICAgIGxpc3RbcG9zXS52bS4kdXBkYXRlKCckaW5kZXgnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgICAvL+abtOaWsOe0ouW8lVxuICAgICAgdGhpcy5saXN0LmZvckVhY2goZnVuY3Rpb24oaXRlbSwgaSkge1xuICAgICAgICBpdGVtLnZtLiRpbmRleCA9IGlcbiAgICAgICAgaXRlbS5lbC4kaW5kZXggPSBpXG4gICAgICAgIGl0ZW0udm0uJHVwZGF0ZSgnJGluZGV4JywgZmFsc2UpXG4gICAgICB9KTtcblxuICAgICAgaWYoIWl0ZW1zLl9fYmVlX18pe1xuICAgICAgICAvL+aVsOe7hOaTjeS9nOaWueazlVxuICAgICAgICB1dGlscy5leHRlbmQoaXRlbXMsIHtcbiAgICAgICAgICAkc2V0OiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgICB0aGF0Lmxpc3RbaV0udm0uJHNldChpdGVtKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgICRyZXBsYWNlOiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgICB0aGF0Lmxpc3RbaV0udm0uJHJlcGxhY2UoaXRlbSlcbiAgICAgICAgICB9LFxuICAgICAgICAgICRyZW1vdmU6IGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgICAgIGl0ZW1zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHRoYXQubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgICAgICAgIHRoYXQudm0uJHVwZGF0ZShwYXRoKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgYXJyYXlNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgICAgICAgaXRlbXNbbWV0aG9kXSA9IHV0aWxzLmFmdGVyRm4oaXRlbXNbbWV0aG9kXSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGF0Lmxpc3RQYXRoLmZvckVhY2goZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICAgICAgICB0aGF0LnZtLiR1cGRhdGUocGF0aClcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgICAgIGl0ZW1zLl9fYmVlX18gID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIC8vVE9ETyDmma7pgJrlr7nosaHnmoTpgY3ljoZcbiAgICB9XG4gIH1cbn07XG5cblxuZnVuY3Rpb24gYXJyRGlmZihhcnIxLCBhcnIyKSB7XG4gIHZhciBhcnIyQ29weSA9IGFycjIuc2xpY2UoKTtcbiAgcmV0dXJuIGFycjEuZmlsdGVyKGZ1bmN0aW9uKGVsKSB7XG4gICAgdmFyIHJlc3VsdCwgaW5kZXggPSBhcnIyQ29weS5pbmRleE9mKGVsKVxuICAgIGlmKGluZGV4IDwgMCkge1xuICAgICAgcmVzdWx0ID0gdHJ1ZVxuICAgIH1lbHNle1xuICAgICAgYXJyMkNvcHkuc3BsaWNlKGluZGV4LCAxKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pXG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/moLflvI/mjIfku6RcblxudmFyIGNhbWVsUmVnID0gLyhbQS1aXSkvZztcblxuLy/pu5jorqTljZXkvY3kuLogcHgg55qE5bGe5oCnXG4vL1RPRE8g5b6F5a6M5ZaEXG52YXIgcGl4ZWxBdHRycyA9IFtcbiAgJ3dpZHRoJywnaGVpZ2h0JyxcbiAgJ21hcmdpbicsICdtYXJnaW4tdG9wJywgJ21hcmdpbi1yaWdodCcsICdtYXJnaW4tbGVmdCcsICdtYXJnaW4tYm90dG9tJyxcbiAgJ3BhZGRpbmcnLCAncGFkZGluZy10b3AnLCAncGFkZGluZy1yaWdodCcsICdwYWRkaW5nLWJvdHRvbScsICdwYWRkaW5nLWxlZnQnXG5dXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB1cGRhdGU6IGZ1bmN0aW9uKHN0eWxlcykge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIHN0eWxlU3RyID0gJyc7XG4gICAgdmFyIGRhc2hLZXksIHZhbDtcblxuICAgIGZvcih2YXIga2V5IGluIHN0eWxlcykge1xuICAgICAgdmFsID0gc3R5bGVzW2tleV07XG5cbiAgICAgIGRhc2hLZXkgPSBrZXkucmVwbGFjZShjYW1lbFJlZywgZnVuY3Rpb24gKHVwcGVyQ2hhcikge1xuICAgICAgICByZXR1cm4gJy0nICsgdXBwZXJDaGFyLnRvTG93ZXJDYXNlKCk7XG4gICAgICB9KTtcblxuICAgICAgaWYoIWlzTmFOKHZhbCkgJiYgcGl4ZWxBdHRycy5pbmRleE9mKGRhc2hLZXkpID49IDApIHtcbiAgICAgICAgdmFsICs9ICdweCc7XG4gICAgICB9XG4gICAgICBzdHlsZVN0ciArPSBkYXNoS2V5ICsgJzogJyArIHZhbCArICc7ICc7XG4gICAgfVxuICAgIGlmKGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAvL+iAgSBJRVxuICAgICAgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0Jywgc3R5bGVTdHIpO1xuICAgIH1lbHNle1xuICAgICAgZWwuc2V0QXR0cmlidXRlKCdzdHlsZScsIHN0eWxlU3RyKTtcbiAgICB9XG4gIH1cbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxyXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcclxuXHJcbi8v5aSE55CGICR0YXJnZXQsICAkY29udGVudCwgJHRwbFxyXG4vL3RhcmdldDogZWwg5pu/5o2i55qE55uu5qCHXHJcbmZ1bmN0aW9uIHRwbFBhcnNlKHRwbCwgdGFyZ2V0LCBjb250ZW50KSB7XHJcbiAgdmFyIGVsLCBjb250ZW50c1xyXG4gICAgLCBmcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcclxuICBpZih1dGlscy5pc09iamVjdCh0YXJnZXQpICYmIHRhcmdldC5jaGlsZE5vZGVzKSB7XHJcbiAgICBjb250ZW50ID0gZnJhZztcclxuICAgIGNvbnRlbnRzID0gdGFyZ2V0LmNoaWxkTm9kZXM7XHJcbiAgfWVsc2V7XHJcbiAgICBpZih0eXBlb2YgY29udGVudCA9PSAnc3RyaW5nJykge1xyXG4gICAgICBjb250ZW50cyA9IGNyZWF0ZUVsZW1lbnRCeVRwbChjb250ZW50KVxyXG4gICAgICBjb250ZW50ID0gZnJhZztcclxuICAgIH1cclxuICB9XHJcbiAgaWYoY29udGVudHMpIHtcclxuICAgIHdoaWxlIChjb250ZW50c1swXSkge1xyXG4gICAgICBjb250ZW50LmFwcGVuZENoaWxkKGNvbnRlbnRzWzBdKTtcclxuICAgIH1cclxuICB9XHJcbiAgaWYodXRpbHMuaXNPYmplY3QodHBsKSl7XHJcbiAgICBlbCA9IHRwbDtcclxuICAgIHRwbCA9IGVsLm91dGVySFRNTDtcclxuICB9ZWxzZXtcclxuICAgIGVsID0gY3JlYXRlRWxlbWVudEJ5VHBsKHRwbClbMF1cclxuICB9XHJcbiAgaWYodGFyZ2V0KXtcclxuICAgIHRhcmdldC5wYXJlbnROb2RlICYmIHRhcmdldC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChlbCwgdGFyZ2V0KTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7ZWw6IGVsLCB0cGw6IHRwbCwgY29udGVudDogY29udGVudH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRCeVRwbCh0cGwpIHtcclxuICB2YXIgd3JhcGVyID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gIC8v6Ieq5a6a5LmJ5qCH562+5ZyoIElFOCDkuIvml6DmlYguIOS9v+eUqCBjb21wb25lbnQg5oyH5Luk5pu/5LujXHJcbiAgd3JhcGVyLmlubmVySFRNTCA9IHRwbC50cmltKCk7XHJcbiAgcmV0dXJuIHdyYXBlci5jaGlsZE5vZGVzO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICB0cGxQYXJzZTogdHBsUGFyc2UsXHJcbiAgY3JlYXRlRWxlbWVudEJ5VHBsOiBjcmVhdGVFbGVtZW50QnlUcGxcclxufSIsIihmdW5jdGlvbihyb290KXtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZXhwb3J0cy5yb290ID0gcm9vdDtcbiAgZXhwb3J0cy5kb2N1bWVudCA9IHJvb3QuZG9jdW1lbnQgfHwgcmVxdWlyZSgnanNkb20nKS5qc2RvbSgpO1xuXG59KSgoZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXN9KSgpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgb3BlcmF0b3JzID0ge1xuICAndW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbih2KSB7IHJldHVybiArdjsgfVxuICAsICctJzogZnVuY3Rpb24odikgeyByZXR1cm4gLXY7IH1cbiAgLCAnISc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICF2OyB9XG5cbiAgLCAnWyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdjsgfVxuICAsICd7JzogZnVuY3Rpb24odil7XG4gICAgICB2YXIgciA9IHt9O1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IHYubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHJbdltpXVswXV0gPSB2W2ldWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICAsICd0eXBlb2YnOiBmdW5jdGlvbih2KXsgcmV0dXJuIHR5cGVvZiB2OyB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gbmV3IHYgfVxuICB9XG5cbiwgJ2JpbmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKyByOyB9XG4gICwgJy0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC0gcjsgfVxuICAsICcqJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAqIHI7IH1cbiAgLCAnLyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLyByOyB9XG4gICwgJyUnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICUgcjsgfVxuICAsICc8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8IHI7IH1cbiAgLCAnPic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPiByOyB9XG4gICwgJzw9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8PSByOyB9XG4gICwgJz49JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+PSByOyB9XG4gICwgJz09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PSByOyB9XG4gICwgJyE9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPSByOyB9XG4gICwgJz09PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT09IHI7IH1cbiAgLCAnIT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPT0gcjsgfVxuICAsICcmJic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJiYgcjsgfVxuICAsICd8fCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgfHwgcjsgfVxuXG4gICwgJy4nOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihyKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuICAsICdbJzogZnVuY3Rpb24obCwgcikge1xuICAgICAgaWYodHlwZW9mIHIgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuXG4gICwgJygnOiBmdW5jdGlvbihsLCByKXsgcmV0dXJuIGwuYXBwbHkoY29udGV4dC5sb2NhbHMsIHIpIH1cbiAgLCAnfCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gci5jYWxsKGNvbnRleHQubG9jYWxzLCBsKSB9Ly9maWx0ZXIuIG5hbWV8ZmlsdGVyXG4gICwgJ25ldyc6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgcmV0dXJuIGwgPT09IERhdGUgPyBuZXcgRnVuY3Rpb24oJ3JldHVybiBuZXcgRGF0ZSgnICsgci5qb2luKCcsICcpICsgJyknKSgpIDogbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShsLCByKSk7XG4gICAgfVxuXG4gICwgJ2luJzogZnVuY3Rpb24obCwgcil7XG4gICAgICBpZih0aGlzLmFzc2lnbm1lbnQpIHtcbiAgICAgICAgLy9yZXBlYXRcbiAgICAgICAgcmV0dXJuIHI7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIGwgaW4gcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLCAndGVybmFyeSc6IHtcbiAgICAnPyc6IGZ1bmN0aW9uKGYsIHMsIHQpIHsgcmV0dXJuIGYgPyBzIDogdDsgfVxuICAsICcoJzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZltzXS5hcHBseShmLCB0KSB9XG5cbiAgLy9maWx0ZXIuIG5hbWUgfCBmaWx0ZXIgOiBhcmcyIDogYXJnM1xuICAsICd8JzogZnVuY3Rpb24oZiwgcywgdCl7IHJldHVybiBzLmFwcGx5KGNvbnRleHQubG9jYWxzLCBbZl0uY29uY2F0KHQpKTsgfVxuICB9XG59O1xuXG52YXIgYXJnTmFtZSA9IFsnZmlyc3QnLCAnc2Vjb25kJywgJ3RoaXJkJ11cbiAgLCBjb250ZXh0LCBzdW1tYXJ5LCBzdW1tYXJ5Q2FsbFxuICAsIHBhdGhcbiAgLCBzZWxmXG4gIDtcblxuLy/pgY3ljoYgYXN0XG52YXIgZXZhbHVhdGUgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHZhciBhcml0eSA9IHRyZWUuYXJpdHlcbiAgICAsIHZhbHVlID0gdHJlZS52YWx1ZVxuICAgICwgYXJncyA9IFtdXG4gICAgLCBuID0gMFxuICAgICwgYXJnXG4gICAgLCByZXNcbiAgICA7XG5cbiAgLy/mk43kvZznrKbmnIDlpJrlj6rmnInkuInlhYNcbiAgZm9yKDsgbiA8IDM7IG4rKyl7XG4gICAgYXJnID0gdHJlZVthcmdOYW1lW25dXTtcbiAgICBpZihhcmcpe1xuICAgICAgaWYoQXJyYXkuaXNBcnJheShhcmcpKXtcbiAgICAgICAgYXJnc1tuXSA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJnLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgYXJnc1tuXS5wdXNoKHR5cGVvZiBhcmdbaV0ua2V5ID09PSAndW5kZWZpbmVkJyA/XG4gICAgICAgICAgICBldmFsdWF0ZShhcmdbaV0pIDogW2FyZ1tpXS5rZXksIGV2YWx1YXRlKGFyZ1tpXSldKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGFyZ3Nbbl0gPSBldmFsdWF0ZShhcmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGFyaXR5ICE9PSAnbGl0ZXJhbCcpIHtcbiAgICBpZihwYXRoICYmIHZhbHVlICE9PSAnLicgJiYgdmFsdWUgIT09ICdbJykge1xuICAgICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gICAgfVxuICAgIGlmKGFyaXR5ID09PSAnbmFtZScpIHtcbiAgICAgIHBhdGggPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBzd2l0Y2goYXJpdHkpe1xuICAgIGNhc2UgJ3VuYXJ5JzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Rlcm5hcnknOlxuICAgICAgdHJ5e1xuICAgICAgICByZXMgPSBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpLmFwcGx5KHRyZWUsIGFyZ3MpO1xuICAgICAgfWNhdGNoKGUpe1xuICAgICAgICBzdW1tYXJ5Q2FsbCB8fCBjb25zb2xlLndhcm4oZSk7XG4gICAgICB9XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbGl0ZXJhbCc6XG4gICAgICByZXMgPSB2YWx1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICdhc3NpZ25tZW50JzpcbiAgICAgIHN1bW1hcnkuYXNzaWdubWVudHNbdmFsdWVdID0gdHJ1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICduYW1lJzpcbiAgICAgIHN1bW1hcnkubG9jYWxzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBnZXRWYWx1ZSh2YWx1ZSwgY29udGV4dC5sb2NhbHMpO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2ZpbHRlcic6XG4gICAgICBzdW1tYXJ5LmZpbHRlcnNbdmFsdWVdID0gdHJ1ZTtcbiAgICAgIHJlcyA9IGNvbnRleHQuZmlsdGVyc1t2YWx1ZV07XG4gICAgYnJlYWs7XG4gICAgY2FzZSAndGhpcyc6XG4gICAgICByZXMgPSBjb250ZXh0LmxvY2FsczsvL1RPRE8gdGhpcyDmjIflkJEgdm0g6L+Y5pivIGRpcj9cbiAgICBicmVhaztcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcblxuZnVuY3Rpb24gZ2V0T3BlcmF0b3IoYXJpdHksIHZhbHVlKXtcbiAgcmV0dXJuIG9wZXJhdG9yc1thcml0eV1bdmFsdWVdIHx8IGZ1bmN0aW9uKCkgeyByZXR1cm47IH1cbn1cblxuZnVuY3Rpb24gcmVzZXQoc2NvcGUsIHRoYXQpIHtcbiAgc3VtbWFyeUNhbGwgPSB0cnVlO1xuICBpZihzY29wZSkge1xuICAgIHN1bW1hcnlDYWxsID0gZmFsc2U7XG4gICAgY29udGV4dCA9IHtsb2NhbHM6IHNjb3BlIHx8IHt9LCBmaWx0ZXJzOiBzY29wZS4kZmlsdGVycyB8fCB7fX07XG4gIH1lbHNle1xuICAgIGNvbnRleHQgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge319O1xuICB9XG4gIGlmKHRoYXQpe1xuICAgIHNlbGYgPSB0aGF0O1xuICB9XG5cbiAgc3VtbWFyeSA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fSwgcGF0aHM6IHt9LCBhc3NpZ25tZW50czoge319O1xuICBwYXRoID0gJyc7XG59XG5cbi8v5Zyo5L2c55So5Z+f5Lit5p+l5om+5YC8XG52YXIgZ2V0VmFsdWUgPSBmdW5jdGlvbiAoa2V5LCBzY29wZSkge1xuICBpZihzY29wZS4kZ2V0KSB7XG4gICAgcmV0dXJuIHNjb3BlLiRnZXQoa2V5LCBmYWxzZSlcbiAgfWVsc2V7XG4gICAgcmV0dXJuIHNjb3BlW2tleV1cbiAgfVxufVxuXG4vL+ihqOi+vuW8j+axguWAvFxuLy90cmVlOiBwYXJzZXIg55Sf5oiQ55qEIGFzdFxuLy9zY29wZSDmiafooYznjq/looNcbmV4cG9ydHMuZXZhbCA9IGZ1bmN0aW9uKHRyZWUsIHNjb3BlLCB0aGF0KSB7XG4gIHJlc2V0KHNjb3BlIHx8IHt9LCB0aGF0KTtcblxuICByZXR1cm4gZXZhbHVhdGUodHJlZSk7XG59O1xuXG4vL+ihqOi+vuW8j+aRmOimgVxuLy9yZXR1cm46IHtmaWx0ZXJzOltdLCBsb2NhbHM6W10sIHBhdGhzOiBbXSwgYXNzaWdubWVudHM6IFtdfVxuZXhwb3J0cy5zdW1tYXJ5ID0gZnVuY3Rpb24odHJlZSkge1xuICByZXNldCgpO1xuXG4gIGV2YWx1YXRlKHRyZWUpO1xuXG4gIGlmKHBhdGgpIHtcbiAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgfVxuICBmb3IodmFyIGtleSBpbiBzdW1tYXJ5KSB7XG4gICAgc3VtbWFyeVtrZXldID0gT2JqZWN0LmtleXMoc3VtbWFyeVtrZXldKTtcbiAgfVxuICByZXR1cm4gc3VtbWFyeTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5hZGRFdmVudCA9IGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xuICBpZihlbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlciwgZmFsc2UpO1xuICB9ZWxzZXtcbiAgICBlbC5hdHRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59XG5cbmV4cG9ydHMucmVtb3ZlRXZlbnQgPSBmdW5jdGlvbiByZW1vdmVFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIpO1xuICB9ZWxzZXtcbiAgICBlbC5kZXRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59IiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgRXZlbnQgPSB7XG4gIC8v55uR5ZCs6Ieq5a6a5LmJ5LqL5Lu2LlxuICAkb246IGZ1bmN0aW9uKG5hbWUsIGhhbmRsZXIsIGNvbnRleHQpIHtcbiAgICB2YXIgY3R4ID0gY29udGV4dCB8fCB0aGlzXG4gICAgICA7XG5cbiAgICBjdHguX2hhbmRsZXJzID0gY3R4Ll9oYW5kbGVycyB8fCB7fTtcbiAgICBjdHguX2hhbmRsZXJzW25hbWVdID0gY3R4Ll9oYW5kbGVyc1tuYW1lXSB8fCBbXTtcblxuICAgIGN0eC5faGFuZGxlcnNbbmFtZV0ucHVzaCh7aGFuZGxlcjogaGFuZGxlciwgY29udGV4dDogY29udGV4dCwgY3R4OiBjdHh9KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcbiAgJG9uZTogZnVuY3Rpb24gKG5hbWUsIGhhbmRsZXIsIGNvbnRleHQpIHtcbiAgICBpZihoYW5kbGVyKXtcbiAgICAgIGhhbmRsZXIub25lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMub24obmFtZSwgaGFuZGxlciwgY29udGV4dCk7XG4gIH0sXG4gIC8v56e76Zmk55uR5ZCs5LqL5Lu2LlxuICAkb2ZmOiBmdW5jdGlvbihuYW1lLCBoYW5kbGVyLCBjb250ZXh0KSB7XG4gICAgdmFyIGN0eCA9IGNvbnRleHQgfHwgdGhpc1xuICAgICAgLCBoYW5kbGVycyA9IGN0eC5faGFuZGxlcnNcbiAgICAgIDtcblxuICAgIGlmKG5hbWUgJiYgaGFuZGxlcnNbbmFtZV0pe1xuICAgICAgaWYodXRpbHMuaXNGdW5jdGlvbihoYW5kbGVyKSl7XG4gICAgICAgIGZvcih2YXIgaSA9IGhhbmRsZXJzW25hbWVdLmxlbmd0aCAtIDE7IGkgPj0wOyBpLS0pIHtcbiAgICAgICAgICBpZihoYW5kbGVyc1tuYW1lXVtpXS5oYW5kbGVyID09PSBoYW5kbGVyKXtcbiAgICAgICAgICAgIGhhbmRsZXJzW25hbWVdLnNwbGljZShpLCAxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1lbHNle1xuICAgICAgICBoYW5kbGVyc1tuYW1lXSA9IFtdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcbiAgLy/op6blj5Hoh6rlrprkuYnkuovku7YuXG4gIC8v6K+l5pa55rOV5rKh5pyJ5o+Q5L6b6Z2Z5oCB5YyW55qEIGNvbnRleHQg5Y+C5pWwLiDlpoLopoHpnZnmgIHljJbkvb/nlKgsIOW6lOivpTogYEV2ZW50LnRyaWdnZXIuY2FsbChjb250ZXh0LCBuYW1lLCBkYXRhKWBcbiAgJHRyaWdnZXI6IGZ1bmN0aW9uKG5hbWUsIGRhdGEpIHtcbiAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuICAgICAgLCBoYW5kbGVycyA9IHRoaXMuX2hhbmRsZXJzICYmIHRoaXMuX2hhbmRsZXJzW25hbWVdXG4gICAgICA7XG5cbiAgICBpZihoYW5kbGVycyl7XG4gICAgICBmb3IodmFyIGkgPSAwLCBpdGVtOyBpdGVtID0gaGFuZGxlcnNbaV07IGkrKykge1xuICAgICAgICBpdGVtLmhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgIGlmKGl0ZW0uaGFuZGxlci5vbmUpIHtcbiAgICAgICAgICBoYW5kbGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG4vL0phdmFzY3JpcHQgZXhwcmVzc2lvbiBwYXJzZXIgbW9kaWZpZWQgZm9ybSBDcm9ja2ZvcmQncyBURE9QIHBhcnNlclxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcblx0ZnVuY3Rpb24gRigpIHt9XG5cdEYucHJvdG90eXBlID0gbztcblx0cmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgc291cmNlO1xuXG52YXIgZXJyb3IgPSBmdW5jdGlvbiAobWVzc2FnZSwgdCkge1xuXHR0ID0gdCB8fCB0aGlzO1xuICB2YXIgbXNnID0gbWVzc2FnZSArPSBcIiBCdXQgZm91bmQgJ1wiICsgdC52YWx1ZSArIFwiJ1wiICsgKHQuZnJvbSA/IFwiIGF0IFwiICsgdC5mcm9tIDogXCJcIikgKyBcIiBpbiAnXCIgKyBzb3VyY2UgKyBcIidcIjtcbiAgdmFyIGUgPSBuZXcgRXJyb3IobXNnKTtcblx0ZS5uYW1lID0gdC5uYW1lID0gXCJTeW50YXhFcnJvclwiO1xuXHR0Lm1lc3NhZ2UgPSBtZXNzYWdlO1xuICB0aHJvdyBlO1xufTtcblxudmFyIHRva2VuaXplID0gZnVuY3Rpb24gKGNvZGUsIHByZWZpeCwgc3VmZml4KSB7XG5cdHZhciBjOyAvLyBUaGUgY3VycmVudCBjaGFyYWN0ZXIuXG5cdHZhciBmcm9tOyAvLyBUaGUgaW5kZXggb2YgdGhlIHN0YXJ0IG9mIHRoZSB0b2tlbi5cblx0dmFyIGkgPSAwOyAvLyBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgbGVuZ3RoID0gY29kZS5sZW5ndGg7XG5cdHZhciBuOyAvLyBUaGUgbnVtYmVyIHZhbHVlLlxuXHR2YXIgcTsgLy8gVGhlIHF1b3RlIGNoYXJhY3Rlci5cblx0dmFyIHN0cjsgLy8gVGhlIHN0cmluZyB2YWx1ZS5cblx0dmFyIGY7IC8vVGhlIHJlZ2V4cCBmbGFnLlxuXG5cdHZhciByZXN1bHQgPSBbXTsgLy8gQW4gYXJyYXkgdG8gaG9sZCB0aGUgcmVzdWx0cy5cblxuXHQvLyBNYWtlIGEgdG9rZW4gb2JqZWN0LlxuXHR2YXIgbWFrZSA9IGZ1bmN0aW9uICh0eXBlLCB2YWx1ZSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlIDogdHlwZSxcblx0XHRcdHZhbHVlIDogdmFsdWUsXG5cdFx0XHRmcm9tIDogZnJvbSxcblx0XHRcdHRvIDogaVxuXHRcdH07XG5cdH07XG5cblx0Ly8gQmVnaW4gdG9rZW5pemF0aW9uLiBJZiB0aGUgc291cmNlIHN0cmluZyBpcyBlbXB0eSwgcmV0dXJuIG5vdGhpbmcuXG5cdGlmICghY29kZSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIExvb3AgdGhyb3VnaCBjb2RlIHRleHQsIG9uZSBjaGFyYWN0ZXIgYXQgYSB0aW1lLlxuXHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdHdoaWxlIChjKSB7XG5cdFx0ZnJvbSA9IGk7XG5cblx0XHRpZiAoYyA8PSAnICcpIHsgLy8gSWdub3JlIHdoaXRlc3BhY2UuXG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0fSBlbHNlIGlmICgoYyA+PSAnYScgJiYgYyA8PSAneicpIHx8IChjID49ICdBJyAmJiBjIDw9ICdaJykgfHwgYyA9PT0gJyQnIHx8IGMgPT09ICdfJykgeyAvLyBuYW1lLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmICgoYyA+PSAnYScgJiYgYyA8PSAneicpIHx8IChjID49ICdBJyAmJiBjIDw9ICdaJykgfHxcblx0XHRcdFx0XHQoYyA+PSAnMCcgJiYgYyA8PSAnOScpIHx8IGMgPT09ICdfJykge1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnbmFtZScsIHN0cikpO1xuXHRcdH0gZWxzZSBpZiAoYyA+PSAnMCcgJiYgYyA8PSAnOScpIHtcblx0XHRcdC8vIG51bWJlci5cblxuXHRcdFx0Ly8gQSBudW1iZXIgY2Fubm90IHN0YXJ0IHdpdGggYSBkZWNpbWFsIHBvaW50LiBJdCBtdXN0IHN0YXJ0IHdpdGggYSBkaWdpdCxcblx0XHRcdC8vIHBvc3NpYmx5ICcwJy5cblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cblx0XHRcdC8vIExvb2sgZm9yIG1vcmUgZGlnaXRzLlxuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPCAnMCcgfHwgYyA+ICc5Jykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGEgZGVjaW1hbCBmcmFjdGlvbiBwYXJ0LlxuXHRcdFx0aWYgKGMgPT09ICcuJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdFx0aWYgKGMgPCAnMCcgfHwgYyA+ICc5Jykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIGZvciBhbiBleHBvbmVudCBwYXJ0LlxuXHRcdFx0aWYgKGMgPT09ICdlJyB8fCBjID09PSAnRScpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA9PT0gJy0nIHx8IGMgPT09ICcrJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGMgPCAnMCcgfHwgYyA+ICc5Jykge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIGV4cG9uZW50XCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHR9IHdoaWxlIChjID49ICcwJyAmJiBjIDw9ICc5Jyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgbmV4dCBjaGFyYWN0ZXIgaXMgbm90IGEgbGV0dGVyLlxuXG5cdFx0XHRpZiAoYyA+PSAnYScgJiYgYyA8PSAneicpIHtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0ZXJyb3IoXCJCYWQgbnVtYmVyXCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb252ZXJ0IHRoZSBzdHJpbmcgdmFsdWUgdG8gYSBudW1iZXIuIElmIGl0IGlzIGZpbml0ZSwgdGhlbiBpdCBpcyBhIGdvb2Rcblx0XHRcdC8vIHRva2VuLlxuXG5cdFx0XHRuID0gK3N0cjtcblx0XHRcdGlmIChpc0Zpbml0ZShuKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChtYWtlKCdudW1iZXInLCBuKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHN0cmluZ1xuXG5cdFx0fSBlbHNlIGlmIChjID09PSAnXFwnJyB8fCBjID09PSAnXCInKSB7XG5cdFx0XHRzdHIgPSAnJztcblx0XHRcdHEgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPCAnICcpIHtcblx0XHRcdFx0XHRtYWtlKCdzdHJpbmcnLCBzdHIpO1xuXHRcdFx0XHRcdGVycm9yKGMgPT09ICdcXG4nIHx8IGMgPT09ICdcXHInIHx8IGMgPT09ICcnID9cblx0XHRcdFx0XHRcdFwiVW50ZXJtaW5hdGVkIHN0cmluZy5cIiA6XG5cdFx0XHRcdFx0XHRcIkNvbnRyb2wgY2hhcmFjdGVyIGluIHN0cmluZy5cIiwgbWFrZSgnJywgc3RyKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciB0aGUgY2xvc2luZyBxdW90ZS5cblxuXHRcdFx0XHRpZiAoYyA9PT0gcSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgZXNjYXBlbWVudC5cblxuXHRcdFx0XHRpZiAoYyA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdFx0c3dpdGNoIChjKSB7XG5cdFx0XHRcdFx0Y2FzZSAnYic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcYic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdmJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxmJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ24nOlxuXHRcdFx0XHRcdFx0YyA9ICdcXG4nO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncic6XG5cdFx0XHRcdFx0XHRjID0gJ1xccic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd0Jzpcblx0XHRcdFx0XHRcdGMgPSAnXFx0Jztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3UnOlxuXHRcdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMgPSBwYXJzZUludChjb2RlLnN1YnN0cihpICsgMSwgNCksIDE2KTtcblx0XHRcdFx0XHRcdGlmICghaXNGaW5pdGUoYykgfHwgYyA8IDApIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYyk7XG5cdFx0XHRcdFx0XHRpICs9IDQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXG5cdFx0XHQvLyByZWdleHBcblx0XHR9ZWxzZSBpZihjID09PSAnLycgJiYgZmFsc2Upe1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0c3RyID0gJyc7XG5cdFx0XHRmID0gJyc7XG5cdFx0XHRmb3IoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgY2xvc2Ugc2xhc2hcblxuXHRcdFx0XHRpZihjID09PSAnLycpIHtcblx0XHRcdFx0XHRmb3IoOyA7ICkge1xuXHRcdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkgKyAxKTtcblx0XHRcdFx0XHRcdGlmKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0XHRcdGYgKz0gYztcblx0XHRcdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdFx0fWVsc2V7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmKGMgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHJlZ2V4cFwiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdGMgPSAnXFxcXCcgKyBjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdyZWdleHAnLCBuZXcgUmVnRXhwKHN0ciwgZikpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0Ly8gY29tYmluaW5nXG5cblx0XHR9IGVsc2UgaWYgKHByZWZpeC5pbmRleE9mKGMpID49IDApIHtcblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChpID49IGxlbmd0aCB8fCBzdWZmaXguaW5kZXhPZihjKSA8IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnb3BlcmF0b3InLCBzdHIpKTtcblxuXHRcdFx0Ly8gc2luZ2xlLWNoYXJhY3RlciBvcGVyYXRvclxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgYykpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIG1ha2VfcGFyc2UgPSBmdW5jdGlvbiAodmFycykge1xuXHR2YXJzID0gdmFycyB8fCB7fTsvL+mihOWumuS5ieeahOWPmOmHj1xuXHR2YXIgc3ltYm9sX3RhYmxlID0ge307XG5cdHZhciB0b2tlbjtcblx0dmFyIHRva2Vucztcblx0dmFyIHRva2VuX25yO1xuXHR2YXIgY29udGV4dDtcblxuXHR2YXIgaXRzZWxmID0gZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdHZhciBmaW5kID0gZnVuY3Rpb24gKG4pIHtcblx0XHRuLm51ZCA9IGl0c2VsZjtcblx0XHRuLmxlZCA9IG51bGw7XG5cdFx0bi5zdGQgPSBudWxsO1xuXHRcdG4ubGJwID0gMDtcblx0XHRyZXR1cm4gbjtcblx0fTtcblxuXHR2YXIgYWR2YW5jZSA9IGZ1bmN0aW9uIChpZCkge1xuXHRcdHZhciBhLCBvLCB0LCB2O1xuXHRcdGlmIChpZCAmJiB0b2tlbi5pZCAhPT0gaWQpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgJ1wiICsgaWQgKyBcIicuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuX25yID49IHRva2Vucy5sZW5ndGgpIHtcblx0XHRcdHRva2VuID0gc3ltYm9sX3RhYmxlW1wiKGVuZClcIl07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHQgPSB0b2tlbnNbdG9rZW5fbnJdO1xuXHRcdHRva2VuX25yICs9IDE7XG5cdFx0diA9IHQudmFsdWU7XG5cdFx0YSA9IHQudHlwZTtcblx0XHRpZiAoKGEgPT09IFwib3BlcmF0b3JcIiB8fCBhICE9PSAnc3RyaW5nJykgJiYgdiBpbiBzeW1ib2xfdGFibGUpIHtcblx0XHRcdC8vdHJ1ZSwgZmFsc2Ug562J55u05o6l6YeP5Lmf5Lya6L+b5YWl5q2k5YiG5pSvXG5cdFx0XHRvID0gc3ltYm9sX3RhYmxlW3ZdO1xuXHRcdFx0aWYgKCFvKSB7XG5cdFx0XHRcdGVycm9yKFwiVW5rbm93biBvcGVyYXRvci5cIiwgdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhID09PSBcIm5hbWVcIikge1xuXHRcdFx0byA9IGZpbmQodCk7XG5cdFx0fSBlbHNlIGlmIChhID09PSBcInN0cmluZ1wiIHx8IGEgPT09IFwibnVtYmVyXCIgfHwgYSA9PT0gXCJyZWdleHBcIikge1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVtcIihsaXRlcmFsKVwiXTtcblx0XHRcdGEgPSBcImxpdGVyYWxcIjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXJyb3IoXCJVbmV4cGVjdGVkIHRva2VuLlwiLCB0KTtcblx0XHR9XG5cdFx0dG9rZW4gPSBjcmVhdGUobyk7XG5cdFx0dG9rZW4uZnJvbSA9IHQuZnJvbTtcblx0XHR0b2tlbi50byA9IHQudG87XG5cdFx0dG9rZW4udmFsdWUgPSB2O1xuXHRcdHRva2VuLmFyaXR5ID0gYTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH07XG5cblx0dmFyIGV4cHJlc3Npb24gPSBmdW5jdGlvbiAocmJwKSB7XG5cdFx0dmFyIGxlZnQ7XG5cdFx0dmFyIHQgPSB0b2tlbjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0bGVmdCA9IHQubnVkKCk7XG5cdFx0d2hpbGUgKHJicCA8IHRva2VuLmxicCkge1xuXHRcdFx0dCA9IHRva2VuO1xuXHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0bGVmdCA9IHQubGVkKGxlZnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGVmdDtcblx0fTtcblxuXHR2YXIgb3JpZ2luYWxfc3ltYm9sID0ge1xuXHRcdG51ZCA6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGVycm9yKFwiVW5kZWZpbmVkLlwiLCB0aGlzKTtcblx0XHR9LFxuXHRcdGxlZCA6IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHRlcnJvcihcIk1pc3Npbmcgb3BlcmF0b3IuXCIsIHRoaXMpO1xuXHRcdH1cblx0fTtcblxuXHR2YXIgc3ltYm9sID0gZnVuY3Rpb24gKGlkLCBicCkge1xuXHRcdHZhciBzID0gc3ltYm9sX3RhYmxlW2lkXTtcblx0XHRicCA9IGJwIHx8IDA7XG5cdFx0aWYgKHMpIHtcblx0XHRcdGlmIChicCA+PSBzLmxicCkge1xuXHRcdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzID0gY3JlYXRlKG9yaWdpbmFsX3N5bWJvbCk7XG5cdFx0XHRzLmlkID0gcy52YWx1ZSA9IGlkO1xuXHRcdFx0cy5sYnAgPSBicDtcblx0XHRcdHN5bWJvbF90YWJsZVtpZF0gPSBzO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgY29uc3RhbnQgPSBmdW5jdGlvbiAocywgdiwgYSkge1xuXHRcdHZhciB4ID0gc3ltYm9sKHMpO1xuXHRcdHgubnVkID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy52YWx1ZSA9IHN5bWJvbF90YWJsZVt0aGlzLmlkXS52YWx1ZTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImxpdGVyYWxcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0eC52YWx1ZSA9IHY7XG5cdFx0cmV0dXJuIHg7XG5cdH07XG5cblx0dmFyIGluZml4ID0gZnVuY3Rpb24gKGlkLCBicCwgbGVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQsIGJwKTtcblx0XHRzLmxlZCA9IGxlZCB8fCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oYnApO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBpbmZpeHIgPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCAtIDEpO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBwcmVmaXggPSBmdW5jdGlvbiAoaWQsIG51ZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkKTtcblx0XHRzLm51ZCA9IG51ZCB8fCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gZXhwcmVzc2lvbig3MCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHRzeW1ib2woXCIoZW5kKVwiKTtcblx0c3ltYm9sKFwiKG5hbWUpXCIpO1xuXHRzeW1ib2woXCI6XCIpO1xuXHRzeW1ib2woXCIpXCIpO1xuXHRzeW1ib2woXCJdXCIpO1xuXHRzeW1ib2woXCJ9XCIpO1xuXHRzeW1ib2woXCIsXCIpO1xuXG5cdGNvbnN0YW50KFwidHJ1ZVwiLCB0cnVlKTtcblx0Y29uc3RhbnQoXCJmYWxzZVwiLCBmYWxzZSk7XG5cdGNvbnN0YW50KFwibnVsbFwiLCBudWxsKTtcblx0Y29uc3RhbnQoXCJ1bmRlZmluZWRcIik7XG5cblx0Y29uc3RhbnQoXCJNYXRoXCIsIE1hdGgpO1xuXHRjb25zdGFudChcIkRhdGVcIiwgRGF0ZSk7XG5cdGZvcih2YXIgdiBpbiB2YXJzKSB7XG5cdFx0Y29uc3RhbnQodiwgdmFyc1t2XSk7XG5cdH1cblxuXHRzeW1ib2woXCIobGl0ZXJhbClcIikubnVkID0gaXRzZWxmO1xuXG5cdHN5bWJvbChcInRoaXNcIikubnVkID0gZnVuY3Rpb24gKCkge1xuXHQgIHRoaXMuYXJpdHkgPSBcInRoaXNcIjtcblx0ICByZXR1cm4gdGhpcztcblx0fTtcblxuXHQvL09wZXJhdG9yIFByZWNlZGVuY2U6XG5cdC8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvT3BlcmF0b3JzL09wZXJhdG9yX1ByZWNlZGVuY2VcblxuXHRpbmZpeChcIj9cIiwgMjAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCI6XCIpO1xuXHRcdHRoaXMudGhpcmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXhyKFwiJiZcIiwgMzEpO1xuXHRpbmZpeHIoXCJ8fFwiLCAzMCk7XG5cblx0aW5maXhyKFwiPT09XCIsIDQwKTtcblx0aW5maXhyKFwiIT09XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI9PVwiLCA0MCk7XG5cdGluZml4cihcIiE9XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI8XCIsIDQwKTtcblx0aW5maXhyKFwiPD1cIiwgNDApO1xuXHRpbmZpeHIoXCI+XCIsIDQwKTtcblx0aW5maXhyKFwiPj1cIiwgNDApO1xuXG5cdGluZml4KFwiaW5cIiwgNDUsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGlmIChjb250ZXh0ID09PSAncmVwZWF0Jykge1xuXHRcdFx0Ly8gYGluYCBhdCByZXBlYXQgYmxvY2tcblx0XHRcdGxlZnQuYXJpdHkgPSAnYXNzaWdubWVudCc7XG5cdFx0XHR0aGlzLmFzc2lnbm1lbnQgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIrXCIsIDUwKTtcblx0aW5maXgoXCItXCIsIDUwKTtcblxuXHRpbmZpeChcIipcIiwgNjApO1xuXHRpbmZpeChcIi9cIiwgNjApO1xuXHRpbmZpeChcIiVcIiwgNjApO1xuXG5cdGluZml4KFwiKFwiLCA3MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmIChsZWZ0LmlkID09PSBcIi5cIiB8fCBsZWZ0LmlkID09PSBcIltcIikge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidGVybmFyeVwiO1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQuZmlyc3Q7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGxlZnQuc2Vjb25kO1xuXHRcdFx0dGhpcy50aGlyZCA9IGE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGE7XG5cdFx0XHRpZiAoKGxlZnQuYXJpdHkgIT09IFwidW5hcnlcIiB8fCBsZWZ0LmlkICE9PSBcImZ1bmN0aW9uXCIpICYmXG5cdFx0XHRcdGxlZnQuYXJpdHkgIT09IFwibmFtZVwiICYmIGxlZnQuYXJpdHkgIT09IFwibGl0ZXJhbFwiICYmIGxlZnQuaWQgIT09IFwiKFwiICYmXG5cdFx0XHRcdGxlZnQuaWQgIT09IFwiJiZcIiAmJiBsZWZ0LmlkICE9PSBcInx8XCIgJiYgbGVmdC5pZCAhPT0gXCI/XCIpIHtcblx0XHRcdFx0ZXJyb3IoXCJFeHBlY3RlZCBhIHZhcmlhYmxlIG5hbWUuXCIsIGxlZnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodG9rZW4uaWQgIT09IFwiKVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigwKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIilcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiLlwiLCA4MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRpZiAodG9rZW4uYXJpdHkgIT09IFwibmFtZVwiKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgcHJvcGVydHkgbmFtZS5cIiwgdG9rZW4pO1xuXHRcdH1cblx0XHR0b2tlbi5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdHRoaXMuc2Vjb25kID0gdG9rZW47XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIltcIiwgODAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGFkdmFuY2UoXCJdXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHQvL2ZpbHRlclxuXHRpbmZpeChcInxcIiwgMTAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dmFyIGE7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dG9rZW4uYXJpdHkgPSAnZmlsdGVyJztcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMTApO1xuXHRcdHRoaXMuYXJpdHkgPSAnYmluYXJ5Jztcblx0XHRpZiAodG9rZW4uaWQgPT09ICc6Jykge1xuXHRcdFx0dGhpcy5hcml0eSA9ICd0ZXJuYXJ5Jztcblx0XHRcdHRoaXMudGhpcmQgPSBhID0gW107XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhZHZhbmNlKCc6Jyk7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIjpcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCIhXCIpO1xuXHRwcmVmaXgoXCItXCIpO1xuXHRwcmVmaXgoXCJ0eXBlb2ZcIik7XG5cblx0cHJlZml4KFwiKFwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGUgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiBlO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJbXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJdXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJ7XCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdLFx0biwgdjtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwifVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRuID0gdG9rZW47XG5cdFx0XHRcdGlmIChuLmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBuLmFyaXR5ICE9PSBcImxpdGVyYWxcIikge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIHByb3BlcnR5IG5hbWU6IFwiLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHRcdFx0diA9IGV4cHJlc3Npb24oMCk7XG5cdFx0XHRcdHYua2V5ID0gbi52YWx1ZTtcblx0XHRcdFx0YS5wdXNoKHYpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJ9XCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeCgnbmV3JywgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzkpO1xuXHRcdGlmKHRva2VuLmlkID09PSAnKCcpIHtcblx0XHRcdGFkdmFuY2UoXCIoXCIpO1xuXHRcdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHR9ZWxzZXtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuICAvL3ByZWZpeCgnLycsIGZ1bmN0aW9uKCkge1xuICAvLyAgdmFyIGEgPSBbXSwgbiwgdjtcbiAgLy8gIGlmKHRva2VuLmlkICE9PSAnLycpIHtcbiAgLy8gICAgd2hpbGUodHJ1ZSkge1xuICAvLyAgICAgIG4gPSB0b2tlbjtcbiAgLy8gICAgICBhZHZhbmNlKCk7XG4gIC8vICAgIH1cbiAgLy8gIH1cbiAgLy8gIGFkdmFuY2UoJy8nKTtcbiAgLy8gIHRoaXMuZmlyc3QgPSBhO1xuICAvLyAgcmV0dXJuIHRoaXM7XG4gIC8vfSlcblxuXHQvL19zb3VyY2U6IOihqOi+vuW8j+S7o+eggeWtl+espuS4slxuXHQvL19jb250ZXh0OiDooajovr7lvI/nmoTor63lj6Xnjq/looNcblx0cmV0dXJuIGZ1bmN0aW9uIChfc291cmNlLCBfY29udGV4dCkge1xuICAgIHNvdXJjZSA9IF9zb3VyY2U7XG5cdFx0dG9rZW5zID0gdG9rZW5pemUoX3NvdXJjZSwgJz08PiErLSomfC8lXicsICc9PD4mfCcpO1xuXHRcdHRva2VuX25yID0gMDtcblx0XHRjb250ZXh0ID0gX2NvbnRleHQ7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHZhciBzID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKGVuZClcIik7XG5cdFx0cmV0dXJuIHM7XG5cdH07XG59O1xuXG5leHBvcnRzLnBhcnNlID0gbWFrZV9wYXJzZSgpO1xuIiwidmFyIHRva2VuUmVnID0gL3t7KHsoW159XFxuXSspfXxbXn1cXG5dKyl9fS9nO1xuXG4vL+Wtl+espuS4suS4reaYr+WQpuWMheWQq+aooeadv+WNoOS9jeespuagh+iusFxuZnVuY3Rpb24gaGFzVG9rZW4oc3RyKSB7XG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIHJldHVybiBzdHIgJiYgdG9rZW5SZWcudGVzdChzdHIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRva2VuKHZhbHVlKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgdGV4dE1hcCA9IFtdXG4gICAgLCBzdGFydCA9IDBcbiAgICAsIHZhbCwgdG9rZW5cbiAgICA7XG4gIFxuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICBcbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cbiAgICBcbiAgICB0b2tlbiA9IHtcbiAgICAgIGVzY2FwZTogIXZhbFsyXVxuICAgICwgcGF0aDogKHZhbFsyXSB8fCB2YWxbMV0pLnRyaW0oKVxuICAgICwgcG9zaXRpb246IHRleHRNYXAubGVuZ3RoXG4gICAgLCB0ZXh0TWFwOiB0ZXh0TWFwXG4gICAgfTtcbiAgICBcbiAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcbiAgICBcbiAgICBzdGFydCA9IHRva2VuUmVnLmxhc3RJbmRleDtcbiAgfVxuICBcbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cbiAgXG4gIHRva2Vucy50ZXh0TWFwID0gdGV4dE1hcDtcbiAgXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydHMuaGFzVG9rZW4gPSBoYXNUb2tlbjtcblxuZXhwb3J0cy5wYXJzZVRva2VuID0gcGFyc2VUb2tlbjsiLCJcInVzZSBzdHJpY3RcIjtcblxuLy91dGlsc1xuLy8tLS1cblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnQ7XG5cbnZhciBrZXlQYXRoUmVnID0gLyg/OlxcLnxcXFspL2dcbiAgLCBicmEgPSAvXFxdL2dcbiAgO1xuXG4vL+WwhiBrZXlQYXRoIOi9rOS4uuaVsOe7hOW9ouW8j1xuLy9wYXRoLmtleSwgcGF0aFtrZXldIC0tPiBbJ3BhdGgnLCAna2V5J11cbmZ1bmN0aW9uIHBhcnNlS2V5UGF0aChrZXlQYXRoKXtcbiAgcmV0dXJuIGtleVBhdGgucmVwbGFjZShicmEsICcnKS5zcGxpdChrZXlQYXRoUmVnKTtcbn1cblxuLyoqXG4gKiDlkIjlubblr7nosaFcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2RlZXA9ZmFsc2VdIOaYr+WQpua3seW6puWQiOW5tlxuICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0Li4uXSDmnaXmupDlr7nosaFcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSDlkIjlubblkI7nmoQgdGFyZ2V0IOWvueixoVxuICovXG5mdW5jdGlvbiBleHRlbmQoLyogZGVlcCwgdGFyZ2V0LCBvYmplY3QuLi4gKi8pIHtcbiAgdmFyIG9wdGlvbnNcbiAgICAsIG5hbWUsIHNyYywgY29weSwgY29weUlzQXJyYXksIGNsb25lXG4gICAgLCB0YXJnZXQgPSBhcmd1bWVudHNbMF0gfHwge31cbiAgICAsIGkgPSAxXG4gICAgLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoXG4gICAgLCBkZWVwID0gZmFsc2VcbiAgICA7XG5cbiAgLy8gSGFuZGxlIGEgZGVlcCBjb3B5IHNpdHVhdGlvblxuICBpZiAodHlwZW9mIHRhcmdldCA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBkZWVwID0gdGFyZ2V0O1xuXG4gICAgLy8gc2tpcCB0aGUgYm9vbGVhbiBhbmQgdGhlIHRhcmdldFxuICAgIHRhcmdldCA9IGFyZ3VtZW50c1sgaSBdIHx8IHt9O1xuICAgIGkrKztcbiAgfVxuXG4gIGlmKHV0aWxzLmlzRnVuY3Rpb24oYXJndW1lbnRzW2xlbmd0aCAtIDFdKSkge1xuICAgIGxlbmd0aC0tO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2Ugd2hlbiB0YXJnZXQgaXMgYSBzdHJpbmcgb3Igc29tZXRoaW5nIChwb3NzaWJsZSBpbiBkZWVwIGNvcHkpXG4gIGlmICh0eXBlb2YgdGFyZ2V0ICE9PSBcIm9iamVjdFwiICYmICF1dGlscy5pc0Z1bmN0aW9uKHRhcmdldCkpIHtcbiAgICB0YXJnZXQgPSB7fTtcbiAgfVxuXG4gIGZvciAoIDsgaSA8IGxlbmd0aDsgaSsrICkge1xuICAgIC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICBpZiAoIChvcHRpb25zID0gYXJndW1lbnRzWyBpIF0pICE9IG51bGwgKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG4gICAgICBmb3IgKCBuYW1lIGluIG9wdGlvbnMgKSB7XG4gICAgICAgIC8vYW5kcm9pZCAyLjMgYnJvd3NlciBjYW4gZW51bSB0aGUgcHJvdG90eXBlIG9mIGNvbnN0cnVjdG9yLi4uXG4gICAgICAgIGlmKG9wdGlvbnMuaGFzT3duUHJvcGVydHkobmFtZSkgJiYgbmFtZSAhPT0gJ3Byb3RvdHlwZScpe1xuICAgICAgICAgIHNyYyA9IHRhcmdldFsgbmFtZSBdO1xuICAgICAgICAgIGNvcHkgPSBvcHRpb25zWyBuYW1lIF07XG5cblxuICAgICAgICAgIC8vIFJlY3Vyc2UgaWYgd2UncmUgbWVyZ2luZyBwbGFpbiBvYmplY3RzIG9yIGFycmF5c1xuICAgICAgICAgIGlmICggZGVlcCAmJiBjb3B5ICYmICggdXRpbHMuaXNQbGFpbk9iamVjdChjb3B5KSB8fCAoY29weUlzQXJyYXkgPSB1dGlscy5pc0FycmF5KGNvcHkpKSApICkge1xuXG4gICAgICAgICAgICAvLyBQcmV2ZW50IG5ldmVyLWVuZGluZyBsb29wXG4gICAgICAgICAgICBpZiAoIHRhcmdldCA9PT0gY29weSApIHtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIGNvcHlJc0FycmF5ICkge1xuICAgICAgICAgICAgICBjb3B5SXNBcnJheSA9IGZhbHNlO1xuICAgICAgICAgICAgICBjbG9uZSA9IHNyYyAmJiB1dGlscy5pc0FycmF5KHNyYykgPyBzcmMgOiBbXTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNQbGFpbk9iamVjdChzcmMpID8gc3JjIDoge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5ldmVyIG1vdmUgb3JpZ2luYWwgb2JqZWN0cywgY2xvbmUgdGhlbVxuICAgICAgICAgICAgdGFyZ2V0WyBuYW1lIF0gPSBleHRlbmQoIGRlZXAsIGNsb25lLCBjb3B5KTtcblxuICAgICAgICAgICAgLy8gRG9uJ3QgYnJpbmcgaW4gdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSBpZiAoICF1dGlscy5pc1VuZGVmaW5lZChjb3B5KSApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIC8v5LiA5Lqb5oOF5LiLLCDmr5TlpoIgZmlyZWZveCDkuIvnu5nlrZfnrKbkuLLlr7nosaHotYvlgLzml7bkvJrlvILluLhcbiAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0gY29weTtcbiAgICAgICAgICAgIH1jYXRjaCAoZSkge31cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIG1vZGlmaWVkIG9iamVjdFxuICByZXR1cm4gdGFyZ2V0O1xufVxuXG52YXIgY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAobykge1xuICBmdW5jdGlvbiBGKCkge31cbiAgRi5wcm90b3R5cGUgPSBvO1xuICByZXR1cm4gbmV3IEYoKTtcbn07XG5cblxudmFyIHV0aWxzID0ge1xuICBub29wOiBmdW5jdGlvbiAoKXt9XG4sIGllOiAhIWRvYy5hdHRhY2hFdmVudFxuXG4sIGlzT2JqZWN0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbCAhPT0gbnVsbDtcbiAgfVxuXG4sIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiwgaXNGdW5jdGlvbjogZnVuY3Rpb24gKHZhbCl7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG4gIH1cblxuLCBpc0FycmF5OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYodXRpbHMuaWUpe1xuICAgICAgLy9JRSA5IOWPiuS7peS4iyBJRSDot6jnqpflj6Pmo4DmtYvmlbDnu4RcbiAgICAgIHJldHVybiB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yICsgJycgPT09IEFycmF5ICsgJyc7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpO1xuICAgIH1cbiAgfVxuXG4gIC8v566A5Y2V5a+56LGh55qE566A5piT5Yik5patXG4sIGlzUGxhaW5PYmplY3Q6IGZ1bmN0aW9uIChvKXtcbiAgICBpZiAoIW8gfHwgKHt9KS50b1N0cmluZy5jYWxsKG8pICE9PSAnW29iamVjdCBPYmplY3RdJyB8fCBvLm5vZGVUeXBlIHx8IG8gPT09IG8ud2luZG93KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvL+WHveaVsOWIh+mdoi4gb3JpRm4g5Y6f5aeL5Ye95pWwLCBmbiDliIfpnaLooaXlhYXlh73mlbBcbiAgLy/liY3pnaLnmoTlh73mlbDov5Tlm57lgLzkvKDlhaUgYnJlYWtDaGVjayDliKTmlq0sIGJyZWFrQ2hlY2sg6L+U5Zue5YC85Li655yf5pe25LiN5omn6KGM5YiH6Z2i6KGl5YWF55qE5Ye95pWwXG4sIGJlZm9yZUZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuLCBhZnRlckZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfVxuXG4sIHBhcnNlS2V5UGF0aDogcGFyc2VLZXlQYXRoXG5cbiwgZGVlcFNldDogZnVuY3Rpb24gKGtleVN0ciwgdmFsdWUsIG9iaikge1xuICAgIGlmKGtleVN0cil7XG4gICAgICB2YXIgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKVxuICAgICAgICAsIGN1ciA9IG9ialxuICAgICAgICA7XG4gICAgICBjaGFpbi5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgaSkge1xuICAgICAgICBpZihpID09PSBjaGFpbi5sZW5ndGggLSAxKXtcbiAgICAgICAgICBjdXJba2V5XSA9IHZhbHVlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBpZihjdXIgJiYgY3VyLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBjdXJba2V5XSA9IHt9O1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIGV4dGVuZChvYmosIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuLCBkZWVwR2V0OiBmdW5jdGlvbiAoa2V5U3RyLCBvYmopIHtcbiAgICB2YXIgY2hhaW4sIGN1ciA9IG9iaiwga2V5O1xuICAgIGlmKGtleVN0cil7XG4gICAgICBjaGFpbiA9IHBhcnNlS2V5UGF0aChrZXlTdHIpO1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGNoYWluLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBrZXkgPSBjaGFpbltpXTtcbiAgICAgICAgaWYoY3VyKXtcbiAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjdXI7XG4gIH1cbiwgZXh0ZW5kOiBleHRlbmRcbiwgY3JlYXRlOiBjcmVhdGVcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbHM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gIDtcblxudmFyIGV4dGVuZCA9IHV0aWxzLmV4dGVuZDtcblxuLy/ooajovr7lvI/op6PmnpBcbmZ1bmN0aW9uIGV4UGFyc2UoKSB7XG4gIHZhciBzdW1tYXJ5XG4gICAgLCBkaXIgPSB0aGlzLmRpclxuICAgIDtcblxuICBkaXIucGFyc2UoKTtcblxuICBzdW1tYXJ5ID0gZXZhbHVhdGUuc3VtbWFyeShkaXIuYXN0KTtcbiAgZXh0ZW5kKGRpciwgc3VtbWFyeSk7XG4gIGV4dGVuZCh0aGlzLCBzdW1tYXJ5KTtcbn07XG5cbmZ1bmN0aW9uIFdhdGNoZXIodm0sIGRpcikge1xuICB2YXIgcGF0aCwgc2NvcGUgPSB2bSwgY3VyVm0sIGxvY2FsS2V5LCB3aWxsVXBkYXRlLCBhc3MsIHBhdGhzO1xuXG4gIHRoaXMuZGlyID0gZGlyO1xuICB0aGlzLnZtID0gdm07XG5cbiAgdGhpcy52YWwgPSBOYU47XG5cbiAgdGhpcy5zdGF0ZSA9IFdhdGNoZXIuU1RBVEVfUkVBRFk7XG5cbiAgZXhQYXJzZS5jYWxsKHRoaXMsIGRpci5wYXRoKTtcblxuICBmb3IodmFyIGkgPSAwLCBsID0gdGhpcy5wYXRocy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aCh0aGlzLnBhdGhzW2ldKTtcbiAgICBsb2NhbEtleSA9IHBhdGhzWzBdO1xuXG4gICAgd2hpbGUoc2NvcGUpIHtcbiAgICAgIGN1clZtID0gc2NvcGU7XG4gICAgICBhc3MgPSBzY29wZS5fYXNzaWdubWVudHM7XG5cbiAgICAgIGlmKGFzcyAmJiBhc3MubGVuZ3RoKSB7XG4gICAgICAgIC8v5YW35ZCNIHJlcGVhdFxuICAgICAgICBpZihhc3NbMF0gPT09IGxvY2FsS2V5KSB7XG4gICAgICAgICAgaWYocGF0aHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgIHBhdGhzWzBdID0gJyRkYXRhJztcbiAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHBhdGhzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9ZWxzZSBpZihsb2NhbEtleSA9PT0gJyRpbmRleCcpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfWVsc2UgaWYobG9jYWxLZXkgaW4gc2NvcGUpe1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy/lkJHkuIrmn6Xmib5cbiAgICAgIHNjb3BlID0gc2NvcGUuJHBhcmVudDtcbiAgICB9XG4gICAgcGF0aCA9IHBhdGhzLmpvaW4oJy4nKTtcbiAgICBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0gPSBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0gfHwgW107XG4gICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdLnB1c2godGhpcyk7XG4gIH1cblxuICAvL+ayoeacieWPmOmHjyAvIOWPmOmHj+S4jeWcqOW9k+WJjeS9nOeUqOWfn+eahOihqOi+vuW8j+eri+WNs+axguWAvFxuICAvL2Zvcih2YXIgaSA9IDAsIGwgPSB0aGlzLmxvY2Fscy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgLy8gIGlmKHV0aWxzLmlzT2JqZWN0KHRoaXMudm0uJGRhdGEpICYmICh0aGlzLmxvY2Fsc1tpXSBpbiB0aGlzLnZtLiRkYXRhKSkge1xuICAvLyAgICBicmVhaztcbiAgLy8gIH1cbiAgLy99XG4gIC8vaWYoaSA9PSBsKSB7XG4gIC8vICB3aWxsVXBkYXRlID0gdHJ1ZTtcbiAgLy99XG5cbiAgLy9pZih3aWxsVXBkYXRlIHx8IHRoaXMudm0uX2lzUmVuZGVyZWQpIHtcbiAgICB0aGlzLnVwZGF0ZSgpO1xuICAvL31cbn1cblxuLy9UT0RPXG5leHRlbmQoV2F0Y2hlciwge1xuICBTVEFURV9SRUFEWTogMFxuLCBTVEFURV9DQUxMRUQ6IDFcbn0sIENsYXNzKTtcblxuZnVuY3Rpb24gd2F0Y2hlclVwZGF0ZSAodmFsKSB7XG4gIHRyeXtcbiAgICB0aGlzLmRpci51cGRhdGUodmFsLCB0aGlzLnZhbCk7XG4gICAgdGhpcy52YWwgPSB2YWw7XG4gIH1jYXRjaChlKXtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG59XG5cbmV4dGVuZChXYXRjaGVyLnByb3RvdHlwZSwge1xuICAvL+ihqOi+vuW8j+aJp+ihjFxuICB1cGRhdGU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuICAgICAgLCBuZXdWYWxcbiAgICAgIDtcblxuICAgIG5ld1ZhbCA9IHRoaXMuZGlyLmdldFZhbHVlKHRoaXMudm0pO1xuXG4gICAgaWYobmV3VmFsICYmIG5ld1ZhbC50aGVuKSB7XG4gICAgICAvL2EgcHJvbWlzZVxuICAgICAgbmV3VmFsLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGF0LCB2YWwpO1xuICAgICAgfSk7XG4gICAgfWVsc2V7XG4gICAgICB3YXRjaGVyVXBkYXRlLmNhbGwodGhpcywgbmV3VmFsKTtcbiAgICB9XG5cbiAgICB0aGlzLnN0YXRlID0gV2F0Y2hlci5TVEFURV9DQUxMRUQ7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdhdGNoZXJcbiJdfQ==
