var test = require('tape');
var Bee = require('../');
var $ = require('jquery')
var style = require('../src/directives/style.js')

if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('Bee.mount', function(t) {

  t.test('mount a component', function(t) {
    Bee.tag('test', {})
    var $el = $('<test attr="1">')
    var bee = Bee.mount($el[0])
    t.equal(bee.attr, '1', '<test>')

    $el = $('<div b-component="test" attr="2">')
    bee = Bee.mount($el[0])
    t.equal(bee.attr, '2', 'b-component="test"')

    $el = $('<div b-tag="test" attr="3">')
    bee = Bee.mount($el[0])
    t.equal(bee.attr, '3', 'b-tag="test"')

    t.end()
  })

  t.test('sub class mount', function(t) {
    var Ant = Bee.extend()

    Ant.tag('test2', {})

    var tpl = '<div><test2 b-ref="test" attr="1"></test2></div>'
    var bee = Bee.mount($(tpl)[0])

    t.notOk(bee.$refs.test.$data)

    bee = Ant.mount($(tpl)[0])

    t.ok(bee.$refs.test.$data)

    t.equal(bee.$refs.test.$data.attr, "1")

    t.end()

  })

  t.end()
})
