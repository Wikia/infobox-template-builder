System.config({
  baseURL: "/",
  defaultJSExtensions: true,
  transpiler: "babel",
  babelOptions: {
    "optional": [
      "runtime",
      "optimisation.modules.system"
    ]
  },
  paths: {
    "github:*": "jspm_packages/github/*",
    "npm:*": "jspm_packages/npm/*"
  },

  map: {
    "babel": "npm:babel-core@5.8.29",
    "babel-runtime": "npm:babel-runtime@5.8.29",
    "core-js": "npm:core-js@1.2.3",
    "event-emitter": "npm:wolfy87-eventemitter@4.3.0",
    "handlebars": "github:components/handlebars.js@4.0.3",
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "npm:babel-runtime@5.8.29": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:core-js@1.2.3": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "process": "github:jspm/nodelibs-process@0.1.1",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:wolfy87-eventemitter@4.3.0": {
      "fs": "github:jspm/nodelibs-fs@0.1.2"
    }
  }
});
