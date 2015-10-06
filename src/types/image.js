'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

const defaultProperties = {
	_nodeType: 'image',
	alt: null,
	caption: null
};

export class Image extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);

		this.extendValidation({
			alt: isString,
			caption: isString
		});
	}
}
