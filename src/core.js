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

			let deserialize = Serializers[from.deserializeWith].deserialize;
			const deserialized = deserialize(from.src);

			this.data = deserialized.data;
			this.theme = deserialized.theme;

		} else {
			// If 'from' is not defined, we instantiate a fresh infobox
			this.data = new InfoboxData(params.dataOptions);
			this.theme = new InfoboxThemeData();
		}

		if (routines.length) {

			let bootstrappedRoutines = [];

			for (let i = 0; i < routines.length; i++) {
				let adapter = routines[i];
				bootstrappedRoutines.push(Object.assign({}, Serializers[adapter.name], adapter));
			}

			this.set('routines', bootstrappedRoutines);
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
