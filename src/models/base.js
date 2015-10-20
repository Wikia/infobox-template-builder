'use strict';
import EventEmitter from 'event-emitter';
import {deepSet} from '../utils';

/**
 * @class Model
 * @description A simple implemenation of a model class that notifies provides a getter and setter that
 * notifies on property changes
 */
export class Model {
	constructor(properties = {}) {
		const emitter = new EventEmitter();

		this.validators = {};

		let emitterProxy = {};

		Object.keys(EventEmitter.prototype).forEach((methodName) => {
			emitterProxy[methodName] = EventEmitter.prototype[methodName].bind(emitter);
		});

		Object.assign(Object.getPrototypeOf(this), emitterProxy);

		this.setProperties(properties);
	}

	set(propName, newValue) {
		const oldValue = this[propName];

		if (newValue && this.validators[propName]) {
			this.validateProperty(this.validators[propName], newValue, propName);
		}

		deepSet.call(this, propName, newValue);

		this.emit('propertyDidChange', {
			propName,
			oldValue,
			newValue
		});

		if (propName === 'validators') {
			for (let property in newValue) {
				if (this.get(property) !== undefined || this.get(property) !== null) {
					let validator = newValue[property];
					this.validateProperty(validator, property, this.get(property));
				}


				console.log(property);
				console.log(newValue[property]);
			}
		}

	}

	validateProperty(validator, propName, value) {
		const isValid = validator(value);

		if (!isValid) {
			throw new TypeError(`${propName} did not pass the "${validator.name}" validator`);
		}
	}

	setProperties(properties) {
		for (let prop in properties) {
			this.set(prop, properties[prop]);
		}
		return properties;
	}

	get(propName) {
		return this[propName];
	}
}
