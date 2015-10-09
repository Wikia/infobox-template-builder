export function isString(input) {
	return typeof input === 'string';
}

export function isNumeric(input) {
	return !isNaN(parseFloat(input)) && isFinite(input);
}

export function isObject(input) {
	return Object.prototype.toString.call(input) === '[object Object]';
}
