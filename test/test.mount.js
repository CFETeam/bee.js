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
    t.equal(bee.attr, '1')
    t.end()
  })

  t.end()
})