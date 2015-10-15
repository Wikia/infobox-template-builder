# Infobox Template Builder

## Public API

#### Create a new infbox template builder instance
```javascript
var infobox = new InfoboxTemplateBuilder({
  persistOptions: {
    title: 'Template:FooBox'
  }
});
```

#### Create from existing data
```javascript
var infobox = new InfoboxTemplateBuilder({
  from: '<infobox><title src="title"></title></infobox>',
  persistOptions: {
    title: 'Template:FooBox'
  }
});
```

Upon instantiation, the `infobox` object will have two properties that represent data related to the infobox: `infobox.data`, which is an istance of the `InfoboxData` class, and `infobox.theme`, which is a instance of InfoboxThemeData. 

#### InfoboxData class
The `InfoboxData` class is where the structure of the infobox template is stored. This is where you can add, remove, and swap rows in the the infobox template. 

#### InfoboxThemeData class
The `InfoboxThemeData` class is where custom styles of the infobox are stored. 

#### Adding a row to an infobox template
`InfoboxData` has a `newElement` function that is available both statically and via an `InfoboxData` instance. Here's an example usage: 
```javascript
// create infobox instance
var infobox = new InfoboxTemplateBuilder();

// create and add a title
var title = infobox.data.newElement('Title', {
	boundVariableName: 'title'
});
infobox.data.add(title);

// create and add an image
var img = infoData.newElement('Image', {
	boundVariableName: 'character_image',
	caption: infoData.newElement('Caption', {
		boundVariableName: 'image_caption'
	})
});
infobox.data.add(image);
```

#### Adding a group to an infobox template
Adding a group is the same as adding an element, but you can also add elements to groups. 

```javascript
var field1 = infoData.newElement('Field', {
	boundVariableName: 'first_appearance'
	label: 'First Apearance',
	defaultValue: 'Season 1, Episode 1',
});

var group = infoData.newElement('Group', {
	items: [field1]
});

var field2 = infoData.newElement('Field', {
	boundVariableName: 'last_appearance'
	label: 'Last Apearance',
	defaultValue: 'N/A',
});

group.add(field2);
infobox.data.add(group);
```
Note that the `boundVariableName` is the key that identifies the cell in the infobox.  

### Saving an infobox
To save the infobox, simply call:
```javascript
infobox.save();
```
To save to MediaWiki (which is the default data store), the `InfoboxTemplateBuilder` instance must contain a `persistOptions` property with a `title` value set.  

### Serialization

Serialization methods live in the [/src/serializers](https://github.com/Wikia/infobox-template-builder/tree/dev/src/serializers/) directory. Each serializer in that directory should contain a `serialize` and `desrialize` method. 

`serialize` takes two arguments: an instance of `InfoboxData` and an instance of `InfoboxThemeData`, and returns a serialized string that can be stored in a database. 

`deserilize` takes one argument: a string representation of the data. It returns an object containing a new `InfoboxData` instance and a new `InfoboxThemeData` instance. 

### Events
This app uses an [EventEmitter](https://github.com/Olical/EventEmitter) library, which can be used for communication between user actions and the core API. For more information on the EventEmitter API, see [the docs](https://github.com/Olical/EventEmitter/blob/master/docs/api.md). 

## Development
### Getting Started
First, install your node dependencies by running:

`$ npm install && sudo npm install -g jspm`

The source is written using ES6 transpiled by bower. You can test in the browser by running:

`$ npm run dev`

The page will be available via `localhost:8000`.

### ES6


### Testing
To run unit tests, run `$ npm test`. Tests are also run after every commit with TravisCI
