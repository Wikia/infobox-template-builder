import * as Types from './all';

'use strict';

QUnit.module('element types', {
	beforeEach() {
		this.title = new Types.Title({
			boundVariableName: 'foo',
			defaultValue: 'foo',
			stringTemplate: 'foo',
			value: 'foo'
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

		this.field = new Types.Field({
			boundVariableName: 'foo',
			defaultValue: 'foo',
			label: 'foo',
			stringTemplate: 'foo'
		});
	}
});

QUnit.test('Title', function (assert) {
	assert.strictEqual(this.title.get('boundVariableName'), 'foo', 'boundVariableName should be set');
	assert.strictEqual(this.title.get('defaultValue'), 'foo', 'defaultValue should be set');
	assert.strictEqual(this.title.get('stringTemplate'), 'foo', 'stringTemplate should be set');
	assert.strictEqual(this.title.get('value'), 'foo', 'value should be set');
});

QUnit.test('Image', function (assert) {
	assert.strictEqual(this.image.get('boundVariableName'), 'foo', 'boundVariableName should be set');
	assert.strictEqual(this.image.get('defaultValue'), 'foo', 'defaultValue should be set');
	assert.strictEqual(this.image.get('altBoundVariableName'), 'foo', 'altBoundVariableName should be set');
	assert.strictEqual(this.image.get('altDefaultValue'), 'foo', 'altDefaultValue should be set');
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

QUnit.test('Group', function (assert) {
	let group = new Types.Group({
		items: [
			this.title,
			this.image,
			this.field
		]
	});

	assert.ok(group.get('items')[0] instanceof Types.Title, 'Title object should be set');
	assert.ok(group.get('items')[1] instanceof Types.Image, 'Image object should be set');
	assert.ok(group.get('items')[2] instanceof Types.Field, 'Field object should be set');
});
