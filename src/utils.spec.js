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

QUnit.test('copy array', function (assert) {
	let arr = [1,2];
	let copy = copyArray(arr);
	assert.deepEqual(arr, copy);
});

QUnit.test('swap array elements', function (assert) {
	let arr = [1,2,3];
	swapArrayElements(arr, 0, 1);
	assert.deepEqual(arr, [2,1,3]);
});

QUnit.test('serialize request data', function (assert) {
	let data = {
		foo: 'bar',
		'baz?': 'qux&'
	};
	let string = serializeRequestData(data);
	assert.strictEqual(string, 'foo=bar&baz%3F=qux%26', 'data should be serialized and encoded');
});
