QUnit.test('Core Test', function(assert) {
    // Setup the various states of the code you want to test and assert conditions.
    assert.equal(1, 1, '1 === 1');
    assert.ok(true, 'true is truthy');
    assert.ok(1, '1 is also truthy');
    assert.ok([], 'so is an empty array or object');
});
