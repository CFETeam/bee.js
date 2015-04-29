//component as directive

module.exports = {
  priority: -10
, watch: false
, link: function(vm) {
    var el = this.el;
    var comName = this.path;
    var components = vm.constructor.components;
    var Comp, comp;
    var dirs = [], $data = {};
    var attrs;

    if(el.__checked) {
      return;
    }
    if(comName in components) {

      dirs = this.__dirs;

      dirs = dirs.filter(function (dir) {
        return dir.type == 'attr'
      });

      attrs = el.attributes;

      for(var i = attrs.length - 1; i >= 0; i--) {
        $data[attrs[0].nodeName] = attrs[0].value;
      }

      dirs.forEach(function (dir) {
        dir.dirs.forEach(function (token) {
          vm.$watch(token.path, function() {
            var val = dir.el.getAttribute(dir.nodeName);
            if(comp) {
              comp.$set(dir.nodeName, val);
            }else{
              $data[dir.nodeName] = val;
            }
          })
        });
      });

      el.__checked = true;

      Comp = components[comName];
      comp = new Comp({$el: el, $data: $data});
      return true;
    }else{
      console.warn('Component: ' + comName + ' not defined! Ignore');
    }
  }
};