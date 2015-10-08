import {Model} from './base';
import {isNumeric} from '../validators';
import {copyArray, swapArrayElements} from '../utils';

export class Collection extends Model {
	constructor(properties = {}) {
		super();
		this.items = [];
		Object.assign(this, properties);
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

		if (!isNumeric(index)) {
			throw new TypeError('index must be an integer');
		}

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
