'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';


export class Caption extends Elem {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'caption',
			stringTemplate: null,
			validators: {
				stringTemplate: isString
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
