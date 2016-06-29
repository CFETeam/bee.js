
var Event = {
  //监听自定义事件.
  $on: function(name, handler, context) {
    var ctx = context || this
      ;

    ctx._handlers = ctx._handlers || {};
    ctx._handlers[name] = ctx._handlers[name] || [];

    ctx._handlers[name].push({handler: handler, context: context, ctx: ctx});
  },
  $one: function (name, handler, context) {
    if(handler){
      handler.one = true;
    }
    return this.$on(name, handler, context);
  },
  //移除监听事件.
  $off: function(name, handler, context) {
    var ctx = context || this
      , handlers = ctx._handlers || {}
      ;

    if(name && handlers[name]){
      if(typeof handler === 'function'){
        for(var i = handlers[name].length - 1; i >=0; i--) {
          if(handlers[name][i].handler === handler){
            handlers[name].splice(i, 1);
          }
        }
      }else{
        handlers[name] = [];
      }
    }
  },
  //触发自定义事件.
  //该方法没有提供静态化的 context 参数. 如要静态化使用, 应该: `Event.$emit.call(context, name, data)`
  $emit: function(name, data) {
    var args = [].slice.call(arguments, 1)
      , handlers = this._handlers && this._handlers[name]
      ;

    if(handlers){
      for(var i = 0, item; item = handlers[i]; i++) {
        item.handler.apply(this, args);
        if(item.handler.one) {
          handlers.splice(i, 1);
          i--;
        }
      }
    }
  }
};

module.exports = Event;
