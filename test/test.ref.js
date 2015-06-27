var test = require('tape');
var Bee = require('../');
var $ = require('jquery')
if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('b-ref', function(t) {
  var Test = Bee.tag('test', {});
  var tpl = '<span><span b-if="flag" b-ref="span"><test b-ref="test"></test></span></span>'

  var bee = new Bee(tpl, {$data: {flag: true}})

  t.equal(bee.$refs.span.nodeName, 'SPAN', 'reference to an element')
  t.ok(bee.$refs.test instanceof Test, 'reference to a component')

  bee.$set('flag', false)

  t.notOk(bee.$refs.test)

  t.end();
})
