import {Model} from '../model';

const typeMap = {
	attributes: isAttributeList,
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

	constructor(defaultProperties = defaultProperties) {
		Object.assign(this, defaultProperties);
	}

	isString(input) {
		return typeof input === 'string';
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

	set attributes() {
		throw Error('attributes not settable');
	}


}
