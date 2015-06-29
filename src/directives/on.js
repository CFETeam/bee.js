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
