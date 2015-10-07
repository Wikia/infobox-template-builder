'use strict';
import {Elem} from './_elem';
import {isObject} from '../validators';

const defaultProperties = {
	_nodeType: 'image',
	alt: {},
	caption: {}
};

export class Image extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);

		this.extendValidation({
			alt: isObject,
			caption: isObject
		});
	}
}
