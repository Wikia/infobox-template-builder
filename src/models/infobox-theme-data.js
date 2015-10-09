'use strict';
import {Model} from './base';
import {isString} from '../validators';

const defaultProperties = {
	borderColor: null,
	accentColor: null
};

export class InfoboxThemeData extends Model {

	constructor(properties = {}) {
		super();

		Object.assign(this, defaultProperties, properties);

		this.extendValidation({
			borderColor: isString,
			accentColor: isString
		});
	}
}
