var fs = require('fs')
  ;
  
var files = fs.readdirSync(__dirname);

files.forEach(function(filename) {
  if(/^test.*\.js$/.test(filename)) {
    require('./' + filename);
  }
});