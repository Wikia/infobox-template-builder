import {Collection} from '../models/collection';
import {isString} from '../validators';

const typeMap = {
	boundVariableName: isString,
	defaultValue: isString,
	label: isString,
	stringTemplate: isString,
	type: isString
};

const defaultProperties = {
	attributes: [],
	boundVariableName: null,
	defaultValue: null,
	label: null,
	stringTemplate: null,
	type: 'data'
};

export class Field extends Collection {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);
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

	addAttribute(name, value) {

		if (!isString(name) || !isString(value)) {
			throw new TypeError('attribute.name & attribute.value must be a string');
		}

		this.attributes.push({name, value});
	} 

	get attributes() {
		return this.attributes;
	}

	set attributes(value) {
		return false;
	}
}
