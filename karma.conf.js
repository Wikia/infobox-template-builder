/* global module */
module.exports = function (config) {
	'use strict';
	config.set({
		autoWatch: false,
		singleRun: true,

		frameworks: ['jspm', 'qunit'],

		files: [
			'node_modules/karma-babel-preprocessor/node_modules/babel-core/browser-polyfill.js',
			'src/test-helpers.js'
		],

		jspm: {
			config: 'jspm.config.js',
			loadFiles: [
				'src/**/*.spec.js'
			],
			serveFiles: [
				'src/**/!(*spec).js'
			]
		},

		proxies: {
			'/src/': '/base/src/',
			'/jspm_packages/': '/base/jspm_packages/'
		},

		browsers: ['PhantomJS'],

		preprocessors: {
			'src/**/!(*spec).js': ['babel', 'sourcemap', 'coverage']
		},

		babelPreprocessor: {
			options: {
				sourceMap: 'inline',
				blacklist: ['useStrict']
			},
			sourceFileName: function(file) {
				return file.originalPath;
			}
		},

		reporters: ['coverage', 'progress'],

		coverageReporter: {
			instrumenters: {isparta: require('isparta')},
			instrumenter: {
				'src/**/*.js': 'isparta'
			},

			reporters: [
				{
					type: 'text-summary',
					subdir: normalizationBrowserName
				},
				{
					type: 'html',
					dir: 'coverage/',
					subdir: normalizationBrowserName
				}
			]
		}
	});

	function normalizationBrowserName(browser) {
		return browser.toLowerCase().split(/[ /-]/)[0];
	}
};
