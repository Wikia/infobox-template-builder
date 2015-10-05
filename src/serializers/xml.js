'use strict';
import {InfoboxThemeData} from '../InfoboxThemeData';

export function serialize(data, theme) {
}

export function deserialize(doc) {
	return {
		data: null,
		theme: new InfoboxThemeData()
	};
}
