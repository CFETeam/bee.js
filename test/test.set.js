var test = require('tape');
var Bee = require('../');

test('$set', function(t) {
  var bee = new Bee({$data: {a: {b: 2}, c: 3}});

  t.comment('简单类型')
  bee.$set('c', 4);
  t.equal(bee.$get('c'), 4)
  t.equal(bee.c, 4)

  bee.$set('a.c', 5)
  t.equal(bee.$get('a.c'), 5)
  t.equal(bee.a.c, 5)

  t.comment('对象')
  bee.$set('a', {d: 6})
  t.equal(bee.$get('a.d'), 6)
  t.equal(bee.a.d, 6)
  t.equal(bee.$get('a.b'), 2)
  t.equal(bee.a.b, 2)
  t.equal(bee.$get('a.c'), 5)
  t.equal(bee.a.c, 5)
  t.equal(Object.keys(bee.$get('a')).length, 3)

  t.comment('$set({e: 7})')
  bee.$set({e: 7});
  t.equal(bee.$get('e'), 7)
  t.equal(bee.e, 7)

  t.comment("$set('$data', {f: 8})")
  bee.$set('$data', {f: 8})
  t.equal(bee.$get('e'), 7)
  t.equal(bee.e, 7)
  t.equal(bee.$get('f'), 8)
  t.equal(bee.f, 8)


  t.end()
})