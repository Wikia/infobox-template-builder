# Serialization

Serialization methods live in the [src/serializers](../src/serializers) directory. Each serializer in that directory should contain a `serialize` and `desrialize` method. 

`serialize` takes two arguments: an instance of `InfoboxData` and an instance of `InfoboxThemeData`, and returns a serialized string that can be stored in a database. 
`deserilize` takes one argument: a string representation of the data. It returns an object containing a new `InfoboxData` instance and a new `InfoboxThemeData` instance. 

#### Example
```javascript
import {serialize, deserialize} from 'path/to/serializer';

let xml = `<infobox>...</infobox>`;
let obj = deserializ(xml);
let data = obj.data; // InfoboxData instance or null
let theme = obj.theme; // InfoboxThemeData instance or null
let backToXml = serialize(data, theme);

xml === backToXml; // true as long as whitespace is maintained with something like [formatXml](../src/serializers/helpers.js) 
```

Note that there are no public APIs for serializers, they are called by `InfoboxTemplateBuilder` when initializing and saving infoboxe templates. 