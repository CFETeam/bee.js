"use strict";

var checkBinding = require('../check-binding')
  , domUtils = require('../dom-utils')
  , doc = require('../env').document
  , directive = require('../directive')

module.exports = {
  anchor: true
, priority: 900
, terminal: true
, sub: true
, link: function() {
    var endDir = this.vm.constructor.prefix + 'if-end';

    this.watchers = [];

    if(this.subType === 'start') {
      directive.fixRange(this.el, endDir, this.anchors)
    }
    this.frag = doc.createDocumentFragment()
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

    if(nodes) {
      for(var i = 0, l = nodes.length; i < l; i++) {
        this.frag.appendChild(nodes[i]);
      }
    }
    this.watchers.forEach(function(watcher) {
      watcher._hide = true;
    })
  }
};
