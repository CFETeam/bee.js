"use strict";

var domUtils = require('../dom-utils')

module.exports = {
  replace: true
, anchor: true
, update: function(content) {
    var nodes = this.getNodes()
    var parent = this.anchors.end.parentNode;
    var contents = domUtils.createNodes(content)
    nodes.forEach(function(node) {
      parent.removeChild(node);
    })
    contents.forEach(function(node) {
      parent.insertBefore(node, this.anchors.end)
    }.bind(this))
  }
}