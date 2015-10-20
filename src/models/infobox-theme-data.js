'use strict';
import {Model} from './base';
import {isString} from '../validators';


export class InfoboxThemeData extends Model {

	constructor(properties = {}) {
		const defaultProperties = {
			validators: {
				borderColor: isString,
				accentColor: isString
			},
			borderColor: null,
			accentColor: null
		};

		super(Object.assign(defaultProperties, properties));
	}
}
