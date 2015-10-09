export function isString(input) {
	return typeof input === 'string';
}

export function isNumeric(input) {
	return !isNaN(parseFloat(n)) && isFinite(n);
}

export function isObject(input) {
	return Object.prototype.toString.call(input) === '[object Object]';
}
