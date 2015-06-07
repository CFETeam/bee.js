var test = require('tape');
var Bee = require('../');
var $ = require('jquery')
if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('$replace', function(t) {
  var bee = new Bee('<div>{{c}}</div>', {$data: {a: {b: 2}, c: 3}});

  t.comment('替换简单类型')
  bee.$replace('c', 4);
  t.equal(bee.$get('c'), 4)
  t.equal(bee.c, 4)
  t.equal($(bee.$el).html() * 1, 4)

  bee.$set('a.c', 5)
  t.equal(bee.$get('a.c'), 5)
  t.equal(bee.a.c, 5)

  t.comment('替换简单对象')
  bee.$replace('a', {d: 6})
  t.equal(bee.$get('a.d'), 6)
  t.equal(bee.a.d, 6)
  t.notOk(bee.$get('a.b'))
  t.notOk(bee.a.b)
  t.notOk(bee.$get('a.c'))
  t.notOk(bee.a.c)
  t.equal(Object.keys(bee.$get('a')) + '', ['d'] + '')
  t.equal($(bee.$el).html(), '4')

  t.comment('$replace({e: 7})')
  bee.$replace({e: 7});
  t.notOk(bee.$get('a'))
  t.notOk(bee.a)
  t.equal(bee.$get('e'), 7)
  t.equal(bee.e, 7)

  t.comment('$replace("$data", {f: 8})')
  bee.$replace('$data', {f: 8})
  t.notOk(bee.$get('a'))
  t.notOk(bee.a)
  t.notOk(bee.$get('e'))
  t.notOk(bee.e)
  t.equal(bee.$get('f'), 8)
  t.equal(bee.f, 8)

  t.end()
})