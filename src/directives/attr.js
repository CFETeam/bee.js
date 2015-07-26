"use strict";

//属性指令

var utils = require('../utils.js');

module.exports = {
  link: function() {
    if(this.dirName === this.type) {//attr binding
      this.attrs = {};
    }else {
      //属性表达式默认将值置空, 防止表达式内变量不存在
      this.update('')
    }
  }
, update: function(val) {
    var el = this.el;
    var newAttrs = {};
    var textMap = this.textMap

    //b-attr
    if(this.dirName === this.type) {
      for(var attr in val) {
        setProperty(el, attr, val[attr]);

        delete this.attrs[attr];

        newAttrs[attr] = true;
      }

      //移除不在上次记录中的属性
      for(var attr in this.attrs) {
        removeProperty(el, attr);
      }
      this.attrs = newAttrs;
    }else{
      if(this.conditional) {
        val ? setProperty(el, this.dirName, val) : removeProperty(el, this.dirName);
      }else{
        textMap[this.position] = val;
        setProperty(el, this.dirName, textMap.length > 1 ? textMap.join('') : textMap[0]);
      }
    }
  }
};

function setProperty(el, key, val) {
  var component = el.bee
  if(component && !component.__repeat) {
    component.$set(key, val)
  }else{
    setAttr(el, key, val)
  }
}

function removeProperty(el, key, undef) {
  var component = el.bee
  if(component && !component.__repeat) {
    component.$set(key, undef)
  }else{
    el.removeAttribute(attr);
  }
}


//IE 浏览器很多属性通过 `setAttribute` 设置后无效.
//这些通过 `el[attr] = value` 设置的属性却能够通过 `removeAttribute` 清除.
function setAttr(el, attr, val){
  try{
    if(((attr in el) || attr === 'class')){
      if(attr === 'style' && el.style.setAttribute){
        el.style.setAttribute('cssText', val);
      }else if(attr === 'class'){
        el.className = val;
      }else{
        el[attr] = typeof el[attr] === 'boolean' ? true : val;
      }
    }
  }catch(e){}
  //chrome setattribute with `{{}}` will throw an error
  el.setAttribute(attr, val);
}
