'use strict';

import {InfoboxData} from './infobox-data';
import {isString} from '../validators';
import {Caption} from '../types/caption';


QUnit.module('Model');

QUnit.test('InfoboxData constructor', function(assert) {
     var id = new InfoboxData();
     assert.ok(id !== null, 'instance should not be null');

	 id = new InfoboxData({items: [1, 2, 3, 4, 5]});
	 assert.strictEqual(id.items.length, 5, 'items should be populated');
});

QUnit.test('InfoboxData newElement', function(assert) {
	var id = new InfoboxData();
	var element = id.newElement('caption', {});
	assert.ok(element instanceof Caption);
});
