/*
 * watch
 * Rebuilds on file change while server is running
 */

var gulp = require('gulp'),
	path = require('path'),
	tasks = ['templates'];

gulp.task('watch', tasks, function () {
	gulp.watch('src/templates/src/*.hbs', tasks);
});