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
