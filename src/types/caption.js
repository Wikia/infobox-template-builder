'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

const defaultProperties = {
	_nodeType: 'caption',
	stringTemplate: null
};

export class Caption extends Elem {

	constructor(properties = {}) {
		super();

		this.extendValidation({
			stringTemplate: isString
		});

		this.setProperties(Object.assign({}, defaultProperties, properties));
	}
}
