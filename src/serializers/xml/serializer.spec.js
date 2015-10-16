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

	let xml = `<infobox>
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

	assert.strictEqual(serialize(infoboxData), formatXml(xml), 'serialized xml should match expected xml');
});

QUnit.test('Deserialize XML', function (assert) {
	let xml = `<infobox><title source="foo"></title></infobox>`;

	let deserialized = deserialize(xml).data; // returns InfoboxData instance
	let titleElem = deserialized.items[0];
	assert.strictEqual(titleElem._nodeType, 'title', 'node type should be set on title element');
	assert.strictEqual(titleElem.boundVariableName, 'foo', 'bound variable should be set on title element');

	let reserialized = serialize(deserialized); // back to xml string
	assert.strictEqual(reserialized, formatXml(xml), 'deserialize then serialize should maintain the same XML');
});
