var gulp = require('gulp'),
	handlebars = require('gulp-handlebars'),
	concat = require('gulp-concat'),
	module = require('gulp-define-module'),
	path = 'src/serializers/templates';

gulp.task('precompile-serialize-templates', function(){
	gulp.src(path + '/src/*.hbs')
		.pipe(handlebars({
			handlebars: require('handlebars')
		}))
		.pipe(module('commonjs'))
		.pipe(concat('templates.js'))
		.pipe(gulp.dest(path + '/compiled'));
});