var gulp = require('gulp')
var browserify = require('browserify')
var v_source = require('vinyl-source-stream')
var streamify = require('gulp-streamify')
var sourcemaps = require('gulp-sourcemaps')
var uglify = require('gulp-uglify')
var del = require('del')
var rename = require('gulp-rename')
var gzip = require('gulp-gzip')
var gulpFilter = require('gulp-filter')

var versionFix = require('./tools/gulp.versionFix')

gulp.task('build', function () {
  var b = browserify({debug: true, standalone: 'Bee'})
  var filter = gulpFilter(['bee.min.js'])

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
    .pipe(rename('bee.min.js'))
    .pipe(streamify(sourcemaps.write('./', {sourceRoot: './'})))
    .pipe(gulp.dest('./build'))
    .pipe(filter)
    .pipe(gzip())
    .pipe(gulp.dest('./build'))
})

gulp.task('watch', function () {
  gulp.watch(['src/*.js', 'src/*/*.js'], ['build'])
})

gulp.task('clean', function () {
    return del(['./build/*'])
})

gulp.task('build:test', require('./tools/buildTests.js'))

gulp.task('default', ['clean', 'build', 'watch'])
