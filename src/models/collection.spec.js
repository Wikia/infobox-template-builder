'use strict';

import {Collection} from './collection';
import {isString} from '../validators';


QUnit.module('Model');

QUnit.test('Collection constructor', function(assert) {
     var collection = new Collection();

     assert.ok(collection !== null, 'Collection should not be null');
	 assert.notStrictEqual(collection.items, undefined, 'items should be an empty array');
	 assert.notStrictEqual(collection.items, null, 'items should be an empty array');
	 assert.strictEqual(collection.items.length, 0, 'items should be an empty array');
});

QUnit.test('Collection add, swap, remove, itemsArr', function(assert) {
	var collection = new Collection();

	collection.add('a');
	assert.strictEqual(collection.get('items')[0], 'a');
	collection.add('b');
	assert.strictEqual(collection.get('items')[1], 'b');
	assert.strictEqual(collection.get('items')[0], 'a');
	collection.add('d', 100);
	assert.strictEqual(collection.get('items')[2], 'd');
	collection.add('c', 50);
	assert.strictEqual(collection.get('items')[3], 'c');
	collection.swap(2, 3);
	assert.strictEqual(collection.get('items')[2], 'c');
	assert.strictEqual(collection.get('items')[3], 'd');
	collection.remove(2);
	assert.strictEqual(collection.get('items')[2], 'd');

	assert.throws( () => { collection.setItems('this should error') }, TypeError);
});
