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
  $data: 1, $filters: 1, $watchers: 1
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

    this.trackBy = this.el.getAttribute('track-by')
    this.el.removeAttribute('track-by')

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
var pixelAttrs = [
  'width','height','min-width', 'min-height', 'max-width', 'max-height',
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

        //marginTop -> margin-top
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
//表达式执行

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
      if(l.catch) {
        return l.catch(r.bind(context.locals))
      }else{
        console.error('catchby expect a promise')
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
      return filter.apply(context.locals, [data].concat(args))
    });
  }else{
    return filter.apply(context.locals, [arg].concat(args))
  }
}

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
				a.push(expression(0));
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmVlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsInNyYy9jaGVjay1iaW5kaW5nLmpzIiwic3JjL2NsYXNzLmpzIiwic3JjL2NvbXBvbmVudC5qcyIsInNyYy9kaXJlY3RpdmUuanMiLCJzcmMvZGlyZWN0aXZlcy9hdHRyLmpzIiwic3JjL2RpcmVjdGl2ZXMvY29tcG9uZW50LmpzIiwic3JjL2RpcmVjdGl2ZXMvY29udGVudC5qcyIsInNyYy9kaXJlY3RpdmVzL2luZGV4LmpzIiwic3JjL2RpcmVjdGl2ZXMvbW9kZWwuanMiLCJzcmMvZGlyZWN0aXZlcy9vbi5qcyIsInNyYy9kaXJlY3RpdmVzL3JlcGVhdC5qcyIsInNyYy9kaXJlY3RpdmVzL3N0eWxlLmpzIiwic3JjL2RvbS11dGlscy5qcyIsInNyYy9lbnYuanMiLCJzcmMvZXZhbC5qcyIsInNyYy9ldmVudC1iaW5kLmpzIiwic3JjL3BhcnNlLmpzIiwic3JjL3Njb3BlLmpzIiwic3JjL3Rva2VuLmpzIiwic3JjL3V0aWxzLmpzIiwic3JjL3dhdGNoZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdWQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0bEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gIC8vLCBFdmVudCA9IHJlcXVpcmUoJy4vZXZlbnQuanMnKVxuICAsIENsYXNzID0gcmVxdWlyZSgnLi9jbGFzcy5qcycpXG4gICwgRGlyID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUuanMnKVxuICAsIENvbSA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJylcbiAgLCBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyLmpzJylcblxuICAsIGRpcnMgPSByZXF1aXJlKCcuL2RpcmVjdGl2ZXMnKVxuICAsIGRvbVV0aWxzID0gcmVxdWlyZSgnLi9kb20tdXRpbHMuanMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4vY2hlY2stYmluZGluZy5qcycpXG4gICwgc2NvcGUgPSByZXF1aXJlKCcuL3Njb3BlJylcbiAgO1xuXG5cbnZhciBpc09iamVjdCA9IHV0aWxzLmlzT2JqZWN0XG4gICwgaXNVbmRlZmluZWQgPSB1dGlscy5pc1VuZGVmaW5lZFxuICAsIGlzUGxhaW5PYmplY3QgPSB1dGlscy5pc1BsYWluT2JqZWN0XG4gICwgcGFyc2VLZXlQYXRoID0gdXRpbHMucGFyc2VLZXlQYXRoXG4gICwgZGVlcFNldCA9IHV0aWxzLmRlZXBTZXRcbiAgLCBleHRlbmQgPSB1dGlscy5leHRlbmRcbiAgLCBjcmVhdGUgPSB1dGlscy5jcmVhdGVcbiAgO1xuXG4vL+iuvue9riBkaXJlY3RpdmUg5YmN57yAXG5mdW5jdGlvbiBzZXRQcmVmaXgobmV3UHJlZml4KSB7XG4gIGlmKG5ld1ByZWZpeCl7XG4gICAgdGhpcy5wcmVmaXggPSBuZXdQcmVmaXg7XG4gIH1cbn1cblxudmFyIG1lcmdlUHJvcHMgPSB7XG4gICRkYXRhOiAxLCAkZmlsdGVyczogMSwgJHdhdGNoZXJzOiAxXG59O1xuXG52YXIgbGlmZUN5Y2xlcyA9IHtcbiAgJGluaXQ6IHV0aWxzLm5vb3BcbiwgJGRlc3Ryb3k6IHV0aWxzLm5vb3Bcbn07XG5cbi8qKlxuICog5p6E6YCg5Ye95pWwXG4gKiAtLS1cbiAqIEBwYXJhbSB7U3RyaW5nfEVsZW1lbnR9IFt0cGxdIOaooeadvy4g562J5ZCM5LqOIHByb3BzLiR0cGxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvcHNdIOWxnuaApy/mlrnms5VcbiAqKi9cbmZ1bmN0aW9uIEJlZSh0cGwsIHByb3BzKSB7XG4gIGlmKGlzUGxhaW5PYmplY3QodHBsKSkge1xuICAgIHByb3BzID0gdHBsO1xuICAgIHRwbCA9IHByb3BzLiR0cGw7XG4gIH1cbiAgcHJvcHMgPSBwcm9wcyB8fCB7fTtcblxuICB2YXIgZGVmYXVsdHMgPSB7XG4gICAgLy8kIOW8gOWktOeahOaYr+WFseacieWxnuaApy/mlrnms5VcbiAgICAkZGF0YToge31cbiAgLCAkZmlsdGVyczoge31cbiAgLCAkd2F0Y2hlcnM6IHt9XG4gICwgJG1peGluczogW11cblxuICAsICRlbDogdGhpcy4kZWwgfHwgbnVsbFxuICAsICR0YXJnZXQ6IHRoaXMuJHRhcmdldCB8fCBudWxsXG4gICwgJHRwbDogdGhpcy4kdHBsIHx8ICc8ZGl2PjwvZGl2PidcbiAgLCAkY29udGVudDogdGhpcy4kY29udGVudCB8fCBudWxsXG5cbiAgLCAkcGFyZW50OiBudWxsXG4gICwgJHJvb3Q6IHRoaXNcblxuICAgIC8v56eB5pyJ5bGe5oCnL+aWueazlVxuICAsIF93YXRjaGVyczoge31cbiAgLCBfYXNzaWdubWVudHM6IG51bGwvL+W9k+WJjSB2bSDnmoTliKvlkI1cbiAgLCBfcmVsYXRpdmVQYXRoOiBbXVxuICAsIF9fbGlua3M6IFtdXG4gICwgX2lzUmVuZGVyZWQ6IGZhbHNlXG4gIH07XG5cbiAgdmFyIGVsO1xuXG4gIHZhciBtaXhpbnMgPSAoW2RlZmF1bHRzXS5jb25jYXQodGhpcy4kbWl4aW5zIHx8IFtdKSkuY29uY2F0KFtwcm9wc10pXG5cbiAgbWl4aW5zLmZvckVhY2goZnVuY3Rpb24obWl4aW4pIHtcbiAgICB2YXIgcHJvcDtcbiAgICBmb3IodmFyIHByb3BLZXkgaW4gbWl4aW4pIHtcbiAgICAgIGlmKG1peGluLmhhc093blByb3BlcnR5KHByb3BLZXkpKSB7XG4gICAgICAgIGlmICgocHJvcEtleSBpbiBtZXJnZVByb3BzKSAmJiBpc09iamVjdChtaXhpbltwcm9wS2V5XSkpIHtcbiAgICAgICAgICAvL+S/neaMgeWvueS8oOWFpeWxnuaAp+eahOW8leeUqFxuICAgICAgICAgIC8vbWVyZ2VQcm9wcyDkuK3nmoTlsZ7mgKfkvJrooqvpu5jorqTlgLzmianlsZVcbiAgICAgICAgICBwcm9wID0gZXh0ZW5kKHt9LCB0aGlzW3Byb3BLZXldLCBtaXhpbltwcm9wS2V5XSlcbiAgICAgICAgICB0aGlzW3Byb3BLZXldID0gZXh0ZW5kKG1peGluW3Byb3BLZXldLCBwcm9wKVxuICAgICAgICB9IGVsc2UgaWYgKHByb3BLZXkgaW4gbGlmZUN5Y2xlcykge1xuICAgICAgICAgIHRoaXNbcHJvcEtleV0gPSB1dGlscy5hZnRlckZuKHRoaXNbcHJvcEtleV0sIG1peGluW3Byb3BLZXldKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXNbcHJvcEtleV0gPSBtaXhpbltwcm9wS2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfS5iaW5kKHRoaXMpKVxuXG4gIGlzT2JqZWN0KHRoaXMuJGRhdGEpICYmIGV4dGVuZCh0aGlzLCB0aGlzLiRkYXRhKTtcblxuICB0cGwgPSB0cGwgfHwgdGhpcy4kdHBsO1xuICBlbCA9IGRvbVV0aWxzLnRwbFBhcnNlKHRwbCwgdGhpcy4kdGFyZ2V0LCB0aGlzLiRjb250ZW50KTtcblxuICBpZih0aGlzLiRlbCl7XG4gICAgdGhpcy4kZWwuYXBwZW5kQ2hpbGQoZWwuZWwpO1xuICB9ZWxzZXtcbiAgICB0aGlzLiRlbCA9IGVsLmVsO1xuICB9XG4gIHRoaXMuJHRwbCA9IGVsLnRwbDtcbiAgdGhpcy4kY29udGVudCA9IGVsLmNvbnRlbnQ7XG5cbiAgdGhpcy4kZWwuYmVlID0gdGhpcztcblxuICBpZih0aGlzLiRjb250ZW50KXtcbiAgICB0aGlzLl9fbGlua3MgPSBjaGVja0JpbmRpbmcud2Fsay5jYWxsKHRoaXMuJHJvb3QsIHRoaXMuJGNvbnRlbnQpO1xuICB9XG4gIHRoaXMuX19saW5rcyA9IHRoaXMuX19saW5rcy5jb25jYXQoIGNoZWNrQmluZGluZy53YWxrLmNhbGwodGhpcywgdGhpcy4kZWwpICk7XG5cbiAgZm9yKHZhciBrZXkgaW4gdGhpcy4kd2F0Y2hlcnMpIHtcbiAgICB0aGlzLiR3YXRjaChrZXksIHRoaXMuJHdhdGNoZXJzW2tleV0pXG4gIH1cblxuICB0aGlzLiRyZXBsYWNlKHRoaXMuJGRhdGEpO1xuICB0aGlzLl9pc1JlbmRlcmVkID0gdHJ1ZTtcbiAgdGhpcy4kaW5pdCgpO1xufVxuXG4vL+mdmeaAgeWxnuaAp1xuZXh0ZW5kKEJlZSwge2V4dGVuZDogdXRpbHMuYWZ0ZXJGbihDbGFzcy5leHRlbmQsIHV0aWxzLm5vb3AsIGZ1bmN0aW9uKHN1Yikge1xuICAvL+avj+S4quaehOmAoOWHveaVsOmDveacieiHquW3seeahCBkaXJlY3RpdmVzIOWSjCBjb21wb25lbnRzIOW8leeUqFxuICBzdWIuZGlyZWN0aXZlcyA9IGNyZWF0ZSh0aGlzLmRpcmVjdGl2ZXMpO1xuICBzdWIuY29tcG9uZW50cyA9IGNyZWF0ZSh0aGlzLmNvbXBvbmVudHMpO1xufSksIHV0aWxzOiB1dGlsc30sIERpciwgQ29tLCB7XG4gIHNldFByZWZpeDogc2V0UHJlZml4XG4sIHByZWZpeDogJydcbiwgZG9jOiBkb2NcbiwgZGlyZWN0aXZlczoge31cbiwgY29tcG9uZW50czoge31cbiwgbW91bnQ6IGZ1bmN0aW9uKGlkLCBwcm9wcykge1xuICAgIHZhciBlbCA9IGlkLm5vZGVUeXBlID8gaWQgOiBkb2MuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBDb21wID0gdGhpcy5jb21wb25lbnRzW2VsLnRhZ05hbWUudG9Mb3dlckNhc2UoKV07XG4gICAgdmFyIGluc3RhbmNlXG4gICAgaWYoQ29tcCkge1xuICAgICAgaW5zdGFuY2UgPSBuZXcgQ29tcChleHRlbmQoeyR0YXJnZXQ6IGVsfSwgcHJvcHMpKVxuICAgIH1lbHNle1xuICAgICAgaW5zdGFuY2UgPSBuZXcgQmVlKGVsLCBwcm9wcyk7XG4gICAgfVxuICAgIHJldHVybiBpbnN0YW5jZVxuICB9XG59KTtcblxuXG5CZWUuc2V0UHJlZml4KCdiLScpO1xuXG4vL+WGhee9riBkaXJlY3RpdmVcbmZvcih2YXIgZGlyIGluIGRpcnMpIHtcbiAgQmVlLmRpcmVjdGl2ZShkaXIsIGRpcnNbZGlyXSk7XG59XG5cbi8v5a6e5L6L5pa55rOVXG4vLy0tLS1cbmV4dGVuZChCZWUucHJvdG90eXBlLCAvKkV2ZW50LCovIGxpZmVDeWNsZXMsIHtcbiAgLyoqXG4gICAqIOiOt+WPluWxnuaApy/mlrnms5UtLVxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5UGF0aCDot6/lvoQv6KGo6L6+5byPXG4gICAqIEByZXR1cm4geyp9XG4gICAqL1xuICAkZ2V0OiBmdW5jdGlvbihrZXlQYXRoKSB7XG4gICAgdmFyIGRpciA9IG5ldyBEaXIoJyRnZXQnLCB7XG4gICAgICBwYXRoOiBrZXlQYXRoXG4gICAgLCB3YXRjaDogZmFsc2VcbiAgICB9KTtcbiAgICBkaXIucGFyc2UoKTtcbiAgICByZXR1cm4gZGlyLmdldFZhbHVlKHRoaXMsIGZhbHNlKVxuICB9XG5cbiAgLyoqXG4gICAqICMjIyBiZWUuJHNldFxuICAgKiDmm7TmlrDlkIjlubYgYC5kYXRhYCDkuK3nmoTmlbDmja4uIOWmguaenOWPquacieS4gOS4quWPguaVsCwg6YKj5LmI6L+Z5Liq5Y+C5pWw5bCG5bm25YWlIC4kZGF0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2tleV0g5pWw5o2u6Lev5b6ELlxuICAgKiBAcGFyYW0ge0FueVR5cGV8T2JqZWN0fSB2YWwg5pWw5o2u5YaF5a65LlxuICAgKi9cbiwgJHNldDogZnVuY3Rpb24oa2V5LCB2YWwpIHtcbiAgICB2YXIgYWRkLCBrZXlzLCBoYXNLZXkgPSBmYWxzZTtcbiAgICB2YXIgcmVmb3JtZWQsIHJlS2V5LCByZVZtID0gdGhpcztcbiAgICBpZihpc1VuZGVmaW5lZChrZXkpKXsgcmV0dXJuIHRoaXM7IH1cblxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpe1xuICAgICAgaWYoaXNPYmplY3Qoa2V5KSkge1xuICAgICAgICBleHRlbmQodHJ1ZSwgdGhpcy4kZGF0YSwga2V5KTtcbiAgICAgICAgZXh0ZW5kKHRydWUsIHRoaXMsIGtleSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgICAgYWRkID0gZGVlcFNldChyZUtleSwgdmFsLCB7fSk7XG4gICAgICBpZihrZXlzWzBdID09PSAnJGRhdGEnKSB7XG4gICAgICAgIGFkZCA9IGFkZC4kZGF0YVxuICAgICAgfVxuICAgICAgaWYoaXNPYmplY3QocmVWbS4kZGF0YSkpIHtcbiAgICAgICAgZXh0ZW5kKHRydWUsIHJlVm0uJGRhdGEsIGFkZCk7XG4gICAgICAgIGV4dGVuZCh0cnVlLCByZVZtLCBhZGQpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHJlVm0uJGRhdGEgPSBhZGQ7XG4gICAgICB9XG4gICAgfVxuICAgIGhhc0tleSA/IHVwZGF0ZS5jYWxsKHJlVm0sIHJlS2V5LCB2YWwpIDogdXBkYXRlLmNhbGwocmVWbSwga2V5KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICAvKipcbiAgICog5pWw5o2u5pu/5o2iXG4gICAqL1xuLCAkcmVwbGFjZTogZnVuY3Rpb24gKGtleSwgdmFsKSB7XG4gICAgdmFyIGtleXMsIGhhc0tleSA9IGZhbHNlO1xuICAgIHZhciByZWZvcm1lZCwgcmVLZXksIHJlVm0gPSB0aGlzO1xuXG4gICAgaWYoaXNVbmRlZmluZWQoa2V5KSl7IHJldHVybiB0aGlzOyB9XG5cbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcbiAgICAgIGlmKGlzT2JqZWN0KGtleSkpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy4kZGF0YSkuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICBkZWxldGUgdGhpc1trZXldO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIGV4dGVuZCh0aGlzLCBrZXkpO1xuICAgICAgfVxuICAgICAgdGhpcy4kZGF0YSA9IGtleTtcbiAgICB9ZWxzZXtcbiAgICAgIGhhc0tleSA9IHRydWU7XG4gICAgICByZWZvcm1lZCA9IHNjb3BlLnJlZm9ybVNjb3BlKHRoaXMsIGtleSlcbiAgICAgIHJlS2V5ID0gcmVmb3JtZWQucGF0aDtcbiAgICAgIHJlVm0gPSByZWZvcm1lZC52bTtcbiAgICAgIGtleXMgPSBwYXJzZUtleVBhdGgocmVLZXkpO1xuICAgICAgaWYoa2V5c1swXSAhPT0gJyRkYXRhJykge1xuICAgICAgICBkZWVwU2V0KHJlS2V5LCB2YWwsIHJlVm0uJGRhdGEpO1xuICAgICAgfVxuICAgICAgZGVlcFNldChyZUtleSwgdmFsLCByZVZtKTtcbiAgICB9XG4gICAgaGFzS2V5ID8gdXBkYXRlLmNhbGwocmVWbSwgcmVLZXksIHZhbCkgOiB1cGRhdGUuY2FsbChyZVZtLCBrZXkpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIC8qKlxuICAgKiDmiYvliqjmm7TmlrDmn5Dpg6jliIbmlbDmja5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleVBhdGgg5oyH5a6a5pu05paw5pWw5o2u55qEIGtleVBhdGhcbiAgICogQHBhcmFtIHtCb29sZWFufSBbaXNCdWJibGU9dHJ1ZV0g5piv5ZCm5pu05pawIGtleVBhdGgg55qE54i257qnXG4gICAqL1xuLCAkdXBkYXRlOiBmdW5jdGlvbiAoa2V5UGF0aCwgaXNCdWJibGUpIHtcbiAgICBpc0J1YmJsZSA9IGlzQnViYmxlICE9PSBmYWxzZTtcblxuICAgIHZhciBrZXlzID0gcGFyc2VLZXlQYXRoKGtleVBhdGgucmVwbGFjZSgvXlxcJGRhdGFcXC4vLCAnJykpLCBrZXksIGF0dHJzO1xuICAgIHZhciB3YXRjaGVycztcblxuICAgIHdoaWxlKGtleSA9IGtleXMuam9pbignLicpKSB7XG4gICAgICB3YXRjaGVycyA9IHRoaXMuX3dhdGNoZXJzW2tleV0gfHwgW107XG5cbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gd2F0Y2hlcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHdhdGNoZXJzW2ldLnVwZGF0ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZihpc0J1YmJsZSkge1xuICAgICAgICBrZXlzLnBvcCgpO1xuICAgICAgICAvL+acgOe7iOmDveWGkuazoeWIsCAkZGF0YVxuICAgICAgICBpZigha2V5cy5sZW5ndGggJiYga2V5ICE9PSAnJGRhdGEnKXtcbiAgICAgICAgICBrZXlzLnB1c2goJyRkYXRhJyk7XG4gICAgICAgIH1cbiAgICAgIH1lbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhdHRycyA9IHRoaXMuJGdldChrZXlQYXRoKTtcblxuICAgIC8v5ZCM5pe25pu05paw5a2Q6Lev5b6EXG4gICAgaWYoaXNPYmplY3QoYXR0cnMpICYmICF1dGlscy5pc0FycmF5KGF0dHJzKSkge1xuICAgICAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuICAgICAgICB0aGlzLiR1cGRhdGUoa2V5UGF0aCArICcuJyArIGF0dHIsIGZhbHNlKTtcbiAgICAgIH0uYmluZCh0aGlzKSlcbiAgICB9XG5cbiAgICBpZihpc0J1YmJsZSkge1xuICAgICAgaWYodGhpcy4kcGFyZW50KSB7XG4gICAgICAgIC8v5ZCM5q2l5pu05paw54i2IHZtIOWvueW6lOmDqOWIhlxuICAgICAgICB0aGlzLl9yZWxhdGl2ZVBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgIHRoaXMuJHBhcmVudC4kdXBkYXRlKHBhdGgpO1xuICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy/mm7TmlrDmlbDnu4Tplb/luqZcbiAgICBpZih1dGlscy5pc0FycmF5KGF0dHJzKSkge1xuICAgICAgdGhpcy4kdXBkYXRlKGtleVBhdGggKyAnLmxlbmd0aCcsIGZhbHNlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuLCAkd2F0Y2g6IGZ1bmN0aW9uIChrZXlQYXRoLCBjYWxsYmFjaykge1xuICAgIGlmKGNhbGxiYWNrKSB7XG4gICAgICB2YXIgdXBkYXRlID0gY2FsbGJhY2suYmluZCh0aGlzKTtcbiAgICAgIHVwZGF0ZS5fb3JpZ2luRm4gPSBjYWxsYmFjaztcbiAgICAgIFdhdGNoZXIuYWRkV2F0Y2hlci5jYWxsKHRoaXMsIG5ldyBEaXIoJyR3YXRjaCcsIHtwYXRoOiBrZXlQYXRoLCB1cGRhdGU6IHVwZGF0ZX0pKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuLCAkdW53YXRjaDogZnVuY3Rpb24gKGtleVBhdGgsIGNhbGxiYWNrKSB7XG4gICAgV2F0Y2hlci51bndhdGNoKHRoaXMsIGtleVBhdGgsIGNhbGxiYWNrKVxuICAgIHJldHVybiB0aGlzO1xuICB9XG4sIF9fZGVzdHJveTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fX2xpbmtzLmZvckVhY2goZnVuY3Rpb24od2FjaGVyKSB7XG4gICAgICB3YWNoZXIudW53YXRjaCgpXG4gICAgfSlcbiAgICB0aGlzLl9fbGlua3MgPSBbXTtcbiAgICB0aGlzLiRkZXN0cm95KClcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHVwZGF0ZSAoa2V5UGF0aCwgZGF0YSkge1xuICB2YXIga2V5UGF0aHM7XG5cbiAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGRhdGEgPSBrZXlQYXRoO1xuICB9ZWxzZXtcbiAgICBrZXlQYXRocyA9IFtrZXlQYXRoXTtcbiAgfVxuXG4gIGlmKCFrZXlQYXRocykge1xuICAgIGlmKGlzT2JqZWN0KGRhdGEpKSB7XG4gICAgICBrZXlQYXRocyA9IE9iamVjdC5rZXlzKGRhdGEpO1xuICAgIH1lbHNle1xuICAgICAgLy8uJGRhdGEg5pyJ5Y+v6IO95piv5Z+65pys57G75Z6L5pWw5o2uXG4gICAgICBrZXlQYXRocyA9IFsnJGRhdGEnXTtcbiAgICB9XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBwYXRoOyBwYXRoID0ga2V5UGF0aHNbaV07IGkrKyl7XG4gICAgdGhpcy4kdXBkYXRlKHBhdGgsIHRydWUpO1xuICB9XG5cbn1cblxuQmVlLnZlcnNpb24gPSAnMC4yLjAnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJlZTtcbiIsbnVsbCwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXYXRjaGVyID0gcmVxdWlyZSgnLi93YXRjaGVyJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxuICA7XG5cbnZhciBOT0RFVFlQRSA9IHtcbiAgICBFTEVNRU5UOiAxXG4gICwgQVRUUjogMlxuICAsIFRFWFQ6IDNcbiAgLCBDT01NRU5UOiA4XG4gICwgRlJBR01FTlQ6IDExXG59O1xuXG5kb2MuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKVxuXG4vL+mBjeWOhiBkb20g5qCRXG5mdW5jdGlvbiB3YWxrKGVsKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdLCBkaXJSZXN1bHQ7XG4gIGlmKGVsLm5vZGVUeXBlID09PSBOT0RFVFlQRS5GUkFHTUVOVCkge1xuICAgIGVsID0gZWwuY2hpbGROb2RlcztcbiAgfVxuXG4gIGlmKCgnbGVuZ3RoJyBpbiBlbCkgJiYgdXRpbHMuaXNVbmRlZmluZWQoZWwubm9kZVR5cGUpKXtcbiAgICAvL25vZGUgbGlzdFxuICAgIC8v5a+55LqOIG5vZGVsaXN0IOWmguaenOWFtuS4reacieWMheWQqyB7e3RleHR9fSDnm7TmjqXph4/nmoTooajovr7lvI8sIOaWh+acrOiKgueCueS8muiiq+WIhuWJsiwg5YW26IqC54K55pWw6YeP5Y+v6IO95Lya5Yqo5oCB5aKe5YqgXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGVsLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGVsW2ldKSApO1xuICAgIH1cbiAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBzd2l0Y2ggKGVsLm5vZGVUeXBlKSB7XG4gICAgY2FzZSBOT0RFVFlQRS5FTEVNRU5UOlxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOT0RFVFlQRS5DT01NRU5UOlxuICAgICAgLy/ms6jph4roioLngrlcbiAgICAgIHJldHVybiB3YXRjaGVycztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTk9ERVRZUEUuVEVYVDpcbiAgICAgIC8v5paH5pys6IqC54K5XG4gICAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggY2hlY2tUZXh0LmNhbGwodGhpcywgZWwpICk7XG4gICAgICByZXR1cm4gd2F0Y2hlcnM7XG4gIH1cblxuICBpZihlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAndGVtcGxhdGUnKSB7XG4gICAgLy90ZW1wbGF0ZSBzaGltXG4gICAgaWYoIWVsLmNvbnRlbnQpIHtcbiAgICAgIGVsLmNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgd2hpbGUoZWwuY2hpbGROb2Rlc1swXSkge1xuICAgICAgICBlbC5jb250ZW50LmFwcGVuZENoaWxkKGVsLmNoaWxkTm9kZXNbMF0pXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZGlyUmVzdWx0ID0gY2hlY2tBdHRyLmNhbGwodGhpcywgZWwpO1xuICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdChkaXJSZXN1bHQud2F0Y2hlcnMpXG4gIGlmKGRpclJlc3VsdC50ZXJtaW5hbCl7XG4gICAgcmV0dXJuIHdhdGNoZXJzO1xuICB9XG5cbiAgaWYoZWwubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCB3YWxrLmNhbGwodGhpcywgZWwuY29udGVudCkgKVxuICB9XG5cbiAgZm9yKHZhciBjaGlsZCA9IGVsLmZpcnN0Q2hpbGQsIG5leHQ7IGNoaWxkOyApe1xuICAgIG5leHQgPSBjaGlsZC5uZXh0U2libGluZztcbiAgICB3YXRjaGVycyA9IHdhdGNoZXJzLmNvbmNhdCggd2Fsay5jYWxsKHRoaXMsIGNoaWxkKSApO1xuICAgIGNoaWxkID0gbmV4dDtcbiAgfVxuXG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG4vL+mBjeWOhuWxnuaAp1xuZnVuY3Rpb24gY2hlY2tBdHRyKGVsKSB7XG4gIHZhciBjc3RyID0gdGhpcy5jb25zdHJ1Y3RvclxuICAgICwgcHJlZml4ID0gY3N0ci5wcmVmaXhcbiAgICAsIGRpcnMgPSBjc3RyLmRpcmVjdGl2ZS5nZXREaXIoZWwsIGNzdHIuZGlyZWN0aXZlcywgY3N0ci5jb21wb25lbnRzLCBwcmVmaXgpXG4gICAgLCBkaXJcbiAgICAsIHRlcm1pbmFsUHJpb3JpdHksIHdhdGNoZXJzID0gW11cbiAgICAsIHJlc3VsdCA9IHt9O1xuICA7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBkaXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGRpciA9IGRpcnNbaV07XG4gICAgZGlyLmRpcnMgPSBkaXJzO1xuXG4gICAgLy/lr7nkuo4gdGVybWluYWwg5Li6IHRydWUg55qEIGRpcmVjdGl2ZSwg5Zyo6Kej5p6Q5a6M5YW255u45ZCM5p2D6YeN55qEIGRpcmVjdGl2ZSDlkI7kuK3mlq3pgY3ljobor6XlhYPntKBcbiAgICBpZih0ZXJtaW5hbFByaW9yaXR5ID4gZGlyLnByaW9yaXR5KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUoZGlyLm5vZGVOYW1lKTtcblxuICAgIHdhdGNoZXJzID0gd2F0Y2hlcnMuY29uY2F0KCBzZXRCaW5kaW5nLmNhbGwodGhpcywgZGlyKSApO1xuXG4gICAgaWYoZGlyLnRlcm1pbmFsKSB7XG4gICAgICByZXN1bHQudGVybWluYWwgPSB0cnVlO1xuICAgICAgdGVybWluYWxQcmlvcml0eSA9IGRpci5wcmlvcml0eTtcbiAgICB9XG4gIH1cblxuICByZXN1bHQud2F0Y2hlcnMgPSB3YXRjaGVyc1xuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy/lpITnkIbmlofmnKzoioLngrnkuK3nmoTnu5HlrprljaDkvY3nrKYoe3suLi59fSlcbmZ1bmN0aW9uIGNoZWNrVGV4dChub2RlKSB7XG4gIHZhciB3YXRjaGVycyA9IFtdO1xuICBpZih0b2tlbi5oYXNUb2tlbihub2RlLm5vZGVWYWx1ZSkpIHtcbiAgICB2YXIgdG9rZW5zID0gdG9rZW4ucGFyc2VUb2tlbihub2RlLm5vZGVWYWx1ZSlcbiAgICAgICwgdGV4dE1hcCA9IHRva2Vucy50ZXh0TWFwXG4gICAgICAsIGVsID0gbm9kZS5wYXJlbnROb2RlXG4gICAgICAsIGRpcnMgPSB0aGlzLmNvbnN0cnVjdG9yLmRpcmVjdGl2ZXNcbiAgICAgICwgdCwgZGlyXG4gICAgICA7XG5cbiAgICAvL+Wwhnt7a2V5fX3liIblibLmiJDljZXni6znmoTmlofmnKzoioLngrlcbiAgICBpZih0ZXh0TWFwLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRleHRNYXAuZm9yRWFjaChmdW5jdGlvbih0ZXh0KSB7XG4gICAgICAgIHZhciB0biA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKHRuLCBub2RlKTtcbiAgICAgICAgd2F0Y2hlcnMgPSB3YXRjaGVycy5jb25jYXQoY2hlY2tUZXh0LmNhbGwodGhpcywgdG4pKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICBlbC5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9ZWxzZXtcbiAgICAgIHQgPSB0b2tlbnNbMF07XG4gICAgICAvL+WGhee9ruWQhOWNoOS9jeespuWkhOeQhi5cbiAgICAgIGRpciA9IHV0aWxzLmNyZWF0ZSh0LmVzY2FwZSA/IGRpcnMudGV4dCA6IGRpcnMuaHRtbCk7XG4gICAgICB3YXRjaGVycyA9IHNldEJpbmRpbmcuY2FsbCh0aGlzLCB1dGlscy5leHRlbmQoZGlyLCB0LCB7XG4gICAgICAgIGVsOiBub2RlXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB3YXRjaGVyc1xufVxuXG5mdW5jdGlvbiBzZXRCaW5kaW5nKGRpcikge1xuICB2YXIgd2F0Y2hlclxuICBpZihkaXIucmVwbGFjZSkge1xuICAgIHZhciBlbCA9IGRpci5lbDtcbiAgICBpZih1dGlscy5pc0Z1bmN0aW9uKGRpci5yZXBsYWNlKSkge1xuICAgICAgZGlyLm5vZGUgPSBkaXIucmVwbGFjZSgpO1xuICAgIH1lbHNlIGlmKGRpci5yZXBsYWNlKXtcbiAgICAgIGRpci5ub2RlID0gZG9jLmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICB9XG5cbiAgICBkaXIuZWwgPSBkaXIuZWwucGFyZW50Tm9kZTtcbiAgICBkaXIuZWwucmVwbGFjZUNoaWxkKGRpci5ub2RlLCBlbCk7XG4gIH1cblxuICBkaXIubGluayh0aGlzKTtcblxuICB3YXRjaGVyID0gV2F0Y2hlci5hZGRXYXRjaGVyLmNhbGwodGhpcywgZGlyKVxuICByZXR1cm4gd2F0Y2hlciA/IFt3YXRjaGVyXSA6IFtdXG59XG5cbmZ1bmN0aW9uIHVuQmluZGluZyh3YXRjaGVycykge1xuICB3YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXIpIHtcbiAgICB3YXRjaGVyLnVud2F0Y2goKVxuICB9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgd2Fsazogd2FsayxcbiAgdW5CaW5kaW5nOiB1bkJpbmRpbmdcbn07XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlscy5qcycpLmV4dGVuZDtcblxudmFyIENsYXNzID0ge1xuICAvKiogXG4gICAqIOaehOmAoOWHveaVsOe7p+aJvy4gXG4gICAqIOWmgjogYHZhciBDYXIgPSBCZWUuZXh0ZW5kKHtkcml2ZTogZnVuY3Rpb24oKXt9fSk7IG5ldyBDYXIoKTtgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvdG9Qcm9wc10g5a2Q5p6E6YCg5Ye95pWw55qE5omp5bGV5Y6f5Z6L5a+56LGhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbc3RhdGljUHJvcHNdIOWtkOaehOmAoOWHveaVsOeahOaJqeWxlemdmeaAgeWxnuaAp1xuICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0g5a2Q5p6E6YCg5Ye95pWwXG4gICAqL1xuICBleHRlbmQ6IGZ1bmN0aW9uIChwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuICAgIHByb3RvUHJvcHMgPSBwcm90b1Byb3BzIHx8IHt9O1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IHByb3RvUHJvcHMuaGFzT3duUHJvcGVydHkoJ2NvbnN0cnVjdG9yJykgPyBwcm90b1Byb3BzLmNvbnN0cnVjdG9yIDogZnVuY3Rpb24oKXsgcmV0dXJuIHN1cC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgdmFyIHN1cCA9IHRoaXM7XG4gICAgdmFyIEZuID0gZnVuY3Rpb24oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjb25zdHJ1Y3RvcjsgfTtcbiAgICBcbiAgICBGbi5wcm90b3R5cGUgPSBzdXAucHJvdG90eXBlO1xuICAgIGNvbnN0cnVjdG9yLnByb3RvdHlwZSA9IG5ldyBGbigpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuICAgIGV4dGVuZChjb25zdHJ1Y3Rvciwgc3VwLCBzdGF0aWNQcm9wcywge19fc3VwZXJfXzogc3VwLnByb3RvdHlwZX0pO1xuICAgIFxuICAgIHJldHVybiBjb25zdHJ1Y3RvcjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDbGFzczsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4vKipcbiAqIOazqOWGjOe7hOS7tlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWUg6Ieq5a6a5LmJ57uE5Lu255qE5qCH562+5ZCNXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHByb3BzfSBDb21wb25lbnQg6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwIC8g5p6E6YCg5Ye95pWw5Y+C5pWwXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0g6Ieq5a6a5LmJ57uE5Lu255qE5p6E6YCg5Ye95pWwXG4gKi9cbmZ1bmN0aW9uIHRhZyh0YWdOYW1lLCBDb21wb25lbnQsIHN0YXRpY3MpIHtcbiAgdmFyIHRhZ3MgPSB0aGlzLmNvbXBvbmVudHMgPSB0aGlzLmNvbXBvbmVudHMgfHwge307XG5cbiAgdGhpcy5kb2MuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTsvL2ZvciBvbGQgSUVcblxuICBpZih1dGlscy5pc09iamVjdChDb21wb25lbnQpKSB7XG4gICAgQ29tcG9uZW50ID0gdGhpcy5leHRlbmQoQ29tcG9uZW50LCBzdGF0aWNzKTtcbiAgfVxuICByZXR1cm4gdGFnc1t0YWdOYW1lXSA9IENvbXBvbmVudDtcbn1cblxuZXhwb3J0cy50YWcgPSBleHBvcnRzLmNvbXBvbmVudCA9IHRhZztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4vdG9rZW4uanMnKVxuICAsIGRvYyA9IHJlcXVpcmUoJy4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UuanMnKS5wYXJzZVxuICAsIGV2YWx1YXRlID0gcmVxdWlyZSgnLi9ldmFsLmpzJylcblxuICAsIGNyZWF0ZSA9IHV0aWxzLmNyZWF0ZVxuICA7XG5cbi8qKlxuICog5Li6IEJlZSDmnoTpgKDlh73mlbDmt7vliqDmjIfku6QgKGRpcmVjdGl2ZSkuIGBCZWUuZGlyZWN0aXZlYFxuICogQHBhcmFtIHtTdHJpbmd9IGtleSBkaXJlY3RpdmUg5ZCN56ewXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdHNdIGRpcmVjdGl2ZSDlj4LmlbBcbiAqIEBwYXJhbSB7TnVtYmVyfSBvcHRzLnByaW9yaXR5PTAgZGlyZWN0aXZlIOS8mOWFiOe6py4g5ZCM5LiA5Liq5YWD57Sg5LiK55qE5oyH5Luk5oyJ54Wn5LyY5YWI57qn6aG65bqP5omn6KGMLlxuICogQHBhcmFtIHtCb29sZWFufSBvcHRzLnRlcm1pbmFsPWZhbHNlIOaJp+ihjOivpSBkaXJlY3RpdmUg5ZCOLCDmmK/lkKbnu4jmraLlkI7nu60gZGlyZWN0aXZlIOaJp+ihjC5cbiAqICAgdGVybWluYWwg5Li655yf5pe2LCDkuI7or6UgZGlyZWN0aXZlIOS8mOWFiOe6p+ebuOWQjOeahCBkaXJlY3RpdmUg5LuN5Lya57un57ut5omn6KGMLCDovoPkvY7kvJjlhYjnuqfnmoTmiY3kvJrooqvlv73nlaUuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdHMuYW5jaG9yIGFuY2hvciDkuLogdHJ1ZSDml7YsIOS8muWcqOaMh+S7pOiKgueCueWJjeWQjuWQhOS6p+eUn+S4gOS4quepuueZveeahOagh+iusOiKgueCuS4g5YiG5Yir5a+55bqUIGBhbmNob3JzLnN0YXJ0YCDlkowgYGFuY2hvcnMuZW5kYFxuICovXG5mdW5jdGlvbiBkaXJlY3RpdmUoa2V5LCBvcHRzKSB7XG4gIHZhciBkaXJzID0gdGhpcy5kaXJlY3RpdmVzID0gdGhpcy5kaXJlY3RpdmVzIHx8IHt9O1xuXG4gIHJldHVybiBkaXJzW2tleV0gPSBuZXcgRGlyZWN0aXZlKGtleSwgb3B0cyk7XG59XG5cbmZ1bmN0aW9uIERpcmVjdGl2ZShrZXksIG9wdHMpIHtcbiAgdGhpcy50eXBlID0ga2V5O1xuICB1dGlscy5leHRlbmQodGhpcywgb3B0cyk7XG59XG5cbkRpcmVjdGl2ZS5wcm90b3R5cGUgPSB7XG4gIHByaW9yaXR5OiAwLy/mnYPph41cbiwgbGluazogdXRpbHMubm9vcC8v5Yid5aeL5YyW5pa55rOVXG4sIHVuTGluazogdXRpbHMubm9vcC8v6ZSA5q+B5Zue6LCDXG4sIHVwZGF0ZTogdXRpbHMubm9vcC8v5pu05paw5pa55rOVXG4sIHRlYXJEb3duOiB1dGlscy5ub29wXG4sIHRlcm1pbmFsOiBmYWxzZS8v5piv5ZCm57uI5q2iXG4sIHJlcGxhY2U6IGZhbHNlLy/mmK/lkKbmm7/mjaLlvZPliY3lhYPntKAuIOWmguaenOaYrywg5bCG55So5LiA5Liq56m655qE5paH5pys6IqC54K55pu/5o2i5b2T5YmN5YWD57SgXG4sIHdhdGNoOiB0cnVlLy/mmK/lkKbnm5Hmjqcga2V5IOeahOWPmOWMllxuXG4sIGFuY2hvcjogZmFsc2VcbiwgYW5jaG9yczogbnVsbFxuXG4gIC8v5b2TIGFuY2hvciDkuLogdHJ1ZSDml7YsIOiOt+WPluS4pOS4qumUmueCueS5i+mXtOeahOaJgOacieiKgueCuS5cbiwgZ2V0Tm9kZXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBub2RlcyA9IFtdLCBub2RlID0gdGhpcy5hbmNob3JzLnN0YXJ0Lm5leHRTaWJsaW5nO1xuICAgIGlmKHRoaXMuYW5jaG9yICYmIG5vZGUpIHtcbiAgICAgIHdoaWxlKG5vZGUgIT09IHRoaXMuYW5jaG9ycy5lbmQpe1xuICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5vZGVzO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG4gIC8v6Kej5p6Q6KGo6L6+5byPXG4sIHBhcnNlOiBmdW5jdGlvbigpIHtcbiAgICB0cnl7XG4gICAgICB0aGlzLmFzdCA9IHBhcnNlKHRoaXMucGF0aCwgdGhpcy50eXBlKTtcbiAgICB9Y2F0Y2goZSkge1xuICAgICAgdGhpcy5hc3QgPSB7fTtcbiAgICAgIGUubWVzc2FnZSA9ICdTeW50YXhFcnJvciBpbiBcIicgKyB0aGlzLnBhdGggKyAnXCIgfCAnICsgZS5tZXNzYWdlO1xuICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICB9XG4gIH1cbiAgLy/ooajovr7lvI/msYLlgLxcbiAgLy9mb3JnaXZlW3RydWVdOiDmmK/lkKblsIYgdW5kZWZpbmVkIOWPiiBudWxsIOi9rOS4uuepuuWtl+esplxuLCBnZXRWYWx1ZTogZnVuY3Rpb24oc2NvcGUsIGZvcmdpdmUpIHtcbiAgICBmb3JnaXZlID0gZm9yZ2l2ZSAhPT0gZmFsc2U7XG4gICAgdmFyIHZhbDtcblxuICAgIHRyeXtcbiAgICAgIHZhbCA9IGV2YWx1YXRlLmV2YWwodGhpcy5hc3QsIHNjb3BlLCB0aGlzKTtcbiAgICB9Y2F0Y2goZSl7XG4gICAgICB2YWwgPSAnJztcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICAgIGlmKGZvcmdpdmUgJiYgKHV0aWxzLmlzVW5kZWZpbmVkKHZhbCkgfHwgdmFsID09PSBudWxsKSkge1xuICAgICAgdmFsID0gJyc7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG4gIH1cbn07XG5cbnZhciBhdHRyUG9zdFJlZyA9IC9cXD8kLztcblxuLy/ojrflj5bkuIDkuKrlhYPntKDkuIrmiYDmnInnlKggSFRNTCDlsZ7mgKflrprkuYnnmoTmjIfku6RcbmZ1bmN0aW9uIGdldERpcihlbCwgZGlyZWN0aXZlcywgY29tcG9uZW50cywgcHJlZml4KSB7XG4gIHByZWZpeCA9IHByZWZpeCB8fCAnJztcbiAgZGlyZWN0aXZlcyA9IGRpcmVjdGl2ZXMgfHwge307XG5cbiAgdmFyIGF0dHIsIGF0dHJOYW1lLCBkaXJOYW1lLCBwcm90b1xuICAgICwgZGlycyA9IFtdLCBkaXIsIGFuY2hvcnMgPSB7fVxuICAgICwgcGFyZW50ID0gZWwucGFyZW50Tm9kZVxuICAgICwgbm9kZU5hbWUgPSBlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpXG4gICAgO1xuXG4gIC8v5a+55LqO6Ieq5a6a5LmJ5qCH562+LCDlsIblhbbovazkuLogZGlyZWN0aXZlXG4gIGlmKG5vZGVOYW1lIGluIGNvbXBvbmVudHMpIHtcbiAgICBlbC5zZXRBdHRyaWJ1dGUocHJlZml4ICsgJ2NvbXBvbmVudCcsIG5vZGVOYW1lKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IGVsLmF0dHJpYnV0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgIGF0dHIgPSBlbC5hdHRyaWJ1dGVzW2ldO1xuICAgIGF0dHJOYW1lID0gYXR0ci5ub2RlTmFtZTtcbiAgICBkaXJOYW1lID0gYXR0ck5hbWUuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gICAgcHJvdG8gPSB7ZWw6IGVsLCBub2RlOiBhdHRyLCBub2RlTmFtZTogYXR0ck5hbWUsIHBhdGg6IGF0dHIudmFsdWV9O1xuICAgIGRpciA9IG51bGw7XG5cbiAgICBpZihhdHRyTmFtZS5pbmRleE9mKHByZWZpeCkgPT09IDAgJiYgKGRpck5hbWUgaW4gZGlyZWN0aXZlcykpIHtcbiAgICAgIC8v5oyH5LukXG4gICAgICBkaXIgPSBjcmVhdGUoZGlyZWN0aXZlc1tkaXJOYW1lXSk7XG4gICAgICBkaXIuZGlyTmFtZSA9IGRpck5hbWUvL2RpciDlkI1cbiAgICB9ZWxzZSBpZih0b2tlbi5oYXNUb2tlbihhdHRyLnZhbHVlKSkge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/lj6/og73mnInlpJrkuKrooajovr7lvI/ljLpcbiAgICAgIHRva2VuLnBhcnNlVG9rZW4oYXR0ci52YWx1ZSkuZm9yRWFjaChmdW5jdGlvbihvcmlnaW4pIHtcbiAgICAgICAgb3JpZ2luLmRpck5hbWUgPSBhdHRyTmFtZS5pbmRleE9mKHByZWZpeCkgPT09IDAgPyBkaXJOYW1lIDogYXR0ck5hbWUgO1xuICAgICAgICBkaXJzLnB1c2godXRpbHMuZXh0ZW5kKGNyZWF0ZShkaXJlY3RpdmVzLmF0dHIpLCBwcm90bywgb3JpZ2luKSlcbiAgICAgIH0pO1xuICAgICAgLy/nlLHkuo7lt7Lnn6XlsZ7mgKfooajovr7lvI/kuI3lrZjlnKggYW5jaG9yLCDmiYDku6Xnm7TmjqXot7Pov4fkuIvpnaLnmoTmo4DmtYtcbiAgICB9ZWxzZSBpZihhdHRyUG9zdFJlZy50ZXN0KGF0dHJOYW1lKSkge1xuICAgICAgLy/mnaHku7blsZ7mgKfmjIfku6RcbiAgICAgIGRpciA9IHV0aWxzLmV4dGVuZChjcmVhdGUoZGlyZWN0aXZlcy5hdHRyKSwgeyBkaXJOYW1lOiBhdHRyTmFtZS5yZXBsYWNlKGF0dHJQb3N0UmVnLCAnJyksIGNvbmRpdGlvbmFsOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGlmKGRpcikge1xuICAgICAgaWYoZGlyLmFuY2hvciAmJiAhYW5jaG9ycy5zdGFydCkge1xuICAgICAgICAvL+WQjOS4gOS4quWFg+e0oOS4iueahCBkaXJlY3RpdmUg5YWx5Lqr5ZCM5LiA5a+56ZSa54K5XG4gICAgICAgIGFuY2hvcnMuc3RhcnQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgc3RhcnQnKTtcbiAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLnN0YXJ0LCBlbCk7XG5cbiAgICAgICAgYW5jaG9ycy5lbmQgPSBkb2MuY3JlYXRlQ29tbWVudChkaXIuZGlyTmFtZSArICcgZW5kJyk7XG4gICAgICAgIGlmKGVsLm5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShhbmNob3JzLmVuZCwgZWwubmV4dFNpYmxpbmcpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoYW5jaG9ycy5lbmQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkaXIuYW5jaG9ycyA9IGRpci5hbmNob3IgPyBhbmNob3JzIDogbnVsbDtcbiAgICAgIGRpcnMucHVzaCh1dGlscy5leHRlbmQoZGlyLCBwcm90bykpO1xuICAgIH1cbiAgfVxuICBkaXJzLnNvcnQoZnVuY3Rpb24oZDAsIGQxKSB7XG4gICAgcmV0dXJuIGQxLnByaW9yaXR5IC0gZDAucHJpb3JpdHk7XG4gIH0pO1xuICByZXR1cm4gZGlycztcbn1cblxuRGlyZWN0aXZlLmRpcmVjdGl2ZSA9IGRpcmVjdGl2ZTtcbmRpcmVjdGl2ZS5nZXREaXIgPSBnZXREaXI7XG5cbm1vZHVsZS5leHBvcnRzID0gRGlyZWN0aXZlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5bGe5oCn5oyH5LukXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkgey8vYXR0ciBiaW5kaW5nXG4gICAgICB0aGlzLmF0dHJzID0ge307XG4gICAgfWVsc2Uge1xuICAgICAgLy/lsZ7mgKfooajovr7lvI/pu5jorqTlsIblgLznva7nqbosIOmYsuatouihqOi+vuW8j+WGheWPmOmHj+S4jeWtmOWcqFxuICAgICAgdGhpcy51cGRhdGUoJycpXG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgdmFyIGVsID0gdGhpcy5lbDtcbiAgICB2YXIgbmV3QXR0cnMgPSB7fTtcbiAgICBpZih0aGlzLmRpck5hbWUgPT09IHRoaXMudHlwZSkge1xuICAgICAgZm9yKHZhciBhdHRyIGluIHZhbCkge1xuICAgICAgICBzZXRBdHRyKGVsLCBhdHRyLCB2YWxbYXR0cl0pO1xuICAgICAgICAvL2lmKHZhbFthdHRyXSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmF0dHJzW2F0dHJdO1xuICAgICAgICAvL31cbiAgICAgICAgbmV3QXR0cnNbYXR0cl0gPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvL+enu+mZpOS4jeWcqOS4iuasoeiusOW9leS4reeahOWxnuaAp1xuICAgICAgZm9yKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgcmVtb3ZlQXR0cihlbCwgYXR0cik7XG4gICAgICB9XG4gICAgICB0aGlzLmF0dHJzID0gbmV3QXR0cnM7XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLmNvbmRpdGlvbmFsKSB7XG4gICAgICAgIHZhbCA/IHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdmFsKSA6IHJlbW92ZUF0dHIoZWwsIHRoaXMuZGlyTmFtZSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy50ZXh0TWFwW3RoaXMucG9zaXRpb25dID0gdmFsICYmICh2YWwgKyAnJyk7XG4gICAgICAgIHNldEF0dHIoZWwsIHRoaXMuZGlyTmFtZSwgdGhpcy50ZXh0TWFwLmpvaW4oJycpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblxuLy9JRSDmtY/op4jlmajlvojlpJrlsZ7mgKfpgJrov4cgYHNldEF0dHJpYnV0ZWAg6K6+572u5ZCO5peg5pWILiBcbi8v6L+Z5Lqb6YCa6L+HIGBlbFthdHRyXSA9IHZhbHVlYCDorr7nva7nmoTlsZ7mgKfljbTog73lpJ/pgJrov4cgYHJlbW92ZUF0dHJpYnV0ZWAg5riF6ZmkLlxuZnVuY3Rpb24gc2V0QXR0cihlbCwgYXR0ciwgdmFsKXtcbiAgdHJ5e1xuICAgIGlmKCgoYXR0ciBpbiBlbCkgfHwgYXR0ciA9PT0gJ2NsYXNzJykpe1xuICAgICAgaWYoYXR0ciA9PT0gJ3N0eWxlJyAmJiBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgICBlbC5zdHlsZS5zZXRBdHRyaWJ1dGUoJ2Nzc1RleHQnLCB2YWwpO1xuICAgICAgfWVsc2UgaWYoYXR0ciA9PT0gJ2NsYXNzJyl7XG4gICAgICAgIGVsLmNsYXNzTmFtZSA9IHZhbDtcbiAgICAgIH1lbHNle1xuICAgICAgICBlbFthdHRyXSA9IHR5cGVvZiBlbFthdHRyXSA9PT0gJ2Jvb2xlYW4nID8gdHJ1ZSA6IHZhbDtcbiAgICAgIH1cbiAgICB9XG4gIH1jYXRjaChlKXt9XG4gIC8vY2hyb21lIHNldGF0dHJpYnV0ZSB3aXRoIGB7e319YCB3aWxsIHRocm93IGFuIGVycm9yXG4gIGVsLnNldEF0dHJpYnV0ZShhdHRyLCB2YWwpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBdHRyKGVsLCBhdHRyKSB7XG4gIGVsLnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgZGVsZXRlIGVsW2F0dHJdO1xufSIsIi8vY29tcG9uZW50IGFzIGRpcmVjdGl2ZVxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAtMTBcbiwgd2F0Y2g6IGZhbHNlXG4sIHVuTGluazogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jb21wb25lbnQgJiYgdGhpcy5jb21wb25lbnQuX19kZXN0cm95KClcbiAgfVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBlbCA9IHRoaXMuZWw7XG4gICAgdmFyIGNvbU5hbWUgPSB0aGlzLnBhdGg7XG4gICAgdmFyIGNvbXBvbmVudHMgPSB2bS5jb25zdHJ1Y3Rvci5jb21wb25lbnRzO1xuICAgIHZhciBDb21wLCBjb21wO1xuICAgIHZhciBkaXJzID0gW10sICRkYXRhID0ge307XG4gICAgdmFyIGF0dHJzO1xuXG4gICAgaWYoY29tTmFtZSBpbiBjb21wb25lbnRzKSB7XG4gICAgICBDb21wID0gY29tcG9uZW50c1tjb21OYW1lXTtcblxuICAgICAgLy9UT0RPXG4gICAgICBpZihDb21wID09PSB2bS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGRpcnMgPSB0aGlzLmRpcnM7XG5cbiAgICAgIGRpcnMgPSBkaXJzLmZpbHRlcihmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHJldHVybiBkaXIudHlwZSA9PSAnYXR0cicgfHwgZGlyLnR5cGUgPT0gJ3dpdGgnO1xuICAgICAgfSk7XG5cbiAgICAgIGRpcnMuZm9yRWFjaChmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIHZhciBjdXJQYXRoLCBjb21QYXRoO1xuXG4gICAgICAgIGN1clBhdGggPSBkaXIucGF0aDtcbiAgICAgICAgaWYoZGlyLnR5cGUgPT09ICd3aXRoJyB8fCBkaXIuZGlyTmFtZSA9PT0gJ2F0dHInKSB7XG4gICAgICAgICAgLy/ov5nph4wgYXR0ciDlj4ogd2l0aCDmjIfku6TmlYjmnpzkuIDmoLdcbiAgICAgICAgICBjb21QYXRoID0gJyRkYXRhJ1xuICAgICAgICAgIHV0aWxzLmV4dGVuZCgkZGF0YSwgdm0uJGdldChjdXJQYXRoKSlcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgY29tUGF0aCA9IGRpci5kaXJOYW1lO1xuICAgICAgICAgICRkYXRhW2NvbVBhdGhdID0gdm0uJGdldChjdXJQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8v55uR5ZCs54i257uE5Lu25pu05pawLCDlkIzmraXmlbDmja5cbiAgICAgICAgdm0uJHdhdGNoKGN1clBhdGgsIGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgICBpZihjb21wKXtcbiAgICAgICAgICAgIHZhbCA9IGRpci50ZXh0TWFwID8gZGlyLnRleHRNYXAuam9pbignJykgOiB2YWw7XG4gICAgICAgICAgICBjb21wLiRzZXQoY29tUGF0aCwgdmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9KTtcblxuICAgICAgYXR0cnMgPSBlbC5hdHRyaWJ1dGVzO1xuICAgICAgLy/mma7pgJrlsZ7mgKdcbiAgICAgIGZvcih2YXIgaSA9IGF0dHJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICRkYXRhW2F0dHJzWzBdLm5vZGVOYW1lXSA9IGF0dHJzWzBdLnZhbHVlO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmNvbXBvbmVudCA9IGNvbXAgPSBuZXcgQ29tcCh7XG4gICAgICAgICR0YXJnZXQ6IGVsLFxuICAgICAgICAvLyRyb290OiB2bS4kcm9vdCxcbiAgICAgICAgJGRhdGE6IHV0aWxzLmV4dGVuZCh7fSwgQ29tcC5wcm90b3R5cGUuJGRhdGEsICRkYXRhKVxuICAgICAgfSk7XG5cbiAgICAgIC8v55u05o6l5bCGY29tcG9uZW50IOS9nOS4uuagueWFg+e0oOaXtiwg5ZCM5q2l6Lef5paw5a655ZmoIC4kZWwg5byV55SoXG4gICAgICBpZih2bS4kZWwgPT09IGVsKSB7XG4gICAgICAgIHZtLl9fcmVmID0gY29tcDtcbiAgICAgICAgdm0uJGVsID0gY29tcC4kZWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUud2FybignQ29tcG9uZW50OiAnICsgY29tTmFtZSArICcgbm90IGRlZmluZWQhIElnbm9yZScpO1xuICAgIH1cbiAgfVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9tVXRpbHMgPSByZXF1aXJlKCcuLi9kb20tdXRpbHMnKVxuICAsIGNoZWNrQmluZGluZyA9IHJlcXVpcmUoJy4uL2NoZWNrLWJpbmRpbmcnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZXBsYWNlOiB0cnVlXG4sIGFuY2hvcjogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHRoaXMudm0gPSB2bTtcbiAgICB0aGlzLndhdGNoZXJzID0gW107XG4gIH1cbiwgdW5MaW5rOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLndhdGNoZXJzLmZvckVhY2goZnVuY3Rpb24od2F0Y2hlcikge1xuICAgICAgd2F0Y2hlci51bndhdGNoKClcbiAgICB9KTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHRwbCkge1xuICAgIHZhciBub2RlcyA9IHRoaXMuZ2V0Tm9kZXMoKVxuICAgIHZhciBwYXJlbnQgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGVcblxuICAgIG5vZGVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH0pO1xuXG4gICAgdGhpcy51bkxpbmsoKTtcblxuICAgIHZhciBjb250ZW50ID0gZG9tVXRpbHMuY3JlYXRlQ29udGVudCh0cGwpXG5cbiAgICB0aGlzLndhdGNoZXJzID0gY2hlY2tCaW5kaW5nLndhbGsuY2FsbCh0aGlzLnZtLCBjb250ZW50KVxuICAgIHBhcmVudC5pbnNlcnRCZWZvcmUoY29udGVudCwgdGhpcy5hbmNob3JzLmVuZClcbiAgfVxufSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi4vZW52LmpzJykuZG9jdW1lbnRcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzLmpzJylcbiAgLCB0b2tlbiA9IHJlcXVpcmUoJy4uL3Rva2VuLmpzJylcbiAgO1xuXG52YXIgZGlycyA9IHt9O1xuXG5cbmRpcnMudGV4dCA9IHtcbiAgdGVybWluYWw6IHRydWVcbiwgcmVwbGFjZTogdHJ1ZVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG4gIH1cbn07XG5cblxuZGlycy5odG1sID0ge1xuICB0ZXJtaW5hbDogdHJ1ZVxuLCByZXBsYWNlOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgfVxuLCB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHZhciBlbCA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbC5pbm5lckhUTUwgPSB1dGlscy5pc1VuZGVmaW5lZCh2YWwpID8gJycgOiB2YWw7XG5cbiAgICB2YXIgbm9kZTtcbiAgICB3aGlsZShub2RlID0gdGhpcy5ub2Rlcy5wb3AoKSkge1xuICAgICAgbm9kZS5wYXJlbnROb2RlICYmIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcbiAgICB9XG5cbiAgICB2YXIgbm9kZXMgPSBlbC5jaGlsZE5vZGVzO1xuICAgIHdoaWxlKG5vZGUgPSBub2Rlc1swXSkge1xuICAgICAgdGhpcy5ub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgdGhpcy5lbC5pbnNlcnRCZWZvcmUobm9kZSwgdGhpcy5ub2RlKTtcbiAgICB9XG4gIH1cbn07XG5cblxuZGlyc1snaWYnXSA9IHtcbiAgYW5jaG9yOiB0cnVlXG4sIGxpbms6IGZ1bmN0aW9uKCkge1xuICAgIGlmKHRoaXMuZWwuY29udGVudCkge1xuICAgICAgdGhpcy5mcmFnID0gdGhpcy5lbC5jb250ZW50O1xuICAgICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICAgIH1lbHNle1xuICAgICAgdGhpcy5mcmFnID0gZG9jLmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKVxuICAgICAgdGhpcy5oaWRlKCk7XG4gICAgfVxuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24odmFsKSB7XG4gICAgaWYodmFsKSB7XG4gICAgICBpZighdGhpcy5zdGF0ZSkgeyB0aGlzLnNob3coKSB9XG4gICAgfWVsc2V7XG4gICAgICBpZih0aGlzLnN0YXRlKSB7IHRoaXMuaGlkZSgpOyB9XG4gICAgfVxuICAgIHRoaXMuc3RhdGUgPSB2YWw7XG4gIH1cblxuLCBzaG93OiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYW5jaG9yID0gdGhpcy5hbmNob3JzLmVuZDtcblxuICAgIGFuY2hvci5wYXJlbnROb2RlICYmIGFuY2hvci5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLmZyYWcsIGFuY2hvcik7XG4gIH1cbiwgaGlkZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5vZGVzID0gdGhpcy5nZXROb2RlcygpO1xuXG4gICAgaWYobm9kZXMpIHtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSBub2Rlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdGhpcy5mcmFnLmFwcGVuZENoaWxkKG5vZGVzW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmRpcnMudGVtcGxhdGUgPSB7XG4gIHByaW9yaXR5OiAxMDAwMFxuLCBsaW5rOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLmNoaWxkTm9kZXNcbiAgICAgICwgZnJhZyA9IGRvYy5jcmVhdGVEb2N1bWVudEZyYWdtZW50KClcbiAgICAgIDtcblxuICAgIHdoaWxlKG5vZGVzWzBdKSB7XG4gICAgICBmcmFnLmFwcGVuZENoaWxkKG5vZGVzWzBdKTtcbiAgICB9XG5cbiAgICB0aGlzLmVsLmNvbnRlbnQgPSBmcmFnO1xuXG4gICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSh0aGlzLm5vZGVOYW1lLCAnJyk7XG4gIH1cbn07XG5cbi8v5Zu+54mH55SoLCDpgb/lhY3liqDovb3lpKfmi6zlj7fnmoTljp/lp4vmqKHmnb/lhoXlrrlcbmRpcnMuc3JjID0ge1xuICB1cGRhdGU6IGZ1bmN0aW9uKHZhbCkge1xuICAgIHRoaXMuZWwuc3JjID0gdmFsO1xuICB9XG59O1xuXG5kaXJzWyd3aXRoJ10gPSB7fTtcblxuZGlycy5yZXBlYXQgPSByZXF1aXJlKCcuL3JlcGVhdC5qcycpO1xuZGlycy5hdHRyID0gcmVxdWlyZSgnLi9hdHRyLmpzJyk7XG5kaXJzLm1vZGVsID0gcmVxdWlyZSgnLi9tb2RlbC5qcycpO1xuZGlycy5zdHlsZSA9IHJlcXVpcmUoJy4vc3R5bGUuanMnKTtcbmRpcnMub24gPSByZXF1aXJlKCcuL29uLmpzJyk7XG5kaXJzLmNvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50LmpzJyk7XG5kaXJzLmNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQuanMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpcnM7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICAsIGhhc1Rva2VuID0gcmVxdWlyZSgnLi4vdG9rZW4uanMnKS5oYXNUb2tlblxuICAsIGV2ZW50cyA9IHJlcXVpcmUoJy4uL2V2ZW50LWJpbmQuanMnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0ZW1pbmFsOiB0cnVlXG4sIHByaW9yaXR5OiAxXG4sIGxpbms6IGZ1bmN0aW9uKHZtKSB7XG4gICAgdmFyIGtleVBhdGggPSB0aGlzLnBhdGg7XG5cbiAgICBpZigha2V5UGF0aCkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgIHZhciBlbCA9IHRoaXMuZWxcbiAgICAgICwgZXYgPSAnY2hhbmdlJ1xuICAgICAgLCBhdHRyLCB2YWx1ZSA9IGF0dHIgPSAndmFsdWUnXG4gICAgICAsIGFudCA9IHZtXG4gICAgICAsIGlzU2V0RGVmYXV0ID0gdXRpbHMuaXNVbmRlZmluZWQoYW50LiRnZXQoa2V5UGF0aCkpLy/nlYzpnaLnmoTliJ3lp4vlgLzkuI3kvJropobnm5YgbW9kZWwg55qE5Yid5aeL5YC8XG4gICAgICAsIGNybGYgPSAvXFxyXFxuL2cvL0lFIDgg5LiLIHRleHRhcmVhIOS8muiHquWKqOWwhiBcXG4g5o2i6KGM56ym5o2i5oiQIFxcclxcbi4g6ZyA6KaB5bCG5YW25pu/5o2i5Zue5p2lXG4gICAgICAsIGNhbGxiYWNrID0gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdmFyIG5ld1ZhbCA9ICh2YWwgfHwgJycpICsgJydcbiAgICAgICAgICAgICwgdmFsID0gZWxbYXR0cl1cbiAgICAgICAgICAgIDtcbiAgICAgICAgICB2YWwgJiYgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgaWYobmV3VmFsICE9PSB2YWwpeyBlbFthdHRyXSA9IG5ld1ZhbDsgfVxuICAgICAgICB9XG4gICAgICAsIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICB2YXIgdmFsID0gZWxbdmFsdWVdO1xuXG4gICAgICAgICAgdmFsLnJlcGxhY2UgJiYgKHZhbCA9IHZhbC5yZXBsYWNlKGNybGYsICdcXG4nKSk7XG4gICAgICAgICAgYW50LiRzZXQoa2V5UGF0aCwgdmFsKTtcbiAgICAgICAgfVxuICAgICAgLCBjYWxsSGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICBpZihlICYmIGUucHJvcGVydHlOYW1lICYmIGUucHJvcGVydHlOYW1lICE9PSBhdHRyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICB9XG4gICAgICAsIGllID0gdXRpbHMuaWVcbiAgICAgIDtcblxuICAgIHN3aXRjaChlbC50YWdOYW1lKSB7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB2YWx1ZSA9IGF0dHIgPSAnaW5uZXJIVE1MJztcbiAgICAgICAgLy9ldiArPSAnIGJsdXInO1xuICAgICAgY2FzZSAnSU5QVVQnOlxuICAgICAgY2FzZSAnVEVYVEFSRUEnOlxuICAgICAgICBzd2l0Y2goZWwudHlwZSkge1xuICAgICAgICAgIGNhc2UgJ2NoZWNrYm94JzpcbiAgICAgICAgICAgIHZhbHVlID0gYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgIC8vSUU2LCBJRTcg5LiL55uR5ZCsIHByb3BlcnR5Y2hhbmdlIOS8muaMgj9cbiAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAncmFkaW8nOlxuICAgICAgICAgICAgYXR0ciA9ICdjaGVja2VkJztcbiAgICAgICAgICAgIGlmKGllKSB7IGV2ICs9ICcgY2xpY2snOyB9XG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICBlbC5jaGVja2VkID0gZWwudmFsdWUgPT09IHZhbCArICcnO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlzU2V0RGVmYXV0ID0gZWwuY2hlY2tlZDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYoIWFudC4kbGF6eSl7XG4gICAgICAgICAgICAgIGlmKCdvbmlucHV0JyBpbiBlbCl7XG4gICAgICAgICAgICAgICAgZXYgKz0gJyBpbnB1dCc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy9JRSDkuIvnmoQgaW5wdXQg5LqL5Lu25pu/5LujXG4gICAgICAgICAgICAgIGlmKGllKSB7XG4gICAgICAgICAgICAgICAgZXYgKz0gJyBrZXl1cCBwcm9wZXJ0eWNoYW5nZSBjdXQnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VMRUNUJzpcbiAgICAgICAgaWYoZWwubXVsdGlwbGUpe1xuICAgICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbihpc0luaXQpIHtcbiAgICAgICAgICAgIHZhciB2YWxzID0gW107XG4gICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gZWwub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICBpZihlbC5vcHRpb25zW2ldLnNlbGVjdGVkKXsgdmFscy5wdXNoKGVsLm9wdGlvbnNbaV0udmFsdWUpIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFudC4kc2V0KGtleVBhdGgsIHZhbHMpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbih2YWxzKXtcbiAgICAgICAgICAgIGlmKHZhbHMgJiYgdmFscy5sZW5ndGgpe1xuICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gZWwub3B0aW9ucy5sZW5ndGg7IGkgPCBsOyBpKyspe1xuICAgICAgICAgICAgICAgIGVsLm9wdGlvbnNbaV0uc2VsZWN0ZWQgPSB2YWxzLmluZGV4T2YoZWwub3B0aW9uc1tpXS52YWx1ZSkgIT09IC0xO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpc1NldERlZmF1dCA9IGlzU2V0RGVmYXV0ICYmICFoYXNUb2tlbihlbFt2YWx1ZV0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgdGhpcy51cGRhdGUgPSBjYWxsYmFjaztcblxuICAgIGV2LnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24oZSl7XG4gICAgICBldmVudHMucmVtb3ZlRXZlbnQoZWwsIGUsIGNhbGxIYW5kbGVyKTtcbiAgICAgIGV2ZW50cy5hZGRFdmVudChlbCwgZSwgY2FsbEhhbmRsZXIpO1xuICAgIH0pO1xuXG4gICAgLy/moLnmja7ooajljZXlhYPntKDnmoTliJ3lp4vljJbpu5jorqTlgLzorr7nva7lr7nlupQgbW9kZWwg55qE5YC8XG4gICAgaWYoZWxbdmFsdWVdICYmIGlzU2V0RGVmYXV0KXtcbiAgICAgICBoYW5kbGVyKHRydWUpO1xuICAgIH1cblxuICB9XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8v5LqL5Lu255uR5ZCsXG5cbnZhciBldmVudEJpbmQgPSByZXF1aXJlKCcuLi9ldmVudC1iaW5kLmpzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG5cbi8vVE9ETyDnp7vpmaTml7bnmoTmg4XlhrVcbm1vZHVsZS5leHBvcnRzID0ge1xuICB3YXRjaDogZmFsc2VcbiwgbGluazogZnVuY3Rpb24odm0pIHtcbiAgICAvL3RoaXMuZXZlbnRzID0ge307XG4gICAgdGhpcy52bSA9IHZtO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oZXZlbnRzKSB7XG4gICAgdmFyIHNlbGVjdG9yLCBldmVudFR5cGU7XG4gICAgZm9yKHZhciBuYW1lIGluIGV2ZW50cykge1xuICAgICAgc2VsZWN0b3IgPSBuYW1lLnNwbGl0KC9cXHMrLyk7XG4gICAgICBldmVudFR5cGUgPSBzZWxlY3Rvci5zaGlmdCgpO1xuICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5qb2luKCcgJyk7XG4gICAgICBldmVudEJpbmQuYWRkRXZlbnQodGhpcy5lbCwgZXZlbnRUeXBlLCBjYWxsSGFuZGxlcih0aGlzLCBzZWxlY3RvciwgZXZlbnRzW25hbWVdKSk7XG4gICAgfVxuICB9XG59XG5cbi8v5aeU5omY5LqL5Lu2XG5mdW5jdGlvbiBjYWxsSGFuZGxlciAoZGlyLCBzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICB2YXIgY3VyID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIHZhciBlbHMgPSBzZWxlY3RvciA/IHV0aWxzLnRvQXJyYXkoZGlyLmVsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSA6IFtjdXJdO1xuICAgIGRve1xuICAgICAgaWYoZWxzLmluZGV4T2YoY3VyKSA+PSAwKSB7XG4gICAgICAgIGUuZGVsZWdhdGVUYXJnZXQgPSBjdXI7Ly/lp5TmiZjlhYPntKBcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoZGlyLnZtLCBlKVxuICAgICAgfVxuICAgIH13aGlsZShjdXIgPSBjdXIucGFyZW50Tm9kZSlcbiAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkb2MgPSByZXF1aXJlKCcuLi9lbnYuanMnKS5kb2N1bWVudFxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMuanMnKVxuICA7XG5cbi8v6L+Z5Lqb5pWw57uE5pON5L2c5pa55rOV6KKr6YeN5YaZ5oiQ6Ieq5Yqo6Kem5Y+R5pu05pawXG52YXIgYXJyYXlNZXRob2RzID0gWydzcGxpY2UnLCAncHVzaCcsICdwb3AnLCAnc2hpZnQnLCAndW5zaGlmdCcsICdzb3J0JywgJ3JldmVyc2UnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHByaW9yaXR5OiAxMDAwXG4sIGFuY2hvcjogdHJ1ZVxuLCB0ZXJtaW5hbDogdHJ1ZVxuLCBsaW5rOiBmdW5jdGlvbih2bSkge1xuICAgIHZhciBjc3RyID0gdGhpcy5jc3RyID0gdm0uY29uc3RydWN0b3I7XG4gICAgdGhpcy52bSA9IHZtO1xuXG4gICAgd2hpbGUoY3N0ci5fX3N1cGVyX18pe1xuICAgICAgY3N0ciA9IGNzdHIuX19zdXBlcl9fLmNvbnN0cnVjdG9yO1xuICAgIH1cblxuICAgIHRoaXMudHJhY2tCeSA9IHRoaXMuZWwuZ2V0QXR0cmlidXRlKCd0cmFjay1ieScpXG4gICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoJ3RyYWNrLWJ5JylcblxuICAgIC8v5Y+q57un5om/6Z2Z5oCB55qE6buY6K6k5Y+C5pWwXG4gICAgdGhpcy5jc3RyID0gY3N0ci5leHRlbmQoe30sIHRoaXMuY3N0cilcblxuICAgIHRoaXMuY3VyQXJyID0gW107XG4gICAgdGhpcy5saXN0ID0gW107Ly/lrZAgVk0gbGlzdFxuXG4gICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpO1xuICB9XG4sIHVwZGF0ZTogZnVuY3Rpb24oaXRlbXMpIHtcbiAgICB2YXIgY3VyQXJyID0gdGhpcy5jdXJBcnI7XG4gICAgdmFyIHBhcmVudE5vZGUgPSB0aGlzLmFuY2hvcnMuZW5kLnBhcmVudE5vZGU7XG4gICAgdmFyIHRoYXQgPSB0aGlzLCBsaXN0ID0gdGhpcy5saXN0O1xuXG4gICAgaWYodXRpbHMuaXNBcnJheShpdGVtcykpIHtcbiAgICAgIC8vIOWcqCByZXBlYXQg5oyH5Luk6KGo6L6+5byP5LitXG4gICAgICB0aGlzLmxpc3RQYXRoID0gdGhpcy5zdW1tYXJ5LmxvY2Fscy5maWx0ZXIoZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICByZXR1cm4gIXV0aWxzLmlzRnVuY3Rpb24odGhhdC52bS4kZ2V0KHBhdGgpKVxuICAgICAgfSk7XG5cbiAgICAgIC8v5Yig6Zmk5YWD57SgXG4gICAgICAvL1RPRE8g5Yig6Zmk5byV55So54i257qn55qEIHdhdGNoZXJzXG4gICAgICBhcnJEaWZmKGN1ckFyciwgaXRlbXMpLmZvckVhY2goZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICB2YXIgcG9zID0gY3VyQXJyLmluZGV4T2YoaXRlbSlcbiAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDEpXG4gICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobGlzdFtwb3NdLiRlbClcbiAgICAgICAgbGlzdFtwb3NdLl9fZGVzdHJveSgpXG4gICAgICAgIGxpc3Quc3BsaWNlKHBvcywgMSlcbiAgICAgIH0pXG5cbiAgICAgIGl0ZW1zLmZvckVhY2goZnVuY3Rpb24oaXRlbSwgaSkge1xuICAgICAgICB2YXIgcG9zID0gaXRlbXMuaW5kZXhPZihpdGVtLCBpKVxuICAgICAgICAgICwgb2xkUG9zID0gY3VyQXJyLmluZGV4T2YoaXRlbSwgaSlcbiAgICAgICAgICAsIHZtLCBlbFxuICAgICAgICAgIDtcblxuICAgICAgICAvL3BvcyA8IDAgJiYgKHBvcyA9IGl0ZW1zLmxhc3RJbmRleE9mKGl0ZW0sIGkpKTtcbiAgICAgICAgLy9vbGRQb3MgPCAwICYmIChvbGRQb3MgPSBjdXJBcnIubGFzdEluZGV4T2YoaXRlbSwgaSkpO1xuXG4gICAgICAgIC8v5paw5aKe5YWD57SgXG4gICAgICAgIGlmKG9sZFBvcyA8IDApIHtcblxuICAgICAgICAgIGVsID0gdGhpcy5lbC5jbG9uZU5vZGUodHJ1ZSlcblxuICAgICAgICAgIHZtID0gbmV3IHRoaXMuY3N0cihlbCwge1xuICAgICAgICAgICAgJGRhdGE6IGl0ZW0sIF9hc3NpZ25tZW50czogdGhpcy5zdW1tYXJ5LmFzc2lnbm1lbnRzLCAkaW5kZXg6IHBvcyxcbiAgICAgICAgICAgICRyb290OiB0aGlzLnZtLiRyb290LCAkcGFyZW50OiB0aGlzLnZtLFxuICAgICAgICAgICAgX19yZXBlYXQ6IHRydWVcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZSh2bS4kZWwsIGxpc3RbcG9zXSAmJiBsaXN0W3Bvc10uJGVsIHx8IHRoaXMuYW5jaG9ycy5lbmQpXG4gICAgICAgICAgbGlzdC5zcGxpY2UocG9zLCAwLCB2bSk7XG4gICAgICAgICAgY3VyQXJyLnNwbGljZShwb3MsIDAsIGl0ZW0pXG5cbiAgICAgICAgICAvL+W7tuaXtui1i+WAvOe7mSBgX3JlbGF0aXZlUGF0aGAsIOmBv+WFjeWHuueOsOatu+W+queOr1xuICAgICAgICAgIC8v5aaC5p6c5Zyo5LiK6Z2i5a6e5L6L5YyW5pe25b2T5Y+C5pWw5Lyg5YWlLCDkvJrlhpLms6HliLDniLbnuqcgdm0g6YCS5b2S6LCD55So6L+Z6YeM55qEIHVwZGF0ZSDmlrnms5UsIOmAoOaIkOatu+W+queOry5cbiAgICAgICAgICB2bS5fcmVsYXRpdmVQYXRoID0gdGhpcy5saXN0UGF0aDtcbiAgICAgICAgfWVsc2Uge1xuXG4gICAgICAgICAgLy/osIPluo9cbiAgICAgICAgICBpZiAocG9zICE9PSBvbGRQb3MpIHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3Rbb2xkUG9zXS4kZWwsIGxpc3RbcG9zXSAmJiBsaXN0W3Bvc10uJGVsIHx8IHRoYXQuYW5jaG9yLmVuZClcbiAgICAgICAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGxpc3RbcG9zXS4kZWwsIGxpc3Rbb2xkUG9zICsgMV0gJiYgbGlzdFtvbGRQb3MgKyAxXS4kZWwgfHwgdGhhdC5hbmNob3IuZW5kKVxuICAgICAgICAgICAgbGlzdFtvbGRQb3NdID0gW2xpc3RbcG9zXSwgbGlzdFtwb3NdID0gbGlzdFtvbGRQb3NdXVswXVxuICAgICAgICAgICAgY3VyQXJyW29sZFBvc10gPSBbY3VyQXJyW3Bvc10sIGN1ckFycltwb3NdID0gY3VyQXJyW29sZFBvc11dWzBdXG4gICAgICAgICAgICBsaXN0W3Bvc10uJGluZGV4ID0gcG9zXG4gICAgICAgICAgICBsaXN0W3Bvc10uJHVwZGF0ZSgnJGluZGV4JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSlcblxuICAgICAgLy/mm7TmlrDntKLlvJVcbiAgICAgIHRoaXMubGlzdC5mb3JFYWNoKGZ1bmN0aW9uKHZtLCBpKSB7XG4gICAgICAgIHZtLiRpbmRleCA9IGlcbiAgICAgICAgdm0uJGVsLiRpbmRleCA9IGlcbiAgICAgICAgdm0uJHVwZGF0ZSgnJGluZGV4JywgZmFsc2UpXG4gICAgICB9KTtcblxuICAgICAgaWYoIWl0ZW1zLl9fZGlyc19fKXtcbiAgICAgICAgLy/mlbDnu4Tmk43kvZzmlrnms5VcbiAgICAgICAgdXRpbHMuZXh0ZW5kKGl0ZW1zLCB7XG4gICAgICAgICAgJHNldDogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgaXRlbXMuX19kaXJzX18uZm9yRWFjaChmdW5jdGlvbihkaXIpIHtcbiAgICAgICAgICAgICAgZGlyLmxpc3RbaV0uJHNldChpdGVtKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSxcbiAgICAgICAgICAkcmVwbGFjZTogZnVuY3Rpb24oaSwgaXRlbSkge1xuICAgICAgICAgICAgaXRlbXMuX19kaXJzX18uZm9yRWFjaChmdW5jdGlvbihkaXIpIHtcbiAgICAgICAgICAgICAgZGlyLmxpc3RbaV0uJHJlcGxhY2UoaXRlbSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSxcbiAgICAgICAgICAkcmVtb3ZlOiBmdW5jdGlvbihpKSB7XG4gICAgICAgICAgICBpdGVtcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICBpdGVtcy5fX2RpcnNfXy5mb3JFYWNoKGZ1bmN0aW9uKGRpcikge1xuICAgICAgICAgICAgICBkaXIubGlzdFBhdGguZm9yRWFjaChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgICAgICAgIGRpci52bS4kdXBkYXRlKHBhdGgpXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcnJheU1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgICAgICAgICBpdGVtc1ttZXRob2RdID0gdXRpbHMuYWZ0ZXJGbihpdGVtc1ttZXRob2RdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGl0ZW1zLl9fZGlyc19fLmZvckVhY2goZnVuY3Rpb24oZGlyKSB7XG4gICAgICAgICAgICAgIGRpci5saXN0UGF0aC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgICAgICAgICBkaXIudm0uJHVwZGF0ZShwYXRoKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICAgICAgaXRlbXMuX19kaXJzX18gID0gW107XG4gICAgICB9XG4gICAgICAvL+S4gOS4quaVsOe7hOWkmuWkhOS9v+eUqFxuICAgICAgLy9UT0RPIOenu+mZpOaXtueahOaDheWGtVxuICAgICAgaWYoaXRlbXMuX19kaXJzX18uaW5kZXhPZih0aGF0KSA9PT0gLTEpIHtcbiAgICAgICAgaXRlbXMuX19kaXJzX18ucHVzaCh0aGF0KVxuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgLy9UT0RPIOaZrumAmuWvueixoeeahOmBjeWOhlxuICAgIH1cbiAgfVxufTtcblxuXG5mdW5jdGlvbiBhcnJEaWZmKGFycjEsIGFycjIpIHtcbiAgdmFyIGFycjJDb3B5ID0gYXJyMi5zbGljZSgpO1xuICByZXR1cm4gYXJyMS5maWx0ZXIoZnVuY3Rpb24oZWwpIHtcbiAgICB2YXIgcmVzdWx0LCBpbmRleCA9IGFycjJDb3B5LmluZGV4T2YoZWwpXG4gICAgaWYoaW5kZXggPCAwKSB7XG4gICAgICByZXN1bHQgPSB0cnVlXG4gICAgfWVsc2V7XG4gICAgICBhcnIyQ29weS5zcGxpY2UoaW5kZXgsIDEpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSlcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vL+agt+W8j+aMh+S7pFxuXG52YXIgY2FtZWxSZWcgPSAvKFtBLVpdKS9nO1xuXG4vL+m7mOiupOWNleS9jeS4uiBweCDnmoTlsZ7mgKdcbnZhciBwaXhlbEF0dHJzID0gW1xuICAnd2lkdGgnLCdoZWlnaHQnLCdtaW4td2lkdGgnLCAnbWluLWhlaWdodCcsICdtYXgtd2lkdGgnLCAnbWF4LWhlaWdodCcsXG4gICdtYXJnaW4nLCAnbWFyZ2luLXRvcCcsICdtYXJnaW4tcmlnaHQnLCAnbWFyZ2luLWxlZnQnLCAnbWFyZ2luLWJvdHRvbScsXG4gICdwYWRkaW5nJywgJ3BhZGRpbmctdG9wJywgJ3BhZGRpbmctcmlnaHQnLCAncGFkZGluZy1ib3R0b20nLCAncGFkZGluZy1sZWZ0J1xuXVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdXBkYXRlOiBmdW5jdGlvbihzdHlsZXMpIHtcbiAgICB2YXIgZWwgPSB0aGlzLmVsO1xuICAgIHZhciBzdHlsZVN0ciA9ICcnO1xuICAgIHZhciBkYXNoS2V5LCB2YWw7XG5cbiAgICBpZih0eXBlb2Ygc3R5bGVzID09PSAnc3RyaW5nJykge1xuICAgICAgc3R5bGVTdHIgPSBzdHlsZXM7XG4gICAgfWVsc2Uge1xuICAgICAgZm9yICh2YXIga2V5IGluIHN0eWxlcykge1xuICAgICAgICB2YWwgPSBzdHlsZXNba2V5XTtcblxuICAgICAgICAvL21hcmdpblRvcCAtPiBtYXJnaW4tdG9wXG4gICAgICAgIGRhc2hLZXkgPSBrZXkucmVwbGFjZShjYW1lbFJlZywgZnVuY3Rpb24gKHVwcGVyQ2hhcikge1xuICAgICAgICAgIHJldHVybiAnLScgKyB1cHBlckNoYXIudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKCFpc05hTih2YWwpICYmIHBpeGVsQXR0cnMuaW5kZXhPZihkYXNoS2V5KSA+PSAwKSB7XG4gICAgICAgICAgdmFsICs9ICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgc3R5bGVTdHIgKz0gZGFzaEtleSArICc6ICcgKyB2YWwgKyAnOyAnO1xuICAgICAgfVxuICAgIH1cbiAgICBpZihlbC5zdHlsZS5zZXRBdHRyaWJ1dGUpe1xuICAgICAgLy/ogIEgSUVcbiAgICAgIGVsLnN0eWxlLnNldEF0dHJpYnV0ZSgnY3NzVGV4dCcsIHN0eWxlU3RyKTtcbiAgICB9ZWxzZXtcbiAgICAgIGVsLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBzdHlsZVN0cik7XG4gICAgfVxuICB9XG59OyIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZG9jID0gcmVxdWlyZSgnLi9lbnYuanMnKS5kb2N1bWVudFxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG5cbi8v5aSE55CGICR0YXJnZXQsICAkY29udGVudCwgJHRwbFxuLy90YXJnZXQ6IGVsIOabv+aNoueahOebruagh1xuZnVuY3Rpb24gdHBsUGFyc2UodHBsLCB0YXJnZXQsIGNvbnRlbnQpIHtcbiAgdmFyIGVsO1xuICBpZih1dGlscy5pc09iamVjdCh0YXJnZXQpICYmIHRhcmdldC5jaGlsZE5vZGVzKSB7XG4gICAgY29udGVudCA9IGNyZWF0ZUNvbnRlbnQodGFyZ2V0LmNoaWxkTm9kZXMpO1xuICB9ZWxzZXtcbiAgICBpZihjb250ZW50KSB7XG4gICAgICBjb250ZW50ID0gY3JlYXRlQ29udGVudChjb250ZW50KVxuICAgIH1cbiAgfVxuXG4gIGlmKHV0aWxzLmlzT2JqZWN0KHRwbCkpe1xuICAgIC8vRE9NIOWFg+e0oFxuICAgIGVsID0gdHBsO1xuICAgIHRwbCA9IGVsLm91dGVySFRNTDtcbiAgfWVsc2V7XG4gICAgLy/lrZfnrKbkuLJcbiAgICBlbCA9IGNyZWF0ZUNvbnRlbnQodHBsKS5jaGlsZE5vZGVzWzBdO1xuICB9XG5cbiAgaWYodGFyZ2V0KXtcbiAgICB0YXJnZXQucGFyZW50Tm9kZSAmJiB0YXJnZXQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoZWwsIHRhcmdldCk7XG4gIH1cblxuICByZXR1cm4ge2VsOiBlbCwgdHBsOiB0cGwsIGNvbnRlbnQ6IGNvbnRlbnR9O1xufVxuXG4vL+Wwhuaooeadvy/lhYPntKAvbm9kZWxpc3Qg5YyF6KO55ZyoIGZyYWdtZW50IOS4rVxuZnVuY3Rpb24gY3JlYXRlQ29udGVudCh0cGwpIHtcbiAgdmFyIGNvbnRlbnQgPSBkb2MuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICB2YXIgd3JhcGVyO1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgaWYodXRpbHMuaXNPYmplY3QodHBsKSkge1xuICAgIGlmKHRwbC5ub2RlTmFtZSAmJiB0cGwubm9kZVR5cGUpIHtcbiAgICAgIC8vZG9tIOWFg+e0oFxuICAgICAgY29udGVudC5hcHBlbmRDaGlsZCh0cGwpO1xuICAgIH1lbHNlIGlmKCdsZW5ndGgnIGluIHRwbCl7XG4gICAgICAvL25vZGVsaXN0XG4gICAgICBub2RlcyA9IHRwbDtcbiAgICB9XG4gIH1lbHNlIHtcbiAgICB3cmFwZXIgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICAvL+iHquWumuS5ieagh+etvuWcqCBJRTgg5LiL5peg5pWILiDkvb/nlKggY29tcG9uZW50IOaMh+S7pOabv+S7o1xuICAgIHdyYXBlci5pbm5lckhUTUwgPSAodHBsICsgJycpLnRyaW0oKTtcbiAgICBub2RlcyA9IHdyYXBlci5jaGlsZE5vZGVzO1xuICB9XG4gIHdoaWxlKG5vZGVzWzBdKSB7XG4gICAgY29udGVudC5hcHBlbmRDaGlsZChub2Rlc1swXSlcbiAgfVxuICByZXR1cm4gY29udGVudDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRwbFBhcnNlOiB0cGxQYXJzZSxcbiAgY3JlYXRlQ29udGVudDogY3JlYXRlQ29udGVudFxufTsiLCIoZnVuY3Rpb24ocm9vdCl7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGV4cG9ydHMucm9vdCA9IHJvb3Q7XG4gIGV4cG9ydHMuZG9jdW1lbnQgPSByb290LmRvY3VtZW50IHx8IHJlcXVpcmUoJ2pzZG9tJykuanNkb20oKTtcblxufSkoKGZ1bmN0aW9uKCkge3JldHVybiB0aGlzfSkoKSk7XG4iLCIvL+ihqOi+vuW8j+aJp+ihjFxuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIG9wZXJhdG9ycyA9IHtcbiAgJ3VuYXJ5Jzoge1xuICAgICcrJzogZnVuY3Rpb24odikgeyByZXR1cm4gK3Y7IH1cbiAgLCAnLSc6IGZ1bmN0aW9uKHYpIHsgcmV0dXJuIC12OyB9XG4gICwgJyEnOiBmdW5jdGlvbih2KSB7IHJldHVybiAhdjsgfVxuXG4gICwgJ1snOiBmdW5jdGlvbih2KXsgcmV0dXJuIHY7IH1cbiAgLCAneyc6IGZ1bmN0aW9uKHYpe1xuICAgICAgdmFyIHIgPSB7fTtcbiAgICAgIGZvcih2YXIgaSA9IDAsIGwgPSB2Lmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICByW3ZbaV1bMF1dID0gdltpXVsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByO1xuICAgIH1cbiAgLCAndHlwZW9mJzogZnVuY3Rpb24odil7IHJldHVybiB0eXBlb2YgdjsgfVxuICAsICduZXcnOiBmdW5jdGlvbih2KXsgcmV0dXJuIG5ldyB2IH1cbiAgfVxuXG4sICdiaW5hcnknOiB7XG4gICAgJysnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICsgcjsgfVxuICAsICctJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAtIHI7IH1cbiAgLCAnKic6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgKiByOyB9XG4gICwgJy8nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIC8gcjsgfVxuICAsICclJzogZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCAlIHI7IH1cbiAgLCAnPCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPCByOyB9XG4gICwgJz4nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID4gcjsgfVxuICAsICc8PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPD0gcjsgfVxuICAsICc+PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPj0gcjsgfVxuICAsICc9PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgPT0gcjsgfVxuICAsICchPSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgIT0gcjsgfVxuICAsICc9PT0nOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsID09PSByOyB9XG4gICwgJyE9PSc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwgIT09IHI7IH1cbiAgLCAnJiYnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsICYmIHI7IH1cbiAgLCAnfHwnOiBmdW5jdGlvbihsLCByKSB7IHJldHVybiBsIHx8IHI7IH1cbiAgLCAnLCc6IGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIGwsIHI7IH1cblxuICAsICcuJzogZnVuY3Rpb24obCwgcikge1xuICAgICAgaWYocil7XG4gICAgICAgIHBhdGggPSBwYXRoICsgJy4nICsgcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsW3JdO1xuICAgIH1cbiAgLCAnWyc6IGZ1bmN0aW9uKGwsIHIpIHtcbiAgICAgIGlmKHR5cGVvZiByICE9PSAndW5kZWZpbmVkJyl7XG4gICAgICAgIHBhdGggPSBwYXRoICsgJy4nICsgcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsW3JdO1xuICAgIH1cblxuICAsICcoJzogZnVuY3Rpb24obCwgcil7IHJldHVybiBsLmFwcGx5KGNvbnRleHQubG9jYWxzLCByKSB9XG4gICAgLy9maWx0ZXIuIG5hbWV8ZmlsdGVyXG4gICwgJ3wnOiBmdW5jdGlvbihsLCByKXsgcmV0dXJuIGNhbGxGaWx0ZXIobCwgciwgW10pIH1cbiAgLCAnbmV3JzogZnVuY3Rpb24obCwgcil7XG4gICAgICByZXR1cm4gbCA9PT0gRGF0ZSA/IG5ldyBGdW5jdGlvbigncmV0dXJuIG5ldyBEYXRlKCcgKyByLmpvaW4oJywgJykgKyAnKScpKCkgOiBuZXcgKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmFwcGx5KGwsIHIpKTtcbiAgICB9XG5cbiAgLCAnaW4nOiBmdW5jdGlvbihsLCByKXtcbiAgICAgIGlmKHRoaXMucmVwZWF0KSB7XG4gICAgICAgIC8vcmVwZWF0XG4gICAgICAgIHJldHVybiByO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHJldHVybiBsIGluIHI7XG4gICAgICB9XG4gICAgfVxuICAsICdjYXRjaGJ5JzogZnVuY3Rpb24obCwgcikge1xuICAgICAgaWYobC5jYXRjaCkge1xuICAgICAgICByZXR1cm4gbC5jYXRjaChyLmJpbmQoY29udGV4dC5sb2NhbHMpKVxuICAgICAgfWVsc2V7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ2NhdGNoYnkgZXhwZWN0IGEgcHJvbWlzZScpXG4gICAgICAgIHJldHVybiBsO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4sICd0ZXJuYXJ5Jzoge1xuICAgICc/JzogZnVuY3Rpb24oZiwgcywgdCkgeyByZXR1cm4gZiA/IHMgOiB0OyB9XG4gICwgJygnOiBmdW5jdGlvbihmLCBzLCB0KSB7IHJldHVybiBmW3NdLmFwcGx5KGYsIHQpIH1cblxuICAgIC8vZmlsdGVyLiBuYW1lIHwgZmlsdGVyIDogYXJnMiA6IGFyZzNcbiAgLCAnfCc6IGZ1bmN0aW9uKGYsIHMsIHQpeyByZXR1cm4gY2FsbEZpbHRlcihmLCBzLCB0KSB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGNhbGxGaWx0ZXIoYXJnLCBmaWx0ZXIsIGFyZ3MpIHtcbiAgaWYoYXJnICYmIGFyZy50aGVuKSB7XG4gICAgcmV0dXJuIGFyZy50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiBmaWx0ZXIuYXBwbHkoY29udGV4dC5sb2NhbHMsIFtkYXRhXS5jb25jYXQoYXJncykpXG4gICAgfSk7XG4gIH1lbHNle1xuICAgIHJldHVybiBmaWx0ZXIuYXBwbHkoY29udGV4dC5sb2NhbHMsIFthcmddLmNvbmNhdChhcmdzKSlcbiAgfVxufVxuXG52YXIgYXJnTmFtZSA9IFsnZmlyc3QnLCAnc2Vjb25kJywgJ3RoaXJkJ11cbiAgLCBjb250ZXh0LCBzdW1tYXJ5LCBzdW1tYXJ5Q2FsbFxuICAsIHBhdGhcbiAgLCBzZWxmXG4gIDtcblxuLy/pgY3ljoYgYXN0XG52YXIgZXZhbHVhdGUgPSBmdW5jdGlvbih0cmVlKSB7XG4gIHZhciBhcml0eSA9IHRyZWUuYXJpdHlcbiAgICAsIHZhbHVlID0gdHJlZS52YWx1ZVxuICAgICwgYXJncyA9IFtdXG4gICAgLCBuID0gMFxuICAgICwgYXJnXG4gICAgLCByZXNcbiAgICA7XG5cbiAgLy/mk43kvZznrKbmnIDlpJrlj6rmnInkuInlhYNcbiAgZm9yKDsgbiA8IDM7IG4rKyl7XG4gICAgYXJnID0gdHJlZVthcmdOYW1lW25dXTtcbiAgICBpZihhcmcpe1xuICAgICAgaWYoQXJyYXkuaXNBcnJheShhcmcpKXtcbiAgICAgICAgYXJnc1tuXSA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBsID0gYXJnLmxlbmd0aDsgaSA8IGw7IGkrKyl7XG4gICAgICAgICAgYXJnc1tuXS5wdXNoKHR5cGVvZiBhcmdbaV0ua2V5ID09PSAndW5kZWZpbmVkJyA/XG4gICAgICAgICAgICBldmFsdWF0ZShhcmdbaV0pIDogW2FyZ1tpXS5rZXksIGV2YWx1YXRlKGFyZ1tpXSldKTtcbiAgICAgICAgfVxuICAgICAgfWVsc2V7XG4gICAgICAgIGFyZ3Nbbl0gPSBldmFsdWF0ZShhcmcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKGFyaXR5ICE9PSAnbGl0ZXJhbCcpIHtcbiAgICBpZihwYXRoICYmIHZhbHVlICE9PSAnLicgJiYgdmFsdWUgIT09ICdbJykge1xuICAgICAgc3VtbWFyeS5wYXRoc1twYXRoXSA9IHRydWU7XG4gICAgfVxuICAgIGlmKGFyaXR5ID09PSAnbmFtZScpIHtcbiAgICAgIHBhdGggPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBzd2l0Y2goYXJpdHkpe1xuICAgIGNhc2UgJ3VuYXJ5JzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Rlcm5hcnknOlxuICAgICAgdHJ5e1xuICAgICAgICByZXMgPSBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpLmFwcGx5KHRyZWUsIGFyZ3MpO1xuICAgICAgfWNhdGNoKGUpe1xuICAgICAgICBzdW1tYXJ5Q2FsbCB8fCBjb25zb2xlLndhcm4oZSk7XG4gICAgICB9XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnbGl0ZXJhbCc6XG4gICAgICByZXMgPSB2YWx1ZTtcbiAgICBicmVhaztcbiAgICBjYXNlICdyZXBlYXQnOlxuICAgICAgc3VtbWFyeS5hc3NpZ25tZW50c1t2YWx1ZV0gPSB0cnVlO1xuICAgIGJyZWFrO1xuICAgIGNhc2UgJ25hbWUnOlxuICAgICAgc3VtbWFyeS5sb2NhbHNbdmFsdWVdID0gdHJ1ZTtcbiAgICAgIHJlcyA9IGdldFZhbHVlKHZhbHVlLCBjb250ZXh0LmxvY2Fscyk7XG4gICAgYnJlYWs7XG4gICAgY2FzZSAnZmlsdGVyJzpcbiAgICAgIHN1bW1hcnkuZmlsdGVyc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgcmVzID0gY29udGV4dC5maWx0ZXJzW3ZhbHVlXTtcbiAgICBicmVhaztcbiAgICBjYXNlICd0aGlzJzpcbiAgICAgIHJlcyA9IGNvbnRleHQubG9jYWxzOy8vVE9ETyB0aGlzIOaMh+WQkSB2bSDov5jmmK8gZGlyP1xuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBnZXRPcGVyYXRvcihhcml0eSwgdmFsdWUpe1xuICByZXR1cm4gb3BlcmF0b3JzW2FyaXR5XVt2YWx1ZV0gfHwgZnVuY3Rpb24oKSB7IHJldHVybjsgfVxufVxuXG5mdW5jdGlvbiByZXNldChzY29wZSwgdGhhdCkge1xuICBzdW1tYXJ5Q2FsbCA9IHRydWU7XG4gIGlmKHNjb3BlKSB7XG4gICAgc3VtbWFyeUNhbGwgPSBmYWxzZTtcbiAgICBjb250ZXh0ID0ge2xvY2Fsczogc2NvcGUgfHwge30sIGZpbHRlcnM6IHNjb3BlLiRmaWx0ZXJzIHx8IHt9fTtcbiAgfWVsc2V7XG4gICAgY29udGV4dCA9IHtmaWx0ZXJzOiB7fSwgbG9jYWxzOiB7fX07XG4gIH1cbiAgaWYodGhhdCl7XG4gICAgc2VsZiA9IHRoYXQ7XG4gIH1cblxuICBzdW1tYXJ5ID0ge2ZpbHRlcnM6IHt9LCBsb2NhbHM6IHt9LCBwYXRoczoge30sIGFzc2lnbm1lbnRzOiB7fX07XG4gIHBhdGggPSAnJztcbn1cblxuLy/lnKjkvZznlKjln5/kuK3mn6Xmib7lgLxcbnZhciBnZXRWYWx1ZSA9IHJlcXVpcmUoJy4vc2NvcGUnKS5nZXRWYWx1ZVxuXG4vL+ihqOi+vuW8j+axguWAvFxuLy90cmVlOiBwYXJzZXIg55Sf5oiQ55qEIGFzdFxuLy9zY29wZSDmiafooYznjq/looNcbmV4cG9ydHMuZXZhbCA9IGZ1bmN0aW9uKHRyZWUsIHNjb3BlLCB0aGF0KSB7XG4gIHJlc2V0KHNjb3BlIHx8IHt9LCB0aGF0KTtcblxuICByZXR1cm4gZXZhbHVhdGUodHJlZSk7XG59O1xuXG4vL+ihqOi+vuW8j+aRmOimgVxuLy9yZXR1cm46IHtmaWx0ZXJzOltdLCBsb2NhbHM6W10sIHBhdGhzOiBbXSwgYXNzaWdubWVudHM6IFtdfVxuZXhwb3J0cy5zdW1tYXJ5ID0gZnVuY3Rpb24odHJlZSkge1xuICByZXNldCgpO1xuXG4gIGV2YWx1YXRlKHRyZWUpO1xuXG4gIGlmKHBhdGgpIHtcbiAgICBzdW1tYXJ5LnBhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgfVxuICBmb3IodmFyIGtleSBpbiBzdW1tYXJ5KSB7XG4gICAgc3VtbWFyeVtrZXldID0gT2JqZWN0LmtleXMoc3VtbWFyeVtrZXldKTtcbiAgfVxuICByZXR1cm4gc3VtbWFyeTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5hZGRFdmVudCA9IGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBldmVudCwgaGFuZGxlcikge1xuICBpZihlbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgaGFuZGxlciwgZmFsc2UpO1xuICB9ZWxzZXtcbiAgICBlbC5hdHRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59XG5cbmV4cG9ydHMucmVtb3ZlRXZlbnQgPSBmdW5jdGlvbiByZW1vdmVFdmVudChlbCwgZXZlbnQsIGhhbmRsZXIpIHtcbiAgaWYoZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGhhbmRsZXIpO1xuICB9ZWxzZXtcbiAgICBlbC5kZXRhY2hFdmVudCgnb24nICsgZXZlbnQsIGhhbmRsZXIpO1xuICB9XG59IiwiXCJ1c2Ugc3RyaWN0XCI7XG4vL0phdmFzY3JpcHQgZXhwcmVzc2lvbiBwYXJzZXIgbW9kaWZpZWQgZm9ybSBDcm9ja2ZvcmQncyBURE9QIHBhcnNlclxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcblx0ZnVuY3Rpb24gRigpIHt9XG5cdEYucHJvdG90eXBlID0gbztcblx0cmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgc291cmNlO1xuXG52YXIgZXJyb3IgPSBmdW5jdGlvbiAobWVzc2FnZSwgdCkge1xuXHR0ID0gdCB8fCB0aGlzO1xuICB2YXIgbXNnID0gbWVzc2FnZSArPSBcIiBCdXQgZm91bmQgJ1wiICsgdC52YWx1ZSArIFwiJ1wiICsgKHQuZnJvbSA/IFwiIGF0IFwiICsgdC5mcm9tIDogXCJcIikgKyBcIiBpbiAnXCIgKyBzb3VyY2UgKyBcIidcIjtcbiAgdmFyIGUgPSBuZXcgRXJyb3IobXNnKTtcblx0ZS5uYW1lID0gdC5uYW1lID0gXCJTeW50YXhFcnJvclwiO1xuXHR0Lm1lc3NhZ2UgPSBtZXNzYWdlO1xuICB0aHJvdyBlO1xufTtcblxudmFyIHRva2VuaXplID0gZnVuY3Rpb24gKGNvZGUsIHByZWZpeCwgc3VmZml4KSB7XG5cdHZhciBjOyAvLyBUaGUgY3VycmVudCBjaGFyYWN0ZXIuXG5cdHZhciBmcm9tOyAvLyBUaGUgaW5kZXggb2YgdGhlIHN0YXJ0IG9mIHRoZSB0b2tlbi5cblx0dmFyIGkgPSAwOyAvLyBUaGUgaW5kZXggb2YgdGhlIGN1cnJlbnQgY2hhcmFjdGVyLlxuXHR2YXIgbGVuZ3RoID0gY29kZS5sZW5ndGg7XG5cdHZhciBuOyAvLyBUaGUgbnVtYmVyIHZhbHVlLlxuXHR2YXIgcTsgLy8gVGhlIHF1b3RlIGNoYXJhY3Rlci5cblx0dmFyIHN0cjsgLy8gVGhlIHN0cmluZyB2YWx1ZS5cblxuXHR2YXIgcmVzdWx0ID0gW107IC8vIEFuIGFycmF5IHRvIGhvbGQgdGhlIHJlc3VsdHMuXG5cblx0Ly8gTWFrZSBhIHRva2VuIG9iamVjdC5cblx0dmFyIG1ha2UgPSBmdW5jdGlvbiAodHlwZSwgdmFsdWUpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZSA6IHR5cGUsXG5cdFx0XHR2YWx1ZSA6IHZhbHVlLFxuXHRcdFx0ZnJvbSA6IGZyb20sXG5cdFx0XHR0byA6IGlcblx0XHR9O1xuXHR9O1xuXG5cdC8vIEJlZ2luIHRva2VuaXphdGlvbi4gSWYgdGhlIHNvdXJjZSBzdHJpbmcgaXMgZW1wdHksIHJldHVybiBub3RoaW5nLlxuXHRpZiAoIWNvZGUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBMb29wIHRocm91Z2ggY29kZSB0ZXh0LCBvbmUgY2hhcmFjdGVyIGF0IGEgdGltZS5cblx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHR3aGlsZSAoYykge1xuXHRcdGZyb20gPSBpO1xuXG5cdFx0aWYgKGMgPD0gJyAnKSB7IC8vIElnbm9yZSB3aGl0ZXNwYWNlLlxuXHRcdFx0aSArPSAxO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH0gZWxzZSBpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8IGMgPT09ICckJyB8fCBjID09PSAnXycpIHsgLy8gbmFtZS5cblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRmb3IgKDsgOyApIHtcblx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRpZiAoKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB8fCAoYyA+PSAnQScgJiYgYyA8PSAnWicpIHx8XG5cdFx0XHRcdFx0KGMgPj0gJzAnICYmIGMgPD0gJzknKSB8fCBjID09PSAnXycpIHtcblx0XHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ25hbWUnLCBzdHIpKTtcblx0XHR9IGVsc2UgaWYgKGMgPj0gJzAnICYmIGMgPD0gJzknKSB7XG5cdFx0XHQvLyBudW1iZXIuXG5cblx0XHRcdC8vIEEgbnVtYmVyIGNhbm5vdCBzdGFydCB3aXRoIGEgZGVjaW1hbCBwb2ludC4gSXQgbXVzdCBzdGFydCB3aXRoIGEgZGlnaXQsXG5cdFx0XHQvLyBwb3NzaWJseSAnMCcuXG5cdFx0XHRzdHIgPSBjO1xuXHRcdFx0aSArPSAxO1xuXG5cdFx0XHQvLyBMb29rIGZvciBtb3JlIGRpZ2l0cy5cblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIGZvciBhIGRlY2ltYWwgZnJhY3Rpb24gcGFydC5cblx0XHRcdGlmIChjID09PSAnLicpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0Zm9yICg7IDsgKSB7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayBmb3IgYW4gZXhwb25lbnQgcGFydC5cblx0XHRcdGlmIChjID09PSAnZScgfHwgYyA9PT0gJ0UnKSB7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0aWYgKGMgPT09ICctJyB8fCBjID09PSAnKycpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdFx0c3RyICs9IGM7XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjIDwgJzAnIHx8IGMgPiAnOScpIHtcblx0XHRcdFx0XHRlcnJvcihcIkJhZCBleHBvbmVudFwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblx0XHRcdFx0fSB3aGlsZSAoYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlIG5leHQgY2hhcmFjdGVyIGlzIG5vdCBhIGxldHRlci5cblxuXHRcdFx0aWYgKGMgPj0gJ2EnICYmIGMgPD0gJ3onKSB7XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdGVycm9yKFwiQmFkIG51bWJlclwiLCBtYWtlKCdudW1iZXInLCBzdHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlIHRvIGEgbnVtYmVyLiBJZiBpdCBpcyBmaW5pdGUsIHRoZW4gaXQgaXMgYSBnb29kXG5cdFx0XHQvLyB0b2tlbi5cblxuXHRcdFx0biA9ICtzdHI7XG5cdFx0XHRpZiAoaXNGaW5pdGUobikpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnbnVtYmVyJywgbikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXJyb3IoXCJCYWQgbnVtYmVyXCIsIG1ha2UoJ251bWJlcicsIHN0cikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzdHJpbmdcblxuXHRcdH0gZWxzZSBpZiAoYyA9PT0gJ1xcJycgfHwgYyA9PT0gJ1wiJykge1xuXHRcdFx0c3RyID0gJyc7XG5cdFx0XHRxID0gYztcblx0XHRcdGkgKz0gMTtcblx0XHRcdGZvciAoOyA7ICkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChjIDwgJyAnKSB7XG5cdFx0XHRcdFx0bWFrZSgnc3RyaW5nJywgc3RyKTtcblx0XHRcdFx0XHRlcnJvcihjID09PSAnXFxuJyB8fCBjID09PSAnXFxyJyB8fCBjID09PSAnJyA/XG5cdFx0XHRcdFx0XHRcIlVudGVybWluYXRlZCBzdHJpbmcuXCIgOlxuXHRcdFx0XHRcdFx0XCJDb250cm9sIGNoYXJhY3RlciBpbiBzdHJpbmcuXCIsIG1ha2UoJycsIHN0cikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgdGhlIGNsb3NpbmcgcXVvdGUuXG5cblx0XHRcdFx0aWYgKGMgPT09IHEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvb2sgZm9yIGVzY2FwZW1lbnQuXG5cblx0XHRcdFx0aWYgKGMgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0XHRpZiAoaSA+PSBsZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdFx0XHRcdHN3aXRjaCAoYykge1xuXHRcdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXGInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZic6XG5cdFx0XHRcdFx0XHRjID0gJ1xcZic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICduJzpcblx0XHRcdFx0XHRcdGMgPSAnXFxuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3InOlxuXHRcdFx0XHRcdFx0YyA9ICdcXHInO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndCc6XG5cdFx0XHRcdFx0XHRjID0gJ1xcdCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1Jzpcblx0XHRcdFx0XHRcdGlmIChpID49IGxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcihcIlVudGVybWluYXRlZCBzdHJpbmdcIiwgbWFrZSgnc3RyaW5nJywgc3RyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjID0gcGFyc2VJbnQoY29kZS5zdWJzdHIoaSArIDEsIDQpLCAxNik7XG5cdFx0XHRcdFx0XHRpZiAoIWlzRmluaXRlKGMpIHx8IGMgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdGVycm9yKFwiVW50ZXJtaW5hdGVkIHN0cmluZ1wiLCBtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuXHRcdFx0XHRcdFx0aSArPSA0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHN0ciArPSBjO1xuXHRcdFx0XHRpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlKCdzdHJpbmcnLCBzdHIpKTtcblx0XHRcdGMgPSBjb2RlLmNoYXJBdChpKTtcblxuXHRcdFx0Ly8gY29tYmluaW5nXG5cblx0XHR9IGVsc2UgaWYgKHByZWZpeC5pbmRleE9mKGMpID49IDApIHtcblx0XHRcdHN0ciA9IGM7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjID0gY29kZS5jaGFyQXQoaSk7XG5cdFx0XHRcdGlmIChpID49IGxlbmd0aCB8fCBzdWZmaXguaW5kZXhPZihjKSA8IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gYztcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2gobWFrZSgnb3BlcmF0b3InLCBzdHIpKTtcblxuXHRcdFx0Ly8gc2luZ2xlLWNoYXJhY3RlciBvcGVyYXRvclxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2UoJ29wZXJhdG9yJywgYykpO1xuXHRcdFx0YyA9IGNvZGUuY2hhckF0KGkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIG1ha2VfcGFyc2UgPSBmdW5jdGlvbiAodmFycykge1xuXHR2YXJzID0gdmFycyB8fCB7fTsvL+mihOWumuS5ieeahOWPmOmHj1xuXHR2YXIgc3ltYm9sX3RhYmxlID0ge307XG5cdHZhciB0b2tlbjtcblx0dmFyIHRva2Vucztcblx0dmFyIHRva2VuX25yO1xuXHR2YXIgY29udGV4dDtcblxuXHR2YXIgaXRzZWxmID0gZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdHZhciBmaW5kID0gZnVuY3Rpb24gKG4pIHtcblx0XHRuLm51ZCA9IGl0c2VsZjtcblx0XHRuLmxlZCA9IG51bGw7XG5cdFx0bi5zdGQgPSBudWxsO1xuXHRcdG4ubGJwID0gMDtcblx0XHRyZXR1cm4gbjtcblx0fTtcblxuXHR2YXIgYWR2YW5jZSA9IGZ1bmN0aW9uIChpZCkge1xuXHRcdHZhciBhLCBvLCB0LCB2O1xuXHRcdGlmIChpZCAmJiB0b2tlbi5pZCAhPT0gaWQpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgJ1wiICsgaWQgKyBcIicuXCIsIHRva2VuKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuX25yID49IHRva2Vucy5sZW5ndGgpIHtcblx0XHRcdHRva2VuID0gc3ltYm9sX3RhYmxlW1wiKGVuZClcIl07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHQgPSB0b2tlbnNbdG9rZW5fbnJdO1xuXHRcdHRva2VuX25yICs9IDE7XG5cdFx0diA9IHQudmFsdWU7XG5cdFx0YSA9IHQudHlwZTtcblx0XHRpZiAoKGEgPT09IFwib3BlcmF0b3JcIiB8fCBhICE9PSAnc3RyaW5nJykgJiYgdiBpbiBzeW1ib2xfdGFibGUpIHtcblx0XHRcdC8vdHJ1ZSwgZmFsc2Ug562J55u05o6l6YeP5Lmf5Lya6L+b5YWl5q2k5YiG5pSvXG5cdFx0XHRvID0gc3ltYm9sX3RhYmxlW3ZdO1xuXHRcdFx0aWYgKCFvKSB7XG5cdFx0XHRcdGVycm9yKFwiVW5rbm93biBvcGVyYXRvci5cIiwgdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhID09PSBcIm5hbWVcIikge1xuXHRcdFx0byA9IGZpbmQodCk7XG5cdFx0fSBlbHNlIGlmIChhID09PSBcInN0cmluZ1wiIHx8IGEgPT09IFwibnVtYmVyXCIgfHwgYSA9PT0gXCJyZWdleHBcIikge1xuXHRcdFx0byA9IHN5bWJvbF90YWJsZVtcIihsaXRlcmFsKVwiXTtcblx0XHRcdGEgPSBcImxpdGVyYWxcIjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXJyb3IoXCJVbmV4cGVjdGVkIHRva2VuLlwiLCB0KTtcblx0XHR9XG5cdFx0dG9rZW4gPSBjcmVhdGUobyk7XG5cdFx0dG9rZW4uZnJvbSA9IHQuZnJvbTtcblx0XHR0b2tlbi50byA9IHQudG87XG5cdFx0dG9rZW4udmFsdWUgPSB2O1xuXHRcdHRva2VuLmFyaXR5ID0gYTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH07XG5cbiAgLy/ooajovr7lvI9cbiAgLy9yYnA6IHJpZ2h0IGJpbmRpbmcgcG93ZXIg5Y+z5L6n57qm5p2f5YqbXG5cdHZhciBleHByZXNzaW9uID0gZnVuY3Rpb24gKHJicCkge1xuXHRcdHZhciBsZWZ0O1xuXHRcdHZhciB0ID0gdG9rZW47XG5cdFx0YWR2YW5jZSgpO1xuXHRcdGxlZnQgPSB0Lm51ZCgpO1xuXHRcdHdoaWxlIChyYnAgPCB0b2tlbi5sYnApIHtcblx0XHRcdHQgPSB0b2tlbjtcblx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdGxlZnQgPSB0LmxlZChsZWZ0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGxlZnQ7XG5cdH07XG5cblx0dmFyIG9yaWdpbmFsX3N5bWJvbCA9IHtcblx0XHRudWQgOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlcnJvcihcIlVuZGVmaW5lZC5cIiwgdGhpcyk7XG5cdFx0fSxcblx0XHRsZWQgOiBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0ZXJyb3IoXCJNaXNzaW5nIG9wZXJhdG9yLlwiLCB0aGlzKTtcblx0XHR9XG5cdH07XG5cblx0dmFyIHN5bWJvbCA9IGZ1bmN0aW9uIChpZCwgYnApIHtcblx0XHR2YXIgcyA9IHN5bWJvbF90YWJsZVtpZF07XG5cdFx0YnAgPSBicCB8fCAwO1xuXHRcdGlmIChzKSB7XG5cdFx0XHRpZiAoYnAgPj0gcy5sYnApIHtcblx0XHRcdFx0cy5sYnAgPSBicDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cyA9IGNyZWF0ZShvcmlnaW5hbF9zeW1ib2wpO1xuXHRcdFx0cy5pZCA9IHMudmFsdWUgPSBpZDtcblx0XHRcdHMubGJwID0gYnA7XG5cdFx0XHRzeW1ib2xfdGFibGVbaWRdID0gcztcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0dmFyIGNvbnN0YW50ID0gZnVuY3Rpb24gKHMsIHYsIGEpIHtcblx0XHR2YXIgeCA9IHN5bWJvbChzKTtcblx0XHR4Lm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBzeW1ib2xfdGFibGVbdGhpcy5pZF0udmFsdWU7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHgudmFsdWUgPSB2O1xuXHRcdHJldHVybiB4O1xuXHR9O1xuXG5cdHZhciBpbmZpeCA9IGZ1bmN0aW9uIChpZCwgYnAsIGxlZCkge1xuXHRcdHZhciBzID0gc3ltYm9sKGlkLCBicCk7XG5cdFx0cy5sZWQgPSBsZWQgfHwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBleHByZXNzaW9uKGJwKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgaW5maXhyID0gZnVuY3Rpb24gKGlkLCBicCwgbGVkKSB7XG5cdFx0dmFyIHMgPSBzeW1ib2woaWQsIGJwKTtcblx0XHRzLmxlZCA9IGxlZCB8fCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGxlZnQ7XG5cdFx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oYnAgLSAxKTtcblx0XHRcdHRoaXMuYXJpdHkgPSBcImJpbmFyeVwiO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRyZXR1cm4gcztcblx0fTtcblxuXHR2YXIgcHJlZml4ID0gZnVuY3Rpb24gKGlkLCBudWQpIHtcblx0XHR2YXIgcyA9IHN5bWJvbChpZCk7XG5cdFx0cy5udWQgPSBudWQgfHwgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzApO1xuXHRcdFx0dGhpcy5hcml0eSA9IFwidW5hcnlcIjtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIHM7XG5cdH07XG5cblx0c3ltYm9sKFwiKGVuZClcIik7XG5cdHN5bWJvbChcIihuYW1lKVwiKTtcblx0c3ltYm9sKFwiOlwiKTtcblx0c3ltYm9sKFwiKVwiKTtcblx0c3ltYm9sKFwiXVwiKTtcblx0c3ltYm9sKFwifVwiKTtcblx0c3ltYm9sKFwiLFwiKTtcblxuXHRjb25zdGFudChcInRydWVcIiwgdHJ1ZSk7XG5cdGNvbnN0YW50KFwiZmFsc2VcIiwgZmFsc2UpO1xuXHRjb25zdGFudChcIm51bGxcIiwgbnVsbCk7XG5cdGNvbnN0YW50KFwidW5kZWZpbmVkXCIpO1xuXG5cdGNvbnN0YW50KFwiTWF0aFwiLCBNYXRoKTtcblx0Y29uc3RhbnQoXCJEYXRlXCIsIERhdGUpO1xuXHRmb3IodmFyIHYgaW4gdmFycykge1xuXHRcdGNvbnN0YW50KHYsIHZhcnNbdl0pO1xuXHR9XG5cblx0c3ltYm9sKFwiKGxpdGVyYWwpXCIpLm51ZCA9IGl0c2VsZjtcblxuXHRzeW1ib2woXCJ0aGlzXCIpLm51ZCA9IGZ1bmN0aW9uICgpIHtcblx0ICB0aGlzLmFyaXR5ID0gXCJ0aGlzXCI7XG5cdCAgcmV0dXJuIHRoaXM7XG5cdH07XG5cblx0Ly9PcGVyYXRvciBQcmVjZWRlbmNlOlxuXHQvL2h0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL09wZXJhdG9ycy9PcGVyYXRvcl9QcmVjZWRlbmNlXG5cbiAgaW5maXgoJywnLCAxKTtcblx0aW5maXgoXCI/XCIsIDIwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHR0aGlzLnRoaXJkID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4cihcIiYmXCIsIDMxKTtcblx0aW5maXhyKFwifHxcIiwgMzApO1xuXG5cdGluZml4cihcIj09PVwiLCA0MCk7XG5cdGluZml4cihcIiE9PVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPT1cIiwgNDApO1xuXHRpbmZpeHIoXCIhPVwiLCA0MCk7XG5cblx0aW5maXhyKFwiPFwiLCA0MCk7XG5cdGluZml4cihcIjw9XCIsIDQwKTtcblx0aW5maXhyKFwiPlwiLCA0MCk7XG5cdGluZml4cihcIj49XCIsIDQwKTtcblxuXHRpbmZpeChcImluXCIsIDQ1LCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigwKTtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRpZiAoY29udGV4dCA9PT0gJ3JlcGVhdCcpIHtcblx0XHRcdC8vIGBpbmAgYXQgcmVwZWF0IGJsb2NrXG5cdFx0XHRsZWZ0LmFyaXR5ID0gJ3JlcGVhdCc7XG5cdFx0XHR0aGlzLnJlcGVhdCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRpbmZpeChcIitcIiwgNTApO1xuXHRpbmZpeChcIi1cIiwgNTApO1xuXG5cdGluZml4KFwiKlwiLCA2MCk7XG5cdGluZml4KFwiL1wiLCA2MCk7XG5cdGluZml4KFwiJVwiLCA2MCk7XG5cblx0aW5maXgoXCIoXCIsIDcwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0aWYgKGxlZnQuaWQgPT09IFwiLlwiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gXCJ0ZXJuYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdC5maXJzdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gbGVmdC5zZWNvbmQ7XG5cdFx0XHR0aGlzLnRoaXJkID0gYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHRcdHRoaXMuc2Vjb25kID0gYTtcblx0XHRcdGlmICgobGVmdC5hcml0eSAhPT0gXCJ1bmFyeVwiIHx8IGxlZnQuaWQgIT09IFwiZnVuY3Rpb25cIikgJiZcblx0XHRcdFx0bGVmdC5hcml0eSAhPT0gXCJuYW1lXCIgJiYgbGVmdC5hcml0eSAhPT0gXCJsaXRlcmFsXCIgJiYgbGVmdC5pZCAhPT0gXCIoXCIgJiZcblx0XHRcdFx0bGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIikge1xuXHRcdFx0XHRlcnJvcihcIkV4cGVjdGVkIGEgdmFyaWFibGUgbmFtZS5cIiwgbGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCIpXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSk7XG5cblx0aW5maXgoXCIuXCIsIDgwLCBmdW5jdGlvbiAobGVmdCkge1xuXHRcdHRoaXMuZmlyc3QgPSBsZWZ0O1xuXHRcdGlmICh0b2tlbi5hcml0eSAhPT0gXCJuYW1lXCIpIHtcblx0XHRcdGVycm9yKFwiRXhwZWN0ZWQgYSBwcm9wZXJ0eSBuYW1lLlwiLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRva2VuLmFyaXR5ID0gXCJsaXRlcmFsXCI7XG5cdFx0dGhpcy5zZWNvbmQgPSB0b2tlbjtcblx0XHR0aGlzLmFyaXR5ID0gXCJiaW5hcnlcIjtcblx0XHRhZHZhbmNlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdGluZml4KFwiW1wiLCA4MCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0aGlzLnNlY29uZCA9IGV4cHJlc3Npb24oMCk7XG5cdFx0dGhpcy5hcml0eSA9IFwiYmluYXJ5XCI7XG5cdFx0YWR2YW5jZShcIl1cIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdC8vZmlsdGVyXG5cdGluZml4KFwifFwiLCAxMCwgZnVuY3Rpb24gKGxlZnQpIHtcblx0XHR2YXIgYTtcblx0XHR0aGlzLmZpcnN0ID0gbGVmdDtcblx0XHR0b2tlbi5hcml0eSA9ICdmaWx0ZXInO1xuXHRcdHRoaXMuc2Vjb25kID0gZXhwcmVzc2lvbigxMCk7XG5cdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdGlmICh0b2tlbi5pZCA9PT0gJzonKSB7XG5cdFx0XHR0aGlzLmFyaXR5ID0gJ3Rlcm5hcnknO1xuXHRcdFx0dGhpcy50aGlyZCA9IGEgPSBbXTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGFkdmFuY2UoJzonKTtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMCkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiOlwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuICBpbmZpeCgnY2F0Y2hieScsIDEwKTtcblxuXHRwcmVmaXgoXCIhXCIpO1xuXHRwcmVmaXgoXCItXCIpO1xuXHRwcmVmaXgoXCJ0eXBlb2ZcIik7XG5cblx0cHJlZml4KFwiKFwiLCBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGUgPSBleHByZXNzaW9uKDApO1xuXHRcdGFkdmFuY2UoXCIpXCIpO1xuXHRcdHJldHVybiBlO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJbXCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdO1xuXHRcdGlmICh0b2tlbi5pZCAhPT0gXCJdXCIpIHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGEucHVzaChleHByZXNzaW9uKDEpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlkICE9PSBcIixcIikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkdmFuY2UoXCIsXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhZHZhbmNlKFwiXVwiKTtcblx0XHR0aGlzLmZpcnN0ID0gYTtcblx0XHR0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHRwcmVmaXgoXCJ7XCIsIGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYSA9IFtdLFx0biwgdjtcblx0XHRpZiAodG9rZW4uaWQgIT09IFwifVwiKSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRuID0gdG9rZW47XG5cdFx0XHRcdGlmIChuLmFyaXR5ICE9PSBcIm5hbWVcIiAmJiBuLmFyaXR5ICE9PSBcImxpdGVyYWxcIikge1xuXHRcdFx0XHRcdGVycm9yKFwiQmFkIHByb3BlcnR5IG5hbWU6IFwiLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0XHRhZHZhbmNlKFwiOlwiKTtcblx0XHRcdFx0diA9IGV4cHJlc3Npb24oMSk7XG5cdFx0XHRcdHYua2V5ID0gbi52YWx1ZTtcblx0XHRcdFx0YS5wdXNoKHYpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkdmFuY2UoXCJ9XCIpO1xuXHRcdHRoaXMuZmlyc3QgPSBhO1xuXHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0pO1xuXG5cdHByZWZpeCgnbmV3JywgZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhID0gW107XG5cdFx0dGhpcy5maXJzdCA9IGV4cHJlc3Npb24oNzkpO1xuXHRcdGlmKHRva2VuLmlkID09PSAnKCcpIHtcblx0XHRcdGFkdmFuY2UoXCIoXCIpO1xuXHRcdFx0dGhpcy5hcml0eSA9ICdiaW5hcnknO1xuXHRcdFx0dGhpcy5zZWNvbmQgPSBhO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0YS5wdXNoKGV4cHJlc3Npb24oMSkpO1xuXHRcdFx0XHRpZiAodG9rZW4uaWQgIT09IFwiLFwiKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWR2YW5jZShcIixcIik7XG5cdFx0XHR9XG5cdFx0XHRhZHZhbmNlKFwiKVwiKTtcblx0XHR9ZWxzZXtcblx0XHRcdHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9KTtcblxuXHQvL19zb3VyY2U6IOihqOi+vuW8j+S7o+eggeWtl+espuS4slxuXHQvL19jb250ZXh0OiDooajovr7lvI/nmoTor63lj6Xnjq/looNcblx0cmV0dXJuIGZ1bmN0aW9uIChfc291cmNlLCBfY29udGV4dCkge1xuICAgIHNvdXJjZSA9IF9zb3VyY2U7XG5cdFx0dG9rZW5zID0gdG9rZW5pemUoX3NvdXJjZSwgJz08PiErLSomfC8lXicsICc9PD4mfCcpO1xuXHRcdHRva2VuX25yID0gMDtcblx0XHRjb250ZXh0ID0gX2NvbnRleHQ7XG5cdFx0YWR2YW5jZSgpO1xuXHRcdHZhciBzID0gZXhwcmVzc2lvbigwKTtcblx0XHRhZHZhbmNlKFwiKGVuZClcIik7XG5cdFx0cmV0dXJuIHM7XG5cdH07XG59O1xuXG5leHBvcnRzLnBhcnNlID0gbWFrZV9wYXJzZSgpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuLy/moLnmja7lj5jph4/lj4ogdm0g56Gu5a6a5Y+Y6YeP5omA5bGe55qE55yf5q2jIHZtXG52YXIgcmVmb3JtU2NvcGUgPSBmdW5jdGlvbiAodm0sIHBhdGgpIHtcbiAgdmFyIHBhdGhzID0gdXRpbHMucGFyc2VLZXlQYXRoKHBhdGgpO1xuICB2YXIgY3VyID0gdm0sIGxvY2FsID0gcGF0aHNbMF07XG4gIHZhciBzY29wZSA9IGN1ciwgYXNzLCBjdXJWbSA9IGN1cjtcblxuICB3aGlsZShjdXIpIHtcbiAgICBjdXJWbSA9IHNjb3BlID0gY3VyO1xuICAgIGFzcyA9IGN1ci5fYXNzaWdubWVudHM7XG4gICAgaWYoIGN1ci5fX3JlcGVhdCkge1xuICAgICAgaWYgKGFzcyAmJiBhc3MubGVuZ3RoKSB7XG4gICAgICAgIC8vIOWFt+WQjSByZXBlYXQg5LiN5Lya55u05o6l5p+l5om+6Ieq6Lqr5L2c55So5Z+fXG4gICAgICAgIGlmIChsb2NhbCA9PT0gJyRpbmRleCcgfHwgbG9jYWwgPT09ICckcGFyZW50Jykge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2UgaWYgKGxvY2FsID09PSBhc3NbMF0pIHtcbiAgICAgICAgICAvL+S/ruato2tleVxuICAgICAgICAgIGlmIChwYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHBhdGhzWzBdID0gJyRkYXRhJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGF0aHMuc2hpZnQoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy/ljL/lkI0gcmVwZWF0XG4gICAgICAgIGlmIChwYXRoIGluIGN1cikge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGN1ciA9IGN1ci4kcGFyZW50O1xuICB9XG5cbiAgcmV0dXJuIHsgc2NvcGU6IHNjb3BlLCB2bTpjdXJWbSwgcGF0aDogcGF0aHMuam9pbignLicpIH1cbn07XG5cbi8v5qC55o2uIHZtIOWPiiBrZXkg5rGC5YC8XG4vL+axguWAvOeahOe7k+aenOWcqCBqcyDlj4rmqKHmnb/kuK3kv53mjIHkuIDoh7RcbnZhciBnZXRWYWx1ZSA9IGZ1bmN0aW9uKGtleSwgc2NvcGUpIHtcbiAgdmFyIHJlZm9ybWVkID0gcmVmb3JtU2NvcGUoc2NvcGUsIGtleSlcblxuICByZXR1cm4gcmVmb3JtZWQuc2NvcGVbcmVmb3JtZWQucGF0aF1cbn07XG5cbmV4cG9ydHMucmVmb3JtU2NvcGUgPSByZWZvcm1TY29wZTtcbmV4cG9ydHMuZ2V0VmFsdWUgPSBnZXRWYWx1ZTtcbiIsInZhciB0b2tlblJlZyA9IC97eyh7KFtefVxcbl0rKX18W159XFxuXSspfX0vZztcblxuLy/lrZfnrKbkuLLkuK3mmK/lkKbljIXlkKvmqKHmnb/ljaDkvY3nrKbmoIforrBcbmZ1bmN0aW9uIGhhc1Rva2VuKHN0cikge1xuICB0b2tlblJlZy5sYXN0SW5kZXggPSAwO1xuICByZXR1cm4gc3RyICYmIHRva2VuUmVnLnRlc3Qoc3RyKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VUb2tlbih2YWx1ZSkge1xuICB2YXIgdG9rZW5zID0gW11cbiAgICAsIHRleHRNYXAgPSBbXVxuICAgICwgc3RhcnQgPSAwXG4gICAgLCB2YWwsIHRva2VuXG4gICAgO1xuICBcbiAgdG9rZW5SZWcubGFzdEluZGV4ID0gMDtcbiAgXG4gIHdoaWxlKCh2YWwgPSB0b2tlblJlZy5leGVjKHZhbHVlKSkpe1xuICAgIGlmKHRva2VuUmVnLmxhc3RJbmRleCAtIHN0YXJ0ID4gdmFsWzBdLmxlbmd0aCl7XG4gICAgICB0ZXh0TWFwLnB1c2godmFsdWUuc2xpY2Uoc3RhcnQsIHRva2VuUmVnLmxhc3RJbmRleCAtIHZhbFswXS5sZW5ndGgpKTtcbiAgICB9XG4gICAgXG4gICAgdG9rZW4gPSB7XG4gICAgICBlc2NhcGU6ICF2YWxbMl1cbiAgICAsIHBhdGg6ICh2YWxbMl0gfHwgdmFsWzFdKS50cmltKClcbiAgICAsIHBvc2l0aW9uOiB0ZXh0TWFwLmxlbmd0aFxuICAgICwgdGV4dE1hcDogdGV4dE1hcFxuICAgIH07XG4gICAgXG4gICAgdG9rZW5zLnB1c2godG9rZW4pO1xuICAgIFxuICAgIC8v5LiA5Liq5byV55So57G75Z6LKOaVsOe7hCnkvZzkuLroioLngrnlr7nosaHnmoTmlofmnKzlm74sIOi/meagt+W9k+afkOS4gOS4quW8leeUqOaUueWPmOS6huS4gOS4quWAvOWQjiwg5YW25LuW5byV55So5Y+W5b6X55qE5YC86YO95Lya5ZCM5pe25pu05pawXG4gICAgdGV4dE1hcC5wdXNoKHZhbFswXSk7XG4gICAgXG4gICAgc3RhcnQgPSB0b2tlblJlZy5sYXN0SW5kZXg7XG4gIH1cbiAgXG4gIGlmKHZhbHVlLmxlbmd0aCA+IHN0YXJ0KXtcbiAgICB0ZXh0TWFwLnB1c2godmFsdWUuc2xpY2Uoc3RhcnQsIHZhbHVlLmxlbmd0aCkpO1xuICB9XG4gIFxuICB0b2tlbnMudGV4dE1hcCA9IHRleHRNYXA7XG4gIFxuICByZXR1cm4gdG9rZW5zO1xufVxuXG5leHBvcnRzLmhhc1Rva2VuID0gaGFzVG9rZW47XG5cbmV4cG9ydHMucGFyc2VUb2tlbiA9IHBhcnNlVG9rZW47IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8vdXRpbHNcbi8vLS0tXG5cbnZhciBkb2MgPSByZXF1aXJlKCcuL2Vudi5qcycpLmRvY3VtZW50O1xuXG52YXIga2V5UGF0aFJlZyA9IC8oPzpcXC58XFxbKS9nXG4gICwgYnJhID0gL1xcXS9nXG4gIDtcblxuLy/lsIYga2V5UGF0aCDovazkuLrmlbDnu4TlvaLlvI9cbi8vcGF0aC5rZXksIHBhdGhba2V5XSAtLT4gWydwYXRoJywgJ2tleSddXG5mdW5jdGlvbiBwYXJzZUtleVBhdGgoa2V5UGF0aCl7XG4gIHJldHVybiBrZXlQYXRoLnJlcGxhY2UoYnJhLCAnJykuc3BsaXQoa2V5UGF0aFJlZyk7XG59XG5cbi8qKlxuICog5ZCI5bm25a+56LGhXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtkZWVwPWZhbHNlXSDmmK/lkKbmt7HluqblkIjlubZcbiAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQg55uu5qCH5a+56LGhXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdC4uLl0g5p2l5rqQ5a+56LGhXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0g5ZCI5bm25ZCO55qEIHRhcmdldCDlr7nosaFcbiAqL1xuZnVuY3Rpb24gZXh0ZW5kKC8qIGRlZXAsIHRhcmdldCwgb2JqZWN0Li4uICovKSB7XG4gIHZhciBvcHRpb25zXG4gICAgLCBuYW1lLCBzcmMsIGNvcHksIGNvcHlJc0FycmF5LCBjbG9uZVxuICAgICwgdGFyZ2V0ID0gYXJndW1lbnRzWzBdIHx8IHt9XG4gICAgLCBpID0gMVxuICAgICwgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aFxuICAgICwgZGVlcCA9IGZhbHNlXG4gICAgO1xuXG4gIC8vIEhhbmRsZSBhIGRlZXAgY29weSBzaXR1YXRpb25cbiAgaWYgKHR5cGVvZiB0YXJnZXQgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgZGVlcCA9IHRhcmdldDtcblxuICAgIC8vIHNraXAgdGhlIGJvb2xlYW4gYW5kIHRoZSB0YXJnZXRcbiAgICB0YXJnZXQgPSBhcmd1bWVudHNbIGkgXSB8fCB7fTtcbiAgICBpKys7XG4gIH1cblxuICBpZih1dGlscy5pc0Z1bmN0aW9uKGFyZ3VtZW50c1tsZW5ndGggLSAxXSkpIHtcbiAgICBsZW5ndGgtLTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBjYXNlIHdoZW4gdGFyZ2V0IGlzIGEgc3RyaW5nIG9yIHNvbWV0aGluZyAocG9zc2libGUgaW4gZGVlcCBjb3B5KVxuICBpZiAodHlwZW9mIHRhcmdldCAhPT0gXCJvYmplY3RcIiAmJiAhdXRpbHMuaXNGdW5jdGlvbih0YXJnZXQpKSB7XG4gICAgdGFyZ2V0ID0ge307XG4gIH1cblxuICBmb3IgKCA7IGkgPCBsZW5ndGg7IGkrKyApIHtcbiAgICAvLyBPbmx5IGRlYWwgd2l0aCBub24tbnVsbC91bmRlZmluZWQgdmFsdWVzXG4gICAgaWYgKCAob3B0aW9ucyA9IGFyZ3VtZW50c1sgaSBdKSAhPSBudWxsICkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBiYXNlIG9iamVjdFxuICAgICAgZm9yICggbmFtZSBpbiBvcHRpb25zICkge1xuICAgICAgICAvL2FuZHJvaWQgMi4zIGJyb3dzZXIgY2FuIGVudW0gdGhlIHByb3RvdHlwZSBvZiBjb25zdHJ1Y3Rvci4uLlxuICAgICAgICBpZihvcHRpb25zLmhhc093blByb3BlcnR5KG5hbWUpICYmIG5hbWUgIT09ICdwcm90b3R5cGUnKXtcbiAgICAgICAgICBzcmMgPSB0YXJnZXRbIG5hbWUgXTtcbiAgICAgICAgICBjb3B5ID0gb3B0aW9uc1sgbmFtZSBdO1xuXG5cbiAgICAgICAgICAvLyBSZWN1cnNlIGlmIHdlJ3JlIG1lcmdpbmcgcGxhaW4gb2JqZWN0cyBvciBhcnJheXNcbiAgICAgICAgICBpZiAoIGRlZXAgJiYgY29weSAmJiAoIHV0aWxzLmlzUGxhaW5PYmplY3QoY29weSkgfHwgKGNvcHlJc0FycmF5ID0gdXRpbHMuaXNBcnJheShjb3B5KSkgKSApIHtcblxuICAgICAgICAgICAgLy8gUHJldmVudCBuZXZlci1lbmRpbmcgbG9vcFxuICAgICAgICAgICAgaWYgKCB0YXJnZXQgPT09IGNvcHkgKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCBjb3B5SXNBcnJheSApIHtcbiAgICAgICAgICAgICAgY29weUlzQXJyYXkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgY2xvbmUgPSBzcmMgJiYgdXRpbHMuaXNBcnJheShzcmMpID8gc3JjIDogW107XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNsb25lID0gc3JjICYmIHV0aWxzLmlzUGxhaW5PYmplY3Qoc3JjKSA/IHNyYyA6IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZXZlciBtb3ZlIG9yaWdpbmFsIG9iamVjdHMsIGNsb25lIHRoZW1cbiAgICAgICAgICAgIHRhcmdldFsgbmFtZSBdID0gZXh0ZW5kKCBkZWVwLCBjbG9uZSwgY29weSk7XG5cbiAgICAgICAgICAgIC8vIERvbid0IGJyaW5nIGluIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2UgaWYgKCAhdXRpbHMuaXNVbmRlZmluZWQoY29weSkgJiYgdHlwZW9mIHRhcmdldCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIC8v5LiA5Lqb5oOF5LiLLCDmr5TlpoIgZmlyZWZveCDkuIvnu5nlrZfnrKbkuLLlr7nosaHotYvlgLzml7bkvJrlvILluLhcbiAgICAgICAgICAgIHRhcmdldFtuYW1lXSA9IGNvcHk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBtb2RpZmllZCBvYmplY3RcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcbiAgZnVuY3Rpb24gRigpIHt9XG4gIEYucHJvdG90eXBlID0gbztcbiAgcmV0dXJuIG5ldyBGKCk7XG59O1xuXG52YXIgZGVlcEdldCA9IGZ1bmN0aW9uIChrZXlTdHIsIG9iaikge1xuICB2YXIgY2hhaW4sIGN1ciA9IG9iaiwga2V5O1xuICBpZihrZXlTdHIpe1xuICAgIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cik7XG4gICAgZm9yKHZhciBpID0gMCwgbCA9IGNoYWluLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAga2V5ID0gY2hhaW5baV07XG4gICAgICBpZihjdXIpe1xuICAgICAgICBjdXIgPSBjdXJba2V5XTtcbiAgICAgIH1lbHNle1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjdXI7XG59XG5cbnZhciB1dGlscyA9IHtcbiAgbm9vcDogZnVuY3Rpb24gKCl7fVxuLCBpZTogISFkb2MuYXR0YWNoRXZlbnRcblxuLCBpc09iamVjdDogZnVuY3Rpb24gKHZhbCkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnb2JqZWN0JyAmJiB2YWwgIT09IG51bGw7XG4gIH1cblxuLCBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKHZhbCkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJztcbiAgfVxuXG4sIGlzRnVuY3Rpb246IGZ1bmN0aW9uICh2YWwpe1xuICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnZnVuY3Rpb24nO1xuICB9XG5cbiwgaXNBcnJheTogZnVuY3Rpb24gKHZhbCkge1xuICAgIGlmKHV0aWxzLmllKXtcbiAgICAgIC8vSUUgOSDlj4rku6XkuIsgSUUg6Leo56qX5Y+j5qOA5rWL5pWw57uEXG4gICAgICByZXR1cm4gdmFsICYmIHZhbC5jb25zdHJ1Y3RvciArICcnID09PSBBcnJheSArICcnO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsKTtcbiAgICB9XG4gIH1cblxuICAvL+eugOWNleWvueixoeeahOeugOaYk+WIpOaWrVxuLCBpc1BsYWluT2JqZWN0OiBmdW5jdGlvbiAobyl7XG4gICAgaWYgKCFvIHx8ICh7fSkudG9TdHJpbmcuY2FsbChvKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgfHwgby5ub2RlVHlwZSB8fCBvID09PSBvLndpbmRvdykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1lbHNle1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy/lh73mlbDliIfpnaIuIG9yaUZuIOWOn+Wni+WHveaVsCwgZm4g5YiH6Z2i6KGl5YWF5Ye95pWwXG4gIC8v5YmN6Z2i55qE5Ye95pWw6L+U5Zue5YC85Lyg5YWlIGJyZWFrQ2hlY2sg5Yik5patLCBicmVha0NoZWNrIOi/lOWbnuWAvOS4uuecn+aXtuS4jeaJp+ihjOWIh+mdouihpeWFheeahOWHveaVsFxuLCBiZWZvcmVGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0KSl7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gb3JpRm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiwgYWZ0ZXJGbjogZnVuY3Rpb24gKG9yaUZuLCBmbiwgYnJlYWtDaGVjaykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXQgPSBvcmlGbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgaWYoYnJlYWtDaGVjayAmJiBicmVha0NoZWNrLmNhbGwodGhpcywgcmV0KSl7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH1cblxuLCBwYXJzZUtleVBhdGg6IHBhcnNlS2V5UGF0aFxuXG4sIGRlZXBTZXQ6IGZ1bmN0aW9uIChrZXlTdHIsIHZhbHVlLCBvYmopIHtcbiAgICBpZihrZXlTdHIpe1xuICAgICAgdmFyIGNoYWluID0gcGFyc2VLZXlQYXRoKGtleVN0cilcbiAgICAgICAgLCBjdXIgPSBvYmpcbiAgICAgICAgO1xuICAgICAgY2hhaW4uZm9yRWFjaChmdW5jdGlvbihrZXksIGkpIHtcbiAgICAgICAgaWYoaSA9PT0gY2hhaW4ubGVuZ3RoIC0gMSl7XG4gICAgICAgICAgY3VyW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgaWYoY3VyICYmIGN1ci5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgY3VyW2tleV0gPSB7fTtcbiAgICAgICAgICAgIGN1ciA9IGN1cltrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfWVsc2V7XG4gICAgICBleHRlbmQob2JqLCB2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH1cbiwgZXh0ZW5kOiBleHRlbmRcbiwgY3JlYXRlOiBjcmVhdGVcbiwgdG9BcnJheTogZnVuY3Rpb24oYXJyTGlrZSkge1xuICAgIHZhciBhcnIgPSBbXTtcblxuICAgIHRyeXtcbiAgICAgIC8vSUUgOCDlr7kgZG9tIOWvueixoeS8muaKpemUmVxuICAgICAgYXJyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyTGlrZSlcbiAgICB9Y2F0Y2ggKGUpe1xuICAgICAgZm9yKHZhciBpID0gMCwgbCA9IGFyckxpa2UubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGFycltpXSA9IGFyckxpa2VbaV1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycjtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB1dGlscztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZXZhbHVhdGUgPSByZXF1aXJlKCcuL2V2YWwuanMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpXG4gICwgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlLmpzJykucGFyc2VcbiAgLCByZWZvcm1TY29wZSA9IHJlcXVpcmUoJy4vc2NvcGUnKS5yZWZvcm1TY29wZVxuICA7XG5cbmZ1bmN0aW9uIFdhdGNoZXIodm0sIGRpcikge1xuICB2YXIgcmVmb3JtZWQsIHBhdGgsIGN1clZtID0gdm0sIHdhdGNoZXJzID0gW107XG5cbiAgdGhpcy5zdGF0ZSA9IDE7XG4gIHRoaXMuZGlyID0gZGlyO1xuICB0aGlzLnZtID0gdm07XG4gIHRoaXMud2F0Y2hlcnMgPSBbXTtcblxuICB0aGlzLnZhbCA9IE5hTjtcblxuICBkaXIucGFyc2UoKTtcbiAgZGlyLnN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KGRpci5hc3QpO1xuXG4gIGZvcih2YXIgaSA9IDAsIGwgPSBkaXIuc3VtbWFyeS5wYXRocy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICByZWZvcm1lZCA9IHJlZm9ybVNjb3BlKHZtLCBkaXIuc3VtbWFyeS5wYXRoc1tpXSlcbiAgICBjdXJWbSA9IHJlZm9ybWVkLnZtXG4gICAgcGF0aCA9IHJlZm9ybWVkLnBhdGhcbiAgICBpZihkaXIud2F0Y2gpIHtcbiAgICAgIGN1clZtLl93YXRjaGVyc1twYXRoXSA9IGN1clZtLl93YXRjaGVyc1twYXRoXSB8fCBbXTtcbiAgICAgIGN1clZtLl93YXRjaGVyc1twYXRoXS5wdXNoKHRoaXMpO1xuICAgICAgd2F0Y2hlcnMgPSBjdXJWbS5fd2F0Y2hlcnNbcGF0aF07XG4gICAgfWVsc2V7XG4gICAgICB3YXRjaGVycyA9IFt0aGlzXTtcbiAgICB9XG4gICAgdGhpcy53YXRjaGVycy5wdXNoKCB3YXRjaGVycyApO1xuICB9XG5cbiAgdGhpcy51cGRhdGUoKTtcbn1cblxuLy/moLnmja7ooajovr7lvI/np7vpmaTlvZPliY0gdm0g5Lit55qEIHdhdGNoZXJcbmZ1bmN0aW9uIHVud2F0Y2ggKHZtLCBleHAsIGNhbGxiYWNrKSB7XG4gIHZhciBzdW1tYXJ5O1xuICB0cnkge1xuICAgIHN1bW1hcnkgPSBldmFsdWF0ZS5zdW1tYXJ5KHBhcnNlKGV4cCkpXG4gIH1jYXRjaCAoZSl7XG4gICAgZS5tZXNzYWdlID0gJ1N5bnRheEVycm9yIGluIFwiJyArIGV4cCArICdcIiB8ICcgKyBlLm1lc3NhZ2U7XG4gICAgY29uc29sZS5lcnJvcihlKTtcbiAgfVxuICBzdW1tYXJ5LnBhdGhzLmZvckVhY2goZnVuY3Rpb24ocGF0aCkge1xuICAgIHZhciB3YXRjaGVycyA9IHZtLl93YXRjaGVyc1twYXRoXSB8fCBbXSwgdXBkYXRlO1xuXG4gICAgZm9yKHZhciBpID0gd2F0Y2hlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgdXBkYXRlID0gd2F0Y2hlcnNbaV0uZGlyLnVwZGF0ZTtcbiAgICAgIGlmKHVwZGF0ZSA9PT0gY2FsbGJhY2sgfHwgdXBkYXRlLl9vcmlnaW5GbiA9PT0gY2FsbGJhY2spe1xuICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBhZGRXYXRjaGVyKGRpcikge1xuICBpZihkaXIucGF0aCkge1xuICAgIHJldHVybiBuZXcgV2F0Y2hlcih0aGlzLCBkaXIpO1xuICB9XG59XG5cbldhdGNoZXIudW53YXRjaCA9IHVud2F0Y2g7XG5XYXRjaGVyLmFkZFdhdGNoZXIgPSBhZGRXYXRjaGVyO1xuXG5mdW5jdGlvbiB3YXRjaGVyVXBkYXRlICh2YWwpIHtcbiAgdHJ5e1xuICAgIHRoaXMuZGlyLnVwZGF0ZSh2YWwsIHRoaXMudmFsKTtcbiAgICB0aGlzLnZhbCA9IHZhbDtcbiAgfWNhdGNoKGUpe1xuICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gIH1cbn1cblxudXRpbHMuZXh0ZW5kKFdhdGNoZXIucHJvdG90eXBlLCB7XG4gIC8v6KGo6L6+5byP5omn6KGMXG4gIHVwZGF0ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAsIG5ld1ZhbFxuICAgICAgO1xuXG4gICAgbmV3VmFsID0gdGhpcy5kaXIuZ2V0VmFsdWUodGhpcy52bSk7XG5cbiAgICBpZihuZXdWYWwgJiYgbmV3VmFsLnRoZW4pIHtcbiAgICAgIC8vYSBwcm9taXNlXG4gICAgICBuZXdWYWwudGhlbihmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgd2F0Y2hlclVwZGF0ZS5jYWxsKHRoYXQsIHZhbCk7XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIHdhdGNoZXJVcGRhdGUuY2FsbCh0aGlzLCBuZXdWYWwpO1xuICAgIH1cbiAgfSxcbiAgdW53YXRjaDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy53YXRjaGVycy5mb3JFYWNoKGZ1bmN0aW9uKHdhdGNoZXJzKSB7XG4gICAgICBmb3IodmFyIGkgPSB3YXRjaGVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKHdhdGNoZXJzW2ldID09PSB0aGlzKXtcbiAgICAgICAgICBpZih0aGlzLnN0YXRlKXtcbiAgICAgICAgICAgIHdhdGNoZXJzW2ldLmRpci51bkxpbmsoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgICB3YXRjaGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpXG4gICAgdGhpcy53YXRjaGVycyA9IFtdO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBXYXRjaGVyXG4iXX0=
