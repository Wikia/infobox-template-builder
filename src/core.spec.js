'use strict';

import {InfoboxTemplateBuilder} from './core';

QUnit.module('Core');

QUnit.test('save', function(assert) {
	 var builder = new InfoboxTemplateBuilder();
     assert.ok(builder);
});

QUnit.test('should be instantiable with default XMLSerializer', assert => {
	const instance = new InfoboxTemplateBuilder({
		routines: [{
			name: 'XMLSerializer',
			persistOptions: {
				host: 'http://lizlux.liz.wikia-dev.com',
				title: 'Template:foobox'
			}
		}]
	});

	assert.ok(instance);
});
