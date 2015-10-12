'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

const defaultProperties = {
	_nodeType: 'data',
	label: null,
	stringTemplate: null
};

export class Field extends Elem {

	constructor(properties = {}) {
		super();

		this.extendValidation({
			label: isString,
			stringTemplate: isString
		});

		this.setProperties(Object.assign(defaultProperties, properties));
	}
}
