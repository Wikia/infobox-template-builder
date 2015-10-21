export function isString(input) {
	return typeof input === 'string';
}

export function isNumeric(input) {
	return !isNaN(parseFloat(input)) && isFinite(input);
}

export function isObject(input) {
	return Object.prototype.toString.call(input) === '[object Object]';
}

export function isValidAdapter(input) {
	debugger;
	return (
		isObject(input.attributes) &&
		isObject(input.persistOptions) &&
		isString(input.attributes.name) &&
		isString(input.attributes.version) &&
		isFunction(input.persist) &&
		isFunction(input.serialize)
	);
}

export function isFunction(input) {
	return typeof input === 'function';
}

export function areValidRoutines(input) {
	if (!isNumeric(input.length)) {
		return false;
	}

	let i = 0;
	let invalid = [];

	while (i < input.length) {
		let adapter = input[i];

		if (!isValidAdapter(adapter)) {
			invalid.push(adapter);
		}

		i++;
	}

	return invalid.length === 0;
}
