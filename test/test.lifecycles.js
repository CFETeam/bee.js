var test = require('tape');
var Bee = require('../');

test('lifecycles methods', function(t) {
  t.equal(typeof Bee.prototype.$beforeInit, 'function')
  t.equal(typeof Bee.prototype.$afterInit, 'function')
  t.equal(typeof Bee.prototype.$beforeUpdate, 'function')
  t.equal(typeof Bee.prototype.$afterUpdate, 'function')
  t.equal(typeof Bee.prototype.$beforeDestroy, 'function')
  t.equal(typeof Bee.prototype.$afterDestroy, 'function')

  t.test('simple call', function(t) {
    t.plan(6)
    var bee = new Bee({
      $beforeInit: function() {
        t.pass('beforeInit')
      },
      $afterInit: function() {
        t.pass('afterInit')
      },
      $beforeUpdate: function() {
        t.pass('beforeUpdate')
      },
      $afterUpdate: function() {
        t.pass('afterUpdate')
      },
      $beforeDestroy: function() {
        t.pass('beforeDestroy')
      },
      $afterDestroy: function() {
        t.pass('afterDestroy')
      }
    });

    bee.$set('test');
    bee.$destroy()
  });

  t.test('mixins and order', function(t) {
    t.plan(18);
    var order = 0;

    var utils = {
      $beforeInit: function() {
        t.equal(order, 1,  'beforeInit')
        order++;
      },
      $afterInit: function() {
        t.equal(order, 4, 'afterInit')
        order++
      },
      $beforeUpdate: function() {
        t.equal(order, 7, 'beforeUpdate')
        order++
      },
      $afterUpdate: function() {
        t.equal(order, 10, 'afterUpdate')
        order++
      },
      $beforeDestroy: function() {
        t.equal(order, 13, 'beforeDestroy')
        order++
      },
      $afterDestroy: function() {
        t.equal(order, 16, 'afterDestroy')
        order++
      }
    };

    var Ant = Bee.extend({
      $mixins: [utils],
      $beforeInit: function() {
        t.equal(order, 0,  'beforeInit')
        order++;
      },
      $afterInit: function() {
        t.equal(order, 3, 'afterInit')
        order++
      },
      $beforeUpdate: function() {
        t.equal(order, 6, 'beforeUpdate')
        order++
      },
      $afterUpdate: function() {
        t.equal(order, 9, 'afterUpdate')
        order++
      },
      $beforeDestroy: function() {
        t.equal(order, 12, 'beforeDestroy')
        order++
      },
      $afterDestroy: function() {
        t.equal(order, 15, 'afterDestroy')
        order++
      }
    })

    var ant = new Ant({
      $beforeInit: function() {
        t.equal(order, 2,  'beforeInit')
        order++;
      },
      $afterInit: function() {
        t.equal(order, 5, 'afterInit')
        order++
      },
      $beforeUpdate: function() {
        t.equal(order, 8, 'beforeUpdate')
        order++
      },
      $afterUpdate: function() {
        t.equal(order, 11, 'afterUpdate')
        order++
      },
      $beforeDestroy: function() {
        t.equal(order, 14, 'beforeDestroy')
        order++
      },
      $afterDestroy: function() {
        t.equal(order, 17, 'afterDestroy')
        order++
      }
    })

    ant.$set('update')
    ant.$destroy()

  })

  t.end()
})