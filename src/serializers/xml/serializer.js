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

/**
 * deserialize
 *
 * @param doc {string} A string of portable infobox xml
 * @return {object} an object containing new instances of InfoboxData and InfoboxThemeData
 */
export function deserialize(doc) {
	return {
		data: new InfoboxData({
			"validators": {},
			"items": [
				{
					"validators": {},
					"_nodeType": "title",
					"boundVariableName": "title_source",
					"defaultValue": "My Character Infobox",
					"stringTemplate": "${{{title_source}}}"
				},
				{
					"validators": {},
					"_nodeType": "data",
					"boundVariableName": "foo",
					"defaultValue": "Dang",
					"label": "This is the top level item",
					"stringTemplate": "${{{foo}}}"
				},
				{
					"validators": {},
					"_nodeType": "image",
					"boundVariableName": "image_source",
					"defaultValue": "dang.png",
					"alt": {
						"boundVariableName": "image_source",
						"defaultValue": "dang.png"
					},
					"caption": {
						"boundVariableName": "caption",
						"defaultValue": "Here's a caption",
						"stringTemplate": "${{{caption}}}"
					}
				},
				{
					"validators": {},
					"items": [
						{
							"validators": {},
							"_nodeType": "title",
							"boundVariableName": "title_source",
							"defaultValue": "My Character Infobox",
							"stringTemplate": "${{{title_source}}}"
						},
						{
							"validators": {},
							"_nodeType": "data",
							"boundVariableName": "foo",
							"defaultValue": "Dang",
							"label": "This is the top level item",
							"stringTemplate": "${{{foo}}}"
						},
						{
							"validators": {},
							"_nodeType": "image",
							"boundVariableName": "image_source",
							"defaultValue": "dang.png",
							"alt": {
								"boundVariableName": "image_source",
								"defaultValue": "dang.png"
							},
							"caption": {
								"boundVariableName": "caption",
								"defaultValue": "Here's a caption",
								"stringTemplate": "${{{caption}}}"
							}
						}
					],
					"_nodeType": "group",
					"layout": "horizontal",
					"show": "incomplete"
				}
			],
			"theme": 'foo-bar',
			"themeVarName": 'partyTime',
			"title": null,
			"layout": "horizontal"
		}),
		theme: null //new InfoboxThemeData()
	};
}
