var test = require('tape');
var Bee = require('../');

test(function(t) {
  t.test('初始值', function(t) {
    var a1 = 1, c1 = 3;
    var Ant = Bee.extend({
      $data: {a: a1, c: c1},
      $filters: {f : function() {}},
      $tpl: '<span>abc</span>'
    });

    var b2 = 2, c2 = '3.1'
    var data = {b: b2, c: c2}
    var ant = new Ant({
      $data: data
    });

    t.equal(ant.$data, data, '保持 $data 的引用')
    t.notOk(ant.$data === Ant.prototype.$data)
    t.equal(ant.$data.a, a1)
    t.equal(ant.$data.b, b2)
    t.equal(ant.$data.c, c2)
    t.notEqual(ant.$data.c, c1)

    var data2 = 'ant';
    var ant2 = new Ant({
      $data: data2
    })
    t.equal(ant2.$data + '', data2 + '', '$data 为字符串时')
    t.notEqual(ant2.$data.a, a1, '基础类型的 $data 会覆盖默认值')

    t.end();
  })

  t.end();
});
