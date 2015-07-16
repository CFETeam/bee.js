var test = require('tape');
var Bee = require('../../');
var $ = require('jquery')

if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('b-class', function(t) {
  var bee = new Bee('<div><span class="a" b-class="klass"></span></div>')
  var el = $(bee.$el).children()[0]

  t.equal(el.className, 'a', 'string class')

  bee.$set({klass: 'b'})

  t.equal(el.className, 'a b', 'string class')

  t.test('object class', function(t){
    bee.$set({ klass: {key: 'c'} })

    t.equal(el.className, 'a')

    bee.$set({key: true})

    t.equal(el.className, 'a c')

    bee.$set({key: false})

    t.equal(el.className, 'a')

    t.end()
  })
})
