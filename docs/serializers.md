# Serialization

## Anatomy of a serializer
Provided serialization methods live in the [src/serializers](../src/serializers) directory. Each serializer in that directory should expose a `serialize` and `deserialize` method, as well as an `attributes` property containing the name and version of the serializer. 

Example serializer:
```es6
{
	attributes: {
		name: 'FooSerializer',
		version: '0.1.0'
	},
	serialize: function () {}, // Returns data serialized to intended target's format
	deserialize: function () {}, // Returns a object to be consumed by the builder
	persist: function () {} // returns a Promise
}
```

## Serializer Methods

### serialize(data: InfoboxData, theme: InfoboxThemeData): any
Implement the `serialize` method to contain the specific logic to transform data for your persistence target.

### deserialize(doc: string): {data: InfoboxData, theme: InfoboxThemeData}
`deserialize` takes one argument: a string representation of the data. It returns an object containing a new `InfoboxData` instance and a new `InfoboxThemeData` instance. 

### persist(doc: any, persistOptions: any): Promise
`persist` takes a document, and an arbitary options object. When building a serializer, you can re-export an existing persistence adapter or implement your own.

#### Example
```javascript
import {serialize, deserialize} from 'path/to/serializer';
import {formatXml} from 'path/to/helpers';

let xml = `<infobox>...</infobox>`;
let obj = deserialize(xml);

let data = obj.data; // InfoboxData instance or null
let theme = obj.theme; // InfoboxThemeData instance or null
let backToXml = serialize(data, theme);

formatXml(xml) === backToXml; // true 
```
Note that there are no public APIs for serializers, they are called by `InfoboxTemplateBuilder` when initializing and saving infobox templates. 
