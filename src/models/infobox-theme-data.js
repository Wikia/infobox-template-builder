'use strict';
import {Model} from './base';
import {isString} from '../validators';


export class InfoboxThemeData extends Model {

	constructor(properties = {}) {
		const defaultProperties = {
			borderColor: null,
			accentColor: null,
			validators: {
				borderColor: isString,
				accentColor: isString
			}
		};

		super(Object.assign(defaultProperties, properties));
	}
}
