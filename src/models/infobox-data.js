'use strict';
import {Collection} from './collection';
import * as Types from '../types/all';

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
		return new Types[elemName](props);
	}
}
