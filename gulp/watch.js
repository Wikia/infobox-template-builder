/*
 * watch
 * Rebuilds on file change while server is running
 */

var gulp = require('gulp'),
	path = require('path'),
	tasks = ['serializer-templates'];

gulp.task('watch', tasks, function () {
	gulp.watch('src/serializers/templates/src/*.hbs', tasks);
});