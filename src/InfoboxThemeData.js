'use strict';
import {Model} from './model';

export class InfoboxThemeData extends Model {

	constructor(properties = {}) {
		super();

		this.items = null;

		if (properties.items) {
			this.setItems(properties.items);
		}
	}

	setItems(itemsArr) {
		if (itemsArr.isArray()) {

			this.set('items', itemsArr);
			return this.items;

		} else {
			throw new TypeError('Argument provided to setItems(itemsArr) must be an array');
		}
	}

	set(propName, newValue) {
		// do type validation here
		super.set(propName, newValue);
	}
}
