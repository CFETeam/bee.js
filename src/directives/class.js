"use strict";

module.exports = {
  link: function() {
    this.initClass = this.el.className || ''
    this.keys = {};
  },
  update: function(classes) {
    var classStr = this.initClass
      , watcher = this.watcher
      , key
      ;

    //class 指令支持 className 字符串或对象 {className: 'key'} 两种形式
    if(typeof classes === 'string') {
      if(classes) {
        classStr += ' ' + classes;
      }
    }else{
      for(var className in classes) {
        key = classes[className]

        if(!this.keys[key]) {//缓存对象中出现的 key
          this.keys[key] = true;
          //对象的键值默认不在监听范围之内, 这里手动监听
          this.vm.$watch(key, function() {
            watcher.update()
          })
        }
        if(this.vm.$get(key)) {
          classStr += ' ' + className
        }
      }
    }
    this.el.className = classStr;
  }
};
