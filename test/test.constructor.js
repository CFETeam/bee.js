var test = require('tape');
var Ant = require('../');
var $ = require('jquery')(typeof window === 'undefined' ? Ant.doc.parentWindow : window);

test('构造函数', function(t) {
  t.equal(typeof Ant, 'function');
  t.equal(typeof Ant.extend, 'function');
  t.equal(typeof Ant.prototype.$set, 'function');
  t.equal(typeof Ant.prototype.$get, 'function');
  t.equal(typeof Ant.prototype.$replace, 'function');
  t.end();
});
