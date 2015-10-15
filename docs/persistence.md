# Saving an infobox

To save the infobox, simply call:
```javascript
infobox.save();
```
To save to MediaWiki (which is the default data store), the `InfoboxTemplateBuilder` instance must contain a `persistOptions` property with a `title` value set.  
