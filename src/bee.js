"use strict";

var doc = require('./env.js').document
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
  , $el: this.$el || null
  , $tpl: this.$tpl || ''
  , $children: null
  , $filters: this.$filters || {}
  , $parent: null

    //私有属性/方法
  , _watchers: this._watchers || {}
  , _assignments: null//当前 vm 的别名
  };

  var el;

  //合并所有到当前空间下
  extend(this, defaults, props);
  extend(this, this.$data);

  tpl = tpl || this.$tpl;
  el = tplParse(tpl, this.$el);

  this.$el = el.el;
  this.$tpl = el.tpl;
  this.$children = el.children;

  walk.call(this, this.$el);

  this.$render(this.$data || {});
}

//静态属性
extend(Bee, Class, Dir, Com, {
  setPrefix: setPrefix
, prefix: ''
, doc: doc
, directives: {}
, components: {}
});


Bee.setPrefix('a-');

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

, $get: function(key) {
    return deepGet(key, this);
  }

  /**
   * ### bee.$set
   * 更新合并 `.data` 中的数据
   * @param {String} [key] 数据路径.
   * @param {AnyType|Object} val 数据内容. 如果数据路径被省略, 第一个参数是一个对象. 那么 val 将并入 .$data
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
      this.$data = key;
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

    var keys = parseKeyPath(keyPath);
    var watchers;

    while(keyPath = keys.join('.')) {
      watchers = this._watchers[keyPath];

      if (watchers) {
        for (var i = 0, l = watchers.length; i < l; i++) {
          watchers[i].update();
        }
      }

      if(isBubble) {
        keys.pop();
        //最终都冒泡到 $data
        if(!keys.length && keyPath !== '$data'){
          keys.push('$data');
        }
      }else{
        break;
      }
    }
    return this;
  }
, $watch: function (keyPath, callback) {
    if(callback) {
      addWatcher.call(this, {path: keyPath, update: callback, watch: true})
    }
  }
, $unwatch: function (keyPath, callback) {
    var watchers = this._watchers[keyPath] || [];

    for(var i = watchers.length - 1; i >= 0; i--){
      if(watchers[i].dir.update === callback){
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
      keyPaths = getKeyPaths.call(this, data);
      //keyPaths = Object.keys(data);//TODO 移至 .$update
    }else{
      //.$data 有可能是基本类型数据
      keyPaths = ['$data'];
    }
  }

  for(var i = 0, path; path = keyPaths[i]; i++){
    this.$update(path, true);
  }

}

//找出对象的所有 keyPath
//obj 不能递归
function getKeyPaths(obj, base) {
  var keyPaths = [];
  var keyPath;

  base = base || '';

  for(var key in obj) {
    if(obj.hasOwnProperty(key)) {
      keyPath = (base + '.' + key);
      if(!base) {
        keyPath = keyPath.slice(1);
      }
      //数组统一不深究?
      if(isObject(obj[key]) && !utils.isArray(obj[key])) {
        keyPaths = keyPaths.concat(getKeyPaths.call(this, obj[key], keyPath))
      }
      if(keyPath in this._watchers) {
        keyPaths.push(keyPath);
      }
    }
  }
  return keyPaths;
}

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

  if(checkAttr.call(this, el).terminal){
    return;
  }

  //template
  //meta element has content, too.
  if(el.content && el.content.nodeType) {
    walk.call(this, el.content);
    el.parentNode && el.parentNode.replaceChild(el.content, el);
    return;
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
    dir.__dirs = dirs;

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
  if(terminal) {
    result.terminal = true;
  }
  return result;
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
      //dir.node = doc.createComment(dir.type + ' = ' + dir.path);
      dir.node = doc.createTextNode('');
    }

    dir.el = dir.el.parentNode;
    dir.el.replaceChild(dir.node, el);
  }

  dir.link(this);

  if(dir.dirs) {
    //属性表达式
    dir.dirs.forEach(function(d) {
      addWatcher.call(this, extend(create(dir), d));
    }.bind(this));
  }else{
    addWatcher.call(this, dir);
  }
}

function addWatcher(dir) {
  if(dir.path && dir.watch) {
    return new Watcher(this, dir);
  }
}

function tplParse(tpl, target) {
  var el, children = null;
  if(isObject(target) && target.children) {
    children = [];
    for(var i = 0, childNode; childNode = target.children[i]; i++) {
      children.push(childNode);
    }
  }
  if(isObject(tpl)){
    if(target){
      el = target = isObject(target) ? target : doc.createElement(target);
      el.innerHTML = '';//清空目标对象
      target.appendChild(tpl);
    }else{
      el = tpl;
    }
    tpl = el.outerHTML;
  }else{
    el = isObject(target) ? target : doc.createElement(target || 'div');
    if(tpl) {
      el.innerHTML = tpl;
    }else{
      tpl = el.innerHTML;
    }
  }
  return {el: el, tpl: tpl, children: children};
}


Bee.version = '%VERSION';

module.exports = Bee;
