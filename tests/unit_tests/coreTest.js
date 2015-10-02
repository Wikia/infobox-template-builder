QUnit.test('Core Test', function(assert) {
	// Setup the various states of the code you want to test and assert conditions.
	var foo = new InfoboxTemplateBuilder('Andrew\'s Infobox Template Builder');
	assert.equal(foo.toString(), 'My name is Andrew\'s Infobox Template Builder!', 'toString() Test');
});
