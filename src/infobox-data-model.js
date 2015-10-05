'use strict';
import {Model} from './model';
import {copyArray, swapArrayElements} from './utils';
import {Field, Group} from './types/all';

const defaultProps = {
	items: [],
	theme: null,
	themeVarName: null,
	layout: null
};

export class InfoboxDataModel extends Model {

	constructor(properties = {}) {
		
		super();

		Object.assign(this, defaultProps, properties);
		
		console.log(properties) 
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

	add(item, index = null) {
		const itemsCopy = copyArray(this.items);

		if (index) {
			itemsCopy.splice(index, 0, item);
		} else {
			itemsCopy.push(item);
		}

		this.setItems(itemsCopy);
		return item;
	}

	remove(index) {
		const itemsCopy = copyArray(this.items);
		let removed;

		if (index) {
			removed = itemsCopy.splice(index, 1);
		} else {
			removed = itemsCopy.pop();
		}

		this.setItems(itemsCopy);
		return removed;
	}

	swap(firstIndex, secondIndex) {
		let itemsCopy = copyArray(this.items);
		itemsCopy = swapArrayElements(itemsCopy, firstIndex, secondIndex);

		return this.setItems(itemsCopy);
	}

	setItems(itemsArr) {
		if (Array.isArray(itemsArr)) {

			this.set('items', itemsArr);
			return this.items;

		} else {
			throw new TypeError('Argument provided to setItems(itemsArr) must be an array');
		}
	}
}
