import {Collection} from '../models/collection';
import {isString} from '../validators';

const defaultProperties = {
	_nodeType: 'group',
	layout: null,
	show: null
};

export class Group extends Collection {

	constructor(properties = {}) {

		super();

		Object.assign(this, defaultProperties, properties);

		this.extendValidation({
			layout: isString,
			show: isString
		});
	}
}
