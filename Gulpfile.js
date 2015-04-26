var gulp = require('gulp')
var browserify = require('browserify')
var v_source = require('vinyl-source-stream')
var streamify = require('gulp-streamify')
var sourcemaps = require('gulp-sourcemaps')
var uglify = require('gulp-uglify')
var del = require('del')
var rename = require('gulp-rename')

var versionFix = require('./tools/gulp.versionFix')

gulp.task('build', function () {
  var b = browserify({debug: true, standalone: 'Bee'})
  b.transform(versionFix)

  b.exclude('jsdom')
  b.add('./src/bee.js')

  return b.bundle()
    .pipe(v_source('bee.js'))
    .pipe(gulp.dest('./build'))
    .pipe(streamify(sourcemaps.init({loadMaps: true})))
    .pipe(streamify(
        uglify()
    ))
    .pipe(streamify(sourcemaps.write('./', {sourceRoot: './'})))
    .pipe(rename('bee.min.js'))
    .pipe(gulp.dest('./build'))

})

gulp.task('watch', function () {
  gulp.watch(['src/*.js', 'src/*/*.js'], ['build'])
})

gulp.task('clean', function () {
    return del(['./build/*'])
})

gulp.task('default', ['clean', 'build', 'watch'])
