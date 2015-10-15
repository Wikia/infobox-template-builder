'use strict';

import {InfoboxData} from '../../models/infobox-data';
import {InfoboxThemeData} from '../../models/infobox-theme-data';
import {serialize, deserialize} from './serializer.js';
import {formatXml} from './helpers';

QUnit.module('Serializers');

QUnit.test('Serialize to XML', function(assert) {
	let title = InfoboxData.newElement('Title', {
		boundVariableName: 'foo',
		defaultValue: 'foo',
		stringTemplate: 'foo'
	});

	let image = InfoboxData.newElement('Image', {
		boundVariableName: 'foo',
		defaultValue: 'foo',
		altBoundVariableName: 'foo',
		altDefaultValue: 'foo',
		caption: InfoboxData.newElement('Caption', {
			boundVariableName: 'foo',
			defaultValue: 'foo',
			stringTemplate: 'foo'
		})
	});

	let field = InfoboxData.newElement('Field', {
		boundVariableName: 'foo',
		defaultValue: 'foo',
		label: 'foo',
		stringTemplate: 'foo'
	});

	let header = InfoboxData.newElement('Title', {
		value: 'foo'
	});

	let group = InfoboxData.newElement('Group', {
		items: [header, field]
	});

	let infoboxData = new InfoboxData({
		items: [title, image, group]
	});

	let output = `<infobox>
		<title source="foo"><default>foo</default><format>foo</format></title>
		<image source="foo">
			<caption source="foo"><default>foo</default><format>foo</format></caption>
			<alt source="foo"><default>foo</default></alt>
			<default>foo</default>
		</image>
		<group>
			<header>foo</header>
			<data source="foo"><label>foo</label><default>foo</default><format>foo</format></data>
		</group>
	</infobox>`;

	assert.strictEqual(serialize(infoboxData), formatXml(output), 'serialized output should match expected');
});

//QUnit.test('Deserialize XML', function(assert) {
//
//});