'use strict';
import {Elem} from './_elem';
import {isObject, isString} from '../validators';

const defaultProperties = {
	_nodeType: 'image',
	altBoundVariable: null,
	altDefaultValue: null,
	caption: {}
};

export class Image extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);

		this.extendValidation({
			altBoundVariable: isString,
			altDefaultValue: isString,
			caption: isObject
		});
	}
}
