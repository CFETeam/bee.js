var fs = require('fs')
  , path = require('path')
  , Promise = require('es6-promise').Promise
  ;

var testPath = path.join(__dirname, '../test')

//将测试文件集合成一个入口方便 zuul 进行测试
module.exports = function() {
  return new Promise(function(resolve, reject) {
    var files = fs.readdirSync(testPath);
    var tests = [];

    files.forEach(function(filename) {
      if(/^test.*\.js$/.test(filename)) {
        tests.push("require('./" + filename + "');");
      }
    });

    fs.writeFile(path.join(testPath, 'index.js'), tests.join('\n'), 'utf8', function(err) {
      if(err) {
        reject(err)
      }else{
        resolve();
      }
    });
  })
}