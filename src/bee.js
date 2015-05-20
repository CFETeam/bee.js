"use strict";

var doc = require('./env.js').document
  , utils = require('./utils.js')
  , Event = require('./event.js')
  , Class = require('./class.js')
  , Dir = require('./directive.js')
  , Com = require('./component.js')
  , Watcher = require('./watcher.js')

  , dirs = require('./directives')
  , domUtils = require('./dom-utils.js')
  , checkBinding = require('./check-binding.js')
  ;


var isObject = utils.isObject
  , isUndefined = utils.isUndefined
  , isPlainObject = utils.isPlainObject
  , parseKeyPath = utils.parseKeyPath
  , deepSet = utils.deepSet
  , deepGet = utils.deepGet
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

  //保持对传入属性的引用
  for(var propKey in props) {
    if((propKey in mergeProps) && isObject(props[propKey])) {
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

  this.$content && checkBinding.walk.call(this.$root, this.$content);
  checkBinding.walk.call(this, this.$el);

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
})}, Dir, Com, {
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
      if(isObject(key)) {
        extend(true, this.$data, key);
        extend(true, this, key);
      }else{
        this.$data = key;
      }
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
      if(isObject(key)) {
        Object.keys(this.$data).forEach(function(key) {
          delete this[key];
        }.bind(this))
        extend(this, key);
      }
      this.$data = key;
    }else{
      hasKey = true;
      keys = parseKeyPath(key);
      if(keys[0] !== '$data') {
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
      Watcher.addWatcher.call(this, new Dir('watcher', {path: keyPath, update: update}))
    }
  }
, $unwatch: function (keyPath, callback) {
    Watcher.unwatch(this, keyPath, callback)
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

Bee.version = '%VERSION';

module.exports = Bee;
