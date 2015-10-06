'use strict';
import {Elem} from './_elem';

const defaultProperties = {
	_nodeType: 'title'
};

export class Title extends Elem {

	constructor(properties = {}) {
		super();
		Object.assign(this, defaultProperties, properties);
	}
}
