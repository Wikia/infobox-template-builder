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
