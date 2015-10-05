import {Field} from './field';

const defaultProperties = {
	layout: null,
	show: null,
	items: []
};

export class Group extends Field {

	constructor(properties = {}) {

		super();

		Object.assign(this, defaultProperties, properties);
		// this.header doesn't exist, a group's <header> tag will be rendered from group.label

		if (this.layout) {
			this.addAttribute('layout', this.layout);
		}

		if (this.show) {
			this.addAttribute('show', this.show);
		}
	}
}
