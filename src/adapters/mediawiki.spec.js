'use strict';

import * as mediawiki from './mediawiki';
import * as utils from '../utils';

QUnit.module('Adapter');

QUnit.test('MediaWiki persist()', function(assert) {
	console.log(mediawiki);
    sinon.stub(mediawiki, 'save');//.yields("success");
	sinon.stub(mediawiki, 'getEditToken');//.yields("success");

	assert.throws( () => {mediawiki.persist('foo', {})}, TypeError, 'Empty options should throw TypeError');
	assert.throws( () => {mediawiki.persist('foo', {title: 'bar'})}, TypeError, 'Need both title and host options');
	assert.throws( () => {mediawiki.persist('foo', {host: 'bar'})}, TypeError, 'Need both title and host options');
	assert.throws( () => {mediawiki.persist(7, {title: 'bar', host: 'baz'})}, TypeError, 'XML must be a string');

	let foo = mediawiki.persist('foo', {title:'foo', host: 'bar'});

	assert.ok(foo instanceof Promise)
    mediawiki.save.restore();
	mediawiki.getEditToken.restore();
});
