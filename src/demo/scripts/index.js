'use strict';

import {InfoboxTemplateBuilder} from '../../core';
import {InfoboxData} from '../../models/infobox-data';

let demo = document.getElementById('demo');
let infobox = new InfoboxTemplateBuilder({
	from: demo.value
});

// alias the infobox data model for easier handling
let infoData = infobox.data;

// bind to save event
infobox.on('save', function (data) {
	demo.value = data;
});

function addTitle () {
	// Create a new field
	var title = InfoboxData.newElement('Title', {
		defaultValue: 'Dang',
		label: 'Who let the dogs out?',
		boundVariableName: 'foo'
	});

	// And add it to the infobox data model instance
	infoData.add(title);
}

function addGroup() {
	// Create a new field
	var title = InfoboxData.newElement('Title', {
		defaultValue: 'Default title value',
		label: 'Title Label',
		boundVariableName: 'title'
	});

	// Or create a new group, with that field
	var group = InfoboxData.newElement('Group', {
		items: [title]
	});

	// Add more fields to that group
	group.add(InfoboxData.newElement('Image', {
		defaultValue: 'dang.png',
		label: 'Avatar',
		boundVariableName: 'bar'
	}));

	// and finally add that group to the infobox data instance
	infoData.add(group);
}

window.infobox = infobox;
window.addTitle = addTitle;
window.addGroup = addGroup;
