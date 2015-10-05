import {Model} from '../model';
import {isString} from '../validators';

const typeMap = {
	boundVariableName: isString,
	defaultValue: isString,
	label: isString,
	stringTemplate: isString
};

const defaultProperties = {
	attributes: [],
	boundVariableName: null,
	defaultValue: null,
	label: null,
	stringTemplate: null
};

export class Field extends Model {

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

		super.set.call(arguments);
	}

	addAttribute(name, value) {

		if (!this.isString(name) || !this.sString(value)) {
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
