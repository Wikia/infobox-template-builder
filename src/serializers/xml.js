'use strict';
const sample = `<infobox layout="stacked">
<title source="name">
<default>{{PAGENAME}}</default>
</title>
<image source="image">
<default>Image:Kratos_rendering_concept.jpg</default>
</image>
<data source="caption" />
<group>
<header>In-Game Information</header>
<data source="title">
<label>Title</label>
</data>
<data source="alias">
<label>Alias/es</label>
</data>
<data source="gender">
<label>Gender</label>
</data>
<data source="birthplace">
<label>Birthplace</label>
</data>
<data source="species">
<label>Species/Race</label>
</data>
</group>
<group>
<header>Misc. Information</header>
<data source="family">
<label>Family Member/s</label>
</data>
<data source="status">
<label>Current status</label>
</data>
<data source="location">
<label>Location</label>
</data>
</group>
<group>
<header>Behind the Scenes</header>
<data source="voice actor">
<label>Voiced by</label>
</data>
<data source="appears in">
<label>Appears in</label>
</data>
</group>
</infobox>`;

import {InfoboxData} from '../models/infobox-data';

function createElements(child) {
	const {nodeName} = child;
	const create = InfoboxData.newElement;

	let defaultTag = child.querySelector('default');

	const props = {
		defaultValue: defaultTag && defaultTag.textContent,
		boundVariableName: child.getAttribute('source')
	};

	switch (nodeName) {
		case 'title':
			return create('Title', Object.assign(props, {boundVariableName: defaultTag && defaultTag.textContent}));

		case 'image':
			const altTag  = child.querySelector('alt');
			const captionTag = child.querySelector('caption');
			return create('Image', Object.assign(props, {
				alt:  altTag && altTag.textContent,
				caption: captionTag && captionTag.textContent
			}));

		case 'header':
			return create('Title', Object.assign(props, {value: child.textContent}));

		case 'data':
			const labelTag = child.querySelector('label');
			const formatTag = child.querySelector('format');
			return create('Field', Object.assign(props, {
				label: labelTag && labelTag.textContent,
				stringTemplate: formatTag && formatTag.textContent
			}));

		case 'group':
			return create('Group', Object.assign(props, {
				layout: child.getAttribute('layout'),
				show: child.getAttribute('show'),
				items: Array.prototype.map.call(child.children, createElements)
			}));

		default:
			return 'unknown';
	}
}

/**
 * serialize
 *
 * @param data {InfoboxData}
 * @param theme {InfoboxThemeData}
 * @return {string} A string of portable infobox data
 */
export function serialize(data, theme) {
	return '';
}

/**
 * deserialize
 *
 * @param doc {string} A string of portable infobox xml
 * @return {object} an object containing new instances of InfoboxData and InfoboxThemeData
 */
export function deserialize(doc) {

	const parser = new DOMParser();

	const _doc = parser.parseFromString(sample, 'text/xml');

	const infobox = _doc.querySelector('infobox');

	const infoboxProps = {
		layout: infobox.getAttribute('layout'),
		theme: infobox.getAttribute('theme'),
		themeVarName: infobox.getAttribute('theme-source')
	};

	const items = Array.prototype.map.call(infobox.children, createElements);

	debugger;


	return {
		data: new InfoboxData(),
		theme: null//new InfoboxThemeData()
	};
}
