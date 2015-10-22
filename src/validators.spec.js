'use strict';

import {isString, isNumeric, isObject} from './validators';

QUnit.module('Validators');

QUnit.test('isString', function(assert) {
	assert.equal(isString('foo'), true, 'string');
	assert.equal(isString(9), false, 'number');
	assert.equal(isString(null), false, 'null');
	assert.equal(isString(undefined), false, 'undefined');
	assert.equal(isString([4]), false, 'array');
	assert.equal(isString({foo:'bar'}), false, 'object');
});

QUnit.test('isNumeric', function(assert) {
	assert.equal(isNumeric('foo'), false, 'non numeric string');
	assert.equal(isNumeric(9), true, 'number');
	assert.equal(isNumeric('9'), true, 'numeric string');
	assert.equal(isNumeric(null), false, 'null');
	assert.equal(isNumeric(undefined), false, 'undefined');
	assert.equal(isNumeric(['4']), false, 'array');
	assert.equal(isNumeric({foo:'bar'}), false, 'object');
});

QUnit.test('isObject', function(assert) {
	assert.equal(isObject('foo'), false, 'non numeric string');
	assert.equal(isObject(9), false, 'number');
	assert.equal(isObject('9'), false, 'numeric string');
	assert.equal(isObject(null), false, 'null');
	assert.equal(isObject(undefined), false, 'undefined');
	assert.equal(isObject(['4']), false, 'array');
	assert.equal(isObject({}), true, 'empty object');
	assert.equal(isObject({foo:'bar'}), true, 'object');
});
