'use strict';
import {Elem} from './_elem';
import {isObject, isString} from '../validators';

const defaultProperties = {
	_nodeType: 'image',
	altBoundVariableName: null,
	altDefaultValue: null,
	caption: {}
};

export class Image extends Elem {

	constructor(properties = {}) {
		super();

		this.extendValidation({
			altBoundVariableName: isString,
			altDefaultValue: isString,
			caption: isObject
		});

		this.setProperties(Object.assign(defaultProperties, properties));
	}
}
