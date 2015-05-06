var test = require('tape');
var Bee = require('../');
var $ = require('jquery')(typeof window === 'undefined' ? Bee.doc.parentWindow : window);

test('构造函数', function(t) {
  t.equal(typeof Bee, 'function');
  t.equal(typeof Bee.extend, 'function');
  t.equal(typeof Bee.prototype.$set, 'function');
  t.equal(typeof Bee.prototype.$get, 'function');
  t.equal(typeof Bee.prototype.$replace, 'function');
  t.end();
});
