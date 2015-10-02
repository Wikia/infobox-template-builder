'use strict';
import {Model} from './model';
import {copyArray, swapArrayElements} from './utils';

export class InfoboxDataModel extends Model {
	constructor(properties = {}) {
		[this.title = ''] = properties;
		this.items = null;
		
		if (properties.items) {
			this.setItems(properties.items);
		}
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
		if (itemsArr.isArray()) {

			this.set('items', itemsArr);
			return this.items;

		} else {
			throw new TypeError('Argument provided to setItems(itemsArr) must be an array');
		}
	}
}
