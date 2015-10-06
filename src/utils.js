import {isNumeric} from './validators';

'use strict';
export function deepSet(str, val, context = this) {
	var parts,
		i,
		properties;

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
	const tmp = arr[idx2];

	if (!isNumeric(idx1) || !isNumeric(idx2)) {
		throw new TypeError('provided values for idx1 or idx2 must be integers');
	}

	arr[idx2] = arr[idx1];
	arr[idx1] = tmp;
	return arr;
}
