'use strict';
import {Elem} from './_elem';

const defaultProperties = {
	_nodeType: 'alt'
};

export class Alt extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);
	}
}
