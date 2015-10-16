import {isNumeric, isString} from './validators';

'use strict';
export function deepSet(str, val, context = this) {
	var parts,
		i;

	if (typeof str !== 'string') {

		throw Error('value provided to the first argument of deepSet must be a string');

	} else {

		parts = str.split('.');
	}

	for (i = 0; i < parts.length; i++) {
		// if a obj is passed in and loop is assigning last variable in namespace
		if (i === parts.length - 1) {

			Object.defineProperty(context, parts[i], {
				configurable: true,
				enumerable: true,
				writable: true,
				value: val
			});

			context = context[parts[i]];

		} else {

			// if namespace doesn't exist, instantiate it as empty object
			context = context[parts[i]] = context[parts[i]] || {};
		}
	}

	return context;
}

/*
 * Returns a shallow copy of an array
 */
export function copyArray(arr = []) {
	return arr.slice(0);
}

/*
 * Given an array and two indices, swap the elements in place.
 */
export function swapArrayElements(arr, idx1, idx2) {

	if (!isNumeric(idx1) || !isNumeric(idx2)) {
		throw new TypeError('provided values for idx1 or idx2 must be integers');
	}

	const tmp = arr[idx2];

	arr[idx2] = arr[idx1];
	arr[idx1] = tmp;
	return arr;
}

/**
 * Given a shallow key/value pair, return a string that can be sent as xhr form data
 * @param data
 * @returns {string}
 */
export function serializeRequestData(data) {
	return Object.keys(data).map((key) =>
			`${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`
	).join('&');
}

/**
 * Helper function for POSTing with XMLHttpRequest
 * @param url {string} Resource to post to
 * @param options {object}
 */
export function xhrPost(url, options) {
	let xhr = new XMLHttpRequest();
	let {data, success, fail} = options;

	if (!url || !isString(url)) {
		throw new TypeError('URL string must be provided for an xhr call');
	}

	xhr.open('POST', url, true);
	xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

	if (success) {
		xhr.addEventListener('load', success);
	}
	if (fail) {
		xhr.addEventListener('error', fail);
	}
	if (data) {
		data = serializeRequestData(data);
	}

	xhr.send(data || null);
}
