//ES5 and other staff shim for beejs

if(!Array.prototype.forEach){
  Array.prototype.forEach = function(fn, scope) {
    for(var i = 0, len = this.length; i < len; ++i) {
      if (i in this) {
        fn.call(scope, this[i], i, this);
      }
    }
  };
}

if(!Array.isArray){
  Array.isArray = function(val) {
    return ({}).toString.call(val) === '[object Array]'
  }
}

if(!String.prototype.trim) {
  String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g,'');
  };
}

if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (obj, start) {
    for (var i = (start || 0); i < this.length; i++) {
      if (this[i] === obj) {
        return i;
      }
    }
    return -1;
  }
}

if (!('lastIndexOf' in Array.prototype)) {
  Array.prototype.lastIndexOf= function(find, i /*opt*/) {
    if (i===undefined) i= this.length-1;
    if (i<0) i+= this.length;
    if (i>this.length-1) i= this.length-1;
    for (i++; i-->0;) /* i++ because from-argument is sadly inclusive */
      if (i in this && this[i]===find)
        return i;
    return -1;
  };
}

if (!Array.prototype.filter) {
  Array.prototype.filter = function(fun /*, thisArg */)
  {
    "use strict";

    if (this === void 0 || this === null)
      throw new TypeError();

    var t = Object(this);
    var len = t.length >>> 0;
    if (typeof fun !== "function") {
      throw new TypeError();
    }

    var res = [];
    var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
    for (var i = 0; i < len; i++) {
      if (i in t) {
        var val = t[i];

        // NOTE: Technically this should Object.defineProperty at
        //       the next index, as push can be affected by
        //       properties on Object.prototype and Array.prototype.
        //       But that method's new, and collisions should be
        //       rare, so use the more-compatible alternative.
        if (fun.call(thisArg, val, i, t)) {
          res.push(val);
        }
      }
    }

    return res;
  };
}

if (!Array.prototype.map) {
  Array.prototype.map = function(callback, thisArg) {

    var T, A, k;

    if (this == null) {
      throw new TypeError(" this is null or not defined");
    }

    var O = Object(this);
    var len = O.length >>> 0;

    if ({}.toString.call(callback) != "[object Function]") {
      throw new TypeError(callback + " is not a function");
    }

    if (thisArg) {
      T = thisArg;
    }

    A = new Array(len);

    k = 0;

    while(k < len) {

      var kValue, mappedValue;

      if (k in O) {

        kValue = O[ k ];

        mappedValue = callback.call(T, kValue, k, O);

        A[ k ] = mappedValue;
      }
      k++;
    }

    return A;
  };
}

if (!Function.prototype.bind) {
  Function.prototype.bind = function (oThis) {
    if (typeof this !== "function") {
      // closest thing possible to the ECMAScript 5 internal IsCallable function
      throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
    }

    var aArgs = Array.prototype.slice.call(arguments, 1), 
        fToBind = this, 
        fNOP = function () {},
        fBound = function () {
          return fToBind.apply(this instanceof fNOP && oThis
                                 ? this
                                 : oThis,
                               aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

if (!Object.keys) {
  Object.keys = function(o) {
    if (o !== Object(o)){
      throw new TypeError('Object.keys called on a non-object');
    }
    var k=[], p;
    for (p in o) {
      if (Object.prototype.hasOwnProperty.call(o,p)) {
        k.push(p);
      }
    }
    return k;
  }
}


var noop = function() {};
if (!window.console) {
  window.console = {
    log: noop
  , info: noop
  , debug: noop
  , warn: noop
  , error: noop
  }
}