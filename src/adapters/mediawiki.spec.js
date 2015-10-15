'use strict';

import {persist} from './mediawiki';

QUnit.module('Adapter');

QUnit.test('MediaWiki persist()', function(assert) {
	var data = 'foo';
	var promise = persist(data);

	assert.ok(promise instanceof Promise, 'Persist() should return a promise');
});
