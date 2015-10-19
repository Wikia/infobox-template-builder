import {formatXml} from './helpers';

'use strict';

QUnit.module('Serialization helpers');

QUnit.test('formatXml', (assert) => {
	let inline = `<infobox><data source='foo'><default>value</default></data></infobox>`;

	let messy = `<infobox>

		<data source='foo'><default>value</default>
		</data>


	</infobox>`;

	assert.strictEqual(formatXml(inline), formatXml(messy), 'formatXml should return the same output')
});
