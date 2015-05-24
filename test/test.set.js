var test = require('tape');
var Bee = require('../');
var $ = require('jquery')
if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

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

  t.test('$set in repeat', function(t) {
    var tpl = '<ul><li b-repeat="item in list"><input type="checkbox" b-model="item.checked"/>{{test(name)}}</li></ul>'
    var newName = 'bee'
    var bee = new Bee({
      $tpl: tpl,
      $data: {
        name: newName,
        list: [{}]
      },
      test: function(name)  {
        t.equal(name, newName)
        t.notEqual(this, bee)
        var checked = !this.checked
        this.$set('item.checked', checked)
        t.equal(this.$get('item.checked'), checked)
        t.equal(this.$data.checked, checked)
        t.equal(this.checked, checked)
      }
    });

    newName = 'ant'
    bee.$set('name', newName)
    t.end()
  })

  t.end()
})