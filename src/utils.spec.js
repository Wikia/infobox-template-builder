import {deepSet, copyArray, swapArrayElements, serializeRequestData} from './utils';

'use strict';

QUnit.module('utils');

QUnit.test('deep set', function (assert) {
	deepSet('foo', 'bar');
	assert.strictEqual(foo, 'bar', 'simple value should be set');

	let obj = {
		foo: {
			bar: 'baz'
		}
	};

	deepSet('foo.bar', {
		baz: 'qux'
	}, obj);
	assert.strictEqual(obj.foo.bar.baz, 'qux', 'deep property should be set');

	deepSet('foo.bar', 1, obj);
	assert.strictEqual(obj.foo.bar, 1, 'deep property should be overridden');
});

//QUnit.test('copy array', function (assert) {
//
//});
//
//QUnit.test('swap array elements', function (assert) {
//
//});
//
//QUnit.test('serialize request data', function (assert) {
//
//});
