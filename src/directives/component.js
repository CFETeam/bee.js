//component as directive
var utils = require('../utils.js');

module.exports = {
  priority: -10
, watch: false
, terminal: true
, link: function(vm) {
    var el = this.el;
    var comName = this.path;
    var components = vm.constructor.components;
    var Comp, comp;
    var dirs = [], $data = {};
    var attrs;

    if(comName in components) {

      dirs = this.__dirs;

      dirs = dirs.filter(function (dir) {
        return dir.type == 'attr' || dir.type == 'with';
      });

      attrs = el.attributes;

      //普通属性
      for(var i = attrs.length - 1; i >= 0; i--) {
        $data[attrs[0].nodeName] = attrs[0].value;
      }

      dirs.forEach(function (dir) {
        var withMap = [];
        //属性表达式
        if(dir.dirs) {
          withMap = dir.dirs.map(function (token) {
            return {path: token.path, componentPath: dir.nodeName};
          });
        }else{
          //a-with directive
          withMap = dir.locals.map(function(local) {
            return {path: local, componentPath: local};
          });
        }

        //监听父组件更新
        withMap.forEach(function (pathConfig) {
          vm.$watch(pathConfig.path, function (val) {
            if (comp) {
              comp.$set(pathConfig.componentPath, val);
            } else {
              if(pathConfig.componentPath === '$data'){
                $data = val
              }else {
                $data[pathConfig.componentPath] = val;
              }
            }
          })
        });
      });

      Comp = components[comName];
      comp = new Comp({$target: el, $data: utils.extend({}, Comp.prototype.$data, $data)});

      //直接将component 作为根元素时, 同步跟新容器 .$el 引用
      if(vm.$el === el) {
        vm.$el = comp.$el;
      }
      return true;
    }else{
      console.warn('Component: ' + comName + ' not defined! Ignore');
    }
  }
};