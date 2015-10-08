'use strict';
import EventEmitter from 'event-emitter';
import {deepSet} from '../utils';

/**
 * @class Model
 * @description A simple implemenation of a model class that notifies provides a getter and setter that notifies on property changes
 */
export class Model {
	constructor() {
		const emitter = new EventEmitter();

		let emitterProxy = {};

		this.validators = {};

		console.log('In Model constructor');
		Object.keys(EventEmitter.prototype).forEach((methodName) => {
			console.log(methodName);
			console.log('EventEmitter.prototype[' + methodName + '].bind: ' + EventEmitter.prototype[methodName].bind);
			emitterProxy[methodName] = EventEmitter.prototype[methodName].bind(emitter);
		});
		console.log('Model after event emitter');

		Object.assign(Object.getPrototypeOf(this), emitterProxy);
	}

	extendValidation(validators) {
		Object.keys(validators).forEach(key => {
			this.validators[key] = validators[key];
		});
	}

	set(propName, newValue) {
		const oldValue = this[propName];

		if (this.validators[propName]) {
			const isValid = this.validators[propName].validator();

			if (!isValid) {
				throw new TypeError(`${propName} should be of ${this.validators[propName].type}`);
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
			return properties;
		}
	}

	get(propName) {
		return this[propName];
	}
}
