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
  t.equal(bee.$get('a.b'), undefined, 'replaced')
  t.equal(bee.a.b, undefined, 'replaced')
  t.equal(bee.$get('a.c'), undefined, 'replaced')
  t.equal(bee.a.c, undefined, 'replaced')
  t.equal(Object.keys(bee.$get('a')).length, 1)

  t.comment('$set({e: 7})')
  bee.$set({e: 7});
  t.equal(bee.$get('e'), 7)
  t.equal(bee.e, 7)

  t.comment("$set('$data', {f: 8})")
  bee.$set('$data', {f: 8})
  t.equal(bee.$get('e'), undefined, 'replaced')
  t.equal(bee.e, undefined, 'replaced')
  t.equal(bee.$get('f'), 8)
  t.equal(bee.f, 8)

  t.test('$set in repeat', function(t) {
    var tpl = '<ul><li b-repeat="item in list"><input type="checkbox" b-model="item.checked"/>{{test(name, this)}}</li></ul>'
    var newName = 'bee'
    var bee = new Bee({
      $tpl: tpl,
      $data: {
        name: newName,
        list: [{}]
      },
      test: function(name, repeatVm)  {
        t.equal(name, newName)
        t.notEqual(repeatVm, bee)
        var checked = !repeatVm.checked
        repeatVm.$set('item.checked', checked)
        t.equal(repeatVm.$get('item.checked'), checked, 'item.checked')
        t.equal(repeatVm.$data.checked, checked)
        t.equal(repeatVm.checked, checked)
      }
    });

    newName = 'ant'
    bee.$set('name', newName)

    var tpl2 = '<ul><li b-repeat="item in list"><input type="checkbox" b-model="item"/>{{test(name, this)}}</li></ul>'
    newName = 'bee';
    var bee2 = new Bee({
      $tpl: tpl,
      $data: {
        name: newName,
        list: [true, false]
      },
      test: function(name, repeatVm) {
        t.equal(name, newName)
        t.notEqual(repeatVm, bee2)
        var checked = !repeatVm.$data
        repeatVm.$set('item', checked)
        t.equal(repeatVm.$get('item'), checked)
        t.equal(repeatVm.$data, checked)
      }
    })
    newName = 'ant';
    bee2.$set('name', newName)

    t.end()
  })

  t.end()
})
