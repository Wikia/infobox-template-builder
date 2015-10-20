'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

export class Field extends Elem {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'data',
			label: null,
			stringTemplate: null,
			validators: {
				label: isString,
				stringTemplate: isString
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
