'use strict';

import {InfoboxTemplateBuilder} from '../../core';
import {InfoboxData} from '../../models/infobox-data';

window.initializeDemo = initialize;

function initialize() {

	let demo, infobox;

	try {
		demo = document.getElementById('demo');

		infobox = new InfoboxTemplateBuilder({
			from: demo.value,
			persistOptions: {
				host: 'http://lizlux.liz.wikia-dev.com',
				title: 'Template:foobox'
			}
		});

		infobox.save();

		window.alert('New infobox created');

	} catch (e) {
		console.log(e.stack);

		const err = new Error(e.message || 'Not a valid infobox');

		window.alert(err);

		throw err;

	}

	// alias the infobox data model for easier handling
	let infoData = infobox.data;

	infoData.on('propertyDidChange', function () {
		infobox.save();
	});

	// bind to save event
	infobox.on('save', function (data) {
		demo.value = data;
	});

	function addTitle() {
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
}
