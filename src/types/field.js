'use strict';
import {Model} from '../models/base';
import {isString} from '../validators';
import {AttributeMixin} from './mixins';

const typeMap = {
	boundVariableName: isString,
	defaultValue: isString,
	label: isString,
	stringTemplate: isString,
	type: isString
};

const defaultProperties = {
	boundVariableName: null,
	defaultValue: null,
	label: null,
	stringTemplate: null,
	type: 'data'
};

export class Field extends Model {

	constructor(properties = {}) {
		super();
		this._model = 'field';
		Object.assign(this, AttributeMixin, defaultProperties, properties);
	}

	set(propName, value) {

		if (typeMap[propName]) {
			const isValid = typeMap[propName].validator();

			if (!isValid) {
				throw new TypeError(`${propName} should be of ${typeMap[propName].type}`);
			}
		}

		super.set.apply(this, arguments);
	}
}
