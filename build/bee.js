(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Bee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
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
extend(Bee, {extend: utils.afterFn(Class.extend, utils.noop, function(sub, args) {
  var staticProps = args[1] || {};
  //每个构造函数都有自己的 directives ,components, filters 引用, 继承自父构造函数
  //默认情况下, 更新父构造函数 directive, components, filters 会同步更新子构造函数. 反之不行
  sub.directives = extend(create(this.directives), staticProps.directives);
  sub.components = extend(create(this.components), staticProps.components);
  sub.filters = extend(create(this.filters), staticProps.filters);

  sub.defaults = extend(true, {}, this.defaults, staticProps.defaults);
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
        watchers[i] && watchers[i].update();
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

},{"./check-binding.js":3,"./class.js":4,"./component.js":5,"./directive.js":6,"./directives":12,"./dom-utils.js":18,"./env.js":19,"./scope":23,"./utils.js":25,"./watcher.js":26}],3:[function(require,module,exports){
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
      if(this.type == 'attr' && this.escape === false) {
        this.path = '{' + this.path + '}'
      }
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
    var textMap = this.textMap

    //b-attr
    if(this.dirName === this.type) {
      for(var attr in val) {
        setProperty.call(this, el, attr, val[attr]);

        delete this.attrs[attr];

        newAttrs[attr] = true;
      }

      //移除不在上次记录中的属性
      for(var attr in this.attrs) {
        removeProperty.call(this, el, attr);
      }
      this.attrs = newAttrs;
    }else{
      if(this.conditional) {
        val ? setProperty.call(this, el, this.dirName, val) : removeProperty.call(this, el, this.dirName);
      }else{
        textMap[this.position] = val;
        setProperty.call(this, el, this.dirName, textMap.length > 1 ? textMap.join('') : textMap[0]);
      }
    }
  }
};

function setProperty(el, key, val) {
  if(isComponent(this)) {
    el.bee.$set(utils.hyphenToCamel(key), val)
  }else{
    setAttr(el, key, val)
  }
}

function removeProperty(el, key, undef) {
  if(isComponent(this)) {
    el.bee.$set(utils.hyphenToCamel(key), undef)
  }else{
    el.removeAttribute(key);
  }
}


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

function isComponent (dir) {
  var component = dir.el.bee;
  return component && !component.__repeat && component != dir.vm;
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
          utils.extend(true, $data, vm.$get(curPath))

          //监听父组件更新, 同步数据
          //TODO 移到 b-with 指令中完成
          vm.$watch(curPath, function (val) {
            comp && comp.$set(utils.extend({}, vm.$get(curPath)));
          })
        }else{
          comPath = utils.hyphenToCamel(dir.dirName);
          $data[comPath] = getProperty(dir)
          dir.el.removeAttribute(dir.dirName)
        }
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
  , checkBinding = require('../check-binding')
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
      //优先解析内部内容
      vm.__links = vm.__links.concat(checkBinding.walk.call(vm, comp.childNodes));

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

},{"../check-binding":3,"../event-bind.js":21,"../token.js":24,"../utils.js":25}],14:[function(require,module,exports){
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

    //TODO 将数组修饰移至所有表达式中
    var arrs = []; //repeat 表达式中出现的数组

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

      this.listPath.forEach(function(localKey) {
        var local = that.vm.$get(localKey)
        utils.isArray(local) && arrs.push(local)
      })
      arrs.push(items)
      arrs.forEach(function(local) {
        var dirs = local.__dirs__;

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

},{"../bee":2,"../env.js":19,"../scope":23,"../utils.js":25}],17:[function(require,module,exports){
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

},{"jsdom":1}],20:[function(require,module,exports){
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
      var prev = this.first;
      //排除 a[b].c 这种情况
      if(r && path && !(prev.arity === 'binary' && prev.value === '[')){
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
      res = getValue(value, context.locals);
    break;
    case 'filter':
      summary.filters[value] = true;
      res = context.filters[value];
    break;
    case 'this':
      res = context.locals;
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

  summary = {filters: {}, paths: {}, assignments: {}};
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
//return: {filters:[], paths: [], assignments: []}
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
var tokenReg = /{{({(.+?)}|.+?)}}/g;

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
      if(breakCheck && breakCheck.call(this, ret, arguments)){
        return ret;
      }
      return oriFn.apply(this, arguments);
    };
  }

, afterFn: function (oriFn, fn, breakCheck) {
    return function() {
      var ret = oriFn.apply(this, arguments);
      if(breakCheck && breakCheck.call(this, ret, arguments)){
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

},{"./eval.js":20,"./parse.js":22,"./scope":23,"./utils.js":25}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwic3JjL2JlZS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY2xhc3MuanMiLCJzcmMvZGlyZWN0aXZlcy9jb21wb25lbnQuanMiLCJzcmMvZGlyZWN0aXZlcy9jb250ZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvaWYuanMiLCJzcmMvZGlyZWN0aXZlcy9pbmRleC5qcyIsInNyYy9kaXJlY3RpdmVzL21vZGVsLmpzIiwic3JjL2RpcmVjdGl2ZXMvb24uanMiLCJzcmMvZGlyZWN0aXZlcy9yZWYuanMiLCJzcmMvZGlyZWN0aXZlcy9yZXBlYXQuanMiLCJzcmMvZGlyZWN0aXZlcy9zdHlsZS5qcyIsInNyYy9kb20tdXRpbHMuanMiLCJzcmMvZW52LmpzIiwic3JjL2V2YWwuanMiLCJzcmMvZXZlbnQtYmluZC5qcyIsInNyYy9wYXJzZS5qcyIsInNyYy9zY29wZS5qcyIsInNyYy90b2tlbi5qcyIsInNyYy91dGlscy5qcyIsInNyYy93YXRjaGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGxCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIixudWxsLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgZGlyZWN0aXZlID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi9kb20tdXRpbHMuanMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4vY2hlY2stYmluZGluZy5qcycpXG4gICwgc2NvcGUgPSByZXF1aXJlKCcuL3Njb3BlJylcblxuICAsIERpciA9IGRpcmVjdGl2ZS5EaXJlY3RpdmVcbiAgO1xuXG5cbnZhciBpc09iamVjdCA9IHV0aWxzLmlzT2JqZWN0XG4gICwgaXNQbGFpbk9iamVjdCA9IHV0aWxzLmlzUGxhaW5PYmplY3RcbiAgLCBwYXJzZUtleVBhdGggPSB1dGlscy5wYXJzZUtleVBhdGhcbiAgLCBkZWVwU2V0ID0gdXRpbHMuZGVlcFNldFxuICAsIGV4dGVuZCA9IHV0aWxzLmV4dGVuZFxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8v6K6+572uIGRpcmVjdGl2ZSDliY3nvIBcbmZ1bmN0aW9uIHNldFByZWZpeChuZXdQcmVmaXgpIHtcbiAgaWYobmV3UHJlZml4KXtcbiAgICB0aGlzLnByZWZpeCA9IG5ld1ByZWZpeDtcbiAgfVxufVxuXG4vL1RPRE8g5riF55CG6L+Z5LiqXG52YXIgbWVyZ2VQcm9wcyA9IHtcbiAgJGRhdGE6IDFcbn07XG5cbnZhciBsaWZlQ3ljbGVzID0ge1xuICAkYmVmb3JlSW5pdDogdXRpbHMubm9vcFxuLCAkYWZ0ZXJJbml0OiB1dGlscy5ub29wXG4sICRiZWZvcmVVcGRhdGU6IHV0aWxzLm5vb3BcbiwgJGFmdGVyVXBkYXRlOiB1dGlscy5ub29wXG4sICRiZWZvcmVEZXN0cm95OiB1dGlscy5ub29wXG4sICRhZnRlckRlc3Ryb3k6IHV0aWxzLm5vb3Bcbn07XG5cbi8qKlxuICog5p6E6YCg5Ye95pWwXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfEVsZW1lbnR9IFt0cGxdIOaooeadvy4g562J5ZCM5LqOIHByb3BzLiR0cGxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvcHNdIOWxnuaApy/mlrnms5VcbiAqL1xuZnVuY3Rpb24gQmVlKHRwbCwgcHJvcHMpIHtcbiAgaWYoaXNQbGFpbk9iamVjdCh0cGwpKSB7XG4gICAgcHJvcHMgPSB0cGw7XG4gIH1lbHNle1xuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgaWYodHBsKSB7XG4gICAgICBwcm9wcy4kdHBsID0gdHBsO1xuICAgIH1cbiAgfVxuXG4gIHZhciBkZWZhdWx0cyA9IHtcbiAgICAvLyQg5byA5aS055qE5piv5YWx5pyJ5bGe5oCnL+aWueazlVxuICAgICRkYXRhOiBleHRlbmQodHJ1ZSwge30sIHRoaXMuY29uc3RydWN0b3IuZGVmYXVsdHMpXG4gICwgJHJlZnM6IHt9XG4gICwgJG1peGluczogW11cblxuICAsICRlbDogdGhpcy4kZWwgfHwgbnVsbFxuICAsICR0cGw6IHRoaXMuJHRwbCB8fCAnPGRpdj57ez4gJGNvbnRlbnQgfX08L2Rpdj4nXG4gICwgJGNvbnRlbnQ6IHRoaXMuJGNvbnRlbnQgfHwgbnVsbFxuXG4gICwgJGlzUmVwbGFjZTogZmFsc2VcbiAgLCAkcGFyZW50OiBudWxsXG4gICwgJHJvb3Q6IHRoaXNcblxuICAgIC8v56eB5pyJ5bGe5oCnL+aWueazlVxuICAsIF93YXRjaGVyczoge31cbiAgLCBfYXNzaWdubWVudHM6IG51bGwvL+W9k+WJjSB2bSDnmoTliKvlkI1cbiAgLCBfcmVsYXRpdmVQYXRoOiBbXVxuICAsIF9fbGlua3M6IFtdXG4gICwgX2lzUmVuZGVyZWQ6IGZhbHNlXG4gIH07XG5cbiAgdmFyIG1peGlucyA9IFtkZWZhdWx0c10uY29uY2F0KHRoaXMuJG1peGlucykuY29uY2F0KHByb3BzLiRtaXhpbnMpLmNvbmNhdChbcHJvcHNdKVxuXG4gIG1peGlucy5mb3JFYWNoKGZ1bmN0aW9uKG1peGluKSB7XG4gICAgdmFyIHByb3A7XG4gICAgZm9yKHZhciBwcm9wS2V5IGluIG1peGluKSB7XG4gICAgICBpZihtaXhpbi5oYXNPd25Qcm9wZXJ0eShwcm9wS2V5KSkge1xuICAgICAgICBpZiAoKHByb3BLZXkgaW4gbWVyZ2VQcm9wcykgJiYgaXNPYmplY3QobWl4aW5bcHJvcEtleV0pKSB7XG4gICAgICAgICAgLy/kv53mjIHlr7nkvKDlhaXlsZ7mgKfnmoTlvJXnlKhcbiAgICAgICAgICAvL21lcmdlUHJvcHMg5Lit55qE5bGe5oCn5Lya6KKr6buY6K6k5YC85omp5bGVXG4gICAgICAgICAgcHJvcCA9IGV4dGVuZCh7fSwgdGhpc1twcm9wS2V5XSwgbWl4aW5bcHJvcEtleV0pXG4gICAgICAgICAgdGhpc1twcm9wS2V5XSA9IGV4dGVuZChtaXhpbltwcm9wS2V5XSwgcHJvcClcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wS2V5IGluIGxpZmVDeWNsZXMpIHtcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gdXRpbHMuYWZ0ZXJGbih0aGlzW3Byb3BLZXldLCBtaXhpbltwcm9wS2V5XSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gbWl4aW5bcHJvcEtleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0uYmluZCh0aGlzKSlcblxuICBleHRlbmQodGhpcywgdGhpcy4kZGF0YSk7XG5cbiAgcmVzb2x2ZVRwbC5jYWxsKHRoaXMpO1xuXG4gIHRoaXMuJGJlZm9yZUluaXQoKVxuICB0aGlzLiRlbC5iZWUgPSB0aGlzO1xuXG4gIC8vX19saW5rcyDljIXlkKvkuoYgJGVsIOS4i+aJgOacieeahOe7keWumuW8leeUqFxuICB0aGlzLl9fbGlua3MgPSB0aGlzLl9fbGlua3MuY29uY2F0KCBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMsIHRoaXMuJGVsKSApO1xuXG4gIHRoaXMuX2lzUmVuZGVyZWQgPSB0cnVlO1xuICB0aGlzLiRhZnRlckluaXQoKTtcbn1cblxuLy/pnZnmgIHlsZ7mgKdcbmV4dGVuZChCZWUsIHtleHRlbmQ6IHV0aWxzLmFmdGVyRm4oQ2xhc3MuZXh0ZW5kLCB1dGlscy5ub29wLCBmdW5jdGlvbihzdWIsIGFyZ3MpIHtcbiAgdmFyIHN0YXRpY1Byb3BzID0gYXJnc1sxXSB8fCB7fTtcbiAgLy/mr4/kuKrmnoTpgKDlh73mlbDpg73mnInoh6rlt7HnmoQgZGlyZWN0aXZlcyAsY29tcG9uZW50cywgZmlsdGVycyDlvJXnlKgsIOe7p+aJv+iHqueItuaehOmAoOWHveaVsFxuICAvL+m7mOiupOaDheWGteS4iywg5pu05paw54i25p6E6YCg5Ye95pWwIGRpcmVjdGl2ZSwgY29tcG9uZW50cywgZmlsdGVycyDkvJrlkIzmraXmm7TmlrDlrZDmnoTpgKDlh73mlbAuIOWPjeS5i+S4jeihjFxuICBzdWIuZGlyZWN0aXZlcyA9IGV4dGVuZChjcmVhdGUodGhpcy5kaXJlY3RpdmVzKSwgc3RhdGljUHJvcHMuZGlyZWN0aXZlcyk7XG4gIHN1Yi5jb21wb25lbnRzID0gZXh0ZW5kKGNyZWF0ZSh0aGlzLmNvbXBvbmVudHMpLCBzdGF0aWNQcm9wcy5jb21wb25lbnRzKTtcbiAgc3ViLmZpbHRlcnMgPSBleHRlbmQoY3JlYXRlKHRoaXMuZmlsdGVycyksIHN0YXRpY1Byb3BzLmZpbHRlcnMpO1xuXG4gIHN1Yi5kZWZhdWx0cyA9IGV4dGVuZCh0cnVlLCB7fSwgdGhpcy5kZWZhdWx0cywgc3RhdGljUHJvcHMuZGVmYXVsdHMpO1xufSksIHV0aWxzOiB1dGlsc30sIERpciwgQ29tLCB7XG4gIHNldFByZWZpeDogc2V0UHJlZml4XG4sIGRpcmVjdGl2ZTogZGlyZWN0aXZlLmRpcmVjdGl2ZVxuLCBwcmVmaXg6ICcnXG4sIGRvYzogZG9jXG4sIGRpcmVjdGl2ZXM6IHt9XG4sIGNvbXBvbmVudHM6IHt9XG4sIGRlZmF1bHRzOiB7fVxuLCBmaWx0ZXJzOiB7XG4gICAgLy9idWlsZCBpbiBmaWx0ZXJcbiAgICBqc29uOiBmdW5jdGlvbihvYmosIHJlcGxhY2VyLCBzcGFjZSkge1xuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaiwgcmVwbGFjZXIsIHNwYWNlKSB9XG4gIH1cbiwgZmlsdGVyOiBmdW5jdGlvbihmaWx0ZXJOYW1lLCBmaWx0ZXIpIHtcbiAgICB0aGlzLmZpbHRlcnNbZmlsdGVyTmFtZV0gPSBmaWx0ZXI7XG4gIH1cbiwgbW91bnQ6IGZ1bmN0aW9uKGlkLCBwcm9wcykge1xuICAgIHZhciBlbCA9IGlkLm5vZGVUeXBlID8gaWQgOiBkb2MuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBpbnN0YW5jZTtcbiAgICB2YXIgZGlycyA9IGRpcmVjdGl2ZS5nZXREaXJzKGVsLCB0aGlzKTtcbiAgICB2YXIgQ29tcCwgZGlyO1xuXG4gICAgZGlyID0gZGlycy5maWx0ZXIoZnVuY3Rpb24oZGlyKSB7XG4gICAgICByZXR1cm4gIGRpci50eXBlID09PSAndGFnJyB8fCBkaXIudHlwZSA9PT0gJ2NvbXBvbmVudCdcbiAgICB9KVswXTtcblxuICAgIGlmKGRpcikge1xuICAgICAgQ29tcCA9IHRoaXMuZ2V0Q29tcG9uZW50KGRpci5wYXRoKVxuICAgIH1cblxuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgaWYoQ29tcCkge1xuICAgICAgcHJvcHMuJGRhdGEgPSBleHRlbmQoZG9tVXRpbHMuZ2V0QXR0cnMoZWwpLCBwcm9wcy4kZGF0YSlcbiAgICAgIGluc3RhbmNlID0gbmV3IENvbXAoZXh0ZW5kKHskZWw6IGVsLCAkaXNSZXBsYWNlOiB0cnVlLCBfX21vdW50Y2FsbDogdHJ1ZX0sIHByb3BzKSlcbiAgICB9ZWxzZXtcbiAgICAgIGluc3RhbmNlID0gbmV3IHRoaXMoZWwsIHByb3BzKTtcbiAgICB9XG4gICAgcmV0dXJuIGluc3RhbmNlXG4gIH1cbn0pO1xuXG5cbkJlZS5zZXRQcmVmaXgoJ2ItJyk7XG5cbi8v5YaF572uIGRpcmVjdGl2ZVxuZm9yKHZhciBkaXIgaW4gZGlycykge1xuICBCZWUuZGlyZWN0aXZlKGRpciwgZGlyc1tkaXJdKTtcbn1cblxuLy/lrp7kvovmlrnms5Vcbi8vLS0tLVxuZXh0ZW5kKEJlZS5wcm90b3R5cGUsIGxpZmVDeWNsZXMsIHtcbiAgLyoqXG4gICAqIOiOt+WPluWxnuaApy/mlrnms5VcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV4cHJlc3Npb24g6Lev5b6EL+ihqOi+vuW8j1xuICAgKiBAcmV0dXJucyB7Kn1cbiAgICovXG4gICRnZXQ6IGZ1bmN0aW9uKGV4cHJlc3Npb24pIHtcbiAgICB2YXIgZGlyID0gbmV3IERpcignJGdldCcsIHtcbiAgICAgIHBhdGg6IGV4cHJlc3Npb25cbiAgICAsIHdhdGNoOiBmYWxzZVxuICAgIH0pO1xuICAgIGRpci5wYXJzZSgpO1xuICAgIHJldHVybiBkaXIuZ2V0VmFsdWUodGhpcywgZmFsc2UpXG4gIH1cblxuICAvKipcbiAgICog5pu05paw5ZCI5bm2IGAuZGF0YWAg5Lit55qE5pWw5o2uLiDlpoLmnpzlj6rmnInkuIDkuKrlj4LmlbAsIOmCo+S5iOi/meS4quWPguaVsOWwhuW5tuWFpSAuJGRhdGFcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtrZXldIOaVsOaNrui3r+W+hC5cbiAgICogQHBhcmFtIHtBbnlUeXBlfE9iamVjdH0gdmFsIOaVsOaNruWGheWuuS5cbiAgICovXG4sICRzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsKSB7XG4gICAgdmFyIGFkZCwga2V5cywgaGFzS2V5ID0gZmFsc2U7XG4gICAgdmFyIHJlZm9ybWVkLCByZUtleSwgcmVWbSA9IHRoaXM7XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIGlmKGlzT2JqZWN0KGtleSkpIHtcbiAgICAgICAgZXh0ZW5kKHRoaXMuJGRhdGEsIGtleSk7XG4gICAgICAgIGV4dGVuZCh0aGlzLCBrZXkpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHRoaXMuJGRhdGEgPSBrZXk7XG4gICAgICB9XG4gICAgICB1cGRhdGUuY2FsbChyZVZtLCBrZXkpO1xuICAgIH1lbHNle1xuICAgICAgdGhpcy4kcmVwbGFjZShrZXksIHZhbCk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiDmlbDmja7mm7/mjaJcbiAgICovXG4sICRyZXBsYWNlOiBmdW5jdGlvbiAoa2V5LCB2YWwpIHtcbiAgICB2YXIga2V5cywgbGFzdCwgaGFzS2V5ID0gZmFsc2U7XG4gICAgdmFyIHJlZm9ybWVkLCByZUtleSwgcmVWbSA9IHRoaXM7XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIHZhbCA9IGtleTtcbiAgICAgIHJlS2V5ID0gJyRkYXRhJztcbiAgICAgIGtleXMgPSBbcmVLZXldO1xuICAgIH1lbHNle1xuICAgICAgaGFzS2V5ID0gdHJ1ZTtcbiAgICAgIHJlZm9ybWVkID0gc2NvcGUucmVmb3JtU2NvcGUodGhpcywga2V5KVxuICAgICAgcmVLZXkgPSByZWZvcm1lZC5wYXRoO1xuICAgICAgcmVWbSA9IHJlZm9ybWVkLnZtO1xuICAgICAga2V5cyA9IHBhcnNlS2V5UGF0aChyZUtleSk7XG4gICAgfVxuXG4gICAgbGFzdCA9IHJlVm0uJGdldChyZUtleSk7XG5cbiAgICBpZiAoa2V5c1swXSA9PT0gJyRkYXRhJykge1xuICAgICAgaWYocmVLZXkgPT09ICckZGF0YScpIHtcbiAgICAgICAgaWYoaXNPYmplY3QodGhpcy4kZGF0YSkpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLiRkYXRhKS5mb3JFYWNoKGZ1bmN0aW9uIChrKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpc1trXTtcbiAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIH1cbiAgICAgICAgZXh0ZW5kKHJlVm0sIHZhbCk7XG4gICAgICB9ZWxzZSB7XG4gICAgICAgIGRlZXBTZXQoa2V5cy5zaGlmdCgpLmpvaW4oJy4nKSwgdmFsLCByZVZtKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0uJGRhdGEpO1xuICAgIH1cbiAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0pXG5cbiAgICBoYXNLZXkgPyB1cGRhdGUuY2FsbChyZVZtLCByZUtleSwgZXh0ZW5kKHt9LCBsYXN0LCB2YWwpKSA6IHVwZGF0ZS5jYWxsKHJlVm0sIGV4dGVuZCh7fSwgbGFzdCwgdmFsKSk7XG4gIH1cbiAgLyoqXG4gICAqIOaJi+WKqOabtOaWsOafkOmDqOWIhuaVsOaNrlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDmjIflrprmm7TmlrDmlbDmja7nmoQga2V5UGF0aFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpc0J1YmJsZT10cnVlXSDmmK/lkKbmm7TmlrAga2V5UGF0aCDnmoTniLbnuqdcbiAgICovXG4sICR1cGRhdGU6IGZ1bmN0aW9uIChrZXlQYXRoLCBpc0J1YmJsZSkge1xuICAgIGlzQnViYmxlID0gaXNCdWJibGUgIT09IGZhbHNlO1xuXG4gICAgdmFyIGtleXMgPSBwYXJzZUtleVBhdGgoa2V5UGF0aC5yZXBsYWNlKC9eXFwkZGF0YVxcLi8sICcnKSksIGtleTtcbiAgICB2YXIgd2F0Y2hlcnM7XG5cbiAgICB3aGlsZShrZXkgPSBrZXlzLmpvaW4oJy4nKSkge1xuICAgICAgd2F0Y2hlcnMgPSB0aGlzLl93YXRjaGVyc1trZXldIHx8IFtdO1xuXG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHdhdGNoZXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB3YXRjaGVyc1tpXSAmJiB3YXRjaGVyc1tpXS51cGRhdGUoKTtcbiAgICAgIH1cblxuICAgICAgaWYoaXNCdWJibGUpIHtcbiAgICAgICAga2V5cy5wb3AoKTtcbiAgICAgICAgLy/mnIDnu4jpg73lhpLms6HliLAgJGRhdGFcbiAgICAgICAgaWYoIWtleXMubGVuZ3RoICYmIGtleSAhPT0gJyRkYXRhJyl7XG4gICAgICAgICAga2V5cy5wdXNoKCckZGF0YScpO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy/lkIzml7bmm7TmlrDlrZDot6/lvoRcbiAgICBXYXRjaGVyLmdldFdhdGNoZXJzKHRoaXMsIGtleVBhdGgpLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci51cGRhdGUoKTtcbiAgICB9LmJpbmQodGhpcykpXG5cbiAgICAvL+aVsOe7hOWGkuazoeeahOaDheWGtVxuICAgIGlmKGlzQnViYmxlKSB7XG4gICAgICBpZih0aGlzLiRwYXJlbnQpIHtcbiAgICAgICAgLy/lkIzmraXmm7TmlrDniLYgdm0g5a+55bqU6YOo5YiGXG4gICAgICAgIHRoaXMuX3JlbGF0aXZlUGF0aC5mb3JFYWNoKGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgICAgICAgdGhpcy4kcGFyZW50LiR1cGRhdGUocGF0aCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiwgJHdhdGNoOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY2FsbGJhY2ssIGltbWVkaWF0ZSkge1xuICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICB2YXIgdXBkYXRlID0gY2FsbGJhY2suYmluZCh0aGlzKTtcbiAgICAgIHVwZGF0ZS5fb3JpZ2luRm4gPSBjYWxsYmFjaztcbiAgICAgIHJldHVybiBXYXRjaGVyLmFkZFdhdGNoZXIuY2FsbCh0aGlzLCBuZXcgRGlyKCckd2F0Y2gnLCB7cGF0aDogZXhwcmVzc2lvbiwgdXBkYXRlOiB1cGRhdGUsIGltbWVkaWF0ZSA6ICEhaW1tZWRpYXRlfSkpXG4gICAgfVxuICB9XG4sICR1bndhdGNoOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY2FsbGJhY2spIHtcbiAgICBXYXRjaGVyLnVud2F0Y2godGhpcywgZXhwcmVzc2lvbiwgY2FsbGJhY2spXG4gIH1cbiAgLy/plIDmr4HlvZPliY3lrp7kvotcbiwgJGRlc3Ryb3k6IGZ1bmN0aW9uKHJlbW92ZUVsKSB7XG4gICAgdGhpcy4kYmVmb3JlRGVzdHJveSgpXG4gICAgdGhpcy5fX2xpbmtzLmZvckVhY2goZnVuY3Rpb24od2FjaGVyKSB7XG4gICAgICB3YWNoZXIudW53YXRjaCgpXG4gICAgfSlcbiAgICByZW1vdmVFbCAmJiB0aGlzLiRlbC5wYXJlbnROb2RlICYmIHRoaXMuJGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy4kZWwpXG4gICAgdGhpcy5fX2xpbmtzID0gW107XG4gICAgdGhpcy4kYWZ0ZXJEZXN0cm95KClcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHVwZGF0ZSAoa2V5UGF0aCwgZGF0YSkge1xuICB2YXIga2V5UGF0aHM7XG4gIHRoaXMuJGJlZm9yZVVwZGF0ZSh0aGlzLiRkYXRhKVxuICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZGF0YSA9IGtleVBhdGg7XG4gIH1lbHNle1xuICAgIGtleVBhdGhzID0gW2tleVBhdGhdO1xuICB9XG5cbiAgaWYoIWtleVBhdGhzKSB7XG4gICAgaWYoaXNPYmplY3QoZGF0YSkpIHtcbiAgICAgIGtleVBhdGhzID0gT2JqZWN0LmtleXMoZGF0YSk7XG4gICAgfWVsc2V7XG4gICAgICAvLy4kZGF0YSDmnInlj6/og73mmK/ln7rmnKznsbvlnovmlbDmja5cbiAgICAgIGtleVBhdGhzID0gWyckZGF0YSddO1xuICAgIH1cbiAgfVxuXG4gIGZvcih2YXIgaSA9IDAsIHBhdGg7IHBhdGggPSBrZXlQYXRoc1tpXTsgaSsrKXtcbiAgICB0aGlzLiR1cGRhdGUocGF0aCwgdHJ1ZSk7XG4gIH1cbiAgdGhpcy4kYWZ0ZXJVcGRhdGUodGhpcy4kZGF0YSlcbn1cblxuLy/lpITnkIYgJGVsLCAgJGNvbnRlbnQsICR0cGxcbmZ1bmN0aW9uIHJlc29sdmVUcGwoKSB7XG4gIHZhciBlbCA9IHRoaXMuJGVsXG4gICAgLCBjb250ZW50ID0gdGhpcy4kY29udGVudFxuICAgICwgdHBsID0gdGhpcy4kdHBsXG4gICAgLCB0cGxFbFxuICAgIDtcblxuICBjb250ZW50ID0gZWwgJiYgZWwuY2hpbGROb2RlcyA/IGVsLmNoaWxkTm9kZXMgOiBjb250ZW50XG5cbiAgaWYoZWwpIHtcbiAgICAvL+S8oOWFpSAkZWwg5YWD57Sg55qE5a2Q5YWD57Sg6YO95a2Y5pS+5YiwICRjb250ZW4g5LitXG4gICAgY29udGVudCA9IGVsLmNoaWxkTm9kZXM7XG4gIH1cblxuICBpZihjb250ZW50KSB7XG4gICAgLy/liJvlu7ogJGNvbnRlbnQgZG9jdW1lbnRGcmFnbWVudFxuICAgIHRoaXMuJGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KGNvbnRlbnQpXG4gIH1cblxuICBpZih1dGlscy5pc09iamVjdCh0cGwpKXtcbiAgICAvL0RPTSDlhYPntKBcbiAgICB0cGxFbCA9IHRwbDtcbiAgICB0cGwgPSB0cGxFbC5vdXRlckhUTUw7XG4gIH1lbHNle1xuICAgIC8v5a2X56ym5LiyXG4gICAgdHBsRWwgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KHRwbCkuY2hpbGROb2Rlc1swXTtcbiAgfVxuXG4gIGlmKGVsKSB7XG4gICAgaWYodGhpcy4kaXNSZXBsYWNlKSB7XG4gICAgICBlbC5wYXJlbnROb2RlICYmIGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKHRwbEVsLCBlbClcbiAgICAgIGVsID0gdHBsRWw7XG4gICAgfWVsc2V7XG4gICAgICBlbC5hcHBlbmRDaGlsZCh0cGxFbClcbiAgICB9XG4gIH1lbHNle1xuICAgIGVsID0gdHBsRWw7XG4gIH1cblxuICB0aGlzLiRlbCA9IGVsO1xufVxuXG5CZWUudmVyc2lvbiA9ICcwLjUuMSc7XG5cbm1vZHVsZS5leHBvcnRzID0gQmVlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIGRpcmVjdGl2ZSA9IHJlcXVpcmUoJy4vZGlyZWN0aXZlJylcbiAgO1xuXG52YXIgTk9ERVRZUEUgPSB7XG4gICAgRUxFTUVOVDogMVxuICAsIEFUVFI6IDJcbiAgLCBURVhUOiAzXG4gICwgQ09NTUVOVDogOFxuICAsIEZSQUdNRU5UOiAxMVxufTtcblxuZG9jLmNyZWF0ZUVsZW1lbnQoJ3RlbXBsYXRlJyk7XG5cbi8qKlxuICog6YGN5Y6GIGRvbSDmoJFcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0VsZW1lbnR8Tm9kZUxpc3R9IGVsXG4gKiBAcmV0dXJucyB7QXJyYXl9IOiKgueCueS4i+aJgOacieeahOe7keWumlxuICovXG5cbmZ1bmN0aW9uIHdhbGsoZWwpIHtcbiAgdmFyIHdhdGNoZXJzID0gW10sIGRpclJlc3VsdDtcbiAgaWYoZWwubm9kZVR5cGUgPT09IE5PREVUWVBFLkZSQUdNRU5UKSB7XG4gICAgZWwgPSBlbC5jaGlsZE5vZGVzO1xuICB9XG5cbiAgaWYoKCdsZW5ndGgnIGluIGVsKSAmJiB1dGlscy5pc1VuZGVmaW5lZChlbC5ub2RlVHlwZSkpe1xuICAgIC8vbm9kZSBsaXN0XG4gICAgLy/lr7nkuo4gbm9kZWxpc3Qg5aaC5p6c5YW25Lit5pyJ5YyF5ZCrIHt7dGV4dH19IOebtOaOpemHj+eahOihqOi+vuW8jywg5paH5pys6IqC54K55Lya6KKr5YiG5YmyLCDlhbboioLngrnmlbDph4/lj6/og73kvJrliqjmgIHlop7liqBcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWwubGVuZ3RoOyBpKyspIHtcbiAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgZWxbaV0pICk7XG4gICAgfVxuICAgIHJldHVybiB3YXRjaGVycztcbiAgfVxuXG4gIHN3aXRjaCAoZWwubm9kZVR5cGUpIHtcbiAgICBjYXNlIE5PREVUWVBFLkVMRU1FTlQ6XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5PREVUWVBFLkNPTU1FTlQ6XG4gICAgICAvL+azqOmHiuiKgueCuVxuICAgICAgcmV0dXJuIHdhdGNoZXJzO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5URVhUOlxuICAgICAgLy/mlofmnKzoioLngrlcbiAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBjaGVja1RleHQuY2FsbCh0aGlzLCBlbCkgKTtcbiAgICAgIHJldHVybiB3YXRjaGVycztcbiAgfVxuXG4gIGlmKGVsLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICAvL3RlbXBsYXRlIHNoaW1cbiAgICBpZighZWwuY29udGVudCkge1xuICAgICAgZWwuY29udGVudCA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICB3aGlsZShlbC5jaGlsZE5vZGVzWzBdKSB7XG4gICAgICAgIGVsLmNvbnRlbnQuYXBwZW5kQ2hpbGQoZWwuY2hpbGROb2Rlc1swXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBkaXJSZXN1bHQgPSBjaGVja0F0dHIuY2FsbCh0aGlzLCBlbCk7XG4gIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KGRpclJlc3VsdC53YXRjaGVycylcbiAgaWYoZGlyUmVzdWx0LnRlcm1pbmFsKXtcbiAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoIHdhbGsuY2FsbCh0aGlzLCBlbC5jb250ZW50KSApXG4gIH1cblxuICBmb3IodmFyIGNoaWxkID0gZWwuZmlyc3RDaGlsZCwgbmV4dDsgY2hpbGQ7ICl7XG4gICAgbmV4dCA9IGNoaWxkLm5leHRTaWJsaW5nO1xuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgY2hpbGQpICk7XG4gICAgY2hpbGQgPSBuZXh0O1xuICB9XG5cbiAgcmV0dXJuIHdhdGNoZXJzXG59XG5cbi8v6YGN5Y6G5bGe5oCnXG5mdW5jdGlvbiBjaGVja0F0dHIoZWwpIHtcbiAgdmFyIGNzdHIgPSB0aGlzLmNvbnN0cnVjdG9yXG4gICAgLCBkaXJzID0gZGlyZWN0aXZlLmdldERpcnMoZWwsIGNzdHIpXG4gICAgLCBkaXJcbiAgICAsIHRlcm1pbmFsUHJpb3JpdHksIHdhdGNoZXJzID0gW11cbiAgICAsIHJlc3VsdCA9IHt9O1xuICA7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBkaXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGRpciA9IGRpcnNbaV07XG4gICAgZGlyLmRpcnMgPSBkaXJzO1xuXG4gICAgLy/lr7nkuo4gdGVybWluYWwg5Li6IHRydWUg55qEIGRpcmVjdGl2ZSwg5Zyo6Kej5p6Q5a6M5YW255u45ZCM5p2D6YeN55qEIGRpcmVjdGl2ZSDlkI7kuK3mlq3pgY3ljobor6XlhYPntKBcbiAgICBpZih0ZXJtaW5hbFByaW9yaXR5ID4gZGlyLnByaW9yaXR5KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoZGlyLm5vZGVOYW1lKTtcblxuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKSApO1xuXG4gICAgaWYoZGlyLnRlcm1pbmFsKSB7XG4gICAgICByZXN1bHQudGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQud2F0Y2hlcnMgPSB3YXRjaGVyc1xuXG4gIHJldHVybiByZXN1bHRcbn1cblxudmFyIHBhcnRpYWxSZWcgPSAvXj5cXHMqLztcbi8v5aSE55CG5paH5pys6IqC54K55Lit55qE57uR5a6a5Y2g5L2N56ymKHt7Li4ufX0pXG5mdW5jdGlvbiBjaGVja1RleHQobm9kZSkge1xuICB2YXIgd2F0Y2hlcnMgPSBbXTtcbiAgaWYodG9rZW4uaGFzVG9rZW4obm9kZS5ub2RlVmFsdWUpKSB7XG4gICAgdmFyIHRva2VucyA9IHRva2VuLnBhcnNlVG9rZW4obm9kZS5ub2RlVmFsdWUpXG4gICAgICAsIHRleHRNYXAgPSB0b2tlbnMudGV4dE1hcFxuICAgICAgLCBlbCA9IG5vZGUucGFyZW50Tm9kZVxuICAgICAgLCBkaXJzID0gdGhpcy5jb25zdHJ1Y3Rvci5kaXJlY3RpdmVzXG4gICAgICAsIHQsIGRpclxuICAgICAgO1xuXG4gICAgLy/lsIZ7e2tleX195YiG5Ymy5oiQ5Y2V54us55qE5paH5pys6IqC54K5XG4gICAgaWYodGV4dE1hcC5sZW5ndGggPiAxKSB7XG4gICAgICB0ZXh0TWFwLmZvckVhY2goZnVuY3Rpb24odGV4dCkge1xuICAgICAgICB2YXIgdG4gPSBkb2MuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG4gICAgICAgIGVsLmluc2VydEJlZm9yZSh0biwgbm9kZSk7XG4gICAgICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KGNoZWNrVGV4dC5jYWxsKHRoaXMsIHRuKSk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgZWwucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfWVsc2V7XG4gICAgICB0ID0gdG9rZW5zWzBdO1xuICAgICAgLy/lhoXnva7lkITljaDkvY3nrKblpITnkIYuXG4gICAgICBpZihwYXJ0aWFsUmVnLnRlc3QodC5wYXRoKSkge1xuICAgICAgICB0LnBhdGggPSB0LnBhdGgucmVwbGFjZShwYXJ0aWFsUmVnLCAnJyk7XG4gICAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZShkaXJzLmNvbnRlbnQpXG4gICAgICAgIGRpci5kaXJOYW1lID0gZGlyLnR5cGVcbiAgICAgICAgZGlyLmFuY2hvcnMgPSBkaXJlY3RpdmUuc2V0QW5jaG9ycyhub2RlLCBkaXIudHlwZSlcbiAgICAgIH1lbHNle1xuICAgICAgICBkaXIgPSB1dGlscy5jcmVhdGUodC5lc2NhcGUgPyBkaXJzLnRleHQgOiBkaXJzLmh0bWwpXG4gICAgICB9XG5cbiAgICAgIHdhdGNoZXJzID0gc2V0QmluZGluZy5jYWxsKHRoaXMsIHV0aWxzLmV4dGVuZChkaXIsIHQsIHtcbiAgICAgICAgZWw6IG5vZGVcbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHdhdGNoZXJzXG59XG5cbmZ1bmN0aW9uIHNldEJpbmRpbmcoZGlyKSB7XG4gIHZhciB3YXRjaGVyXG4gIGlmKGRpci5yZXBsYWNlKSB7XG4gICAgdmFyIGVsID0gZGlyLmVsO1xuICAgIGlmKHV0aWxzLmlzRnVuY3Rpb24oZGlyLnJlcGxhY2UpKSB7XG4gICAgICBkaXIubm9kZSA9IGRpci5yZXBsYWNlKCk7XG4gICAgfWVsc2V7XG4gICAgICBkaXIubm9kZSA9IGRvYy5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gICAgfVxuXG4gICAgZGlyLmVsID0gZGlyLmVsLnBhcmVudE5vZGU7XG4gICAgZGlyLmVsLnJlcGxhY2VDaGlsZChkaXIubm9kZSwgZWwpO1xuICB9XG5cbiAgZGlyLnZtID0gdGhpcztcbiAgZGlyLmxpbmsoKTtcblxuICB3YXRjaGVyID0gV2F0Y2hlci5hZGRXYXRjaGVyLmNhbGwodGhpcywgZGlyKVxuICByZXR1cm4gd2F0Y2hlciA/IFt3YXRjaGVyXSA6IFtdXG59XG5cbmZ1bmN0aW9uIHVuQmluZGluZyh3YXRjaGVycykge1xuICB3YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICB3YXRjaGVyLnVud2F0Y2goKVxuICB9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2Fsazogd2FsayxcbiAgdW5CaW5kaW5nOiB1bkJpbmRpbmdcbn07XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlscy5qcycpLmV4dGVuZDtcblxudmFyIENsYXNzID0ge1xuICAvKipcbiAgICog5p6E6YCg5Ye95pWw57un5om/LlxuICAgKiDlpoI6IGB2YXIgQ2FyID0gQmVlLmV4dGVuZCh7ZHJpdmU6IGZ1bmN0aW9uKCl7fX0pOyBuZXcgQ2FyKCk7YFxuICAgKiBAcGFyYW0ge09iamVjdH0gW3Byb3RvUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxleWOn+Wei+WvueixoVxuICAgKiBAcGFyYW0ge09iamVjdH0gW3N0YXRpY1Byb3BzXSDlrZDmnoTpgKDlh73mlbDnmoTmianlsZXpnZnmgIHlsZ7mgKdcbiAgICogQHJldHVybnMge0Z1bmN0aW9ufSDlrZDmnoTpgKDlh73mlbBcbiAgICovXG4gIGV4dGVuZDogZnVuY3Rpb24gKHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG4gICAgcHJvdG9Qcm9wcyA9IHByb3RvUHJvcHMgfHwge307XG4gICAgdmFyIGNvbnN0cnVjdG9yID0gcHJvdG9Qcm9wcy5oYXNPd25Qcm9wZXJ0eSgnY29uc3RydWN0b3InKSA/XG4gICAgICAgICAgcHJvdG9Qcm9wcy5jb25zdHJ1Y3RvciA6IGZ1bmN0aW9uKCl7IHJldHVybiBzdXAuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfVxuICAgIHZhciBzdXAgPSB0aGlzO1xuICAgIHZhciBGbiA9IGZ1bmN0aW9uKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY29uc3RydWN0b3I7IH07XG4gICAgdmFyIHN1cFJlZiA9IHtfX3N1cGVyX186IHN1cC5wcm90b3R5cGV9O1xuXG4gICAgRm4ucHJvdG90eXBlID0gc3VwLnByb3RvdHlwZTtcbiAgICBjb25zdHJ1Y3Rvci5wcm90b3R5cGUgPSBuZXcgRm4oKTtcbiAgICBleHRlbmQoY29uc3RydWN0b3IucHJvdG90eXBlLCBzdXBSZWYsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdXBSZWYsIHN0YXRpY1Byb3BzKTtcblxuICAgIHJldHVybiBjb25zdHJ1Y3RvcjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzcztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbi8qKlxuICog5rOo5YaM57uE5Lu2XG4gKiBAcGFyYW0ge1N0cmluZ30gdGFnTmFtZSDoh6rlrprkuYnnu4Tku7bnmoTmoIfnrb7lkI1cbiAqIEBwYXJhbSB7RnVuY3Rpb258cHJvcHN9IENvbXBvbmVudCDoh6rlrprkuYnnu4Tku7bnmoTmnoTpgKDlh73mlbAgLyDmnoTpgKDlh73mlbDlj4LmlbBcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSDoh6rlrprkuYnnu4Tku7bnmoTmnoTpgKDlh73mlbBcbiAqL1xuZnVuY3Rpb24gdGFnKHRhZ05hbWUsIENvbXBvbmVudCwgc3RhdGljcykge1xuICB2YXIgdGFncyA9IHRoaXMuY29tcG9uZW50cyA9IHRoaXMuY29tcG9uZW50cyB8fCB7fTtcblxuICB0aGlzLmRvYy5jcmVhdGVFbGVtZW50KHRhZ05hbWUpOy8vZm9yIG9sZCBJRVxuXG4gIGlmKHV0aWxzLmlzT2JqZWN0KENvbXBvbmVudCkpIHtcbiAgICBDb21wb25lbnQgPSB0aGlzLmV4dGVuZChDb21wb25lbnQsIHN0YXRpY3MpO1xuICB9XG4gIHJldHVybiB0YWdzW3RhZ05hbWVdID0gQ29tcG9uZW50O1xufVxuXG4vKipcbiAqIOafpeivouafkOaehOmAoOWHveaVsOS4i+eahOazqOWGjOe7hOS7tlxuICogQHBhcm0ge1N0cmluZ30gY29tcG9uZW50TmFtZVxuICovXG5mdW5jdGlvbiBnZXRDb21wb25lbnQoY29tcG9uZW50TmFtZSkge1xuICB2YXIgcGF0aHMgPSB1dGlscy5wYXJzZUtleVBhdGgoY29tcG9uZW50TmFtZSk7XG4gIHZhciBDdXJDc3RyID0gdGhpcztcbiAgcGF0aHMuZm9yRWFjaChmdW5jdGlvbihjb21OYW1lKSB7XG4gICAgQ3VyQ3N0ciA9IEN1ckNzdHIgJiYgQ3VyQ3N0ci5jb21wb25lbnRzW2NvbU5hbWVdO1xuICB9KTtcbiAgcmV0dXJuIEN1ckNzdHIgfHwgbnVsbDtcbn1cblxuZXhwb3J0cy50YWcgPSBleHBvcnRzLmNvbXBvbmVudCA9IHRhZztcbmV4cG9ydHMuZ2V0Q29tcG9uZW50ID0gZ2V0Q29tcG9uZW50O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAsIHRva2VuID0gcmVxdWlyZSgnLi90b2tlbi5qcycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZS5qcycpLnBhcnNlXG4gICwgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi9kb20tdXRpbHMnKVxuXG4gICwgY3JlYXRlID0gdXRpbHMuY3JlYXRlXG4gIDtcblxuLyoqXG4gKiDkuLogQmVlIOaehOmAoOWHveaVsOa3u+WKoOaMh+S7pCAoZGlyZWN0aXZlKS4gYEJlZS5kaXJlY3RpdmVgXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IGRpcmVjdGl2ZSDlkI3np7BcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0c10gZGlyZWN0aXZlIOWPguaVsFxuICogQHBhcmFtIHtOdW1iZXJ9IG9wdHMucHJpb3JpdHk9MCBkaXJlY3RpdmUg5LyY5YWI57qnLiDlkIzkuIDkuKrlhYPntKDkuIrnmoTmjIfku6TmjInnhafkvJjlhYjnuqfpobrluo/miafooYwuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMudGVybWluYWw9ZmFsc2Ug5omn6KGM6K+lIGRpcmVjdGl2ZSDlkI4sIOaYr+WQpue7iOatouWQjue7rSBkaXJlY3RpdmUg5omn6KGMLlxuICogICB0ZXJtaW5hbCDkuLrnnJ/ml7YsIOS4juivpSBkaXJlY3RpdmUg5LyY5YWI57qn55u45ZCM55qEIGRpcmVjdGl2ZSDku43kvJrnu6fnu63miafooYwsIOi+g+S9juS8mOWFiOe6p+eahOaJjeS8muiiq+W/veeVpS5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0cy5hbmNob3IgYW5jaG9yIOS4uiB0cnVlIOaXtiwg5Lya5Zyo5oyH5Luk6IqC54K55YmN5ZCO5ZCE5Lqn55Sf5LiA5Liq56m655m955qE5qCH6K6w6IqC54K5LiDliIbliKvlr7nlupQgYGFuY2hvcnMuc3RhcnRgIOWSjCBgYW5jaG9ycy5lbmRgXG4gKi9cbmZ1bmN0aW9uIGRpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdmFyIGRpcnMgPSB0aGlzLmRpcmVjdGl2ZXMgPSB0aGlzLmRpcmVjdGl2ZXMgfHwge307XG5cbiAgcmV0dXJuIGRpcnNba2V5XSA9IG5ldyBEaXJlY3RpdmUoa2V5LCBvcHRzKTtcbn1cblxuZnVuY3Rpb24gRGlyZWN0aXZlKGtleSwgb3B0cykge1xuICB0aGlzLnR5cGUgPSBrZXk7XG4gIHV0aWxzLmV4dGVuZCh0aGlzLCBvcHRzKTtcbn1cblxudmFyIGFzdENhY2hlID0ge307XG5cbkRpcmVjdGl2ZS5wcm90b3R5cGUgPSB7XG4gIHByaW9yaXR5OiAwLy/mnYPph41cbiwgdHlwZTogJycgLy/mjIfku6Tnsbvlnotcbiwgc3ViVHlwZTogJycgLy/lrZDnsbvlnosuIOavlOWmgiBgYi1vbi1jbGlja2Ag55qEIHR5cGUg5Li6IGBvbmAsIHN1YlR5cGUg5Li6IGBjbGlja2Bcbiwgc3ViOiBmYWxzZSAvL+aYr+WQpuWFgeiuuOWtkOexu+Wei+aMh+S7pFxuLCBsaW5rOiB1dGlscy5ub29wLy/liJ3lp4vljJbmlrnms5VcbiwgdW5MaW5rOiB1dGlscy5ub29wLy/plIDmr4Hlm57osINcbiwgdXBkYXRlOiB1dGlscy5ub29wLy/mm7TmlrDmlrnms5VcbiwgdGVhckRvd246IHV0aWxzLm5vb3BcbiwgdGVybWluYWw6IGZhbHNlLy/mmK/lkKbnu4jmraJcbiwgcmVwbGFjZTogZmFsc2UvL+aYr+WQpuabv+aNouW9k+WJjeWFg+e0oC4g5aaC5p6c5pivLCDlsIbnlKjkuIDkuKrnqbrnmoTmlofmnKzoioLngrnmm7/mjaLlvZPliY3lhYPntKBcbiwgd2F0Y2g6IHRydWUvL+aYr+WQpuebkeaOpyBrZXkg55qE5Y+Y5YyWLiDlpoLmnpzkuLogZmFsc2Ug55qE6K+dLCB1cGRhdGUg5pa55rOV6buY6K6k5Y+q5Lya5Zyo5Yid5aeL5YyW5ZCO6LCD55So5LiA5qyhXG4sIGltbWVkaWF0ZTogdHJ1ZSAvL+aYr+WQpuWcqCBkaXIg5Yid5aeL5YyW5pe256uL5Y2z5omn6KGMIHVwZGF0ZSDmlrnms5VcblxuLCBhbmNob3I6IGZhbHNlXG4sIGFuY2hvcnM6IG51bGxcblxuICAvL+iOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKHN0YXJ0LCBlbmQpIHtcbiAgICBzdGFydCA9IHN0YXJ0IHx8IHRoaXMuYW5jaG9ycy5zdGFydDtcbiAgICBlbmQgPSBlbmQgfHwgdGhpcy5hbmNob3JzLmVuZDtcblxuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gc3RhcnQubmV4dFNpYmxpbmc7XG4gICAgaWYodGhpcy5hbmNob3IgJiYgbm9kZSkge1xuICAgICAgd2hpbGUobm9kZSAhPT0gZW5kKXtcbiAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dFNpYmxpbmc7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBub2RlcztcbiAgICB9XG4gIH1cbiAgLy/op6PmnpDooajovr7lvI9cbiwgcGFyc2U6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjYWNoZSA9IGFzdENhY2hlW3RoaXMucGF0aF1cbiAgICBpZihjYWNoZSAmJiBjYWNoZS5fdHlwZSA9PT0gdGhpcy50eXBlKXtcbiAgICAgIHRoaXMuYXN0ID0gY2FjaGVcbiAgICB9ZWxzZSB7XG4gICAgICBpZih0aGlzLnR5cGUgPT0gJ2F0dHInICYmIHRoaXMuZXNjYXBlID09PSBmYWxzZSkge1xuICAgICAgICB0aGlzLnBhdGggPSAneycgKyB0aGlzLnBhdGggKyAnfSdcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIHRoaXMuYXN0ID0gcGFyc2UodGhpcy5wYXRoLCB0aGlzLnR5cGUpO1xuICAgICAgICB0aGlzLmFzdC5fdHlwZSA9IHRoaXMudHlwZTtcbiAgICAgICAgYXN0Q2FjaGVbdGhpcy5wYXRoXSA9IHRoaXMuYXN0O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aGlzLmFzdCA9IHt9O1xuICAgICAgICBlLm1lc3NhZ2UgPSAnU3ludGF4RXJyb3IgaW4gXCInICsgdGhpcy5wYXRoICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy/ooajovr7lvI/msYLlgLxcbiAgLy9mb3JnaXZlW3RydWVdOiDmmK/lkKblsIYgdW5kZWZpbmVkIOWPiiBudWxsIOi9rOS4uuepuuWtl+esplxuLCBnZXRWYWx1ZTogZnVuY3Rpb24oc2NvcGUsIGZvcmdpdmUpIHtcbiAgICBmb3JnaXZlID0gZm9yZ2l2ZSAhPT0gZmFsc2U7XG4gICAgdmFyIHZhbDtcblxuICAgIHRyeXtcbiAgICAgIHZhbCA9IGV2YWx1YXRlLmV2YWwodGhpcy5hc3QsIHNjb3BlLCB0aGlzKTtcbiAgICB9Y2F0Y2goZSl7XG4gICAgICB2YWwgPSAnJztcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICAgIGlmKGZvcmdpdmUgJiYgKHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSkge1xuICAgICAgdmFsID0gJyc7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG4gIH1cbn07XG5cbnZhciBhdHRyUG9zdFJlZyA9IC9cXD8kLztcblxuLyoqXG4gKiDojrflj5bkuIDkuKrlhYPntKDkuIrmiYDmnInnlKggSFRNTCDlsZ7mgKflrprkuYnnmoTmjIfku6RcbiAqIEBwYXJhbSAge0VsZW1lbnR9IGVsICAg5oyH5Luk5omA5Zyo5YWD57SgXG4gKiBAcGFyYW0gIHtCZWV9IGNzdHIg57uE5Lu25p6E6YCg5Ye95pWwXG4gKiBAcmV0dXJuIHtkaXJlY3RldmVbXX0gICAgICBgZWxgIOS4iuaJgOacieeahOaMh+S7pFxuICovXG5mdW5jdGlvbiBnZXREaXJzKGVsLCBjc3RyKXtcbiAgdmFyIGF0dHIsIGF0dHJOYW1lLCBkaXJOYW1lLCBwcm90b1xuICAgICwgZGlycyA9IFtdLCBkaXJcbiAgICAsIHBhcmVudCA9IGVsLnBhcmVudE5vZGVcbiAgICAsIG5vZGVOYW1lID0gZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKVxuICAgICwgZGlyZWN0aXZlcyA9IGNzdHIuZGlyZWN0aXZlc1xuICAgICwgcHJlZml4ID0gY3N0ci5wcmVmaXhcbiAgICA7XG5cbiAgLy/lr7nkuo7oh6rlrprkuYnmoIfnrb4sIOWwhuWFtui9rOS4uiBkaXJlY3RpdmVcbiAgaWYoY3N0ci5nZXRDb21wb25lbnQobm9kZU5hbWUpKSB7XG4gICAgZWwuc2V0QXR0cmlidXRlKHByZWZpeCArICdjb21wb25lbnQnLCBub2RlTmFtZSk7XG4gIH1cblxuICBmb3IodmFyIGkgPSBlbC5hdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICBhdHRyID0gZWwuYXR0cmlidXRlc1tpXTtcbiAgICBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG4gICAgZGlyTmFtZSA9IGF0dHJOYW1lLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xuICAgIHByb3RvID0ge2VsOiBlbCwgbm9kZTogYXR0ciwgbm9kZU5hbWU6IGF0dHJOYW1lLCBwYXRoOiBhdHRyLnZhbHVlfTtcbiAgICBkaXIgPSBudWxsO1xuXG4gICAgaWYoYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwICYmIChkaXIgPSBnZXREaXIoZGlyTmFtZSwgZGlyZWN0aXZlcykpKSB7XG4gICAgICAvL+aMh+S7pFxuICAgICAgZGlyLmRpck5hbWUgPSBkaXJOYW1lLy9kaXIg5ZCNXG4gICAgfWVsc2UgaWYodG9rZW4uaGFzVG9rZW4oYXR0ci52YWx1ZSkpIHtcbiAgICAgIC8v5bGe5oCn6KGo6L6+5byP5Y+v6IO95pyJ5aSa5Liq6KGo6L6+5byP5Yy6XG4gICAgICB0b2tlbi5wYXJzZVRva2VuKGF0dHIudmFsdWUpLmZvckVhY2goZnVuY3Rpb24ob3JpZ2luKSB7XG4gICAgICAgIG9yaWdpbi5kaXJOYW1lID0gYXR0ck5hbWUuaW5kZXhPZihwcmVmaXgpID09PSAwID8gZGlyTmFtZSA6IGF0dHJOYW1lIDtcbiAgICAgICAgZGlycy5wdXNoKHV0aWxzLmV4dGVuZChjcmVhdGUoZGlyZWN0aXZlcy5hdHRyKSwgcHJvdG8sIG9yaWdpbikpXG4gICAgICB9KTtcbiAgICAgIC8v55Sx5LqO5bey55+l5bGe5oCn6KGo6L6+5byP5LiN5a2Y5ZyoIGFuY2hvciwg5omA5Lul55u05o6l6Lez6L+H5LiL6Z2i55qE5qOA5rWLXG4gICAgfWVsc2UgaWYoYXR0clBvc3RSZWcudGVzdChhdHRyTmFtZSkpIHtcbiAgICAgIC8v5p2h5Lu25bGe5oCn5oyH5LukXG4gICAgICBkaXIgPSB1dGlscy5leHRlbmQoY3JlYXRlKGRpcmVjdGl2ZXMuYXR0ciksIHsgZGlyTmFtZTogYXR0ck5hbWUucmVwbGFjZShhdHRyUG9zdFJlZywgJycpLCBjb25kaXRpb25hbDogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBpZihkaXIpIHtcbiAgICAgIGlmKGRpci5hbmNob3IpIHtcbiAgICAgICAgZGlyLmFuY2hvcnMgPSBzZXRBbmNob3JzKGVsLCBkaXIuZGlyTmFtZSk7XG4gICAgICB9XG4gICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGRpciwgcHJvdG8pKTtcbiAgICB9XG4gIH1cbiAgZGlycy5zb3J0KGZ1bmN0aW9uKGQwLCBkMSkge1xuICAgIHJldHVybiBkMS5wcmlvcml0eSAtIGQwLnByaW9yaXR5O1xuICB9KTtcbiAgcmV0dXJuIGRpcnM7XG59XG5cbmZ1bmN0aW9uIGdldERpcihkaXJOYW1lLCBkaXJzKSB7XG4gIHZhciBkaXIsIHN1YlR5cGU7XG4gIGZvcih2YXIga2V5IGluIGRpcnMpIHtcbiAgICBpZihkaXJOYW1lID09PSBrZXkpe1xuICAgICAgZGlyID0gZGlyc1trZXldXG4gICAgICBicmVha1xuICAgIH1lbHNlIGlmKGRpck5hbWUuaW5kZXhPZihrZXkgKyAnLScpID09PSAwKXtcbiAgICAgIGRpciA9IGRpcnNba2V5XVxuICAgICAgaWYoIWRpci5zdWIpe1xuICAgICAgICBkaXIgPSBudWxsXG4gICAgICB9ZWxzZXtcbiAgICAgICAgc3ViVHlwZSA9IGRpck5hbWUuc2xpY2Uoa2V5Lmxlbmd0aCArIDEpXG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYoZGlyKSB7XG4gICAgZGlyID0gY3JlYXRlKGRpcik7XG4gICAgZGlyLnN1YlR5cGUgPSBzdWJUeXBlO1xuICB9XG4gIHJldHVybiBkaXI7XG59XG5cbmZ1bmN0aW9uIHNldEFuY2hvcnMobm9kZSwgZGlyTmFtZSkge1xuICB2YXIgcGFyZW50ID0gbm9kZS5wYXJlbnROb2RlXG4gICAgLCBhbmNob3JzID0ge31cbiAgICA7XG5cbiAgICBhbmNob3JzLnN0YXJ0ID0gZG9jLmNyZWF0ZUNvbW1lbnQoZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGFuY2hvcnMuc3RhcnQsIG5vZGUpO1xuXG4gICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXJOYW1lICsgJyBlbmQnKTtcbiAgICBpZihub2RlLm5leHRTaWJsaW5nKSB7XG4gICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKGFuY2hvcnMuZW5kLCBub2RlLm5leHRTaWJsaW5nKTtcbiAgICB9ZWxzZXtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChhbmNob3JzLmVuZCk7XG4gICAgfVxuICAgIHJldHVybiBhbmNob3JzXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBEaXJlY3RpdmU6IERpcmVjdGl2ZSxcbiAgZGlyZWN0aXZlOiBkaXJlY3RpdmUsXG4gIGdldERpcnM6IGdldERpcnMsXG4gIHNldEFuY2hvcnM6IHNldEFuY2hvcnNcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLy/lsZ7mgKfmjIfku6RcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7Ly9hdHRyIGJpbmRpbmdcbiAgICAgIHRoaXMuYXR0cnMgPSB7fTtcbiAgICB9ZWxzZSB7XG4gICAgICAvL+WxnuaAp+ihqOi+vuW8j+m7mOiupOWwhuWAvOe9ruepuiwg6Ziy5q2i6KGo6L6+5byP5YaF5Y+Y6YeP5LiN5a2Y5ZyoXG4gICAgICB0aGlzLnVwZGF0ZSgnJylcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBuZXdBdHRycyA9IHt9O1xuICAgIHZhciB0ZXh0TWFwID0gdGhpcy50ZXh0TWFwXG5cbiAgICAvL2ItYXR0clxuICAgIGlmKHRoaXMuZGlyTmFtZSA9PT0gdGhpcy50eXBlKSB7XG4gICAgICBmb3IodmFyIGF0dHIgaW4gdmFsKSB7XG4gICAgICAgIHNldFByb3BlcnR5LmNhbGwodGhpcywgZWwsIGF0dHIsIHZhbFthdHRyXSk7XG5cbiAgICAgICAgZGVsZXRlIHRoaXMuYXR0cnNbYXR0cl07XG5cbiAgICAgICAgbmV3QXR0cnNbYXR0cl0gPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvL+enu+mZpOS4jeWcqOS4iuasoeiusOW9leS4reeahOWxnuaAp1xuICAgICAgZm9yKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgcmVtb3ZlUHJvcGVydHkuY2FsbCh0aGlzLCBlbCwgYXR0cik7XG4gICAgICB9XG4gICAgICB0aGlzLmF0dHJzID0gbmV3QXR0cnM7XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLmNvbmRpdGlvbmFsKSB7XG4gICAgICAgIHZhbCA/IHNldFByb3BlcnR5LmNhbGwodGhpcywgZWwsIHRoaXMuZGlyTmFtZSwgdmFsKSA6IHJlbW92ZVByb3BlcnR5LmNhbGwodGhpcywgZWwsIHRoaXMuZGlyTmFtZSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGV4dE1hcFt0aGlzLnBvc2l0aW9uXSA9IHZhbDtcbiAgICAgICAgc2V0UHJvcGVydHkuY2FsbCh0aGlzLCBlbCwgdGhpcy5kaXJOYW1lLCB0ZXh0TWFwLmxlbmd0aCA+IDEgPyB0ZXh0TWFwLmpvaW4oJycpIDogdGV4dE1hcFswXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBzZXRQcm9wZXJ0eShlbCwga2V5LCB2YWwpIHtcbiAgaWYoaXNDb21wb25lbnQodGhpcykpIHtcbiAgICBlbC5iZWUuJHNldCh1dGlscy5oeXBoZW5Ub0NhbWVsKGtleSksIHZhbClcbiAgfWVsc2V7XG4gICAgc2V0QXR0cihlbCwga2V5LCB2YWwpXG4gIH1cbn1cblxuZnVuY3Rpb24gcmVtb3ZlUHJvcGVydHkoZWwsIGtleSwgdW5kZWYpIHtcbiAgaWYoaXNDb21wb25lbnQodGhpcykpIHtcbiAgICBlbC5iZWUuJHNldCh1dGlscy5oeXBoZW5Ub0NhbWVsKGtleSksIHVuZGVmKVxuICB9ZWxzZXtcbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgfVxufVxuXG5cbi8vSUUg5rWP6KeI5Zmo5b6I5aSa5bGe5oCn6YCa6L+HIGBzZXRBdHRyaWJ1dGVgIOiuvue9ruWQjuaXoOaViC5cbi8v6L+Z5Lqb6YCa6L+HIGBlbFthdHRyXSA9IHZhbHVlYCDorr7nva7nmoTlsZ7mgKfljbTog73lpJ/pgJrov4cgYHJlbW92ZUF0dHJpYnV0ZWAg5riF6ZmkLlxuZnVuY3Rpb24gc2V0QXR0cihlbCwgYXR0ciwgdmFsKXtcbiAgdHJ5e1xuICAgIGlmKCgoYXR0ciBpbiBlbCkgfHwgYXR0ciA9PT0gJ2NsYXNzJykpe1xuICAgICAgaWYoYXR0ciA9PT0gJ3N0eWxlJyAmJiBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCB2YWwpO1xuICAgICAgfWVsc2UgaWYoYXR0ciA9PT0gJ2NsYXNzJyl7XG4gICAgICAgIGVsLmNsYXNzTmFtZSA9IHZhbDtcbiAgICAgIH1lbHNle1xuICAgICAgICBlbFthdHRyXSA9IHR5cGVvZiBlbFthdHRyXSA9PT0gJ2Jvb2xlYW4nID8gdHJ1ZSA6IHZhbDtcbiAgICAgIH1cbiAgICB9XG4gIH1jYXRjaChlKXt9XG4gIC8vY2hyb21lIHNldGF0dHJpYnV0ZSB3aXRoIGB7e319YCB3aWxsIHRocm93IGFuIGVycm9yXG4gIGVsLnNldEF0dHJpYnV0ZShhdHRyLCB2YWwpO1xufVxuXG5mdW5jdGlvbiBpc0NvbXBvbmVudCAoZGlyKSB7XG4gIHZhciBjb21wb25lbnQgPSBkaXIuZWwuYmVlO1xuICByZXR1cm4gY29tcG9uZW50ICYmICFjb21wb25lbnQuX19yZXBlYXQgJiYgY29tcG9uZW50ICE9IGRpci52bTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5pbml0Q2xhc3MgPSB0aGlzLmVsLmNsYXNzTmFtZSB8fCAnJ1xuICAgIHRoaXMua2V5cyA9IHt9O1xuICB9LFxuICB1cGRhdGU6IGZ1bmN0aW9uKGNsYXNzZXMpIHtcbiAgICB2YXIgY2xhc3NTdHIgPSB0aGlzLmluaXRDbGFzc1xuICAgICAgLCB3YXRjaGVyID0gdGhpcy53YXRjaGVyXG4gICAgICA7XG5cbiAgICBpZih0eXBlb2YgY2xhc3NlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmKGNsYXNzZXMpIHtcbiAgICAgICAgY2xhc3NTdHIgKz0gJyAnICsgY2xhc3NlcztcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIGZvcih2YXIga2V5IGluIGNsYXNzZXMpIHtcbiAgICAgICAgaWYoIXRoaXMua2V5c1trZXldKSB7XG4gICAgICAgICAgdGhpcy5rZXlzW2tleV0gPSB0cnVlO1xuICAgICAgICAgIC8v5a+56LGh55qE6ZSu5YC86buY6K6k5LiN5Zyo55uR5ZCs6IyD5Zu05LmL5YaFLCDov5nph4zmiYvliqjnm5HlkKxcbiAgICAgICAgICB0aGlzLnZtLiR3YXRjaChrZXksIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgd2F0Y2hlci51cGRhdGUoKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgaWYodGhpcy52bS4kZ2V0KGtleSkpIHtcbiAgICAgICAgICBjbGFzc1N0ciArPSAnICcgKyBjbGFzc2VzW2tleV1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmVsLmNsYXNzTmFtZSA9IGNsYXNzU3RyO1xuICB9XG59O1xuIiwiLy9jb21wb25lbnQgYXMgZGlyZWN0aXZlXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpO1xudmFyIGRvbVV0aWxzID0gcmVxdWlyZSgnLi4vZG9tLXV0aWxzJylcbnZhciBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuLi9jaGVjay1iaW5kaW5nJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAtMVxuLCB3YXRjaDogZmFsc2VcbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNvbXBvbmVudCAmJiB0aGlzLmNvbXBvbmVudC4kZGVzdHJveSgpXG4gIH1cbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZtID0gdGhpcy52bTtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBjc3RyID0gdm0uY29uc3RydWN0b3I7XG4gICAgdmFyIGNvbXA7XG4gICAgdmFyIGRpcnMsICRkYXRhID0ge307XG4gICAgdmFyIENvbXAgPSBjc3RyLmdldENvbXBvbmVudCh0aGlzLnBhdGgpXG4gICAgdmFyIHN0YXRpY3MgPSB7fTtcblxuICAgIGlmKENvbXApIHtcblxuICAgICAgLy/nm7TmjqUgYEJlZS5tb3VudGAg5LiA5Liq57uE5Lu2XG4gICAgICBpZihDb21wID09PSBjc3RyICYmIHZtLl9fbW91bnRjYWxsIHx8IGVsLmJlZSAmJiBlbC5iZWUgPT09IHZtKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGlycyA9IHRoaXMuZGlycy5maWx0ZXIoZnVuY3Rpb24gKGRpcikge1xuICAgICAgICByZXR1cm4gZGlyLnR5cGUgPT0gJ2F0dHInIHx8IGRpci50eXBlID09ICd3aXRoJztcbiAgICAgIH0pO1xuXG4gICAgICBkaXJzLmZvckVhY2goZnVuY3Rpb24gKGRpcikge1xuICAgICAgICB2YXIgY3VyUGF0aCwgY29tUGF0aDtcblxuICAgICAgICBjdXJQYXRoID0gZGlyLnBhdGg7XG4gICAgICAgIGlmKGRpci50eXBlID09PSAnd2l0aCcpIHtcbiAgICAgICAgICAvL2NvbVBhdGggPSAnJGRhdGEnXG4gICAgICAgICAgdXRpbHMuZXh0ZW5kKHRydWUsICRkYXRhLCB2bS4kZ2V0KGN1clBhdGgpKVxuXG4gICAgICAgICAgLy/nm5HlkKzniLbnu4Tku7bmm7TmlrAsIOWQjOatpeaVsOaNrlxuICAgICAgICAgIC8vVE9ETyDnp7vliLAgYi13aXRoIOaMh+S7pOS4reWujOaIkFxuICAgICAgICAgIHZtLiR3YXRjaChjdXJQYXRoLCBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgICBjb21wICYmIGNvbXAuJHNldCh1dGlscy5leHRlbmQoe30sIHZtLiRnZXQoY3VyUGF0aCkpKTtcbiAgICAgICAgICB9KVxuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBjb21QYXRoID0gdXRpbHMuaHlwaGVuVG9DYW1lbChkaXIuZGlyTmFtZSk7XG4gICAgICAgICAgJGRhdGFbY29tUGF0aF0gPSBnZXRQcm9wZXJ0eShkaXIpXG4gICAgICAgICAgZGlyLmVsLnJlbW92ZUF0dHJpYnV0ZShkaXIuZGlyTmFtZSlcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8v57uE5Lu25YaF5a655bGe5LqO5YW25a655ZmoXG4gICAgICB2bS5fX2xpbmtzID0gdm0uX19saW5rcy5jb25jYXQoY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh2bSwgZWwuY2hpbGROb2RlcykpO1xuXG4gICAgICBzdGF0aWNzID0gZG9tVXRpbHMuZ2V0QXR0cnMoZWwpXG5cbiAgICAgIC8v5o6S6Zmk5oyH5Luk5bGe5oCnXG4gICAgICB2YXIgX2RpcjtcbiAgICAgIGZvcih2YXIgYXR0ciBpbiBzdGF0aWNzKSB7XG4gICAgICAgIF9kaXIgPSB1dGlscy5jYW1lbFRvSHlwaGVuKGF0dHIpO1xuICAgICAgICBfZGlyID0gX2Rpci5zbGljZSh2bS5jb25zdHJ1Y3Rvci5wcmVmaXgubGVuZ3RoKVxuXG4gICAgICAgIGlmKF9kaXIgaW4gdm0uY29uc3RydWN0b3IuZGlyZWN0aXZlcykge1xuICAgICAgICAgIGRlbGV0ZSBzdGF0aWNzW2F0dHJdXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5jb21wb25lbnQgPSBjb21wID0gbmV3IENvbXAoe1xuICAgICAgICAkZWw6IGVsLFxuICAgICAgICAkaXNSZXBsYWNlOiB0cnVlLFxuXG4gICAgICAgICRkYXRhOiB1dGlscy5leHRlbmQodHJ1ZSwge30sICRkYXRhLCBzdGF0aWNzKVxuICAgICAgfSk7XG4gICAgICBlbC5iZWUgPSBjb21wO1xuXG4gICAgICByZXR1cm4gY29tcDtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0NvbXBvbmVudDogJyArIHRoaXMucGF0aCArICcgbm90IGRlZmluZWQhJyk7XG4gICAgfVxuICB9XG59O1xuXG4vL+WmguaenOe7hOS7tueahOWxnuaAp+WPquacieS4gOS4quihqOi+vuW8jywg5YiZ5L+d5oyB6K+l6KGo6L6+5byP55qE5pWw5o2u57G75Z6LXG5mdW5jdGlvbiBnZXRQcm9wZXJ0eShkaXIpIHtcbiAgdmFyIHRleHRNYXAgPSBkaXIudGV4dE1hcCwgdmFsXG4gIHZhbCA9IHRleHRNYXAgJiYgdGV4dE1hcC5sZW5ndGggPiAxID8gdGV4dE1hcC5qb2luKCcnKSA6IHRleHRNYXBbMF1cblxuICByZXR1cm4gdXRpbHMuaXNQbGFpbk9iamVjdCh2YWwpID8gdXRpbHMuZXh0ZW5kKHRydWUsIHt9LCB2YWwpIDogdmFsO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb21VdGlscyA9IHJlcXVpcmUoJy4uL2RvbS11dGlscycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlcGxhY2U6IHRydWVcbiwgYW5jaG9yOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMgPSBbXTtcbiAgfVxuLCB1bkxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMud2F0Y2hlcnMuZm9yRWFjaChmdW5jdGlvbih3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLnVud2F0Y2goKVxuICAgIH0pO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odHBsKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpXG4gICAgdmFyIHBhcmVudCA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZVxuXG4gICAgbm9kZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnVuTGluaygpO1xuXG4gICAgdmFyIGNvbnRlbnQgPSBkb21VdGlscy5jcmVhdGVDb250ZW50KHRwbClcblxuICAgIHRoaXMud2F0Y2hlcnMgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMudm0sIGNvbnRlbnQpXG4gICAgcGFyZW50Lmluc2VydEJlZm9yZShjb250ZW50LCB0aGlzLmFuY2hvcnMuZW5kKVxuICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi4vZG9tLXV0aWxzJylcbiAgLCBkb2MgPSByZXF1aXJlKCcuLi9lbnYnKS5kb2N1bWVudFxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYW5jaG9yOiB0cnVlXG4sIHByaW9yaXR5OiA5MDBcbiwgdGVybWluYWw6IHRydWVcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuXG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgfVxuICAgIHRoaXMucmVtb3ZlKCk7XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICBpZih2YWwpIHtcbiAgICAgIGlmKCF0aGlzLnN0YXRlKSB7IHRoaXMuYWRkKCkgfVxuICAgIH1lbHNle1xuICAgICAgaWYodGhpcy5zdGF0ZSkgeyB0aGlzLnJlbW92ZSgpOyB9XG4gICAgfVxuICAgIHRoaXMuc3RhdGUgPSB2YWw7XG4gIH1cblxuLCBhZGQ6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhbmNob3IgPSB0aGlzLmFuY2hvcnMuZW5kO1xuICAgIGlmKCF0aGlzLndhbGtlZCkge1xuICAgICAgdGhpcy53YWxrZWQgPSB0cnVlO1xuICAgICAgdGhpcy53YXRjaGVycyA9IGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcy52bSwgdGhpcy5mcmFnKTtcbiAgICB9XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICAgIHdhdGNoZXIuX2hpZGUgPSBmYWxzZTtcbiAgICAgIGlmKHdhdGNoZXIuX25lZWRVcGRhdGUpIHtcbiAgICAgICAgd2F0Y2hlci51cGRhdGUoKVxuICAgICAgICB3YXRjaGVyLl9uZWVkVXBkYXRlID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSlcbiAgICBhbmNob3IucGFyZW50Tm9kZSAmJiBhbmNob3IucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5mcmFnLCBhbmNob3IpO1xuICB9XG4sIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpO1xuXG4gICAgZm9yKHZhciBpID0gMCwgbCA9IG5vZGVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgdGhpcy5mcmFnLmFwcGVuZENoaWxkKG5vZGVzW2ldKTtcbiAgICB9XG5cbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci5faGlkZSA9IHRydWU7XG4gICAgfSlcbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgLCBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuLi9jaGVjay1iaW5kaW5nJylcbiAgO1xuXG52YXIgZGlycyA9IHt9O1xuXG5cbmRpcnMudGV4dCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG4gIH1cbn07XG5cblxuZGlycy5odG1sID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHZhciBlbCA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbC5pbm5lckhUTUwgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG5cbiAgICB2YXIgbm9kZTtcbiAgICB3aGlsZShub2RlID0gdGhpcy5ub2Rlcy5wb3AoKSkge1xuICAgICAgbm9kZS5wYXJlbnROb2RlICYmIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9XG5cbiAgICB2YXIgbm9kZXMgPSBlbC5jaGlsZE5vZGVzO1xuICAgIHdoaWxlKG5vZGUgPSBub2Rlc1swXSkge1xuICAgICAgdGhpcy5ub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgdGhpcy5lbC5pbnNlcnRCZWZvcmUobm9kZSwgdGhpcy5ub2RlKTtcbiAgICB9XG4gIH1cbn07XG5cbmRpcnMudGVtcGxhdGUgPSB7XG4gIHByaW9yaXR5OiAxMDAwMFxuLCB3YXRjaDogZmFsc2VcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5lbC5jaGlsZE5vZGVzXG4gICAgICAsIGZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gICAgICA7XG5cbiAgICB3aGlsZShub2Rlc1swXSkge1xuICAgICAgZnJhZy5hcHBlbmRDaGlsZChub2Rlc1swXSk7XG4gICAgfVxuXG4gICAgdGhpcy5lbC5jb250ZW50ID0gZnJhZztcbiAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKHRoaXMubm9kZU5hbWUsICcnKTtcbiAgfVxufTtcblxuLy/lm77niYfnlKgsIOmBv+WFjeWKoOi9vSBVUkwg5Lit5bim5pyJ5aSn5ous5Y+355qE5Y6f5aeL5qih5p2/5YaF5a65XG5kaXJzLnNyYyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbih2YWwpIHtcbiAgICB0aGlzLmVsLnNyYyA9IHZhbDtcbiAgfVxufTtcblxuZGlyc1snd2l0aCddID0ge307XG5cbmRpcnNbJ2lmJ10gPSByZXF1aXJlKCcuL2lmJylcbmRpcnMucmVwZWF0ID0gcmVxdWlyZSgnLi9yZXBlYXQnKTtcbmRpcnMuYXR0ciA9IHJlcXVpcmUoJy4vYXR0cicpO1xuZGlycy5tb2RlbCA9IHJlcXVpcmUoJy4vbW9kZWwnKTtcbmRpcnMuc3R5bGUgPSByZXF1aXJlKCcuL3N0eWxlJyk7XG5kaXJzLm9uID0gcmVxdWlyZSgnLi9vbicpO1xuZGlycy5jb21wb25lbnQgPSBkaXJzLnRhZyA9IHJlcXVpcmUoJy4vY29tcG9uZW50Jyk7XG5kaXJzLmNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQnKVxuZGlycy5yZWYgPSByZXF1aXJlKCcuL3JlZicpXG5kaXJzWydjbGFzcyddID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG5cbm1vZHVsZS5leHBvcnRzID0gZGlycztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy5qcycpXG4gICwgaGFzVG9rZW4gPSByZXF1aXJlKCcuLi90b2tlbi5qcycpLmhhc1Rva2VuXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpXG4gICwgY2hlY2tCaW5kaW5nID0gcmVxdWlyZSgnLi4vY2hlY2stYmluZGluZycpXG4gIDtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtaW5hbDogdHJ1ZVxuLCBwcmlvcml0eTogLTJcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGtleVBhdGggPSB0aGlzLnBhdGg7XG4gICAgdmFyIHZtID0gdGhpcy52bTtcblxuICAgIGlmKCFrZXlQYXRoKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgdmFyIGNvbXAgPSB0aGlzLmVsXG4gICAgICAsIGV2ID0gJ2NoYW5nZSdcbiAgICAgICwgYXR0clxuICAgICAgLCB2YWx1ZSA9IGF0dHIgPSAndmFsdWUnXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQodm0uJGdldChrZXlQYXRoKSkvL+eVjOmdoueahOWIneWni+WAvOS4jeS8muimhuebliBtb2RlbCDnmoTliJ3lp4vlgLxcbiAgICAgICwgY3JsZiA9IC9cXHJcXG4vZy8vSUUgOCDkuIsgdGV4dGFyZWEg5Lya6Ieq5Yqo5bCGIFxcbiDmjaLooYznrKbmjaLmiJAgXFxyXFxuLiDpnIDopoHlsIblhbbmm7/mjaLlm57mnaVcblxuICAgICAgICAvL+abtOaWsOe7hOS7tlxuICAgICAgLCB1cGRhdGUgPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICBpZih2YWwgPT09IDAgJiYgY29tcC50eXBlICE9PSAnY2hlY2tib3gnKSB7IHZhbCA9ICcwJyB9XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gY29tcFthdHRyXVxuICAgICAgICAgICAgO1xuICAgICAgICAgIHZhbCAmJiB2YWwucmVwbGFjZSAmJiAodmFsID0gdmFsLnJlcGxhY2UoY3JsZiwgJ1xcbicpKTtcbiAgICAgICAgICBpZihuZXdWYWwgIT09IHZhbCl7IGNvbXBbYXR0cl0gPSBuZXdWYWw7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8v5pu05pawIHZpZXdNb2RlbFxuICAgICAgLCBoYW5kbGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgdmFyIHZhbCA9IGNvbXBbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgdm0uJHNldChrZXlQYXRoLCB2YWwpO1xuICAgICAgICB9XG4gICAgICAsIGNhbGxIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgIGlmKGUgJiYgZS5wcm9wZXJ0eU5hbWUgJiYgZS5wcm9wZXJ0eU5hbWUgIT09IGF0dHIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgIH1cbiAgICAgICwgaWUgPSB1dGlscy5pZVxuICAgICAgO1xuXG4gICAgaWYoY29tcC5iZWUpIHtcbiAgICAgIC8vIOe7hOS7tueahOWPjOWQkee7keWumlxuICAgICAgY29tcCA9IGNvbXAuYmVlO1xuICAgICAgdmFsdWUgPSBjb21wLiR2YWx1ZWtleTtcbiAgICAgIGlmKHZhbHVlKSB7XG4gICAgICAgIHVwZGF0ZSA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIGNvbXAuJHJlcGxhY2UodmFsdWUsIHZhbClcbiAgICAgICAgfTtcbiAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZtLiRyZXBsYWNlKGtleVBhdGgsIGNvbXAuJGdldCh2YWx1ZSkpXG4gICAgICAgIH1cbiAgICAgICAgY29tcC4kd2F0Y2godmFsdWUsIGZ1bmN0aW9uKHZhbCwgb2xkVmFsdWUpIHtcbiAgICAgICAgICB2YWwgIT09IG9sZFZhbHVlICYmIGhhbmRsZXIoKVxuICAgICAgICB9LCB0cnVlKVxuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgLy/kvJjlhYjop6PmnpDlhoXpg6jlhoXlrrlcbiAgICAgIHZtLl9fbGlua3MgPSB2bS5fX2xpbmtzLmNvbmNhdChjaGVja0JpbmRpbmcud2Fsay5jYWxsKHZtLCBjb21wLmNoaWxkTm9kZXMpKTtcblxuICAgICAgLy9IVE1MIOWOn+eUn+aOp+S7tueahOWPjOWQkee7keWumlxuICAgICAgc3dpdGNoKGNvbXAudGFnTmFtZSkge1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHZhbHVlID0gYXR0ciA9ICdpbm5lckhUTUwnO1xuICAgICAgICAgIC8vZXYgKz0gJyBibHVyJztcbiAgICAgICAgY2FzZSAnSU5QVVQnOlxuICAgICAgICBjYXNlICdURVhUQVJFQSc6XG4gICAgICAgICAgc3dpdGNoKGNvbXAudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxuICAgICAgICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnY2hlY2tlZCc7XG4gICAgICAgICAgICAgIC8vSUU2LCBJRTcg5LiL55uR5ZCsIHByb3BlcnR5Y2hhbmdlIOS8muaMgj9cbiAgICAgICAgICAgICAgaWYoaWUpIHsgZXYgKz0gJyBjbGljayc7IH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAncmFkaW8nOlxuICAgICAgICAgICAgICBhdHRyID0gJ2NoZWNrZWQnO1xuICAgICAgICAgICAgICBpZihpZSkgeyBldiArPSAnIGNsaWNrJzsgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICBjb21wLmNoZWNrZWQgPSBjb21wLnZhbHVlID09PSB2YWwgKyAnJztcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaXNTZXREZWZhdXQgPSBjb21wLmNoZWNrZWQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIGlmKCF2bS4kbGF6eSl7XG4gICAgICAgICAgICAgICAgaWYoJ29uaW5wdXQnIGluIGNvbXApe1xuICAgICAgICAgICAgICAgICAgZXYgKz0gJyBpbnB1dCc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vSUUg5LiL55qEIGlucHV0IOS6i+S7tuabv+S7o1xuICAgICAgICAgICAgICAgIGlmKGllKSB7XG4gICAgICAgICAgICAgICAgICBldiArPSAnIGtleXVwIHByb3BlcnR5Y2hhbmdlIGN1dCc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdTRUxFQ1QnOlxuICAgICAgICAgIGlmKGNvbXAubXVsdGlwbGUpe1xuICAgICAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICB2YXIgdmFscyA9IFtdO1xuICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gY29tcC5vcHRpb25zLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgICAgICAgaWYoY29tcC5vcHRpb25zW2ldLnNlbGVjdGVkKXsgdmFscy5wdXNoKGNvbXAub3B0aW9uc1tpXS52YWx1ZSkgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZtLiRyZXBsYWNlKGtleVBhdGgsIHZhbHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHVwZGF0ZSA9IGZ1bmN0aW9uKHZhbHMpe1xuICAgICAgICAgICAgICBpZih2YWxzICYmIHZhbHMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gY29tcC5vcHRpb25zLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgICAgICAgICBjb21wLm9wdGlvbnNbaV0uc2VsZWN0ZWQgPSB2YWxzLmluZGV4T2YoY29tcC5vcHRpb25zW2ldLnZhbHVlKSAhPT0gLTE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpc1NldERlZmF1dCA9IGlzU2V0RGVmYXV0ICYmICFoYXNUb2tlbihjb21wW3ZhbHVlXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBldi5zcGxpdCgvXFxzKy9nKS5mb3JFYWNoKGZ1bmN0aW9uKGUpe1xuICAgICAgICBldmVudHMucmVtb3ZlRXZlbnQoY29tcCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgICAgICBldmVudHMuYWRkRXZlbnQoY29tcCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgICAgfSk7XG4gICAgICAvL+agueaNruihqOWNleWFg+e0oOeahOWIneWni+WMlum7mOiupOWAvOiuvue9ruWvueW6lCBtb2RlbCDnmoTlgLxcbiAgICAgIGlmKGNvbXBbdmFsdWVdICYmIGlzU2V0RGVmYXV0KXtcbiAgICAgICAgIGhhbmRsZXIoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZSA9IHVwZGF0ZTtcbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+S6i+S7tuebkeWQrFxuXG52YXIgZXZlbnRCaW5kID0gcmVxdWlyZSgnLi4vZXZlbnQtYmluZC5qcycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHN1YjogdHJ1ZVxuLCBwcmlvcml0eTogLTMgLy/kuovku7blupTor6XlnKggYi1tb2RlbCDkuYvlkI7nm5HlkKwuIOmYsuatouaZrumAmuS6i+S7tuiwg+eUqOi/h+W/q1xuLCBpbW1lZGlhdGU6IGZhbHNlIC8vIHdhdGNoIOWSjCBpbW1lZGlhdGUg5ZCM5pe25Li6IGZhbHNlIOaXtiwg5oyH5Luk55qEIHVwZGF0ZSDmlrnms5XlsIbkuI3kvJroh6rliqjooqvlpJbpg6josIPnlKhcbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRpciA9IHRoaXM7XG4gICAgaWYodGhpcy5zdWJUeXBlKXtcbiAgICAgIC8vIGJlLW9uLWNsaWNrIOetiVxuICAgICAgZXZlbnRCaW5kLmFkZEV2ZW50KHRoaXMuZWwsIHRoaXMuc3ViVHlwZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGRpci52bS4kZ2V0KGRpci5wYXRoKVxuICAgICAgfSlcbiAgICB9ZWxzZXtcbiAgICAgIC8vbGluayDmlrnms5XnmoTosIPnlKjlnKggd2F0Y2hlciDmo4DmtYsgaW1tZWRpYXRlIOS5i+WJjSxcbiAgICAgIC8v5omA5Lul5Y+v5Lul5Zyo6L+Z6YeM5bCGIGltbWVkaWF0ZSDnva7kuLogdHJ1ZSDku6Xkvr/oh6rliqjosIPnlKggdXBkYXRlIOaWueazlVxuICAgICAgdGhpcy5pbW1lZGlhdGUgPSB0cnVlO1xuICAgICAgLy90aGlzLnVwZGF0ZSh0aGlzLnZtLiRnZXQodGhpcy5wYXRoKSlcbiAgICB9XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3Rvci5zaGlmdCgpO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5qb2luKCcgJyk7XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG4vL+imgeaxgiBJRTgrXG4vL+ivt+azqOaEj+i/memHjOeahCBldmVudC5jdXJyZW50VGFyZ2V0IOWSjCBldmVudC5kZWxlZ2F0ZVRhcmdldCDlkIwgalF1ZXJ5IOeahOWImuWlveebuOWPjVxuZnVuY3Rpb24gY2FsbEhhbmRsZXIgKGRpciwgc2VsZWN0b3IsIGNhbGxiYWNrKSB7XG4gIHJldHVybiBmdW5jdGlvbihlKSB7XG4gICAgdmFyIGN1ciA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICB2YXIgZWxzID0gc2VsZWN0b3IgPyB1dGlscy50b0FycmF5KGRpci5lbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkgOiBbY3VyXTtcbiAgICBkb3tcbiAgICAgIGlmKGVscy5pbmRleE9mKGN1cikgPj0gMCkge1xuICAgICAgICBlLmRlbGVnYXRlVGFyZ2V0ID0gY3VyOy8v5aeU5omY5YWD57SgXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKGRpci52bSwgZSlcbiAgICAgIH1cbiAgICB9d2hpbGUoY3VyID0gY3VyLnBhcmVudE5vZGUpXG4gIH1cbn1cbiIsIlxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2F0Y2g6IGZhbHNlXG4sIHByaW9yaXR5OiAtMiAvLyByZWYg5bqU6K+l5ZyoIGNvbXBvbmVudCDkuYvlkI5cbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih1dGlscy5pc0FycmF5KHRoaXMucmVmKSkge1xuICAgICAgdGhpcy5yZWYuc3BsaWNlKHRoaXMudm0uJGluZGV4LCAxKVxuICAgIH1lbHNle1xuICAgICAgdGhpcy52bS4kcmVmc1t0aGlzLnBhdGhdID0gbnVsbDtcbiAgICB9XG4gIH1cbiwgbGluazogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZtID0gdGhpcy52bVxuICAgIC8v5ZyoIGByZXBlYXRgIOWFg+e0oOS4iueahCBgcmVmYCDkvJrmjIflkJHljL/lkI0gYHZpZXdtb2RlbGBcbiAgICBpZih2bS5fX3JlcGVhdCl7XG4gICAgICBpZighdm0uJGluZGV4KSB7XG4gICAgICAgIHZtLiRwYXJlbnQuJHJlZnNbdGhpcy5wYXRoXSA9IFtdO1xuICAgICAgfVxuICAgICAgdGhpcy5yZWYgPSB2bS4kcGFyZW50LiRyZWZzW3RoaXMucGF0aF1cbiAgICAgIHRoaXMucmVmW3ZtLiRpbmRleF0gPSB2bTtcbiAgICB9ZWxzZXtcbiAgICAgIHZtLiRyZWZzW3RoaXMucGF0aF0gPSB0aGlzLmVsLmJlZSB8fCB0aGlzLmVsO1xuICAgIH1cbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIHNjb3BlID0gcmVxdWlyZSgnLi4vc2NvcGUnKVxuICA7XG5cbi8v6L+Z5Lqb5pWw57uE5pON5L2c5pa55rOV6KKr6YeN5YaZ5oiQ6Ieq5Yqo6Kem5Y+R5pu05pawXG52YXIgYXJyYXlNZXRob2RzID0gWydzcGxpY2UnLCAncHVzaCcsICdwb3AnLCAnc2hpZnQnLCAndW5zaGlmdCcsICdzb3J0JywgJ3JldmVyc2UnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAxMDAwXG4sIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCB1bkxpbms6IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy52bUxpc3QuZm9yRWFjaChmdW5jdGlvbih2bSl7XG4gICAgICB2bS4kZGVzdHJveSgpXG4gICAgfSlcbiAgfVxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgQmVlID0gcmVxdWlyZSgnLi4vYmVlJylcblxuICAgIHRoaXMudHJhY2tJZCA9IHRoaXMuZWwuZ2V0QXR0cmlidXRlKCd0cmFjay1ieScpXG4gICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoJ3RyYWNrLWJ5JylcblxuICAgIC8v5Yib5bu6IHJlcGVhdCDnmoTljL/lkI3mnoTpgKDlh73mlbBcbiAgICAvL+e7p+aJv+eItuaehOmAoOWHveaVsOeahCBgZGlyZWN0aXZlcywgY29tcG9uZW50cywgZmlsdGVyc2Ag5bGe5oCnXG4gICAgdGhpcy5jc3RyID0gQmVlLmV4dGVuZCh7fSwgdGhpcy52bS5jb25zdHJ1Y3RvcilcblxuICAgIC8v6buY6K6k5pWw5o2u5LiN5bqU57un5om/XG4gICAgdGhpcy5jc3RyLmRlZmF1bHRzID0ge307XG5cbiAgICB0aGlzLmN1ckFyciA9IFtdO1xuICAgIHRoaXMudm1MaXN0ID0gW107Ly/lrZAgVk0gbGlzdFxuXG4gICAgaWYodGhpcy5lbC5jb250ZW50KSB7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsLmNvbnRlbnQ7XG4gICAgICB0aGlzLmlzUmFuZ2UgPSB0cnVlXG4gICAgfWVsc2V7XG4gICAgICB0aGlzLmZyYWcgPSB0aGlzLmVsO1xuICAgIH1cbiAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gIH1cbiwgdXBkYXRlOiBmdW5jdGlvbihpdGVtcykge1xuICAgIHZhciBjdXJBcnIgPSB0aGlzLmN1ckFycjtcbiAgICB2YXIgcGFyZW50Tm9kZSA9IHRoaXMuYW5jaG9ycy5lbmQucGFyZW50Tm9kZTtcbiAgICB2YXIgdGhhdCA9IHRoaXMsIHZtTGlzdCA9IHRoaXMudm1MaXN0O1xuICAgIHZhciB0cmFja0lkID0gdGhpcy50cmFja0lkO1xuXG4gICAgLy9UT0RPIOWwhuaVsOe7hOS/rumlsOenu+iHs+aJgOacieihqOi+vuW8j+S4rVxuICAgIHZhciBhcnJzID0gW107IC8vcmVwZWF0IOihqOi+vuW8j+S4reWHuueOsOeahOaVsOe7hFxuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcbiAgICAgIC8vIOWcqCByZXBlYXQg5oyH5Luk6KGo6L6+5byP5Lit55u45YWz5Y+Y6YePXG4gICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5zdW1tYXJ5LnBhdGhzLmZpbHRlcihmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgIHJldHVybiAhdXRpbHMuaXNGdW5jdGlvbih0aGF0LnZtLiRnZXQocGF0aCkpXG4gICAgICB9KTtcblxuICAgICAgLy/liKDpmaTlhYPntKBcbiAgICAgIGFyckRpZmYoY3VyQXJyLCBpdGVtcywgdHJhY2tJZCkuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgIHZhciBwb3MgPSBpbmRleEJ5VHJhY2tJZChpdGVtLCBjdXJBcnIsIHRyYWNrSWQpXG4gICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAxKVxuXG4gICAgICAgIGlmKHRoYXQuaXNSYW5nZSkge1xuICAgICAgICAgIGdldE5vZGVzQnlJbmRleCh0aGF0LCBwb3MpLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodm1MaXN0W3Bvc10uJGVsKVxuICAgICAgICB9XG4gICAgICAgIHZtTGlzdFtwb3NdLiRkZXN0cm95KClcbiAgICAgICAgdm1MaXN0LnNwbGljZShwb3MsIDEpXG4gICAgICB9KVxuXG4gICAgICBpdGVtcy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0sIGkpIHtcbiAgICAgICAgdmFyIHBvcyA9IGluZGV4QnlUcmFja0lkKGl0ZW0sIGl0ZW1zLCB0cmFja0lkLCBpKVxuICAgICAgICAgICwgb2xkUG9zID0gaW5kZXhCeVRyYWNrSWQoaXRlbSwgY3VyQXJyLCB0cmFja0lkLCBpKVxuICAgICAgICAgICwgdm0sIGVsLCBhbmNob3JcbiAgICAgICAgICA7XG5cbiAgICAgICAgLy/mlrDlop7lhYPntKBcbiAgICAgICAgaWYob2xkUG9zIDwgMCkge1xuXG4gICAgICAgICAgZWwgPSB0aGlzLmZyYWcuY2xvbmVOb2RlKHRydWUpXG5cbiAgICAgICAgICBpZih0aGlzLmlzUmFuZ2UpIHtcbiAgICAgICAgICAgIGFuY2hvciA9IGRvYy5jcmVhdGVDb21tZW50KCcnKVxuICAgICAgICAgICAgZWwuY2hpbGROb2Rlcy5sZW5ndGggPyBlbC5pbnNlcnRCZWZvcmUoYW5jaG9yLCBlbC5jaGlsZE5vZGVzWzBdKSA6IGVsLmFwcGVuZENoaWxkKGFuY2hvcilcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2bSA9IG5ldyB0aGlzLmNzdHIoZWwsIHtcbiAgICAgICAgICAgICRkYXRhOiBpdGVtLFxuICAgICAgICAgICAgJGluZGV4OiBwb3MsXG4gICAgICAgICAgICAkcm9vdDogdGhpcy52bS4kcm9vdCxcbiAgICAgICAgICAgICRwYXJlbnQ6IHRoaXMudm0sXG4gICAgICAgICAgICBfYXNzaWdubWVudHM6IHRoaXMuc3VtbWFyeS5hc3NpZ25tZW50cyxcbiAgICAgICAgICAgIF9fcmVwZWF0OiB0cnVlLFxuICAgICAgICAgICAgX19hbmNob3I6IGFuY2hvclxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodm0uJGVsLCBnZXRBbmNob3IodGhhdCwgcG9zKSlcbiAgICAgICAgICB2bUxpc3Quc3BsaWNlKHBvcywgMCwgdm0pO1xuICAgICAgICAgIGN1ckFyci5zcGxpY2UocG9zLCAwLCBpdGVtKVxuXG4gICAgICAgICAgLy/lu7bml7botYvlgLznu5kgYF9yZWxhdGl2ZVBhdGhgLCDpgb/lhY3lh7rnjrDmrbvlvqrnjq9cbiAgICAgICAgICAvL+WmguaenOWcqOS4iumdouWunuS+i+WMluaXtuW9k+WPguaVsOS8oOWFpSwg5Lya5YaS5rOh5Yiw54i257qnIHZtIOmAkuW9kuiwg+eUqOi/memHjOeahCB1cGRhdGUg5pa55rOVLCDpgKDmiJDmrbvlvqrnjq8uXG4gICAgICAgICAgdm0uX3JlbGF0aXZlUGF0aCA9IHRoaXMubGlzdFBhdGg7XG4gICAgICAgIH1lbHNlIHtcblxuICAgICAgICAgIC8v6LCD5bqPXG4gICAgICAgICAgaWYgKHBvcyAhPT0gb2xkUG9zKSB7XG5cbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGdldEVsQnlJbmRleCh0aGF0LCBvbGRQb3MpLCBnZXRBbmNob3IodGhhdCwgcG9zKSlcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGdldEVsQnlJbmRleCh0aGF0LCBwb3MpLCBnZXRBbmNob3IodGhhdCwgb2xkUG9zICsgMSkpXG5cbiAgICAgICAgICAgIHZtTGlzdFtvbGRQb3NdID0gW3ZtTGlzdFtwb3NdLCB2bUxpc3RbcG9zXSA9IHZtTGlzdFtvbGRQb3NdXVswXVxuICAgICAgICAgICAgY3VyQXJyW29sZFBvc10gPSBbY3VyQXJyW3Bvc10sIGN1ckFycltwb3NdID0gY3VyQXJyW29sZFBvc11dWzBdXG4gICAgICAgICAgICB2bUxpc3RbcG9zXS4kaW5kZXggPSBwb3NcbiAgICAgICAgICAgIHZtTGlzdFtwb3NdLiR1cGRhdGUoJyRpbmRleCcpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpXG5cbiAgICAgIC8v5pu05paw57Si5byVXG4gICAgICB2bUxpc3QuZm9yRWFjaChmdW5jdGlvbih2bSwgaSkge1xuICAgICAgICB2bS4kaW5kZXggPSBpXG4gICAgICAgIHZtLiRlbC4kaW5kZXggPSBpXG4gICAgICAgIHZtLiR1cGRhdGUoJyRpbmRleCcsIGZhbHNlKVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbihsb2NhbEtleSkge1xuICAgICAgICB2YXIgbG9jYWwgPSB0aGF0LnZtLiRnZXQobG9jYWxLZXkpXG4gICAgICAgIHV0aWxzLmlzQXJyYXkobG9jYWwpICYmIGFycnMucHVzaChsb2NhbClcbiAgICAgIH0pXG4gICAgICBhcnJzLnB1c2goaXRlbXMpXG4gICAgICBhcnJzLmZvckVhY2goZnVuY3Rpb24obG9jYWwpIHtcbiAgICAgICAgdmFyIGRpcnMgPSBsb2NhbC5fX2RpcnNfXztcblxuICAgICAgICBpZighZGlycyl7XG4gICAgICAgICAgLy/mlbDnu4Tmk43kvZzmlrnms5VcbiAgICAgICAgICB1dGlscy5leHRlbmQobG9jYWwsIHtcbiAgICAgICAgICAgICRzZXQ6IGZ1bmN0aW9uKGksIGl0ZW0pIHtcbiAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEsIHV0aWxzLmlzT2JqZWN0KGl0ZW0pID8gdXRpbHMuZXh0ZW5kKHt9LCBsb2NhbFtpXSwgaXRlbSkgOiBpdGVtKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICRyZXBsYWNlOiBmdW5jdGlvbihpLCBpdGVtKSB7XG4gICAgICAgICAgICAgIGxvY2FsLnNwbGljZShpLCAxLCBpdGVtKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICRyZW1vdmU6IGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgICAgICAgbG9jYWwuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFycmF5TWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgICAgICAgICAgbG9jYWxbbWV0aG9kXSA9IHV0aWxzLmFmdGVyRm4obG9jYWxbbWV0aG9kXSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbihkaXIpIHtcbiAgICAgICAgICAgICAgICBkaXIubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVmb3JtZWQgPSBzY29wZS5yZWZvcm1TY29wZShkaXIudm0sIHBhdGgpXG4gICAgICAgICAgICAgICAgICByZWZvcm1lZC52bS4kdXBkYXRlKHJlZm9ybWVkLnBhdGgpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgZGlycyA9IGxvY2FsLl9fZGlyc19fICA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIC8v5LiA5Liq5pWw57uE5aSa5aSE5L2/55SoXG4gICAgICAgIC8vVE9ETyDnp7vpmaTml7bnmoTmg4XlhrVcbiAgICAgICAgaWYoZGlycy5pbmRleE9mKHRoYXQpID09PSAtMSkge1xuICAgICAgICAgIGRpcnMucHVzaCh0aGF0KVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgfWVsc2V7XG4gICAgICAvL1RPRE8g5pmu6YCa5a+56LGh55qE6YGN5Y6GXG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBnZXRBbmNob3IoZGlyLCBpbmRleCkge1xuICB2YXIgdm0gPSBkaXIudm1MaXN0W2luZGV4XVxuICByZXR1cm4gdm0gPyAoIGRpci5pc1JhbmdlID8gdm0uX19hbmNob3IgOiB2bS4kZWwgKSA6IGRpci5hbmNob3JzLmVuZFxufVxuXG4vL+agueaNrue0ouW8leiOt+WPluivpeasoei/reS7o+S4reeahOaJgOacieWFg+e0oFxuZnVuY3Rpb24gZ2V0Tm9kZXNCeUluZGV4KGRpciwgaW5kZXgpIHtcbiAgdmFyIHZtTGlzdCA9IGRpci52bUxpc3RcbiAgICAsIGFuY2hvciA9IHZtTGlzdFtpbmRleF0uX19hbmNob3JcbiAgICAsIG5leHQgPSB2bUxpc3RbaW5kZXggKyAxXVxuICAgIDtcbiAgcmV0dXJuIFthbmNob3JdLmNvbmNhdChkaXIuZ2V0Tm9kZXMoYW5jaG9yLCBuZXh0ICYmIG5leHQuX19hbmNob3IpKVxufVxuXG5mdW5jdGlvbiBnZXRFbEJ5SW5kZXggKGRpciwgaW5kZXgpIHtcbiAgdmFyIGZyYWcgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpXG4gIGlmKGRpci5pc1JhbmdlKSB7XG4gICAgZ2V0Tm9kZXNCeUluZGV4KGRpciwgaW5kZXgpLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgZnJhZy5hcHBlbmRDaGlsZChub2RlKVxuICAgIH0pXG4gIH1lbHNle1xuICAgIGZyYWcuYXBwZW5kQ2hpbGQoZGlyLnZtTGlzdFtpbmRleF0uJGVsKVxuICB9XG4gIHJldHVybiBmcmFnXG59XG5cbmZ1bmN0aW9uIGFyckRpZmYoYXJyMSwgYXJyMiwgdHJhY2tJZCkge1xuICB2YXIgYXJyMkNvcHkgPSBhcnIyLnNsaWNlKCk7XG4gIHJldHVybiBhcnIxLmZpbHRlcihmdW5jdGlvbihlbCkge1xuICAgIHZhciByZXN1bHQsIGluZGV4ID0gaW5kZXhCeVRyYWNrSWQoZWwsIGFycjJDb3B5LCB0cmFja0lkKVxuICAgIGlmKGluZGV4IDwgMCkge1xuICAgICAgcmVzdWx0ID0gdHJ1ZVxuICAgIH1lbHNle1xuICAgICAgYXJyMkNvcHkuc3BsaWNlKGluZGV4LCAxKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGluZGV4QnlUcmFja0lkKGl0ZW0sIGxpc3QsIHRyYWNrSWQsIHN0YXJ0SW5kZXgpIHtcbiAgc3RhcnRJbmRleCA9IHN0YXJ0SW5kZXggfHwgMDtcbiAgdmFyIGluZGV4ID0gbGlzdC5pbmRleE9mKGl0ZW0sIHN0YXJ0SW5kZXgpO1xuICBpZihpbmRleCA9PT0gLTEgJiYgdHJhY2tJZCl7XG4gICAgZm9yKHZhciBpID0gc3RhcnRJbmRleCwgaXRlbTE7IGl0ZW0xID0gbGlzdFtpXTsgaSsrKSB7XG4gICAgICBpZihpdGVtW3RyYWNrSWRdID09PSAgaXRlbTFbdHJhY2tJZF0gJiYgIXV0aWxzLmlzVW5kZWZpbmVkKGl0ZW1bdHJhY2tJZF0pKXtcbiAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGluZGV4O1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5qC35byP5oyH5LukXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG5cbi8v6buY6K6k5Y2V5L2N5Li6IHB4IOeahOWxnuaAp1xudmFyIHBpeGVsQXR0cnMgPSBbXG4gICd3aWR0aCcsJ2hlaWdodCcsJ21pbi13aWR0aCcsICdtaW4taGVpZ2h0JywgJ21heC13aWR0aCcsICdtYXgtaGVpZ2h0JyxcbiAgJ21hcmdpbicsICdtYXJnaW4tdG9wJywgJ21hcmdpbi1yaWdodCcsICdtYXJnaW4tbGVmdCcsICdtYXJnaW4tYm90dG9tJyxcbiAgJ3BhZGRpbmcnLCAncGFkZGluZy10b3AnLCAncGFkZGluZy1yaWdodCcsICdwYWRkaW5nLWJvdHRvbScsICdwYWRkaW5nLWxlZnQnLFxuICAndG9wJywgJ2xlZnQnLCAncmlnaHQnLCAnYm90dG9tJ1xuXVxuXG4vL+WvueS6jiBJRTYsIElFNyDmtY/op4jlmajpnIDopoHkvb/nlKggYGVsLnN0eWxlLmdldEF0dHJpYnV0ZSgnY3NzVGV4dCcpYCDkuI4gYGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcpYCDmnaXor7vlhpkgc3R5bGUg5a2X56ym5bGe5oCnXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmluaXRTdHlsZSA9IHRoaXMuZWwuc3R5bGUuZ2V0QXR0cmlidXRlID8gdGhpcy5lbC5zdHlsZS5nZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnKSA6IHRoaXMuZWwuZ2V0QXR0cmlidXRlKCdzdHlsZScpXG4gIH0sXG4gIHVwZGF0ZTogZnVuY3Rpb24oc3R5bGVzKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgc3R5bGVTdHIgPSB0aGlzLmluaXRTdHlsZSA/IHRoaXMuaW5pdFN0eWxlLnJlcGxhY2UoLzs/JC8sICc7JykgOiAnJztcbiAgICB2YXIgZGFzaEtleSwgdmFsO1xuXG4gICAgaWYodHlwZW9mIHN0eWxlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHN0eWxlU3RyICs9IHN0eWxlcztcbiAgICB9ZWxzZSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gc3R5bGVzKSB7XG4gICAgICAgIHZhbCA9IHN0eWxlc1trZXldO1xuXG4gICAgICAgIC8vbWFyZ2luVG9wIC0+IG1hcmdpbi10b3AuIOmpvOWzsOi9rOi/nuaOpeespuW8j1xuICAgICAgICBkYXNoS2V5ID0gdXRpbHMuY2FtZWxUb0h5cGhlbihrZXkpO1xuXG4gICAgICAgIGlmIChwaXhlbEF0dHJzLmluZGV4T2YoZGFzaEtleSkgPj0gMCAmJiB1dGlscy5pc051bWVyaWModmFsKSkge1xuICAgICAgICAgIHZhbCArPSAncHgnO1xuICAgICAgICB9XG4gICAgICAgIGlmKCF1dGlscy5pc1VuZGVmaW5lZCh2YWwpKXtcbiAgICAgICAgICBzdHlsZVN0ciArPSBkYXNoS2V5ICsgJzogJyArIHZhbCArICc7ICc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYoZWwuc3R5bGUuc2V0QXR0cmlidXRlKXtcbiAgICAgIC8v6ICBIElFXG4gICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCBzdHlsZVN0cik7XG4gICAgfWVsc2V7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGUoJ3N0eWxlJywgc3R5bGVTdHIpO1xuICAgIH1cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAvL+Wwhuaooeadvy/lhYPntKAvbm9kZWxpc3Qg5YyF6KO55ZyoIGZyYWdtZW50IOS4rVxuICBjcmVhdGVDb250ZW50OiBmdW5jdGlvbiBjcmVhdGVDb250ZW50KHRwbCkge1xuICAgIHZhciBjb250ZW50ID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgICB2YXIgd3JhcGVyO1xuICAgIHZhciBub2RlcyA9IFtdO1xuICAgIGlmKHV0aWxzLmlzT2JqZWN0KHRwbCkpIHtcbiAgICAgIGlmKHRwbC5ub2RlTmFtZSAmJiB0cGwubm9kZVR5cGUpIHtcbiAgICAgICAgLy9kb20g5YWD57SgXG4gICAgICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQodHBsKTtcbiAgICAgIH1lbHNlIGlmKCdsZW5ndGgnIGluIHRwbCl7XG4gICAgICAgIC8vbm9kZWxpc3RcbiAgICAgICAgbm9kZXMgPSB0cGw7XG4gICAgICB9XG4gICAgfWVsc2Uge1xuICAgICAgd3JhcGVyID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG4gICAgICAvL+iHquWumuS5ieagh+etvuWcqCBJRTgg5LiL5peg5pWILiDkvb/nlKggY29tcG9uZW50IOaMh+S7pOabv+S7o1xuICAgICAgd3JhcGVyLmlubmVySFRNTCA9ICh0cGwgKyAnJykudHJpbSgpO1xuICAgICAgbm9kZXMgPSB3cmFwZXIuY2hpbGROb2RlcztcbiAgICB9XG4gICAgd2hpbGUobm9kZXNbMF0pIHtcbiAgICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQobm9kZXNbMF0pXG4gICAgfVxuICAgIHJldHVybiBjb250ZW50O1xuICB9LFxuXG4gIC8v6I635Y+W5YWD57Sg5bGe5oCnXG4gIGdldEF0dHJzOiBmdW5jdGlvbihlbCkge1xuICAgIHZhciBhdHRyaWJ1dGVzID0gZWwuYXR0cmlidXRlcztcbiAgICB2YXIgYXR0cnMgPSB7fTtcblxuICAgIGZvcih2YXIgaSA9IGF0dHJpYnV0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIC8v6L+e5o6l56ym6L2s6am85bOw5YaZ5rOVXG4gICAgICBhdHRyc1t1dGlscy5oeXBoZW5Ub0NhbWVsKGF0dHJpYnV0ZXNbaV0ubm9kZU5hbWUpXSA9IGF0dHJpYnV0ZXNbaV0udmFsdWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF0dHJzO1xuICB9LFxuXG4gIGhhc0F0dHI6IGZ1bmN0aW9uKGVsLCBhdHRyTmFtZSkge1xuICAgIHJldHVybiBlbC5oYXNBdHRyaWJ1dGUgPyBlbC5oYXNBdHRyaWJ1dGUoYXR0ck5hbWUpIDogIXV0aWxzLmlzVW5kZWZpbmVkKGVsW2F0dHJOYW1lXSk7XG4gIH1cbn07XG4iLCIoZnVuY3Rpb24ocm9vdCl7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGV4cG9ydHMucm9vdCA9IHJvb3Q7XG4gIGV4cG9ydHMuZG9jdW1lbnQgPSByb290LmRvY3VtZW50IHx8IHJlcXVpcmUoJ2pzZG9tJykuanNkb20oKTtcblxufSkoKGZ1bmN0aW9uKCkge3JldHVybiB0aGlzfSkoKSk7XG4iLCIvKipcbiAqIOihqOi+vuW8j+aJp+ihjFxuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgc2NvcGUgPSByZXF1aXJlKCcuL3Njb3BlJylcblxudmFyIG9wZXJhdG9ycyA9IHtcbiAgJ3VuYXJ5Jzoge1xuICAgICcrJzogZnVuY3Rpb24odikgeyByZXR1cm4gK3Y7IH1cbiAgLCAnLSc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuIC12OyB9XG4gICwgJyEnOiBmdW5jdGlvbih2KSB7IHJldHVybiAhdjsgfVxuXG4gICwgJ1snOiBmdW5jdGlvbih2KXsgcmV0dXJuIHY7IH1cbiAgLCAneyc6IGZ1bmN0aW9uKHYpe1xuICAgICAgdmFyIHIgPSB7fTtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSB2Lmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICByW3ZbaV1bMF1dID0gdltpXVsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByO1xuICAgIH1cbiAgLCAndHlwZW9mJzogZnVuY3Rpb24odil7IHJldHVybiB0eXBlb2YgdjsgfVxuICAsICduZXcnOiBmdW5jdGlvbih2KXsgcmV0dXJuIG5ldyB2IH1cbiAgfVxuXG4sICdiaW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICsgcjsgfVxuICAsICctJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAtIHI7IH1cbiAgLCAnKic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKiByOyB9XG4gICwgJy8nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC8gcjsgfVxuICAsICclJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAlIHI7IH1cbiAgLCAnPCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPCByOyB9XG4gICwgJz4nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID4gcjsgfVxuICAsICc8PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPD0gcjsgfVxuICAsICc+PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPj0gcjsgfVxuICAsICc9PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT0gcjsgfVxuICAsICchPSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgIT0gcjsgfVxuICAsICc9PT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID09PSByOyB9XG4gICwgJyE9PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgIT09IHI7IH1cbiAgLCAnJiYnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICYmIHI7IH1cbiAgLCAnfHwnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIHx8IHI7IH1cbiAgLCAnLCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwsIHI7IH1cblxuICAsICcuJzogZnVuY3Rpb24obCwgcikge1xuICAgICAgdmFyIHByZXYgPSB0aGlzLmZpcnN0O1xuICAgICAgLy/mjpLpmaQgYVtiXS5jIOi/meenjeaDheWGtVxuICAgICAgaWYociAmJiBwYXRoICYmICEocHJldi5hcml0eSA9PT0gJ2JpbmFyeScgJiYgcHJldi52YWx1ZSA9PT0gJ1snKSl7XG4gICAgICAgIHBhdGggPSBwYXRoICsgJy4nICsgcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsW3JdO1xuICAgIH1cbiAgLCAnWyc6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKHR5cGVvZiByICE9PSAndW5kZWZpbmVkJyAmJiBwYXRoKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuXG4gICAgLy9UT0RPIOaooeadv+S4reaWueazleeahCB0aGlzIOW6lOivpeaMh+WQkSByb290XG4gICwgJygnOiBmdW5jdGlvbihsLCByKXsgcmV0dXJuIGwuYXBwbHkocm9vdCwgcikgfVxuICAgIC8vZmlsdGVyLiBuYW1lfGZpbHRlclxuICAsICd8JzogZnVuY3Rpb24obCwgcil7IHJldHVybiBjYWxsRmlsdGVyKGwsIHIsIFtdKSB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgcmV0dXJuIGwgPT09IERhdGUgPyBuZXcgRnVuY3Rpb24oJ3JldHVybiBuZXcgRGF0ZSgnICsgci5qb2luKCcsICcpICsgJyknKSgpIDogbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShsLCByKSk7XG4gICAgfVxuXG4gICwgJ2luJzogZnVuY3Rpb24obCwgcil7XG4gICAgICBpZih0aGlzLnJlcGVhdCkge1xuICAgICAgICAvL3JlcGVhdFxuICAgICAgICByZXR1cm4gcjtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm4gbCBpbiByO1xuICAgICAgfVxuICAgIH1cbiAgLCAnY2F0Y2hieSc6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKGxbJ2NhdGNoJ10pIHtcbiAgICAgICAgcmV0dXJuIGxbJ2NhdGNoJ10oci5iaW5kKHJvb3QpKVxuICAgICAgfWVsc2V7XG4gICAgICAgIHN1bW1hcnlDYWxsIHx8IGNvbnNvbGUuZXJyb3IoJ2NhdGNoYnkgZXhwZWN0IGEgcHJvbWlzZScpXG4gICAgICAgIHJldHVybiBsO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4sICd0ZXJuYXJ5Jzoge1xuICAgICc/JzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZiA/IHMgOiB0OyB9XG4gICwgJygnOiBmdW5jdGlvbihmLCBzLCB0KSB7IHJldHVybiBmW3NdLmFwcGx5KGYsIHQpIH1cblxuICAgIC8vZmlsdGVyLiBuYW1lIHwgZmlsdGVyIDogYXJnMiA6IGFyZzNcbiAgLCAnfCc6IGZ1bmN0aW9uKGYsIHMsIHQpeyByZXR1cm4gY2FsbEZpbHRlcihmLCBzLCB0KSB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGNhbGxGaWx0ZXIoYXJnLCBmaWx0ZXIsIGFyZ3MpIHtcbiAgaWYoYXJnICYmIGFyZy50aGVuKSB7XG4gICAgcmV0dXJuIGFyZy50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiBmaWx0ZXIuYXBwbHkocm9vdCwgW2RhdGFdLmNvbmNhdChhcmdzKSlcbiAgICB9KTtcbiAgfWVsc2V7XG4gICAgcmV0dXJuIGZpbHRlci5hcHBseShyb290LCBbYXJnXS5jb25jYXQoYXJncykpXG4gIH1cbn1cblxudmFyIGFyZ05hbWUgPSBbJ2ZpcnN0JywgJ3NlY29uZCcsICd0aGlyZCddXG4gICwgY29udGV4dCwgc3VtbWFyeSwgc3VtbWFyeUNhbGxcbiAgLCBwYXRoXG4gICwgc2VsZlxuICAsIHJvb3RcbiAgO1xuXG4vL+mBjeWOhiBhc3RcbnZhciBldmFsdWF0ZSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgdmFyIGFyaXR5ID0gdHJlZS5hcml0eVxuICAgICwgdmFsdWUgPSB0cmVlLnZhbHVlXG4gICAgLCBhcmdzID0gW11cbiAgICAsIG4gPSAwXG4gICAgLCBhcmdcbiAgICAsIHJlc1xuICAgIDtcblxuICAvL+aTjeS9nOespuacgOWkmuWPquacieS4ieWFg1xuICBmb3IoOyBuIDwgMzsgbisrKXtcbiAgICBhcmcgPSB0cmVlW2FyZ05hbWVbbl1dO1xuICAgIGlmKGFyZyl7XG4gICAgICBpZihBcnJheS5pc0FycmF5KGFyZykpe1xuICAgICAgICBhcmdzW25dID0gW107XG4gICAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBhcmcubGVuZ3RoOyBpIDwgbDsgaSsrKXtcbiAgICAgICAgICBhcmdzW25dLnB1c2godHlwZW9mIGFyZ1tpXS5rZXkgPT09ICd1bmRlZmluZWQnID9cbiAgICAgICAgICAgIGV2YWx1YXRlKGFyZ1tpXSkgOiBbYXJnW2ldLmtleSwgZXZhbHVhdGUoYXJnW2ldKV0pO1xuICAgICAgICB9XG4gICAgICB9ZWxzZXtcbiAgICAgICAgYXJnc1tuXSA9IGV2YWx1YXRlKGFyZyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYoYXJpdHkgIT09ICdsaXRlcmFsJykge1xuICAgIGlmKHBhdGggJiYgdmFsdWUgIT09ICcuJyAmJiB2YWx1ZSAhPT0gJ1snKSB7XG4gICAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYoYXJpdHkgPT09ICduYW1lJykge1xuICAgICAgcGF0aCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHN3aXRjaChhcml0eSl7XG4gICAgY2FzZSAndW5hcnknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAndGVybmFyeSc6XG4gICAgICB0cnl7XG4gICAgICAgIHJlcyA9IGdldE9wZXJhdG9yKGFyaXR5LCB2YWx1ZSkuYXBwbHkodHJlZSwgYXJncyk7XG4gICAgICB9Y2F0Y2goZSl7XG4gICAgICAgIC8vc3VtbWFyeUNhbGwgfHwgY29uc29sZS53YXJuKGUpO1xuICAgICAgfVxuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2xpdGVyYWwnOlxuICAgICAgcmVzID0gdmFsdWU7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAncmVwZWF0JzpcbiAgICAgIHN1bW1hcnkuYXNzaWdubWVudHNbdmFsdWVdID0gdHJ1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICduYW1lJzpcbiAgICAgIHJlcyA9IGdldFZhbHVlKHZhbHVlLCBjb250ZXh0LmxvY2Fscyk7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnZmlsdGVyJzpcbiAgICAgIHN1bW1hcnkuZmlsdGVyc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gY29udGV4dC5maWx0ZXJzW3ZhbHVlXTtcbiAgICBicmVhaztcbiAgICBjYXNlICd0aGlzJzpcbiAgICAgIHJlcyA9IGNvbnRleHQubG9jYWxzO1xuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpe1xuICByZXR1cm4gb3BlcmF0b3JzW2FyaXR5XVt2YWx1ZV0gfHwgZnVuY3Rpb24oKSB7IHJldHVybjsgfVxufVxuXG5mdW5jdGlvbiByZXNldChzY29wZSwgdGhhdCkge1xuICBzdW1tYXJ5Q2FsbCA9IHRydWU7XG4gIGlmKHNjb3BlKSB7XG4gICAgcm9vdCA9IHNjb3BlLiRyb290O1xuICAgIHN1bW1hcnlDYWxsID0gZmFsc2U7XG4gICAgY29udGV4dCA9IHtsb2NhbHM6IHNjb3BlIHx8IHt9LCBmaWx0ZXJzOiBzY29wZS5jb25zdHJ1Y3Rvci5maWx0ZXJzIHx8IHt9fTtcbiAgfWVsc2V7XG4gICAgY29udGV4dCA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fX07XG4gIH1cbiAgaWYodGhhdCl7XG4gICAgc2VsZiA9IHRoYXQ7XG4gIH1cblxuICBzdW1tYXJ5ID0ge2ZpbHRlcnM6IHt9LCBwYXRoczoge30sIGFzc2lnbm1lbnRzOiB7fX07XG4gIHBhdGggPSAnJztcbn1cblxuLy/lnKjkvZznlKjln5/kuK3mn6Xmib7lgLxcbnZhciBnZXRWYWx1ZSA9IGZ1bmN0aW9uKGtleSwgdm0pIHtcbiAgdmFyIHJlZm9ybWVkID0gc2NvcGUucmVmb3JtU2NvcGUodm0sIGtleSlcbiAgcmV0dXJuIHJlZm9ybWVkLnZtW3JlZm9ybWVkLnBhdGhdXG59XG5cbi8v6KGo6L6+5byP5rGC5YC8XG4vL3RyZWU6IHBhcnNlciDnlJ/miJDnmoQgYXN0XG4vL3Njb3BlIOaJp+ihjOeOr+Wig1xuZXhwb3J0cy5ldmFsID0gZnVuY3Rpb24odHJlZSwgc2NvcGUsIHRoYXQpIHtcbiAgcmVzZXQoc2NvcGUgfHwge30sIHRoYXQpO1xuXG4gIHJldHVybiBldmFsdWF0ZSh0cmVlKTtcbn07XG5cbi8v6KGo6L6+5byP5pGY6KaBXG4vL3JldHVybjoge2ZpbHRlcnM6W10sIHBhdGhzOiBbXSwgYXNzaWdubWVudHM6IFtdfVxuZXhwb3J0cy5zdW1tYXJ5ID0gZnVuY3Rpb24odHJlZSkge1xuICByZXNldCgpO1xuXG4gIGV2YWx1YXRlKHRyZWUpO1xuXG4gIGlmKHBhdGgpIHtcbiAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgfVxuICBmb3IodmFyIGtleSBpbiBzdW1tYXJ5KSB7XG4gICAgc3VtbWFyeVtrZXldID0gT2JqZWN0LmtleXMoc3VtbWFyeVtrZXldKTtcbiAgfVxuICByZXR1cm4gc3VtbWFyeTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5hZGRFdmVudCA9IGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xuICBpZihlbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlciwgZmFsc2UpO1xuICB9ZWxzZXtcbiAgICBlbC5hdHRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59XG5cbmV4cG9ydHMucmVtb3ZlRXZlbnQgPSBmdW5jdGlvbiByZW1vdmVFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIpO1xuICB9ZWxzZXtcbiAgICBlbC5kZXRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59IiwiXCJ1c2Ugc3RyaWN0XCI7XG4vL0phdmFzY3JpcHQgZXhwcmVzc2lvbiBwYXJzZXIgbW9kaWZpZWQgZm9ybSBDcm9ja2ZvcmQncyBURE9QIHBhcnNlclxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcblx0ZnVuY3Rpb24gRigpIHt9XG5cdEYucHJvdG90eXBlID0gbztcblx0cmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgc291cmNlO1xuXG52YXIgZXJyb3IgPSBmdW5jdGlvbiAobWVzc2FnZSwgdCkge1xuXHR0ID0gdCB8fCB0aGlzO1xuICB2YXIgbXNnID0gbWVzc2FnZSArPSBcIiBCdXQgZm91bmQgJ1wiICsgdC52YWx1ZSArIFwiJ1wiICsgKHQuZnJvbSA/IFwiIGF0IFwiICsgdC5mcm9tIDogXCJcIikgKyBcIiBpbiAnXCIgKyBzb3VyY2UgKyBcIidcIjtcbiAgdmFyIGUgPSBuZXcgRXJyb3IobXNnKTtcblx0ZS5uYW1lID0gdC5uYW1lID0gXCJTeW50YXhFcnJvclwiO1xuXHR0Lm1lc3NhZ2UgPSBtZXNzYWdlO1xuICB0aHJvdyBlO1xufTtcblxudmFyIHRva2VuaXplID0gZnVuY3Rpb24gKGNvZGUsIHByZWZpeCwgc3VmZml4KSB7XG5cdHZhciBjOyAvLyBUaGUgY3VycmVudCBjaGFyYWN0ZXIuXG5cdHZhciBmcm9tOyAvLyBUaGUgaW5kZXggb2YgdGhlIHN0YXJ0IG9mIHRoZSB0b2tlbi5cblx0dmFyIGkgPSAwOyAvLyBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgbGVuZ3RoID0gY29kZS5sZW5ndGg7XG5cdHZhciBuOyAvLyBUaGUgbnVtYmVyIHZhbHVlLlxuXHR2YXIgcTsgLy8gVGhlIHF1b3RlIGNoYXJhY3Rlci5cblx0dmFyIHN0cjsgLy8gVGhlIHN0cmluZyB2YWx1ZS5cblxuXHR2YXIgcmVzdWx0ID0gW107IC8vIEFuIGFycmF5IHRvIGhvbGQgdGhlIHJlc3VsdHMuXG5cblx0Ly8gTWFrZSBhIHRva2VuIG9iamVjdC5cblx0dmFyIG1ha2UgPSBmdW5jdGlvbiAodHlwZSwgdmFsdWUpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZSA6IHR5cGUsXG5cdFx0XHR2YWx1ZSA6IHZhbHVlLFxuXHRcdFx0ZnJvbSA6IGZyb20sXG5cdFx0XHR0byA6IGlcblx0XHR9O1xuXHR9O1xuXG5cdC8vIEJlZ2luIHRva2VuaXphdGlvbi4gSWYgdGhlIHNvdXJjZSBzdHJpbmcgaXMgZW1wdHksIHJldHVybiBub3RoaW5nLlxuXHRpZiAoIWNvZGUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBMb29wIHRocm91Z2ggY29kZSB0ZXh0LCBvbmUgY2hhcmFjdGVyIGF0IGEgdGltZS5cblx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHR3aGlsZSAoYykge1xuXHRcdGZyb20gPSBpO1xuXG5cdFx0aWYgKGMgPD0gJyAnKSB7IC8vIElnbm9yZSB3aGl0ZXNwYWNlLlxuXHRcdFx0aSArPSAxO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH0gZWxzZSBpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8IGMgPT09ICckJyB8fCBjID09PSAnXycpIHsgLy8gbmFtZS5cblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8XG5cdFx0XHRcdFx0KGMgPj0gJzAnICYmIGMgPD0gJzknKSB8fCBjID09PSAnXycpIHtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ25hbWUnLCBzdHIpKTtcblx0XHR9IGVsc2UgaWYgKGMgPj0gJzAnICYmIGMgPD0gJzknKSB7XG5cdFx0XHQvLyBudW1iZXIuXG5cblx0XHRcdC8vIEEgbnVtYmVyIGNhbm5vdCBzdGFydCB3aXRoIGEgZGVjaW1hbCBwb2ludC4gSXQgbXVzdCBzdGFydCB3aXRoIGEgZGlnaXQsXG5cdFx0XHQvLyBwb3NzaWJseSAnMCcuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXG5cdFx0XHQvLyBMb29rIGZvciBtb3JlIGRpZ2l0cy5cblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIGZvciBhIGRlY2ltYWwgZnJhY3Rpb24gcGFydC5cblx0XHRcdGlmIChjID09PSAnLicpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYW4gZXhwb25lbnQgcGFydC5cblx0XHRcdGlmIChjID09PSAnZScgfHwgYyA9PT0gJ0UnKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPT09ICctJyB8fCBjID09PSAnKycpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBleHBvbmVudFwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fSB3aGlsZSAoYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlIG5leHQgY2hhcmFjdGVyIGlzIG5vdCBhIGxldHRlci5cblxuXHRcdFx0aWYgKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlIHRvIGEgbnVtYmVyLiBJZiBpdCBpcyBmaW5pdGUsIHRoZW4gaXQgaXMgYSBnb29kXG5cdFx0XHQvLyB0b2tlbi5cblxuXHRcdFx0biA9ICtzdHI7XG5cdFx0XHRpZiAoaXNGaW5pdGUobikpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnbnVtYmVyJywgbikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXJyb3IoXCJCYWQgbnVtYmVyXCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzdHJpbmdcblxuXHRcdH0gZWxzZSBpZiAoYyA9PT0gJ1xcJycgfHwgYyA9PT0gJ1wiJykge1xuXHRcdFx0c3RyID0gJyc7XG5cdFx0XHRxID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJyAnKSB7XG5cdFx0XHRcdFx0bWFrZSgnc3RyaW5nJywgc3RyKTtcblx0XHRcdFx0XHRlcnJvcihjID09PSAnXFxuJyB8fCBjID09PSAnXFxyJyB8fCBjID09PSAnJyA/XG5cdFx0XHRcdFx0XHRcIlVudGVybWluYXRlZCBzdHJpbmcuXCIgOlxuXHRcdFx0XHRcdFx0XCJDb250cm9sIGNoYXJhY3RlciBpbiBzdHJpbmcuXCIsIG1ha2UoJycsIHN0cikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgdGhlIGNsb3NpbmcgcXVvdGUuXG5cblx0XHRcdFx0aWYgKGMgPT09IHEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIGVzY2FwZW1lbnQuXG5cblx0XHRcdFx0aWYgKGMgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdHN3aXRjaCAoYykge1xuXHRcdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcZic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICduJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndCc6XG5cdFx0XHRcdFx0XHRjID0gJ1xcdCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1Jzpcblx0XHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gcGFyc2VJbnQoY29kZS5zdWJzdHIoaSArIDEsIDQpLCAxNik7XG5cdFx0XHRcdFx0XHRpZiAoIWlzRmluaXRlKGMpIHx8IGMgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuXHRcdFx0XHRcdFx0aSArPSA0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0Ly8gY29tYmluaW5nXG5cblx0XHR9IGVsc2UgaWYgKHByZWZpeC5pbmRleE9mKGMpID49IDApIHtcblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChpID49IGxlbmd0aCB8fCBzdWZmaXguaW5kZXhPZihjKSA8IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnb3BlcmF0b3InLCBzdHIpKTtcblxuXHRcdFx0Ly8gc2luZ2xlLWNoYXJhY3RlciBvcGVyYXRvclxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgYykpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIG1ha2VfcGFyc2UgPSBmdW5jdGlvbiAodmFycykge1xuXHR2YXJzID0gdmFycyB8fCB7fTsvL+mihOWumuS5ieeahOWPmOmHj1xuXHR2YXIgc3ltYm9sX3RhYmxlID0ge307XG5cdHZhciB0b2tlbjtcblx0dmFyIHRva2Vucztcblx0dmFyIHRva2VuX25yO1xuXHR2YXIgY29udGV4dDtcblxuXHR2YXIgaXRzZWxmID0gZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdHZhciBmaW5kID0gZnVuY3Rpb24gKG4pIHtcblx0XHRuLm51ZCA9IGl0c2VsZjtcblx0XHRuLmxlZCA9IG51bGw7XG5cdFx0bi5zdGQgPSBudWxsO1xuXHRcdG4ubGJwID0gMDtcblx0XHRyZXR1cm4gbjtcblx0fTtcblxuXHR2YXIgYWR2YW5jZSA9IGZ1bmN0aW9uIChpZCkge1xuXHRcdHZhciBhLCBvLCB0LCB2O1xuXHRcdGlmIChpZCAmJiB0b2tlbi5pZCAhPT0gaWQpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgJ1wiICsgaWQgKyBcIicuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuX25yID49IHRva2Vucy5sZW5ndGgpIHtcblx0XHRcdHRva2VuID0gc3ltYm9sX3RhYmxlW1wiKGVuZClcIl07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHQgPSB0b2tlbnNbdG9rZW5fbnJdO1xuXHRcdHRva2VuX25yICs9IDE7XG5cdFx0diA9IHQudmFsdWU7XG5cdFx0YSA9IHQudHlwZTtcblx0XHRpZiAoKGEgPT09IFwib3BlcmF0b3JcIiB8fCBhICE9PSAnc3RyaW5nJykgJiYgdiBpbiBzeW1ib2xfdGFibGUpIHtcblx0XHRcdC8vdHJ1ZSwgZmFsc2Ug562J55u05o6l6YeP5Lmf5Lya6L+b5YWl5q2k5YiG5pSvXG5cdFx0XHRvID0gc3ltYm9sX3RhYmxlW3ZdO1xuXHRcdFx0aWYgKCFvKSB7XG5cdFx0XHRcdGVycm9yKFwiVW5rbm93biBvcGVyYXRvci5cIiwgdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhID09PSBcIm5hbWVcIikge1xuXHRcdFx0byA9IGZpbmQodCk7XG5cdFx0fSBlbHNlIGlmIChhID09PSBcInN0cmluZ1wiIHx8IGEgPT09IFwibnVtYmVyXCIgfHwgYSA9PT0gXCJyZWdleHBcIikge1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVtcIihsaXRlcmFsKVwiXTtcblx0XHRcdGEgPSBcImxpdGVyYWxcIjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXJyb3IoXCJVbmV4cGVjdGVkIHRva2VuLlwiLCB0KTtcblx0XHR9XG5cdFx0dG9rZW4gPSBjcmVhdGUobyk7XG5cdFx0dG9rZW4uZnJvbSA9IHQuZnJvbTtcblx0XHR0b2tlbi50byA9IHQudG87XG5cdFx0dG9rZW4udmFsdWUgPSB2O1xuXHRcdHRva2VuLmFyaXR5ID0gYTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH07XG5cbiAgLy/ooajovr7lvI9cbiAgLy9yYnA6IHJpZ2h0IGJpbmRpbmcgcG93ZXIg5Y+z5L6n57qm5p2f5YqbXG5cdHZhciBleHByZXNzaW9uID0gZnVuY3Rpb24gKHJicCkge1xuXHRcdHZhciBsZWZ0O1xuXHRcdHZhciB0ID0gdG9rZW47XG5cdFx0YWR2YW5jZSgpO1xuXHRcdGxlZnQgPSB0Lm51ZCgpO1xuXHRcdHdoaWxlIChyYnAgPCB0b2tlbi5sYnApIHtcblx0XHRcdHQgPSB0b2tlbjtcblx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdGxlZnQgPSB0LmxlZChsZWZ0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGxlZnQ7XG5cdH07XG5cblx0dmFyIG9yaWdpbmFsX3N5bWJvbCA9IHtcblx0XHRudWQgOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlcnJvcihcIlVuZGVmaW5lZC5cIiwgdGhpcyk7XG5cdFx0fSxcblx0XHRsZWQgOiBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0ZXJyb3IoXCJNaXNzaW5nIG9wZXJhdG9yLlwiLCB0aGlzKTtcblx0XHR9XG5cdH07XG5cblx0dmFyIHN5bWJvbCA9IGZ1bmN0aW9uIChpZCwgYnApIHtcblx0XHR2YXIgcyA9IHN5bWJvbF90YWJsZVtpZF07XG5cdFx0YnAgPSBicCB8fCAwO1xuXHRcdGlmIChzKSB7XG5cdFx0XHRpZiAoYnAgPj0gcy5sYnApIHtcblx0XHRcdFx0cy5sYnAgPSBicDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cyA9IGNyZWF0ZShvcmlnaW5hbF9zeW1ib2wpO1xuXHRcdFx0cy5pZCA9IHMudmFsdWUgPSBpZDtcblx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHRzeW1ib2xfdGFibGVbaWRdID0gcztcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGNvbnN0YW50ID0gZnVuY3Rpb24gKHMsIHYsIGEpIHtcblx0XHR2YXIgeCA9IHN5bWJvbChzKTtcblx0XHR4Lm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBzeW1ib2xfdGFibGVbdGhpcy5pZF0udmFsdWU7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHgudmFsdWUgPSB2O1xuXHRcdHJldHVybiB4O1xuXHR9O1xuXG5cdHZhciBpbmZpeCA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgaW5maXhyID0gZnVuY3Rpb24gKGlkLCBicCwgbGVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQsIGJwKTtcblx0XHRzLmxlZCA9IGxlZCB8fCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oYnAgLSAxKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgcHJlZml4ID0gZnVuY3Rpb24gKGlkLCBudWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCk7XG5cdFx0cy5udWQgPSBudWQgfHwgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzApO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0c3ltYm9sKFwiKGVuZClcIik7XG5cdHN5bWJvbChcIihuYW1lKVwiKTtcblx0c3ltYm9sKFwiOlwiKTtcblx0c3ltYm9sKFwiKVwiKTtcblx0c3ltYm9sKFwiXVwiKTtcblx0c3ltYm9sKFwifVwiKTtcblx0c3ltYm9sKFwiLFwiKTtcblxuXHRjb25zdGFudChcInRydWVcIiwgdHJ1ZSk7XG5cdGNvbnN0YW50KFwiZmFsc2VcIiwgZmFsc2UpO1xuXHRjb25zdGFudChcIm51bGxcIiwgbnVsbCk7XG5cdGNvbnN0YW50KFwidW5kZWZpbmVkXCIpO1xuXG5cdGNvbnN0YW50KFwiTWF0aFwiLCBNYXRoKTtcblx0Y29uc3RhbnQoXCJEYXRlXCIsIERhdGUpO1xuXHRmb3IodmFyIHYgaW4gdmFycykge1xuXHRcdGNvbnN0YW50KHYsIHZhcnNbdl0pO1xuXHR9XG5cblx0c3ltYm9sKFwiKGxpdGVyYWwpXCIpLm51ZCA9IGl0c2VsZjtcblxuXHRzeW1ib2woXCJ0aGlzXCIpLm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0ICB0aGlzLmFyaXR5ID0gXCJ0aGlzXCI7XG5cdCAgcmV0dXJuIHRoaXM7XG5cdH07XG5cblx0Ly9PcGVyYXRvciBQcmVjZWRlbmNlOlxuXHQvL2h0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL09wZXJhdG9ycy9PcGVyYXRvcl9QcmVjZWRlbmNlXG5cbiAgLy9pbmZpeCgnLCcsIDEpO1xuXHRpbmZpeChcIj9cIiwgMjAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCI6XCIpO1xuXHRcdHRoaXMudGhpcmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXhyKFwiJiZcIiwgMzEpO1xuXHRpbmZpeHIoXCJ8fFwiLCAzMCk7XG5cblx0aW5maXhyKFwiPT09XCIsIDQwKTtcblx0aW5maXhyKFwiIT09XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI9PVwiLCA0MCk7XG5cdGluZml4cihcIiE9XCIsIDQwKTtcblxuXHRpbmZpeHIoXCI8XCIsIDQwKTtcblx0aW5maXhyKFwiPD1cIiwgNDApO1xuXHRpbmZpeHIoXCI+XCIsIDQwKTtcblx0aW5maXhyKFwiPj1cIiwgNDApO1xuXG5cdGluZml4KFwiaW5cIiwgNDUsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDApO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGlmIChjb250ZXh0ID09PSAncmVwZWF0Jykge1xuXHRcdFx0Ly8gYGluYCBhdCByZXBlYXQgYmxvY2tcblx0XHRcdGxlZnQuYXJpdHkgPSAncmVwZWF0Jztcblx0XHRcdHRoaXMucmVwZWF0ID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiK1wiLCA1MCk7XG5cdGluZml4KFwiLVwiLCA1MCk7XG5cblx0aW5maXgoXCIqXCIsIDYwKTtcblx0aW5maXgoXCIvXCIsIDYwKTtcblx0aW5maXgoXCIlXCIsIDYwKTtcblxuXHRpbmZpeChcIihcIiwgNzUsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHRpZiAobGVmdC5pZCA9PT0gXCIuXCIgfHwgbGVmdC5pZCA9PT0gXCJbXCIpIHtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInRlcm5hcnlcIjtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0LmZpcnN0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBsZWZ0LnNlY29uZDtcblx0XHRcdHRoaXMudGhpcmQgPSBhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0aWYgKChsZWZ0LmFyaXR5ICE9PSBcInVuYXJ5XCIgfHwgbGVmdC5pZCAhPT0gXCJmdW5jdGlvblwiKSAmJlxuXHRcdFx0XHRsZWZ0LmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBsZWZ0LmFyaXR5ICE9PSBcImxpdGVyYWxcIiAmJiBsZWZ0LmlkICE9PSBcIihcIiAmJlxuXHRcdFx0XHRsZWZ0LmlkICE9PSBcIiYmXCIgJiYgbGVmdC5pZCAhPT0gXCJ8fFwiICYmIGxlZnQuaWQgIT09IFwiP1wiKSB7XG5cdFx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSB2YXJpYWJsZSBuYW1lLlwiLCBsZWZ0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIilcIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMSkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIi5cIiwgODAsIGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0aWYgKHRva2VuLmFyaXR5ICE9PSBcIm5hbWVcIikge1xuXHRcdFx0ZXJyb3IoXCJFeHBlY3RlZCBhIHByb3BlcnR5IG5hbWUuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0dG9rZW4uYXJpdHkgPSBcImxpdGVyYWxcIjtcblx0XHR0aGlzLnNlY29uZCA9IHRva2VuO1xuXHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCJbXCIsIDYwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0Ly9maWx0ZXJcblx0aW5maXgoXCJ8XCIsIDEwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhO1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRva2VuLmFyaXR5ID0gJ2ZpbHRlcic7XG5cdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKDEwKTtcblx0XHR0aGlzLmFyaXR5ID0gJ2JpbmFyeSc7XG5cdFx0aWYgKHRva2VuLmlkID09PSAnOicpIHtcblx0XHRcdHRoaXMuYXJpdHkgPSAndGVybmFyeSc7XG5cdFx0XHR0aGlzLnRoaXJkID0gYSA9IFtdO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YWR2YW5jZSgnOicpO1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigxMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiOlwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuICBpbmZpeCgnY2F0Y2hieScsIDEwKTtcblxuXHRwcmVmaXgoXCIhXCIpO1xuXHRwcmVmaXgoXCItXCIpO1xuXHRwcmVmaXgoXCJ0eXBlb2ZcIik7XG5cblx0cHJlZml4KFwiKFwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGUgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiBlO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJbXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJdXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJ7XCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdLFx0biwgdjtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwifVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRuID0gdG9rZW47XG5cdFx0XHRcdGlmIChuLmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBuLmFyaXR5ICE9PSBcImxpdGVyYWxcIikge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIHByb3BlcnR5IG5hbWU6IFwiLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHRcdFx0diA9IGV4cHJlc3Npb24oMSk7XG5cdFx0XHRcdHYua2V5ID0gbi52YWx1ZTtcblx0XHRcdFx0YS5wdXNoKHYpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJ9XCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeCgnbmV3JywgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzkpO1xuXHRcdGlmKHRva2VuLmlkID09PSAnKCcpIHtcblx0XHRcdGFkdmFuY2UoXCIoXCIpO1xuXHRcdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMSkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHR9ZWxzZXtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHQvL19zb3VyY2U6IOihqOi+vuW8j+S7o+eggeWtl+espuS4slxuXHQvL19jb250ZXh0OiDooajovr7lvI/nmoTor63lj6Xnjq/looNcblx0cmV0dXJuIGZ1bmN0aW9uIChfc291cmNlLCBfY29udGV4dCkge1xuICAgIHNvdXJjZSA9IF9zb3VyY2U7XG5cdFx0dG9rZW5zID0gdG9rZW5pemUoX3NvdXJjZSwgJz08PiErLSomfC8lXicsICc9PD4mfCcpO1xuXHRcdHRva2VuX25yID0gMDtcblx0XHRjb250ZXh0ID0gX2NvbnRleHQ7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHZhciBzID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKGVuZClcIik7XG5cdFx0cmV0dXJuIHM7XG5cdH07XG59O1xuXG5leHBvcnRzLnBhcnNlID0gbWFrZV9wYXJzZSgpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuLy/moLnmja7lj5jph4/lj4ogdm0g56Gu5a6a5Y+Y6YeP5omA5bGe55qE55yf5q2jIHZtXG52YXIgcmVmb3JtU2NvcGUgPSBmdW5jdGlvbiAodm0sIHBhdGgpIHtcbiAgdmFyIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKHBhdGgpO1xuICB2YXIgY3VyID0gdm0sIGxvY2FsID0gcGF0aHNbMF07XG4gIHZhciBhc3MsIGN1clZtID0gY3VyO1xuXG4gIHdoaWxlKGN1cikge1xuICAgIGN1clZtID0gY3VyO1xuICAgIGFzcyA9IGN1ci5fYXNzaWdubWVudHM7XG4gICAgaWYoIGN1ci5fX3JlcGVhdCkge1xuICAgICAgaWYgKGFzcyAmJiBhc3MubGVuZ3RoKSB7XG4gICAgICAgIC8vIOWFt+WQjSByZXBlYXQg5LiN5Lya55u05o6l5p+l5om+6Ieq6Lqr5L2c55So5Z+fXG4gICAgICAgIGlmIChsb2NhbCA9PT0gJyRpbmRleCcgfHwgbG9jYWwgPT09ICckcGFyZW50Jykge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2UgaWYgKGxvY2FsID09PSBhc3NbMF0pIHtcbiAgICAgICAgICAvL+S/ruato2tleVxuICAgICAgICAgIGlmIChwYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHBhdGhzWzBdID0gJyRkYXRhJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGF0aHMuc2hpZnQoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy/ljL/lkI0gcmVwZWF0XG4gICAgICAgIGlmIChwYXRoIGluIGN1cikge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGN1ciA9IGN1ci4kcGFyZW50O1xuICB9XG5cbiAgcmV0dXJuIHsgdm06IGN1clZtLCBwYXRoOiBwYXRocy5qb2luKCcuJykgfVxufTtcblxuXG5leHBvcnRzLnJlZm9ybVNjb3BlID0gcmVmb3JtU2NvcGU7XG4iLCJ2YXIgdG9rZW5SZWcgPSAve3soeyguKz8pfXwuKz8pfX0vZztcblxuLy/lrZfnrKbkuLLkuK3mmK/lkKbljIXlkKvmqKHmnb/ljaDkvY3nrKbmoIforrBcbmZ1bmN0aW9uIGhhc1Rva2VuKHN0cikge1xuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICByZXR1cm4gc3RyICYmIHRva2VuUmVnLnRlc3Qoc3RyKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VUb2tlbih2YWx1ZSkge1xuICB2YXIgdG9rZW5zID0gW11cbiAgICAsIHRleHRNYXAgPSBbXVxuICAgICwgc3RhcnQgPSAwXG4gICAgLCB2YWwsIHRva2VuXG4gICAgO1xuXG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG5cbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cblxuICAgIHRva2VuID0ge1xuICAgICAgZXNjYXBlOiAhdmFsWzJdXG4gICAgLCBwYXRoOiAodmFsWzJdIHx8IHZhbFsxXSkudHJpbSgpXG4gICAgLCBwb3NpdGlvbjogdGV4dE1hcC5sZW5ndGhcbiAgICAsIHRleHRNYXA6IHRleHRNYXBcbiAgICB9O1xuXG4gICAgdG9rZW5zLnB1c2godG9rZW4pO1xuXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcblxuICAgIHN0YXJ0ID0gdG9rZW5SZWcubGFzdEluZGV4O1xuICB9XG5cbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cblxuICB0b2tlbnMudGV4dE1hcCA9IHRleHRNYXA7XG5cbiAgcmV0dXJuIHRva2Vucztcbn1cblxuZXhwb3J0cy5oYXNUb2tlbiA9IGhhc1Rva2VuO1xuXG5leHBvcnRzLnBhcnNlVG9rZW4gPSBwYXJzZVRva2VuO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8vdXRpbHNcbi8vLS0tXG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50O1xuXG52YXIga2V5UGF0aFJlZyA9IC8oPzpcXC58XFxbKS9nXG4gICwgYnJhID0gL1xcXS9nXG4gIDtcblxuLy/lsIYga2V5UGF0aCDovazkuLrmlbDnu4TlvaLlvI9cbi8vcGF0aC5rZXksIHBhdGhba2V5XSAtLT4gWydwYXRoJywgJ2tleSddXG5mdW5jdGlvbiBwYXJzZUtleVBhdGgoa2V5UGF0aCl7XG4gIHJldHVybiBrZXlQYXRoLnJlcGxhY2UoYnJhLCAnJykuc3BsaXQoa2V5UGF0aFJlZyk7XG59XG5cbi8qKlxuICog5ZCI5bm25a+56LGhXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtkZWVwPWZhbHNlXSDmmK/lkKbmt7HluqblkIjlubZcbiAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQg55uu5qCH5a+56LGhXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdC4uLl0g5p2l5rqQ5a+56LGhXG4gKiBAcmV0dXJucyB7T2JqZWN0fSDlkIjlubblkI7nmoQgdGFyZ2V0IOWvueixoVxuICovXG5mdW5jdGlvbiBleHRlbmQoLyogZGVlcCwgdGFyZ2V0LCBvYmplY3QuLi4gKi8pIHtcbiAgdmFyIG9wdGlvbnNcbiAgICAsIG5hbWUsIHNyYywgY29weSwgY29weUlzQXJyYXksIGNsb25lXG4gICAgLCB0YXJnZXQgPSBhcmd1bWVudHNbMF0gfHwge31cbiAgICAsIGkgPSAxXG4gICAgLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoXG4gICAgLCBkZWVwID0gZmFsc2VcbiAgICA7XG5cbiAgLy8gSGFuZGxlIGEgZGVlcCBjb3B5IHNpdHVhdGlvblxuICBpZiAodHlwZW9mIHRhcmdldCA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBkZWVwID0gdGFyZ2V0O1xuXG4gICAgLy8gc2tpcCB0aGUgYm9vbGVhbiBhbmQgdGhlIHRhcmdldFxuICAgIHRhcmdldCA9IGFyZ3VtZW50c1sgaSBdIHx8IHt9O1xuICAgIGkrKztcbiAgfVxuXG4gIC8vIEhhbmRsZSBjYXNlIHdoZW4gdGFyZ2V0IGlzIGEgc3RyaW5nIG9yIHNvbWV0aGluZyAocG9zc2libGUgaW4gZGVlcCBjb3B5KVxuICBpZiAodHlwZW9mIHRhcmdldCAhPT0gXCJvYmplY3RcIiAmJiAhdXRpbHMuaXNGdW5jdGlvbih0YXJnZXQpKSB7XG4gICAgdGFyZ2V0ID0ge307XG4gIH1cblxuICBmb3IgKCA7IGkgPCBsZW5ndGg7IGkrKyApIHtcbiAgICAvLyBPbmx5IGRlYWwgd2l0aCBub24tbnVsbC91bmRlZmluZWQgdmFsdWVzXG4gICAgaWYgKCAob3B0aW9ucyA9IGFyZ3VtZW50c1sgaSBdKSAhPSBudWxsICkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBiYXNlIG9iamVjdFxuICAgICAgZm9yICggbmFtZSBpbiBvcHRpb25zICkge1xuICAgICAgICAvL2FuZHJvaWQgMi4zIGJyb3dzZXIgY2FuIGVudW0gdGhlIHByb3RvdHlwZSBvZiBjb25zdHJ1Y3Rvci4uLlxuICAgICAgICBpZihuYW1lICE9PSAncHJvdG90eXBlJyl7XG4gICAgICAgICAgc3JjID0gdGFyZ2V0WyBuYW1lIF07XG4gICAgICAgICAgY29weSA9IG9wdGlvbnNbIG5hbWUgXTtcblxuXG4gICAgICAgICAgLy8gUmVjdXJzZSBpZiB3ZSdyZSBtZXJnaW5nIHBsYWluIG9iamVjdHMgb3IgYXJyYXlzXG4gICAgICAgICAgaWYgKCBkZWVwICYmIGNvcHkgJiYgKCB1dGlscy5pc1BsYWluT2JqZWN0KGNvcHkpIHx8IChjb3B5SXNBcnJheSA9IHV0aWxzLmlzQXJyYXkoY29weSkpICkgKSB7XG5cbiAgICAgICAgICAgIC8vIFByZXZlbnQgbmV2ZXItZW5kaW5nIGxvb3BcbiAgICAgICAgICAgIGlmICggdGFyZ2V0ID09PSBjb3B5ICkge1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICggY29weUlzQXJyYXkgKSB7XG4gICAgICAgICAgICAgIGNvcHlJc0FycmF5ID0gZmFsc2U7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzQXJyYXkoc3JjKSA/IHNyYyA6IFtdO1xuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjbG9uZSA9IHNyYyAmJiB1dGlscy5pc1BsYWluT2JqZWN0KHNyYykgPyBzcmMgOiB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTmV2ZXIgbW92ZSBvcmlnaW5hbCBvYmplY3RzLCBjbG9uZSB0aGVtXG4gICAgICAgICAgICB0YXJnZXRbIG5hbWUgXSA9IGV4dGVuZCggZGVlcCwgY2xvbmUsIGNvcHkpO1xuXG4gICAgICAgICAgICAvLyBEb24ndCBicmluZyBpbiB1bmRlZmluZWQgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIGlmICggIXV0aWxzLmlzVW5kZWZpbmVkKGNvcHkpICYmIHR5cGVvZiB0YXJnZXQgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAvL+S4gOS6m+aDheS4iywg5q+U5aaCIGZpcmVmb3gg5LiL57uZ5a2X56ym5Liy5a+56LGh6LWL5YC85pe25Lya5byC5bi4XG4gICAgICAgICAgICB0YXJnZXRbbmFtZV0gPSBjb3B5O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybiB0aGUgbW9kaWZpZWQgb2JqZWN0XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG4gIGZ1bmN0aW9uIEYoKSB7fVxuICBGLnByb3RvdHlwZSA9IG87XG4gIHJldHVybiBuZXcgRigpO1xufTtcblxudmFyIGRlZXBHZXQgPSBmdW5jdGlvbiAoa2V5U3RyLCBvYmopIHtcbiAgdmFyIGNoYWluLCBjdXIgPSBvYmosIGtleTtcbiAgaWYoa2V5U3RyKXtcbiAgICBjaGFpbiA9IHBhcnNlS2V5UGF0aChrZXlTdHIpO1xuICAgIGZvcih2YXIgaSA9IDAsIGwgPSBjaGFpbi5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGtleSA9IGNoYWluW2ldO1xuICAgICAgaWYoY3VyKXtcbiAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gY3VyO1xufVxuXG4vL2h0bWwg5Lit5bGe5oCn5ZCN5LiN5Yy65YiG5aSn5bCP5YaZLCDlubbkuJTkvJrlhajpg6jovazmiJDlsI/lhpkuXG4vL+i/memHjOS8muWwhui/nuWtl+espuWGmeazlei9rOaIkOmpvOWzsOW8j1xuLy9hdHRyLW5hbWUgLS0+IGF0dHJOYW1lXG4vL2F0dHItLW5hbWUgLS0+IGF0dHItbmFtZVxudmFyIGh5cGhlbnNSZWcgPSAvLSgtPykoW2Etel0pL2lnO1xudmFyIGh5cGhlblRvQ2FtZWwgPSBmdW5jdGlvbihhdHRyTmFtZSkge1xuICByZXR1cm4gYXR0ck5hbWUucmVwbGFjZShoeXBoZW5zUmVnLCBmdW5jdGlvbihzLCBkYXNoLCBjaGFyKSB7XG4gICAgcmV0dXJuIGRhc2ggPyBkYXNoICsgY2hhciA6IGNoYXIudG9VcHBlckNhc2UoKTtcbiAgfSlcbn1cblxuLy/pqbzls7Dovazov57mjqXnrKZcbnZhciBjYW1lbFJlZyA9IC8oW0EtWl0pL2c7XG52YXIgY2FtZWxUb0h5cGhlbiA9IGZ1bmN0aW9uKGtleSkge1xuICByZXR1cm4ga2V5LnJlcGxhY2UoY2FtZWxSZWcsIGZ1bmN0aW9uICh1cHBlckNoYXIpIHtcbiAgICByZXR1cm4gJy0nICsgdXBwZXJDaGFyLnRvTG93ZXJDYXNlKCk7XG4gIH0pXG59XG5cbnZhciB1dGlscyA9IHtcbiAgbm9vcDogZnVuY3Rpb24gKCl7fVxuLCBpZTogKGZ1bmN0aW9uKCl7XG4gICAgdmFyIHVuZGVmLFxuICAgICAgICB2ID0gMyxcbiAgICAgICAgZGl2ID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuICAgICAgICBhbGwgPSBkaXYuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2knKTtcblxuICAgIHdoaWxlIChcbiAgICAgIGRpdi5pbm5lckhUTUwgPSAnPCEtLVtpZiBndCBJRSAnICsgKCsrdikgKyAnXT48aT48L2k+PCFbZW5kaWZdLS0+JyxcbiAgICAgIGFsbFswXVxuICAgICk7XG5cbiAgICByZXR1cm4gdiA+IDQgPyB2IDogdW5kZWY7XG5cbiAgfSgpKVxuXG4sIGlzT2JqZWN0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbCAhPT0gbnVsbDtcbiAgfVxuXG4sIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiwgaXNGdW5jdGlvbjogZnVuY3Rpb24gKHZhbCl7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG4gIH1cblxuLCBpc0FycmF5OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYodXRpbHMuaWUpe1xuICAgICAgLy9JRSA5IOWPiuS7peS4iyBJRSDot6jnqpflj6Pmo4DmtYvmlbDnu4RcbiAgICAgIHJldHVybiB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yICsgJycgPT09IEFycmF5ICsgJyc7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpO1xuICAgIH1cbiAgfVxuLCBpc051bWVyaWM6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHJldHVybiAhdXRpbHMuaXNBcnJheSh2YWwpICYmIHZhbCAtIHBhcnNlRmxvYXQodmFsKSArIDEgPj0gMDtcbiAgfVxuICAvL+eugOWNleWvueixoeeahOeugOaYk+WIpOaWrVxuLCBpc1BsYWluT2JqZWN0OiBmdW5jdGlvbiAobyl7XG4gICAgaWYgKCFvIHx8ICh7fSkudG9TdHJpbmcuY2FsbChvKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgfHwgby5ub2RlVHlwZSB8fCBvID09PSBvLndpbmRvdykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy/lh73mlbDliIfpnaIuIG9yaUZuIOWOn+Wni+WHveaVsCwgZm4g5YiH6Z2i6KGl5YWF5Ye95pWwXG4gIC8v5YmN6Z2i55qE5Ye95pWw6L+U5Zue5YC85Lyg5YWlIGJyZWFrQ2hlY2sg5Yik5patLCBicmVha0NoZWNrIOi/lOWbnuWAvOS4uuecn+aXtuS4jeaJp+ihjOWIh+mdouihpeWFheeahOWHveaVsFxuLCBiZWZvcmVGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0LCBhcmd1bWVudHMpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuLCBhZnRlckZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQsIGFyZ3VtZW50cykpe1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfVxuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICB9XG5cbiwgcGFyc2VLZXlQYXRoOiBwYXJzZUtleVBhdGhcblxuLCBkZWVwU2V0OiBmdW5jdGlvbiAoa2V5U3RyLCB2YWx1ZSwgb2JqKSB7XG4gICAgaWYoa2V5U3RyKXtcbiAgICAgIHZhciBjaGFpbiA9IHBhcnNlS2V5UGF0aChrZXlTdHIpXG4gICAgICAgICwgY3VyID0gb2JqXG4gICAgICAgIDtcbiAgICAgIGNoYWluLmZvckVhY2goZnVuY3Rpb24oa2V5LCBpKSB7XG4gICAgICAgIGlmKGkgPT09IGNoYWluLmxlbmd0aCAtIDEpe1xuICAgICAgICAgIGN1cltrZXldID0gdmFsdWU7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgIGlmKGN1ciAmJiBjdXIuaGFzT3duUHJvcGVydHkoa2V5KSl7XG4gICAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGN1cltrZXldID0ge307XG4gICAgICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1lbHNle1xuICAgICAgZXh0ZW5kKG9iaiwgdmFsdWUpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9XG4sIGV4dGVuZDogZXh0ZW5kXG4sIGNyZWF0ZTogY3JlYXRlXG4sIHRvQXJyYXk6IGZ1bmN0aW9uKGFyckxpa2UpIHtcbiAgICB2YXIgYXJyID0gW107XG5cbiAgICB0cnl7XG4gICAgICAvL0lFIDgg5a+5IGRvbSDlr7nosaHkvJrmiqXplJlcbiAgICAgIGFyciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyckxpa2UpXG4gICAgfWNhdGNoIChlKXtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBhcnJMaWtlLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBhcnJbaV0gPSBhcnJMaWtlW2ldXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnI7XG4gIH1cbiwgaHlwaGVuVG9DYW1lbDogaHlwaGVuVG9DYW1lbFxuLCBjYW1lbFRvSHlwaGVuOiBjYW1lbFRvSHlwaGVuXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHV0aWxzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBldmFsdWF0ZSA9IHJlcXVpcmUoJy4vZXZhbC5qcycpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIHJlZm9ybVNjb3BlID0gcmVxdWlyZSgnLi9zY29wZScpLnJlZm9ybVNjb3BlXG4gIDtcblxudmFyIHN1bW1hcnlDYWNoZSA9IHt9O1xuXG4vKipcbiAqIOavj+S4qiBkaXJlY3RpdmUg5a+55bqU5LiA5LiqIHdhdGNoZXJcbiAqIEBwYXJhbSB7QmVlfSB2bSAgZGlyZWN0aXZlIOaJgOWkhOeahOeOr+Wig1xuICogQHBhcmFtIHtEaXJlY3RpdmV9IGRpclxuICovXG5mdW5jdGlvbiBXYXRjaGVyKHZtLCBkaXIpIHtcbiAgdmFyIHJlZm9ybWVkLCBwYXRoLCBjdXJWbSA9IHZtLCB3YXRjaGVycyA9IFtdO1xuICB2YXIgc3VtbWFyeSA9IHN1bW1hcnlDYWNoZVtkaXIucGF0aF1cblxuICBkaXIud2F0Y2hlciA9IHRoaXM7XG5cbiAgdGhpcy5zdGF0ZSA9IDE7XG4gIHRoaXMuZGlyID0gZGlyO1xuICB0aGlzLnZtID0gdm07XG4gIHRoaXMud2F0Y2hlcnMgPSBbXTtcblxuICB0aGlzLnZhbCA9IE5hTjtcblxuICBkaXIucGFyc2UoKTtcblxuICBpZighc3VtbWFyeSB8fCBzdW1tYXJ5Ll90eXBlICE9PSBkaXIudHlwZSl7XG4gICAgc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkoZGlyLmFzdCk7XG4gICAgc3VtbWFyeS5fdHlwZSA9IGRpci50eXBlO1xuICAgIHN1bW1hcnlDYWNoZVtkaXIucGF0aF0gPSBzdW1tYXJ5O1xuICB9XG4gIGRpci5zdW1tYXJ5ID0gc3VtbWFyeVxuXG4gIC8v5bCG6K+lIHdhdGNoZXIg5LiO5q+P5LiA5Liq5bGe5oCn5bu656uL5byV55So5YWz57O7XG4gIGZvcih2YXIgaSA9IDAsIGwgPSBkaXIuc3VtbWFyeS5wYXRocy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICByZWZvcm1lZCA9IHJlZm9ybVNjb3BlKHZtLCBkaXIuc3VtbWFyeS5wYXRoc1tpXSlcbiAgICBjdXJWbSA9IHJlZm9ybWVkLnZtXG4gICAgcGF0aCA9IHJlZm9ybWVkLnBhdGhcbiAgICBpZihkaXIud2F0Y2gpIHtcbiAgICAgIGN1clZtLl93YXRjaGVyc1twYXRoXSA9IGN1clZtLl93YXRjaGVyc1twYXRoXSB8fCBbXTtcbiAgICAgIGN1clZtLl93YXRjaGVyc1twYXRoXS5wdXNoKHRoaXMpO1xuICAgICAgd2F0Y2hlcnMgPSBjdXJWbS5fd2F0Y2hlcnNbcGF0aF07XG4gICAgfWVsc2V7XG4gICAgICB3YXRjaGVycyA9IFt0aGlzXTtcbiAgICB9XG4gICAgLy/lsIbmr4/kuKoga2V5IOWvueW6lOeahCB3YXRjaGVycyDpg73loZ7ov5vmnaVcbiAgICB0aGlzLndhdGNoZXJzLnB1c2goIHdhdGNoZXJzICk7XG4gIH1cblxuICAvL+aYr+WQpuWcqOWIneWni+WMluaXtuabtOaWsFxuICBkaXIuaW1tZWRpYXRlICE9PSBmYWxzZSAmJiB0aGlzLnVwZGF0ZSgpO1xufVxuXG4vL+agueaNruihqOi+vuW8j+enu+mZpOW9k+WJjSB2bSDkuK3nmoQgd2F0Y2hlclxuZnVuY3Rpb24gdW53YXRjaCAodm0sIGV4cCwgY2FsbGJhY2spIHtcbiAgdmFyIHN1bW1hcnk7XG4gIHRyeSB7XG4gICAgc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkocGFyc2UoZXhwKSlcbiAgfWNhdGNoIChlKXtcbiAgICBlLm1lc3NhZ2UgPSAnU3ludGF4RXJyb3IgaW4gXCInICsgZXhwICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG4gIHN1bW1hcnkucGF0aHMuZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgdmFyIHdhdGNoZXJzID0gdm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdLCB1cGRhdGU7XG5cbiAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICB1cGRhdGUgPSB3YXRjaGVyc1tpXS5kaXIudXBkYXRlO1xuICAgICAgaWYodXBkYXRlID09PSBjYWxsYmFjayB8fCB1cGRhdGUuX29yaWdpbkZuID09PSBjYWxsYmFjayl7XG4gICAgICAgIHdhdGNoZXJzW2ldLnVud2F0Y2goKVxuICAgICAgfVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gYWRkV2F0Y2hlcihkaXIpIHtcbiAgaWYoZGlyLnBhdGgpIHtcbiAgICByZXR1cm4gbmV3IFdhdGNoZXIodGhpcywgZGlyKTtcbiAgfVxufVxuXG5XYXRjaGVyLnVud2F0Y2ggPSB1bndhdGNoO1xuV2F0Y2hlci5hZGRXYXRjaGVyID0gYWRkV2F0Y2hlcjtcblxuLy/ojrflj5bmn5Aga2V5UGF0aCDlrZDot6/lvoTnmoQgd2F0Y2hlcnNcbldhdGNoZXIuZ2V0V2F0Y2hlcnMgPSBmdW5jdGlvbiBnZXRXYXRjaGVycyh2bSwga2V5UGF0aCkge1xuICB2YXIgX3dhdGNoZXJzID0gdm0uX3dhdGNoZXJzLCB3YXRjaGVycyA9IFtdO1xuICB2YXIgcG9pbnQ7XG4gIGZvcih2YXIga2V5IGluIF93YXRjaGVycykge1xuICAgIHBvaW50ID0ga2V5LmNoYXJBdChrZXlQYXRoLmxlbmd0aCk7XG4gICAgaWYoa2V5LmluZGV4T2Yoa2V5UGF0aCkgPT09IDAgJiYgKHBvaW50ID09PSAnLicpKSB7XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdChfd2F0Y2hlcnNba2V5XSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHdhdGNoZXJzXG59XG5cbmZ1bmN0aW9uIHdhdGNoZXJVcGRhdGUgKHZhbCkge1xuICB2YXIgb2xkVmFsdWUgPSB0aGlzLnZhbDtcbiAgdGhpcy52YWwgPSB2YWw7XG4gIHRoaXMuZGlyLnVwZGF0ZSh2YWwsIG9sZFZhbHVlKTtcbn1cblxudXRpbHMuZXh0ZW5kKFdhdGNoZXIucHJvdG90eXBlLCB7XG4gIC8v6KGo6L6+5byP5omn6KGM5bm25pu05pawIHZpZXdcbiAgdXBkYXRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICwgbmV3VmFsXG4gICAgICA7XG5cbiAgICBpZih0aGlzLl9oaWRlKSB7XG4gICAgICB0aGlzLl9uZWVkVXBkYXRlID0gdHJ1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV3VmFsID0gdGhpcy5kaXIuZ2V0VmFsdWUodGhpcy52bSk7XG5cbiAgICAvL+eugOWNlei/h+a7pOmHjeWkjeabtOaWsFxuICAgIGlmKG5ld1ZhbCAhPT0gdGhpcy52YWwgfHwgdXRpbHMuaXNPYmplY3QobmV3VmFsKSl7XG4gICAgICBpZihuZXdWYWwgJiYgbmV3VmFsLnRoZW4pIHtcbiAgICAgICAgLy9hIHByb21pc2VcbiAgICAgICAgbmV3VmFsLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoYXQsIHZhbCk7XG4gICAgICAgIH0pO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGlzLCBuZXdWYWwpO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgLy/np7vpmaRcbiAgdW53YXRjaDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXJzKSB7XG4gICAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKHdhdGNoZXJzW2ldID09PSB0aGlzKXtcbiAgICAgICAgICBpZih0aGlzLnN0YXRlKXtcbiAgICAgICAgICAgIHdhdGNoZXJzW2ldLmRpci51bkxpbmsoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpXG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyXG4iXX0=
