'use strict';
import {Elem} from './_elem';

const defaultProperties = {
	_nodeType: 'image',
	alt: {},
	caption: {}
};

export class Image extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);
	}
}
