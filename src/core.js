'use strict';

import {InfoboxThemeData} from './models/infobox-theme-data';
import {InfoboxData} from './models/infobox-data';
import {Model} from './models/base';
import {isValidAdapter, areValidRoutines} from './validators';
import * as Serializers from './serializers/all';

class Core extends Model {

	constructor(params = {}) {

		const defaultProps = {
			// Options to be passed to InfoboxData constructor
			dataOptions: null,
			// Options to be passed to InfoboxThemeData constructor
			themeOptions: null,
			// The 'from' param is an object containing the source document and the name of the serializer to
			// deserialize the document with
			from: null,

			routines: null,

			validators: {
				routines: areValidRoutines
			}
		};

		params = Object.assign(defaultProps, params);

		const {from, routines} = params;

		if (routines.length) {

			let bootstrappedRoutines = [];

			for (let i = 0; i < routines.length; i++) {
				let adapter = routines[i];
				bootstrappedRoutines.push(Object.assign({}, Serializers[adapter.name], adapter));
			}
			debugger;

			params.routines = bootstrappedRoutines;
		}

		super(params);

		// extend the properties

		/*
		 * If builder is instantiated with a serialized document, we will deconstruct it
		 * into our internal representation, and populate the builder with those values
		 */
		if (from) {

			try {
				const deserialized = Serializers[from.deserializeWith].deserialize(from.src);
				this.data = deserialized.data;
				this.theme = deserialized.theme;

			} catch (e) {

				throw e;

			}

		} else {
			// If 'from' is not defined, we instantiate a fresh infobox
			this.data = new InfoboxData(params.dataOptions);
			this.theme = new InfoboxThemeData();
		}

	}

	static registerAdapter(adapter) {
		if (isValidAdapter(adapter)) {
			Serializers[adapter.attributes.name] = adapter;
		} else {
			throw Error('Invalid adapter', adapter);
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

			const promise = adapter
				.persist(doc, adapter.persistOptions)
				.then(() => this.emit('save', doc))
				.catch((err) => this.emit('errorWhileSaving', err));

			promises.push(promise);
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
