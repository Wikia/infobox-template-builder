# Public API

#### Create a new infbox template builder instance
All parameters  for `InfoboxTemplateBuilder` are optional, though in order to save to MediaWiki, a title value is required inside the `persistOptions` object. 

```javascript
var adapter = {
  name: 'XMLSerializer',
  persistOptions: {
    value: {
      title: 'Template:FooBox',
      host: 'http://lizlux.liz.wikia-dev.com'
    }
  }
};

var infobox = new InfoboxTemplateBuilder({
	routines: [adapter]
});
```

#### Create from existing data
```javascript
var infobox = new InfoboxTemplateBuilder({
  from: {
	src: '<infobox><title src="title"></title></infobox>',
    // Because we support multiple serializers, you need to specify which one you want to use to deserialize from
	deserializeWith: 'XMLSerializer' 
  },
  routines: [adapter]
});
```

Upon instantiation, the `infobox` object will have two properties that represent data related to the infobox: `infobox.data`, which is an istance of the `InfoboxData` class, and `infobox.theme`, which is a instance of InfoboxThemeData. 

#### InfoboxData class
The `InfoboxData` class is where the structure of the infobox template is stored. This is where you can add, remove, and swap rows in the the infobox template. 

#### InfoboxThemeData class
The `InfoboxThemeData` class is where custom styles of the infobox are stored. 

#### Adding a row to an infobox template
`InfoboxData` has a `newElement` function that is available both statically and non-statically, via an `InfoboxData` instance. Here's an example usage: 
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
// create new field element
var field1 = infoData.newElement('Field', {
	boundVariableName: 'first_appearance'
	label: 'First Apearance',
	defaultValue: 'Season 1, Episode 1',
});

// create a new group with that element
var group = infoData.newElement('Group', {
	items: [field1]
});

// create another field element
var field2 = infoData.newElement('Field', {
	boundVariableName: 'last_appearance'
	label: 'Last Apearance',
	defaultValue: 'N/A',
});

// add the second element to the group
group.add(field2);

// add the group to the infobox data instance
infobox.data.add(group);
```
Note that the `boundVariableName` is the key that identifies a cell in an infobox.  
