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
			const isValid = this.validators[propName](newValue);

			if (!isValid) {
				throw new TypeError(`${propName} did not pass the "${this.validators[propName].name}" validator`);
			}
		}

		deepSet.call(this, propName, newValue);

		this.emit('propertyDidChange', {
			propName,
			oldValue,
			newValue
		});
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
