export const AttributeMixin = Object.create(null, {
	attributes: {writable: true, configurable: false, enumerable: true, value: []},
	addAttribute: {
		writable: false,
		configurable: false,
		enumerable: false,
		value (name, value) {

			if (!isString(name) || !isString(value)) {
				throw new TypeError('attribute.name & attribute.value must be a string');
			}

			this.attributes.push({name, value});
		} 
	}
});
