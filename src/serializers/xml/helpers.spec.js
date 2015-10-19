import {formatXml} from './helpers';

'use strict';

QUnit.module('Serialization helpers');

QUnit.test('formatXml', (assert) => {
	let input = `<infobox><data source='foo'><default>value</default></data></infobox>`;

	let output = `<infobox>

		<data source='foo'><default>value</default>
		</data>


	</infobox>`;

	assert.strictEqual(formatXml(input), formatXml(output), 'xml should be formatted nicely')
});
