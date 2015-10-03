import {Field} from './field';

const defaultProperties = {
	layout: null,
	show: null
};

export class Group extends Field {

	constructor(properties = {}) {

		super();
		
		Object.assign(this, defaultProperties, properties);
		// this.header doesn't exist, a group's <header> tag will be rendered from group.label

		this.addAttribute('layout', properties.layout);
		this.addAttribute('show', properties.show);


	}

}
