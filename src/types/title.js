'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

export class Title extends Elem {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'title',
			stringTemplate: null,
			// title may have a value if it's actually a header inside a group
			value: null,
			validators: {
				stringTemplate: isString,
				value: isString
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
