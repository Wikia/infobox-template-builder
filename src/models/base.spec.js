'use strict';

import {Model} from './base';
import {isString} from '../validators';


QUnit.module('Model');

QUnit.test('Model constructor', function(assert) {
     var model = new Model();

     assert.ok(model !== null);
});

QUnit.test('Model extendValidation, set, and get', function(assert) {
     var model = new Model();
	 var validators = {'testKey': isString};

	 model.extendValidation(validators);

	 try {
	 	model.set('testKey', 4);
	 } catch (e) {
	 	assert.ok(e instanceof TypeError, 'Setting an invalid type should throw a TypeError');
	 }
	 assert.strictEqual(model.get('testKey'), undefined, 'nothing should be set with an invalid type');

	 model.set('testKey', 'testValue');
	 assert.strictEqual(model.get('testKey'), 'testValue', 'Getting and setting should work with valid property');
});
