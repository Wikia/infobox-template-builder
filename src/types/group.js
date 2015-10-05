import {Collection} from '../models/collection';
import {AttributeMixin} from './mixins';

const defaultProperties = {
	layout: null,
	show: null,
	items: []
};

export class Group extends Collection {

	constructor(properties = {}) {

		super();
		this._model = 'group';

		Object.assign(this, AttributeMixin, defaultProperties, properties);
		// this.header doesn't exist, a group's <header> tag will be rendered from group.label

		if (this.layout) {
			this.addAttribute('layout', this.layout);
		}

		if (this.show) {
			this.addAttribute('show', this.show);
		}

	}
}
