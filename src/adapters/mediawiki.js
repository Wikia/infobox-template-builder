'use strict';

import {isString} from '../validators';

/**
 * persist
 *
 * @param infoboxTitle {string} Name of the article where the infobox xml will be saved
 * @param xmlString {string} A serialized string of portable infobox xml
 * @return {jQuery} jQuery promise
 */
export function persist(infoboxTitle, xmlString) {
	if (
		!xmlString ||
		!isString(xmlString) ||
		!infoboxTitle ||
		!isString(infoboxTitle)
	) {
		throw new TypeError('Infobox title and xml are required for saving to MediaWiki');
	}

	return new Promise(function (resolve, reject) {
		getEditToken(infoboxTitle)
			.then(save.bind(null, xmlString, infoboxTitle))
	});
}

/**
 * Send request to MW API to save infobox article with new data
 * @param xmlString {string} New value for the infobox xml
 * @param infoboxTitle {string} Name of the article where the infobox xml will be saved
 * @param editToken {string} Needed for authenticating request
 * @return {jQuery} jQuery promise
 */
function save(xmlString, infoboxTitle, editToken) {
	return new Promise(function (resolve, reject) {
		let xhr = new XMLHttpRequest();
		let data = {
			action: 'edit',
			title: infoboxTitle,
			text: xmlString,
			token: editToken,
			format: 'json'
		};

		xhr.open('POST', '/api.php', true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.send(JSON.stringify(data));
		xhr.addEventListener('load', (response) => {
			if (response && response.edit && response.edit.result === 'Success') {
				resolve();
			} else if (response && response.error) {
				reject(response.error.code);
			} else {
				reject();
			}
		});
	});
}

/**
 * Get an edit token so we can save an article via MW API
 * @param infoboxTitle {string} Name of the article where the infobox xml will be saved
 * @return {jQuery} jQuery promise
 */
function getEditToken(infoboxTitle) {
	return new Promise(function (resolve, reject) {
		let xhr = new XMLHttpRequest();
		let data = {
			action: 'query',
			prop: 'info',
			titles: infoboxTitle,
			intoken: 'edit',
			format: 'json'
		};

		xhr.open('POST', '/api.php', true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.send(JSON.stringify(data));
		xhr.addEventListener('load', (response) => {
			var editToken,
				pages = response.query.pages;

			if (pages) {
				// get edit token from MW API response
				editToken = pages[Object.keys(pages)[0]].edittoken;
				if (editToken === undefined) {
					reject('noedit');
				}
				resolve(editToken);
			} else {
				reject();
			}
		});
	});
}
