'use strict';
import {InfoboxDataModel} from './infobox-data-model';
import {Model} from './model';
import {persist} from './adapters/mediawiki';
import {serialize, deserialize} from './serializers/xml';

class Core extends Model {

	constructor(params = {}) {

		super();

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

			this.data = new InfoboxDataModel(params.infoboxOptions);
			this.theme = null; // new InfoboxThemeData();

		}
	}

	save() {

		const data = serialize(this.data, this.theme);
		return this.persist(data)
			.then(() => this.emit('saved'))
			.catch((err) => this.emit('errorWhileSaving', err));

	}
}

Core.VERSION = '0.1.0';

window.InfoboxTemplateBuilder = Core;

export {Core as InfoboxTemplateBuilder};
