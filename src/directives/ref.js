
var utils = require('../utils')

module.exports = {
  watch: false
, priority: -2 // ref 应该在 component 之后
, unLink: function() {
    if(utils.isArray(this.ref)) {
      this.ref.splice(this.vm.$index, 1)
    }else{
      this.vm.$refs[this.path] = null;
    }
  }
, link: function() {
    var vm = this.vm
    //在 `repeat` 元素上的 `ref` 会指向匿名 `viewmodel`
    if(vm.__repeat){
      if(!vm.$index) {
        vm.$parent.$refs[this.path] = [];
      }
      this.ref = vm.$parent.$refs[this.path]
      this.ref[vm.$index] = vm;
    }else{
      vm.$refs[this.path] = this.el.bee || this.el;
    }
  }
}
