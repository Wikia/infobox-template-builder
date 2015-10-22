'use strict';

import {persist} from './mediawiki';

QUnit.module('Adapter');

QUnit.test('MediaWiki persist()', function(assert) {
	var foo = function(func){
		return function() { return func(); };
	}

	var myAPI = { method: function () {} };
    var mock = sinon.mock(myAPI);
    mock.expects("method").once().returns(42);

    var proxy = foo(myAPI.method);

    assert.equal(proxy(), 42);
    mock.verify();

	assert.ok(true);
});
