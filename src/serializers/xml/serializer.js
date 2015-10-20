'use strict';
import 'handlebars';
import {equals, formatXml} from './helpers';
import {InfoboxData} from '../../models/infobox-data';
import {InfoboxThemeData} from '../../models/infobox-theme-data';
import {xmlString} from './template';
import {isString} from '../../validators';

Handlebars.registerHelper('equals', equals);

function createElements(child) {
	const {nodeName} = child;
	const create = InfoboxData.newElement;

	const defaultTag = child.querySelector('default');
	const formatTag = child.querySelector('format');

	const props = {
		defaultValue: defaultTag && defaultTag.textContent,
		boundVariableName: child.getAttribute('source')
	};

	switch (nodeName.toLowerCase()) {
		case 'title':
			return create('Title', Object.assign(props, {
				stringTemplate: formatTag && formatTag.textContent
			}));

		case 'image':
			const altTag  = child.querySelector('alt');
			const altDefaultTag = altTag && altTag.querySelector('default');
			const captionTag = child.querySelector('caption');
			const captionFormatTag = captionTag && captionTag.querySelector('format');

			let imageProps = Object.assign(props, {
				altBoundVariableName:  altTag && altTag.getAttribute('source'),
				altDefaultValue: altDefaultTag && altDefaultTag.textContent
			});

			imageProps.caption = create('Caption', {
				boundVariableName: captionTag && captionTag.getAttribute('source'),
				stringTemplate: captionFormatTag && captionFormatTag.textContent
			});

			return create('Image', imageProps);

		case 'header':
			return create('Title', Object.assign(props, {value: child.textContent}));

		case 'data':
			const labelTag = child.querySelector('label');
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
	var template = Handlebars.compile(xmlString);
	return formatXml(template(data));
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
