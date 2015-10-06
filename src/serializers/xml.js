'use strict';

import Handlebars from './../../node_modules/handlebars/dist/handlebars';
import * as template from './templates/compiled/templates.js';

export function serialize(data, theme) {
	return template.default(data);
}

export function deserialize(doc) {
	return {
		data: null,
		theme: null
	};
}
