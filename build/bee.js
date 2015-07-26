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
  //每个构造函数都有自己的 directives ,components, filters 引用, 继承自父构造函数
  //默认情况下, 更新父构造函数 directive, components, filters 会同步更新子构造函数. 反之不行
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
      instance = new this(el, props);
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

    //b-attr
    if(this.dirName === this.type) {
      for(var attr in val) {
        setAttr(el, attr, val[attr]);

        delete this.attrs[attr];

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
        this.textMap[this.position] = val;
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
    var comp;
    var dirs, $data = {};
    var Comp = cstr.getComponent(this.path)
    var statics = {};

    if(Comp) {

      //直接 `Bee.mount` 一个组件
      if(Comp === cstr && vm.__mountcall || el.bee && el.bee === vm) {
        return;
      }

      dirs = this.dirs.filter(function (dir) {
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
          $data[comPath] = getProperty(dir)
          dir.el.removeAttribute(dir.dirName)
        }

        //监听父组件更新, 同步数据
        vm.$watch(curPath, function (val) {
          if(comp){
            val = getProperty(dir);
            comPath ? comp.$set(comPath, val) : comp.$set(val);
          }
        })
      });

      //组件内容属于其容器
      vm.__links = vm.__links.concat(checkBinding.walk.call(vm, el.childNodes));

      statics = domUtils.getAttrs(el)

      //排除指令属性
      var _dir;
      for(var attr in statics) {
        _dir = utils.camelToHyphen(attr);
        _dir = _dir.slice(vm.constructor.prefix.length)

        if(_dir in vm.constructor.directives) {
          delete statics[attr]
        }
      }

      this.component = comp = new Comp({
        $el: el,
        $isReplace: true,

        $data: utils.extend(true, {}, $data, statics)
      });
      el.bee = comp;

      return comp;
    }else{
      console.error('Component: ' + this.path + ' not defined!');
    }
  }
};

//如果组件的属性只有一个表达式, 则保持该表达式的数据类型
function getProperty(dir) {
  var textMap = dir.textMap, val
  val = textMap && textMap.length > 1 ? textMap.join('') : textMap[0]

  return utils.isPlainObject(val) ? utils.extend(true, {}, val) : val;
}

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
        dashKey = utils.camelToHyphen(key);

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

//驼峰转连接符
var camelReg = /([A-Z])/g;
var camelToHyphen = function(key) {
  return key.replace(camelReg, function (upperChar) {
    return '-' + upperChar.toLowerCase();
  })
}

