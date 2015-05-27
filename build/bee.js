(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Bee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var doc = require('./env.js').document
  , utils = require('./utils.js')
  //, Event = require('./event.js')
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
  , isUndefined = utils.isUndefined
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

var mergeProps = {
  $data: 1, $filter: 1, $watchers: 1
};

var lifeCycles = {
  $init: utils.noop
, $destroy: utils.noop
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
  , $filters: {}
  , $watchers: {}
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

  var el;

  var mixins = ([defaults].concat(this.$mixins || [])).concat([props])

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
  el = domUtils.tplParse(tpl, this.$target, this.$content);

  if(this.$el){
    this.$el.appendChild(el.el);
  }else{
    this.$el = el.el;
  }
  this.$tpl = el.tpl;
  this.$content = el.content;

  this.$el.bee = this;

  if(this.$content){
    this.__links = checkBinding.walk.call(this.$root, this.$content);
  }
  this.__links = this.__links.concat( checkBinding.walk.call(this, this.$el) );

  for(var key in this.$watchers) {
    this.$watch(key, this.$watchers[key])
  }

  this.$replace(this.$data);
  this._isRendered = true;
  this.$init();
}

//静态属性
extend(Bee, {extend: utils.afterFn(Class.extend, utils.noop, function(sub) {
  //每个构造函数都有自己的 directives 和 components 引用
  sub.directives = create(this.directives);
  sub.components = create(this.components);
}), utils: utils}, Dir, Com, {
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
extend(Bee.prototype, /*Event,*/ lifeCycles, {
  /**
   * 获取属性/方法--
   * @param {String} keyPath 路径/表达式
   * @return {*}
   */
  $get: function(keyPath) {
    var dir = new Dir('$get', {
      path: keyPath
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
    if(isUndefined(key)){ return this; }

    if(arguments.length === 1){
      if(isObject(key)) {
        extend(true, this.$data, key);
        extend(true, this, key);
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
    return this;
  }
  /**
   * 数据替换
   */
, $replace: function (key, val) {
    var keys, hasKey = false;
    var reformed, reKey, reVm = this;

    if(isUndefined(key)){ return this; }

    if(arguments.length === 1){
      if(isObject(key)) {
        Object.keys(this.$data).forEach(function(key) {
          delete this[key];
        }.bind(this))
        extend(this, key);
      }
      this.$data = key;
    }else{
      hasKey = true;
      reformed = scope.reformScope(this, key)
      reKey = reformed.path;
      reVm = reformed.vm;
      keys = parseKeyPath(reKey);
      if(keys[0] !== '$data') {
        deepSet(reKey, val, reVm.$data);
      }
      deepSet(reKey, val, reVm);
    }
    hasKey ? update.call(reVm, reKey, val) : update.call(reVm, key);
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

    attrs = this.$get(keyPath);

    //同时更新子路径
    if(isObject(attrs) && !utils.isArray(attrs)) {
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
      Watcher.addWatcher.call(this, new Dir('$watch', {path: keyPath, update: update}))
    }
    return this;
  }
, $unwatch: function (keyPath, callback) {
    Watcher.unwatch(this, keyPath, callback)
    return this;
  }
, __destroy: function() {
    this.__links.forEach(function(wacher) {
      wacher.unwatch()
    })
    this.__links = [];
    this.$destroy()
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

Bee.version = '0.2.0';

module.exports = Bee;

},{"./check-binding.js":3,"./class.js":4,"./component.js":5,"./directive.js":6,"./directives":10,"./dom-utils.js":15,"./env.js":16,"./scope":20,"./utils.js":22,"./watcher.js":23}],2:[function(require,module,exports){

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

//遍历 dom 树
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
    , prefix = cstr.prefix
    , dirs = cstr.directive.getDir(el, cstr.directives, cstr.components, prefix)
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
    }else if(dir.replace){
      dir.node = doc.createTextNode('');
    }

    dir.el = dir.el.parentNode;
    dir.el.replaceChild(dir.node, el);
  }

  dir.link(this);

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

},{"./env.js":16,"./token.js":21,"./utils":22,"./watcher":23}],4:[function(require,module,exports){
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
},{"./utils.js":22}],5:[function(require,module,exports){
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

},{"./utils.js":22}],6:[function(require,module,exports){
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
, unLink: utils.noop//销毁回调
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

},{"./env.js":16,"./eval.js":17,"./parse.js":19,"./token.js":21,"./utils.js":22}],7:[function(require,module,exports){
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
},{"../utils.js":22}],8:[function(require,module,exports){
//component as directive
var utils = require('../utils.js');

module.exports = {
  priority: -10
, watch: false
, unLink: function() {
    this.component && this.component.__destroy()
  }
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

      this.component = comp = new Comp({
        $target: el,
        //$root: vm.$root,
        $data: utils.extend({}, Comp.prototype.$data, $data)
      });

      //直接将component 作为根元素时, 同步跟新容器 .$el 引用
      if(vm.$el === el) {
        vm.__ref = comp;
        vm.$el = comp.$el;
      }
      return true;
    }else{
      console.warn('Component: ' + comName + ' not defined! Ignore');
    }
  }
};

},{"../utils.js":22}],9:[function(require,module,exports){
"use strict";

var domUtils = require('../dom-utils')
  , checkBinding = require('../check-binding')
  ;

module.exports = {
  replace: true
, anchor: true
, link: function(vm) {
    this.vm = vm;
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
},{"../check-binding":3,"../dom-utils":15}],10:[function(require,module,exports){
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

dirs.repeat = require('./repeat.js');
dirs.attr = require('./attr.js');
dirs.model = require('./model.js');
dirs.style = require('./style.js');
dirs.on = require('./on.js');
dirs.component = require('./component.js');
dirs.content = require('./content.js')

module.exports = dirs;

},{"../env.js":16,"../token.js":21,"../utils.js":22,"./attr.js":7,"./component.js":8,"./content.js":9,"./model.js":11,"./on.js":12,"./repeat.js":13,"./style.js":14}],11:[function(require,module,exports){
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

},{"../event-bind.js":18,"../token.js":21,"../utils.js":22}],12:[function(require,module,exports){
"use strict";

//事件监听

var eventBind = require('../event-bind.js');
var utils = require('../utils')

//TODO 移除时的情况
module.exports = {
  watch: false
, link: function(vm) {
    //this.events = {};
    this.vm = vm;
  }
, update: function(events) {
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

},{"../event-bind.js":18,"../utils":22}],13:[function(require,module,exports){
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
      cstr = cstr.__super__.constructor;
    }

    //只继承静态的默认参数
    this.cstr = cstr.extend({}, this.cstr)

    this.curArr = [];
    this.list = [];//子 VM list

    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    var that = this, list = this.list;

    if(utils.isArray(items)) {
      // 在 repeat 指令表达式中
      this.listPath = this.summary.locals.filter(function(path) {
        return !utils.isFunction(that.vm.$get(path))
      });

      //删除元素
      //TODO 删除引用父级的 watchers
      arrDiff(curArr, items).forEach(function(item) {
        var pos = curArr.indexOf(item)
        curArr.splice(pos, 1)
        parentNode.removeChild(list[pos].$el)
        list[pos].__destroy()
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
            parentNode.insertBefore(list[oldPos].$el, list[pos] && list[pos].$el || that.anchor.end)
            parentNode.insertBefore(list[pos].$el, list[oldPos + 1] && list[oldPos + 1].$el || that.anchor.end)
            list[oldPos] = [list[pos], list[pos] = list[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
            list[pos].$index = pos
            list[pos].$update('$index')
          }
        }
      }.bind(this))

      //更新索引
      this.list.forEach(function(vm, i) {
        vm.$index = i
        vm.$el.$index = i
        vm.$update('$index', false)
      });

      if(!items.__dirs__){
        //数组操作方法
        utils.extend(items, {
          $set: function(i, item) {
            items.__dirs__.forEach(function(dir) {
              dir.list[i].$set(item);
            })
          },
          $replace: function(i, item) {
            items.__dirs__.forEach(function(dir) {
              dir.list[i].$replace(item)
            })
          },
          $remove: function(i) {
            items.splice(i, 1);
            items.__dirs__.forEach(function(dir) {
              dir.listPath.forEach(function (path) {
                dir.vm.$update(path)
              });
            })
          }
        });
        arrayMethods.forEach(function(method) {
          items[method] = utils.afterFn(items[method], function() {
            items.__dirs__.forEach(function(dir) {
              dir.listPath.forEach(function(path) {
                dir.vm.$update(path)
              })
            })
          })
        });
        items.__dirs__  = [];
      }
      //一个数组多处使用
      //TODO 移除时的情况
      if(items.__dirs__.indexOf(that) === -1) {
        items.__dirs__.push(that)
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

},{"../env.js":16,"../utils.js":22}],14:[function(require,module,exports){
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

    if(typeof styles === 'string') {
      styleStr = styles;
    }else {
      for (var key in styles) {
        val = styles[key];

        dashKey = key.replace(camelReg, function (upperChar) {
          return '-' + upperChar.toLowerCase();
        });

        if (!isNaN(val) && pixelAttrs.indexOf(dashKey) >= 0) {
          val += 'px';
        }
        styleStr += dashKey + ': ' + val + '; ';
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
},{}],15:[function(require,module,exports){
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

module.exports = {
  tplParse: tplParse,
  createContent: createContent
};
},{"./env.js":16,"./utils":22}],16:[function(require,module,exports){
(function(root){
  "use strict";

  exports.root = root;
  exports.document = root.document || require('jsdom').jsdom();

})((function() {return this})());

},{"jsdom":2}],17:[function(require,module,exports){
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
var getValue = require('./scope').getValue

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

},{"./scope":20}],18:[function(require,module,exports){
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
},{}],19:[function(require,module,exports){
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

  infix(',', 1);
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

},{}],20:[function(require,module,exports){
"use strict";

var utils = require('./utils');

//根据变量及 vm 确定变量所属的真正 vm
var reformScope = function (vm, path) {
  var paths = utils.parseKeyPath(path);
  var cur = vm, local = paths[0];
  var scope = cur, ass, curVm = cur;

  while(cur) {
    curVm = scope = cur;
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

  return { scope: scope, vm:curVm, path: paths.join('.') }
};

//根据 vm 及 key 求值
//求值的结果在 js 及模板中保持一致
var getValue = function(key, scope) {
  var reformed = reformScope(scope, key)

  return reformed.scope[reformed.path]
};

exports.reformScope = reformScope;
exports.getValue = getValue;

},{"./utils":22}],21:[function(require,module,exports){
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
},{}],22:[function(require,module,exports){
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

},{"./env.js":16}],23:[function(require,module,exports){
"use strict";

var evaluate = require('./eval.js')
  , utils = require('./utils.js')
  , parse = require('./parse.js').parse
  , reformScope = require('./scope').reformScope
  ;

function Watcher(vm, dir) {
  var reformed, path, curVm = vm, watchers = [];

  this.state = 1;
  this.dir = dir;
  this.vm = vm;
  this.watchers = [];

  this.val = NaN;

  dir.parse();
  dir.summary = evaluate.summary(dir.ast);

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
    this.watchers.push( watchers );
  }

  this.update();
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
        watchers.splice(i, 1);
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

function watcherUpdate (val) {
  try{
    this.dir.update(val, this.val);
    this.val = val;
  }catch(e){
    console.error(e);
  }
}

utils.extend(Watcher.prototype, {
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
  },
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

},{"./eval.js":17,"./parse.js":19,"./scope":20,"./utils.js":22}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY29tcG9uZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvY29udGVudC5qcyIsInNyYy9kaXJlY3RpdmVzL2luZGV4LmpzIiwic3JjL2RpcmVjdGl2ZXMvbW9kZWwuanMiLCJzcmMvZGlyZWN0aXZlcy9vbi5qcyIsInNyYy9kaXJlY3RpdmVzL3JlcGVhdC5qcyIsInNyYy9kaXJlY3RpdmVzL3N0eWxlLmpzIiwic3JjL2RvbS11dGlscy5qcyIsInNyYy9lbnYuanMiLCJzcmMvZXZhbC5qcyIsInNyYy9ldmVudC1iaW5kLmpzIiwic3JjL3BhcnNlLmpzIiwic3JjL3Njb3BlLmpzIiwic3JjL3Rva2VuLmpzIiwic3JjL3V0aWxzLmpzIiwic3JjL3dhdGNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdWQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmxCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKVxuICAvLywgRXZlbnQgPSByZXF1aXJlKCcuL2V2ZW50LmpzJylcbiAgLCBDbGFzcyA9IHJlcXVpcmUoJy4vY2xhc3MuanMnKVxuICAsIERpciA9IHJlcXVpcmUoJy4vZGlyZWN0aXZlLmpzJylcbiAgLCBDb20gPSByZXF1aXJlKCcuL2NvbXBvbmVudC5qcycpXG4gICwgV2F0Y2hlciA9IHJlcXVpcmUoJy4vd2F0Y2hlci5qcycpXG5cbiAgLCBkaXJzID0gcmVxdWlyZSgnLi9kaXJlY3RpdmVzJylcbiAgLCBkb21VdGlscyA9IHJlcXVpcmUoJy4vZG9tLXV0aWxzLmpzJylcbiAgLCBjaGVja0JpbmRpbmcgPSByZXF1aXJlKCcuL2NoZWNrLWJpbmRpbmcuanMnKVxuICAsIHNjb3BlID0gcmVxdWlyZSgnLi9zY29wZScpXG4gIDtcblxuXG52YXIgaXNPYmplY3QgPSB1dGlscy5pc09iamVjdFxuICAsIGlzVW5kZWZpbmVkID0gdXRpbHMuaXNVbmRlZmluZWRcbiAgLCBpc1BsYWluT2JqZWN0ID0gdXRpbHMuaXNQbGFpbk9iamVjdFxuICAsIHBhcnNlS2V5UGF0aCA9IHV0aWxzLnBhcnNlS2V5UGF0aFxuICAsIGRlZXBTZXQgPSB1dGlscy5kZWVwU2V0XG4gICwgZXh0ZW5kID0gdXRpbHMuZXh0ZW5kXG4gICwgY3JlYXRlID0gdXRpbHMuY3JlYXRlXG4gIDtcblxuLy/orr7nva4gZGlyZWN0aXZlIOWJjee8gFxuZnVuY3Rpb24gc2V0UHJlZml4KG5ld1ByZWZpeCkge1xuICBpZihuZXdQcmVmaXgpe1xuICAgIHRoaXMucHJlZml4ID0gbmV3UHJlZml4O1xuICB9XG59XG5cbnZhciBtZXJnZVByb3BzID0ge1xuICAkZGF0YTogMSwgJGZpbHRlcjogMSwgJHdhdGNoZXJzOiAxXG59O1xuXG52YXIgbGlmZUN5Y2xlcyA9IHtcbiAgJGluaXQ6IHV0aWxzLm5vb3BcbiwgJGRlc3Ryb3k6IHV0aWxzLm5vb3Bcbn07XG5cbi8qKlxuICog5p6E6YCg5Ye95pWwXG4gKiAtLS1cbiAqIEBwYXJhbSB7U3RyaW5nfEVsZW1lbnR9IFt0cGxdIOaooeadvy4g562J5ZCM5LqOIHByb3BzLiR0cGxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvcHNdIOWxnuaApy/mlrnms5VcbiAqKi9cbmZ1bmN0aW9uIEJlZSh0cGwsIHByb3BzKSB7XG4gIGlmKGlzUGxhaW5PYmplY3QodHBsKSkge1xuICAgIHByb3BzID0gdHBsO1xuICAgIHRwbCA9IHByb3BzLiR0cGw7XG4gIH1cbiAgcHJvcHMgPSBwcm9wcyB8fCB7fTtcblxuICB2YXIgZGVmYXVsdHMgPSB7XG4gICAgLy8kIOW8gOWktOeahOaYr+WFseacieWxnuaApy/mlrnms5VcbiAgICAkZGF0YToge31cbiAgLCAkZmlsdGVyczoge31cbiAgLCAkd2F0Y2hlcnM6IHt9XG4gICwgJG1peGluczogW11cblxuICAsICRlbDogdGhpcy4kZWwgfHwgbnVsbFxuICAsICR0YXJnZXQ6IHRoaXMuJHRhcmdldCB8fCBudWxsXG4gICwgJHRwbDogdGhpcy4kdHBsIHx8ICc8ZGl2PjwvZGl2PidcbiAgLCAkY29udGVudDogdGhpcy4kY29udGVudCB8fCBudWxsXG5cbiAgLCAkcGFyZW50OiBudWxsXG4gICwgJHJvb3Q6IHRoaXNcblxuICAgIC8v56eB5pyJ5bGe5oCnL+aWueazlVxuICAsIF93YXRjaGVyczoge31cbiAgLCBfYXNzaWdubWVudHM6IG51bGwvL+W9k+WJjSB2bSDnmoTliKvlkI1cbiAgLCBfcmVsYXRpdmVQYXRoOiBbXVxuICAsIF9fbGlua3M6IFtdXG4gICwgX2lzUmVuZGVyZWQ6IGZhbHNlXG4gIH07XG5cbiAgdmFyIGVsO1xuXG4gIHZhciBtaXhpbnMgPSAoW2RlZmF1bHRzXS5jb25jYXQodGhpcy4kbWl4aW5zIHx8IFtdKSkuY29uY2F0KFtwcm9wc10pXG5cbiAgbWl4aW5zLmZvckVhY2goZnVuY3Rpb24obWl4aW4pIHtcbiAgICB2YXIgcHJvcDtcbiAgICBmb3IodmFyIHByb3BLZXkgaW4gbWl4aW4pIHtcbiAgICAgIGlmKG1peGluLmhhc093blByb3BlcnR5KHByb3BLZXkpKSB7XG4gICAgICAgIGlmICgocHJvcEtleSBpbiBtZXJnZVByb3BzKSAmJiBpc09iamVjdChtaXhpbltwcm9wS2V5XSkpIHtcbiAgICAgICAgICAvL+S/neaMgeWvueS8oOWFpeWxnuaAp+eahOW8leeUqFxuICAgICAgICAgIC8vbWVyZ2VQcm9wcyDkuK3nmoTlsZ7mgKfkvJrooqvpu5jorqTlgLzmianlsZVcbiAgICAgICAgICBwcm9wID0gZXh0ZW5kKHt9LCB0aGlzW3Byb3BLZXldLCBtaXhpbltwcm9wS2V5XSlcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gZXh0ZW5kKG1peGluW3Byb3BLZXldLCBwcm9wKVxuICAgICAgICB9IGVsc2UgaWYgKHByb3BLZXkgaW4gbGlmZUN5Y2xlcykge1xuICAgICAgICAgIHRoaXNbcHJvcEtleV0gPSB1dGlscy5hZnRlckZuKHRoaXNbcHJvcEtleV0sIG1peGluW3Byb3BLZXldKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXNbcHJvcEtleV0gPSBtaXhpbltwcm9wS2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfS5iaW5kKHRoaXMpKVxuXG4gIGlzT2JqZWN0KHRoaXMuJGRhdGEpICYmIGV4dGVuZCh0aGlzLCB0aGlzLiRkYXRhKTtcblxuICB0cGwgPSB0cGwgfHwgdGhpcy4kdHBsO1xuICBlbCA9IGRvbVV0aWxzLnRwbFBhcnNlKHRwbCwgdGhpcy4kdGFyZ2V0LCB0aGlzLiRjb250ZW50KTtcblxuICBpZih0aGlzLiRlbCl7XG4gICAgdGhpcy4kZWwuYXBwZW5kQ2hpbGQoZWwuZWwpO1xuICB9ZWxzZXtcbiAgICB0aGlzLiRlbCA9IGVsLmVsO1xuICB9XG4gIHRoaXMuJHRwbCA9IGVsLnRwbDtcbiAgdGhpcy4kY29udGVudCA9IGVsLmNvbnRlbnQ7XG5cbiAgdGhpcy4kZWwuYmVlID0gdGhpcztcblxuICBpZih0aGlzLiRjb250ZW50KXtcbiAgICB0aGlzLl9fbGlua3MgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMuJHJvb3QsIHRoaXMuJGNvbnRlbnQpO1xuICB9XG4gIHRoaXMuX19saW5rcyA9IHRoaXMuX19saW5rcy5jb25jYXQoIGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcywgdGhpcy4kZWwpICk7XG5cbiAgZm9yKHZhciBrZXkgaW4gdGhpcy4kd2F0Y2hlcnMpIHtcbiAgICB0aGlzLiR3YXRjaChrZXksIHRoaXMuJHdhdGNoZXJzW2tleV0pXG4gIH1cblxuICB0aGlzLiRyZXBsYWNlKHRoaXMuJGRhdGEpO1xuICB0aGlzLl9pc1JlbmRlcmVkID0gdHJ1ZTtcbiAgdGhpcy4kaW5pdCgpO1xufVxuXG4vL+mdmeaAgeWxnuaAp1xuZXh0ZW5kKEJlZSwge2V4dGVuZDogdXRpbHMuYWZ0ZXJGbihDbGFzcy5leHRlbmQsIHV0aWxzLm5vb3AsIGZ1bmN0aW9uKHN1Yikge1xuICAvL+avj+S4quaehOmAoOWHveaVsOmDveacieiHquW3seeahCBkaXJlY3RpdmVzIOWSjCBjb21wb25lbnRzIOW8leeUqFxuICBzdWIuZGlyZWN0aXZlcyA9IGNyZWF0ZSh0aGlzLmRpcmVjdGl2ZXMpO1xuICBzdWIuY29tcG9uZW50cyA9IGNyZWF0ZSh0aGlzLmNvbXBvbmVudHMpO1xufSksIHV0aWxzOiB1dGlsc30sIERpciwgQ29tLCB7XG4gIHNldFByZWZpeDogc2V0UHJlZml4XG4sIHByZWZpeDogJydcbiwgZG9jOiBkb2NcbiwgZGlyZWN0aXZlczoge31cbiwgY29tcG9uZW50czoge31cbiwgbW91bnQ6IGZ1bmN0aW9uKGlkLCBwcm9wcykge1xuICAgIHZhciBlbCA9IGlkLm5vZGVUeXBlID8gaWQgOiBkb2MuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBDb21wID0gdGhpcy5jb21wb25lbnRzW2VsLnRhZ05hbWUudG9Mb3dlckNhc2UoKV07XG4gICAgdmFyIGluc3RhbmNlXG4gICAgaWYoQ29tcCkge1xuICAgICAgaW5zdGFuY2UgPSBuZXcgQ29tcChleHRlbmQoeyR0YXJnZXQ6IGVsfSwgcHJvcHMpKVxuICAgIH1lbHNle1xuICAgICAgaW5zdGFuY2UgPSBuZXcgQmVlKGVsLCBwcm9wcyk7XG4gICAgfVxuICAgIHJldHVybiBpbnN0YW5jZVxuICB9XG59KTtcblxuXG5CZWUuc2V0UHJlZml4KCdiLScpO1xuXG4vL+WGhee9riBkaXJlY3RpdmVcbmZvcih2YXIgZGlyIGluIGRpcnMpIHtcbiAgQmVlLmRpcmVjdGl2ZShkaXIsIGRpcnNbZGlyXSk7XG59XG5cbi8v5a6e5L6L5pa55rOVXG4vLy0tLS1cbmV4dGVuZChCZWUucHJvdG90eXBlLCAvKkV2ZW50LCovIGxpZmVDeWNsZXMsIHtcbiAgLyoqXG4gICAqIOiOt+WPluWxnuaApy/mlrnms5UtLVxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDot6/lvoQv6KGo6L6+5byPXG4gICAqIEByZXR1cm4geyp9XG4gICAqL1xuICAkZ2V0OiBmdW5jdGlvbihrZXlQYXRoKSB7XG4gICAgdmFyIGRpciA9IG5ldyBEaXIoJyRnZXQnLCB7XG4gICAgICBwYXRoOiBrZXlQYXRoXG4gICAgLCB3YXRjaDogZmFsc2VcbiAgICB9KTtcbiAgICBkaXIucGFyc2UoKTtcbiAgICByZXR1cm4gZGlyLmdldFZhbHVlKHRoaXMsIGZhbHNlKVxuICB9XG5cbiAgLyoqXG4gICAqICMjIyBiZWUuJHNldFxuICAgKiDmm7TmlrDlkIjlubYgYC5kYXRhYCDkuK3nmoTmlbDmja4uIOWmguaenOWPquacieS4gOS4quWPguaVsCwg6YKj5LmI6L+Z5Liq5Y+C5pWw5bCG5bm25YWlIC4kZGF0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2tleV0g5pWw5o2u6Lev5b6ELlxuICAgKiBAcGFyYW0ge0FueVR5cGV8T2JqZWN0fSB2YWwg5pWw5o2u5YaF5a65LlxuICAgKi9cbiwgJHNldDogZnVuY3Rpb24oa2V5LCB2YWwpIHtcbiAgICB2YXIgYWRkLCBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcbiAgICB2YXIgcmVmb3JtZWQsIHJlS2V5LCByZVZtID0gdGhpcztcbiAgICBpZihpc1VuZGVmaW5lZChrZXkpKXsgcmV0dXJuIHRoaXM7IH1cblxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpe1xuICAgICAgaWYoaXNPYmplY3Qoa2V5KSkge1xuICAgICAgICBleHRlbmQodHJ1ZSwgdGhpcy4kZGF0YSwga2V5KTtcbiAgICAgICAgZXh0ZW5kKHRydWUsIHRoaXMsIGtleSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgICAgYWRkID0gZGVlcFNldChyZUtleSwgdmFsLCB7fSk7XG4gICAgICBpZihrZXlzWzBdID09PSAnJGRhdGEnKSB7XG4gICAgICAgIGFkZCA9IGFkZC4kZGF0YVxuICAgICAgfVxuICAgICAgaWYoaXNPYmplY3QocmVWbS4kZGF0YSkpIHtcbiAgICAgICAgZXh0ZW5kKHRydWUsIHJlVm0uJGRhdGEsIGFkZCk7XG4gICAgICAgIGV4dGVuZCh0cnVlLCByZVZtLCBhZGQpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHJlVm0uJGRhdGEgPSBhZGQ7XG4gICAgICB9XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHJlVm0sIHJlS2V5LCB2YWwpIDogdXBkYXRlLmNhbGwocmVWbSwga2V5KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICAvKipcbiAgICog5pWw5o2u5pu/5o2iXG4gICAqL1xuLCAkcmVwbGFjZTogZnVuY3Rpb24gKGtleSwgdmFsKSB7XG4gICAgdmFyIGtleXMsIGhhc0tleSA9IGZhbHNlO1xuICAgIHZhciByZWZvcm1lZCwgcmVLZXksIHJlVm0gPSB0aGlzO1xuXG4gICAgaWYoaXNVbmRlZmluZWQoa2V5KSl7IHJldHVybiB0aGlzOyB9XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIGlmKGlzT2JqZWN0KGtleSkpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy4kZGF0YSkuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICBkZWxldGUgdGhpc1trZXldO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIGV4dGVuZCh0aGlzLCBrZXkpO1xuICAgICAgfVxuICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgICAgaWYoa2V5c1swXSAhPT0gJyRkYXRhJykge1xuICAgICAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0uJGRhdGEpO1xuICAgICAgfVxuICAgICAgZGVlcFNldChyZUtleSwgdmFsLCByZVZtKTtcbiAgICB9XG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwocmVWbSwgcmVLZXksIHZhbCkgOiB1cGRhdGUuY2FsbChyZVZtLCBrZXkpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIC8qKlxuICAgKiDmiYvliqjmm7TmlrDmn5Dpg6jliIbmlbDmja5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleVBhdGgg5oyH5a6a5pu05paw5pWw5o2u55qEIGtleVBhdGhcbiAgICogQHBhcmFtIHtCb29sZWFufSBbaXNCdWJibGU9dHJ1ZV0g5piv5ZCm5pu05pawIGtleVBhdGgg55qE54i257qnXG4gICAqL1xuLCAkdXBkYXRlOiBmdW5jdGlvbiAoa2V5UGF0aCwgaXNCdWJibGUpIHtcbiAgICBpc0J1YmJsZSA9IGlzQnViYmxlICE9PSBmYWxzZTtcblxuICAgIHZhciBrZXlzID0gcGFyc2VLZXlQYXRoKGtleVBhdGgucmVwbGFjZSgvXlxcJGRhdGFcXC4vLCAnJykpLCBrZXksIGF0dHJzO1xuICAgIHZhciB3YXRjaGVycztcblxuICAgIHdoaWxlKGtleSA9IGtleXMuam9pbignLicpKSB7XG4gICAgICB3YXRjaGVycyA9IHRoaXMuX3dhdGNoZXJzW2tleV0gfHwgW107XG5cbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gd2F0Y2hlcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHdhdGNoZXJzW2ldLnVwZGF0ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZihpc0J1YmJsZSkge1xuICAgICAgICBrZXlzLnBvcCgpO1xuICAgICAgICAvL+acgOe7iOmDveWGkuazoeWIsCAkZGF0YVxuICAgICAgICBpZigha2V5cy5sZW5ndGggJiYga2V5ICE9PSAnJGRhdGEnKXtcbiAgICAgICAgICBrZXlzLnB1c2goJyRkYXRhJyk7XG4gICAgICAgIH1cbiAgICAgIH1lbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhdHRycyA9IHRoaXMuJGdldChrZXlQYXRoKTtcblxuICAgIC8v5ZCM5pe25pu05paw5a2Q6Lev5b6EXG4gICAgaWYoaXNPYmplY3QoYXR0cnMpICYmICF1dGlscy5pc0FycmF5KGF0dHJzKSkge1xuICAgICAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuICAgICAgICB0aGlzLiR1cGRhdGUoa2V5UGF0aCArICcuJyArIGF0dHIsIGZhbHNlKTtcbiAgICAgIH0uYmluZCh0aGlzKSlcbiAgICB9XG5cbiAgICBpZihpc0J1YmJsZSkge1xuICAgICAgaWYodGhpcy4kcGFyZW50KSB7XG4gICAgICAgIC8v5ZCM5q2l5pu05paw54i2IHZtIOWvueW6lOmDqOWIhlxuICAgICAgICB0aGlzLl9yZWxhdGl2ZVBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgIHRoaXMuJHBhcmVudC4kdXBkYXRlKHBhdGgpO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy/mm7TmlrDmlbDnu4Tplb/luqZcbiAgICBpZih1dGlscy5pc0FycmF5KGF0dHJzKSkge1xuICAgICAgdGhpcy4kdXBkYXRlKGtleVBhdGggKyAnLmxlbmd0aCcsIGZhbHNlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuLCAkd2F0Y2g6IGZ1bmN0aW9uIChrZXlQYXRoLCBjYWxsYmFjaykge1xuICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICB2YXIgdXBkYXRlID0gY2FsbGJhY2suYmluZCh0aGlzKTtcbiAgICAgIHVwZGF0ZS5fb3JpZ2luRm4gPSBjYWxsYmFjaztcbiAgICAgIFdhdGNoZXIuYWRkV2F0Y2hlci5jYWxsKHRoaXMsIG5ldyBEaXIoJyR3YXRjaCcsIHtwYXRoOiBrZXlQYXRoLCB1cGRhdGU6IHVwZGF0ZX0pKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuLCAkdW53YXRjaDogZnVuY3Rpb24gKGtleVBhdGgsIGNhbGxiYWNrKSB7XG4gICAgV2F0Y2hlci51bndhdGNoKHRoaXMsIGtleVBhdGgsIGNhbGxiYWNrKVxuICAgIHJldHVybiB0aGlzO1xuICB9XG4sIF9fZGVzdHJveTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fX2xpbmtzLmZvckVhY2goZnVuY3Rpb24od2FjaGVyKSB7XG4gICAgICB3YWNoZXIudW53YXRjaCgpXG4gICAgfSlcbiAgICB0aGlzLl9fbGlua3MgPSBbXTtcbiAgICB0aGlzLiRkZXN0cm95KClcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHVwZGF0ZSAoa2V5UGF0aCwgZGF0YSkge1xuICB2YXIga2V5UGF0aHM7XG5cbiAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGRhdGEgPSBrZXlQYXRoO1xuICB9ZWxzZXtcbiAgICBrZXlQYXRocyA9IFtrZXlQYXRoXTtcbiAgfVxuXG4gIGlmKCFrZXlQYXRocykge1xuICAgIGlmKGlzT2JqZWN0KGRhdGEpKSB7XG4gICAgICBrZXlQYXRocyA9IE9iamVjdC5rZXlzKGRhdGEpO1xuICAgIH1lbHNle1xuICAgICAgLy8uJGRhdGEg5pyJ5Y+v6IO95piv5Z+65pys57G75Z6L5pWw5o2uXG4gICAgICBrZXlQYXRocyA9IFsnJGRhdGEnXTtcbiAgICB9XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBwYXRoOyBwYXRoID0ga2V5UGF0aHNbaV07IGkrKyl7XG4gICAgdGhpcy4kdXBkYXRlKHBhdGgsIHRydWUpO1xuICB9XG5cbn1cblxuQmVlLnZlcnNpb24gPSAnMC4yLjAnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJlZTtcbiIsbnVsbCwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICA7XG5cbnZhciBOT0RFVFlQRSA9IHtcbiAgICBFTEVNRU5UOiAxXG4gICwgQVRUUjogMlxuICAsIFRFWFQ6IDNcbiAgLCBDT01NRU5UOiA4XG4gICwgRlJBR01FTlQ6IDExXG59O1xuXG5kb2MuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKVxuXG4vL+mBjeWOhiBkb20g5qCRXG5mdW5jdGlvbiB3YWxrKGVsKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdLCBkaXJSZXN1bHQ7XG4gIGlmKGVsLm5vZGVUeXBlID09PSBOT0RFVFlQRS5GUkFHTUVOVCkge1xuICAgIGVsID0gZWwuY2hpbGROb2RlcztcbiAgfVxuXG4gIGlmKCgnbGVuZ3RoJyBpbiBlbCkgJiYgdXRpbHMuaXNVbmRlZmluZWQoZWwubm9kZVR5cGUpKXtcbiAgICAvL25vZGUgbGlzdFxuICAgIC8v5a+55LqOIG5vZGVsaXN0IOWmguaenOWFtuS4reacieWMheWQqyB7e3RleHR9fSDnm7TmjqXph4/nmoTooajovr7lvI8sIOaWh+acrOiKgueCueS8muiiq+WIhuWJsiwg5YW26IqC54K55pWw6YeP5Y+v6IO95Lya5Yqo5oCB5aKe5YqgXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGVsLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGVsW2ldKSApO1xuICAgIH1cbiAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBzd2l0Y2ggKGVsLm5vZGVUeXBlKSB7XG4gICAgY2FzZSBOT0RFVFlQRS5FTEVNRU5UOlxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5DT01NRU5UOlxuICAgICAgLy/ms6jph4roioLngrlcbiAgICAgIHJldHVybiB3YXRjaGVycztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuVEVYVDpcbiAgICAgIC8v5paH5pys6IqC54K5XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggY2hlY2tUZXh0LmNhbGwodGhpcywgZWwpICk7XG4gICAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgLy90ZW1wbGF0ZSBzaGltXG4gICAgaWYoIWVsLmNvbnRlbnQpIHtcbiAgICAgIGVsLmNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgd2hpbGUoZWwuY2hpbGROb2Rlc1swXSkge1xuICAgICAgICBlbC5jb250ZW50LmFwcGVuZENoaWxkKGVsLmNoaWxkTm9kZXNbMF0pXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZGlyUmVzdWx0ID0gY2hlY2tBdHRyLmNhbGwodGhpcywgZWwpO1xuICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdChkaXJSZXN1bHQud2F0Y2hlcnMpXG4gIGlmKGRpclJlc3VsdC50ZXJtaW5hbCl7XG4gICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgaWYoZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgZWwuY29udGVudCkgKVxuICB9XG5cbiAgZm9yKHZhciBjaGlsZCA9IGVsLmZpcnN0Q2hpbGQsIG5leHQ7IGNoaWxkOyApe1xuICAgIG5leHQgPSBjaGlsZC5uZXh0U2libGluZztcbiAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGNoaWxkKSApO1xuICAgIGNoaWxkID0gbmV4dDtcbiAgfVxuXG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG4vL+mBjeWOhuWxnuaAp1xuZnVuY3Rpb24gY2hlY2tBdHRyKGVsKSB7XG4gIHZhciBjc3RyID0gdGhpcy5jb25zdHJ1Y3RvclxuICAgICwgcHJlZml4ID0gY3N0ci5wcmVmaXhcbiAgICAsIGRpcnMgPSBjc3RyLmRpcmVjdGl2ZS5nZXREaXIoZWwsIGNzdHIuZGlyZWN0aXZlcywgY3N0ci5jb21wb25lbnRzLCBwcmVmaXgpXG4gICAgLCBkaXJcbiAgICAsIHRlcm1pbmFsUHJpb3JpdHksIHdhdGNoZXJzID0gW11cbiAgICAsIHJlc3VsdCA9IHt9O1xuICA7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBkaXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGRpciA9IGRpcnNbaV07XG4gICAgZGlyLmRpcnMgPSBkaXJzO1xuXG4gICAgLy/lr7nkuo4gdGVybWluYWwg5Li6IHRydWUg55qEIGRpcmVjdGl2ZSwg5Zyo6Kej5p6Q5a6M5YW255u45ZCM5p2D6YeN55qEIGRpcmVjdGl2ZSDlkI7kuK3mlq3pgY3ljobor6XlhYPntKBcbiAgICBpZih0ZXJtaW5hbFByaW9yaXR5ID4gZGlyLnByaW9yaXR5KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoZGlyLm5vZGVOYW1lKTtcblxuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKSApO1xuXG4gICAgaWYoZGlyLnRlcm1pbmFsKSB7XG4gICAgICByZXN1bHQudGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQud2F0Y2hlcnMgPSB3YXRjaGVyc1xuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy/lpITnkIbmlofmnKzoioLngrnkuK3nmoTnu5HlrprljaDkvY3nrKYoe3suLi59fSlcbmZ1bmN0aW9uIGNoZWNrVGV4dChub2RlKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdO1xuICBpZih0b2tlbi5oYXNUb2tlbihub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICB2YXIgdG9rZW5zID0gdG9rZW4ucGFyc2VUb2tlbihub2RlLm5vZGVWYWx1ZSlcbiAgICAgICwgdGV4dE1hcCA9IHRva2Vucy50ZXh0TWFwXG4gICAgICAsIGVsID0gbm9kZS5wYXJlbnROb2RlXG4gICAgICAsIGRpcnMgPSB0aGlzLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXNcbiAgICAgICwgdCwgZGlyXG4gICAgICA7XG5cbiAgICAvL+Wwhnt7a2V5fX3liIblibLmiJDljZXni6znmoTmlofmnKzoioLngrlcbiAgICBpZih0ZXh0TWFwLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRleHRNYXAuZm9yRWFjaChmdW5jdGlvbih0ZXh0KSB7XG4gICAgICAgIHZhciB0biA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKHRuLCBub2RlKTtcbiAgICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoY2hlY2tUZXh0LmNhbGwodGhpcywgdG4pKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICBlbC5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9ZWxzZXtcbiAgICAgIHQgPSB0b2tlbnNbMF07XG4gICAgICAvL+WGhee9ruWQhOWNoOS9jeespuWkhOeQhi5cbiAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZSh0LmVzY2FwZSA/IGRpcnMudGV4dCA6IGRpcnMuaHRtbCk7XG4gICAgICB3YXRjaGVycyA9IHNldEJpbmRpbmcuY2FsbCh0aGlzLCB1dGlscy5leHRlbmQoZGlyLCB0LCB7XG4gICAgICAgIGVsOiBub2RlXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG5mdW5jdGlvbiBzZXRCaW5kaW5nKGRpcikge1xuICB2YXIgd2F0Y2hlclxuICBpZihkaXIucmVwbGFjZSkge1xuICAgIHZhciBlbCA9IGRpci5lbDtcbiAgICBpZih1dGlscy5pc0Z1bmN0aW9uKGRpci5yZXBsYWNlKSkge1xuICAgICAgZGlyLm5vZGUgPSBkaXIucmVwbGFjZSgpO1xuICAgIH1lbHNlIGlmKGRpci5yZXBsYWNlKXtcbiAgICAgIGRpci5ub2RlID0gZG9jLmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICB9XG5cbiAgICBkaXIuZWwgPSBkaXIuZWwucGFyZW50Tm9kZTtcbiAgICBkaXIuZWwucmVwbGFjZUNoaWxkKGRpci5ub2RlLCBlbCk7XG4gIH1cblxuICBkaXIubGluayh0aGlzKTtcblxuICB3YXRjaGVyID0gV2F0Y2hlci5hZGRXYXRjaGVyLmNhbGwodGhpcywgZGlyKVxuICByZXR1cm4gd2F0Y2hlciA/IFt3YXRjaGVyXSA6IFtdXG59XG5cbmZ1bmN0aW9uIHVuQmluZGluZyh3YXRjaGVycykge1xuICB3YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICB3YXRjaGVyLnVud2F0Y2goKVxuICB9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2Fsazogd2FsayxcbiAgdW5CaW5kaW5nOiB1bkJpbmRpbmdcbn07XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlscy5qcycpLmV4dGVuZDtcblxudmFyIENsYXNzID0ge1xuICAvKiogXG4gICAqIOaehOmAoOWHveaVsOe7p+aJvy4gXG4gICAqIOWmgjogYHZhciBDYXIgPSBCZWUuZXh0ZW5kKHtkcml2ZTogZnVuY3Rpb24oKXt9fSk7IG5ldyBDYXIoKTtgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvdG9Qcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV5Y6f5Z6L5a+56LGhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbc3RhdGljUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxlemdmeaAgeWxnuaAp1xuICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0g5a2Q5p6E6YCg5Ye95pWwXG4gICAqL1xuICBleHRlbmQ6IGZ1bmN0aW9uIChwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuICAgIHByb3RvUHJvcHMgPSBwcm90b1Byb3BzIHx8IHt9O1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IHByb3RvUHJvcHMuaGFzT3duUHJvcGVydHkoJ2NvbnN0cnVjdG9yJykgPyBwcm90b1Byb3BzLmNvbnN0cnVjdG9yIDogZnVuY3Rpb24oKXsgcmV0dXJuIHN1cC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgdmFyIHN1cCA9IHRoaXM7XG4gICAgdmFyIEZuID0gZnVuY3Rpb24oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjb25zdHJ1Y3RvcjsgfTtcbiAgICBcbiAgICBGbi5wcm90b3R5cGUgPSBzdXAucHJvdG90eXBlO1xuICAgIGNvbnN0cnVjdG9yLnByb3RvdHlwZSA9IG5ldyBGbigpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdGF0aWNQcm9wcywge19fc3VwZXJfXzogc3VwLnByb3RvdHlwZX0pO1xuICAgIFxuICAgIHJldHVybiBjb25zdHJ1Y3RvcjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4vKipcbiAqIOazqOWGjOe7hOS7tlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWUg6Ieq5a6a5LmJ57uE5Lu255qE5qCH562+5ZCNXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHByb3BzfSBDb21wb25lbnQg6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwIC8g5p6E6YCg5Ye95pWw5Y+C5pWwXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0g6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwXG4gKi9cbmZ1bmN0aW9uIHRhZyh0YWdOYW1lLCBDb21wb25lbnQsIHN0YXRpY3MpIHtcbiAgdmFyIHRhZ3MgPSB0aGlzLmNvbXBvbmVudHMgPSB0aGlzLmNvbXBvbmVudHMgfHwge307XG5cbiAgdGhpcy5kb2MuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTsvL2ZvciBvbGQgSUVcblxuICBpZih1dGlscy5pc09iamVjdChDb21wb25lbnQpKSB7XG4gICAgQ29tcG9uZW50ID0gdGhpcy5leHRlbmQoQ29tcG9uZW50LCBzdGF0aWNzKTtcbiAgfVxuICByZXR1cm4gdGFnc1t0YWdOYW1lXSA9IENvbXBvbmVudDtcbn1cblxuZXhwb3J0cy50YWcgPSBleHBvcnRzLmNvbXBvbmVudCA9IHRhZztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcblxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8qKlxuICog5Li6IEJlZSDmnoTpgKDlh73mlbDmt7vliqDmjIfku6QgKGRpcmVjdGl2ZSkuIGBCZWUuZGlyZWN0aXZlYFxuICogQHBhcmFtIHtTdHJpbmd9IGtleSBkaXJlY3RpdmUg5ZCN56ewXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdHNdIGRpcmVjdGl2ZSDlj4LmlbBcbiAqIEBwYXJhbSB7TnVtYmVyfSBvcHRzLnByaW9yaXR5PTAgZGlyZWN0aXZlIOS8mOWFiOe6py4g5ZCM5LiA5Liq5YWD57Sg5LiK55qE5oyH5Luk5oyJ54Wn5LyY5YWI57qn6aG65bqP5omn6KGMLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLnRlcm1pbmFsPWZhbHNlIOaJp+ihjOivpSBkaXJlY3RpdmUg5ZCOLCDmmK/lkKbnu4jmraLlkI7nu60gZGlyZWN0aXZlIOaJp+ihjC5cbiAqICAgdGVybWluYWwg5Li655yf5pe2LCDkuI7or6UgZGlyZWN0aXZlIOS8mOWFiOe6p+ebuOWQjOeahCBkaXJlY3RpdmUg5LuN5Lya57un57ut5omn6KGMLCDovoPkvY7kvJjlhYjnuqfnmoTmiY3kvJrooqvlv73nlaUuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMuYW5jaG9yIGFuY2hvciDkuLogdHJ1ZSDml7YsIOS8muWcqOaMh+S7pOiKgueCueWJjeWQjuWQhOS6p+eUn+S4gOS4quepuueZveeahOagh+iusOiKgueCuS4g5YiG5Yir5a+55bqUIGBhbmNob3JzLnN0YXJ0YCDlkowgYGFuY2hvcnMuZW5kYFxuICovXG5mdW5jdGlvbiBkaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHZhciBkaXJzID0gdGhpcy5kaXJlY3RpdmVzID0gdGhpcy5kaXJlY3RpdmVzIHx8IHt9O1xuXG4gIHJldHVybiBkaXJzW2tleV0gPSBuZXcgRGlyZWN0aXZlKGtleSwgb3B0cyk7XG59XG5cbmZ1bmN0aW9uIERpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdGhpcy50eXBlID0ga2V5O1xuICB1dGlscy5leHRlbmQodGhpcywgb3B0cyk7XG59XG5cbkRpcmVjdGl2ZS5wcm90b3R5cGUgPSB7XG4gIHByaW9yaXR5OiAwLy/mnYPph41cbiwgbGluazogdXRpbHMubm9vcC8v5Yid5aeL5YyW5pa55rOVXG4sIHVuTGluazogdXRpbHMubm9vcC8v6ZSA5q+B5Zue6LCDXG4sIHVwZGF0ZTogdXRpbHMubm9vcC8v5pu05paw5pa55rOVXG4sIHRlYXJEb3duOiB1dGlscy5ub29wXG4sIHRlcm1pbmFsOiBmYWxzZS8v5piv5ZCm57uI5q2iXG4sIHJlcGxhY2U6IGZhbHNlLy/mmK/lkKbmm7/mjaLlvZPliY3lhYPntKAuIOWmguaenOaYrywg5bCG55So5LiA5Liq56m655qE5paH5pys6IqC54K55pu/5o2i5b2T5YmN5YWD57SgXG4sIHdhdGNoOiB0cnVlLy/mmK/lkKbnm5Hmjqcga2V5IOeahOWPmOWMllxuXG4sIGFuY2hvcjogZmFsc2VcbiwgYW5jaG9yczogbnVsbFxuXG4gIC8v5b2TIGFuY2hvciDkuLogdHJ1ZSDml7YsIOiOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gdGhpcy5hbmNob3JzLnN0YXJ0Lm5leHRTaWJsaW5nO1xuICAgIGlmKHRoaXMuYW5jaG9yICYmIG5vZGUpIHtcbiAgICAgIHdoaWxlKG5vZGUgIT09IHRoaXMuYW5jaG9ycy5lbmQpe1xuICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG4gIC8v6Kej5p6Q6KGo6L6+5byPXG4sIHBhcnNlOiBmdW5jdGlvbigpIHtcbiAgICB0cnl7XG4gICAgICB0aGlzLmFzdCA9IHBhcnNlKHRoaXMucGF0aCwgdGhpcy50eXBlKTtcbiAgICB9Y2F0Y2goZSkge1xuICAgICAgdGhpcy5hc3QgPSB7fTtcbiAgICAgIGUubWVzc2FnZSA9ICdTeW50YXhFcnJvciBpbiBcIicgKyB0aGlzLnBhdGggKyAnXCIgfCAnICsgZS5tZXNzYWdlO1xuICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICB9XG4gIH1cbiAgLy/ooajovr7lvI/msYLlgLxcbiAgLy9mb3JnaXZlW3RydWVdOiDmmK/lkKblsIYgdW5kZWZpbmVkIOWPiiBudWxsIOi9rOS4uuepuuWtl+esplxuLCBnZXRWYWx1ZTogZnVuY3Rpb24oc2NvcGUsIGZvcmdpdmUpIHtcbiAgICBmb3JnaXZlID0gZm9yZ2l2ZSAhPT0gZmFsc2U7XG4gICAgdmFyIHZhbDtcblxuICAgIHRyeXtcbiAgICAgIHZhbCA9IGV2YWx1YXRlLmV2YWwodGhpcy5hc3QsIHNjb3BlLCB0aGlzKTtcbiAgICB9Y2F0Y2goZSl7XG4gICAgICB2YWwgPSAnJztcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICAgIGlmKGZvcmdpdmUgJiYgKHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSkge1xuICAgICAgdmFsID0gJyc7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG4gIH1cbn07XG5cbnZhciBhdHRyUG9zdFJlZyA9IC9cXD8kLztcblxuLy/ojrflj5bkuIDkuKrlhYPntKDkuIrmiYDmnInnlKggSFRNTCDlsZ7mgKflrprkuYnnmoTmjIfku6RcbmZ1bmN0aW9uIGdldERpcihlbCwgZGlyZWN0aXZlcywgY29tcG9uZW50cywgcHJlZml4KSB7XG4gIHByZWZpeCA9IHByZWZpeCB8fCAnJztcbiAgZGlyZWN0aXZlcyA9IGRpcmVjdGl2ZXMgfHwge307XG5cbiAgdmFyIGF0dHIsIGF0dHJOYW1lLCBkaXJOYW1lLCBwcm90b1xuICAgICwgZGlycyA9IFtdLCBkaXIsIGFuY2hvcnMgPSB7fVxuICAgICwgcGFyZW50ID0gZWwucGFyZW50Tm9kZVxuICAgICwgbm9kZU5hbWUgPSBlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpXG4gICAgO1xuXG4gIC8v5a+55LqO6Ieq5a6a5LmJ5qCH562+LCDlsIblhbbovazkuLogZGlyZWN0aXZlXG4gIGlmKG5vZGVOYW1lIGluIGNvbXBvbmVudHMpIHtcbiAgICBlbC5zZXRBdHRyaWJ1dGUocHJlZml4ICsgJ2NvbXBvbmVudCcsIG5vZGVOYW1lKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IGVsLmF0dHJpYnV0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgIGF0dHIgPSBlbC5hdHRyaWJ1dGVzW2ldO1xuICAgIGF0dHJOYW1lID0gYXR0ci5ub2RlTmFtZTtcbiAgICBkaXJOYW1lID0gYXR0ck5hbWUuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gICAgcHJvdG8gPSB7ZWw6IGVsLCBub2RlOiBhdHRyLCBub2RlTmFtZTogYXR0ck5hbWUsIHBhdGg6IGF0dHIudmFsdWV9O1xuICAgIGRpciA9IG51bGw7XG5cbiAgICBpZihhdHRyTmFtZS5pbmRleE9mKHByZWZpeCkgPT09IDAgJiYgKGRpck5hbWUgaW4gZGlyZWN0aXZlcykpIHtcbiAgICAgIC8v5oyH5LukXG4gICAgICBkaXIgPSBjcmVhdGUoZGlyZWN0aXZlc1tkaXJOYW1lXSk7XG4gICAgICBkaXIuZGlyTmFtZSA9IGRpck5hbWUvL2RpciDlkI1cbiAgICB9ZWxzZSBpZih0b2tlbi5oYXNUb2tlbihhdHRyLnZhbHVlKSkge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/lj6/og73mnInlpJrkuKrooajovr7lvI/ljLpcbiAgICAgIHRva2VuLnBhcnNlVG9rZW4oYXR0ci52YWx1ZSkuZm9yRWFjaChmdW5jdGlvbihvcmlnaW4pIHtcbiAgICAgICAgb3JpZ2luLmRpck5hbWUgPSBhdHRyTmFtZS5pbmRleE9mKHByZWZpeCkgPT09IDAgPyBkaXJOYW1lIDogYXR0ck5hbWUgO1xuICAgICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGNyZWF0ZShkaXJlY3RpdmVzLmF0dHIpLCBwcm90bywgb3JpZ2luKSlcbiAgICAgIH0pO1xuICAgICAgLy/nlLHkuo7lt7Lnn6XlsZ7mgKfooajovr7lvI/kuI3lrZjlnKggYW5jaG9yLCDmiYDku6Xnm7TmjqXot7Pov4fkuIvpnaLnmoTmo4DmtYtcbiAgICB9ZWxzZSBpZihhdHRyUG9zdFJlZy50ZXN0KGF0dHJOYW1lKSkge1xuICAgICAgLy/mnaHku7blsZ7mgKfmjIfku6RcbiAgICAgIGRpciA9IHV0aWxzLmV4dGVuZChjcmVhdGUoZGlyZWN0aXZlcy5hdHRyKSwgeyBkaXJOYW1lOiBhdHRyTmFtZS5yZXBsYWNlKGF0dHJQb3N0UmVnLCAnJyksIGNvbmRpdGlvbmFsOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGlmKGRpcikge1xuICAgICAgaWYoZGlyLmFuY2hvciAmJiAhYW5jaG9ycy5zdGFydCkge1xuICAgICAgICAvL+WQjOS4gOS4quWFg+e0oOS4iueahCBkaXJlY3RpdmUg5YWx5Lqr5ZCM5LiA5a+56ZSa54K5XG4gICAgICAgIGFuY2hvcnMuc3RhcnQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLnN0YXJ0LCBlbCk7XG5cbiAgICAgICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgZW5kJyk7XG4gICAgICAgIGlmKGVsLm5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLmVuZCwgZWwubmV4dFNpYmxpbmcpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoYW5jaG9ycy5lbmQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkaXIuYW5jaG9ycyA9IGRpci5hbmNob3IgPyBhbmNob3JzIDogbnVsbDtcbiAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoZGlyLCBwcm90bykpO1xuICAgIH1cbiAgfVxuICBkaXJzLnNvcnQoZnVuY3Rpb24oZDAsIGQxKSB7XG4gICAgcmV0dXJuIGQxLnByaW9yaXR5IC0gZDAucHJpb3JpdHk7XG4gIH0pO1xuICByZXR1cm4gZGlycztcbn1cblxuRGlyZWN0aXZlLmRpcmVjdGl2ZSA9IGRpcmVjdGl2ZTtcbmRpcmVjdGl2ZS5nZXREaXIgPSBnZXREaXI7XG5cbm1vZHVsZS5leHBvcnRzID0gRGlyZWN0aXZlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5bGe5oCn5oyH5LukXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkgey8vYXR0ciBiaW5kaW5nXG4gICAgICB0aGlzLmF0dHJzID0ge307XG4gICAgfWVsc2Uge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/pu5jorqTlsIblgLznva7nqbosIOmYsuatouihqOi+vuW8j+WGheWPmOmHj+S4jeWtmOWcqFxuICAgICAgdGhpcy51cGRhdGUoJycpXG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgbmV3QXR0cnMgPSB7fTtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkge1xuICAgICAgZm9yKHZhciBhdHRyIGluIHZhbCkge1xuICAgICAgICBzZXRBdHRyKGVsLCBhdHRyLCB2YWxbYXR0cl0pO1xuICAgICAgICAvL2lmKHZhbFthdHRyXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmF0dHJzW2F0dHJdO1xuICAgICAgICAvL31cbiAgICAgICAgbmV3QXR0cnNbYXR0cl0gPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvL+enu+mZpOS4jeWcqOS4iuasoeiusOW9leS4reeahOWxnuaAp1xuICAgICAgZm9yKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgcmVtb3ZlQXR0cihlbCwgYXR0cik7XG4gICAgICB9XG4gICAgICB0aGlzLmF0dHJzID0gbmV3QXR0cnM7XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLmNvbmRpdGlvbmFsKSB7XG4gICAgICAgIHZhbCA/IHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdmFsKSA6IHJlbW92ZUF0dHIoZWwsIHRoaXMuZGlyTmFtZSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy50ZXh0TWFwW3RoaXMucG9zaXRpb25dID0gdmFsICYmICh2YWwgKyAnJyk7XG4gICAgICAgIHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdGhpcy50ZXh0TWFwLmpvaW4oJycpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblxuLy9JRSDmtY/op4jlmajlvojlpJrlsZ7mgKfpgJrov4cgYHNldEF0dHJpYnV0ZWAg6K6+572u5ZCO5peg5pWILiBcbi8v6L+Z5Lqb6YCa6L+HIGBlbFthdHRyXSA9IHZhbHVlYCDorr7nva7nmoTlsZ7mgKfljbTog73lpJ/pgJrov4cgYHJlbW92ZUF0dHJpYnV0ZWAg5riF6ZmkLlxuZnVuY3Rpb24gc2V0QXR0cihlbCwgYXR0ciwgdmFsKXtcbiAgdHJ5e1xuICAgIGlmKCgoYXR0ciBpbiBlbCkgfHwgYXR0ciA9PT0gJ2NsYXNzJykpe1xuICAgICAgaWYoYXR0ciA9PT0gJ3N0eWxlJyAmJiBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCB2YWwpO1xuICAgICAgfWVsc2UgaWYoYXR0ciA9PT0gJ2NsYXNzJyl7XG4gICAgICAgIGVsLmNsYXNzTmFtZSA9IHZhbDtcbiAgICAgIH1lbHNle1xuICAgICAgICBlbFthdHRyXSA9IHR5cGVvZiBlbFthdHRyXSA9PT0gJ2Jvb2xlYW4nID8gdHJ1ZSA6IHZhbDtcbiAgICAgIH1cbiAgICB9XG4gIH1jYXRjaChlKXt9XG4gIC8vY2hyb21lIHNldGF0dHJpYnV0ZSB3aXRoIGB7e319YCB3aWxsIHRocm93IGFuIGVycm9yXG4gIGVsLnNldEF0dHJpYnV0ZShhdHRyLCB2YWwpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBdHRyKGVsLCBhdHRyKSB7XG4gIGVsLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgZGVsZXRlIGVsW2F0dHJdO1xufSIsIi8vY29tcG9uZW50IGFzIGRpcmVjdGl2ZVxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAtMTBcbiwgd2F0Y2g6IGZhbHNlXG4sIHVuTGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jb21wb25lbnQgJiYgdGhpcy5jb21wb25lbnQuX19kZXN0cm95KClcbiAgfVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIGNvbU5hbWUgPSB0aGlzLnBhdGg7XG4gICAgdmFyIGNvbXBvbmVudHMgPSB2bS5jb25zdHJ1Y3Rvci5jb21wb25lbnRzO1xuICAgIHZhciBDb21wLCBjb21wO1xuICAgIHZhciBkaXJzID0gW10sICRkYXRhID0ge307XG4gICAgdmFyIGF0dHJzO1xuXG4gICAgaWYoY29tTmFtZSBpbiBjb21wb25lbnRzKSB7XG4gICAgICBDb21wID0gY29tcG9uZW50c1tjb21OYW1lXTtcblxuICAgICAgLy9UT0RPXG4gICAgICBpZihDb21wID09PSB2bS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGRpcnMgPSB0aGlzLmRpcnM7XG5cbiAgICAgIGRpcnMgPSBkaXJzLmZpbHRlcihmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHZhciBjdXJQYXRoLCBjb21QYXRoO1xuXG4gICAgICAgIGN1clBhdGggPSBkaXIucGF0aDtcbiAgICAgICAgaWYoZGlyLnR5cGUgPT09ICd3aXRoJyB8fCBkaXIuZGlyTmFtZSA9PT0gJ2F0dHInKSB7XG4gICAgICAgICAgLy/ov5nph4wgYXR0ciDlj4ogd2l0aCDmjIfku6TmlYjmnpzkuIDmoLdcbiAgICAgICAgICBjb21QYXRoID0gJyRkYXRhJ1xuICAgICAgICAgIHV0aWxzLmV4dGVuZCgkZGF0YSwgdm0uJGdldChjdXJQYXRoKSlcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgY29tUGF0aCA9IGRpci5kaXJOYW1lO1xuICAgICAgICAgICRkYXRhW2NvbVBhdGhdID0gdm0uJGdldChjdXJQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8v55uR5ZCs54i257uE5Lu25pu05pawLCDlkIzmraXmlbDmja5cbiAgICAgICAgdm0uJHdhdGNoKGN1clBhdGgsIGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgICBpZihjb21wKXtcbiAgICAgICAgICAgIHZhbCA9IGRpci50ZXh0TWFwID8gZGlyLnRleHRNYXAuam9pbignJykgOiB2YWw7XG4gICAgICAgICAgICBjb21wLiRzZXQoY29tUGF0aCwgdmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9KTtcblxuICAgICAgYXR0cnMgPSBlbC5hdHRyaWJ1dGVzO1xuICAgICAgLy/mma7pgJrlsZ7mgKdcbiAgICAgIGZvcih2YXIgaSA9IGF0dHJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICRkYXRhW2F0dHJzWzBdLm5vZGVOYW1lXSA9IGF0dHJzWzBdLnZhbHVlO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmNvbXBvbmVudCA9IGNvbXAgPSBuZXcgQ29tcCh7XG4gICAgICAgICR0YXJnZXQ6IGVsLFxuICAgICAgICAvLyRyb290OiB2bS4kcm9vdCxcbiAgICAgICAgJGRhdGE6IHV0aWxzLmV4dGVuZCh7fSwgQ29tcC5wcm90b3R5cGUuJGRhdGEsICRkYXRhKVxuICAgICAgfSk7XG5cbiAgICAgIC8v55u05o6l5bCGY29tcG9uZW50IOS9nOS4uuagueWFg+e0oOaXtiwg5ZCM5q2l6Lef5paw5a655ZmoIC4kZWwg5byV55SoXG4gICAgICBpZih2bS4kZWwgPT09IGVsKSB7XG4gICAgICAgIHZtLl9fcmVmID0gY29tcDtcbiAgICAgICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgY29tTmFtZSArICcgbm90IGRlZmluZWQhIElnbm9yZScpO1xuICAgIH1cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9tVXRpbHMgPSByZXF1aXJlKCcuLi9kb20tdXRpbHMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZXBsYWNlOiB0cnVlXG4sIGFuY2hvcjogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHRoaXMudm0gPSB2bTtcbiAgICB0aGlzLndhdGNoZXJzID0gW107XG4gIH1cbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci51bndhdGNoKClcbiAgICB9KTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHRwbCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKVxuICAgIHZhciBwYXJlbnQgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGVcblxuICAgIG5vZGVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH0pO1xuXG4gICAgdGhpcy51bkxpbmsoKTtcblxuICAgIHZhciBjb250ZW50ID0gZG9tVXRpbHMuY3JlYXRlQ29udGVudCh0cGwpXG5cbiAgICB0aGlzLndhdGNoZXJzID0gY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh0aGlzLnZtLCBjb250ZW50KVxuICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoY29udGVudCwgdGhpcy5hbmNob3JzLmVuZClcbiAgfVxufSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4uL3Rva2VuLmpzJylcbiAgO1xuXG52YXIgZGlycyA9IHt9O1xuXG5cbmRpcnMudGV4dCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG4gIH1cbn07XG5cblxuZGlycy5odG1sID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHZhciBlbCA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbC5pbm5lckhUTUwgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG5cbiAgICB2YXIgbm9kZTtcbiAgICB3aGlsZShub2RlID0gdGhpcy5ub2Rlcy5wb3AoKSkge1xuICAgICAgbm9kZS5wYXJlbnROb2RlICYmIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9XG5cbiAgICB2YXIgbm9kZXMgPSBlbC5jaGlsZE5vZGVzO1xuICAgIHdoaWxlKG5vZGUgPSBub2Rlc1swXSkge1xuICAgICAgdGhpcy5ub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgdGhpcy5lbC5pbnNlcnRCZWZvcmUobm9kZSwgdGhpcy5ub2RlKTtcbiAgICB9XG4gIH1cbn07XG5cblxuZGlyc1snaWYnXSA9IHtcbiAgYW5jaG9yOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHRoaXMuZWwuY29udGVudCkge1xuICAgICAgdGhpcy5mcmFnID0gdGhpcy5lbC5jb250ZW50O1xuICAgICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICAgIH1lbHNle1xuICAgICAgdGhpcy5mcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICAgICAgdGhpcy5oaWRlKCk7XG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgaWYodmFsKSB7XG4gICAgICBpZighdGhpcy5zdGF0ZSkgeyB0aGlzLnNob3coKSB9XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLnN0YXRlKSB7IHRoaXMuaGlkZSgpOyB9XG4gICAgfVxuICAgIHRoaXMuc3RhdGUgPSB2YWw7XG4gIH1cblxuLCBzaG93OiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3JzLmVuZDtcblxuICAgIGFuY2hvci5wYXJlbnROb2RlICYmIGFuY2hvci5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLmZyYWcsIGFuY2hvcik7XG4gIH1cbiwgaGlkZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpO1xuXG4gICAgaWYobm9kZXMpIHtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBub2Rlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdGhpcy5mcmFnLmFwcGVuZENoaWxkKG5vZGVzW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmRpcnMudGVtcGxhdGUgPSB7XG4gIHByaW9yaXR5OiAxMDAwMFxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLmNoaWxkTm9kZXNcbiAgICAgICwgZnJhZyA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgICAgIDtcblxuICAgIHdoaWxlKG5vZGVzWzBdKSB7XG4gICAgICBmcmFnLmFwcGVuZENoaWxkKG5vZGVzWzBdKTtcbiAgICB9XG5cbiAgICB0aGlzLmVsLmNvbnRlbnQgPSBmcmFnO1xuXG4gICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSh0aGlzLm5vZGVOYW1lLCAnJyk7XG4gIH1cbn07XG5cbi8v5Zu+54mH55SoLCDpgb/lhY3liqDovb3lpKfmi6zlj7fnmoTljp/lp4vmqKHmnb/lhoXlrrlcbmRpcnMuc3JjID0ge1xuICB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHRoaXMuZWwuc3JjID0gdmFsO1xuICB9XG59O1xuXG5kaXJzWyd3aXRoJ10gPSB7fTtcblxuZGlycy5yZXBlYXQgPSByZXF1aXJlKCcuL3JlcGVhdC5qcycpO1xuZGlycy5hdHRyID0gcmVxdWlyZSgnLi9hdHRyLmpzJyk7XG5kaXJzLm1vZGVsID0gcmVxdWlyZSgnLi9tb2RlbC5qcycpO1xuZGlycy5zdHlsZSA9IHJlcXVpcmUoJy4vc3R5bGUuanMnKTtcbmRpcnMub24gPSByZXF1aXJlKCcuL29uLmpzJyk7XG5kaXJzLmNvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJyk7XG5kaXJzLmNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQuanMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpcnM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIGhhc1Rva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKS5oYXNUb2tlblxuICAsIGV2ZW50cyA9IHJlcXVpcmUoJy4uL2V2ZW50LWJpbmQuanMnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0ZW1pbmFsOiB0cnVlXG4sIHByaW9yaXR5OiAxXG4sIGxpbms6IGZ1bmN0aW9uKHZtKSB7XG4gICAgdmFyIGtleVBhdGggPSB0aGlzLnBhdGg7XG5cbiAgICBpZigha2V5UGF0aCkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgIHZhciBlbCA9IHRoaXMuZWxcbiAgICAgICwgZXYgPSAnY2hhbmdlJ1xuICAgICAgLCBhdHRyLCB2YWx1ZSA9IGF0dHIgPSAndmFsdWUnXG4gICAgICAsIGFudCA9IHZtXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQoYW50LiRnZXQoa2V5UGF0aCkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG4gICAgICAsIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gZWxbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBlbFthdHRyXSA9IG5ld1ZhbDsgfVxuICAgICAgICB9XG4gICAgICAsIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICB2YXIgdmFsID0gZWxbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFsKTtcbiAgICAgICAgfVxuICAgICAgLCBjYWxsSGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICBpZihlICYmIGUucHJvcGVydHlOYW1lICYmIGUucHJvcGVydHlOYW1lICE9PSBhdHRyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICB9XG4gICAgICAsIGllID0gdXRpbHMuaWVcbiAgICAgIDtcblxuICAgIHN3aXRjaChlbC50YWdOYW1lKSB7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnaW5uZXJIVE1MJztcbiAgICAgICAgLy9ldiArPSAnIGJsdXInO1xuICAgICAgY2FzZSAnSU5QVVQnOlxuICAgICAgY2FzZSAnVEVYVEFSRUEnOlxuICAgICAgICBzd2l0Y2goZWwudHlwZSkge1xuICAgICAgICAgIGNhc2UgJ2NoZWNrYm94JzpcbiAgICAgICAgICAgIHZhbHVlID0gYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgIC8vSUU2LCBJRTcg5LiL55uR5ZCsIHByb3BlcnR5Y2hhbmdlIOS8muaMgj9cbiAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAncmFkaW8nOlxuICAgICAgICAgICAgYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICBlbC5jaGVja2VkID0gZWwudmFsdWUgPT09IHZhbCArICcnO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlzU2V0RGVmYXV0ID0gZWwuY2hlY2tlZDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYoIWFudC4kbGF6eSl7XG4gICAgICAgICAgICAgIGlmKCdvbmlucHV0JyBpbiBlbCl7XG4gICAgICAgICAgICAgICAgZXYgKz0gJyBpbnB1dCc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy9JRSDkuIvnmoQgaW5wdXQg5LqL5Lu25pu/5LujXG4gICAgICAgICAgICAgIGlmKGllKSB7XG4gICAgICAgICAgICAgICAgZXYgKz0gJyBrZXl1cCBwcm9wZXJ0eWNoYW5nZSBjdXQnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VMRUNUJzpcbiAgICAgICAgaWYoZWwubXVsdGlwbGUpe1xuICAgICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICAgIHZhciB2YWxzID0gW107XG4gICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gZWwub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICBpZihlbC5vcHRpb25zW2ldLnNlbGVjdGVkKXsgdmFscy5wdXNoKGVsLm9wdGlvbnNbaV0udmFsdWUpIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFudC4kc2V0KGtleVBhdGgsIHZhbHMpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbih2YWxzKXtcbiAgICAgICAgICAgIGlmKHZhbHMgJiYgdmFscy5sZW5ndGgpe1xuICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gZWwub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICAgIGVsLm9wdGlvbnNbaV0uc2VsZWN0ZWQgPSB2YWxzLmluZGV4T2YoZWwub3B0aW9uc1tpXS52YWx1ZSkgIT09IC0xO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpc1NldERlZmF1dCA9IGlzU2V0RGVmYXV0ICYmICFoYXNUb2tlbihlbFt2YWx1ZV0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgdGhpcy51cGRhdGUgPSBjYWxsYmFjaztcblxuICAgIGV2LnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24oZSl7XG4gICAgICBldmVudHMucmVtb3ZlRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgIGV2ZW50cy5hZGRFdmVudChlbCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgIH0pO1xuXG4gICAgLy/moLnmja7ooajljZXlhYPntKDnmoTliJ3lp4vljJbpu5jorqTlgLzorr7nva7lr7nlupQgbW9kZWwg55qE5YC8XG4gICAgaWYoZWxbdmFsdWVdICYmIGlzU2V0RGVmYXV0KXtcbiAgICAgICBoYW5kbGVyKHRydWUpO1xuICAgIH1cblxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5LqL5Lu255uR5ZCsXG5cbnZhciBldmVudEJpbmQgPSByZXF1aXJlKCcuLi9ldmVudC1iaW5kLmpzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG5cbi8vVE9ETyDnp7vpmaTml7bnmoTmg4XlhrVcbm1vZHVsZS5leHBvcnRzID0ge1xuICB3YXRjaDogZmFsc2VcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICAvL3RoaXMuZXZlbnRzID0ge307XG4gICAgdGhpcy52bSA9IHZtO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3Rvci5zaGlmdCgpO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5qb2luKCcgJyk7XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG5mdW5jdGlvbiBjYWxsSGFuZGxlciAoZGlyLCBzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICB2YXIgY3VyID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIHZhciBlbHMgPSBzZWxlY3RvciA/IHV0aWxzLnRvQXJyYXkoZGlyLmVsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSA6IFtjdXJdO1xuICAgIGRve1xuICAgICAgaWYoZWxzLmluZGV4T2YoY3VyKSA+PSAwKSB7XG4gICAgICAgIGUuZGVsZWdhdGVUYXJnZXQgPSBjdXI7Ly/lp5TmiZjlhYPntKBcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoZGlyLnZtLCBlKVxuICAgICAgfVxuICAgIH13aGlsZShjdXIgPSBjdXIucGFyZW50Tm9kZSlcbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICA7XG5cbi8v6L+Z5Lqb5pWw57uE5pON5L2c5pa55rOV6KKr6YeN5YaZ5oiQ6Ieq5Yqo6Kem5Y+R5pu05pawXG52YXIgYXJyYXlNZXRob2RzID0gWydzcGxpY2UnLCAncHVzaCcsICdwb3AnLCAnc2hpZnQnLCAndW5zaGlmdCcsICdzb3J0JywgJ3JldmVyc2UnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAxMDAwXG4sIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBjc3RyID0gdGhpcy5jc3RyID0gdm0uY29uc3RydWN0b3I7XG4gICAgdGhpcy52bSA9IHZtO1xuXG4gICAgd2hpbGUoY3N0ci5fX3N1cGVyX18pe1xuICAgICAgY3N0ciA9IGNzdHIuX19zdXBlcl9fLmNvbnN0cnVjdG9yO1xuICAgIH1cblxuICAgIC8v5Y+q57un5om/6Z2Z5oCB55qE6buY6K6k5Y+C5pWwXG4gICAgdGhpcy5jc3RyID0gY3N0ci5leHRlbmQoe30sIHRoaXMuY3N0cilcblxuICAgIHRoaXMuY3VyQXJyID0gW107XG4gICAgdGhpcy5saXN0ID0gW107Ly/lrZAgVk0gbGlzdFxuXG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgdmFyIHRoYXQgPSB0aGlzLCBsaXN0ID0gdGhpcy5saXN0O1xuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcbiAgICAgIC8vIOWcqCByZXBlYXQg5oyH5Luk6KGo6L6+5byP5LitXG4gICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5zdW1tYXJ5LmxvY2Fscy5maWx0ZXIoZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICByZXR1cm4gIXV0aWxzLmlzRnVuY3Rpb24odGhhdC52bS4kZ2V0KHBhdGgpKVxuICAgICAgfSk7XG5cbiAgICAgIC8v5Yig6Zmk5YWD57SgXG4gICAgICAvL1RPRE8g5Yig6Zmk5byV55So54i257qn55qEIHdhdGNoZXJzXG4gICAgICBhcnJEaWZmKGN1ckFyciwgaXRlbXMpLmZvckVhY2goZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICB2YXIgcG9zID0gY3VyQXJyLmluZGV4T2YoaXRlbSlcbiAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDEpXG4gICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobGlzdFtwb3NdLiRlbClcbiAgICAgICAgbGlzdFtwb3NdLl9fZGVzdHJveSgpXG4gICAgICAgIGxpc3Quc3BsaWNlKHBvcywgMSlcbiAgICAgIH0pXG5cbiAgICAgIGl0ZW1zLmZvckVhY2goZnVuY3Rpb24oaXRlbSwgaSkge1xuICAgICAgICB2YXIgcG9zID0gaXRlbXMuaW5kZXhPZihpdGVtLCBpKVxuICAgICAgICAgICwgb2xkUG9zID0gY3VyQXJyLmluZGV4T2YoaXRlbSwgaSlcbiAgICAgICAgICAsIHZtLCBlbFxuICAgICAgICAgIDtcblxuICAgICAgICAvL3BvcyA8IDAgJiYgKHBvcyA9IGl0ZW1zLmxhc3RJbmRleE9mKGl0ZW0sIGkpKTtcbiAgICAgICAgLy9vbGRQb3MgPCAwICYmIChvbGRQb3MgPSBjdXJBcnIubGFzdEluZGV4T2YoaXRlbSwgaSkpO1xuXG4gICAgICAgIC8v5paw5aKe5YWD57SgXG4gICAgICAgIGlmKG9sZFBvcyA8IDApIHtcblxuICAgICAgICAgIGVsID0gdGhpcy5lbC5jbG9uZU5vZGUodHJ1ZSlcblxuICAgICAgICAgIHZtID0gbmV3IHRoaXMuY3N0cihlbCwge1xuICAgICAgICAgICAgJGRhdGE6IGl0ZW0sIF9hc3NpZ25tZW50czogdGhpcy5zdW1tYXJ5LmFzc2lnbm1lbnRzLCAkaW5kZXg6IHBvcyxcbiAgICAgICAgICAgICRyb290OiB0aGlzLnZtLiRyb290LCAkcGFyZW50OiB0aGlzLnZtLFxuICAgICAgICAgICAgX19yZXBlYXQ6IHRydWVcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh2bS4kZWwsIGxpc3RbcG9zXSAmJiBsaXN0W3Bvc10uJGVsIHx8IHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgbGlzdC5zcGxpY2UocG9zLCAwLCB2bSk7XG4gICAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDAsIGl0ZW0pXG5cbiAgICAgICAgICAvL+W7tuaXtui1i+WAvOe7mSBgX3JlbGF0aXZlUGF0aGAsIOmBv+WFjeWHuueOsOatu+W+queOr1xuICAgICAgICAgIC8v5aaC5p6c5Zyo5LiK6Z2i5a6e5L6L5YyW5pe25b2T5Y+C5pWw5Lyg5YWlLCDkvJrlhpLms6HliLDniLbnuqcgdm0g6YCS5b2S6LCD55So6L+Z6YeM55qEIHVwZGF0ZSDmlrnms5UsIOmAoOaIkOatu+W+queOry5cbiAgICAgICAgICB2bS5fcmVsYXRpdmVQYXRoID0gdGhpcy5saXN0UGF0aDtcbiAgICAgICAgfWVsc2Uge1xuXG4gICAgICAgICAgLy/osIPluo9cbiAgICAgICAgICBpZiAocG9zICE9PSBvbGRQb3MpIHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3Rbb2xkUG9zXS4kZWwsIGxpc3RbcG9zXSAmJiBsaXN0W3Bvc10uJGVsIHx8IHRoYXQuYW5jaG9yLmVuZClcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3RbcG9zXS4kZWwsIGxpc3Rbb2xkUG9zICsgMV0gJiYgbGlzdFtvbGRQb3MgKyAxXS4kZWwgfHwgdGhhdC5hbmNob3IuZW5kKVxuICAgICAgICAgICAgbGlzdFtvbGRQb3NdID0gW2xpc3RbcG9zXSwgbGlzdFtwb3NdID0gbGlzdFtvbGRQb3NdXVswXVxuICAgICAgICAgICAgY3VyQXJyW29sZFBvc10gPSBbY3VyQXJyW3Bvc10sIGN1ckFycltwb3NdID0gY3VyQXJyW29sZFBvc11dWzBdXG4gICAgICAgICAgICBsaXN0W3Bvc10uJGluZGV4ID0gcG9zXG4gICAgICAgICAgICBsaXN0W3Bvc10uJHVwZGF0ZSgnJGluZGV4JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSlcblxuICAgICAgLy/mm7TmlrDntKLlvJVcbiAgICAgIHRoaXMubGlzdC5mb3JFYWNoKGZ1bmN0aW9uKHZtLCBpKSB7XG4gICAgICAgIHZtLiRpbmRleCA9IGlcbiAgICAgICAgdm0uJGVsLiRpbmRleCA9IGlcbiAgICAgICAgdm0uJHVwZGF0ZSgnJGluZGV4JywgZmFsc2UpXG4gICAgICB9KTtcblxuICAgICAgaWYoIWl0ZW1zLl9fZGlyc19fKXtcbiAgICAgICAgLy/mlbDnu4Tmk43kvZzmlrnms5VcbiAgICAgICAgdXRpbHMuZXh0ZW5kKGl0ZW1zLCB7XG4gICAgICAgICAgJHNldDogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgaXRlbXMuX19kaXJzX18uZm9yRWFjaChmdW5jdGlvbihkaXIpIHtcbiAgICAgICAgICAgICAgZGlyLmxpc3RbaV0uJHNldChpdGVtKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSxcbiAgICAgICAgICAkcmVwbGFjZTogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgaXRlbXMuX19kaXJzX18uZm9yRWFjaChmdW5jdGlvbihkaXIpIHtcbiAgICAgICAgICAgICAgZGlyLmxpc3RbaV0uJHJlcGxhY2UoaXRlbSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSxcbiAgICAgICAgICAkcmVtb3ZlOiBmdW5jdGlvbihpKSB7XG4gICAgICAgICAgICBpdGVtcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICBpdGVtcy5fX2RpcnNfXy5mb3JFYWNoKGZ1bmN0aW9uKGRpcikge1xuICAgICAgICAgICAgICBkaXIubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgICAgICAgIGRpci52bS4kdXBkYXRlKHBhdGgpXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcnJheU1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgICAgICAgICBpdGVtc1ttZXRob2RdID0gdXRpbHMuYWZ0ZXJGbihpdGVtc1ttZXRob2RdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGl0ZW1zLl9fZGlyc19fLmZvckVhY2goZnVuY3Rpb24oZGlyKSB7XG4gICAgICAgICAgICAgIGRpci5saXN0UGF0aC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgICAgICBkaXIudm0uJHVwZGF0ZShwYXRoKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICAgICAgaXRlbXMuX19kaXJzX18gID0gW107XG4gICAgICB9XG4gICAgICAvL+S4gOS4quaVsOe7hOWkmuWkhOS9v+eUqFxuICAgICAgLy9UT0RPIOenu+mZpOaXtueahOaDheWGtVxuICAgICAgaWYoaXRlbXMuX19kaXJzX18uaW5kZXhPZih0aGF0KSA9PT0gLTEpIHtcbiAgICAgICAgaXRlbXMuX19kaXJzX18ucHVzaCh0aGF0KVxuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgLy9UT0RPIOaZrumAmuWvueixoeeahOmBjeWOhlxuICAgIH1cbiAgfVxufTtcblxuXG5mdW5jdGlvbiBhcnJEaWZmKGFycjEsIGFycjIpIHtcbiAgdmFyIGFycjJDb3B5ID0gYXJyMi5zbGljZSgpO1xuICByZXR1cm4gYXJyMS5maWx0ZXIoZnVuY3Rpb24oZWwpIHtcbiAgICB2YXIgcmVzdWx0LCBpbmRleCA9IGFycjJDb3B5LmluZGV4T2YoZWwpXG4gICAgaWYoaW5kZXggPCAwKSB7XG4gICAgICByZXN1bHQgPSB0cnVlXG4gICAgfWVsc2V7XG4gICAgICBhcnIyQ29weS5zcGxpY2UoaW5kZXgsIDEpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSlcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+agt+W8j+aMh+S7pFxuXG52YXIgY2FtZWxSZWcgPSAvKFtBLVpdKS9nO1xuXG4vL+m7mOiupOWNleS9jeS4uiBweCDnmoTlsZ7mgKdcbi8vVE9ETyDlvoXlrozlloRcbnZhciBwaXhlbEF0dHJzID0gW1xuICAnd2lkdGgnLCdoZWlnaHQnLFxuICAnbWFyZ2luJywgJ21hcmdpbi10b3AnLCAnbWFyZ2luLXJpZ2h0JywgJ21hcmdpbi1sZWZ0JywgJ21hcmdpbi1ib3R0b20nLFxuICAncGFkZGluZycsICdwYWRkaW5nLXRvcCcsICdwYWRkaW5nLXJpZ2h0JywgJ3BhZGRpbmctYm90dG9tJywgJ3BhZGRpbmctbGVmdCdcbl1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHVwZGF0ZTogZnVuY3Rpb24oc3R5bGVzKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgc3R5bGVTdHIgPSAnJztcbiAgICB2YXIgZGFzaEtleSwgdmFsO1xuXG4gICAgaWYodHlwZW9mIHN0eWxlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHN0eWxlU3RyID0gc3R5bGVzO1xuICAgIH1lbHNlIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBzdHlsZXMpIHtcbiAgICAgICAgdmFsID0gc3R5bGVzW2tleV07XG5cbiAgICAgICAgZGFzaEtleSA9IGtleS5yZXBsYWNlKGNhbWVsUmVnLCBmdW5jdGlvbiAodXBwZXJDaGFyKSB7XG4gICAgICAgICAgcmV0dXJuICctJyArIHVwcGVyQ2hhci50b0xvd2VyQ2FzZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIWlzTmFOKHZhbCkgJiYgcGl4ZWxBdHRycy5pbmRleE9mKGRhc2hLZXkpID49IDApIHtcbiAgICAgICAgICB2YWwgKz0gJ3B4JztcbiAgICAgICAgfVxuICAgICAgICBzdHlsZVN0ciArPSBkYXNoS2V5ICsgJzogJyArIHZhbCArICc7ICc7XG4gICAgICB9XG4gICAgfVxuICAgIGlmKGVsLnN0eWxlLnNldEF0dHJpYnV0ZSl7XG4gICAgICAvL+iAgSBJRVxuICAgICAgZWwuc3R5bGUuc2V0QXR0cmlidXRlKCdjc3NUZXh0Jywgc3R5bGVTdHIpO1xuICAgIH1lbHNle1xuICAgICAgZWwuc2V0QXR0cmlidXRlKCdzdHlsZScsIHN0eWxlU3RyKTtcbiAgICB9XG4gIH1cbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcblxuLy/lpITnkIYgJHRhcmdldCwgICRjb250ZW50LCAkdHBsXG4vL3RhcmdldDogZWwg5pu/5o2i55qE55uu5qCHXG5mdW5jdGlvbiB0cGxQYXJzZSh0cGwsIHRhcmdldCwgY29udGVudCkge1xuICB2YXIgZWw7XG4gIGlmKHV0aWxzLmlzT2JqZWN0KHRhcmdldCkgJiYgdGFyZ2V0LmNoaWxkTm9kZXMpIHtcbiAgICBjb250ZW50ID0gY3JlYXRlQ29udGVudCh0YXJnZXQuY2hpbGROb2Rlcyk7XG4gIH1lbHNle1xuICAgIGlmKGNvbnRlbnQpIHtcbiAgICAgIGNvbnRlbnQgPSBjcmVhdGVDb250ZW50KGNvbnRlbnQpXG4gICAgfVxuICB9XG5cbiAgaWYodXRpbHMuaXNPYmplY3QodHBsKSl7XG4gICAgLy9ET00g5YWD57SgXG4gICAgZWwgPSB0cGw7XG4gICAgdHBsID0gZWwub3V0ZXJIVE1MO1xuICB9ZWxzZXtcbiAgICAvL+Wtl+espuS4slxuICAgIGVsID0gY3JlYXRlQ29udGVudCh0cGwpLmNoaWxkTm9kZXNbMF07XG4gIH1cblxuICBpZih0YXJnZXQpe1xuICAgIHRhcmdldC5wYXJlbnROb2RlICYmIHRhcmdldC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChlbCwgdGFyZ2V0KTtcbiAgfVxuXG4gIHJldHVybiB7ZWw6IGVsLCB0cGw6IHRwbCwgY29udGVudDogY29udGVudH07XG59XG5cbi8v5bCG5qih5p2/L+WFg+e0oC9ub2RlbGlzdCDljIXoo7nlnKggZnJhZ21lbnQg5LitXG5mdW5jdGlvbiBjcmVhdGVDb250ZW50KHRwbCkge1xuICB2YXIgY29udGVudCA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gIHZhciB3cmFwZXI7XG4gIHZhciBub2RlcyA9IFtdO1xuICBpZih1dGlscy5pc09iamVjdCh0cGwpKSB7XG4gICAgaWYodHBsLm5vZGVOYW1lICYmIHRwbC5ub2RlVHlwZSkge1xuICAgICAgLy9kb20g5YWD57SgXG4gICAgICBjb250ZW50LmFwcGVuZENoaWxkKHRwbCk7XG4gICAgfWVsc2UgaWYoJ2xlbmd0aCcgaW4gdHBsKXtcbiAgICAgIC8vbm9kZWxpc3RcbiAgICAgIG5vZGVzID0gdHBsO1xuICAgIH1cbiAgfWVsc2Uge1xuICAgIHdyYXBlciA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgIC8v6Ieq5a6a5LmJ5qCH562+5ZyoIElFOCDkuIvml6DmlYguIOS9v+eUqCBjb21wb25lbnQg5oyH5Luk5pu/5LujXG4gICAgd3JhcGVyLmlubmVySFRNTCA9ICh0cGwgKyAnJykudHJpbSgpO1xuICAgIG5vZGVzID0gd3JhcGVyLmNoaWxkTm9kZXM7XG4gIH1cbiAgd2hpbGUobm9kZXNbMF0pIHtcbiAgICBjb250ZW50LmFwcGVuZENoaWxkKG5vZGVzWzBdKVxuICB9XG4gIHJldHVybiBjb250ZW50O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdHBsUGFyc2U6IHRwbFBhcnNlLFxuICBjcmVhdGVDb250ZW50OiBjcmVhdGVDb250ZW50XG59OyIsIihmdW5jdGlvbihyb290KXtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZXhwb3J0cy5yb290ID0gcm9vdDtcbiAgZXhwb3J0cy5kb2N1bWVudCA9IHJvb3QuZG9jdW1lbnQgfHwgcmVxdWlyZSgnanNkb20nKS5qc2RvbSgpO1xuXG59KSgoZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXN9KSgpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgb3BlcmF0b3JzID0ge1xuICAndW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbih2KSB7IHJldHVybiArdjsgfVxuICAsICctJzogZnVuY3Rpb24odikgeyByZXR1cm4gLXY7IH1cbiAgLCAnISc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuICF2OyB9XG5cbiAgLCAnWyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gdjsgfVxuICAsICd7JzogZnVuY3Rpb24odil7XG4gICAgICB2YXIgciA9IHt9O1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IHYubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHJbdltpXVswXV0gPSB2W2ldWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICAsICd0eXBlb2YnOiBmdW5jdGlvbih2KXsgcmV0dXJuIHR5cGVvZiB2OyB9XG4gICwgJ25ldyc6IGZ1bmN0aW9uKHYpeyByZXR1cm4gbmV3IHYgfVxuICB9XG5cbiwgJ2JpbmFyeSc6IHtcbiAgICAnKyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKyByOyB9XG4gICwgJy0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC0gcjsgfVxuICAsICcqJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAqIHI7IH1cbiAgLCAnLyc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgLyByOyB9XG4gICwgJyUnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICUgcjsgfVxuICAsICc8JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8IHI7IH1cbiAgLCAnPic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPiByOyB9XG4gICwgJzw9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA8PSByOyB9XG4gICwgJz49JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA+PSByOyB9XG4gICwgJz09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCA9PSByOyB9XG4gICwgJyE9JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPSByOyB9XG4gICwgJz09PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT09IHI7IH1cbiAgLCAnIT09JzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAhPT0gcjsgfVxuICAsICcmJic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgJiYgcjsgfVxuICAsICd8fCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgfHwgcjsgfVxuICAsICcsJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCwgcjsgfVxuXG4gICwgJy4nOiBmdW5jdGlvbihsLCByKSB7XG4gICAgICBpZihyKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuICAsICdbJzogZnVuY3Rpb24obCwgcikge1xuICAgICAgaWYodHlwZW9mIHIgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgcGF0aCA9IHBhdGggKyAnLicgKyByO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxbcl07XG4gICAgfVxuXG4gICwgJygnOiBmdW5jdGlvbihsLCByKXsgcmV0dXJuIGwuYXBwbHkoY29udGV4dC5sb2NhbHMsIHIpIH1cbiAgLCAnfCc6IGZ1bmN0aW9uKGwsIHIpeyByZXR1cm4gci5jYWxsKGNvbnRleHQubG9jYWxzLCBsKSB9Ly9maWx0ZXIuIG5hbWV8ZmlsdGVyXG4gICwgJ25ldyc6IGZ1bmN0aW9uKGwsIHIpe1xuICAgICAgcmV0dXJuIGwgPT09IERhdGUgPyBuZXcgRnVuY3Rpb24oJ3JldHVybiBuZXcgRGF0ZSgnICsgci5qb2luKCcsICcpICsgJyknKSgpIDogbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShsLCByKSk7XG4gICAgfVxuXG4gICwgJ2luJzogZnVuY3Rpb24obCwgcil7XG4gICAgICBpZih0aGlzLmFzc2lnbm1lbnQpIHtcbiAgICAgICAgLy9yZXBlYXRcbiAgICAgICAgcmV0dXJuIHI7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIGwgaW4gcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLCAndGVybmFyeSc6IHtcbiAgICAnPyc6IGZ1bmN0aW9uKGYsIHMsIHQpIHsgcmV0dXJuIGYgPyBzIDogdDsgfVxuICAsICcoJzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZltzXS5hcHBseShmLCB0KSB9XG5cbiAgLy9maWx0ZXIuIG5hbWUgfCBmaWx0ZXIgOiBhcmcyIDogYXJnM1xuICAsICd8JzogZnVuY3Rpb24oZiwgcywgdCl7IHJldHVybiBzLmFwcGx5KGNvbnRleHQubG9jYWxzLCBbZl0uY29uY2F0KHQpKTsgfVxuICB9XG59O1xuXG52YXIgYXJnTmFtZSA9IFsnZmlyc3QnLCAnc2Vjb25kJywgJ3RoaXJkJ11cbiAgLCBjb250ZXh0LCBzdW1tYXJ5LCBzdW1tYXJ5Q2FsbFxuICAsIHBhdGhcbiAgLCBzZWxmXG4gIDtcblxuLy/pgY3ljoYgYXN0XG52YXIgZXZhbHVhdGUgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHZhciBhcml0eSA9IHRyZWUuYXJpdHlcbiAgICAsIHZhbHVlID0gdHJlZS52YWx1ZVxuICAgICwgYXJncyA9IFtdXG4gICAgLCBuID0gMFxuICAgICwgYXJnXG4gICAgLCByZXNcbiAgICA7XG5cbiAgLy/mk43kvZznrKbmnIDlpJrlj6rmnInkuInlhYNcbiAgZm9yKDsgbiA8IDM7IG4rKyl7XG4gICAgYXJnID0gdHJlZVthcmdOYW1lW25dXTtcbiAgICBpZihhcmcpe1xuICAgICAgaWYoQXJyYXkuaXNBcnJheShhcmcpKXtcbiAgICAgICAgYXJnc1tuXSA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJnLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgYXJnc1tuXS5wdXNoKHR5cGVvZiBhcmdbaV0ua2V5ID09PSAndW5kZWZpbmVkJyA/XG4gICAgICAgICAgICBldmFsdWF0ZShhcmdbaV0pIDogW2FyZ1tpXS5rZXksIGV2YWx1YXRlKGFyZ1tpXSldKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGFyZ3Nbbl0gPSBldmFsdWF0ZShhcmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGFyaXR5ICE9PSAnbGl0ZXJhbCcpIHtcbiAgICBpZihwYXRoICYmIHZhbHVlICE9PSAnLicgJiYgdmFsdWUgIT09ICdbJykge1xuICAgICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gICAgfVxuICAgIGlmKGFyaXR5ID09PSAnbmFtZScpIHtcbiAgICAgIHBhdGggPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBzd2l0Y2goYXJpdHkpe1xuICAgIGNhc2UgJ3VuYXJ5JzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Rlcm5hcnknOlxuICAgICAgdHJ5e1xuICAgICAgICByZXMgPSBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpLmFwcGx5KHRyZWUsIGFyZ3MpO1xuICAgICAgfWNhdGNoKGUpe1xuICAgICAgICBzdW1tYXJ5Q2FsbCB8fCBjb25zb2xlLndhcm4oZSk7XG4gICAgICB9XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbGl0ZXJhbCc6XG4gICAgICByZXMgPSB2YWx1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICdhc3NpZ25tZW50JzpcbiAgICAgIHN1bW1hcnkuYXNzaWdubWVudHNbdmFsdWVdID0gdHJ1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICduYW1lJzpcbiAgICAgIHN1bW1hcnkubG9jYWxzW3ZhbHVlXSA9IHRydWU7XG4gICAgICByZXMgPSBnZXRWYWx1ZSh2YWx1ZSwgY29udGV4dC5sb2NhbHMpO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ2ZpbHRlcic6XG4gICAgICBzdW1tYXJ5LmZpbHRlcnNbdmFsdWVdID0gdHJ1ZTtcbiAgICAgIHJlcyA9IGNvbnRleHQuZmlsdGVyc1t2YWx1ZV07XG4gICAgYnJlYWs7XG4gICAgY2FzZSAndGhpcyc6XG4gICAgICByZXMgPSBjb250ZXh0LmxvY2FsczsvL1RPRE8gdGhpcyDmjIflkJEgdm0g6L+Y5pivIGRpcj9cbiAgICBicmVhaztcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcblxuZnVuY3Rpb24gZ2V0T3BlcmF0b3IoYXJpdHksIHZhbHVlKXtcbiAgcmV0dXJuIG9wZXJhdG9yc1thcml0eV1bdmFsdWVdIHx8IGZ1bmN0aW9uKCkgeyByZXR1cm47IH1cbn1cblxuZnVuY3Rpb24gcmVzZXQoc2NvcGUsIHRoYXQpIHtcbiAgc3VtbWFyeUNhbGwgPSB0cnVlO1xuICBpZihzY29wZSkge1xuICAgIHN1bW1hcnlDYWxsID0gZmFsc2U7XG4gICAgY29udGV4dCA9IHtsb2NhbHM6IHNjb3BlIHx8IHt9LCBmaWx0ZXJzOiBzY29wZS4kZmlsdGVycyB8fCB7fX07XG4gIH1lbHNle1xuICAgIGNvbnRleHQgPSB7ZmlsdGVyczoge30sIGxvY2Fsczoge319O1xuICB9XG4gIGlmKHRoYXQpe1xuICAgIHNlbGYgPSB0aGF0O1xuICB9XG5cbiAgc3VtbWFyeSA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fSwgcGF0aHM6IHt9LCBhc3NpZ25tZW50czoge319O1xuICBwYXRoID0gJyc7XG59XG5cbi8v5Zyo5L2c55So5Z+f5Lit5p+l5om+5YC8XG52YXIgZ2V0VmFsdWUgPSByZXF1aXJlKCcuL3Njb3BlJykuZ2V0VmFsdWVcblxuLy/ooajovr7lvI/msYLlgLxcbi8vdHJlZTogcGFyc2VyIOeUn+aIkOeahCBhc3Rcbi8vc2NvcGUg5omn6KGM546v5aKDXG5leHBvcnRzLmV2YWwgPSBmdW5jdGlvbih0cmVlLCBzY29wZSwgdGhhdCkge1xuICByZXNldChzY29wZSB8fCB7fSwgdGhhdCk7XG5cbiAgcmV0dXJuIGV2YWx1YXRlKHRyZWUpO1xufTtcblxuLy/ooajovr7lvI/mkZjopoFcbi8vcmV0dXJuOiB7ZmlsdGVyczpbXSwgbG9jYWxzOltdLCBwYXRoczogW10sIGFzc2lnbm1lbnRzOiBbXX1cbmV4cG9ydHMuc3VtbWFyeSA9IGZ1bmN0aW9uKHRyZWUpIHtcbiAgcmVzZXQoKTtcblxuICBldmFsdWF0ZSh0cmVlKTtcblxuICBpZihwYXRoKSB7XG4gICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gIH1cbiAgZm9yKHZhciBrZXkgaW4gc3VtbWFyeSkge1xuICAgIHN1bW1hcnlba2V5XSA9IE9iamVjdC5rZXlzKHN1bW1hcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIHN1bW1hcnk7XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydHMuYWRkRXZlbnQgPSBmdW5jdGlvbiBhZGRFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIsIGZhbHNlKTtcbiAgfWVsc2V7XG4gICAgZWwuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufVxuXG5leHBvcnRzLnJlbW92ZUV2ZW50ID0gZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmKGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBoYW5kbGVyKTtcbiAgfWVsc2V7XG4gICAgZWwuZGV0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBoYW5kbGVyKTtcbiAgfVxufSIsIlwidXNlIHN0cmljdFwiO1xuLy9KYXZhc2NyaXB0IGV4cHJlc3Npb24gcGFyc2VyIG1vZGlmaWVkIGZvcm0gQ3JvY2tmb3JkJ3MgVERPUCBwYXJzZXJcbnZhciBjcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChvKSB7XG5cdGZ1bmN0aW9uIEYoKSB7fVxuXHRGLnByb3RvdHlwZSA9IG87XG5cdHJldHVybiBuZXcgRigpO1xufTtcblxudmFyIHNvdXJjZTtcblxudmFyIGVycm9yID0gZnVuY3Rpb24gKG1lc3NhZ2UsIHQpIHtcblx0dCA9IHQgfHwgdGhpcztcbiAgdmFyIG1zZyA9IG1lc3NhZ2UgKz0gXCIgQnV0IGZvdW5kICdcIiArIHQudmFsdWUgKyBcIidcIiArICh0LmZyb20gPyBcIiBhdCBcIiArIHQuZnJvbSA6IFwiXCIpICsgXCIgaW4gJ1wiICsgc291cmNlICsgXCInXCI7XG4gIHZhciBlID0gbmV3IEVycm9yKG1zZyk7XG5cdGUubmFtZSA9IHQubmFtZSA9IFwiU3ludGF4RXJyb3JcIjtcblx0dC5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhyb3cgZTtcbn07XG5cbnZhciB0b2tlbml6ZSA9IGZ1bmN0aW9uIChjb2RlLCBwcmVmaXgsIHN1ZmZpeCkge1xuXHR2YXIgYzsgLy8gVGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgZnJvbTsgLy8gVGhlIGluZGV4IG9mIHRoZSBzdGFydCBvZiB0aGUgdG9rZW4uXG5cdHZhciBpID0gMDsgLy8gVGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGNoYXJhY3Rlci5cblx0dmFyIGxlbmd0aCA9IGNvZGUubGVuZ3RoO1xuXHR2YXIgbjsgLy8gVGhlIG51bWJlciB2YWx1ZS5cblx0dmFyIHE7IC8vIFRoZSBxdW90ZSBjaGFyYWN0ZXIuXG5cdHZhciBzdHI7IC8vIFRoZSBzdHJpbmcgdmFsdWUuXG5cblx0dmFyIHJlc3VsdCA9IFtdOyAvLyBBbiBhcnJheSB0byBob2xkIHRoZSByZXN1bHRzLlxuXG5cdC8vIE1ha2UgYSB0b2tlbiBvYmplY3QuXG5cdHZhciBtYWtlID0gZnVuY3Rpb24gKHR5cGUsIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGUgOiB0eXBlLFxuXHRcdFx0dmFsdWUgOiB2YWx1ZSxcblx0XHRcdGZyb20gOiBmcm9tLFxuXHRcdFx0dG8gOiBpXG5cdFx0fTtcblx0fTtcblxuXHQvLyBCZWdpbiB0b2tlbml6YXRpb24uIElmIHRoZSBzb3VyY2Ugc3RyaW5nIGlzIGVtcHR5LCByZXR1cm4gbm90aGluZy5cblx0aWYgKCFjb2RlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGNvZGUgdGV4dCwgb25lIGNoYXJhY3RlciBhdCBhIHRpbWUuXG5cdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0d2hpbGUgKGMpIHtcblx0XHRmcm9tID0gaTtcblxuXHRcdGlmIChjIDw9ICcgJykgeyAvLyBJZ25vcmUgd2hpdGVzcGFjZS5cblx0XHRcdGkgKz0gMTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9IGVsc2UgaWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fCBjID09PSAnJCcgfHwgYyA9PT0gJ18nKSB7IC8vIG5hbWUuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKChjID49ICdhJyAmJiBjIDw9ICd6JykgfHwgKGMgPj0gJ0EnICYmIGMgPD0gJ1onKSB8fFxuXHRcdFx0XHRcdChjID49ICcwJyAmJiBjIDw9ICc5JykgfHwgYyA9PT0gJ18nKSB7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCduYW1lJywgc3RyKSk7XG5cdFx0fSBlbHNlIGlmIChjID49ICcwJyAmJiBjIDw9ICc5Jykge1xuXHRcdFx0Ly8gbnVtYmVyLlxuXG5cdFx0XHQvLyBBIG51bWJlciBjYW5ub3Qgc3RhcnQgd2l0aCBhIGRlY2ltYWwgcG9pbnQuIEl0IG11c3Qgc3RhcnQgd2l0aCBhIGRpZ2l0LFxuXHRcdFx0Ly8gcG9zc2libHkgJzAnLlxuXHRcdFx0c3RyID0gYztcblx0XHRcdGkgKz0gMTtcblxuXHRcdFx0Ly8gTG9vayBmb3IgbW9yZSBkaWdpdHMuXG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYSBkZWNpbWFsIGZyYWN0aW9uIHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJy4nKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgZm9yIGFuIGV4cG9uZW50IHBhcnQuXG5cdFx0XHRpZiAoYyA9PT0gJ2UnIHx8IGMgPT09ICdFJykge1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjID09PSAnLScgfHwgYyA9PT0gJysnKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYyA8ICcwJyB8fCBjID4gJzknKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgZXhwb25lbnRcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdH0gd2hpbGUgKGMgPj0gJzAnICYmIGMgPD0gJzknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBuZXh0IGNoYXJhY3RlciBpcyBub3QgYSBsZXR0ZXIuXG5cblx0XHRcdGlmIChjID49ICdhJyAmJiBjIDw9ICd6Jykge1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRlcnJvcihcIkJhZCBudW1iZXJcIiwgbWFrZSgnbnVtYmVyJywgc3RyKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZSB0byBhIG51bWJlci4gSWYgaXQgaXMgZmluaXRlLCB0aGVuIGl0IGlzIGEgZ29vZFxuXHRcdFx0Ly8gdG9rZW4uXG5cblx0XHRcdG4gPSArc3RyO1xuXHRcdFx0aWYgKGlzRmluaXRlKG4pKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ251bWJlcicsIG4pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc3RyaW5nXG5cblx0XHR9IGVsc2UgaWYgKGMgPT09ICdcXCcnIHx8IGMgPT09ICdcIicpIHtcblx0XHRcdHN0ciA9ICcnO1xuXHRcdFx0cSA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoYyA8ICcgJykge1xuXHRcdFx0XHRcdG1ha2UoJ3N0cmluZycsIHN0cik7XG5cdFx0XHRcdFx0ZXJyb3IoYyA9PT0gJ1xcbicgfHwgYyA9PT0gJ1xccicgfHwgYyA9PT0gJycgP1xuXHRcdFx0XHRcdFx0XCJVbnRlcm1pbmF0ZWQgc3RyaW5nLlwiIDpcblx0XHRcdFx0XHRcdFwiQ29udHJvbCBjaGFyYWN0ZXIgaW4gc3RyaW5nLlwiLCBtYWtlKCcnLCBzdHIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIHRoZSBjbG9zaW5nIHF1b3RlLlxuXG5cdFx0XHRcdGlmIChjID09PSBxKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciBlc2NhcGVtZW50LlxuXG5cdFx0XHRcdGlmIChjID09PSAnXFxcXCcpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0aWYgKGkgPj0gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0XHRzd2l0Y2ggKGMpIHtcblx0XHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxiJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2YnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGYnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcbic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxyJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3QnOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndSc6XG5cdFx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3IoXCJVbnRlcm1pbmF0ZWQgc3RyaW5nXCIsIG1ha2UoJ3N0cmluZycsIHN0cikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YyA9IHBhcnNlSW50KGNvZGUuc3Vic3RyKGkgKyAxLCA0KSwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0Zpbml0ZShjKSB8fCBjIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcblx0XHRcdFx0XHRcdGkgKz0gNDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cblx0XHRcdC8vIGNvbWJpbmluZ1xuXG5cdFx0fSBlbHNlIGlmIChwcmVmaXguaW5kZXhPZihjKSA+PSAwKSB7XG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoaSA+PSBsZW5ndGggfHwgc3VmZml4LmluZGV4T2YoYykgPCAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgc3RyKSk7XG5cblx0XHRcdC8vIHNpbmdsZS1jaGFyYWN0ZXIgb3BlcmF0b3JcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdvcGVyYXRvcicsIGMpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBtYWtlX3BhcnNlID0gZnVuY3Rpb24gKHZhcnMpIHtcblx0dmFycyA9IHZhcnMgfHwge307Ly/pooTlrprkuYnnmoTlj5jph49cblx0dmFyIHN5bWJvbF90YWJsZSA9IHt9O1xuXHR2YXIgdG9rZW47XG5cdHZhciB0b2tlbnM7XG5cdHZhciB0b2tlbl9ucjtcblx0dmFyIGNvbnRleHQ7XG5cblx0dmFyIGl0c2VsZiA9IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHR2YXIgZmluZCA9IGZ1bmN0aW9uIChuKSB7XG5cdFx0bi5udWQgPSBpdHNlbGY7XG5cdFx0bi5sZWQgPSBudWxsO1xuXHRcdG4uc3RkID0gbnVsbDtcblx0XHRuLmxicCA9IDA7XG5cdFx0cmV0dXJuIG47XG5cdH07XG5cblx0dmFyIGFkdmFuY2UgPSBmdW5jdGlvbiAoaWQpIHtcblx0XHR2YXIgYSwgbywgdCwgdjtcblx0XHRpZiAoaWQgJiYgdG9rZW4uaWQgIT09IGlkKSB7XG5cdFx0XHRlcnJvcihcIkV4cGVjdGVkICdcIiArIGlkICsgXCInLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICh0b2tlbl9uciA+PSB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHR0b2tlbiA9IHN5bWJvbF90YWJsZVtcIihlbmQpXCJdO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ID0gdG9rZW5zW3Rva2VuX25yXTtcblx0XHR0b2tlbl9uciArPSAxO1xuXHRcdHYgPSB0LnZhbHVlO1xuXHRcdGEgPSB0LnR5cGU7XG5cdFx0aWYgKChhID09PSBcIm9wZXJhdG9yXCIgfHwgYSAhPT0gJ3N0cmluZycpICYmIHYgaW4gc3ltYm9sX3RhYmxlKSB7XG5cdFx0XHQvL3RydWUsIGZhbHNlIOetieebtOaOpemHj+S5n+S8mui/m+WFpeatpOWIhuaUr1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVt2XTtcblx0XHRcdGlmICghbykge1xuXHRcdFx0XHRlcnJvcihcIlVua25vd24gb3BlcmF0b3IuXCIsIHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJuYW1lXCIpIHtcblx0XHRcdG8gPSBmaW5kKHQpO1xuXHRcdH0gZWxzZSBpZiAoYSA9PT0gXCJzdHJpbmdcIiB8fCBhID09PSBcIm51bWJlclwiIHx8IGEgPT09IFwicmVnZXhwXCIpIHtcblx0XHRcdG8gPSBzeW1ib2xfdGFibGVbXCIobGl0ZXJhbClcIl07XG5cdFx0XHRhID0gXCJsaXRlcmFsXCI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVycm9yKFwiVW5leHBlY3RlZCB0b2tlbi5cIiwgdCk7XG5cdFx0fVxuXHRcdHRva2VuID0gY3JlYXRlKG8pO1xuXHRcdHRva2VuLmZyb20gPSB0LmZyb207XG5cdFx0dG9rZW4udG8gPSB0LnRvO1xuXHRcdHRva2VuLnZhbHVlID0gdjtcblx0XHR0b2tlbi5hcml0eSA9IGE7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9O1xuXG4gIC8v6KGo6L6+5byPXG4gIC8vcmJwOiByaWdodCBiaW5kaW5nIHBvd2VyIOWPs+S+p+e6puadn+WKm1xuXHR2YXIgZXhwcmVzc2lvbiA9IGZ1bmN0aW9uIChyYnApIHtcblx0XHR2YXIgbGVmdDtcblx0XHR2YXIgdCA9IHRva2VuO1xuXHRcdGFkdmFuY2UoKTtcblx0XHRsZWZ0ID0gdC5udWQoKTtcblx0XHR3aGlsZSAocmJwIDwgdG9rZW4ubGJwKSB7XG5cdFx0XHR0ID0gdG9rZW47XG5cdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRsZWZ0ID0gdC5sZWQobGVmdCk7XG5cdFx0fVxuXHRcdHJldHVybiBsZWZ0O1xuXHR9O1xuXG5cdHZhciBvcmlnaW5hbF9zeW1ib2wgPSB7XG5cdFx0bnVkIDogZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXJyb3IoXCJVbmRlZmluZWQuXCIsIHRoaXMpO1xuXHRcdH0sXG5cdFx0bGVkIDogZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdGVycm9yKFwiTWlzc2luZyBvcGVyYXRvci5cIiwgdGhpcyk7XG5cdFx0fVxuXHR9O1xuXG5cdHZhciBzeW1ib2wgPSBmdW5jdGlvbiAoaWQsIGJwKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2xfdGFibGVbaWRdO1xuXHRcdGJwID0gYnAgfHwgMDtcblx0XHRpZiAocykge1xuXHRcdFx0aWYgKGJwID49IHMubGJwKSB7XG5cdFx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHMgPSBjcmVhdGUob3JpZ2luYWxfc3ltYm9sKTtcblx0XHRcdHMuaWQgPSBzLnZhbHVlID0gaWQ7XG5cdFx0XHRzLmxicCA9IGJwO1xuXHRcdFx0c3ltYm9sX3RhYmxlW2lkXSA9IHM7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHZhciBjb25zdGFudCA9IGZ1bmN0aW9uIChzLCB2LCBhKSB7XG5cdFx0dmFyIHggPSBzeW1ib2wocyk7XG5cdFx0eC5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gc3ltYm9sX3RhYmxlW3RoaXMuaWRdLnZhbHVlO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwibGl0ZXJhbFwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHR4LnZhbHVlID0gdjtcblx0XHRyZXR1cm4geDtcblx0fTtcblxuXHR2YXIgaW5maXggPSBmdW5jdGlvbiAoaWQsIGJwLCBsZWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCwgYnApO1xuXHRcdHMubGVkID0gbGVkIHx8IGZ1bmN0aW9uIChsZWZ0KSB7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbihicCk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGluZml4ciA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwIC0gMSk7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIHByZWZpeCA9IGZ1bmN0aW9uIChpZCwgbnVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQpO1xuXHRcdHMubnVkID0gbnVkIHx8IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDcwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBzO1xuXHR9O1xuXG5cdHN5bWJvbChcIihlbmQpXCIpO1xuXHRzeW1ib2woXCIobmFtZSlcIik7XG5cdHN5bWJvbChcIjpcIik7XG5cdHN5bWJvbChcIilcIik7XG5cdHN5bWJvbChcIl1cIik7XG5cdHN5bWJvbChcIn1cIik7XG5cdHN5bWJvbChcIixcIik7XG5cblx0Y29uc3RhbnQoXCJ0cnVlXCIsIHRydWUpO1xuXHRjb25zdGFudChcImZhbHNlXCIsIGZhbHNlKTtcblx0Y29uc3RhbnQoXCJudWxsXCIsIG51bGwpO1xuXHRjb25zdGFudChcInVuZGVmaW5lZFwiKTtcblxuXHRjb25zdGFudChcIk1hdGhcIiwgTWF0aCk7XG5cdGNvbnN0YW50KFwiRGF0ZVwiLCBEYXRlKTtcblx0Zm9yKHZhciB2IGluIHZhcnMpIHtcblx0XHRjb25zdGFudCh2LCB2YXJzW3ZdKTtcblx0fVxuXG5cdHN5bWJvbChcIihsaXRlcmFsKVwiKS5udWQgPSBpdHNlbGY7XG5cblx0c3ltYm9sKFwidGhpc1wiKS5udWQgPSBmdW5jdGlvbiAoKSB7XG5cdCAgdGhpcy5hcml0eSA9IFwidGhpc1wiO1xuXHQgIHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdC8vT3BlcmF0b3IgUHJlY2VkZW5jZTpcblx0Ly9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvT3BlcmF0b3JfUHJlY2VkZW5jZVxuXG4gIGluZml4KCcsJywgMSk7XG5cdGluZml4KFwiP1wiLCAyMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIjpcIik7XG5cdFx0dGhpcy50aGlyZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwidGVybmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeHIoXCImJlwiLCAzMSk7XG5cdGluZml4cihcInx8XCIsIDMwKTtcblxuXHRpbmZpeHIoXCI9PT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPT1cIiwgNDApO1xuXG5cdGluZml4cihcIj09XCIsIDQwKTtcblx0aW5maXhyKFwiIT1cIiwgNDApO1xuXG5cdGluZml4cihcIjxcIiwgNDApO1xuXHRpbmZpeHIoXCI8PVwiLCA0MCk7XG5cdGluZml4cihcIj5cIiwgNDApO1xuXHRpbmZpeHIoXCI+PVwiLCA0MCk7XG5cblx0aW5maXgoXCJpblwiLCA0NSwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0aWYgKGNvbnRleHQgPT09ICdyZXBlYXQnKSB7XG5cdFx0XHQvLyBgaW5gIGF0IHJlcGVhdCBibG9ja1xuXHRcdFx0bGVmdC5hcml0eSA9ICdhc3NpZ25tZW50Jztcblx0XHRcdHRoaXMuYXNzaWdubWVudCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIitcIiwgNTApO1xuXHRpbmZpeChcIi1cIiwgNTApO1xuXG5cdGluZml4KFwiKlwiLCA2MCk7XG5cdGluZml4KFwiL1wiLCA2MCk7XG5cdGluZml4KFwiJVwiLCA2MCk7XG5cblx0aW5maXgoXCIoXCIsIDcwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKGxlZnQuaWQgPT09IFwiLlwiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdC5maXJzdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gbGVmdC5zZWNvbmQ7XG5cdFx0XHR0aGlzLnRoaXJkID0gYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdGlmICgobGVmdC5hcml0eSAhPT0gXCJ1bmFyeVwiIHx8IGxlZnQuaWQgIT09IFwiZnVuY3Rpb25cIikgJiZcblx0XHRcdFx0bGVmdC5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbGVmdC5hcml0eSAhPT0gXCJsaXRlcmFsXCIgJiYgbGVmdC5pZCAhPT0gXCIoXCIgJiZcblx0XHRcdFx0bGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIikge1xuXHRcdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgdmFyaWFibGUgbmFtZS5cIiwgbGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCIpXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIuXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdGlmICh0b2tlbi5hcml0eSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSBwcm9wZXJ0eSBuYW1lLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRva2VuLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0dGhpcy5zZWNvbmQgPSB0b2tlbjtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiW1wiLCA4MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vZmlsdGVyXG5cdGluZml4KFwifFwiLCAxMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYTtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0b2tlbi5hcml0eSA9ICdmaWx0ZXInO1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigxMCk7XG5cdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdGlmICh0b2tlbi5pZCA9PT0gJzonKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ3Rlcm5hcnknO1xuXHRcdFx0dGhpcy50aGlyZCA9IGEgPSBbXTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGFkdmFuY2UoJzonKTtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiOlwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeChcIiFcIik7XG5cdHByZWZpeChcIi1cIik7XG5cdHByZWZpeChcInR5cGVvZlwiKTtcblxuXHRwcmVmaXgoXCIoXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgZSA9IGV4cHJlc3Npb24oMCk7XG5cdFx0YWR2YW5jZShcIilcIik7XG5cdFx0cmV0dXJuIGU7XG5cdH0pO1xuXG5cdHByZWZpeChcIltcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKHRva2VuLmlkICE9PSBcIl1cIikge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMSkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJdXCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeChcIntcIiwgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW10sXHRuLCB2O1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJ9XCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdG4gPSB0b2tlbjtcblx0XHRcdFx0aWYgKG4uYXJpdHkgIT09IFwibmFtZVwiICYmIG4uYXJpdHkgIT09IFwibGl0ZXJhbFwiKSB7XG5cdFx0XHRcdFx0ZXJyb3IoXCJCYWQgcHJvcGVydHkgbmFtZTogXCIsIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKCk7XG5cdFx0XHRcdGFkdmFuY2UoXCI6XCIpO1xuXHRcdFx0XHR2ID0gZXhwcmVzc2lvbigxKTtcblx0XHRcdFx0di5rZXkgPSBuLnZhbHVlO1xuXHRcdFx0XHRhLnB1c2godik7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWR2YW5jZShcIn1cIik7XG5cdFx0dGhpcy5maXJzdCA9IGE7XG5cdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0cHJlZml4KCduZXcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGEgPSBbXTtcblx0XHR0aGlzLmZpcnN0ID0gZXhwcmVzc2lvbig3OSk7XG5cdFx0aWYodG9rZW4uaWQgPT09ICcoJykge1xuXHRcdFx0YWR2YW5jZShcIihcIik7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ2JpbmFyeSc7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRhLnB1c2goZXhwcmVzc2lvbigxKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pZCAhPT0gXCIsXCIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhZHZhbmNlKFwiLFwiKTtcblx0XHRcdH1cblx0XHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdH1lbHNle1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vX3NvdXJjZTog6KGo6L6+5byP5Luj56CB5a2X56ym5LiyXG5cdC8vX2NvbnRleHQ6IOihqOi+vuW8j+eahOivreWPpeeOr+Wig1xuXHRyZXR1cm4gZnVuY3Rpb24gKF9zb3VyY2UsIF9jb250ZXh0KSB7XG4gICAgc291cmNlID0gX3NvdXJjZTtcblx0XHR0b2tlbnMgPSB0b2tlbml6ZShfc291cmNlLCAnPTw+ISstKiZ8LyVeJywgJz08PiZ8Jyk7XG5cdFx0dG9rZW5fbnIgPSAwO1xuXHRcdGNvbnRleHQgPSBfY29udGV4dDtcblx0XHRhZHZhbmNlKCk7XG5cdFx0dmFyIHMgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIoZW5kKVwiKTtcblx0XHRyZXR1cm4gcztcblx0fTtcbn07XG5cbmV4cG9ydHMucGFyc2UgPSBtYWtlX3BhcnNlKCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4vL+agueaNruWPmOmHj+WPiiB2bSDnoa7lrprlj5jph4/miYDlsZ7nmoTnnJ/mraMgdm1cbnZhciByZWZvcm1TY29wZSA9IGZ1bmN0aW9uICh2bSwgcGF0aCkge1xuICB2YXIgcGF0aHMgPSB1dGlscy5wYXJzZUtleVBhdGgocGF0aCk7XG4gIHZhciBjdXIgPSB2bSwgbG9jYWwgPSBwYXRoc1swXTtcbiAgdmFyIHNjb3BlID0gY3VyLCBhc3MsIGN1clZtID0gY3VyO1xuXG4gIHdoaWxlKGN1cikge1xuICAgIGN1clZtID0gc2NvcGUgPSBjdXI7XG4gICAgYXNzID0gY3VyLl9hc3NpZ25tZW50cztcbiAgICBpZiggY3VyLl9fcmVwZWF0KSB7XG4gICAgICBpZiAoYXNzICYmIGFzcy5sZW5ndGgpIHtcbiAgICAgICAgLy8g5YW35ZCNIHJlcGVhdCDkuI3kvJrnm7TmjqXmn6Xmib7oh6rouqvkvZznlKjln59cbiAgICAgICAgaWYgKGxvY2FsID09PSAnJGluZGV4JyB8fCBsb2NhbCA9PT0gJyRwYXJlbnQnKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gZWxzZSBpZiAobG9jYWwgPT09IGFzc1swXSkge1xuICAgICAgICAgIC8v5L+u5q2ja2V5XG4gICAgICAgICAgaWYgKHBhdGhzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcGF0aHNbMF0gPSAnJGRhdGEnO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXRocy5zaGlmdCgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvL+WMv+WQjSByZXBlYXRcbiAgICAgICAgaWYgKHBhdGggaW4gY3VyKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY3VyID0gY3VyLiRwYXJlbnQ7XG4gIH1cblxuICByZXR1cm4geyBzY29wZTogc2NvcGUsIHZtOmN1clZtLCBwYXRoOiBwYXRocy5qb2luKCcuJykgfVxufTtcblxuLy/moLnmja4gdm0g5Y+KIGtleSDmsYLlgLxcbi8v5rGC5YC855qE57uT5p6c5ZyoIGpzIOWPiuaooeadv+S4reS/neaMgeS4gOiHtFxudmFyIGdldFZhbHVlID0gZnVuY3Rpb24oa2V5LCBzY29wZSkge1xuICB2YXIgcmVmb3JtZWQgPSByZWZvcm1TY29wZShzY29wZSwga2V5KVxuXG4gIHJldHVybiByZWZvcm1lZC5zY29wZVtyZWZvcm1lZC5wYXRoXVxufTtcblxuZXhwb3J0cy5yZWZvcm1TY29wZSA9IHJlZm9ybVNjb3BlO1xuZXhwb3J0cy5nZXRWYWx1ZSA9IGdldFZhbHVlO1xuIiwidmFyIHRva2VuUmVnID0gL3t7KHsoW159XFxuXSspfXxbXn1cXG5dKyl9fS9nO1xuXG4vL+Wtl+espuS4suS4reaYr+WQpuWMheWQq+aooeadv+WNoOS9jeespuagh+iusFxuZnVuY3Rpb24gaGFzVG9rZW4oc3RyKSB7XG4gIHRva2VuUmVnLmxhc3RJbmRleCA9IDA7XG4gIHJldHVybiBzdHIgJiYgdG9rZW5SZWcudGVzdChzdHIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRva2VuKHZhbHVlKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgdGV4dE1hcCA9IFtdXG4gICAgLCBzdGFydCA9IDBcbiAgICAsIHZhbCwgdG9rZW5cbiAgICA7XG4gIFxuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICBcbiAgd2hpbGUoKHZhbCA9IHRva2VuUmVnLmV4ZWModmFsdWUpKSl7XG4gICAgaWYodG9rZW5SZWcubGFzdEluZGV4IC0gc3RhcnQgPiB2YWxbMF0ubGVuZ3RoKXtcbiAgICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdG9rZW5SZWcubGFzdEluZGV4IC0gdmFsWzBdLmxlbmd0aCkpO1xuICAgIH1cbiAgICBcbiAgICB0b2tlbiA9IHtcbiAgICAgIGVzY2FwZTogIXZhbFsyXVxuICAgICwgcGF0aDogKHZhbFsyXSB8fCB2YWxbMV0pLnRyaW0oKVxuICAgICwgcG9zaXRpb246IHRleHRNYXAubGVuZ3RoXG4gICAgLCB0ZXh0TWFwOiB0ZXh0TWFwXG4gICAgfTtcbiAgICBcbiAgICB0b2tlbnMucHVzaCh0b2tlbik7XG4gICAgXG4gICAgLy/kuIDkuKrlvJXnlKjnsbvlnoso5pWw57uEKeS9nOS4uuiKgueCueWvueixoeeahOaWh+acrOWbviwg6L+Z5qC35b2T5p+Q5LiA5Liq5byV55So5pS55Y+Y5LqG5LiA5Liq5YC85ZCOLCDlhbbku5blvJXnlKjlj5blvpfnmoTlgLzpg73kvJrlkIzml7bmm7TmlrBcbiAgICB0ZXh0TWFwLnB1c2godmFsWzBdKTtcbiAgICBcbiAgICBzdGFydCA9IHRva2VuUmVnLmxhc3RJbmRleDtcbiAgfVxuICBcbiAgaWYodmFsdWUubGVuZ3RoID4gc3RhcnQpe1xuICAgIHRleHRNYXAucHVzaCh2YWx1ZS5zbGljZShzdGFydCwgdmFsdWUubGVuZ3RoKSk7XG4gIH1cbiAgXG4gIHRva2Vucy50ZXh0TWFwID0gdGV4dE1hcDtcbiAgXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydHMuaGFzVG9rZW4gPSBoYXNUb2tlbjtcblxuZXhwb3J0cy5wYXJzZVRva2VuID0gcGFyc2VUb2tlbjsiLCJcInVzZSBzdHJpY3RcIjtcblxuLy91dGlsc1xuLy8tLS1cblxudmFyIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnQ7XG5cbnZhciBrZXlQYXRoUmVnID0gLyg/OlxcLnxcXFspL2dcbiAgLCBicmEgPSAvXFxdL2dcbiAgO1xuXG4vL+WwhiBrZXlQYXRoIOi9rOS4uuaVsOe7hOW9ouW8j1xuLy9wYXRoLmtleSwgcGF0aFtrZXldIC0tPiBbJ3BhdGgnLCAna2V5J11cbmZ1bmN0aW9uIHBhcnNlS2V5UGF0aChrZXlQYXRoKXtcbiAgcmV0dXJuIGtleVBhdGgucmVwbGFjZShicmEsICcnKS5zcGxpdChrZXlQYXRoUmVnKTtcbn1cblxuLyoqXG4gKiDlkIjlubblr7nosaFcbiAqIEBzdGF0aWNcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2RlZXA9ZmFsc2VdIOaYr+WQpua3seW6puWQiOW5tlxuICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCDnm67moIflr7nosaFcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0Li4uXSDmnaXmupDlr7nosaFcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSDlkIjlubblkI7nmoQgdGFyZ2V0IOWvueixoVxuICovXG5mdW5jdGlvbiBleHRlbmQoLyogZGVlcCwgdGFyZ2V0LCBvYmplY3QuLi4gKi8pIHtcbiAgdmFyIG9wdGlvbnNcbiAgICAsIG5hbWUsIHNyYywgY29weSwgY29weUlzQXJyYXksIGNsb25lXG4gICAgLCB0YXJnZXQgPSBhcmd1bWVudHNbMF0gfHwge31cbiAgICAsIGkgPSAxXG4gICAgLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoXG4gICAgLCBkZWVwID0gZmFsc2VcbiAgICA7XG5cbiAgLy8gSGFuZGxlIGEgZGVlcCBjb3B5IHNpdHVhdGlvblxuICBpZiAodHlwZW9mIHRhcmdldCA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBkZWVwID0gdGFyZ2V0O1xuXG4gICAgLy8gc2tpcCB0aGUgYm9vbGVhbiBhbmQgdGhlIHRhcmdldFxuICAgIHRhcmdldCA9IGFyZ3VtZW50c1sgaSBdIHx8IHt9O1xuICAgIGkrKztcbiAgfVxuXG4gIGlmKHV0aWxzLmlzRnVuY3Rpb24oYXJndW1lbnRzW2xlbmd0aCAtIDFdKSkge1xuICAgIGxlbmd0aC0tO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2Ugd2hlbiB0YXJnZXQgaXMgYSBzdHJpbmcgb3Igc29tZXRoaW5nIChwb3NzaWJsZSBpbiBkZWVwIGNvcHkpXG4gIGlmICh0eXBlb2YgdGFyZ2V0ICE9PSBcIm9iamVjdFwiICYmICF1dGlscy5pc0Z1bmN0aW9uKHRhcmdldCkpIHtcbiAgICB0YXJnZXQgPSB7fTtcbiAgfVxuXG4gIGZvciAoIDsgaSA8IGxlbmd0aDsgaSsrICkge1xuICAgIC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICBpZiAoIChvcHRpb25zID0gYXJndW1lbnRzWyBpIF0pICE9IG51bGwgKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG4gICAgICBmb3IgKCBuYW1lIGluIG9wdGlvbnMgKSB7XG4gICAgICAgIC8vYW5kcm9pZCAyLjMgYnJvd3NlciBjYW4gZW51bSB0aGUgcHJvdG90eXBlIG9mIGNvbnN0cnVjdG9yLi4uXG4gICAgICAgIGlmKG9wdGlvbnMuaGFzT3duUHJvcGVydHkobmFtZSkgJiYgbmFtZSAhPT0gJ3Byb3RvdHlwZScpe1xuICAgICAgICAgIHNyYyA9IHRhcmdldFsgbmFtZSBdO1xuICAgICAgICAgIGNvcHkgPSBvcHRpb25zWyBuYW1lIF07XG5cblxuICAgICAgICAgIC8vIFJlY3Vyc2UgaWYgd2UncmUgbWVyZ2luZyBwbGFpbiBvYmplY3RzIG9yIGFycmF5c1xuICAgICAgICAgIGlmICggZGVlcCAmJiBjb3B5ICYmICggdXRpbHMuaXNQbGFpbk9iamVjdChjb3B5KSB8fCAoY29weUlzQXJyYXkgPSB1dGlscy5pc0FycmF5KGNvcHkpKSApICkge1xuXG4gICAgICAgICAgICAvLyBQcmV2ZW50IG5ldmVyLWVuZGluZyBsb29wXG4gICAgICAgICAgICBpZiAoIHRhcmdldCA9PT0gY29weSApIHtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIGNvcHlJc0FycmF5ICkge1xuICAgICAgICAgICAgICBjb3B5SXNBcnJheSA9IGZhbHNlO1xuICAgICAgICAgICAgICBjbG9uZSA9IHNyYyAmJiB1dGlscy5pc0FycmF5KHNyYykgPyBzcmMgOiBbXTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNQbGFpbk9iamVjdChzcmMpID8gc3JjIDoge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5ldmVyIG1vdmUgb3JpZ2luYWwgb2JqZWN0cywgY2xvbmUgdGhlbVxuICAgICAgICAgICAgdGFyZ2V0WyBuYW1lIF0gPSBleHRlbmQoIGRlZXAsIGNsb25lLCBjb3B5KTtcblxuICAgICAgICAgICAgLy8gRG9uJ3QgYnJpbmcgaW4gdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSBpZiAoICF1dGlscy5pc1VuZGVmaW5lZChjb3B5KSAmJiB0eXBlb2YgdGFyZ2V0ICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgLy/kuIDkupvmg4XkuIssIOavlOWmgiBmaXJlZm94IOS4i+e7meWtl+espuS4suWvueixoei1i+WAvOaXtuS8muW8guW4uFxuICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0gY29weTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIG1vZGlmaWVkIG9iamVjdFxuICByZXR1cm4gdGFyZ2V0O1xufVxuXG52YXIgY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAobykge1xuICBmdW5jdGlvbiBGKCkge31cbiAgRi5wcm90b3R5cGUgPSBvO1xuICByZXR1cm4gbmV3IEYoKTtcbn07XG5cbnZhciBkZWVwR2V0ID0gZnVuY3Rpb24gKGtleVN0ciwgb2JqKSB7XG4gIHZhciBjaGFpbiwgY3VyID0gb2JqLCBrZXk7XG4gIGlmKGtleVN0cil7XG4gICAgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKTtcbiAgICBmb3IodmFyIGkgPSAwLCBsID0gY2hhaW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBrZXkgPSBjaGFpbltpXTtcbiAgICAgIGlmKGN1cil7XG4gICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGN1cjtcbn1cblxudmFyIHV0aWxzID0ge1xuICBub29wOiBmdW5jdGlvbiAoKXt9XG4sIGllOiAhIWRvYy5hdHRhY2hFdmVudFxuXG4sIGlzT2JqZWN0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbCAhPT0gbnVsbDtcbiAgfVxuXG4sIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnO1xuICB9XG5cbiwgaXNGdW5jdGlvbjogZnVuY3Rpb24gKHZhbCl7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG4gIH1cblxuLCBpc0FycmF5OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYodXRpbHMuaWUpe1xuICAgICAgLy9JRSA5IOWPiuS7peS4iyBJRSDot6jnqpflj6Pmo4DmtYvmlbDnu4RcbiAgICAgIHJldHVybiB2YWwgJiYgdmFsLmNvbnN0cnVjdG9yICsgJycgPT09IEFycmF5ICsgJyc7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpO1xuICAgIH1cbiAgfVxuXG4gIC8v566A5Y2V5a+56LGh55qE566A5piT5Yik5patXG4sIGlzUGxhaW5PYmplY3Q6IGZ1bmN0aW9uIChvKXtcbiAgICBpZiAoIW8gfHwgKHt9KS50b1N0cmluZy5jYWxsKG8pICE9PSAnW29iamVjdCBPYmplY3RdJyB8fCBvLm5vZGVUeXBlIHx8IG8gPT09IG8ud2luZG93KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvL+WHveaVsOWIh+mdoi4gb3JpRm4g5Y6f5aeL5Ye95pWwLCBmbiDliIfpnaLooaXlhYXlh73mlbBcbiAgLy/liY3pnaLnmoTlh73mlbDov5Tlm57lgLzkvKDlhaUgYnJlYWtDaGVjayDliKTmlq0sIGJyZWFrQ2hlY2sg6L+U5Zue5YC85Li655yf5pe25LiN5omn6KGM5YiH6Z2i6KGl5YWF55qE5Ye95pWwXG4sIGJlZm9yZUZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuLCBhZnRlckZuOiBmdW5jdGlvbiAob3JpRm4sIGZuLCBicmVha0NoZWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJldCA9IG9yaUZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBpZihicmVha0NoZWNrICYmIGJyZWFrQ2hlY2suY2FsbCh0aGlzLCByZXQpKXtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH1cbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfVxuXG4sIHBhcnNlS2V5UGF0aDogcGFyc2VLZXlQYXRoXG5cbiwgZGVlcFNldDogZnVuY3Rpb24gKGtleVN0ciwgdmFsdWUsIG9iaikge1xuICAgIGlmKGtleVN0cil7XG4gICAgICB2YXIgY2hhaW4gPSBwYXJzZUtleVBhdGgoa2V5U3RyKVxuICAgICAgICAsIGN1ciA9IG9ialxuICAgICAgICA7XG4gICAgICBjaGFpbi5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgaSkge1xuICAgICAgICBpZihpID09PSBjaGFpbi5sZW5ndGggLSAxKXtcbiAgICAgICAgICBjdXJba2V5XSA9IHZhbHVlO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBpZihjdXIgJiYgY3VyLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBjdXJba2V5XSA9IHt9O1xuICAgICAgICAgICAgY3VyID0gY3VyW2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIGV4dGVuZChvYmosIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuLCBleHRlbmQ6IGV4dGVuZFxuLCBjcmVhdGU6IGNyZWF0ZVxuLCB0b0FycmF5OiBmdW5jdGlvbihhcnJMaWtlKSB7XG4gICAgdmFyIGFyciA9IFtdO1xuXG4gICAgdHJ5e1xuICAgICAgLy9JRSA4IOWvuSBkb20g5a+56LGh5Lya5oql6ZSZXG4gICAgICBhcnIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJMaWtlKVxuICAgIH1jYXRjaCAoZSl7XG4gICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJyTGlrZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgYXJyW2ldID0gYXJyTGlrZVtpXVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHV0aWxzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBldmFsdWF0ZSA9IHJlcXVpcmUoJy4vZXZhbC5qcycpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIHJlZm9ybVNjb3BlID0gcmVxdWlyZSgnLi9zY29wZScpLnJlZm9ybVNjb3BlXG4gIDtcblxuZnVuY3Rpb24gV2F0Y2hlcih2bSwgZGlyKSB7XG4gIHZhciByZWZvcm1lZCwgcGF0aCwgY3VyVm0gPSB2bSwgd2F0Y2hlcnMgPSBbXTtcblxuICB0aGlzLnN0YXRlID0gMTtcbiAgdGhpcy5kaXIgPSBkaXI7XG4gIHRoaXMudm0gPSB2bTtcbiAgdGhpcy53YXRjaGVycyA9IFtdO1xuXG4gIHRoaXMudmFsID0gTmFOO1xuXG4gIGRpci5wYXJzZSgpO1xuICBkaXIuc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkoZGlyLmFzdCk7XG5cbiAgZm9yKHZhciBpID0gMCwgbCA9IGRpci5zdW1tYXJ5LnBhdGhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHJlZm9ybWVkID0gcmVmb3JtU2NvcGUodm0sIGRpci5zdW1tYXJ5LnBhdGhzW2ldKVxuICAgIGN1clZtID0gcmVmb3JtZWQudm1cbiAgICBwYXRoID0gcmVmb3JtZWQucGF0aFxuICAgIGlmKGRpci53YXRjaCkge1xuICAgICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdID0gY3VyVm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdO1xuICAgICAgY3VyVm0uX3dhdGNoZXJzW3BhdGhdLnB1c2godGhpcyk7XG4gICAgICB3YXRjaGVycyA9IGN1clZtLl93YXRjaGVyc1twYXRoXTtcbiAgICB9ZWxzZXtcbiAgICAgIHdhdGNoZXJzID0gW3RoaXNdO1xuICAgIH1cbiAgICB0aGlzLndhdGNoZXJzLnB1c2goIHdhdGNoZXJzICk7XG4gIH1cblxuICB0aGlzLnVwZGF0ZSgpO1xufVxuXG4vL+agueaNruihqOi+vuW8j+enu+mZpOW9k+WJjSB2bSDkuK3nmoQgd2F0Y2hlclxuZnVuY3Rpb24gdW53YXRjaCAodm0sIGV4cCwgY2FsbGJhY2spIHtcbiAgdmFyIHN1bW1hcnk7XG4gIHRyeSB7XG4gICAgc3VtbWFyeSA9IGV2YWx1YXRlLnN1bW1hcnkocGFyc2UoZXhwKSlcbiAgfWNhdGNoIChlKXtcbiAgICBlLm1lc3NhZ2UgPSAnU3ludGF4RXJyb3IgaW4gXCInICsgZXhwICsgJ1wiIHwgJyArIGUubWVzc2FnZTtcbiAgICBjb25zb2xlLmVycm9yKGUpO1xuICB9XG4gIHN1bW1hcnkucGF0aHMuZm9yRWFjaChmdW5jdGlvbihwYXRoKSB7XG4gICAgdmFyIHdhdGNoZXJzID0gdm0uX3dhdGNoZXJzW3BhdGhdIHx8IFtdLCB1cGRhdGU7XG5cbiAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICB1cGRhdGUgPSB3YXRjaGVyc1tpXS5kaXIudXBkYXRlO1xuICAgICAgaWYodXBkYXRlID09PSBjYWxsYmFjayB8fCB1cGRhdGUuX29yaWdpbkZuID09PSBjYWxsYmFjayl7XG4gICAgICAgIHdhdGNoZXJzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGFkZFdhdGNoZXIoZGlyKSB7XG4gIGlmKGRpci5wYXRoKSB7XG4gICAgcmV0dXJuIG5ldyBXYXRjaGVyKHRoaXMsIGRpcik7XG4gIH1cbn1cblxuV2F0Y2hlci51bndhdGNoID0gdW53YXRjaDtcbldhdGNoZXIuYWRkV2F0Y2hlciA9IGFkZFdhdGNoZXI7XG5cbmZ1bmN0aW9uIHdhdGNoZXJVcGRhdGUgKHZhbCkge1xuICB0cnl7XG4gICAgdGhpcy5kaXIudXBkYXRlKHZhbCwgdGhpcy52YWwpO1xuICAgIHRoaXMudmFsID0gdmFsO1xuICB9Y2F0Y2goZSl7XG4gICAgY29uc29sZS5lcnJvcihlKTtcbiAgfVxufVxuXG51dGlscy5leHRlbmQoV2F0Y2hlci5wcm90b3R5cGUsIHtcbiAgLy/ooajovr7lvI/miafooYxcbiAgdXBkYXRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICwgbmV3VmFsXG4gICAgICA7XG5cbiAgICBuZXdWYWwgPSB0aGlzLmRpci5nZXRWYWx1ZSh0aGlzLnZtKTtcblxuICAgIGlmKG5ld1ZhbCAmJiBuZXdWYWwudGhlbikge1xuICAgICAgLy9hIHByb21pc2VcbiAgICAgIG5ld1ZhbC50aGVuKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB3YXRjaGVyVXBkYXRlLmNhbGwodGhhdCwgdmFsKTtcbiAgICAgIH0pO1xuICAgIH1lbHNle1xuICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoaXMsIG5ld1ZhbCk7XG4gICAgfVxuICB9LFxuICB1bndhdGNoOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcnMpIHtcbiAgICAgIGZvcih2YXIgaSA9IHdhdGNoZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICAgICAgaWYod2F0Y2hlcnNbaV0gPT09IHRoaXMpe1xuICAgICAgICAgIGlmKHRoaXMuc3RhdGUpe1xuICAgICAgICAgICAgd2F0Y2hlcnNbaV0uZGlyLnVuTGluaygpO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IDA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHdhdGNoZXJzLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0uYmluZCh0aGlzKSlcbiAgICB0aGlzLndhdGNoZXJzID0gW107XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdhdGNoZXJcbiJdfQ==
