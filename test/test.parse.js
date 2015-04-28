var test = require('tape');

var parse = require('../src/parse.js').parse;
var evaluate = require('../src/eval.js')
  , evalu = evaluate.eval
  , summary = evaluate.summary
  ;

test('literal 直接量', function(t) {
  t.equal(evalu(parse('1')), 1, 'Number: 1');

  t.equal(evalu(parse('1.2')), 1.2, 'Number: 1.2');

  t.equal(evalu(parse('"a"')), "a", 'String: "a"');

  t.equal(evalu(parse("'ab'")), "ab", "String: 'ab'");

  t.equal(evalu(parse("'a\"b'")), "a\"b", "String: 'a\"b'");

  t.equal(evalu(parse("'a\\\'b'")), "a\'b", "String: 'a\\'b'");

  t.equal(evalu(parse('"a\\\"b"')), "a\"b", 'String: "a\\"b"');

  t.test('Array: []', function(t) {
    var a = evalu(parse("[]"));
    t.ok(Array.isArray(a));
    t.equal(a.length, 0);

    t.end();
  });

  t.test('Array: [1, "2"]', function(t) {
    var a = evalu(parse('[1, "2"]'));

    t.ok(Array.isArray(a));
    t.equal(a[0], 1);
    t.equal(a[1], "2");
    t.equal(a.length, 2);

    t.end();
  });

  t.test('字符串中的符号', function(t) {
    var symbols = ["+", "-", "*", "/", "true", "false", "%"]
    symbols.forEach(function(s) {
      t.equal(evalu(parse('"' + s + '"')), s, 'String: ' + s);
    });

    t.end();
  });

  t.end();
});

test('variable 变量', function(t) {
  t.test('parse: a + b', function(t) {
    var l = summary(parse('a + b')).locals;

    t.equal(l.length, 2);
    t.equal(l[0], 'a');
    t.equal(l[1], 'b');

    t.end();
  });

  t.test('parse: a.abc', function(t) {
    var s = summary(parse('a.abc'))
      , l = s.locals
      ;

      t.equal(l.length, 1);
      t.equal(l[0], 'a');

      t.equal(s.paths.length, 1);
      t.equal(s.paths[0], 'a.abc');

      t.end();
  });

  t.test('parse: a[abc]', function(t) {
    var s = summary(parse('a[abc]'))
      , l = s.locals
      ;

      t.equal(l.length, 2);
      t.equal(l[0], 'a');
      t.equal(l[1], 'abc');

      t.equal(s.paths.length, 2);
      t.equal(s.paths[0], 'a');
      t.equal(s.paths[1], 'abc');

      t.end();
  });

  t.test('parse: a["abc"]', function(t) {
    var s = summary(parse('a["abc"]'))
      , l = s.locals
      ;

      t.equal(l.length, 1);
      t.equal(l[0], 'a');

      t.equal(s.paths.length, 1);
      t.equal(s.paths[0], 'a.abc');

      t.end();
  });
});

test('expression 表达式', function(t) {
  var exps = [
    '1 + 1'
  , '-1 + 2'
  , '1.2 + 500 + 30'
  , '23 - 12 + -3 - 4'
  , '1.5 * 3'
  , '1 + 5 * 2'
  , '(1 + 3) * 3'
  , '3 / 4'
  , '2 * 6 / 3'
   , '2 % 3'
  , '2 % 4'
  , '4 % 2'
  , '4 % 3'
  , '"123" - "234"'
  , '"a" + 1'
  , '"123" + "234"'
  , '"123" && "234"'
  , '1 && "234"'
  , '1 && 12'
  , '0 && 12'
  , '0 || 1'
  , '0 && 12 || 1'
  , '1 || 0 && 51'
  , '0 ? 12 : 4'
  , '-1 ? 12 : 4'

  , '"a" - 1'
  , '"a" + "b"'

  , '"2" == 2'
  , '"a" === 2'

  , '"0" !== 0'
  , '"0" != 2'
  ];

  for(var i = 0, l = exps.length; i < l; i++){
    (function(i){
      var val = eval(exps[i]);
      t.test(exps[i] + ' = ' + val, function(t) {
        if(isNaN(val)){
          t.ok(isNaN(evalu(parse(exps[i]))), exps[i]);
        }else{
          t.equal(evalu(parse(exps[i])), val, exps[i]);
        }

        t.end();
      });
    })(i)
  }

  t.test('new 操作符', function(t) {
    t.equal(evalu(parse('new Date')).getTime(), (new Date).getTime(), 'new Date');
    t.end();
  })
});


test('context summary', function(t) {
  t.test('23 | filter:abc', function(t) {
    var context = {
      locals: {a: 1, b: 1, c:1}
    , filters: {filter: 1, fi: 1}
    , paths: {'a.b': 1, 'b.c': 1, b: 1, 'a.bc': 1, 'c.0': 1}
    };

    var s = summary(parse('a.b + b["c"] * b | filter:a.bc |fi:[1]:c[0]'));

    for(var type in s) {
      for(var i = 0, l = s[type].length; i < l; i++) {
        t.equal(context[type][s[type][i]], 1);
        delete context[type][s[type][i]];
      }
    }

    t.equal(Object.keys(context.locals).length, 0);
    t.equal(Object.keys(context.filters).length, 0);
    t.equal(Object.keys(context.paths).length, 0);

    t.end();
  })
});