var utils = {
  noop: function (){}
, ie: (function(){
    var undef,
        v = 3,
        div = doc.createElement('div'),
        all = div.getElementsByTagName('i');

    while (
      div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->',
      all[0]
    );

    return v > 4 ? v : undef;

  }())

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
, hyphenToCamel: hyphenToCamel
, camelToHyphen: camelToHyphen
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY2xhc3MuanMiLCJzcmMvZGlyZWN0aXZlcy9jb21wb25lbnQuanMiLCJzcmMvZGlyZWN0aXZlcy9jb250ZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvaWYuanMiLCJzcmMvZGlyZWN0aXZlcy9pbmRleC5qcyIsInNyYy9kaXJlY3RpdmVzL21vZGVsLmpzIiwic3JjL2RpcmVjdGl2ZXMvb24uanMiLCJzcmMvZGlyZWN0aXZlcy9yZWYuanMiLCJzcmMvZGlyZWN0aXZlcy9yZXBlYXQuanMiLCJzcmMvZGlyZWN0aXZlcy9zdHlsZS5qcyIsInNyYy9kb20tdXRpbHMuanMiLCJzcmMvZW52LmpzIiwic3JjL2V2YWwuanMiLCJzcmMvZXZlbnQtYmluZC5qcyIsInNyYy9wYXJzZS5qcyIsInNyYy9zY29wZS5qcyIsInNyYy90b2tlbi5qcyIsInNyYy91dGlscy5qcyIsInNyYy93YXRjaGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFlBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgZGlyZWN0aXZlID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi9kb20tdXRpbHMuanMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4vY2hlY2stYmluZGluZy5qcycpXG4gICwgc2NvcGUgPSByZXF1aXJlKCcuL3Njb3BlJylcblxuICAsIERpciA9IGRpcmVjdGl2ZS5EaXJlY3RpdmVcbiAgO1xuXG5cbnZhciBpc09iamVjdCA9IHV0aWxzLmlzT2JqZWN0XG4gICwgaXNQbGFpbk9iamVjdCA9IHV0aWxzLmlzUGxhaW5PYmplY3RcbiAgLCBwYXJzZUtleVBhdGggPSB1dGlscy5wYXJzZUtleVBhdGhcbiAgLCBkZWVwU2V0ID0gdXRpbHMuZGVlcFNldFxuICAsIGV4dGVuZCA9IHV0aWxzLmV4dGVuZFxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8v6K6+572uIGRpcmVjdGl2ZSDliY3nvIBcbmZ1bmN0aW9uIHNldFByZWZpeChuZXdQcmVmaXgpIHtcbiAgaWYobmV3UHJlZml4KXtcbiAgICB0aGlzLnByZWZpeCA9IG5ld1ByZWZpeDtcbiAgfVxufVxuXG4vL1RPRE8g5riF55CG6L+Z5LiqXG52YXIgbWVyZ2VQcm9wcyA9IHtcbiAgJGRhdGE6IDFcbn07XG5cbnZhciBsaWZlQ3ljbGVzID0ge1xuICAkYmVmb3JlSW5pdDogdXRpbHMubm9vcFxuLCAkYWZ0ZXJJbml0OiB1dGlscy5ub29wXG4sICRiZWZvcmVVcGRhdGU6IHV0aWxzLm5vb3BcbiwgJGFmdGVyVXBkYXRlOiB1dGlscy5ub29wXG4sICRiZWZvcmVEZXN0cm95OiB1dGlscy5ub29wXG4sICRhZnRlckRlc3Ryb3k6IHV0aWxzLm5vb3Bcbn07XG5cbi8qKlxuICog5p6E6YCg5Ye95pWwXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfEVsZW1lbnR9IFt0cGxdIOaooeadvy4g562J5ZCM5LqOIHByb3BzLiR0cGxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvcHNdIOWxnuaApy/mlrnms5VcbiAqL1xuZnVuY3Rpb24gQmVlKHRwbCwgcHJvcHMpIHtcbiAgaWYoaXNQbGFpbk9iamVjdCh0cGwpKSB7XG4gICAgcHJvcHMgPSB0cGw7XG4gIH1lbHNle1xuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgaWYodHBsKSB7XG4gICAgICBwcm9wcy4kdHBsID0gdHBsO1xuICAgIH1cbiAgfVxuXG4gIHZhciBkZWZhdWx0cyA9IHtcbiAgICAvLyQg5byA5aS055qE5piv5YWx5pyJ5bGe5oCnL+aWueazlVxuICAgICRkYXRhOiBleHRlbmQodHJ1ZSwge30sIHRoaXMuY29uc3RydWN0b3IuZGVmYXVsdHMpXG4gICwgJHJlZnM6IHt9XG4gICwgJG1peGluczogW11cblxuICAsICRlbDogdGhpcy4kZWwgfHwgbnVsbFxuICAsICR0cGw6IHRoaXMuJHRwbCB8fCAnPGRpdj57ez4gJGNvbnRlbnQgfX08L2Rpdj4nXG4gICwgJGNvbnRlbnQ6IHRoaXMuJGNvbnRlbnQgfHwgbnVsbFxuXG4gICwgJGlzUmVwbGFjZTogZmFsc2VcbiAgLCAkcGFyZW50OiBudWxsXG4gICwgJHJvb3Q6IHRoaXNcblxuICAgIC8v56eB5pyJ5bGe5oCnL+aWueazlVxuICAsIF93YXRjaGVyczoge31cbiAgLCBfYXNzaWdubWVudHM6IG51bGwvL+W9k+WJjSB2bSDnmoTliKvlkI1cbiAgLCBfcmVsYXRpdmVQYXRoOiBbXVxuICAsIF9fbGlua3M6IFtdXG4gICwgX2lzUmVuZGVyZWQ6IGZhbHNlXG4gIH07XG5cbiAgdmFyIG1peGlucyA9IFtkZWZhdWx0c10uY29uY2F0KHRoaXMuJG1peGlucykuY29uY2F0KHByb3BzLiRtaXhpbnMpLmNvbmNhdChbcHJvcHNdKVxuXG4gIG1peGlucy5mb3JFYWNoKGZ1bmN0aW9uKG1peGluKSB7XG4gICAgdmFyIHByb3A7XG4gICAgZm9yKHZhciBwcm9wS2V5IGluIG1peGluKSB7XG4gICAgICBpZihtaXhpbi5oYXNPd25Qcm9wZXJ0eShwcm9wS2V5KSkge1xuICAgICAgICBpZiAoKHByb3BLZXkgaW4gbWVyZ2VQcm9wcykgJiYgaXNPYmplY3QobWl4aW5bcHJvcEtleV0pKSB7XG4gICAgICAgICAgLy/kv53mjIHlr7nkvKDlhaXlsZ7mgKfnmoTlvJXnlKhcbiAgICAgICAgICAvL21lcmdlUHJvcHMg5Lit55qE5bGe5oCn5Lya6KKr6buY6K6k5YC85omp5bGVXG4gICAgICAgICAgcHJvcCA9IGV4dGVuZCh7fSwgdGhpc1twcm9wS2V5XSwgbWl4aW5bcHJvcEtleV0pXG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IGV4dGVuZChtaXhpbltwcm9wS2V5XSwgcHJvcClcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wS2V5IGluIGxpZmVDeWNsZXMpIHtcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gdXRpbHMuYWZ0ZXJGbih0aGlzW3Byb3BLZXldLCBtaXhpbltwcm9wS2V5XSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gbWl4aW5bcHJvcEtleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0uYmluZCh0aGlzKSlcblxuICBleHRlbmQodGhpcywgdGhpcy4kZGF0YSk7XG5cbiAgcmVzb2x2ZVRwbC5jYWxsKHRoaXMpO1xuXG4gIHRoaXMuJGJlZm9yZUluaXQoKVxuICB0aGlzLiRlbC5iZWUgPSB0aGlzO1xuXG4gIC8vX19saW5rcyDljIXlkKvkuoYgJGVsIOS4i+aJgOacieeahOe7keWumuW8leeUqFxuICB0aGlzLl9fbGlua3MgPSB0aGlzLl9fbGlua3MuY29uY2F0KCBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMsIHRoaXMuJGVsKSApO1xuXG4gIHRoaXMuX2lzUmVuZGVyZWQgPSB0cnVlO1xuICB0aGlzLiRhZnRlckluaXQoKTtcbn1cblxuLy/pnZnmgIHlsZ7mgKdcbmV4dGVuZChCZWUsIHtleHRlbmQ6IHV0aWxzLmFmdGVyRm4oQ2xhc3MuZXh0ZW5kLCB1dGlscy5ub29wLCBmdW5jdGlvbihzdWIpIHtcbiAgLy/mr4/kuKrmnoTpgKDlh73mlbDpg73mnInoh6rlt7HnmoQgZGlyZWN0aXZlcyAsY29tcG9uZW50cywgZmlsdGVycyDlvJXnlKgsIOe7p+aJv+iHqueItuaehOmAoOWHveaVsFxuICAvL+m7mOiupOaDheWGteS4iywg5pu05paw54i25p6E6YCg5Ye95pWwIGRpcmVjdGl2ZSwgY29tcG9uZW50cywgZmlsdGVycyDkvJrlkIzmraXmm7TmlrDlrZDmnoTpgKDlh73mlbAuIOWPjeS5i+S4jeihjFxuICBzdWIuZGlyZWN0aXZlcyA9IGV4dGVuZChjcmVhdGUodGhpcy5kaXJlY3RpdmVzKSwgc3ViLmRpcmVjdGl2ZXMpO1xuICBzdWIuY29tcG9uZW50cyA9IGV4dGVuZChjcmVhdGUodGhpcy5jb21wb25lbnRzKSwgc3ViLmNvbXBvbmVudHMpO1xuICBzdWIuZmlsdGVycyA9IGV4dGVuZChjcmVhdGUodGhpcy5maWx0ZXJzKSwgc3ViLmZpbHRlcnMpO1xuXG4gIHN1Yi5kZWZhdWx0cyA9IGV4dGVuZCh0cnVlLCB7fSwgdGhpcy5kZWZhdWx0cywgc3ViLmRlZmF1bHRzKTtcbn0pLCB1dGlsczogdXRpbHN9LCBEaXIsIENvbSwge1xuICBzZXRQcmVmaXg6IHNldFByZWZpeFxuLCBkaXJlY3RpdmU6IGRpcmVjdGl2ZS5kaXJlY3RpdmVcbiwgcHJlZml4OiAnJ1xuLCBkb2M6IGRvY1xuLCBkaXJlY3RpdmVzOiB7fVxuLCBjb21wb25lbnRzOiB7fVxuLCBkZWZhdWx0czoge31cbiwgZmlsdGVyczoge1xuICAgIC8vYnVpbGQgaW4gZmlsdGVyXG4gICAganNvbjogZnVuY3Rpb24ob2JqLCByZXBsYWNlciwgc3BhY2UpIHtcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIHJlcGxhY2VyLCBzcGFjZSkgfVxuICB9XG4sIGZpbHRlcjogZnVuY3Rpb24oZmlsdGVyTmFtZSwgZmlsdGVyKSB7XG4gICAgdGhpcy5maWx0ZXJzW2ZpbHRlck5hbWVdID0gZmlsdGVyO1xuICB9XG4sIG1vdW50OiBmdW5jdGlvbihpZCwgcHJvcHMpIHtcbiAgICB2YXIgZWwgPSBpZC5ub2RlVHlwZSA/IGlkIDogZG9jLmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICB2YXIgaW5zdGFuY2U7XG4gICAgdmFyIGRpcnMgPSBkaXJlY3RpdmUuZ2V0RGlycyhlbCwgdGhpcyk7XG4gICAgdmFyIENvbXAsIGRpcjtcblxuICAgIGRpciA9IGRpcnMuZmlsdGVyKGZ1bmN0aW9uKGRpcikge1xuICAgICAgcmV0dXJuICBkaXIudHlwZSA9PT0gJ3RhZycgfHwgZGlyLnR5cGUgPT09ICdjb21wb25lbnQnXG4gICAgfSlbMF07XG5cbiAgICBpZihkaXIpIHtcbiAgICAgIENvbXAgPSB0aGlzLmdldENvbXBvbmVudChkaXIucGF0aClcbiAgICB9XG5cbiAgICBwcm9wcyA9IHByb3BzIHx8IHt9O1xuICAgIGlmKENvbXApIHtcbiAgICAgIHByb3BzLiRkYXRhID0gZXh0ZW5kKGRvbVV0aWxzLmdldEF0dHJzKGVsKSwgcHJvcHMuJGRhdGEpXG4gICAgICBpbnN0YW5jZSA9IG5ldyBDb21wKGV4dGVuZCh7JGVsOiBlbCwgJGlzUmVwbGFjZTogdHJ1ZSwgX19tb3VudGNhbGw6IHRydWV9LCBwcm9wcykpXG4gICAgfWVsc2V7XG4gICAgICBpbnN0YW5jZSA9IG5ldyB0aGlzKGVsLCBwcm9wcyk7XG4gICAgfVxuICAgIHJldHVybiBpbnN0YW5jZVxuICB9XG59KTtcblxuXG5CZWUuc2V0UHJlZml4KCdiLScpO1xuXG4vL+WGhee9riBkaXJlY3RpdmVcbmZvcih2YXIgZGlyIGluIGRpcnMpIHtcbiAgQmVlLmRpcmVjdGl2ZShkaXIsIGRpcnNbZGlyXSk7XG59XG5cbi8v5a6e5L6L5pa55rOVXG4vLy0tLS1cbmV4dGVuZChCZWUucHJvdG90eXBlLCBsaWZlQ3ljbGVzLCB7XG4gIC8qKlxuICAgKiDojrflj5blsZ7mgKcv5pa55rOVXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBleHByZXNzaW9uIOi3r+W+hC/ooajovr7lvI9cbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICAkZ2V0OiBmdW5jdGlvbihleHByZXNzaW9uKSB7XG4gICAgdmFyIGRpciA9IG5ldyBEaXIoJyRnZXQnLCB7XG4gICAgICBwYXRoOiBleHByZXNzaW9uXG4gICAgLCB3YXRjaDogZmFsc2VcbiAgICB9KTtcbiAgICBkaXIucGFyc2UoKTtcbiAgICByZXR1cm4gZGlyLmdldFZhbHVlKHRoaXMsIGZhbHNlKVxuICB9XG5cbiAgLyoqXG4gICAqIOabtOaWsOWQiOW5tiBgLmRhdGFgIOS4reeahOaVsOaNri4g5aaC5p6c5Y+q5pyJ5LiA5Liq5Y+C5pWwLCDpgqPkuYjov5nkuKrlj4LmlbDlsIblubblhaUgLiRkYXRhXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBba2V5XSDmlbDmja7ot6/lvoQuXG4gICAqIEBwYXJhbSB7QW55VHlwZXxPYmplY3R9IHZhbCDmlbDmja7lhoXlrrkuXG4gICAqL1xuLCAkc2V0OiBmdW5jdGlvbihrZXksIHZhbCkge1xuICAgIHZhciBhZGQsIGtleXMsIGhhc0tleSA9IGZhbHNlO1xuICAgIHZhciByZWZvcm1lZCwgcmVLZXksIHJlVm0gPSB0aGlzO1xuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICBpZihpc09iamVjdChrZXkpKSB7XG4gICAgICAgIGV4dGVuZCh0aGlzLiRkYXRhLCBrZXkpO1xuICAgICAgICBleHRlbmQodGhpcywga2V5KTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLiRkYXRhID0ga2V5O1xuICAgICAgfVxuICAgICAgdXBkYXRlLmNhbGwocmVWbSwga2V5KTtcbiAgICB9ZWxzZXtcbiAgICAgIHRoaXMuJHJlcGxhY2Uoa2V5LCB2YWwpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICog5pWw5o2u5pu/5o2iXG4gICAqL1xuLCAkcmVwbGFjZTogZnVuY3Rpb24gKGtleSwgdmFsKSB7XG4gICAgdmFyIGtleXMsIGxhc3QsIGhhc0tleSA9IGZhbHNlO1xuICAgIHZhciByZWZvcm1lZCwgcmVLZXksIHJlVm0gPSB0aGlzO1xuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICB2YWwgPSBrZXk7XG4gICAgICByZUtleSA9ICckZGF0YSc7XG4gICAgICBrZXlzID0gW3JlS2V5XTtcbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgIH1cblxuICAgIGxhc3QgPSByZVZtLiRnZXQocmVLZXkpO1xuXG4gICAgaWYgKGtleXNbMF0gPT09ICckZGF0YScpIHtcbiAgICAgIGlmKHJlS2V5ID09PSAnJGRhdGEnKSB7XG4gICAgICAgIGlmKGlzT2JqZWN0KHRoaXMuJGRhdGEpKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy4kZGF0YSkuZm9yRWFjaChmdW5jdGlvbiAoaykge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXNba107XG4gICAgICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgICB9XG4gICAgICAgIGV4dGVuZChyZVZtLCB2YWwpO1xuICAgICAgfWVsc2Uge1xuICAgICAgICBkZWVwU2V0KGtleXMuc2hpZnQoKS5qb2luKCcuJyksIHZhbCwgcmVWbSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGVlcFNldChyZUtleSwgdmFsLCByZVZtLiRkYXRhKTtcbiAgICB9XG4gICAgZGVlcFNldChyZUtleSwgdmFsLCByZVZtKVxuXG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwocmVWbSwgcmVLZXksIGV4dGVuZCh7fSwgbGFzdCwgdmFsKSkgOiB1cGRhdGUuY2FsbChyZVZtLCBleHRlbmQoe30sIGxhc3QsIHZhbCkpO1xuICB9XG4gIC8qKlxuICAgKiDmiYvliqjmm7TmlrDmn5Dpg6jliIbmlbDmja5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleVBhdGgg5oyH5a6a5pu05paw5pWw5o2u55qEIGtleVBhdGhcbiAgICogQHBhcmFtIHtCb29sZWFufSBbaXNCdWJibGU9dHJ1ZV0g5piv5ZCm5pu05pawIGtleVBhdGgg55qE54i257qnXG4gICAqL1xuLCAkdXBkYXRlOiBmdW5jdGlvbiAoa2V5UGF0aCwgaXNCdWJibGUpIHtcbiAgICBpc0J1YmJsZSA9IGlzQnViYmxlICE9PSBmYWxzZTtcblxuICAgIHZhciBrZXlzID0gcGFyc2VLZXlQYXRoKGtleVBhdGgucmVwbGFjZSgvXlxcJGRhdGFcXC4vLCAnJykpLCBrZXk7XG4gICAgdmFyIHdhdGNoZXJzO1xuXG4gICAgd2hpbGUoa2V5ID0ga2V5cy5qb2luKCcuJykpIHtcbiAgICAgIHdhdGNoZXJzID0gdGhpcy5fd2F0Y2hlcnNba2V5XSB8fCBbXTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSB3YXRjaGVycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgd2F0Y2hlcnNbaV0udXBkYXRlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICAgIGtleXMucG9wKCk7XG4gICAgICAgIC8v5pyA57uI6YO95YaS5rOh5YiwICRkYXRhXG4gICAgICAgIGlmKCFrZXlzLmxlbmd0aCAmJiBrZXkgIT09ICckZGF0YScpe1xuICAgICAgICAgIGtleXMucHVzaCgnJGRhdGEnKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8v5ZCM5pe25pu05paw5a2Q6Lev5b6EXG4gICAgV2F0Y2hlci5nZXRXYXRjaGVycyh0aGlzLCBrZXlQYXRoKS5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICAgIHdhdGNoZXIudXBkYXRlKCk7XG4gICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgLy/mlbDnu4TlhpLms6HnmoTmg4XlhrVcbiAgICBpZihpc0J1YmJsZSkge1xuICAgICAgaWYodGhpcy4kcGFyZW50KSB7XG4gICAgICAgIC8v5ZCM5q2l5pu05paw54i2IHZtIOWvueW6lOmDqOWIhlxuICAgICAgICB0aGlzLl9yZWxhdGl2ZVBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgIHRoaXMuJHBhcmVudC4kdXBkYXRlKHBhdGgpO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICB9XG4gICAgfVxuICB9XG4sICR3YXRjaDogZnVuY3Rpb24gKGV4cHJlc3Npb24sIGNhbGxiYWNrLCBpbW1lZGlhdGUpIHtcbiAgICBpZihjYWxsYmFjaykge1xuICAgICAgdmFyIHVwZGF0ZSA9IGNhbGxiYWNrLmJpbmQodGhpcyk7XG4gICAgICB1cGRhdGUuX29yaWdpbkZuID0gY2FsbGJhY2s7XG4gICAgICByZXR1cm4gV2F0Y2hlci5hZGRXYXRjaGVyLmNhbGwodGhpcywgbmV3IERpcignJHdhdGNoJywge3BhdGg6IGV4cHJlc3Npb24sIHVwZGF0ZTogdXBkYXRlLCBpbW1lZGlhdGUgOiAhIWltbWVkaWF0ZX0pKVxuICAgIH1cbiAgfVxuLCAkdW53YXRjaDogZnVuY3Rpb24gKGV4cHJlc3Npb24sIGNhbGxiYWNrKSB7XG4gICAgV2F0Y2hlci51bndhdGNoKHRoaXMsIGV4cHJlc3Npb24sIGNhbGxiYWNrKVxuICB9XG4gIC8v6ZSA5q+B5b2T5YmN5a6e5L6LXG4sICRkZXN0cm95OiBmdW5jdGlvbihyZW1vdmVFbCkge1xuICAgIHRoaXMuJGJlZm9yZURlc3Ryb3koKVxuICAgIHRoaXMuX19saW5rcy5mb3JFYWNoKGZ1bmN0aW9uKHdhY2hlcikge1xuICAgICAgd2FjaGVyLnVud2F0Y2goKVxuICAgIH0pXG4gICAgcmVtb3ZlRWwgJiYgdGhpcy4kZWwucGFyZW50Tm9kZSAmJiB0aGlzLiRlbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuJGVsKVxuICAgIHRoaXMuX19saW5rcyA9IFtdO1xuICAgIHRoaXMuJGFmdGVyRGVzdHJveSgpXG4gIH1cbn0pO1xuXG5mdW5jdGlvbiB1cGRhdGUgKGtleVBhdGgsIGRhdGEpIHtcbiAgdmFyIGtleVBhdGhzO1xuICB0aGlzLiRiZWZvcmVVcGRhdGUodGhpcy4kZGF0YSlcbiAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGRhdGEgPSBrZXlQYXRoO1xuICB9ZWxzZXtcbiAgICBrZXlQYXRocyA9IFtrZXlQYXRoXTtcbiAgfVxuXG4gIGlmKCFrZXlQYXRocykge1xuICAgIGlmKGlzT2JqZWN0KGRhdGEpKSB7XG4gICAgICBrZXlQYXRocyA9IE9iamVjdC5rZXlzKGRhdGEpO1xuICAgIH1lbHNle1xuICAgICAgLy8uJGRhdGEg5pyJ5Y+v6IO95piv5Z+65pys57G75Z6L5pWw5o2uXG4gICAgICBrZXlQYXRocyA9IFsnJGRhdGEnXTtcbiAgICB9XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBwYXRoOyBwYXRoID0ga2V5UGF0aHNbaV07IGkrKyl7XG4gICAgdGhpcy4kdXBkYXRlKHBhdGgsIHRydWUpO1xuICB9XG4gIHRoaXMuJGFmdGVyVXBkYXRlKHRoaXMuJGRhdGEpXG59XG5cbi8v5aSE55CGICRlbCwgICRjb250ZW50LCAkdHBsXG5mdW5jdGlvbiByZXNvbHZlVHBsKCkge1xuICB2YXIgZWwgPSB0aGlzLiRlbFxuICAgICwgY29udGVudCA9IHRoaXMuJGNvbnRlbnRcbiAgICAsIHRwbCA9IHRoaXMuJHRwbFxuICAgICwgdHBsRWxcbiAgICA7XG5cbiAgY29udGVudCA9IGVsICYmIGVsLmNoaWxkTm9kZXMgPyBlbC5jaGlsZE5vZGVzIDogY29udGVudFxuXG4gIGlmKGVsKSB7XG4gICAgLy/kvKDlhaUgJGVsIOWFg+e0oOeahOWtkOWFg+e0oOmDveWtmOaUvuWIsCAkY29udGVuIOS4rVxuICAgIGNvbnRlbnQgPSBlbC5jaGlsZE5vZGVzO1xuICB9XG5cbiAgaWYoY29udGVudCkge1xuICAgIC8v5Yib5bu6ICRjb250ZW50IGRvY3VtZW50RnJhZ21lbnRcbiAgICB0aGlzLiRjb250ZW50ID0gZG9tVXRpbHMuY3JlYXRlQ29udGVudChjb250ZW50KVxuICB9XG5cbiAgaWYodXRpbHMuaXNPYmplY3QodHBsKSl7XG4gICAgLy9ET00g5YWD57SgXG4gICAgdHBsRWwgPSB0cGw7XG4gICAgdHBsID0gdHBsRWwub3V0ZXJIVE1MO1xuICB9ZWxzZXtcbiAgICAvL+Wtl+espuS4slxuICAgIHRwbEVsID0gZG9tVXRpbHMuY3JlYXRlQ29udGVudCh0cGwpLmNoaWxkTm9kZXNbMF07XG4gIH1cblxuICBpZihlbCkge1xuICAgIGlmKHRoaXMuJGlzUmVwbGFjZSkge1xuICAgICAgZWwucGFyZW50Tm9kZSAmJiBlbC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZCh0cGxFbCwgZWwpXG4gICAgICBlbCA9IHRwbEVsO1xuICAgIH1lbHNle1xuICAgICAgZWwuYXBwZW5kQ2hpbGQodHBsRWwpXG4gICAgfVxuICB9ZWxzZXtcbiAgICBlbCA9IHRwbEVsO1xuICB9XG5cbiAgdGhpcy4kZWwgPSBlbDtcbn1cblxuQmVlLnZlcnNpb24gPSAnMC41LjEnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJlZTtcbiIsbnVsbCwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIGRpcmVjdGl2ZSA9IHJlcXVpcmUoJy4vZGlyZWN0aXZlJylcbiAgO1xuXG52YXIgTk9ERVRZUEUgPSB7XG4gICAgRUxFTUVOVDogMVxuICAsIEFUVFI6IDJcbiAgLCBURVhUOiAzXG4gICwgQ09NTUVOVDogOFxuICAsIEZSQUdNRU5UOiAxMVxufTtcblxuZG9jLmNyZWF0ZUVsZW1lbnQoJ3RlbXBsYXRlJyk7XG5cbi8qKlxuICog6YGN5Y6GIGRvbSDmoJFcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0VsZW1lbnR8Tm9kZUxpc3R9IGVsXG4gKiBAcmV0dXJucyB7QXJyYXl9IOiKgueCueS4i+aJgOacieeahOe7keWumlxuICovXG5cbmZ1bmN0aW9uIHdhbGsoZWwpIHtcbiAgdmFyIHdhdGNoZXJzID0gW10sIGRpclJlc3VsdDtcbiAgaWYoZWwubm9kZVR5cGUgPT09IE5PREVUWVBFLkZSQUdNRU5UKSB7XG4gICAgZWwgPSBlbC5jaGlsZE5vZGVzO1xuICB9XG5cbiAgaWYoKCdsZW5ndGgnIGluIGVsKSAmJiB1dGlscy5pc1VuZGVmaW5lZChlbC5ub2RlVHlwZSkpe1xuICAgIC8vbm9kZSBsaXN0XG4gICAgLy/lr7nkuo4gbm9kZWxpc3Qg5aaC5p6c5YW25Lit5pyJ5YyF5ZCrIHt7dGV4dH19IOebtOaOpemHj+eahOihqOi+vuW8jywg5paH5pys6IqC54K55Lya6KKr5YiG5YmyLCDlhbboioLngrnmlbDph4/lj6/og73kvJrliqjmgIHlop7liqBcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWwubGVuZ3RoOyBpKyspIHtcbiAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgZWxbaV0pICk7XG4gICAgfVxuICAgIHJldHVybiB3YXRjaGVycztcbiAgfVxuXG4gIHN3aXRjaCAoZWwubm9kZVR5cGUpIHtcbiAgICBjYXNlIE5PREVUWVBFLkVMRU1FTlQ6XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5PREVUWVBFLkNPTU1FTlQ6XG4gICAgICAvL+azqOmHiuiKgueCuVxuICAgICAgcmV0dXJuIHdhdGNoZXJzO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5URVhUOlxuICAgICAgLy/mlofmnKzoioLngrlcbiAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBjaGVja1RleHQuY2FsbCh0aGlzLCBlbCkgKTtcbiAgICAgIHJldHVybiB3YXRjaGVycztcbiAgfVxuXG4gIGlmKGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICAvL3RlbXBsYXRlIHNoaW1cbiAgICBpZighZWwuY29udGVudCkge1xuICAgICAgZWwuY29udGVudCA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICB3aGlsZShlbC5jaGlsZE5vZGVzWzBdKSB7XG4gICAgICAgIGVsLmNvbnRlbnQuYXBwZW5kQ2hpbGQoZWwuY2hpbGROb2Rlc1swXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBkaXJSZXN1bHQgPSBjaGVja0F0dHIuY2FsbCh0aGlzLCBlbCk7XG4gIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KGRpclJlc3VsdC53YXRjaGVycylcbiAgaWYoZGlyUmVzdWx0LnRlcm1pbmFsKXtcbiAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHdhbGsuY2FsbCh0aGlzLCBlbC5jb250ZW50KSApXG4gIH1cblxuICBmb3IodmFyIGNoaWxkID0gZWwuZmlyc3RDaGlsZCwgbmV4dDsgY2hpbGQ7ICl7XG4gICAgbmV4dCA9IGNoaWxkLm5leHRTaWJsaW5nO1xuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgY2hpbGQpICk7XG4gICAgY2hpbGQgPSBuZXh0O1xuICB9XG5cbiAgcmV0dXJuIHdhdGNoZXJzXG59XG5cbi8v6YGN5Y6G5bGe5oCnXG5mdW5jdGlvbiBjaGVja0F0dHIoZWwpIHtcbiAgdmFyIGNzdHIgPSB0aGlzLmNvbnN0cnVjdG9yXG4gICAgLCBkaXJzID0gZGlyZWN0aXZlLmdldERpcnMoZWwsIGNzdHIpXG4gICAgLCBkaXJcbiAgICAsIHRlcm1pbmFsUHJpb3JpdHksIHdhdGNoZXJzID0gW11cbiAgICAsIHJlc3VsdCA9IHt9O1xuICA7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBkaXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGRpciA9IGRpcnNbaV07XG4gICAgZGlyLmRpcnMgPSBkaXJzO1xuXG4gICAgLy/lr7nkuo4gdGVybWluYWwg5Li6IHRydWUg55qEIGRpcmVjdGl2ZSwg5Zyo6Kej5p6Q5a6M5YW255u45ZCM5p2D6YeN55qEIGRpcmVjdGl2ZSDlkI7kuK3mlq3pgY3ljobor6XlhYPntKBcbiAgICBpZih0ZXJtaW5hbFByaW9yaXR5ID4gZGlyLnByaW9yaXR5KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoZGlyLm5vZGVOYW1lKTtcblxuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKSApO1xuXG4gICAgaWYoZGlyLnRlcm1pbmFsKSB7XG4gICAgICByZXN1bHQudGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQud2F0Y2hlcnMgPSB3YXRjaGVyc1xuXG4gIHJldHVybiByZXN1bHRcbn1cblxudmFyIHBhcnRpYWxSZWcgPSAvXj5cXHMqLztcbi8v5aSE55CG5paH5pys6IqC54K55Lit55qE57uR5a6a5Y2g5L2N56ymKHt7Li4ufX0pXG5mdW5jdGlvbiBjaGVja1RleHQobm9kZSkge1xuICB2YXIgd2F0Y2hlcnMgPSBbXTtcbiAgaWYodG9rZW4uaGFzVG9rZW4obm9kZS5ub2RlVmFsdWUpKSB7XG4gICAgdmFyIHRva2VucyA9IHRva2VuLnBhcnNlVG9rZW4obm9kZS5ub2RlVmFsdWUpXG4gICAgICAsIHRleHRNYXAgPSB0b2tlbnMudGV4dE1hcFxuICAgICAgLCBlbCA9IG5vZGUucGFyZW50Tm9kZVxuICAgICAgLCBkaXJzID0gdGhpcy5jb25zdHJ1Y3Rvci5kaXJlY3RpdmVzXG4gICAgICAsIHQsIGRpclxuICAgICAgO1xuXG4gICAgLy/lsIZ7e2tleX195YiG5Ymy5oiQ5Y2V54us55qE5paH5pys6IqC54K5XG4gICAgaWYodGV4dE1hcC5sZW5ndGggPiAxKSB7XG4gICAgICB0ZXh0TWFwLmZvckVhY2goZnVuY3Rpb24odGV4dCkge1xuICAgICAgICB2YXIgdG4gPSBkb2MuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG4gICAgICAgIGVsLmluc2VydEJlZm9yZSh0biwgbm9kZSk7XG4gICAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KGNoZWNrVGV4dC5jYWxsKHRoaXMsIHRuKSk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgZWwucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfWVsc2V7XG4gICAgICB0ID0gdG9rZW5zWzBdO1xuICAgICAgLy/lhoXnva7lkITljaDkvY3nrKblpITnkIYuXG4gICAgICBpZihwYXJ0aWFsUmVnLnRlc3QodC5wYXRoKSkge1xuICAgICAgICB0LnBhdGggPSB0LnBhdGgucmVwbGFjZShwYXJ0aWFsUmVnLCAnJyk7XG4gICAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZShkaXJzLmNvbnRlbnQpXG4gICAgICAgIGRpci5kaXJOYW1lID0gZGlyLnR5cGVcbiAgICAgICAgZGlyLmFuY2hvcnMgPSBkaXJlY3RpdmUuc2V0QW5jaG9ycyhub2RlLCBkaXIudHlwZSlcbiAgICAgIH1lbHNle1xuICAgICAgICBkaXIgPSB1dGlscy5jcmVhdGUodC5lc2NhcGUgPyBkaXJzLnRleHQgOiBkaXJzLmh0bWwpXG4gICAgICB9XG5cbiAgICAgIHdhdGNoZXJzID0gc2V0QmluZGluZy5jYWxsKHRoaXMsIHV0aWxzLmV4dGVuZChkaXIsIHQsIHtcbiAgICAgICAgZWw6IG5vZGVcbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHdhdGNoZXJzXG59XG5cbmZ1bmN0aW9uIHNldEJpbmRpbmcoZGlyKSB7XG4gIHZhciB3YXRjaGVyXG4gIGlmKGRpci5yZXBsYWNlKSB7XG4gICAgdmFyIGVsID0gZGlyLmVsO1xuICAgIGlmKHV0aWxzLmlzRnVuY3Rpb24oZGlyLnJlcGxhY2UpKSB7XG4gICAgICBkaXIubm9kZSA9IGRpci5yZXBsYWNlKCk7XG4gICAgfWVsc2V7XG4gICAgICBkaXIubm9kZSA9IGRvYy5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gICAgfVxuXG4gICAgZGlyLmVsID0gZGlyLmVsLnBhcmVudE5vZGU7XG4gICAgZGlyLmVsLnJlcGxhY2VDaGlsZChkaXIubm9kZSwgZWwpO1xuICB9XG5cbiAgZGlyLnZtID0gdGhpcztcbiAgZGlyLmxpbmsoKTtcblxuICB3YXRjaGVyID0gV2F0Y2hlci5hZGRXYXRjaGVyLmNhbGwodGhpcywgZGlyKVxuICByZXR1cm4gd2F0Y2hlciA/IFt3YXRjaGVyXSA6IFtdXG59XG5cbmZ1bmN0aW9uIHVuQmluZGluZyh3YXRjaGVycykge1xuICB3YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICB3YXRjaGVyLnVud2F0Y2goKVxuICB9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2Fsazogd2FsayxcbiAgdW5CaW5kaW5nOiB1bkJpbmRpbmdcbn07XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlscy5qcycpLmV4dGVuZDtcblxudmFyIENsYXNzID0ge1xuICAvKipcbiAgICog5p6E6YCg5Ye95pWw57un5om/LlxuICAgKiDlpoI6IGB2YXIgQ2FyID0gQmVlLmV4dGVuZCh7ZHJpdmU6IGZ1bmN0aW9uKCl7fX0pOyBuZXcgQ2FyKCk7YFxuICAgKiBAcGFyYW0ge09iamVjdH0gW3Byb3RvUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxleWOn+Wei+WvueixoVxuICAgKiBAcGFyYW0ge09iamVjdH0gW3N0YXRpY1Byb3BzXSDlrZDmnoTpgKDlh73mlbDnmoTmianlsZXpnZnmgIHlsZ7mgKdcbiAgICogQHJldHVybnMge0Z1bmN0aW9ufSDlrZDmnoTpgKDlh73mlbBcbiAgICovXG4gIGV4dGVuZDogZnVuY3Rpb24gKHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG4gICAgcHJvdG9Qcm9wcyA9IHByb3RvUHJvcHMgfHwge307XG4gICAgdmFyIGNvbnN0cnVjdG9yID0gcHJvdG9Qcm9wcy5oYXNPd25Qcm9wZXJ0eSgnY29uc3RydWN0b3InKSA/XG4gICAgICAgICAgcHJvdG9Qcm9wcy5jb25zdHJ1Y3RvciA6IGZ1bmN0aW9uKCl7IHJldHVybiBzdXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfVxuICAgIHZhciBzdXAgPSB0aGlzO1xuICAgIHZhciBGbiA9IGZ1bmN0aW9uKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY29uc3RydWN0b3I7IH07XG4gICAgdmFyIHN1cFJlZiA9IHtfX3N1cGVyX186IHN1cC5wcm90b3R5cGV9O1xuXG4gICAgRm4ucHJvdG90eXBlID0gc3VwLnByb3RvdHlwZTtcbiAgICBjb25zdHJ1Y3Rvci5wcm90b3R5cGUgPSBuZXcgRm4oKTtcbiAgICBleHRlbmQoY29uc3RydWN0b3IucHJvdG90eXBlLCBzdXBSZWYsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdXBSZWYsIHN0YXRpY1Byb3BzKTtcblxuICAgIHJldHVybiBjb25zdHJ1Y3RvcjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzcztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbi8qKlxuICog5rOo5YaM57uE5Lu2XG4gKiBAcGFyYW0ge1N0cmluZ30gdGFnTmFtZSDoh6rlrprkuYnnu4Tku7bnmoTmoIfnrb7lkI1cbiAqIEBwYXJhbSB7RnVuY3Rpb258cHJvcHN9IENvbXBvbmVudCDoh6rlrprkuYnnu4Tku7bnmoTmnoTpgKDlh73mlbAgLyDmnoTpgKDlh73mlbDlj4LmlbBcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSDoh6rlrprkuYnnu4Tku7bnmoTmnoTpgKDlh73mlbBcbiAqL1xuZnVuY3Rpb24gdGFnKHRhZ05hbWUsIENvbXBvbmVudCwgc3RhdGljcykge1xuICB2YXIgdGFncyA9IHRoaXMuY29tcG9uZW50cyA9IHRoaXMuY29tcG9uZW50cyB8fCB7fTtcblxuICB0aGlzLmRvYy5jcmVhdGVFbGVtZW50KHRhZ05hbWUpOy8vZm9yIG9sZCBJRVxuXG4gIGlmKHV0aWxzLmlzT2JqZWN0KENvbXBvbmVudCkpIHtcbiAgICBDb21wb25lbnQgPSB0aGlzLmV4dGVuZChDb21wb25lbnQsIHN0YXRpY3MpO1xuICB9XG4gIHJldHVybiB0YWdzW3RhZ05hbWVdID0gQ29tcG9uZW50O1xufVxuXG4vKipcbiAqIOafpeivouafkOaehOmAoOWHveaVsOS4i+eahOazqOWGjOe7hOS7tlxuICogQHBhcm0ge1N0cmluZ30gY29tcG9uZW50TmFtZVxuICovXG5mdW5jdGlvbiBnZXRDb21wb25lbnQoY29tcG9uZW50TmFtZSkge1xuICB2YXIgcGF0aHMgPSB1dGlscy5wYXJzZUtleVBhdGgoY29tcG9uZW50TmFtZSk7XG4gIHZhciBDdXJDc3RyID0gdGhpcztcbiAgcGF0aHMuZm9yRWFjaChmdW5jdGlvbihjb21OYW1lKSB7XG4gICAgQ3VyQ3N0ciA9IEN1ckNzdHIgJiYgQ3VyQ3N0ci5jb21wb25lbnRzW2NvbU5hbWVdO1xuICB9KTtcbiAgcmV0dXJuIEN1ckNzdHIgfHwgbnVsbDtcbn1cblxuZXhwb3J0cy50YWcgPSBleHBvcnRzLmNvbXBvbmVudCA9IHRhZztcbmV4cG9ydHMuZ2V0Q29tcG9uZW50ID0gZ2V0Q29tcG9uZW50O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi90b2tlbi5qcycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZS5qcycpLnBhcnNlXG4gICwgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi9kb20tdXRpbHMnKVxuXG4gICwgY3JlYXRlID0gdXRpbHMuY3JlYXRlXG4gIDtcblxuLyoqXG4gKiDkuLogQmVlIOaehOmAoOWHveaVsOa3u+WKoOaMh+S7pCAoZGlyZWN0aXZlKS4gYEJlZS5kaXJlY3RpdmVgXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IGRpcmVjdGl2ZSDlkI3np7BcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0c10gZGlyZWN0aXZlIOWPguaVsFxuICogQHBhcmFtIHtOdW1iZXJ9IG9wdHMucHJpb3JpdHk9MCBkaXJlY3RpdmUg5LyY5YWI57qnLiDlkIzkuIDkuKrlhYPntKDkuIrnmoTmjIfku6TmjInnhafkvJjlhYjnuqfpobrluo/miafooYwuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMudGVybWluYWw9ZmFsc2Ug5omn6KGM6K+lIGRpcmVjdGl2ZSDlkI4sIOaYr+WQpue7iOatouWQjue7rSBkaXJlY3RpdmUg5omn6KGMLlxuICogICB0ZXJtaW5hbCDkuLrnnJ/ml7YsIOS4juivpSBkaXJlY3RpdmUg5LyY5YWI57qn55u45ZCM55qEIGRpcmVjdGl2ZSDku43kvJrnu6fnu63miafooYwsIOi+g+S9juS8mOWFiOe6p+eahOaJjeS8muiiq+W/veeVpS5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy5hbmNob3IgYW5jaG9yIOS4uiB0cnVlIOaXtiwg5Lya5Zyo5oyH5Luk6IqC54K55YmN5ZCO5ZCE5Lqn55Sf5LiA5Liq56m655m955qE5qCH6K6w6IqC54K5LiDliIbliKvlr7nlupQgYGFuY2hvcnMuc3RhcnRgIOWSjCBgYW5jaG9ycy5lbmRgXG4gKi9cbmZ1bmN0aW9uIGRpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdmFyIGRpcnMgPSB0aGlzLmRpcmVjdGl2ZXMgPSB0aGlzLmRpcmVjdGl2ZXMgfHwge307XG5cbiAgcmV0dXJuIGRpcnNba2V5XSA9IG5ldyBEaXJlY3RpdmUoa2V5LCBvcHRzKTtcbn1cblxuZnVuY3Rpb24gRGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB0aGlzLnR5cGUgPSBrZXk7XG4gIHV0aWxzLmV4dGVuZCh0aGlzLCBvcHRzKTtcbn1cblxudmFyIGFzdENhY2hlID0ge307XG5cbkRpcmVjdGl2ZS5wcm90b3R5cGUgPSB7XG4gIHByaW9yaXR5OiAwLy/mnYPph41cbiwgdHlwZTogJycgLy/mjIfku6Tnsbvlnotcbiwgc3ViVHlwZTogJycgLy/lrZDnsbvlnosuIOavlOWmgiBgYi1vbi1jbGlja2Ag55qEIHR5cGUg5Li6IGBvbmAsIHN1YlR5cGUg5Li6IGBjbGlja2Bcbiwgc3ViOiBmYWxzZSAvL+aYr+WQpuWFgeiuuOWtkOexu+Wei+aMh+S7pFxuLCBsaW5rOiB1dGlscy5ub29wLy/liJ3lp4vljJbmlrnms5VcbiwgdW5MaW5rOiB1dGlscy5ub29wLy/plIDmr4Hlm57osINcbiwgdXBkYXRlOiB1dGlscy5ub29wLy/mm7TmlrDmlrnms5VcbiwgdGVhckRvd246IHV0aWxzLm5vb3BcbiwgdGVybWluYWw6IGZhbHNlLy/mmK/lkKbnu4jmraJcbiwgcmVwbGFjZTogZmFsc2UvL+aYr+WQpuabv+aNouW9k+WJjeWFg+e0oC4g5aaC5p6c5pivLCDlsIbnlKjkuIDkuKrnqbrnmoTmlofmnKzoioLngrnmm7/mjaLlvZPliY3lhYPntKBcbiwgd2F0Y2g6IHRydWUvL+aYr+WQpuebkeaOpyBrZXkg55qE5Y+Y5YyWLiDlpoLmnpzkuLogZmFsc2Ug55qE6K+dLCB1cGRhdGUg5pa55rOV6buY6K6k5Y+q5Lya5Zyo5Yid5aeL5YyW5ZCO6LCD55So5LiA5qyhXG4sIGltbWVkaWF0ZTogdHJ1ZSAvL+aYr+WQpuWcqCBkaXIg5Yid5aeL5YyW5pe256uL5Y2z5omn6KGMIHVwZGF0ZSDmlrnms5VcblxuLCBhbmNob3I6IGZhbHNlXG4sIGFuY2hvcnM6IG51bGxcblxuICAvL+iOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKHN0YXJ0LCBlbmQpIHtcbiAgICBzdGFydCA9IHN0YXJ0IHx8IHRoaXMuYW5jaG9ycy5zdGFydDtcbiAgICBlbmQgPSBlbmQgfHwgdGhpcy5hbmNob3JzLmVuZDtcblxuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gc3RhcnQubmV4dFNpYmxpbmc7XG4gICAgaWYodGhpcy5hbmNob3IgJiYgbm9kZSkge1xuICAgICAgd2hpbGUobm9kZSAhPT0gZW5kKXtcbiAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dFNpYmxpbmc7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBub2RlcztcbiAgICB9XG4gIH1cbiAgLy/op6PmnpDooajovr7lvI9cbiwgcGFyc2U6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjYWNoZSA9IGFzdENhY2hlW3RoaXMucGF0aF1cbiAgICBpZihjYWNoZSAmJiBjYWNoZS5fdHlwZSA9PT0gdGhpcy50eXBlKXtcbiAgICAgIHRoaXMuYXN0ID0gY2FjaGVcbiAgICB9ZWxzZSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLmFzdCA9IHBhcnNlKHRoaXMucGF0aCwgdGhpcy50eXBlKTtcbiAgICAgICAgdGhpcy5hc3QuX3R5cGUgPSB0aGlzLnR5cGU7XG4gICAgICAgIGFzdENhY2hlW3RoaXMucGF0aF0gPSB0aGlzLmFzdDtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhpcy5hc3QgPSB7fTtcbiAgICAgICAgZS5tZXNzYWdlID0gJ1N5bnRheEVycm9yIGluIFwiJyArIHRoaXMucGF0aCArICdcIiB8ICcgKyBlLm1lc3NhZ2U7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIC8v6KGo6L6+5byP5rGC5YC8XG4gIC8vZm9yZ2l2ZVt0cnVlXTog5piv5ZCm5bCGIHVuZGVmaW5lZCDlj4ogbnVsbCDovazkuLrnqbrlrZfnrKZcbiwgZ2V0VmFsdWU6IGZ1bmN0aW9uKHNjb3BlLCBmb3JnaXZlKSB7XG4gICAgZm9yZ2l2ZSA9IGZvcmdpdmUgIT09IGZhbHNlO1xuICAgIHZhciB2YWw7XG5cbiAgICB0cnl7XG4gICAgICB2YWwgPSBldmFsdWF0ZS5ldmFsKHRoaXMuYXN0LCBzY29wZSwgdGhpcyk7XG4gICAgfWNhdGNoKGUpe1xuICAgICAgdmFsID0gJyc7XG4gICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgIH1cbiAgICBpZihmb3JnaXZlICYmICh1dGlscy5pc1VuZGVmaW5lZCh2YWwpIHx8IHZhbCA9PT0gbnVsbCkpIHtcbiAgICAgIHZhbCA9ICcnO1xuICAgIH1cbiAgICByZXR1cm4gdmFsO1xuICB9XG59O1xuXG52YXIgYXR0clBvc3RSZWcgPSAvXFw/JC87XG5cbi8qKlxuICog6I635Y+W5LiA5Liq5YWD57Sg5LiK5omA5pyJ55SoIEhUTUwg5bGe5oCn5a6a5LmJ55qE5oyH5LukXG4gKiBAcGFyYW0gIHtFbGVtZW50fSBlbCAgIOaMh+S7pOaJgOWcqOWFg+e0oFxuICogQHBhcmFtICB7QmVlfSBjc3RyIOe7hOS7tuaehOmAoOWHveaVsFxuICogQHJldHVybiB7ZGlyZWN0ZXZlW119ICAgICAgYGVsYCDkuIrmiYDmnInnmoTmjIfku6RcbiAqL1xuZnVuY3Rpb24gZ2V0RGlycyhlbCwgY3N0cil7XG4gIHZhciBhdHRyLCBhdHRyTmFtZSwgZGlyTmFtZSwgcHJvdG9cbiAgICAsIGRpcnMgPSBbXSwgZGlyXG4gICAgLCBwYXJlbnQgPSBlbC5wYXJlbnROb2RlXG4gICAgLCBub2RlTmFtZSA9IGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKClcbiAgICAsIGRpcmVjdGl2ZXMgPSBjc3RyLmRpcmVjdGl2ZXNcbiAgICAsIHByZWZpeCA9IGNzdHIucHJlZml4XG4gICAgO1xuXG4gIC8v5a+55LqO6Ieq5a6a5LmJ5qCH562+LCDlsIblhbbovazkuLogZGlyZWN0aXZlXG4gIGlmKGNzdHIuZ2V0Q29tcG9uZW50KG5vZGVOYW1lKSkge1xuICAgIGVsLnNldEF0dHJpYnV0ZShwcmVmaXggKyAnY29tcG9uZW50Jywgbm9kZU5hbWUpO1xuICB9XG5cbiAgZm9yKHZhciBpID0gZWwuYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgYXR0ciA9IGVsLmF0dHJpYnV0ZXNbaV07XG4gICAgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuICAgIGRpck5hbWUgPSBhdHRyTmFtZS5zbGljZShwcmVmaXgubGVuZ3RoKTtcbiAgICBwcm90byA9IHtlbDogZWwsIG5vZGU6IGF0dHIsIG5vZGVOYW1lOiBhdHRyTmFtZSwgcGF0aDogYXR0ci52YWx1ZX07XG4gICAgZGlyID0gbnVsbDtcblxuICAgIGlmKGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCAmJiAoZGlyID0gZ2V0RGlyKGRpck5hbWUsIGRpcmVjdGl2ZXMpKSkge1xuICAgICAgLy/mjIfku6RcbiAgICAgIGRpci5kaXJOYW1lID0gZGlyTmFtZS8vZGlyIOWQjVxuICAgIH1lbHNlIGlmKHRva2VuLmhhc1Rva2VuKGF0dHIudmFsdWUpKSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+WPr+iDveacieWkmuS4quihqOi+vuW8j+WMulxuICAgICAgdG9rZW4ucGFyc2VUb2tlbihhdHRyLnZhbHVlKS5mb3JFYWNoKGZ1bmN0aW9uKG9yaWdpbikge1xuICAgICAgICBvcmlnaW4uZGlyTmFtZSA9IGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCA/IGRpck5hbWUgOiBhdHRyTmFtZSA7XG4gICAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoY3JlYXRlKGRpcmVjdGl2ZXMuYXR0ciksIHByb3RvLCBvcmlnaW4pKVxuICAgICAgfSk7XG4gICAgICAvL+eUseS6juW3suefpeWxnuaAp+ihqOi+vuW8j+S4jeWtmOWcqCBhbmNob3IsIOaJgOS7peebtOaOpei3s+i/h+S4i+mdoueahOajgOa1i1xuICAgIH1lbHNlIGlmKGF0dHJQb3N0UmVnLnRlc3QoYXR0ck5hbWUpKSB7XG4gICAgICAvL+adoeS7tuWxnuaAp+aMh+S7pFxuICAgICAgZGlyID0gdXRpbHMuZXh0ZW5kKGNyZWF0ZShkaXJlY3RpdmVzLmF0dHIpLCB7IGRpck5hbWU6IGF0dHJOYW1lLnJlcGxhY2UoYXR0clBvc3RSZWcsICcnKSwgY29uZGl0aW9uYWw6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgaWYoZGlyKSB7XG4gICAgICBpZihkaXIuYW5jaG9yKSB7XG4gICAgICAgIGRpci5hbmNob3JzID0gc2V0QW5jaG9ycyhlbCwgZGlyLmRpck5hbWUpO1xuICAgICAgfVxuICAgICAgZGlycy5wdXNoKHV0aWxzLmV4dGVuZChkaXIsIHByb3RvKSk7XG4gICAgfVxuICB9XG4gIGRpcnMuc29ydChmdW5jdGlvbihkMCwgZDEpIHtcbiAgICByZXR1cm4gZDEucHJpb3JpdHkgLSBkMC5wcmlvcml0eTtcbiAgfSk7XG4gIHJldHVybiBkaXJzO1xufVxuXG5mdW5jdGlvbiBnZXREaXIoZGlyTmFtZSwgZGlycykge1xuICB2YXIgZGlyLCBzdWJUeXBlO1xuICBmb3IodmFyIGtleSBpbiBkaXJzKSB7XG4gICAgaWYoZGlyTmFtZSA9PT0ga2V5KXtcbiAgICAgIGRpciA9IGRpcnNba2V5XVxuICAgICAgYnJlYWtcbiAgICB9ZWxzZSBpZihkaXJOYW1lLmluZGV4T2Yoa2V5ICsgJy0nKSA9PT0gMCl7XG4gICAgICBkaXIgPSBkaXJzW2tleV1cbiAgICAgIGlmKCFkaXIuc3ViKXtcbiAgICAgICAgZGlyID0gbnVsbFxuICAgICAgfWVsc2V7XG4gICAgICAgIHN1YlR5cGUgPSBkaXJOYW1lLnNsaWNlKGtleS5sZW5ndGggKyAxKVxuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmKGRpcikge1xuICAgIGRpciA9IGNyZWF0ZShkaXIpO1xuICAgIGRpci5zdWJUeXBlID0gc3ViVHlwZTtcbiAgfVxuICByZXR1cm4gZGlyO1xufVxuXG5mdW5jdGlvbiBzZXRBbmNob3JzKG5vZGUsIGRpck5hbWUpIHtcbiAgdmFyIHBhcmVudCA9IG5vZGUucGFyZW50Tm9kZVxuICAgICwgYW5jaG9ycyA9IHt9XG4gICAgO1xuXG4gICAgYW5jaG9ycy5zdGFydCA9IGRvYy5jcmVhdGVDb21tZW50KGRpck5hbWUgKyAnIHN0YXJ0Jyk7XG4gICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLnN0YXJ0LCBub2RlKTtcblxuICAgIGFuY2hvcnMuZW5kID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyTmFtZSArICcgZW5kJyk7XG4gICAgaWYobm9kZS5uZXh0U2libGluZykge1xuICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLmVuZCwgbm9kZS5uZXh0U2libGluZyk7XG4gICAgfWVsc2V7XG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoYW5jaG9ycy5lbmQpO1xuICAgIH1cbiAgICByZXR1cm4gYW5jaG9yc1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgRGlyZWN0aXZlOiBEaXJlY3RpdmUsXG4gIGRpcmVjdGl2ZTogZGlyZWN0aXZlLFxuICBnZXREaXJzOiBnZXREaXJzLFxuICBzZXRBbmNob3JzOiBzZXRBbmNob3JzXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5bGe5oCn5oyH5LukXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkgey8vYXR0ciBiaW5kaW5nXG4gICAgICB0aGlzLmF0dHJzID0ge307XG4gICAgfWVsc2Uge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/pu5jorqTlsIblgLznva7nqbosIOmYsuatouihqOi+vuW8j+WGheWPmOmHj+S4jeWtmOWcqFxuICAgICAgdGhpcy51cGRhdGUoJycpXG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgbmV3QXR0cnMgPSB7fTtcblxuICAgIC8vYi1hdHRyXG4gICAgaWYodGhpcy5kaXJOYW1lID09PSB0aGlzLnR5cGUpIHtcbiAgICAgIGZvcih2YXIgYXR0ciBpbiB2YWwpIHtcbiAgICAgICAgc2V0QXR0cihlbCwgYXR0ciwgdmFsW2F0dHJdKTtcblxuICAgICAgICBkZWxldGUgdGhpcy5hdHRyc1thdHRyXTtcblxuICAgICAgICBuZXdBdHRyc1thdHRyXSA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8v56e76Zmk5LiN5Zyo5LiK5qyh6K6w5b2V5Lit55qE5bGe5oCnXG4gICAgICBmb3IodmFyIGF0dHIgaW4gdGhpcy5hdHRycykge1xuICAgICAgICByZW1vdmVBdHRyKGVsLCBhdHRyKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYXR0cnMgPSBuZXdBdHRycztcbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuY29uZGl0aW9uYWwpIHtcbiAgICAgICAgdmFsID8gc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB2YWwpIDogcmVtb3ZlQXR0cihlbCwgdGhpcy5kaXJOYW1lKTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLnRleHRNYXBbdGhpcy5wb3NpdGlvbl0gPSB2YWw7XG4gICAgICAgIHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdGhpcy50ZXh0TWFwLmpvaW4oJycpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblxuLy9JRSDmtY/op4jlmajlvojlpJrlsZ7mgKfpgJrov4cgYHNldEF0dHJpYnV0ZWAg6K6+572u5ZCO5peg5pWILlxuLy/ov5nkupvpgJrov4cgYGVsW2F0dHJdID0gdmFsdWVgIOiuvue9rueahOWxnuaAp+WNtOiDveWkn+mAmui/hyBgcmVtb3ZlQXR0cmlidXRlYCDmuIXpmaQuXG5mdW5jdGlvbiBzZXRBdHRyKGVsLCBhdHRyLCB2YWwpe1xuICB0cnl7XG4gICAgaWYoKChhdHRyIGluIGVsKSB8fCBhdHRyID09PSAnY2xhc3MnKSl7XG4gICAgICBpZihhdHRyID09PSAnc3R5bGUnICYmIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHZhbCk7XG4gICAgICB9ZWxzZSBpZihhdHRyID09PSAnY2xhc3MnKXtcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gdmFsO1xuICAgICAgfWVsc2V7XG4gICAgICAgIGVsW2F0dHJdID0gdHlwZW9mIGVsW2F0dHJdID09PSAnYm9vbGVhbicgPyB0cnVlIDogdmFsO1xuICAgICAgfVxuICAgIH1cbiAgfWNhdGNoKGUpe31cbiAgLy9jaHJvbWUgc2V0YXR0cmlidXRlIHdpdGggYHt7fX1gIHdpbGwgdGhyb3cgYW4gZXJyb3JcbiAgZWwuc2V0QXR0cmlidXRlKGF0dHIsIHZhbCk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUF0dHIoZWwsIGF0dHIpIHtcbiAgZWwucmVtb3ZlQXR0cmlidXRlKGF0dHIpO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmluaXRDbGFzcyA9IHRoaXMuZWwuY2xhc3NOYW1lIHx8ICcnXG4gICAgdGhpcy5rZXlzID0ge307XG4gIH0sXG4gIHVwZGF0ZTogZnVuY3Rpb24oY2xhc3Nlcykge1xuICAgIHZhciBjbGFzc1N0ciA9IHRoaXMuaW5pdENsYXNzXG4gICAgICAsIHdhdGNoZXIgPSB0aGlzLndhdGNoZXJcbiAgICAgIDtcblxuICAgIGlmKHR5cGVvZiBjbGFzc2VzID09PSAnc3RyaW5nJykge1xuICAgICAgaWYoY2xhc3Nlcykge1xuICAgICAgICBjbGFzc1N0ciArPSAnICcgKyBjbGFzc2VzO1xuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgZm9yKHZhciBrZXkgaW4gY2xhc3Nlcykge1xuICAgICAgICBpZighdGhpcy5rZXlzW2tleV0pIHtcbiAgICAgICAgICB0aGlzLmtleXNba2V5XSA9IHRydWU7XG4gICAgICAgICAgLy/lr7nosaHnmoTplK7lgLzpu5jorqTkuI3lnKjnm5HlkKzojIPlm7TkuYvlhoUsIOi/memHjOaJi+WKqOebkeWQrFxuICAgICAgICAgIHRoaXMudm0uJHdhdGNoKGtleSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB3YXRjaGVyLnVwZGF0ZSgpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBpZih0aGlzLnZtLiRnZXQoa2V5KSkge1xuICAgICAgICAgIGNsYXNzU3RyICs9ICcgJyArIGNsYXNzZXNba2V5XVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuZWwuY2xhc3NOYW1lID0gY2xhc3NTdHI7XG4gIH1cbn07XG4iLCIvL2NvbXBvbmVudCBhcyBkaXJlY3RpdmVcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG52YXIgZG9tVXRpbHMgPSByZXF1aXJlKCcuLi9kb20tdXRpbHMnKVxudmFyIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcHJpb3JpdHk6IC0xXG4sIHdhdGNoOiBmYWxzZVxuLCB1bkxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY29tcG9uZW50ICYmIHRoaXMuY29tcG9uZW50LiRkZXN0cm95KClcbiAgfVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdm0gPSB0aGlzLnZtO1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIGNzdHIgPSB2bS5jb25zdHJ1Y3RvcjtcbiAgICB2YXIgY29tcDtcbiAgICB2YXIgZGlycywgJGRhdGEgPSB7fTtcbiAgICB2YXIgQ29tcCA9IGNzdHIuZ2V0Q29tcG9uZW50KHRoaXMucGF0aClcbiAgICB2YXIgc3RhdGljcyA9IHt9O1xuXG4gICAgaWYoQ29tcCkge1xuXG4gICAgICAvL+ebtOaOpSBgQmVlLm1vdW50YCDkuIDkuKrnu4Tku7ZcbiAgICAgIGlmKENvbXAgPT09IGNzdHIgJiYgdm0uX19tb3VudGNhbGwgfHwgZWwuYmVlICYmIGVsLmJlZSA9PT0gdm0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkaXJzID0gdGhpcy5kaXJzLmZpbHRlcihmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHZhciBjdXJQYXRoLCBjb21QYXRoO1xuXG4gICAgICAgIGN1clBhdGggPSBkaXIucGF0aDtcbiAgICAgICAgaWYoZGlyLnR5cGUgPT09ICd3aXRoJykge1xuICAgICAgICAgIC8vY29tUGF0aCA9ICckZGF0YSdcbiAgICAgICAgICB1dGlscy5leHRlbmQoJGRhdGEsIHZtLiRnZXQoY3VyUGF0aCkpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGNvbVBhdGggPSB1dGlscy5oeXBoZW5Ub0NhbWVsKGRpci5kaXJOYW1lKTtcbiAgICAgICAgICAkZGF0YVtjb21QYXRoXSA9IGdldFByb3BlcnR5KGRpcilcbiAgICAgICAgICBkaXIuZWwucmVtb3ZlQXR0cmlidXRlKGRpci5kaXJOYW1lKVxuICAgICAgICB9XG5cbiAgICAgICAgLy/nm5HlkKzniLbnu4Tku7bmm7TmlrAsIOWQjOatpeaVsOaNrlxuICAgICAgICB2bS4kd2F0Y2goY3VyUGF0aCwgZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgIGlmKGNvbXApe1xuICAgICAgICAgICAgdmFsID0gZ2V0UHJvcGVydHkoZGlyKTtcbiAgICAgICAgICAgIGNvbVBhdGggPyBjb21wLiRzZXQoY29tUGF0aCwgdmFsKSA6IGNvbXAuJHNldCh2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0pO1xuXG4gICAgICAvL+e7hOS7tuWGheWuueWxnuS6juWFtuWuueWZqFxuICAgICAgdm0uX19saW5rcyA9IHZtLl9fbGlua3MuY29uY2F0KGNoZWNrQmluZGluZy53YWxrLmNhbGwodm0sIGVsLmNoaWxkTm9kZXMpKTtcblxuICAgICAgc3RhdGljcyA9IGRvbVV0aWxzLmdldEF0dHJzKGVsKVxuXG4gICAgICAvL+aOkumZpOaMh+S7pOWxnuaAp1xuICAgICAgdmFyIF9kaXI7XG4gICAgICBmb3IodmFyIGF0dHIgaW4gc3RhdGljcykge1xuICAgICAgICBfZGlyID0gdXRpbHMuY2FtZWxUb0h5cGhlbihhdHRyKTtcbiAgICAgICAgX2RpciA9IF9kaXIuc2xpY2Uodm0uY29uc3RydWN0b3IucHJlZml4Lmxlbmd0aClcblxuICAgICAgICBpZihfZGlyIGluIHZtLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXMpIHtcbiAgICAgICAgICBkZWxldGUgc3RhdGljc1thdHRyXVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29tcG9uZW50ID0gY29tcCA9IG5ldyBDb21wKHtcbiAgICAgICAgJGVsOiBlbCxcbiAgICAgICAgJGlzUmVwbGFjZTogdHJ1ZSxcblxuICAgICAgICAkZGF0YTogdXRpbHMuZXh0ZW5kKHRydWUsIHt9LCAkZGF0YSwgc3RhdGljcylcbiAgICAgIH0pO1xuICAgICAgZWwuYmVlID0gY29tcDtcblxuICAgICAgcmV0dXJuIGNvbXA7XG4gICAgfWVsc2V7XG4gICAgICBjb25zb2xlLmVycm9yKCdDb21wb25lbnQ6ICcgKyB0aGlzLnBhdGggKyAnIG5vdCBkZWZpbmVkIScpO1xuICAgIH1cbiAgfVxufTtcblxuLy/lpoLmnpznu4Tku7bnmoTlsZ7mgKflj6rmnInkuIDkuKrooajovr7lvI8sIOWImeS/neaMgeivpeihqOi+vuW8j+eahOaVsOaNruexu+Wei1xuZnVuY3Rpb24gZ2V0UHJvcGVydHkoZGlyKSB7XG4gIHZhciB0ZXh0TWFwID0gZGlyLnRleHRNYXAsIHZhbFxuICB2YWwgPSB0ZXh0TWFwICYmIHRleHRNYXAubGVuZ3RoID4gMSA/IHRleHRNYXAuam9pbignJykgOiB0ZXh0TWFwWzBdXG5cbiAgcmV0dXJuIHV0aWxzLmlzUGxhaW5PYmplY3QodmFsKSA/IHV0aWxzLmV4dGVuZCh0cnVlLCB7fSwgdmFsKSA6IHZhbDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9tVXRpbHMgPSByZXF1aXJlKCcuLi9kb20tdXRpbHMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZXBsYWNlOiB0cnVlXG4sIGFuY2hvcjogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLndhdGNoZXJzID0gW107XG4gIH1cbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci51bndhdGNoKClcbiAgICB9KTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHRwbCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKVxuICAgIHZhciBwYXJlbnQgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGVcblxuICAgIG5vZGVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH0pO1xuXG4gICAgdGhpcy51bkxpbmsoKTtcblxuICAgIHZhciBjb250ZW50ID0gZG9tVXRpbHMuY3JlYXRlQ29udGVudCh0cGwpXG5cbiAgICB0aGlzLndhdGNoZXJzID0gY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh0aGlzLnZtLCBjb250ZW50KVxuICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoY29udGVudCwgdGhpcy5hbmNob3JzLmVuZClcbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuLi9jaGVjay1iaW5kaW5nJylcbiAgLCBkb21VdGlscyA9IHJlcXVpcmUoJy4uL2RvbS11dGlscycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi4vZW52JykuZG9jdW1lbnRcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFuY2hvcjogdHJ1ZVxuLCBwcmlvcml0eTogOTAwXG4sIHRlcm1pbmFsOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMgPSBbXTtcblxuICAgIGlmKHRoaXMuZWwuY29udGVudCkge1xuICAgICAgdGhpcy5mcmFnID0gdGhpcy5lbC5jb250ZW50O1xuICAgICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICAgIH1lbHNle1xuICAgICAgdGhpcy5mcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICAgIH1cbiAgICB0aGlzLnJlbW92ZSgpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgaWYodmFsKSB7XG4gICAgICBpZighdGhpcy5zdGF0ZSkgeyB0aGlzLmFkZCgpIH1cbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuc3RhdGUpIHsgdGhpcy5yZW1vdmUoKTsgfVxuICAgIH1cbiAgICB0aGlzLnN0YXRlID0gdmFsO1xuICB9XG5cbiwgYWRkOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3JzLmVuZDtcbiAgICBpZighdGhpcy53YWxrZWQpIHtcbiAgICAgIHRoaXMud2Fsa2VkID0gdHJ1ZTtcbiAgICAgIHRoaXMud2F0Y2hlcnMgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMudm0sIHRoaXMuZnJhZyk7XG4gICAgfVxuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLl9oaWRlID0gZmFsc2U7XG4gICAgICBpZih3YXRjaGVyLl9uZWVkVXBkYXRlKSB7XG4gICAgICAgIHdhdGNoZXIudXBkYXRlKClcbiAgICAgICAgd2F0Y2hlci5fbmVlZFVwZGF0ZSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pXG4gICAgYW5jaG9yLnBhcmVudE5vZGUgJiYgYW5jaG9yLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMuZnJhZywgYW5jaG9yKTtcbiAgfVxuLCByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKTtcblxuICAgIGZvcih2YXIgaSA9IDAsIGwgPSBub2Rlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHRoaXMuZnJhZy5hcHBlbmRDaGlsZChub2Rlc1tpXSk7XG4gICAgfVxuXG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICAgIHdhdGNoZXIuX2hpZGUgPSB0cnVlO1xuICAgIH0pXG4gIH1cbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4uL2Vudi5qcycpLmRvY3VtZW50XG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxudmFyIGRpcnMgPSB7fTtcblxuXG5kaXJzLnRleHQgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLm5vZGUubm9kZVZhbHVlID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuICB9XG59O1xuXG5cbmRpcnMuaHRtbCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5vZGVzID0gW107XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWwuaW5uZXJIVE1MID0gdXRpbHMuaXNVbmRlZmluZWQodmFsKSA/ICcnIDogdmFsO1xuXG4gICAgdmFyIG5vZGU7XG4gICAgd2hpbGUobm9kZSA9IHRoaXMubm9kZXMucG9wKCkpIHtcbiAgICAgIG5vZGUucGFyZW50Tm9kZSAmJiBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfVxuXG4gICAgdmFyIG5vZGVzID0gZWwuY2hpbGROb2RlcztcbiAgICB3aGlsZShub2RlID0gbm9kZXNbMF0pIHtcbiAgICAgIHRoaXMubm9kZXMucHVzaChub2RlKTtcbiAgICAgIHRoaXMuZWwuaW5zZXJ0QmVmb3JlKG5vZGUsIHRoaXMubm9kZSk7XG4gICAgfVxuICB9XG59O1xuXG5kaXJzLnRlbXBsYXRlID0ge1xuICBwcmlvcml0eTogMTAwMDBcbiwgd2F0Y2g6IGZhbHNlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZWwuY2hpbGROb2Rlc1xuICAgICAgLCBmcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICAgICAgO1xuXG4gICAgd2hpbGUobm9kZXNbMF0pIHtcbiAgICAgIGZyYWcuYXBwZW5kQ2hpbGQobm9kZXNbMF0pO1xuICAgIH1cblxuICAgIHRoaXMuZWwuY29udGVudCA9IGZyYWc7XG4gICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSh0aGlzLm5vZGVOYW1lLCAnJyk7XG4gIH1cbn07XG5cbi8v5Zu+54mH55SoLCDpgb/lhY3liqDovb0gVVJMIOS4reW4puacieWkp+aLrOWPt+eahOWOn+Wni+aooeadv+WGheWuuVxuZGlycy5zcmMgPSB7XG4gIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdGhpcy5lbC5zcmMgPSB2YWw7XG4gIH1cbn07XG5cbmRpcnNbJ3dpdGgnXSA9IHt9O1xuXG5kaXJzWydpZiddID0gcmVxdWlyZSgnLi9pZicpXG5kaXJzLnJlcGVhdCA9IHJlcXVpcmUoJy4vcmVwZWF0Jyk7XG5kaXJzLmF0dHIgPSByZXF1aXJlKCcuL2F0dHInKTtcbmRpcnMubW9kZWwgPSByZXF1aXJlKCcuL21vZGVsJyk7XG5kaXJzLnN0eWxlID0gcmVxdWlyZSgnLi9zdHlsZScpO1xuZGlycy5vbiA9IHJlcXVpcmUoJy4vb24nKTtcbmRpcnMuY29tcG9uZW50ID0gZGlycy50YWcgPSByZXF1aXJlKCcuL2NvbXBvbmVudCcpO1xuZGlycy5jb250ZW50ID0gcmVxdWlyZSgnLi9jb250ZW50JylcbmRpcnMucmVmID0gcmVxdWlyZSgnLi9yZWYnKVxuZGlyc1snY2xhc3MnXSA9IHJlcXVpcmUoJy4vY2xhc3MuanMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpcnM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIGhhc1Rva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKS5oYXNUb2tlblxuICAsIGV2ZW50cyA9IHJlcXVpcmUoJy4uL2V2ZW50LWJpbmQuanMnKVxuICA7XG5cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbWluYWw6IHRydWVcbiwgcHJpb3JpdHk6IC0yXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBrZXlQYXRoID0gdGhpcy5wYXRoO1xuICAgIHZhciB2bSA9IHRoaXMudm07XG5cbiAgICBpZigha2V5UGF0aCkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgIHZhciBjb21wID0gdGhpcy5lbFxuICAgICAgLCBldiA9ICdjaGFuZ2UnXG4gICAgICAsIGF0dHJcbiAgICAgICwgdmFsdWUgPSBhdHRyID0gJ3ZhbHVlJ1xuICAgICAgLCBpc1NldERlZmF1dCA9IHV0aWxzLmlzVW5kZWZpbmVkKHZtLiRnZXQoa2V5UGF0aCkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG5cbiAgICAgICAgLy/mm7TmlrDnu4Tku7ZcbiAgICAgICwgdXBkYXRlID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgaWYodmFsID09PSAwICYmIGNvbXAudHlwZSAhPT0gJ2NoZWNrYm94JykgeyB2YWwgPSAnMCcgfVxuICAgICAgICAgIHZhciBuZXdWYWwgPSAodmFsIHx8ICcnKSArICcnXG4gICAgICAgICAgICAsIHZhbCA9IGNvbXBbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBjb21wW2F0dHJdID0gbmV3VmFsOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvL+abtOaWsCB2aWV3TW9kZWxcbiAgICAgICwgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZhciB2YWwgPSBjb21wW3ZhbHVlXTtcblxuICAgICAgICAgIHZhbC5yZXBsYWNlICYmICh2YWwgPSB2YWwucmVwbGFjZShjcmxmLCAnXFxuJykpO1xuICAgICAgICAgIHZtLiRzZXQoa2V5UGF0aCwgdmFsKTtcbiAgICAgICAgfVxuICAgICAgLCBjYWxsSGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICBpZihlICYmIGUucHJvcGVydHlOYW1lICYmIGUucHJvcGVydHlOYW1lICE9PSBhdHRyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICB9XG4gICAgICAsIGllID0gdXRpbHMuaWVcbiAgICAgIDtcblxuICAgIGlmKGNvbXAuYmVlKSB7XG4gICAgICAvLyDnu4Tku7bnmoTlj4zlkJHnu5HlrppcbiAgICAgIGNvbXAgPSBjb21wLmJlZTtcbiAgICAgIHZhbHVlID0gY29tcC4kdmFsdWVrZXk7XG4gICAgICBpZih2YWx1ZSkge1xuICAgICAgICB1cGRhdGUgPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICBjb21wLiRyZXBsYWNlKHZhbHVlLCB2YWwpXG4gICAgICAgIH07XG4gICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICB2bS4kcmVwbGFjZShrZXlQYXRoLCBjb21wLiRnZXQodmFsdWUpKVxuICAgICAgICB9XG4gICAgICAgIGNvbXAuJHdhdGNoKHZhbHVlLCBmdW5jdGlvbih2YWwsIG9sZFZhbHVlKSB7XG4gICAgICAgICAgdmFsICE9PSBvbGRWYWx1ZSAmJiBoYW5kbGVyKClcbiAgICAgICAgfSwgdHJ1ZSlcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIC8vSFRNTCDljp/nlJ/mjqfku7bnmoTlj4zlkJHnu5HlrppcbiAgICAgIHN3aXRjaChjb21wLnRhZ05hbWUpIHtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnaW5uZXJIVE1MJztcbiAgICAgICAgICAvL2V2ICs9ICcgYmx1cic7XG4gICAgICAgIGNhc2UgJ0lOUFVUJzpcbiAgICAgICAgY2FzZSAnVEVYVEFSRUEnOlxuICAgICAgICAgIHN3aXRjaChjb21wLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2NoZWNrYm94JzpcbiAgICAgICAgICAgICAgdmFsdWUgPSBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgICAvL0lFNiwgSUU3IOS4i+ebkeWQrCBwcm9wZXJ0eWNoYW5nZSDkvJrmjII/XG4gICAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3JhZGlvJzpcbiAgICAgICAgICAgICAgYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgY29tcC5jaGVja2VkID0gY29tcC52YWx1ZSA9PT0gdmFsICsgJyc7XG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGlzU2V0RGVmYXV0ID0gY29tcC5jaGVja2VkO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICBpZighdm0uJGxhenkpe1xuICAgICAgICAgICAgICAgIGlmKCdvbmlucHV0JyBpbiBjb21wKXtcbiAgICAgICAgICAgICAgICAgIGV2ICs9ICcgaW5wdXQnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvL0lFIOS4i+eahCBpbnB1dCDkuovku7bmm7/ku6NcbiAgICAgICAgICAgICAgICBpZihpZSkge1xuICAgICAgICAgICAgICAgICAgZXYgKz0gJyBrZXl1cCBwcm9wZXJ0eWNoYW5nZSBjdXQnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnU0VMRUNUJzpcbiAgICAgICAgICBpZihjb21wLm11bHRpcGxlKXtcbiAgICAgICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgdmFyIHZhbHMgPSBbXTtcbiAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGNvbXAub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICAgIGlmKGNvbXAub3B0aW9uc1tpXS5zZWxlY3RlZCl7IHZhbHMucHVzaChjb21wLm9wdGlvbnNbaV0udmFsdWUpIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB2bS4kcmVwbGFjZShrZXlQYXRoLCB2YWxzKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB1cGRhdGUgPSBmdW5jdGlvbih2YWxzKXtcbiAgICAgICAgICAgICAgaWYodmFscyAmJiB2YWxzLmxlbmd0aCl7XG4gICAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGNvbXAub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICAgICAgY29tcC5vcHRpb25zW2ldLnNlbGVjdGVkID0gdmFscy5pbmRleE9mKGNvbXAub3B0aW9uc1tpXS52YWx1ZSkgIT09IC0xO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaXNTZXREZWZhdXQgPSBpc1NldERlZmF1dCAmJiAhaGFzVG9rZW4oY29tcFt2YWx1ZV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgZXYuc3BsaXQoL1xccysvZykuZm9yRWFjaChmdW5jdGlvbihlKXtcbiAgICAgICAgZXZlbnRzLnJlbW92ZUV2ZW50KGNvbXAsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgICAgZXZlbnRzLmFkZEV2ZW50KGNvbXAsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgIH0pO1xuICAgICAgLy/moLnmja7ooajljZXlhYPntKDnmoTliJ3lp4vljJbpu5jorqTlgLzorr7nva7lr7nlupQgbW9kZWwg55qE5YC8XG4gICAgICBpZihjb21wW3ZhbHVlXSAmJiBpc1NldERlZmF1dCl7XG4gICAgICAgICBoYW5kbGVyKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy51cGRhdGUgPSB1cGRhdGU7XG4gIH1cbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/kuovku7bnm5HlkKxcblxudmFyIGV2ZW50QmluZCA9IHJlcXVpcmUoJy4uL2V2ZW50LWJpbmQuanMnKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHdhdGNoOiBmYWxzZVxuLCBzdWI6IHRydWVcbiwgcHJpb3JpdHk6IC0zIC8v5LqL5Lu25bqU6K+l5ZyoIGItbW9kZWwg5LmL5ZCO55uR5ZCsLiDpmLLmraLmma7pgJrkuovku7bosIPnlKjov4flv6tcbiwgaW1tZWRpYXRlOiBmYWxzZSAvLyB3YXRjaCDlkowgaW1tZWRpYXRlIOWQjOaXtuS4uiBmYWxzZSDml7YsIOaMh+S7pOeahCB1cGRhdGUg5pa55rOV5bCG5LiN5Lya6Ieq5Yqo6KKr5aSW6YOo6LCD55SoXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBkaXIgPSB0aGlzO1xuICAgIGlmKHRoaXMuc3ViVHlwZSl7XG4gICAgICAvLyBiZS1vbi1jbGljayDnrYlcbiAgICAgIGV2ZW50QmluZC5hZGRFdmVudCh0aGlzLmVsLCB0aGlzLnN1YlR5cGUsIGZ1bmN0aW9uKCkge1xuICAgICAgICBkaXIudm0uJGdldChkaXIucGF0aClcbiAgICAgIH0pXG4gICAgfWVsc2V7XG4gICAgICAvL2xpbmsg5pa55rOV55qE6LCD55So5ZyoIHdhdGNoZXIg5qOA5rWLIGltbWVkaWF0ZSDkuYvliY0sXG4gICAgICAvL+aJgOS7peWPr+S7peWcqOi/memHjOWwhiBpbW1lZGlhdGUg572u5Li6IHRydWUg5Lul5L6/6Ieq5Yqo6LCD55SoIHVwZGF0ZSDmlrnms5VcbiAgICAgIHRoaXMuaW1tZWRpYXRlID0gdHJ1ZTtcbiAgICAgIC8vdGhpcy51cGRhdGUodGhpcy52bS4kZ2V0KHRoaXMucGF0aCkpXG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24gKGV2ZW50cykge1xuICAgIHZhciBzZWxlY3RvciwgZXZlbnRUeXBlO1xuICAgIGZvcih2YXIgbmFtZSBpbiBldmVudHMpIHtcbiAgICAgIHNlbGVjdG9yID0gbmFtZS5zcGxpdCgvXFxzKy8pO1xuICAgICAgZXZlbnRUeXBlID0gc2VsZWN0b3Iuc2hpZnQoKTtcbiAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3Iuam9pbignICcpO1xuICAgICAgZXZlbnRCaW5kLmFkZEV2ZW50KHRoaXMuZWwsIGV2ZW50VHlwZSwgY2FsbEhhbmRsZXIodGhpcywgc2VsZWN0b3IsIGV2ZW50c1tuYW1lXSkpO1xuICAgIH1cbiAgfVxufVxuXG4vL+WnlOaJmOS6i+S7tlxuLy/opoHmsYIgSUU4K1xuLy/or7fms6jmhI/ov5nph4znmoQgZXZlbnQuY3VycmVudFRhcmdldCDlkowgZXZlbnQuZGVsZWdhdGVUYXJnZXQg5ZCMIGpRdWVyeSDnmoTliJrlpb3nm7jlj41cbmZ1bmN0aW9uIGNhbGxIYW5kbGVyIChkaXIsIHNlbGVjdG9yLCBjYWxsYmFjaykge1xuICByZXR1cm4gZnVuY3Rpb24oZSkge1xuICAgIHZhciBjdXIgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgdmFyIGVscyA9IHNlbGVjdG9yID8gdXRpbHMudG9BcnJheShkaXIuZWwucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpIDogW2N1cl07XG4gICAgZG97XG4gICAgICBpZihlbHMuaW5kZXhPZihjdXIpID49IDApIHtcbiAgICAgICAgZS5kZWxlZ2F0ZVRhcmdldCA9IGN1cjsvL+WnlOaJmOWFg+e0oFxuICAgICAgICByZXR1cm4gY2FsbGJhY2suY2FsbChkaXIudm0sIGUpXG4gICAgICB9XG4gICAgfXdoaWxlKGN1ciA9IGN1ci5wYXJlbnROb2RlKVxuICB9XG59XG4iLCJcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHdhdGNoOiBmYWxzZVxuLCBwcmlvcml0eTogLTIgLy8gcmVmIOW6lOivpeWcqCBjb21wb25lbnQg5LmL5ZCOXG4sIHVuTGluazogZnVuY3Rpb24oKSB7XG4gICAgaWYodXRpbHMuaXNBcnJheSh0aGlzLnJlZikpIHtcbiAgICAgIHRoaXMucmVmLnNwbGljZSh0aGlzLnZtLiRpbmRleCwgMSlcbiAgICB9ZWxzZXtcbiAgICAgIHRoaXMudm0uJHJlZnNbdGhpcy5wYXRoXSA9IG51bGw7XG4gICAgfVxuICB9XG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB2bSA9IHRoaXMudm1cbiAgICAvL+WcqCBgcmVwZWF0YCDlhYPntKDkuIrnmoQgYHJlZmAg5Lya5oyH5ZCR5Yy/5ZCNIGB2aWV3bW9kZWxgXG4gICAgaWYodm0uX19yZXBlYXQpe1xuICAgICAgaWYoIXZtLiRpbmRleCkge1xuICAgICAgICB2bS4kcGFyZW50LiRyZWZzW3RoaXMucGF0aF0gPSBbXTtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVmID0gdm0uJHBhcmVudC4kcmVmc1t0aGlzLnBhdGhdXG4gICAgICB0aGlzLnJlZlt2bS4kaW5kZXhdID0gdm07XG4gICAgfWVsc2V7XG4gICAgICB2bS4kcmVmc1t0aGlzLnBhdGhdID0gdGhpcy5lbC5iZWUgfHwgdGhpcy5lbDtcbiAgICB9XG4gIH1cbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgLCBzY29wZSA9IHJlcXVpcmUoJy4uL3Njb3BlJylcbiAgO1xuXG4vL+i/meS6m+aVsOe7hOaTjeS9nOaWueazleiiq+mHjeWGmeaIkOiHquWKqOinpuWPkeabtOaWsFxudmFyIGFycmF5TWV0aG9kcyA9IFsnc3BsaWNlJywgJ3B1c2gnLCAncG9wJywgJ3NoaWZ0JywgJ3Vuc2hpZnQnLCAnc29ydCcsICdyZXZlcnNlJ107XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcmlvcml0eTogMTAwMFxuLCBhbmNob3I6IHRydWVcbiwgdGVybWluYWw6IHRydWVcbiwgdW5MaW5rOiBmdW5jdGlvbigpe1xuICAgIHRoaXMudm1MaXN0LmZvckVhY2goZnVuY3Rpb24odm0pe1xuICAgICAgdm0uJGRlc3Ryb3koKVxuICAgIH0pXG4gIH1cbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIEJlZSA9IHJlcXVpcmUoJy4uL2JlZScpXG5cbiAgICB0aGlzLnRyYWNrSWQgPSB0aGlzLmVsLmdldEF0dHJpYnV0ZSgndHJhY2stYnknKVxuICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKCd0cmFjay1ieScpXG5cbiAgICAvL+WIm+W7uiByZXBlYXQg55qE5Yy/5ZCN5p6E6YCg5Ye95pWwXG4gICAgLy/nu6fmib/niLbmnoTpgKDlh73mlbDnmoQgYGRpcmVjdGl2ZXMsIGNvbXBvbmVudHMsIGZpbHRlcnNgIOWxnuaAp1xuICAgIHRoaXMuY3N0ciA9IEJlZS5leHRlbmQoe30sIHRoaXMudm0uY29uc3RydWN0b3IpXG5cbiAgICAvL+m7mOiupOaVsOaNruS4jeW6lOe7p+aJv1xuICAgIHRoaXMuY3N0ci5kZWZhdWx0cyA9IHt9O1xuXG4gICAgdGhpcy5jdXJBcnIgPSBbXTtcbiAgICB0aGlzLnZtTGlzdCA9IFtdOy8v5a2QIFZNIGxpc3RcblxuICAgIGlmKHRoaXMuZWwuY29udGVudCkge1xuICAgICAgdGhpcy5mcmFnID0gdGhpcy5lbC5jb250ZW50O1xuICAgICAgdGhpcy5pc1JhbmdlID0gdHJ1ZVxuICAgIH1lbHNle1xuICAgICAgdGhpcy5mcmFnID0gdGhpcy5lbDtcbiAgICB9XG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgdmFyIHRoYXQgPSB0aGlzLCB2bUxpc3QgPSB0aGlzLnZtTGlzdDtcbiAgICB2YXIgdHJhY2tJZCA9IHRoaXMudHJhY2tJZDtcblxuICAgIGlmKHV0aWxzLmlzQXJyYXkoaXRlbXMpKSB7XG4gICAgICAvLyDlnKggcmVwZWF0IOaMh+S7pOihqOi+vuW8j+S4reebuOWFs+WPmOmHj1xuICAgICAgdGhpcy5saXN0UGF0aCA9IHRoaXMuc3VtbWFyeS5wYXRocy5maWx0ZXIoZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICByZXR1cm4gIXV0aWxzLmlzRnVuY3Rpb24odGhhdC52bS4kZ2V0KHBhdGgpKVxuICAgICAgfSk7XG5cbiAgICAgIC8v5Yig6Zmk5YWD57SgXG4gICAgICBhcnJEaWZmKGN1ckFyciwgaXRlbXMsIHRyYWNrSWQpLmZvckVhY2goZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICB2YXIgcG9zID0gaW5kZXhCeVRyYWNrSWQoaXRlbSwgY3VyQXJyLCB0cmFja0lkKVxuICAgICAgICBjdXJBcnIuc3BsaWNlKHBvcywgMSlcblxuICAgICAgICBpZih0aGF0LmlzUmFuZ2UpIHtcbiAgICAgICAgICBnZXROb2Rlc0J5SW5kZXgodGhhdCwgcG9zKS5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSlcbiAgICAgICAgICB9KVxuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBwYXJlbnROb2RlLnJlbW92ZUNoaWxkKHZtTGlzdFtwb3NdLiRlbClcbiAgICAgICAgfVxuICAgICAgICB2bUxpc3RbcG9zXS4kZGVzdHJveSgpXG4gICAgICAgIHZtTGlzdC5zcGxpY2UocG9zLCAxKVxuICAgICAgfSlcblxuICAgICAgaXRlbXMuZm9yRWFjaChmdW5jdGlvbihpdGVtLCBpKSB7XG4gICAgICAgIHZhciBwb3MgPSBpbmRleEJ5VHJhY2tJZChpdGVtLCBpdGVtcywgdHJhY2tJZCwgaSlcbiAgICAgICAgICAsIG9sZFBvcyA9IGluZGV4QnlUcmFja0lkKGl0ZW0sIGN1ckFyciwgdHJhY2tJZCwgaSlcbiAgICAgICAgICAsIHZtLCBlbCwgYW5jaG9yXG4gICAgICAgICAgO1xuXG4gICAgICAgIC8v5paw5aKe5YWD57SgXG4gICAgICAgIGlmKG9sZFBvcyA8IDApIHtcblxuICAgICAgICAgIGVsID0gdGhpcy5mcmFnLmNsb25lTm9kZSh0cnVlKVxuXG4gICAgICAgICAgaWYodGhpcy5pc1JhbmdlKSB7XG4gICAgICAgICAgICBhbmNob3IgPSBkb2MuY3JlYXRlQ29tbWVudCgnJylcbiAgICAgICAgICAgIGVsLmNoaWxkTm9kZXMubGVuZ3RoID8gZWwuaW5zZXJ0QmVmb3JlKGFuY2hvciwgZWwuY2hpbGROb2Rlc1swXSkgOiBlbC5hcHBlbmRDaGlsZChhbmNob3IpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdm0gPSBuZXcgdGhpcy5jc3RyKGVsLCB7XG4gICAgICAgICAgICAkZGF0YTogaXRlbSxcbiAgICAgICAgICAgICRpbmRleDogcG9zLFxuICAgICAgICAgICAgJHJvb3Q6IHRoaXMudm0uJHJvb3QsXG4gICAgICAgICAgICAkcGFyZW50OiB0aGlzLnZtLFxuICAgICAgICAgICAgX2Fzc2lnbm1lbnRzOiB0aGlzLnN1bW1hcnkuYXNzaWdubWVudHMsXG4gICAgICAgICAgICBfX3JlcGVhdDogdHJ1ZSxcbiAgICAgICAgICAgIF9fYW5jaG9yOiBhbmNob3JcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHZtLiRlbCwgZ2V0QW5jaG9yKHRoYXQsIHBvcykpXG4gICAgICAgICAgdm1MaXN0LnNwbGljZShwb3MsIDAsIHZtKTtcbiAgICAgICAgICBjdXJBcnIuc3BsaWNlKHBvcywgMCwgaXRlbSlcblxuICAgICAgICAgIC8v5bu25pe26LWL5YC857uZIGBfcmVsYXRpdmVQYXRoYCwg6YG/5YWN5Ye6546w5q275b6q546vXG4gICAgICAgICAgLy/lpoLmnpzlnKjkuIrpnaLlrp7kvovljJbml7blvZPlj4LmlbDkvKDlhaUsIOS8muWGkuazoeWIsOeItue6pyB2bSDpgJLlvZLosIPnlKjov5nph4znmoQgdXBkYXRlIOaWueazlSwg6YCg5oiQ5q275b6q546vLlxuICAgICAgICAgIHZtLl9yZWxhdGl2ZVBhdGggPSB0aGlzLmxpc3RQYXRoO1xuICAgICAgICB9ZWxzZSB7XG5cbiAgICAgICAgICAvL+iwg+W6j1xuICAgICAgICAgIGlmIChwb3MgIT09IG9sZFBvcykge1xuXG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShnZXRFbEJ5SW5kZXgodGhhdCwgb2xkUG9zKSwgZ2V0QW5jaG9yKHRoYXQsIHBvcykpXG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShnZXRFbEJ5SW5kZXgodGhhdCwgcG9zKSwgZ2V0QW5jaG9yKHRoYXQsIG9sZFBvcyArIDEpKVxuXG4gICAgICAgICAgICB2bUxpc3Rbb2xkUG9zXSA9IFt2bUxpc3RbcG9zXSwgdm1MaXN0W3Bvc10gPSB2bUxpc3Rbb2xkUG9zXV1bMF1cbiAgICAgICAgICAgIGN1ckFycltvbGRQb3NdID0gW2N1ckFycltwb3NdLCBjdXJBcnJbcG9zXSA9IGN1ckFycltvbGRQb3NdXVswXVxuICAgICAgICAgICAgdm1MaXN0W3Bvc10uJGluZGV4ID0gcG9zXG4gICAgICAgICAgICB2bUxpc3RbcG9zXS4kdXBkYXRlKCckaW5kZXgnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgICAvL+abtOaWsOe0ouW8lVxuICAgICAgdm1MaXN0LmZvckVhY2goZnVuY3Rpb24odm0sIGkpIHtcbiAgICAgICAgdm0uJGluZGV4ID0gaVxuICAgICAgICB2bS4kZWwuJGluZGV4ID0gaVxuICAgICAgICB2bS4kdXBkYXRlKCckaW5kZXgnLCBmYWxzZSlcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnN1bW1hcnkucGF0aHMuZm9yRWFjaChmdW5jdGlvbihsb2NhbEtleSkge1xuICAgICAgICB2YXIgbG9jYWwgPSB0aGF0LnZtLiRnZXQobG9jYWxLZXkpO1xuICAgICAgICB2YXIgZGlycyA9IGxvY2FsLl9fZGlyc19fO1xuICAgICAgICBpZih1dGlscy5pc0FycmF5KGxvY2FsKSkge1xuICAgICAgICAgIGlmKCFkaXJzKXtcbiAgICAgICAgICAgIC8v5pWw57uE5pON5L2c5pa55rOVXG4gICAgICAgICAgICB1dGlscy5leHRlbmQobG9jYWwsIHtcbiAgICAgICAgICAgICAgJHNldDogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgICAgIGxvY2FsLnNwbGljZShpLCAxLCB1dGlscy5pc09iamVjdChpdGVtKSA/IHV0aWxzLmV4dGVuZCh7fSwgbG9jYWxbaV0sIGl0ZW0pIDogaXRlbSlcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgJHJlcGxhY2U6IGZ1bmN0aW9uKGksIGl0ZW0pIHtcbiAgICAgICAgICAgICAgICBsb2NhbC5zcGxpY2UoaSwgMSwgaXRlbSlcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgJHJlbW92ZTogZnVuY3Rpb24oaSkge1xuICAgICAgICAgICAgICAgIGxvY2FsLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBhcnJheU1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgICAgICAgICAgICAgbG9jYWxbbWV0aG9kXSA9IHV0aWxzLmFmdGVyRm4obG9jYWxbbWV0aG9kXSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgZGlycy5mb3JFYWNoKGZ1bmN0aW9uKGRpcikge1xuICAgICAgICAgICAgICAgICAgZGlyLmxpc3RQYXRoLmZvckVhY2goZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVmb3JtZWQgPSBzY29wZS5yZWZvcm1TY29wZShkaXIudm0sIHBhdGgpXG4gICAgICAgICAgICAgICAgICAgIHJlZm9ybWVkLnZtLiR1cGRhdGUocmVmb3JtZWQucGF0aClcbiAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZGlycyA9IGxvY2FsLl9fZGlyc19fICA9IFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL+S4gOS4quaVsOe7hOWkmuWkhOS9v+eUqFxuICAgICAgICAgIC8vVE9ETyDnp7vpmaTml7bnmoTmg4XlhrVcbiAgICAgICAgICBpZihkaXJzLmluZGV4T2YodGhhdCkgPT09IC0xKSB7XG4gICAgICAgICAgICBkaXJzLnB1c2godGhhdClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICB9ZWxzZXtcbiAgICAgIC8vVE9ETyDmma7pgJrlr7nosaHnmoTpgY3ljoZcbiAgICB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldEFuY2hvcihkaXIsIGluZGV4KSB7XG4gIHZhciB2bSA9IGRpci52bUxpc3RbaW5kZXhdXG4gIHJldHVybiB2bSA/ICggZGlyLmlzUmFuZ2UgPyB2bS5fX2FuY2hvciA6IHZtLiRlbCApIDogZGlyLmFuY2hvcnMuZW5kXG59XG5cbi8v5qC55o2u57Si5byV6I635Y+W6K+l5qyh6L+t5Luj5Lit55qE5omA5pyJ5YWD57SgXG5mdW5jdGlvbiBnZXROb2Rlc0J5SW5kZXgoZGlyLCBpbmRleCkge1xuICB2YXIgdm1MaXN0ID0gZGlyLnZtTGlzdFxuICAgICwgYW5jaG9yID0gdm1MaXN0W2luZGV4XS5fX2FuY2hvclxuICAgICwgbmV4dCA9IHZtTGlzdFtpbmRleCArIDFdXG4gICAgO1xuICByZXR1cm4gW2FuY2hvcl0uY29uY2F0KGRpci5nZXROb2RlcyhhbmNob3IsIG5leHQgJiYgbmV4dC5fX2FuY2hvcikpXG59XG5cbmZ1bmN0aW9uIGdldEVsQnlJbmRleCAoZGlyLCBpbmRleCkge1xuICB2YXIgZnJhZyA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgaWYoZGlyLmlzUmFuZ2UpIHtcbiAgICBnZXROb2Rlc0J5SW5kZXgoZGlyLCBpbmRleCkuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICBmcmFnLmFwcGVuZENoaWxkKG5vZGUpXG4gICAgfSlcbiAgfWVsc2V7XG4gICAgZnJhZy5hcHBlbmRDaGlsZChkaXIudm1MaXN0W2luZGV4XS4kZWwpXG4gIH1cbiAgcmV0dXJuIGZyYWdcbn1cblxuZnVuY3Rpb24gYXJyRGlmZihhcnIxLCBhcnIyLCB0cmFja0lkKSB7XG4gIHZhciBhcnIyQ29weSA9IGFycjIuc2xpY2UoKTtcbiAgcmV0dXJuIGFycjEuZmlsdGVyKGZ1bmN0aW9uKGVsKSB7XG4gICAgdmFyIHJlc3VsdCwgaW5kZXggPSBpbmRleEJ5VHJhY2tJZChlbCwgYXJyMkNvcHksIHRyYWNrSWQpXG4gICAgaWYoaW5kZXggPCAwKSB7XG4gICAgICByZXN1bHQgPSB0cnVlXG4gICAgfWVsc2V7XG4gICAgICBhcnIyQ29weS5zcGxpY2UoaW5kZXgsIDEpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSlcbn1cblxuZnVuY3Rpb24gaW5kZXhCeVRyYWNrSWQoaXRlbSwgbGlzdCwgdHJhY2tJZCwgc3RhcnRJbmRleCkge1xuICBzdGFydEluZGV4ID0gc3RhcnRJbmRleCB8fCAwO1xuICB2YXIgaW5kZXggPSBsaXN0LmluZGV4T2YoaXRlbSwgc3RhcnRJbmRleCk7XG4gIGlmKGluZGV4ID09PSAtMSAmJiB0cmFja0lkKXtcbiAgICBmb3IodmFyIGkgPSBzdGFydEluZGV4LCBpdGVtMTsgaXRlbTEgPSBsaXN0W2ldOyBpKyspIHtcbiAgICAgIGlmKGl0ZW1bdHJhY2tJZF0gPT09ICBpdGVtMVt0cmFja0lkXSAmJiAhdXRpbHMuaXNVbmRlZmluZWQoaXRlbVt0cmFja0lkXSkpe1xuICAgICAgICBpbmRleCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gaW5kZXg7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/moLflvI/mjIfku6RcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJylcblxuLy/pu5jorqTljZXkvY3kuLogcHgg55qE5bGe5oCnXG52YXIgcGl4ZWxBdHRycyA9IFtcbiAgJ3dpZHRoJywnaGVpZ2h0JywnbWluLXdpZHRoJywgJ21pbi1oZWlnaHQnLCAnbWF4LXdpZHRoJywgJ21heC1oZWlnaHQnLFxuICAnbWFyZ2luJywgJ21hcmdpbi10b3AnLCAnbWFyZ2luLXJpZ2h0JywgJ21hcmdpbi1sZWZ0JywgJ21hcmdpbi1ib3R0b20nLFxuICAncGFkZGluZycsICdwYWRkaW5nLXRvcCcsICdwYWRkaW5nLXJpZ2h0JywgJ3BhZGRpbmctYm90dG9tJywgJ3BhZGRpbmctbGVmdCcsXG4gICd0b3AnLCAnbGVmdCcsICdyaWdodCcsICdib3R0b20nXG5dXG5cbi8v5a+55LqOIElFNiwgSUU3IOa1j+iniOWZqOmcgOimgeS9v+eUqCBgZWwuc3R5bGUuZ2V0QXR0cmlidXRlKCdjc3NUZXh0JylgIOS4jiBgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0JylgIOadpeivu+WGmSBzdHlsZSDlrZfnrKblsZ7mgKdcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5pdFN0eWxlID0gdGhpcy5lbC5zdHlsZS5nZXRBdHRyaWJ1dGUgPyB0aGlzLmVsLnN0eWxlLmdldEF0dHJpYnV0ZSgnY3NzVGV4dCcpIDogdGhpcy5lbC5nZXRBdHRyaWJ1dGUoJ3N0eWxlJylcbiAgfSxcbiAgdXBkYXRlOiBmdW5jdGlvbihzdHlsZXMpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBzdHlsZVN0ciA9IHRoaXMuaW5pdFN0eWxlID8gdGhpcy5pbml0U3R5bGUucmVwbGFjZSgvOz8kLywgJzsnKSA6ICcnO1xuICAgIHZhciBkYXNoS2V5LCB2YWw7XG5cbiAgICBpZih0eXBlb2Ygc3R5bGVzID09PSAnc3RyaW5nJykge1xuICAgICAgc3R5bGVTdHIgKz0gc3R5bGVzO1xuICAgIH1lbHNlIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBzdHlsZXMpIHtcbiAgICAgICAgdmFsID0gc3R5bGVzW2tleV07XG5cbiAgICAgICAgLy9tYXJnaW5Ub3AgLT4gbWFyZ2luLXRvcC4g6am85bOw6L2s6L+e5o6l56ym5byPXG4gICAgICAgIGRhc2hLZXkgPSB1dGlscy5jYW1lbFRvSHlwaGVuKGtleSk7XG5cbiAgICAgICAgaWYgKHBpeGVsQXR0cnMuaW5kZXhPZihkYXNoS2V5KSA+PSAwICYmIHV0aWxzLmlzTnVtZXJpYyh2YWwpKSB7XG4gICAgICAgICAgdmFsICs9ICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYoIXV0aWxzLmlzVW5kZWZpbmVkKHZhbCkpe1xuICAgICAgICAgIHN0eWxlU3RyICs9IGRhc2hLZXkgKyAnOiAnICsgdmFsICsgJzsgJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZihlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgLy/ogIEgSUVcbiAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHN0eWxlU3RyKTtcbiAgICB9ZWxzZXtcbiAgICAgIGVsLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBzdHlsZVN0cik7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIC8v5bCG5qih5p2/L+WFg+e0oC9ub2RlbGlzdCDljIXoo7nlnKggZnJhZ21lbnQg5LitXG4gIGNyZWF0ZUNvbnRlbnQ6IGZ1bmN0aW9uIGNyZWF0ZUNvbnRlbnQodHBsKSB7XG4gICAgdmFyIGNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgIHZhciB3cmFwZXI7XG4gICAgdmFyIG5vZGVzID0gW107XG4gICAgaWYodXRpbHMuaXNPYmplY3QodHBsKSkge1xuICAgICAgaWYodHBsLm5vZGVOYW1lICYmIHRwbC5ub2RlVHlwZSkge1xuICAgICAgICAvL2RvbSDlhYPntKBcbiAgICAgICAgY29udGVudC5hcHBlbmRDaGlsZCh0cGwpO1xuICAgICAgfWVsc2UgaWYoJ2xlbmd0aCcgaW4gdHBsKXtcbiAgICAgICAgLy9ub2RlbGlzdFxuICAgICAgICBub2RlcyA9IHRwbDtcbiAgICAgIH1cbiAgICB9ZWxzZSB7XG4gICAgICB3cmFwZXIgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICAgIC8v6Ieq5a6a5LmJ5qCH562+5ZyoIElFOCDkuIvml6DmlYguIOS9v+eUqCBjb21wb25lbnQg5oyH5Luk5pu/5LujXG4gICAgICB3cmFwZXIuaW5uZXJIVE1MID0gKHRwbCArICcnKS50cmltKCk7XG4gICAgICBub2RlcyA9IHdyYXBlci5jaGlsZE5vZGVzO1xuICAgIH1cbiAgICB3aGlsZShub2Rlc1swXSkge1xuICAgICAgY29udGVudC5hcHBlbmRDaGlsZChub2Rlc1swXSlcbiAgICB9XG4gICAgcmV0dXJuIGNvbnRlbnQ7XG4gIH0sXG5cbiAgLy/ojrflj5blhYPntKDlsZ7mgKdcbiAgZ2V0QXR0cnM6IGZ1bmN0aW9uKGVsKSB7XG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBlbC5hdHRyaWJ1dGVzO1xuICAgIHZhciBhdHRycyA9IHt9O1xuXG4gICAgZm9yKHZhciBpID0gYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgLy/ov57mjqXnrKbovazpqbzls7Dlhpnms5VcbiAgICAgIGF0dHJzW3V0aWxzLmh5cGhlblRvQ2FtZWwoYXR0cmlidXRlc1tpXS5ub2RlTmFtZSldID0gYXR0cmlidXRlc1tpXS52YWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXR0cnM7XG4gIH0sXG5cbiAgaGFzQXR0cjogZnVuY3Rpb24oZWwsIGF0dHJOYW1lKSB7XG4gICAgcmV0dXJuIGVsLmhhc0F0dHJpYnV0ZSA/IGVsLmhhc0F0dHJpYnV0ZShhdHRyTmFtZSkgOiAhdXRpbHMuaXNVbmRlZmluZWQoZWxbYXR0ck5hbWVdKTtcbiAgfVxufTtcbiIsIihmdW5jdGlvbihyb290KXtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZXhwb3J0cy5yb290ID0gcm9vdDtcbiAgZXhwb3J0cy5kb2N1bWVudCA9IHJvb3QuZG9jdW1lbnQgfHwgcmVxdWlyZSgnanNkb20nKS5qc2RvbSgpO1xuXG59KSgoZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXN9KSgpKTtcbiIsIi8qKlxuICog6KGo6L6+5byP5omn6KGMXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBzY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKVxuXG52YXIgb3BlcmF0b3JzID0ge1xuICAndW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbih2KSB7IHJldHVybiArdjsgfVxuICAsICctJzogZnVuY3Rpb24odikgeyByZXR1cm4gLXY7IH1cbiAgLCAnISc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICF2OyB9XG5cbiAgLCAnWyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdjsgfVxuICAsICd7JzogZnVuY3Rpb24odil7XG4gICAgICB2YXIgciA9IHt9O1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IHYubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHJbdltpXVswXV0gPSB2W2ldWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICAsICd0eXBlb2YnOiBmdW5jdGlvbih2KXsgcmV0dXJuIHR5cGVvZiB2OyB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gbmV3IHYgfVxuICB9XG5cbiwgJ2JpbmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKyByOyB9XG4gICwgJy0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC0gcjsgfVxuICAsICcqJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAqIHI7IH1cbiAgLCAnLyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLyByOyB9XG4gICwgJyUnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICUgcjsgfVxuICAsICc8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8IHI7IH1cbiAgLCAnPic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPiByOyB9XG4gICwgJzw9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8PSByOyB9XG4gICwgJz49JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+PSByOyB9XG4gICwgJz09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PSByOyB9XG4gICwgJyE9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPSByOyB9XG4gICwgJz09PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT09IHI7IH1cbiAgLCAnIT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPT0gcjsgfVxuICAsICcmJic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJiYgcjsgfVxuICAsICd8fCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgfHwgcjsgfVxuICAsICcsJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCwgcjsgfVxuXG4gICwgJy4nOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihyICYmIHBhdGgpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG4gICwgJ1snOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZih0eXBlb2YgciAhPT0gJ3VuZGVmaW5lZCcgJiYgcGF0aCl7XG4gICAgICAgIHBhdGggPSBwYXRoICsgJy4nICsgcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsW3JdO1xuICAgIH1cblxuICAgIC8vVE9ETyDmqKHmnb/kuK3mlrnms5XnmoQgdGhpcyDlupTor6XmjIflkJEgcm9vdFxuICAsICcoJzogZnVuY3Rpb24obCwgcil7IHJldHVybiBsLmFwcGx5KHJvb3QsIHIpIH1cbiAgICAvL2ZpbHRlci4gbmFtZXxmaWx0ZXJcbiAgLCAnfCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gY2FsbEZpbHRlcihsLCByLCBbXSkgfVxuICAsICduZXcnOiBmdW5jdGlvbihsLCByKXtcbiAgICAgIHJldHVybiBsID09PSBEYXRlID8gbmV3IEZ1bmN0aW9uKCdyZXR1cm4gbmV3IERhdGUoJyArIHIuam9pbignLCAnKSArICcpJykoKSA6IG5ldyAoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkobCwgcikpO1xuICAgIH1cblxuICAsICdpbic6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgaWYodGhpcy5yZXBlYXQpIHtcbiAgICAgICAgLy9yZXBlYXRcbiAgICAgICAgcmV0dXJuIHI7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIGwgaW4gcjtcbiAgICAgIH1cbiAgICB9XG4gICwgJ2NhdGNoYnknOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihsWydjYXRjaCddKSB7XG4gICAgICAgIHJldHVybiBsWydjYXRjaCddKHIuYmluZChyb290KSlcbiAgICAgIH1lbHNle1xuICAgICAgICBzdW1tYXJ5Q2FsbCB8fCBjb25zb2xlLmVycm9yKCdjYXRjaGJ5IGV4cGVjdCBhIHByb21pc2UnKVxuICAgICAgICByZXR1cm4gbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLCAndGVybmFyeSc6IHtcbiAgICAnPyc6IGZ1bmN0aW9uKGYsIHMsIHQpIHsgcmV0dXJuIGYgPyBzIDogdDsgfVxuICAsICcoJzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZltzXS5hcHBseShmLCB0KSB9XG5cbiAgICAvL2ZpbHRlci4gbmFtZSB8IGZpbHRlciA6IGFyZzIgOiBhcmczXG4gICwgJ3wnOiBmdW5jdGlvbihmLCBzLCB0KXsgcmV0dXJuIGNhbGxGaWx0ZXIoZiwgcywgdCkgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBjYWxsRmlsdGVyKGFyZywgZmlsdGVyLCBhcmdzKSB7XG4gIGlmKGFyZyAmJiBhcmcudGhlbikge1xuICAgIHJldHVybiBhcmcudGhlbihmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gZmlsdGVyLmFwcGx5KHJvb3QsIFtkYXRhXS5jb25jYXQoYXJncykpXG4gICAgfSk7XG4gIH1lbHNle1xuICAgIHJldHVybiBmaWx0ZXIuYXBwbHkocm9vdCwgW2FyZ10uY29uY2F0KGFyZ3MpKVxuICB9XG59XG5cbnZhciBhcmdOYW1lID0gWydmaXJzdCcsICdzZWNvbmQnLCAndGhpcmQnXVxuICAsIGNvbnRleHQsIHN1bW1hcnksIHN1bW1hcnlDYWxsXG4gICwgcGF0aFxuICAsIHNlbGZcbiAgLCByb290XG4gIDtcblxuLy/pgY3ljoYgYXN0XG52YXIgZXZhbHVhdGUgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHZhciBhcml0eSA9IHRyZWUuYXJpdHlcbiAgICAsIHZhbHVlID0gdHJlZS52YWx1ZVxuICAgICwgYXJncyA9IFtdXG4gICAgLCBuID0gMFxuICAgICwgYXJnXG4gICAgLCByZXNcbiAgICA7XG5cbiAgLy/mk43kvZznrKbmnIDlpJrlj6rmnInkuInlhYNcbiAgZm9yKDsgbiA8IDM7IG4rKyl7XG4gICAgYXJnID0gdHJlZVthcmdOYW1lW25dXTtcbiAgICBpZihhcmcpe1xuICAgICAgaWYoQXJyYXkuaXNBcnJheShhcmcpKXtcbiAgICAgICAgYXJnc1tuXSA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJnLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgYXJnc1tuXS5wdXNoKHR5cGVvZiBhcmdbaV0ua2V5ID09PSAndW5kZWZpbmVkJyA/XG4gICAgICAgICAgICBldmFsdWF0ZShhcmdbaV0pIDogW2FyZ1tpXS5rZXksIGV2YWx1YXRlKGFyZ1tpXSldKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGFyZ3Nbbl0gPSBldmFsdWF0ZShhcmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGFyaXR5ICE9PSAnbGl0ZXJhbCcpIHtcbiAgICBpZihwYXRoICYmIHZhbHVlICE9PSAnLicgJiYgdmFsdWUgIT09ICdbJykge1xuICAgICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gICAgfVxuICAgIGlmKGFyaXR5ID09PSAnbmFtZScpIHtcbiAgICAgIHBhdGggPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBzd2l0Y2goYXJpdHkpe1xuICAgIGNhc2UgJ3VuYXJ5JzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Rlcm5hcnknOlxuICAgICAgdHJ5e1xuICAgICAgICByZXMgPSBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpLmFwcGx5KHRyZWUsIGFyZ3MpO1xuICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAvL3N1bW1hcnlDYWxsIHx8IGNvbnNvbGUud2FybihlKTtcbiAgICAgIH1cbiAgICBicmVhaztcbiAgICBjYXNlICdsaXRlcmFsJzpcbiAgICAgIHJlcyA9IHZhbHVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3JlcGVhdCc6XG4gICAgICBzdW1tYXJ5LmFzc2lnbm1lbnRzW3ZhbHVlXSA9IHRydWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbmFtZSc6XG4gICAgICBzdW1tYXJ5LmxvY2Fsc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gZ2V0VmFsdWUodmFsdWUsIGNvbnRleHQubG9jYWxzKTtcbiAgICBicmVhaztcbiAgICBjYXNlICdmaWx0ZXInOlxuICAgICAgc3VtbWFyeS5maWx0ZXJzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBjb250ZXh0LmZpbHRlcnNbdmFsdWVdO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RoaXMnOlxuICAgICAgcmVzID0gY29udGV4dC5sb2NhbHM7Ly9UT0RPIHRoaXMg5oyH5ZCRIHZtIOi/mOaYryBkaXI/XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cbmZ1bmN0aW9uIGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSl7XG4gIHJldHVybiBvcGVyYXRvcnNbYXJpdHldW3ZhbHVlXSB8fCBmdW5jdGlvbigpIHsgcmV0dXJuOyB9XG59XG5cbmZ1bmN0aW9uIHJlc2V0KHNjb3BlLCB0aGF0KSB7XG4gIHN1bW1hcnlDYWxsID0gdHJ1ZTtcbiAgaWYoc2NvcGUpIHtcbiAgICByb290ID0gc2NvcGUuJHJvb3Q7XG4gICAgc3VtbWFyeUNhbGwgPSBmYWxzZTtcbiAgICBjb250ZXh0ID0ge2xvY2Fsczogc2NvcGUgfHwge30sIGZpbHRlcnM6IHNjb3BlLmNvbnN0cnVjdG9yLmZpbHRlcnMgfHwge319O1xuICB9ZWxzZXtcbiAgICBjb250ZXh0ID0ge2ZpbHRlcnM6IHt9LCBsb2NhbHM6IHt9fTtcbiAgfVxuICBpZih0aGF0KXtcbiAgICBzZWxmID0gdGhhdDtcbiAgfVxuXG4gIHN1bW1hcnkgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge30sIHBhdGhzOiB7fSwgYXNzaWdubWVudHM6IHt9fTtcbiAgcGF0aCA9ICcnO1xufVxuXG4vL+WcqOS9nOeUqOWfn+S4reafpeaJvuWAvFxudmFyIGdldFZhbHVlID0gZnVuY3Rpb24oa2V5LCB2bSkge1xuICB2YXIgcmVmb3JtZWQgPSBzY29wZS5yZWZvcm1TY29wZSh2bSwga2V5KVxuICByZXR1cm4gcmVmb3JtZWQudm1bcmVmb3JtZWQucGF0aF1cbn1cblxuLy/ooajovr7lvI/msYLlgLxcbi8vdHJlZTogcGFyc2VyIOeUn+aIkOeahCBhc3Rcbi8vc2NvcGUg5omn6KGM546v5aKDXG5leHBvcnRzLmV2YWwgPSBmdW5jdGlvbih0cmVlLCBzY29wZSwgdGhhdCkge1xuICByZXNldChzY29wZSB8fCB7fSwgdGhhdCk7XG5cbiAgcmV0dXJuIGV2YWx1YXRlKHRyZWUpO1xufTtcblxuLy/ooajovr7lvI/mkZjopoFcbi8vcmV0dXJuOiB7ZmlsdGVyczpbXSwgbG9jYWxzOltdLCBwYXRoczogW10sIGFzc2lnbm1lbnRzOiBbXX1cbmV4cG9ydHMuc3VtbWFyeSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgcmVzZXQoKTtcblxuICBldmFsdWF0ZSh0cmVlKTtcblxuICBpZihwYXRoKSB7XG4gICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gIH1cbiAgZm9yKHZhciBrZXkgaW4gc3VtbWFyeSkge1xuICAgIHN1bW1hcnlba2V5XSA9IE9iamVjdC5rZXlzKHN1bW1hcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIHN1bW1hcnk7XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydHMuYWRkRXZlbnQgPSBmdW5jdGlvbiBhZGRFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIGZhbHNlKTtcbiAgfWVsc2V7XG4gICAgZWwuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufVxuXG5leHBvcnRzLnJlbW92ZUV2ZW50ID0gZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmKGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyKTtcbiAgfWVsc2V7XG4gICAgZWwuZGV0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufSIsIlwidXNlIHN0cmljdFwiO1xuLy9KYXZhc2NyaXB0IGV4cHJlc3Npb24gcGFyc2VyIG1vZGlmaWVkIGZvcm0gQ3JvY2tmb3JkJ3MgVERPUCBwYXJzZXJcbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG5cdGZ1bmN0aW9uIEYoKSB7fVxuXHRGLnByb3RvdHlwZSA9IG87XG5cdHJldHVybiBuZXcgRigpO1xufTtcblxudmFyIHNvdXJjZTtcblxudmFyIGVycm9yID0gZnVuY3Rpb24gKG1lc3NhZ2UsIHQpIHtcblx0dCA9IHQgfHwgdGhpcztcbiAgdmFyIG1zZyA9IG1lc3NhZ2UgKz0gXCIgQnV0IGZvdW5kICdcIiArIHQudmFsdWUgKyBcIidcIiArICh0LmZyb20gPyBcIiBhdCBcIiArIHQuZnJvbSA6IFwiXCIpICsgXCIgaW4gJ1wiICsgc291cmNlICsgXCInXCI7XG4gIHZhciBlID0gbmV3IEVycm9yKG1zZyk7XG5cdGUubmFtZSA9IHQubmFtZSA9IFwiU3ludGF4RXJyb3JcIjtcblx0dC5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhyb3cgZTtcbn07XG5cbnZhciB0b2tlbml6ZSA9IGZ1bmN0aW9uIChjb2RlLCBwcmVmaXgsIHN1ZmZpeCkge1xuXHR2YXIgYzsgLy8gVGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgZnJvbTsgLy8gVGhlIGluZGV4IG9mIHRoZSBzdGFydCBvZiB0aGUgdG9rZW4uXG5cdHZhciBpID0gMDsgLy8gVGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGNoYXJhY3Rlci5cblx0dmFyIGxlbmd0aCA9IGNvZGUubGVuZ3RoO1xuXHR2YXIgbjsgLy8gVGhlIG51bWJlciB2YWx1ZS5cblx0dmFyIHE7IC8vIFRoZSBxdW90ZSBjaGFyYWN0ZXIuXG5cdHZhciBzdHI7IC8vIFRoZSBzdHJpbmcgdmFsdWUuXG5cblx0dmFyIHJlc3VsdCA9IFtdOyAvLyBBbiBhcnJheSB0byBob2xkIHRoZSByZXN1bHRzLlxuXG5cdC8vIE1ha2UgYSB0b2tlbiBvYmplY3QuXG5cdHZhciBtYWtlID0gZnVuY3Rpb24gKHR5cGUsIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGUgOiB0eXBlLFxuXHRcdFx0dmFsdWUgOiB2YWx1ZSxcblx0XHRcdGZyb20gOiBmcm9tLFxuXHRcdFx0dG8gOiBpXG5cdFx0fTtcblx0fTtcblxuXHQvLyBCZWdpbiB0b2tlbml6YXRpb24uIElmIHRoZSBzb3VyY2Ugc3RyaW5nIGlzIGVtcHR5LCByZXR1cm4gbm90aGluZy5cblx0aWYgKCFjb2RlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGNvZGUgdGV4dCwgb25lIGNoYXJhY3RlciBhdCBhIHRpbWUuXG5cdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0d2hpbGUgKGMpIHtcblx0XHRmcm9tID0gaTtcblxuXHRcdGlmIChjIDw9ICcgJykgeyAvLyBJZ25vcmUgd2hpdGVzcGFjZS5cblx0XHRcdGkgKz0gMTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9IGVsc2UgaWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7IC8vIG5hbWUuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fFxuXHRcdFx0XHRcdChjID49ICcwJyAmJiBjIDw9ICc5JykgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCduYW1lJywgc3RyKSk7XG5cdFx0fSBlbHNlIGlmIChjID49ICcwJyAmJiBjIDw9ICc5Jykge1xuXHRcdFx0Ly8gbnVtYmVyLlxuXG5cdFx0XHQvLyBBIG51bWJlciBjYW5ub3Qgc3RhcnQgd2l0aCBhIGRlY2ltYWwgcG9pbnQuIEl0IG11c3Qgc3RhcnQgd2l0aCBhIGRpZ2l0LFxuXHRcdFx0Ly8gcG9zc2libHkgJzAnLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblxuXHRcdFx0Ly8gTG9vayBmb3IgbW9yZSBkaWdpdHMuXG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYSBkZWNpbWFsIGZyYWN0aW9uIHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJy4nKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGFuIGV4cG9uZW50IHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJ2UnIHx8IGMgPT09ICdFJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjID09PSAnLScgfHwgYyA9PT0gJysnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgZXhwb25lbnRcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH0gd2hpbGUgKGMgPj0gJzAnICYmIGMgPD0gJzknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBuZXh0IGNoYXJhY3RlciBpcyBub3QgYSBsZXR0ZXIuXG5cblx0XHRcdGlmIChjID49ICdhJyAmJiBjIDw9ICd6Jykge1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZSB0byBhIG51bWJlci4gSWYgaXQgaXMgZmluaXRlLCB0aGVuIGl0IGlzIGEgZ29vZFxuXHRcdFx0Ly8gdG9rZW4uXG5cblx0XHRcdG4gPSArc3RyO1xuXHRcdFx0aWYgKGlzRmluaXRlKG4pKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ251bWJlcicsIG4pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc3RyaW5nXG5cblx0XHR9IGVsc2UgaWYgKGMgPT09ICdcXCcnIHx8IGMgPT09ICdcIicpIHtcblx0XHRcdHN0ciA9ICcnO1xuXHRcdFx0cSA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcgJykge1xuXHRcdFx0XHRcdG1ha2UoJ3N0cmluZycsIHN0cik7XG5cdFx0XHRcdFx0ZXJyb3IoYyA9PT0gJ1xcbicgfHwgYyA9PT0gJ1xccicgfHwgYyA9PT0gJycgP1xuXHRcdFx0XHRcdFx0XCJVbnRlcm1pbmF0ZWQgc3RyaW5nLlwiIDpcblx0XHRcdFx0XHRcdFwiQ29udHJvbCBjaGFyYWN0ZXIgaW4gc3RyaW5nLlwiLCBtYWtlKCcnLCBzdHIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIHRoZSBjbG9zaW5nIHF1b3RlLlxuXG5cdFx0XHRcdGlmIChjID09PSBxKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciBlc2NhcGVtZW50LlxuXG5cdFx0XHRcdGlmIChjID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRzd2l0Y2ggKGMpIHtcblx0XHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxiJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2YnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGYnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcbic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxyJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3QnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndSc6XG5cdFx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IHBhcnNlSW50KGNvZGUuc3Vic3RyKGkgKyAxLCA0KSwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0Zpbml0ZShjKSB8fCBjIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcblx0XHRcdFx0XHRcdGkgKz0gNDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdC8vIGNvbWJpbmluZ1xuXG5cdFx0fSBlbHNlIGlmIChwcmVmaXguaW5kZXhPZihjKSA+PSAwKSB7XG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoaSA+PSBsZW5ndGggfHwgc3VmZml4LmluZGV4T2YoYykgPCAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgc3RyKSk7XG5cblx0XHRcdC8vIHNpbmdsZS1jaGFyYWN0ZXIgb3BlcmF0b3JcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdvcGVyYXRvcicsIGMpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBtYWtlX3BhcnNlID0gZnVuY3Rpb24gKHZhcnMpIHtcblx0dmFycyA9IHZhcnMgfHwge307Ly/pooTlrprkuYnnmoTlj5jph49cblx0dmFyIHN5bWJvbF90YWJsZSA9IHt9O1xuXHR2YXIgdG9rZW47XG5cdHZhciB0b2tlbnM7XG5cdHZhciB0b2tlbl9ucjtcblx0dmFyIGNvbnRleHQ7XG5cblx0dmFyIGl0c2VsZiA9IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHR2YXIgZmluZCA9IGZ1bmN0aW9uIChuKSB7XG5cdFx0bi5udWQgPSBpdHNlbGY7XG5cdFx0bi5sZWQgPSBudWxsO1xuXHRcdG4uc3RkID0gbnVsbDtcblx0XHRuLmxicCA9IDA7XG5cdFx0cmV0dXJuIG47XG5cdH07XG5cblx0dmFyIGFkdmFuY2UgPSBmdW5jdGlvbiAoaWQpIHtcblx0XHR2YXIgYSwgbywgdCwgdjtcblx0XHRpZiAoaWQgJiYgdG9rZW4uaWQgIT09IGlkKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkICdcIiArIGlkICsgXCInLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICh0b2tlbl9uciA+PSB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHR0b2tlbiA9IHN5bWJvbF90YWJsZVtcIihlbmQpXCJdO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ID0gdG9rZW5zW3Rva2VuX25yXTtcblx0XHR0b2tlbl9uciArPSAxO1xuXHRcdHYgPSB0LnZhbHVlO1xuXHRcdGEgPSB0LnR5cGU7XG5cdFx0aWYgKChhID09PSBcIm9wZXJhdG9yXCIgfHwgYSAhPT0gJ3N0cmluZycpICYmIHYgaW4gc3ltYm9sX3RhYmxlKSB7XG5cdFx0XHQvL3RydWUsIGZhbHNlIOetieebtOaOpemHj+S5n+S8mui/m+WFpeatpOWIhuaUr1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVt2XTtcblx0XHRcdGlmICghbykge1xuXHRcdFx0XHRlcnJvcihcIlVua25vd24gb3BlcmF0b3IuXCIsIHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJuYW1lXCIpIHtcblx0XHRcdG8gPSBmaW5kKHQpO1xuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJzdHJpbmdcIiB8fCBhID09PSBcIm51bWJlclwiIHx8IGEgPT09IFwicmVnZXhwXCIpIHtcblx0XHRcdG8gPSBzeW1ib2xfdGFibGVbXCIobGl0ZXJhbClcIl07XG5cdFx0XHRhID0gXCJsaXRlcmFsXCI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVycm9yKFwiVW5leHBlY3RlZCB0b2tlbi5cIiwgdCk7XG5cdFx0fVxuXHRcdHRva2VuID0gY3JlYXRlKG8pO1xuXHRcdHRva2VuLmZyb20gPSB0LmZyb207XG5cdFx0dG9rZW4udG8gPSB0LnRvO1xuXHRcdHRva2VuLnZhbHVlID0gdjtcblx0XHR0b2tlbi5hcml0eSA9IGE7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9O1xuXG4gIC8v6KGo6L6+5byPXG4gIC8vcmJwOiByaWdodCBiaW5kaW5nIHBvd2VyIOWPs+S+p+e6puadn+WKm1xuXHR2YXIgZXhwcmVzc2lvbiA9IGZ1bmN0aW9uIChyYnApIHtcblx0XHR2YXIgbGVmdDtcblx0XHR2YXIgdCA9IHRva2VuO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRsZWZ0ID0gdC5udWQoKTtcblx0XHR3aGlsZSAocmJwIDwgdG9rZW4ubGJwKSB7XG5cdFx0XHR0ID0gdG9rZW47XG5cdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRsZWZ0ID0gdC5sZWQobGVmdCk7XG5cdFx0fVxuXHRcdHJldHVybiBsZWZ0O1xuXHR9O1xuXG5cdHZhciBvcmlnaW5hbF9zeW1ib2wgPSB7XG5cdFx0bnVkIDogZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXJyb3IoXCJVbmRlZmluZWQuXCIsIHRoaXMpO1xuXHRcdH0sXG5cdFx0bGVkIDogZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdGVycm9yKFwiTWlzc2luZyBvcGVyYXRvci5cIiwgdGhpcyk7XG5cdFx0fVxuXHR9O1xuXG5cdHZhciBzeW1ib2wgPSBmdW5jdGlvbiAoaWQsIGJwKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2xfdGFibGVbaWRdO1xuXHRcdGJwID0gYnAgfHwgMDtcblx0XHRpZiAocykge1xuXHRcdFx0aWYgKGJwID49IHMubGJwKSB7XG5cdFx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHMgPSBjcmVhdGUob3JpZ2luYWxfc3ltYm9sKTtcblx0XHRcdHMuaWQgPSBzLnZhbHVlID0gaWQ7XG5cdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0c3ltYm9sX3RhYmxlW2lkXSA9IHM7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBjb25zdGFudCA9IGZ1bmN0aW9uIChzLCB2LCBhKSB7XG5cdFx0dmFyIHggPSBzeW1ib2wocyk7XG5cdFx0eC5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gc3ltYm9sX3RhYmxlW3RoaXMuaWRdLnZhbHVlO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHR4LnZhbHVlID0gdjtcblx0XHRyZXR1cm4geDtcblx0fTtcblxuXHR2YXIgaW5maXggPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGluZml4ciA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwIC0gMSk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIHByZWZpeCA9IGZ1bmN0aW9uIChpZCwgbnVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQpO1xuXHRcdHMubnVkID0gbnVkIHx8IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDcwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHN5bWJvbChcIihlbmQpXCIpO1xuXHRzeW1ib2woXCIobmFtZSlcIik7XG5cdHN5bWJvbChcIjpcIik7XG5cdHN5bWJvbChcIilcIik7XG5cdHN5bWJvbChcIl1cIik7XG5cdHN5bWJvbChcIn1cIik7XG5cdHN5bWJvbChcIixcIik7XG5cblx0Y29uc3RhbnQoXCJ0cnVlXCIsIHRydWUpO1xuXHRjb25zdGFudChcImZhbHNlXCIsIGZhbHNlKTtcblx0Y29uc3RhbnQoXCJudWxsXCIsIG51bGwpO1xuXHRjb25zdGFudChcInVuZGVmaW5lZFwiKTtcblxuXHRjb25zdGFudChcIk1hdGhcIiwgTWF0aCk7XG5cdGNvbnN0YW50KFwiRGF0ZVwiLCBEYXRlKTtcblx0Zm9yKHZhciB2IGluIHZhcnMpIHtcblx0XHRjb25zdGFudCh2LCB2YXJzW3ZdKTtcblx0fVxuXG5cdHN5bWJvbChcIihsaXRlcmFsKVwiKS5udWQgPSBpdHNlbGY7XG5cblx0c3ltYm9sKFwidGhpc1wiKS5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdCAgdGhpcy5hcml0eSA9IFwidGhpc1wiO1xuXHQgIHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdC8vT3BlcmF0b3IgUHJlY2VkZW5jZTpcblx0Ly9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvT3BlcmF0b3JfUHJlY2VkZW5jZVxuXG4gIC8vaW5maXgoJywnLCAxKTtcblx0aW5maXgoXCI/XCIsIDIwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHR0aGlzLnRoaXJkID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4cihcIiYmXCIsIDMxKTtcblx0aW5maXhyKFwifHxcIiwgMzApO1xuXG5cdGluZml4cihcIj09PVwiLCA0MCk7XG5cdGluZml4cihcIiE9PVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPFwiLCA0MCk7XG5cdGluZml4cihcIjw9XCIsIDQwKTtcblx0aW5maXhyKFwiPlwiLCA0MCk7XG5cdGluZml4cihcIj49XCIsIDQwKTtcblxuXHRpbmZpeChcImluXCIsIDQ1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRpZiAoY29udGV4dCA9PT0gJ3JlcGVhdCcpIHtcblx0XHRcdC8vIGBpbmAgYXQgcmVwZWF0IGJsb2NrXG5cdFx0XHRsZWZ0LmFyaXR5ID0gJ3JlcGVhdCc7XG5cdFx0XHR0aGlzLnJlcGVhdCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIitcIiwgNTApO1xuXHRpbmZpeChcIi1cIiwgNTApO1xuXG5cdGluZml4KFwiKlwiLCA2MCk7XG5cdGluZml4KFwiL1wiLCA2MCk7XG5cdGluZml4KFwiJVwiLCA2MCk7XG5cblx0aW5maXgoXCIoXCIsIDc1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKGxlZnQuaWQgPT09IFwiLlwiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdC5maXJzdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gbGVmdC5zZWNvbmQ7XG5cdFx0XHR0aGlzLnRoaXJkID0gYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdGlmICgobGVmdC5hcml0eSAhPT0gXCJ1bmFyeVwiIHx8IGxlZnQuaWQgIT09IFwiZnVuY3Rpb25cIikgJiZcblx0XHRcdFx0bGVmdC5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbGVmdC5hcml0eSAhPT0gXCJsaXRlcmFsXCIgJiYgbGVmdC5pZCAhPT0gXCIoXCIgJiZcblx0XHRcdFx0bGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIikge1xuXHRcdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgdmFyaWFibGUgbmFtZS5cIiwgbGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCIpXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIuXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdGlmICh0b2tlbi5hcml0eSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSBwcm9wZXJ0eSBuYW1lLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRva2VuLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0dGhpcy5zZWNvbmQgPSB0b2tlbjtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiW1wiLCA2MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vZmlsdGVyXG5cdGluZml4KFwifFwiLCAxMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYTtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0b2tlbi5hcml0eSA9ICdmaWx0ZXInO1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigxMCk7XG5cdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdGlmICh0b2tlbi5pZCA9PT0gJzonKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ3Rlcm5hcnknO1xuXHRcdFx0dGhpcy50aGlyZCA9IGEgPSBbXTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGFkdmFuY2UoJzonKTtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMTApKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIjpcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcbiAgaW5maXgoJ2NhdGNoYnknLCAxMCk7XG5cblx0cHJlZml4KFwiIVwiKTtcblx0cHJlZml4KFwiLVwiKTtcblx0cHJlZml4KFwidHlwZW9mXCIpO1xuXG5cdHByZWZpeChcIihcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBlID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gZTtcblx0fSk7XG5cblx0cHJlZml4KFwiW1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwiXVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigxKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0dGhpcy5maXJzdCA9IGE7XG5cdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KFwie1wiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXSxcdG4sIHY7XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIn1cIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0biA9IHRva2VuO1xuXHRcdFx0XHRpZiAobi5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbi5hcml0eSAhPT0gXCJsaXRlcmFsXCIpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBwcm9wZXJ0eSBuYW1lOiBcIiwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdFx0YWR2YW5jZShcIjpcIik7XG5cdFx0XHRcdHYgPSBleHByZXNzaW9uKDEpO1xuXHRcdFx0XHR2LmtleSA9IG4udmFsdWU7XG5cdFx0XHRcdGEucHVzaCh2KTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwifVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoJ25ldycsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDc5KTtcblx0XHRpZih0b2tlbi5pZCA9PT0gJygnKSB7XG5cdFx0XHRhZHZhbmNlKFwiKFwiKTtcblx0XHRcdHRoaXMuYXJpdHkgPSAnYmluYXJ5Jztcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdFx0YWR2YW5jZShcIilcIik7XG5cdFx0fWVsc2V7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0Ly9fc291cmNlOiDooajovr7lvI/ku6PnoIHlrZfnrKbkuLJcblx0Ly9fY29udGV4dDog6KGo6L6+5byP55qE6K+t5Y+l546v5aKDXG5cdHJldHVybiBmdW5jdGlvbiAoX3NvdXJjZSwgX2NvbnRleHQpIHtcbiAgICBzb3VyY2UgPSBfc291cmNlO1xuXHRcdHRva2VucyA9IHRva2VuaXplKF9zb3VyY2UsICc9PD4hKy0qJnwvJV4nLCAnPTw+JnwnKTtcblx0XHR0b2tlbl9uciA9IDA7XG5cdFx0Y29udGV4dCA9IF9jb250ZXh0O1xuXHRcdGFkdmFuY2UoKTtcblx0XHR2YXIgcyA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIihlbmQpXCIpO1xuXHRcdHJldHVybiBzO1xuXHR9O1xufTtcblxuZXhwb3J0cy5wYXJzZSA9IG1ha2VfcGFyc2UoKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8v5qC55o2u5Y+Y6YeP5Y+KIHZtIOehruWumuWPmOmHj+aJgOWxnueahOecn+atoyB2bVxudmFyIHJlZm9ybVNjb3BlID0gZnVuY3Rpb24gKHZtLCBwYXRoKSB7XG4gIHZhciBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aChwYXRoKTtcbiAgdmFyIGN1ciA9IHZtLCBsb2NhbCA9IHBhdGhzWzBdO1xuICB2YXIgYXNzLCBjdXJWbSA9IGN1cjtcblxuICB3aGlsZShjdXIpIHtcbiAgICBjdXJWbSA9IGN1cjtcbiAgICBhc3MgPSBjdXIuX2Fzc2lnbm1lbnRzO1xuICAgIGlmKCBjdXIuX19yZXBlYXQpIHtcbiAgICAgIGlmIChhc3MgJiYgYXNzLmxlbmd0aCkge1xuICAgICAgICAvLyDlhbflkI0gcmVwZWF0IOS4jeS8muebtOaOpeafpeaJvuiHqui6q+S9nOeUqOWfn1xuICAgICAgICBpZiAobG9jYWwgPT09ICckaW5kZXgnIHx8IGxvY2FsID09PSAnJHBhcmVudCcpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIGlmIChsb2NhbCA9PT0gYXNzWzBdKSB7XG4gICAgICAgICAgLy/kv67mraNrZXlcbiAgICAgICAgICBpZiAocGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBwYXRoc1swXSA9ICckZGF0YSc7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdGhzLnNoaWZ0KClcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8v5Yy/5ZCNIHJlcGVhdFxuICAgICAgICBpZiAocGF0aCBpbiBjdXIpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjdXIgPSBjdXIuJHBhcmVudDtcbiAgfVxuXG4gIHJldHVybiB7IHZtOiBjdXJWbSwgcGF0aDogcGF0aHMuam9pbignLicpIH1cbn07XG5cblxuZXhwb3J0cy5yZWZvcm1TY29wZSA9IHJlZm9ybVNjb3BlO1xuIiwidmFyIHRva2VuUmVnID0gL3t7KHsoW159XFxuXSspfXxbXn1cXG5dKyl9fS9nO1xuXG4vL+Wtl+espuS4suS4reaYr+WQpuWMheWQq+aooeadv+WNoOS9jeespuagh+iusFxuZnVuY3Rpb24gaGFzVG9rZW4oc3RyKSB7XG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIHJldHVybiBzdHIgJiYgdG9rZW5SZWcudGVzdChzdHIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRva2VuKHZhbHVlKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgdGV4dE1hcCA9IFtdXG4gICAgLCBzdGFydCA9IDBcbiAgICAsIHZhbCwgdG9rZW5cbiAgICA7XG4gIFxuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICBcbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cbiAgICBcbiAgICB0b2tlbiA9IHtcbiAgICAgIGVzY2FwZTogIXZhbFsyXVxuICAgICwgcGF0aDogKHZhbFsyXSB8fCB2YWxbMV0pLnRyaW0oKVxuICAgICwgcG9zaXRpb246IHRleHRNYXAubGVuZ3RoXG4gICAgLCB0ZXh0TWFwOiB0ZXh0TWFwXG4gICAgfTtcbiAgICBcbiAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcbiAgICBcbiAgICBzdGFydCA9IHRva2VuUmVnLmxhc3RJbmRleDtcbiAgfVxuICBcbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cbiAgXG4gIHRva2Vucy50ZXh0TWFwID0gdGV4dE1hcDtcbiAgXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydHMuaGFzVG9rZW4gPSBoYXNUb2tlbjtcblxuZXhwb3J0cy5wYXJzZVRva2VuID0gcGFyc2VUb2tlbjsiLCJcInVzZSBzdHJpY3RcIjtcblxuLy91dGlsc1xuLy8tLS1cblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnQ7XG5cbnZhciBrZXlQYXRoUmVnID0gLyg/OlxcLnxcXFspL2dcbiAgLCBicmEgPSAvXFxdL2dcbiAgO1xuXG4vL+WwhiBrZXlQYXRoIOi9rOS4uuaVsOe7hOW9ouW8j1xuLy9wYXRoLmtleSwgcGF0aFtrZXldIC0tPiBbJ3BhdGgnLCAna2V5J11cbmZ1bmN0aW9uIHBhcnNlS2V5UGF0aChrZXlQYXRoKXtcbiAgcmV0dXJuIGtleVBhdGgucmVwbGFjZShicmEsICcnKS5zcGxpdChrZXlQYXRoUmVnKTtcbn1cblxuLyoqXG4gKiDlkIjlubblr7nosaFcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2RlZXA9ZmFsc2VdIOaYr+WQpua3seW6puWQiOW5tlxuICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0Li4uXSDmnaXmupDlr7nosaFcbiAqIEByZXR1cm5zIHtPYmplY3R9IOWQiOW5tuWQjueahCB0YXJnZXQg5a+56LGhXG4gKi9cbmZ1bmN0aW9uIGV4dGVuZCgvKiBkZWVwLCB0YXJnZXQsIG9iamVjdC4uLiAqLykge1xuICB2YXIgb3B0aW9uc1xuICAgICwgbmFtZSwgc3JjLCBjb3B5LCBjb3B5SXNBcnJheSwgY2xvbmVcbiAgICAsIHRhcmdldCA9IGFyZ3VtZW50c1swXSB8fCB7fVxuICAgICwgaSA9IDFcbiAgICAsIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGhcbiAgICAsIGRlZXAgPSBmYWxzZVxuICAgIDtcblxuICAvLyBIYW5kbGUgYSBkZWVwIGNvcHkgc2l0dWF0aW9uXG4gIGlmICh0eXBlb2YgdGFyZ2V0ID09PSBcImJvb2xlYW5cIikge1xuICAgIGRlZXAgPSB0YXJnZXQ7XG5cbiAgICAvLyBza2lwIHRoZSBib29sZWFuIGFuZCB0aGUgdGFyZ2V0XG4gICAgdGFyZ2V0ID0gYXJndW1lbnRzWyBpIF0gfHwge307XG4gICAgaSsrO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2Ugd2hlbiB0YXJnZXQgaXMgYSBzdHJpbmcgb3Igc29tZXRoaW5nIChwb3NzaWJsZSBpbiBkZWVwIGNvcHkpXG4gIGlmICh0eXBlb2YgdGFyZ2V0ICE9PSBcIm9iamVjdFwiICYmICF1dGlscy5pc0Z1bmN0aW9uKHRhcmdldCkpIHtcbiAgICB0YXJnZXQgPSB7fTtcbiAgfVxuXG4gIGZvciAoIDsgaSA8IGxlbmd0aDsgaSsrICkge1xuICAgIC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICBpZiAoIChvcHRpb25zID0gYXJndW1lbnRzWyBpIF0pICE9IG51bGwgKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG4gICAgICBmb3IgKCBuYW1lIGluIG9wdGlvbnMgKSB7XG4gICAgICAgIC8vYW5kcm9pZCAyLjMgYnJvd3NlciBjYW4gZW51bSB0aGUgcHJvdG90eXBlIG9mIGNvbnN0cnVjdG9yLi4uXG4gICAgICAgIGlmKG5hbWUgIT09ICdwcm90b3R5cGUnKXtcbiAgICAgICAgICBzcmMgPSB0YXJnZXRbIG5hbWUgXTtcbiAgICAgICAgICBjb3B5ID0gb3B0aW9uc1sgbmFtZSBdO1xuXG5cbiAgICAgICAgICAvLyBSZWN1cnNlIGlmIHdlJ3JlIG1lcmdpbmcgcGxhaW4gb2JqZWN0cyBvciBhcnJheXNcbiAgICAgICAgICBpZiAoIGRlZXAgJiYgY29weSAmJiAoIHV0aWxzLmlzUGxhaW5PYmplY3QoY29weSkgfHwgKGNvcHlJc0FycmF5ID0gdXRpbHMuaXNBcnJheShjb3B5KSkgKSApIHtcblxuICAgICAgICAgICAgLy8gUHJldmVudCBuZXZlci1lbmRpbmcgbG9vcFxuICAgICAgICAgICAgaWYgKCB0YXJnZXQgPT09IGNvcHkgKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCBjb3B5SXNBcnJheSApIHtcbiAgICAgICAgICAgICAgY29weUlzQXJyYXkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNBcnJheShzcmMpID8gc3JjIDogW107XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzUGxhaW5PYmplY3Qoc3JjKSA/IHNyYyA6IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZXZlciBtb3ZlIG9yaWdpbmFsIG9iamVjdHMsIGNsb25lIHRoZW1cbiAgICAgICAgICAgIHRhcmdldFsgbmFtZSBdID0gZXh0ZW5kKCBkZWVwLCBjbG9uZSwgY29weSk7XG5cbiAgICAgICAgICAgIC8vIERvbid0IGJyaW5nIGluIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2UgaWYgKCAhdXRpbHMuaXNVbmRlZmluZWQoY29weSkgJiYgdHlwZW9mIHRhcmdldCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIC8v5LiA5Lqb5oOF5LiLLCDmr5TlpoIgZmlyZWZveCDkuIvnu5nlrZfnrKbkuLLlr7nosaHotYvlgLzml7bkvJrlvILluLhcbiAgICAgICAgICAgIHRhcmdldFtuYW1lXSA9IGNvcHk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBtb2RpZmllZCBvYmplY3RcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcbiAgZnVuY3Rpb24gRigpIHt9XG4gIEYucHJvdG90eXBlID0gbztcbiAgcmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgZGVlcEdldCA9IGZ1bmN0aW9uIChrZXlTdHIsIG9iaikge1xuICB2YXIgY2hhaW4sIGN1ciA9IG9iaiwga2V5O1xuICBpZihrZXlTdHIpe1xuICAgIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cik7XG4gICAgZm9yKHZhciBpID0gMCwgbCA9IGNoYWluLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAga2V5ID0gY2hhaW5baV07XG4gICAgICBpZihjdXIpe1xuICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjdXI7XG59XG5cbi8vaHRtbCDkuK3lsZ7mgKflkI3kuI3ljLrliIblpKflsI/lhpksIOW5tuS4lOS8muWFqOmDqOi9rOaIkOWwj+WGmS5cbi8v6L+Z6YeM5Lya5bCG6L+e5a2X56ym5YaZ5rOV6L2s5oiQ6am85bOw5byPXG4vL2F0dHItbmFtZSAtLT4gYXR0ck5hbWVcbi8vYXR0ci0tbmFtZSAtLT4gYXR0ci1uYW1lXG52YXIgaHlwaGVuc1JlZyA9IC8tKC0/KShbYS16XSkvaWc7XG52YXIgaHlwaGVuVG9DYW1lbCA9IGZ1bmN0aW9uKGF0dHJOYW1lKSB7XG4gIHJldHVybiBhdHRyTmFtZS5yZXBsYWNlKGh5cGhlbnNSZWcsIGZ1bmN0aW9uKHMsIGRhc2gsIGNoYXIpIHtcbiAgICByZXR1cm4gZGFzaCA/IGRhc2ggKyBjaGFyIDogY2hhci50b1VwcGVyQ2FzZSgpO1xuICB9KVxufVxuXG4vL+mpvOWzsOi9rOi/nuaOpeesplxudmFyIGNhbWVsUmVnID0gLyhbQS1aXSkvZztcbnZhciBjYW1lbFRvSHlwaGVuID0gZnVuY3Rpb24oa2V5KSB7XG4gIHJldHVybiBrZXkucmVwbGFjZShjYW1lbFJlZywgZnVuY3Rpb24gKHVwcGVyQ2hhcikge1xuICAgIHJldHVybiAnLScgKyB1cHBlckNoYXIudG9Mb3dlckNhc2UoKTtcbiAgfSlcbn1cblxudmFyIHV0aWxzID0ge1xuICBub29wOiBmdW5jdGlvbiAoKXt9XG4sIGllOiAoZnVuY3Rpb24oKXtcbiAgICB2YXIgdW5kZWYsXG4gICAgICAgIHYgPSAzLFxuICAgICAgICBkaXYgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JyksXG4gICAgICAgIGFsbCA9IGRpdi5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaScpO1xuXG4gICAgd2hpbGUgKFxuICAgICAgZGl2LmlubmVySFRNTCA9ICc8IS0tW2lmIGd0IElFICcgKyAoKyt2KSArICddPjxpPjwvaT48IVtlbmRpZl0tLT4nLFxuICAgICAgYWxsWzBdXG4gICAgKTtcblxuICAgIHJldHVybiB2ID4gNCA/IHYgOiB1bmRlZjtcblxuICB9KCkpXG5cbiwgaXNPYmplY3Q6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsICE9PSBudWxsO1xuICB9XG5cbiwgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCc7XG4gIH1cblxuLCBpc0Z1bmN0aW9uOiBmdW5jdGlvbiAodmFsKXtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ2Z1bmN0aW9uJztcbiAgfVxuXG4sIGlzQXJyYXk6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICBpZih1dGlscy5pZSl7XG4gICAgICAvL0lFIDkg5Y+K5Lul5LiLIElFIOi3qOeql+WPo+ajgOa1i+aVsOe7hFxuICAgICAgcmV0dXJuIHZhbCAmJiB2YWwuY29uc3RydWN0b3IgKyAnJyA9PT0gQXJyYXkgKyAnJztcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCk7XG4gICAgfVxuICB9XG4sIGlzTnVtZXJpYzogZnVuY3Rpb24odmFsKSB7XG4gICAgcmV0dXJuICF1dGlscy5pc0FycmF5KHZhbCkgJiYgdmFsIC0gcGFyc2VGbG9hdCh2YWwpICsgMSA+PSAwO1xuICB9XG4gIC8v566A5Y2V5a+56LGh55qE566A5piT5Yik5patXG4sIGlzUGxhaW5PYmplY3Q6IGZ1bmN0aW9uIChvKXtcbiAgICBpZiAoIW8gfHwgKHt9KS50b1N0cmluZy5jYWxsKG8pICE9PSAnW29iamVjdCBPYmplY3RdJyB8fCBvLm5vZGVUeXBlIHx8IG8gPT09IG8ud2luZG93KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvL+WHveaVsOWIh+mdoi4gb3JpRm4g5Y6f5aeL5Ye95pWwLCBmbiDliIfpnaLooaXlhYXlh73mlbBcbiAgLy/liY3pnaLnmoTlh73mlbDov5Tlm57lgLzkvKDlhaUgYnJlYWtDaGVjayDliKTmlq0sIGJyZWFrQ2hlY2sg6L+U5Zue5YC85Li655yf5pe25LiN5omn6KGM5YiH6Z2i6KGl5YWF55qE5Ye95pWwXG4sIGJlZm9yZUZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuLCBhZnRlckZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfVxuXG4sIHBhcnNlS2V5UGF0aDogcGFyc2VLZXlQYXRoXG5cbiwgZGVlcFNldDogZnVuY3Rpb24gKGtleVN0ciwgdmFsdWUsIG9iaikge1xuICAgIGlmKGtleVN0cil7XG4gICAgICB2YXIgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKVxuICAgICAgICAsIGN1ciA9IG9ialxuICAgICAgICA7XG4gICAgICBjaGFpbi5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgaSkge1xuICAgICAgICBpZihpID09PSBjaGFpbi5sZW5ndGggLSAxKXtcbiAgICAgICAgICBjdXJba2V5XSA9IHZhbHVlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBpZihjdXIgJiYgY3VyLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBjdXJba2V5XSA9IHt9O1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIGV4dGVuZChvYmosIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuLCBleHRlbmQ6IGV4dGVuZFxuLCBjcmVhdGU6IGNyZWF0ZVxuLCB0b0FycmF5OiBmdW5jdGlvbihhcnJMaWtlKSB7XG4gICAgdmFyIGFyciA9IFtdO1xuXG4gICAgdHJ5e1xuICAgICAgLy9JRSA4IOWvuSBkb20g5a+56LGh5Lya5oql6ZSZXG4gICAgICBhcnIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJMaWtlKVxuICAgIH1jYXRjaCAoZSl7XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJyTGlrZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgYXJyW2ldID0gYXJyTGlrZVtpXVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyO1xuICB9XG4sIGh5cGhlblRvQ2FtZWw6IGh5cGhlblRvQ2FtZWxcbiwgY2FtZWxUb0h5cGhlbjogY2FtZWxUb0h5cGhlblxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB1dGlscztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlLmpzJykucGFyc2VcbiAgLCByZWZvcm1TY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKS5yZWZvcm1TY29wZVxuICA7XG5cbnZhciBzdW1tYXJ5Q2FjaGUgPSB7fTtcblxuLyoqXG4gKiDmr4/kuKogZGlyZWN0aXZlIOWvueW6lOS4gOS4qiB3YXRjaGVyXG4gKiBAcGFyYW0ge0JlZX0gdm0gIGRpcmVjdGl2ZSDmiYDlpITnmoTnjq/looNcbiAqIEBwYXJhbSB7RGlyZWN0aXZlfSBkaXJcbiAqL1xuZnVuY3Rpb24gV2F0Y2hlcih2bSwgZGlyKSB7XG4gIHZhciByZWZvcm1lZCwgcGF0aCwgY3VyVm0gPSB2bSwgd2F0Y2hlcnMgPSBbXTtcbiAgdmFyIHN1bW1hcnkgPSBzdW1tYXJ5Q2FjaGVbZGlyLnBhdGhdXG5cbiAgZGlyLndhdGNoZXIgPSB0aGlzO1xuXG4gIHRoaXMuc3RhdGUgPSAxO1xuICB0aGlzLmRpciA9IGRpcjtcbiAgdGhpcy52bSA9IHZtO1xuICB0aGlzLndhdGNoZXJzID0gW107XG5cbiAgdGhpcy52YWwgPSBOYU47XG5cbiAgZGlyLnBhcnNlKCk7XG5cbiAgaWYoIXN1bW1hcnkgfHwgc3VtbWFyeS5fdHlwZSAhPT0gZGlyLnR5cGUpe1xuICAgIHN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KGRpci5hc3QpO1xuICAgIHN1bW1hcnkuX3R5cGUgPSBkaXIudHlwZTtcbiAgICBzdW1tYXJ5Q2FjaGVbZGlyLnBhdGhdID0gc3VtbWFyeTtcbiAgfVxuICBkaXIuc3VtbWFyeSA9IHN1bW1hcnlcblxuICAvL+WwhuivpSB3YXRjaGVyIOS4juavj+S4gOS4quWxnuaAp+W7uueri+W8leeUqOWFs+ezu1xuICBmb3IodmFyIGkgPSAwLCBsID0gZGlyLnN1bW1hcnkucGF0aHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgcmVmb3JtZWQgPSByZWZvcm1TY29wZSh2bSwgZGlyLnN1bW1hcnkucGF0aHNbaV0pXG4gICAgY3VyVm0gPSByZWZvcm1lZC52bVxuICAgIHBhdGggPSByZWZvcm1lZC5wYXRoXG4gICAgaWYoZGlyLndhdGNoKSB7XG4gICAgICBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0gPSBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0gfHwgW107XG4gICAgICBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0ucHVzaCh0aGlzKTtcbiAgICAgIHdhdGNoZXJzID0gY3VyVm0uX3dhdGNoZXJzW3BhdGhdO1xuICAgIH1lbHNle1xuICAgICAgd2F0Y2hlcnMgPSBbdGhpc107XG4gICAgfVxuICAgIC8v5bCG5q+P5LiqIGtleSDlr7nlupTnmoQgd2F0Y2hlcnMg6YO95aGe6L+b5p2lXG4gICAgdGhpcy53YXRjaGVycy5wdXNoKCB3YXRjaGVycyApO1xuICB9XG5cbiAgLy/mmK/lkKblnKjliJ3lp4vljJbml7bmm7TmlrBcbiAgZGlyLmltbWVkaWF0ZSAhPT0gZmFsc2UgJiYgdGhpcy51cGRhdGUoKTtcbn1cblxuLy/moLnmja7ooajovr7lvI/np7vpmaTlvZPliY0gdm0g5Lit55qEIHdhdGNoZXJcbmZ1bmN0aW9uIHVud2F0Y2ggKHZtLCBleHAsIGNhbGxiYWNrKSB7XG4gIHZhciBzdW1tYXJ5O1xuICB0cnkge1xuICAgIHN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KHBhcnNlKGV4cCkpXG4gIH1jYXRjaCAoZSl7XG4gICAgZS5tZXNzYWdlID0gJ1N5bnRheEVycm9yIGluIFwiJyArIGV4cCArICdcIiB8ICcgKyBlLm1lc3NhZ2U7XG4gICAgY29uc29sZS5lcnJvcihlKTtcbiAgfVxuICBzdW1tYXJ5LnBhdGhzLmZvckVhY2goZnVuY3Rpb24ocGF0aCkge1xuICAgIHZhciB3YXRjaGVycyA9IHZtLl93YXRjaGVyc1twYXRoXSB8fCBbXSwgdXBkYXRlO1xuXG4gICAgZm9yKHZhciBpID0gd2F0Y2hlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgdXBkYXRlID0gd2F0Y2hlcnNbaV0uZGlyLnVwZGF0ZTtcbiAgICAgIGlmKHVwZGF0ZSA9PT0gY2FsbGJhY2sgfHwgdXBkYXRlLl9vcmlnaW5GbiA9PT0gY2FsbGJhY2spe1xuICAgICAgICB3YXRjaGVyc1tpXS51bndhdGNoKClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGFkZFdhdGNoZXIoZGlyKSB7XG4gIGlmKGRpci5wYXRoKSB7XG4gICAgcmV0dXJuIG5ldyBXYXRjaGVyKHRoaXMsIGRpcik7XG4gIH1cbn1cblxuV2F0Y2hlci51bndhdGNoID0gdW53YXRjaDtcbldhdGNoZXIuYWRkV2F0Y2hlciA9IGFkZFdhdGNoZXI7XG5cbi8v6I635Y+W5p+QIGtleVBhdGgg5a2Q6Lev5b6E55qEIHdhdGNoZXJzXG5XYXRjaGVyLmdldFdhdGNoZXJzID0gZnVuY3Rpb24gZ2V0V2F0Y2hlcnModm0sIGtleVBhdGgpIHtcbiAgdmFyIF93YXRjaGVycyA9IHZtLl93YXRjaGVycywgd2F0Y2hlcnMgPSBbXTtcbiAgdmFyIHBvaW50O1xuICBmb3IodmFyIGtleSBpbiBfd2F0Y2hlcnMpIHtcbiAgICBwb2ludCA9IGtleS5jaGFyQXQoa2V5UGF0aC5sZW5ndGgpO1xuICAgIGlmKGtleS5pbmRleE9mKGtleVBhdGgpID09PSAwICYmIChwb2ludCA9PT0gJy4nKSkge1xuICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoX3dhdGNoZXJzW2tleV0pXG4gICAgfVxuICB9XG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG5mdW5jdGlvbiB3YXRjaGVyVXBkYXRlICh2YWwpIHtcbiAgdmFyIG9sZFZhbHVlID0gdGhpcy52YWw7XG4gIHRoaXMudmFsID0gdmFsO1xuICB0aGlzLmRpci51cGRhdGUodmFsLCBvbGRWYWx1ZSk7XG59XG5cbnV0aWxzLmV4dGVuZChXYXRjaGVyLnByb3RvdHlwZSwge1xuICAvL+ihqOi+vuW8j+aJp+ihjOW5tuabtOaWsCB2aWV3XG4gIHVwZGF0ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAsIG5ld1ZhbFxuICAgICAgO1xuXG4gICAgaWYodGhpcy5faGlkZSkge1xuICAgICAgdGhpcy5fbmVlZFVwZGF0ZSA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ld1ZhbCA9IHRoaXMuZGlyLmdldFZhbHVlKHRoaXMudm0pO1xuXG4gICAgLy/nroDljZXov4fmu6Tph43lpI3mm7TmlrBcbiAgICBpZihuZXdWYWwgIT09IHRoaXMudmFsIHx8IHV0aWxzLmlzT2JqZWN0KG5ld1ZhbCkpe1xuICAgICAgaWYobmV3VmFsICYmIG5ld1ZhbC50aGVuKSB7XG4gICAgICAgIC8vYSBwcm9taXNlXG4gICAgICAgIG5ld1ZhbC50aGVuKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGF0LCB2YWwpO1xuICAgICAgICB9KTtcbiAgICAgIH1lbHNle1xuICAgICAgICB3YXRjaGVyVXBkYXRlLmNhbGwodGhpcywgbmV3VmFsKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gIC8v56e76ZmkXG4gIHVud2F0Y2g6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVycykge1xuICAgICAgZm9yKHZhciBpID0gd2F0Y2hlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgICBpZih3YXRjaGVyc1tpXSA9PT0gdGhpcyl7XG4gICAgICAgICAgaWYodGhpcy5zdGF0ZSl7XG4gICAgICAgICAgICB3YXRjaGVyc1tpXS5kaXIudW5MaW5rKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gMDtcbiAgICAgICAgICB9XG4gICAgICAgICAgd2F0Y2hlcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKVxuICAgIHRoaXMud2F0Y2hlcnMgPSBbXTtcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2F0Y2hlclxuIl19
