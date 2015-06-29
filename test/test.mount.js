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

  t.end()
})
