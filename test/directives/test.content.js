var test = require('tape');
var Bee = require('../../');
var $ = require('jquery')
if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

var Ant = Bee.extend({
  $tpl: '<div class="component"><span b-content="$content"></span></div>'
})

Bee.tag('ant', Ant)

test('静态内容', function(t) {

  var bee = new Bee({
    $tpl: '<div class="container"><ant><span>这里是</span><span>$content的内容</span></ant></div>'
  })

  var $el = $(bee.$el)

  t.ok($el.hasClass('container'))
  console.log($el.html())
  t.ok($el.children().hasClass('component'), '组件内容默认会替换自定义标签')

  t.equal($el.children().children().length, 2)
  t.equal($el.children().text(), '这里是$content的内容')

  t.end()
})

test('普通内容', function(t) {

  var bee = new Bee({
    $tpl: '<div class="container"><ant><span>{{text}}</span><span>here</span></ant></div>',
    $data: {text: 'container content '}
  })

  var $el = $(bee.$el)

  t.equal($el.children().children().length, 2)
  t.equal($el.children().text(), 'container content here')

  t.comment('组件内容从属于父容器')
  bee.$set('text', 'biu biu ')
  t.equal($el.children().text(), 'biu biu here')

  t.end()
})

test('含有 b-if 的内容', function(t) {

  var bee = new Bee({
    $tpl: '<div class="container"><ant><span b-if="flag">{{text}}</span><span>here</span></ant></div>',
    $data: {text: 'container content '}
  })

  var $el = $(bee.$el)

  t.equal($el.children().children().length, 1)
  t.equal($el.children().text(), 'here')

  bee.$set('text', 'biu biu ')
  t.equal($el.children().text(), 'here')

  bee.$set('flag', true)
  t.equal($el.children().text(), 'biu biu here')


  bee.$set('flag', false)
  t.equal($el.children().text(), 'here')

  t.end()
})

test('含有 b-repeat 的内容', function(t) {

  var bee = new Bee({
    $tpl: '<div class="container"><ant><span b-repeat="item in list">{{item}} </span><span>here</span></ant></div>',
    $data: {list: ['ant']}
  })

  var $el = $(bee.$el)

  t.equal($el.children().children().length, 2)
  t.equal($el.children().text(), 'ant here')

  bee.list.push('bee')
  t.equal($el.children().children().length, 3)
  t.equal($el.children().text(), 'ant bee here')

  t.end()
})
