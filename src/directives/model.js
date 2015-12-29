"use strict";

var utils = require('../utils.js')
  , hasToken = require('../token.js').hasToken
  , events = require('../event-bind.js')
  , checkBinding = require('../check-binding')
  ;


module.exports = {
  teminal: true
, priority: -2
, link: function() {
    var keyPath = this.path;
    var vm = this.vm;

    if(!keyPath) { return false; }

    var comp = this.el
      , ev = 'change'
      , attr, compVal
      , value = attr = 'value'
      , isSetDefaut = utils.isUndefined(vm.$get(keyPath))//界面的初始值不会覆盖 model 的初始值
      , crlf = /\r\n/g//IE 8 下 textarea 会自动将 \n 换行符换成 \r\n. 需要将其替换回来

        //更新组件
      , update = function(val) {
          if(val === 0 && comp.type !== 'checkbox') { val = '0' }
          var newVal = (val || '') + ''
            , val = comp[attr]
            ;
          val && val.replace && (val = val.replace(crlf, '\n'));
          if(newVal !== val){ comp[attr] = newVal; }
        }

        //更新 viewModel
      , handler = function() {
          var val = comp[value];

          val.replace && (val = val.replace(crlf, '\n'));
          vm.$set(keyPath, val);
        }
      , callHandler = function(e) {
          if(e && e.propertyName && e.propertyName !== attr) {
            return;
          }
          handler.apply(this, arguments)
        }
      , ie = utils.ie
      ;

    if(comp.bee) {
      // 组件的双向绑定
      comp = comp.bee;
      value = comp.$valuekey;
      if(value) {
        update = function(val) {
          comp.$replace(value, val)
        };
        handler = function() {
          vm.$replace(keyPath, comp.$get(value))
        }
        comp.$watch(value, function(val, oldValue) {
          val !== oldValue && handler()
        })
        compVal = vm.$get(keyPath)

        //默认使用父组件的对应值同步自组件, 如果父组件对应 key 的值是 `undefined` 则反向同步
        if(utils.isUndefined(compVal)) {
          handler()
        }else{
          update(compVal)
        }
      }
    }else{
      //优先解析内部内容
      vm.__links = vm.__links.concat(checkBinding.walk.call(vm, comp.childNodes));

      //HTML 原生控件的双向绑定
      switch(comp.tagName) {
        default:
          value = attr = 'innerHTML';
          //ev += ' blur';
        case 'INPUT':
        case 'TEXTAREA':
          switch(comp.type) {
            case 'checkbox':
              value = attr = 'checked';
              //IE6, IE7 下监听 propertychange 会挂?
              if(ie) { ev += ' click'; }
            break;
            case 'radio':
              attr = 'checked';
              if(ie) { ev += ' click'; }
              update = function(val) {
                comp.checked = comp.value === val + '';
              };
              isSetDefaut = comp.checked;
            break;
            default:
              if(!vm.$lazy){
                if('oninput' in comp){
                  ev += ' input';
                }
                //IE 下的 input 事件替代
                if(ie) {
                  ev += ' keyup propertychange cut';
                }
              }
            break;
          }
        break;
        case 'SELECT':
          if(comp.multiple){
            handler = function() {
              var vals = [];
              for(var i = 0, l = comp.options.length; i < l; i++){
                if(comp.options[i].selected){ vals.push(comp.options[i].value) }
              }
              vm.$replace(keyPath, vals);
            };
            update = function(vals){
              if(vals && vals.length){
                for(var i = 0, l = comp.options.length; i < l; i++){
                  comp.options[i].selected = vals.indexOf(comp.options[i].value) !== -1;
                }
              }
            };
          }else{
            if(comp.hasAttribute && comp.hasAttribute('data-forcesync') || ('data-forcesync' in comp)) {
              update = function(val) {
                if(val === 0 && comp.type !== 'checkbox') { val = '0' }
                var newVal = (val || '') + ''
                  , val = comp[attr]
                  ;
                val && val.replace && (val = val.replace(crlf, '\n'));
                if(newVal !== val){
                  for(var i = 0, l = comp.options.length; i < l; i++){
                    if(comp.options[i].value === newVal + '') {
                      comp.options[i].selected = true;
                      comp[attr] = newVal;
                      break;
                    }
                  }
                  if(i == l) {
                    handler()
                  }
                }
              }
            }
          }
          isSetDefaut = isSetDefaut && !hasToken(comp[value]);
        break;
      }

      ev.split(/\s+/g).forEach(function(e){
        events.removeEvent(comp, e, callHandler);
        events.addEvent(comp, e, callHandler);
      });
      //用组件内部初始化值更新对应 model 的值
      if(comp[value] && isSetDefaut){
         handler();
      }
    }

    this.update = update;
  }
};
