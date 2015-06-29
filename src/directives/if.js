"use strict";

var checkBinding = require('../check-binding')
  , domUtils = require('../dom-utils')
  , doc = require('../env').document

module.exports = {
  anchor: true
, terminal: true
, sub: true
, link: function() {
    var end = this.el;
    var endDir = this.vm.constructor.prefix + 'if-end';
    var parent;

    this.watchers = [];

    if(this.subType === 'start') {
      while(end = end.nextSibling) {
        if(domUtils.hasAttr(end, endDir)){
          end.removeAttribute(endDir)
          break;
        }
      }
      if(end) {
        parent = end.parentNode

        if(end.nextSibling) {
          parent.insertBefore(this.anchors.end, end.nextSibling)
        }else{
          parent.appendChild(this.anchors.end)
        }
      }else{
        console.error('expect: ' + endDir + ', but not found!')
      }
    }
    this.frag = doc.createDocumentFragment()
    this.remove();
    this.watchers = checkBinding.walk.call(this.vm, this.frag);
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
    this.watchers.forEach(function(watcher) {
      watcher.hide = false;
      watcher.update()
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
      watcher.hide = true;
    })
    // this.watcher = [];
  }
};
