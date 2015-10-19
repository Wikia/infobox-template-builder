import * as Types from './all';

'use strict';

QUnit.module('element types', {
	beforeEach() {
		this.field = new Types.Field({
			boundVariableName: 'foo',
			defaultValue: 'foo',
			label: 'foo',
			stringTemplate: 'foo'
		});

		this.image = new Types.Image({
			boundVariableName: 'foo',
			defaultValue: 'foo',
			altBoundVariableName: 'foo',
			altDefaultValue: 'foo',
			caption: new Types.Group({
				boundVariableName: 'foo',
				defaultValue: 'foo',
				label: 'foo',
				stringTemplate: 'foo'
			})
		});
	}
});

QUnit.test('Caption', function (assert) {
	assert.strictEqual(this.image.get('caption').get('boundVariableName'), 'foo', 'boundVariableName should be set');
	assert.strictEqual(this.image.get('caption').get('defaultValue'), 'foo', 'defaultValue should be set');
	assert.strictEqual(this.image.get('caption').get('stringTemplate'), 'foo', 'stringTemplate should be set');
});

QUnit.test('Field', function (assert) {
	assert.strictEqual(this.field.get('boundVariableName'), 'foo', 'boundVariableName should be set');
	assert.strictEqual(this.field.get('defaultValue'), 'foo', 'defaultValue should be set');
	assert.strictEqual(this.field.get('label'), 'foo', 'label should be set');
	assert.strictEqual(this.field.get('stringTemplate'), 'foo', 'stringTemplate should be set');
});

//QUnit.test('Group', function (assert) {
//});
