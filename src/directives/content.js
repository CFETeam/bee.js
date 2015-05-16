"use strict";

module.exports = {
  replace: true
, anchor: true
  //content: dom 对象
, update: function(content) {
    var nodes = this.getNodes()
    var parent = this.anchors.end.parentNode;
    nodes.forEach(function(node) {
      parent.removeChild(node);
    })
    parent.insertBefore(content, this.anchors.end)
  }
}