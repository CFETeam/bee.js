"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  ;

module.exports = {
  terminal: true
, replace: true
, link: function(vm) {
    var that = this
      , ant
      ;

    ant = vm.$root.$ant;

    this.pName = this.path;
    this.vm = vm;
    this.path = '';

    ant.setPartial({
      name: this.pName
    , target: function(el) { that.el.insertBefore(el, that.node) }
    , escape: this.escape
    , path: vm.$getKeyPath()
    , context: this
    });
  }
};
