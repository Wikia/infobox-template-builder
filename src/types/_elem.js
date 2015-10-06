'use strict';
import {Model} from '../models/base';
import {isString} from '../validators';
import {AttributeMixin} from './mixins';

const defaultProperties = {
	_nodeType: 'elem',
	boundVariableName: null,
	defaultValue: null
};

export class Elem extends Model {

	constructor(properties = {}) {

		super();

		Object.assign(this, AttributeMixin, defaultProperties, properties);

		this.extendValidation({
			boundVariableName: isString,
			defaultValue: isString
		});
	}
}
