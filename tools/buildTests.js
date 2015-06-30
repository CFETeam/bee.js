var fs = require('fs')
  , pt = require('path')
  , Promise = require('es6-promise').Promise
  ;

var testPath = pt.join(__dirname, '../test')

//将测试文件集合成一个入口方便 zuul 进行测试
module.exports = function() {
  return new Promise(function(resolve, reject) {
    var tests = ['require("es6-promise").polyfill();'];

    tests = tests.concat(getTests(testPath))

    fs.writeFile(pt.join(testPath, 'index.js'), tests.join('\n'), 'utf8', function(err) {
      if(err) {
        reject(err)
      }else{
        resolve();
      }
    });
  })
}

function getTests(path) {
  console.log(path)
  var tests = [];
  var files = fs.readdirSync(path);

  files.forEach(function (filename) {
    var fp = pt.join(path, filename)
    var fstate = fs.statSync(fp)
    if(fstate.isDirectory()) {
      tests = tests.concat(getTests(fp))
    }else{
      if(/^test.*\.js$/.test(filename)) {
        tests.push("require('./" + pt.relative(testPath, fp).replace(/\\/g, '/') + "');");
      }
    }
  })
  return tests
}
