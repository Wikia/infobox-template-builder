'use strict';

export function equals(leftVal, rightVal, options) {
	if (arguments.length < 3)
		throw new Error("Handlebars Helper equal needs 2 parameters");
	if( leftVal != rightVal ) {
		return options.inverse(this);
	} else {
		return options.fn(this);
	}
}
