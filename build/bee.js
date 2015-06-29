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

  //__links 包含了 $el 下所有的绑定引用
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
    var instance;
    var dirs = this.directive.getDirs(el, this);
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

},{"./check-binding.js":3,"./class.js":4,"./component.js":5,"./directive.js":6,"./directives":11,"./dom-utils.js":17,"./env.js":18,"./scope":22,"./utils.js":24,"./watcher.js":25}],2:[function(require,module,exports){

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

},{"./env.js":18,"./token.js":23,"./utils":24,"./watcher":25}],4:[function(require,module,exports){
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

},{"./utils.js":24}],5:[function(require,module,exports){
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

},{"./utils.js":24}],6:[function(require,module,exports){
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
      if(dir.anchor) {
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

},{"./env.js":18,"./eval.js":19,"./parse.js":21,"./token.js":23,"./utils.js":24}],7:[function(require,module,exports){
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
},{"../utils.js":24}],8:[function(require,module,exports){
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

      content = domUtils.createContent(el.childNodes);

      //组件内容属于其容器
      vm.__links = vm.__links.concat(checkBinding.walk.call(vm, content));

      el.appendChild(content)

      this.component = comp = new Comp({
        $target: el,
        $data: utils.extend({}, Comp.prototype.$data, $data, domUtils.getAttrs(el))
      });
      el.bee = comp;

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

},{"../check-binding":3,"../dom-utils":17,"../utils.js":24}],9:[function(require,module,exports){
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

},{"../check-binding":3,"../dom-utils":17}],10:[function(require,module,exports){
"use strict";

var checkBinding = require('../check-binding')
  , domUtils = require('../dom-utils')
  , doc = require('../env').document

module.exports = {
  anchor: true
, terminal: true
, sub: true
, link: function() {
    var end = this.el;
    var endDir = this.vm.constructor.prefix + 'if-end';
    var parent;

    this.watchers = [];

    if(this.subType === 'start') {
      while(end = end.nextSibling) {
        if(domUtils.hasAttr(end, endDir)){
          end.removeAttribute(endDir)
          break;
        }
      }
      if(end) {
        parent = end.parentNode

        if(end.nextSibling) {
          parent.insertBefore(this.anchors.end, end.nextSibling)
        }else{
          parent.appendChild(this.anchors.end)
        }
      }else{
        console.error('expect: ' + endDir + ', but not found!')
      }
    }
    this.frag = doc.createDocumentFragment()
    this.remove();
    this.watchers = checkBinding.walk.call(this.vm, this.frag);
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
    this.watchers.forEach(function(watcher) {
      watcher.hide = false;
      watcher.update()
    })
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
      watcher.hide = true;
    })
    // this.watcher = [];
  }
};

},{"../check-binding":3,"../dom-utils":17,"../env":18}],11:[function(require,module,exports){
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

module.exports = dirs;

},{"../check-binding":3,"../env.js":18,"../utils.js":24,"./attr":7,"./component":8,"./content":9,"./if":10,"./model":12,"./on":13,"./ref":14,"./repeat":15,"./style":16}],12:[function(require,module,exports){
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
      , callback = function(val) {
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
        callback = function(val) {
          comp.$replace(value, val)
        };
        handler = function() {
          vm.$replace(keyPath, comp.$get(value))
        }
        comp.$watch(value, function() {
          handler()
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
              callback = function(val) {
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
            callback = function(vals){
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

    this.update = callback;
  }
};

},{"../event-bind.js":20,"../token.js":23,"../utils.js":24}],13:[function(require,module,exports){
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

},{"../event-bind.js":20,"../utils":24}],14:[function(require,module,exports){

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

},{"../utils":24}],15:[function(require,module,exports){
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

},{"../env.js":18,"../scope":22,"../utils.js":24}],16:[function(require,module,exports){
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

},{"../utils":24}],17:[function(require,module,exports){
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
  },

  hasAttr: function(el, attrName) {
    return el.hasAttribute ? el.hasAttribute(attrName) : !utils.isUndefined(el[attrName]);
  }
};

},{"./env.js":18,"./utils":24}],18:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":2}],19:[function(require,module,exports){
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

},{"./scope":22}],20:[function(require,module,exports){
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
},{}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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

},{"./utils":24}],23:[function(require,module,exports){
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
},{}],24:[function(require,module,exports){
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

},{"./env.js":18}],25:[function(require,module,exports){
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
    this.val = val;
    this.dir.update(val, this.val);
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

    if(this.hide) {
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

},{"./eval.js":19,"./parse.js":21,"./scope":22,"./utils.js":24}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY29tcG9uZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvY29udGVudC5qcyIsInNyYy9kaXJlY3RpdmVzL2lmLmpzIiwic3JjL2RpcmVjdGl2ZXMvaW5kZXguanMiLCJzcmMvZGlyZWN0aXZlcy9tb2RlbC5qcyIsInNyYy9kaXJlY3RpdmVzL29uLmpzIiwic3JjL2RpcmVjdGl2ZXMvcmVmLmpzIiwic3JjL2RpcmVjdGl2ZXMvcmVwZWF0LmpzIiwic3JjL2RpcmVjdGl2ZXMvc3R5bGUuanMiLCJzcmMvZG9tLXV0aWxzLmpzIiwic3JjL2Vudi5qcyIsInNyYy9ldmFsLmpzIiwic3JjL2V2ZW50LWJpbmQuanMiLCJzcmMvcGFyc2UuanMiLCJzcmMvc2NvcGUuanMiLCJzcmMvdG9rZW4uanMiLCJzcmMvdXRpbHMuanMiLCJzcmMvd2F0Y2hlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pYQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNySUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ROQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgQ2xhc3MgPSByZXF1aXJlKCcuL2NsYXNzLmpzJylcbiAgLCBEaXIgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZS5qcycpXG4gICwgQ29tID0gcmVxdWlyZSgnLi9jb21wb25lbnQuanMnKVxuICAsIFdhdGNoZXIgPSByZXF1aXJlKCcuL3dhdGNoZXIuanMnKVxuXG4gICwgZGlycyA9IHJlcXVpcmUoJy4vZGlyZWN0aXZlcycpXG4gICwgZG9tVXRpbHMgPSByZXF1aXJlKCcuL2RvbS11dGlscy5qcycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi9jaGVjay1iaW5kaW5nLmpzJylcbiAgLCBzY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKVxuICA7XG5cblxudmFyIGlzT2JqZWN0ID0gdXRpbHMuaXNPYmplY3RcbiAgLCBpc1BsYWluT2JqZWN0ID0gdXRpbHMuaXNQbGFpbk9iamVjdFxuICAsIHBhcnNlS2V5UGF0aCA9IHV0aWxzLnBhcnNlS2V5UGF0aFxuICAsIGRlZXBTZXQgPSB1dGlscy5kZWVwU2V0XG4gICwgZXh0ZW5kID0gdXRpbHMuZXh0ZW5kXG4gICwgY3JlYXRlID0gdXRpbHMuY3JlYXRlXG4gIDtcblxuLy/orr7nva4gZGlyZWN0aXZlIOWJjee8gFxuZnVuY3Rpb24gc2V0UHJlZml4KG5ld1ByZWZpeCkge1xuICBpZihuZXdQcmVmaXgpe1xuICAgIHRoaXMucHJlZml4ID0gbmV3UHJlZml4O1xuICB9XG59XG5cbi8vVE9ETyDmuIXnkIbov5nkuKpcbnZhciBtZXJnZVByb3BzID0ge1xuICAkZGF0YTogMSwgJHdhdGNoZXJzOiAxXG59O1xuXG52YXIgbGlmZUN5Y2xlcyA9IHtcbiAgJGJlZm9yZUluaXQ6IHV0aWxzLm5vb3BcbiwgJGFmdGVySW5pdDogdXRpbHMubm9vcFxuLCAkYmVmb3JlVXBkYXRlOiB1dGlscy5ub29wXG4sICRhZnRlclVwZGF0ZTogdXRpbHMubm9vcFxuLCAkYmVmb3JlRGVzdHJveTogdXRpbHMubm9vcFxuLCAkYWZ0ZXJEZXN0cm95OiB1dGlscy5ub29wXG59O1xuXG4vKipcbiAqIOaehOmAoOWHveaVsFxuICogLS0tXG4gKiBAcGFyYW0ge1N0cmluZ3xFbGVtZW50fSBbdHBsXSDmqKHmnb8uIOetieWQjOS6jiBwcm9wcy4kdHBsXG4gKiBAcGFyYW0ge09iamVjdH0gW3Byb3BzXSDlsZ7mgKcv5pa55rOVXG4gKiovXG5mdW5jdGlvbiBCZWUodHBsLCBwcm9wcykge1xuICBpZihpc1BsYWluT2JqZWN0KHRwbCkpIHtcbiAgICBwcm9wcyA9IHRwbDtcbiAgICB0cGwgPSBwcm9wcy4kdHBsO1xuICB9XG4gIHByb3BzID0gcHJvcHMgfHwge307XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIC8vJCDlvIDlpLTnmoTmmK/lhbHmnInlsZ7mgKcv5pa55rOVXG4gICAgJGRhdGE6IHt9XG4gICwgJHdhdGNoZXJzOiB7fVxuICAsICRyZWZzOiB7fVxuICAsICRtaXhpbnM6IFtdXG5cbiAgLCAkZWw6IHRoaXMuJGVsIHx8IG51bGxcbiAgLCAkdGFyZ2V0OiB0aGlzLiR0YXJnZXQgfHwgbnVsbFxuICAsICR0cGw6IHRoaXMuJHRwbCB8fCAnPGRpdj48L2Rpdj4nXG4gICwgJGNvbnRlbnQ6IHRoaXMuJGNvbnRlbnQgfHwgbnVsbFxuXG4gICwgJHBhcmVudDogbnVsbFxuICAsICRyb290OiB0aGlzXG5cbiAgICAvL+engeacieWxnuaApy/mlrnms5VcbiAgLCBfd2F0Y2hlcnM6IHt9XG4gICwgX2Fzc2lnbm1lbnRzOiBudWxsLy/lvZPliY0gdm0g55qE5Yir5ZCNXG4gICwgX3JlbGF0aXZlUGF0aDogW11cbiAgLCBfX2xpbmtzOiBbXVxuICAsIF9pc1JlbmRlcmVkOiBmYWxzZVxuICB9O1xuXG4gIHZhciBlbEluZm87XG5cbiAgdmFyIG1peGlucyA9IFtkZWZhdWx0c10uY29uY2F0KHRoaXMuJG1peGlucykuY29uY2F0KHByb3BzLiRtaXhpbnMpLmNvbmNhdChbcHJvcHNdKVxuXG4gIG1peGlucy5mb3JFYWNoKGZ1bmN0aW9uKG1peGluKSB7XG4gICAgdmFyIHByb3A7XG4gICAgZm9yKHZhciBwcm9wS2V5IGluIG1peGluKSB7XG4gICAgICBpZihtaXhpbi5oYXNPd25Qcm9wZXJ0eShwcm9wS2V5KSkge1xuICAgICAgICBpZiAoKHByb3BLZXkgaW4gbWVyZ2VQcm9wcykgJiYgaXNPYmplY3QobWl4aW5bcHJvcEtleV0pKSB7XG4gICAgICAgICAgLy/kv53mjIHlr7nkvKDlhaXlsZ7mgKfnmoTlvJXnlKhcbiAgICAgICAgICAvL21lcmdlUHJvcHMg5Lit55qE5bGe5oCn5Lya6KKr6buY6K6k5YC85omp5bGVXG4gICAgICAgICAgcHJvcCA9IGV4dGVuZCh7fSwgdGhpc1twcm9wS2V5XSwgbWl4aW5bcHJvcEtleV0pXG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IGV4dGVuZChtaXhpbltwcm9wS2V5XSwgcHJvcClcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wS2V5IGluIGxpZmVDeWNsZXMpIHtcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gdXRpbHMuYWZ0ZXJGbih0aGlzW3Byb3BLZXldLCBtaXhpbltwcm9wS2V5XSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gbWl4aW5bcHJvcEtleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0uYmluZCh0aGlzKSlcblxuICBpc09iamVjdCh0aGlzLiRkYXRhKSAmJiBleHRlbmQodGhpcywgdGhpcy4kZGF0YSk7XG5cbiAgdHBsID0gdHBsIHx8IHRoaXMuJHRwbDtcbiAgZWxJbmZvID0gZG9tVXRpbHMudHBsUGFyc2UodHBsLCB0aGlzLiR0YXJnZXQsIHRoaXMuJGNvbnRlbnQpO1xuXG4gIGlmKHRoaXMuJGVsKXtcbiAgICB0aGlzLiRlbC5hcHBlbmRDaGlsZChlbEluZm8uZWwpO1xuICB9ZWxzZXtcbiAgICB0aGlzLiRlbCA9IGVsSW5mby5lbDtcbiAgfVxuICB0aGlzLiR0cGwgPSBlbEluZm8udHBsO1xuICB0aGlzLiRjb250ZW50ID0gZWxJbmZvLmNvbnRlbnQ7XG5cbiAgdGhpcy4kYmVmb3JlSW5pdCgpXG4gIHRoaXMuJGVsLmJlZSA9IHRoaXM7XG5cbiAgLy9fX2xpbmtzIOWMheWQq+S6hiAkZWwg5LiL5omA5pyJ55qE57uR5a6a5byV55SoXG4gIHRoaXMuX19saW5rcyA9IHRoaXMuX19saW5rcy5jb25jYXQoIGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcywgdGhpcy4kZWwpICk7XG5cbiAgZm9yKHZhciBrZXkgaW4gdGhpcy4kd2F0Y2hlcnMpIHtcbiAgICB0aGlzLiR3YXRjaChrZXksIHRoaXMuJHdhdGNoZXJzW2tleV0pXG4gIH1cblxuICB0aGlzLl9pc1JlbmRlcmVkID0gdHJ1ZTtcbiAgdGhpcy4kYWZ0ZXJJbml0KCk7XG59XG5cbi8v6Z2Z5oCB5bGe5oCnXG5leHRlbmQoQmVlLCB7ZXh0ZW5kOiB1dGlscy5hZnRlckZuKENsYXNzLmV4dGVuZCwgdXRpbHMubm9vcCwgZnVuY3Rpb24oc3ViKSB7XG4gIC8v5q+P5Liq5p6E6YCg5Ye95pWw6YO95pyJ6Ieq5bex55qEIGRpcmVjdGl2ZXMgLGNvbXBvbmVudHMsIGZpbHRlcnMg5byV55SoXG4gIHN1Yi5kaXJlY3RpdmVzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmRpcmVjdGl2ZXMpLCBzdWIuZGlyZWN0aXZlcyk7XG4gIHN1Yi5jb21wb25lbnRzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmNvbXBvbmVudHMpLCBzdWIuY29tcG9uZW50cyk7XG4gIHN1Yi5maWx0ZXJzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmZpbHRlcnMpLCBzdWIuZmlsdGVycyk7XG59KSwgdXRpbHM6IHV0aWxzfSwgRGlyLCBDb20sIHtcbiAgc2V0UHJlZml4OiBzZXRQcmVmaXhcbiwgcHJlZml4OiAnJ1xuLCBkb2M6IGRvY1xuLCBkaXJlY3RpdmVzOiB7fVxuLCBjb21wb25lbnRzOiB7fVxuLCBkZWZhdWx0czoge31cbiwgZmlsdGVyczoge1xuICAgIC8vYnVpbGQgaW4gZmlsdGVyXG4gICAganNvbjogZnVuY3Rpb24ob2JqLCByZXBsYWNlciwgc3BhY2UpIHtcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIHJlcGxhY2VyLCBzcGFjZSkgfVxuICB9XG4sIGZpbHRlcjogZnVuY3Rpb24oZmlsdGVyTmFtZSwgZmlsdGVyKSB7XG4gICAgdGhpcy5maWx0ZXJzW2ZpbHRlck5hbWVdID0gZmlsdGVyO1xuICB9XG4sIG1vdW50OiBmdW5jdGlvbihpZCwgcHJvcHMpIHtcbiAgICB2YXIgZWwgPSBpZC5ub2RlVHlwZSA/IGlkIDogZG9jLmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICB2YXIgaW5zdGFuY2U7XG4gICAgdmFyIGRpcnMgPSB0aGlzLmRpcmVjdGl2ZS5nZXREaXJzKGVsLCB0aGlzKTtcbiAgICB2YXIgQ29tcCwgZGlyO1xuXG4gICAgZGlyID0gZGlycy5maWx0ZXIoZnVuY3Rpb24oZGlyKSB7XG4gICAgICByZXR1cm4gIGRpci50eXBlID09PSAndGFnJyB8fCBkaXIudHlwZSA9PT0gJ2NvbXBvbmVudCdcbiAgICB9KVswXTtcblxuICAgIGlmKGRpcikge1xuICAgICAgQ29tcCA9IHRoaXMuZ2V0Q29tcG9uZW50KGRpci5wYXRoKVxuICAgIH1cblxuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgaWYoQ29tcCkge1xuICAgICAgcHJvcHMuJGRhdGEgPSBleHRlbmQoZG9tVXRpbHMuZ2V0QXR0cnMoZWwpLCBwcm9wcy4kZGF0YSlcbiAgICAgIGluc3RhbmNlID0gbmV3IENvbXAoZXh0ZW5kKHskdGFyZ2V0OiBlbH0sIHByb3BzKSlcbiAgICB9ZWxzZXtcbiAgICAgIGluc3RhbmNlID0gbmV3IEJlZShlbCwgcHJvcHMpO1xuICAgIH1cbiAgICByZXR1cm4gaW5zdGFuY2VcbiAgfVxufSk7XG5cblxuQmVlLnNldFByZWZpeCgnYi0nKTtcblxuLy/lhoXnva4gZGlyZWN0aXZlXG5mb3IodmFyIGRpciBpbiBkaXJzKSB7XG4gIEJlZS5kaXJlY3RpdmUoZGlyLCBkaXJzW2Rpcl0pO1xufVxuXG4vL+WunuS+i+aWueazlVxuLy8tLS0tXG5leHRlbmQoQmVlLnByb3RvdHlwZSwgbGlmZUN5Y2xlcywge1xuICAvKipcbiAgICog6I635Y+W5bGe5oCnL+aWueazlS0tXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBleHByZXNzaW9uIOi3r+W+hC/ooajovr7lvI9cbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICAkZ2V0OiBmdW5jdGlvbihleHByZXNzaW9uKSB7XG4gICAgdmFyIGRpciA9IG5ldyBEaXIoJyRnZXQnLCB7XG4gICAgICBwYXRoOiBleHByZXNzaW9uXG4gICAgLCB3YXRjaDogZmFsc2VcbiAgICB9KTtcbiAgICBkaXIucGFyc2UoKTtcbiAgICByZXR1cm4gZGlyLmdldFZhbHVlKHRoaXMsIGZhbHNlKVxuICB9XG5cbiAgLyoqXG4gICAqICMjIyBiZWUuJHNldFxuICAgKiDmm7TmlrDlkIjlubYgYC5kYXRhYCDkuK3nmoTmlbDmja4uIOWmguaenOWPquacieS4gOS4quWPguaVsCwg6YKj5LmI6L+Z5Liq5Y+C5pWw5bCG5bm25YWlIC4kZGF0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2tleV0g5pWw5o2u6Lev5b6ELlxuICAgKiBAcGFyYW0ge0FueVR5cGV8T2JqZWN0fSB2YWwg5pWw5o2u5YaF5a65LlxuICAgKi9cbiwgJHNldDogZnVuY3Rpb24oa2V5LCB2YWwpIHtcbiAgICB2YXIgYWRkLCBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcbiAgICB2YXIgcmVmb3JtZWQsIHJlS2V5LCByZVZtID0gdGhpcztcblxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpe1xuICAgICAgaWYoaXNPYmplY3Qoa2V5KSkge1xuICAgICAgICBleHRlbmQodGhpcy4kZGF0YSwga2V5KTtcbiAgICAgICAgZXh0ZW5kKHRoaXMsIGtleSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgICAgYWRkID0gZGVlcFNldChyZUtleSwgdmFsLCB7fSk7XG4gICAgICBpZihrZXlzWzBdID09PSAnJGRhdGEnKSB7XG4gICAgICAgIGFkZCA9IGFkZC4kZGF0YVxuICAgICAgfVxuICAgICAgaWYoaXNPYmplY3QocmVWbS4kZGF0YSkpIHtcbiAgICAgICAgZXh0ZW5kKHRydWUsIHJlVm0uJGRhdGEsIGFkZCk7XG4gICAgICAgIGV4dGVuZCh0cnVlLCByZVZtLCBhZGQpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHJlVm0uJGRhdGEgPSBhZGQ7XG4gICAgICB9XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHJlVm0sIHJlS2V5LCB2YWwpIDogdXBkYXRlLmNhbGwocmVWbSwga2V5KTtcbiAgfVxuICAvKipcbiAgICog5pWw5o2u5pu/5o2iXG4gICAqL1xuLCAkcmVwbGFjZTogZnVuY3Rpb24gKGtleSwgdmFsKSB7XG4gICAgdmFyIGtleXMsIGxhc3QsIGhhc0tleSA9IGZhbHNlO1xuICAgIHZhciByZWZvcm1lZCwgcmVLZXksIHJlVm0gPSB0aGlzO1xuXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XG4gICAgICB2YWwgPSBrZXk7XG4gICAgICByZUtleSA9ICckZGF0YSc7XG4gICAgICBrZXlzID0gW3JlS2V5XTtcbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgIH1cblxuICAgIGxhc3QgPSByZVZtLiRnZXQocmVLZXkpO1xuXG4gICAgaWYgKGtleXNbMF0gPT09ICckZGF0YScpIHtcbiAgICAgIGlmKHJlS2V5ID09PSAnJGRhdGEnKSB7XG4gICAgICAgIGlmKGlzT2JqZWN0KHRoaXMuJGRhdGEpKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy4kZGF0YSkuZm9yRWFjaChmdW5jdGlvbiAoaykge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXNba107XG4gICAgICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgICB9XG4gICAgICAgIGV4dGVuZChyZVZtLCB2YWwpO1xuICAgICAgfWVsc2Uge1xuICAgICAgICBkZWVwU2V0KGtleXMuc2hpZnQoKS5qb2luKCcuJyksIHZhbCwgcmVWbSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGVlcFNldChyZUtleSwgdmFsLCByZVZtLiRkYXRhKTtcbiAgICB9XG4gICAgZGVlcFNldChyZUtleSwgdmFsLCByZVZtKVxuXG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwocmVWbSwgcmVLZXksIGV4dGVuZCh7fSwgbGFzdCwgdmFsKSkgOiB1cGRhdGUuY2FsbChyZVZtLCBleHRlbmQoe30sIGxhc3QsIHZhbCkpO1xuICB9XG4gIC8qKlxuICAgKiDmiYvliqjmm7TmlrDmn5Dpg6jliIbmlbDmja5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleVBhdGgg5oyH5a6a5pu05paw5pWw5o2u55qEIGtleVBhdGhcbiAgICogQHBhcmFtIHtCb29sZWFufSBbaXNCdWJibGU9dHJ1ZV0g5piv5ZCm5pu05pawIGtleVBhdGgg55qE54i257qnXG4gICAqL1xuLCAkdXBkYXRlOiBmdW5jdGlvbiAoa2V5UGF0aCwgaXNCdWJibGUpIHtcbiAgICBpc0J1YmJsZSA9IGlzQnViYmxlICE9PSBmYWxzZTtcblxuICAgIHZhciBrZXlzID0gcGFyc2VLZXlQYXRoKGtleVBhdGgucmVwbGFjZSgvXlxcJGRhdGFcXC4vLCAnJykpLCBrZXk7XG4gICAgdmFyIHdhdGNoZXJzO1xuXG4gICAgd2hpbGUoa2V5ID0ga2V5cy5qb2luKCcuJykpIHtcbiAgICAgIHdhdGNoZXJzID0gdGhpcy5fd2F0Y2hlcnNba2V5XSB8fCBbXTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSB3YXRjaGVycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgd2F0Y2hlcnNbaV0udXBkYXRlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICAgIGtleXMucG9wKCk7XG4gICAgICAgIC8v5pyA57uI6YO95YaS5rOh5YiwICRkYXRhXG4gICAgICAgIGlmKCFrZXlzLmxlbmd0aCAmJiBrZXkgIT09ICckZGF0YScpe1xuICAgICAgICAgIGtleXMucHVzaCgnJGRhdGEnKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8v5ZCM5pe25pu05paw5a2Q6Lev5b6EXG4gICAgV2F0Y2hlci5nZXRXYXRjaGVycyh0aGlzLCBrZXlQYXRoKS5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICAgIHdhdGNoZXIudXBkYXRlKCk7XG4gICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgLy/mlbDnu4TlhpLms6HnmoTmg4XlhrVcbiAgICBpZihpc0J1YmJsZSkge1xuICAgICAgaWYodGhpcy4kcGFyZW50KSB7XG4gICAgICAgIC8v5ZCM5q2l5pu05paw54i2IHZtIOWvueW6lOmDqOWIhlxuICAgICAgICB0aGlzLl9yZWxhdGl2ZVBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgIHRoaXMuJHBhcmVudC4kdXBkYXRlKHBhdGgpO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICB9XG4gICAgfVxuICB9XG4sICR3YXRjaDogZnVuY3Rpb24gKGV4cHJlc3Npb24sIGNhbGxiYWNrLCBpbW1lZGlhdGUpIHtcbiAgICBpZihjYWxsYmFjaykge1xuICAgICAgdmFyIHVwZGF0ZSA9IGNhbGxiYWNrLmJpbmQodGhpcyk7XG4gICAgICB1cGRhdGUuX29yaWdpbkZuID0gY2FsbGJhY2s7XG4gICAgICByZXR1cm4gV2F0Y2hlci5hZGRXYXRjaGVyLmNhbGwodGhpcywgbmV3IERpcignJHdhdGNoJywge3BhdGg6IGV4cHJlc3Npb24sIHVwZGF0ZTogdXBkYXRlLCBpbW1lZGlhdGUgOiAhIWltbWVkaWF0ZX0pKVxuICAgIH1cbiAgfVxuLCAkdW53YXRjaDogZnVuY3Rpb24gKGV4cHJlc3Npb24sIGNhbGxiYWNrKSB7XG4gICAgV2F0Y2hlci51bndhdGNoKHRoaXMsIGV4cHJlc3Npb24sIGNhbGxiYWNrKVxuICB9XG4gIC8v6ZSA5q+B5b2T5YmN5a6e5L6LXG4sICRkZXN0cm95OiBmdW5jdGlvbihyZW1vdmVFbCkge1xuICAgIHRoaXMuJGJlZm9yZURlc3Ryb3koKVxuICAgIHRoaXMuX19saW5rcy5mb3JFYWNoKGZ1bmN0aW9uKHdhY2hlcikge1xuICAgICAgd2FjaGVyLnVud2F0Y2goKVxuICAgIH0pXG4gICAgcmVtb3ZlRWwgJiYgdGhpcy4kZWwucGFyZW50Tm9kZSAmJiB0aGlzLiRlbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuJGVsKVxuICAgIHRoaXMuX19saW5rcyA9IFtdO1xuICAgIHRoaXMuJGFmdGVyRGVzdHJveSgpXG4gIH1cbn0pO1xuXG5mdW5jdGlvbiB1cGRhdGUgKGtleVBhdGgsIGRhdGEpIHtcbiAgdmFyIGtleVBhdGhzO1xuICB0aGlzLiRiZWZvcmVVcGRhdGUodGhpcy4kZGF0YSlcbiAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGRhdGEgPSBrZXlQYXRoO1xuICB9ZWxzZXtcbiAgICBrZXlQYXRocyA9IFtrZXlQYXRoXTtcbiAgfVxuXG4gIGlmKCFrZXlQYXRocykge1xuICAgIGlmKGlzT2JqZWN0KGRhdGEpKSB7XG4gICAgICBrZXlQYXRocyA9IE9iamVjdC5rZXlzKGRhdGEpO1xuICAgIH1lbHNle1xuICAgICAgLy8uJGRhdGEg5pyJ5Y+v6IO95piv5Z+65pys57G75Z6L5pWw5o2uXG4gICAgICBrZXlQYXRocyA9IFsnJGRhdGEnXTtcbiAgICB9XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBwYXRoOyBwYXRoID0ga2V5UGF0aHNbaV07IGkrKyl7XG4gICAgdGhpcy4kdXBkYXRlKHBhdGgsIHRydWUpO1xuICB9XG4gIHRoaXMuJGFmdGVyVXBkYXRlKHRoaXMuJGRhdGEpXG59XG5cbkJlZS52ZXJzaW9uID0gJzAuNC4xJztcblxubW9kdWxlLmV4cG9ydHMgPSBCZWU7XG4iLG51bGwsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgV2F0Y2hlciA9IHJlcXVpcmUoJy4vd2F0Y2hlcicpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuL3Rva2VuLmpzJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKVxuICAsIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgO1xuXG52YXIgTk9ERVRZUEUgPSB7XG4gICAgRUxFTUVOVDogMVxuICAsIEFUVFI6IDJcbiAgLCBURVhUOiAzXG4gICwgQ09NTUVOVDogOFxuICAsIEZSQUdNRU5UOiAxMVxufTtcblxuZG9jLmNyZWF0ZUVsZW1lbnQoJ3RlbXBsYXRlJylcblxuLyoqXG4gKiDpgY3ljoYgZG9tIOagkVxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RWxlbWVudHxOb2RlTGlzdH0gZWxcbiAqIEByZXR1cm5zIHtBcnJheX0g6IqC54K55LiL5omA5pyJ55qE57uR5a6aXG4gKi9cblxuZnVuY3Rpb24gd2FsayhlbCkge1xuICB2YXIgd2F0Y2hlcnMgPSBbXSwgZGlyUmVzdWx0O1xuICBpZihlbC5ub2RlVHlwZSA9PT0gTk9ERVRZUEUuRlJBR01FTlQpIHtcbiAgICBlbCA9IGVsLmNoaWxkTm9kZXM7XG4gIH1cblxuICBpZigoJ2xlbmd0aCcgaW4gZWwpICYmIHV0aWxzLmlzVW5kZWZpbmVkKGVsLm5vZGVUeXBlKSl7XG4gICAgLy9ub2RlIGxpc3RcbiAgICAvL+WvueS6jiBub2RlbGlzdCDlpoLmnpzlhbbkuK3mnInljIXlkKsge3t0ZXh0fX0g55u05o6l6YeP55qE6KGo6L6+5byPLCDmlofmnKzoioLngrnkvJrooqvliIblibIsIOWFtuiKgueCueaVsOmHj+WPr+iDveS8muWKqOaAgeWinuWKoFxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbC5sZW5ndGg7IGkrKykge1xuICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHdhbGsuY2FsbCh0aGlzLCBlbFtpXSkgKTtcbiAgICB9XG4gICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgc3dpdGNoIChlbC5ub2RlVHlwZSkge1xuICAgIGNhc2UgTk9ERVRZUEUuRUxFTUVOVDpcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuQ09NTUVOVDpcbiAgICAgIC8v5rOo6YeK6IqC54K5XG4gICAgICByZXR1cm4gd2F0Y2hlcnM7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5PREVUWVBFLlRFWFQ6XG4gICAgICAvL+aWh+acrOiKgueCuVxuICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIGNoZWNrVGV4dC5jYWxsKHRoaXMsIGVsKSApO1xuICAgICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgaWYoZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIC8vdGVtcGxhdGUgc2hpbVxuICAgIGlmKCFlbC5jb250ZW50KSB7XG4gICAgICBlbC5jb250ZW50ID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgICAgIHdoaWxlKGVsLmNoaWxkTm9kZXNbMF0pIHtcbiAgICAgICAgZWwuY29udGVudC5hcHBlbmRDaGlsZChlbC5jaGlsZE5vZGVzWzBdKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGRpclJlc3VsdCA9IGNoZWNrQXR0ci5jYWxsKHRoaXMsIGVsKTtcbiAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoZGlyUmVzdWx0LndhdGNoZXJzKVxuICBpZihkaXJSZXN1bHQudGVybWluYWwpe1xuICAgIHJldHVybiB3YXRjaGVycztcbiAgfVxuXG4gIGlmKGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGVsLmNvbnRlbnQpIClcbiAgfVxuXG4gIGZvcih2YXIgY2hpbGQgPSBlbC5maXJzdENoaWxkLCBuZXh0OyBjaGlsZDsgKXtcbiAgICBuZXh0ID0gY2hpbGQubmV4dFNpYmxpbmc7XG4gICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHdhbGsuY2FsbCh0aGlzLCBjaGlsZCkgKTtcbiAgICBjaGlsZCA9IG5leHQ7XG4gIH1cblxuICByZXR1cm4gd2F0Y2hlcnNcbn1cblxuLy/pgY3ljoblsZ7mgKdcbmZ1bmN0aW9uIGNoZWNrQXR0cihlbCkge1xuICB2YXIgY3N0ciA9IHRoaXMuY29uc3RydWN0b3JcbiAgICAsIGRpcnMgPSBjc3RyLmRpcmVjdGl2ZS5nZXREaXJzKGVsLCBjc3RyKVxuICAgICwgZGlyXG4gICAgLCB0ZXJtaW5hbFByaW9yaXR5LCB3YXRjaGVycyA9IFtdXG4gICAgLCByZXN1bHQgPSB7fTtcbiAgO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsID0gZGlycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBkaXIgPSBkaXJzW2ldO1xuICAgIGRpci5kaXJzID0gZGlycztcblxuICAgIC8v5a+55LqOIHRlcm1pbmFsIOS4uiB0cnVlIOeahCBkaXJlY3RpdmUsIOWcqOino+aekOWujOWFtuebuOWQjOadg+mHjeeahCBkaXJlY3RpdmUg5ZCO5Lit5pat6YGN5Y6G6K+l5YWD57SgXG4gICAgaWYodGVybWluYWxQcmlvcml0eSA+IGRpci5wcmlvcml0eSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZWwucmVtb3ZlQXR0cmlidXRlKGRpci5ub2RlTmFtZSk7XG5cbiAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggc2V0QmluZGluZy5jYWxsKHRoaXMsIGRpcikgKTtcblxuICAgIGlmKGRpci50ZXJtaW5hbCkge1xuICAgICAgcmVzdWx0LnRlcm1pbmFsID0gdHJ1ZTtcbiAgICAgIHRlcm1pbmFsUHJpb3JpdHkgPSBkaXIucHJpb3JpdHk7XG4gICAgfVxuICB9XG5cbiAgcmVzdWx0LndhdGNoZXJzID0gd2F0Y2hlcnNcblxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8v5aSE55CG5paH5pys6IqC54K55Lit55qE57uR5a6a5Y2g5L2N56ymKHt7Li4ufX0pXG5mdW5jdGlvbiBjaGVja1RleHQobm9kZSkge1xuICB2YXIgd2F0Y2hlcnMgPSBbXTtcbiAgaWYodG9rZW4uaGFzVG9rZW4obm9kZS5ub2RlVmFsdWUpKSB7XG4gICAgdmFyIHRva2VucyA9IHRva2VuLnBhcnNlVG9rZW4obm9kZS5ub2RlVmFsdWUpXG4gICAgICAsIHRleHRNYXAgPSB0b2tlbnMudGV4dE1hcFxuICAgICAgLCBlbCA9IG5vZGUucGFyZW50Tm9kZVxuICAgICAgLCBkaXJzID0gdGhpcy5jb25zdHJ1Y3Rvci5kaXJlY3RpdmVzXG4gICAgICAsIHQsIGRpclxuICAgICAgO1xuXG4gICAgLy/lsIZ7e2tleX195YiG5Ymy5oiQ5Y2V54us55qE5paH5pys6IqC54K5XG4gICAgaWYodGV4dE1hcC5sZW5ndGggPiAxKSB7XG4gICAgICB0ZXh0TWFwLmZvckVhY2goZnVuY3Rpb24odGV4dCkge1xuICAgICAgICB2YXIgdG4gPSBkb2MuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG4gICAgICAgIGVsLmluc2VydEJlZm9yZSh0biwgbm9kZSk7XG4gICAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KGNoZWNrVGV4dC5jYWxsKHRoaXMsIHRuKSk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgZWwucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfWVsc2V7XG4gICAgICB0ID0gdG9rZW5zWzBdO1xuICAgICAgLy/lhoXnva7lkITljaDkvY3nrKblpITnkIYuXG4gICAgICBkaXIgPSB1dGlscy5jcmVhdGUodC5lc2NhcGUgPyBkaXJzLnRleHQgOiBkaXJzLmh0bWwpO1xuICAgICAgd2F0Y2hlcnMgPSBzZXRCaW5kaW5nLmNhbGwodGhpcywgdXRpbHMuZXh0ZW5kKGRpciwgdCwge1xuICAgICAgICBlbDogbm9kZVxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gd2F0Y2hlcnNcbn1cblxuZnVuY3Rpb24gc2V0QmluZGluZyhkaXIpIHtcbiAgdmFyIHdhdGNoZXJcbiAgaWYoZGlyLnJlcGxhY2UpIHtcbiAgICB2YXIgZWwgPSBkaXIuZWw7XG4gICAgaWYodXRpbHMuaXNGdW5jdGlvbihkaXIucmVwbGFjZSkpIHtcbiAgICAgIGRpci5ub2RlID0gZGlyLnJlcGxhY2UoKTtcbiAgICB9ZWxzZXtcbiAgICAgIGRpci5ub2RlID0gZG9jLmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICB9XG5cbiAgICBkaXIuZWwgPSBkaXIuZWwucGFyZW50Tm9kZTtcbiAgICBkaXIuZWwucmVwbGFjZUNoaWxkKGRpci5ub2RlLCBlbCk7XG4gIH1cblxuICBkaXIudm0gPSB0aGlzO1xuICBkaXIubGluaygpO1xuXG4gIHdhdGNoZXIgPSBXYXRjaGVyLmFkZFdhdGNoZXIuY2FsbCh0aGlzLCBkaXIpXG4gIHJldHVybiB3YXRjaGVyID8gW3dhdGNoZXJdIDogW11cbn1cblxuZnVuY3Rpb24gdW5CaW5kaW5nKHdhdGNoZXJzKSB7XG4gIHdhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgIHdhdGNoZXIudW53YXRjaCgpXG4gIH0pXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB3YWxrOiB3YWxrLFxuICB1bkJpbmRpbmc6IHVuQmluZGluZ1xufTtcbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWxzLmpzJykuZXh0ZW5kO1xuXG52YXIgQ2xhc3MgPSB7XG4gIC8qKlxuICAgKiDmnoTpgKDlh73mlbDnu6fmib8uXG4gICAqIOWmgjogYHZhciBDYXIgPSBCZWUuZXh0ZW5kKHtkcml2ZTogZnVuY3Rpb24oKXt9fSk7IG5ldyBDYXIoKTtgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvdG9Qcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV5Y6f5Z6L5a+56LGhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbc3RhdGljUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxlemdmeaAgeWxnuaAp1xuICAgKiBAcmV0dXJucyB7RnVuY3Rpb259IOWtkOaehOmAoOWHveaVsFxuICAgKi9cbiAgZXh0ZW5kOiBmdW5jdGlvbiAocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICBwcm90b1Byb3BzID0gcHJvdG9Qcm9wcyB8fCB7fTtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBwcm90b1Byb3BzLmhhc093blByb3BlcnR5KCdjb25zdHJ1Y3RvcicpID8gcHJvdG9Qcm9wcy5jb25zdHJ1Y3RvciA6IGZ1bmN0aW9uKCl7IHJldHVybiBzdXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfVxuICAgIHZhciBzdXAgPSB0aGlzO1xuICAgIHZhciBGbiA9IGZ1bmN0aW9uKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY29uc3RydWN0b3I7IH07XG5cbiAgICBGbi5wcm90b3R5cGUgPSBzdXAucHJvdG90eXBlO1xuICAgIGNvbnN0cnVjdG9yLnByb3RvdHlwZSA9IG5ldyBGbigpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdGF0aWNQcm9wcywge19fc3VwZXJfXzogc3VwLnByb3RvdHlwZX0pO1xuXG4gICAgcmV0dXJuIGNvbnN0cnVjdG9yO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENsYXNzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxuLyoqXG4gKiDms6jlhoznu4Tku7ZcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWdOYW1lIOiHquWumuS5iee7hOS7tueahOagh+etvuWQjVxuICogQHBhcmFtIHtGdW5jdGlvbnxwcm9wc30gQ29tcG9uZW50IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsCAvIOaehOmAoOWHveaVsOWPguaVsFxuICogQHJldHVybiB7RnVuY3Rpb259IOiHquWumuS5iee7hOS7tueahOaehOmAoOWHveaVsFxuICovXG5mdW5jdGlvbiB0YWcodGFnTmFtZSwgQ29tcG9uZW50LCBzdGF0aWNzKSB7XG4gIHZhciB0YWdzID0gdGhpcy5jb21wb25lbnRzID0gdGhpcy5jb21wb25lbnRzIHx8IHt9O1xuXG4gIHRoaXMuZG9jLmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7Ly9mb3Igb2xkIElFXG5cbiAgaWYodXRpbHMuaXNPYmplY3QoQ29tcG9uZW50KSkge1xuICAgIENvbXBvbmVudCA9IHRoaXMuZXh0ZW5kKENvbXBvbmVudCwgc3RhdGljcyk7XG4gIH1cbiAgcmV0dXJuIHRhZ3NbdGFnTmFtZV0gPSBDb21wb25lbnQ7XG59XG5cbi8qKlxuICog5p+l6K+i5p+Q5p6E6YCg5Ye95pWw5LiL55qE5rOo5YaM57uE5Lu2XG4gKiBAcGFybSB7U3RyaW5nfSBjb21wb25lbnROYW1lXG4gKi9cbmZ1bmN0aW9uIGdldENvbXBvbmVudChjb21wb25lbnROYW1lKSB7XG4gIHZhciBwYXRocyA9IHV0aWxzLnBhcnNlS2V5UGF0aChjb21wb25lbnROYW1lKTtcbiAgdmFyIEN1ckNzdHIgPSB0aGlzO1xuICBwYXRocy5mb3JFYWNoKGZ1bmN0aW9uKGNvbU5hbWUpIHtcbiAgICBDdXJDc3RyID0gQ3VyQ3N0ciAmJiBDdXJDc3RyLmNvbXBvbmVudHNbY29tTmFtZV07XG4gIH0pO1xuICByZXR1cm4gQ3VyQ3N0ciB8fCBudWxsO1xufVxuXG5leHBvcnRzLnRhZyA9IGV4cG9ydHMuY29tcG9uZW50ID0gdGFnO1xuZXhwb3J0cy5nZXRDb21wb25lbnQgPSBnZXRDb21wb25lbnQ7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgdG9rZW4gPSByZXF1aXJlKCcuL3Rva2VuLmpzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG4gICwgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlLmpzJykucGFyc2VcbiAgLCBldmFsdWF0ZSA9IHJlcXVpcmUoJy4vZXZhbC5qcycpXG5cbiAgLCBjcmVhdGUgPSB1dGlscy5jcmVhdGVcbiAgO1xuXG4vKipcbiAqIOS4uiBCZWUg5p6E6YCg5Ye95pWw5re75Yqg5oyH5LukIChkaXJlY3RpdmUpLiBgQmVlLmRpcmVjdGl2ZWBcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgZGlyZWN0aXZlIOWQjeensFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRzXSBkaXJlY3RpdmUg5Y+C5pWwXG4gKiBAcGFyYW0ge051bWJlcn0gb3B0cy5wcmlvcml0eT0wIGRpcmVjdGl2ZSDkvJjlhYjnuqcuIOWQjOS4gOS4quWFg+e0oOS4iueahOaMh+S7pOaMieeFp+S8mOWFiOe6p+mhuuW6j+aJp+ihjC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy50ZXJtaW5hbD1mYWxzZSDmiafooYzor6UgZGlyZWN0aXZlIOWQjiwg5piv5ZCm57uI5q2i5ZCO57utIGRpcmVjdGl2ZSDmiafooYwuXG4gKiAgIHRlcm1pbmFsIOS4uuecn+aXtiwg5LiO6K+lIGRpcmVjdGl2ZSDkvJjlhYjnuqfnm7jlkIznmoQgZGlyZWN0aXZlIOS7jeS8mue7p+e7reaJp+ihjCwg6L6D5L2O5LyY5YWI57qn55qE5omN5Lya6KKr5b+955WlLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLmFuY2hvciBhbmNob3Ig5Li6IHRydWUg5pe2LCDkvJrlnKjmjIfku6ToioLngrnliY3lkI7lkITkuqfnlJ/kuIDkuKrnqbrnmb3nmoTmoIforrDoioLngrkuIOWIhuWIq+WvueW6lCBgYW5jaG9ycy5zdGFydGAg5ZKMIGBhbmNob3JzLmVuZGBcbiAqL1xuZnVuY3Rpb24gZGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB2YXIgZGlycyA9IHRoaXMuZGlyZWN0aXZlcyA9IHRoaXMuZGlyZWN0aXZlcyB8fCB7fTtcblxuICByZXR1cm4gZGlyc1trZXldID0gbmV3IERpcmVjdGl2ZShrZXksIG9wdHMpO1xufVxuXG5mdW5jdGlvbiBEaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHRoaXMudHlwZSA9IGtleTtcbiAgdXRpbHMuZXh0ZW5kKHRoaXMsIG9wdHMpO1xufVxuXG52YXIgYXN0Q2FjaGUgPSB7fTtcblxuRGlyZWN0aXZlLnByb3RvdHlwZSA9IHtcbiAgcHJpb3JpdHk6IDAvL+adg+mHjVxuLCB0eXBlOiAnJyAvL+aMh+S7pOexu+Wei1xuLCBzdWJUeXBlOiAnJyAvL+WtkOexu+Weiy4g5q+U5aaCIGBiLW9uLWNsaWNrYCDnmoQgdHlwZSDkuLogYG9uYCwgc3ViVHlwZSDkuLogYGNsaWNrYFxuLCBzdWI6IGZhbHNlIC8v5piv5ZCm5YWB6K645a2Q57G75Z6L5oyH5LukXG4sIGxpbms6IHV0aWxzLm5vb3AvL+WIneWni+WMluaWueazlVxuLCB1bkxpbms6IHV0aWxzLm5vb3AvL+mUgOavgeWbnuiwg1xuLCB1cGRhdGU6IHV0aWxzLm5vb3AvL+abtOaWsOaWueazlVxuLCB0ZWFyRG93bjogdXRpbHMubm9vcFxuLCB0ZXJtaW5hbDogZmFsc2UvL+aYr+WQpue7iOatolxuLCByZXBsYWNlOiBmYWxzZS8v5piv5ZCm5pu/5o2i5b2T5YmN5YWD57SgLiDlpoLmnpzmmK8sIOWwhueUqOS4gOS4quepuueahOaWh+acrOiKgueCueabv+aNouW9k+WJjeWFg+e0oFxuLCB3YXRjaDogdHJ1ZS8v5piv5ZCm55uR5o6nIGtleSDnmoTlj5jljJYuIOWmguaenOS4uiBmYWxzZSDnmoTor50sIHVwZGF0ZSDmlrnms5Xpu5jorqTlj6rkvJrlnKjliJ3lp4vljJblkI7osIPnlKjkuIDmrKFcbiwgaW1tZWRpYXRlOiB0cnVlIC8v5piv5ZCm5ZyoIGRpciDliJ3lp4vljJbml7bnq4vljbPmiafooYwgdXBkYXRlIOaWueazlVxuXG4sIGFuY2hvcjogZmFsc2VcbiwgYW5jaG9yczogbnVsbFxuXG4gIC8v5b2TIGFuY2hvciDkuLogdHJ1ZSDml7YsIOiOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gdGhpcy5hbmNob3JzLnN0YXJ0Lm5leHRTaWJsaW5nO1xuICAgIGlmKHRoaXMuYW5jaG9yICYmIG5vZGUpIHtcbiAgICAgIHdoaWxlKG5vZGUgIT09IHRoaXMuYW5jaG9ycy5lbmQpe1xuICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG4gIC8v6Kej5p6Q6KGo6L6+5byPXG4sIHBhcnNlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgY2FjaGUgPSBhc3RDYWNoZVt0aGlzLnBhdGhdXG4gICAgaWYoY2FjaGUgJiYgY2FjaGUuX3R5cGUgPT09IHRoaXMudHlwZSl7XG4gICAgICB0aGlzLmFzdCA9IGNhY2hlXG4gICAgfWVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5hc3QgPSBwYXJzZSh0aGlzLnBhdGgsIHRoaXMudHlwZSk7XG4gICAgICAgIHRoaXMuYXN0Ll90eXBlID0gdGhpcy50eXBlO1xuICAgICAgICBhc3RDYWNoZVt0aGlzLnBhdGhdID0gdGhpcy5hc3Q7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRoaXMuYXN0ID0ge307XG4gICAgICAgIGUubWVzc2FnZSA9ICdTeW50YXhFcnJvciBpbiBcIicgKyB0aGlzLnBhdGggKyAnXCIgfCAnICsgZS5tZXNzYWdlO1xuICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICAvL+ihqOi+vuW8j+axguWAvFxuICAvL2ZvcmdpdmVbdHJ1ZV06IOaYr+WQpuWwhiB1bmRlZmluZWQg5Y+KIG51bGwg6L2s5Li656m65a2X56ymXG4sIGdldFZhbHVlOiBmdW5jdGlvbihzY29wZSwgZm9yZ2l2ZSkge1xuICAgIGZvcmdpdmUgPSBmb3JnaXZlICE9PSBmYWxzZTtcbiAgICB2YXIgdmFsO1xuXG4gICAgdHJ5e1xuICAgICAgdmFsID0gZXZhbHVhdGUuZXZhbCh0aGlzLmFzdCwgc2NvcGUsIHRoaXMpO1xuICAgIH1jYXRjaChlKXtcbiAgICAgIHZhbCA9ICcnO1xuICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICB9XG4gICAgaWYoZm9yZ2l2ZSAmJiAodXRpbHMuaXNVbmRlZmluZWQodmFsKSB8fCB2YWwgPT09IG51bGwpKSB7XG4gICAgICB2YWwgPSAnJztcbiAgICB9XG4gICAgcmV0dXJuIHZhbDtcbiAgfVxufTtcblxudmFyIGF0dHJQb3N0UmVnID0gL1xcPyQvO1xuXG4vKipcbiAqIOiOt+WPluS4gOS4quWFg+e0oOS4iuaJgOacieeUqCBIVE1MIOWxnuaAp+WumuS5ieeahOaMh+S7pFxuICogQHBhcmFtICB7RWxlbWVudH0gZWwgICDmjIfku6TmiYDlnKjlhYPntKBcbiAqIEBwYXJhbSAge0JlZX0gY3N0ciDnu4Tku7bmnoTpgKDlh73mlbBcbiAqIEByZXR1cm4ge2RpcmVjdGV2ZVtdfSAgICAgIGBlbGAg5LiK5omA5pyJ55qE5oyH5LukXG4gKi9cbmZ1bmN0aW9uIGdldERpcnMoZWwsIGNzdHIpe1xuICB2YXIgYXR0ciwgYXR0ck5hbWUsIGRpck5hbWUsIHByb3RvXG4gICAgLCBkaXJzID0gW10sIGRpciwgYW5jaG9ycyA9IHt9XG4gICAgLCBwYXJlbnQgPSBlbC5wYXJlbnROb2RlXG4gICAgLCBub2RlTmFtZSA9IGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKClcbiAgICAsIGRpcmVjdGl2ZXMgPSBjc3RyLmRpcmVjdGl2ZXNcbiAgICAsIHByZWZpeCA9IGNzdHIucHJlZml4XG4gICAgO1xuXG4gIC8v5a+55LqO6Ieq5a6a5LmJ5qCH562+LCDlsIblhbbovazkuLogZGlyZWN0aXZlXG4gIGlmKGNzdHIuZ2V0Q29tcG9uZW50KG5vZGVOYW1lKSkge1xuICAgIGVsLnNldEF0dHJpYnV0ZShwcmVmaXggKyAnY29tcG9uZW50Jywgbm9kZU5hbWUpO1xuICB9XG5cbiAgZm9yKHZhciBpID0gZWwuYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgYXR0ciA9IGVsLmF0dHJpYnV0ZXNbaV07XG4gICAgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuICAgIGRpck5hbWUgPSBhdHRyTmFtZS5zbGljZShwcmVmaXgubGVuZ3RoKTtcbiAgICBwcm90byA9IHtlbDogZWwsIG5vZGU6IGF0dHIsIG5vZGVOYW1lOiBhdHRyTmFtZSwgcGF0aDogYXR0ci52YWx1ZX07XG4gICAgZGlyID0gbnVsbDtcblxuICAgIGlmKGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCAmJiAoZGlyID0gZ2V0RGlyKGRpck5hbWUsIGRpcmVjdGl2ZXMpKSkge1xuICAgICAgLy/mjIfku6RcbiAgICAgIGRpci5kaXJOYW1lID0gZGlyTmFtZS8vZGlyIOWQjVxuICAgIH1lbHNlIGlmKHRva2VuLmhhc1Rva2VuKGF0dHIudmFsdWUpKSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+WPr+iDveacieWkmuS4quihqOi+vuW8j+WMulxuICAgICAgdG9rZW4ucGFyc2VUb2tlbihhdHRyLnZhbHVlKS5mb3JFYWNoKGZ1bmN0aW9uKG9yaWdpbikge1xuICAgICAgICBvcmlnaW4uZGlyTmFtZSA9IGF0dHJOYW1lLmluZGV4T2YocHJlZml4KSA9PT0gMCA/IGRpck5hbWUgOiBhdHRyTmFtZSA7XG4gICAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoY3JlYXRlKGRpcmVjdGl2ZXMuYXR0ciksIHByb3RvLCBvcmlnaW4pKVxuICAgICAgfSk7XG4gICAgICAvL+eUseS6juW3suefpeWxnuaAp+ihqOi+vuW8j+S4jeWtmOWcqCBhbmNob3IsIOaJgOS7peebtOaOpei3s+i/h+S4i+mdoueahOajgOa1i1xuICAgIH1lbHNlIGlmKGF0dHJQb3N0UmVnLnRlc3QoYXR0ck5hbWUpKSB7XG4gICAgICAvL+adoeS7tuWxnuaAp+aMh+S7pFxuICAgICAgZGlyID0gdXRpbHMuZXh0ZW5kKGNyZWF0ZShkaXJlY3RpdmVzLmF0dHIpLCB7IGRpck5hbWU6IGF0dHJOYW1lLnJlcGxhY2UoYXR0clBvc3RSZWcsICcnKSwgY29uZGl0aW9uYWw6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgaWYoZGlyKSB7XG4gICAgICBpZihkaXIuYW5jaG9yKSB7XG4gICAgICAgIGFuY2hvcnMuc3RhcnQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLnN0YXJ0LCBlbCk7XG5cbiAgICAgICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgZW5kJyk7XG4gICAgICAgIGlmKGVsLm5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLmVuZCwgZWwubmV4dFNpYmxpbmcpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoYW5jaG9ycy5lbmQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkaXIuYW5jaG9ycyA9IGRpci5hbmNob3IgPyBhbmNob3JzIDogbnVsbDtcbiAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoZGlyLCBwcm90bykpO1xuICAgIH1cbiAgfVxuICBkaXJzLnNvcnQoZnVuY3Rpb24oZDAsIGQxKSB7XG4gICAgcmV0dXJuIGQxLnByaW9yaXR5IC0gZDAucHJpb3JpdHk7XG4gIH0pO1xuICByZXR1cm4gZGlycztcbn1cblxuZnVuY3Rpb24gZ2V0RGlyKGRpck5hbWUsIGRpcnMpIHtcbiAgdmFyIGRpciwgc3ViVHlwZTtcbiAgZm9yKHZhciBrZXkgaW4gZGlycykge1xuICAgIGlmKGRpck5hbWUgPT09IGtleSl7XG4gICAgICBkaXIgPSBkaXJzW2tleV1cbiAgICAgIGJyZWFrXG4gICAgfWVsc2UgaWYoZGlyTmFtZS5pbmRleE9mKGtleSArICctJykgPT09IDApe1xuICAgICAgZGlyID0gZGlyc1trZXldXG4gICAgICBpZighZGlyLnN1Yil7XG4gICAgICAgIGRpciA9IG51bGxcbiAgICAgIH1lbHNle1xuICAgICAgICBzdWJUeXBlID0gZGlyTmFtZS5zbGljZShrZXkubGVuZ3RoICsgMSlcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZihkaXIpIHtcbiAgICBkaXIgPSBjcmVhdGUoZGlyKTtcbiAgICBkaXIuc3ViVHlwZSA9IHN1YlR5cGU7XG4gIH1cbiAgcmV0dXJuIGRpcjtcbn1cblxuRGlyZWN0aXZlLmRpcmVjdGl2ZSA9IGRpcmVjdGl2ZTtcbmRpcmVjdGl2ZS5nZXREaXJzID0gZ2V0RGlycztcblxubW9kdWxlLmV4cG9ydHMgPSBEaXJlY3RpdmU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/lsZ7mgKfmjIfku6RcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7Ly9hdHRyIGJpbmRpbmdcbiAgICAgIHRoaXMuYXR0cnMgPSB7fTtcbiAgICB9ZWxzZSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+m7mOiupOWwhuWAvOe9ruepuiwg6Ziy5q2i6KGo6L6+5byP5YaF5Y+Y6YeP5LiN5a2Y5ZyoXG4gICAgICB0aGlzLnVwZGF0ZSgnJylcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBuZXdBdHRycyA9IHt9O1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7XG4gICAgICBmb3IodmFyIGF0dHIgaW4gdmFsKSB7XG4gICAgICAgIHNldEF0dHIoZWwsIGF0dHIsIHZhbFthdHRyXSk7XG4gICAgICAgIC8vaWYodmFsW2F0dHJdKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuYXR0cnNbYXR0cl07XG4gICAgICAgIC8vfVxuICAgICAgICBuZXdBdHRyc1thdHRyXSA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8v56e76Zmk5LiN5Zyo5LiK5qyh6K6w5b2V5Lit55qE5bGe5oCnXG4gICAgICBmb3IodmFyIGF0dHIgaW4gdGhpcy5hdHRycykge1xuICAgICAgICByZW1vdmVBdHRyKGVsLCBhdHRyKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYXR0cnMgPSBuZXdBdHRycztcbiAgICB9ZWxzZXtcbiAgICAgIGlmKHRoaXMuY29uZGl0aW9uYWwpIHtcbiAgICAgICAgdmFsID8gc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB2YWwpIDogcmVtb3ZlQXR0cihlbCwgdGhpcy5kaXJOYW1lKTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLnRleHRNYXBbdGhpcy5wb3NpdGlvbl0gPSB2YWwgJiYgKHZhbCArICcnKTtcbiAgICAgICAgc2V0QXR0cihlbCwgdGhpcy5kaXJOYW1lLCB0aGlzLnRleHRNYXAuam9pbignJykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuXG4vL0lFIOa1j+iniOWZqOW+iOWkmuWxnuaAp+mAmui/hyBgc2V0QXR0cmlidXRlYCDorr7nva7lkI7ml6DmlYguIFxuLy/ov5nkupvpgJrov4cgYGVsW2F0dHJdID0gdmFsdWVgIOiuvue9rueahOWxnuaAp+WNtOiDveWkn+mAmui/hyBgcmVtb3ZlQXR0cmlidXRlYCDmuIXpmaQuXG5mdW5jdGlvbiBzZXRBdHRyKGVsLCBhdHRyLCB2YWwpe1xuICB0cnl7XG4gICAgaWYoKChhdHRyIGluIGVsKSB8fCBhdHRyID09PSAnY2xhc3MnKSl7XG4gICAgICBpZihhdHRyID09PSAnc3R5bGUnICYmIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHZhbCk7XG4gICAgICB9ZWxzZSBpZihhdHRyID09PSAnY2xhc3MnKXtcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gdmFsO1xuICAgICAgfWVsc2V7XG4gICAgICAgIGVsW2F0dHJdID0gdHlwZW9mIGVsW2F0dHJdID09PSAnYm9vbGVhbicgPyB0cnVlIDogdmFsO1xuICAgICAgfVxuICAgIH1cbiAgfWNhdGNoKGUpe31cbiAgLy9jaHJvbWUgc2V0YXR0cmlidXRlIHdpdGggYHt7fX1gIHdpbGwgdGhyb3cgYW4gZXJyb3JcbiAgZWwuc2V0QXR0cmlidXRlKGF0dHIsIHZhbCk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUF0dHIoZWwsIGF0dHIpIHtcbiAgZWwucmVtb3ZlQXR0cmlidXRlKGF0dHIpO1xufSIsIi8vY29tcG9uZW50IGFzIGRpcmVjdGl2ZVxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcbnZhciBkb21VdGlscyA9IHJlcXVpcmUoJy4uL2RvbS11dGlscycpXG52YXIgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcmlvcml0eTogLTFcbiwgd2F0Y2g6IGZhbHNlXG4sIHVuTGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jb21wb25lbnQgJiYgdGhpcy5jb21wb25lbnQuJGRlc3Ryb3koKVxuICB9XG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB2bSA9IHRoaXMudm07XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgY3N0ciA9IHZtLmNvbnN0cnVjdG9yO1xuICAgIHZhciBjb21wLCBjb250ZW50O1xuICAgIC8vdmFyIHJlZk5hbWU7XG4gICAgdmFyIGRpcnMgPSBbXSwgJGRhdGEgPSB7fTtcbiAgICB2YXIgQ29tcCA9IGNzdHIuZ2V0Q29tcG9uZW50KHRoaXMucGF0aClcblxuICAgIGlmKENvbXApIHtcblxuICAgICAgLy9UT0RPXG4gICAgICBpZihDb21wID09PSBjc3RyKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGlycyA9IHRoaXMuZGlycztcblxuICAgICAgZGlycyA9IGRpcnMuZmlsdGVyKGZ1bmN0aW9uIChkaXIpIHtcbiAgICAgICAgLy8gaWYoZGlyLnR5cGUgPT09ICdyZWYnKSB7XG4gICAgICAgIC8vICAgcmVmTmFtZSA9IGRpci5wYXRoO1xuICAgICAgICAvLyB9XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHZhciBjdXJQYXRoLCBjb21QYXRoO1xuXG4gICAgICAgIGN1clBhdGggPSBkaXIucGF0aDtcbiAgICAgICAgaWYoZGlyLnR5cGUgPT09ICd3aXRoJykge1xuICAgICAgICAgIC8vY29tUGF0aCA9ICckZGF0YSdcbiAgICAgICAgICB1dGlscy5leHRlbmQoJGRhdGEsIHZtLiRnZXQoY3VyUGF0aCkpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGNvbVBhdGggPSBkaXIuZGlyTmFtZTtcbiAgICAgICAgICAkZGF0YVtjb21QYXRoXSA9IHZtLiRnZXQoY3VyUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL+ebkeWQrOeItue7hOS7tuabtOaWsCwg5ZCM5q2l5pWw5o2uXG4gICAgICAgIHZtLiR3YXRjaChjdXJQYXRoLCBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgaWYoY29tcCl7XG4gICAgICAgICAgICB2YWwgPSBkaXIudGV4dE1hcCA/IGRpci50ZXh0TWFwLmpvaW4oJycpIDogdmFsO1xuICAgICAgICAgICAgY29tUGF0aCA/IGNvbXAuJHNldChjb21QYXRoLCB2YWwpIDogY29tcC4kc2V0KHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KGVsLmNoaWxkTm9kZXMpO1xuXG4gICAgICAvL+e7hOS7tuWGheWuueWxnuS6juWFtuWuueWZqFxuICAgICAgdm0uX19saW5rcyA9IHZtLl9fbGlua3MuY29uY2F0KGNoZWNrQmluZGluZy53YWxrLmNhbGwodm0sIGNvbnRlbnQpKTtcblxuICAgICAgZWwuYXBwZW5kQ2hpbGQoY29udGVudClcblxuICAgICAgdGhpcy5jb21wb25lbnQgPSBjb21wID0gbmV3IENvbXAoe1xuICAgICAgICAkdGFyZ2V0OiBlbCxcbiAgICAgICAgJGRhdGE6IHV0aWxzLmV4dGVuZCh7fSwgQ29tcC5wcm90b3R5cGUuJGRhdGEsICRkYXRhLCBkb21VdGlscy5nZXRBdHRycyhlbCkpXG4gICAgICB9KTtcbiAgICAgIGVsLmJlZSA9IGNvbXA7XG5cbiAgICAgIC8v55u05o6l5bCGY29tcG9uZW50IOS9nOS4uuagueWFg+e0oOaXtiwg5ZCM5q2l6Lef5paw5a655ZmoIC4kZWwg5byV55SoXG4gICAgICBpZih2bS4kZWwgPT09IGVsKSB7XG4gICAgICAgIHZtLl9fcmVmID0gY29tcDtcbiAgICAgICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gY29tcDtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgdGhpcy5wYXRoICsgJyBub3QgZGVmaW5lZCEgSWdub3JlJyk7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb21VdGlscyA9IHJlcXVpcmUoJy4uL2RvbS11dGlscycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlcGxhY2U6IHRydWVcbiwgYW5jaG9yOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMgPSBbXTtcbiAgfVxuLCB1bkxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLnVud2F0Y2goKVxuICAgIH0pO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odHBsKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpXG4gICAgdmFyIHBhcmVudCA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZVxuXG4gICAgbm9kZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnVuTGluaygpO1xuXG4gICAgdmFyIGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KHRwbClcblxuICAgIHRoaXMud2F0Y2hlcnMgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMudm0sIGNvbnRlbnQpXG4gICAgcGFyZW50Lmluc2VydEJlZm9yZShjb250ZW50LCB0aGlzLmFuY2hvcnMuZW5kKVxuICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi4vZG9tLXV0aWxzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuLi9lbnYnKS5kb2N1bWVudFxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYW5jaG9yOiB0cnVlXG4sIHRlcm1pbmFsOiB0cnVlXG4sIHN1YjogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgZW5kID0gdGhpcy5lbDtcbiAgICB2YXIgZW5kRGlyID0gdGhpcy52bS5jb25zdHJ1Y3Rvci5wcmVmaXggKyAnaWYtZW5kJztcbiAgICB2YXIgcGFyZW50O1xuXG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuXG4gICAgaWYodGhpcy5zdWJUeXBlID09PSAnc3RhcnQnKSB7XG4gICAgICB3aGlsZShlbmQgPSBlbmQubmV4dFNpYmxpbmcpIHtcbiAgICAgICAgaWYoZG9tVXRpbHMuaGFzQXR0cihlbmQsIGVuZERpcikpe1xuICAgICAgICAgIGVuZC5yZW1vdmVBdHRyaWJ1dGUoZW5kRGlyKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZihlbmQpIHtcbiAgICAgICAgcGFyZW50ID0gZW5kLnBhcmVudE5vZGVcblxuICAgICAgICBpZihlbmQubmV4dFNpYmxpbmcpIHtcbiAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMuYW5jaG9ycy5lbmQsIGVuZC5uZXh0U2libGluZylcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgIH1cbiAgICAgIH1lbHNle1xuICAgICAgICBjb25zb2xlLmVycm9yKCdleHBlY3Q6ICcgKyBlbmREaXIgKyAnLCBidXQgbm90IGZvdW5kIScpXG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuZnJhZyA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgICB0aGlzLnJlbW92ZSgpO1xuICAgIHRoaXMud2F0Y2hlcnMgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMudm0sIHRoaXMuZnJhZyk7XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICBpZih2YWwpIHtcbiAgICAgIGlmKCF0aGlzLnN0YXRlKSB7IHRoaXMuYWRkKCkgfVxuICAgIH1lbHNle1xuICAgICAgaWYodGhpcy5zdGF0ZSkgeyB0aGlzLnJlbW92ZSgpOyB9XG4gICAgfVxuICAgIHRoaXMuc3RhdGUgPSB2YWw7XG4gIH1cblxuLCBhZGQ6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcnMuZW5kO1xuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLmhpZGUgPSBmYWxzZTtcbiAgICAgIHdhdGNoZXIudXBkYXRlKClcbiAgICB9KVxuICAgIGFuY2hvci5wYXJlbnROb2RlICYmIGFuY2hvci5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLmZyYWcsIGFuY2hvcik7XG4gIH1cbiwgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSB0aGlzLmdldE5vZGVzKCk7XG5cbiAgICBpZihub2Rlcykge1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IG5vZGVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB0aGlzLmZyYWcuYXBwZW5kQ2hpbGQobm9kZXNbaV0pO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci5oaWRlID0gdHJ1ZTtcbiAgICB9KVxuICAgIC8vIHRoaXMud2F0Y2hlciA9IFtdO1xuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICA7XG5cbnZhciBkaXJzID0ge307XG5cblxuZGlycy50ZXh0ID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdGhpcy5ub2RlLm5vZGVWYWx1ZSA9IHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgPyAnJyA6IHZhbDtcbiAgfVxufTtcblxuXG5kaXJzLmh0bWwgPSB7XG4gIHRlcm1pbmFsOiB0cnVlXG4sIHJlcGxhY2U6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5ub2RlcyA9IFtdO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsLmlubmVySFRNTCA9IHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgPyAnJyA6IHZhbDtcblxuICAgIHZhciBub2RlO1xuICAgIHdoaWxlKG5vZGUgPSB0aGlzLm5vZGVzLnBvcCgpKSB7XG4gICAgICBub2RlLnBhcmVudE5vZGUgJiYgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH1cblxuICAgIHZhciBub2RlcyA9IGVsLmNoaWxkTm9kZXM7XG4gICAgd2hpbGUobm9kZSA9IG5vZGVzWzBdKSB7XG4gICAgICB0aGlzLm5vZGVzLnB1c2gobm9kZSk7XG4gICAgICB0aGlzLmVsLmluc2VydEJlZm9yZShub2RlLCB0aGlzLm5vZGUpO1xuICAgIH1cbiAgfVxufTtcblxuLy/lm77niYfnlKgsIOmBv+WFjeWKoOi9vSBVUkwg5Lit5bim5pyJ5aSn5ous5Y+355qE5Y6f5aeL5qih5p2/5YaF5a65XG5kaXJzLnNyYyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLmVsLnNyYyA9IHZhbDtcbiAgfVxufTtcblxuZGlyc1snd2l0aCddID0ge307XG5cbmRpcnNbJ2lmJ10gPSByZXF1aXJlKCcuL2lmJylcbmRpcnMucmVwZWF0ID0gcmVxdWlyZSgnLi9yZXBlYXQnKTtcbmRpcnMuYXR0ciA9IHJlcXVpcmUoJy4vYXR0cicpO1xuZGlycy5tb2RlbCA9IHJlcXVpcmUoJy4vbW9kZWwnKTtcbmRpcnMuc3R5bGUgPSByZXF1aXJlKCcuL3N0eWxlJyk7XG5kaXJzLm9uID0gcmVxdWlyZSgnLi9vbicpO1xuZGlycy5jb21wb25lbnQgPSBkaXJzLnRhZyA9IHJlcXVpcmUoJy4vY29tcG9uZW50Jyk7XG5kaXJzLmNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQnKVxuZGlycy5yZWYgPSByZXF1aXJlKCcuL3JlZicpXG5cbm1vZHVsZS5leHBvcnRzID0gZGlycztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgaGFzVG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpLmhhc1Rva2VuXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpXG4gIDtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtaW5hbDogdHJ1ZVxuLCBwcmlvcml0eTogLTJcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGtleVBhdGggPSB0aGlzLnBhdGg7XG4gICAgdmFyIHZtID0gdGhpcy52bTtcblxuICAgIGlmKCFrZXlQYXRoKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgdmFyIGNvbXAgPSB0aGlzLmVsXG4gICAgICAsIGV2ID0gJ2NoYW5nZSdcbiAgICAgICwgYXR0clxuICAgICAgLCB2YWx1ZSA9IGF0dHIgPSAndmFsdWUnXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQodm0uJGdldChrZXlQYXRoKSkvL+eVjOmdoueahOWIneWni+WAvOS4jeS8muimhuebliBtb2RlbCDnmoTliJ3lp4vlgLxcbiAgICAgICwgY3JsZiA9IC9cXHJcXG4vZy8vSUUgOCDkuIsgdGV4dGFyZWEg5Lya6Ieq5Yqo5bCGIFxcbiDmjaLooYznrKbmjaLmiJAgXFxyXFxuLiDpnIDopoHlsIblhbbmm7/mjaLlm57mnaVcblxuICAgICAgICAvL+abtOaWsOe7hOS7tlxuICAgICAgLCBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIHZhciBuZXdWYWwgPSAodmFsIHx8ICcnKSArICcnXG4gICAgICAgICAgICAsIHZhbCA9IGNvbXBbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBjb21wW2F0dHJdID0gbmV3VmFsOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvL+abtOaWsCB2aWV3TW9kZWxcbiAgICAgICwgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZhciB2YWwgPSBjb21wW3ZhbHVlXTtcblxuICAgICAgICAgIHZhbC5yZXBsYWNlICYmICh2YWwgPSB2YWwucmVwbGFjZShjcmxmLCAnXFxuJykpO1xuICAgICAgICAgIHZtLiRzZXQoa2V5UGF0aCwgdmFsKTtcbiAgICAgICAgfVxuICAgICAgLCBjYWxsSGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICBpZihlICYmIGUucHJvcGVydHlOYW1lICYmIGUucHJvcGVydHlOYW1lICE9PSBhdHRyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICB9XG4gICAgICAsIGllID0gdXRpbHMuaWVcbiAgICAgIDtcblxuICAgIGlmKGNvbXAuYmVlKSB7XG4gICAgICAvLyDnu4Tku7bnmoTlj4zlkJHnu5HlrppcbiAgICAgIGNvbXAgPSBjb21wLmJlZTtcbiAgICAgIHZhbHVlID0gY29tcC4kdmFsdWVrZXk7XG4gICAgICBpZih2YWx1ZSkge1xuICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIGNvbXAuJHJlcGxhY2UodmFsdWUsIHZhbClcbiAgICAgICAgfTtcbiAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZtLiRyZXBsYWNlKGtleVBhdGgsIGNvbXAuJGdldCh2YWx1ZSkpXG4gICAgICAgIH1cbiAgICAgICAgY29tcC4kd2F0Y2godmFsdWUsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGhhbmRsZXIoKVxuICAgICAgICB9LCB0cnVlKVxuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgLy9IVE1MIOWOn+eUn+aOp+S7tueahOWPjOWQkee7keWumlxuICAgICAgc3dpdGNoKGNvbXAudGFnTmFtZSkge1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHZhbHVlID0gYXR0ciA9ICdpbm5lckhUTUwnO1xuICAgICAgICAgIC8vZXYgKz0gJyBibHVyJztcbiAgICAgICAgY2FzZSAnSU5QVVQnOlxuICAgICAgICBjYXNlICdURVhUQVJFQSc6XG4gICAgICAgICAgc3dpdGNoKGNvbXAudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxuICAgICAgICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnY2hlY2tlZCc7XG4gICAgICAgICAgICAgIC8vSUU2LCBJRTcg5LiL55uR5ZCsIHByb3BlcnR5Y2hhbmdlIOS8muaMgj9cbiAgICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAncmFkaW8nOlxuICAgICAgICAgICAgICBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgICBpZihpZSkgeyBldiArPSAnIGNsaWNrJzsgfVxuICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICAgIGNvbXAuY2hlY2tlZCA9IGNvbXAudmFsdWUgPT09IHZhbCArICcnO1xuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpc1NldERlZmF1dCA9IGNvbXAuY2hlY2tlZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgaWYoIXZtLiRsYXp5KXtcbiAgICAgICAgICAgICAgICBpZignb25pbnB1dCcgaW4gY29tcCl7XG4gICAgICAgICAgICAgICAgICBldiArPSAnIGlucHV0JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy9JRSDkuIvnmoQgaW5wdXQg5LqL5Lu25pu/5LujXG4gICAgICAgICAgICAgICAgaWYoaWUpIHtcbiAgICAgICAgICAgICAgICAgIGV2ICs9ICcga2V5dXAgcHJvcGVydHljaGFuZ2UgY3V0JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1NFTEVDVCc6XG4gICAgICAgICAgaWYoY29tcC5tdWx0aXBsZSl7XG4gICAgICAgICAgICBoYW5kbGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgIHZhciB2YWxzID0gW107XG4gICAgICAgICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBjb21wLm9wdGlvbnMubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICAgICAgICBpZihjb21wLm9wdGlvbnNbaV0uc2VsZWN0ZWQpeyB2YWxzLnB1c2goY29tcC5vcHRpb25zW2ldLnZhbHVlKSB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdm0uJHJlcGxhY2Uoa2V5UGF0aCwgdmFscyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbih2YWxzKXtcbiAgICAgICAgICAgICAgaWYodmFscyAmJiB2YWxzLmxlbmd0aCl7XG4gICAgICAgICAgICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGNvbXAub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICAgICAgY29tcC5vcHRpb25zW2ldLnNlbGVjdGVkID0gdmFscy5pbmRleE9mKGNvbXAub3B0aW9uc1tpXS52YWx1ZSkgIT09IC0xO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaXNTZXREZWZhdXQgPSBpc1NldERlZmF1dCAmJiAhaGFzVG9rZW4oY29tcFt2YWx1ZV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgZXYuc3BsaXQoL1xccysvZykuZm9yRWFjaChmdW5jdGlvbihlKXtcbiAgICAgICAgZXZlbnRzLnJlbW92ZUV2ZW50KGNvbXAsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgICAgZXZlbnRzLmFkZEV2ZW50KGNvbXAsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgIH0pO1xuICAgICAgLy/moLnmja7ooajljZXlhYPntKDnmoTliJ3lp4vljJbpu5jorqTlgLzorr7nva7lr7nlupQgbW9kZWwg55qE5YC8XG4gICAgICBpZihjb21wW3ZhbHVlXSAmJiBpc1NldERlZmF1dCl7XG4gICAgICAgICBoYW5kbGVyKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy51cGRhdGUgPSBjYWxsYmFjaztcbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+S6i+S7tuebkeWQrFxuXG52YXIgZXZlbnRCaW5kID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHN1YjogdHJ1ZVxuLCBpbW1lZGlhdGU6IGZhbHNlIC8vIHdhdGNoIOWSjCBpbW1lZGlhdGUg5ZCM5pe25Li6IGZhbHNlIOaXtiwg5oyH5Luk55qEIHVwZGF0ZSDmlrnms5XlsIbkuI3kvJroh6rliqjooqvlpJbpg6josIPnlKhcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRpciA9IHRoaXM7XG4gICAgaWYodGhpcy5zdWJUeXBlKXtcbiAgICAgIC8vIGJlLW9uLWNsaWNrIOetiVxuICAgICAgZXZlbnRCaW5kLmFkZEV2ZW50KHRoaXMuZWwsIHRoaXMuc3ViVHlwZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGRpci52bS4kZ2V0KGRpci5wYXRoKVxuICAgICAgfSlcbiAgICB9ZWxzZXtcbiAgICAgIC8vbGluayDmlrnms5XnmoTosIPnlKjlnKggd2F0Y2hlciDmo4DmtYsgaW1tZWRpYXRlIOS5i+WJjSxcbiAgICAgIC8v5omA5Lul5Y+v5Lul5Zyo6L+Z6YeM5bCGIGltbWVkaWF0ZSDnva7kuLogdHJ1ZSDku6Xkvr/oh6rliqjosIPnlKggdXBkYXRlIOaWueazlVxuICAgICAgdGhpcy5pbW1lZGlhdGUgPSB0cnVlO1xuICAgICAgLy90aGlzLnVwZGF0ZSh0aGlzLnZtLiRnZXQodGhpcy5wYXRoKSlcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3Rvci5zaGlmdCgpO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5qb2luKCcgJyk7XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG4vL+imgeaxgiBJRTgrXG4vL+ivt+azqOaEj+i/memHjOeahCBldmVudC5jdXJyZW50VGFyZ2V0IOWSjCBldmVudC5kZWxlZ2F0ZVRhcmdldCDlkIwgalF1ZXJ5IOeahOWImuWlveebuOWPjVxuZnVuY3Rpb24gY2FsbEhhbmRsZXIgKGRpciwgc2VsZWN0b3IsIGNhbGxiYWNrKSB7XG4gIHJldHVybiBmdW5jdGlvbihlKSB7XG4gICAgdmFyIGN1ciA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICB2YXIgZWxzID0gc2VsZWN0b3IgPyB1dGlscy50b0FycmF5KGRpci5lbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkgOiBbY3VyXTtcbiAgICBkb3tcbiAgICAgIGlmKGVscy5pbmRleE9mKGN1cikgPj0gMCkge1xuICAgICAgICBlLmRlbGVnYXRlVGFyZ2V0ID0gY3VyOy8v5aeU5omY5YWD57SgXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKGRpci52bSwgZSlcbiAgICAgIH1cbiAgICB9d2hpbGUoY3VyID0gY3VyLnBhcmVudE5vZGUpXG4gIH1cbn1cbiIsIlxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHByaW9yaXR5OiAtMiAvLyByZWYg5bqU6K+l5ZyoIGNvbXBvbmVudCDkuYvlkI5cbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih1dGlscy5pc0FycmF5KHRoaXMucmVmKSkge1xuICAgICAgdGhpcy5yZWYuc3BsaWNlKHRoaXMudm0uJGluZGV4LCAxKVxuICAgIH1lbHNle1xuICAgICAgdGhpcy52bS4kcmVmc1t0aGlzLnBhdGhdID0gbnVsbDtcbiAgICB9XG4gIH1cbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZtID0gdGhpcy52bVxuICAgIC8v5ZyoIGByZXBlYXRgIOWFg+e0oOS4iueahCBgcmVmYCDkvJrmjIflkJHljL/lkI0gYHZpZXdtb2RlbGBcbiAgICBpZih2bS5fX3JlcGVhdCl7XG4gICAgICBpZighdm0uJGluZGV4KSB7XG4gICAgICAgIHZtLiRwYXJlbnQuJHJlZnNbdGhpcy5wYXRoXSA9IFtdO1xuICAgICAgfVxuICAgICAgdGhpcy5yZWYgPSB2bS4kcGFyZW50LiRyZWZzW3RoaXMucGF0aF1cbiAgICAgIHRoaXMucmVmW3ZtLiRpbmRleF0gPSB2bTtcbiAgICB9ZWxzZXtcbiAgICAgIHZtLiRyZWZzW3RoaXMucGF0aF0gPSB0aGlzLmVsLmJlZSB8fCB0aGlzLmVsO1xuICAgIH1cbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIHNjb3BlID0gcmVxdWlyZSgnLi4vc2NvcGUnKVxuICA7XG5cbi8v6L+Z5Lqb5pWw57uE5pON5L2c5pa55rOV6KKr6YeN5YaZ5oiQ6Ieq5Yqo6Kem5Y+R5pu05pawXG52YXIgYXJyYXlNZXRob2RzID0gWydzcGxpY2UnLCAncHVzaCcsICdwb3AnLCAnc2hpZnQnLCAndW5zaGlmdCcsICdzb3J0JywgJ3JldmVyc2UnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAxMDAwXG4sIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCB1bkxpbms6IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy52bUxpc3QuZm9yRWFjaChmdW5jdGlvbih2bSl7XG4gICAgICB2bS4kZGVzdHJveSgpXG4gICAgfSlcbiAgfVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgY3N0ciA9IHRoaXMuY3N0ciA9IHRoaXMudm0uY29uc3RydWN0b3I7XG5cbiAgICB3aGlsZShjc3RyLl9fc3VwZXJfXyl7XG4gICAgICBjc3RyID0gY3N0ci5fX3N1cGVyX18uY29uc3RydWN0b3I7XG4gICAgfVxuXG4gICAgdGhpcy50cmFja0lkID0gdGhpcy5lbC5nZXRBdHRyaWJ1dGUoJ3RyYWNrLWJ5JylcbiAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZSgndHJhY2stYnknKVxuXG4gICAgLy/lj6rnu6fmib/pnZnmgIHnmoTpu5jorqTlj4LmlbBcbiAgICB0aGlzLmNzdHIgPSBjc3RyLmV4dGVuZCh7fSwgdGhpcy5jc3RyKVxuXG4gICAgdGhpcy5jdXJBcnIgPSBbXTtcbiAgICB0aGlzLnZtTGlzdCA9IFtdOy8v5a2QIFZNIGxpc3RcblxuICAgIHRoaXMuZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmVsKTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKGl0ZW1zKSB7XG4gICAgdmFyIGN1ckFyciA9IHRoaXMuY3VyQXJyO1xuICAgIHZhciBwYXJlbnROb2RlID0gdGhpcy5hbmNob3JzLmVuZC5wYXJlbnROb2RlO1xuICAgIHZhciB0aGF0ID0gdGhpcywgbGlzdCA9IHRoaXMudm1MaXN0O1xuICAgIHZhciB0cmFja0lkID0gdGhpcy50cmFja0lkO1xuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcbiAgICAgIC8vIOWcqCByZXBlYXQg5oyH5Luk6KGo6L6+5byP5Lit55u45YWz5Y+Y6YePXG4gICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5zdW1tYXJ5LnBhdGhzLmZpbHRlcihmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgIHJldHVybiAhdXRpbHMuaXNGdW5jdGlvbih0aGF0LnZtLiRnZXQocGF0aCkpXG4gICAgICB9KTtcblxuICAgICAgLy/liKDpmaTlhYPntKBcbiAgICAgIGFyckRpZmYoY3VyQXJyLCBpdGVtcywgdHJhY2tJZCkuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgIHZhciBwb3MgPSBpbmRleEJ5VHJhY2tJZChpdGVtLCBjdXJBcnIsIHRyYWNrSWQpXG4gICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAxKVxuICAgICAgICBwYXJlbnROb2RlLnJlbW92ZUNoaWxkKGxpc3RbcG9zXS4kZWwpXG4gICAgICAgIGxpc3RbcG9zXS4kZGVzdHJveSgpXG4gICAgICAgIGxpc3Quc3BsaWNlKHBvcywgMSlcbiAgICAgIH0pXG5cbiAgICAgIGl0ZW1zLmZvckVhY2goZnVuY3Rpb24oaXRlbSwgaSkge1xuICAgICAgICB2YXIgcG9zID0gaW5kZXhCeVRyYWNrSWQoaXRlbSwgaXRlbXMsIHRyYWNrSWQsIGkpXG4gICAgICAgICAgLCBvbGRQb3MgPSBpbmRleEJ5VHJhY2tJZChpdGVtLCBjdXJBcnIsIHRyYWNrSWQsIGkpXG4gICAgICAgICAgLCB2bSwgZWxcbiAgICAgICAgICA7XG5cbiAgICAgICAgLy9wb3MgPCAwICYmIChwb3MgPSBpdGVtcy5sYXN0SW5kZXhPZihpdGVtLCBpKSk7XG4gICAgICAgIC8vb2xkUG9zIDwgMCAmJiAob2xkUG9zID0gY3VyQXJyLmxhc3RJbmRleE9mKGl0ZW0sIGkpKTtcblxuICAgICAgICAvL+aWsOWinuWFg+e0oFxuICAgICAgICBpZihvbGRQb3MgPCAwKSB7XG5cbiAgICAgICAgICBlbCA9IHRoaXMuZWwuY2xvbmVOb2RlKHRydWUpXG5cbiAgICAgICAgICB2bSA9IG5ldyB0aGlzLmNzdHIoZWwsIHtcbiAgICAgICAgICAgICRkYXRhOiBpdGVtLCBfYXNzaWdubWVudHM6IHRoaXMuc3VtbWFyeS5hc3NpZ25tZW50cywgJGluZGV4OiBwb3MsXG4gICAgICAgICAgICAkcm9vdDogdGhpcy52bS4kcm9vdCwgJHBhcmVudDogdGhpcy52bSxcbiAgICAgICAgICAgIF9fcmVwZWF0OiB0cnVlXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodm0uJGVsLCBsaXN0W3Bvc10gJiYgbGlzdFtwb3NdLiRlbCB8fCB0aGlzLmFuY2hvcnMuZW5kKVxuICAgICAgICAgIGxpc3Quc3BsaWNlKHBvcywgMCwgdm0pO1xuICAgICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAwLCBpdGVtKVxuXG4gICAgICAgICAgLy/lu7bml7botYvlgLznu5kgYF9yZWxhdGl2ZVBhdGhgLCDpgb/lhY3lh7rnjrDmrbvlvqrnjq9cbiAgICAgICAgICAvL+WmguaenOWcqOS4iumdouWunuS+i+WMluaXtuW9k+WPguaVsOS8oOWFpSwg5Lya5YaS5rOh5Yiw54i257qnIHZtIOmAkuW9kuiwg+eUqOi/memHjOeahCB1cGRhdGUg5pa55rOVLCDpgKDmiJDmrbvlvqrnjq8uXG4gICAgICAgICAgdm0uX3JlbGF0aXZlUGF0aCA9IHRoaXMubGlzdFBhdGg7XG4gICAgICAgIH1lbHNlIHtcblxuICAgICAgICAgIC8v6LCD5bqPXG4gICAgICAgICAgaWYgKHBvcyAhPT0gb2xkUG9zKSB7XG4gICAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShsaXN0W29sZFBvc10uJGVsLCBsaXN0W3Bvc10gJiYgbGlzdFtwb3NdLiRlbCB8fCB0aGF0LmFuY2hvcnMuZW5kKVxuICAgICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobGlzdFtwb3NdLiRlbCwgbGlzdFtvbGRQb3MgKyAxXSAmJiBsaXN0W29sZFBvcyArIDFdLiRlbCB8fCB0aGF0LmFuY2hvcnMuZW5kKVxuICAgICAgICAgICAgbGlzdFtvbGRQb3NdID0gW2xpc3RbcG9zXSwgbGlzdFtwb3NdID0gbGlzdFtvbGRQb3NdXVswXVxuICAgICAgICAgICAgY3VyQXJyW29sZFBvc10gPSBbY3VyQXJyW3Bvc10sIGN1ckFycltwb3NdID0gY3VyQXJyW29sZFBvc11dWzBdXG4gICAgICAgICAgICBsaXN0W3Bvc10uJGluZGV4ID0gcG9zXG4gICAgICAgICAgICBsaXN0W3Bvc10uJHVwZGF0ZSgnJGluZGV4JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSlcblxuICAgICAgLy/mm7TmlrDntKLlvJVcbiAgICAgIGxpc3QuZm9yRWFjaChmdW5jdGlvbih2bSwgaSkge1xuICAgICAgICB2bS4kaW5kZXggPSBpXG4gICAgICAgIHZtLiRlbC4kaW5kZXggPSBpXG4gICAgICAgIHZtLiR1cGRhdGUoJyRpbmRleCcsIGZhbHNlKVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuc3VtbWFyeS5wYXRocy5mb3JFYWNoKGZ1bmN0aW9uKGxvY2FsS2V5KSB7XG4gICAgICAgIHZhciBsb2NhbCA9IHRoYXQudm0uJGdldChsb2NhbEtleSk7XG4gICAgICAgIHZhciBkaXJzID0gbG9jYWwuX19kaXJzX187XG4gICAgICAgIGlmKHV0aWxzLmlzQXJyYXkobG9jYWwpKSB7XG4gICAgICAgICAgaWYoIWRpcnMpe1xuICAgICAgICAgICAgLy/mlbDnu4Tmk43kvZzmlrnms5VcbiAgICAgICAgICAgIHV0aWxzLmV4dGVuZChsb2NhbCwge1xuICAgICAgICAgICAgICAkc2V0OiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEsIHV0aWxzLmlzT2JqZWN0KGl0ZW0pID8gdXRpbHMuZXh0ZW5kKHt9LCBsb2NhbFtpXSwgaXRlbSkgOiBpdGVtKVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAkcmVwbGFjZTogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgICAgIGxvY2FsLnNwbGljZShpLCAxLCBpdGVtKVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAkcmVtb3ZlOiBmdW5jdGlvbihpKSB7XG4gICAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGFycmF5TWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgICAgICAgICAgICBsb2NhbFttZXRob2RdID0gdXRpbHMuYWZ0ZXJGbihsb2NhbFttZXRob2RdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBkaXJzLmZvckVhY2goZnVuY3Rpb24oZGlyKSB7XG4gICAgICAgICAgICAgICAgICBkaXIubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKGRpci52bSwgcGF0aClcbiAgICAgICAgICAgICAgICAgICAgcmVmb3JtZWQudm0uJHVwZGF0ZShyZWZvcm1lZC5wYXRoKVxuICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkaXJzID0gbG9jYWwuX19kaXJzX18gID0gW107XG4gICAgICAgICAgfVxuICAgICAgICAgIC8v5LiA5Liq5pWw57uE5aSa5aSE5L2/55SoXG4gICAgICAgICAgLy9UT0RPIOenu+mZpOaXtueahOaDheWGtVxuICAgICAgICAgIGlmKGRpcnMuaW5kZXhPZih0aGF0KSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGRpcnMucHVzaCh0aGF0KVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgIH1lbHNle1xuICAgICAgLy9UT0RPIOaZrumAmuWvueixoeeahOmBjeWOhlxuICAgIH1cbiAgfVxufTtcblxuXG5mdW5jdGlvbiBhcnJEaWZmKGFycjEsIGFycjIsIHRyYWNrSWQpIHtcbiAgdmFyIGFycjJDb3B5ID0gYXJyMi5zbGljZSgpO1xuICByZXR1cm4gYXJyMS5maWx0ZXIoZnVuY3Rpb24oZWwpIHtcbiAgICB2YXIgcmVzdWx0LCBpbmRleCA9IGluZGV4QnlUcmFja0lkKGVsLCBhcnIyQ29weSwgdHJhY2tJZClcbiAgICBpZihpbmRleCA8IDApIHtcbiAgICAgIHJlc3VsdCA9IHRydWVcbiAgICB9ZWxzZXtcbiAgICAgIGFycjJDb3B5LnNwbGljZShpbmRleCwgMSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9KVxufVxuXG5mdW5jdGlvbiBpbmRleEJ5VHJhY2tJZChpdGVtLCBsaXN0LCB0cmFja0lkLCBzdGFydEluZGV4KSB7XG4gIHN0YXJ0SW5kZXggPSBzdGFydEluZGV4IHx8IDA7XG4gIHZhciBpbmRleCA9IGxpc3QuaW5kZXhPZihpdGVtLCBzdGFydEluZGV4KTtcbiAgaWYoaW5kZXggPT09IC0xICYmIHRyYWNrSWQpe1xuICAgIGZvcih2YXIgaSA9IHN0YXJ0SW5kZXgsIGl0ZW0xOyBpdGVtMSA9IGxpc3RbaV07IGkrKykge1xuICAgICAgaWYoaXRlbVt0cmFja0lkXSA9PT0gIGl0ZW0xW3RyYWNrSWRdICYmICF1dGlscy5pc1VuZGVmaW5lZChpdGVtW3RyYWNrSWRdKSl7XG4gICAgICAgIGluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBpbmRleDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+agt+W8j+aMh+S7pFxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxudmFyIGNhbWVsUmVnID0gLyhbQS1aXSkvZztcblxuLy/pu5jorqTljZXkvY3kuLogcHgg55qE5bGe5oCnXG52YXIgcGl4ZWxBdHRycyA9IFtcbiAgJ3dpZHRoJywnaGVpZ2h0JywnbWluLXdpZHRoJywgJ21pbi1oZWlnaHQnLCAnbWF4LXdpZHRoJywgJ21heC1oZWlnaHQnLFxuICAnbWFyZ2luJywgJ21hcmdpbi10b3AnLCAnbWFyZ2luLXJpZ2h0JywgJ21hcmdpbi1sZWZ0JywgJ21hcmdpbi1ib3R0b20nLFxuICAncGFkZGluZycsICdwYWRkaW5nLXRvcCcsICdwYWRkaW5nLXJpZ2h0JywgJ3BhZGRpbmctYm90dG9tJywgJ3BhZGRpbmctbGVmdCcsXG4gICd0b3AnLCAnbGVmdCcsICdyaWdodCcsICdib3R0b20nXG5dXG5cbi8v5a+55LqOIElFNiwgSUU3IOa1j+iniOWZqOmcgOimgeS9v+eUqCBgZWwuc3R5bGUuZ2V0QXR0cmlidXRlKCdjc3NUZXh0JylgIOS4jiBgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0JylgIOadpeivu+WGmSBzdHlsZSDlrZfnrKblsZ7mgKdcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5pdFN0eWxlID0gdGhpcy5lbC5zdHlsZS5nZXRBdHRyaWJ1dGUgPyB0aGlzLmVsLnN0eWxlLmdldEF0dHJpYnV0ZSgnY3NzVGV4dCcpIDogdGhpcy5lbC5nZXRBdHRyaWJ1dGUoJ3N0eWxlJylcbiAgfSxcbiAgdXBkYXRlOiBmdW5jdGlvbihzdHlsZXMpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBzdHlsZVN0ciA9IHRoaXMuaW5pdFN0eWxlID8gdGhpcy5pbml0U3R5bGUucmVwbGFjZSgvOz8kLywgJzsnKSA6ICcnO1xuICAgIHZhciBkYXNoS2V5LCB2YWw7XG5cbiAgICBpZih0eXBlb2Ygc3R5bGVzID09PSAnc3RyaW5nJykge1xuICAgICAgc3R5bGVTdHIgKz0gc3R5bGVzO1xuICAgIH1lbHNlIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBzdHlsZXMpIHtcbiAgICAgICAgdmFsID0gc3R5bGVzW2tleV07XG5cbiAgICAgICAgLy9tYXJnaW5Ub3AgLT4gbWFyZ2luLXRvcC4g6am85bOw6L2s6L+e5o6l56ym5byPXG4gICAgICAgIGRhc2hLZXkgPSBrZXkucmVwbGFjZShjYW1lbFJlZywgZnVuY3Rpb24gKHVwcGVyQ2hhcikge1xuICAgICAgICAgIHJldHVybiAnLScgKyB1cHBlckNoYXIudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHBpeGVsQXR0cnMuaW5kZXhPZihkYXNoS2V5KSA+PSAwICYmIHV0aWxzLmlzTnVtZXJpYyh2YWwpKSB7XG4gICAgICAgICAgdmFsICs9ICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYoIXV0aWxzLmlzVW5kZWZpbmVkKHZhbCkpe1xuICAgICAgICAgIHN0eWxlU3RyICs9IGRhc2hLZXkgKyAnOiAnICsgdmFsICsgJzsgJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZihlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgLy/ogIEgSUVcbiAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHN0eWxlU3RyKTtcbiAgICB9ZWxzZXtcbiAgICAgIGVsLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBzdHlsZVN0cik7XG4gICAgfVxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcblxuLy/lpITnkIYgJHRhcmdldCwgICRjb250ZW50LCAkdHBsXG4vL3RhcmdldDogZWwg5pu/5o2i55qE55uu5qCHXG5mdW5jdGlvbiB0cGxQYXJzZSh0cGwsIHRhcmdldCwgY29udGVudCkge1xuICB2YXIgZWw7XG4gIGlmKHV0aWxzLmlzT2JqZWN0KHRhcmdldCkgJiYgdGFyZ2V0LmNoaWxkTm9kZXMpIHtcbiAgICBjb250ZW50ID0gY3JlYXRlQ29udGVudCh0YXJnZXQuY2hpbGROb2Rlcyk7XG4gIH1lbHNle1xuICAgIGlmKGNvbnRlbnQpIHtcbiAgICAgIGNvbnRlbnQgPSBjcmVhdGVDb250ZW50KGNvbnRlbnQpXG4gICAgfVxuICB9XG5cbiAgaWYodXRpbHMuaXNPYmplY3QodHBsKSl7XG4gICAgLy9ET00g5YWD57SgXG4gICAgZWwgPSB0cGw7XG4gICAgdHBsID0gZWwub3V0ZXJIVE1MO1xuICB9ZWxzZXtcbiAgICAvL+Wtl+espuS4slxuICAgIGVsID0gY3JlYXRlQ29udGVudCh0cGwpLmNoaWxkTm9kZXNbMF07XG4gIH1cblxuICBpZih0YXJnZXQpe1xuICAgIHRhcmdldC5wYXJlbnROb2RlICYmIHRhcmdldC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChlbCwgdGFyZ2V0KTtcbiAgfVxuXG4gIHJldHVybiB7ZWw6IGVsLCB0cGw6IHRwbCwgY29udGVudDogY29udGVudH07XG59XG5cbi8v5bCG5qih5p2/L+WFg+e0oC9ub2RlbGlzdCDljIXoo7nlnKggZnJhZ21lbnQg5LitXG5mdW5jdGlvbiBjcmVhdGVDb250ZW50KHRwbCkge1xuICB2YXIgY29udGVudCA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gIHZhciB3cmFwZXI7XG4gIHZhciBub2RlcyA9IFtdO1xuICBpZih1dGlscy5pc09iamVjdCh0cGwpKSB7XG4gICAgaWYodHBsLm5vZGVOYW1lICYmIHRwbC5ub2RlVHlwZSkge1xuICAgICAgLy9kb20g5YWD57SgXG4gICAgICBjb250ZW50LmFwcGVuZENoaWxkKHRwbCk7XG4gICAgfWVsc2UgaWYoJ2xlbmd0aCcgaW4gdHBsKXtcbiAgICAgIC8vbm9kZWxpc3RcbiAgICAgIG5vZGVzID0gdHBsO1xuICAgIH1cbiAgfWVsc2Uge1xuICAgIHdyYXBlciA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgIC8v6Ieq5a6a5LmJ5qCH562+5ZyoIElFOCDkuIvml6DmlYguIOS9v+eUqCBjb21wb25lbnQg5oyH5Luk5pu/5LujXG4gICAgd3JhcGVyLmlubmVySFRNTCA9ICh0cGwgKyAnJykudHJpbSgpO1xuICAgIG5vZGVzID0gd3JhcGVyLmNoaWxkTm9kZXM7XG4gIH1cbiAgd2hpbGUobm9kZXNbMF0pIHtcbiAgICBjb250ZW50LmFwcGVuZENoaWxkKG5vZGVzWzBdKVxuICB9XG4gIHJldHVybiBjb250ZW50O1xufVxuXG4vL2h0bWwg5Lit5bGe5oCn5ZCN5LiN5Yy65YiG5aSn5bCP5YaZLCDlubbkuJTkvJrlhajpg6jovazmiJDlsI/lhpkuXG4vL+i/memHjOS8muWwhui/nuWtl+espuWGmeazlei9rOaIkOmpvOWzsOW8j1xuLy9hdHRyLW5hbWUgLS0+IGF0dHJOYW1lXG4vL2F0dHItLW5hbWUgLS0+IGF0dHItbmFtZVxudmFyIGh5cGhlbnNSZWcgPSAvLSgtPykoW2Etel0pL2lnO1xudmFyIGh5cGhlblRvQ2FtZWwgPSBmdW5jdGlvbihhdHRyTmFtZSkge1xuICByZXR1cm4gYXR0ck5hbWUucmVwbGFjZShoeXBoZW5zUmVnLCBmdW5jdGlvbihzLCBkYXNoLCBjaGFyKSB7XG4gICAgcmV0dXJuIGRhc2ggPyBkYXNoICsgY2hhciA6IGNoYXIudG9VcHBlckNhc2UoKTtcbiAgfSlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRwbFBhcnNlOiB0cGxQYXJzZSxcbiAgY3JlYXRlQ29udGVudDogY3JlYXRlQ29udGVudCxcblxuICAvL+iOt+WPluWFg+e0oOWxnuaAp1xuICBnZXRBdHRyczogZnVuY3Rpb24oZWwpIHtcbiAgICB2YXIgYXR0cmlidXRlcyA9IGVsLmF0dHJpYnV0ZXM7XG4gICAgdmFyIGF0dHJzID0ge307XG5cbiAgICBmb3IodmFyIGkgPSBhdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAvL+i/nuaOpeespui9rOmpvOWzsOWGmeazlVxuICAgICAgYXR0cnNbaHlwaGVuVG9DYW1lbChhdHRyaWJ1dGVzW2ldLm5vZGVOYW1lKV0gPSBhdHRyaWJ1dGVzW2ldLnZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiBhdHRycztcbiAgfSxcblxuICBoYXNBdHRyOiBmdW5jdGlvbihlbCwgYXR0ck5hbWUpIHtcbiAgICByZXR1cm4gZWwuaGFzQXR0cmlidXRlID8gZWwuaGFzQXR0cmlidXRlKGF0dHJOYW1lKSA6ICF1dGlscy5pc1VuZGVmaW5lZChlbFthdHRyTmFtZV0pO1xuICB9XG59O1xuIiwiKGZ1bmN0aW9uKHJvb3Qpe1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBleHBvcnRzLnJvb3QgPSByb290O1xuICBleHBvcnRzLmRvY3VtZW50ID0gcm9vdC5kb2N1bWVudCB8fCByZXF1aXJlKCdqc2RvbScpLmpzZG9tKCk7XG5cbn0pKChmdW5jdGlvbigpIHtyZXR1cm4gdGhpc30pKCkpO1xuIiwiLyoqXG4gKiDooajovr7lvI/miafooYxcbiAqL1xuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIHNjb3BlID0gcmVxdWlyZSgnLi9zY29wZScpXG5cbnZhciBvcGVyYXRvcnMgPSB7XG4gICd1bmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICt2OyB9XG4gICwgJy0nOiBmdW5jdGlvbih2KSB7IHJldHVybiAtdjsgfVxuICAsICchJzogZnVuY3Rpb24odikgeyByZXR1cm4gIXY7IH1cblxuICAsICdbJzogZnVuY3Rpb24odil7IHJldHVybiB2OyB9XG4gICwgJ3snOiBmdW5jdGlvbih2KXtcbiAgICAgIHZhciByID0ge307XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gdi5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgclt2W2ldWzBdXSA9IHZbaV1bMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gcjtcbiAgICB9XG4gICwgJ3R5cGVvZic6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdHlwZW9mIHY7IH1cbiAgLCAnbmV3JzogZnVuY3Rpb24odil7IHJldHVybiBuZXcgdiB9XG4gIH1cblxuLCAnYmluYXJ5Jzoge1xuICAgICcrJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCArIHI7IH1cbiAgLCAnLSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLSByOyB9XG4gICwgJyonOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICogcjsgfVxuICAsICcvJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAvIHI7IH1cbiAgLCAnJSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJSByOyB9XG4gICwgJzwnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIDwgcjsgfVxuICAsICc+JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+IHI7IH1cbiAgLCAnPD0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIDw9IHI7IH1cbiAgLCAnPj0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID49IHI7IH1cbiAgLCAnPT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID09IHI7IH1cbiAgLCAnIT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICE9IHI7IH1cbiAgLCAnPT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PT0gcjsgfVxuICAsICchPT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICE9PSByOyB9XG4gICwgJyYmJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAmJiByOyB9XG4gICwgJ3x8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCB8fCByOyB9XG4gICwgJywnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsLCByOyB9XG5cbiAgLCAnLic6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKHIpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG4gICwgJ1snOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZih0eXBlb2YgciAhPT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICBwYXRoID0gcGF0aCArICcuJyArIHI7XG4gICAgICB9XG4gICAgICByZXR1cm4gbFtyXTtcbiAgICB9XG5cbiAgICAvL1RPRE8g5qih5p2/5Lit5pa55rOV55qEIHRoaXMg5bqU6K+l5oyH5ZCRIHJvb3RcbiAgLCAnKCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gbC5hcHBseShjb250ZXh0LmxvY2FscywgcikgfVxuICAgIC8vZmlsdGVyLiBuYW1lfGZpbHRlclxuICAsICd8JzogZnVuY3Rpb24obCwgcil7IHJldHVybiBjYWxsRmlsdGVyKGwsIHIsIFtdKSB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgcmV0dXJuIGwgPT09IERhdGUgPyBuZXcgRnVuY3Rpb24oJ3JldHVybiBuZXcgRGF0ZSgnICsgci5qb2luKCcsICcpICsgJyknKSgpIDogbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShsLCByKSk7XG4gICAgfVxuXG4gICwgJ2luJzogZnVuY3Rpb24obCwgcil7XG4gICAgICBpZih0aGlzLnJlcGVhdCkge1xuICAgICAgICAvL3JlcGVhdFxuICAgICAgICByZXR1cm4gcjtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm4gbCBpbiByO1xuICAgICAgfVxuICAgIH1cbiAgLCAnY2F0Y2hieSc6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKGxbJ2NhdGNoJ10pIHtcbiAgICAgICAgcmV0dXJuIGxbJ2NhdGNoJ10oci5iaW5kKHJvb3QpKVxuICAgICAgfWVsc2V7XG4gICAgICAgIHN1bW1hcnlDYWxsIHx8IGNvbnNvbGUuZXJyb3IoJ2NhdGNoYnkgZXhwZWN0IGEgcHJvbWlzZScpXG4gICAgICAgIHJldHVybiBsO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4sICd0ZXJuYXJ5Jzoge1xuICAgICc/JzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZiA/IHMgOiB0OyB9XG4gICwgJygnOiBmdW5jdGlvbihmLCBzLCB0KSB7IHJldHVybiBmW3NdLmFwcGx5KGYsIHQpIH1cblxuICAgIC8vZmlsdGVyLiBuYW1lIHwgZmlsdGVyIDogYXJnMiA6IGFyZzNcbiAgLCAnfCc6IGZ1bmN0aW9uKGYsIHMsIHQpeyByZXR1cm4gY2FsbEZpbHRlcihmLCBzLCB0KSB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGNhbGxGaWx0ZXIoYXJnLCBmaWx0ZXIsIGFyZ3MpIHtcbiAgaWYoYXJnICYmIGFyZy50aGVuKSB7XG4gICAgcmV0dXJuIGFyZy50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiBmaWx0ZXIuYXBwbHkocm9vdCwgW2RhdGFdLmNvbmNhdChhcmdzKSlcbiAgICB9KTtcbiAgfWVsc2V7XG4gICAgcmV0dXJuIGZpbHRlci5hcHBseShyb290LCBbYXJnXS5jb25jYXQoYXJncykpXG4gIH1cbn1cblxudmFyIGFyZ05hbWUgPSBbJ2ZpcnN0JywgJ3NlY29uZCcsICd0aGlyZCddXG4gICwgY29udGV4dCwgc3VtbWFyeSwgc3VtbWFyeUNhbGxcbiAgLCBwYXRoXG4gICwgc2VsZlxuICAsIHJvb3RcbiAgO1xuXG4vL+mBjeWOhiBhc3RcbnZhciBldmFsdWF0ZSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdmFyIGFyaXR5ID0gdHJlZS5hcml0eVxuICAgICwgdmFsdWUgPSB0cmVlLnZhbHVlXG4gICAgLCBhcmdzID0gW11cbiAgICAsIG4gPSAwXG4gICAgLCBhcmdcbiAgICAsIHJlc1xuICAgIDtcblxuICAvL+aTjeS9nOespuacgOWkmuWPquacieS4ieWFg1xuICBmb3IoOyBuIDwgMzsgbisrKXtcbiAgICBhcmcgPSB0cmVlW2FyZ05hbWVbbl1dO1xuICAgIGlmKGFyZyl7XG4gICAgICBpZihBcnJheS5pc0FycmF5KGFyZykpe1xuICAgICAgICBhcmdzW25dID0gW107XG4gICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBhcmcubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICBhcmdzW25dLnB1c2godHlwZW9mIGFyZ1tpXS5rZXkgPT09ICd1bmRlZmluZWQnID9cbiAgICAgICAgICAgIGV2YWx1YXRlKGFyZ1tpXSkgOiBbYXJnW2ldLmtleSwgZXZhbHVhdGUoYXJnW2ldKV0pO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYXJnc1tuXSA9IGV2YWx1YXRlKGFyZyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoYXJpdHkgIT09ICdsaXRlcmFsJykge1xuICAgIGlmKHBhdGggJiYgdmFsdWUgIT09ICcuJyAmJiB2YWx1ZSAhPT0gJ1snKSB7XG4gICAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYoYXJpdHkgPT09ICduYW1lJykge1xuICAgICAgcGF0aCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHN3aXRjaChhcml0eSl7XG4gICAgY2FzZSAndW5hcnknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAndGVybmFyeSc6XG4gICAgICB0cnl7XG4gICAgICAgIHJlcyA9IGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSkuYXBwbHkodHJlZSwgYXJncyk7XG4gICAgICB9Y2F0Y2goZSl7XG4gICAgICAgIC8vc3VtbWFyeUNhbGwgfHwgY29uc29sZS53YXJuKGUpO1xuICAgICAgfVxuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2xpdGVyYWwnOlxuICAgICAgcmVzID0gdmFsdWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAncmVwZWF0JzpcbiAgICAgIHN1bW1hcnkuYXNzaWdubWVudHNbdmFsdWVdID0gdHJ1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICduYW1lJzpcbiAgICAgIHN1bW1hcnkubG9jYWxzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBnZXRWYWx1ZSh2YWx1ZSwgY29udGV4dC5sb2NhbHMpO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2ZpbHRlcic6XG4gICAgICBzdW1tYXJ5LmZpbHRlcnNbdmFsdWVdID0gdHJ1ZTtcbiAgICAgIHJlcyA9IGNvbnRleHQuZmlsdGVyc1t2YWx1ZV07XG4gICAgYnJlYWs7XG4gICAgY2FzZSAndGhpcyc6XG4gICAgICByZXMgPSBjb250ZXh0LmxvY2FsczsvL1RPRE8gdGhpcyDmjIflkJEgdm0g6L+Y5pivIGRpcj9cbiAgICBicmVhaztcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcblxuZnVuY3Rpb24gZ2V0T3BlcmF0b3IoYXJpdHksIHZhbHVlKXtcbiAgcmV0dXJuIG9wZXJhdG9yc1thcml0eV1bdmFsdWVdIHx8IGZ1bmN0aW9uKCkgeyByZXR1cm47IH1cbn1cblxuZnVuY3Rpb24gcmVzZXQoc2NvcGUsIHRoYXQpIHtcbiAgc3VtbWFyeUNhbGwgPSB0cnVlO1xuICBpZihzY29wZSkge1xuICAgIHJvb3QgPSBzY29wZS4kcm9vdDtcbiAgICBzdW1tYXJ5Q2FsbCA9IGZhbHNlO1xuICAgIGNvbnRleHQgPSB7bG9jYWxzOiBzY29wZSB8fCB7fSwgZmlsdGVyczogc2NvcGUuY29uc3RydWN0b3IuZmlsdGVycyB8fCB7fX07XG4gIH1lbHNle1xuICAgIGNvbnRleHQgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge319O1xuICB9XG4gIGlmKHRoYXQpe1xuICAgIHNlbGYgPSB0aGF0O1xuICB9XG5cbiAgc3VtbWFyeSA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fSwgcGF0aHM6IHt9LCBhc3NpZ25tZW50czoge319O1xuICBwYXRoID0gJyc7XG59XG5cbi8v5Zyo5L2c55So5Z+f5Lit5p+l5om+5YC8XG52YXIgZ2V0VmFsdWUgPSBmdW5jdGlvbihrZXksIHZtKSB7XG4gIHZhciByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHZtLCBrZXkpXG4gIHJldHVybiByZWZvcm1lZC52bVtyZWZvcm1lZC5wYXRoXVxufVxuXG4vL+ihqOi+vuW8j+axguWAvFxuLy90cmVlOiBwYXJzZXIg55Sf5oiQ55qEIGFzdFxuLy9zY29wZSDmiafooYznjq/looNcbmV4cG9ydHMuZXZhbCA9IGZ1bmN0aW9uKHRyZWUsIHNjb3BlLCB0aGF0KSB7XG4gIHJlc2V0KHNjb3BlIHx8IHt9LCB0aGF0KTtcblxuICByZXR1cm4gZXZhbHVhdGUodHJlZSk7XG59O1xuXG4vL+ihqOi+vuW8j+aRmOimgVxuLy9yZXR1cm46IHtmaWx0ZXJzOltdLCBsb2NhbHM6W10sIHBhdGhzOiBbXSwgYXNzaWdubWVudHM6IFtdfVxuZXhwb3J0cy5zdW1tYXJ5ID0gZnVuY3Rpb24odHJlZSkge1xuICByZXNldCgpO1xuXG4gIGV2YWx1YXRlKHRyZWUpO1xuXG4gIGlmKHBhdGgpIHtcbiAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgfVxuICBmb3IodmFyIGtleSBpbiBzdW1tYXJ5KSB7XG4gICAgc3VtbWFyeVtrZXldID0gT2JqZWN0LmtleXMoc3VtbWFyeVtrZXldKTtcbiAgfVxuICByZXR1cm4gc3VtbWFyeTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5hZGRFdmVudCA9IGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xuICBpZihlbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlciwgZmFsc2UpO1xuICB9ZWxzZXtcbiAgICBlbC5hdHRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59XG5cbmV4cG9ydHMucmVtb3ZlRXZlbnQgPSBmdW5jdGlvbiByZW1vdmVFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIpO1xuICB9ZWxzZXtcbiAgICBlbC5kZXRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59IiwiXCJ1c2Ugc3RyaWN0XCI7XG4vL0phdmFzY3JpcHQgZXhwcmVzc2lvbiBwYXJzZXIgbW9kaWZpZWQgZm9ybSBDcm9ja2ZvcmQncyBURE9QIHBhcnNlclxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcblx0ZnVuY3Rpb24gRigpIHt9XG5cdEYucHJvdG90eXBlID0gbztcblx0cmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgc291cmNlO1xuXG52YXIgZXJyb3IgPSBmdW5jdGlvbiAobWVzc2FnZSwgdCkge1xuXHR0ID0gdCB8fCB0aGlzO1xuICB2YXIgbXNnID0gbWVzc2FnZSArPSBcIiBCdXQgZm91bmQgJ1wiICsgdC52YWx1ZSArIFwiJ1wiICsgKHQuZnJvbSA/IFwiIGF0IFwiICsgdC5mcm9tIDogXCJcIikgKyBcIiBpbiAnXCIgKyBzb3VyY2UgKyBcIidcIjtcbiAgdmFyIGUgPSBuZXcgRXJyb3IobXNnKTtcblx0ZS5uYW1lID0gdC5uYW1lID0gXCJTeW50YXhFcnJvclwiO1xuXHR0Lm1lc3NhZ2UgPSBtZXNzYWdlO1xuICB0aHJvdyBlO1xufTtcblxudmFyIHRva2VuaXplID0gZnVuY3Rpb24gKGNvZGUsIHByZWZpeCwgc3VmZml4KSB7XG5cdHZhciBjOyAvLyBUaGUgY3VycmVudCBjaGFyYWN0ZXIuXG5cdHZhciBmcm9tOyAvLyBUaGUgaW5kZXggb2YgdGhlIHN0YXJ0IG9mIHRoZSB0b2tlbi5cblx0dmFyIGkgPSAwOyAvLyBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgbGVuZ3RoID0gY29kZS5sZW5ndGg7XG5cdHZhciBuOyAvLyBUaGUgbnVtYmVyIHZhbHVlLlxuXHR2YXIgcTsgLy8gVGhlIHF1b3RlIGNoYXJhY3Rlci5cblx0dmFyIHN0cjsgLy8gVGhlIHN0cmluZyB2YWx1ZS5cblxuXHR2YXIgcmVzdWx0ID0gW107IC8vIEFuIGFycmF5IHRvIGhvbGQgdGhlIHJlc3VsdHMuXG5cblx0Ly8gTWFrZSBhIHRva2VuIG9iamVjdC5cblx0dmFyIG1ha2UgPSBmdW5jdGlvbiAodHlwZSwgdmFsdWUpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZSA6IHR5cGUsXG5cdFx0XHR2YWx1ZSA6IHZhbHVlLFxuXHRcdFx0ZnJvbSA6IGZyb20sXG5cdFx0XHR0byA6IGlcblx0XHR9O1xuXHR9O1xuXG5cdC8vIEJlZ2luIHRva2VuaXphdGlvbi4gSWYgdGhlIHNvdXJjZSBzdHJpbmcgaXMgZW1wdHksIHJldHVybiBub3RoaW5nLlxuXHRpZiAoIWNvZGUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBMb29wIHRocm91Z2ggY29kZSB0ZXh0LCBvbmUgY2hhcmFjdGVyIGF0IGEgdGltZS5cblx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHR3aGlsZSAoYykge1xuXHRcdGZyb20gPSBpO1xuXG5cdFx0aWYgKGMgPD0gJyAnKSB7IC8vIElnbm9yZSB3aGl0ZXNwYWNlLlxuXHRcdFx0aSArPSAxO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH0gZWxzZSBpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8IGMgPT09ICckJyB8fCBjID09PSAnXycpIHsgLy8gbmFtZS5cblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8XG5cdFx0XHRcdFx0KGMgPj0gJzAnICYmIGMgPD0gJzknKSB8fCBjID09PSAnXycpIHtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ25hbWUnLCBzdHIpKTtcblx0XHR9IGVsc2UgaWYgKGMgPj0gJzAnICYmIGMgPD0gJzknKSB7XG5cdFx0XHQvLyBudW1iZXIuXG5cblx0XHRcdC8vIEEgbnVtYmVyIGNhbm5vdCBzdGFydCB3aXRoIGEgZGVjaW1hbCBwb2ludC4gSXQgbXVzdCBzdGFydCB3aXRoIGEgZGlnaXQsXG5cdFx0XHQvLyBwb3NzaWJseSAnMCcuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXG5cdFx0XHQvLyBMb29rIGZvciBtb3JlIGRpZ2l0cy5cblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIGZvciBhIGRlY2ltYWwgZnJhY3Rpb24gcGFydC5cblx0XHRcdGlmIChjID09PSAnLicpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYW4gZXhwb25lbnQgcGFydC5cblx0XHRcdGlmIChjID09PSAnZScgfHwgYyA9PT0gJ0UnKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPT09ICctJyB8fCBjID09PSAnKycpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBleHBvbmVudFwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fSB3aGlsZSAoYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlIG5leHQgY2hhcmFjdGVyIGlzIG5vdCBhIGxldHRlci5cblxuXHRcdFx0aWYgKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlIHRvIGEgbnVtYmVyLiBJZiBpdCBpcyBmaW5pdGUsIHRoZW4gaXQgaXMgYSBnb29kXG5cdFx0XHQvLyB0b2tlbi5cblxuXHRcdFx0biA9ICtzdHI7XG5cdFx0XHRpZiAoaXNGaW5pdGUobikpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnbnVtYmVyJywgbikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXJyb3IoXCJCYWQgbnVtYmVyXCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzdHJpbmdcblxuXHRcdH0gZWxzZSBpZiAoYyA9PT0gJ1xcJycgfHwgYyA9PT0gJ1wiJykge1xuXHRcdFx0c3RyID0gJyc7XG5cdFx0XHRxID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJyAnKSB7XG5cdFx0XHRcdFx0bWFrZSgnc3RyaW5nJywgc3RyKTtcblx0XHRcdFx0XHRlcnJvcihjID09PSAnXFxuJyB8fCBjID09PSAnXFxyJyB8fCBjID09PSAnJyA/XG5cdFx0XHRcdFx0XHRcIlVudGVybWluYXRlZCBzdHJpbmcuXCIgOlxuXHRcdFx0XHRcdFx0XCJDb250cm9sIGNoYXJhY3RlciBpbiBzdHJpbmcuXCIsIG1ha2UoJycsIHN0cikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgdGhlIGNsb3NpbmcgcXVvdGUuXG5cblx0XHRcdFx0aWYgKGMgPT09IHEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIGVzY2FwZW1lbnQuXG5cblx0XHRcdFx0aWYgKGMgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdHN3aXRjaCAoYykge1xuXHRcdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcZic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICduJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndCc6XG5cdFx0XHRcdFx0XHRjID0gJ1xcdCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1Jzpcblx0XHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gcGFyc2VJbnQoY29kZS5zdWJzdHIoaSArIDEsIDQpLCAxNik7XG5cdFx0XHRcdFx0XHRpZiAoIWlzRmluaXRlKGMpIHx8IGMgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuXHRcdFx0XHRcdFx0aSArPSA0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0Ly8gY29tYmluaW5nXG5cblx0XHR9IGVsc2UgaWYgKHByZWZpeC5pbmRleE9mKGMpID49IDApIHtcblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChpID49IGxlbmd0aCB8fCBzdWZmaXguaW5kZXhPZihjKSA8IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnb3BlcmF0b3InLCBzdHIpKTtcblxuXHRcdFx0Ly8gc2luZ2xlLWNoYXJhY3RlciBvcGVyYXRvclxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgYykpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIG1ha2VfcGFyc2UgPSBmdW5jdGlvbiAodmFycykge1xuXHR2YXJzID0gdmFycyB8fCB7fTsvL+mihOWumuS5ieeahOWPmOmHj1xuXHR2YXIgc3ltYm9sX3RhYmxlID0ge307XG5cdHZhciB0b2tlbjtcblx0dmFyIHRva2Vucztcblx0dmFyIHRva2VuX25yO1xuXHR2YXIgY29udGV4dDtcblxuXHR2YXIgaXRzZWxmID0gZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdHZhciBmaW5kID0gZnVuY3Rpb24gKG4pIHtcblx0XHRuLm51ZCA9IGl0c2VsZjtcblx0XHRuLmxlZCA9IG51bGw7XG5cdFx0bi5zdGQgPSBudWxsO1xuXHRcdG4ubGJwID0gMDtcblx0XHRyZXR1cm4gbjtcblx0fTtcblxuXHR2YXIgYWR2YW5jZSA9IGZ1bmN0aW9uIChpZCkge1xuXHRcdHZhciBhLCBvLCB0LCB2O1xuXHRcdGlmIChpZCAmJiB0b2tlbi5pZCAhPT0gaWQpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgJ1wiICsgaWQgKyBcIicuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuX25yID49IHRva2Vucy5sZW5ndGgpIHtcblx0XHRcdHRva2VuID0gc3ltYm9sX3RhYmxlW1wiKGVuZClcIl07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHQgPSB0b2tlbnNbdG9rZW5fbnJdO1xuXHRcdHRva2VuX25yICs9IDE7XG5cdFx0diA9IHQudmFsdWU7XG5cdFx0YSA9IHQudHlwZTtcblx0XHRpZiAoKGEgPT09IFwib3BlcmF0b3JcIiB8fCBhICE9PSAnc3RyaW5nJykgJiYgdiBpbiBzeW1ib2xfdGFibGUpIHtcblx0XHRcdC8vdHJ1ZSwgZmFsc2Ug562J55u05o6l6YeP5Lmf5Lya6L+b5YWl5q2k5YiG5pSvXG5cdFx0XHRvID0gc3ltYm9sX3RhYmxlW3ZdO1xuXHRcdFx0aWYgKCFvKSB7XG5cdFx0XHRcdGVycm9yKFwiVW5rbm93biBvcGVyYXRvci5cIiwgdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhID09PSBcIm5hbWVcIikge1xuXHRcdFx0byA9IGZpbmQodCk7XG5cdFx0fSBlbHNlIGlmIChhID09PSBcInN0cmluZ1wiIHx8IGEgPT09IFwibnVtYmVyXCIgfHwgYSA9PT0gXCJyZWdleHBcIikge1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVtcIihsaXRlcmFsKVwiXTtcblx0XHRcdGEgPSBcImxpdGVyYWxcIjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXJyb3IoXCJVbmV4cGVjdGVkIHRva2VuLlwiLCB0KTtcblx0XHR9XG5cdFx0dG9rZW4gPSBjcmVhdGUobyk7XG5cdFx0dG9rZW4uZnJvbSA9IHQuZnJvbTtcblx0XHR0b2tlbi50byA9IHQudG87XG5cdFx0dG9rZW4udmFsdWUgPSB2O1xuXHRcdHRva2VuLmFyaXR5ID0gYTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH07XG5cbiAgLy/ooajovr7lvI9cbiAgLy9yYnA6IHJpZ2h0IGJpbmRpbmcgcG93ZXIg5Y+z5L6n57qm5p2f5YqbXG5cdHZhciBleHByZXNzaW9uID0gZnVuY3Rpb24gKHJicCkge1xuXHRcdHZhciBsZWZ0O1xuXHRcdHZhciB0ID0gdG9rZW47XG5cdFx0YWR2YW5jZSgpO1xuXHRcdGxlZnQgPSB0Lm51ZCgpO1xuXHRcdHdoaWxlIChyYnAgPCB0b2tlbi5sYnApIHtcblx0XHRcdHQgPSB0b2tlbjtcblx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdGxlZnQgPSB0LmxlZChsZWZ0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGxlZnQ7XG5cdH07XG5cblx0dmFyIG9yaWdpbmFsX3N5bWJvbCA9IHtcblx0XHRudWQgOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlcnJvcihcIlVuZGVmaW5lZC5cIiwgdGhpcyk7XG5cdFx0fSxcblx0XHRsZWQgOiBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0ZXJyb3IoXCJNaXNzaW5nIG9wZXJhdG9yLlwiLCB0aGlzKTtcblx0XHR9XG5cdH07XG5cblx0dmFyIHN5bWJvbCA9IGZ1bmN0aW9uIChpZCwgYnApIHtcblx0XHR2YXIgcyA9IHN5bWJvbF90YWJsZVtpZF07XG5cdFx0YnAgPSBicCB8fCAwO1xuXHRcdGlmIChzKSB7XG5cdFx0XHRpZiAoYnAgPj0gcy5sYnApIHtcblx0XHRcdFx0cy5sYnAgPSBicDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cyA9IGNyZWF0ZShvcmlnaW5hbF9zeW1ib2wpO1xuXHRcdFx0cy5pZCA9IHMudmFsdWUgPSBpZDtcblx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHRzeW1ib2xfdGFibGVbaWRdID0gcztcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGNvbnN0YW50ID0gZnVuY3Rpb24gKHMsIHYsIGEpIHtcblx0XHR2YXIgeCA9IHN5bWJvbChzKTtcblx0XHR4Lm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBzeW1ib2xfdGFibGVbdGhpcy5pZF0udmFsdWU7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHgudmFsdWUgPSB2O1xuXHRcdHJldHVybiB4O1xuXHR9O1xuXG5cdHZhciBpbmZpeCA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgaW5maXhyID0gZnVuY3Rpb24gKGlkLCBicCwgbGVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQsIGJwKTtcblx0XHRzLmxlZCA9IGxlZCB8fCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oYnAgLSAxKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgcHJlZml4ID0gZnVuY3Rpb24gKGlkLCBudWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCk7XG5cdFx0cy5udWQgPSBudWQgfHwgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzApO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0c3ltYm9sKFwiKGVuZClcIik7XG5cdHN5bWJvbChcIihuYW1lKVwiKTtcblx0c3ltYm9sKFwiOlwiKTtcblx0c3ltYm9sKFwiKVwiKTtcblx0c3ltYm9sKFwiXVwiKTtcblx0c3ltYm9sKFwifVwiKTtcblx0c3ltYm9sKFwiLFwiKTtcblxuXHRjb25zdGFudChcInRydWVcIiwgdHJ1ZSk7XG5cdGNvbnN0YW50KFwiZmFsc2VcIiwgZmFsc2UpO1xuXHRjb25zdGFudChcIm51bGxcIiwgbnVsbCk7XG5cdGNvbnN0YW50KFwidW5kZWZpbmVkXCIpO1xuXG5cdGNvbnN0YW50KFwiTWF0aFwiLCBNYXRoKTtcblx0Y29uc3RhbnQoXCJEYXRlXCIsIERhdGUpO1xuXHRmb3IodmFyIHYgaW4gdmFycykge1xuXHRcdGNvbnN0YW50KHYsIHZhcnNbdl0pO1xuXHR9XG5cblx0c3ltYm9sKFwiKGxpdGVyYWwpXCIpLm51ZCA9IGl0c2VsZjtcblxuXHRzeW1ib2woXCJ0aGlzXCIpLm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0ICB0aGlzLmFyaXR5ID0gXCJ0aGlzXCI7XG5cdCAgcmV0dXJuIHRoaXM7XG5cdH07XG5cblx0Ly9PcGVyYXRvciBQcmVjZWRlbmNlOlxuXHQvL2h0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL09wZXJhdG9ycy9PcGVyYXRvcl9QcmVjZWRlbmNlXG5cbiAgLy9pbmZpeCgnLCcsIDEpO1xuXHRpbmZpeChcIj9cIiwgMjAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCI6XCIpO1xuXHRcdHRoaXMudGhpcmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXhyKFwiJiZcIiwgMzEpO1xuXHRpbmZpeHIoXCJ8fFwiLCAzMCk7XG5cblx0aW5maXhyKFwiPT09XCIsIDQwKTtcblx0aW5maXhyKFwiIT09XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI9PVwiLCA0MCk7XG5cdGluZml4cihcIiE9XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI8XCIsIDQwKTtcblx0aW5maXhyKFwiPD1cIiwgNDApO1xuXHRpbmZpeHIoXCI+XCIsIDQwKTtcblx0aW5maXhyKFwiPj1cIiwgNDApO1xuXG5cdGluZml4KFwiaW5cIiwgNDUsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGlmIChjb250ZXh0ID09PSAncmVwZWF0Jykge1xuXHRcdFx0Ly8gYGluYCBhdCByZXBlYXQgYmxvY2tcblx0XHRcdGxlZnQuYXJpdHkgPSAncmVwZWF0Jztcblx0XHRcdHRoaXMucmVwZWF0ID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiK1wiLCA1MCk7XG5cdGluZml4KFwiLVwiLCA1MCk7XG5cblx0aW5maXgoXCIqXCIsIDYwKTtcblx0aW5maXgoXCIvXCIsIDYwKTtcblx0aW5maXgoXCIlXCIsIDYwKTtcblxuXHRpbmZpeChcIihcIiwgNzAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAobGVmdC5pZCA9PT0gXCIuXCIgfHwgbGVmdC5pZCA9PT0gXCJbXCIpIHtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0LmZpcnN0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBsZWZ0LnNlY29uZDtcblx0XHRcdHRoaXMudGhpcmQgPSBhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0aWYgKChsZWZ0LmFyaXR5ICE9PSBcInVuYXJ5XCIgfHwgbGVmdC5pZCAhPT0gXCJmdW5jdGlvblwiKSAmJlxuXHRcdFx0XHRsZWZ0LmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBsZWZ0LmFyaXR5ICE9PSBcImxpdGVyYWxcIiAmJiBsZWZ0LmlkICE9PSBcIihcIiAmJlxuXHRcdFx0XHRsZWZ0LmlkICE9PSBcIiYmXCIgJiYgbGVmdC5pZCAhPT0gXCJ8fFwiICYmIGxlZnQuaWQgIT09IFwiP1wiKSB7XG5cdFx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSB2YXJpYWJsZSBuYW1lLlwiLCBsZWZ0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIilcIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMSkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIi5cIiwgODAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0aWYgKHRva2VuLmFyaXR5ICE9PSBcIm5hbWVcIikge1xuXHRcdFx0ZXJyb3IoXCJFeHBlY3RlZCBhIHByb3BlcnR5IG5hbWUuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0dG9rZW4uYXJpdHkgPSBcImxpdGVyYWxcIjtcblx0XHR0aGlzLnNlY29uZCA9IHRva2VuO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCJbXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0Ly9maWx0ZXJcblx0aW5maXgoXCJ8XCIsIDEwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhO1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRva2VuLmFyaXR5ID0gJ2ZpbHRlcic7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDEwKTtcblx0XHR0aGlzLmFyaXR5ID0gJ2JpbmFyeSc7XG5cdFx0aWYgKHRva2VuLmlkID09PSAnOicpIHtcblx0XHRcdHRoaXMuYXJpdHkgPSAndGVybmFyeSc7XG5cdFx0XHR0aGlzLnRoaXJkID0gYSA9IFtdO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YWR2YW5jZSgnOicpO1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigxMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiOlwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuICBpbmZpeCgnY2F0Y2hieScsIDEwKTtcblxuXHRwcmVmaXgoXCIhXCIpO1xuXHRwcmVmaXgoXCItXCIpO1xuXHRwcmVmaXgoXCJ0eXBlb2ZcIik7XG5cblx0cHJlZml4KFwiKFwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGUgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiBlO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJbXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJdXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJ7XCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdLFx0biwgdjtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwifVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRuID0gdG9rZW47XG5cdFx0XHRcdGlmIChuLmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBuLmFyaXR5ICE9PSBcImxpdGVyYWxcIikge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIHByb3BlcnR5IG5hbWU6IFwiLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHRcdFx0diA9IGV4cHJlc3Npb24oMSk7XG5cdFx0XHRcdHYua2V5ID0gbi52YWx1ZTtcblx0XHRcdFx0YS5wdXNoKHYpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJ9XCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeCgnbmV3JywgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzkpO1xuXHRcdGlmKHRva2VuLmlkID09PSAnKCcpIHtcblx0XHRcdGFkdmFuY2UoXCIoXCIpO1xuXHRcdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMSkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHR9ZWxzZXtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHQvL19zb3VyY2U6IOihqOi+vuW8j+S7o+eggeWtl+espuS4slxuXHQvL19jb250ZXh0OiDooajovr7lvI/nmoTor63lj6Xnjq/looNcblx0cmV0dXJuIGZ1bmN0aW9uIChfc291cmNlLCBfY29udGV4dCkge1xuICAgIHNvdXJjZSA9IF9zb3VyY2U7XG5cdFx0dG9rZW5zID0gdG9rZW5pemUoX3NvdXJjZSwgJz08PiErLSomfC8lXicsICc9PD4mfCcpO1xuXHRcdHRva2VuX25yID0gMDtcblx0XHRjb250ZXh0ID0gX2NvbnRleHQ7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHZhciBzID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKGVuZClcIik7XG5cdFx0cmV0dXJuIHM7XG5cdH07XG59O1xuXG5leHBvcnRzLnBhcnNlID0gbWFrZV9wYXJzZSgpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuLy/moLnmja7lj5jph4/lj4ogdm0g56Gu5a6a5Y+Y6YeP5omA5bGe55qE55yf5q2jIHZtXG52YXIgcmVmb3JtU2NvcGUgPSBmdW5jdGlvbiAodm0sIHBhdGgpIHtcbiAgdmFyIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKHBhdGgpO1xuICB2YXIgY3VyID0gdm0sIGxvY2FsID0gcGF0aHNbMF07XG4gIHZhciBhc3MsIGN1clZtID0gY3VyO1xuXG4gIHdoaWxlKGN1cikge1xuICAgIGN1clZtID0gY3VyO1xuICAgIGFzcyA9IGN1ci5fYXNzaWdubWVudHM7XG4gICAgaWYoIGN1ci5fX3JlcGVhdCkge1xuICAgICAgaWYgKGFzcyAmJiBhc3MubGVuZ3RoKSB7XG4gICAgICAgIC8vIOWFt+WQjSByZXBlYXQg5LiN5Lya55u05o6l5p+l5om+6Ieq6Lqr5L2c55So5Z+fXG4gICAgICAgIGlmIChsb2NhbCA9PT0gJyRpbmRleCcgfHwgbG9jYWwgPT09ICckcGFyZW50Jykge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2UgaWYgKGxvY2FsID09PSBhc3NbMF0pIHtcbiAgICAgICAgICAvL+S/ruato2tleVxuICAgICAgICAgIGlmIChwYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHBhdGhzWzBdID0gJyRkYXRhJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGF0aHMuc2hpZnQoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy/ljL/lkI0gcmVwZWF0XG4gICAgICAgIGlmIChwYXRoIGluIGN1cikge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGN1ciA9IGN1ci4kcGFyZW50O1xuICB9XG5cbiAgcmV0dXJuIHsgdm06IGN1clZtLCBwYXRoOiBwYXRocy5qb2luKCcuJykgfVxufTtcblxuXG5leHBvcnRzLnJlZm9ybVNjb3BlID0gcmVmb3JtU2NvcGU7XG4iLCJ2YXIgdG9rZW5SZWcgPSAve3soeyhbXn1cXG5dKyl9fFtefVxcbl0rKX19L2c7XG5cbi8v5a2X56ym5Liy5Lit5piv5ZCm5YyF5ZCr5qih5p2/5Y2g5L2N56ym5qCH6K6wXG5mdW5jdGlvbiBoYXNUb2tlbihzdHIpIHtcbiAgdG9rZW5SZWcubGFzdEluZGV4ID0gMDtcbiAgcmV0dXJuIHN0ciAmJiB0b2tlblJlZy50ZXN0KHN0cik7XG59XG5cbmZ1bmN0aW9uIHBhcnNlVG9rZW4odmFsdWUpIHtcbiAgdmFyIHRva2VucyA9IFtdXG4gICAgLCB0ZXh0TWFwID0gW11cbiAgICAsIHN0YXJ0ID0gMFxuICAgICwgdmFsLCB0b2tlblxuICAgIDtcbiAgXG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIFxuICB3aGlsZSgodmFsID0gdG9rZW5SZWcuZXhlYyh2YWx1ZSkpKXtcbiAgICBpZih0b2tlblJlZy5sYXN0SW5kZXggLSBzdGFydCA+IHZhbFswXS5sZW5ndGgpe1xuICAgICAgdGV4dE1hcC5wdXNoKHZhbHVlLnNsaWNlKHN0YXJ0LCB0b2tlblJlZy5sYXN0SW5kZXggLSB2YWxbMF0ubGVuZ3RoKSk7XG4gICAgfVxuICAgIFxuICAgIHRva2VuID0ge1xuICAgICAgZXNjYXBlOiAhdmFsWzJdXG4gICAgLCBwYXRoOiAodmFsWzJdIHx8IHZhbFsxXSkudHJpbSgpXG4gICAgLCBwb3NpdGlvbjogdGV4dE1hcC5sZW5ndGhcbiAgICAsIHRleHRNYXA6IHRleHRNYXBcbiAgICB9O1xuICAgIFxuICAgIHRva2Vucy5wdXNoKHRva2VuKTtcbiAgICBcbiAgICAvL+S4gOS4quW8leeUqOexu+WeiyjmlbDnu4Qp5L2c5Li66IqC54K55a+56LGh55qE5paH5pys5Zu+LCDov5nmoLflvZPmn5DkuIDkuKrlvJXnlKjmlLnlj5jkuobkuIDkuKrlgLzlkI4sIOWFtuS7luW8leeUqOWPluW+l+eahOWAvOmDveS8muWQjOaXtuabtOaWsFxuICAgIHRleHRNYXAucHVzaCh2YWxbMF0pO1xuICAgIFxuICAgIHN0YXJ0ID0gdG9rZW5SZWcubGFzdEluZGV4O1xuICB9XG4gIFxuICBpZih2YWx1ZS5sZW5ndGggPiBzdGFydCl7XG4gICAgdGV4dE1hcC5wdXNoKHZhbHVlLnNsaWNlKHN0YXJ0LCB2YWx1ZS5sZW5ndGgpKTtcbiAgfVxuICBcbiAgdG9rZW5zLnRleHRNYXAgPSB0ZXh0TWFwO1xuICBcbiAgcmV0dXJuIHRva2Vucztcbn1cblxuZXhwb3J0cy5oYXNUb2tlbiA9IGhhc1Rva2VuO1xuXG5leHBvcnRzLnBhcnNlVG9rZW4gPSBwYXJzZVRva2VuOyIsIlwidXNlIHN0cmljdFwiO1xuXG4vL3V0aWxzXG4vLy0tLVxuXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudDtcblxudmFyIGtleVBhdGhSZWcgPSAvKD86XFwufFxcWykvZ1xuICAsIGJyYSA9IC9cXF0vZ1xuICA7XG5cbi8v5bCGIGtleVBhdGgg6L2s5Li65pWw57uE5b2i5byPXG4vL3BhdGgua2V5LCBwYXRoW2tleV0gLS0+IFsncGF0aCcsICdrZXknXVxuZnVuY3Rpb24gcGFyc2VLZXlQYXRoKGtleVBhdGgpe1xuICByZXR1cm4ga2V5UGF0aC5yZXBsYWNlKGJyYSwgJycpLnNwbGl0KGtleVBhdGhSZWcpO1xufVxuXG4vKipcbiAqIOWQiOW5tuWvueixoVxuICogQHN0YXRpY1xuICogQHBhcmFtIHtCb29sZWFufSBbZGVlcD1mYWxzZV0g5piv5ZCm5rex5bqm5ZCI5bm2XG4gKiBAcGFyYW0ge09iamVjdH0gdGFyZ2V0IOebruagh+WvueixoVxuICogQHBhcmFtIHtPYmplY3R9IFtvYmplY3QuLi5dIOadpea6kOWvueixoVxuICogQHJldHVybnMge09iamVjdH0g5ZCI5bm25ZCO55qEIHRhcmdldCDlr7nosaFcbiAqL1xuZnVuY3Rpb24gZXh0ZW5kKC8qIGRlZXAsIHRhcmdldCwgb2JqZWN0Li4uICovKSB7XG4gIHZhciBvcHRpb25zXG4gICAgLCBuYW1lLCBzcmMsIGNvcHksIGNvcHlJc0FycmF5LCBjbG9uZVxuICAgICwgdGFyZ2V0ID0gYXJndW1lbnRzWzBdIHx8IHt9XG4gICAgLCBpID0gMVxuICAgICwgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aFxuICAgICwgZGVlcCA9IGZhbHNlXG4gICAgO1xuXG4gIC8vIEhhbmRsZSBhIGRlZXAgY29weSBzaXR1YXRpb25cbiAgaWYgKHR5cGVvZiB0YXJnZXQgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgZGVlcCA9IHRhcmdldDtcblxuICAgIC8vIHNraXAgdGhlIGJvb2xlYW4gYW5kIHRoZSB0YXJnZXRcbiAgICB0YXJnZXQgPSBhcmd1bWVudHNbIGkgXSB8fCB7fTtcbiAgICBpKys7XG4gIH1cblxuICAvLyBIYW5kbGUgY2FzZSB3aGVuIHRhcmdldCBpcyBhIHN0cmluZyBvciBzb21ldGhpbmcgKHBvc3NpYmxlIGluIGRlZXAgY29weSlcbiAgaWYgKHR5cGVvZiB0YXJnZXQgIT09IFwib2JqZWN0XCIgJiYgIXV0aWxzLmlzRnVuY3Rpb24odGFyZ2V0KSkge1xuICAgIHRhcmdldCA9IHt9O1xuICB9XG5cbiAgZm9yICggOyBpIDwgbGVuZ3RoOyBpKysgKSB7XG4gICAgLy8gT25seSBkZWFsIHdpdGggbm9uLW51bGwvdW5kZWZpbmVkIHZhbHVlc1xuICAgIGlmICggKG9wdGlvbnMgPSBhcmd1bWVudHNbIGkgXSkgIT0gbnVsbCApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgYmFzZSBvYmplY3RcbiAgICAgIGZvciAoIG5hbWUgaW4gb3B0aW9ucyApIHtcbiAgICAgICAgLy9hbmRyb2lkIDIuMyBicm93c2VyIGNhbiBlbnVtIHRoZSBwcm90b3R5cGUgb2YgY29uc3RydWN0b3IuLi5cbiAgICAgICAgaWYobmFtZSAhPT0gJ3Byb3RvdHlwZScpe1xuICAgICAgICAgIHNyYyA9IHRhcmdldFsgbmFtZSBdO1xuICAgICAgICAgIGNvcHkgPSBvcHRpb25zWyBuYW1lIF07XG5cblxuICAgICAgICAgIC8vIFJlY3Vyc2UgaWYgd2UncmUgbWVyZ2luZyBwbGFpbiBvYmplY3RzIG9yIGFycmF5c1xuICAgICAgICAgIGlmICggZGVlcCAmJiBjb3B5ICYmICggdXRpbHMuaXNQbGFpbk9iamVjdChjb3B5KSB8fCAoY29weUlzQXJyYXkgPSB1dGlscy5pc0FycmF5KGNvcHkpKSApICkge1xuXG4gICAgICAgICAgICAvLyBQcmV2ZW50IG5ldmVyLWVuZGluZyBsb29wXG4gICAgICAgICAgICBpZiAoIHRhcmdldCA9PT0gY29weSApIHtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIGNvcHlJc0FycmF5ICkge1xuICAgICAgICAgICAgICBjb3B5SXNBcnJheSA9IGZhbHNlO1xuICAgICAgICAgICAgICBjbG9uZSA9IHNyYyAmJiB1dGlscy5pc0FycmF5KHNyYykgPyBzcmMgOiBbXTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNQbGFpbk9iamVjdChzcmMpID8gc3JjIDoge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5ldmVyIG1vdmUgb3JpZ2luYWwgb2JqZWN0cywgY2xvbmUgdGhlbVxuICAgICAgICAgICAgdGFyZ2V0WyBuYW1lIF0gPSBleHRlbmQoIGRlZXAsIGNsb25lLCBjb3B5KTtcblxuICAgICAgICAgICAgLy8gRG9uJ3QgYnJpbmcgaW4gdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSBpZiAoICF1dGlscy5pc1VuZGVmaW5lZChjb3B5KSAmJiB0eXBlb2YgdGFyZ2V0ICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgLy/kuIDkupvmg4XkuIssIOavlOWmgiBmaXJlZm94IOS4i+e7meWtl+espuS4suWvueixoei1i+WAvOaXtuS8muW8guW4uFxuICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0gY29weTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIG1vZGlmaWVkIG9iamVjdFxuICByZXR1cm4gdGFyZ2V0O1xufVxuXG52YXIgY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAobykge1xuICBmdW5jdGlvbiBGKCkge31cbiAgRi5wcm90b3R5cGUgPSBvO1xuICByZXR1cm4gbmV3IEYoKTtcbn07XG5cbnZhciBkZWVwR2V0ID0gZnVuY3Rpb24gKGtleVN0ciwgb2JqKSB7XG4gIHZhciBjaGFpbiwgY3VyID0gb2JqLCBrZXk7XG4gIGlmKGtleVN0cil7XG4gICAgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKTtcbiAgICBmb3IodmFyIGkgPSAwLCBsID0gY2hhaW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBrZXkgPSBjaGFpbltpXTtcbiAgICAgIGlmKGN1cil7XG4gICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGN1cjtcbn1cblxudmFyIHV0aWxzID0ge1xuICBub29wOiBmdW5jdGlvbiAoKXt9XG4sIGllOiAhIWRvYy5hdHRhY2hFdmVudFxuXG4sIGlzT2JqZWN0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbCAhPT0gbnVsbDtcbiAgfVxuXG4sIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiwgaXNGdW5jdGlvbjogZnVuY3Rpb24gKHZhbCl7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG4gIH1cblxuLCBpc0FycmF5OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYodXRpbHMuaWUpe1xuICAgICAgLy9JRSA5IOWPiuS7peS4iyBJRSDot6jnqpflj6Pmo4DmtYvmlbDnu4RcbiAgICAgIHJldHVybiB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yICsgJycgPT09IEFycmF5ICsgJyc7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpO1xuICAgIH1cbiAgfVxuLCBpc051bWVyaWM6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHJldHVybiAhdXRpbHMuaXNBcnJheSh2YWwpICYmIHZhbCAtIHBhcnNlRmxvYXQodmFsKSArIDEgPj0gMDtcbiAgfVxuICAvL+eugOWNleWvueixoeeahOeugOaYk+WIpOaWrVxuLCBpc1BsYWluT2JqZWN0OiBmdW5jdGlvbiAobyl7XG4gICAgaWYgKCFvIHx8ICh7fSkudG9TdHJpbmcuY2FsbChvKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgfHwgby5ub2RlVHlwZSB8fCBvID09PSBvLndpbmRvdykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy/lh73mlbDliIfpnaIuIG9yaUZuIOWOn+Wni+WHveaVsCwgZm4g5YiH6Z2i6KGl5YWF5Ye95pWwXG4gIC8v5YmN6Z2i55qE5Ye95pWw6L+U5Zue5YC85Lyg5YWlIGJyZWFrQ2hlY2sg5Yik5patLCBicmVha0NoZWNrIOi/lOWbnuWAvOS4uuecn+aXtuS4jeaJp+ihjOWIh+mdouihpeWFheeahOWHveaVsFxuLCBiZWZvcmVGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0KSl7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gb3JpRm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiwgYWZ0ZXJGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0KSl7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH1cblxuLCBwYXJzZUtleVBhdGg6IHBhcnNlS2V5UGF0aFxuXG4sIGRlZXBTZXQ6IGZ1bmN0aW9uIChrZXlTdHIsIHZhbHVlLCBvYmopIHtcbiAgICBpZihrZXlTdHIpe1xuICAgICAgdmFyIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cilcbiAgICAgICAgLCBjdXIgPSBvYmpcbiAgICAgICAgO1xuICAgICAgY2hhaW4uZm9yRWFjaChmdW5jdGlvbihrZXksIGkpIHtcbiAgICAgICAgaWYoaSA9PT0gY2hhaW4ubGVuZ3RoIC0gMSl7XG4gICAgICAgICAgY3VyW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgaWYoY3VyICYmIGN1ci5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgY3VyW2tleV0gPSB7fTtcbiAgICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfWVsc2V7XG4gICAgICBleHRlbmQob2JqLCB2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH1cbiwgZXh0ZW5kOiBleHRlbmRcbiwgY3JlYXRlOiBjcmVhdGVcbiwgdG9BcnJheTogZnVuY3Rpb24oYXJyTGlrZSkge1xuICAgIHZhciBhcnIgPSBbXTtcblxuICAgIHRyeXtcbiAgICAgIC8vSUUgOCDlr7kgZG9tIOWvueixoeS8muaKpemUmVxuICAgICAgYXJyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyTGlrZSlcbiAgICB9Y2F0Y2ggKGUpe1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGFyckxpa2UubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGFycltpXSA9IGFyckxpa2VbaV1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB1dGlscztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlLmpzJykucGFyc2VcbiAgLCByZWZvcm1TY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKS5yZWZvcm1TY29wZVxuICA7XG5cbnZhciBzdW1tYXJ5Q2FjaGUgPSB7fTtcblxuLyoqXG4gKiDmr4/kuKogZGlyZWN0aXZlIOWvueW6lOS4gOS4qiB3YXRjaGVyXG4gKiBAcGFyYW0ge0JlZX0gdm0gIGRpcmVjdGl2ZSDmiYDlpITnmoTnjq/looNcbiAqIEBwYXJhbSB7RGlyZWN0aXZlfSBkaXJcbiAqL1xuZnVuY3Rpb24gV2F0Y2hlcih2bSwgZGlyKSB7XG4gIHZhciByZWZvcm1lZCwgcGF0aCwgY3VyVm0gPSB2bSwgd2F0Y2hlcnMgPSBbXTtcbiAgdmFyIHN1bW1hcnkgPSBzdW1tYXJ5Q2FjaGVbZGlyLnBhdGhdXG5cbiAgZGlyLndhdGNoZXIgPSB0aGlzO1xuXG4gIHRoaXMuc3RhdGUgPSAxO1xuICB0aGlzLmRpciA9IGRpcjtcbiAgdGhpcy52bSA9IHZtO1xuICB0aGlzLndhdGNoZXJzID0gW107XG5cbiAgdGhpcy52YWwgPSBOYU47XG5cbiAgZGlyLnBhcnNlKCk7XG5cbiAgaWYoIXN1bW1hcnkgfHwgc3VtbWFyeS5fdHlwZSAhPT0gZGlyLnR5cGUpe1xuICAgIHN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KGRpci5hc3QpO1xuICAgIHN1bW1hcnkuX3R5cGUgPSBkaXIudHlwZTtcbiAgICBzdW1tYXJ5Q2FjaGVbZGlyLnBhdGhdID0gc3VtbWFyeTtcbiAgfVxuICBkaXIuc3VtbWFyeSA9IHN1bW1hcnlcblxuICAvL+WwhuivpSB3YXRjaGVyIOS4juavj+S4gOS4quWxnuaAp+W7uueri+W8leeUqOWFs+ezu1xuICBmb3IodmFyIGkgPSAwLCBsID0gZGlyLnN1bW1hcnkucGF0aHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgcmVmb3JtZWQgPSByZWZvcm1TY29wZSh2bSwgZGlyLnN1bW1hcnkucGF0aHNbaV0pXG4gICAgY3VyVm0gPSByZWZvcm1lZC52bVxuICAgIHBhdGggPSByZWZvcm1lZC5wYXRoXG4gICAgaWYoZGlyLndhdGNoKSB7XG4gICAgICBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0gPSBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0gfHwgW107XG4gICAgICBjdXJWbS5fd2F0Y2hlcnNbcGF0aF0ucHVzaCh0aGlzKTtcbiAgICAgIHdhdGNoZXJzID0gY3VyVm0uX3dhdGNoZXJzW3BhdGhdO1xuICAgIH1lbHNle1xuICAgICAgd2F0Y2hlcnMgPSBbdGhpc107XG4gICAgfVxuICAgIC8v5bCG5q+P5LiqIGtleSDlr7nlupTnmoQgd2F0Y2hlcnMg6YO95aGe6L+b5p2lXG4gICAgdGhpcy53YXRjaGVycy5wdXNoKCB3YXRjaGVycyApO1xuICB9XG5cbiAgLy/mmK/lkKblnKjliJ3lp4vljJbml7bmm7TmlrBcbiAgZGlyLmltbWVkaWF0ZSAhPT0gZmFsc2UgJiYgdGhpcy51cGRhdGUoKTtcbn1cblxuLy/moLnmja7ooajovr7lvI/np7vpmaTlvZPliY0gdm0g5Lit55qEIHdhdGNoZXJcbmZ1bmN0aW9uIHVud2F0Y2ggKHZtLCBleHAsIGNhbGxiYWNrKSB7XG4gIHZhciBzdW1tYXJ5O1xuICB0cnkge1xuICAgIHN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KHBhcnNlKGV4cCkpXG4gIH1jYXRjaCAoZSl7XG4gICAgZS5tZXNzYWdlID0gJ1N5bnRheEVycm9yIGluIFwiJyArIGV4cCArICdcIiB8ICcgKyBlLm1lc3NhZ2U7XG4gICAgY29uc29sZS5lcnJvcihlKTtcbiAgfVxuICBzdW1tYXJ5LnBhdGhzLmZvckVhY2goZnVuY3Rpb24ocGF0aCkge1xuICAgIHZhciB3YXRjaGVycyA9IHZtLl93YXRjaGVyc1twYXRoXSB8fCBbXSwgdXBkYXRlO1xuXG4gICAgZm9yKHZhciBpID0gd2F0Y2hlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgdXBkYXRlID0gd2F0Y2hlcnNbaV0uZGlyLnVwZGF0ZTtcbiAgICAgIGlmKHVwZGF0ZSA9PT0gY2FsbGJhY2sgfHwgdXBkYXRlLl9vcmlnaW5GbiA9PT0gY2FsbGJhY2spe1xuICAgICAgICB3YXRjaGVyc1tpXS51bndhdGNoKClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGFkZFdhdGNoZXIoZGlyKSB7XG4gIGlmKGRpci5wYXRoKSB7XG4gICAgcmV0dXJuIG5ldyBXYXRjaGVyKHRoaXMsIGRpcik7XG4gIH1cbn1cblxuV2F0Y2hlci51bndhdGNoID0gdW53YXRjaDtcbldhdGNoZXIuYWRkV2F0Y2hlciA9IGFkZFdhdGNoZXI7XG5cbi8v6I635Y+W5p+QIGtleVBhdGgg5a2Q6Lev5b6E55qEIHdhdGNoZXJzXG5XYXRjaGVyLmdldFdhdGNoZXJzID0gZnVuY3Rpb24gZ2V0V2F0Y2hlcnModm0sIGtleVBhdGgpIHtcbiAgdmFyIF93YXRjaGVycyA9IHZtLl93YXRjaGVycywgd2F0Y2hlcnMgPSBbXTtcbiAgdmFyIHBvaW50O1xuICBmb3IodmFyIGtleSBpbiBfd2F0Y2hlcnMpIHtcbiAgICBwb2ludCA9IGtleS5jaGFyQXQoa2V5UGF0aC5sZW5ndGgpO1xuICAgIGlmKGtleS5pbmRleE9mKGtleVBhdGgpID09PSAwICYmIChwb2ludCA9PT0gJy4nKSkge1xuICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoX3dhdGNoZXJzW2tleV0pXG4gICAgfVxuICB9XG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG5mdW5jdGlvbiB3YXRjaGVyVXBkYXRlICh2YWwpIHtcbiAgdHJ5e1xuICAgIHRoaXMudmFsID0gdmFsO1xuICAgIHRoaXMuZGlyLnVwZGF0ZSh2YWwsIHRoaXMudmFsKTtcbiAgfWNhdGNoKGUpe1xuICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gIH1cbn1cblxudXRpbHMuZXh0ZW5kKFdhdGNoZXIucHJvdG90eXBlLCB7XG4gIC8v6KGo6L6+5byP5omn6KGM5bm25pu05pawIHZpZXdcbiAgdXBkYXRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICwgbmV3VmFsXG4gICAgICA7XG5cbiAgICBpZih0aGlzLmhpZGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV3VmFsID0gdGhpcy5kaXIuZ2V0VmFsdWUodGhpcy52bSk7XG5cbiAgICAvL+eugOWNlei/h+a7pOmHjeWkjeabtOaWsFxuICAgIGlmKG5ld1ZhbCAhPT0gdGhpcy52YWwgfHwgdXRpbHMuaXNPYmplY3QobmV3VmFsKSl7XG4gICAgICBpZihuZXdWYWwgJiYgbmV3VmFsLnRoZW4pIHtcbiAgICAgICAgLy9hIHByb21pc2VcbiAgICAgICAgbmV3VmFsLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoYXQsIHZhbCk7XG4gICAgICAgIH0pO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGlzLCBuZXdWYWwpO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgLy/np7vpmaRcbiAgdW53YXRjaDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXJzKSB7XG4gICAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKHdhdGNoZXJzW2ldID09PSB0aGlzKXtcbiAgICAgICAgICBpZih0aGlzLnN0YXRlKXtcbiAgICAgICAgICAgIHdhdGNoZXJzW2ldLmRpci51bkxpbmsoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpXG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyXG4iXX0=
