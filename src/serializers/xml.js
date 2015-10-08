'use strict';
import {InfoboxData} from '../models/infobox-data';
import {isString} from '../validators';

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
			return null;
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

	if (!isString(doc)) {
		throw new TypeError('document supplied to deserialize must be a string');
	}

	const parser = new DOMParser();

	const _doc = parser.parseFromString(doc, 'text/xml');

	const infobox = _doc.querySelector('infobox');

	const infoboxProps = {
		layout: infobox.getAttribute('layout'),
		theme: infobox.getAttribute('theme'),
		themeVarName: infobox.getAttribute('theme-source'),
		items: Array.prototype.map.call(infobox.children, createElements)
	};

	return {
		data: new InfoboxData(infoboxProps),
		theme: null //new InfoboxThemeData()
	};
}
