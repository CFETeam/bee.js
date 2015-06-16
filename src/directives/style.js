"use strict";

//样式指令
var utils = require('../utils')
var camelReg = /([A-Z])/g;

//默认单位为 px 的属性
var pixelAttrs = [
  'width','height','min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-left', 'margin-bottom',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'top', 'left', 'right', 'bottom'
]

module.exports = {
  update: function(styles) {
    var el = this.el;
    var styleStr = '';
    var dashKey, val;

    if(typeof styles === 'string') {
      styleStr = styles;
    }else {
      for (var key in styles) {
        val = styles[key];

        //marginTop -> margin-top. 驼峰转连接符式
        dashKey = key.replace(camelReg, function (upperChar) {
          return '-' + upperChar.toLowerCase();
        });

        if (pixelAttrs.indexOf(dashKey) >= 0 && utils.isNumeric(val)) {
          val += 'px';
        }
        if(!utils.isUndefined(val)){
          styleStr += dashKey + ': ' + val + '; ';
        }
      }
    }
    if(el.style.setAttribute){
      //老 IE
      el.style.setAttribute('cssText', styleStr);
    }else{
      el.setAttribute('style', styleStr);
    }
  }
};
