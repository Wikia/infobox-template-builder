'use strict';
import {Elem} from './_elem';
import {isObject, isString} from '../validators';


export class Image extends Elem {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'image',
			altBoundVariableName: null,
			altDefaultValue: null,
			caption: {},
			validators: {
				altBoundVariableName: isString,
				altDefaultValue: isString,
				caption: isObject
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
