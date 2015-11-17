var test = require('tape');
var Bee = require('../../');
var $ = require('jquery')
if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('b-ref', function(t) {
  var Test = Bee.tag('test', {});
  var tpl = '<span><span b-if="flag" b-ref="span"><div b-component="test" b-ref="test"></div></span></span>'

  var bee = new Bee(tpl, {$data: {flag: true}})

  t.equal(bee.$refs.span.nodeName, 'SPAN', 'reference to an element')
  t.ok(bee.$refs.test instanceof Test, 'reference to a component')

  t.end();
})

test('b-ref in repeat', function(t) {
  var Test = Bee.tag('test', { })

  var bee = new Bee('<span><span b-repeat="item in list" b-ref="list"><div b-component="test" b-ref="test"></div></span></span>', {
    $data: {
      list: [{}]
    }
  })

  t.ok(Array.isArray(bee.$refs.list))
  t.equal(bee.$refs.list.length, bee.list.length)
  t.ok(bee.$refs.list[0].$refs.test instanceof Test)
  bee.list.push({})
  t.equal(bee.$refs.list.length, bee.list.length)

  t.end()
})
