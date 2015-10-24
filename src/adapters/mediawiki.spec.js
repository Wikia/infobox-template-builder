'use strict';

import * as mediawiki from './mediawiki';
import * as utils from '../utils';

QUnit.module('Adapter');

QUnit.test('MediaWiki persist()', function(assert) {
	assert.throws( () => {mediawiki.persist('foo', {})}, TypeError, 'Empty options should throw TypeError');
	assert.throws( () => {mediawiki.persist('foo', {title: 'bar'})}, TypeError, 'Need both title and host options');
	assert.throws( () => {mediawiki.persist('foo', {host: 'bar'})}, TypeError, 'Need both title and host options');
	assert.throws( () => {mediawiki.persist(7, {title: 'bar', host: 'baz'})}, TypeError, 'XML must be a string');

	let xmlString = '<infobox></infobox>',
		options = {host: "http://lizlux.liz.wikia-dev.com", title: "Template:foobox"},
		expected = {
			edit: {
				nochange: '',
				pageid: 2718,
				result: 'Success',
				title: 'Template:Foobox'
			}
		};


	let promise = mediawiki.persist(xmlString, options);
	QUnit.stop();

	promise.then( (actual) => {
		QUnit.start();
		assert.deepEqual(acutal, expected, 'Correct response');
	}).catch( (err) => {
		console.log(err);
	});
});
