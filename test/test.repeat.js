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
  var checkRepeat = function() {
    t.equal($el.find('li').length, list.length, 'length: ' + list.length)
    $el.find('li').each(function(i) {
      var $li = $(this)
      t.equal(i, $li.attr('data-index') * 1, '$index: ' + i)
      t.equal(list[i] + '', $li.text(), 'item ' + i + ' : ' + list[i])
      t.equal(bee.name, $li.attr('data-parentname'), 'parentName')
    });
  }

  checkRepeat()

  bee.list.push('6');
  t.comment('push')
  checkRepeat()

  bee.list.push('6')
  t.comment('再次 push 相同数据')
  checkRepeat()

  bee.list.pop()
  t.comment('pop')
  checkRepeat()
  bee.list.shift()
  t.comment('shift')
  checkRepeat()

  t.comment('unshift')
  bee.list.unshift(-1)
  checkRepeat()

  t.comment('splice')
  bee.list.splice(2, 'b')
  checkRepeat()

  t.comment('reverse')
  bee.list.reverse()
  checkRepeat()

  t.comment('$set')
  bee.list.$set(0, '--1')
  t.equal(bee.list[0], '--1')
  checkRepeat()

  t.comment('$replace')
  bee.list.$set(1, '--2')
  t.equal(bee.list[1], '--2')
  checkRepeat()

  t.comment('$remove')
  bee.list.$remove(0)
  t.equal(bee.list[0], '--2')
  checkRepeat()
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

test('repeat: 数组转换', function(t) {
  var Ant = Bee.extend({
    $tpl: '<ul><li b-repeat="item in list.map(map)" data-index="{{$index}}">{{item.size}}</li></ul>'
  });
  var list = [{num: 1}, {num: 2}, {num: 3}]
  var ant = new Ant({
    $data: {
      list: list
    },
    map: function(item) {
      return {size: item.num}
    }
  })

  var $el = $(ant.$el)

  t.equal($el.find('li').length, list.length)
  $el.find('li').each(function(i) {
    t.equal(i, $(this).data().index * 1, '[索引] $index: ' + i)
    t.equal(list[i].num + '', $(this).text(), 'item.size ' + i + ' : ' + list[i].num)
  });

  list.$set(0, {num: 'a'});
  t.equal($el.find('li').eq(0).text(), 'a')

  t.end()
})

test('repeat: 深层嵌套', function(t) {
  var list = [
    {name: '00-a', list: [{ name: '10-a' }, {name: '10-b'}]},
    {name: '01-a', list: [{ name: '11-a' }, {name: '11-b'}]}
  ];
  var bee = new Bee('<ul data-lv0>' +
    '<li b-repeat="item in list" data-index="{{$index}}" data-name="{{item.name}}">' +
    '<ul data-lv1><li b-repeat="item1 in item.list" data-index="{{$index}}" data-parent-index="{{$parent.$index}}" data-name="{{item1.name}}" data-item-name="{{item.name}}"></li></ul>' +
    '</li></ul>', {
      $data: {
        list: list
      }
    });

  var $el = $(bee.$el);

  t.equal($el.find('ul[data-lv1]:first>li').length, list[0].list.length)

  list.forEach(function(item, i) {
    t.equal($el.children('li').eq(i).attr('data-name'), item.name, 'item.name: ' + i)
    item.list.push({
      name: '1' + i + '-b'
    })
    item.list.forEach(function(item1, j) {
      t.equal($el.find('ul[data-lv1]').eq(i).find('li').eq(j).attr('data-name'), item1.name, 'item1.name: ' + j)
      t.equal($el.find('ul[data-lv1]').eq(i).find('li').eq(j).attr('data-item-name'), item.name, 'item.name: ' + j)
      t.equal($el.find('ul[data-lv1]').eq(i).find('li').eq(j).attr('data-parent-index') * 1, i, '$parent.$index: ' + j)
    })

  })

  t.end()
})