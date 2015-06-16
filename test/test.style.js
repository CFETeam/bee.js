var test = require('tape');
var Bee = require('../');
var $ = require('jquery')
var style = require('../src/directives/style.js')

if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('b-style', function(t) {
  var $el = $('<div>');
  var el = $el[0]

  var dir = $.extend({ el: el }, style)

  dir.update('width: 12px')
  t.equal($el.css('width'), '12px', 'string style')

  t.test('object style', function(t){
    dir.update({
      marginTop: '14px'
    })

    t.notEqual($el.css('width'), '12px')
    t.equal($el.css('margin-top'), '14px', '驼峰转连接符')

    dir.update({
      width: 16
    });

    t.notEqual($el.css('margin-top'), '14px')
    t.equal($el.css('width'), '16px', '自动添加 px 单位')

    dir.update({
      width: ''
    })

    t.notOk(el.style.width, 'empty string')

    dir.update({
      width: undefined
    })
    t.notOk(el.style.width, 'undefined')

    dir.update({
      width: null
    })
    t.notOk(el.style.width, 'null')

    t.end()
  })
})