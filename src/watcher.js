"use strict";

var parse = require('./parse.js').parse
  , evaluate = require('./eval.js')
  , utils = require('./utils.js')
  , Class = require('./class.js')
  ;

var extend = utils.extend;

//表达式解析
function exParse(path) {
  var ast = {}
    , summary
    ;

  try{
    ast = parse(path, this.dir.type);
  }catch(e) {
    e.message = 'SyntaxError in "' + path + '" | ' + e.message;
    console.error(e);
  }

  summary = evaluate.summary(ast);
  extend(this.dir, summary);
  extend(this, summary);
  this.vm._assignments = this.assignments;
  this.ast = ast;
};

function Watcher(vm, dir) {
  var path, scope = vm, curVm, localKey, willUpdate;

  this.dir = dir;
  this.vm = vm;

  this.val = NaN;

  this.state = Watcher.STATE_READY;

  exParse.call(this, dir.path);

  for(var i = 0, l = this.paths.length; i < l; i++) {
    path = this.paths[i];
    localKey = utils.parseKeyPath(path)[0];

    while(scope) {
      curVm = scope;
      if(scope._assignments && scope._assignments.indexOf(localKey) > -1 || ( localKey in scope.$data )) {
        break;
      }else {
        //不在当前
        willUpdate = true;//对于在父级作用域的表达式应立即执行
        scope = scope._parent;
      }
    }

    curVm.$watchers[path] = vm.$watchers[path] || [];
    curVm.$watchers[path].push(this);
  }

  //没有变量的表达式
  if(!this.locals.length || willUpdate) {
    this.update();
  }
}

//TODO
extend(Watcher, {
  STATE_READY: 0
  , STATE_CALLED: 1
}, Class);

function watcherUpdate (val) {
  try{
    this.dir.update(val, this.val);
    this.val = val;
  }catch(e){
    console.error(e);
  }
}

extend(Watcher.prototype, {
  //表达式执行
  update: function() {
    var that = this
      , newVal
      , scope = this.vm
      ;

    newVal = this.getValue(scope);

    if(newVal && newVal.then) {
      //a promise
      newVal.then(function(val) {
        watcherUpdate.call(that, val);
      });
    }else{
      watcherUpdate.call(this, newVal);
    }

    this.state = Watcher.STATE_CALLED;
  }
, getValue: function(vals) {
    var dir = this.dir
      , val
      , filters = extend({}, this.vm.$filters, function(a, b) {  return b.bind(dir); })
      ;

    try{
      val = evaluate.eval(this.ast, {locals: vals, filters: filters});
    }catch(e){
      val = '';
      console.error(e);
    }
    if(utils.isUndefined(val) || val === null) {
      val = '';
    }
    return val;
  }
});

module.exports = Watcher