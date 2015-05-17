"use strict";

module.exports = {
  replace: true
, anchor: true
  //content: dom 对象
  //TODO 接收任意类型参数转成 dom 对象?
, update: function(content) {
    var nodes = this.getNodes()
    var parent = this.anchors.end.parentNode;
    nodes.forEach(function(node) {
      parent.removeChild(node);
    })
    content && parent.insertBefore(content, this.anchors.end)
  }
}