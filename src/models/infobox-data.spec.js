'use strict';

import {InfoboxData} from './infobox-data';
import {isString} from '../validators';
import {Caption} from '../types/caption';


QUnit.module('Model');

QUnit.test('InfoboxData constructor', function(assert) {
     var data = new InfoboxData();
     assert.ok(data !== null, 'instance should not be null');

	 data = new InfoboxData({items: [1, 2, 3, 4, 5]});
	 assert.strictEqual(data.items.length, 5, 'items should be populated');
});

QUnit.test('InfoboxData newElement', function(assert) {
	var data = new InfoboxData();
	var element = data.newElement('caption', {});
	assert.ok(element instanceof Caption);
});
