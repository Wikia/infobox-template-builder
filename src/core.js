'use strict';
import {Model} from './model';
import {serialize, deserialize} from './serializers/xml';
import {persist} from './adapters/mediawiki';

export {Core as InfoboxTemplateBuilder};


class Core extends Model {

	constructor(params = {}) {

		super();

		const {from} = params;

        /*
		 * If builder is instantiated with a serialized document, we will deconstruct it
		 * into our internal representation, and populate the builder with those values
         */
		if (from) {

			[this.data, this.theme] = deserialize(from);

		} else {

			this.data = null; // new InfoboxData(...);
			this.theme = null; // new InfoboxThemeData();

		}
	}

	save() {

		const data = serialize(this.data, this.theme);
		this.persist(data);

	}
}

Core.VERSION = '0.1.0';
window.InfoboxTemplateBuilder = Core;
