'use strict';

var fs = require('fs'),
	path = require('path'),
	onlyScripts = function (name) {
		return /\.js$/i.test(path.extname(name))
	},
	tasks = fs.readdirSync('./gulp').filter(onlyScripts);

tasks.forEach(function (task) {
	require('./' + task);
});