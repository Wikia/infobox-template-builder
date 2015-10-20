'use strict';
import {Collection} from './collection';
import * as Types from '../types/all';
import {isString} from '../validators';

const defaultProps = {
	items: [],
	theme: null,
	themeVarName: null,
	layout: null
};

export class InfoboxData extends Collection {

	constructor(properties = {}) {

		super();

		Object.assign(this, defaultProps, properties);

		if (this.items) {
			this.setItems(this.items);
		}
	}

	static newElement(elemName, props) {
		if (isString(elemName)) {
			elemName = `${elemName.charAt(0).toUpperCase()}${elemName.slice(1)}`;
		}
		return new Types[elemName](props);
	}

    /*
	 * Instance method that is an alias for InfoboxData.newElement
     */
	newElement() {
		return InfoboxData.newElement.apply(null, arguments);
	}
}
