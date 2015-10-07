'use strict';

//import Handlebars from './../../node_modules/handlebars/dist/handlebars';
import * as template from './templates/compiled/templates';

export function serialize(data, theme) {
	return template.default(data);
}

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
	"theme": null,
	"themeVarName": null,
	"title": null,
	"layout": null
};

window.serialize = serialize;

export function deserialize(doc) {
	return {
		data: null,
		theme: null
	};
}
