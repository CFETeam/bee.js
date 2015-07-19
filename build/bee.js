(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Bee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var doc = require('./env.js').document
  , utils = require('./utils.js')
  , Class = require('./class.js')
  , directive = require('./directive.js')
  , Com = require('./component.js')
  , Watcher = require('./watcher.js')

  , dirs = require('./directives')
  , domUtils = require('./dom-utils.js')
  , checkBinding = require('./check-binding.js')
  , scope = require('./scope')

  , Dir = directive.Directive
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
  $data: 1
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
 * @constructor
 * @param {String|Element} [tpl] 模板. 等同于 props.$tpl
 * @param {Object} [props] 属性/方法
 */
function Bee(tpl, props) {
  if(isPlainObject(tpl)) {
    props = tpl;
  }else{
    props = props || {};
    if(tpl) {
      props.$tpl = tpl;
    }
  }

  var defaults = {
    //$ 开头的是共有属性/方法
    $data: extend(true, {}, this.constructor.defaults)
  , $refs: {}
  , $mixins: []

  , $el: this.$el || null
  , $tpl: this.$tpl || '<div>{{> $content }}</div>'
  , $content: this.$content || null

  , $isReplace: false
  , $parent: null
  , $root: this

    //私有属性/方法
  , _watchers: {}
  , _assignments: null//当前 vm 的别名
  , _relativePath: []
  , __links: []
  , _isRendered: false
  };

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

  extend(this, this.$data);

  resolveTpl.call(this);

  this.$beforeInit()
  this.$el.bee = this;

  //__links 包含了 $el 下所有的绑定引用
  this.__links = this.__links.concat( checkBinding.walk.call(this, this.$el) );

  this._isRendered = true;
  this.$afterInit();
}

//静态属性
extend(Bee, {extend: utils.afterFn(Class.extend, utils.noop, function(sub) {
  //每个构造函数都有自己的 directives ,components, filters 引用
  sub.directives = extend(create(this.directives), sub.directives);
  sub.components = extend(create(this.components), sub.components);
  sub.filters = extend(create(this.filters), sub.filters);
  sub.defaults = extend(true, {}, this.defaults, sub.defaults);
}), utils: utils}, Dir, Com, {
  setPrefix: setPrefix
, directive: directive.directive
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
    var instance;
    var dirs = directive.getDirs(el, this);
    var Comp, dir;

    dir = dirs.filter(function(dir) {
      return  dir.type === 'tag' || dir.type === 'component'
    })[0];

    if(dir) {
      Comp = this.getComponent(dir.path)
    }

    props = props || {};
    if(Comp) {
      props.$data = extend(domUtils.getAttrs(el), props.$data)
      instance = new Comp(extend({$el: el, $isReplace: true, __mountcall: true}, props))
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
   * 获取属性/方法
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
      update.call(reVm, key);
    }else{
      this.$replace(key, val);
    }
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

//处理 $el,  $content, $tpl
function resolveTpl() {
  var el = this.$el
    , content = this.$content
    , tpl = this.$tpl
    , tplEl
    ;

  content = el && el.childNodes ? el.childNodes : content

  if(el) {
    //传入 $el 元素的子元素都存放到 $conten 中
    content = el.childNodes;
  }

  if(content) {
    //创建 $content documentFragment
    this.$content = domUtils.createContent(content)
  }

  if(utils.isObject(tpl)){
    //DOM 元素
    tplEl = tpl;
    tpl = tplEl.outerHTML;
  }else{
    //字符串
    tplEl = domUtils.createContent(tpl).childNodes[0];
  }

  if(el) {
    if(this.$isReplace) {
      el.parentNode && el.parentNode.replaceChild(tplEl, el)
      el = tplEl;
    }else{
      el.appendChild(tplEl)
    }
  }else{
    el = tplEl;
  }

  this.$el = el;
}

Bee.version = '0.5.1';

module.exports = Bee;

},{"./check-binding.js":3,"./class.js":4,"./component.js":5,"./directive.js":6,"./directives":12,"./dom-utils.js":18,"./env.js":19,"./scope":23,"./utils.js":25,"./watcher.js":26}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
"use strict";

var Watcher = require('./watcher')
  , token = require('./token.js')
  , utils = require('./utils')
  , doc = require('./env.js').document
  , directive = require('./directive')
  ;

var NODETYPE = {
    ELEMENT: 1
  , ATTR: 2
  , TEXT: 3
  , COMMENT: 8
  , FRAGMENT: 11
};

doc.createElement('template');

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
    , dirs = directive.getDirs(el, cstr)
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

var partialReg = /^>\s*/;
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
      if(partialReg.test(t.path)) {
        t.path = t.path.replace(partialReg, '');
        dir = utils.create(dirs.content)
        dir.dirName = dir.type
        dir.anchors = directive.setAnchors(node, dir.type)
      }else{
        dir = utils.create(t.escape ? dirs.text : dirs.html)
      }

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

},{"./directive":6,"./env.js":19,"./token.js":24,"./utils":25,"./watcher":26}],4:[function(require,module,exports){
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
    var constructor = protoProps.hasOwnProperty('constructor') ?
          protoProps.constructor : function(){ return sup.apply(this, arguments); }
    var sup = this;
    var Fn = function() { this.constructor = constructor; };
    var supRef = {__super__: sup.prototype};

    Fn.prototype = sup.prototype;
    constructor.prototype = new Fn();
    extend(constructor.prototype, supRef, protoProps);
    extend(constructor, sup, supRef, staticProps);

    return constructor;
  }
};

