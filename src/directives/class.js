"use strict";

module.exports = {
  link: function() {
    this.initClass = this.el.className || ''
    this.keys = {};
  },
  update: function(classes) {
    var classStr = this.initClass
      , watcher = this.watcher
      ;

    if(typeof classes === 'string') {
      if(classes) {
        classStr += ' ' + classes;
      }
    }else{
      for(var key in classes) {
        if(!this.keys[key]) {
          this.keys[key] = true;
          //对象的键值默认不在监听范围之内, 这里手动监听
          this.vm.$watch(key, function() {
            watcher.update()
          })
        }
        if(this.vm.$get(key)) {
          classStr += ' ' + classes[key]
        }
      }
    }
    this.el.className = classStr;
  }
};
