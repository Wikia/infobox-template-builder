# Infobox Template Builder

At it's core, this project is a library for manipulating data structures. It's built for creating templates for Wikia users to build infoboxes. There's 4 main sections to this application: 

* The template builder core library, including classes for individual node types
* Serializers for converting data to and from strings
* Adapters for persisting to a given data store
* A user interface for manipulating data (currently a bare-bones demo page)

The application is meant to be run entirely in a browser, and has no server-side functionality at this time. 

## API Docs
Please see the [docs directory](docs) for information on how to use this library. 

## Development
### Getting Started
First, install your node dependencies by running:

`$ npm install && sudo npm install -g jspm`

You can test in the browser by running:

`$ npm run dev`

The page will be available via `localhost:8000`.

### ES6
This project uses [Babel](https://babeljs.io/) for [EcmaScript 6](https://babeljs.io/docs/learn-es2015/) transpilation. [JSPM](http://jspm.io/) works as a module loader as well as a method for making ES6 syntax available in the browser.

### Testing
To run unit tests, run `$ npm test`. Tests are also run after every commit with [TravisCI](https://travis-ci.org/profile/Wikia).
