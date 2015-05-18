var test = require('tape');
var Bee = require('../');

test('$watch / $unwatch 基础', function(t) {
  var bee = new Bee;
  var _b;
  var fn = function(b) {
    if(bee.abc === undefined || bee.abc === null){
      t.equal(b, '', 'undefined 会被转成空字符')
    }else {
      t.equal(bee.abc, b)
    }
    _b = b;
  };

  bee.$watch('abc', fn)
  bee.$set('abc', 234)
  bee.$set('abc', null)
  bee.$set('abc', false)
  bee.$set('abc', {a: 'abc'})
  bee.$unwatch('abc', function(){})
  bee.$set('abc', '88')
  t.equal(_b, bee.abc, '没有成功移除')
  bee.$unwatch('abc', fn)
  bee.$set('abc', 'gg')
  t.notEqual(_b, bee.abc, '成功移除')
  t.end()
})

test('$watch / $unwatch 表达式', function(t) {
  var bee = new Bee;
  var _b;
  var fn = function(b) {
    t.equal(bee.abc + "abc" , b)

    _b = b;
  };

  bee.$watch('abc + "abc"', fn)
  bee.$set('abc', 234)
  bee.$set('abc', null)
  bee.$set('abc', false)
  bee.$set('abc', {a: 'abc'})
  bee.$unwatch('abc + "abc"', function(){})
  bee.$set('abc', '88')
  t.equal(_b, bee.abc + 'abc', '没有成功移除')
  bee.$unwatch('abc + "abc"', fn)
  bee.$set('abc', 'gg')
  t.notEqual(_b, bee.abc + 'abc', '成功移除')
  t.end()
})