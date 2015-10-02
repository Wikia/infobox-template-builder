'use strict';

class InfoboxTemplateBuilder {
	constructor(name) {
		this.name = name;
	}

	//temporary, just to make sure the unit tests work
	toString() {
		return 'My name is '+ this.name + '!';
	}
}
