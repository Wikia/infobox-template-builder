'use strict';
import {Model} from '../models/base';
import {isString} from '../validators';

export class Elem extends Model {

	constructor(properties = {}) {

		const defaultProperties = {
			_nodeType: 'elem',
			boundVariableName: null,
			defaultValue: null
		};

		// Merge validators from the inheritance chain
		const mergedValidators = Object.assign({
			boundVariableName: isString,
			defaultValue: isString
		}, properties.validators);

		// Here we clobber the validators with the mergedValidators
		super(Object.assign(defaultProperties, properties, {validators: mergedValidators}));
	}
}
