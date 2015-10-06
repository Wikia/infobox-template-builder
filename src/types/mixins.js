'use strict';
import {isString} from '../validators';

/**
 * AttributeMixin
 * @description This is a mixin for adding attribute support to a node
 * Attributes are simple key:value pairs meant to store any client specific implementation details for a node
 * @mixin
 */
export const AttributeMixin = Object.create(null, {
	attributes: {writable: true, configurable: false, enumerable: true, value: {}},
	addAttribute: {
		writable: false,
		configurable: false,
		enumerable: true,
		value(name, value) {

			if (!isString(name) || !isString(value)) {
				throw new TypeError('attribute.name & attribute.value must be a string');
			}

			this.attributes[name] = value;
		} 
	}
});
