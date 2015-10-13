/* global beforeEach, describe, expect, it */
'use strict';

import {InfoboxTemplateBuilder} from './core';

QUnit.module('my example tests');

QUnit.test('will this work?', function(assert) {
     var expected = 'Hello Foo';
	 var itb = new InfoboxTemplateBuilder();
     assert.ok(true);
});
