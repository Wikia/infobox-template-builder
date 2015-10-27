import {deepSet, copyArray, swapArrayElements, serializeRequestData, xhrPost} from './utils';

'use strict';

QUnit.module('utils', {
	beforeEach() {
		let requests = this.requests = [];

		this.xhr = sinon.useFakeXMLHttpRequest();

		this.xhr.onCreate = function (xhr) {
			requests.push(xhr);
		};
	},

	afterEach() {
		this.xhr.restore();
	}
});

QUnit.test('deep set', (assert) => {
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

QUnit.test('copy array', (assert) => {
	let arr = [1, 2];
	let copy = copyArray(arr);
	assert.deepEqual(arr, copy, 'array values should be copied to new array');
});

QUnit.test('swap array elements', (assert) => {
	let arr = [1, 2, 3];
	swapArrayElements(arr, 0, 1);
	assert.deepEqual(arr, [2, 1, 3], 'array elements should have changed places');
});

QUnit.test('serialize request data', (assert) => {
	let data = {
		foo: 'bar',
		'baz?': 'qux&'
	};
	let string = serializeRequestData(data);
	assert.strictEqual(string, 'foo=bar&baz%3F=qux%26', 'data should be serialized and encoded');
});

QUnit.test('xhr helper function', function (assert) {
	xhrPost('/api.php', {
		data: {
			title: 'foo'
		},
		success: sinon.spy,
		fail: sinon.spy
	});

	assert.strictEqual(1, this.requests.length, 'one request should have been made');
	assert.strictEqual(this.requests[0].url, '/api.php', 'request should have the correct url');

	assert.throws(() => {
		xhrPost()
	}, TypeError, 'xhrPost must be passed a string as the first argument');
});
