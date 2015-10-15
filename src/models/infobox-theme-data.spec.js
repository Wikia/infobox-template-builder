'use strict';

import {InfoboxThemeData} from './infobox-theme-data';


QUnit.module('Model');

QUnit.test('InfoboxThemeData constructor', function(assert) {
     var itd = new InfoboxThemeData({borderColor: 4});

	 assert.ok(true);
});
