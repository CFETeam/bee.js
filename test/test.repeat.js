var test = require('tape');
var Bee = require('../');
var $ = require('jquery')
if(typeof window === 'undefined') {
  $ = $(Bee.doc.parentWindow)
}

test('repeat: 简单数组', function(t) {
  var tpl = '<ul><li b-repeat="item in list" data-parentname="{{name}}" data-index="{{$index}}">{{item}}</li></ul>';
  var list = [1, 3, "5"];
  var bee = new Bee(tpl, { $data: {list : list, name: 'parentName'} })
  var $el = $(bee.$el)
  t.equal($el.find('li').length, list.length)
  $el.find('li').each(function(i) {
    t.equal(i, $(this).data().index * 1, '[索引] $index: ' + i)
    t.equal(list[i] + '', $(this).text(), 'item ' + i + ' : ' + list[i])
    t.equal(bee.name, $(this).data().parentname, 'parentName')
  });

  t.end()
})

test('repeat: 普通对象数组', function(t) {
  var tpl = '<ul><li b-repeat="item in list" data-parentname="{{name}}" data-index="{{$index}}">{{item.size}}</li></ul>';
  var list = [{size: 1}, {size: 3}, {size: 5}];
  var bee = new Bee(tpl, { $data: {list : list, name: 'parentName'} })
  var $el = $(bee.$el)
  t.equal($el.find('li').length, list.length)
  $el.find('li').each(function(i) {
    t.equal(i, $(this).data().index * 1, '[索引] $index: ' + i)
    t.equal(list[i].size + '', $(this).text(), 'item.size ' + i + ' : ' + list[i].size)
    t.equal(bee.name, $(this).data().parentname, 'parentName')
  });

  t.end()
})