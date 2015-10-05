'use strict';
import {Collection} from './collection';
import {Field, Group} from '../types/all';

const defaultProps = {
	items: [],
	theme: null,
	themeVarName: null,
	layout: null
};

export class InfoboxDataModel extends Collection {

	constructor(properties = {}) {
		
		super();

		Object.assign(this, defaultProps, properties);
		
		if (properties.items) {
			this.setItems(properties.items);
		}
	}

	newField(params) {
		return new Field(params);
	}

	newGroup(params) {
		return new Group(params);
	}

}
