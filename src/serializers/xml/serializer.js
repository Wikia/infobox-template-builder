'use strict';

import 'handlebars';
import {equals} from './helpers'
import {InfoboxData} from '../../models/infobox-data';
import {InfoboxThemeData} from '../../models/infobox-theme-data';
import {xmlString} from './template';

Handlebars.registerHelper('equals', equals);

/**
 * serialize
 *
 * @param data {InfoboxData}
 * @param theme {InfoboxThemeData}
 * @return {string} A string of portable infobox data
 */
export function serialize(data, theme) {
	var template = Handlebars.compile(xmlString);
	return template(data);
}

/**
 * deserialize
 *
 * @param doc {string} A string of portable infobox xml
 * @return {object} an object containing new instances of InfoboxData and InfoboxThemeData
 */
export function deserialize(doc) {
	return {
		data: new InfoboxData(),
		theme: null //new InfoboxThemeData()
	};
}