module.exports = Class;

},{"./utils.js":25}],5:[function(require,module,exports){
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

},{"./utils.js":25}],6:[function(require,module,exports){
"use strict";

var utils = require('./utils.js')
  , token = require('./token.js')
  , doc = require('./env.js').document
  , parse = require('./parse.js').parse
  , evaluate = require('./eval.js')
  , domUtils = require('./dom-utils')

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

  //获取两个锚点之间的所有节点.
, getNodes: function(start, end) {
    start = start || this.anchors.start;
    end = end || this.anchors.end;

    var nodes = [], node = start.nextSibling;
    if(this.anchor && node) {
      while(node !== end){
        nodes.push(node);
        node = node.nextSibling;
      }

      return nodes;
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
    , dirs = [], dir
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
      if(dir.anchor) {
        dir.anchors = setAnchors(el, dir.dirName);
      }
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

function setAnchors(node, dirName) {
  var parent = node.parentNode
    , anchors = {}
    ;

    anchors.start = doc.createComment(dirName + ' start');
    parent.insertBefore(anchors.start, node);

    anchors.end = doc.createComment(dirName + ' end');
    if(node.nextSibling) {
      parent.insertBefore(anchors.end, node.nextSibling);
    }else{
      parent.appendChild(anchors.end);
    }
    return anchors
}

module.exports = {
  Directive: Directive,
  directive: directive,
  getDirs: getDirs,
  setAnchors: setAnchors
};

},{"./dom-utils":18,"./env.js":19,"./eval.js":20,"./parse.js":22,"./token.js":24,"./utils.js":25}],7:[function(require,module,exports){
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
},{"../utils.js":25}],8:[function(require,module,exports){
"use strict";

module.exports = {
  link: function() {
    this.initClass = this.el.className || ''
    this.keys = {};
  },
  update: function(classes) {
    var classStr = this.initClass
      , watcher = this.watcher
      ;

    if(typeof classes === 'string') {
      if(classes) {
        classStr += ' ' + classes;
      }
    }else{
      for(var key in classes) {
        if(!this.keys[key]) {
          this.keys[key] = true;
          //对象的键值默认不在监听范围之内, 这里手动监听
          this.vm.$watch(key, function() {
            watcher.update()
          })
        }
        if(this.vm.$get(key)) {
          classStr += ' ' + classes[key]
        }
      }
    }
    this.el.className = classStr;
  }
};

},{}],9:[function(require,module,exports){
//component as directive
var utils = require('../utils.js');
var domUtils = require('../dom-utils')
var checkBinding = require('../check-binding')

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
    var comp, content;
    //var refName;
    var dirs = [], $data = {};
    var Comp = cstr.getComponent(this.path)

    if(Comp) {

      if(Comp === cstr && vm.__mountcall || el.bee && el.bee === vm) {
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
          comPath = utils.hyphenToCamel(dir.dirName);
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

      //content = domUtils.createContent(el.childNodes);

      //组件内容属于其容器
      vm.__links = vm.__links.concat(checkBinding.walk.call(vm, el.childNodes));

      //el.appendChild(content)

      this.component = comp = new Comp({
        $el: el,
        $isReplace: true,
        $data: utils.extend({}, Comp.prototype.$data, $data, domUtils.getAttrs(el))
      });
      el.bee = comp;

      //直接将component 作为根元素时, 同步跟新容器 .$el 引用
      // if(vm.$el === el) {
      //   vm.__ref = comp;
      //   vm.$el = comp.$el;
      // }
      return comp;
    }else{
      console.warn('Component: ' + this.path + ' not defined! Ignore');
    }
  }
};

},{"../check-binding":3,"../dom-utils":18,"../utils.js":25}],10:[function(require,module,exports){
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

},{"../check-binding":3,"../dom-utils":18}],11:[function(require,module,exports){
"use strict";

var checkBinding = require('../check-binding')
  , domUtils = require('../dom-utils')
  , doc = require('../env').document

module.exports = {
  anchor: true
, priority: 900
, terminal: true
, link: function() {
    this.watchers = [];

    if(this.el.content) {
      this.frag = this.el.content;
      this.el.parentNode.removeChild(this.el);
    }else{
      this.frag = doc.createDocumentFragment()
    }
    this.remove();
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
    if(!this.walked) {
      this.walked = true;
      this.watchers = checkBinding.walk.call(this.vm, this.frag);
    }
    this.watchers.forEach(function(watcher) {
      watcher._hide = false;
      if(watcher._needUpdate) {
        watcher.update()
        watcher._needUpdate = false;
      }
    })
    anchor.parentNode && anchor.parentNode.insertBefore(this.frag, anchor);
  }
, remove: function() {
    var nodes = this.getNodes();

    for(var i = 0, l = nodes.length; i < l; i++) {
      this.frag.appendChild(nodes[i]);
    }

    this.watchers.forEach(function(watcher) {
      watcher._hide = true;
    })
  }
};

},{"../check-binding":3,"../dom-utils":18,"../env":19}],12:[function(require,module,exports){
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

dirs.template = {
  priority: 10000
, watch: false
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

//图片用, 避免加载 URL 中带有大括号的原始模板内容
dirs.src = {
  update: function(val) {
    this.el.src = val;
  }
};

dirs['with'] = {};

dirs['if'] = require('./if')
dirs.repeat = require('./repeat');
dirs.attr = require('./attr');
dirs.model = require('./model');
dirs.style = require('./style');
dirs.on = require('./on');
dirs.component = dirs.tag = require('./component');
dirs.content = require('./content')
dirs.ref = require('./ref')
dirs['class'] = require('./class.js')

module.exports = dirs;

},{"../check-binding":3,"../env.js":19,"../utils.js":25,"./attr":7,"./class.js":8,"./component":9,"./content":10,"./if":11,"./model":13,"./on":14,"./ref":15,"./repeat":16,"./style":17}],13:[function(require,module,exports){
"use strict";

var utils = require('../utils.js')
  , hasToken = require('../token.js').hasToken
  , events = require('../event-bind.js')
  ;


module.exports = {
  teminal: true
, priority: -2
, link: function() {
    var keyPath = this.path;
    var vm = this.vm;

    if(!keyPath) { return false; }

    var comp = this.el
      , ev = 'change'
      , attr
      , value = attr = 'value'
      , isSetDefaut = utils.isUndefined(vm.$get(keyPath))//界面的初始值不会覆盖 model 的初始值
      , crlf = /\r\n/g//IE 8 下 textarea 会自动将 \n 换行符换成 \r\n. 需要将其替换回来

        //更新组件
      , update = function(val) {
          if(val === 0 && comp.type !== 'checkbox') { val = '0' }
          var newVal = (val || '') + ''
            , val = comp[attr]
            ;
          val && val.replace && (val = val.replace(crlf, '\n'));
          if(newVal !== val){ comp[attr] = newVal; }
        }

        //更新 viewModel
      , handler = function() {
          var val = comp[value];

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

    if(comp.bee) {
      // 组件的双向绑定
      comp = comp.bee;
      value = comp.$valuekey;
      if(value) {
        update = function(val) {
          comp.$replace(value, val)
        };
        handler = function() {
          vm.$replace(keyPath, comp.$get(value))
        }
        comp.$watch(value, function(val, oldValue) {
          val !== oldValue && handler()
        }, true)
      }
    }else{
      //HTML 原生控件的双向绑定
      switch(comp.tagName) {
        default:
          value = attr = 'innerHTML';
          //ev += ' blur';
        case 'INPUT':
        case 'TEXTAREA':
          switch(comp.type) {
            case 'checkbox':
              value = attr = 'checked';
              //IE6, IE7 下监听 propertychange 会挂?
              if(ie) { ev += ' click'; }
            break;
            case 'radio':
              attr = 'checked';
              if(ie) { ev += ' click'; }
              update = function(val) {
                comp.checked = comp.value === val + '';
              };
              isSetDefaut = comp.checked;
            break;
            default:
              if(!vm.$lazy){
                if('oninput' in comp){
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
          if(comp.multiple){
            handler = function() {
              var vals = [];
              for(var i = 0, l = comp.options.length; i < l; i++){
                if(comp.options[i].selected){ vals.push(comp.options[i].value) }
              }
              vm.$replace(keyPath, vals);
            };
            update = function(vals){
              if(vals && vals.length){
                for(var i = 0, l = comp.options.length; i < l; i++){
                  comp.options[i].selected = vals.indexOf(comp.options[i].value) !== -1;
                }
              }
            };
          }
          isSetDefaut = isSetDefaut && !hasToken(comp[value]);
        break;
      }

      ev.split(/\s+/g).forEach(function(e){
        events.removeEvent(comp, e, callHandler);
        events.addEvent(comp, e, callHandler);
      });
      //根据表单元素的初始化默认值设置对应 model 的值
      if(comp[value] && isSetDefaut){
         handler();
      }
    }

    this.update = update;
  }
};

},{"../event-bind.js":21,"../token.js":24,"../utils.js":25}],14:[function(require,module,exports){
"use strict";

//事件监听

var eventBind = require('../event-bind.js');
var utils = require('../utils')

module.exports = {
  watch: false
, sub: true
, priority: -3 //事件应该在 b-model 之后监听. 防止普通事件调用过快
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
//请注意这里的 event.currentTarget 和 event.delegateTarget 同 jQuery 的刚好相反
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

},{"../event-bind.js":21,"../utils":25}],15:[function(require,module,exports){

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

},{"../utils":25}],16:[function(require,module,exports){
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
    var Bee = require('../bee')

    this.trackId = this.el.getAttribute('track-by')
    this.el.removeAttribute('track-by')

    //创建 repeat 的匿名构造函数
    //继承父构造函数的 `directives, components, filters` 属性
    this.cstr = Bee.extend({}, this.vm.constructor)

    //默认数据不应继承
    this.cstr.defaults = {};

    this.curArr = [];
    this.vmList = [];//子 VM list

    if(this.el.content) {
      this.frag = this.el.content;
      this.isRange = true
    }else{
      this.frag = this.el;
    }
    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    var that = this, vmList = this.vmList;
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

        if(that.isRange) {
          getNodesByIndex(that, pos).forEach(function(node) {
            parentNode.removeChild(node)
          })
        }else{
          parentNode.removeChild(vmList[pos].$el)
        }
        vmList[pos].$destroy()
        vmList.splice(pos, 1)
      })

      items.forEach(function(item, i) {
        var pos = indexByTrackId(item, items, trackId, i)
          , oldPos = indexByTrackId(item, curArr, trackId, i)
          , vm, el, anchor
          ;

        //新增元素
        if(oldPos < 0) {

          el = this.frag.cloneNode(true)

          if(this.isRange) {
            anchor = doc.createComment('')
            el.childNodes.length ? el.insertBefore(anchor, el.childNodes[0]) : el.appendChild(anchor)
          }

          vm = new this.cstr(el, {
            $data: item,
            $index: pos,
            $root: this.vm.$root,
            $parent: this.vm,
            _assignments: this.summary.assignments,
            __repeat: true,
            __anchor: anchor
          });

          parentNode.insertBefore(vm.$el, getAnchor(that, pos))
          vmList.splice(pos, 0, vm);
          curArr.splice(pos, 0, item)

          //延时赋值给 `_relativePath`, 避免出现死循环
          //如果在上面实例化时当参数传入, 会冒泡到父级 vm 递归调用这里的 update 方法, 造成死循环.
          vm._relativePath = this.listPath;
        }else {

          //调序
          if (pos !== oldPos) {

            parentNode.insertBefore(getElByIndex(that, oldPos), getAnchor(that, pos))
            parentNode.insertBefore(getElByIndex(that, pos), getAnchor(that, oldPos + 1))

            vmList[oldPos] = [vmList[pos], vmList[pos] = vmList[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
            vmList[pos].$index = pos
            vmList[pos].$update('$index')
          }
        }
      }.bind(this))

      //更新索引
      vmList.forEach(function(vm, i) {
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

function getAnchor(dir, index) {
  var vm = dir.vmList[index]
  return vm ? ( dir.isRange ? vm.__anchor : vm.$el ) : dir.anchors.end
}

//根据索引获取该次迭代中的所有元素
function getNodesByIndex(dir, index) {
  var vmList = dir.vmList
    , anchor = vmList[index].__anchor
    , next = vmList[index + 1]
    ;
  return [anchor].concat(dir.getNodes(anchor, next && next.__anchor))
}

function getElByIndex (dir, index) {
  var frag = doc.createDocumentFragment()
  if(dir.isRange) {
    getNodesByIndex(dir, index).forEach(function(node) {
      frag.appendChild(node)
    })
  }else{
    frag.appendChild(dir.vmList[index].$el)
  }
  return frag
}

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

},{"../bee":undefined,"../env.js":19,"../scope":23,"../utils.js":25}],17:[function(require,module,exports){
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

},{"../utils":25}],18:[function(require,module,exports){
"use strict";

var doc = require('./env.js').document
var utils = require('./utils')

module.exports = {
  //将模板/元素/nodelist 包裹在 fragment 中
  createContent: function createContent(tpl) {
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
  },

  //获取元素属性
  getAttrs: function(el) {
    var attributes = el.attributes;
    var attrs = {};

    for(var i = attributes.length - 1; i >= 0; i--) {
      //连接符转驼峰写法
      attrs[utils.hyphenToCamel(attributes[i].nodeName)] = attributes[i].value;
    }

    return attrs;
  },

  hasAttr: function(el, attrName) {
    return el.hasAttribute ? el.hasAttribute(attrName) : !utils.isUndefined(el[attrName]);
  }
};

},{"./env.js":19,"./utils":25}],19:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":2}],20:[function(require,module,exports){
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
      if(r && path){
        path = path + '.' + r;
      }
      return l[r];
    }
  , '[': function(l, r) {
      if(typeof r !== 'undefined' && path){
        path = path + '.' + r;
      }
      return l[r];
    }

    //TODO 模板中方法的 this 应该指向 root
  , '(': function(l, r){ return l.apply(root, r) }
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

},{"./scope":23}],21:[function(require,module,exports){
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
},{}],22:[function(require,module,exports){
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

	infix("(", 75, function (left) {
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

	infix("[", 60, function (left) {
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

},{}],23:[function(require,module,exports){
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

},{"./utils":25}],24:[function(require,module,exports){
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
},{}],25:[function(require,module,exports){
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
  },
  hyphenToCamel: hyphenToCamel
};

module.exports = utils;

},{"./env.js":19}],26:[function(require,module,exports){
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
  var oldValue = this.val;
  this.val = val;
  this.dir.update(val, oldValue);
}

utils.extend(Watcher.prototype, {
  //表达式执行并更新 view
  update: function() {
    var that = this
      , newVal
      ;

    if(this._hide) {
      this._needUpdate = true;
      return;
    }
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

},{"./eval.js":20,"./parse.js":22,"./scope":23,"./utils.js":25}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY2xhc3MuanMiLCJzcmMvZGlyZWN0aXZlcy9jb21wb25lbnQuanMiLCJzcmMvZGlyZWN0aXZlcy9jb250ZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvaWYuanMiLCJzcmMvZGlyZWN0aXZlcy9pbmRleC5qcyIsInNyYy9kaXJlY3RpdmVzL21vZGVsLmpzIiwic3JjL2RpcmVjdGl2ZXMvb24uanMiLCJzcmMvZGlyZWN0aXZlcy9yZWYuanMiLCJzcmMvZGlyZWN0aXZlcy9yZXBlYXQuanMiLCJzcmMvZGlyZWN0aXZlcy9zdHlsZS5qcyIsInNyYy9kb20tdXRpbHMuanMiLCJzcmMvZW52LmpzIiwic3JjL2V2YWwuanMiLCJzcmMvZXZlbnQtYmluZC5qcyIsInNyYy9wYXJzZS5qcyIsInNyYy9zY29wZS5qcyIsInNyYy90b2tlbi5qcyIsInNyYy91dGlscy5qcyIsInNyYy93YXRjaGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwWUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN01BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBDbGFzcyA9IHJlcXVpcmUoJy4vY2xhc3MuanMnKVxuICAsIGRpcmVjdGl2ZSA9IHJlcXVpcmUoJy4vZGlyZWN0aXZlLmpzJylcbiAgLCBDb20gPSByZXF1aXJlKCcuL2NvbXBvbmVudC5qcycpXG4gICwgV2F0Y2hlciA9IHJlcXVpcmUoJy4vd2F0Y2hlci5qcycpXG5cbiAgLCBkaXJzID0gcmVxdWlyZSgnLi9kaXJlY3RpdmVzJylcbiAgLCBkb21VdGlscyA9IHJlcXVpcmUoJy4vZG9tLXV0aWxzLmpzJylcbiAgLCBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuL2NoZWNrLWJpbmRpbmcuanMnKVxuICAsIHNjb3BlID0gcmVxdWlyZSgnLi9zY29wZScpXG5cbiAgLCBEaXIgPSBkaXJlY3RpdmUuRGlyZWN0aXZlXG4gIDtcblxuXG52YXIgaXNPYmplY3QgPSB1dGlscy5pc09iamVjdFxuICAsIGlzUGxhaW5PYmplY3QgPSB1dGlscy5pc1BsYWluT2JqZWN0XG4gICwgcGFyc2VLZXlQYXRoID0gdXRpbHMucGFyc2VLZXlQYXRoXG4gICwgZGVlcFNldCA9IHV0aWxzLmRlZXBTZXRcbiAgLCBleHRlbmQgPSB1dGlscy5leHRlbmRcbiAgLCBjcmVhdGUgPSB1dGlscy5jcmVhdGVcbiAgO1xuXG4vL+iuvue9riBkaXJlY3RpdmUg5YmN57yAXG5mdW5jdGlvbiBzZXRQcmVmaXgobmV3UHJlZml4KSB7XG4gIGlmKG5ld1ByZWZpeCl7XG4gICAgdGhpcy5wcmVmaXggPSBuZXdQcmVmaXg7XG4gIH1cbn1cblxuLy9UT0RPIOa4heeQhui/meS4qlxudmFyIG1lcmdlUHJvcHMgPSB7XG4gICRkYXRhOiAxXG59O1xuXG52YXIgbGlmZUN5Y2xlcyA9IHtcbiAgJGJlZm9yZUluaXQ6IHV0aWxzLm5vb3BcbiwgJGFmdGVySW5pdDogdXRpbHMubm9vcFxuLCAkYmVmb3JlVXBkYXRlOiB1dGlscy5ub29wXG4sICRhZnRlclVwZGF0ZTogdXRpbHMubm9vcFxuLCAkYmVmb3JlRGVzdHJveTogdXRpbHMubm9vcFxuLCAkYWZ0ZXJEZXN0cm95OiB1dGlscy5ub29wXG59O1xuXG4vKipcbiAqIOaehOmAoOWHveaVsFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1N0cmluZ3xFbGVtZW50fSBbdHBsXSDmqKHmnb8uIOetieWQjOS6jiBwcm9wcy4kdHBsXG4gKiBAcGFyYW0ge09iamVjdH0gW3Byb3BzXSDlsZ7mgKcv5pa55rOVXG4gKi9cbmZ1bmN0aW9uIEJlZSh0cGwsIHByb3BzKSB7XG4gIGlmKGlzUGxhaW5PYmplY3QodHBsKSkge1xuICAgIHByb3BzID0gdHBsO1xuICB9ZWxzZXtcbiAgICBwcm9wcyA9IHByb3BzIHx8IHt9O1xuICAgIGlmKHRwbCkge1xuICAgICAgcHJvcHMuJHRwbCA9IHRwbDtcbiAgICB9XG4gIH1cblxuICB2YXIgZGVmYXVsdHMgPSB7XG4gICAgLy8kIOW8gOWktOeahOaYr+WFseacieWxnuaApy/mlrnms5VcbiAgICAkZGF0YTogZXh0ZW5kKHRydWUsIHt9LCB0aGlzLmNvbnN0cnVjdG9yLmRlZmF1bHRzKVxuICAsICRyZWZzOiB7fVxuICAsICRtaXhpbnM6IFtdXG5cbiAgLCAkZWw6IHRoaXMuJGVsIHx8IG51bGxcbiAgLCAkdHBsOiB0aGlzLiR0cGwgfHwgJzxkaXY+e3s+ICRjb250ZW50IH19PC9kaXY+J1xuICAsICRjb250ZW50OiB0aGlzLiRjb250ZW50IHx8IG51bGxcblxuICAsICRpc1JlcGxhY2U6IGZhbHNlXG4gICwgJHBhcmVudDogbnVsbFxuICAsICRyb290OiB0aGlzXG5cbiAgICAvL+engeacieWxnuaApy/mlrnms5VcbiAgLCBfd2F0Y2hlcnM6IHt9XG4gICwgX2Fzc2lnbm1lbnRzOiBudWxsLy/lvZPliY0gdm0g55qE5Yir5ZCNXG4gICwgX3JlbGF0aXZlUGF0aDogW11cbiAgLCBfX2xpbmtzOiBbXVxuICAsIF9pc1JlbmRlcmVkOiBmYWxzZVxuICB9O1xuXG4gIHZhciBtaXhpbnMgPSBbZGVmYXVsdHNdLmNvbmNhdCh0aGlzLiRtaXhpbnMpLmNvbmNhdChwcm9wcy4kbWl4aW5zKS5jb25jYXQoW3Byb3BzXSlcblxuICBtaXhpbnMuZm9yRWFjaChmdW5jdGlvbihtaXhpbikge1xuICAgIHZhciBwcm9wO1xuICAgIGZvcih2YXIgcHJvcEtleSBpbiBtaXhpbikge1xuICAgICAgaWYobWl4aW4uaGFzT3duUHJvcGVydHkocHJvcEtleSkpIHtcbiAgICAgICAgaWYgKChwcm9wS2V5IGluIG1lcmdlUHJvcHMpICYmIGlzT2JqZWN0KG1peGluW3Byb3BLZXldKSkge1xuICAgICAgICAgIC8v5L+d5oyB5a+55Lyg5YWl5bGe5oCn55qE5byV55SoXG4gICAgICAgICAgLy9tZXJnZVByb3BzIOS4reeahOWxnuaAp+S8muiiq+m7mOiupOWAvOaJqeWxlVxuICAgICAgICAgIHByb3AgPSBleHRlbmQoe30sIHRoaXNbcHJvcEtleV0sIG1peGluW3Byb3BLZXldKVxuICAgICAgICAgIHRoaXNbcHJvcEtleV0gPSBleHRlbmQobWl4aW5bcHJvcEtleV0sIHByb3ApXG4gICAgICAgIH0gZWxzZSBpZiAocHJvcEtleSBpbiBsaWZlQ3ljbGVzKSB7XG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IHV0aWxzLmFmdGVyRm4odGhpc1twcm9wS2V5XSwgbWl4aW5bcHJvcEtleV0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IG1peGluW3Byb3BLZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9LmJpbmQodGhpcykpXG5cbiAgZXh0ZW5kKHRoaXMsIHRoaXMuJGRhdGEpO1xuXG4gIHJlc29sdmVUcGwuY2FsbCh0aGlzKTtcblxuICB0aGlzLiRiZWZvcmVJbml0KClcbiAgdGhpcy4kZWwuYmVlID0gdGhpcztcblxuICAvL19fbGlua3Mg5YyF5ZCr5LqGICRlbCDkuIvmiYDmnInnmoTnu5HlrprlvJXnlKhcbiAgdGhpcy5fX2xpbmtzID0gdGhpcy5fX2xpbmtzLmNvbmNhdCggY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh0aGlzLCB0aGlzLiRlbCkgKTtcblxuICB0aGlzLl9pc1JlbmRlcmVkID0gdHJ1ZTtcbiAgdGhpcy4kYWZ0ZXJJbml0KCk7XG59XG5cbi8v6Z2Z5oCB5bGe5oCnXG5leHRlbmQoQmVlLCB7ZXh0ZW5kOiB1dGlscy5hZnRlckZuKENsYXNzLmV4dGVuZCwgdXRpbHMubm9vcCwgZnVuY3Rpb24oc3ViKSB7XG4gIC8v5q+P5Liq5p6E6YCg5Ye95pWw6YO95pyJ6Ieq5bex55qEIGRpcmVjdGl2ZXMgLGNvbXBvbmVudHMsIGZpbHRlcnMg5byV55SoXG4gIHN1Yi5kaXJlY3RpdmVzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmRpcmVjdGl2ZXMpLCBzdWIuZGlyZWN0aXZlcyk7XG4gIHN1Yi5jb21wb25lbnRzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmNvbXBvbmVudHMpLCBzdWIuY29tcG9uZW50cyk7XG4gIHN1Yi5maWx0ZXJzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmZpbHRlcnMpLCBzdWIuZmlsdGVycyk7XG4gIHN1Yi5kZWZhdWx0cyA9IGV4dGVuZCh0cnVlLCB7fSwgdGhpcy5kZWZhdWx0cywgc3ViLmRlZmF1bHRzKTtcbn0pLCB1dGlsczogdXRpbHN9LCBEaXIsIENvbSwge1xuICBzZXRQcmVmaXg6IHNldFByZWZpeFxuLCBkaXJlY3RpdmU6IGRpcmVjdGl2ZS5kaXJlY3RpdmVcbiwgcHJlZml4OiAnJ1xuLCBkb2M6IGRvY1xuLCBkaXJlY3RpdmVzOiB7fVxuLCBjb21wb25lbnRzOiB7fVxuLCBkZWZhdWx0czoge31cbiwgZmlsdGVyczoge1xuICAgIC8vYnVpbGQgaW4gZmlsdGVyXG4gICAganNvbjogZnVuY3Rpb24ob2JqLCByZXBsYWNlciwgc3BhY2UpIHtcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIHJlcGxhY2VyLCBzcGFjZSkgfVxuICB9XG4sIGZpbHRlcjogZnVuY3Rpb24oZmlsdGVyTmFtZSwgZmlsdGVyKSB7XG4gICAgdGhpcy5maWx0ZXJzW2ZpbHRlck5hbWVdID0gZmlsdGVyO1xuICB9XG4sIG1vdW50OiBmdW5jdGlvbihpZCwgcHJvcHMpIHtcbiAgICB2YXIgZWwgPSBpZC5ub2RlVHlwZSA/IGlkIDogZG9jLmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICB2YXIgaW5zdGFuY2U7XG4gICAgdmFyIGRpcnMgPSBkaXJlY3RpdmUuZ2V0RGlycyhlbCwgdGhpcyk7XG4gICAgdmFyIENvbXAsIGRpcjtcblxuICAgIGRpciA9IGRpcnMuZmlsdGVyKGZ1bmN0aW9uKGRpcikge1xuICAgICAgcmV0dXJuICBkaXIudHlwZSA9PT0gJ3RhZycgfHwgZGlyLnR5cGUgPT09ICdjb21wb25lbnQnXG4gICAgfSlbMF07XG5cbiAgICBpZihkaXIpIHtcbiAgICAgIENvbXAgPSB0aGlzLmdldENvbXBvbmVudChkaXIucGF0aClcbiAgICB9XG5cbiAgICBwcm9wcyA9IHByb3BzIHx8IHt9O1xuICAgIGlmKENvbXApIHtcbiAgICAgIHByb3BzLiRkYXRhID0gZXh0ZW5kKGRvbVV0aWxzLmdldEF0dHJzKGVsKSwgcHJvcHMuJGRhdGEpXG4gICAgICBpbnN0YW5jZSA9IG5ldyBDb21wKGV4dGVuZCh7JGVsOiBlbCwgJGlzUmVwbGFjZTogdHJ1ZSwgX19tb3VudGNhbGw6IHRydWV9LCBwcm9wcykpXG4gICAgfWVsc2V7XG4gICAgICBpbnN0YW5jZSA9IG5ldyBCZWUoZWwsIHByb3BzKTtcbiAgICB9XG4gICAgcmV0dXJuIGluc3RhbmNlXG4gIH1cbn0pO1xuXG5cbkJlZS5zZXRQcmVmaXgoJ2ItJyk7XG5cbi8v5YaF572uIGRpcmVjdGl2ZVxuZm9yKHZhciBkaXIgaW4gZGlycykge1xuICBCZWUuZGlyZWN0aXZlKGRpciwgZGlyc1tkaXJdKTtcbn1cblxuLy/lrp7kvovmlrnms5Vcbi8vLS0tLVxuZXh0ZW5kKEJlZS5wcm90b3R5cGUsIGxpZmVDeWNsZXMsIHtcbiAgLyoqXG4gICAqIOiOt+WPluWxnuaApy/mlrnms5VcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV4cHJlc3Npb24g6Lev5b6EL+ihqOi+vuW8j1xuICAgKiBAcmV0dXJucyB7Kn1cbiAgICovXG4gICRnZXQ6IGZ1bmN0aW9uKGV4cHJlc3Npb24pIHtcbiAgICB2YXIgZGlyID0gbmV3IERpcignJGdldCcsIHtcbiAgICAgIHBhdGg6IGV4cHJlc3Npb25cbiAgICAsIHdhdGNoOiBmYWxzZVxuICAgIH0pO1xuICAgIGRpci5wYXJzZSgpO1xuICAgIHJldHVybiBkaXIuZ2V0VmFsdWUodGhpcywgZmFsc2UpXG4gIH1cblxuICAvKipcbiAgICog5pu05paw5ZCI5bm2IGAuZGF0YWAg5Lit55qE5pWw5o2uLiDlpoLmnpzlj6rmnInkuIDkuKrlj4LmlbAsIOmCo+S5iOi/meS4quWPguaVsOWwhuW5tuWFpSAuJGRhdGFcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtrZXldIOaVsOaNrui3r+W+hC5cbiAgICogQHBhcmFtIHtBbnlUeXBlfE9iamVjdH0gdmFsIOaVsOaNruWGheWuuS5cbiAgICovXG4sICRzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsKSB7XG4gICAgdmFyIGFkZCwga2V5cywgaGFzS2V5ID0gZmFsc2U7XG4gICAgdmFyIHJlZm9ybWVkLCByZUtleSwgcmVWbSA9IHRoaXM7XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIGlmKGlzT2JqZWN0KGtleSkpIHtcbiAgICAgICAgZXh0ZW5kKHRoaXMuJGRhdGEsIGtleSk7XG4gICAgICAgIGV4dGVuZCh0aGlzLCBrZXkpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHRoaXMuJGRhdGEgPSBrZXk7XG4gICAgICB9XG4gICAgICB1cGRhdGUuY2FsbChyZVZtLCBrZXkpO1xuICAgIH1lbHNle1xuICAgICAgdGhpcy4kcmVwbGFjZShrZXksIHZhbCk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiDmlbDmja7mm7/mjaJcbiAgICovXG4sICRyZXBsYWNlOiBmdW5jdGlvbiAoa2V5LCB2YWwpIHtcbiAgICB2YXIga2V5cywgbGFzdCwgaGFzS2V5ID0gZmFsc2U7XG4gICAgdmFyIHJlZm9ybWVkLCByZUtleSwgcmVWbSA9IHRoaXM7XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIHZhbCA9IGtleTtcbiAgICAgIHJlS2V5ID0gJyRkYXRhJztcbiAgICAgIGtleXMgPSBbcmVLZXldO1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIHJlZm9ybWVkID0gc2NvcGUucmVmb3JtU2NvcGUodGhpcywga2V5KVxuICAgICAgcmVLZXkgPSByZWZvcm1lZC5wYXRoO1xuICAgICAgcmVWbSA9IHJlZm9ybWVkLnZtO1xuICAgICAga2V5cyA9IHBhcnNlS2V5UGF0aChyZUtleSk7XG4gICAgfVxuXG4gICAgbGFzdCA9IHJlVm0uJGdldChyZUtleSk7XG5cbiAgICBpZiAoa2V5c1swXSA9PT0gJyRkYXRhJykge1xuICAgICAgaWYocmVLZXkgPT09ICckZGF0YScpIHtcbiAgICAgICAgaWYoaXNPYmplY3QodGhpcy4kZGF0YSkpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLiRkYXRhKS5mb3JFYWNoKGZ1bmN0aW9uIChrKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpc1trXTtcbiAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIH1cbiAgICAgICAgZXh0ZW5kKHJlVm0sIHZhbCk7XG4gICAgICB9ZWxzZSB7XG4gICAgICAgIGRlZXBTZXQoa2V5cy5zaGlmdCgpLmpvaW4oJy4nKSwgdmFsLCByZVZtKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0uJGRhdGEpO1xuICAgIH1cbiAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0pXG5cbiAgICBoYXNLZXkgPyB1cGRhdGUuY2FsbChyZVZtLCByZUtleSwgZXh0ZW5kKHt9LCBsYXN0LCB2YWwpKSA6IHVwZGF0ZS5jYWxsKHJlVm0sIGV4dGVuZCh7fSwgbGFzdCwgdmFsKSk7XG4gIH1cbiAgLyoqXG4gICAqIOaJi+WKqOabtOaWsOafkOmDqOWIhuaVsOaNrlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDmjIflrprmm7TmlrDmlbDmja7nmoQga2V5UGF0aFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpc0J1YmJsZT10cnVlXSDmmK/lkKbmm7TmlrAga2V5UGF0aCDnmoTniLbnuqdcbiAgICovXG4sICR1cGRhdGU6IGZ1bmN0aW9uIChrZXlQYXRoLCBpc0J1YmJsZSkge1xuICAgIGlzQnViYmxlID0gaXNCdWJibGUgIT09IGZhbHNlO1xuXG4gICAgdmFyIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5UGF0aC5yZXBsYWNlKC9eXFwkZGF0YVxcLi8sICcnKSksIGtleTtcbiAgICB2YXIgd2F0Y2hlcnM7XG5cbiAgICB3aGlsZShrZXkgPSBrZXlzLmpvaW4oJy4nKSkge1xuICAgICAgd2F0Y2hlcnMgPSB0aGlzLl93YXRjaGVyc1trZXldIHx8IFtdO1xuXG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHdhdGNoZXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB3YXRjaGVyc1tpXS51cGRhdGUoKTtcbiAgICAgIH1cblxuICAgICAgaWYoaXNCdWJibGUpIHtcbiAgICAgICAga2V5cy5wb3AoKTtcbiAgICAgICAgLy/mnIDnu4jpg73lhpLms6HliLAgJGRhdGFcbiAgICAgICAgaWYoIWtleXMubGVuZ3RoICYmIGtleSAhPT0gJyRkYXRhJyl7XG4gICAgICAgICAga2V5cy5wdXNoKCckZGF0YScpO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy/lkIzml7bmm7TmlrDlrZDot6/lvoRcbiAgICBXYXRjaGVyLmdldFdhdGNoZXJzKHRoaXMsIGtleVBhdGgpLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci51cGRhdGUoKTtcbiAgICB9LmJpbmQodGhpcykpXG5cbiAgICAvL+aVsOe7hOWGkuazoeeahOaDheWGtVxuICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICBpZih0aGlzLiRwYXJlbnQpIHtcbiAgICAgICAgLy/lkIzmraXmm7TmlrDniLYgdm0g5a+55bqU6YOo5YiGXG4gICAgICAgIHRoaXMuX3JlbGF0aXZlUGF0aC5mb3JFYWNoKGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgICAgICAgdGhpcy4kcGFyZW50LiR1cGRhdGUocGF0aCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiwgJHdhdGNoOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY2FsbGJhY2ssIGltbWVkaWF0ZSkge1xuICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICB2YXIgdXBkYXRlID0gY2FsbGJhY2suYmluZCh0aGlzKTtcbiAgICAgIHVwZGF0ZS5fb3JpZ2luRm4gPSBjYWxsYmFjaztcbiAgICAgIHJldHVybiBXYXRjaGVyLmFkZFdhdGNoZXIuY2FsbCh0aGlzLCBuZXcgRGlyKCckd2F0Y2gnLCB7cGF0aDogZXhwcmVzc2lvbiwgdXBkYXRlOiB1cGRhdGUsIGltbWVkaWF0ZSA6ICEhaW1tZWRpYXRlfSkpXG4gICAgfVxuICB9XG4sICR1bndhdGNoOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY2FsbGJhY2spIHtcbiAgICBXYXRjaGVyLnVud2F0Y2godGhpcywgZXhwcmVzc2lvbiwgY2FsbGJhY2spXG4gIH1cbiAgLy/plIDmr4HlvZPliY3lrp7kvotcbiwgJGRlc3Ryb3k6IGZ1bmN0aW9uKHJlbW92ZUVsKSB7XG4gICAgdGhpcy4kYmVmb3JlRGVzdHJveSgpXG4gICAgdGhpcy5fX2xpbmtzLmZvckVhY2goZnVuY3Rpb24od2FjaGVyKSB7XG4gICAgICB3YWNoZXIudW53YXRjaCgpXG4gICAgfSlcbiAgICByZW1vdmVFbCAmJiB0aGlzLiRlbC5wYXJlbnROb2RlICYmIHRoaXMuJGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy4kZWwpXG4gICAgdGhpcy5fX2xpbmtzID0gW107XG4gICAgdGhpcy4kYWZ0ZXJEZXN0cm95KClcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHVwZGF0ZSAoa2V5UGF0aCwgZGF0YSkge1xuICB2YXIga2V5UGF0aHM7XG4gIHRoaXMuJGJlZm9yZVVwZGF0ZSh0aGlzLiRkYXRhKVxuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZGF0YSA9IGtleVBhdGg7XG4gIH1lbHNle1xuICAgIGtleVBhdGhzID0gW2tleVBhdGhdO1xuICB9XG5cbiAgaWYoIWtleVBhdGhzKSB7XG4gICAgaWYoaXNPYmplY3QoZGF0YSkpIHtcbiAgICAgIGtleVBhdGhzID0gT2JqZWN0LmtleXMoZGF0YSk7XG4gICAgfWVsc2V7XG4gICAgICAvLy4kZGF0YSDmnInlj6/og73mmK/ln7rmnKznsbvlnovmlbDmja5cbiAgICAgIGtleVBhdGhzID0gWyckZGF0YSddO1xuICAgIH1cbiAgfVxuXG4gIGZvcih2YXIgaSA9IDAsIHBhdGg7IHBhdGggPSBrZXlQYXRoc1tpXTsgaSsrKXtcbiAgICB0aGlzLiR1cGRhdGUocGF0aCwgdHJ1ZSk7XG4gIH1cbiAgdGhpcy4kYWZ0ZXJVcGRhdGUodGhpcy4kZGF0YSlcbn1cblxuLy/lpITnkIYgJGVsLCAgJGNvbnRlbnQsICR0cGxcbmZ1bmN0aW9uIHJlc29sdmVUcGwoKSB7XG4gIHZhciBlbCA9IHRoaXMuJGVsXG4gICAgLCBjb250ZW50ID0gdGhpcy4kY29udGVudFxuICAgICwgdHBsID0gdGhpcy4kdHBsXG4gICAgLCB0cGxFbFxuICAgIDtcblxuICBjb250ZW50ID0gZWwgJiYgZWwuY2hpbGROb2RlcyA/IGVsLmNoaWxkTm9kZXMgOiBjb250ZW50XG5cbiAgaWYoZWwpIHtcbiAgICAvL+S8oOWFpSAkZWwg5YWD57Sg55qE5a2Q5YWD57Sg6YO95a2Y5pS+5YiwICRjb250ZW4g5LitXG4gICAgY29udGVudCA9IGVsLmNoaWxkTm9kZXM7XG4gIH1cblxuICBpZihjb250ZW50KSB7XG4gICAgLy/liJvlu7ogJGNvbnRlbnQgZG9jdW1lbnRGcmFnbWVudFxuICAgIHRoaXMuJGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KGNvbnRlbnQpXG4gIH1cblxuICBpZih1dGlscy5pc09iamVjdCh0cGwpKXtcbiAgICAvL0RPTSDlhYPntKBcbiAgICB0cGxFbCA9IHRwbDtcbiAgICB0cGwgPSB0cGxFbC5vdXRlckhUTUw7XG4gIH1lbHNle1xuICAgIC8v5a2X56ym5LiyXG4gICAgdHBsRWwgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KHRwbCkuY2hpbGROb2Rlc1swXTtcbiAgfVxuXG4gIGlmKGVsKSB7XG4gICAgaWYodGhpcy4kaXNSZXBsYWNlKSB7XG4gICAgICBlbC5wYXJlbnROb2RlICYmIGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKHRwbEVsLCBlbClcbiAgICAgIGVsID0gdHBsRWw7XG4gICAgfWVsc2V7XG4gICAgICBlbC5hcHBlbmRDaGlsZCh0cGxFbClcbiAgICB9XG4gIH1lbHNle1xuICAgIGVsID0gdHBsRWw7XG4gIH1cblxuICB0aGlzLiRlbCA9IGVsO1xufVxuXG5CZWUudmVyc2lvbiA9ICcwLjUuMSc7XG5cbm1vZHVsZS5leHBvcnRzID0gQmVlO1xuIixudWxsLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFdhdGNoZXIgPSByZXF1aXJlKCcuL3dhdGNoZXInKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi90b2tlbi5qcycpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gICwgZGlyZWN0aXZlID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUnKVxuICA7XG5cbnZhciBOT0RFVFlQRSA9IHtcbiAgICBFTEVNRU5UOiAxXG4gICwgQVRUUjogMlxuICAsIFRFWFQ6IDNcbiAgLCBDT01NRU5UOiA4XG4gICwgRlJBR01FTlQ6IDExXG59O1xuXG5kb2MuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKTtcblxuLyoqXG4gKiDpgY3ljoYgZG9tIOagkVxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RWxlbWVudHxOb2RlTGlzdH0gZWxcbiAqIEByZXR1cm5zIHtBcnJheX0g6IqC54K55LiL5omA5pyJ55qE57uR5a6aXG4gKi9cblxuZnVuY3Rpb24gd2FsayhlbCkge1xuICB2YXIgd2F0Y2hlcnMgPSBbXSwgZGlyUmVzdWx0O1xuICBpZihlbC5ub2RlVHlwZSA9PT0gTk9ERVRZUEUuRlJBR01FTlQpIHtcbiAgICBlbCA9IGVsLmNoaWxkTm9kZXM7XG4gIH1cblxuICBpZigoJ2xlbmd0aCcgaW4gZWwpICYmIHV0aWxzLmlzVW5kZWZpbmVkKGVsLm5vZGVUeXBlKSl7XG4gICAgLy9ub2RlIGxpc3RcbiAgICAvL+WvueS6jiBub2RlbGlzdCDlpoLmnpzlhbbkuK3mnInljIXlkKsge3t0ZXh0fX0g55u05o6l6YeP55qE6KGo6L6+5byPLCDmlofmnKzoioLngrnkvJrooqvliIblibIsIOWFtuiKgueCueaVsOmHj+WPr+iDveS8muWKqOaAgeWinuWKoFxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbC5sZW5ndGg7IGkrKykge1xuICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHdhbGsuY2FsbCh0aGlzLCBlbFtpXSkgKTtcbiAgICB9XG4gICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgc3dpdGNoIChlbC5ub2RlVHlwZSkge1xuICAgIGNhc2UgTk9ERVRZUEUuRUxFTUVOVDpcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuQ09NTUVOVDpcbiAgICAgIC8v5rOo6YeK6IqC54K5XG4gICAgICByZXR1cm4gd2F0Y2hlcnM7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5PREVUWVBFLlRFWFQ6XG4gICAgICAvL+aWh+acrOiKgueCuVxuICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIGNoZWNrVGV4dC5jYWxsKHRoaXMsIGVsKSApO1xuICAgICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgaWYoZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIC8vdGVtcGxhdGUgc2hpbVxuICAgIGlmKCFlbC5jb250ZW50KSB7XG4gICAgICBlbC5jb250ZW50ID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgICAgIHdoaWxlKGVsLmNoaWxkTm9kZXNbMF0pIHtcbiAgICAgICAgZWwuY29udGVudC5hcHBlbmRDaGlsZChlbC5jaGlsZE5vZGVzWzBdKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGRpclJlc3VsdCA9IGNoZWNrQXR0ci5jYWxsKHRoaXMsIGVsKTtcbiAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoZGlyUmVzdWx0LndhdGNoZXJzKVxuICBpZihkaXJSZXN1bHQudGVybWluYWwpe1xuICAgIHJldHVybiB3YXRjaGVycztcbiAgfVxuXG4gIGlmKGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGVsLmNvbnRlbnQpIClcbiAgfVxuXG4gIGZvcih2YXIgY2hpbGQgPSBlbC5maXJzdENoaWxkLCBuZXh0OyBjaGlsZDsgKXtcbiAgICBuZXh0ID0gY2hpbGQubmV4dFNpYmxpbmc7XG4gICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHdhbGsuY2FsbCh0aGlzLCBjaGlsZCkgKTtcbiAgICBjaGlsZCA9IG5leHQ7XG4gIH1cblxuICByZXR1cm4gd2F0Y2hlcnNcbn1cblxuLy/pgY3ljoblsZ7mgKdcbmZ1bmN0aW9uIGNoZWNrQXR0cihlbCkge1xuICB2YXIgY3N0ciA9IHRoaXMuY29uc3RydWN0b3JcbiAgICAsIGRpcnMgPSBkaXJlY3RpdmUuZ2V0RGlycyhlbCwgY3N0cilcbiAgICAsIGRpclxuICAgICwgdGVybWluYWxQcmlvcml0eSwgd2F0Y2hlcnMgPSBbXVxuICAgICwgcmVzdWx0ID0ge307XG4gIDtcblxuICBmb3IgKHZhciBpID0gMCwgbCA9IGRpcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgZGlyID0gZGlyc1tpXTtcbiAgICBkaXIuZGlycyA9IGRpcnM7XG5cbiAgICAvL+WvueS6jiB0ZXJtaW5hbCDkuLogdHJ1ZSDnmoQgZGlyZWN0aXZlLCDlnKjop6PmnpDlrozlhbbnm7jlkIzmnYPph43nmoQgZGlyZWN0aXZlIOWQjuS4reaWremBjeWOhuivpeWFg+e0oFxuICAgIGlmKHRlcm1pbmFsUHJpb3JpdHkgPiBkaXIucHJpb3JpdHkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGVsLnJlbW92ZUF0dHJpYnV0ZShkaXIubm9kZU5hbWUpO1xuXG4gICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHNldEJpbmRpbmcuY2FsbCh0aGlzLCBkaXIpICk7XG5cbiAgICBpZihkaXIudGVybWluYWwpIHtcbiAgICAgIHJlc3VsdC50ZXJtaW5hbCA9IHRydWU7XG4gICAgICB0ZXJtaW5hbFByaW9yaXR5ID0gZGlyLnByaW9yaXR5O1xuICAgIH1cbiAgfVxuXG4gIHJlc3VsdC53YXRjaGVycyA9IHdhdGNoZXJzXG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG52YXIgcGFydGlhbFJlZyA9IC9ePlxccyovO1xuLy/lpITnkIbmlofmnKzoioLngrnkuK3nmoTnu5HlrprljaDkvY3nrKYoe3suLi59fSlcbmZ1bmN0aW9uIGNoZWNrVGV4dChub2RlKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdO1xuICBpZih0b2tlbi5oYXNUb2tlbihub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICB2YXIgdG9rZW5zID0gdG9rZW4ucGFyc2VUb2tlbihub2RlLm5vZGVWYWx1ZSlcbiAgICAgICwgdGV4dE1hcCA9IHRva2Vucy50ZXh0TWFwXG4gICAgICAsIGVsID0gbm9kZS5wYXJlbnROb2RlXG4gICAgICAsIGRpcnMgPSB0aGlzLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXNcbiAgICAgICwgdCwgZGlyXG4gICAgICA7XG5cbiAgICAvL+Wwhnt7a2V5fX3liIblibLmiJDljZXni6znmoTmlofmnKzoioLngrlcbiAgICBpZih0ZXh0TWFwLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRleHRNYXAuZm9yRWFjaChmdW5jdGlvbih0ZXh0KSB7XG4gICAgICAgIHZhciB0biA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKHRuLCBub2RlKTtcbiAgICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoY2hlY2tUZXh0LmNhbGwodGhpcywgdG4pKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICBlbC5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9ZWxzZXtcbiAgICAgIHQgPSB0b2tlbnNbMF07XG4gICAgICAvL+WGhee9ruWQhOWNoOS9jeespuWkhOeQhi5cbiAgICAgIGlmKHBhcnRpYWxSZWcudGVzdCh0LnBhdGgpKSB7XG4gICAgICAgIHQucGF0aCA9IHQucGF0aC5yZXBsYWNlKHBhcnRpYWxSZWcsICcnKTtcbiAgICAgICAgZGlyID0gdXRpbHMuY3JlYXRlKGRpcnMuY29udGVudClcbiAgICAgICAgZGlyLmRpck5hbWUgPSBkaXIudHlwZVxuICAgICAgICBkaXIuYW5jaG9ycyA9IGRpcmVjdGl2ZS5zZXRBbmNob3JzKG5vZGUsIGRpci50eXBlKVxuICAgICAgfWVsc2V7XG4gICAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZSh0LmVzY2FwZSA/IGRpcnMudGV4dCA6IGRpcnMuaHRtbClcbiAgICAgIH1cblxuICAgICAgd2F0Y2hlcnMgPSBzZXRCaW5kaW5nLmNhbGwodGhpcywgdXRpbHMuZXh0ZW5kKGRpciwgdCwge1xuICAgICAgICBlbDogbm9kZVxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gd2F0Y2hlcnNcbn1cblxuZnVuY3Rpb24gc2V0QmluZGluZyhkaXIpIHtcbiAgdmFyIHdhdGNoZXJcbiAgaWYoZGlyLnJlcGxhY2UpIHtcbiAgICB2YXIgZWwgPSBkaXIuZWw7XG4gICAgaWYodXRpbHMuaXNGdW5jdGlvbihkaXIucmVwbGFjZSkpIHtcbiAgICAgIGRpci5ub2RlID0gZGlyLnJlcGxhY2UoKTtcbiAgICB9ZWxzZXtcbiAgICAgIGRpci5ub2RlID0gZG9jLmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICB9XG5cbiAgICBkaXIuZWwgPSBkaXIuZWwucGFyZW50Tm9kZTtcbiAgICBkaXIuZWwucmVwbGFjZUNoaWxkKGRpci5ub2RlLCBlbCk7XG4gIH1cblxuICBkaXIudm0gPSB0aGlzO1xuICBkaXIubGluaygpO1xuXG4gIHdhdGNoZXIgPSBXYXRjaGVyLmFkZFdhdGNoZXIuY2FsbCh0aGlzLCBkaXIpXG4gIHJldHVybiB3YXRjaGVyID8gW3dhdGNoZXJdIDogW11cbn1cblxuZnVuY3Rpb24gdW5CaW5kaW5nKHdhdGNoZXJzKSB7XG4gIHdhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgIHdhdGNoZXIudW53YXRjaCgpXG4gIH0pXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB3YWxrOiB3YWxrLFxuICB1bkJpbmRpbmc6IHVuQmluZGluZ1xufTtcbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWxzLmpzJykuZXh0ZW5kO1xuXG52YXIgQ2xhc3MgPSB7XG4gIC8qKlxuICAgKiDmnoTpgKDlh73mlbDnu6fmib8uXG4gICAqIOWmgjogYHZhciBDYXIgPSBCZWUuZXh0ZW5kKHtkcml2ZTogZnVuY3Rpb24oKXt9fSk7IG5ldyBDYXIoKTtgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvdG9Qcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV5Y6f5Z6L5a+56LGhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbc3RhdGljUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxlemdmeaAgeWxnuaAp1xuICAgKiBAcmV0dXJucyB7RnVuY3Rpb259IOWtkOaehOmAoOWHveaVsFxuICAgKi9cbiAgZXh0ZW5kOiBmdW5jdGlvbiAocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICBwcm90b1Byb3BzID0gcHJvdG9Qcm9wcyB8fCB7fTtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBwcm90b1Byb3BzLmhhc093blByb3BlcnR5KCdjb25zdHJ1Y3RvcicpID9cbiAgICAgICAgICBwcm90b1Byb3BzLmNvbnN0cnVjdG9yIDogZnVuY3Rpb24oKXsgcmV0dXJuIHN1cC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgdmFyIHN1cCA9IHRoaXM7XG4gICAgdmFyIEZuID0gZnVuY3Rpb24oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjb25zdHJ1Y3RvcjsgfTtcbiAgICB2YXIgc3VwUmVmID0ge19fc3VwZXJfXzogc3VwLnByb3RvdHlwZX07XG5cbiAgICBGbi5wcm90b3R5cGUgPSBzdXAucHJvdG90eXBlO1xuICAgIGNvbnN0cnVjdG9yLnByb3RvdHlwZSA9IG5ldyBGbigpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHN1cFJlZiwgcHJvdG9Qcm9wcyk7XG4gICAgZXh0ZW5kKGNvbnN0cnVjdG9yLCBzdXAsIHN1cFJlZiwgc3RhdGljUHJvcHMpO1xuXG4gICAgcmV0dXJuIGNvbnN0cnVjdG9yO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENsYXNzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxuLyoqXG4gKiDms6jlhoznu4Tku7ZcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWdOYW1lIOiHquWumuS5iee7hOS7tueahOagh+etvuWQjVxuICogQHBhcmFtIHtGdW5jdGlvbnxwcm9wc30gQ29tcG9uZW50IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsCAvIOaehOmAoOWHveaVsOWPguaVsFxuICogQHJldHVybiB7RnVuY3Rpb259IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsFxuICovXG5mdW5jdGlvbiB0YWcodGFnTmFtZSwgQ29tcG9uZW50LCBzdGF0aWNzKSB7XG4gIHZhciB0YWdzID0gdGhpcy5jb21wb25lbnRzID0gdGhpcy5jb21wb25lbnRzIHx8IHt9O1xuXG4gIHRoaXMuZG9jLmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7Ly9mb3Igb2xkIElFXG5cbiAgaWYodXRpbHMuaXNPYmplY3QoQ29tcG9uZW50KSkge1xuICAgIENvbXBvbmVudCA9IHRoaXMuZXh0ZW5kKENvbXBvbmVudCwgc3RhdGljcyk7XG4gIH1cbiAgcmV0dXJuIHRhZ3NbdGFnTmFtZV0gPSBDb21wb25lbnQ7XG59XG5cbi8qKlxuICog5p+l6K+i5p+Q5p6E6YCg5Ye95pWw5LiL55qE5rOo5YaM57uE5Lu2XG4gKiBAcGFybSB7U3RyaW5nfSBjb21wb25lbnROYW1lXG4gKi9cbmZ1bmN0aW9uIGdldENvbXBvbmVudChjb21wb25lbnROYW1lKSB7XG4gIHZhciBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aChjb21wb25lbnROYW1lKTtcbiAgdmFyIEN1ckNzdHIgPSB0aGlzO1xuICBwYXRocy5mb3JFYWNoKGZ1bmN0aW9uKGNvbU5hbWUpIHtcbiAgICBDdXJDc3RyID0gQ3VyQ3N0ciAmJiBDdXJDc3RyLmNvbXBvbmVudHNbY29tTmFtZV07XG4gIH0pO1xuICByZXR1cm4gQ3VyQ3N0ciB8fCBudWxsO1xufVxuXG5leHBvcnRzLnRhZyA9IGV4cG9ydHMuY29tcG9uZW50ID0gdGFnO1xuZXhwb3J0cy5nZXRDb21wb25lbnQgPSBnZXRDb21wb25lbnQ7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuL3Rva2VuLmpzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gICwgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlLmpzJykucGFyc2VcbiAgLCBldmFsdWF0ZSA9IHJlcXVpcmUoJy4vZXZhbC5qcycpXG4gICwgZG9tVXRpbHMgPSByZXF1aXJlKCcuL2RvbS11dGlscycpXG5cbiAgLCBjcmVhdGUgPSB1dGlscy5jcmVhdGVcbiAgO1xuXG4vKipcbiAqIOS4uiBCZWUg5p6E6YCg5Ye95pWw5re75Yqg5oyH5LukIChkaXJlY3RpdmUpLiBgQmVlLmRpcmVjdGl2ZWBcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgZGlyZWN0aXZlIOWQjeensFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRzXSBkaXJlY3RpdmUg5Y+C5pWwXG4gKiBAcGFyYW0ge051bWJlcn0gb3B0cy5wcmlvcml0eT0wIGRpcmVjdGl2ZSDkvJjlhYjnuqcuIOWQjOS4gOS4quWFg+e0oOS4iueahOaMh+S7pOaMieeFp+S8mOWFiOe6p+mhuuW6j+aJp+ihjC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy50ZXJtaW5hbD1mYWxzZSDmiafooYzor6UgZGlyZWN0aXZlIOWQjiwg5piv5ZCm57uI5q2i5ZCO57utIGRpcmVjdGl2ZSDmiafooYwuXG4gKiAgIHRlcm1pbmFsIOS4uuecn+aXtiwg5LiO6K+lIGRpcmVjdGl2ZSDkvJjlhYjnuqfnm7jlkIznmoQgZGlyZWN0aXZlIOS7jeS8mue7p+e7reaJp+ihjCwg6L6D5L2O5LyY5YWI57qn55qE5omN5Lya6KKr5b+955WlLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLmFuY2hvciBhbmNob3Ig5Li6IHRydWUg5pe2LCDkvJrlnKjmjIfku6ToioLngrnliY3lkI7lkITkuqfnlJ/kuIDkuKrnqbrnmb3nmoTmoIforrDoioLngrkuIOWIhuWIq+WvueW6lCBgYW5jaG9ycy5zdGFydGAg5ZKMIGBhbmNob3JzLmVuZGBcbiAqL1xuZnVuY3Rpb24gZGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB2YXIgZGlycyA9IHRoaXMuZGlyZWN0aXZlcyA9IHRoaXMuZGlyZWN0aXZlcyB8fCB7fTtcblxuICByZXR1cm4gZGlyc1trZXldID0gbmV3IERpcmVjdGl2ZShrZXksIG9wdHMpO1xufVxuXG5mdW5jdGlvbiBEaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHRoaXMudHlwZSA9IGtleTtcbiAgdXRpbHMuZXh0ZW5kKHRoaXMsIG9wdHMpO1xufVxuXG52YXIgYXN0Q2FjaGUgPSB7fTtcblxuRGlyZWN0aXZlLnByb3RvdHlwZSA9IHtcbiAgcHJpb3JpdHk6IDAvL+adg+mHjVxuLCB0eXBlOiAnJyAvL+aMh+S7pOexu+Wei1xuLCBzdWJUeXBlOiAnJyAvL+WtkOexu+Weiy4g5q+U5aaCIGBiLW9uLWNsaWNrYCDnmoQgdHlwZSDkuLogYG9uYCwgc3ViVHlwZSDkuLogYGNsaWNrYFxuLCBzdWI6IGZhbHNlIC8v5piv5ZCm5YWB6K645a2Q57G75Z6L5oyH5LukXG4sIGxpbms6IHV0aWxzLm5vb3AvL+WIneWni+WMluaWueazlVxuLCB1bkxpbms6IHV0aWxzLm5vb3AvL+mUgOavgeWbnuiwg1xuLCB1cGRhdGU6IHV0aWxzLm5vb3AvL+abtOaWsOaWueazlVxuLCB0ZWFyRG93bjogdXRpbHMubm9vcFxuLCB0ZXJtaW5hbDogZmFsc2UvL+aYr+WQpue7iOatolxuLCByZXBsYWNlOiBmYWxzZS8v5piv5ZCm5pu/5o2i5b2T5YmN5YWD57SgLiDlpoLmnpzmmK8sIOWwhueUqOS4gOS4quepuueahOaWh+acrOiKgueCueabv+aNouW9k+WJjeWFg+e0oFxuLCB3YXRjaDogdHJ1ZS8v5piv5ZCm55uR5o6nIGtleSDnmoTlj5jljJYuIOWmguaenOS4uiBmYWxzZSDnmoTor50sIHVwZGF0ZSDmlrnms5Xpu5jorqTlj6rkvJrlnKjliJ3lp4vljJblkI7osIPnlKjkuIDmrKFcbiwgaW1tZWRpYXRlOiB0cnVlIC8v5piv5ZCm5ZyoIGRpciDliJ3lp4vljJbml7bnq4vljbPmiafooYwgdXBkYXRlIOaWueazlVxuXG4sIGFuY2hvcjogZmFsc2VcbiwgYW5jaG9yczogbnVsbFxuXG4gIC8v6I635Y+W5Lik5Liq6ZSa54K55LmL6Ze055qE5omA5pyJ6IqC54K5LlxuLCBnZXROb2RlczogZnVuY3Rpb24oc3RhcnQsIGVuZCkge1xuICAgIHN0YXJ0ID0gc3RhcnQgfHwgdGhpcy5hbmNob3JzLnN0YXJ0O1xuICAgIGVuZCA9IGVuZCB8fCB0aGlzLmFuY2hvcnMuZW5kO1xuXG4gICAgdmFyIG5vZGVzID0gW10sIG5vZGUgPSBzdGFydC5uZXh0U2libGluZztcbiAgICBpZih0aGlzLmFuY2hvciAmJiBub2RlKSB7XG4gICAgICB3aGlsZShub2RlICE9PSBlbmQpe1xuICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1cbiAgfVxuICAvL+ino+aekOihqOi+vuW8j1xuLCBwYXJzZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNhY2hlID0gYXN0Q2FjaGVbdGhpcy5wYXRoXVxuICAgIGlmKGNhY2hlICYmIGNhY2hlLl90eXBlID09PSB0aGlzLnR5cGUpe1xuICAgICAgdGhpcy5hc3QgPSBjYWNoZVxuICAgIH1lbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHRoaXMuYXN0ID0gcGFyc2UodGhpcy5wYXRoLCB0aGlzLnR5cGUpO1xuICAgICAgICB0aGlzLmFzdC5fdHlwZSA9IHRoaXMudHlwZTtcbiAgICAgICAgYXN0Q2FjaGVbdGhpcy5wYXRoXSA9IHRoaXMuYXN0O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aGlzLmFzdCA9IHt9O1xuICAgICAgICBlLm1lc3NhZ2UgPSAnU3ludGF4RXJyb3IgaW4gXCInICsgdGhpcy5wYXRoICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy/ooajovr7lvI/msYLlgLxcbiAgLy9mb3JnaXZlW3RydWVdOiDmmK/lkKblsIYgdW5kZWZpbmVkIOWPiiBudWxsIOi9rOS4uuepuuWtl+esplxuLCBnZXRWYWx1ZTogZnVuY3Rpb24oc2NvcGUsIGZvcmdpdmUpIHtcbiAgICBmb3JnaXZlID0gZm9yZ2l2ZSAhPT0gZmFsc2U7XG4gICAgdmFyIHZhbDtcblxuICAgIHRyeXtcbiAgICAgIHZhbCA9IGV2YWx1YXRlLmV2YWwodGhpcy5hc3QsIHNjb3BlLCB0aGlzKTtcbiAgICB9Y2F0Y2goZSl7XG4gICAgICB2YWwgPSAnJztcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICAgIGlmKGZvcmdpdmUgJiYgKHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSkge1xuICAgICAgdmFsID0gJyc7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG4gIH1cbn07XG5cbnZhciBhdHRyUG9zdFJlZyA9IC9cXD8kLztcblxuLyoqXG4gKiDojrflj5bkuIDkuKrlhYPntKDkuIrmiYDmnInnlKggSFRNTCDlsZ7mgKflrprkuYnnmoTmjIfku6RcbiAqIEBwYXJhbSAge0VsZW1lbnR9IGVsICAg5oyH5Luk5omA5Zyo5YWD57SgXG4gKiBAcGFyYW0gIHtCZWV9IGNzdHIg57uE5Lu25p6E6YCg5Ye95pWwXG4gKiBAcmV0dXJuIHtkaXJlY3RldmVbXX0gICAgICBgZWxgIOS4iuaJgOacieeahOaMh+S7pFxuICovXG5mdW5jdGlvbiBnZXREaXJzKGVsLCBjc3RyKXtcbiAgdmFyIGF0dHIsIGF0dHJOYW1lLCBkaXJOYW1lLCBwcm90b1xuICAgICwgZGlycyA9IFtdLCBkaXJcbiAgICAsIHBhcmVudCA9IGVsLnBhcmVudE5vZGVcbiAgICAsIG5vZGVOYW1lID0gZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKVxuICAgICwgZGlyZWN0aXZlcyA9IGNzdHIuZGlyZWN0aXZlc1xuICAgICwgcHJlZml4ID0gY3N0ci5wcmVmaXhcbiAgICA7XG5cbiAgLy/lr7nkuo7oh6rlrprkuYnmoIfnrb4sIOWwhuWFtui9rOS4uiBkaXJlY3RpdmVcbiAgaWYoY3N0ci5nZXRDb21wb25lbnQobm9kZU5hbWUpKSB7XG4gICAgZWwuc2V0QXR0cmlidXRlKHByZWZpeCArICdjb21wb25lbnQnLCBub2RlTmFtZSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSBlbC5hdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICBhdHRyID0gZWwuYXR0cmlidXRlc1tpXTtcbiAgICBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG4gICAgZGlyTmFtZSA9IGF0dHJOYW1lLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xuICAgIHByb3RvID0ge2VsOiBlbCwgbm9kZTogYXR0ciwgbm9kZU5hbWU6IGF0dHJOYW1lLCBwYXRoOiBhdHRyLnZhbHVlfTtcbiAgICBkaXIgPSBudWxsO1xuXG4gICAgaWYoYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwICYmIChkaXIgPSBnZXREaXIoZGlyTmFtZSwgZGlyZWN0aXZlcykpKSB7XG4gICAgICAvL+aMh+S7pFxuICAgICAgZGlyLmRpck5hbWUgPSBkaXJOYW1lLy9kaXIg5ZCNXG4gICAgfWVsc2UgaWYodG9rZW4uaGFzVG9rZW4oYXR0ci52YWx1ZSkpIHtcbiAgICAgIC8v5bGe5oCn6KGo6L6+5byP5Y+v6IO95pyJ5aSa5Liq6KGo6L6+5byP5Yy6XG4gICAgICB0b2tlbi5wYXJzZVRva2VuKGF0dHIudmFsdWUpLmZvckVhY2goZnVuY3Rpb24ob3JpZ2luKSB7XG4gICAgICAgIG9yaWdpbi5kaXJOYW1lID0gYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwID8gZGlyTmFtZSA6IGF0dHJOYW1lIDtcbiAgICAgICAgZGlycy5wdXNoKHV0aWxzLmV4dGVuZChjcmVhdGUoZGlyZWN0aXZlcy5hdHRyKSwgcHJvdG8sIG9yaWdpbikpXG4gICAgICB9KTtcbiAgICAgIC8v55Sx5LqO5bey55+l5bGe5oCn6KGo6L6+5byP5LiN5a2Y5ZyoIGFuY2hvciwg5omA5Lul55u05o6l6Lez6L+H5LiL6Z2i55qE5qOA5rWLXG4gICAgfWVsc2UgaWYoYXR0clBvc3RSZWcudGVzdChhdHRyTmFtZSkpIHtcbiAgICAgIC8v5p2h5Lu25bGe5oCn5oyH5LukXG4gICAgICBkaXIgPSB1dGlscy5leHRlbmQoY3JlYXRlKGRpcmVjdGl2ZXMuYXR0ciksIHsgZGlyTmFtZTogYXR0ck5hbWUucmVwbGFjZShhdHRyUG9zdFJlZywgJycpLCBjb25kaXRpb25hbDogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBpZihkaXIpIHtcbiAgICAgIGlmKGRpci5hbmNob3IpIHtcbiAgICAgICAgZGlyLmFuY2hvcnMgPSBzZXRBbmNob3JzKGVsLCBkaXIuZGlyTmFtZSk7XG4gICAgICB9XG4gICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGRpciwgcHJvdG8pKTtcbiAgICB9XG4gIH1cbiAgZGlycy5zb3J0KGZ1bmN0aW9uKGQwLCBkMSkge1xuICAgIHJldHVybiBkMS5wcmlvcml0eSAtIGQwLnByaW9yaXR5O1xuICB9KTtcbiAgcmV0dXJuIGRpcnM7XG59XG5cbmZ1bmN0aW9uIGdldERpcihkaXJOYW1lLCBkaXJzKSB7XG4gIHZhciBkaXIsIHN1YlR5cGU7XG4gIGZvcih2YXIga2V5IGluIGRpcnMpIHtcbiAgICBpZihkaXJOYW1lID09PSBrZXkpe1xuICAgICAgZGlyID0gZGlyc1trZXldXG4gICAgICBicmVha1xuICAgIH1lbHNlIGlmKGRpck5hbWUuaW5kZXhPZihrZXkgKyAnLScpID09PSAwKXtcbiAgICAgIGRpciA9IGRpcnNba2V5XVxuICAgICAgaWYoIWRpci5zdWIpe1xuICAgICAgICBkaXIgPSBudWxsXG4gICAgICB9ZWxzZXtcbiAgICAgICAgc3ViVHlwZSA9IGRpck5hbWUuc2xpY2Uoa2V5Lmxlbmd0aCArIDEpXG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYoZGlyKSB7XG4gICAgZGlyID0gY3JlYXRlKGRpcik7XG4gICAgZGlyLnN1YlR5cGUgPSBzdWJUeXBlO1xuICB9XG4gIHJldHVybiBkaXI7XG59XG5cbmZ1bmN0aW9uIHNldEFuY2hvcnMobm9kZSwgZGlyTmFtZSkge1xuICB2YXIgcGFyZW50ID0gbm9kZS5wYXJlbnROb2RlXG4gICAgLCBhbmNob3JzID0ge31cbiAgICA7XG5cbiAgICBhbmNob3JzLnN0YXJ0ID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGFuY2hvcnMuc3RhcnQsIG5vZGUpO1xuXG4gICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXJOYW1lICsgJyBlbmQnKTtcbiAgICBpZihub2RlLm5leHRTaWJsaW5nKSB7XG4gICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGFuY2hvcnMuZW5kLCBub2RlLm5leHRTaWJsaW5nKTtcbiAgICB9ZWxzZXtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChhbmNob3JzLmVuZCk7XG4gICAgfVxuICAgIHJldHVybiBhbmNob3JzXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBEaXJlY3RpdmU6IERpcmVjdGl2ZSxcbiAgZGlyZWN0aXZlOiBkaXJlY3RpdmUsXG4gIGdldERpcnM6IGdldERpcnMsXG4gIHNldEFuY2hvcnM6IHNldEFuY2hvcnNcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/lsZ7mgKfmjIfku6RcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7Ly9hdHRyIGJpbmRpbmdcbiAgICAgIHRoaXMuYXR0cnMgPSB7fTtcbiAgICB9ZWxzZSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+m7mOiupOWwhuWAvOe9ruepuiwg6Ziy5q2i6KGo6L6+5byP5YaF5Y+Y6YeP5LiN5a2Y5ZyoXG4gICAgICB0aGlzLnVwZGF0ZSgnJylcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBuZXdBdHRycyA9IHt9O1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7XG4gICAgICBmb3IodmFyIGF0dHIgaW4gdmFsKSB7XG4gICAgICAgIHNldEF0dHIoZWwsIGF0dHIsIHZhbFthdHRyXSk7XG4gICAgICAgIC8vaWYodmFsW2F0dHJdKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuYXR0cnNbYXR0cl07XG4gICAgICAgIC8vfVxuICAgICAgICBuZXdBdHRyc1thdHRyXSA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8v56e76Zmk5LiN5Zyo5LiK5qyh6K6w5b2V5Lit55qE5bGe5oCnXG4gICAgICBmb3IodmFyIGF0dHIgaW4gdGhpcy5hdHRycykge1xuICAgICAgICByZW1vdmVBdHRyKGVsLCBhdHRyKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYXR0cnMgPSBuZXdBdHRycztcbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuY29uZGl0aW9uYWwpIHtcbiAgICAgICAgdmFsID8gc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB2YWwpIDogcmVtb3ZlQXR0cihlbCwgdGhpcy5kaXJOYW1lKTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLnRleHRNYXBbdGhpcy5wb3NpdGlvbl0gPSB2YWwgJiYgKHZhbCArICcnKTtcbiAgICAgICAgc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB0aGlzLnRleHRNYXAuam9pbignJykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuXG4vL0lFIOa1j+iniOWZqOW+iOWkmuWxnuaAp+mAmui/hyBgc2V0QXR0cmlidXRlYCDorr7nva7lkI7ml6DmlYguIFxuLy/ov5nkupvpgJrov4cgYGVsW2F0dHJdID0gdmFsdWVgIOiuvue9rueahOWxnuaAp+WNtOiDveWkn+mAmui/hyBgcmVtb3ZlQXR0cmlidXRlYCDmuIXpmaQuXG5mdW5jdGlvbiBzZXRBdHRyKGVsLCBhdHRyLCB2YWwpe1xuICB0cnl7XG4gICAgaWYoKChhdHRyIGluIGVsKSB8fCBhdHRyID09PSAnY2xhc3MnKSl7XG4gICAgICBpZihhdHRyID09PSAnc3R5bGUnICYmIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHZhbCk7XG4gICAgICB9ZWxzZSBpZihhdHRyID09PSAnY2xhc3MnKXtcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gdmFsO1xuICAgICAgfWVsc2V7XG4gICAgICAgIGVsW2F0dHJdID0gdHlwZW9mIGVsW2F0dHJdID09PSAnYm9vbGVhbicgPyB0cnVlIDogdmFsO1xuICAgICAgfVxuICAgIH1cbiAgfWNhdGNoKGUpe31cbiAgLy9jaHJvbWUgc2V0YXR0cmlidXRlIHdpdGggYHt7fX1gIHdpbGwgdGhyb3cgYW4gZXJyb3JcbiAgZWwuc2V0QXR0cmlidXRlKGF0dHIsIHZhbCk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUF0dHIoZWwsIGF0dHIpIHtcbiAgZWwucmVtb3ZlQXR0cmlidXRlKGF0dHIpO1xufSIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5pbml0Q2xhc3MgPSB0aGlzLmVsLmNsYXNzTmFtZSB8fCAnJ1xuICAgIHRoaXMua2V5cyA9IHt9O1xuICB9LFxuICB1cGRhdGU6IGZ1bmN0aW9uKGNsYXNzZXMpIHtcbiAgICB2YXIgY2xhc3NTdHIgPSB0aGlzLmluaXRDbGFzc1xuICAgICAgLCB3YXRjaGVyID0gdGhpcy53YXRjaGVyXG4gICAgICA7XG5cbiAgICBpZih0eXBlb2YgY2xhc3NlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmKGNsYXNzZXMpIHtcbiAgICAgICAgY2xhc3NTdHIgKz0gJyAnICsgY2xhc3NlcztcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIGZvcih2YXIga2V5IGluIGNsYXNzZXMpIHtcbiAgICAgICAgaWYoIXRoaXMua2V5c1trZXldKSB7XG4gICAgICAgICAgdGhpcy5rZXlzW2tleV0gPSB0cnVlO1xuICAgICAgICAgIC8v5a+56LGh55qE6ZSu5YC86buY6K6k5LiN5Zyo55uR5ZCs6IyD5Zu05LmL5YaFLCDov5nph4zmiYvliqjnm5HlkKxcbiAgICAgICAgICB0aGlzLnZtLiR3YXRjaChrZXksIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgd2F0Y2hlci51cGRhdGUoKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgaWYodGhpcy52bS4kZ2V0KGtleSkpIHtcbiAgICAgICAgICBjbGFzc1N0ciArPSAnICcgKyBjbGFzc2VzW2tleV1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmVsLmNsYXNzTmFtZSA9IGNsYXNzU3RyO1xuICB9XG59O1xuIiwiLy9jb21wb25lbnQgYXMgZGlyZWN0aXZlXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpO1xudmFyIGRvbVV0aWxzID0gcmVxdWlyZSgnLi4vZG9tLXV0aWxzJylcbnZhciBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuLi9jaGVjay1iaW5kaW5nJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAtMVxuLCB3YXRjaDogZmFsc2VcbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNvbXBvbmVudCAmJiB0aGlzLmNvbXBvbmVudC4kZGVzdHJveSgpXG4gIH1cbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZtID0gdGhpcy52bTtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBjc3RyID0gdm0uY29uc3RydWN0b3I7XG4gICAgdmFyIGNvbXAsIGNvbnRlbnQ7XG4gICAgLy92YXIgcmVmTmFtZTtcbiAgICB2YXIgZGlycyA9IFtdLCAkZGF0YSA9IHt9O1xuICAgIHZhciBDb21wID0gY3N0ci5nZXRDb21wb25lbnQodGhpcy5wYXRoKVxuXG4gICAgaWYoQ29tcCkge1xuXG4gICAgICBpZihDb21wID09PSBjc3RyICYmIHZtLl9fbW91bnRjYWxsIHx8IGVsLmJlZSAmJiBlbC5iZWUgPT09IHZtKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGlycyA9IHRoaXMuZGlycztcblxuICAgICAgZGlycyA9IGRpcnMuZmlsdGVyKGZ1bmN0aW9uIChkaXIpIHtcbiAgICAgICAgLy8gaWYoZGlyLnR5cGUgPT09ICdyZWYnKSB7XG4gICAgICAgIC8vICAgcmVmTmFtZSA9IGRpci5wYXRoO1xuICAgICAgICAvLyB9XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHZhciBjdXJQYXRoLCBjb21QYXRoO1xuXG4gICAgICAgIGN1clBhdGggPSBkaXIucGF0aDtcbiAgICAgICAgaWYoZGlyLnR5cGUgPT09ICd3aXRoJykge1xuICAgICAgICAgIC8vY29tUGF0aCA9ICckZGF0YSdcbiAgICAgICAgICB1dGlscy5leHRlbmQoJGRhdGEsIHZtLiRnZXQoY3VyUGF0aCkpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGNvbVBhdGggPSB1dGlscy5oeXBoZW5Ub0NhbWVsKGRpci5kaXJOYW1lKTtcbiAgICAgICAgICAkZGF0YVtjb21QYXRoXSA9IHZtLiRnZXQoY3VyUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL+ebkeWQrOeItue7hOS7tuabtOaWsCwg5ZCM5q2l5pWw5o2uXG4gICAgICAgIHZtLiR3YXRjaChjdXJQYXRoLCBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgaWYoY29tcCl7XG4gICAgICAgICAgICB2YWwgPSBkaXIudGV4dE1hcCA/IGRpci50ZXh0TWFwLmpvaW4oJycpIDogdmFsO1xuICAgICAgICAgICAgY29tUGF0aCA/IGNvbXAuJHNldChjb21QYXRoLCB2YWwpIDogY29tcC4kc2V0KHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSk7XG5cbiAgICAgIC8vY29udGVudCA9IGRvbVV0aWxzLmNyZWF0ZUNvbnRlbnQoZWwuY2hpbGROb2Rlcyk7XG5cbiAgICAgIC8v57uE5Lu25YaF5a655bGe5LqO5YW25a655ZmoXG4gICAgICB2bS5fX2xpbmtzID0gdm0uX19saW5rcy5jb25jYXQoY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh2bSwgZWwuY2hpbGROb2RlcykpO1xuXG4gICAgICAvL2VsLmFwcGVuZENoaWxkKGNvbnRlbnQpXG5cbiAgICAgIHRoaXMuY29tcG9uZW50ID0gY29tcCA9IG5ldyBDb21wKHtcbiAgICAgICAgJGVsOiBlbCxcbiAgICAgICAgJGlzUmVwbGFjZTogdHJ1ZSxcbiAgICAgICAgJGRhdGE6IHV0aWxzLmV4dGVuZCh7fSwgQ29tcC5wcm90b3R5cGUuJGRhdGEsICRkYXRhLCBkb21VdGlscy5nZXRBdHRycyhlbCkpXG4gICAgICB9KTtcbiAgICAgIGVsLmJlZSA9IGNvbXA7XG5cbiAgICAgIC8v55u05o6l5bCGY29tcG9uZW50IOS9nOS4uuagueWFg+e0oOaXtiwg5ZCM5q2l6Lef5paw5a655ZmoIC4kZWwg5byV55SoXG4gICAgICAvLyBpZih2bS4kZWwgPT09IGVsKSB7XG4gICAgICAvLyAgIHZtLl9fcmVmID0gY29tcDtcbiAgICAgIC8vICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICAvLyB9XG4gICAgICByZXR1cm4gY29tcDtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgdGhpcy5wYXRoICsgJyBub3QgZGVmaW5lZCEgSWdub3JlJyk7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb21VdGlscyA9IHJlcXVpcmUoJy4uL2RvbS11dGlscycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlcGxhY2U6IHRydWVcbiwgYW5jaG9yOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMgPSBbXTtcbiAgfVxuLCB1bkxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLnVud2F0Y2goKVxuICAgIH0pO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odHBsKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpXG4gICAgdmFyIHBhcmVudCA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZVxuXG4gICAgbm9kZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnVuTGluaygpO1xuXG4gICAgdmFyIGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KHRwbClcblxuICAgIHRoaXMud2F0Y2hlcnMgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMudm0sIGNvbnRlbnQpXG4gICAgcGFyZW50Lmluc2VydEJlZm9yZShjb250ZW50LCB0aGlzLmFuY2hvcnMuZW5kKVxuICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi4vZG9tLXV0aWxzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuLi9lbnYnKS5kb2N1bWVudFxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYW5jaG9yOiB0cnVlXG4sIHByaW9yaXR5OiA5MDBcbiwgdGVybWluYWw6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuXG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgfVxuICAgIHRoaXMucmVtb3ZlKCk7XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICBpZih2YWwpIHtcbiAgICAgIGlmKCF0aGlzLnN0YXRlKSB7IHRoaXMuYWRkKCkgfVxuICAgIH1lbHNle1xuICAgICAgaWYodGhpcy5zdGF0ZSkgeyB0aGlzLnJlbW92ZSgpOyB9XG4gICAgfVxuICAgIHRoaXMuc3RhdGUgPSB2YWw7XG4gIH1cblxuLCBhZGQ6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcnMuZW5kO1xuICAgIGlmKCF0aGlzLndhbGtlZCkge1xuICAgICAgdGhpcy53YWxrZWQgPSB0cnVlO1xuICAgICAgdGhpcy53YXRjaGVycyA9IGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcy52bSwgdGhpcy5mcmFnKTtcbiAgICB9XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICAgIHdhdGNoZXIuX2hpZGUgPSBmYWxzZTtcbiAgICAgIGlmKHdhdGNoZXIuX25lZWRVcGRhdGUpIHtcbiAgICAgICAgd2F0Y2hlci51cGRhdGUoKVxuICAgICAgICB3YXRjaGVyLl9uZWVkVXBkYXRlID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSlcbiAgICBhbmNob3IucGFyZW50Tm9kZSAmJiBhbmNob3IucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5mcmFnLCBhbmNob3IpO1xuICB9XG4sIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpO1xuXG4gICAgZm9yKHZhciBpID0gMCwgbCA9IG5vZGVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgdGhpcy5mcmFnLmFwcGVuZENoaWxkKG5vZGVzW2ldKTtcbiAgICB9XG5cbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci5faGlkZSA9IHRydWU7XG4gICAgfSlcbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgLCBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuLi9jaGVjay1iaW5kaW5nJylcbiAgO1xuXG52YXIgZGlycyA9IHt9O1xuXG5cbmRpcnMudGV4dCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG4gIH1cbn07XG5cblxuZGlycy5odG1sID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHZhciBlbCA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbC5pbm5lckhUTUwgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG5cbiAgICB2YXIgbm9kZTtcbiAgICB3aGlsZShub2RlID0gdGhpcy5ub2Rlcy5wb3AoKSkge1xuICAgICAgbm9kZS5wYXJlbnROb2RlICYmIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9XG5cbiAgICB2YXIgbm9kZXMgPSBlbC5jaGlsZE5vZGVzO1xuICAgIHdoaWxlKG5vZGUgPSBub2Rlc1swXSkge1xuICAgICAgdGhpcy5ub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgdGhpcy5lbC5pbnNlcnRCZWZvcmUobm9kZSwgdGhpcy5ub2RlKTtcbiAgICB9XG4gIH1cbn07XG5cbmRpcnMudGVtcGxhdGUgPSB7XG4gIHByaW9yaXR5OiAxMDAwMFxuLCB3YXRjaDogZmFsc2VcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5lbC5jaGlsZE5vZGVzXG4gICAgICAsIGZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICA7XG5cbiAgICB3aGlsZShub2Rlc1swXSkge1xuICAgICAgZnJhZy5hcHBlbmRDaGlsZChub2Rlc1swXSk7XG4gICAgfVxuXG4gICAgdGhpcy5lbC5jb250ZW50ID0gZnJhZztcbiAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKHRoaXMubm9kZU5hbWUsICcnKTtcbiAgfVxufTtcblxuLy/lm77niYfnlKgsIOmBv+WFjeWKoOi9vSBVUkwg5Lit5bim5pyJ5aSn5ous5Y+355qE5Y6f5aeL5qih5p2/5YaF5a65XG5kaXJzLnNyYyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLmVsLnNyYyA9IHZhbDtcbiAgfVxufTtcblxuZGlyc1snd2l0aCddID0ge307XG5cbmRpcnNbJ2lmJ10gPSByZXF1aXJlKCcuL2lmJylcbmRpcnMucmVwZWF0ID0gcmVxdWlyZSgnLi9yZXBlYXQnKTtcbmRpcnMuYXR0ciA9IHJlcXVpcmUoJy4vYXR0cicpO1xuZGlycy5tb2RlbCA9IHJlcXVpcmUoJy4vbW9kZWwnKTtcbmRpcnMuc3R5bGUgPSByZXF1aXJlKCcuL3N0eWxlJyk7XG5kaXJzLm9uID0gcmVxdWlyZSgnLi9vbicpO1xuZGlycy5jb21wb25lbnQgPSBkaXJzLnRhZyA9IHJlcXVpcmUoJy4vY29tcG9uZW50Jyk7XG5kaXJzLmNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQnKVxuZGlycy5yZWYgPSByZXF1aXJlKCcuL3JlZicpXG5kaXJzWydjbGFzcyddID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG5cbm1vZHVsZS5leHBvcnRzID0gZGlycztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgaGFzVG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpLmhhc1Rva2VuXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpXG4gIDtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtaW5hbDogdHJ1ZVxuLCBwcmlvcml0eTogLTJcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGtleVBhdGggPSB0aGlzLnBhdGg7XG4gICAgdmFyIHZtID0gdGhpcy52bTtcblxuICAgIGlmKCFrZXlQYXRoKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgdmFyIGNvbXAgPSB0aGlzLmVsXG4gICAgICAsIGV2ID0gJ2NoYW5nZSdcbiAgICAgICwgYXR0clxuICAgICAgLCB2YWx1ZSA9IGF0dHIgPSAndmFsdWUnXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQodm0uJGdldChrZXlQYXRoKSkvL+eVjOmdoueahOWIneWni+WAvOS4jeS8muimhuebliBtb2RlbCDnmoTliJ3lp4vlgLxcbiAgICAgICwgY3JsZiA9IC9cXHJcXG4vZy8vSUUgOCDkuIsgdGV4dGFyZWEg5Lya6Ieq5Yqo5bCGIFxcbiDmjaLooYznrKbmjaLmiJAgXFxyXFxuLiDpnIDopoHlsIblhbbmm7/mjaLlm57mnaVcblxuICAgICAgICAvL+abtOaWsOe7hOS7tlxuICAgICAgLCB1cGRhdGUgPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICBpZih2YWwgPT09IDAgJiYgY29tcC50eXBlICE9PSAnY2hlY2tib3gnKSB7IHZhbCA9ICcwJyB9XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gY29tcFthdHRyXVxuICAgICAgICAgICAgO1xuICAgICAgICAgIHZhbCAmJiB2YWwucmVwbGFjZSAmJiAodmFsID0gdmFsLnJlcGxhY2UoY3JsZiwgJ1xcbicpKTtcbiAgICAgICAgICBpZihuZXdWYWwgIT09IHZhbCl7IGNvbXBbYXR0cl0gPSBuZXdWYWw7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8v5pu05pawIHZpZXdNb2RlbFxuICAgICAgLCBoYW5kbGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgdmFyIHZhbCA9IGNvbXBbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgdm0uJHNldChrZXlQYXRoLCB2YWwpO1xuICAgICAgICB9XG4gICAgICAsIGNhbGxIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgIGlmKGUgJiYgZS5wcm9wZXJ0eU5hbWUgJiYgZS5wcm9wZXJ0eU5hbWUgIT09IGF0dHIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgIH1cbiAgICAgICwgaWUgPSB1dGlscy5pZVxuICAgICAgO1xuXG4gICAgaWYoY29tcC5iZWUpIHtcbiAgICAgIC8vIOe7hOS7tueahOWPjOWQkee7keWumlxuICAgICAgY29tcCA9IGNvbXAuYmVlO1xuICAgICAgdmFsdWUgPSBjb21wLiR2YWx1ZWtleTtcbiAgICAgIGlmKHZhbHVlKSB7XG4gICAgICAgIHVwZGF0ZSA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIGNvbXAuJHJlcGxhY2UodmFsdWUsIHZhbClcbiAgICAgICAgfTtcbiAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZtLiRyZXBsYWNlKGtleVBhdGgsIGNvbXAuJGdldCh2YWx1ZSkpXG4gICAgICAgIH1cbiAgICAgICAgY29tcC4kd2F0Y2godmFsdWUsIGZ1bmN0aW9uKHZhbCwgb2xkVmFsdWUpIHtcbiAgICAgICAgICB2YWwgIT09IG9sZFZhbHVlICYmIGhhbmRsZXIoKVxuICAgICAgICB9LCB0cnVlKVxuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgLy9IVE1MIOWOn+eUn+aOp+S7tueahOWPjOWQkee7keWumlxuICAgICAgc3dpdGNoKGNvbXAudGFnTmFtZSkge1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHZhbHVlID0gYXR0ciA9ICdpbm5lckhUTUwnO1xuICAgICAgICAgIC8vZXYgKz0gJyBibHVyJztcbiAgICAgICAgY2FzZSAnSU5QVVQnOlxuICAgICAgICBjYXNlICdURVhUQVJFQSc6XG4gICAgICAgICAgc3dpdGNoKGNvbXAudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxuICAgICAgICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnY2hlY2tlZCc7XG4gICAgICAgICAgICAgIC8vSUU2LCBJRTcg5LiL55uR5ZCsIHByb3BlcnR5Y2hhbmdlIOS8muaMgj9cbiAgICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAncmFkaW8nOlxuICAgICAgICAgICAgICBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgICBpZihpZSkgeyBldiArPSAnIGNsaWNrJzsgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICBjb21wLmNoZWNrZWQgPSBjb21wLnZhbHVlID09PSB2YWwgKyAnJztcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaXNTZXREZWZhdXQgPSBjb21wLmNoZWNrZWQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIGlmKCF2bS4kbGF6eSl7XG4gICAgICAgICAgICAgICAgaWYoJ29uaW5wdXQnIGluIGNvbXApe1xuICAgICAgICAgICAgICAgICAgZXYgKz0gJyBpbnB1dCc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vSUUg5LiL55qEIGlucHV0IOS6i+S7tuabv+S7o1xuICAgICAgICAgICAgICAgIGlmKGllKSB7XG4gICAgICAgICAgICAgICAgICBldiArPSAnIGtleXVwIHByb3BlcnR5Y2hhbmdlIGN1dCc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdTRUxFQ1QnOlxuICAgICAgICAgIGlmKGNvbXAubXVsdGlwbGUpe1xuICAgICAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICB2YXIgdmFscyA9IFtdO1xuICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gY29tcC5vcHRpb25zLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgICAgICAgaWYoY29tcC5vcHRpb25zW2ldLnNlbGVjdGVkKXsgdmFscy5wdXNoKGNvbXAub3B0aW9uc1tpXS52YWx1ZSkgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZtLiRyZXBsYWNlKGtleVBhdGgsIHZhbHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHVwZGF0ZSA9IGZ1bmN0aW9uKHZhbHMpe1xuICAgICAgICAgICAgICBpZih2YWxzICYmIHZhbHMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gY29tcC5vcHRpb25zLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgICAgICAgICBjb21wLm9wdGlvbnNbaV0uc2VsZWN0ZWQgPSB2YWxzLmluZGV4T2YoY29tcC5vcHRpb25zW2ldLnZhbHVlKSAhPT0gLTE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpc1NldERlZmF1dCA9IGlzU2V0RGVmYXV0ICYmICFoYXNUb2tlbihjb21wW3ZhbHVlXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBldi5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKGUpe1xuICAgICAgICBldmVudHMucmVtb3ZlRXZlbnQoY29tcCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgICAgICBldmVudHMuYWRkRXZlbnQoY29tcCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgICAgfSk7XG4gICAgICAvL+agueaNruihqOWNleWFg+e0oOeahOWIneWni+WMlum7mOiupOWAvOiuvue9ruWvueW6lCBtb2RlbCDnmoTlgLxcbiAgICAgIGlmKGNvbXBbdmFsdWVdICYmIGlzU2V0RGVmYXV0KXtcbiAgICAgICAgIGhhbmRsZXIoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZSA9IHVwZGF0ZTtcbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+S6i+S7tuebkeWQrFxuXG52YXIgZXZlbnRCaW5kID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHN1YjogdHJ1ZVxuLCBwcmlvcml0eTogLTMgLy/kuovku7blupTor6XlnKggYi1tb2RlbCDkuYvlkI7nm5HlkKwuIOmYsuatouaZrumAmuS6i+S7tuiwg+eUqOi/h+W/q1xuLCBpbW1lZGlhdGU6IGZhbHNlIC8vIHdhdGNoIOWSjCBpbW1lZGlhdGUg5ZCM5pe25Li6IGZhbHNlIOaXtiwg5oyH5Luk55qEIHVwZGF0ZSDmlrnms5XlsIbkuI3kvJroh6rliqjooqvlpJbpg6josIPnlKhcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRpciA9IHRoaXM7XG4gICAgaWYodGhpcy5zdWJUeXBlKXtcbiAgICAgIC8vIGJlLW9uLWNsaWNrIOetiVxuICAgICAgZXZlbnRCaW5kLmFkZEV2ZW50KHRoaXMuZWwsIHRoaXMuc3ViVHlwZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGRpci52bS4kZ2V0KGRpci5wYXRoKVxuICAgICAgfSlcbiAgICB9ZWxzZXtcbiAgICAgIC8vbGluayDmlrnms5XnmoTosIPnlKjlnKggd2F0Y2hlciDmo4DmtYsgaW1tZWRpYXRlIOS5i+WJjSxcbiAgICAgIC8v5omA5Lul5Y+v5Lul5Zyo6L+Z6YeM5bCGIGltbWVkaWF0ZSDnva7kuLogdHJ1ZSDku6Xkvr/oh6rliqjosIPnlKggdXBkYXRlIOaWueazlVxuICAgICAgdGhpcy5pbW1lZGlhdGUgPSB0cnVlO1xuICAgICAgLy90aGlzLnVwZGF0ZSh0aGlzLnZtLiRnZXQodGhpcy5wYXRoKSlcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3Rvci5zaGlmdCgpO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5qb2luKCcgJyk7XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG4vL+imgeaxgiBJRTgrXG4vL+ivt+azqOaEj+i/memHjOeahCBldmVudC5jdXJyZW50VGFyZ2V0IOWSjCBldmVudC5kZWxlZ2F0ZVRhcmdldCDlkIwgalF1ZXJ5IOeahOWImuWlveebuOWPjVxuZnVuY3Rpb24gY2FsbEhhbmRsZXIgKGRpciwgc2VsZWN0b3IsIGNhbGxiYWNrKSB7XG4gIHJldHVybiBmdW5jdGlvbihlKSB7XG4gICAgdmFyIGN1ciA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICB2YXIgZWxzID0gc2VsZWN0b3IgPyB1dGlscy50b0FycmF5KGRpci5lbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkgOiBbY3VyXTtcbiAgICBkb3tcbiAgICAgIGlmKGVscy5pbmRleE9mKGN1cikgPj0gMCkge1xuICAgICAgICBlLmRlbGVnYXRlVGFyZ2V0ID0gY3VyOy8v5aeU5omY5YWD57SgXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKGRpci52bSwgZSlcbiAgICAgIH1cbiAgICB9d2hpbGUoY3VyID0gY3VyLnBhcmVudE5vZGUpXG4gIH1cbn1cbiIsIlxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHByaW9yaXR5OiAtMiAvLyByZWYg5bqU6K+l5ZyoIGNvbXBvbmVudCDkuYvlkI5cbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih1dGlscy5pc0FycmF5KHRoaXMucmVmKSkge1xuICAgICAgdGhpcy5yZWYuc3BsaWNlKHRoaXMudm0uJGluZGV4LCAxKVxuICAgIH1lbHNle1xuICAgICAgdGhpcy52bS4kcmVmc1t0aGlzLnBhdGhdID0gbnVsbDtcbiAgICB9XG4gIH1cbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZtID0gdGhpcy52bVxuICAgIC8v5ZyoIGByZXBlYXRgIOWFg+e0oOS4iueahCBgcmVmYCDkvJrmjIflkJHljL/lkI0gYHZpZXdtb2RlbGBcbiAgICBpZih2bS5fX3JlcGVhdCl7XG4gICAgICBpZighdm0uJGluZGV4KSB7XG4gICAgICAgIHZtLiRwYXJlbnQuJHJlZnNbdGhpcy5wYXRoXSA9IFtdO1xuICAgICAgfVxuICAgICAgdGhpcy5yZWYgPSB2bS4kcGFyZW50LiRyZWZzW3RoaXMucGF0aF1cbiAgICAgIHRoaXMucmVmW3ZtLiRpbmRleF0gPSB2bTtcbiAgICB9ZWxzZXtcbiAgICAgIHZtLiRyZWZzW3RoaXMucGF0aF0gPSB0aGlzLmVsLmJlZSB8fCB0aGlzLmVsO1xuICAgIH1cbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIHNjb3BlID0gcmVxdWlyZSgnLi4vc2NvcGUnKVxuICA7XG5cbi8v6L+Z5Lqb5pWw57uE5pON5L2c5pa55rOV6KKr6YeN5YaZ5oiQ6Ieq5Yqo6Kem5Y+R5pu05pawXG52YXIgYXJyYXlNZXRob2RzID0gWydzcGxpY2UnLCAncHVzaCcsICdwb3AnLCAnc2hpZnQnLCAndW5zaGlmdCcsICdzb3J0JywgJ3JldmVyc2UnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAxMDAwXG4sIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCB1bkxpbms6IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy52bUxpc3QuZm9yRWFjaChmdW5jdGlvbih2bSl7XG4gICAgICB2bS4kZGVzdHJveSgpXG4gICAgfSlcbiAgfVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgQmVlID0gcmVxdWlyZSgnLi4vYmVlJylcblxuICAgIHRoaXMudHJhY2tJZCA9IHRoaXMuZWwuZ2V0QXR0cmlidXRlKCd0cmFjay1ieScpXG4gICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoJ3RyYWNrLWJ5JylcblxuICAgIC8v5Yib5bu6IHJlcGVhdCDnmoTljL/lkI3mnoTpgKDlh73mlbBcbiAgICAvL+e7p+aJv+eItuaehOmAoOWHveaVsOeahCBgZGlyZWN0aXZlcywgY29tcG9uZW50cywgZmlsdGVyc2Ag5bGe5oCnXG4gICAgdGhpcy5jc3RyID0gQmVlLmV4dGVuZCh7fSwgdGhpcy52bS5jb25zdHJ1Y3RvcilcblxuICAgIC8v6buY6K6k5pWw5o2u5LiN5bqU57un5om/XG4gICAgdGhpcy5jc3RyLmRlZmF1bHRzID0ge307XG5cbiAgICB0aGlzLmN1ckFyciA9IFtdO1xuICAgIHRoaXMudm1MaXN0ID0gW107Ly/lrZAgVk0gbGlzdFxuXG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmlzUmFuZ2UgPSB0cnVlXG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsO1xuICAgIH1cbiAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbihpdGVtcykge1xuICAgIHZhciBjdXJBcnIgPSB0aGlzLmN1ckFycjtcbiAgICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZTtcbiAgICB2YXIgdGhhdCA9IHRoaXMsIHZtTGlzdCA9IHRoaXMudm1MaXN0O1xuICAgIHZhciB0cmFja0lkID0gdGhpcy50cmFja0lkO1xuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcbiAgICAgIC8vIOWcqCByZXBlYXQg5oyH5Luk6KGo6L6+5byP5Lit55u45YWz5Y+Y6YePXG4gICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5zdW1tYXJ5LnBhdGhzLmZpbHRlcihmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgIHJldHVybiAhdXRpbHMuaXNGdW5jdGlvbih0aGF0LnZtLiRnZXQocGF0aCkpXG4gICAgICB9KTtcblxuICAgICAgLy/liKDpmaTlhYPntKBcbiAgICAgIGFyckRpZmYoY3VyQXJyLCBpdGVtcywgdHJhY2tJZCkuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgIHZhciBwb3MgPSBpbmRleEJ5VHJhY2tJZChpdGVtLCBjdXJBcnIsIHRyYWNrSWQpXG4gICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAxKVxuXG4gICAgICAgIGlmKHRoYXQuaXNSYW5nZSkge1xuICAgICAgICAgIGdldE5vZGVzQnlJbmRleCh0aGF0LCBwb3MpLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodm1MaXN0W3Bvc10uJGVsKVxuICAgICAgICB9XG4gICAgICAgIHZtTGlzdFtwb3NdLiRkZXN0cm95KClcbiAgICAgICAgdm1MaXN0LnNwbGljZShwb3MsIDEpXG4gICAgICB9KVxuXG4gICAgICBpdGVtcy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0sIGkpIHtcbiAgICAgICAgdmFyIHBvcyA9IGluZGV4QnlUcmFja0lkKGl0ZW0sIGl0ZW1zLCB0cmFja0lkLCBpKVxuICAgICAgICAgICwgb2xkUG9zID0gaW5kZXhCeVRyYWNrSWQoaXRlbSwgY3VyQXJyLCB0cmFja0lkLCBpKVxuICAgICAgICAgICwgdm0sIGVsLCBhbmNob3JcbiAgICAgICAgICA7XG5cbiAgICAgICAgLy/mlrDlop7lhYPntKBcbiAgICAgICAgaWYob2xkUG9zIDwgMCkge1xuXG4gICAgICAgICAgZWwgPSB0aGlzLmZyYWcuY2xvbmVOb2RlKHRydWUpXG5cbiAgICAgICAgICBpZih0aGlzLmlzUmFuZ2UpIHtcbiAgICAgICAgICAgIGFuY2hvciA9IGRvYy5jcmVhdGVDb21tZW50KCcnKVxuICAgICAgICAgICAgZWwuY2hpbGROb2Rlcy5sZW5ndGggPyBlbC5pbnNlcnRCZWZvcmUoYW5jaG9yLCBlbC5jaGlsZE5vZGVzWzBdKSA6IGVsLmFwcGVuZENoaWxkKGFuY2hvcilcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2bSA9IG5ldyB0aGlzLmNzdHIoZWwsIHtcbiAgICAgICAgICAgICRkYXRhOiBpdGVtLFxuICAgICAgICAgICAgJGluZGV4OiBwb3MsXG4gICAgICAgICAgICAkcm9vdDogdGhpcy52bS4kcm9vdCxcbiAgICAgICAgICAgICRwYXJlbnQ6IHRoaXMudm0sXG4gICAgICAgICAgICBfYXNzaWdubWVudHM6IHRoaXMuc3VtbWFyeS5hc3NpZ25tZW50cyxcbiAgICAgICAgICAgIF9fcmVwZWF0OiB0cnVlLFxuICAgICAgICAgICAgX19hbmNob3I6IGFuY2hvclxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodm0uJGVsLCBnZXRBbmNob3IodGhhdCwgcG9zKSlcbiAgICAgICAgICB2bUxpc3Quc3BsaWNlKHBvcywgMCwgdm0pO1xuICAgICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAwLCBpdGVtKVxuXG4gICAgICAgICAgLy/lu7bml7botYvlgLznu5kgYF9yZWxhdGl2ZVBhdGhgLCDpgb/lhY3lh7rnjrDmrbvlvqrnjq9cbiAgICAgICAgICAvL+WmguaenOWcqOS4iumdouWunuS+i+WMluaXtuW9k+WPguaVsOS8oOWFpSwg5Lya5YaS5rOh5Yiw54i257qnIHZtIOmAkuW9kuiwg+eUqOi/memHjOeahCB1cGRhdGUg5pa55rOVLCDpgKDmiJDmrbvlvqrnjq8uXG4gICAgICAgICAgdm0uX3JlbGF0aXZlUGF0aCA9IHRoaXMubGlzdFBhdGg7XG4gICAgICAgIH1lbHNlIHtcblxuICAgICAgICAgIC8v6LCD5bqPXG4gICAgICAgICAgaWYgKHBvcyAhPT0gb2xkUG9zKSB7XG5cbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGdldEVsQnlJbmRleCh0aGF0LCBvbGRQb3MpLCBnZXRBbmNob3IodGhhdCwgcG9zKSlcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGdldEVsQnlJbmRleCh0aGF0LCBwb3MpLCBnZXRBbmNob3IodGhhdCwgb2xkUG9zICsgMSkpXG5cbiAgICAgICAgICAgIHZtTGlzdFtvbGRQb3NdID0gW3ZtTGlzdFtwb3NdLCB2bUxpc3RbcG9zXSA9IHZtTGlzdFtvbGRQb3NdXVswXVxuICAgICAgICAgICAgY3VyQXJyW29sZFBvc10gPSBbY3VyQXJyW3Bvc10sIGN1ckFycltwb3NdID0gY3VyQXJyW29sZFBvc11dWzBdXG4gICAgICAgICAgICB2bUxpc3RbcG9zXS4kaW5kZXggPSBwb3NcbiAgICAgICAgICAgIHZtTGlzdFtwb3NdLiR1cGRhdGUoJyRpbmRleCcpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpXG5cbiAgICAgIC8v5pu05paw57Si5byVXG4gICAgICB2bUxpc3QuZm9yRWFjaChmdW5jdGlvbih2bSwgaSkge1xuICAgICAgICB2bS4kaW5kZXggPSBpXG4gICAgICAgIHZtLiRlbC4kaW5kZXggPSBpXG4gICAgICAgIHZtLiR1cGRhdGUoJyRpbmRleCcsIGZhbHNlKVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuc3VtbWFyeS5wYXRocy5mb3JFYWNoKGZ1bmN0aW9uKGxvY2FsS2V5KSB7XG4gICAgICAgIHZhciBsb2NhbCA9IHRoYXQudm0uJGdldChsb2NhbEtleSk7XG4gICAgICAgIHZhciBkaXJzID0gbG9jYWwuX19kaXJzX187XG4gICAgICAgIGlmKHV0aWxzLmlzQXJyYXkobG9jYWwpKSB7XG4gICAgICAgICAgaWYoIWRpcnMpe1xuICAgICAgICAgICAgLy/mlbDnu4Tmk43kvZzmlrnms5VcbiAgICAgICAgICAgIHV0aWxzLmV4dGVuZChsb2NhbCwge1xuICAgICAgICAgICAgICAkc2V0OiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEsIHV0aWxzLmlzT2JqZWN0KGl0ZW0pID8gdXRpbHMuZXh0ZW5kKHt9LCBsb2NhbFtpXSwgaXRlbSkgOiBpdGVtKVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAkcmVwbGFjZTogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgICAgIGxvY2FsLnNwbGljZShpLCAxLCBpdGVtKVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAkcmVtb3ZlOiBmdW5jdGlvbihpKSB7XG4gICAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGFycmF5TWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgICAgICAgICAgICBsb2NhbFttZXRob2RdID0gdXRpbHMuYWZ0ZXJGbihsb2NhbFttZXRob2RdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBkaXJzLmZvckVhY2goZnVuY3Rpb24oZGlyKSB7XG4gICAgICAgICAgICAgICAgICBkaXIubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKGRpci52bSwgcGF0aClcbiAgICAgICAgICAgICAgICAgICAgcmVmb3JtZWQudm0uJHVwZGF0ZShyZWZvcm1lZC5wYXRoKVxuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkaXJzID0gbG9jYWwuX19kaXJzX18gID0gW107XG4gICAgICAgICAgfVxuICAgICAgICAgIC8v5LiA5Liq5pWw57uE5aSa5aSE5L2/55SoXG4gICAgICAgICAgLy9UT0RPIOenu+mZpOaXtueahOaDheWGtVxuICAgICAgICAgIGlmKGRpcnMuaW5kZXhPZih0aGF0KSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGRpcnMucHVzaCh0aGF0KVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgIH1lbHNle1xuICAgICAgLy9UT0RPIOaZrumAmuWvueixoeeahOmBjeWOhlxuICAgIH1cbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0QW5jaG9yKGRpciwgaW5kZXgpIHtcbiAgdmFyIHZtID0gZGlyLnZtTGlzdFtpbmRleF1cbiAgcmV0dXJuIHZtID8gKCBkaXIuaXNSYW5nZSA/IHZtLl9fYW5jaG9yIDogdm0uJGVsICkgOiBkaXIuYW5jaG9ycy5lbmRcbn1cblxuLy/moLnmja7ntKLlvJXojrflj5bor6XmrKHov63ku6PkuK3nmoTmiYDmnInlhYPntKBcbmZ1bmN0aW9uIGdldE5vZGVzQnlJbmRleChkaXIsIGluZGV4KSB7XG4gIHZhciB2bUxpc3QgPSBkaXIudm1MaXN0XG4gICAgLCBhbmNob3IgPSB2bUxpc3RbaW5kZXhdLl9fYW5jaG9yXG4gICAgLCBuZXh0ID0gdm1MaXN0W2luZGV4ICsgMV1cbiAgICA7XG4gIHJldHVybiBbYW5jaG9yXS5jb25jYXQoZGlyLmdldE5vZGVzKGFuY2hvciwgbmV4dCAmJiBuZXh0Ll9fYW5jaG9yKSlcbn1cblxuZnVuY3Rpb24gZ2V0RWxCeUluZGV4IChkaXIsIGluZGV4KSB7XG4gIHZhciBmcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICBpZihkaXIuaXNSYW5nZSkge1xuICAgIGdldE5vZGVzQnlJbmRleChkaXIsIGluZGV4KS5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIGZyYWcuYXBwZW5kQ2hpbGQobm9kZSlcbiAgICB9KVxuICB9ZWxzZXtcbiAgICBmcmFnLmFwcGVuZENoaWxkKGRpci52bUxpc3RbaW5kZXhdLiRlbClcbiAgfVxuICByZXR1cm4gZnJhZ1xufVxuXG5mdW5jdGlvbiBhcnJEaWZmKGFycjEsIGFycjIsIHRyYWNrSWQpIHtcbiAgdmFyIGFycjJDb3B5ID0gYXJyMi5zbGljZSgpO1xuICByZXR1cm4gYXJyMS5maWx0ZXIoZnVuY3Rpb24oZWwpIHtcbiAgICB2YXIgcmVzdWx0LCBpbmRleCA9IGluZGV4QnlUcmFja0lkKGVsLCBhcnIyQ29weSwgdHJhY2tJZClcbiAgICBpZihpbmRleCA8IDApIHtcbiAgICAgIHJlc3VsdCA9IHRydWVcbiAgICB9ZWxzZXtcbiAgICAgIGFycjJDb3B5LnNwbGljZShpbmRleCwgMSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9KVxufVxuXG5mdW5jdGlvbiBpbmRleEJ5VHJhY2tJZChpdGVtLCBsaXN0LCB0cmFja0lkLCBzdGFydEluZGV4KSB7XG4gIHN0YXJ0SW5kZXggPSBzdGFydEluZGV4IHx8IDA7XG4gIHZhciBpbmRleCA9IGxpc3QuaW5kZXhPZihpdGVtLCBzdGFydEluZGV4KTtcbiAgaWYoaW5kZXggPT09IC0xICYmIHRyYWNrSWQpe1xuICAgIGZvcih2YXIgaSA9IHN0YXJ0SW5kZXgsIGl0ZW0xOyBpdGVtMSA9IGxpc3RbaV07IGkrKykge1xuICAgICAgaWYoaXRlbVt0cmFja0lkXSA9PT0gIGl0ZW0xW3RyYWNrSWRdICYmICF1dGlscy5pc1VuZGVmaW5lZChpdGVtW3RyYWNrSWRdKSl7XG4gICAgICAgIGluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBpbmRleDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+agt+W8j+aMh+S7pFxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxudmFyIGNhbWVsUmVnID0gLyhbQS1aXSkvZztcblxuLy/pu5jorqTljZXkvY3kuLogcHgg55qE5bGe5oCnXG52YXIgcGl4ZWxBdHRycyA9IFtcbiAgJ3dpZHRoJywnaGVpZ2h0JywnbWluLXdpZHRoJywgJ21pbi1oZWlnaHQnLCAnbWF4LXdpZHRoJywgJ21heC1oZWlnaHQnLFxuICAnbWFyZ2luJywgJ21hcmdpbi10b3AnLCAnbWFyZ2luLXJpZ2h0JywgJ21hcmdpbi1sZWZ0JywgJ21hcmdpbi1ib3R0b20nLFxuICAncGFkZGluZycsICdwYWRkaW5nLXRvcCcsICdwYWRkaW5nLXJpZ2h0JywgJ3BhZGRpbmctYm90dG9tJywgJ3BhZGRpbmctbGVmdCcsXG4gICd0b3AnLCAnbGVmdCcsICdyaWdodCcsICdib3R0b20nXG5dXG5cbi8v5a+55LqOIElFNiwgSUU3IOa1j+iniOWZqOmcgOimgeS9v+eUqCBgZWwuc3R5bGUuZ2V0QXR0cmlidXRlKCdjc3NUZXh0JylgIOS4jiBgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0JylgIOadpeivu+WGmSBzdHlsZSDlrZfnrKblsZ7mgKdcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5pdFN0eWxlID0gdGhpcy5lbC5zdHlsZS5nZXRBdHRyaWJ1dGUgPyB0aGlzLmVsLnN0eWxlLmdldEF0dHJpYnV0ZSgnY3NzVGV4dCcpIDogdGhpcy5lbC5nZXRBdHRyaWJ1dGUoJ3N0eWxlJylcbiAgfSxcbiAgdXBkYXRlOiBmdW5jdGlvbihzdHlsZXMpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBzdHlsZVN0ciA9IHRoaXMuaW5pdFN0eWxlID8gdGhpcy5pbml0U3R5bGUucmVwbGFjZSgvOz8kLywgJzsnKSA6ICcnO1xuICAgIHZhciBkYXNoS2V5LCB2YWw7XG5cbiAgICBpZih0eXBlb2Ygc3R5bGVzID09PSAnc3RyaW5nJykge1xuICAgICAgc3R5bGVTdHIgKz0gc3R5bGVzO1xuICAgIH1lbHNlIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBzdHlsZXMpIHtcbiAgICAgICAgdmFsID0gc3R5bGVzW2tleV07XG5cbiAgICAgICAgLy9tYXJnaW5Ub3AgLT4gbWFyZ2luLXRvcC4g6am85bOw6L2s6L+e5o6l56ym5byPXG4gICAgICAgIGRhc2hLZXkgPSBrZXkucmVwbGFjZShjYW1lbFJlZywgZnVuY3Rpb24gKHVwcGVyQ2hhcikge1xuICAgICAgICAgIHJldHVybiAnLScgKyB1cHBlckNoYXIudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHBpeGVsQXR0cnMuaW5kZXhPZihkYXNoS2V5KSA+PSAwICYmIHV0aWxzLmlzTnVtZXJpYyh2YWwpKSB7XG4gICAgICAgICAgdmFsICs9ICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYoIXV0aWxzLmlzVW5kZWZpbmVkKHZhbCkpe1xuICAgICAgICAgIHN0eWxlU3RyICs9IGRhc2hLZXkgKyAnOiAnICsgdmFsICsgJzsgJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZihlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgLy/ogIEgSUVcbiAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHN0eWxlU3RyKTtcbiAgICB9ZWxzZXtcbiAgICAgIGVsLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBzdHlsZVN0cik7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIC8v5bCG5qih5p2/L+WFg+e0oC9ub2RlbGlzdCDljIXoo7nlnKggZnJhZ21lbnQg5LitXG4gIGNyZWF0ZUNvbnRlbnQ6IGZ1bmN0aW9uIGNyZWF0ZUNvbnRlbnQodHBsKSB7XG4gICAgdmFyIGNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgIHZhciB3cmFwZXI7XG4gICAgdmFyIG5vZGVzID0gW107XG4gICAgaWYodXRpbHMuaXNPYmplY3QodHBsKSkge1xuICAgICAgaWYodHBsLm5vZGVOYW1lICYmIHRwbC5ub2RlVHlwZSkge1xuICAgICAgICAvL2RvbSDlhYPntKBcbiAgICAgICAgY29udGVudC5hcHBlbmRDaGlsZCh0cGwpO1xuICAgICAgfWVsc2UgaWYoJ2xlbmd0aCcgaW4gdHBsKXtcbiAgICAgICAgLy9ub2RlbGlzdFxuICAgICAgICBub2RlcyA9IHRwbDtcbiAgICAgIH1cbiAgICB9ZWxzZSB7XG4gICAgICB3cmFwZXIgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICAgIC8v6Ieq5a6a5LmJ5qCH562+5ZyoIElFOCDkuIvml6DmlYguIOS9v+eUqCBjb21wb25lbnQg5oyH5Luk5pu/5LujXG4gICAgICB3cmFwZXIuaW5uZXJIVE1MID0gKHRwbCArICcnKS50cmltKCk7XG4gICAgICBub2RlcyA9IHdyYXBlci5jaGlsZE5vZGVzO1xuICAgIH1cbiAgICB3aGlsZShub2Rlc1swXSkge1xuICAgICAgY29udGVudC5hcHBlbmRDaGlsZChub2Rlc1swXSlcbiAgICB9XG4gICAgcmV0dXJuIGNvbnRlbnQ7XG4gIH0sXG5cbiAgLy/ojrflj5blhYPntKDlsZ7mgKdcbiAgZ2V0QXR0cnM6IGZ1bmN0aW9uKGVsKSB7XG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBlbC5hdHRyaWJ1dGVzO1xuICAgIHZhciBhdHRycyA9IHt9O1xuXG4gICAgZm9yKHZhciBpID0gYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgLy/ov57mjqXnrKbovazpqbzls7Dlhpnms5VcbiAgICAgIGF0dHJzW3V0aWxzLmh5cGhlblRvQ2FtZWwoYXR0cmlidXRlc1tpXS5ub2RlTmFtZSldID0gYXR0cmlidXRlc1tpXS52YWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXR0cnM7XG4gIH0sXG5cbiAgaGFzQXR0cjogZnVuY3Rpb24oZWwsIGF0dHJOYW1lKSB7XG4gICAgcmV0dXJuIGVsLmhhc0F0dHJpYnV0ZSA/IGVsLmhhc0F0dHJpYnV0ZShhdHRyTmFtZSkgOiAhdXRpbHMuaXNVbmRlZmluZWQoZWxbYXR0ck5hbWVdKTtcbiAgfVxufTtcbiIsIihmdW5jdGlvbihyb290KXtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZXhwb3J0cy5yb290ID0gcm9vdDtcbiAgZXhwb3J0cy5kb2N1bWVudCA9IHJvb3QuZG9jdW1lbnQgfHwgcmVxdWlyZSgnanNkb20nKS5qc2RvbSgpO1xuXG59KSgoZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXN9KSgpKTtcbiIsIi8qKlxuICog6KGo6L6+5byP5omn6KGMXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBzY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKVxuXG52YXIgb3BlcmF0b3JzID0ge1xuICAndW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbih2KSB7IHJldHVybiArdjsgfVxuICAsICctJzogZnVuY3Rpb24odikgeyByZXR1cm4gLXY7IH1cbiAgLCAnISc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICF2OyB9XG5cbiAgLCAnWyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdjsgfVxuICAsICd7JzogZnVuY3Rpb24odil7XG4gICAgICB2YXIgciA9IHt9O1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IHYubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHJbdltpXVswXV0gPSB2W2ldWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICAsICd0eXBlb2YnOiBmdW5jdGlvbih2KXsgcmV0dXJuIHR5cGVvZiB2OyB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gbmV3IHYgfVxuICB9XG5cbiwgJ2JpbmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKyByOyB9XG4gICwgJy0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC0gcjsgfVxuICAsICcqJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAqIHI7IH1cbiAgLCAnLyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLyByOyB9XG4gICwgJyUnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICUgcjsgfVxuICAsICc8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8IHI7IH1cbiAgLCAnPic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPiByOyB9XG4gICwgJzw9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8PSByOyB9XG4gICwgJz49JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+PSByOyB9XG4gICwgJz09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PSByOyB9XG4gICwgJyE9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPSByOyB9XG4gICwgJz09PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT09IHI7IH1cbiAgLCAnIT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPT0gcjsgfVxuICAsICcmJic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJiYgcjsgfVxuICAsICd8fCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgfHwgcjsgfVxuICAsICcsJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCwgcjsgfVxuXG4gICwgJy4nOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihyICYmIHBhdGgpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG4gICwgJ1snOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZih0eXBlb2YgciAhPT0gJ3VuZGVmaW5lZCcgJiYgcGF0aCl7XG4gICAgICAgIHBhdGggPSBwYXRoICsgJy4nICsgcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsW3JdO1xuICAgIH1cblxuICAgIC8vVE9ETyDmqKHmnb/kuK3mlrnms5XnmoQgdGhpcyDlupTor6XmjIflkJEgcm9vdFxuICAsICcoJzogZnVuY3Rpb24obCwgcil7IHJldHVybiBsLmFwcGx5KHJvb3QsIHIpIH1cbiAgICAvL2ZpbHRlci4gbmFtZXxmaWx0ZXJcbiAgLCAnfCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gY2FsbEZpbHRlcihsLCByLCBbXSkgfVxuICAsICduZXcnOiBmdW5jdGlvbihsLCByKXtcbiAgICAgIHJldHVybiBsID09PSBEYXRlID8gbmV3IEZ1bmN0aW9uKCdyZXR1cm4gbmV3IERhdGUoJyArIHIuam9pbignLCAnKSArICcpJykoKSA6IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkobCwgcikpO1xuICAgIH1cblxuICAsICdpbic6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgaWYodGhpcy5yZXBlYXQpIHtcbiAgICAgICAgLy9yZXBlYXRcbiAgICAgICAgcmV0dXJuIHI7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIGwgaW4gcjtcbiAgICAgIH1cbiAgICB9XG4gICwgJ2NhdGNoYnknOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihsWydjYXRjaCddKSB7XG4gICAgICAgIHJldHVybiBsWydjYXRjaCddKHIuYmluZChyb290KSlcbiAgICAgIH1lbHNle1xuICAgICAgICBzdW1tYXJ5Q2FsbCB8fCBjb25zb2xlLmVycm9yKCdjYXRjaGJ5IGV4cGVjdCBhIHByb21pc2UnKVxuICAgICAgICByZXR1cm4gbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLCAndGVybmFyeSc6IHtcbiAgICAnPyc6IGZ1bmN0aW9uKGYsIHMsIHQpIHsgcmV0dXJuIGYgPyBzIDogdDsgfVxuICAsICcoJzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZltzXS5hcHBseShmLCB0KSB9XG5cbiAgICAvL2ZpbHRlci4gbmFtZSB8IGZpbHRlciA6IGFyZzIgOiBhcmczXG4gICwgJ3wnOiBmdW5jdGlvbihmLCBzLCB0KXsgcmV0dXJuIGNhbGxGaWx0ZXIoZiwgcywgdCkgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBjYWxsRmlsdGVyKGFyZywgZmlsdGVyLCBhcmdzKSB7XG4gIGlmKGFyZyAmJiBhcmcudGhlbikge1xuICAgIHJldHVybiBhcmcudGhlbihmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gZmlsdGVyLmFwcGx5KHJvb3QsIFtkYXRhXS5jb25jYXQoYXJncykpXG4gICAgfSk7XG4gIH1lbHNle1xuICAgIHJldHVybiBmaWx0ZXIuYXBwbHkocm9vdCwgW2FyZ10uY29uY2F0KGFyZ3MpKVxuICB9XG59XG5cbnZhciBhcmdOYW1lID0gWydmaXJzdCcsICdzZWNvbmQnLCAndGhpcmQnXVxuICAsIGNvbnRleHQsIHN1bW1hcnksIHN1bW1hcnlDYWxsXG4gICwgcGF0aFxuICAsIHNlbGZcbiAgLCByb290XG4gIDtcblxuLy/pgY3ljoYgYXN0XG52YXIgZXZhbHVhdGUgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHZhciBhcml0eSA9IHRyZWUuYXJpdHlcbiAgICAsIHZhbHVlID0gdHJlZS52YWx1ZVxuICAgICwgYXJncyA9IFtdXG4gICAgLCBuID0gMFxuICAgICwgYXJnXG4gICAgLCByZXNcbiAgICA7XG5cbiAgLy/mk43kvZznrKbmnIDlpJrlj6rmnInkuInlhYNcbiAgZm9yKDsgbiA8IDM7IG4rKyl7XG4gICAgYXJnID0gdHJlZVthcmdOYW1lW25dXTtcbiAgICBpZihhcmcpe1xuICAgICAgaWYoQXJyYXkuaXNBcnJheShhcmcpKXtcbiAgICAgICAgYXJnc1tuXSA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJnLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgYXJnc1tuXS5wdXNoKHR5cGVvZiBhcmdbaV0ua2V5ID09PSAndW5kZWZpbmVkJyA/XG4gICAgICAgICAgICBldmFsdWF0ZShhcmdbaV0pIDogW2FyZ1tpXS5rZXksIGV2YWx1YXRlKGFyZ1tpXSldKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGFyZ3Nbbl0gPSBldmFsdWF0ZShhcmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGFyaXR5ICE9PSAnbGl0ZXJhbCcpIHtcbiAgICBpZihwYXRoICYmIHZhbHVlICE9PSAnLicgJiYgdmFsdWUgIT09ICdbJykge1xuICAgICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gICAgfVxuICAgIGlmKGFyaXR5ID09PSAnbmFtZScpIHtcbiAgICAgIHBhdGggPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBzd2l0Y2goYXJpdHkpe1xuICAgIGNhc2UgJ3VuYXJ5JzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Rlcm5hcnknOlxuICAgICAgdHJ5e1xuICAgICAgICByZXMgPSBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpLmFwcGx5KHRyZWUsIGFyZ3MpO1xuICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAvL3N1bW1hcnlDYWxsIHx8IGNvbnNvbGUud2FybihlKTtcbiAgICAgIH1cbiAgICBicmVhaztcbiAgICBjYXNlICdsaXRlcmFsJzpcbiAgICAgIHJlcyA9IHZhbHVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3JlcGVhdCc6XG4gICAgICBzdW1tYXJ5LmFzc2lnbm1lbnRzW3ZhbHVlXSA9IHRydWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbmFtZSc6XG4gICAgICBzdW1tYXJ5LmxvY2Fsc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gZ2V0VmFsdWUodmFsdWUsIGNvbnRleHQubG9jYWxzKTtcbiAgICBicmVhaztcbiAgICBjYXNlICdmaWx0ZXInOlxuICAgICAgc3VtbWFyeS5maWx0ZXJzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBjb250ZXh0LmZpbHRlcnNbdmFsdWVdO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RoaXMnOlxuICAgICAgcmVzID0gY29udGV4dC5sb2NhbHM7Ly9UT0RPIHRoaXMg5oyH5ZCRIHZtIOi/mOaYryBkaXI/XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cbmZ1bmN0aW9uIGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSl7XG4gIHJldHVybiBvcGVyYXRvcnNbYXJpdHldW3ZhbHVlXSB8fCBmdW5jdGlvbigpIHsgcmV0dXJuOyB9XG59XG5cbmZ1bmN0aW9uIHJlc2V0KHNjb3BlLCB0aGF0KSB7XG4gIHN1bW1hcnlDYWxsID0gdHJ1ZTtcbiAgaWYoc2NvcGUpIHtcbiAgICByb290ID0gc2NvcGUuJHJvb3Q7XG4gICAgc3VtbWFyeUNhbGwgPSBmYWxzZTtcbiAgICBjb250ZXh0ID0ge2xvY2Fsczogc2NvcGUgfHwge30sIGZpbHRlcnM6IHNjb3BlLmNvbnN0cnVjdG9yLmZpbHRlcnMgfHwge319O1xuICB9ZWxzZXtcbiAgICBjb250ZXh0ID0ge2ZpbHRlcnM6IHt9LCBsb2NhbHM6IHt9fTtcbiAgfVxuICBpZih0aGF0KXtcbiAgICBzZWxmID0gdGhhdDtcbiAgfVxuXG4gIHN1bW1hcnkgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge30sIHBhdGhzOiB7fSwgYXNzaWdubWVudHM6IHt9fTtcbiAgcGF0aCA9ICcnO1xufVxuXG4vL+WcqOS9nOeUqOWfn+S4reafpeaJvuWAvFxudmFyIGdldFZhbHVlID0gZnVuY3Rpb24oa2V5LCB2bSkge1xuICB2YXIgcmVmb3JtZWQgPSBzY29wZS5yZWZvcm1TY29wZSh2bSwga2V5KVxuICByZXR1cm4gcmVmb3JtZWQudm1bcmVmb3JtZWQucGF0aF1cbn1cblxuLy/ooajovr7lvI/msYLlgLxcbi8vdHJlZTogcGFyc2VyIOeUn+aIkOeahCBhc3Rcbi8vc2NvcGUg5omn6KGM546v5aKDXG5leHBvcnRzLmV2YWwgPSBmdW5jdGlvbih0cmVlLCBzY29wZSwgdGhhdCkge1xuICByZXNldChzY29wZSB8fCB7fSwgdGhhdCk7XG5cbiAgcmV0dXJuIGV2YWx1YXRlKHRyZWUpO1xufTtcblxuLy/ooajovr7lvI/mkZjopoFcbi8vcmV0dXJuOiB7ZmlsdGVyczpbXSwgbG9jYWxzOltdLCBwYXRoczogW10sIGFzc2lnbm1lbnRzOiBbXX1cbmV4cG9ydHMuc3VtbWFyeSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgcmVzZXQoKTtcblxuICBldmFsdWF0ZSh0cmVlKTtcblxuICBpZihwYXRoKSB7XG4gICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gIH1cbiAgZm9yKHZhciBrZXkgaW4gc3VtbWFyeSkge1xuICAgIHN1bW1hcnlba2V5XSA9IE9iamVjdC5rZXlzKHN1bW1hcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIHN1bW1hcnk7XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydHMuYWRkRXZlbnQgPSBmdW5jdGlvbiBhZGRFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIGZhbHNlKTtcbiAgfWVsc2V7XG4gICAgZWwuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufVxuXG5leHBvcnRzLnJlbW92ZUV2ZW50ID0gZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmKGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyKTtcbiAgfWVsc2V7XG4gICAgZWwuZGV0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufSIsIlwidXNlIHN0cmljdFwiO1xuLy9KYXZhc2NyaXB0IGV4cHJlc3Npb24gcGFyc2VyIG1vZGlmaWVkIGZvcm0gQ3JvY2tmb3JkJ3MgVERPUCBwYXJzZXJcbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG5cdGZ1bmN0aW9uIEYoKSB7fVxuXHRGLnByb3RvdHlwZSA9IG87XG5cdHJldHVybiBuZXcgRigpO1xufTtcblxudmFyIHNvdXJjZTtcblxudmFyIGVycm9yID0gZnVuY3Rpb24gKG1lc3NhZ2UsIHQpIHtcblx0dCA9IHQgfHwgdGhpcztcbiAgdmFyIG1zZyA9IG1lc3NhZ2UgKz0gXCIgQnV0IGZvdW5kICdcIiArIHQudmFsdWUgKyBcIidcIiArICh0LmZyb20gPyBcIiBhdCBcIiArIHQuZnJvbSA6IFwiXCIpICsgXCIgaW4gJ1wiICsgc291cmNlICsgXCInXCI7XG4gIHZhciBlID0gbmV3IEVycm9yKG1zZyk7XG5cdGUubmFtZSA9IHQubmFtZSA9IFwiU3ludGF4RXJyb3JcIjtcblx0dC5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhyb3cgZTtcbn07XG5cbnZhciB0b2tlbml6ZSA9IGZ1bmN0aW9uIChjb2RlLCBwcmVmaXgsIHN1ZmZpeCkge1xuXHR2YXIgYzsgLy8gVGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgZnJvbTsgLy8gVGhlIGluZGV4IG9mIHRoZSBzdGFydCBvZiB0aGUgdG9rZW4uXG5cdHZhciBpID0gMDsgLy8gVGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGNoYXJhY3Rlci5cblx0dmFyIGxlbmd0aCA9IGNvZGUubGVuZ3RoO1xuXHR2YXIgbjsgLy8gVGhlIG51bWJlciB2YWx1ZS5cblx0dmFyIHE7IC8vIFRoZSBxdW90ZSBjaGFyYWN0ZXIuXG5cdHZhciBzdHI7IC8vIFRoZSBzdHJpbmcgdmFsdWUuXG5cblx0dmFyIHJlc3VsdCA9IFtdOyAvLyBBbiBhcnJheSB0byBob2xkIHRoZSByZXN1bHRzLlxuXG5cdC8vIE1ha2UgYSB0b2tlbiBvYmplY3QuXG5cdHZhciBtYWtlID0gZnVuY3Rpb24gKHR5cGUsIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGUgOiB0eXBlLFxuXHRcdFx0dmFsdWUgOiB2YWx1ZSxcblx0XHRcdGZyb20gOiBmcm9tLFxuXHRcdFx0dG8gOiBpXG5cdFx0fTtcblx0fTtcblxuXHQvLyBCZWdpbiB0b2tlbml6YXRpb24uIElmIHRoZSBzb3VyY2Ugc3RyaW5nIGlzIGVtcHR5LCByZXR1cm4gbm90aGluZy5cblx0aWYgKCFjb2RlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGNvZGUgdGV4dCwgb25lIGNoYXJhY3RlciBhdCBhIHRpbWUuXG5cdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0d2hpbGUgKGMpIHtcblx0XHRmcm9tID0gaTtcblxuXHRcdGlmIChjIDw9ICcgJykgeyAvLyBJZ25vcmUgd2hpdGVzcGFjZS5cblx0XHRcdGkgKz0gMTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9IGVsc2UgaWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7IC8vIG5hbWUuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fFxuXHRcdFx0XHRcdChjID49ICcwJyAmJiBjIDw9ICc5JykgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCduYW1lJywgc3RyKSk7XG5cdFx0fSBlbHNlIGlmIChjID49ICcwJyAmJiBjIDw9ICc5Jykge1xuXHRcdFx0Ly8gbnVtYmVyLlxuXG5cdFx0XHQvLyBBIG51bWJlciBjYW5ub3Qgc3RhcnQgd2l0aCBhIGRlY2ltYWwgcG9pbnQuIEl0IG11c3Qgc3RhcnQgd2l0aCBhIGRpZ2l0LFxuXHRcdFx0Ly8gcG9zc2libHkgJzAnLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblxuXHRcdFx0Ly8gTG9vayBmb3IgbW9yZSBkaWdpdHMuXG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYSBkZWNpbWFsIGZyYWN0aW9uIHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJy4nKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGFuIGV4cG9uZW50IHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJ2UnIHx8IGMgPT09ICdFJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjID09PSAnLScgfHwgYyA9PT0gJysnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgZXhwb25lbnRcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH0gd2hpbGUgKGMgPj0gJzAnICYmIGMgPD0gJzknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBuZXh0IGNoYXJhY3RlciBpcyBub3QgYSBsZXR0ZXIuXG5cblx0XHRcdGlmIChjID49ICdhJyAmJiBjIDw9ICd6Jykge1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZSB0byBhIG51bWJlci4gSWYgaXQgaXMgZmluaXRlLCB0aGVuIGl0IGlzIGEgZ29vZFxuXHRcdFx0Ly8gdG9rZW4uXG5cblx0XHRcdG4gPSArc3RyO1xuXHRcdFx0aWYgKGlzRmluaXRlKG4pKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ251bWJlcicsIG4pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc3RyaW5nXG5cblx0XHR9IGVsc2UgaWYgKGMgPT09ICdcXCcnIHx8IGMgPT09ICdcIicpIHtcblx0XHRcdHN0ciA9ICcnO1xuXHRcdFx0cSA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcgJykge1xuXHRcdFx0XHRcdG1ha2UoJ3N0cmluZycsIHN0cik7XG5cdFx0XHRcdFx0ZXJyb3IoYyA9PT0gJ1xcbicgfHwgYyA9PT0gJ1xccicgfHwgYyA9PT0gJycgP1xuXHRcdFx0XHRcdFx0XCJVbnRlcm1pbmF0ZWQgc3RyaW5nLlwiIDpcblx0XHRcdFx0XHRcdFwiQ29udHJvbCBjaGFyYWN0ZXIgaW4gc3RyaW5nLlwiLCBtYWtlKCcnLCBzdHIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIHRoZSBjbG9zaW5nIHF1b3RlLlxuXG5cdFx0XHRcdGlmIChjID09PSBxKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciBlc2NhcGVtZW50LlxuXG5cdFx0XHRcdGlmIChjID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRzd2l0Y2ggKGMpIHtcblx0XHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxiJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2YnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGYnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcbic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxyJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3QnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndSc6XG5cdFx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IHBhcnNlSW50KGNvZGUuc3Vic3RyKGkgKyAxLCA0KSwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0Zpbml0ZShjKSB8fCBjIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcblx0XHRcdFx0XHRcdGkgKz0gNDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdC8vIGNvbWJpbmluZ1xuXG5cdFx0fSBlbHNlIGlmIChwcmVmaXguaW5kZXhPZihjKSA+PSAwKSB7XG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoaSA+PSBsZW5ndGggfHwgc3VmZml4LmluZGV4T2YoYykgPCAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgc3RyKSk7XG5cblx0XHRcdC8vIHNpbmdsZS1jaGFyYWN0ZXIgb3BlcmF0b3JcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdvcGVyYXRvcicsIGMpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBtYWtlX3BhcnNlID0gZnVuY3Rpb24gKHZhcnMpIHtcblx0dmFycyA9IHZhcnMgfHwge307Ly/pooTlrprkuYnnmoTlj5jph49cblx0dmFyIHN5bWJvbF90YWJsZSA9IHt9O1xuXHR2YXIgdG9rZW47XG5cdHZhciB0b2tlbnM7XG5cdHZhciB0b2tlbl9ucjtcblx0dmFyIGNvbnRleHQ7XG5cblx0dmFyIGl0c2VsZiA9IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHR2YXIgZmluZCA9IGZ1bmN0aW9uIChuKSB7XG5cdFx0bi5udWQgPSBpdHNlbGY7XG5cdFx0bi5sZWQgPSBudWxsO1xuXHRcdG4uc3RkID0gbnVsbDtcblx0XHRuLmxicCA9IDA7XG5cdFx0cmV0dXJuIG47XG5cdH07XG5cblx0dmFyIGFkdmFuY2UgPSBmdW5jdGlvbiAoaWQpIHtcblx0XHR2YXIgYSwgbywgdCwgdjtcblx0XHRpZiAoaWQgJiYgdG9rZW4uaWQgIT09IGlkKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkICdcIiArIGlkICsgXCInLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICh0b2tlbl9uciA+PSB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHR0b2tlbiA9IHN5bWJvbF90YWJsZVtcIihlbmQpXCJdO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ID0gdG9rZW5zW3Rva2VuX25yXTtcblx0XHR0b2tlbl9uciArPSAxO1xuXHRcdHYgPSB0LnZhbHVlO1xuXHRcdGEgPSB0LnR5cGU7XG5cdFx0aWYgKChhID09PSBcIm9wZXJhdG9yXCIgfHwgYSAhPT0gJ3N0cmluZycpICYmIHYgaW4gc3ltYm9sX3RhYmxlKSB7XG5cdFx0XHQvL3RydWUsIGZhbHNlIOetieebtOaOpemHj+S5n+S8mui/m+WFpeatpOWIhuaUr1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVt2XTtcblx0XHRcdGlmICghbykge1xuXHRcdFx0XHRlcnJvcihcIlVua25vd24gb3BlcmF0b3IuXCIsIHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJuYW1lXCIpIHtcblx0XHRcdG8gPSBmaW5kKHQpO1xuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJzdHJpbmdcIiB8fCBhID09PSBcIm51bWJlclwiIHx8IGEgPT09IFwicmVnZXhwXCIpIHtcblx0XHRcdG8gPSBzeW1ib2xfdGFibGVbXCIobGl0ZXJhbClcIl07XG5cdFx0XHRhID0gXCJsaXRlcmFsXCI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVycm9yKFwiVW5leHBlY3RlZCB0b2tlbi5cIiwgdCk7XG5cdFx0fVxuXHRcdHRva2VuID0gY3JlYXRlKG8pO1xuXHRcdHRva2VuLmZyb20gPSB0LmZyb207XG5cdFx0dG9rZW4udG8gPSB0LnRvO1xuXHRcdHRva2VuLnZhbHVlID0gdjtcblx0XHR0b2tlbi5hcml0eSA9IGE7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9O1xuXG4gIC8v6KGo6L6+5byPXG4gIC8vcmJwOiByaWdodCBiaW5kaW5nIHBvd2VyIOWPs+S+p+e6puadn+WKm1xuXHR2YXIgZXhwcmVzc2lvbiA9IGZ1bmN0aW9uIChyYnApIHtcblx0XHR2YXIgbGVmdDtcblx0XHR2YXIgdCA9IHRva2VuO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRsZWZ0ID0gdC5udWQoKTtcblx0XHR3aGlsZSAocmJwIDwgdG9rZW4ubGJwKSB7XG5cdFx0XHR0ID0gdG9rZW47XG5cdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRsZWZ0ID0gdC5sZWQobGVmdCk7XG5cdFx0fVxuXHRcdHJldHVybiBsZWZ0O1xuXHR9O1xuXG5cdHZhciBvcmlnaW5hbF9zeW1ib2wgPSB7XG5cdFx0bnVkIDogZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXJyb3IoXCJVbmRlZmluZWQuXCIsIHRoaXMpO1xuXHRcdH0sXG5cdFx0bGVkIDogZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdGVycm9yKFwiTWlzc2luZyBvcGVyYXRvci5cIiwgdGhpcyk7XG5cdFx0fVxuXHR9O1xuXG5cdHZhciBzeW1ib2wgPSBmdW5jdGlvbiAoaWQsIGJwKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2xfdGFibGVbaWRdO1xuXHRcdGJwID0gYnAgfHwgMDtcblx0XHRpZiAocykge1xuXHRcdFx0aWYgKGJwID49IHMubGJwKSB7XG5cdFx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHMgPSBjcmVhdGUob3JpZ2luYWxfc3ltYm9sKTtcblx0XHRcdHMuaWQgPSBzLnZhbHVlID0gaWQ7XG5cdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0c3ltYm9sX3RhYmxlW2lkXSA9IHM7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBjb25zdGFudCA9IGZ1bmN0aW9uIChzLCB2LCBhKSB7XG5cdFx0dmFyIHggPSBzeW1ib2wocyk7XG5cdFx0eC5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gc3ltYm9sX3RhYmxlW3RoaXMuaWRdLnZhbHVlO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHR4LnZhbHVlID0gdjtcblx0XHRyZXR1cm4geDtcblx0fTtcblxuXHR2YXIgaW5maXggPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGluZml4ciA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwIC0gMSk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIHByZWZpeCA9IGZ1bmN0aW9uIChpZCwgbnVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQpO1xuXHRcdHMubnVkID0gbnVkIHx8IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDcwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHN5bWJvbChcIihlbmQpXCIpO1xuXHRzeW1ib2woXCIobmFtZSlcIik7XG5cdHN5bWJvbChcIjpcIik7XG5cdHN5bWJvbChcIilcIik7XG5cdHN5bWJvbChcIl1cIik7XG5cdHN5bWJvbChcIn1cIik7XG5cdHN5bWJvbChcIixcIik7XG5cblx0Y29uc3RhbnQoXCJ0cnVlXCIsIHRydWUpO1xuXHRjb25zdGFudChcImZhbHNlXCIsIGZhbHNlKTtcblx0Y29uc3RhbnQoXCJudWxsXCIsIG51bGwpO1xuXHRjb25zdGFudChcInVuZGVmaW5lZFwiKTtcblxuXHRjb25zdGFudChcIk1hdGhcIiwgTWF0aCk7XG5cdGNvbnN0YW50KFwiRGF0ZVwiLCBEYXRlKTtcblx0Zm9yKHZhciB2IGluIHZhcnMpIHtcblx0XHRjb25zdGFudCh2LCB2YXJzW3ZdKTtcblx0fVxuXG5cdHN5bWJvbChcIihsaXRlcmFsKVwiKS5udWQgPSBpdHNlbGY7XG5cblx0c3ltYm9sKFwidGhpc1wiKS5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdCAgdGhpcy5hcml0eSA9IFwidGhpc1wiO1xuXHQgIHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdC8vT3BlcmF0b3IgUHJlY2VkZW5jZTpcblx0Ly9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvT3BlcmF0b3JfUHJlY2VkZW5jZVxuXG4gIC8vaW5maXgoJywnLCAxKTtcblx0aW5maXgoXCI/XCIsIDIwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHR0aGlzLnRoaXJkID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4cihcIiYmXCIsIDMxKTtcblx0aW5maXhyKFwifHxcIiwgMzApO1xuXG5cdGluZml4cihcIj09PVwiLCA0MCk7XG5cdGluZml4cihcIiE9PVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPFwiLCA0MCk7XG5cdGluZml4cihcIjw9XCIsIDQwKTtcblx0aW5maXhyKFwiPlwiLCA0MCk7XG5cdGluZml4cihcIj49XCIsIDQwKTtcblxuXHRpbmZpeChcImluXCIsIDQ1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRpZiAoY29udGV4dCA9PT0gJ3JlcGVhdCcpIHtcblx0XHRcdC8vIGBpbmAgYXQgcmVwZWF0IGJsb2NrXG5cdFx0XHRsZWZ0LmFyaXR5ID0gJ3JlcGVhdCc7XG5cdFx0XHR0aGlzLnJlcGVhdCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIitcIiwgNTApO1xuXHRpbmZpeChcIi1cIiwgNTApO1xuXG5cdGluZml4KFwiKlwiLCA2MCk7XG5cdGluZml4KFwiL1wiLCA2MCk7XG5cdGluZml4KFwiJVwiLCA2MCk7XG5cblx0aW5maXgoXCIoXCIsIDc1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKGxlZnQuaWQgPT09IFwiLlwiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdC5maXJzdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gbGVmdC5zZWNvbmQ7XG5cdFx0XHR0aGlzLnRoaXJkID0gYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdGlmICgobGVmdC5hcml0eSAhPT0gXCJ1bmFyeVwiIHx8IGxlZnQuaWQgIT09IFwiZnVuY3Rpb25cIikgJiZcblx0XHRcdFx0bGVmdC5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbGVmdC5hcml0eSAhPT0gXCJsaXRlcmFsXCIgJiYgbGVmdC5pZCAhPT0gXCIoXCIgJiZcblx0XHRcdFx0bGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIikge1xuXHRcdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgdmFyaWFibGUgbmFtZS5cIiwgbGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCIpXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIuXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdGlmICh0b2tlbi5hcml0eSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSBwcm9wZXJ0eSBuYW1lLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRva2VuLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0dGhpcy5zZWNvbmQgPSB0b2tlbjtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiW1wiLCA2MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vZmlsdGVyXG5cdGluZml4KFwifFwiLCAxMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYTtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0b2tlbi5hcml0eSA9ICdmaWx0ZXInO1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigxMCk7XG5cdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdGlmICh0b2tlbi5pZCA9PT0gJzonKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ3Rlcm5hcnknO1xuXHRcdFx0dGhpcy50aGlyZCA9IGEgPSBbXTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGFkdmFuY2UoJzonKTtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMTApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIjpcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcbiAgaW5maXgoJ2NhdGNoYnknLCAxMCk7XG5cblx0cHJlZml4KFwiIVwiKTtcblx0cHJlZml4KFwiLVwiKTtcblx0cHJlZml4KFwidHlwZW9mXCIpO1xuXG5cdHByZWZpeChcIihcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBlID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gZTtcblx0fSk7XG5cblx0cHJlZml4KFwiW1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwiXVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigxKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0dGhpcy5maXJzdCA9IGE7XG5cdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KFwie1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXSxcdG4sIHY7XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIn1cIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0biA9IHRva2VuO1xuXHRcdFx0XHRpZiAobi5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbi5hcml0eSAhPT0gXCJsaXRlcmFsXCIpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBwcm9wZXJ0eSBuYW1lOiBcIiwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdFx0YWR2YW5jZShcIjpcIik7XG5cdFx0XHRcdHYgPSBleHByZXNzaW9uKDEpO1xuXHRcdFx0XHR2LmtleSA9IG4udmFsdWU7XG5cdFx0XHRcdGEucHVzaCh2KTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwifVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoJ25ldycsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDc5KTtcblx0XHRpZih0b2tlbi5pZCA9PT0gJygnKSB7XG5cdFx0XHRhZHZhbmNlKFwiKFwiKTtcblx0XHRcdHRoaXMuYXJpdHkgPSAnYmluYXJ5Jztcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdFx0YWR2YW5jZShcIilcIik7XG5cdFx0fWVsc2V7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0Ly9fc291cmNlOiDooajovr7lvI/ku6PnoIHlrZfnrKbkuLJcblx0Ly9fY29udGV4dDog6KGo6L6+5byP55qE6K+t5Y+l546v5aKDXG5cdHJldHVybiBmdW5jdGlvbiAoX3NvdXJjZSwgX2NvbnRleHQpIHtcbiAgICBzb3VyY2UgPSBfc291cmNlO1xuXHRcdHRva2VucyA9IHRva2VuaXplKF9zb3VyY2UsICc9PD4hKy0qJnwvJV4nLCAnPTw+JnwnKTtcblx0XHR0b2tlbl9uciA9IDA7XG5cdFx0Y29udGV4dCA9IF9jb250ZXh0O1xuXHRcdGFkdmFuY2UoKTtcblx0XHR2YXIgcyA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIihlbmQpXCIpO1xuXHRcdHJldHVybiBzO1xuXHR9O1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IG1ha2VfcGFyc2UoKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8v5qC55o2u5Y+Y6YeP5Y+KIHZtIOehruWumuWPmOmHj+aJgOWxnueahOecn+atoyB2bVxudmFyIHJlZm9ybVNjb3BlID0gZnVuY3Rpb24gKHZtLCBwYXRoKSB7XG4gIHZhciBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aChwYXRoKTtcbiAgdmFyIGN1ciA9IHZtLCBsb2NhbCA9IHBhdGhzWzBdO1xuICB2YXIgYXNzLCBjdXJWbSA9IGN1cjtcblxuICB3aGlsZShjdXIpIHtcbiAgICBjdXJWbSA9IGN1cjtcbiAgICBhc3MgPSBjdXIuX2Fzc2lnbm1lbnRzO1xuICAgIGlmKCBjdXIuX19yZXBlYXQpIHtcbiAgICAgIGlmIChhc3MgJiYgYXNzLmxlbmd0aCkge1xuICAgICAgICAvLyDlhbflkI0gcmVwZWF0IOS4jeS8muebtOaOpeafpeaJvuiHqui6q+S9nOeUqOWfn1xuICAgICAgICBpZiAobG9jYWwgPT09ICckaW5kZXgnIHx8IGxvY2FsID09PSAnJHBhcmVudCcpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIGlmIChsb2NhbCA9PT0gYXNzWzBdKSB7XG4gICAgICAgICAgLy/kv67mraNrZXlcbiAgICAgICAgICBpZiAocGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBwYXRoc1swXSA9ICckZGF0YSc7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdGhzLnNoaWZ0KClcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8v5Yy/5ZCNIHJlcGVhdFxuICAgICAgICBpZiAocGF0aCBpbiBjdXIpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjdXIgPSBjdXIuJHBhcmVudDtcbiAgfVxuXG4gIHJldHVybiB7IHZtOiBjdXJWbSwgcGF0aDogcGF0aHMuam9pbignLicpIH1cbn07XG5cblxuZXhwb3J0cy5yZWZvcm1TY29wZSA9IHJlZm9ybVNjb3BlO1xuIiwidmFyIHRva2VuUmVnID0gL3t7KHsoW159XFxuXSspfXxbXn1cXG5dKyl9fS9nO1xuXG4vL+Wtl+espuS4suS4reaYr+WQpuWMheWQq+aooeadv+WNoOS9jeespuagh+iusFxuZnVuY3Rpb24gaGFzVG9rZW4oc3RyKSB7XG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIHJldHVybiBzdHIgJiYgdG9rZW5SZWcudGVzdChzdHIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRva2VuKHZhbHVlKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgdGV4dE1hcCA9IFtdXG4gICAgLCBzdGFydCA9IDBcbiAgICAsIHZhbCwgdG9rZW5cbiAgICA7XG4gIFxuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICBcbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cbiAgICBcbiAgICB0b2tlbiA9IHtcbiAgICAgIGVzY2FwZTogIXZhbFsyXVxuICAgICwgcGF0aDogKHZhbFsyXSB8fCB2YWxbMV0pLnRyaW0oKVxuICAgICwgcG9zaXRpb246IHRleHRNYXAubGVuZ3RoXG4gICAgLCB0ZXh0TWFwOiB0ZXh0TWFwXG4gICAgfTtcbiAgICBcbiAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcbiAgICBcbiAgICBzdGFydCA9IHRva2VuUmVnLmxhc3RJbmRleDtcbiAgfVxuICBcbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cbiAgXG4gIHRva2Vucy50ZXh0TWFwID0gdGV4dE1hcDtcbiAgXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydHMuaGFzVG9rZW4gPSBoYXNUb2tlbjtcblxuZXhwb3J0cy5wYXJzZVRva2VuID0gcGFyc2VUb2tlbjsiLCJcInVzZSBzdHJpY3RcIjtcblxuLy91dGlsc1xuLy8tLS1cblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnQ7XG5cbnZhciBrZXlQYXRoUmVnID0gLyg/OlxcLnxcXFspL2dcbiAgLCBicmEgPSAvXFxdL2dcbiAgO1xuXG4vL+WwhiBrZXlQYXRoIOi9rOS4uuaVsOe7hOW9ouW8j1xuLy9wYXRoLmtleSwgcGF0aFtrZXldIC0tPiBbJ3BhdGgnLCAna2V5J11cbmZ1bmN0aW9uIHBhcnNlS2V5UGF0aChrZXlQYXRoKXtcbiAgcmV0dXJuIGtleVBhdGgucmVwbGFjZShicmEsICcnKS5zcGxpdChrZXlQYXRoUmVnKTtcbn1cblxuLyoqXG4gKiDlkIjlubblr7nosaFcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2RlZXA9ZmFsc2VdIOaYr+WQpua3seW6puWQiOW5tlxuICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0Li4uXSDmnaXmupDlr7nosaFcbiAqIEByZXR1cm5zIHtPYmplY3R9IOWQiOW5tuWQjueahCB0YXJnZXQg5a+56LGhXG4gKi9cbmZ1bmN0aW9uIGV4dGVuZCgvKiBkZWVwLCB0YXJnZXQsIG9iamVjdC4uLiAqLykge1xuICB2YXIgb3B0aW9uc1xuICAgICwgbmFtZSwgc3JjLCBjb3B5LCBjb3B5SXNBcnJheSwgY2xvbmVcbiAgICAsIHRhcmdldCA9IGFyZ3VtZW50c1swXSB8fCB7fVxuICAgICwgaSA9IDFcbiAgICAsIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGhcbiAgICAsIGRlZXAgPSBmYWxzZVxuICAgIDtcblxuICAvLyBIYW5kbGUgYSBkZWVwIGNvcHkgc2l0dWF0aW9uXG4gIGlmICh0eXBlb2YgdGFyZ2V0ID09PSBcImJvb2xlYW5cIikge1xuICAgIGRlZXAgPSB0YXJnZXQ7XG5cbiAgICAvLyBza2lwIHRoZSBib29sZWFuIGFuZCB0aGUgdGFyZ2V0XG4gICAgdGFyZ2V0ID0gYXJndW1lbnRzWyBpIF0gfHwge307XG4gICAgaSsrO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2Ugd2hlbiB0YXJnZXQgaXMgYSBzdHJpbmcgb3Igc29tZXRoaW5nIChwb3NzaWJsZSBpbiBkZWVwIGNvcHkpXG4gIGlmICh0eXBlb2YgdGFyZ2V0ICE9PSBcIm9iamVjdFwiICYmICF1dGlscy5pc0Z1bmN0aW9uKHRhcmdldCkpIHtcbiAgICB0YXJnZXQgPSB7fTtcbiAgfVxuXG4gIGZvciAoIDsgaSA8IGxlbmd0aDsgaSsrICkge1xuICAgIC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICBpZiAoIChvcHRpb25zID0gYXJndW1lbnRzWyBpIF0pICE9IG51bGwgKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG4gICAgICBmb3IgKCBuYW1lIGluIG9wdGlvbnMgKSB7XG4gICAgICAgIC8vYW5kcm9pZCAyLjMgYnJvd3NlciBjYW4gZW51bSB0aGUgcHJvdG90eXBlIG9mIGNvbnN0cnVjdG9yLi4uXG4gICAgICAgIGlmKG5hbWUgIT09ICdwcm90b3R5cGUnKXtcbiAgICAgICAgICBzcmMgPSB0YXJnZXRbIG5hbWUgXTtcbiAgICAgICAgICBjb3B5ID0gb3B0aW9uc1sgbmFtZSBdO1xuXG5cbiAgICAgICAgICAvLyBSZWN1cnNlIGlmIHdlJ3JlIG1lcmdpbmcgcGxhaW4gb2JqZWN0cyBvciBhcnJheXNcbiAgICAgICAgICBpZiAoIGRlZXAgJiYgY29weSAmJiAoIHV0aWxzLmlzUGxhaW5PYmplY3QoY29weSkgfHwgKGNvcHlJc0FycmF5ID0gdXRpbHMuaXNBcnJheShjb3B5KSkgKSApIHtcblxuICAgICAgICAgICAgLy8gUHJldmVudCBuZXZlci1lbmRpbmcgbG9vcFxuICAgICAgICAgICAgaWYgKCB0YXJnZXQgPT09IGNvcHkgKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCBjb3B5SXNBcnJheSApIHtcbiAgICAgICAgICAgICAgY29weUlzQXJyYXkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNBcnJheShzcmMpID8gc3JjIDogW107XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzUGxhaW5PYmplY3Qoc3JjKSA/IHNyYyA6IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZXZlciBtb3ZlIG9yaWdpbmFsIG9iamVjdHMsIGNsb25lIHRoZW1cbiAgICAgICAgICAgIHRhcmdldFsgbmFtZSBdID0gZXh0ZW5kKCBkZWVwLCBjbG9uZSwgY29weSk7XG5cbiAgICAgICAgICAgIC8vIERvbid0IGJyaW5nIGluIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2UgaWYgKCAhdXRpbHMuaXNVbmRlZmluZWQoY29weSkgJiYgdHlwZW9mIHRhcmdldCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIC8v5LiA5Lqb5oOF5LiLLCDmr5TlpoIgZmlyZWZveCDkuIvnu5nlrZfnrKbkuLLlr7nosaHotYvlgLzml7bkvJrlvILluLhcbiAgICAgICAgICAgIHRhcmdldFtuYW1lXSA9IGNvcHk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBtb2RpZmllZCBvYmplY3RcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcbiAgZnVuY3Rpb24gRigpIHt9XG4gIEYucHJvdG90eXBlID0gbztcbiAgcmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgZGVlcEdldCA9IGZ1bmN0aW9uIChrZXlTdHIsIG9iaikge1xuICB2YXIgY2hhaW4sIGN1ciA9IG9iaiwga2V5O1xuICBpZihrZXlTdHIpe1xuICAgIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cik7XG4gICAgZm9yKHZhciBpID0gMCwgbCA9IGNoYWluLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAga2V5ID0gY2hhaW5baV07XG4gICAgICBpZihjdXIpe1xuICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjdXI7XG59XG5cbi8vaHRtbCDkuK3lsZ7mgKflkI3kuI3ljLrliIblpKflsI/lhpksIOW5tuS4lOS8muWFqOmDqOi9rOaIkOWwj+WGmS5cbi8v6L+Z6YeM5Lya5bCG6L+e5a2X56ym5YaZ5rOV6L2s5oiQ6am85bOw5byPXG4vL2F0dHItbmFtZSAtLT4gYXR0ck5hbWVcbi8vYXR0ci0tbmFtZSAtLT4gYXR0ci1uYW1lXG52YXIgaHlwaGVuc1JlZyA9IC8tKC0/KShbYS16XSkvaWc7XG52YXIgaHlwaGVuVG9DYW1lbCA9IGZ1bmN0aW9uKGF0dHJOYW1lKSB7XG4gIHJldHVybiBhdHRyTmFtZS5yZXBsYWNlKGh5cGhlbnNSZWcsIGZ1bmN0aW9uKHMsIGRhc2gsIGNoYXIpIHtcbiAgICByZXR1cm4gZGFzaCA/IGRhc2ggKyBjaGFyIDogY2hhci50b1VwcGVyQ2FzZSgpO1xuICB9KVxufVxuXG52YXIgdXRpbHMgPSB7XG4gIG5vb3A6IGZ1bmN0aW9uICgpe31cbiwgaWU6ICEhZG9jLmF0dGFjaEV2ZW50XG5cbiwgaXNPYmplY3Q6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsICE9PSBudWxsO1xuICB9XG5cbiwgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuLCBpc0Z1bmN0aW9uOiBmdW5jdGlvbiAodmFsKXtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ2Z1bmN0aW9uJztcbiAgfVxuXG4sIGlzQXJyYXk6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICBpZih1dGlscy5pZSl7XG4gICAgICAvL0lFIDkg5Y+K5Lul5LiLIElFIOi3qOeql+WPo+ajgOa1i+aVsOe7hFxuICAgICAgcmV0dXJuIHZhbCAmJiB2YWwuY29uc3RydWN0b3IgKyAnJyA9PT0gQXJyYXkgKyAnJztcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCk7XG4gICAgfVxuICB9XG4sIGlzTnVtZXJpYzogZnVuY3Rpb24odmFsKSB7XG4gICAgcmV0dXJuICF1dGlscy5pc0FycmF5KHZhbCkgJiYgdmFsIC0gcGFyc2VGbG9hdCh2YWwpICsgMSA+PSAwO1xuICB9XG4gIC8v566A5Y2V5a+56LGh55qE566A5piT5Yik5patXG4sIGlzUGxhaW5PYmplY3Q6IGZ1bmN0aW9uIChvKXtcbiAgICBpZiAoIW8gfHwgKHt9KS50b1N0cmluZy5jYWxsKG8pICE9PSAnW29iamVjdCBPYmplY3RdJyB8fCBvLm5vZGVUeXBlIHx8IG8gPT09IG8ud2luZG93KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvL+WHveaVsOWIh+mdoi4gb3JpRm4g5Y6f5aeL5Ye95pWwLCBmbiDliIfpnaLooaXlhYXlh73mlbBcbiAgLy/liY3pnaLnmoTlh73mlbDov5Tlm57lgLzkvKDlhaUgYnJlYWtDaGVjayDliKTmlq0sIGJyZWFrQ2hlY2sg6L+U5Zue5YC85Li655yf5pe25LiN5omn6KGM5YiH6Z2i6KGl5YWF55qE5Ye95pWwXG4sIGJlZm9yZUZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuLCBhZnRlckZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfVxuXG4sIHBhcnNlS2V5UGF0aDogcGFyc2VLZXlQYXRoXG5cbiwgZGVlcFNldDogZnVuY3Rpb24gKGtleVN0ciwgdmFsdWUsIG9iaikge1xuICAgIGlmKGtleVN0cil7XG4gICAgICB2YXIgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKVxuICAgICAgICAsIGN1ciA9IG9ialxuICAgICAgICA7XG4gICAgICBjaGFpbi5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgaSkge1xuICAgICAgICBpZihpID09PSBjaGFpbi5sZW5ndGggLSAxKXtcbiAgICAgICAgICBjdXJba2V5XSA9IHZhbHVlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBpZihjdXIgJiYgY3VyLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBjdXJba2V5XSA9IHt9O1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIGV4dGVuZChvYmosIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuLCBleHRlbmQ6IGV4dGVuZFxuLCBjcmVhdGU6IGNyZWF0ZVxuLCB0b0FycmF5OiBmdW5jdGlvbihhcnJMaWtlKSB7XG4gICAgdmFyIGFyciA9IFtdO1xuXG4gICAgdHJ5e1xuICAgICAgLy9JRSA4IOWvuSBkb20g5a+56LGh5Lya5oql6ZSZXG4gICAgICBhcnIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJMaWtlKVxuICAgIH1jYXRjaCAoZSl7XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJyTGlrZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgYXJyW2ldID0gYXJyTGlrZVtpXVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyO1xuICB9LFxuICBoeXBoZW5Ub0NhbWVsOiBoeXBoZW5Ub0NhbWVsXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHV0aWxzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBldmFsdWF0ZSA9IHJlcXVpcmUoJy4vZXZhbC5qcycpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIHJlZm9ybVNjb3BlID0gcmVxdWlyZSgnLi9zY29wZScpLnJlZm9ybVNjb3BlXG4gIDtcblxudmFyIHN1bW1hcnlDYWNoZSA9IHt9O1xuXG4vKipcbiAqIOavj+S4qiBkaXJlY3RpdmUg5a+55bqU5LiA5LiqIHdhdGNoZXJcbiAqIEBwYXJhbSB7QmVlfSB2bSAgZGlyZWN0aXZlIOaJgOWkhOeahOeOr+Wig1xuICogQHBhcmFtIHtEaXJlY3RpdmV9IGRpclxuICovXG5mdW5jdGlvbiBXYXRjaGVyKHZtLCBkaXIpIHtcbiAgdmFyIHJlZm9ybWVkLCBwYXRoLCBjdXJWbSA9IHZtLCB3YXRjaGVycyA9IFtdO1xuICB2YXIgc3VtbWFyeSA9IHN1bW1hcnlDYWNoZVtkaXIucGF0aF1cblxuICBkaXIud2F0Y2hlciA9IHRoaXM7XG5cbiAgdGhpcy5zdGF0ZSA9IDE7XG4gIHRoaXMuZGlyID0gZGlyO1xuICB0aGlzLnZtID0gdm07XG4gIHRoaXMud2F0Y2hlcnMgPSBbXTtcblxuICB0aGlzLnZhbCA9IE5hTjtcblxuICBkaXIucGFyc2UoKTtcblxuICBpZighc3VtbWFyeSB8fCBzdW1tYXJ5Ll90eXBlICE9PSBkaXIudHlwZSl7XG4gICAgc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkoZGlyLmFzdCk7XG4gICAgc3VtbWFyeS5fdHlwZSA9IGRpci50eXBlO1xuICAgIHN1bW1hcnlDYWNoZVtkaXIucGF0aF0gPSBzdW1tYXJ5O1xuICB9XG4gIGRpci5zdW1tYXJ5ID0gc3VtbWFyeVxuXG4gIC8v5bCG6K+lIHdhdGNoZXIg5LiO5q+P5LiA5Liq5bGe5oCn5bu656uL5byV55So5YWz57O7XG4gIGZvcih2YXIgaSA9IDAsIGwgPSBkaXIuc3VtbWFyeS5wYXRocy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICByZWZvcm1lZCA9IHJlZm9ybVNjb3BlKHZtLCBkaXIuc3VtbWFyeS5wYXRoc1tpXSlcbiAgICBjdXJWbSA9IHJlZm9ybWVkLnZtXG4gICAgcGF0aCA9IHJlZm9ybWVkLnBhdGhcbiAgICBpZihkaXIud2F0Y2gpIHtcbiAgICAgIGN1clZtLl93YXRjaGVyc1twYXRoXSA9IGN1clZtLl93YXRjaGVyc1twYXRoXSB8fCBbXTtcbiAgICAgIGN1clZtLl93YXRjaGVyc1twYXRoXS5wdXNoKHRoaXMpO1xuICAgICAgd2F0Y2hlcnMgPSBjdXJWbS5fd2F0Y2hlcnNbcGF0aF07XG4gICAgfWVsc2V7XG4gICAgICB3YXRjaGVycyA9IFt0aGlzXTtcbiAgICB9XG4gICAgLy/lsIbmr4/kuKoga2V5IOWvueW6lOeahCB3YXRjaGVycyDpg73loZ7ov5vmnaVcbiAgICB0aGlzLndhdGNoZXJzLnB1c2goIHdhdGNoZXJzICk7XG4gIH1cblxuICAvL+aYr+WQpuWcqOWIneWni+WMluaXtuabtOaWsFxuICBkaXIuaW1tZWRpYXRlICE9PSBmYWxzZSAmJiB0aGlzLnVwZGF0ZSgpO1xufVxuXG4vL+agueaNruihqOi+vuW8j+enu+mZpOW9k+WJjSB2bSDkuK3nmoQgd2F0Y2hlclxuZnVuY3Rpb24gdW53YXRjaCAodm0sIGV4cCwgY2FsbGJhY2spIHtcbiAgdmFyIHN1bW1hcnk7XG4gIHRyeSB7XG4gICAgc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkocGFyc2UoZXhwKSlcbiAgfWNhdGNoIChlKXtcbiAgICBlLm1lc3NhZ2UgPSAnU3ludGF4RXJyb3IgaW4gXCInICsgZXhwICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG4gIHN1bW1hcnkucGF0aHMuZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgdmFyIHdhdGNoZXJzID0gdm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdLCB1cGRhdGU7XG5cbiAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICB1cGRhdGUgPSB3YXRjaGVyc1tpXS5kaXIudXBkYXRlO1xuICAgICAgaWYodXBkYXRlID09PSBjYWxsYmFjayB8fCB1cGRhdGUuX29yaWdpbkZuID09PSBjYWxsYmFjayl7XG4gICAgICAgIHdhdGNoZXJzW2ldLnVud2F0Y2goKVxuICAgICAgfVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gYWRkV2F0Y2hlcihkaXIpIHtcbiAgaWYoZGlyLnBhdGgpIHtcbiAgICByZXR1cm4gbmV3IFdhdGNoZXIodGhpcywgZGlyKTtcbiAgfVxufVxuXG5XYXRjaGVyLnVud2F0Y2ggPSB1bndhdGNoO1xuV2F0Y2hlci5hZGRXYXRjaGVyID0gYWRkV2F0Y2hlcjtcblxuLy/ojrflj5bmn5Aga2V5UGF0aCDlrZDot6/lvoTnmoQgd2F0Y2hlcnNcbldhdGNoZXIuZ2V0V2F0Y2hlcnMgPSBmdW5jdGlvbiBnZXRXYXRjaGVycyh2bSwga2V5UGF0aCkge1xuICB2YXIgX3dhdGNoZXJzID0gdm0uX3dhdGNoZXJzLCB3YXRjaGVycyA9IFtdO1xuICB2YXIgcG9pbnQ7XG4gIGZvcih2YXIga2V5IGluIF93YXRjaGVycykge1xuICAgIHBvaW50ID0ga2V5LmNoYXJBdChrZXlQYXRoLmxlbmd0aCk7XG4gICAgaWYoa2V5LmluZGV4T2Yoa2V5UGF0aCkgPT09IDAgJiYgKHBvaW50ID09PSAnLicpKSB7XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdChfd2F0Y2hlcnNba2V5XSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHdhdGNoZXJzXG59XG5cbmZ1bmN0aW9uIHdhdGNoZXJVcGRhdGUgKHZhbCkge1xuICB2YXIgb2xkVmFsdWUgPSB0aGlzLnZhbDtcbiAgdGhpcy52YWwgPSB2YWw7XG4gIHRoaXMuZGlyLnVwZGF0ZSh2YWwsIG9sZFZhbHVlKTtcbn1cblxudXRpbHMuZXh0ZW5kKFdhdGNoZXIucHJvdG90eXBlLCB7XG4gIC8v6KGo6L6+5byP5omn6KGM5bm25pu05pawIHZpZXdcbiAgdXBkYXRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICwgbmV3VmFsXG4gICAgICA7XG5cbiAgICBpZih0aGlzLl9oaWRlKSB7XG4gICAgICB0aGlzLl9uZWVkVXBkYXRlID0gdHJ1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV3VmFsID0gdGhpcy5kaXIuZ2V0VmFsdWUodGhpcy52bSk7XG5cbiAgICAvL+eugOWNlei/h+a7pOmHjeWkjeabtOaWsFxuICAgIGlmKG5ld1ZhbCAhPT0gdGhpcy52YWwgfHwgdXRpbHMuaXNPYmplY3QobmV3VmFsKSl7XG4gICAgICBpZihuZXdWYWwgJiYgbmV3VmFsLnRoZW4pIHtcbiAgICAgICAgLy9hIHByb21pc2VcbiAgICAgICAgbmV3VmFsLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoYXQsIHZhbCk7XG4gICAgICAgIH0pO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGlzLCBuZXdWYWwpO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgLy/np7vpmaRcbiAgdW53YXRjaDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXJzKSB7XG4gICAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKHdhdGNoZXJzW2ldID09PSB0aGlzKXtcbiAgICAgICAgICBpZih0aGlzLnN0YXRlKXtcbiAgICAgICAgICAgIHdhdGNoZXJzW2ldLmRpci51bkxpbmsoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpXG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyXG4iXX0=
