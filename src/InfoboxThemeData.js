'use strict';
import {Model} from './model';

export class InfoboxThemeData extends Model {
	const allowed = {
		linkColor: {
			type: string
		},
		accentColor: {
			type: string
		}
	};

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
		if (
			!this.allowed[propName] ||
			!this.allowed[propName].type === typeof propName
		) {
			throw new TypeError('Setting property name ' + propName + ' is not allowed');
		}
		super.set(propName, newValue);
	}
}

module.exports = InfoboxThemeData;