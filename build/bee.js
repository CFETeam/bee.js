(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Bee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var doc = require('./env.js').document
  , utils = require('./utils.js')
  , Class = require('./class.js')
  , Dir = require('./directive.js')
  , Com = require('./component.js')
  , Watcher = require('./watcher.js')

  , dirs = require('./directives')
  , domUtils = require('./dom-utils.js')
  , checkBinding = require('./check-binding.js')
  , scope = require('./scope')
  ;


var isObject = utils.isObject
  , isPlainObject = utils.isPlainObject
  , parseKeyPath = utils.parseKeyPath
  , deepSet = utils.deepSet
  , extend = utils.extend
  , create = utils.create
  ;

//设置 directive 前缀
function setPrefix(newPrefix) {
  if(newPrefix){
    this.prefix = newPrefix;
  }
}

//TODO 清理这个
var mergeProps = {
  $data: 1, $watchers: 1
};

var lifeCycles = {
  $beforeInit: utils.noop
, $afterInit: utils.noop
, $beforeUpdate: utils.noop
, $afterUpdate: utils.noop
, $beforeDestroy: utils.noop
, $afterDestroy: utils.noop
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
    $data: {}
  , $watchers: {}
  , $refs: {}
  , $mixins: []

  , $el: this.$el || null
  , $target: this.$target || null
  , $tpl: this.$tpl || '<div></div>'
  , $content: this.$content || null

  , $parent: null
  , $root: this

    //私有属性/方法
  , _watchers: {}
  , _assignments: null//当前 vm 的别名
  , _relativePath: []
  , __links: []
  , _isRendered: false
  };

  var elInfo;

  var mixins = [defaults].concat(this.$mixins).concat(props.$mixins).concat([props])

  mixins.forEach(function(mixin) {
    var prop;
    for(var propKey in mixin) {
      if(mixin.hasOwnProperty(propKey)) {
        if ((propKey in mergeProps) && isObject(mixin[propKey])) {
          //保持对传入属性的引用
          //mergeProps 中的属性会被默认值扩展
          prop = extend({}, this[propKey], mixin[propKey])
          this[propKey] = extend(mixin[propKey], prop)
        } else if (propKey in lifeCycles) {
          this[propKey] = utils.afterFn(this[propKey], mixin[propKey])
        } else {
          this[propKey] = mixin[propKey];
        }
      }
    }
  }.bind(this))

  isObject(this.$data) && extend(this, this.$data);

  tpl = tpl || this.$tpl;
  elInfo = domUtils.tplParse(tpl, this.$target, this.$content);

  if(this.$el){
    this.$el.appendChild(elInfo.el);
  }else{
    this.$el = elInfo.el;
  }
  this.$tpl = elInfo.tpl;
  this.$content = elInfo.content;

  this.$beforeInit()
  this.$el.bee = this;

  if(this.$content){
    this.__links = checkBinding.walk.call(this.$root, this.$content);
  }
  this.__links = this.__links.concat( checkBinding.walk.call(this, this.$el) );

  for(var key in this.$watchers) {
    this.$watch(key, this.$watchers[key])
  }

  this._isRendered = true;
  this.$afterInit();
}

