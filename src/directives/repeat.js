"use strict";

var doc = require('../env.js').document
  , utils = require('../utils.js')
  ;

module.exports = {
  priority: 1000
, anchor: true
, terminal: true
, link: function(vm) {

    this.vm = vm;

    this.cstr = vm.constructor;

    this.vms = [];
    this.curArr = [];
    this.els = [];

    this.el.parentNode.removeChild(this.el);
  }
, update: function(items) {
    var curArr = this.curArr;
    var parentNode = this.anchors.end.parentNode;
    if(utils.isArray(items)) {

      //删除元素
      arrDiff(curArr, items).forEach(function(item) {
        var pos = curArr.indexOf(item)
        curArr.splice(pos, 1)
        this.vms.splice(pos, 1)
        parentNode.removeChild(this.els[pos])
        this.els.splice(pos, 1)

      }.bind(this))

      items.forEach(function(item, i) {
        var pos = items.indexOf(item, i)
          , oldPos = curArr.indexOf(item, i)
          , vm, el
          , itemData = {}
          ;

        pos < 0 && (pos = items.lastIndexOf(item, i));
        oldPos < 0 && (oldPos = curArr.lastIndexOf(item, i));

        //新增元素
        if(oldPos < 0) {
          //assign in arr
          for(var a = 0; a < this.assignments.length; a++) {
            itemData[this.assignments[0]] = item;
          }
          el = this.el.cloneNode(true)

          //TODO 使用 item 而不是 itemData
          vm = this.vms[pos]= new this.cstr(el, {$data: item, _parent: this.vm, _assignments: this.assignments});
          parentNode.insertBefore(vm.$el, this.els[pos] || this.anchors.end)
          this.els.splice(pos, 0, el)
          curArr.splice(pos, 0, item)
        }else {

          //调序
          if (pos !== oldPos) {
            parentNode.insertBefore(this.els[oldPos], this.els[pos] || this.anchor.end)
            parentNode.insertBefore(this.els[pos], this.els[oldPos + 1] || this.anchor.end)
            this.vms[oldPos] = [this.vms[pos], this.vms[pos] = this.vms[oldPos]][0]
            this.els[oldPos] = [this.els[pos], this.els[pos] = this.els[oldPos]][0]
            curArr[oldPos] = [curArr[pos], curArr[pos] = curArr[oldPos]][0]
          }
        }
      }.bind(this))
    }else{
      //TODO 普通对象的遍历
    }
  }
};


function arrDiff(arr1, arr2) {
  return arr1.filter(function(el) {
    return arr2.indexOf(el) < 0
  })
}

