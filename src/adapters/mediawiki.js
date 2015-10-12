'use strict';

import 'jquery';
import {isString} from '../validators';

/**
 * persist
 *
 * @param xmlString {string} A serialized string of portable infobox xml
 * @param infoboxTitle {string} Name of the article where the infobox xml will be saved
 * @return {jQuery} jQuery promise
 */
export function persist(xmlString, infoboxTitle) {
	if (!xmlString || !isString(xmlString) || !infoboxTitle || !isString(infoboxTitle)) {
		throw new TypeError('Infobox title and value are required');
	}

	return $.when(getEditToken(infoboxTitle))
		.done(save.bind(null, xmlString, infoboxTitle));
}

/**
 *
 * @param xmlString {string} New value for the infobox xml
 * @param infoboxTitle {string} Name of the article where the infobox xml will be saved
 * @param editToken {string} Needed for authenticating request
 * @return {jQuery} jQuery promise
 */
function save(xmlString, infoboxTitle, editToken) {
	var $deferred = $.Deferred();

	$.ajax({
		url: '/api.php',
		data: {
			action: 'edit',
			title: infoboxTitle,
			text: xmlString,
			token: editToken,
			format: 'json'
		},
		dataType: 'json',
		method: 'POST',
		success: (resp) => {
			if (resp && resp.edit && resp.edit.result === 'Success') {
				$deferred.resolve();
			} else if (resp && resp.error) {
				$deferred.reject(resp.error.code);
			} else {
				$deferred.reject();
			}
		},
		error: (err) => {
			$deferred.reject(err);
		}
	});

	return $deferred;
}

/**
 *
 * @param infoboxTitle {string} Name of the article where the infobox xml will be saved
 * @return {jQuery} jQuery promise
 */
function getEditToken(infoboxTitle) {
	var $deferred = $.Deferred();

	$.ajax({
		url: '/api.php',
		method: 'POST',
		data: {
			action: 'query',
			prop: 'info',
			titles: infoboxTitle,
			intoken: 'edit',
			format: 'json'
		},
		dataType: 'json',
		success: (resp) => {
			var editToken,
				pages = resp.query.pages;

			if (pages) {
				// get edit token from MW API response
				editToken = pages[Object.keys(pages)[0]].edittoken;
				if (editToken === undefined) {
					$deferred.reject('noedit');
				}
				$deferred.resolve(editToken);
			} else {
				$deferred.reject();
			}
		},
		error: (err) => {
			$deferred.reject(err);
		}
	});

	return $deferred;
}
