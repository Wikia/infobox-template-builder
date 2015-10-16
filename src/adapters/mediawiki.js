'use strict';

import {isString} from '../validators';
import {xhrPost} from '../utils';

/**
 * Save infobox XML to MediaWiki
 *
 * @param xmlString {string} A serialized string of portable infobox xml
 * @param options {object} Config for persistence
 * @return {Promise}
 */
export function persist(xmlString, options) {
	const {title} = options;

	if (
		!xmlString ||
		!isString(xmlString) ||
		!isString(title)
	) {
		throw new TypeError('Infobox title and xml are required for saving to MediaWiki');
	}

	return getEditToken(title)
			.then(save.bind(null, xmlString, title));
}

/**
 * Send request to MW API to save infobox article with new data
 * @param xmlString {string} New value for the infobox xml
 * @param title {string} Name of the article where the infobox xml will be saved
 * @param editToken {string} Needed for authenticating request
 * @return {Promise}
 */
function save(xmlString, title, editToken) {
	return new Promise(function (resolve, reject) {
		xhrPost('http://lizlux.liz.wikia-dev.com/api.php', {
			data: {
				action: 'edit',
				title: title,
				text: xmlString,
				token: editToken,
				format: 'json'
			},
			success: (event) => {
				const xhr = event.target;
				const response = JSON.parse(xhr.responseText);
				if (response.edit && response.edit.result === 'Success') {
					resolve();
				} else if (response.error) {
					reject(response.error.code);
				} else {
					reject('Bad request');
				}
			},
			fail: () => reject('Bad request')
		});
	});
}

/**
 * Get an edit token so we can save an article via MW API
 * @param title {string} Name of the article where the infobox xml will be saved
 * @return {Promise}
 */
function getEditToken(title) {
	return new Promise(function (resolve, reject) {
		xhrPost('http://lizlux.liz.wikia-dev.com/api.php', {
			data: {
				action: 'query',
				prop: 'info',
				titles: title,
				intoken: 'edit',
				format: 'json'
			},
			success: function (event) {
				const xhr = event.target;
				const response = JSON.parse(xhr.responseText);
				if (response.error) {
					reject(response.error.code);
				} else {
					const pages = response.query.pages;
					if (pages) {
						// get edit token from MW API response
						const editToken = pages[Object.keys(pages)[0]].edittoken;
						if (editToken === undefined) {
							reject('No edit token');
						}
						resolve(editToken);
					} else {
						reject();
					}
				}
			},
			fail: () => reject('Bad request')
		});
	});
}
