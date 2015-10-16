/* global beforeEach, describe, expect, it */
'use strict';

import {Model} from './base';

QUnit.module('my example tests');

QUnit.test('Model', function(assert) {
     var expected = 'Hello Foo';
	 var itb = new Model();
     assert.ok(true);
});
