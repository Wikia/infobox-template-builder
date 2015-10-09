'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

const defaultProperties = {
	_nodeType: 'title',
	stringTemplate: null
};

export class Title extends Elem {

	constructor(properties = {}) {
		super();

		this.extendValidation({
			stringTemplate: isString
		});

		this.setProperties(Object.assign(defaultProperties, properties));
	}
}
