# Infobox Template Builder

This project provides a simple programmatic API for working with infoboxes. It's built for creating schemas with which Wikia users can build infoboxes. There's 4 main sections to this application: 

* The template builder core library, including classes for individual node types
* Serializers for converting data to and from strings
* Adapters for persisting to a given data store
* A user interface for manipulating data (currently a bare-bones demo page)

The application is meant to be run entirely in a browser, and has no server-side functionality at this time. 

## API Docs
Please see the [docs directory](docs) for information on how to use this library. 

## Using this library in production
To use this library in production, please use one of the common distribution [formats provided here](https://github.com/Wikia/infobox-template-builder/tree/dev/dist). The library depends on several libraries which have been omitted from our distributions in the case that you are already using these libaries. If not, you will need to include these dependencies yourself, before invoking this library.
#### Production dependencies:
* EventEmitter@^4.3.0 [source](https://github.com/Olical/EventEmitter) 
* Handlebars@^4.0.3 [source](https://github.com/wycats/handlebars.js/)

## Development
### Getting Started
First, install your node dependencies by running:

`$ npm install && sudo npm install -g jspm`

You can test in the browser by running:

`$ npm run dev`

The page will be available via `localhost:8000`.

### ES6
This project uses [Babel](https://babeljs.io/) for [EcmaScript 6](https://babeljs.io/docs/learn-es2015/) transpilation. [JSPM](http://jspm.io/) provides module loading (through SystemJS) and also allows you to automatically transpile ES6 code in your browser, eliminating the need for compilation while developing.

### Testing
To run unit tests, run `$ npm test`. Tests are also run after every commit with [TravisCI](https://travis-ci.org/profile/Wikia).
