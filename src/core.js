'use strict';

import {InfoboxThemeData} from './models/infobox-theme-data';
import {InfoboxData} from './models/infobox-data';
import {Model} from './models/base';
import {areValidRoutines} from './validators';

class Core extends Model {

	constructor(params = {}) {

		const defaultProps = {
			// Options to be passed to InfoboxData constructor
			dataOptions: null,
			// Options to be passed to InfoboxThemeData constructor
			themeOptions: null,
			// The 'from' property's value is a string whose contents are serialized Portable Infobox XML
			from: null,
			/*
			 * In the case of mediawiki storage, this is the article title.
			 * Otherwise, a string title for the infobox template.
			 */
			persistOptions: null,

			routines: [],

			validators: {
				routines: areValidRoutines
			}
		};

		params = Object.assign(defaultProps, params);

		super(params);

		// extend the properties
		const {from, routines} = params;

		/*
		 * If builder is instantiated with a serialized document, we will deconstruct it
		 * into our internal representation, and populate the builder with those values
		 */
		if (from) {

			const deserialized = from.deserialize(from.src);

			this.data = deserialized.data;
			this.theme = deserialized.theme;

		} else {
			// If 'from' is not defined, we instantiate a fresh infobox
			this.data = new InfoboxData(params.dataOptions);
			this.theme = new InfoboxThemeData();
		}

		if (routines.length) {
			this.set('routines', routines);
		}
	}

	serialize() {
		const documents = this.routines.map(routine => {
			return routine.serialize(this.data, this.theme);
		});

		return documents;
	}

	save() {
		const documents = this.serialize();

		const promises = [];

		for (let i = 0; i < documents.length; i++) {
			const doc = documents[i];
			const adapter = this.routines[i];
			const promise = adapter.persist(doc, adapter.persistOptions);

			promises.push(promise);

			promise
			.then(() => this.emit('save', doc))
			.catch((err) => this.emit('errorWhileSaving', err));

		}

		return promises;
	}
}

// semver
Core.VERSION = '0.1.0';

if (window) {
	// export the class for clients that don't use dependency injection
	window.InfoboxTemplateBuilder = Core;
}

export {Core as InfoboxTemplateBuilder};
