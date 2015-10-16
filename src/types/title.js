'use strict';
import {Elem} from './_elem';
import {isString} from '../validators';

export class Title extends Elem {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'title',
			stringTemplate: null,
			validators: {
				stringTemplate: isString
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
