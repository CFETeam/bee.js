var test = require('tape');
var Bee = require('../../');
var utils = require('../../src/utils')
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

  utils.oldIE > 8 && t.equal(new Bee('<div><test></test></div>').$el.innerHTML, tpl)
  t.equal(new Bee('<div><div b-tag="test"></div></div>').$el.innerHTML.toLowerCase(), tpl)
  t.equal(new Bee('<div><div b-component="test"></div></div>').$el.innerHTML.toLowerCase(), tpl)

  t.end()
})

test('properties', function(t) {
  var Ant = Bee.extend({
    $tpl: '<div>{{a}}</div>'
  })

  Bee.tag('test', Ant)

  var bee = new Bee('<div>\
      <div b-ref="test" b-tag="test" b="{{o}}" s="s: {{s}}" a="123" a-b="234"></div>\
    </div>');

  var test = bee.$refs.test

  t.equal(test.a, '123', 'static property')
  t.equal(test.aB, '234', 'hyphen to camel')
  t.notOk(test['a-b'])
  t.equal(test.$el.innerHTML, '123')

  t.notOk(test['b-ref'])
  t.notOk(test['bRef'])

  t.equal(test.s, 's: ')
  t.notOk(test.b)

  bee.$set({
    o: ['hehe'],
    s: 'sss'
  })

  t.equal(test.s, 's: sss')
  t.equal(test.b[0], 'hehe')

  t.end()
})
