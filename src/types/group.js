import {Collection} from '../models/collection';
import {isString} from '../validators';

export class Group extends Collection {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'group',
			layout: null,
			show: null,
			validators: {
				layout: isString,
				show: isString
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
