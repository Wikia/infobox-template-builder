# Events

This app uses an [EventEmitter](https://github.com/Olical/EventEmitter) library, which can be used for communication between user actions and the core API. For more information on the EventEmitter API, see [the docs](https://github.com/Olical/EventEmitter/blob/master/docs/api.md).

#### Events in use
* `save` - Called when an `InfoboxTemplateBuilder` instance is saved successfully
* `errorWhileSaving` - Called when there's an error in calling `save` on an`InfoboxTemplateBuilder` instance
* `propertyDidChange` - Called when `set` is called on any `Model` or child instance