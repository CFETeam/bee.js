var through = require('through2')
var fs = require('fs')
var pt = require('path')
var pkg = JSON.parse(fs.readFileSync(pt.join(__filename, '../../', 'package.json'), 'utf8'))

module.exports = function (file) {

  return through(function (buf, enc, next) {
    var str = buf.toString('utf8').replace(/%VERSION/g, pkg.version)

    this.push(str)

    next()
  })
}
