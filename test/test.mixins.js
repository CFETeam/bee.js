var test = require('tape');
var Bee = require('../');

test(function(t) {
  t.test('$data mixins', function(t) {
    var obj1 = {
      $data: {
        a: 1
      }
    };
    var obj2 = {
      $data: {
        b: 2
      }
    };
    var defaults = {
      c: 3
    }
    var data = {
      d: 4
    }
    var Ant = Bee.extend({
      $data: defaults,
      $mixins: [obj1, obj2]
    });

    var ant = new Ant({
      $data: data
    })

    t.equal(ant.$data, data, '保持对传入 data 的引用')
    t.equal(ant.$data.a, obj1.$data.a)
    t.equal(ant.$data.b, obj2.$data.b)
    t.equal(ant.$data.c, defaults.c)

    t.end();
  })

  t.test('life cycle method mixins', function(t){
    t.plan(4)
    var obj1 = {
      $afterInit: function() {
        t.ok(true, 'minx1 called')
      }
    };
    var obj2 = {
      $afterInit: function() {
        t.ok(true, 'minx2 called')
      }
    }

    var Ant = Bee.extend({
      $mixins: [obj1, obj2],
      $afterInit: function() {
        t.ok(true, 'defaults called')
      }
    })

    new Ant({
      $afterInit: function() {
        t.ok(true, 'defined $init called')
      }
    })
  })

  t.test('common property mixins', function(t){
    t.plan(1)
    var obj1 = {
      method: function() {
        t.ok(false, 'should be never called')
      }
    };
    var obj2 = {
      method: function() {
        t.ok(true)
      }
    }

    var Ant = Bee.extend({
      $mixins: [obj1, obj2]
    })

    new Ant().method()
  })

  t.end();
});
