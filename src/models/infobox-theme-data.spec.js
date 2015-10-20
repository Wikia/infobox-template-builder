'use strict';

import {InfoboxThemeData} from './infobox-theme-data';


QUnit.module('Model');

QUnit.test('InfoboxThemeData constructor', function(assert) {
	//colors must be strings
	var foo = new InfoboxThemeData({borderColor: 4});
	//assert.throws( () => { return new InfoboxThemeData({borderColor: 4}) }, TypeError);

	var themeData = new InfoboxThemeData({borderColor: 'a string'});
	assert.strictEqual(themeData.get('borderColor'), 'a string');
});
