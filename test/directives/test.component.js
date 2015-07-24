var test = require('tape');
var Bee = require('../../');
var $ = require('jquery')

if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('b-tag as alias of b-component', function(t) {
  t.equal(typeof Bee.component, 'function')
  t.equal(Bee.component, Bee.tag)

  var Ant = Bee.extend({})

  Bee.tag('ant', Ant)

  t.equal(Bee.getComponent('ant'), Ant)

  t.end()
})

test('custom tag as alias of b-component', function(t) {
  var tpl = '<div data-role="test"></div>'

  var Ant = Bee.extend({
    $tpl: tpl
  })

  Bee.tag('test', Ant)

  t.equal(new Bee('<div><test></test></div>').$el.innerHTML, tpl)
  t.equal(new Bee('<div><div b-tag="test"></div></div>').$el.innerHTML, tpl)
  t.equal(new Bee('<div><div b-component="test"></div></div>').$el.innerHTML, tpl)

  t.end()
})
