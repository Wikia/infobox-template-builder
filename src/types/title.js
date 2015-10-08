'use strict';
import {Elem} from './_elem';

const defaultProperties = {
	_nodeType: 'title',
	stringTemplate: null
};

export class Title extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);

		this.extendValidation({
			stringTemplate: isString
		});

	}
}
