//component as directive
var utils = require('../utils.js');
var domUtils = require('../dom-utils')


module.exports = {
  priority: -10
, watch: false
, unLink: function() {
    this.component && this.component.$destroy()
  }
, link: function(vm) {
    var el = this.el;
    var cstr = vm.constructor;
    var comp, refName;
    var dirs = [], $data = {};
    var Comp = cstr.getComponent(this.path)

    if(Comp) {

      //TODO
      if(Comp === cstr) {
        return;
      }

      dirs = this.dirs;

      dirs = dirs.filter(function (dir) {
        if(dir.type === 'ref') {
          refName = dir.path;
        }
        return dir.type == 'attr' || dir.type == 'with';
      });

      dirs.forEach(function (dir) {
        var curPath, comPath;

        curPath = dir.path;
        if(dir.type === 'with') {
          //comPath = '$data'
          utils.extend($data, vm.$get(curPath))
        }else{
          comPath = dir.dirName;
          $data[comPath] = vm.$get(curPath);
        }

        //监听父组件更新, 同步数据
        vm.$watch(curPath, function (val) {
          if(comp){
            val = dir.textMap ? dir.textMap.join('') : val;
            comPath ? comp.$set(comPath, val) : comp.$set(val);
          }
        })
      });

      this.component = comp = new Comp({
        $target: el,
        //$root: vm.$root,
        $data: utils.extend({}, Comp.prototype.$data, $data, domUtils.getAttrs(el))
      });

      if(refName) {
        vm.$refs[refName] = comp;
      }

      //直接将component 作为根元素时, 同步跟新容器 .$el 引用
      if(vm.$el === el) {
        vm.__ref = comp;
        vm.$el = comp.$el;
      }
      return comp;
    }else{
      console.warn('Component: ' + this.path + ' not defined! Ignore');
    }
  }
};
