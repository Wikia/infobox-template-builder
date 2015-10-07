'use strict';

import 'handlebars';
import {equals} from './helpers'
import {InfoboxData} from '../../models/infobox-data';
import {xmlString} from './template';

window.Handlebars.registerHelper('equals', equals);

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

window.serialize = serialize;
window.serializeData = {
	"validators": {},
	"items": [
		{
			"validators": {},
			"_nodeType": "data",
			"boundVariableName": "foo",
			"defaultValue": "Dang",
			"label": "Who let the dogs out?",
			"stringTemplate": null
		},
		{
			"validators": {},
			"items": [
				{
					"validators": {},
					"_nodeType": "data",
					"boundVariableName": "foo",
					"defaultValue": "Dang",
					"label": "Who let the dogs out?",
					"stringTemplate": null
				},
				{
					"validators": {},
					"_nodeType": "image",
					"boundVariableName": "bar",
					"defaultValue": "dang.png",
					"alt": null,
					"caption": null,
					"label": "Avatar"
				}
			],
			"_nodeType": "group",
			"layout": null,
			"show": null
		}
	],
	"theme": 'foo-bar',
	"themeVarName": 'partyTime',
	"title": null,
	"layout": null
};

/**
 * deserialize
 *
 * @param doc {string} A string of portable infobox xml
 * @return {object} an object containing new instances of InfoboxData and InfoboxThemeData
 */
export function deserialize(doc) {
	return {
		data: new InfoboxData(),
		theme: new InfoboxThemeData()
	};
}
