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
 * @param  {Function} cstr 组件构造函数
 * @param  {Bee} context 当前实例的上下文实例
 * @return {directeve[]}      `el` 上所有的指令
 */
function getDirs(el, cstr, context){
  var attr, attrName, dirName, proto
    , dirs = [], dir
    , parent = el.parentNode
    , nodeName = el.nodeName.toLowerCase()
    , directives = cstr.directives
    , prefix = cstr.prefix
    ;

  //对于自定义标签, 将其转为 directive
  if(cstr.getComponent(nodeName, context)) {
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
        origin.dirName = attrName ;
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
