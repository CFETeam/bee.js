var Bee = require('../')
  , fs = require('fs')
  , template = '<div>{{name}}</div>'
  ;
  
var bee = new Bee(template, {$data: {name: 'Ant'}});

console.log(bee.$el.outerHTML);

bee.$set('name', 'Bee');

console.log(bee.$el.outerHTML);

var html = fs.readFileSync(__dirname + '/attr.html', 'utf8');

console.log(new Bee(html, {$data: {text: 'Ant'}}).$el.innerHTML);