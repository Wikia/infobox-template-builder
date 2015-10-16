'use strict';

import {InfoboxThemeData} from './models/infobox-theme-data';
import {InfoboxData} from './models/infobox-data';
import {Model} from './models/base';
import {persist} from './adapters/mediawiki';
import {serialize, deserialize} from './serializers/xml/serializer';

const defaultProps = {
	// Options to be passed to InfoboxData constructor
	dataOptions: null,
	// Options to be passed to InfoboxThemeData constructor
	themeOptions: null,
	// The 'from' property's value is a string whose contents are serialized Portable Infobox XML
	from: null,
	// In the case of mediawiki storage, this is the article title. Otherwise, a string title for the infobox template.
	persistOptions: null
};

class Core extends Model {

	constructor(params = {}) {

		super();

		// extend the properties
		params = Object.assign(defaultProps, params);

		const {from} = params;

		/*
		 * If builder is instantiated with a serialized document, we will deconstruct it
		 * into our internal representation, and populate the builder with those values
		 */
		if (from) {

			const deserialized = deserialize(from);

			this.data = deserialized.data;
			this.theme = deserialized.theme;

		} else {
			// If 'from' is not defined, we instantiate a fresh infobox
			this.data = new InfoboxData(params.dataOptions);
			this.theme = new InfoboxThemeData();
		}

		// store config for persistence method
		this.persistOptions = params.persistOptions;
	}

	serialize() {
		return serialize(this.data, this.theme);
	}

	save() {

		const data = this.serialize(this.data, this.theme);
		return persist(data, this.persistOptions)
			.then(() => this.emit('save', data))
			.catch((err) => this.emit('errorWhileSaving', err));

	}
}

// semver
Core.VERSION = '0.1.0';

// export the class for clients that don't use dependency injection
window.InfoboxTemplateBuilder = Core;

export {Core as InfoboxTemplateBuilder};
