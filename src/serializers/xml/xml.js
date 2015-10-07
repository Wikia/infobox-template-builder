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

window.serializeData1 = {
	'items': [
		{
			_nodeType: "image",
			alt: {
				_nodeType: "alt",
				boundVariableName: "image_alt",
				defaultValue: "Image Alt",
				validators: {}

			},
			caption: {
				_nodeType: "caption",
				boundVariableName: "image_caption",
				defaultValue: "Image Caption",
				validators: {}
			},
			validators: {}
		}
	]
};

window.serializeData = {
	"validators": {},
	"items": [
		{
			"validators": {},
			"_nodeType": "title",
			"boundVariableName": "title_source",
			"defaultValue": "My Character Infobox"
		},
		{
			"validators": {},
			"_nodeType": "data",
			"boundVariableName": "foo",
			"defaultValue": "Dang",
			"label": "This is the top level item",
			"stringTemplate": null
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
				"defaultValue": "Here's a caption"
			}
		},
		{
			"validators": {},
			"items": [
				{
					"validators": {},
					"_nodeType": "title",
					"boundVariableName": "title_source",
					"defaultValue": "My Character Infobox"
				},
				{
					"validators": {},
					"_nodeType": "data",
					"boundVariableName": "foo",
					"defaultValue": "Dang",
					"label": "This is the top level item",
					"stringTemplate": null
				},
				{
					"validators": {},
					"_nodeType": "image",
					"boundVariableName": "image_source",
					"defaultValue": "dang.png",
					"label": "Group level avatar",
					"alt": {
						"boundVariableName": "image_source",
						"defaultValue": "dang.png"
					},
					"caption": {
						"boundVariableName": "caption",
						"defaultValue": "Here's a caption"
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
