if (!Function.prototype.bind) {
  Function.prototype.bind = function (oThis) {
    if (typeof this !== "function") {
      // closest thing possible to the ECMAScript 5
      // internal IsCallable function
      throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
    }

    var aArgs = Array.prototype.slice.call(arguments, 1),
        fToBind = this,
        fNOP = function () {},
        fBound = function () {
          return fToBind.apply(this instanceof fNOP && oThis
                 ? this
                 : oThis,
                 aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

define(['build'], function(InfoboxTemplateBuilder) {

//	QUnit.module('InfoboxTemplateBuilder:');

	QUnit.test('constructor()', function(assert) {
		// Setup the various states of the code you want to test and assert conditions.
		var infobox = new InfoboxTemplateBuilder();
		assert.notEqual(infobox, undefined);
		assert.ok(infobox instanceof InfoboxTemplateBuilder);
	});

	// QUnit.test('save()', function(assert) {
	// 	// Setup the various states of the code you want to test and assert conditions.
	// 	var infobox= new InfoboxTemplateBuilder();
	// 	var saveValue = infobox.save();
	// 	assert.notEqual(saveValue, undefined);
	// });
	//
	// QUnit.test('save()', function(assert) {
	// 	// Setup the various states of the code you want to test and assert conditions.
	// 	var infobox= new Model();
	// 	var saveValue = infobox.save();
	// 	assert.notEqual(saveValue, undefined);
	// });

});
