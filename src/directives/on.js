"use strict";

//事件监听

var eventBind = require('../event-bind.js');

//TODO 移除时的情况
module.exports = {
  link: function(vm) {
    //this.events = {};
    this.vm = vm;
  }
, update: function(events) {
    for(var name in events) {
      eventBind.addEvent(this.el, name, events[name].bind(this.vm));
    }
    //this.events = events;
  }
}