//静态属性
extend(Bee, {extend: utils.afterFn(Class.extend, utils.noop, function(sub) {
  //每个构造函数都有自己的 directives ,components, filters 引用
  sub.directives = extend(create(this.directives), sub.directives);
  sub.components = extend(create(this.components), sub.components);
  sub.filters = extend(create(this.filters), sub.filters);
}), utils: utils}, Dir, Com, {
  setPrefix: setPrefix
, prefix: ''
, doc: doc
, directives: {}
, components: {}
, defaults: {}
, filters: {
    //build in filter
    json: function(obj, replacer, space) {
      return JSON.stringify(obj, replacer, space) }
  }
, filter: function(filterName, filter) {
    this.filters[filterName] = filter;
  }
, mount: function(id, props) {
    var el = id.nodeType ? id : doc.getElementById(id);
    var Comp = this.getComponent(el.tagName.toLowerCase());
    var instance;
    props = props || {};
    if(Comp) {
      props.$data = extend(domUtils.getAttrs(el), props.$data)
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
extend(Bee.prototype, lifeCycles, {
  /**
   * 获取属性/方法--
   * @param {String} expression 路径/表达式
   * @returns {*}
   */
  $get: function(expression) {
    var dir = new Dir('$get', {
      path: expression
    , watch: false
    });
    dir.parse();
    return dir.getValue(this, false)
  }

  /**
   * ### bee.$set
   * 更新合并 `.data` 中的数据. 如果只有一个参数, 那么这个参数将并入 .$data
   * @param {String} [key] 数据路径.
   * @param {AnyType|Object} val 数据内容.
   */
, $set: function(key, val) {
    var add, keys, hasKey = false;
    var reformed, reKey, reVm = this;

    if(arguments.length === 1){
      if(isObject(key)) {
        extend(this.$data, key);
        extend(this, key);
      }else{
        this.$data = key;
      }
    }else{
      hasKey = true;
      reformed = scope.reformScope(this, key)
      reKey = reformed.path;
      reVm = reformed.vm;
      keys = parseKeyPath(reKey);
      add = deepSet(reKey, val, {});
      if(keys[0] === '$data') {
        add = add.$data
      }
      if(isObject(reVm.$data)) {
        extend(true, reVm.$data, add);
        extend(true, reVm, add);
      }else{
        reVm.$data = add;
      }
    }
    hasKey ? update.call(reVm, reKey, val) : update.call(reVm, key);
  }
  /**
   * 数据替换
   */
, $replace: function (key, val) {
    var keys, last, hasKey = false;
    var reformed, reKey, reVm = this;

    if(arguments.length === 1){
      val = key;
      reKey = '$data';
      keys = [reKey];
    }else{
      hasKey = true;
      reformed = scope.reformScope(this, key)
      reKey = reformed.path;
      reVm = reformed.vm;
      keys = parseKeyPath(reKey);
    }

    last = reVm.$get(reKey);

    if (keys[0] === '$data') {
      if(reKey === '$data') {
        if(isObject(this.$data)) {
          Object.keys(this.$data).forEach(function (k) {
            delete this[k];
          }.bind(this))
        }
        extend(reVm, val);
      }else {
        deepSet(keys.shift().join('.'), val, reVm)
      }
    } else {
      deepSet(reKey, val, reVm.$data);
    }
    deepSet(reKey, val, reVm)

    hasKey ? update.call(reVm, reKey, extend({}, last, val)) : update.call(reVm, extend({}, last, val));
  }
  /**
   * 手动更新某部分数据
   * @param {String} keyPath 指定更新数据的 keyPath
   * @param {Boolean} [isBubble=true] 是否更新 keyPath 的父级
   */
, $update: function (keyPath, isBubble) {
    isBubble = isBubble !== false;

    var keys = parseKeyPath(keyPath.replace(/^\$data\./, '')), key;
    var watchers;

    while(key = keys.join('.')) {
      watchers = this._watchers[key] || [];

      for (var i = 0, l = watchers.length; i < l; i++) {
        watchers[i].update();
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

    //同时更新子路径
    Watcher.getWatchers(this, keyPath).forEach(function(watcher) {
      watcher.update();
    }.bind(this))

    //数组冒泡的情况
    if(isBubble) {
      if(this.$parent) {
        //同步更新父 vm 对应部分
        this._relativePath.forEach(function (path) {
          this.$parent.$update(path);
        }.bind(this))
      }
    }
  }
, $watch: function (expression, callback, immediate) {
    if(callback) {
      var update = callback.bind(this);
      update._originFn = callback;
      return Watcher.addWatcher.call(this, new Dir('$watch', {path: expression, update: update, immediate : !!immediate}))
    }
  }
, $unwatch: function (expression, callback) {
    Watcher.unwatch(this, expression, callback)
  }
  //销毁当前实例
, $destroy: function(removeEl) {
    this.$beforeDestroy()
    this.__links.forEach(function(wacher) {
      wacher.unwatch()
    })
    removeEl && this.$el.parentNode && this.$el.parentNode.removeChild(this.$el)
    this.__links = [];
    this.$afterDestroy()
  }
});

function update (keyPath, data) {
  var keyPaths;
  this.$beforeUpdate(this.$data)
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
  this.$afterUpdate(this.$data)
}

Bee.version = '0.4.1';

module.exports = Bee;

},{"./check-binding.js":3,"./class.js":4,"./component.js":5,"./directive.js":6,"./directives":10,"./dom-utils.js":16,"./env.js":17,"./scope":21,"./utils.js":23,"./watcher.js":24}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
"use strict";

var Watcher = require('./watcher')
  , token = require('./token.js')
  , utils = require('./utils')
  , doc = require('./env.js').document
  ;

var NODETYPE = {
    ELEMENT: 1
  , ATTR: 2
  , TEXT: 3
  , COMMENT: 8
  , FRAGMENT: 11
};

doc.createElement('template')

/**
 * 遍历 dom 树
 * @private
 * @param {Element|NodeList} el
 * @returns {Array} 节点下所有的绑定
 */

function walk(el) {
  var watchers = [], dirResult;
  if(el.nodeType === NODETYPE.FRAGMENT) {
    el = el.childNodes;
  }

  if(('length' in el) && utils.isUndefined(el.nodeType)){
    //node list
    //对于 nodelist 如果其中有包含 {{text}} 直接量的表达式, 文本节点会被分割, 其节点数量可能会动态增加
    for(var i = 0; i < el.length; i++) {
      watchers = watchers.concat( walk.call(this, el[i]) );
    }
    return watchers;
  }

  switch (el.nodeType) {
    case NODETYPE.ELEMENT:
      break;
    case NODETYPE.COMMENT:
      //注释节点
      return watchers;
      break;
    case NODETYPE.TEXT:
      //文本节点
      watchers = watchers.concat( checkText.call(this, el) );
      return watchers;
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

  dirResult = checkAttr.call(this, el);
  watchers = watchers.concat(dirResult.watchers)
  if(dirResult.terminal){
    return watchers;
  }

  if(el.nodeName.toLowerCase() === 'template') {
    watchers = watchers.concat( walk.call(this, el.content) )
  }

  for(var child = el.firstChild, next; child; ){
    next = child.nextSibling;
    watchers = watchers.concat( walk.call(this, child) );
    child = next;
  }

  return watchers
}

//遍历属性
function checkAttr(el) {
  var cstr = this.constructor
    , dirs = cstr.directive.getDirs(el, cstr)
    , dir
    , terminalPriority, watchers = []
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

    watchers = watchers.concat( setBinding.call(this, dir) );

    if(dir.terminal) {
      result.terminal = true;
      terminalPriority = dir.priority;
    }
  }

  result.watchers = watchers

  return result
}

//处理文本节点中的绑定占位符({{...}})
function checkText(node) {
  var watchers = [];
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
        watchers = watchers.concat(checkText.call(this, tn));
      }.bind(this));
      el.removeChild(node);
    }else{
      t = tokens[0];
      //内置各占位符处理.
      dir = utils.create(t.escape ? dirs.text : dirs.html);
      watchers = setBinding.call(this, utils.extend(dir, t, {
        el: node
      }));
    }
  }
  return watchers
}

function setBinding(dir) {
  var watcher
  if(dir.replace) {
    var el = dir.el;
    if(utils.isFunction(dir.replace)) {
      dir.node = dir.replace();
    }else{
      dir.node = doc.createTextNode('');
    }

    dir.el = dir.el.parentNode;
    dir.el.replaceChild(dir.node, el);
  }

  dir.vm = this;
  dir.link();

  watcher = Watcher.addWatcher.call(this, dir)
  return watcher ? [watcher] : []
}

function unBinding(watchers) {
  watchers.forEach(function(watcher) {
    watcher.unwatch()
  })
}

module.exports = {
  walk: walk,
  unBinding: unBinding
};

},{"./env.js":17,"./token.js":22,"./utils":23,"./watcher":24}],4:[function(require,module,exports){
var extend = require('./utils.js').extend;

var Class = {
  /**
   * 构造函数继承.
   * 如: `var Car = Bee.extend({drive: function(){}}); new Car();`
   * @param {Object} [protoProps] 子构造函数的扩展原型对象
   * @param {Object} [staticProps] 子构造函数的扩展静态属性
   * @returns {Function} 子构造函数
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

},{"./utils.js":23}],5:[function(require,module,exports){
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

/**
 * 查询某构造函数下的注册组件
 * @parm {String} componentName
 */
function getComponent(componentName) {
  var paths = utils.parseKeyPath(componentName);
  var CurCstr = this;
  paths.forEach(function(comName) {
    CurCstr = CurCstr && CurCstr.components[comName];
  });
  return CurCstr || null;
}

exports.tag = exports.component = tag;
exports.getComponent = getComponent;

},{"./utils.js":23}],6:[function(require,module,exports){
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

var astCache = {};

Directive.prototype = {
  priority: 0//权重
, type: '' //指令类型
, subType: '' //子类型. 比如 `b-on-click` 的 type 为 `on`, subType 为 `click`
, sub: false //是否允许子类型指令
, link: utils.noop//初始化方法
, unLink: utils.noop//销毁回调
, update: utils.noop//更新方法
, tearDown: utils.noop
, terminal: false//是否终止
, replace: false//是否替换当前元素. 如果是, 将用一个空的文本节点替换当前元素
, watch: true//是否监控 key 的变化. 如果为 false 的话, update 方法默认只会在初始化后调用一次
, immediate: true //是否在 dir 初始化时立即执行 update 方法

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
    var cache = astCache[this.path]
    if(cache && cache._type === this.type){
      this.ast = cache
    }else {
      try {
        this.ast = parse(this.path, this.type);
        this.ast._type = this.type;
        astCache[this.path] = this.ast;
      } catch (e) {
        this.ast = {};
        e.message = 'SyntaxError in "' + this.path + '" | ' + e.message;
        console.error(e);
      }
    }
  }
  //表达式求值
  //forgive[true]: 是否将 undefined 及 null 转为空字符
, getValue: function(scope, forgive) {
    forgive = forgive !== false;
    var val;

    try{
      val = evaluate.eval(this.ast, scope, this);
    }catch(e){
      val = '';
      console.error(e);
    }
    if(forgive && (utils.isUndefined(val) || val === null)) {
      val = '';
    }
    return val;
  }
};

var attrPostReg = /\?$/;

/**
 * 获取一个元素上所有用 HTML 属性定义的指令
 * @param  {Element} el   指令所在元素
 * @param  {Bee} cstr 组件构造函数
 * @return {directeve[]}      `el` 上所有的指令
 */
function getDirs(el, cstr){
  var attr, attrName, dirName, proto
    , dirs = [], dir, anchors = {}
    , parent = el.parentNode
    , nodeName = el.nodeName.toLowerCase()
    , directives = cstr.directives
    , prefix = cstr.prefix
    ;

  //对于自定义标签, 将其转为 directive
  if(cstr.getComponent(nodeName)) {
    el.setAttribute(prefix + 'component', nodeName);
  }

  for(var i = el.attributes.length - 1; i >= 0; i--){
    attr = el.attributes[i];
    attrName = attr.nodeName;
    dirName = attrName.slice(prefix.length);
    proto = {el: el, node: attr, nodeName: attrName, path: attr.value};
    dir = null;

    if(attrName.indexOf(prefix) === 0 && (dir = getDir(dirName, directives))) {
      //指令
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

function getDir(dirName, dirs) {
  var dir, subType;
  for(var key in dirs) {
    if(dirName === key){
      dir = dirs[key]
      break
    }else if(dirName.indexOf(key + '-') === 0){
      dir = dirs[key]
      if(!dir.sub){
        dir = null
      }else{
        subType = dirName.slice(key.length + 1)
      }
      break;
    }
  }
  if(dir) {
    dir = create(dir);
    dir.subType = subType;
  }
  return dir;
}

Directive.directive = directive;
directive.getDirs = getDirs;

module.exports = Directive;

},{"./env.js":17,"./eval.js":18,"./parse.js":20,"./token.js":22,"./utils.js":23}],7:[function(require,module,exports){
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
}
},{"../utils.js":23}],8:[function(require,module,exports){
//component as directive
var utils = require('../utils.js');
var domUtils = require('../dom-utils')


module.exports = {
  priority: -1
, watch: false
, unLink: function() {
    this.component && this.component.$destroy()
  }
, link: function() {
    var vm = this.vm;
    var el = this.el;
    var cstr = vm.constructor;
    var comp;
    //var refName;
    var dirs = [], $data = {};
    var Comp = cstr.getComponent(this.path)

    if(Comp) {

      //TODO
      if(Comp === cstr) {
        return;
      }

      dirs = this.dirs;

      dirs = dirs.filter(function (dir) {
        // if(dir.type === 'ref') {
        //   refName = dir.path;
        // }
        return dir.type == 'attr' || dir.type == 'with';
      });

      dirs.forEach(function (dir) {
        var curPath, comPath;

        curPath = dir.path;
        if(dir.type === 'with') {
          //comPath = '$data'
          utils.extend($data, vm.$get(curPath))
        }else{
          comPath = dir.dirName;
          $data[comPath] = vm.$get(curPath);
        }

        //监听父组件更新, 同步数据
        vm.$watch(curPath, function (val) {
          if(comp){
            val = dir.textMap ? dir.textMap.join('') : val;
            comPath ? comp.$set(comPath, val) : comp.$set(val);
          }
        })
      });

      this.component = comp = new Comp({
        $target: el,
        //$root: vm.$root,
        $data: utils.extend({}, Comp.prototype.$data, $data, domUtils.getAttrs(el))
      });
      el.bee = comp;

      // if(refName) {
      //   vm.$refs[refName] = comp;
      // }

      //直接将component 作为根元素时, 同步跟新容器 .$el 引用
      if(vm.$el === el) {
        vm.__ref = comp;
        vm.$el = comp.$el;
      }
      return comp;
    }else{
      console.warn('Component: ' + this.path + ' not defined! Ignore');
    }
  }
};

},{"../dom-utils":16,"../utils.js":23}],9:[function(require,module,exports){
"use strict";

var domUtils = require('../dom-utils')
  , checkBinding = require('../check-binding')
  ;

module.exports = {
  replace: true
, anchor: true
, link: function() {
    this.watchers = [];
  }
, unLink: function() {
    this.watchers.forEach(function(watcher) {
      watcher.unwatch()
    });
  }
, update: function(tpl) {
    var nodes = this.getNodes()
    var parent = this.anchors.end.parentNode

    nodes.forEach(function(node) {
      parent.removeChild(node);
    });

    this.unLink();

    var content = domUtils.createContent(tpl)

    this.watchers = checkBinding.walk.call(this.vm, content)
    parent.insertBefore(content, this.anchors.end)
  }
}

},{"../check-binding":3,"../dom-utils":16}],10:[function(require,module,exports){
"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  , checkBinding = require('../check-binding')
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
, terminal: true
, link: function() {
    this.watchers = [];
    if(this.el.content) {
      this.frag = this.el.content;
      this.el.parentNode.removeChild(this.el);
    }else{
      this.frag = doc.createDocumentFragment()
      this.remove();
    }
  }
, update: function(val) {
    if(val) {
      if(!this.state) { this.add() }
    }else{
      if(this.state) { this.remove(); }
    }
    this.state = val;
  }

, add: function() {
    var anchor = this.anchors.end;
    this.watchers = checkBinding.walk.call(this.vm, this.frag);
    anchor.parentNode && anchor.parentNode.insertBefore(this.frag, anchor);
  }
, remove: function() {
    var nodes = this.getNodes();

    if(nodes) {
      for(var i = 0, l = nodes.length; i < l; i++) {
        this.frag.appendChild(nodes[i]);
      }
    }
    this.watchers.forEach(function(watcher) {
      watcher.unwatch()
    })
    this.watcher = [];
  }
};

//图片用, 避免加载 URL 中带有大括号的原始模板内容
dirs.src = {
  update: function(val) {
    this.el.src = val;
  }
};

dirs['with'] = {};

dirs.repeat = require('./repeat.js');
dirs.attr = require('./attr.js');
dirs.model = require('./model.js');
dirs.style = require('./style.js');
dirs.on = require('./on.js');
dirs.component = require('./component.js');
dirs.content = require('./content.js')
dirs.ref = require('./ref.js')

module.exports = dirs;

},{"../check-binding":3,"../env.js":17,"../utils.js":23,"./attr.js":7,"./component.js":8,"./content.js":9,"./model.js":11,"./on.js":12,"./ref.js":13,"./repeat.js":14,"./style.js":15}],11:[function(require,module,exports){
"use strict";

var utils = require('../utils.js')
  , hasToken = require('../token.js').hasToken
  , events = require('../event-bind.js')
  ;

var linkers = {
  input: {
    set: function() {

    }
  , get: function() {

    }
  }
}

module.exports = {
  teminal: true
, priority: 1
, link: function() {
    var keyPath = this.path;
    var vm = this.vm;

    if(!keyPath) { return false; }

    var el = this.el
      , ev = 'change'
      , attr, value = attr = 'value'
      , isSetDefaut = utils.isUndefined(vm.$get(keyPath))//界面的初始值不会覆盖 model 的初始值
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
          vm.$set(keyPath, val);
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
            if(!vm.$lazy){
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
            vm.$replace(keyPath, vals);
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

},{"../event-bind.js":19,"../token.js":22,"../utils.js":23}],12:[function(require,module,exports){
"use strict";

//事件监听

var eventBind = require('../event-bind.js');
var utils = require('../utils')

module.exports = {
  watch: false
, sub: true
, immediate: false // watch 和 immediate 同时为 false 时, 指令的 update 方法将不会自动被外部调用
, link: function() {
    var dir = this;
    if(this.subType){
      // be-on-click 等
      eventBind.addEvent(this.el, this.subType, function() {
        dir.vm.$get(dir.path)
      })
    }else{
      //link 方法的调用在 watcher 检测 immediate 之前,
      //所以可以在这里将 immediate 置为 true 以便自动调用 update 方法
      this.immediate = true;
      //this.update(this.vm.$get(this.path))
    }
  }
, update: function (events) {
    var selector, eventType;
    for(var name in events) {
      selector = name.split(/\s+/);
      eventType = selector.shift();
      selector = selector.join(' ');
      eventBind.addEvent(this.el, eventType, callHandler(this, selector, events[name]));
    }
  }
}

//委托事件
//要求 IE8+
function callHandler (dir, selector, callback) {
  return function(e) {
    var cur = e.target || e.srcElement;
    var els = selector ? utils.toArray(dir.el.querySelectorAll(selector)) : [cur];
    do{
      if(els.indexOf(cur) >= 0) {
        e.delegateTarget = cur;//委托元素
        return callback.call(dir.vm, e)
      }
    }while(cur = cur.parentNode)
  }
}

},{"../event-bind.js":19,"../utils":23}],13:[function(require,module,exports){

var utils = require('../utils')

module.exports = {
  watch: false
, priority: -2 // ref 应该在 component 之后
, unLink: function() {
    if(utils.isArray(this.ref)) {
      this.ref.splice(this.vm.$index, 1)
    }else{
      this.vm.$refs[this.path] = null;
    }
  }
, link: function() {
    var vm = this.vm
    //在 `repeat` 元素上的 `ref` 会指向匿名 `viewmodel`
    if(vm.__repeat){
      if(!vm.$index) {
        vm.$parent.$refs[this.path] = [];
      }
      this.ref = vm.$parent.$refs[this.path]
      this.ref[vm.$index] = vm;
    }else{
      vm.$refs[this.path] = this.el.bee || this.el;
    }
  }
}

},{"../utils":23}],14:[function(require,module,exports){
"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  , scope = require('../scope')
  ;

//这些数组操作方法被重写成自动触发更新
var arrayMethods = ['splice', 'push', 'pop', 'shift', 'unshift', 'sort', 'reverse'];

module.exports = {
  priority: 1000
, anchor: true
, terminal: true
, unLink: function(){
    this.vmList.forEach(function(vm){
      vm.$destroy()
    })
  }
, link: function() {
    var cstr = this.cstr = this.vm.constructor;

    while(cstr.__super__){
      cstr = cstr.__super__.constructor;
    }

    this.trackId = this.el.getAttribute('track-by')
    this.el.removeAttribute('track-by')

    //只继承静态的默认参数
    this.cstr = cstr.extend({}, this.cstr)

    this.curArr = [];
    this.vmList = [];//子 VM list

    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    var that = this, list = this.vmList;
    var trackId = this.trackId;

    if(utils.isArray(items)) {
      // 在 repeat 指令表达式中相关变量
      this.listPath = this.summary.paths.filter(function(path) {
        return !utils.isFunction(that.vm.$get(path))
      });

      //删除元素
      arrDiff(curArr, items, trackId).forEach(function(item) {
        var pos = indexByTrackId(item, curArr, trackId)
        curArr.splice(pos, 1)
        parentNode.removeChild(list[pos].$el)
        list[pos].$destroy()
        list.splice(pos, 1)
      })

      items.forEach(function(item, i) {
        var pos = indexByTrackId(item, items, trackId, i)
          , oldPos = indexByTrackId(item, curArr, trackId, i)
          , vm, el
          ;

        //pos < 0 && (pos = items.lastIndexOf(item, i));
        //oldPos < 0 && (oldPos = curArr.lastIndexOf(item, i));

        //新增元素
        if(oldPos < 0) {

          el = this.el.cloneNode(true)

          vm = new this.cstr(el, {
            $data: item, _assignments: this.summary.assignments, $index: pos,
            $root: this.vm.$root, $parent: this.vm,
            __repeat: true
          });
          parentNode.insertBefore(vm.$el, list[pos] && list[pos].$el || this.anchors.end)
          list.splice(pos, 0, vm);
          curArr.splice(pos, 0, item)

          //延时赋值给 `_relativePath`, 避免出现死循环
          //如果在上面实例化时当参数传入, 会冒泡到父级 vm 递归调用这里的 update 方法, 造成死循环.
          vm._relativePath = this.listPath;
        }else {

          //调序
          if (pos !== oldPos) {
            parentNode.insertBefore(list[oldPos].$el, list[pos] && list[pos].$el || that.anchors.end)
            parentNode.insertBefore(list[pos].$el, list[oldPos + 1] && list[oldPos + 1].$el || that.anchors.end)
            list[oldPos] = [list[pos], list[pos] = list[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
            list[pos].$index = pos
            list[pos].$update('$index')
          }
        }
      }.bind(this))

      //更新索引
      list.forEach(function(vm, i) {
        vm.$index = i
        vm.$el.$index = i
        vm.$update('$index', false)
      });

      this.summary.paths.forEach(function(localKey) {
        var local = that.vm.$get(localKey);
        var dirs = local.__dirs__;
        if(utils.isArray(local)) {
          if(!dirs){
            //数组操作方法
            utils.extend(local, {
              $set: function(i, item) {
                local.splice(i, 1, utils.isObject(item) ? utils.extend({}, local[i], item) : item)
              },
              $replace: function(i, item) {
                local.splice(i, 1, item)
              },
              $remove: function(i) {
                local.splice(i, 1);
              }
            });
            arrayMethods.forEach(function(method) {
              local[method] = utils.afterFn(local[method], function() {
                dirs.forEach(function(dir) {
                  dir.listPath.forEach(function(path) {
                    var reformed = scope.reformScope(dir.vm, path)
                    reformed.vm.$update(reformed.path)
                  })
                })
              })
            });
            dirs = local.__dirs__  = [];
          }
          //一个数组多处使用
          //TODO 移除时的情况
          if(dirs.indexOf(that) === -1) {
            dirs.push(that)
          }
        }
      })

    }else{
      //TODO 普通对象的遍历
    }
  }
};


function arrDiff(arr1, arr2, trackId) {
  var arr2Copy = arr2.slice();
  return arr1.filter(function(el) {
    var result, index = indexByTrackId(el, arr2Copy, trackId)
    if(index < 0) {
      result = true
    }else{
      arr2Copy.splice(index, 1)
    }
    return result
  })
}

function indexByTrackId(item, list, trackId, startIndex) {
  startIndex = startIndex || 0;
  var index = list.indexOf(item, startIndex);
  if(index === -1 && trackId){
    for(var i = startIndex, item1; item1 = list[i]; i++) {
      if(item[trackId] ===  item1[trackId] && !utils.isUndefined(item[trackId])){
        index = i;
        break;
      }
    }
  }
  return index;
}

},{"../env.js":17,"../scope":21,"../utils.js":23}],15:[function(require,module,exports){
"use strict";

//样式指令
var utils = require('../utils')
var camelReg = /([A-Z])/g;

//默认单位为 px 的属性
var pixelAttrs = [
  'width','height','min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-left', 'margin-bottom',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'top', 'left', 'right', 'bottom'
]

//对于 IE6, IE7 浏览器需要使用 `el.style.getAttribute('cssText')` 与 `el.style.setAttribute('cssText')` 来读写 style 字符属性

module.exports = {
  link: function() {
    this.initStyle = this.el.style.getAttribute ? this.el.style.getAttribute('cssText') : this.el.getAttribute('style')
  },
  update: function(styles) {
    var el = this.el;
    var styleStr = this.initStyle ? this.initStyle.replace(/;?$/, ';') : '';
    var dashKey, val;

    if(typeof styles === 'string') {
      styleStr += styles;
    }else {
      for (var key in styles) {
        val = styles[key];

        //marginTop -> margin-top. 驼峰转连接符式
        dashKey = key.replace(camelReg, function (upperChar) {
          return '-' + upperChar.toLowerCase();
        });

        if (pixelAttrs.indexOf(dashKey) >= 0 && utils.isNumeric(val)) {
          val += 'px';
        }
        if(!utils.isUndefined(val)){
          styleStr += dashKey + ': ' + val + '; ';
        }
      }
    }
    if(el.style.setAttribute){
      //老 IE
      el.style.setAttribute('cssText', styleStr);
    }else{
      el.setAttribute('style', styleStr);
    }
  }
};

},{"../utils":23}],16:[function(require,module,exports){
"use strict";

var doc = require('./env.js').document
var utils = require('./utils')

//处理 $target,  $content, $tpl
//target: el 替换的目标
function tplParse(tpl, target, content) {
  var el;
  if(utils.isObject(target) && target.childNodes) {
    content = createContent(target.childNodes);
  }else{
    if(content) {
      content = createContent(content)
    }
  }

  if(utils.isObject(tpl)){
    //DOM 元素
    el = tpl;
    tpl = el.outerHTML;
  }else{
    //字符串
    el = createContent(tpl).childNodes[0];
  }

  if(target){
    target.parentNode && target.parentNode.replaceChild(el, target);
  }

  return {el: el, tpl: tpl, content: content};
}

//将模板/元素/nodelist 包裹在 fragment 中
function createContent(tpl) {
  var content = doc.createDocumentFragment();
  var wraper;
  var nodes = [];
  if(utils.isObject(tpl)) {
    if(tpl.nodeName && tpl.nodeType) {
      //dom 元素
      content.appendChild(tpl);
    }else if('length' in tpl){
      //nodelist
      nodes = tpl;
    }
  }else {
    wraper = doc.createElement('div')
    //自定义标签在 IE8 下无效. 使用 component 指令替代
    wraper.innerHTML = (tpl + '').trim();
    nodes = wraper.childNodes;
  }
  while(nodes[0]) {
    content.appendChild(nodes[0])
  }
  return content;
}

//html 中属性名不区分大小写, 并且会全部转成小写.
//这里会将连字符写法转成驼峰式
//attr-name --> attrName
//attr--name --> attr-name
var hyphensReg = /-(-?)([a-z])/ig;
var hyphenToCamel = function(attrName) {
  return attrName.replace(hyphensReg, function(s, dash, char) {
    return dash ? dash + char : char.toUpperCase();
  })
}

module.exports = {
  tplParse: tplParse,
  createContent: createContent,

  //获取元素属性
  getAttrs: function(el) {
    var attributes = el.attributes;
    var attrs = {};

    for(var i = attributes.length - 1; i >= 0; i--) {
      //连接符转驼峰写法
      attrs[hyphenToCamel(attributes[i].nodeName)] = attributes[i].value;
    }

    return attrs;
  }
};
},{"./env.js":17,"./utils":23}],17:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":2}],18:[function(require,module,exports){
/**
 * 表达式执行
 */

"use strict";

var scope = require('./scope')

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
  , ',': function(l, r) { return l, r; }

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

    //TODO 模板中方法的 this 应该指向 root
  , '(': function(l, r){ return l.apply(context.locals, r) }
    //filter. name|filter
  , '|': function(l, r){ return callFilter(l, r, []) }
  , 'new': function(l, r){
      return l === Date ? new Function('return new Date(' + r.join(', ') + ')')() : new (Function.prototype.bind.apply(l, r));
    }

  , 'in': function(l, r){
      if(this.repeat) {
        //repeat
        return r;
      }else{
        return l in r;
      }
    }
  , 'catchby': function(l, r) {
      if(l['catch']) {
        return l['catch'](r.bind(root))
      }else{
        summaryCall || console.error('catchby expect a promise')
        return l;
      }
    }
  }

, 'ternary': {
    '?': function(f, s, t) { return f ? s : t; }
  , '(': function(f, s, t) { return f[s].apply(f, t) }

    //filter. name | filter : arg2 : arg3
  , '|': function(f, s, t){ return callFilter(f, s, t) }
  }
};

function callFilter(arg, filter, args) {
  if(arg && arg.then) {
    return arg.then(function(data) {
      return filter.apply(root, [data].concat(args))
    });
  }else{
    return filter.apply(root, [arg].concat(args))
  }
}

var argName = ['first', 'second', 'third']
  , context, summary, summaryCall
  , path
  , self
  , root
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
        //summaryCall || console.warn(e);
      }
    break;
    case 'literal':
      res = value;
    break;
    case 'repeat':
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
    root = scope.$root;
    summaryCall = false;
    context = {locals: scope || {}, filters: scope.constructor.filters || {}};
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
var getValue = function(key, vm) {
  var reformed = scope.reformScope(vm, key)
  return reformed.vm[reformed.path]
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

},{"./scope":21}],19:[function(require,module,exports){
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
},{}],20:[function(require,module,exports){
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

  //表达式
  //rbp: right binding power 右侧约束力
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

  //infix(',', 1);
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
			left.arity = 'repeat';
			this.repeat = true;
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
				a.push(expression(1));
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
				a.push(expression(10));
				if (token.id !== ":") {
					break;
				}
			}
		}
		return this;
	});
  infix('catchby', 10);

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
				a.push(expression(1));
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
				v = expression(1);
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
				a.push(expression(1));
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

},{}],21:[function(require,module,exports){
"use strict";

var utils = require('./utils');

//根据变量及 vm 确定变量所属的真正 vm
var reformScope = function (vm, path) {
  var paths = utils.parseKeyPath(path);
  var cur = vm, local = paths[0];
  var ass, curVm = cur;

  while(cur) {
    curVm = cur;
    ass = cur._assignments;
    if( cur.__repeat) {
      if (ass && ass.length) {
        // 具名 repeat 不会直接查找自身作用域
        if (local === '$index' || local === '$parent') {
          break;
        } else if (local === ass[0]) {
          //修正key
          if (paths.length === 1) {
            paths[0] = '$data';
          } else {
            paths.shift()
          }
          break;
        }
      } else {
        //匿名 repeat
        if (path in cur) {
          break;
        }
      }
    }
    cur = cur.$parent;
  }

  return { vm: curVm, path: paths.join('.') }
};


exports.reformScope = reformScope;

},{"./utils":23}],22:[function(require,module,exports){
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
},{}],23:[function(require,module,exports){
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
 * @returns {Object} 合并后的 target 对象
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
        if(name !== 'prototype'){
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
          } else if ( !utils.isUndefined(copy) && typeof target !== 'string') {
            //一些情下, 比如 firefox 下给字符串对象赋值时会异常
            target[name] = copy;
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

var deepGet = function (keyStr, obj) {
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
, isNumeric: function(val) {
    return !utils.isArray(val) && val - parseFloat(val) + 1 >= 0;
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
, extend: extend
, create: create
, toArray: function(arrLike) {
    var arr = [];

    try{
      //IE 8 对 dom 对象会报错
      arr = Array.prototype.slice.call(arrLike)
    }catch (e){
      for(var i = 0, l = arrLike.length; i < l; i++) {
        arr[i] = arrLike[i]
      }
    }
    return arr;
  }
};

module.exports = utils;

},{"./env.js":17}],24:[function(require,module,exports){
"use strict";

var evaluate = require('./eval.js')
  , utils = require('./utils.js')
  , parse = require('./parse.js').parse
  , reformScope = require('./scope').reformScope
  ;

var summaryCache = {};

/**
 * 每个 directive 对应一个 watcher
 * @param {Bee} vm  directive 所处的环境
 * @param {Directive} dir
 */
function Watcher(vm, dir) {
  var reformed, path, curVm = vm, watchers = [];
  var summary = summaryCache[dir.path]

  dir.watcher = this;

  this.state = 1;
  this.dir = dir;
  this.vm = vm;
  this.watchers = [];

  this.val = NaN;

  dir.parse();

  if(!summary || summary._type !== dir.type){
    summary = evaluate.summary(dir.ast);
    summary._type = dir.type;
    summaryCache[dir.path] = summary;
  }
  dir.summary = summary

  //将该 watcher 与每一个属性建立引用关系
  for(var i = 0, l = dir.summary.paths.length; i < l; i++) {
    reformed = reformScope(vm, dir.summary.paths[i])
    curVm = reformed.vm
    path = reformed.path
    if(dir.watch) {
      curVm._watchers[path] = curVm._watchers[path] || [];
      curVm._watchers[path].push(this);
      watchers = curVm._watchers[path];
    }else{
      watchers = [this];
    }
    //将每个 key 对应的 watchers 都塞进来
    this.watchers.push( watchers );
  }

  //是否在初始化时更新
  dir.immediate !== false && this.update();
}

//根据表达式移除当前 vm 中的 watcher
function unwatch (vm, exp, callback) {
  var summary;
  try {
    summary = evaluate.summary(parse(exp))
  }catch (e){
    e.message = 'SyntaxError in "' + exp + '" | ' + e.message;
    console.error(e);
  }
  summary.paths.forEach(function(path) {
    var watchers = vm._watchers[path] || [], update;

    for(var i = watchers.length - 1; i >= 0; i--){
      update = watchers[i].dir.update;
      if(update === callback || update._originFn === callback){
        watchers[i].unwatch()
      }
    }
  })
}

function addWatcher(dir) {
  if(dir.path) {
    return new Watcher(this, dir);
  }
}

Watcher.unwatch = unwatch;
Watcher.addWatcher = addWatcher;

//获取某 keyPath 子路径的 watchers
Watcher.getWatchers = function getWatchers(vm, keyPath) {
  var _watchers = vm._watchers, watchers = [];
  var point;
  for(var key in _watchers) {
    point = key.charAt(keyPath.length);
    if(key.indexOf(keyPath) === 0 && (point === '.')) {
      watchers = watchers.concat(_watchers[key])
    }
  }
  return watchers
}

function watcherUpdate (val) {
  try{
    this.dir.update(val, this.val);
    this.val = val;
  }catch(e){
    console.error(e);
  }
}

utils.extend(Watcher.prototype, {
  //表达式执行并更新 view
  update: function() {
    var that = this
      , newVal
      ;

    newVal = this.dir.getValue(this.vm);

    //简单过滤重复更新
    if(newVal !== this.val || utils.isObject(newVal)){
      if(newVal && newVal.then) {
        //a promise
        newVal.then(function(val) {
          watcherUpdate.call(that, val);
        });
      }else{
        watcherUpdate.call(this, newVal);
      }
    }
  },
  //移除
  unwatch: function() {
    this.watchers.forEach(function(watchers) {
      for(var i = watchers.length - 1; i >= 0; i--){
        if(watchers[i] === this){
          if(this.state){
            watchers[i].dir.unLink();
            this.state = 0;
          }
          watchers.splice(i, 1);
        }
      }
    }.bind(this))
    this.watchers = [];
  }
});

module.exports = Watcher

},{"./eval.js":18,"./parse.js":20,"./scope":21,"./utils.js":23}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY29tcG9uZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvY29udGVudC5qcyIsInNyYy9kaXJlY3RpdmVzL2luZGV4LmpzIiwic3JjL2RpcmVjdGl2ZXMvbW9kZWwuanMiLCJzcmMvZGlyZWN0aXZlcy9vbi5qcyIsInNyYy9kaXJlY3RpdmVzL3JlZi5qcyIsInNyYy9kaXJlY3RpdmVzL3JlcGVhdC5qcyIsInNyYy9kaXJlY3RpdmVzL3N0eWxlLmpzIiwic3JjL2RvbS11dGlscy5qcyIsInNyYy9lbnYuanMiLCJzcmMvZXZhbC5qcyIsInNyYy9ldmVudC1iaW5kLmpzIiwic3JjL3BhcnNlLmpzIiwic3JjL3Njb3BlLmpzIiwic3JjL3Rva2VuLmpzIiwic3JjL3V0aWxzLmpzIiwic3JjL3dhdGNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pXQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0bEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgRGlyID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi9kb20tdXRpbHMuanMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4vY2hlY2stYmluZGluZy5qcycpXG4gICwgc2NvcGUgPSByZXF1aXJlKCcuL3Njb3BlJylcbiAgO1xuXG5cbnZhciBpc09iamVjdCA9IHV0aWxzLmlzT2JqZWN0XG4gICwgaXNQbGFpbk9iamVjdCA9IHV0aWxzLmlzUGxhaW5PYmplY3RcbiAgLCBwYXJzZUtleVBhdGggPSB1dGlscy5wYXJzZUtleVBhdGhcbiAgLCBkZWVwU2V0ID0gdXRpbHMuZGVlcFNldFxuICAsIGV4dGVuZCA9IHV0aWxzLmV4dGVuZFxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8v6K6+572uIGRpcmVjdGl2ZSDliY3nvIBcbmZ1bmN0aW9uIHNldFByZWZpeChuZXdQcmVmaXgpIHtcbiAgaWYobmV3UHJlZml4KXtcbiAgICB0aGlzLnByZWZpeCA9IG5ld1ByZWZpeDtcbiAgfVxufVxuXG4vL1RPRE8g5riF55CG6L+Z5LiqXG52YXIgbWVyZ2VQcm9wcyA9IHtcbiAgJGRhdGE6IDEsICR3YXRjaGVyczogMVxufTtcblxudmFyIGxpZmVDeWNsZXMgPSB7XG4gICRiZWZvcmVJbml0OiB1dGlscy5ub29wXG4sICRhZnRlckluaXQ6IHV0aWxzLm5vb3BcbiwgJGJlZm9yZVVwZGF0ZTogdXRpbHMubm9vcFxuLCAkYWZ0ZXJVcGRhdGU6IHV0aWxzLm5vb3BcbiwgJGJlZm9yZURlc3Ryb3k6IHV0aWxzLm5vb3BcbiwgJGFmdGVyRGVzdHJveTogdXRpbHMubm9vcFxufTtcblxuLyoqXG4gKiDmnoTpgKDlh73mlbBcbiAqIC0tLVxuICogQHBhcmFtIHtTdHJpbmd8RWxlbWVudH0gW3RwbF0g5qih5p2/LiDnrYnlkIzkuo4gcHJvcHMuJHRwbFxuICogQHBhcmFtIHtPYmplY3R9IFtwcm9wc10g5bGe5oCnL+aWueazlVxuICoqL1xuZnVuY3Rpb24gQmVlKHRwbCwgcHJvcHMpIHtcbiAgaWYoaXNQbGFpbk9iamVjdCh0cGwpKSB7XG4gICAgcHJvcHMgPSB0cGw7XG4gICAgdHBsID0gcHJvcHMuJHRwbDtcbiAgfVxuICBwcm9wcyA9IHByb3BzIHx8IHt9O1xuXG4gIHZhciBkZWZhdWx0cyA9IHtcbiAgICAvLyQg5byA5aS055qE5piv5YWx5pyJ5bGe5oCnL+aWueazlVxuICAgICRkYXRhOiB7fVxuICAsICR3YXRjaGVyczoge31cbiAgLCAkcmVmczoge31cbiAgLCAkbWl4aW5zOiBbXVxuXG4gICwgJGVsOiB0aGlzLiRlbCB8fCBudWxsXG4gICwgJHRhcmdldDogdGhpcy4kdGFyZ2V0IHx8IG51bGxcbiAgLCAkdHBsOiB0aGlzLiR0cGwgfHwgJzxkaXY+PC9kaXY+J1xuICAsICRjb250ZW50OiB0aGlzLiRjb250ZW50IHx8IG51bGxcblxuICAsICRwYXJlbnQ6IG51bGxcbiAgLCAkcm9vdDogdGhpc1xuXG4gICAgLy/np4HmnInlsZ7mgKcv5pa55rOVXG4gICwgX3dhdGNoZXJzOiB7fVxuICAsIF9hc3NpZ25tZW50czogbnVsbC8v5b2T5YmNIHZtIOeahOWIq+WQjVxuICAsIF9yZWxhdGl2ZVBhdGg6IFtdXG4gICwgX19saW5rczogW11cbiAgLCBfaXNSZW5kZXJlZDogZmFsc2VcbiAgfTtcblxuICB2YXIgZWxJbmZvO1xuXG4gIHZhciBtaXhpbnMgPSBbZGVmYXVsdHNdLmNvbmNhdCh0aGlzLiRtaXhpbnMpLmNvbmNhdChwcm9wcy4kbWl4aW5zKS5jb25jYXQoW3Byb3BzXSlcblxuICBtaXhpbnMuZm9yRWFjaChmdW5jdGlvbihtaXhpbikge1xuICAgIHZhciBwcm9wO1xuICAgIGZvcih2YXIgcHJvcEtleSBpbiBtaXhpbikge1xuICAgICAgaWYobWl4aW4uaGFzT3duUHJvcGVydHkocHJvcEtleSkpIHtcbiAgICAgICAgaWYgKChwcm9wS2V5IGluIG1lcmdlUHJvcHMpICYmIGlzT2JqZWN0KG1peGluW3Byb3BLZXldKSkge1xuICAgICAgICAgIC8v5L+d5oyB5a+55Lyg5YWl5bGe5oCn55qE5byV55SoXG4gICAgICAgICAgLy9tZXJnZVByb3BzIOS4reeahOWxnuaAp+S8muiiq+m7mOiupOWAvOaJqeWxlVxuICAgICAgICAgIHByb3AgPSBleHRlbmQoe30sIHRoaXNbcHJvcEtleV0sIG1peGluW3Byb3BLZXldKVxuICAgICAgICAgIHRoaXNbcHJvcEtleV0gPSBleHRlbmQobWl4aW5bcHJvcEtleV0sIHByb3ApXG4gICAgICAgIH0gZWxzZSBpZiAocHJvcEtleSBpbiBsaWZlQ3ljbGVzKSB7XG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IHV0aWxzLmFmdGVyRm4odGhpc1twcm9wS2V5XSwgbWl4aW5bcHJvcEtleV0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IG1peGluW3Byb3BLZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9LmJpbmQodGhpcykpXG5cbiAgaXNPYmplY3QodGhpcy4kZGF0YSkgJiYgZXh0ZW5kKHRoaXMsIHRoaXMuJGRhdGEpO1xuXG4gIHRwbCA9IHRwbCB8fCB0aGlzLiR0cGw7XG4gIGVsSW5mbyA9IGRvbVV0aWxzLnRwbFBhcnNlKHRwbCwgdGhpcy4kdGFyZ2V0LCB0aGlzLiRjb250ZW50KTtcblxuICBpZih0aGlzLiRlbCl7XG4gICAgdGhpcy4kZWwuYXBwZW5kQ2hpbGQoZWxJbmZvLmVsKTtcbiAgfWVsc2V7XG4gICAgdGhpcy4kZWwgPSBlbEluZm8uZWw7XG4gIH1cbiAgdGhpcy4kdHBsID0gZWxJbmZvLnRwbDtcbiAgdGhpcy4kY29udGVudCA9IGVsSW5mby5jb250ZW50O1xuXG4gIHRoaXMuJGJlZm9yZUluaXQoKVxuICB0aGlzLiRlbC5iZWUgPSB0aGlzO1xuXG4gIGlmKHRoaXMuJGNvbnRlbnQpe1xuICAgIHRoaXMuX19saW5rcyA9IGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcy4kcm9vdCwgdGhpcy4kY29udGVudCk7XG4gIH1cbiAgdGhpcy5fX2xpbmtzID0gdGhpcy5fX2xpbmtzLmNvbmNhdCggY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh0aGlzLCB0aGlzLiRlbCkgKTtcblxuICBmb3IodmFyIGtleSBpbiB0aGlzLiR3YXRjaGVycykge1xuICAgIHRoaXMuJHdhdGNoKGtleSwgdGhpcy4kd2F0Y2hlcnNba2V5XSlcbiAgfVxuXG4gIHRoaXMuX2lzUmVuZGVyZWQgPSB0cnVlO1xuICB0aGlzLiRhZnRlckluaXQoKTtcbn1cblxuLy/pnZnmgIHlsZ7mgKdcbmV4dGVuZChCZWUsIHtleHRlbmQ6IHV0aWxzLmFmdGVyRm4oQ2xhc3MuZXh0ZW5kLCB1dGlscy5ub29wLCBmdW5jdGlvbihzdWIpIHtcbiAgLy/mr4/kuKrmnoTpgKDlh73mlbDpg73mnInoh6rlt7HnmoQgZGlyZWN0aXZlcyAsY29tcG9uZW50cywgZmlsdGVycyDlvJXnlKhcbiAgc3ViLmRpcmVjdGl2ZXMgPSBleHRlbmQoY3JlYXRlKHRoaXMuZGlyZWN0aXZlcyksIHN1Yi5kaXJlY3RpdmVzKTtcbiAgc3ViLmNvbXBvbmVudHMgPSBleHRlbmQoY3JlYXRlKHRoaXMuY29tcG9uZW50cyksIHN1Yi5jb21wb25lbnRzKTtcbiAgc3ViLmZpbHRlcnMgPSBleHRlbmQoY3JlYXRlKHRoaXMuZmlsdGVycyksIHN1Yi5maWx0ZXJzKTtcbn0pLCB1dGlsczogdXRpbHN9LCBEaXIsIENvbSwge1xuICBzZXRQcmVmaXg6IHNldFByZWZpeFxuLCBwcmVmaXg6ICcnXG4sIGRvYzogZG9jXG4sIGRpcmVjdGl2ZXM6IHt9XG4sIGNvbXBvbmVudHM6IHt9XG4sIGRlZmF1bHRzOiB7fVxuLCBmaWx0ZXJzOiB7XG4gICAgLy9idWlsZCBpbiBmaWx0ZXJcbiAgICBqc29uOiBmdW5jdGlvbihvYmosIHJlcGxhY2VyLCBzcGFjZSkge1xuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaiwgcmVwbGFjZXIsIHNwYWNlKSB9XG4gIH1cbiwgZmlsdGVyOiBmdW5jdGlvbihmaWx0ZXJOYW1lLCBmaWx0ZXIpIHtcbiAgICB0aGlzLmZpbHRlcnNbZmlsdGVyTmFtZV0gPSBmaWx0ZXI7XG4gIH1cbiwgbW91bnQ6IGZ1bmN0aW9uKGlkLCBwcm9wcykge1xuICAgIHZhciBlbCA9IGlkLm5vZGVUeXBlID8gaWQgOiBkb2MuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBDb21wID0gdGhpcy5nZXRDb21wb25lbnQoZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICB2YXIgaW5zdGFuY2U7XG4gICAgcHJvcHMgPSBwcm9wcyB8fCB7fTtcbiAgICBpZihDb21wKSB7XG4gICAgICBwcm9wcy4kZGF0YSA9IGV4dGVuZChkb21VdGlscy5nZXRBdHRycyhlbCksIHByb3BzLiRkYXRhKVxuICAgICAgaW5zdGFuY2UgPSBuZXcgQ29tcChleHRlbmQoeyR0YXJnZXQ6IGVsfSwgcHJvcHMpKVxuICAgIH1lbHNle1xuICAgICAgaW5zdGFuY2UgPSBuZXcgQmVlKGVsLCBwcm9wcyk7XG4gICAgfVxuICAgIHJldHVybiBpbnN0YW5jZVxuICB9XG59KTtcblxuXG5CZWUuc2V0UHJlZml4KCdiLScpO1xuXG4vL+WGhee9riBkaXJlY3RpdmVcbmZvcih2YXIgZGlyIGluIGRpcnMpIHtcbiAgQmVlLmRpcmVjdGl2ZShkaXIsIGRpcnNbZGlyXSk7XG59XG5cbi8v5a6e5L6L5pa55rOVXG4vLy0tLS1cbmV4dGVuZChCZWUucHJvdG90eXBlLCBsaWZlQ3ljbGVzLCB7XG4gIC8qKlxuICAgKiDojrflj5blsZ7mgKcv5pa55rOVLS1cbiAgICogQHBhcmFtIHtTdHJpbmd9IGV4cHJlc3Npb24g6Lev5b6EL+ihqOi+vuW8j1xuICAgKiBAcmV0dXJucyB7Kn1cbiAgICovXG4gICRnZXQ6IGZ1bmN0aW9uKGV4cHJlc3Npb24pIHtcbiAgICB2YXIgZGlyID0gbmV3IERpcignJGdldCcsIHtcbiAgICAgIHBhdGg6IGV4cHJlc3Npb25cbiAgICAsIHdhdGNoOiBmYWxzZVxuICAgIH0pO1xuICAgIGRpci5wYXJzZSgpO1xuICAgIHJldHVybiBkaXIuZ2V0VmFsdWUodGhpcywgZmFsc2UpXG4gIH1cblxuICAvKipcbiAgICogIyMjIGJlZS4kc2V0XG4gICAqIOabtOaWsOWQiOW5tiBgLmRhdGFgIOS4reeahOaVsOaNri4g5aaC5p6c5Y+q5pyJ5LiA5Liq5Y+C5pWwLCDpgqPkuYjov5nkuKrlj4LmlbDlsIblubblhaUgLiRkYXRhXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBba2V5XSDmlbDmja7ot6/lvoQuXG4gICAqIEBwYXJhbSB7QW55VHlwZXxPYmplY3R9IHZhbCDmlbDmja7lhoXlrrkuXG4gICAqL1xuLCAkc2V0OiBmdW5jdGlvbihrZXksIHZhbCkge1xuICAgIHZhciBhZGQsIGtleXMsIGhhc0tleSA9IGZhbHNlO1xuICAgIHZhciByZWZvcm1lZCwgcmVLZXksIHJlVm0gPSB0aGlzO1xuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICBpZihpc09iamVjdChrZXkpKSB7XG4gICAgICAgIGV4dGVuZCh0aGlzLiRkYXRhLCBrZXkpO1xuICAgICAgICBleHRlbmQodGhpcywga2V5KTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLiRkYXRhID0ga2V5O1xuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIHJlZm9ybWVkID0gc2NvcGUucmVmb3JtU2NvcGUodGhpcywga2V5KVxuICAgICAgcmVLZXkgPSByZWZvcm1lZC5wYXRoO1xuICAgICAgcmVWbSA9IHJlZm9ybWVkLnZtO1xuICAgICAga2V5cyA9IHBhcnNlS2V5UGF0aChyZUtleSk7XG4gICAgICBhZGQgPSBkZWVwU2V0KHJlS2V5LCB2YWwsIHt9KTtcbiAgICAgIGlmKGtleXNbMF0gPT09ICckZGF0YScpIHtcbiAgICAgICAgYWRkID0gYWRkLiRkYXRhXG4gICAgICB9XG4gICAgICBpZihpc09iamVjdChyZVZtLiRkYXRhKSkge1xuICAgICAgICBleHRlbmQodHJ1ZSwgcmVWbS4kZGF0YSwgYWRkKTtcbiAgICAgICAgZXh0ZW5kKHRydWUsIHJlVm0sIGFkZCk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmVWbS4kZGF0YSA9IGFkZDtcbiAgICAgIH1cbiAgICB9XG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwocmVWbSwgcmVLZXksIHZhbCkgOiB1cGRhdGUuY2FsbChyZVZtLCBrZXkpO1xuICB9XG4gIC8qKlxuICAgKiDmlbDmja7mm7/mjaJcbiAgICovXG4sICRyZXBsYWNlOiBmdW5jdGlvbiAoa2V5LCB2YWwpIHtcbiAgICB2YXIga2V5cywgbGFzdCwgaGFzS2V5ID0gZmFsc2U7XG4gICAgdmFyIHJlZm9ybWVkLCByZUtleSwgcmVWbSA9IHRoaXM7XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIHZhbCA9IGtleTtcbiAgICAgIHJlS2V5ID0gJyRkYXRhJztcbiAgICAgIGtleXMgPSBbcmVLZXldO1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIHJlZm9ybWVkID0gc2NvcGUucmVmb3JtU2NvcGUodGhpcywga2V5KVxuICAgICAgcmVLZXkgPSByZWZvcm1lZC5wYXRoO1xuICAgICAgcmVWbSA9IHJlZm9ybWVkLnZtO1xuICAgICAga2V5cyA9IHBhcnNlS2V5UGF0aChyZUtleSk7XG4gICAgfVxuXG4gICAgbGFzdCA9IHJlVm0uJGdldChyZUtleSk7XG5cbiAgICBpZiAoa2V5c1swXSA9PT0gJyRkYXRhJykge1xuICAgICAgaWYocmVLZXkgPT09ICckZGF0YScpIHtcbiAgICAgICAgaWYoaXNPYmplY3QodGhpcy4kZGF0YSkpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLiRkYXRhKS5mb3JFYWNoKGZ1bmN0aW9uIChrKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpc1trXTtcbiAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIH1cbiAgICAgICAgZXh0ZW5kKHJlVm0sIHZhbCk7XG4gICAgICB9ZWxzZSB7XG4gICAgICAgIGRlZXBTZXQoa2V5cy5zaGlmdCgpLmpvaW4oJy4nKSwgdmFsLCByZVZtKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0uJGRhdGEpO1xuICAgIH1cbiAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0pXG5cbiAgICBoYXNLZXkgPyB1cGRhdGUuY2FsbChyZVZtLCByZUtleSwgZXh0ZW5kKHt9LCBsYXN0LCB2YWwpKSA6IHVwZGF0ZS5jYWxsKHJlVm0sIGV4dGVuZCh7fSwgbGFzdCwgdmFsKSk7XG4gIH1cbiAgLyoqXG4gICAqIOaJi+WKqOabtOaWsOafkOmDqOWIhuaVsOaNrlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDmjIflrprmm7TmlrDmlbDmja7nmoQga2V5UGF0aFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpc0J1YmJsZT10cnVlXSDmmK/lkKbmm7TmlrAga2V5UGF0aCDnmoTniLbnuqdcbiAgICovXG4sICR1cGRhdGU6IGZ1bmN0aW9uIChrZXlQYXRoLCBpc0J1YmJsZSkge1xuICAgIGlzQnViYmxlID0gaXNCdWJibGUgIT09IGZhbHNlO1xuXG4gICAgdmFyIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5UGF0aC5yZXBsYWNlKC9eXFwkZGF0YVxcLi8sICcnKSksIGtleTtcbiAgICB2YXIgd2F0Y2hlcnM7XG5cbiAgICB3aGlsZShrZXkgPSBrZXlzLmpvaW4oJy4nKSkge1xuICAgICAgd2F0Y2hlcnMgPSB0aGlzLl93YXRjaGVyc1trZXldIHx8IFtdO1xuXG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHdhdGNoZXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB3YXRjaGVyc1tpXS51cGRhdGUoKTtcbiAgICAgIH1cblxuICAgICAgaWYoaXNCdWJibGUpIHtcbiAgICAgICAga2V5cy5wb3AoKTtcbiAgICAgICAgLy/mnIDnu4jpg73lhpLms6HliLAgJGRhdGFcbiAgICAgICAgaWYoIWtleXMubGVuZ3RoICYmIGtleSAhPT0gJyRkYXRhJyl7XG4gICAgICAgICAga2V5cy5wdXNoKCckZGF0YScpO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy/lkIzml7bmm7TmlrDlrZDot6/lvoRcbiAgICBXYXRjaGVyLmdldFdhdGNoZXJzKHRoaXMsIGtleVBhdGgpLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci51cGRhdGUoKTtcbiAgICB9LmJpbmQodGhpcykpXG5cbiAgICAvL+aVsOe7hOWGkuazoeeahOaDheWGtVxuICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICBpZih0aGlzLiRwYXJlbnQpIHtcbiAgICAgICAgLy/lkIzmraXmm7TmlrDniLYgdm0g5a+55bqU6YOo5YiGXG4gICAgICAgIHRoaXMuX3JlbGF0aXZlUGF0aC5mb3JFYWNoKGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgICAgICAgdGhpcy4kcGFyZW50LiR1cGRhdGUocGF0aCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiwgJHdhdGNoOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY2FsbGJhY2ssIGltbWVkaWF0ZSkge1xuICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICB2YXIgdXBkYXRlID0gY2FsbGJhY2suYmluZCh0aGlzKTtcbiAgICAgIHVwZGF0ZS5fb3JpZ2luRm4gPSBjYWxsYmFjaztcbiAgICAgIHJldHVybiBXYXRjaGVyLmFkZFdhdGNoZXIuY2FsbCh0aGlzLCBuZXcgRGlyKCckd2F0Y2gnLCB7cGF0aDogZXhwcmVzc2lvbiwgdXBkYXRlOiB1cGRhdGUsIGltbWVkaWF0ZSA6ICEhaW1tZWRpYXRlfSkpXG4gICAgfVxuICB9XG4sICR1bndhdGNoOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY2FsbGJhY2spIHtcbiAgICBXYXRjaGVyLnVud2F0Y2godGhpcywgZXhwcmVzc2lvbiwgY2FsbGJhY2spXG4gIH1cbiAgLy/plIDmr4HlvZPliY3lrp7kvotcbiwgJGRlc3Ryb3k6IGZ1bmN0aW9uKHJlbW92ZUVsKSB7XG4gICAgdGhpcy4kYmVmb3JlRGVzdHJveSgpXG4gICAgdGhpcy5fX2xpbmtzLmZvckVhY2goZnVuY3Rpb24od2FjaGVyKSB7XG4gICAgICB3YWNoZXIudW53YXRjaCgpXG4gICAgfSlcbiAgICByZW1vdmVFbCAmJiB0aGlzLiRlbC5wYXJlbnROb2RlICYmIHRoaXMuJGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy4kZWwpXG4gICAgdGhpcy5fX2xpbmtzID0gW107XG4gICAgdGhpcy4kYWZ0ZXJEZXN0cm95KClcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHVwZGF0ZSAoa2V5UGF0aCwgZGF0YSkge1xuICB2YXIga2V5UGF0aHM7XG4gIHRoaXMuJGJlZm9yZVVwZGF0ZSh0aGlzLiRkYXRhKVxuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZGF0YSA9IGtleVBhdGg7XG4gIH1lbHNle1xuICAgIGtleVBhdGhzID0gW2tleVBhdGhdO1xuICB9XG5cbiAgaWYoIWtleVBhdGhzKSB7XG4gICAgaWYoaXNPYmplY3QoZGF0YSkpIHtcbiAgICAgIGtleVBhdGhzID0gT2JqZWN0LmtleXMoZGF0YSk7XG4gICAgfWVsc2V7XG4gICAgICAvLy4kZGF0YSDmnInlj6/og73mmK/ln7rmnKznsbvlnovmlbDmja5cbiAgICAgIGtleVBhdGhzID0gWyckZGF0YSddO1xuICAgIH1cbiAgfVxuXG4gIGZvcih2YXIgaSA9IDAsIHBhdGg7IHBhdGggPSBrZXlQYXRoc1tpXTsgaSsrKXtcbiAgICB0aGlzLiR1cGRhdGUocGF0aCwgdHJ1ZSk7XG4gIH1cbiAgdGhpcy4kYWZ0ZXJVcGRhdGUodGhpcy4kZGF0YSlcbn1cblxuQmVlLnZlcnNpb24gPSAnMC40LjEnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJlZTtcbiIsbnVsbCwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICA7XG5cbnZhciBOT0RFVFlQRSA9IHtcbiAgICBFTEVNRU5UOiAxXG4gICwgQVRUUjogMlxuICAsIFRFWFQ6IDNcbiAgLCBDT01NRU5UOiA4XG4gICwgRlJBR01FTlQ6IDExXG59O1xuXG5kb2MuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKVxuXG4vKipcbiAqIOmBjeWOhiBkb20g5qCRXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtFbGVtZW50fE5vZGVMaXN0fSBlbFxuICogQHJldHVybnMge0FycmF5fSDoioLngrnkuIvmiYDmnInnmoTnu5HlrppcbiAqL1xuXG5mdW5jdGlvbiB3YWxrKGVsKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdLCBkaXJSZXN1bHQ7XG4gIGlmKGVsLm5vZGVUeXBlID09PSBOT0RFVFlQRS5GUkFHTUVOVCkge1xuICAgIGVsID0gZWwuY2hpbGROb2RlcztcbiAgfVxuXG4gIGlmKCgnbGVuZ3RoJyBpbiBlbCkgJiYgdXRpbHMuaXNVbmRlZmluZWQoZWwubm9kZVR5cGUpKXtcbiAgICAvL25vZGUgbGlzdFxuICAgIC8v5a+55LqOIG5vZGVsaXN0IOWmguaenOWFtuS4reacieWMheWQqyB7e3RleHR9fSDnm7TmjqXph4/nmoTooajovr7lvI8sIOaWh+acrOiKgueCueS8muiiq+WIhuWJsiwg5YW26IqC54K55pWw6YeP5Y+v6IO95Lya5Yqo5oCB5aKe5YqgXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGVsLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGVsW2ldKSApO1xuICAgIH1cbiAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBzd2l0Y2ggKGVsLm5vZGVUeXBlKSB7XG4gICAgY2FzZSBOT0RFVFlQRS5FTEVNRU5UOlxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5DT01NRU5UOlxuICAgICAgLy/ms6jph4roioLngrlcbiAgICAgIHJldHVybiB3YXRjaGVycztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuVEVYVDpcbiAgICAgIC8v5paH5pys6IqC54K5XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggY2hlY2tUZXh0LmNhbGwodGhpcywgZWwpICk7XG4gICAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgLy90ZW1wbGF0ZSBzaGltXG4gICAgaWYoIWVsLmNvbnRlbnQpIHtcbiAgICAgIGVsLmNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgd2hpbGUoZWwuY2hpbGROb2Rlc1swXSkge1xuICAgICAgICBlbC5jb250ZW50LmFwcGVuZENoaWxkKGVsLmNoaWxkTm9kZXNbMF0pXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZGlyUmVzdWx0ID0gY2hlY2tBdHRyLmNhbGwodGhpcywgZWwpO1xuICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdChkaXJSZXN1bHQud2F0Y2hlcnMpXG4gIGlmKGRpclJlc3VsdC50ZXJtaW5hbCl7XG4gICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgaWYoZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgZWwuY29udGVudCkgKVxuICB9XG5cbiAgZm9yKHZhciBjaGlsZCA9IGVsLmZpcnN0Q2hpbGQsIG5leHQ7IGNoaWxkOyApe1xuICAgIG5leHQgPSBjaGlsZC5uZXh0U2libGluZztcbiAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGNoaWxkKSApO1xuICAgIGNoaWxkID0gbmV4dDtcbiAgfVxuXG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG4vL+mBjeWOhuWxnuaAp1xuZnVuY3Rpb24gY2hlY2tBdHRyKGVsKSB7XG4gIHZhciBjc3RyID0gdGhpcy5jb25zdHJ1Y3RvclxuICAgICwgZGlycyA9IGNzdHIuZGlyZWN0aXZlLmdldERpcnMoZWwsIGNzdHIpXG4gICAgLCBkaXJcbiAgICAsIHRlcm1pbmFsUHJpb3JpdHksIHdhdGNoZXJzID0gW11cbiAgICAsIHJlc3VsdCA9IHt9O1xuICA7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBkaXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGRpciA9IGRpcnNbaV07XG4gICAgZGlyLmRpcnMgPSBkaXJzO1xuXG4gICAgLy/lr7nkuo4gdGVybWluYWwg5Li6IHRydWUg55qEIGRpcmVjdGl2ZSwg5Zyo6Kej5p6Q5a6M5YW255u45ZCM5p2D6YeN55qEIGRpcmVjdGl2ZSDlkI7kuK3mlq3pgY3ljobor6XlhYPntKBcbiAgICBpZih0ZXJtaW5hbFByaW9yaXR5ID4gZGlyLnByaW9yaXR5KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoZGlyLm5vZGVOYW1lKTtcblxuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKSApO1xuXG4gICAgaWYoZGlyLnRlcm1pbmFsKSB7XG4gICAgICByZXN1bHQudGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQud2F0Y2hlcnMgPSB3YXRjaGVyc1xuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy/lpITnkIbmlofmnKzoioLngrnkuK3nmoTnu5HlrprljaDkvY3nrKYoe3suLi59fSlcbmZ1bmN0aW9uIGNoZWNrVGV4dChub2RlKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdO1xuICBpZih0b2tlbi5oYXNUb2tlbihub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICB2YXIgdG9rZW5zID0gdG9rZW4ucGFyc2VUb2tlbihub2RlLm5vZGVWYWx1ZSlcbiAgICAgICwgdGV4dE1hcCA9IHRva2Vucy50ZXh0TWFwXG4gICAgICAsIGVsID0gbm9kZS5wYXJlbnROb2RlXG4gICAgICAsIGRpcnMgPSB0aGlzLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXNcbiAgICAgICwgdCwgZGlyXG4gICAgICA7XG5cbiAgICAvL+Wwhnt7a2V5fX3liIblibLmiJDljZXni6znmoTmlofmnKzoioLngrlcbiAgICBpZih0ZXh0TWFwLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRleHRNYXAuZm9yRWFjaChmdW5jdGlvbih0ZXh0KSB7XG4gICAgICAgIHZhciB0biA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKHRuLCBub2RlKTtcbiAgICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoY2hlY2tUZXh0LmNhbGwodGhpcywgdG4pKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICBlbC5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9ZWxzZXtcbiAgICAgIHQgPSB0b2tlbnNbMF07XG4gICAgICAvL+WGhee9ruWQhOWNoOS9jeespuWkhOeQhi5cbiAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZSh0LmVzY2FwZSA/IGRpcnMudGV4dCA6IGRpcnMuaHRtbCk7XG4gICAgICB3YXRjaGVycyA9IHNldEJpbmRpbmcuY2FsbCh0aGlzLCB1dGlscy5leHRlbmQoZGlyLCB0LCB7XG4gICAgICAgIGVsOiBub2RlXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG5mdW5jdGlvbiBzZXRCaW5kaW5nKGRpcikge1xuICB2YXIgd2F0Y2hlclxuICBpZihkaXIucmVwbGFjZSkge1xuICAgIHZhciBlbCA9IGRpci5lbDtcbiAgICBpZih1dGlscy5pc0Z1bmN0aW9uKGRpci5yZXBsYWNlKSkge1xuICAgICAgZGlyLm5vZGUgPSBkaXIucmVwbGFjZSgpO1xuICAgIH1lbHNle1xuICAgICAgZGlyLm5vZGUgPSBkb2MuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgIH1cblxuICAgIGRpci5lbCA9IGRpci5lbC5wYXJlbnROb2RlO1xuICAgIGRpci5lbC5yZXBsYWNlQ2hpbGQoZGlyLm5vZGUsIGVsKTtcbiAgfVxuXG4gIGRpci52bSA9IHRoaXM7XG4gIGRpci5saW5rKCk7XG5cbiAgd2F0Y2hlciA9IFdhdGNoZXIuYWRkV2F0Y2hlci5jYWxsKHRoaXMsIGRpcilcbiAgcmV0dXJuIHdhdGNoZXIgPyBbd2F0Y2hlcl0gOiBbXVxufVxuXG5mdW5jdGlvbiB1bkJpbmRpbmcod2F0Y2hlcnMpIHtcbiAgd2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgd2F0Y2hlci51bndhdGNoKClcbiAgfSlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHdhbGs6IHdhbGssXG4gIHVuQmluZGluZzogdW5CaW5kaW5nXG59O1xuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKS5leHRlbmQ7XG5cbnZhciBDbGFzcyA9IHtcbiAgLyoqXG4gICAqIOaehOmAoOWHveaVsOe7p+aJvy5cbiAgICog5aaCOiBgdmFyIENhciA9IEJlZS5leHRlbmQoe2RyaXZlOiBmdW5jdGlvbigpe319KTsgbmV3IENhcigpO2BcbiAgICogQHBhcmFtIHtPYmplY3R9IFtwcm90b1Byb3BzXSDlrZDmnoTpgKDlh73mlbDnmoTmianlsZXljp/lnovlr7nosaFcbiAgICogQHBhcmFtIHtPYmplY3R9IFtzdGF0aWNQcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV6Z2Z5oCB5bGe5oCnXG4gICAqIEByZXR1cm5zIHtGdW5jdGlvbn0g5a2Q5p6E6YCg5Ye95pWwXG4gICAqL1xuICBleHRlbmQ6IGZ1bmN0aW9uIChwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuICAgIHByb3RvUHJvcHMgPSBwcm90b1Byb3BzIHx8IHt9O1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IHByb3RvUHJvcHMuaGFzT3duUHJvcGVydHkoJ2NvbnN0cnVjdG9yJykgPyBwcm90b1Byb3BzLmNvbnN0cnVjdG9yIDogZnVuY3Rpb24oKXsgcmV0dXJuIHN1cC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgdmFyIHN1cCA9IHRoaXM7XG4gICAgdmFyIEZuID0gZnVuY3Rpb24oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjb25zdHJ1Y3RvcjsgfTtcblxuICAgIEZuLnByb3RvdHlwZSA9IHN1cC5wcm90b3R5cGU7XG4gICAgY29uc3RydWN0b3IucHJvdG90eXBlID0gbmV3IEZuKCk7XG4gICAgZXh0ZW5kKGNvbnN0cnVjdG9yLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7XG4gICAgZXh0ZW5kKGNvbnN0cnVjdG9yLCBzdXAsIHN0YXRpY1Byb3BzLCB7X19zdXBlcl9fOiBzdXAucHJvdG90eXBlfSk7XG5cbiAgICByZXR1cm4gY29uc3RydWN0b3I7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2xhc3M7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4vKipcbiAqIOazqOWGjOe7hOS7tlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWUg6Ieq5a6a5LmJ57uE5Lu255qE5qCH562+5ZCNXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHByb3BzfSBDb21wb25lbnQg6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwIC8g5p6E6YCg5Ye95pWw5Y+C5pWwXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0g6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwXG4gKi9cbmZ1bmN0aW9uIHRhZyh0YWdOYW1lLCBDb21wb25lbnQsIHN0YXRpY3MpIHtcbiAgdmFyIHRhZ3MgPSB0aGlzLmNvbXBvbmVudHMgPSB0aGlzLmNvbXBvbmVudHMgfHwge307XG5cbiAgdGhpcy5kb2MuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTsvL2ZvciBvbGQgSUVcblxuICBpZih1dGlscy5pc09iamVjdChDb21wb25lbnQpKSB7XG4gICAgQ29tcG9uZW50ID0gdGhpcy5leHRlbmQoQ29tcG9uZW50LCBzdGF0aWNzKTtcbiAgfVxuICByZXR1cm4gdGFnc1t0YWdOYW1lXSA9IENvbXBvbmVudDtcbn1cblxuLyoqXG4gKiDmn6Xor6Lmn5DmnoTpgKDlh73mlbDkuIvnmoTms6jlhoznu4Tku7ZcbiAqIEBwYXJtIHtTdHJpbmd9IGNvbXBvbmVudE5hbWVcbiAqL1xuZnVuY3Rpb24gZ2V0Q29tcG9uZW50KGNvbXBvbmVudE5hbWUpIHtcbiAgdmFyIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKGNvbXBvbmVudE5hbWUpO1xuICB2YXIgQ3VyQ3N0ciA9IHRoaXM7XG4gIHBhdGhzLmZvckVhY2goZnVuY3Rpb24oY29tTmFtZSkge1xuICAgIEN1ckNzdHIgPSBDdXJDc3RyICYmIEN1ckNzdHIuY29tcG9uZW50c1tjb21OYW1lXTtcbiAgfSk7XG4gIHJldHVybiBDdXJDc3RyIHx8IG51bGw7XG59XG5cbmV4cG9ydHMudGFnID0gZXhwb3J0cy5jb21wb25lbnQgPSB0YWc7XG5leHBvcnRzLmdldENvbXBvbmVudCA9IGdldENvbXBvbmVudDtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcblxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8qKlxuICog5Li6IEJlZSDmnoTpgKDlh73mlbDmt7vliqDmjIfku6QgKGRpcmVjdGl2ZSkuIGBCZWUuZGlyZWN0aXZlYFxuICogQHBhcmFtIHtTdHJpbmd9IGtleSBkaXJlY3RpdmUg5ZCN56ewXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdHNdIGRpcmVjdGl2ZSDlj4LmlbBcbiAqIEBwYXJhbSB7TnVtYmVyfSBvcHRzLnByaW9yaXR5PTAgZGlyZWN0aXZlIOS8mOWFiOe6py4g5ZCM5LiA5Liq5YWD57Sg5LiK55qE5oyH5Luk5oyJ54Wn5LyY5YWI57qn6aG65bqP5omn6KGMLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLnRlcm1pbmFsPWZhbHNlIOaJp+ihjOivpSBkaXJlY3RpdmUg5ZCOLCDmmK/lkKbnu4jmraLlkI7nu60gZGlyZWN0aXZlIOaJp+ihjC5cbiAqICAgdGVybWluYWwg5Li655yf5pe2LCDkuI7or6UgZGlyZWN0aXZlIOS8mOWFiOe6p+ebuOWQjOeahCBkaXJlY3RpdmUg5LuN5Lya57un57ut5omn6KGMLCDovoPkvY7kvJjlhYjnuqfnmoTmiY3kvJrooqvlv73nlaUuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMuYW5jaG9yIGFuY2hvciDkuLogdHJ1ZSDml7YsIOS8muWcqOaMh+S7pOiKgueCueWJjeWQjuWQhOS6p+eUn+S4gOS4quepuueZveeahOagh+iusOiKgueCuS4g5YiG5Yir5a+55bqUIGBhbmNob3JzLnN0YXJ0YCDlkowgYGFuY2hvcnMuZW5kYFxuICovXG5mdW5jdGlvbiBkaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHZhciBkaXJzID0gdGhpcy5kaXJlY3RpdmVzID0gdGhpcy5kaXJlY3RpdmVzIHx8IHt9O1xuXG4gIHJldHVybiBkaXJzW2tleV0gPSBuZXcgRGlyZWN0aXZlKGtleSwgb3B0cyk7XG59XG5cbmZ1bmN0aW9uIERpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdGhpcy50eXBlID0ga2V5O1xuICB1dGlscy5leHRlbmQodGhpcywgb3B0cyk7XG59XG5cbnZhciBhc3RDYWNoZSA9IHt9O1xuXG5EaXJlY3RpdmUucHJvdG90eXBlID0ge1xuICBwcmlvcml0eTogMC8v5p2D6YeNXG4sIHR5cGU6ICcnIC8v5oyH5Luk57G75Z6LXG4sIHN1YlR5cGU6ICcnIC8v5a2Q57G75Z6LLiDmr5TlpoIgYGItb24tY2xpY2tgIOeahCB0eXBlIOS4uiBgb25gLCBzdWJUeXBlIOS4uiBgY2xpY2tgXG4sIHN1YjogZmFsc2UgLy/mmK/lkKblhYHorrjlrZDnsbvlnovmjIfku6RcbiwgbGluazogdXRpbHMubm9vcC8v5Yid5aeL5YyW5pa55rOVXG4sIHVuTGluazogdXRpbHMubm9vcC8v6ZSA5q+B5Zue6LCDXG4sIHVwZGF0ZTogdXRpbHMubm9vcC8v5pu05paw5pa55rOVXG4sIHRlYXJEb3duOiB1dGlscy5ub29wXG4sIHRlcm1pbmFsOiBmYWxzZS8v5piv5ZCm57uI5q2iXG4sIHJlcGxhY2U6IGZhbHNlLy/mmK/lkKbmm7/mjaLlvZPliY3lhYPntKAuIOWmguaenOaYrywg5bCG55So5LiA5Liq56m655qE5paH5pys6IqC54K55pu/5o2i5b2T5YmN5YWD57SgXG4sIHdhdGNoOiB0cnVlLy/mmK/lkKbnm5Hmjqcga2V5IOeahOWPmOWMli4g5aaC5p6c5Li6IGZhbHNlIOeahOivnSwgdXBkYXRlIOaWueazlem7mOiupOWPquS8muWcqOWIneWni+WMluWQjuiwg+eUqOS4gOasoVxuLCBpbW1lZGlhdGU6IHRydWUgLy/mmK/lkKblnKggZGlyIOWIneWni+WMluaXtueri+WNs+aJp+ihjCB1cGRhdGUg5pa55rOVXG5cbiwgYW5jaG9yOiBmYWxzZVxuLCBhbmNob3JzOiBudWxsXG5cbiAgLy/lvZMgYW5jaG9yIOS4uiB0cnVlIOaXtiwg6I635Y+W5Lik5Liq6ZSa54K55LmL6Ze055qE5omA5pyJ6IqC54K5LlxuLCBnZXROb2RlczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gW10sIG5vZGUgPSB0aGlzLmFuY2hvcnMuc3RhcnQubmV4dFNpYmxpbmc7XG4gICAgaWYodGhpcy5hbmNob3IgJiYgbm9kZSkge1xuICAgICAgd2hpbGUobm9kZSAhPT0gdGhpcy5hbmNob3JzLmVuZCl7XG4gICAgICAgIG5vZGVzLnB1c2gobm9kZSk7XG4gICAgICAgIG5vZGUgPSBub2RlLm5leHRTaWJsaW5nO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbm9kZXM7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cbiAgLy/op6PmnpDooajovr7lvI9cbiwgcGFyc2U6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjYWNoZSA9IGFzdENhY2hlW3RoaXMucGF0aF1cbiAgICBpZihjYWNoZSAmJiBjYWNoZS5fdHlwZSA9PT0gdGhpcy50eXBlKXtcbiAgICAgIHRoaXMuYXN0ID0gY2FjaGVcbiAgICB9ZWxzZSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLmFzdCA9IHBhcnNlKHRoaXMucGF0aCwgdGhpcy50eXBlKTtcbiAgICAgICAgdGhpcy5hc3QuX3R5cGUgPSB0aGlzLnR5cGU7XG4gICAgICAgIGFzdENhY2hlW3RoaXMucGF0aF0gPSB0aGlzLmFzdDtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhpcy5hc3QgPSB7fTtcbiAgICAgICAgZS5tZXNzYWdlID0gJ1N5bnRheEVycm9yIGluIFwiJyArIHRoaXMucGF0aCArICdcIiB8ICcgKyBlLm1lc3NhZ2U7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIC8v6KGo6L6+5byP5rGC5YC8XG4gIC8vZm9yZ2l2ZVt0cnVlXTog5piv5ZCm5bCGIHVuZGVmaW5lZCDlj4ogbnVsbCDovazkuLrnqbrlrZfnrKZcbiwgZ2V0VmFsdWU6IGZ1bmN0aW9uKHNjb3BlLCBmb3JnaXZlKSB7XG4gICAgZm9yZ2l2ZSA9IGZvcmdpdmUgIT09IGZhbHNlO1xuICAgIHZhciB2YWw7XG5cbiAgICB0cnl7XG4gICAgICB2YWwgPSBldmFsdWF0ZS5ldmFsKHRoaXMuYXN0LCBzY29wZSwgdGhpcyk7XG4gICAgfWNhdGNoKGUpe1xuICAgICAgdmFsID0gJyc7XG4gICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgIH1cbiAgICBpZihmb3JnaXZlICYmICh1dGlscy5pc1VuZGVmaW5lZCh2YWwpIHx8IHZhbCA9PT0gbnVsbCkpIHtcbiAgICAgIHZhbCA9ICcnO1xuICAgIH1cbiAgICByZXR1cm4gdmFsO1xuICB9XG59O1xuXG52YXIgYXR0clBvc3RSZWcgPSAvXFw/JC87XG5cbi8qKlxuICog6I635Y+W5LiA5Liq5YWD57Sg5LiK5omA5pyJ55SoIEhUTUwg5bGe5oCn5a6a5LmJ55qE5oyH5LukXG4gKiBAcGFyYW0gIHtFbGVtZW50fSBlbCAgIOaMh+S7pOaJgOWcqOWFg+e0oFxuICogQHBhcmFtICB7QmVlfSBjc3RyIOe7hOS7tuaehOmAoOWHveaVsFxuICogQHJldHVybiB7ZGlyZWN0ZXZlW119ICAgICAgYGVsYCDkuIrmiYDmnInnmoTmjIfku6RcbiAqL1xuZnVuY3Rpb24gZ2V0RGlycyhlbCwgY3N0cil7XG4gIHZhciBhdHRyLCBhdHRyTmFtZSwgZGlyTmFtZSwgcHJvdG9cbiAgICAsIGRpcnMgPSBbXSwgZGlyLCBhbmNob3JzID0ge31cbiAgICAsIHBhcmVudCA9IGVsLnBhcmVudE5vZGVcbiAgICAsIG5vZGVOYW1lID0gZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKVxuICAgICwgZGlyZWN0aXZlcyA9IGNzdHIuZGlyZWN0aXZlc1xuICAgICwgcHJlZml4ID0gY3N0ci5wcmVmaXhcbiAgICA7XG5cbiAgLy/lr7nkuo7oh6rlrprkuYnmoIfnrb4sIOWwhuWFtui9rOS4uiBkaXJlY3RpdmVcbiAgaWYoY3N0ci5nZXRDb21wb25lbnQobm9kZU5hbWUpKSB7XG4gICAgZWwuc2V0QXR0cmlidXRlKHByZWZpeCArICdjb21wb25lbnQnLCBub2RlTmFtZSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSBlbC5hdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICBhdHRyID0gZWwuYXR0cmlidXRlc1tpXTtcbiAgICBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG4gICAgZGlyTmFtZSA9IGF0dHJOYW1lLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xuICAgIHByb3RvID0ge2VsOiBlbCwgbm9kZTogYXR0ciwgbm9kZU5hbWU6IGF0dHJOYW1lLCBwYXRoOiBhdHRyLnZhbHVlfTtcbiAgICBkaXIgPSBudWxsO1xuXG4gICAgaWYoYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwICYmIChkaXIgPSBnZXREaXIoZGlyTmFtZSwgZGlyZWN0aXZlcykpKSB7XG4gICAgICAvL+aMh+S7pFxuICAgICAgZGlyLmRpck5hbWUgPSBkaXJOYW1lLy9kaXIg5ZCNXG4gICAgfWVsc2UgaWYodG9rZW4uaGFzVG9rZW4oYXR0ci52YWx1ZSkpIHtcbiAgICAgIC8v5bGe5oCn6KGo6L6+5byP5Y+v6IO95pyJ5aSa5Liq6KGo6L6+5byP5Yy6XG4gICAgICB0b2tlbi5wYXJzZVRva2VuKGF0dHIudmFsdWUpLmZvckVhY2goZnVuY3Rpb24ob3JpZ2luKSB7XG4gICAgICAgIG9yaWdpbi5kaXJOYW1lID0gYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwID8gZGlyTmFtZSA6IGF0dHJOYW1lIDtcbiAgICAgICAgZGlycy5wdXNoKHV0aWxzLmV4dGVuZChjcmVhdGUoZGlyZWN0aXZlcy5hdHRyKSwgcHJvdG8sIG9yaWdpbikpXG4gICAgICB9KTtcbiAgICAgIC8v55Sx5LqO5bey55+l5bGe5oCn6KGo6L6+5byP5LiN5a2Y5ZyoIGFuY2hvciwg5omA5Lul55u05o6l6Lez6L+H5LiL6Z2i55qE5qOA5rWLXG4gICAgfWVsc2UgaWYoYXR0clBvc3RSZWcudGVzdChhdHRyTmFtZSkpIHtcbiAgICAgIC8v5p2h5Lu25bGe5oCn5oyH5LukXG4gICAgICBkaXIgPSB1dGlscy5leHRlbmQoY3JlYXRlKGRpcmVjdGl2ZXMuYXR0ciksIHsgZGlyTmFtZTogYXR0ck5hbWUucmVwbGFjZShhdHRyUG9zdFJlZywgJycpLCBjb25kaXRpb25hbDogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBpZihkaXIpIHtcbiAgICAgIGlmKGRpci5hbmNob3IgJiYgIWFuY2hvcnMuc3RhcnQpIHtcbiAgICAgICAgLy/lkIzkuIDkuKrlhYPntKDkuIrnmoQgZGlyZWN0aXZlIOWFseS6q+WQjOS4gOWvuemUmueCuVxuICAgICAgICBhbmNob3JzLnN0YXJ0ID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyLmRpck5hbWUgKyAnIHN0YXJ0Jyk7XG4gICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoYW5jaG9ycy5zdGFydCwgZWwpO1xuXG4gICAgICAgIGFuY2hvcnMuZW5kID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyLmRpck5hbWUgKyAnIGVuZCcpO1xuICAgICAgICBpZihlbC5uZXh0U2libGluZykge1xuICAgICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoYW5jaG9ycy5lbmQsIGVsLm5leHRTaWJsaW5nKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKGFuY2hvcnMuZW5kKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZGlyLmFuY2hvcnMgPSBkaXIuYW5jaG9yID8gYW5jaG9ycyA6IG51bGw7XG4gICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGRpciwgcHJvdG8pKTtcbiAgICB9XG4gIH1cbiAgZGlycy5zb3J0KGZ1bmN0aW9uKGQwLCBkMSkge1xuICAgIHJldHVybiBkMS5wcmlvcml0eSAtIGQwLnByaW9yaXR5O1xuICB9KTtcbiAgcmV0dXJuIGRpcnM7XG59XG5cbmZ1bmN0aW9uIGdldERpcihkaXJOYW1lLCBkaXJzKSB7XG4gIHZhciBkaXIsIHN1YlR5cGU7XG4gIGZvcih2YXIga2V5IGluIGRpcnMpIHtcbiAgICBpZihkaXJOYW1lID09PSBrZXkpe1xuICAgICAgZGlyID0gZGlyc1trZXldXG4gICAgICBicmVha1xuICAgIH1lbHNlIGlmKGRpck5hbWUuaW5kZXhPZihrZXkgKyAnLScpID09PSAwKXtcbiAgICAgIGRpciA9IGRpcnNba2V5XVxuICAgICAgaWYoIWRpci5zdWIpe1xuICAgICAgICBkaXIgPSBudWxsXG4gICAgICB9ZWxzZXtcbiAgICAgICAgc3ViVHlwZSA9IGRpck5hbWUuc2xpY2Uoa2V5Lmxlbmd0aCArIDEpXG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYoZGlyKSB7XG4gICAgZGlyID0gY3JlYXRlKGRpcik7XG4gICAgZGlyLnN1YlR5cGUgPSBzdWJUeXBlO1xuICB9XG4gIHJldHVybiBkaXI7XG59XG5cbkRpcmVjdGl2ZS5kaXJlY3RpdmUgPSBkaXJlY3RpdmU7XG5kaXJlY3RpdmUuZ2V0RGlycyA9IGdldERpcnM7XG5cbm1vZHVsZS5leHBvcnRzID0gRGlyZWN0aXZlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5bGe5oCn5oyH5LukXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkgey8vYXR0ciBiaW5kaW5nXG4gICAgICB0aGlzLmF0dHJzID0ge307XG4gICAgfWVsc2Uge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/pu5jorqTlsIblgLznva7nqbosIOmYsuatouihqOi+vuW8j+WGheWPmOmHj+S4jeWtmOWcqFxuICAgICAgdGhpcy51cGRhdGUoJycpXG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgbmV3QXR0cnMgPSB7fTtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkge1xuICAgICAgZm9yKHZhciBhdHRyIGluIHZhbCkge1xuICAgICAgICBzZXRBdHRyKGVsLCBhdHRyLCB2YWxbYXR0cl0pO1xuICAgICAgICAvL2lmKHZhbFthdHRyXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmF0dHJzW2F0dHJdO1xuICAgICAgICAvL31cbiAgICAgICAgbmV3QXR0cnNbYXR0cl0gPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvL+enu+mZpOS4jeWcqOS4iuasoeiusOW9leS4reeahOWxnuaAp1xuICAgICAgZm9yKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgcmVtb3ZlQXR0cihlbCwgYXR0cik7XG4gICAgICB9XG4gICAgICB0aGlzLmF0dHJzID0gbmV3QXR0cnM7XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLmNvbmRpdGlvbmFsKSB7XG4gICAgICAgIHZhbCA/IHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdmFsKSA6IHJlbW92ZUF0dHIoZWwsIHRoaXMuZGlyTmFtZSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy50ZXh0TWFwW3RoaXMucG9zaXRpb25dID0gdmFsICYmICh2YWwgKyAnJyk7XG4gICAgICAgIHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdGhpcy50ZXh0TWFwLmpvaW4oJycpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblxuLy9JRSDmtY/op4jlmajlvojlpJrlsZ7mgKfpgJrov4cgYHNldEF0dHJpYnV0ZWAg6K6+572u5ZCO5peg5pWILiBcbi8v6L+Z5Lqb6YCa6L+HIGBlbFthdHRyXSA9IHZhbHVlYCDorr7nva7nmoTlsZ7mgKfljbTog73lpJ/pgJrov4cgYHJlbW92ZUF0dHJpYnV0ZWAg5riF6ZmkLlxuZnVuY3Rpb24gc2V0QXR0cihlbCwgYXR0ciwgdmFsKXtcbiAgdHJ5e1xuICAgIGlmKCgoYXR0ciBpbiBlbCkgfHwgYXR0ciA9PT0gJ2NsYXNzJykpe1xuICAgICAgaWYoYXR0ciA9PT0gJ3N0eWxlJyAmJiBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCB2YWwpO1xuICAgICAgfWVsc2UgaWYoYXR0ciA9PT0gJ2NsYXNzJyl7XG4gICAgICAgIGVsLmNsYXNzTmFtZSA9IHZhbDtcbiAgICAgIH1lbHNle1xuICAgICAgICBlbFthdHRyXSA9IHR5cGVvZiBlbFthdHRyXSA9PT0gJ2Jvb2xlYW4nID8gdHJ1ZSA6IHZhbDtcbiAgICAgIH1cbiAgICB9XG4gIH1jYXRjaChlKXt9XG4gIC8vY2hyb21lIHNldGF0dHJpYnV0ZSB3aXRoIGB7e319YCB3aWxsIHRocm93IGFuIGVycm9yXG4gIGVsLnNldEF0dHJpYnV0ZShhdHRyLCB2YWwpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBdHRyKGVsLCBhdHRyKSB7XG4gIGVsLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbn0iLCIvL2NvbXBvbmVudCBhcyBkaXJlY3RpdmVcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG52YXIgZG9tVXRpbHMgPSByZXF1aXJlKCcuLi9kb20tdXRpbHMnKVxuXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcmlvcml0eTogLTFcbiwgd2F0Y2g6IGZhbHNlXG4sIHVuTGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jb21wb25lbnQgJiYgdGhpcy5jb21wb25lbnQuJGRlc3Ryb3koKVxuICB9XG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB2bSA9IHRoaXMudm07XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgY3N0ciA9IHZtLmNvbnN0cnVjdG9yO1xuICAgIHZhciBjb21wO1xuICAgIC8vdmFyIHJlZk5hbWU7XG4gICAgdmFyIGRpcnMgPSBbXSwgJGRhdGEgPSB7fTtcbiAgICB2YXIgQ29tcCA9IGNzdHIuZ2V0Q29tcG9uZW50KHRoaXMucGF0aClcblxuICAgIGlmKENvbXApIHtcblxuICAgICAgLy9UT0RPXG4gICAgICBpZihDb21wID09PSBjc3RyKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGlycyA9IHRoaXMuZGlycztcblxuICAgICAgZGlycyA9IGRpcnMuZmlsdGVyKGZ1bmN0aW9uIChkaXIpIHtcbiAgICAgICAgLy8gaWYoZGlyLnR5cGUgPT09ICdyZWYnKSB7XG4gICAgICAgIC8vICAgcmVmTmFtZSA9IGRpci5wYXRoO1xuICAgICAgICAvLyB9XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHZhciBjdXJQYXRoLCBjb21QYXRoO1xuXG4gICAgICAgIGN1clBhdGggPSBkaXIucGF0aDtcbiAgICAgICAgaWYoZGlyLnR5cGUgPT09ICd3aXRoJykge1xuICAgICAgICAgIC8vY29tUGF0aCA9ICckZGF0YSdcbiAgICAgICAgICB1dGlscy5leHRlbmQoJGRhdGEsIHZtLiRnZXQoY3VyUGF0aCkpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGNvbVBhdGggPSBkaXIuZGlyTmFtZTtcbiAgICAgICAgICAkZGF0YVtjb21QYXRoXSA9IHZtLiRnZXQoY3VyUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL+ebkeWQrOeItue7hOS7tuabtOaWsCwg5ZCM5q2l5pWw5o2uXG4gICAgICAgIHZtLiR3YXRjaChjdXJQYXRoLCBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgaWYoY29tcCl7XG4gICAgICAgICAgICB2YWwgPSBkaXIudGV4dE1hcCA/IGRpci50ZXh0TWFwLmpvaW4oJycpIDogdmFsO1xuICAgICAgICAgICAgY29tUGF0aCA/IGNvbXAuJHNldChjb21QYXRoLCB2YWwpIDogY29tcC4kc2V0KHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuY29tcG9uZW50ID0gY29tcCA9IG5ldyBDb21wKHtcbiAgICAgICAgJHRhcmdldDogZWwsXG4gICAgICAgIC8vJHJvb3Q6IHZtLiRyb290LFxuICAgICAgICAkZGF0YTogdXRpbHMuZXh0ZW5kKHt9LCBDb21wLnByb3RvdHlwZS4kZGF0YSwgJGRhdGEsIGRvbVV0aWxzLmdldEF0dHJzKGVsKSlcbiAgICAgIH0pO1xuICAgICAgZWwuYmVlID0gY29tcDtcblxuICAgICAgLy8gaWYocmVmTmFtZSkge1xuICAgICAgLy8gICB2bS4kcmVmc1tyZWZOYW1lXSA9IGNvbXA7XG4gICAgICAvLyB9XG5cbiAgICAgIC8v55u05o6l5bCGY29tcG9uZW50IOS9nOS4uuagueWFg+e0oOaXtiwg5ZCM5q2l6Lef5paw5a655ZmoIC4kZWwg5byV55SoXG4gICAgICBpZih2bS4kZWwgPT09IGVsKSB7XG4gICAgICAgIHZtLl9fcmVmID0gY29tcDtcbiAgICAgICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gY29tcDtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgdGhpcy5wYXRoICsgJyBub3QgZGVmaW5lZCEgSWdub3JlJyk7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb21VdGlscyA9IHJlcXVpcmUoJy4uL2RvbS11dGlscycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlcGxhY2U6IHRydWVcbiwgYW5jaG9yOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMgPSBbXTtcbiAgfVxuLCB1bkxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLnVud2F0Y2goKVxuICAgIH0pO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odHBsKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpXG4gICAgdmFyIHBhcmVudCA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZVxuXG4gICAgbm9kZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnVuTGluaygpO1xuXG4gICAgdmFyIGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KHRwbClcblxuICAgIHRoaXMud2F0Y2hlcnMgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMudm0sIGNvbnRlbnQpXG4gICAgcGFyZW50Lmluc2VydEJlZm9yZShjb250ZW50LCB0aGlzLmFuY2hvcnMuZW5kKVxuICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4uL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxudmFyIGRpcnMgPSB7fTtcblxuXG5kaXJzLnRleHQgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLm5vZGUubm9kZVZhbHVlID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuICB9XG59O1xuXG5cbmRpcnMuaHRtbCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5vZGVzID0gW107XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWwuaW5uZXJIVE1MID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuXG4gICAgdmFyIG5vZGU7XG4gICAgd2hpbGUobm9kZSA9IHRoaXMubm9kZXMucG9wKCkpIHtcbiAgICAgIG5vZGUucGFyZW50Tm9kZSAmJiBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfVxuXG4gICAgdmFyIG5vZGVzID0gZWwuY2hpbGROb2RlcztcbiAgICB3aGlsZShub2RlID0gbm9kZXNbMF0pIHtcbiAgICAgIHRoaXMubm9kZXMucHVzaChub2RlKTtcbiAgICAgIHRoaXMuZWwuaW5zZXJ0QmVmb3JlKG5vZGUsIHRoaXMubm9kZSk7XG4gICAgfVxuICB9XG59O1xuXG5cbmRpcnNbJ2lmJ10gPSB7XG4gIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLndhdGNoZXJzID0gW107XG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICB0aGlzLnJlbW92ZSgpO1xuICAgIH1cbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIGlmKHZhbCkge1xuICAgICAgaWYoIXRoaXMuc3RhdGUpIHsgdGhpcy5hZGQoKSB9XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLnN0YXRlKSB7IHRoaXMucmVtb3ZlKCk7IH1cbiAgICB9XG4gICAgdGhpcy5zdGF0ZSA9IHZhbDtcbiAgfVxuXG4sIGFkZDogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFuY2hvciA9IHRoaXMuYW5jaG9ycy5lbmQ7XG4gICAgdGhpcy53YXRjaGVycyA9IGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcy52bSwgdGhpcy5mcmFnKTtcbiAgICBhbmNob3IucGFyZW50Tm9kZSAmJiBhbmNob3IucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5mcmFnLCBhbmNob3IpO1xuICB9XG4sIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpO1xuXG4gICAgaWYobm9kZXMpIHtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBub2Rlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdGhpcy5mcmFnLmFwcGVuZENoaWxkKG5vZGVzW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICAgIHdhdGNoZXIudW53YXRjaCgpXG4gICAgfSlcbiAgICB0aGlzLndhdGNoZXIgPSBbXTtcbiAgfVxufTtcblxuLy/lm77niYfnlKgsIOmBv+WFjeWKoOi9vSBVUkwg5Lit5bim5pyJ5aSn5ous5Y+355qE5Y6f5aeL5qih5p2/5YaF5a65XG5kaXJzLnNyYyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLmVsLnNyYyA9IHZhbDtcbiAgfVxufTtcblxuZGlyc1snd2l0aCddID0ge307XG5cbmRpcnMucmVwZWF0ID0gcmVxdWlyZSgnLi9yZXBlYXQuanMnKTtcbmRpcnMuYXR0ciA9IHJlcXVpcmUoJy4vYXR0ci5qcycpO1xuZGlycy5tb2RlbCA9IHJlcXVpcmUoJy4vbW9kZWwuanMnKTtcbmRpcnMuc3R5bGUgPSByZXF1aXJlKCcuL3N0eWxlLmpzJyk7XG5kaXJzLm9uID0gcmVxdWlyZSgnLi9vbi5qcycpO1xuZGlycy5jb21wb25lbnQgPSByZXF1aXJlKCcuL2NvbXBvbmVudC5qcycpO1xuZGlycy5jb250ZW50ID0gcmVxdWlyZSgnLi9jb250ZW50LmpzJylcbmRpcnMucmVmID0gcmVxdWlyZSgnLi9yZWYuanMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpcnM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIGhhc1Rva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKS5oYXNUb2tlblxuICAsIGV2ZW50cyA9IHJlcXVpcmUoJy4uL2V2ZW50LWJpbmQuanMnKVxuICA7XG5cbnZhciBsaW5rZXJzID0ge1xuICBpbnB1dDoge1xuICAgIHNldDogZnVuY3Rpb24oKSB7XG5cbiAgICB9XG4gICwgZ2V0OiBmdW5jdGlvbigpIHtcblxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtaW5hbDogdHJ1ZVxuLCBwcmlvcml0eTogMVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIga2V5UGF0aCA9IHRoaXMucGF0aDtcbiAgICB2YXIgdm0gPSB0aGlzLnZtO1xuXG4gICAgaWYoIWtleVBhdGgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICB2YXIgZWwgPSB0aGlzLmVsXG4gICAgICAsIGV2ID0gJ2NoYW5nZSdcbiAgICAgICwgYXR0ciwgdmFsdWUgPSBhdHRyID0gJ3ZhbHVlJ1xuICAgICAgLCBpc1NldERlZmF1dCA9IHV0aWxzLmlzVW5kZWZpbmVkKHZtLiRnZXQoa2V5UGF0aCkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG4gICAgICAsIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gZWxbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBlbFthdHRyXSA9IG5ld1ZhbDsgfVxuICAgICAgICB9XG4gICAgICAsIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICB2YXIgdmFsID0gZWxbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgdm0uJHNldChrZXlQYXRoLCB2YWwpO1xuICAgICAgICB9XG4gICAgICAsIGNhbGxIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgIGlmKGUgJiYgZS5wcm9wZXJ0eU5hbWUgJiYgZS5wcm9wZXJ0eU5hbWUgIT09IGF0dHIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgIH1cbiAgICAgICwgaWUgPSB1dGlscy5pZVxuICAgICAgO1xuXG4gICAgc3dpdGNoKGVsLnRhZ05hbWUpIHtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHZhbHVlID0gYXR0ciA9ICdpbm5lckhUTUwnO1xuICAgICAgICAvL2V2ICs9ICcgYmx1cic7XG4gICAgICBjYXNlICdJTlBVVCc6XG4gICAgICBjYXNlICdURVhUQVJFQSc6XG4gICAgICAgIHN3aXRjaChlbC50eXBlKSB7XG4gICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxuICAgICAgICAgICAgdmFsdWUgPSBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgLy9JRTYsIElFNyDkuIvnm5HlkKwgcHJvcGVydHljaGFuZ2Ug5Lya5oyCP1xuICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdyYWRpbyc6XG4gICAgICAgICAgICBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgIGVsLmNoZWNrZWQgPSBlbC52YWx1ZSA9PT0gdmFsICsgJyc7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaXNTZXREZWZhdXQgPSBlbC5jaGVja2VkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZighdm0uJGxhenkpe1xuICAgICAgICAgICAgICBpZignb25pbnB1dCcgaW4gZWwpe1xuICAgICAgICAgICAgICAgIGV2ICs9ICcgaW5wdXQnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vSUUg5LiL55qEIGlucHV0IOS6i+S7tuabv+S7o1xuICAgICAgICAgICAgICBpZihpZSkge1xuICAgICAgICAgICAgICAgIGV2ICs9ICcga2V5dXAgcHJvcGVydHljaGFuZ2UgY3V0JztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1NFTEVDVCc6XG4gICAgICAgIGlmKGVsLm11bHRpcGxlKXtcbiAgICAgICAgICBoYW5kbGVyID0gZnVuY3Rpb24oaXNJbml0KSB7XG4gICAgICAgICAgICB2YXIgdmFscyA9IFtdO1xuICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGVsLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgaWYoZWwub3B0aW9uc1tpXS5zZWxlY3RlZCl7IHZhbHMucHVzaChlbC5vcHRpb25zW2ldLnZhbHVlKSB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2bS4kcmVwbGFjZShrZXlQYXRoLCB2YWxzKTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24odmFscyl7XG4gICAgICAgICAgICBpZih2YWxzICYmIHZhbHMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGVsLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgICBlbC5vcHRpb25zW2ldLnNlbGVjdGVkID0gdmFscy5pbmRleE9mKGVsLm9wdGlvbnNbaV0udmFsdWUpICE9PSAtMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaXNTZXREZWZhdXQgPSBpc1NldERlZmF1dCAmJiAhaGFzVG9rZW4oZWxbdmFsdWVdKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlID0gY2FsbGJhY2s7XG5cbiAgICBldi5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKGUpe1xuICAgICAgZXZlbnRzLnJlbW92ZUV2ZW50KGVsLCBlLCBjYWxsSGFuZGxlcik7XG4gICAgICBldmVudHMuYWRkRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICB9KTtcblxuICAgIC8v5qC55o2u6KGo5Y2V5YWD57Sg55qE5Yid5aeL5YyW6buY6K6k5YC86K6+572u5a+55bqUIG1vZGVsIOeahOWAvFxuICAgIGlmKGVsW3ZhbHVlXSAmJiBpc1NldERlZmF1dCl7XG4gICAgICAgaGFuZGxlcih0cnVlKTtcbiAgICB9XG5cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+S6i+S7tuebkeWQrFxuXG52YXIgZXZlbnRCaW5kID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHN1YjogdHJ1ZVxuLCBpbW1lZGlhdGU6IGZhbHNlIC8vIHdhdGNoIOWSjCBpbW1lZGlhdGUg5ZCM5pe25Li6IGZhbHNlIOaXtiwg5oyH5Luk55qEIHVwZGF0ZSDmlrnms5XlsIbkuI3kvJroh6rliqjooqvlpJbpg6josIPnlKhcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRpciA9IHRoaXM7XG4gICAgaWYodGhpcy5zdWJUeXBlKXtcbiAgICAgIC8vIGJlLW9uLWNsaWNrIOetiVxuICAgICAgZXZlbnRCaW5kLmFkZEV2ZW50KHRoaXMuZWwsIHRoaXMuc3ViVHlwZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGRpci52bS4kZ2V0KGRpci5wYXRoKVxuICAgICAgfSlcbiAgICB9ZWxzZXtcbiAgICAgIC8vbGluayDmlrnms5XnmoTosIPnlKjlnKggd2F0Y2hlciDmo4DmtYsgaW1tZWRpYXRlIOS5i+WJjSxcbiAgICAgIC8v5omA5Lul5Y+v5Lul5Zyo6L+Z6YeM5bCGIGltbWVkaWF0ZSDnva7kuLogdHJ1ZSDku6Xkvr/oh6rliqjosIPnlKggdXBkYXRlIOaWueazlVxuICAgICAgdGhpcy5pbW1lZGlhdGUgPSB0cnVlO1xuICAgICAgLy90aGlzLnVwZGF0ZSh0aGlzLnZtLiRnZXQodGhpcy5wYXRoKSlcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3Rvci5zaGlmdCgpO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5qb2luKCcgJyk7XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG4vL+imgeaxgiBJRTgrXG5mdW5jdGlvbiBjYWxsSGFuZGxlciAoZGlyLCBzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICB2YXIgY3VyID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIHZhciBlbHMgPSBzZWxlY3RvciA/IHV0aWxzLnRvQXJyYXkoZGlyLmVsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSA6IFtjdXJdO1xuICAgIGRve1xuICAgICAgaWYoZWxzLmluZGV4T2YoY3VyKSA+PSAwKSB7XG4gICAgICAgIGUuZGVsZWdhdGVUYXJnZXQgPSBjdXI7Ly/lp5TmiZjlhYPntKBcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoZGlyLnZtLCBlKVxuICAgICAgfVxuICAgIH13aGlsZShjdXIgPSBjdXIucGFyZW50Tm9kZSlcbiAgfVxufVxuIiwiXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB3YXRjaDogZmFsc2VcbiwgcHJpb3JpdHk6IC0yIC8vIHJlZiDlupTor6XlnKggY29tcG9uZW50IOS5i+WQjlxuLCB1bkxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHV0aWxzLmlzQXJyYXkodGhpcy5yZWYpKSB7XG4gICAgICB0aGlzLnJlZi5zcGxpY2UodGhpcy52bS4kaW5kZXgsIDEpXG4gICAgfWVsc2V7XG4gICAgICB0aGlzLnZtLiRyZWZzW3RoaXMucGF0aF0gPSBudWxsO1xuICAgIH1cbiAgfVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdm0gPSB0aGlzLnZtXG4gICAgLy/lnKggYHJlcGVhdGAg5YWD57Sg5LiK55qEIGByZWZgIOS8muaMh+WQkeWMv+WQjSBgdmlld21vZGVsYFxuICAgIGlmKHZtLl9fcmVwZWF0KXtcbiAgICAgIGlmKCF2bS4kaW5kZXgpIHtcbiAgICAgICAgdm0uJHBhcmVudC4kcmVmc1t0aGlzLnBhdGhdID0gW107XG4gICAgICB9XG4gICAgICB0aGlzLnJlZiA9IHZtLiRwYXJlbnQuJHJlZnNbdGhpcy5wYXRoXVxuICAgICAgdGhpcy5yZWZbdm0uJGluZGV4XSA9IHZtO1xuICAgIH1lbHNle1xuICAgICAgdm0uJHJlZnNbdGhpcy5wYXRoXSA9IHRoaXMuZWwuYmVlIHx8IHRoaXMuZWw7XG4gICAgfVxuICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4uL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgc2NvcGUgPSByZXF1aXJlKCcuLi9zY29wZScpXG4gIDtcblxuLy/ov5nkupvmlbDnu4Tmk43kvZzmlrnms5Xooqvph43lhpnmiJDoh6rliqjop6blj5Hmm7TmlrBcbnZhciBhcnJheU1ldGhvZHMgPSBbJ3NwbGljZScsICdwdXNoJywgJ3BvcCcsICdzaGlmdCcsICd1bnNoaWZ0JywgJ3NvcnQnLCAncmV2ZXJzZSddO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcHJpb3JpdHk6IDEwMDBcbiwgYW5jaG9yOiB0cnVlXG4sIHRlcm1pbmFsOiB0cnVlXG4sIHVuTGluazogZnVuY3Rpb24oKXtcbiAgICB0aGlzLnZtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uKHZtKXtcbiAgICAgIHZtLiRkZXN0cm95KClcbiAgICB9KVxuICB9XG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjc3RyID0gdGhpcy5jc3RyID0gdGhpcy52bS5jb25zdHJ1Y3RvcjtcblxuICAgIHdoaWxlKGNzdHIuX19zdXBlcl9fKXtcbiAgICAgIGNzdHIgPSBjc3RyLl9fc3VwZXJfXy5jb25zdHJ1Y3RvcjtcbiAgICB9XG5cbiAgICB0aGlzLnRyYWNrSWQgPSB0aGlzLmVsLmdldEF0dHJpYnV0ZSgndHJhY2stYnknKVxuICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKCd0cmFjay1ieScpXG5cbiAgICAvL+WPque7p+aJv+mdmeaAgeeahOm7mOiupOWPguaVsFxuICAgIHRoaXMuY3N0ciA9IGNzdHIuZXh0ZW5kKHt9LCB0aGlzLmNzdHIpXG5cbiAgICB0aGlzLmN1ckFyciA9IFtdO1xuICAgIHRoaXMudm1MaXN0ID0gW107Ly/lrZAgVk0gbGlzdFxuXG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgdmFyIHRoYXQgPSB0aGlzLCBsaXN0ID0gdGhpcy52bUxpc3Q7XG4gICAgdmFyIHRyYWNrSWQgPSB0aGlzLnRyYWNrSWQ7XG5cbiAgICBpZih1dGlscy5pc0FycmF5KGl0ZW1zKSkge1xuICAgICAgLy8g5ZyoIHJlcGVhdCDmjIfku6Tooajovr7lvI/kuK3nm7jlhbPlj5jph49cbiAgICAgIHRoaXMubGlzdFBhdGggPSB0aGlzLnN1bW1hcnkucGF0aHMuZmlsdGVyKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgcmV0dXJuICF1dGlscy5pc0Z1bmN0aW9uKHRoYXQudm0uJGdldChwYXRoKSlcbiAgICAgIH0pO1xuXG4gICAgICAvL+WIoOmZpOWFg+e0oFxuICAgICAgYXJyRGlmZihjdXJBcnIsIGl0ZW1zLCB0cmFja0lkKS5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgdmFyIHBvcyA9IGluZGV4QnlUcmFja0lkKGl0ZW0sIGN1ckFyciwgdHJhY2tJZClcbiAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDEpXG4gICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobGlzdFtwb3NdLiRlbClcbiAgICAgICAgbGlzdFtwb3NdLiRkZXN0cm95KClcbiAgICAgICAgbGlzdC5zcGxpY2UocG9zLCAxKVxuICAgICAgfSlcblxuICAgICAgaXRlbXMuZm9yRWFjaChmdW5jdGlvbihpdGVtLCBpKSB7XG4gICAgICAgIHZhciBwb3MgPSBpbmRleEJ5VHJhY2tJZChpdGVtLCBpdGVtcywgdHJhY2tJZCwgaSlcbiAgICAgICAgICAsIG9sZFBvcyA9IGluZGV4QnlUcmFja0lkKGl0ZW0sIGN1ckFyciwgdHJhY2tJZCwgaSlcbiAgICAgICAgICAsIHZtLCBlbFxuICAgICAgICAgIDtcblxuICAgICAgICAvL3BvcyA8IDAgJiYgKHBvcyA9IGl0ZW1zLmxhc3RJbmRleE9mKGl0ZW0sIGkpKTtcbiAgICAgICAgLy9vbGRQb3MgPCAwICYmIChvbGRQb3MgPSBjdXJBcnIubGFzdEluZGV4T2YoaXRlbSwgaSkpO1xuXG4gICAgICAgIC8v5paw5aKe5YWD57SgXG4gICAgICAgIGlmKG9sZFBvcyA8IDApIHtcblxuICAgICAgICAgIGVsID0gdGhpcy5lbC5jbG9uZU5vZGUodHJ1ZSlcblxuICAgICAgICAgIHZtID0gbmV3IHRoaXMuY3N0cihlbCwge1xuICAgICAgICAgICAgJGRhdGE6IGl0ZW0sIF9hc3NpZ25tZW50czogdGhpcy5zdW1tYXJ5LmFzc2lnbm1lbnRzLCAkaW5kZXg6IHBvcyxcbiAgICAgICAgICAgICRyb290OiB0aGlzLnZtLiRyb290LCAkcGFyZW50OiB0aGlzLnZtLFxuICAgICAgICAgICAgX19yZXBlYXQ6IHRydWVcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh2bS4kZWwsIGxpc3RbcG9zXSAmJiBsaXN0W3Bvc10uJGVsIHx8IHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgbGlzdC5zcGxpY2UocG9zLCAwLCB2bSk7XG4gICAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDAsIGl0ZW0pXG5cbiAgICAgICAgICAvL+W7tuaXtui1i+WAvOe7mSBgX3JlbGF0aXZlUGF0aGAsIOmBv+WFjeWHuueOsOatu+W+queOr1xuICAgICAgICAgIC8v5aaC5p6c5Zyo5LiK6Z2i5a6e5L6L5YyW5pe25b2T5Y+C5pWw5Lyg5YWlLCDkvJrlhpLms6HliLDniLbnuqcgdm0g6YCS5b2S6LCD55So6L+Z6YeM55qEIHVwZGF0ZSDmlrnms5UsIOmAoOaIkOatu+W+queOry5cbiAgICAgICAgICB2bS5fcmVsYXRpdmVQYXRoID0gdGhpcy5saXN0UGF0aDtcbiAgICAgICAgfWVsc2Uge1xuXG4gICAgICAgICAgLy/osIPluo9cbiAgICAgICAgICBpZiAocG9zICE9PSBvbGRQb3MpIHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3Rbb2xkUG9zXS4kZWwsIGxpc3RbcG9zXSAmJiBsaXN0W3Bvc10uJGVsIHx8IHRoYXQuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShsaXN0W3Bvc10uJGVsLCBsaXN0W29sZFBvcyArIDFdICYmIGxpc3Rbb2xkUG9zICsgMV0uJGVsIHx8IHRoYXQuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgICBsaXN0W29sZFBvc10gPSBbbGlzdFtwb3NdLCBsaXN0W3Bvc10gPSBsaXN0W29sZFBvc11dWzBdXG4gICAgICAgICAgICBjdXJBcnJbb2xkUG9zXSA9IFtjdXJBcnJbcG9zXSwgY3VyQXJyW3Bvc10gPSBjdXJBcnJbb2xkUG9zXV1bMF1cbiAgICAgICAgICAgIGxpc3RbcG9zXS4kaW5kZXggPSBwb3NcbiAgICAgICAgICAgIGxpc3RbcG9zXS4kdXBkYXRlKCckaW5kZXgnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgICAvL+abtOaWsOe0ouW8lVxuICAgICAgbGlzdC5mb3JFYWNoKGZ1bmN0aW9uKHZtLCBpKSB7XG4gICAgICAgIHZtLiRpbmRleCA9IGlcbiAgICAgICAgdm0uJGVsLiRpbmRleCA9IGlcbiAgICAgICAgdm0uJHVwZGF0ZSgnJGluZGV4JywgZmFsc2UpXG4gICAgICB9KTtcblxuICAgICAgdGhpcy5zdW1tYXJ5LnBhdGhzLmZvckVhY2goZnVuY3Rpb24obG9jYWxLZXkpIHtcbiAgICAgICAgdmFyIGxvY2FsID0gdGhhdC52bS4kZ2V0KGxvY2FsS2V5KTtcbiAgICAgICAgdmFyIGRpcnMgPSBsb2NhbC5fX2RpcnNfXztcbiAgICAgICAgaWYodXRpbHMuaXNBcnJheShsb2NhbCkpIHtcbiAgICAgICAgICBpZighZGlycyl7XG4gICAgICAgICAgICAvL+aVsOe7hOaTjeS9nOaWueazlVxuICAgICAgICAgICAgdXRpbHMuZXh0ZW5kKGxvY2FsLCB7XG4gICAgICAgICAgICAgICRzZXQ6IGZ1bmN0aW9uKGksIGl0ZW0pIHtcbiAgICAgICAgICAgICAgICBsb2NhbC5zcGxpY2UoaSwgMSwgdXRpbHMuaXNPYmplY3QoaXRlbSkgPyB1dGlscy5leHRlbmQoe30sIGxvY2FsW2ldLCBpdGVtKSA6IGl0ZW0pXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICRyZXBsYWNlOiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEsIGl0ZW0pXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICRyZW1vdmU6IGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgICAgICAgICBsb2NhbC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYXJyYXlNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgICAgICAgICAgIGxvY2FsW21ldGhvZF0gPSB1dGlscy5hZnRlckZuKGxvY2FsW21ldGhvZF0sIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbihkaXIpIHtcbiAgICAgICAgICAgICAgICAgIGRpci5saXN0UGF0aC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlZm9ybWVkID0gc2NvcGUucmVmb3JtU2NvcGUoZGlyLnZtLCBwYXRoKVxuICAgICAgICAgICAgICAgICAgICByZWZvcm1lZC52bS4kdXBkYXRlKHJlZm9ybWVkLnBhdGgpXG4gICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGRpcnMgPSBsb2NhbC5fX2RpcnNfXyAgPSBbXTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy/kuIDkuKrmlbDnu4TlpJrlpITkvb/nlKhcbiAgICAgICAgICAvL1RPRE8g56e76Zmk5pe255qE5oOF5Ya1XG4gICAgICAgICAgaWYoZGlycy5pbmRleE9mKHRoYXQpID09PSAtMSkge1xuICAgICAgICAgICAgZGlycy5wdXNoKHRoYXQpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgfWVsc2V7XG4gICAgICAvL1RPRE8g5pmu6YCa5a+56LGh55qE6YGN5Y6GXG4gICAgfVxuICB9XG59O1xuXG5cbmZ1bmN0aW9uIGFyckRpZmYoYXJyMSwgYXJyMiwgdHJhY2tJZCkge1xuICB2YXIgYXJyMkNvcHkgPSBhcnIyLnNsaWNlKCk7XG4gIHJldHVybiBhcnIxLmZpbHRlcihmdW5jdGlvbihlbCkge1xuICAgIHZhciByZXN1bHQsIGluZGV4ID0gaW5kZXhCeVRyYWNrSWQoZWwsIGFycjJDb3B5LCB0cmFja0lkKVxuICAgIGlmKGluZGV4IDwgMCkge1xuICAgICAgcmVzdWx0ID0gdHJ1ZVxuICAgIH1lbHNle1xuICAgICAgYXJyMkNvcHkuc3BsaWNlKGluZGV4LCAxKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGluZGV4QnlUcmFja0lkKGl0ZW0sIGxpc3QsIHRyYWNrSWQsIHN0YXJ0SW5kZXgpIHtcbiAgc3RhcnRJbmRleCA9IHN0YXJ0SW5kZXggfHwgMDtcbiAgdmFyIGluZGV4ID0gbGlzdC5pbmRleE9mKGl0ZW0sIHN0YXJ0SW5kZXgpO1xuICBpZihpbmRleCA9PT0gLTEgJiYgdHJhY2tJZCl7XG4gICAgZm9yKHZhciBpID0gc3RhcnRJbmRleCwgaXRlbTE7IGl0ZW0xID0gbGlzdFtpXTsgaSsrKSB7XG4gICAgICBpZihpdGVtW3RyYWNrSWRdID09PSAgaXRlbTFbdHJhY2tJZF0gJiYgIXV0aWxzLmlzVW5kZWZpbmVkKGl0ZW1bdHJhY2tJZF0pKXtcbiAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGluZGV4O1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5qC35byP5oyH5LukXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG52YXIgY2FtZWxSZWcgPSAvKFtBLVpdKS9nO1xuXG4vL+m7mOiupOWNleS9jeS4uiBweCDnmoTlsZ7mgKdcbnZhciBwaXhlbEF0dHJzID0gW1xuICAnd2lkdGgnLCdoZWlnaHQnLCdtaW4td2lkdGgnLCAnbWluLWhlaWdodCcsICdtYXgtd2lkdGgnLCAnbWF4LWhlaWdodCcsXG4gICdtYXJnaW4nLCAnbWFyZ2luLXRvcCcsICdtYXJnaW4tcmlnaHQnLCAnbWFyZ2luLWxlZnQnLCAnbWFyZ2luLWJvdHRvbScsXG4gICdwYWRkaW5nJywgJ3BhZGRpbmctdG9wJywgJ3BhZGRpbmctcmlnaHQnLCAncGFkZGluZy1ib3R0b20nLCAncGFkZGluZy1sZWZ0JyxcbiAgJ3RvcCcsICdsZWZ0JywgJ3JpZ2h0JywgJ2JvdHRvbSdcbl1cblxuLy/lr7nkuo4gSUU2LCBJRTcg5rWP6KeI5Zmo6ZyA6KaB5L2/55SoIGBlbC5zdHlsZS5nZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnKWAg5LiOIGBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnKWAg5p2l6K+75YaZIHN0eWxlIOWtl+espuWxnuaAp1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5pbml0U3R5bGUgPSB0aGlzLmVsLnN0eWxlLmdldEF0dHJpYnV0ZSA/IHRoaXMuZWwuc3R5bGUuZ2V0QXR0cmlidXRlKCdjc3NUZXh0JykgOiB0aGlzLmVsLmdldEF0dHJpYnV0ZSgnc3R5bGUnKVxuICB9LFxuICB1cGRhdGU6IGZ1bmN0aW9uKHN0eWxlcykge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIHN0eWxlU3RyID0gdGhpcy5pbml0U3R5bGUgPyB0aGlzLmluaXRTdHlsZS5yZXBsYWNlKC87PyQvLCAnOycpIDogJyc7XG4gICAgdmFyIGRhc2hLZXksIHZhbDtcblxuICAgIGlmKHR5cGVvZiBzdHlsZXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICBzdHlsZVN0ciArPSBzdHlsZXM7XG4gICAgfWVsc2Uge1xuICAgICAgZm9yICh2YXIga2V5IGluIHN0eWxlcykge1xuICAgICAgICB2YWwgPSBzdHlsZXNba2V5XTtcblxuICAgICAgICAvL21hcmdpblRvcCAtPiBtYXJnaW4tdG9wLiDpqbzls7Dovazov57mjqXnrKblvI9cbiAgICAgICAgZGFzaEtleSA9IGtleS5yZXBsYWNlKGNhbWVsUmVnLCBmdW5jdGlvbiAodXBwZXJDaGFyKSB7XG4gICAgICAgICAgcmV0dXJuICctJyArIHVwcGVyQ2hhci50b0xvd2VyQ2FzZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocGl4ZWxBdHRycy5pbmRleE9mKGRhc2hLZXkpID49IDAgJiYgdXRpbHMuaXNOdW1lcmljKHZhbCkpIHtcbiAgICAgICAgICB2YWwgKz0gJ3B4JztcbiAgICAgICAgfVxuICAgICAgICBpZighdXRpbHMuaXNVbmRlZmluZWQodmFsKSl7XG4gICAgICAgICAgc3R5bGVTdHIgKz0gZGFzaEtleSArICc6ICcgKyB2YWwgKyAnOyAnO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmKGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAvL+iAgSBJRVxuICAgICAgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0Jywgc3R5bGVTdHIpO1xuICAgIH1lbHNle1xuICAgICAgZWwuc2V0QXR0cmlidXRlKCdzdHlsZScsIHN0eWxlU3RyKTtcbiAgICB9XG4gIH1cbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKVxuXG4vL+WkhOeQhiAkdGFyZ2V0LCAgJGNvbnRlbnQsICR0cGxcbi8vdGFyZ2V0OiBlbCDmm7/mjaLnmoTnm67moIdcbmZ1bmN0aW9uIHRwbFBhcnNlKHRwbCwgdGFyZ2V0LCBjb250ZW50KSB7XG4gIHZhciBlbDtcbiAgaWYodXRpbHMuaXNPYmplY3QodGFyZ2V0KSAmJiB0YXJnZXQuY2hpbGROb2Rlcykge1xuICAgIGNvbnRlbnQgPSBjcmVhdGVDb250ZW50KHRhcmdldC5jaGlsZE5vZGVzKTtcbiAgfWVsc2V7XG4gICAgaWYoY29udGVudCkge1xuICAgICAgY29udGVudCA9IGNyZWF0ZUNvbnRlbnQoY29udGVudClcbiAgICB9XG4gIH1cblxuICBpZih1dGlscy5pc09iamVjdCh0cGwpKXtcbiAgICAvL0RPTSDlhYPntKBcbiAgICBlbCA9IHRwbDtcbiAgICB0cGwgPSBlbC5vdXRlckhUTUw7XG4gIH1lbHNle1xuICAgIC8v5a2X56ym5LiyXG4gICAgZWwgPSBjcmVhdGVDb250ZW50KHRwbCkuY2hpbGROb2Rlc1swXTtcbiAgfVxuXG4gIGlmKHRhcmdldCl7XG4gICAgdGFyZ2V0LnBhcmVudE5vZGUgJiYgdGFyZ2V0LnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGVsLCB0YXJnZXQpO1xuICB9XG5cbiAgcmV0dXJuIHtlbDogZWwsIHRwbDogdHBsLCBjb250ZW50OiBjb250ZW50fTtcbn1cblxuLy/lsIbmqKHmnb8v5YWD57SgL25vZGVsaXN0IOWMheijueWcqCBmcmFnbWVudCDkuK1cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRlbnQodHBsKSB7XG4gIHZhciBjb250ZW50ID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgdmFyIHdyYXBlcjtcbiAgdmFyIG5vZGVzID0gW107XG4gIGlmKHV0aWxzLmlzT2JqZWN0KHRwbCkpIHtcbiAgICBpZih0cGwubm9kZU5hbWUgJiYgdHBsLm5vZGVUeXBlKSB7XG4gICAgICAvL2RvbSDlhYPntKBcbiAgICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQodHBsKTtcbiAgICB9ZWxzZSBpZignbGVuZ3RoJyBpbiB0cGwpe1xuICAgICAgLy9ub2RlbGlzdFxuICAgICAgbm9kZXMgPSB0cGw7XG4gICAgfVxuICB9ZWxzZSB7XG4gICAgd3JhcGVyID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG4gICAgLy/oh6rlrprkuYnmoIfnrb7lnKggSUU4IOS4i+aXoOaViC4g5L2/55SoIGNvbXBvbmVudCDmjIfku6Tmm7/ku6NcbiAgICB3cmFwZXIuaW5uZXJIVE1MID0gKHRwbCArICcnKS50cmltKCk7XG4gICAgbm9kZXMgPSB3cmFwZXIuY2hpbGROb2RlcztcbiAgfVxuICB3aGlsZShub2Rlc1swXSkge1xuICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQobm9kZXNbMF0pXG4gIH1cbiAgcmV0dXJuIGNvbnRlbnQ7XG59XG5cbi8vaHRtbCDkuK3lsZ7mgKflkI3kuI3ljLrliIblpKflsI/lhpksIOW5tuS4lOS8muWFqOmDqOi9rOaIkOWwj+WGmS5cbi8v6L+Z6YeM5Lya5bCG6L+e5a2X56ym5YaZ5rOV6L2s5oiQ6am85bOw5byPXG4vL2F0dHItbmFtZSAtLT4gYXR0ck5hbWVcbi8vYXR0ci0tbmFtZSAtLT4gYXR0ci1uYW1lXG52YXIgaHlwaGVuc1JlZyA9IC8tKC0/KShbYS16XSkvaWc7XG52YXIgaHlwaGVuVG9DYW1lbCA9IGZ1bmN0aW9uKGF0dHJOYW1lKSB7XG4gIHJldHVybiBhdHRyTmFtZS5yZXBsYWNlKGh5cGhlbnNSZWcsIGZ1bmN0aW9uKHMsIGRhc2gsIGNoYXIpIHtcbiAgICByZXR1cm4gZGFzaCA/IGRhc2ggKyBjaGFyIDogY2hhci50b1VwcGVyQ2FzZSgpO1xuICB9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdHBsUGFyc2U6IHRwbFBhcnNlLFxuICBjcmVhdGVDb250ZW50OiBjcmVhdGVDb250ZW50LFxuXG4gIC8v6I635Y+W5YWD57Sg5bGe5oCnXG4gIGdldEF0dHJzOiBmdW5jdGlvbihlbCkge1xuICAgIHZhciBhdHRyaWJ1dGVzID0gZWwuYXR0cmlidXRlcztcbiAgICB2YXIgYXR0cnMgPSB7fTtcblxuICAgIGZvcih2YXIgaSA9IGF0dHJpYnV0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIC8v6L+e5o6l56ym6L2s6am85bOw5YaZ5rOVXG4gICAgICBhdHRyc1toeXBoZW5Ub0NhbWVsKGF0dHJpYnV0ZXNbaV0ubm9kZU5hbWUpXSA9IGF0dHJpYnV0ZXNbaV0udmFsdWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF0dHJzO1xuICB9XG59OyIsIihmdW5jdGlvbihyb290KXtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZXhwb3J0cy5yb290ID0gcm9vdDtcbiAgZXhwb3J0cy5kb2N1bWVudCA9IHJvb3QuZG9jdW1lbnQgfHwgcmVxdWlyZSgnanNkb20nKS5qc2RvbSgpO1xuXG59KSgoZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXN9KSgpKTtcbiIsIi8qKlxuICog6KGo6L6+5byP5omn6KGMXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBzY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKVxuXG52YXIgb3BlcmF0b3JzID0ge1xuICAndW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbih2KSB7IHJldHVybiArdjsgfVxuICAsICctJzogZnVuY3Rpb24odikgeyByZXR1cm4gLXY7IH1cbiAgLCAnISc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICF2OyB9XG5cbiAgLCAnWyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdjsgfVxuICAsICd7JzogZnVuY3Rpb24odil7XG4gICAgICB2YXIgciA9IHt9O1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IHYubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHJbdltpXVswXV0gPSB2W2ldWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICAsICd0eXBlb2YnOiBmdW5jdGlvbih2KXsgcmV0dXJuIHR5cGVvZiB2OyB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gbmV3IHYgfVxuICB9XG5cbiwgJ2JpbmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKyByOyB9XG4gICwgJy0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC0gcjsgfVxuICAsICcqJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAqIHI7IH1cbiAgLCAnLyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLyByOyB9XG4gICwgJyUnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICUgcjsgfVxuICAsICc8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8IHI7IH1cbiAgLCAnPic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPiByOyB9XG4gICwgJzw9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8PSByOyB9XG4gICwgJz49JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+PSByOyB9XG4gICwgJz09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PSByOyB9XG4gICwgJyE9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPSByOyB9XG4gICwgJz09PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT09IHI7IH1cbiAgLCAnIT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPT0gcjsgfVxuICAsICcmJic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJiYgcjsgfVxuICAsICd8fCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgfHwgcjsgfVxuICAsICcsJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCwgcjsgfVxuXG4gICwgJy4nOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihyKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuICAsICdbJzogZnVuY3Rpb24obCwgcikge1xuICAgICAgaWYodHlwZW9mIHIgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuXG4gICAgLy9UT0RPIOaooeadv+S4reaWueazleeahCB0aGlzIOW6lOivpeaMh+WQkSByb290XG4gICwgJygnOiBmdW5jdGlvbihsLCByKXsgcmV0dXJuIGwuYXBwbHkoY29udGV4dC5sb2NhbHMsIHIpIH1cbiAgICAvL2ZpbHRlci4gbmFtZXxmaWx0ZXJcbiAgLCAnfCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gY2FsbEZpbHRlcihsLCByLCBbXSkgfVxuICAsICduZXcnOiBmdW5jdGlvbihsLCByKXtcbiAgICAgIHJldHVybiBsID09PSBEYXRlID8gbmV3IEZ1bmN0aW9uKCdyZXR1cm4gbmV3IERhdGUoJyArIHIuam9pbignLCAnKSArICcpJykoKSA6IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkobCwgcikpO1xuICAgIH1cblxuICAsICdpbic6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgaWYodGhpcy5yZXBlYXQpIHtcbiAgICAgICAgLy9yZXBlYXRcbiAgICAgICAgcmV0dXJuIHI7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIGwgaW4gcjtcbiAgICAgIH1cbiAgICB9XG4gICwgJ2NhdGNoYnknOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihsWydjYXRjaCddKSB7XG4gICAgICAgIHJldHVybiBsWydjYXRjaCddKHIuYmluZChyb290KSlcbiAgICAgIH1lbHNle1xuICAgICAgICBzdW1tYXJ5Q2FsbCB8fCBjb25zb2xlLmVycm9yKCdjYXRjaGJ5IGV4cGVjdCBhIHByb21pc2UnKVxuICAgICAgICByZXR1cm4gbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLCAndGVybmFyeSc6IHtcbiAgICAnPyc6IGZ1bmN0aW9uKGYsIHMsIHQpIHsgcmV0dXJuIGYgPyBzIDogdDsgfVxuICAsICcoJzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZltzXS5hcHBseShmLCB0KSB9XG5cbiAgICAvL2ZpbHRlci4gbmFtZSB8IGZpbHRlciA6IGFyZzIgOiBhcmczXG4gICwgJ3wnOiBmdW5jdGlvbihmLCBzLCB0KXsgcmV0dXJuIGNhbGxGaWx0ZXIoZiwgcywgdCkgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBjYWxsRmlsdGVyKGFyZywgZmlsdGVyLCBhcmdzKSB7XG4gIGlmKGFyZyAmJiBhcmcudGhlbikge1xuICAgIHJldHVybiBhcmcudGhlbihmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gZmlsdGVyLmFwcGx5KHJvb3QsIFtkYXRhXS5jb25jYXQoYXJncykpXG4gICAgfSk7XG4gIH1lbHNle1xuICAgIHJldHVybiBmaWx0ZXIuYXBwbHkocm9vdCwgW2FyZ10uY29uY2F0KGFyZ3MpKVxuICB9XG59XG5cbnZhciBhcmdOYW1lID0gWydmaXJzdCcsICdzZWNvbmQnLCAndGhpcmQnXVxuICAsIGNvbnRleHQsIHN1bW1hcnksIHN1bW1hcnlDYWxsXG4gICwgcGF0aFxuICAsIHNlbGZcbiAgLCByb290XG4gIDtcblxuLy/pgY3ljoYgYXN0XG52YXIgZXZhbHVhdGUgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHZhciBhcml0eSA9IHRyZWUuYXJpdHlcbiAgICAsIHZhbHVlID0gdHJlZS52YWx1ZVxuICAgICwgYXJncyA9IFtdXG4gICAgLCBuID0gMFxuICAgICwgYXJnXG4gICAgLCByZXNcbiAgICA7XG5cbiAgLy/mk43kvZznrKbmnIDlpJrlj6rmnInkuInlhYNcbiAgZm9yKDsgbiA8IDM7IG4rKyl7XG4gICAgYXJnID0gdHJlZVthcmdOYW1lW25dXTtcbiAgICBpZihhcmcpe1xuICAgICAgaWYoQXJyYXkuaXNBcnJheShhcmcpKXtcbiAgICAgICAgYXJnc1tuXSA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJnLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgYXJnc1tuXS5wdXNoKHR5cGVvZiBhcmdbaV0ua2V5ID09PSAndW5kZWZpbmVkJyA/XG4gICAgICAgICAgICBldmFsdWF0ZShhcmdbaV0pIDogW2FyZ1tpXS5rZXksIGV2YWx1YXRlKGFyZ1tpXSldKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGFyZ3Nbbl0gPSBldmFsdWF0ZShhcmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGFyaXR5ICE9PSAnbGl0ZXJhbCcpIHtcbiAgICBpZihwYXRoICYmIHZhbHVlICE9PSAnLicgJiYgdmFsdWUgIT09ICdbJykge1xuICAgICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gICAgfVxuICAgIGlmKGFyaXR5ID09PSAnbmFtZScpIHtcbiAgICAgIHBhdGggPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBzd2l0Y2goYXJpdHkpe1xuICAgIGNhc2UgJ3VuYXJ5JzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Rlcm5hcnknOlxuICAgICAgdHJ5e1xuICAgICAgICByZXMgPSBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpLmFwcGx5KHRyZWUsIGFyZ3MpO1xuICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAvL3N1bW1hcnlDYWxsIHx8IGNvbnNvbGUud2FybihlKTtcbiAgICAgIH1cbiAgICBicmVhaztcbiAgICBjYXNlICdsaXRlcmFsJzpcbiAgICAgIHJlcyA9IHZhbHVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3JlcGVhdCc6XG4gICAgICBzdW1tYXJ5LmFzc2lnbm1lbnRzW3ZhbHVlXSA9IHRydWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbmFtZSc6XG4gICAgICBzdW1tYXJ5LmxvY2Fsc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gZ2V0VmFsdWUodmFsdWUsIGNvbnRleHQubG9jYWxzKTtcbiAgICBicmVhaztcbiAgICBjYXNlICdmaWx0ZXInOlxuICAgICAgc3VtbWFyeS5maWx0ZXJzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBjb250ZXh0LmZpbHRlcnNbdmFsdWVdO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RoaXMnOlxuICAgICAgcmVzID0gY29udGV4dC5sb2NhbHM7Ly9UT0RPIHRoaXMg5oyH5ZCRIHZtIOi/mOaYryBkaXI/XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cbmZ1bmN0aW9uIGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSl7XG4gIHJldHVybiBvcGVyYXRvcnNbYXJpdHldW3ZhbHVlXSB8fCBmdW5jdGlvbigpIHsgcmV0dXJuOyB9XG59XG5cbmZ1bmN0aW9uIHJlc2V0KHNjb3BlLCB0aGF0KSB7XG4gIHN1bW1hcnlDYWxsID0gdHJ1ZTtcbiAgaWYoc2NvcGUpIHtcbiAgICByb290ID0gc2NvcGUuJHJvb3Q7XG4gICAgc3VtbWFyeUNhbGwgPSBmYWxzZTtcbiAgICBjb250ZXh0ID0ge2xvY2Fsczogc2NvcGUgfHwge30sIGZpbHRlcnM6IHNjb3BlLmNvbnN0cnVjdG9yLmZpbHRlcnMgfHwge319O1xuICB9ZWxzZXtcbiAgICBjb250ZXh0ID0ge2ZpbHRlcnM6IHt9LCBsb2NhbHM6IHt9fTtcbiAgfVxuICBpZih0aGF0KXtcbiAgICBzZWxmID0gdGhhdDtcbiAgfVxuXG4gIHN1bW1hcnkgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge30sIHBhdGhzOiB7fSwgYXNzaWdubWVudHM6IHt9fTtcbiAgcGF0aCA9ICcnO1xufVxuXG4vL+WcqOS9nOeUqOWfn+S4reafpeaJvuWAvFxudmFyIGdldFZhbHVlID0gZnVuY3Rpb24oa2V5LCB2bSkge1xuICB2YXIgcmVmb3JtZWQgPSBzY29wZS5yZWZvcm1TY29wZSh2bSwga2V5KVxuICByZXR1cm4gcmVmb3JtZWQudm1bcmVmb3JtZWQucGF0aF1cbn1cblxuLy/ooajovr7lvI/msYLlgLxcbi8vdHJlZTogcGFyc2VyIOeUn+aIkOeahCBhc3Rcbi8vc2NvcGUg5omn6KGM546v5aKDXG5leHBvcnRzLmV2YWwgPSBmdW5jdGlvbih0cmVlLCBzY29wZSwgdGhhdCkge1xuICByZXNldChzY29wZSB8fCB7fSwgdGhhdCk7XG5cbiAgcmV0dXJuIGV2YWx1YXRlKHRyZWUpO1xufTtcblxuLy/ooajovr7lvI/mkZjopoFcbi8vcmV0dXJuOiB7ZmlsdGVyczpbXSwgbG9jYWxzOltdLCBwYXRoczogW10sIGFzc2lnbm1lbnRzOiBbXX1cbmV4cG9ydHMuc3VtbWFyeSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgcmVzZXQoKTtcblxuICBldmFsdWF0ZSh0cmVlKTtcblxuICBpZihwYXRoKSB7XG4gICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gIH1cbiAgZm9yKHZhciBrZXkgaW4gc3VtbWFyeSkge1xuICAgIHN1bW1hcnlba2V5XSA9IE9iamVjdC5rZXlzKHN1bW1hcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIHN1bW1hcnk7XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydHMuYWRkRXZlbnQgPSBmdW5jdGlvbiBhZGRFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIGZhbHNlKTtcbiAgfWVsc2V7XG4gICAgZWwuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufVxuXG5leHBvcnRzLnJlbW92ZUV2ZW50ID0gZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmKGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyKTtcbiAgfWVsc2V7XG4gICAgZWwuZGV0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufSIsIlwidXNlIHN0cmljdFwiO1xuLy9KYXZhc2NyaXB0IGV4cHJlc3Npb24gcGFyc2VyIG1vZGlmaWVkIGZvcm0gQ3JvY2tmb3JkJ3MgVERPUCBwYXJzZXJcbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG5cdGZ1bmN0aW9uIEYoKSB7fVxuXHRGLnByb3RvdHlwZSA9IG87XG5cdHJldHVybiBuZXcgRigpO1xufTtcblxudmFyIHNvdXJjZTtcblxudmFyIGVycm9yID0gZnVuY3Rpb24gKG1lc3NhZ2UsIHQpIHtcblx0dCA9IHQgfHwgdGhpcztcbiAgdmFyIG1zZyA9IG1lc3NhZ2UgKz0gXCIgQnV0IGZvdW5kICdcIiArIHQudmFsdWUgKyBcIidcIiArICh0LmZyb20gPyBcIiBhdCBcIiArIHQuZnJvbSA6IFwiXCIpICsgXCIgaW4gJ1wiICsgc291cmNlICsgXCInXCI7XG4gIHZhciBlID0gbmV3IEVycm9yKG1zZyk7XG5cdGUubmFtZSA9IHQubmFtZSA9IFwiU3ludGF4RXJyb3JcIjtcblx0dC5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhyb3cgZTtcbn07XG5cbnZhciB0b2tlbml6ZSA9IGZ1bmN0aW9uIChjb2RlLCBwcmVmaXgsIHN1ZmZpeCkge1xuXHR2YXIgYzsgLy8gVGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgZnJvbTsgLy8gVGhlIGluZGV4IG9mIHRoZSBzdGFydCBvZiB0aGUgdG9rZW4uXG5cdHZhciBpID0gMDsgLy8gVGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGNoYXJhY3Rlci5cblx0dmFyIGxlbmd0aCA9IGNvZGUubGVuZ3RoO1xuXHR2YXIgbjsgLy8gVGhlIG51bWJlciB2YWx1ZS5cblx0dmFyIHE7IC8vIFRoZSBxdW90ZSBjaGFyYWN0ZXIuXG5cdHZhciBzdHI7IC8vIFRoZSBzdHJpbmcgdmFsdWUuXG5cblx0dmFyIHJlc3VsdCA9IFtdOyAvLyBBbiBhcnJheSB0byBob2xkIHRoZSByZXN1bHRzLlxuXG5cdC8vIE1ha2UgYSB0b2tlbiBvYmplY3QuXG5cdHZhciBtYWtlID0gZnVuY3Rpb24gKHR5cGUsIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGUgOiB0eXBlLFxuXHRcdFx0dmFsdWUgOiB2YWx1ZSxcblx0XHRcdGZyb20gOiBmcm9tLFxuXHRcdFx0dG8gOiBpXG5cdFx0fTtcblx0fTtcblxuXHQvLyBCZWdpbiB0b2tlbml6YXRpb24uIElmIHRoZSBzb3VyY2Ugc3RyaW5nIGlzIGVtcHR5LCByZXR1cm4gbm90aGluZy5cblx0aWYgKCFjb2RlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGNvZGUgdGV4dCwgb25lIGNoYXJhY3RlciBhdCBhIHRpbWUuXG5cdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0d2hpbGUgKGMpIHtcblx0XHRmcm9tID0gaTtcblxuXHRcdGlmIChjIDw9ICcgJykgeyAvLyBJZ25vcmUgd2hpdGVzcGFjZS5cblx0XHRcdGkgKz0gMTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9IGVsc2UgaWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7IC8vIG5hbWUuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fFxuXHRcdFx0XHRcdChjID49ICcwJyAmJiBjIDw9ICc5JykgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCduYW1lJywgc3RyKSk7XG5cdFx0fSBlbHNlIGlmIChjID49ICcwJyAmJiBjIDw9ICc5Jykge1xuXHRcdFx0Ly8gbnVtYmVyLlxuXG5cdFx0XHQvLyBBIG51bWJlciBjYW5ub3Qgc3RhcnQgd2l0aCBhIGRlY2ltYWwgcG9pbnQuIEl0IG11c3Qgc3RhcnQgd2l0aCBhIGRpZ2l0LFxuXHRcdFx0Ly8gcG9zc2libHkgJzAnLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblxuXHRcdFx0Ly8gTG9vayBmb3IgbW9yZSBkaWdpdHMuXG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYSBkZWNpbWFsIGZyYWN0aW9uIHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJy4nKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGFuIGV4cG9uZW50IHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJ2UnIHx8IGMgPT09ICdFJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjID09PSAnLScgfHwgYyA9PT0gJysnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgZXhwb25lbnRcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH0gd2hpbGUgKGMgPj0gJzAnICYmIGMgPD0gJzknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBuZXh0IGNoYXJhY3RlciBpcyBub3QgYSBsZXR0ZXIuXG5cblx0XHRcdGlmIChjID49ICdhJyAmJiBjIDw9ICd6Jykge1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZSB0byBhIG51bWJlci4gSWYgaXQgaXMgZmluaXRlLCB0aGVuIGl0IGlzIGEgZ29vZFxuXHRcdFx0Ly8gdG9rZW4uXG5cblx0XHRcdG4gPSArc3RyO1xuXHRcdFx0aWYgKGlzRmluaXRlKG4pKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ251bWJlcicsIG4pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc3RyaW5nXG5cblx0XHR9IGVsc2UgaWYgKGMgPT09ICdcXCcnIHx8IGMgPT09ICdcIicpIHtcblx0XHRcdHN0ciA9ICcnO1xuXHRcdFx0cSA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcgJykge1xuXHRcdFx0XHRcdG1ha2UoJ3N0cmluZycsIHN0cik7XG5cdFx0XHRcdFx0ZXJyb3IoYyA9PT0gJ1xcbicgfHwgYyA9PT0gJ1xccicgfHwgYyA9PT0gJycgP1xuXHRcdFx0XHRcdFx0XCJVbnRlcm1pbmF0ZWQgc3RyaW5nLlwiIDpcblx0XHRcdFx0XHRcdFwiQ29udHJvbCBjaGFyYWN0ZXIgaW4gc3RyaW5nLlwiLCBtYWtlKCcnLCBzdHIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIHRoZSBjbG9zaW5nIHF1b3RlLlxuXG5cdFx0XHRcdGlmIChjID09PSBxKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciBlc2NhcGVtZW50LlxuXG5cdFx0XHRcdGlmIChjID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRzd2l0Y2ggKGMpIHtcblx0XHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxiJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2YnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGYnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcbic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxyJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3QnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndSc6XG5cdFx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IHBhcnNlSW50KGNvZGUuc3Vic3RyKGkgKyAxLCA0KSwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0Zpbml0ZShjKSB8fCBjIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcblx0XHRcdFx0XHRcdGkgKz0gNDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdC8vIGNvbWJpbmluZ1xuXG5cdFx0fSBlbHNlIGlmIChwcmVmaXguaW5kZXhPZihjKSA+PSAwKSB7XG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoaSA+PSBsZW5ndGggfHwgc3VmZml4LmluZGV4T2YoYykgPCAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgc3RyKSk7XG5cblx0XHRcdC8vIHNpbmdsZS1jaGFyYWN0ZXIgb3BlcmF0b3JcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdvcGVyYXRvcicsIGMpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBtYWtlX3BhcnNlID0gZnVuY3Rpb24gKHZhcnMpIHtcblx0dmFycyA9IHZhcnMgfHwge307Ly/pooTlrprkuYnnmoTlj5jph49cblx0dmFyIHN5bWJvbF90YWJsZSA9IHt9O1xuXHR2YXIgdG9rZW47XG5cdHZhciB0b2tlbnM7XG5cdHZhciB0b2tlbl9ucjtcblx0dmFyIGNvbnRleHQ7XG5cblx0dmFyIGl0c2VsZiA9IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHR2YXIgZmluZCA9IGZ1bmN0aW9uIChuKSB7XG5cdFx0bi5udWQgPSBpdHNlbGY7XG5cdFx0bi5sZWQgPSBudWxsO1xuXHRcdG4uc3RkID0gbnVsbDtcblx0XHRuLmxicCA9IDA7XG5cdFx0cmV0dXJuIG47XG5cdH07XG5cblx0dmFyIGFkdmFuY2UgPSBmdW5jdGlvbiAoaWQpIHtcblx0XHR2YXIgYSwgbywgdCwgdjtcblx0XHRpZiAoaWQgJiYgdG9rZW4uaWQgIT09IGlkKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkICdcIiArIGlkICsgXCInLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICh0b2tlbl9uciA+PSB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHR0b2tlbiA9IHN5bWJvbF90YWJsZVtcIihlbmQpXCJdO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ID0gdG9rZW5zW3Rva2VuX25yXTtcblx0XHR0b2tlbl9uciArPSAxO1xuXHRcdHYgPSB0LnZhbHVlO1xuXHRcdGEgPSB0LnR5cGU7XG5cdFx0aWYgKChhID09PSBcIm9wZXJhdG9yXCIgfHwgYSAhPT0gJ3N0cmluZycpICYmIHYgaW4gc3ltYm9sX3RhYmxlKSB7XG5cdFx0XHQvL3RydWUsIGZhbHNlIOetieebtOaOpemHj+S5n+S8mui/m+WFpeatpOWIhuaUr1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVt2XTtcblx0XHRcdGlmICghbykge1xuXHRcdFx0XHRlcnJvcihcIlVua25vd24gb3BlcmF0b3IuXCIsIHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJuYW1lXCIpIHtcblx0XHRcdG8gPSBmaW5kKHQpO1xuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJzdHJpbmdcIiB8fCBhID09PSBcIm51bWJlclwiIHx8IGEgPT09IFwicmVnZXhwXCIpIHtcblx0XHRcdG8gPSBzeW1ib2xfdGFibGVbXCIobGl0ZXJhbClcIl07XG5cdFx0XHRhID0gXCJsaXRlcmFsXCI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVycm9yKFwiVW5leHBlY3RlZCB0b2tlbi5cIiwgdCk7XG5cdFx0fVxuXHRcdHRva2VuID0gY3JlYXRlKG8pO1xuXHRcdHRva2VuLmZyb20gPSB0LmZyb207XG5cdFx0dG9rZW4udG8gPSB0LnRvO1xuXHRcdHRva2VuLnZhbHVlID0gdjtcblx0XHR0b2tlbi5hcml0eSA9IGE7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9O1xuXG4gIC8v6KGo6L6+5byPXG4gIC8vcmJwOiByaWdodCBiaW5kaW5nIHBvd2VyIOWPs+S+p+e6puadn+WKm1xuXHR2YXIgZXhwcmVzc2lvbiA9IGZ1bmN0aW9uIChyYnApIHtcblx0XHR2YXIgbGVmdDtcblx0XHR2YXIgdCA9IHRva2VuO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRsZWZ0ID0gdC5udWQoKTtcblx0XHR3aGlsZSAocmJwIDwgdG9rZW4ubGJwKSB7XG5cdFx0XHR0ID0gdG9rZW47XG5cdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRsZWZ0ID0gdC5sZWQobGVmdCk7XG5cdFx0fVxuXHRcdHJldHVybiBsZWZ0O1xuXHR9O1xuXG5cdHZhciBvcmlnaW5hbF9zeW1ib2wgPSB7XG5cdFx0bnVkIDogZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXJyb3IoXCJVbmRlZmluZWQuXCIsIHRoaXMpO1xuXHRcdH0sXG5cdFx0bGVkIDogZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdGVycm9yKFwiTWlzc2luZyBvcGVyYXRvci5cIiwgdGhpcyk7XG5cdFx0fVxuXHR9O1xuXG5cdHZhciBzeW1ib2wgPSBmdW5jdGlvbiAoaWQsIGJwKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2xfdGFibGVbaWRdO1xuXHRcdGJwID0gYnAgfHwgMDtcblx0XHRpZiAocykge1xuXHRcdFx0aWYgKGJwID49IHMubGJwKSB7XG5cdFx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHMgPSBjcmVhdGUob3JpZ2luYWxfc3ltYm9sKTtcblx0XHRcdHMuaWQgPSBzLnZhbHVlID0gaWQ7XG5cdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0c3ltYm9sX3RhYmxlW2lkXSA9IHM7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBjb25zdGFudCA9IGZ1bmN0aW9uIChzLCB2LCBhKSB7XG5cdFx0dmFyIHggPSBzeW1ib2wocyk7XG5cdFx0eC5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gc3ltYm9sX3RhYmxlW3RoaXMuaWRdLnZhbHVlO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHR4LnZhbHVlID0gdjtcblx0XHRyZXR1cm4geDtcblx0fTtcblxuXHR2YXIgaW5maXggPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGluZml4ciA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwIC0gMSk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIHByZWZpeCA9IGZ1bmN0aW9uIChpZCwgbnVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQpO1xuXHRcdHMubnVkID0gbnVkIHx8IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDcwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHN5bWJvbChcIihlbmQpXCIpO1xuXHRzeW1ib2woXCIobmFtZSlcIik7XG5cdHN5bWJvbChcIjpcIik7XG5cdHN5bWJvbChcIilcIik7XG5cdHN5bWJvbChcIl1cIik7XG5cdHN5bWJvbChcIn1cIik7XG5cdHN5bWJvbChcIixcIik7XG5cblx0Y29uc3RhbnQoXCJ0cnVlXCIsIHRydWUpO1xuXHRjb25zdGFudChcImZhbHNlXCIsIGZhbHNlKTtcblx0Y29uc3RhbnQoXCJudWxsXCIsIG51bGwpO1xuXHRjb25zdGFudChcInVuZGVmaW5lZFwiKTtcblxuXHRjb25zdGFudChcIk1hdGhcIiwgTWF0aCk7XG5cdGNvbnN0YW50KFwiRGF0ZVwiLCBEYXRlKTtcblx0Zm9yKHZhciB2IGluIHZhcnMpIHtcblx0XHRjb25zdGFudCh2LCB2YXJzW3ZdKTtcblx0fVxuXG5cdHN5bWJvbChcIihsaXRlcmFsKVwiKS5udWQgPSBpdHNlbGY7XG5cblx0c3ltYm9sKFwidGhpc1wiKS5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdCAgdGhpcy5hcml0eSA9IFwidGhpc1wiO1xuXHQgIHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdC8vT3BlcmF0b3IgUHJlY2VkZW5jZTpcblx0Ly9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvT3BlcmF0b3JfUHJlY2VkZW5jZVxuXG4gIC8vaW5maXgoJywnLCAxKTtcblx0aW5maXgoXCI/XCIsIDIwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHR0aGlzLnRoaXJkID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4cihcIiYmXCIsIDMxKTtcblx0aW5maXhyKFwifHxcIiwgMzApO1xuXG5cdGluZml4cihcIj09PVwiLCA0MCk7XG5cdGluZml4cihcIiE9PVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPFwiLCA0MCk7XG5cdGluZml4cihcIjw9XCIsIDQwKTtcblx0aW5maXhyKFwiPlwiLCA0MCk7XG5cdGluZml4cihcIj49XCIsIDQwKTtcblxuXHRpbmZpeChcImluXCIsIDQ1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRpZiAoY29udGV4dCA9PT0gJ3JlcGVhdCcpIHtcblx0XHRcdC8vIGBpbmAgYXQgcmVwZWF0IGJsb2NrXG5cdFx0XHRsZWZ0LmFyaXR5ID0gJ3JlcGVhdCc7XG5cdFx0XHR0aGlzLnJlcGVhdCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIitcIiwgNTApO1xuXHRpbmZpeChcIi1cIiwgNTApO1xuXG5cdGluZml4KFwiKlwiLCA2MCk7XG5cdGluZml4KFwiL1wiLCA2MCk7XG5cdGluZml4KFwiJVwiLCA2MCk7XG5cblx0aW5maXgoXCIoXCIsIDcwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKGxlZnQuaWQgPT09IFwiLlwiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdC5maXJzdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gbGVmdC5zZWNvbmQ7XG5cdFx0XHR0aGlzLnRoaXJkID0gYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdGlmICgobGVmdC5hcml0eSAhPT0gXCJ1bmFyeVwiIHx8IGxlZnQuaWQgIT09IFwiZnVuY3Rpb25cIikgJiZcblx0XHRcdFx0bGVmdC5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbGVmdC5hcml0eSAhPT0gXCJsaXRlcmFsXCIgJiYgbGVmdC5pZCAhPT0gXCIoXCIgJiZcblx0XHRcdFx0bGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIikge1xuXHRcdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgdmFyaWFibGUgbmFtZS5cIiwgbGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCIpXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIuXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdGlmICh0b2tlbi5hcml0eSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSBwcm9wZXJ0eSBuYW1lLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRva2VuLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0dGhpcy5zZWNvbmQgPSB0b2tlbjtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiW1wiLCA4MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vZmlsdGVyXG5cdGluZml4KFwifFwiLCAxMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYTtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0b2tlbi5hcml0eSA9ICdmaWx0ZXInO1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigxMCk7XG5cdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdGlmICh0b2tlbi5pZCA9PT0gJzonKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ3Rlcm5hcnknO1xuXHRcdFx0dGhpcy50aGlyZCA9IGEgPSBbXTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGFkdmFuY2UoJzonKTtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMTApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIjpcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcbiAgaW5maXgoJ2NhdGNoYnknLCAxMCk7XG5cblx0cHJlZml4KFwiIVwiKTtcblx0cHJlZml4KFwiLVwiKTtcblx0cHJlZml4KFwidHlwZW9mXCIpO1xuXG5cdHByZWZpeChcIihcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBlID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gZTtcblx0fSk7XG5cblx0cHJlZml4KFwiW1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwiXVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigxKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0dGhpcy5maXJzdCA9IGE7XG5cdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KFwie1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXSxcdG4sIHY7XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIn1cIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0biA9IHRva2VuO1xuXHRcdFx0XHRpZiAobi5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbi5hcml0eSAhPT0gXCJsaXRlcmFsXCIpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBwcm9wZXJ0eSBuYW1lOiBcIiwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdFx0YWR2YW5jZShcIjpcIik7XG5cdFx0XHRcdHYgPSBleHByZXNzaW9uKDEpO1xuXHRcdFx0XHR2LmtleSA9IG4udmFsdWU7XG5cdFx0XHRcdGEucHVzaCh2KTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwifVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoJ25ldycsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDc5KTtcblx0XHRpZih0b2tlbi5pZCA9PT0gJygnKSB7XG5cdFx0XHRhZHZhbmNlKFwiKFwiKTtcblx0XHRcdHRoaXMuYXJpdHkgPSAnYmluYXJ5Jztcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdFx0YWR2YW5jZShcIilcIik7XG5cdFx0fWVsc2V7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0Ly9fc291cmNlOiDooajovr7lvI/ku6PnoIHlrZfnrKbkuLJcblx0Ly9fY29udGV4dDog6KGo6L6+5byP55qE6K+t5Y+l546v5aKDXG5cdHJldHVybiBmdW5jdGlvbiAoX3NvdXJjZSwgX2NvbnRleHQpIHtcbiAgICBzb3VyY2UgPSBfc291cmNlO1xuXHRcdHRva2VucyA9IHRva2VuaXplKF9zb3VyY2UsICc9PD4hKy0qJnwvJV4nLCAnPTw+JnwnKTtcblx0XHR0b2tlbl9uciA9IDA7XG5cdFx0Y29udGV4dCA9IF9jb250ZXh0O1xuXHRcdGFkdmFuY2UoKTtcblx0XHR2YXIgcyA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIihlbmQpXCIpO1xuXHRcdHJldHVybiBzO1xuXHR9O1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IG1ha2VfcGFyc2UoKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8v5qC55o2u5Y+Y6YeP5Y+KIHZtIOehruWumuWPmOmHj+aJgOWxnueahOecn+atoyB2bVxudmFyIHJlZm9ybVNjb3BlID0gZnVuY3Rpb24gKHZtLCBwYXRoKSB7XG4gIHZhciBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aChwYXRoKTtcbiAgdmFyIGN1ciA9IHZtLCBsb2NhbCA9IHBhdGhzWzBdO1xuICB2YXIgYXNzLCBjdXJWbSA9IGN1cjtcblxuICB3aGlsZShjdXIpIHtcbiAgICBjdXJWbSA9IGN1cjtcbiAgICBhc3MgPSBjdXIuX2Fzc2lnbm1lbnRzO1xuICAgIGlmKCBjdXIuX19yZXBlYXQpIHtcbiAgICAgIGlmIChhc3MgJiYgYXNzLmxlbmd0aCkge1xuICAgICAgICAvLyDlhbflkI0gcmVwZWF0IOS4jeS8muebtOaOpeafpeaJvuiHqui6q+S9nOeUqOWfn1xuICAgICAgICBpZiAobG9jYWwgPT09ICckaW5kZXgnIHx8IGxvY2FsID09PSAnJHBhcmVudCcpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIGlmIChsb2NhbCA9PT0gYXNzWzBdKSB7XG4gICAgICAgICAgLy/kv67mraNrZXlcbiAgICAgICAgICBpZiAocGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBwYXRoc1swXSA9ICckZGF0YSc7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdGhzLnNoaWZ0KClcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8v5Yy/5ZCNIHJlcGVhdFxuICAgICAgICBpZiAocGF0aCBpbiBjdXIpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjdXIgPSBjdXIuJHBhcmVudDtcbiAgfVxuXG4gIHJldHVybiB7IHZtOiBjdXJWbSwgcGF0aDogcGF0aHMuam9pbignLicpIH1cbn07XG5cblxuZXhwb3J0cy5yZWZvcm1TY29wZSA9IHJlZm9ybVNjb3BlO1xuIiwidmFyIHRva2VuUmVnID0gL3t7KHsoW159XFxuXSspfXxbXn1cXG5dKyl9fS9nO1xuXG4vL+Wtl+espuS4suS4reaYr+WQpuWMheWQq+aooeadv+WNoOS9jeespuagh+iusFxuZnVuY3Rpb24gaGFzVG9rZW4oc3RyKSB7XG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIHJldHVybiBzdHIgJiYgdG9rZW5SZWcudGVzdChzdHIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRva2VuKHZhbHVlKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgdGV4dE1hcCA9IFtdXG4gICAgLCBzdGFydCA9IDBcbiAgICAsIHZhbCwgdG9rZW5cbiAgICA7XG4gIFxuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICBcbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cbiAgICBcbiAgICB0b2tlbiA9IHtcbiAgICAgIGVzY2FwZTogIXZhbFsyXVxuICAgICwgcGF0aDogKHZhbFsyXSB8fCB2YWxbMV0pLnRyaW0oKVxuICAgICwgcG9zaXRpb246IHRleHRNYXAubGVuZ3RoXG4gICAgLCB0ZXh0TWFwOiB0ZXh0TWFwXG4gICAgfTtcbiAgICBcbiAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcbiAgICBcbiAgICBzdGFydCA9IHRva2VuUmVnLmxhc3RJbmRleDtcbiAgfVxuICBcbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cbiAgXG4gIHRva2Vucy50ZXh0TWFwID0gdGV4dE1hcDtcbiAgXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydHMuaGFzVG9rZW4gPSBoYXNUb2tlbjtcblxuZXhwb3J0cy5wYXJzZVRva2VuID0gcGFyc2VUb2tlbjsiLCJcInVzZSBzdHJpY3RcIjtcblxuLy91dGlsc1xuLy8tLS1cblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnQ7XG5cbnZhciBrZXlQYXRoUmVnID0gLyg/OlxcLnxcXFspL2dcbiAgLCBicmEgPSAvXFxdL2dcbiAgO1xuXG4vL+WwhiBrZXlQYXRoIOi9rOS4uuaVsOe7hOW9ouW8j1xuLy9wYXRoLmtleSwgcGF0aFtrZXldIC0tPiBbJ3BhdGgnLCAna2V5J11cbmZ1bmN0aW9uIHBhcnNlS2V5UGF0aChrZXlQYXRoKXtcbiAgcmV0dXJuIGtleVBhdGgucmVwbGFjZShicmEsICcnKS5zcGxpdChrZXlQYXRoUmVnKTtcbn1cblxuLyoqXG4gKiDlkIjlubblr7nosaFcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2RlZXA9ZmFsc2VdIOaYr+WQpua3seW6puWQiOW5tlxuICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0Li4uXSDmnaXmupDlr7nosaFcbiAqIEByZXR1cm5zIHtPYmplY3R9IOWQiOW5tuWQjueahCB0YXJnZXQg5a+56LGhXG4gKi9cbmZ1bmN0aW9uIGV4dGVuZCgvKiBkZWVwLCB0YXJnZXQsIG9iamVjdC4uLiAqLykge1xuICB2YXIgb3B0aW9uc1xuICAgICwgbmFtZSwgc3JjLCBjb3B5LCBjb3B5SXNBcnJheSwgY2xvbmVcbiAgICAsIHRhcmdldCA9IGFyZ3VtZW50c1swXSB8fCB7fVxuICAgICwgaSA9IDFcbiAgICAsIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGhcbiAgICAsIGRlZXAgPSBmYWxzZVxuICAgIDtcblxuICAvLyBIYW5kbGUgYSBkZWVwIGNvcHkgc2l0dWF0aW9uXG4gIGlmICh0eXBlb2YgdGFyZ2V0ID09PSBcImJvb2xlYW5cIikge1xuICAgIGRlZXAgPSB0YXJnZXQ7XG5cbiAgICAvLyBza2lwIHRoZSBib29sZWFuIGFuZCB0aGUgdGFyZ2V0XG4gICAgdGFyZ2V0ID0gYXJndW1lbnRzWyBpIF0gfHwge307XG4gICAgaSsrO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2Ugd2hlbiB0YXJnZXQgaXMgYSBzdHJpbmcgb3Igc29tZXRoaW5nIChwb3NzaWJsZSBpbiBkZWVwIGNvcHkpXG4gIGlmICh0eXBlb2YgdGFyZ2V0ICE9PSBcIm9iamVjdFwiICYmICF1dGlscy5pc0Z1bmN0aW9uKHRhcmdldCkpIHtcbiAgICB0YXJnZXQgPSB7fTtcbiAgfVxuXG4gIGZvciAoIDsgaSA8IGxlbmd0aDsgaSsrICkge1xuICAgIC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICBpZiAoIChvcHRpb25zID0gYXJndW1lbnRzWyBpIF0pICE9IG51bGwgKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG4gICAgICBmb3IgKCBuYW1lIGluIG9wdGlvbnMgKSB7XG4gICAgICAgIC8vYW5kcm9pZCAyLjMgYnJvd3NlciBjYW4gZW51bSB0aGUgcHJvdG90eXBlIG9mIGNvbnN0cnVjdG9yLi4uXG4gICAgICAgIGlmKG5hbWUgIT09ICdwcm90b3R5cGUnKXtcbiAgICAgICAgICBzcmMgPSB0YXJnZXRbIG5hbWUgXTtcbiAgICAgICAgICBjb3B5ID0gb3B0aW9uc1sgbmFtZSBdO1xuXG5cbiAgICAgICAgICAvLyBSZWN1cnNlIGlmIHdlJ3JlIG1lcmdpbmcgcGxhaW4gb2JqZWN0cyBvciBhcnJheXNcbiAgICAgICAgICBpZiAoIGRlZXAgJiYgY29weSAmJiAoIHV0aWxzLmlzUGxhaW5PYmplY3QoY29weSkgfHwgKGNvcHlJc0FycmF5ID0gdXRpbHMuaXNBcnJheShjb3B5KSkgKSApIHtcblxuICAgICAgICAgICAgLy8gUHJldmVudCBuZXZlci1lbmRpbmcgbG9vcFxuICAgICAgICAgICAgaWYgKCB0YXJnZXQgPT09IGNvcHkgKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCBjb3B5SXNBcnJheSApIHtcbiAgICAgICAgICAgICAgY29weUlzQXJyYXkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNBcnJheShzcmMpID8gc3JjIDogW107XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzUGxhaW5PYmplY3Qoc3JjKSA/IHNyYyA6IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZXZlciBtb3ZlIG9yaWdpbmFsIG9iamVjdHMsIGNsb25lIHRoZW1cbiAgICAgICAgICAgIHRhcmdldFsgbmFtZSBdID0gZXh0ZW5kKCBkZWVwLCBjbG9uZSwgY29weSk7XG5cbiAgICAgICAgICAgIC8vIERvbid0IGJyaW5nIGluIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2UgaWYgKCAhdXRpbHMuaXNVbmRlZmluZWQoY29weSkgJiYgdHlwZW9mIHRhcmdldCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIC8v5LiA5Lqb5oOF5LiLLCDmr5TlpoIgZmlyZWZveCDkuIvnu5nlrZfnrKbkuLLlr7nosaHotYvlgLzml7bkvJrlvILluLhcbiAgICAgICAgICAgIHRhcmdldFtuYW1lXSA9IGNvcHk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBtb2RpZmllZCBvYmplY3RcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcbiAgZnVuY3Rpb24gRigpIHt9XG4gIEYucHJvdG90eXBlID0gbztcbiAgcmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgZGVlcEdldCA9IGZ1bmN0aW9uIChrZXlTdHIsIG9iaikge1xuICB2YXIgY2hhaW4sIGN1ciA9IG9iaiwga2V5O1xuICBpZihrZXlTdHIpe1xuICAgIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cik7XG4gICAgZm9yKHZhciBpID0gMCwgbCA9IGNoYWluLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAga2V5ID0gY2hhaW5baV07XG4gICAgICBpZihjdXIpe1xuICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjdXI7XG59XG5cbnZhciB1dGlscyA9IHtcbiAgbm9vcDogZnVuY3Rpb24gKCl7fVxuLCBpZTogISFkb2MuYXR0YWNoRXZlbnRcblxuLCBpc09iamVjdDogZnVuY3Rpb24gKHZhbCkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnb2JqZWN0JyAmJiB2YWwgIT09IG51bGw7XG4gIH1cblxuLCBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKHZhbCkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJztcbiAgfVxuXG4sIGlzRnVuY3Rpb246IGZ1bmN0aW9uICh2YWwpe1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnZnVuY3Rpb24nO1xuICB9XG5cbiwgaXNBcnJheTogZnVuY3Rpb24gKHZhbCkge1xuICAgIGlmKHV0aWxzLmllKXtcbiAgICAgIC8vSUUgOSDlj4rku6XkuIsgSUUg6Leo56qX5Y+j5qOA5rWL5pWw57uEXG4gICAgICByZXR1cm4gdmFsICYmIHZhbC5jb25zdHJ1Y3RvciArICcnID09PSBBcnJheSArICcnO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsKTtcbiAgICB9XG4gIH1cbiwgaXNOdW1lcmljOiBmdW5jdGlvbih2YWwpIHtcbiAgICByZXR1cm4gIXV0aWxzLmlzQXJyYXkodmFsKSAmJiB2YWwgLSBwYXJzZUZsb2F0KHZhbCkgKyAxID49IDA7XG4gIH1cbiAgLy/nroDljZXlr7nosaHnmoTnroDmmJPliKTmlq1cbiwgaXNQbGFpbk9iamVjdDogZnVuY3Rpb24gKG8pe1xuICAgIGlmICghbyB8fCAoe30pLnRvU3RyaW5nLmNhbGwobykgIT09ICdbb2JqZWN0IE9iamVjdF0nIHx8IG8ubm9kZVR5cGUgfHwgbyA9PT0gby53aW5kb3cpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIC8v5Ye95pWw5YiH6Z2iLiBvcmlGbiDljp/lp4vlh73mlbAsIGZuIOWIh+mdouihpeWFheWHveaVsFxuICAvL+WJjemdoueahOWHveaVsOi/lOWbnuWAvOS8oOWFpSBicmVha0NoZWNrIOWIpOaWrSwgYnJlYWtDaGVjayDov5Tlm57lgLzkuLrnnJ/ml7bkuI3miafooYzliIfpnaLooaXlhYXnmoTlh73mlbBcbiwgYmVmb3JlRm46IGZ1bmN0aW9uIChvcmlGbiwgZm4sIGJyZWFrQ2hlY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcmV0ID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGlmKGJyZWFrQ2hlY2sgJiYgYnJlYWtDaGVjay5jYWxsKHRoaXMsIHJldCkpe1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4sIGFmdGVyRm46IGZ1bmN0aW9uIChvcmlGbiwgZm4sIGJyZWFrQ2hlY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcmV0ID0gb3JpRm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGlmKGJyZWFrQ2hlY2sgJiYgYnJlYWtDaGVjay5jYWxsKHRoaXMsIHJldCkpe1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfVxuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICB9XG5cbiwgcGFyc2VLZXlQYXRoOiBwYXJzZUtleVBhdGhcblxuLCBkZWVwU2V0OiBmdW5jdGlvbiAoa2V5U3RyLCB2YWx1ZSwgb2JqKSB7XG4gICAgaWYoa2V5U3RyKXtcbiAgICAgIHZhciBjaGFpbiA9IHBhcnNlS2V5UGF0aChrZXlTdHIpXG4gICAgICAgICwgY3VyID0gb2JqXG4gICAgICAgIDtcbiAgICAgIGNoYWluLmZvckVhY2goZnVuY3Rpb24oa2V5LCBpKSB7XG4gICAgICAgIGlmKGkgPT09IGNoYWluLmxlbmd0aCAtIDEpe1xuICAgICAgICAgIGN1cltrZXldID0gdmFsdWU7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGlmKGN1ciAmJiBjdXIuaGFzT3duUHJvcGVydHkoa2V5KSl7XG4gICAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGN1cltrZXldID0ge307XG4gICAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1lbHNle1xuICAgICAgZXh0ZW5kKG9iaiwgdmFsdWUpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9XG4sIGV4dGVuZDogZXh0ZW5kXG4sIGNyZWF0ZTogY3JlYXRlXG4sIHRvQXJyYXk6IGZ1bmN0aW9uKGFyckxpa2UpIHtcbiAgICB2YXIgYXJyID0gW107XG5cbiAgICB0cnl7XG4gICAgICAvL0lFIDgg5a+5IGRvbSDlr7nosaHkvJrmiqXplJlcbiAgICAgIGFyciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyckxpa2UpXG4gICAgfWNhdGNoIChlKXtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBhcnJMaWtlLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBhcnJbaV0gPSBhcnJMaWtlW2ldXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnI7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbHM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIHBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZS5qcycpLnBhcnNlXG4gICwgcmVmb3JtU2NvcGUgPSByZXF1aXJlKCcuL3Njb3BlJykucmVmb3JtU2NvcGVcbiAgO1xuXG52YXIgc3VtbWFyeUNhY2hlID0ge307XG5cbi8qKlxuICog5q+P5LiqIGRpcmVjdGl2ZSDlr7nlupTkuIDkuKogd2F0Y2hlclxuICogQHBhcmFtIHtCZWV9IHZtICBkaXJlY3RpdmUg5omA5aSE55qE546v5aKDXG4gKiBAcGFyYW0ge0RpcmVjdGl2ZX0gZGlyXG4gKi9cbmZ1bmN0aW9uIFdhdGNoZXIodm0sIGRpcikge1xuICB2YXIgcmVmb3JtZWQsIHBhdGgsIGN1clZtID0gdm0sIHdhdGNoZXJzID0gW107XG4gIHZhciBzdW1tYXJ5ID0gc3VtbWFyeUNhY2hlW2Rpci5wYXRoXVxuXG4gIGRpci53YXRjaGVyID0gdGhpcztcblxuICB0aGlzLnN0YXRlID0gMTtcbiAgdGhpcy5kaXIgPSBkaXI7XG4gIHRoaXMudm0gPSB2bTtcbiAgdGhpcy53YXRjaGVycyA9IFtdO1xuXG4gIHRoaXMudmFsID0gTmFOO1xuXG4gIGRpci5wYXJzZSgpO1xuXG4gIGlmKCFzdW1tYXJ5IHx8IHN1bW1hcnkuX3R5cGUgIT09IGRpci50eXBlKXtcbiAgICBzdW1tYXJ5ID0gZXZhbHVhdGUuc3VtbWFyeShkaXIuYXN0KTtcbiAgICBzdW1tYXJ5Ll90eXBlID0gZGlyLnR5cGU7XG4gICAgc3VtbWFyeUNhY2hlW2Rpci5wYXRoXSA9IHN1bW1hcnk7XG4gIH1cbiAgZGlyLnN1bW1hcnkgPSBzdW1tYXJ5XG5cbiAgLy/lsIbor6Ugd2F0Y2hlciDkuI7mr4/kuIDkuKrlsZ7mgKflu7rnq4vlvJXnlKjlhbPns7tcbiAgZm9yKHZhciBpID0gMCwgbCA9IGRpci5zdW1tYXJ5LnBhdGhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHJlZm9ybWVkID0gcmVmb3JtU2NvcGUodm0sIGRpci5zdW1tYXJ5LnBhdGhzW2ldKVxuICAgIGN1clZtID0gcmVmb3JtZWQudm1cbiAgICBwYXRoID0gcmVmb3JtZWQucGF0aFxuICAgIGlmKGRpci53YXRjaCkge1xuICAgICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdID0gY3VyVm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdO1xuICAgICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdLnB1c2godGhpcyk7XG4gICAgICB3YXRjaGVycyA9IGN1clZtLl93YXRjaGVyc1twYXRoXTtcbiAgICB9ZWxzZXtcbiAgICAgIHdhdGNoZXJzID0gW3RoaXNdO1xuICAgIH1cbiAgICAvL+Wwhuavj+S4qiBrZXkg5a+55bqU55qEIHdhdGNoZXJzIOmDveWhnui/m+adpVxuICAgIHRoaXMud2F0Y2hlcnMucHVzaCggd2F0Y2hlcnMgKTtcbiAgfVxuXG4gIC8v5piv5ZCm5Zyo5Yid5aeL5YyW5pe25pu05pawXG4gIGRpci5pbW1lZGlhdGUgIT09IGZhbHNlICYmIHRoaXMudXBkYXRlKCk7XG59XG5cbi8v5qC55o2u6KGo6L6+5byP56e76Zmk5b2T5YmNIHZtIOS4reeahCB3YXRjaGVyXG5mdW5jdGlvbiB1bndhdGNoICh2bSwgZXhwLCBjYWxsYmFjaykge1xuICB2YXIgc3VtbWFyeTtcbiAgdHJ5IHtcbiAgICBzdW1tYXJ5ID0gZXZhbHVhdGUuc3VtbWFyeShwYXJzZShleHApKVxuICB9Y2F0Y2ggKGUpe1xuICAgIGUubWVzc2FnZSA9ICdTeW50YXhFcnJvciBpbiBcIicgKyBleHAgKyAnXCIgfCAnICsgZS5tZXNzYWdlO1xuICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gIH1cbiAgc3VtbWFyeS5wYXRocy5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICB2YXIgd2F0Y2hlcnMgPSB2bS5fd2F0Y2hlcnNbcGF0aF0gfHwgW10sIHVwZGF0ZTtcblxuICAgIGZvcih2YXIgaSA9IHdhdGNoZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICAgIHVwZGF0ZSA9IHdhdGNoZXJzW2ldLmRpci51cGRhdGU7XG4gICAgICBpZih1cGRhdGUgPT09IGNhbGxiYWNrIHx8IHVwZGF0ZS5fb3JpZ2luRm4gPT09IGNhbGxiYWNrKXtcbiAgICAgICAgd2F0Y2hlcnNbaV0udW53YXRjaCgpXG4gICAgICB9XG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBhZGRXYXRjaGVyKGRpcikge1xuICBpZihkaXIucGF0aCkge1xuICAgIHJldHVybiBuZXcgV2F0Y2hlcih0aGlzLCBkaXIpO1xuICB9XG59XG5cbldhdGNoZXIudW53YXRjaCA9IHVud2F0Y2g7XG5XYXRjaGVyLmFkZFdhdGNoZXIgPSBhZGRXYXRjaGVyO1xuXG4vL+iOt+WPluafkCBrZXlQYXRoIOWtkOi3r+W+hOeahCB3YXRjaGVyc1xuV2F0Y2hlci5nZXRXYXRjaGVycyA9IGZ1bmN0aW9uIGdldFdhdGNoZXJzKHZtLCBrZXlQYXRoKSB7XG4gIHZhciBfd2F0Y2hlcnMgPSB2bS5fd2F0Y2hlcnMsIHdhdGNoZXJzID0gW107XG4gIHZhciBwb2ludDtcbiAgZm9yKHZhciBrZXkgaW4gX3dhdGNoZXJzKSB7XG4gICAgcG9pbnQgPSBrZXkuY2hhckF0KGtleVBhdGgubGVuZ3RoKTtcbiAgICBpZihrZXkuaW5kZXhPZihrZXlQYXRoKSA9PT0gMCAmJiAocG9pbnQgPT09ICcuJykpIHtcbiAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KF93YXRjaGVyc1trZXldKVxuICAgIH1cbiAgfVxuICByZXR1cm4gd2F0Y2hlcnNcbn1cblxuZnVuY3Rpb24gd2F0Y2hlclVwZGF0ZSAodmFsKSB7XG4gIHRyeXtcbiAgICB0aGlzLmRpci51cGRhdGUodmFsLCB0aGlzLnZhbCk7XG4gICAgdGhpcy52YWwgPSB2YWw7XG4gIH1jYXRjaChlKXtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG59XG5cbnV0aWxzLmV4dGVuZChXYXRjaGVyLnByb3RvdHlwZSwge1xuICAvL+ihqOi+vuW8j+aJp+ihjOW5tuabtOaWsCB2aWV3XG4gIHVwZGF0ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAsIG5ld1ZhbFxuICAgICAgO1xuXG4gICAgbmV3VmFsID0gdGhpcy5kaXIuZ2V0VmFsdWUodGhpcy52bSk7XG5cbiAgICAvL+eugOWNlei/h+a7pOmHjeWkjeabtOaWsFxuICAgIGlmKG5ld1ZhbCAhPT0gdGhpcy52YWwgfHwgdXRpbHMuaXNPYmplY3QobmV3VmFsKSl7XG4gICAgICBpZihuZXdWYWwgJiYgbmV3VmFsLnRoZW4pIHtcbiAgICAgICAgLy9hIHByb21pc2VcbiAgICAgICAgbmV3VmFsLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoYXQsIHZhbCk7XG4gICAgICAgIH0pO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGlzLCBuZXdWYWwpO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgLy/np7vpmaRcbiAgdW53YXRjaDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXJzKSB7XG4gICAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKHdhdGNoZXJzW2ldID09PSB0aGlzKXtcbiAgICAgICAgICBpZih0aGlzLnN0YXRlKXtcbiAgICAgICAgICAgIHdhdGNoZXJzW2ldLmRpci51bkxpbmsoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpXG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyXG4iXX0=
