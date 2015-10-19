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
	if (
		!xmlString ||
		!isString(xmlString) ||
		!isString(options.title)
	) {
		throw new TypeError('Infobox title and xml are required for saving to MediaWiki');
	}

	return getEditToken(options)
			.then(save.bind(null, xmlString, options));
}

/**
 * Send request to MW API to save infobox article with new data
 * @param xmlString {string} New value for the infobox xml
 * @param options {object} Persist options including title and optional domain for saving
 * @param editToken {string} Needed for authenticating request
 * @return {Promise}
 */
function save(xmlString, options, editToken) {
	return new Promise(function (resolve, reject) {
		xhrPost((options.domain || '') + '/api.php', {
			data: {
				action: 'edit',
				title: options.title,
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
 * @param options {object} Persist options including title and optional domain for getting edit token
 * @return {Promise}
 */
function getEditToken(options) {
	return new Promise(function (resolve, reject) {
		xhrPost((options.domain || '') + '/api.php', {
			data: {
				action: 'query',
				prop: 'info',
				titles: options.title,
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
