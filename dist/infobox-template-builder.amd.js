"format amd";
(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  var getOwnPropertyDescriptor = true;
  try {
    Object.getOwnPropertyDescriptor({ a: 0 }, 'a');
  }
  catch(e) {
    getOwnPropertyDescriptor = false;
  }

  var defineProperty;
  (function () {
    try {
      if (!!Object.defineProperty({}, 'a', {}))
        defineProperty = Object.defineProperty;
    }
    catch (e) {
      defineProperty = function(obj, prop, opt) {
        try {
          obj[prop] = opt.value || opt.get.call(obj);
        }
        catch(e) {}
      }
    }
  })();

  function register(name, deps, declare) {
    if (arguments.length === 4)
      return registerDynamic.apply(this, arguments);
    doRegister(name, {
      declarative: true,
      deps: deps,
      declare: declare
    });
  }

  function registerDynamic(name, deps, executingRequire, execute) {
    doRegister(name, {
      declarative: false,
      deps: deps,
      executingRequire: executingRequire,
      execute: execute
    });
  }

  function doRegister(name, entry) {
    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry;

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }


  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;

      if (typeof name == 'object') {
        for (var p in name)
          exports[p] = name[p];
      }
      else {
        exports[name] = value;
      }

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          for (var j = 0; j < importerModule.dependencies.length; ++j) {
            if (importerModule.dependencies[j] === module) {
              importerModule.setters[j](exports);
            }
          }
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = depEntry.esModule;
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;

    // create the esModule object, which allows ES6 named imports of dynamics
    exports = module.exports;
 
    if (exports && exports.__esModule) {
      entry.esModule = exports;
    }
    else {
      entry.esModule = {};
      
      // don't trigger getters/setters in environments that support them
      if (typeof exports == 'object' || typeof exports == 'function') {
        if (getOwnPropertyDescriptor) {
          var d;
          for (var p in exports)
            if (d = Object.getOwnPropertyDescriptor(exports, p))
              defineProperty(entry.esModule, p, d);
        }
        else {
          var hasOwnProperty = exports && exports.hasOwnProperty;
          for (var p in exports) {
            if (!hasOwnProperty || exports.hasOwnProperty(p))
              entry.esModule[p] = exports[p];
          }
         }
       }
      entry.esModule['default'] = exports;
      defineProperty(entry.esModule, '__useDefault', {
        value: true
      });
    }
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    // node core modules
    if (name.substr(0, 6) == '@node/')
      return require(name.substr(6));

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    // exported modules get __esModule defined for interop
    if (entry.declarative)
      defineProperty(entry.module.exports, '__esModule', { value: true });

    // return the defined module object
    return modules[name] = entry.declarative ? entry.module.exports : entry.esModule;
  };

  return function(mains, depNames, declare) {
    return function(formatDetect) {
      formatDetect(function(deps) {
        var System = {
          _nodeRequire: typeof require != 'undefined' && require.resolve && typeof process != 'undefined' && require,
          register: register,
          registerDynamic: registerDynamic,
          get: load, 
          set: function(name, module) {
            modules[name] = module; 
          },
          newModule: function(module) {
            return module;
          }
        };
        System.set('@empty', {});

        // register external dependencies
        for (var i = 0; i < depNames.length; i++) (function(depName, dep) {
          if (dep && dep.__esModule)
            System.register(depName, [], function(_export) {
              return {
                setters: [],
                execute: function() {
                  for (var p in dep)
                    if (p != '__esModule' && !(typeof p == 'object' && p + '' == 'Module'))
                      _export(p, dep[p]);
                }
              };
            });
          else
            System.registerDynamic(depName, [], false, function() {
              return dep;
            });
        })(depNames[i], arguments[i]);

        // register modules in this bundle
        declare(System);

        // load mains
        var firstLoad = load(mains[0]);
        if (mains.length > 1)
          for (var i = 1; i < mains.length; i++)
            load(mains[i]);

        if (firstLoad.__useDefault)
          return firstLoad['default'];
        else
          return firstLoad;
      });
    };
  };

})(typeof self != 'undefined' ? self : global)
/* (['mainModule'], ['external-dep'], function($__System) {
  System.register(...);
})
(function(factory) {
  if (typeof define && define.amd)
    define(['external-dep'], factory);
  // etc UMD / module pattern
})*/

(['1'], [], function($__System) {

(function(__global) {
  var loader = $__System;
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function readMemberExpression(p, value) {
    var pParts = p.split('.');
    while (pParts.length)
      value = value[pParts.shift()];
    return value;
  }

  // bare minimum ignores for IE8
  var ignoredGlobalProps = ['_g', 'sessionStorage', 'localStorage', 'clipboardData', 'frames', 'external', 'mozAnimationStartTime', 'webkitStorageInfo', 'webkitIndexedDB'];

  var globalSnapshot;

  function forEachGlobal(callback) {
    if (Object.keys)
      Object.keys(__global).forEach(callback);
    else
      for (var g in __global) {
        if (!hasOwnProperty.call(__global, g))
          continue;
        callback(g);
      }
  }

  function forEachGlobalValue(callback) {
    forEachGlobal(function(globalName) {
      if (indexOf.call(ignoredGlobalProps, globalName) != -1)
        return;
      try {
        var value = __global[globalName];
      }
      catch (e) {
        ignoredGlobalProps.push(globalName);
      }
      callback(globalName, value);
    });
  }

  loader.set('@@global-helpers', loader.newModule({
    prepareGlobal: function(moduleName, exportName, globals) {
      // disable module detection
      var curDefine = __global.define;
       
      __global.define = undefined;
      __global.exports = undefined;
      if (__global.module && __global.module.exports)
        __global.module = undefined;

      // set globals
      var oldGlobals;
      if (globals) {
        oldGlobals = {};
        for (var g in globals) {
          oldGlobals[g] = globals[g];
          __global[g] = globals[g];
        }
      }

      // store a complete copy of the global object in order to detect changes
      if (!exportName) {
        globalSnapshot = {};

        forEachGlobalValue(function(name, value) {
          globalSnapshot[name] = value;
        });
      }

      // return function to retrieve global
      return function() {
        var globalValue;

        if (exportName) {
          globalValue = readMemberExpression(exportName, __global);
        }
        else {
          var singleGlobal;
          var multipleExports;
          var exports = {};

          forEachGlobalValue(function(name, value) {
            if (globalSnapshot[name] === value)
              return;
            if (typeof value == 'undefined')
              return;
            exports[name] = value;

            if (typeof singleGlobal != 'undefined') {
              if (!multipleExports && singleGlobal !== value)
                multipleExports = true;
            }
            else {
              singleGlobal = value;
            }
          });
          globalValue = multipleExports ? exports : singleGlobal;
        }

        // revert globals
        if (oldGlobals) {
          for (var g in oldGlobals)
            __global[g] = oldGlobals[g];
        }
        __global.define = curDefine;

        return globalValue;
      };
    }
  }));

})(typeof self != 'undefined' ? self : global);

$__System.registerDynamic("2", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $Object = Object;
  module.exports = {
    create: $Object.create,
    getProto: $Object.getPrototypeOf,
    isEnum: {}.propertyIsEnumerable,
    getDesc: $Object.getOwnPropertyDescriptor,
    setDesc: $Object.defineProperty,
    setDescs: $Object.defineProperties,
    getKeys: $Object.keys,
    getNames: $Object.getOwnPropertyNames,
    getSymbols: $Object.getOwnPropertySymbols,
    each: [].forEach
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toString = {}.toString;
  module.exports = function(it) {
    return toString.call(it).slice(8, -1);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4", ["3"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = req('3');
  module.exports = 0 in Object('z') ? Object : function(it) {
    return cof(it) == 'String' ? it.split('') : Object(it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("6", ["4", "5"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var IObject = req('4'),
      defined = req('5');
  module.exports = function(it) {
    return IObject(defined(it));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("7", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var UNDEFINED = 'undefined';
  var global = module.exports = typeof window != UNDEFINED && window.Math == Math ? window : typeof self != UNDEFINED && self.Math == Math ? self : Function('return this')();
  if (typeof __g == 'number')
    __g = global;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("8", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var core = module.exports = {version: '1.2.0'};
  if (typeof __e == 'number')
    __e = core;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("9", ["7", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = req('7'),
      core = req('8'),
      PROTOTYPE = 'prototype';
  var ctx = function(fn, that) {
    return function() {
      return fn.apply(that, arguments);
    };
  };
  var $def = function(type, name, source) {
    var key,
        own,
        out,
        exp,
        isGlobal = type & $def.G,
        isProto = type & $def.P,
        target = isGlobal ? global : type & $def.S ? global[name] : (global[name] || {})[PROTOTYPE],
        exports = isGlobal ? core : core[name] || (core[name] = {});
    if (isGlobal)
      source = name;
    for (key in source) {
      own = !(type & $def.F) && target && key in target;
      if (own && key in exports)
        continue;
      out = own ? target[key] : source[key];
      if (isGlobal && typeof target[key] != 'function')
        exp = source[key];
      else if (type & $def.B && own)
        exp = ctx(out, global);
      else if (type & $def.W && target[key] == out)
        !function(C) {
          exp = function(param) {
            return this instanceof C ? new C(param) : C(param);
          };
          exp[PROTOTYPE] = C[PROTOTYPE];
        }(out);
      else
        exp = isProto && typeof out == 'function' ? ctx(Function.call, out) : out;
      exports[key] = exp;
      if (isProto)
        (exports[PROTOTYPE] || (exports[PROTOTYPE] = {}))[key] = out;
    }
  };
  $def.F = 1;
  $def.G = 2;
  $def.S = 4;
  $def.P = 8;
  $def.B = 16;
  $def.W = 32;
  module.exports = $def;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("a", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(exec) {
    try {
      return !!exec();
    } catch (e) {
      return true;
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("b", ["9", "8", "a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(KEY, exec) {
    var $def = req('9'),
        fn = (req('8').Object || {})[KEY] || Object[KEY],
        exp = {};
    exp[KEY] = exec(fn);
    $def($def.S + $def.F * req('a')(function() {
      fn(1);
    }), 'Object', exp);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("c", ["6", "b"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toIObject = req('6');
  req('b')('getOwnPropertyDescriptor', function($getOwnPropertyDescriptor) {
    return function getOwnPropertyDescriptor(it, key) {
      return $getOwnPropertyDescriptor(toIObject(it), key);
    };
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("d", ["2", "c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('2');
  req('c');
  module.exports = function getOwnPropertyDescriptor(it, key) {
    return $.getDesc(it, key);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("e", ["d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('d'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("f", ["e"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$getOwnPropertyDescriptor = req('e')["default"];
  exports["default"] = function get(_x, _x2, _x3) {
    var _again = true;
    _function: while (_again) {
      var object = _x,
          property = _x2,
          receiver = _x3;
      desc = parent = getter = undefined;
      _again = false;
      if (object === null)
        object = Function.prototype;
      var desc = _Object$getOwnPropertyDescriptor(object, property);
      if (desc === undefined) {
        var parent = Object.getPrototypeOf(object);
        if (parent === null) {
          return undefined;
        } else {
          _x = parent;
          _x2 = property;
          _x3 = receiver;
          _again = true;
          continue _function;
        }
      } else if ("value" in desc) {
        return desc.value;
      } else {
        var getter = desc.get;
        if (getter === undefined) {
          return undefined;
        }
        return getter.call(receiver);
      }
    }
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("10", ["2"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('2');
  module.exports = function create(P, D) {
    return $.create(P, D);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("11", ["10"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('10'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("12", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    return typeof it === 'object' ? it !== null : typeof it === 'function';
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("13", ["12"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var isObject = req('12');
  module.exports = function(it) {
    if (!isObject(it))
      throw TypeError(it + ' is not an object!');
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("14", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    if (typeof it != 'function')
      throw TypeError(it + ' is not a function!');
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("15", ["14"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var aFunction = req('14');
  module.exports = function(fn, that, length) {
    aFunction(fn);
    if (that === undefined)
      return fn;
    switch (length) {
      case 1:
        return function(a) {
          return fn.call(that, a);
        };
      case 2:
        return function(a, b) {
          return fn.call(that, a, b);
        };
      case 3:
        return function(a, b, c) {
          return fn.call(that, a, b, c);
        };
    }
    return function() {
      return fn.apply(that, arguments);
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("16", ["2", "12", "13", "15"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var getDesc = req('2').getDesc,
      isObject = req('12'),
      anObject = req('13');
  var check = function(O, proto) {
    anObject(O);
    if (!isObject(proto) && proto !== null)
      throw TypeError(proto + ": can't set as prototype!");
  };
  module.exports = {
    set: Object.setPrototypeOf || ('__proto__' in {} ? function(test, buggy, set) {
      try {
        set = req('15')(Function.call, getDesc(Object.prototype, '__proto__').set, 2);
        set(test, []);
        buggy = !(test instanceof Array);
      } catch (e) {
        buggy = true;
      }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy)
          O.__proto__ = proto;
        else
          set(O, proto);
        return O;
      };
    }({}, false) : undefined),
    check: check
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("17", ["9", "16"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $def = req('9');
  $def($def.S, 'Object', {setPrototypeOf: req('16').set});
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("18", ["17", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('17');
  module.exports = req('8').Object.setPrototypeOf;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("19", ["18"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('18'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1a", ["11", "19"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$create = req('11')["default"];
  var _Object$setPrototypeOf = req('19')["default"];
  exports["default"] = function(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }
    subClass.prototype = _Object$create(superClass && superClass.prototype, {constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }});
    if (superClass)
      _Object$setPrototypeOf ? _Object$setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1b", ["2"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('2');
  module.exports = function defineProperty(it, key, desc) {
    return $.setDesc(it, key, desc);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1c", ["1b"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('1b'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1d", ["1c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$defineProperty = req('1c')["default"];
  exports["default"] = (function() {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor)
          descriptor.writable = true;
        _Object$defineProperty(target, descriptor.key, descriptor);
      }
    }
    return function(Constructor, protoProps, staticProps) {
      if (protoProps)
        defineProperties(Constructor.prototype, protoProps);
      if (staticProps)
        defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })();
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1e", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  exports["default"] = function(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1f", ["5"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var defined = req('5');
  module.exports = function(it) {
    return Object(defined(it));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("20", ["2"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('2');
  module.exports = function(it) {
    var keys = $.getKeys(it),
        getSymbols = $.getSymbols;
    if (getSymbols) {
      var symbols = getSymbols(it),
          isEnum = $.isEnum,
          i = 0,
          key;
      while (symbols.length > i)
        if (isEnum.call(it, key = symbols[i++]))
          keys.push(key);
    }
    return keys;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("21", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var hasOwnProperty = {}.hasOwnProperty;
  module.exports = function(it, key) {
    return hasOwnProperty.call(it, key);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("22", ["1f", "4", "20", "21", "a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toObject = req('1f'),
      IObject = req('4'),
      enumKeys = req('20'),
      has = req('21');
  module.exports = req('a')(function() {
    var a = Object.assign,
        A = {},
        B = {},
        S = Symbol(),
        K = 'abcdefghijklmnopqrst';
    A[S] = 7;
    K.split('').forEach(function(k) {
      B[k] = k;
    });
    return a({}, A)[S] != 7 || Object.keys(a({}, B)).join('') != K;
  }) ? function assign(target, source) {
    var T = toObject(target),
        l = arguments.length,
        i = 1;
    while (l > i) {
      var S = IObject(arguments[i++]),
          keys = enumKeys(S),
          length = keys.length,
          j = 0,
          key;
      while (length > j)
        if (has(S, key = keys[j++]))
          T[key] = S[key];
    }
    return T;
  } : Object.assign;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("23", ["9", "22"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $def = req('9');
  $def($def.S + $def.F, 'Object', {assign: req('22')});
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("24", ["23", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('23');
  module.exports = req('8').Object.assign;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("25", ["24"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('24'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("26", ["1f", "b"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toObject = req('1f');
  req('b')('keys', function($keys) {
    return function keys(it) {
      return $keys(toObject(it));
    };
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("27", ["26", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('26');
  module.exports = req('8').Object.keys;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("28", ["27"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('27'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("29", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  ;
  (function() {
    'use strict';
    function EventEmitter() {}
    var proto = EventEmitter.prototype;
    var exports = this;
    var originalGlobalValue = exports.EventEmitter;
    function indexOfListener(listeners, listener) {
      var i = listeners.length;
      while (i--) {
        if (listeners[i].listener === listener) {
          return i;
        }
      }
      return -1;
    }
    function alias(name) {
      return function aliasClosure() {
        return this[name].apply(this, arguments);
      };
    }
    proto.getListeners = function getListeners(evt) {
      var events = this._getEvents();
      var response;
      var key;
      if (evt instanceof RegExp) {
        response = {};
        for (key in events) {
          if (events.hasOwnProperty(key) && evt.test(key)) {
            response[key] = events[key];
          }
        }
      } else {
        response = events[evt] || (events[evt] = []);
      }
      return response;
    };
    proto.flattenListeners = function flattenListeners(listeners) {
      var flatListeners = [];
      var i;
      for (i = 0; i < listeners.length; i += 1) {
        flatListeners.push(listeners[i].listener);
      }
      return flatListeners;
    };
    proto.getListenersAsObject = function getListenersAsObject(evt) {
      var listeners = this.getListeners(evt);
      var response;
      if (listeners instanceof Array) {
        response = {};
        response[evt] = listeners;
      }
      return response || listeners;
    };
    proto.addListener = function addListener(evt, listener) {
      var listeners = this.getListenersAsObject(evt);
      var listenerIsWrapped = typeof listener === 'object';
      var key;
      for (key in listeners) {
        if (listeners.hasOwnProperty(key) && indexOfListener(listeners[key], listener) === -1) {
          listeners[key].push(listenerIsWrapped ? listener : {
            listener: listener,
            once: false
          });
        }
      }
      return this;
    };
    proto.on = alias('addListener');
    proto.addOnceListener = function addOnceListener(evt, listener) {
      return this.addListener(evt, {
        listener: listener,
        once: true
      });
    };
    proto.once = alias('addOnceListener');
    proto.defineEvent = function defineEvent(evt) {
      this.getListeners(evt);
      return this;
    };
    proto.defineEvents = function defineEvents(evts) {
      for (var i = 0; i < evts.length; i += 1) {
        this.defineEvent(evts[i]);
      }
      return this;
    };
    proto.removeListener = function removeListener(evt, listener) {
      var listeners = this.getListenersAsObject(evt);
      var index;
      var key;
      for (key in listeners) {
        if (listeners.hasOwnProperty(key)) {
          index = indexOfListener(listeners[key], listener);
          if (index !== -1) {
            listeners[key].splice(index, 1);
          }
        }
      }
      return this;
    };
    proto.off = alias('removeListener');
    proto.addListeners = function addListeners(evt, listeners) {
      return this.manipulateListeners(false, evt, listeners);
    };
    proto.removeListeners = function removeListeners(evt, listeners) {
      return this.manipulateListeners(true, evt, listeners);
    };
    proto.manipulateListeners = function manipulateListeners(remove, evt, listeners) {
      var i;
      var value;
      var single = remove ? this.removeListener : this.addListener;
      var multiple = remove ? this.removeListeners : this.addListeners;
      if (typeof evt === 'object' && !(evt instanceof RegExp)) {
        for (i in evt) {
          if (evt.hasOwnProperty(i) && (value = evt[i])) {
            if (typeof value === 'function') {
              single.call(this, i, value);
            } else {
              multiple.call(this, i, value);
            }
          }
        }
      } else {
        i = listeners.length;
        while (i--) {
          single.call(this, evt, listeners[i]);
        }
      }
      return this;
    };
    proto.removeEvent = function removeEvent(evt) {
      var type = typeof evt;
      var events = this._getEvents();
      var key;
      if (type === 'string') {
        delete events[evt];
      } else if (evt instanceof RegExp) {
        for (key in events) {
          if (events.hasOwnProperty(key) && evt.test(key)) {
            delete events[key];
          }
        }
      } else {
        delete this._events;
      }
      return this;
    };
    proto.removeAllListeners = alias('removeEvent');
    proto.emitEvent = function emitEvent(evt, args) {
      var listenersMap = this.getListenersAsObject(evt);
      var listeners;
      var listener;
      var i;
      var key;
      var response;
      for (key in listenersMap) {
        if (listenersMap.hasOwnProperty(key)) {
          listeners = listenersMap[key].slice(0);
          i = listeners.length;
          while (i--) {
            listener = listeners[i];
            if (listener.once === true) {
              this.removeListener(evt, listener.listener);
            }
            response = listener.listener.apply(this, args || []);
            if (response === this._getOnceReturnValue()) {
              this.removeListener(evt, listener.listener);
            }
          }
        }
      }
      return this;
    };
    proto.trigger = alias('emitEvent');
    proto.emit = function emit(evt) {
      var args = Array.prototype.slice.call(arguments, 1);
      return this.emitEvent(evt, args);
    };
    proto.setOnceReturnValue = function setOnceReturnValue(value) {
      this._onceReturnValue = value;
      return this;
    };
    proto._getOnceReturnValue = function _getOnceReturnValue() {
      if (this.hasOwnProperty('_onceReturnValue')) {
        return this._onceReturnValue;
      } else {
        return true;
      }
    };
    proto._getEvents = function _getEvents() {
      return this._events || (this._events = {});
    };
    EventEmitter.noConflict = function noConflict() {
      exports.EventEmitter = originalGlobalValue;
      return EventEmitter;
    };
    if (typeof define === 'function' && define.amd) {
      define(function() {
        return EventEmitter;
      });
    } else if (typeof module === 'object' && module.exports) {
      module.exports = EventEmitter;
    } else {
      exports.EventEmitter = EventEmitter;
    }
  }.call(this));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2a", ["29"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('29');
  global.define = __define;
  return module.exports;
});

$__System.register('2b', [], function (_export) {
	'use strict';

	_export('isString', isString);

	_export('isNumeric', isNumeric);

	_export('isObject', isObject);

	function isString(input) {
		return typeof input === 'string';
	}

	function isNumeric(input) {
		return !isNaN(parseFloat(input)) && isFinite(input);
	}

	function isObject(input) {
		return Object.prototype.toString.call(input) === '[object Object]';
	}

	return {
		setters: [],
		execute: function () {}
	};
});
$__System.register('2c', ['28', '1c', '2b'], function (_export) {
	var _Object$keys, _Object$defineProperty, isNumeric, isString;

	function deepSet(str, val) {
		var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

		var parts, i;

		if (typeof str !== 'string') {

			throw Error('value provided to the first argument of deepSet must be a string');
		} else {

			parts = str.split('.');
		}

		for (i = 0; i < parts.length; i++) {
			// if a obj is passed in and loop is assigning last variable in namespace
			if (i === parts.length - 1) {

				_Object$defineProperty(context, parts[i], {
					configurable: true,
					enumerable: true,
					writable: true,
					value: val
				});

				context = context[parts[i]];
			} else {

				// if namespace doesn't exist, instantiate it as empty object
				context = context[parts[i]] = context[parts[i]] || {};
			}
		}

		return context;
	}

	/*
  * Returns a shallow copy of an array
  */

	function copyArray() {
		var arr = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

		return arr.slice(0);
	}

	/*
  * Given an array and two indices, swap the elements in place.
  */

	function swapArrayElements(arr, idx1, idx2) {

		if (!isNumeric(idx1) || !isNumeric(idx2)) {
			throw new TypeError('provided values for idx1 or idx2 must be integers');
		}

		var tmp = arr[idx2];

		arr[idx2] = arr[idx1];
		arr[idx1] = tmp;
		return arr;
	}

	/**
  * Given a shallow key/value pair, return a string that can be sent as xhr form data
  * @param data
  * @returns {string}
  */

	function serializeRequestData(data) {
		return _Object$keys(data).map(function (key) {
			return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
		}).join('&');
	}

	/**
  * Helper function for POSTing with XMLHttpRequest
  * @param url {string} Resource to post to
  * @param options {object}
  */

	function xhrPost(url, options) {
		var xhr = new XMLHttpRequest();
		var data = options.data;
		var success = options.success;
		var fail = options.fail;

		if (!url || !isString(url)) {
			throw new TypeError('URL string must be provided for an xhr call');
		}

		xhr.open('POST', url, true);
		xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

		if (success) {
			xhr.addEventListener('load', success);
		}
		if (fail) {
			xhr.addEventListener('error', fail);
		}
		if (data) {
			data = serializeRequestData(data);
		}

		xhr.send(data || null);
	}

	return {
		setters: [function (_) {
			_Object$keys = _['default'];
		}, function (_c) {
			_Object$defineProperty = _c['default'];
		}, function (_b) {
			isNumeric = _b.isNumeric;
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';

			_export('deepSet', deepSet);

			_export('copyArray', copyArray);

			_export('swapArrayElements', swapArrayElements);

			_export('serializeRequestData', serializeRequestData);

			_export('xhrPost', xhrPost);

			'use strict';
		}
	};
});
$__System.register('2d', ['25', '28', '1d', '1e', '2a', '2c'], function (_export) {
	var _Object$assign, _Object$keys, _createClass, _classCallCheck, EventEmitter, deepSet, Model;

	return {
		setters: [function (_2) {
			_Object$assign = _2['default'];
		}, function (_) {
			_Object$keys = _['default'];
		}, function (_d) {
			_createClass = _d['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_a) {
			EventEmitter = _a['default'];
		}, function (_c) {
			deepSet = _c.deepSet;
		}],
		execute: function () {

			/**
    * @class Model
    * @description A simple implemenation of a model class that notifies provides a getter and setter that notifies on property changes
    */
			'use strict';

			Model = (function () {
				function Model() {
					_classCallCheck(this, Model);

					var emitter = new EventEmitter();

					var emitterProxy = {};

					this.validators = {};

					_Object$keys(EventEmitter.prototype).forEach(function (methodName) {
						emitterProxy[methodName] = EventEmitter.prototype[methodName].bind(emitter);
					});

					_Object$assign(Object.getPrototypeOf(this), emitterProxy);
				}

				_createClass(Model, [{
					key: 'extendValidation',
					value: function extendValidation(validators) {
						var _this = this;

						_Object$keys(validators).forEach(function (key) {
							_this.validators[key] = validators[key];
						});
					}
				}, {
					key: 'set',
					value: function set(propName, newValue) {
						var oldValue = this[propName];

						if (newValue && this.validators[propName]) {
							var isValid = this.validators[propName](newValue);

							if (!isValid) {
								throw new TypeError(propName + ' did not pass the "' + this.validators[propName].name + '" validator');
							}
						}

						deepSet.call(this, propName, newValue);

						this.emit('propertyDidChange', {
							propName: propName,
							oldValue: oldValue,
							newValue: newValue
						});
					}
				}, {
					key: 'setProperties',
					value: function setProperties(properties) {
						for (var prop in properties) {
							this.set(prop, properties[prop]);
						}
						return properties;
					}
				}, {
					key: 'get',
					value: function get(propName) {
						return this[propName];
					}
				}]);

				return Model;
			})();

			_export('Model', Model);
		}
	};
});
$__System.register('2e', ['25', 'f', '1a', '1e', '2d', '2b'], function (_export) {
	var _Object$assign, _get, _inherits, _classCallCheck, Model, isString, defaultProperties, InfoboxThemeData;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_d) {
			Model = _d.Model;
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';
			defaultProperties = {
				borderColor: null,
				accentColor: null
			};

			InfoboxThemeData = (function (_Model) {
				_inherits(InfoboxThemeData, _Model);

				function InfoboxThemeData() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, InfoboxThemeData);

					_get(Object.getPrototypeOf(InfoboxThemeData.prototype), 'constructor', this).call(this);

					_Object$assign(this, defaultProperties, properties);

					this.extendValidation({
						borderColor: isString,
						accentColor: isString
					});
				}

				return InfoboxThemeData;
			})(Model);

			_export('InfoboxThemeData', InfoboxThemeData);
		}
	};
});
$__System.register('2f', ['25', 'f', '1a', '1d', '1e', '2d', '2b', '2c'], function (_export) {
	var _Object$assign, _get, _inherits, _createClass, _classCallCheck, Model, isNumeric, copyArray, swapArrayElements, Collection;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_d) {
			_createClass = _d['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_d2) {
			Model = _d2.Model;
		}, function (_b) {
			isNumeric = _b.isNumeric;
		}, function (_c) {
			copyArray = _c.copyArray;
			swapArrayElements = _c.swapArrayElements;
		}],
		execute: function () {
			'use strict';

			Collection = (function (_Model) {
				_inherits(Collection, _Model);

				function Collection() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Collection);

					_get(Object.getPrototypeOf(Collection.prototype), 'constructor', this).call(this);
					this.items = [];
					_Object$assign(this, properties);
				}

				_createClass(Collection, [{
					key: 'add',
					value: function add(item) {
						var index = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

						var itemsCopy = copyArray(this.items);

						if (index) {
							itemsCopy.splice(index, 0, item);
						} else {
							itemsCopy.push(item);
						}

						this.setItems(itemsCopy);
						return item;
					}
				}, {
					key: 'remove',
					value: function remove(index) {
						var itemsCopy = copyArray(this.items);

						var removed = undefined;

						if (!isNumeric(index)) {
							throw new TypeError('index must be an integer');
						}

						if (index >= 0) {
							removed = itemsCopy.splice(index, 1);
						} else {
							removed = itemsCopy.pop();
						}

						this.setItems(itemsCopy);
						return removed;
					}
				}, {
					key: 'swap',
					value: function swap(firstIndex, secondIndex) {
						var itemsCopy = copyArray(this.items);
						itemsCopy = swapArrayElements(itemsCopy, firstIndex, secondIndex);

						return this.setItems(itemsCopy);
					}
				}, {
					key: 'setItems',
					value: function setItems(itemsArr) {
						if (Array.isArray(itemsArr)) {

							this.set('items', itemsArr);
							return this.items;
						} else {
							throw new TypeError('Argument provided to setItems(itemsArr) must be an array');
						}
					}
				}]);

				return Collection;
			})(Model);

			_export('Collection', Collection);
		}
	};
});
$__System.register('30', ['25', 'f', '1a', '1e', '2d', '2b'], function (_export) {
	var _Object$assign, _get, _inherits, _classCallCheck, Model, isString, defaultProperties, Elem;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_d) {
			Model = _d.Model;
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';
			defaultProperties = {
				_nodeType: 'elem',
				boundVariableName: null,
				defaultValue: null,
				value: null
			};

			Elem = (function (_Model) {
				_inherits(Elem, _Model);

				function Elem() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Elem);

					_get(Object.getPrototypeOf(Elem.prototype), 'constructor', this).call(this);

					this.extendValidation({
						boundVariableName: isString,
						defaultValue: isString
					});

					this.setProperties(_Object$assign({}, defaultProperties, properties));
				}

				return Elem;
			})(Model);

			_export('Elem', Elem);
		}
	};
});
$__System.register('31', ['25', '30', 'f', '1a', '1e', '2b'], function (_export) {
	var _Object$assign, Elem, _get, _inherits, _classCallCheck, isString, defaultProperties, Field;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			Elem = _2.Elem;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';
			defaultProperties = {
				_nodeType: 'data',
				label: null,
				stringTemplate: null
			};

			Field = (function (_Elem) {
				_inherits(Field, _Elem);

				function Field() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Field);

					_get(Object.getPrototypeOf(Field.prototype), 'constructor', this).call(this);

					this.extendValidation({
						label: isString,
						stringTemplate: isString
					});

					this.setProperties(_Object$assign({}, defaultProperties, properties));
				}

				return Field;
			})(Elem);

			_export('Field', Field);
		}
	};
});
$__System.register('32', ['25', 'f', '1a', '1e', '2f', '2b'], function (_export) {
	var _Object$assign, _get, _inherits, _classCallCheck, Collection, isString, defaultProperties, Group;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_f2) {
			Collection = _f2.Collection;
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';

			defaultProperties = {
				_nodeType: 'group',
				layout: null,
				show: null
			};

			Group = (function (_Collection) {
				_inherits(Group, _Collection);

				function Group() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Group);

					_get(Object.getPrototypeOf(Group.prototype), 'constructor', this).call(this);

					this.extendValidation({
						layout: isString,
						show: isString
					});

					this.setProperties(_Object$assign({}, defaultProperties, properties));
				}

				return Group;
			})(Collection);

			_export('Group', Group);
		}
	};
});
$__System.register('33', ['25', '30', 'f', '1a', '1e', '2b'], function (_export) {
	var _Object$assign, Elem, _get, _inherits, _classCallCheck, isObject, isString, defaultProperties, Image;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			Elem = _2.Elem;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			isObject = _b.isObject;
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';
			defaultProperties = {
				_nodeType: 'image',
				altBoundVariableName: null,
				altDefaultValue: null,
				caption: {}
			};

			Image = (function (_Elem) {
				_inherits(Image, _Elem);

				function Image() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Image);

					_get(Object.getPrototypeOf(Image.prototype), 'constructor', this).call(this);

					this.extendValidation({
						altBoundVariableName: isString,
						altDefaultValue: isString,
						caption: isObject
					});

					this.setProperties(_Object$assign({}, defaultProperties, properties));
				}

				return Image;
			})(Elem);

			_export('Image', Image);
		}
	};
});
$__System.register('34', ['25', '30', 'f', '1a', '1e', '2b'], function (_export) {
	var _Object$assign, Elem, _get, _inherits, _classCallCheck, isString, defaultProperties, Title;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			Elem = _2.Elem;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';
			defaultProperties = {
				_nodeType: 'title',
				stringTemplate: null
			};

			Title = (function (_Elem) {
				_inherits(Title, _Elem);

				function Title() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Title);

					_get(Object.getPrototypeOf(Title.prototype), 'constructor', this).call(this);

					this.extendValidation({
						stringTemplate: isString
					});

					this.setProperties(_Object$assign({}, defaultProperties, properties));
				}

				return Title;
			})(Elem);

			_export('Title', Title);
		}
	};
});
$__System.register('35', ['25', '30', 'f', '1a', '1e', '2b'], function (_export) {
	var _Object$assign, Elem, _get, _inherits, _classCallCheck, isString, defaultProperties, Caption;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			Elem = _2.Elem;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';
			defaultProperties = {
				_nodeType: 'caption',
				stringTemplate: null
			};

			Caption = (function (_Elem) {
				_inherits(Caption, _Elem);

				function Caption() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Caption);

					_get(Object.getPrototypeOf(Caption.prototype), 'constructor', this).call(this);

					this.extendValidation({
						stringTemplate: isString
					});

					this.setProperties(_Object$assign({}, defaultProperties, properties));
				}

				return Caption;
			})(Elem);

			_export('Caption', Caption);
		}
	};
});
$__System.register('36', ['31', '32', '33', '34', '35'], function (_export) {
  'use strict';

  return {
    setters: [function (_) {
      var _exportObj = {};

      for (var _key in _) {
        if (_key !== 'default') _exportObj[_key] = _[_key];
      }

      _export(_exportObj);
    }, function (_2) {
      var _exportObj2 = {};

      for (var _key2 in _2) {
        if (_key2 !== 'default') _exportObj2[_key2] = _2[_key2];
      }

      _export(_exportObj2);
    }, function (_3) {
      var _exportObj3 = {};

      for (var _key3 in _3) {
        if (_key3 !== 'default') _exportObj3[_key3] = _3[_key3];
      }

      _export(_exportObj3);
    }, function (_4) {
      var _exportObj4 = {};

      for (var _key4 in _4) {
        if (_key4 !== 'default') _exportObj4[_key4] = _4[_key4];
      }

      _export(_exportObj4);
    }, function (_5) {
      var _exportObj5 = {};

      for (var _key5 in _5) {
        if (_key5 !== 'default') _exportObj5[_key5] = _5[_key5];
      }

      _export(_exportObj5);
    }],
    execute: function () {
      'This string is here to prevent an empty file warning, since it is empty after transpilation.';
    }
  };
});
$__System.register('37', ['25', '36', 'f', '1a', '1d', '1e', '2f'], function (_export) {
	var _Object$assign, Types, _get, _inherits, _createClass, _classCallCheck, Collection, defaultProps, InfoboxData;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			Types = _2;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_d) {
			_createClass = _d['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_f2) {
			Collection = _f2.Collection;
		}],
		execute: function () {
			'use strict';
			defaultProps = {
				items: [],
				theme: null,
				themeVarName: null,
				layout: null
			};

			InfoboxData = (function (_Collection) {
				_inherits(InfoboxData, _Collection);

				function InfoboxData() {
					var properties = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, InfoboxData);

					_get(Object.getPrototypeOf(InfoboxData.prototype), 'constructor', this).call(this);

					_Object$assign(this, defaultProps, properties);

					if (this.items) {
						this.setItems(this.items);
					}
				}

				_createClass(InfoboxData, [{
					key: 'newElement',

					/*
     * Instance method that is an alias for InfoboxData.newElement
      */
					value: function newElement() {
						return InfoboxData.newElement.apply(null, arguments);
					}
				}], [{
					key: 'newElement',
					value: function newElement(elemName, props) {
						return new Types[elemName](props);
					}
				}]);

				return InfoboxData;
			})(Collection);

			_export('InfoboxData', InfoboxData);
		}
	};
});
$__System.registerDynamic("38", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("39", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ceil = Math.ceil,
      floor = Math.floor;
  module.exports = function(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3a", ["39", "5"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = req('39'),
      defined = req('5');
  module.exports = function(TO_STRING) {
    return function(that, pos) {
      var s = String(defined(that)),
          i = toInteger(pos),
          l = s.length,
          a,
          b;
      if (i < 0 || i >= l)
        return TO_STRING ? '' : undefined;
      a = s.charCodeAt(i);
      return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3b", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3c", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3d", ["a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = !req('a')(function() {
    return Object.defineProperty({}, 'a', {get: function() {
        return 7;
      }}).a != 7;
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3e", ["2", "3c", "3d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('2'),
      createDesc = req('3c');
  module.exports = req('3d') ? function(object, key, value) {
    return $.setDesc(object, key, createDesc(1, value));
  } : function(object, key, value) {
    object[key] = value;
    return object;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3f", ["3e"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('3e');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("40", ["7"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = req('7'),
      SHARED = '__core-js_shared__',
      store = global[SHARED] || (global[SHARED] = {});
  module.exports = function(key) {
    return store[key] || (store[key] = {});
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("41", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var id = 0,
      px = Math.random();
  module.exports = function(key) {
    return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("42", ["40", "7", "41"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var store = req('40')('wks'),
      Symbol = req('7').Symbol;
  module.exports = function(name) {
    return store[name] || (store[name] = Symbol && Symbol[name] || (Symbol || req('41'))('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("43", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("44", ["21", "3e", "42"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var has = req('21'),
      hide = req('3e'),
      TAG = req('42')('toStringTag');
  module.exports = function(it, tag, stat) {
    if (it && !has(it = stat ? it : it.prototype, TAG))
      hide(it, TAG, tag);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("45", ["2", "3e", "42", "3c", "44"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = req('2'),
      IteratorPrototype = {};
  req('3e')(IteratorPrototype, req('42')('iterator'), function() {
    return this;
  });
  module.exports = function(Constructor, NAME, next) {
    Constructor.prototype = $.create(IteratorPrototype, {next: req('3c')(1, next)});
    req('44')(Constructor, NAME + ' Iterator');
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("46", ["3b", "9", "3f", "3e", "21", "42", "43", "45", "2", "44"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var LIBRARY = req('3b'),
      $def = req('9'),
      $redef = req('3f'),
      hide = req('3e'),
      has = req('21'),
      SYMBOL_ITERATOR = req('42')('iterator'),
      Iterators = req('43'),
      BUGGY = !([].keys && 'next' in [].keys()),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values';
  var returnThis = function() {
    return this;
  };
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCE) {
    req('45')(Constructor, NAME, next);
    var createMethod = function(kind) {
      switch (kind) {
        case KEYS:
          return function keys() {
            return new Constructor(this, kind);
          };
        case VALUES:
          return function values() {
            return new Constructor(this, kind);
          };
      }
      return function entries() {
        return new Constructor(this, kind);
      };
    };
    var TAG = NAME + ' Iterator',
        proto = Base.prototype,
        _native = proto[SYMBOL_ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
        _default = _native || createMethod(DEFAULT),
        methods,
        key;
    if (_native) {
      var IteratorPrototype = req('2').getProto(_default.call(new Base));
      req('44')(IteratorPrototype, TAG, true);
      if (!LIBRARY && has(proto, FF_ITERATOR))
        hide(IteratorPrototype, SYMBOL_ITERATOR, returnThis);
    }
    if (!LIBRARY || FORCE)
      hide(proto, SYMBOL_ITERATOR, _default);
    Iterators[NAME] = _default;
    Iterators[TAG] = returnThis;
    if (DEFAULT) {
      methods = {
        keys: IS_SET ? _default : createMethod(KEYS),
        values: DEFAULT == VALUES ? _default : createMethod(VALUES),
        entries: DEFAULT != VALUES ? _default : createMethod('entries')
      };
      if (FORCE)
        for (key in methods) {
          if (!(key in proto))
            $redef(proto, key, methods[key]);
        }
      else
        $def($def.P + $def.F * BUGGY, NAME, methods);
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("47", ["3a", "46"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $at = req('3a')(true);
  req('46')(String, 'String', function(iterated) {
    this._t = String(iterated);
    this._i = 0;
  }, function() {
    var O = this._t,
        index = this._i,
        point;
    if (index >= O.length)
      return {
        value: undefined,
        done: true
      };
    point = $at(O, index);
    this._i += point.length;
    return {
      value: point,
      done: false
    };
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("48", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function() {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("49", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(done, value) {
    return {
      value: value,
      done: !!done
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4a", ["48", "49", "43", "6", "46"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var setUnscope = req('48'),
      step = req('49'),
      Iterators = req('43'),
      toIObject = req('6');
  req('46')(Array, 'Array', function(iterated, kind) {
    this._t = toIObject(iterated);
    this._i = 0;
    this._k = kind;
  }, function() {
    var O = this._t,
        kind = this._k,
        index = this._i++;
    if (!O || index >= O.length) {
      this._t = undefined;
      return step(1);
    }
    if (kind == 'keys')
      return step(0, index);
    if (kind == 'values')
      return step(0, O[index]);
    return step(0, [index, O[index]]);
  }, 'values');
  Iterators.Arguments = Iterators.Array;
  setUnscope('keys');
  setUnscope('values');
  setUnscope('entries');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4b", ["4a", "43"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('4a');
  var Iterators = req('43');
  Iterators.NodeList = Iterators.HTMLCollection = Iterators.Array;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4c", ["3", "42"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = req('3'),
      TAG = req('42')('toStringTag'),
      ARG = cof(function() {
        return arguments;
      }()) == 'Arguments';
  module.exports = function(it) {
    var O,
        T,
        B;
    return it === undefined ? 'Undefined' : it === null ? 'Null' : typeof(T = (O = Object(it))[TAG]) == 'string' ? T : ARG ? cof(O) : (B = cof(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : B;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4d", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it, Constructor, name) {
    if (!(it instanceof Constructor))
      throw TypeError(name + ": use the 'new' operator!");
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4e", ["13"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var anObject = req('13');
  module.exports = function(iterator, fn, value, entries) {
    try {
      return entries ? fn(anObject(value)[0], value[1]) : fn(value);
    } catch (e) {
      var ret = iterator['return'];
      if (ret !== undefined)
        anObject(ret.call(iterator));
      throw e;
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4f", ["43", "42"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var Iterators = req('43'),
      ITERATOR = req('42')('iterator');
  module.exports = function(it) {
    return (Iterators.Array || Array.prototype[ITERATOR]) === it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("50", ["39"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = req('39'),
      min = Math.min;
  module.exports = function(it) {
    return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("51", ["4c", "42", "43", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var classof = req('4c'),
      ITERATOR = req('42')('iterator'),
      Iterators = req('43');
  module.exports = req('8').getIteratorMethod = function(it) {
    if (it != undefined)
      return it[ITERATOR] || it['@@iterator'] || Iterators[classof(it)];
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("52", ["15", "4e", "4f", "13", "50", "51"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ctx = req('15'),
      call = req('4e'),
      isArrayIter = req('4f'),
      anObject = req('13'),
      toLength = req('50'),
      getIterFn = req('51');
  module.exports = function(iterable, entries, fn, that) {
    var iterFn = getIterFn(iterable),
        f = ctx(fn, that, entries ? 2 : 1),
        index = 0,
        length,
        step,
        iterator;
    if (typeof iterFn != 'function')
      throw TypeError(iterable + ' is not iterable!');
    if (isArrayIter(iterFn))
      for (length = toLength(iterable.length); length > index; index++) {
        entries ? f(anObject(step = iterable[index])[0], step[1]) : f(iterable[index]);
      }
    else
      for (iterator = iterFn.call(iterable); !(step = iterator.next()).done; ) {
        call(iterator, f, step.value, entries);
      }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("53", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = Object.is || function is(x, y) {
    return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("54", ["2", "42", "3d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = req('2'),
      SPECIES = req('42')('species');
  module.exports = function(C) {
    if (req('3d') && !(SPECIES in C))
      $.setDesc(C, SPECIES, {
        configurable: true,
        get: function() {
          return this;
        }
      });
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("55", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(fn, args, that) {
    var un = that === undefined;
    switch (args.length) {
      case 0:
        return un ? fn() : fn.call(that);
      case 1:
        return un ? fn(args[0]) : fn.call(that, args[0]);
      case 2:
        return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
      case 3:
        return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
      case 4:
        return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
    }
    return fn.apply(that, args);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("56", ["7"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('7').document && document.documentElement;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("57", ["12", "7"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var isObject = req('12'),
      document = req('7').document,
      is = isObject(document) && isObject(document.createElement);
  module.exports = function(it) {
    return is ? document.createElement(it) : {};
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("58", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  function drainQueue() {
    if (draining) {
      return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      var i = -1;
      while (++i < len) {
        currentQueue[i]();
      }
      len = queue.length;
    }
    draining = false;
  }
  process.nextTick = function(fun) {
    queue.push(fun);
    if (!draining) {
      setTimeout(drainQueue, 0);
    }
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  process.versions = {};
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("59", ["58"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('58');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5a", ["59"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__System._nodeRequire ? process : req('59');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5b", ["5a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('5a');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5c", ["15", "55", "56", "57", "7", "3", "5b"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var ctx = req('15'),
        invoke = req('55'),
        html = req('56'),
        cel = req('57'),
        global = req('7'),
        process = global.process,
        setTask = global.setImmediate,
        clearTask = global.clearImmediate,
        MessageChannel = global.MessageChannel,
        counter = 0,
        queue = {},
        ONREADYSTATECHANGE = 'onreadystatechange',
        defer,
        channel,
        port;
    var run = function() {
      var id = +this;
      if (queue.hasOwnProperty(id)) {
        var fn = queue[id];
        delete queue[id];
        fn();
      }
    };
    var listner = function(event) {
      run.call(event.data);
    };
    if (!setTask || !clearTask) {
      setTask = function setImmediate(fn) {
        var args = [],
            i = 1;
        while (arguments.length > i)
          args.push(arguments[i++]);
        queue[++counter] = function() {
          invoke(typeof fn == 'function' ? fn : Function(fn), args);
        };
        defer(counter);
        return counter;
      };
      clearTask = function clearImmediate(id) {
        delete queue[id];
      };
      if (req('3')(process) == 'process') {
        defer = function(id) {
          process.nextTick(ctx(run, id, 1));
        };
      } else if (MessageChannel) {
        channel = new MessageChannel;
        port = channel.port2;
        channel.port1.onmessage = listner;
        defer = ctx(port.postMessage, port, 1);
      } else if (global.addEventListener && typeof postMessage == 'function' && !global.importScript) {
        defer = function(id) {
          global.postMessage(id + '', '*');
        };
        global.addEventListener('message', listner, false);
      } else if (ONREADYSTATECHANGE in cel('script')) {
        defer = function(id) {
          html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function() {
            html.removeChild(this);
            run.call(id);
          };
        };
      } else {
        defer = function(id) {
          setTimeout(ctx(run, id, 1), 0);
        };
      }
    }
    module.exports = {
      set: setTask,
      clear: clearTask
    };
  })(req('5b'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5d", ["7", "5c", "3", "5b"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    var global = req('7'),
        macrotask = req('5c').set,
        Observer = global.MutationObserver || global.WebKitMutationObserver,
        process = global.process,
        isNode = req('3')(process) == 'process',
        head,
        last,
        notify;
    var flush = function() {
      var parent,
          domain;
      if (isNode && (parent = process.domain)) {
        process.domain = null;
        parent.exit();
      }
      while (head) {
        domain = head.domain;
        if (domain)
          domain.enter();
        head.fn.call();
        if (domain)
          domain.exit();
        head = head.next;
      }
      last = undefined;
      if (parent)
        parent.enter();
    };
    if (isNode) {
      notify = function() {
        process.nextTick(flush);
      };
    } else if (Observer) {
      var toggle = 1,
          node = document.createTextNode('');
      new Observer(flush).observe(node, {characterData: true});
      notify = function() {
        node.data = toggle = -toggle;
      };
    } else {
      notify = function() {
        macrotask.call(global, flush);
      };
    }
    module.exports = function asap(fn) {
      var task = {
        fn: fn,
        next: undefined,
        domain: isNode && process.domain
      };
      if (last)
        last.next = task;
      if (!head) {
        head = task;
        notify();
      }
      last = task;
    };
  })(req('5b'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5e", ["3f"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $redef = req('3f');
  module.exports = function(target, src) {
    for (var key in src)
      $redef(target, key, src[key]);
    return target;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5f", ["42"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var SYMBOL_ITERATOR = req('42')('iterator'),
      SAFE_CLOSING = false;
  try {
    var riter = [7][SYMBOL_ITERATOR]();
    riter['return'] = function() {
      SAFE_CLOSING = true;
    };
    Array.from(riter, function() {
      throw 2;
    });
  } catch (e) {}
  module.exports = function(exec) {
    if (!SAFE_CLOSING)
      return false;
    var safe = false;
    try {
      var arr = [7],
          iter = arr[SYMBOL_ITERATOR]();
      iter.next = function() {
        safe = true;
      };
      arr[SYMBOL_ITERATOR] = function() {
        return iter;
      };
      exec(arr);
    } catch (e) {}
    return safe;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("60", ["2", "3b", "7", "15", "4c", "9", "12", "13", "14", "4d", "52", "16", "53", "54", "42", "41", "5d", "3d", "5e", "44", "8", "5f", "5b"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = req('2'),
        LIBRARY = req('3b'),
        global = req('7'),
        ctx = req('15'),
        classof = req('4c'),
        $def = req('9'),
        isObject = req('12'),
        anObject = req('13'),
        aFunction = req('14'),
        strictNew = req('4d'),
        forOf = req('52'),
        setProto = req('16').set,
        same = req('53'),
        species = req('54'),
        SPECIES = req('42')('species'),
        RECORD = req('41')('record'),
        asap = req('5d'),
        PROMISE = 'Promise',
        process = global.process,
        isNode = classof(process) == 'process',
        P = global[PROMISE],
        Wrapper;
    var testResolve = function(sub) {
      var test = new P(function() {});
      if (sub)
        test.constructor = Object;
      return P.resolve(test) === test;
    };
    var useNative = function() {
      var works = false;
      function P2(x) {
        var self = new P(x);
        setProto(self, P2.prototype);
        return self;
      }
      try {
        works = P && P.resolve && testResolve();
        setProto(P2, P);
        P2.prototype = $.create(P.prototype, {constructor: {value: P2}});
        if (!(P2.resolve(5).then(function() {}) instanceof P2)) {
          works = false;
        }
        if (works && req('3d')) {
          var thenableThenGotten = false;
          P.resolve($.setDesc({}, 'then', {get: function() {
              thenableThenGotten = true;
            }}));
          works = thenableThenGotten;
        }
      } catch (e) {
        works = false;
      }
      return works;
    }();
    var isPromise = function(it) {
      return isObject(it) && (useNative ? classof(it) == 'Promise' : RECORD in it);
    };
    var sameConstructor = function(a, b) {
      if (LIBRARY && a === P && b === Wrapper)
        return true;
      return same(a, b);
    };
    var getConstructor = function(C) {
      var S = anObject(C)[SPECIES];
      return S != undefined ? S : C;
    };
    var isThenable = function(it) {
      var then;
      return isObject(it) && typeof(then = it.then) == 'function' ? then : false;
    };
    var notify = function(record, isReject) {
      if (record.n)
        return;
      record.n = true;
      var chain = record.c;
      asap(function() {
        var value = record.v,
            ok = record.s == 1,
            i = 0;
        var run = function(react) {
          var cb = ok ? react.ok : react.fail,
              ret,
              then;
          try {
            if (cb) {
              if (!ok)
                record.h = true;
              ret = cb === true ? value : cb(value);
              if (ret === react.P) {
                react.rej(TypeError('Promise-chain cycle'));
              } else if (then = isThenable(ret)) {
                then.call(ret, react.res, react.rej);
              } else
                react.res(ret);
            } else
              react.rej(value);
          } catch (err) {
            react.rej(err);
          }
        };
        while (chain.length > i)
          run(chain[i++]);
        chain.length = 0;
        record.n = false;
        if (isReject)
          setTimeout(function() {
            var promise = record.p,
                handler,
                console;
            if (isUnhandled(promise)) {
              if (isNode) {
                process.emit('unhandledRejection', value, promise);
              } else if (handler = global.onunhandledrejection) {
                handler({
                  promise: promise,
                  reason: value
                });
              } else if ((console = global.console) && console.error) {
                console.error('Unhandled promise rejection', value);
              }
            }
            record.a = undefined;
          }, 1);
      });
    };
    var isUnhandled = function(promise) {
      var record = promise[RECORD],
          chain = record.a || record.c,
          i = 0,
          react;
      if (record.h)
        return false;
      while (chain.length > i) {
        react = chain[i++];
        if (react.fail || !isUnhandled(react.P))
          return false;
      }
      return true;
    };
    var $reject = function(value) {
      var record = this;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      record.v = value;
      record.s = 2;
      record.a = record.c.slice();
      notify(record, true);
    };
    var $resolve = function(value) {
      var record = this,
          then;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      try {
        if (then = isThenable(value)) {
          asap(function() {
            var wrapper = {
              r: record,
              d: false
            };
            try {
              then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
            } catch (e) {
              $reject.call(wrapper, e);
            }
          });
        } else {
          record.v = value;
          record.s = 1;
          notify(record, false);
        }
      } catch (e) {
        $reject.call({
          r: record,
          d: false
        }, e);
      }
    };
    if (!useNative) {
      P = function Promise(executor) {
        aFunction(executor);
        var record = {
          p: strictNew(this, P, PROMISE),
          c: [],
          a: undefined,
          s: 0,
          d: false,
          v: undefined,
          h: false,
          n: false
        };
        this[RECORD] = record;
        try {
          executor(ctx($resolve, record, 1), ctx($reject, record, 1));
        } catch (err) {
          $reject.call(record, err);
        }
      };
      req('5e')(P.prototype, {
        then: function then(onFulfilled, onRejected) {
          var S = anObject(anObject(this).constructor)[SPECIES];
          var react = {
            ok: typeof onFulfilled == 'function' ? onFulfilled : true,
            fail: typeof onRejected == 'function' ? onRejected : false
          };
          var promise = react.P = new (S != undefined ? S : P)(function(res, rej) {
            react.res = res;
            react.rej = rej;
          });
          aFunction(react.res);
          aFunction(react.rej);
          var record = this[RECORD];
          record.c.push(react);
          if (record.a)
            record.a.push(react);
          if (record.s)
            notify(record, false);
          return promise;
        },
        'catch': function(onRejected) {
          return this.then(undefined, onRejected);
        }
      });
    }
    $def($def.G + $def.W + $def.F * !useNative, {Promise: P});
    req('44')(P, PROMISE);
    species(P);
    species(Wrapper = req('8')[PROMISE]);
    $def($def.S + $def.F * !useNative, PROMISE, {reject: function reject(r) {
        return new this(function(res, rej) {
          rej(r);
        });
      }});
    $def($def.S + $def.F * (!useNative || testResolve(true)), PROMISE, {resolve: function resolve(x) {
        return isPromise(x) && sameConstructor(x.constructor, this) ? x : new this(function(res) {
          res(x);
        });
      }});
    $def($def.S + $def.F * !(useNative && req('5f')(function(iter) {
      P.all(iter)['catch'](function() {});
    })), PROMISE, {
      all: function all(iterable) {
        var C = getConstructor(this),
            values = [];
        return new C(function(res, rej) {
          forOf(iterable, false, values.push, values);
          var remaining = values.length,
              results = Array(remaining);
          if (remaining)
            $.each.call(values, function(promise, index) {
              C.resolve(promise).then(function(value) {
                results[index] = value;
                --remaining || res(results);
              }, rej);
            });
          else
            res(results);
        });
      },
      race: function race(iterable) {
        var C = getConstructor(this);
        return new C(function(res, rej) {
          forOf(iterable, false, function(promise) {
            C.resolve(promise).then(res, rej);
          });
        });
      }
    });
  })(req('5b'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("61", ["38", "47", "4b", "60", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('38');
  req('47');
  req('4b');
  req('60');
  module.exports = req('8').Promise;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("62", ["61"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('61'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.register('63', ['28', '62', '2b', '2c'], function (_export) {
	var _Object$keys, _Promise, isString, xhrPost;

	/**
  * Save infobox XML to MediaWiki
  *
  * @param xmlString {string} A serialized string of portable infobox xml
  * @param options {object} Config for persistence
  * @return {Promise}
  */

	function persist(xmlString, options) {
		var title = options.title;

		if (!xmlString || !isString(xmlString) || !isString(title)) {
			throw new TypeError('Infobox title and xml are required for saving to MediaWiki');
		}

		return getEditToken(title).then(save.bind(null, xmlString, title));
	}

	/**
  * Send request to MW API to save infobox article with new data
  * @param xmlString {string} New value for the infobox xml
  * @param title {string} Name of the article where the infobox xml will be saved
  * @param editToken {string} Needed for authenticating request
  * @return {Promise}
  */
	function save(xmlString, title, editToken) {
		return new _Promise(function (resolve, reject) {
			// FIXME: this is hard coded to point to a devbox, but is designed to be run at the same domain as `/api.php`
			xhrPost('http://lizlux.liz.wikia-dev.com/api.php', {
				data: {
					action: 'edit',
					title: title,
					text: xmlString,
					token: editToken,
					format: 'json'
				},
				success: function success(event) {
					var xhr = event.target;
					var response = JSON.parse(xhr.responseText);
					if (response.edit && response.edit.result === 'Success') {
						resolve();
					} else if (response.error) {
						reject(response.error.code);
					} else {
						reject('Bad request');
					}
				},
				fail: function fail() {
					return reject('Bad request');
				}
			});
		});
	}

	/**
  * Get an edit token so we can save an article via MW API
  * @param title {string} Name of the article where the infobox xml will be saved
  * @return {Promise}
  */
	function getEditToken(title) {
		return new _Promise(function (resolve, reject) {
			// FIXME: this is hard coded to point to a devbox, but is designed to be run at the same domain as `/api.php`
			xhrPost('http://lizlux.liz.wikia-dev.com/api.php', {
				data: {
					action: 'query',
					prop: 'info',
					titles: title,
					intoken: 'edit',
					format: 'json'
				},
				success: function success(event) {
					var xhr = event.target;
					var response = JSON.parse(xhr.responseText);
					if (response.error) {
						reject(response.error.code);
					} else {
						var pages = response.query.pages;
						if (pages) {
							// get edit token from MW API response
							var editToken = pages[_Object$keys(pages)[0]].edittoken;
							if (editToken === undefined) {
								reject('No edit token');
							}
							resolve(editToken);
						} else {
							reject();
						}
					}
				},
				fail: function fail() {
					return reject('Bad request');
				}
			});
		});
	}
	return {
		setters: [function (_2) {
			_Object$keys = _2['default'];
		}, function (_) {
			_Promise = _['default'];
		}, function (_b) {
			isString = _b.isString;
		}, function (_c) {
			xhrPost = _c.xhrPost;
		}],
		execute: function () {
			'use strict';

			_export('persist', persist);
		}
	};
});
$__System.registerDynamic("64", [], false, function(__require, __exports, __module) {
  var _retrieveGlobal = $__System.get("@@global-helpers").prepareGlobal(__module.id, "Handlebars", null);
  (function() {
    "format global";
    "exports Handlebars";
    (function webpackUniversalModuleDefinition(root, factory) {
      if (typeof exports === 'object' && typeof module === 'object')
        module.exports = factory();
      else if (typeof define === 'function' && define.amd)
        define(factory);
      else if (typeof exports === 'object')
        exports["Handlebars"] = factory();
      else
        root["Handlebars"] = factory();
    })(this, function() {
      return (function(modules) {
        var installedModules = {};
        function __webpack_require__(moduleId) {
          if (installedModules[moduleId])
            return installedModules[moduleId].exports;
          var module = installedModules[moduleId] = {
            exports: {},
            id: moduleId,
            loaded: false
          };
          modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
          module.loaded = true;
          return module.exports;
        }
        __webpack_require__.m = modules;
        __webpack_require__.c = installedModules;
        __webpack_require__.p = "";
        return __webpack_require__(0);
      })([function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _handlebarsRuntime = __webpack_require__(1);
        var _handlebarsRuntime2 = _interopRequireDefault(_handlebarsRuntime);
        var _handlebarsCompilerAst = __webpack_require__(2);
        var _handlebarsCompilerAst2 = _interopRequireDefault(_handlebarsCompilerAst);
        var _handlebarsCompilerBase = __webpack_require__(3);
        var _handlebarsCompilerCompiler = __webpack_require__(4);
        var _handlebarsCompilerJavascriptCompiler = __webpack_require__(5);
        var _handlebarsCompilerJavascriptCompiler2 = _interopRequireDefault(_handlebarsCompilerJavascriptCompiler);
        var _handlebarsCompilerVisitor = __webpack_require__(6);
        var _handlebarsCompilerVisitor2 = _interopRequireDefault(_handlebarsCompilerVisitor);
        var _handlebarsNoConflict = __webpack_require__(7);
        var _handlebarsNoConflict2 = _interopRequireDefault(_handlebarsNoConflict);
        var _create = _handlebarsRuntime2['default'].create;
        function create() {
          var hb = _create();
          hb.compile = function(input, options) {
            return _handlebarsCompilerCompiler.compile(input, options, hb);
          };
          hb.precompile = function(input, options) {
            return _handlebarsCompilerCompiler.precompile(input, options, hb);
          };
          hb.AST = _handlebarsCompilerAst2['default'];
          hb.Compiler = _handlebarsCompilerCompiler.Compiler;
          hb.JavaScriptCompiler = _handlebarsCompilerJavascriptCompiler2['default'];
          hb.Parser = _handlebarsCompilerBase.parser;
          hb.parse = _handlebarsCompilerBase.parse;
          return hb;
        }
        var inst = create();
        inst.create = create;
        _handlebarsNoConflict2['default'](inst);
        inst.Visitor = _handlebarsCompilerVisitor2['default'];
        inst['default'] = inst;
        exports['default'] = inst;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireWildcard = __webpack_require__(9)['default'];
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _handlebarsBase = __webpack_require__(10);
        var base = _interopRequireWildcard(_handlebarsBase);
        var _handlebarsSafeString = __webpack_require__(11);
        var _handlebarsSafeString2 = _interopRequireDefault(_handlebarsSafeString);
        var _handlebarsException = __webpack_require__(12);
        var _handlebarsException2 = _interopRequireDefault(_handlebarsException);
        var _handlebarsUtils = __webpack_require__(13);
        var Utils = _interopRequireWildcard(_handlebarsUtils);
        var _handlebarsRuntime = __webpack_require__(14);
        var runtime = _interopRequireWildcard(_handlebarsRuntime);
        var _handlebarsNoConflict = __webpack_require__(7);
        var _handlebarsNoConflict2 = _interopRequireDefault(_handlebarsNoConflict);
        function create() {
          var hb = new base.HandlebarsEnvironment();
          Utils.extend(hb, base);
          hb.SafeString = _handlebarsSafeString2['default'];
          hb.Exception = _handlebarsException2['default'];
          hb.Utils = Utils;
          hb.escapeExpression = Utils.escapeExpression;
          hb.VM = runtime;
          hb.template = function(spec) {
            return runtime.template(spec, hb);
          };
          return hb;
        }
        var inst = create();
        inst.create = create;
        _handlebarsNoConflict2['default'](inst);
        inst['default'] = inst;
        exports['default'] = inst;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var AST = {helpers: {
            helperExpression: function helperExpression(node) {
              return node.type === 'SubExpression' || (node.type === 'MustacheStatement' || node.type === 'BlockStatement') && !!(node.params && node.params.length || node.hash);
            },
            scopedId: function scopedId(path) {
              return (/^\.|this\b/.test(path.original));
            },
            simpleId: function simpleId(path) {
              return path.parts.length === 1 && !AST.helpers.scopedId(path) && !path.depth;
            }
          }};
        exports['default'] = AST;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        var _interopRequireWildcard = __webpack_require__(9)['default'];
        exports.__esModule = true;
        exports.parse = parse;
        var _parser = __webpack_require__(15);
        var _parser2 = _interopRequireDefault(_parser);
        var _whitespaceControl = __webpack_require__(16);
        var _whitespaceControl2 = _interopRequireDefault(_whitespaceControl);
        var _helpers = __webpack_require__(17);
        var Helpers = _interopRequireWildcard(_helpers);
        var _utils = __webpack_require__(13);
        exports.parser = _parser2['default'];
        var yy = {};
        _utils.extend(yy, Helpers);
        function parse(input, options) {
          if (input.type === 'Program') {
            return input;
          }
          _parser2['default'].yy = yy;
          yy.locInfo = function(locInfo) {
            return new yy.SourceLocation(options && options.srcName, locInfo);
          };
          var strip = new _whitespaceControl2['default'](options);
          return strip.accept(_parser2['default'].parse(input));
        }
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        exports.Compiler = Compiler;
        exports.precompile = precompile;
        exports.compile = compile;
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        var _utils = __webpack_require__(13);
        var _ast = __webpack_require__(2);
        var _ast2 = _interopRequireDefault(_ast);
        var slice = [].slice;
        function Compiler() {}
        Compiler.prototype = {
          compiler: Compiler,
          equals: function equals(other) {
            var len = this.opcodes.length;
            if (other.opcodes.length !== len) {
              return false;
            }
            for (var i = 0; i < len; i++) {
              var opcode = this.opcodes[i],
                  otherOpcode = other.opcodes[i];
              if (opcode.opcode !== otherOpcode.opcode || !argEquals(opcode.args, otherOpcode.args)) {
                return false;
              }
            }
            len = this.children.length;
            for (var i = 0; i < len; i++) {
              if (!this.children[i].equals(other.children[i])) {
                return false;
              }
            }
            return true;
          },
          guid: 0,
          compile: function compile(program, options) {
            this.sourceNode = [];
            this.opcodes = [];
            this.children = [];
            this.options = options;
            this.stringParams = options.stringParams;
            this.trackIds = options.trackIds;
            options.blockParams = options.blockParams || [];
            var knownHelpers = options.knownHelpers;
            options.knownHelpers = {
              'helperMissing': true,
              'blockHelperMissing': true,
              'each': true,
              'if': true,
              'unless': true,
              'with': true,
              'log': true,
              'lookup': true
            };
            if (knownHelpers) {
              for (var _name in knownHelpers) {
                if (_name in knownHelpers) {
                  options.knownHelpers[_name] = knownHelpers[_name];
                }
              }
            }
            return this.accept(program);
          },
          compileProgram: function compileProgram(program) {
            var childCompiler = new this.compiler(),
                result = childCompiler.compile(program, this.options),
                guid = this.guid++;
            this.usePartial = this.usePartial || result.usePartial;
            this.children[guid] = result;
            this.useDepths = this.useDepths || result.useDepths;
            return guid;
          },
          accept: function accept(node) {
            if (!this[node.type]) {
              throw new _exception2['default']('Unknown type: ' + node.type, node);
            }
            this.sourceNode.unshift(node);
            var ret = this[node.type](node);
            this.sourceNode.shift();
            return ret;
          },
          Program: function Program(program) {
            this.options.blockParams.unshift(program.blockParams);
            var body = program.body,
                bodyLength = body.length;
            for (var i = 0; i < bodyLength; i++) {
              this.accept(body[i]);
            }
            this.options.blockParams.shift();
            this.isSimple = bodyLength === 1;
            this.blockParams = program.blockParams ? program.blockParams.length : 0;
            return this;
          },
          BlockStatement: function BlockStatement(block) {
            transformLiteralToPath(block);
            var program = block.program,
                inverse = block.inverse;
            program = program && this.compileProgram(program);
            inverse = inverse && this.compileProgram(inverse);
            var type = this.classifySexpr(block);
            if (type === 'helper') {
              this.helperSexpr(block, program, inverse);
            } else if (type === 'simple') {
              this.simpleSexpr(block);
              this.opcode('pushProgram', program);
              this.opcode('pushProgram', inverse);
              this.opcode('emptyHash');
              this.opcode('blockValue', block.path.original);
            } else {
              this.ambiguousSexpr(block, program, inverse);
              this.opcode('pushProgram', program);
              this.opcode('pushProgram', inverse);
              this.opcode('emptyHash');
              this.opcode('ambiguousBlockValue');
            }
            this.opcode('append');
          },
          DecoratorBlock: function DecoratorBlock(decorator) {
            var program = decorator.program && this.compileProgram(decorator.program);
            var params = this.setupFullMustacheParams(decorator, program, undefined),
                path = decorator.path;
            this.useDecorators = true;
            this.opcode('registerDecorator', params.length, path.original);
          },
          PartialStatement: function PartialStatement(partial) {
            this.usePartial = true;
            var program = partial.program;
            if (program) {
              program = this.compileProgram(partial.program);
            }
            var params = partial.params;
            if (params.length > 1) {
              throw new _exception2['default']('Unsupported number of partial arguments: ' + params.length, partial);
            } else if (!params.length) {
              if (this.options.explicitPartialContext) {
                this.opcode('pushLiteral', 'undefined');
              } else {
                params.push({
                  type: 'PathExpression',
                  parts: [],
                  depth: 0
                });
              }
            }
            var partialName = partial.name.original,
                isDynamic = partial.name.type === 'SubExpression';
            if (isDynamic) {
              this.accept(partial.name);
            }
            this.setupFullMustacheParams(partial, program, undefined, true);
            var indent = partial.indent || '';
            if (this.options.preventIndent && indent) {
              this.opcode('appendContent', indent);
              indent = '';
            }
            this.opcode('invokePartial', isDynamic, partialName, indent);
            this.opcode('append');
          },
          PartialBlockStatement: function PartialBlockStatement(partialBlock) {
            this.PartialStatement(partialBlock);
          },
          MustacheStatement: function MustacheStatement(mustache) {
            this.SubExpression(mustache);
            if (mustache.escaped && !this.options.noEscape) {
              this.opcode('appendEscaped');
            } else {
              this.opcode('append');
            }
          },
          Decorator: function Decorator(decorator) {
            this.DecoratorBlock(decorator);
          },
          ContentStatement: function ContentStatement(content) {
            if (content.value) {
              this.opcode('appendContent', content.value);
            }
          },
          CommentStatement: function CommentStatement() {},
          SubExpression: function SubExpression(sexpr) {
            transformLiteralToPath(sexpr);
            var type = this.classifySexpr(sexpr);
            if (type === 'simple') {
              this.simpleSexpr(sexpr);
            } else if (type === 'helper') {
              this.helperSexpr(sexpr);
            } else {
              this.ambiguousSexpr(sexpr);
            }
          },
          ambiguousSexpr: function ambiguousSexpr(sexpr, program, inverse) {
            var path = sexpr.path,
                name = path.parts[0],
                isBlock = program != null || inverse != null;
            this.opcode('getContext', path.depth);
            this.opcode('pushProgram', program);
            this.opcode('pushProgram', inverse);
            path.strict = true;
            this.accept(path);
            this.opcode('invokeAmbiguous', name, isBlock);
          },
          simpleSexpr: function simpleSexpr(sexpr) {
            var path = sexpr.path;
            path.strict = true;
            this.accept(path);
            this.opcode('resolvePossibleLambda');
          },
          helperSexpr: function helperSexpr(sexpr, program, inverse) {
            var params = this.setupFullMustacheParams(sexpr, program, inverse),
                path = sexpr.path,
                name = path.parts[0];
            if (this.options.knownHelpers[name]) {
              this.opcode('invokeKnownHelper', params.length, name);
            } else if (this.options.knownHelpersOnly) {
              throw new _exception2['default']('You specified knownHelpersOnly, but used the unknown helper ' + name, sexpr);
            } else {
              path.strict = true;
              path.falsy = true;
              this.accept(path);
              this.opcode('invokeHelper', params.length, path.original, _ast2['default'].helpers.simpleId(path));
            }
          },
          PathExpression: function PathExpression(path) {
            this.addDepth(path.depth);
            this.opcode('getContext', path.depth);
            var name = path.parts[0],
                scoped = _ast2['default'].helpers.scopedId(path),
                blockParamId = !path.depth && !scoped && this.blockParamIndex(name);
            if (blockParamId) {
              this.opcode('lookupBlockParam', blockParamId, path.parts);
            } else if (!name) {
              this.opcode('pushContext');
            } else if (path.data) {
              this.options.data = true;
              this.opcode('lookupData', path.depth, path.parts, path.strict);
            } else {
              this.opcode('lookupOnContext', path.parts, path.falsy, path.strict, scoped);
            }
          },
          StringLiteral: function StringLiteral(string) {
            this.opcode('pushString', string.value);
          },
          NumberLiteral: function NumberLiteral(number) {
            this.opcode('pushLiteral', number.value);
          },
          BooleanLiteral: function BooleanLiteral(bool) {
            this.opcode('pushLiteral', bool.value);
          },
          UndefinedLiteral: function UndefinedLiteral() {
            this.opcode('pushLiteral', 'undefined');
          },
          NullLiteral: function NullLiteral() {
            this.opcode('pushLiteral', 'null');
          },
          Hash: function Hash(hash) {
            var pairs = hash.pairs,
                i = 0,
                l = pairs.length;
            this.opcode('pushHash');
            for (; i < l; i++) {
              this.pushParam(pairs[i].value);
            }
            while (i--) {
              this.opcode('assignToHash', pairs[i].key);
            }
            this.opcode('popHash');
          },
          opcode: function opcode(name) {
            this.opcodes.push({
              opcode: name,
              args: slice.call(arguments, 1),
              loc: this.sourceNode[0].loc
            });
          },
          addDepth: function addDepth(depth) {
            if (!depth) {
              return;
            }
            this.useDepths = true;
          },
          classifySexpr: function classifySexpr(sexpr) {
            var isSimple = _ast2['default'].helpers.simpleId(sexpr.path);
            var isBlockParam = isSimple && !!this.blockParamIndex(sexpr.path.parts[0]);
            var isHelper = !isBlockParam && _ast2['default'].helpers.helperExpression(sexpr);
            var isEligible = !isBlockParam && (isHelper || isSimple);
            if (isEligible && !isHelper) {
              var _name2 = sexpr.path.parts[0],
                  options = this.options;
              if (options.knownHelpers[_name2]) {
                isHelper = true;
              } else if (options.knownHelpersOnly) {
                isEligible = false;
              }
            }
            if (isHelper) {
              return 'helper';
            } else if (isEligible) {
              return 'ambiguous';
            } else {
              return 'simple';
            }
          },
          pushParams: function pushParams(params) {
            for (var i = 0,
                l = params.length; i < l; i++) {
              this.pushParam(params[i]);
            }
          },
          pushParam: function pushParam(val) {
            var value = val.value != null ? val.value : val.original || '';
            if (this.stringParams) {
              if (value.replace) {
                value = value.replace(/^(\.?\.\/)*/g, '').replace(/\//g, '.');
              }
              if (val.depth) {
                this.addDepth(val.depth);
              }
              this.opcode('getContext', val.depth || 0);
              this.opcode('pushStringParam', value, val.type);
              if (val.type === 'SubExpression') {
                this.accept(val);
              }
            } else {
              if (this.trackIds) {
                var blockParamIndex = undefined;
                if (val.parts && !_ast2['default'].helpers.scopedId(val) && !val.depth) {
                  blockParamIndex = this.blockParamIndex(val.parts[0]);
                }
                if (blockParamIndex) {
                  var blockParamChild = val.parts.slice(1).join('.');
                  this.opcode('pushId', 'BlockParam', blockParamIndex, blockParamChild);
                } else {
                  value = val.original || value;
                  if (value.replace) {
                    value = value.replace(/^this(?:\.|$)/, '').replace(/^\.\//, '').replace(/^\.$/, '');
                  }
                  this.opcode('pushId', val.type, value);
                }
              }
              this.accept(val);
            }
          },
          setupFullMustacheParams: function setupFullMustacheParams(sexpr, program, inverse, omitEmpty) {
            var params = sexpr.params;
            this.pushParams(params);
            this.opcode('pushProgram', program);
            this.opcode('pushProgram', inverse);
            if (sexpr.hash) {
              this.accept(sexpr.hash);
            } else {
              this.opcode('emptyHash', omitEmpty);
            }
            return params;
          },
          blockParamIndex: function blockParamIndex(name) {
            for (var depth = 0,
                len = this.options.blockParams.length; depth < len; depth++) {
              var blockParams = this.options.blockParams[depth],
                  param = blockParams && _utils.indexOf(blockParams, name);
              if (blockParams && param >= 0) {
                return [depth, param];
              }
            }
          }
        };
        function precompile(input, options, env) {
          if (input == null || typeof input !== 'string' && input.type !== 'Program') {
            throw new _exception2['default']('You must pass a string or Handlebars AST to Handlebars.precompile. You passed ' + input);
          }
          options = options || {};
          if (!('data' in options)) {
            options.data = true;
          }
          if (options.compat) {
            options.useDepths = true;
          }
          var ast = env.parse(input, options),
              environment = new env.Compiler().compile(ast, options);
          return new env.JavaScriptCompiler().compile(environment, options);
        }
        function compile(input, options, env) {
          if (options === undefined)
            options = {};
          if (input == null || typeof input !== 'string' && input.type !== 'Program') {
            throw new _exception2['default']('You must pass a string or Handlebars AST to Handlebars.compile. You passed ' + input);
          }
          if (!('data' in options)) {
            options.data = true;
          }
          if (options.compat) {
            options.useDepths = true;
          }
          var compiled = undefined;
          function compileInput() {
            var ast = env.parse(input, options),
                environment = new env.Compiler().compile(ast, options),
                templateSpec = new env.JavaScriptCompiler().compile(environment, options, undefined, true);
            return env.template(templateSpec);
          }
          function ret(context, execOptions) {
            if (!compiled) {
              compiled = compileInput();
            }
            return compiled.call(this, context, execOptions);
          }
          ret._setup = function(setupOptions) {
            if (!compiled) {
              compiled = compileInput();
            }
            return compiled._setup(setupOptions);
          };
          ret._child = function(i, data, blockParams, depths) {
            if (!compiled) {
              compiled = compileInput();
            }
            return compiled._child(i, data, blockParams, depths);
          };
          return ret;
        }
        function argEquals(a, b) {
          if (a === b) {
            return true;
          }
          if (_utils.isArray(a) && _utils.isArray(b) && a.length === b.length) {
            for (var i = 0; i < a.length; i++) {
              if (!argEquals(a[i], b[i])) {
                return false;
              }
            }
            return true;
          }
        }
        function transformLiteralToPath(sexpr) {
          if (!sexpr.path.parts) {
            var literal = sexpr.path;
            sexpr.path = {
              type: 'PathExpression',
              data: false,
              depth: 0,
              parts: [literal.original + ''],
              original: literal.original + '',
              loc: literal.loc
            };
          }
        }
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _base = __webpack_require__(10);
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        var _utils = __webpack_require__(13);
        var _codeGen = __webpack_require__(18);
        var _codeGen2 = _interopRequireDefault(_codeGen);
        function Literal(value) {
          this.value = value;
        }
        function JavaScriptCompiler() {}
        JavaScriptCompiler.prototype = {
          nameLookup: function nameLookup(parent, name) {
            if (JavaScriptCompiler.isValidJavaScriptVariableName(name)) {
              return [parent, '.', name];
            } else {
              return [parent, '[', JSON.stringify(name), ']'];
            }
          },
          depthedLookup: function depthedLookup(name) {
            return [this.aliasable('container.lookup'), '(depths, "', name, '")'];
          },
          compilerInfo: function compilerInfo() {
            var revision = _base.COMPILER_REVISION,
                versions = _base.REVISION_CHANGES[revision];
            return [revision, versions];
          },
          appendToBuffer: function appendToBuffer(source, location, explicit) {
            if (!_utils.isArray(source)) {
              source = [source];
            }
            source = this.source.wrap(source, location);
            if (this.environment.isSimple) {
              return ['return ', source, ';'];
            } else if (explicit) {
              return ['buffer += ', source, ';'];
            } else {
              source.appendToBuffer = true;
              return source;
            }
          },
          initializeBuffer: function initializeBuffer() {
            return this.quotedString('');
          },
          compile: function compile(environment, options, context, asObject) {
            this.environment = environment;
            this.options = options;
            this.stringParams = this.options.stringParams;
            this.trackIds = this.options.trackIds;
            this.precompile = !asObject;
            this.name = this.environment.name;
            this.isChild = !!context;
            this.context = context || {
              decorators: [],
              programs: [],
              environments: []
            };
            this.preamble();
            this.stackSlot = 0;
            this.stackVars = [];
            this.aliases = {};
            this.registers = {list: []};
            this.hashes = [];
            this.compileStack = [];
            this.inlineStack = [];
            this.blockParams = [];
            this.compileChildren(environment, options);
            this.useDepths = this.useDepths || environment.useDepths || environment.useDecorators || this.options.compat;
            this.useBlockParams = this.useBlockParams || environment.useBlockParams;
            var opcodes = environment.opcodes,
                opcode = undefined,
                firstLoc = undefined,
                i = undefined,
                l = undefined;
            for (i = 0, l = opcodes.length; i < l; i++) {
              opcode = opcodes[i];
              this.source.currentLocation = opcode.loc;
              firstLoc = firstLoc || opcode.loc;
              this[opcode.opcode].apply(this, opcode.args);
            }
            this.source.currentLocation = firstLoc;
            this.pushSource('');
            if (this.stackSlot || this.inlineStack.length || this.compileStack.length) {
              throw new _exception2['default']('Compile completed with content left on stack');
            }
            if (!this.decorators.isEmpty()) {
              this.useDecorators = true;
              this.decorators.prepend('var decorators = container.decorators;\n');
              this.decorators.push('return fn;');
              if (asObject) {
                this.decorators = Function.apply(this, ['fn', 'props', 'container', 'depth0', 'data', 'blockParams', 'depths', this.decorators.merge()]);
              } else {
                this.decorators.prepend('function(fn, props, container, depth0, data, blockParams, depths) {\n');
                this.decorators.push('}\n');
                this.decorators = this.decorators.merge();
              }
            } else {
              this.decorators = undefined;
            }
            var fn = this.createFunctionContext(asObject);
            if (!this.isChild) {
              var ret = {
                compiler: this.compilerInfo(),
                main: fn
              };
              if (this.decorators) {
                ret.main_d = this.decorators;
                ret.useDecorators = true;
              }
              var _context = this.context;
              var programs = _context.programs;
              var decorators = _context.decorators;
              for (i = 0, l = programs.length; i < l; i++) {
                if (programs[i]) {
                  ret[i] = programs[i];
                  if (decorators[i]) {
                    ret[i + '_d'] = decorators[i];
                    ret.useDecorators = true;
                  }
                }
              }
              if (this.environment.usePartial) {
                ret.usePartial = true;
              }
              if (this.options.data) {
                ret.useData = true;
              }
              if (this.useDepths) {
                ret.useDepths = true;
              }
              if (this.useBlockParams) {
                ret.useBlockParams = true;
              }
              if (this.options.compat) {
                ret.compat = true;
              }
              if (!asObject) {
                ret.compiler = JSON.stringify(ret.compiler);
                this.source.currentLocation = {start: {
                    line: 1,
                    column: 0
                  }};
                ret = this.objectLiteral(ret);
                if (options.srcName) {
                  ret = ret.toStringWithSourceMap({file: options.destName});
                  ret.map = ret.map && ret.map.toString();
                } else {
                  ret = ret.toString();
                }
              } else {
                ret.compilerOptions = this.options;
              }
              return ret;
            } else {
              return fn;
            }
          },
          preamble: function preamble() {
            this.lastContext = 0;
            this.source = new _codeGen2['default'](this.options.srcName);
            this.decorators = new _codeGen2['default'](this.options.srcName);
          },
          createFunctionContext: function createFunctionContext(asObject) {
            var varDeclarations = '';
            var locals = this.stackVars.concat(this.registers.list);
            if (locals.length > 0) {
              varDeclarations += ', ' + locals.join(', ');
            }
            var aliasCount = 0;
            for (var alias in this.aliases) {
              var node = this.aliases[alias];
              if (this.aliases.hasOwnProperty(alias) && node.children && node.referenceCount > 1) {
                varDeclarations += ', alias' + ++aliasCount + '=' + alias;
                node.children[0] = 'alias' + aliasCount;
              }
            }
            var params = ['container', 'depth0', 'helpers', 'partials', 'data'];
            if (this.useBlockParams || this.useDepths) {
              params.push('blockParams');
            }
            if (this.useDepths) {
              params.push('depths');
            }
            var source = this.mergeSource(varDeclarations);
            if (asObject) {
              params.push(source);
              return Function.apply(this, params);
            } else {
              return this.source.wrap(['function(', params.join(','), ') {\n  ', source, '}']);
            }
          },
          mergeSource: function mergeSource(varDeclarations) {
            var isSimple = this.environment.isSimple,
                appendOnly = !this.forceBuffer,
                appendFirst = undefined,
                sourceSeen = undefined,
                bufferStart = undefined,
                bufferEnd = undefined;
            this.source.each(function(line) {
              if (line.appendToBuffer) {
                if (bufferStart) {
                  line.prepend('  + ');
                } else {
                  bufferStart = line;
                }
                bufferEnd = line;
              } else {
                if (bufferStart) {
                  if (!sourceSeen) {
                    appendFirst = true;
                  } else {
                    bufferStart.prepend('buffer += ');
                  }
                  bufferEnd.add(';');
                  bufferStart = bufferEnd = undefined;
                }
                sourceSeen = true;
                if (!isSimple) {
                  appendOnly = false;
                }
              }
            });
            if (appendOnly) {
              if (bufferStart) {
                bufferStart.prepend('return ');
                bufferEnd.add(';');
              } else if (!sourceSeen) {
                this.source.push('return "";');
              }
            } else {
              varDeclarations += ', buffer = ' + (appendFirst ? '' : this.initializeBuffer());
              if (bufferStart) {
                bufferStart.prepend('return buffer + ');
                bufferEnd.add(';');
              } else {
                this.source.push('return buffer;');
              }
            }
            if (varDeclarations) {
              this.source.prepend('var ' + varDeclarations.substring(2) + (appendFirst ? '' : ';\n'));
            }
            return this.source.merge();
          },
          blockValue: function blockValue(name) {
            var blockHelperMissing = this.aliasable('helpers.blockHelperMissing'),
                params = [this.contextName(0)];
            this.setupHelperArgs(name, 0, params);
            var blockName = this.popStack();
            params.splice(1, 0, blockName);
            this.push(this.source.functionCall(blockHelperMissing, 'call', params));
          },
          ambiguousBlockValue: function ambiguousBlockValue() {
            var blockHelperMissing = this.aliasable('helpers.blockHelperMissing'),
                params = [this.contextName(0)];
            this.setupHelperArgs('', 0, params, true);
            this.flushInline();
            var current = this.topStack();
            params.splice(1, 0, current);
            this.pushSource(['if (!', this.lastHelper, ') { ', current, ' = ', this.source.functionCall(blockHelperMissing, 'call', params), '}']);
          },
          appendContent: function appendContent(content) {
            if (this.pendingContent) {
              content = this.pendingContent + content;
            } else {
              this.pendingLocation = this.source.currentLocation;
            }
            this.pendingContent = content;
          },
          append: function append() {
            if (this.isInline()) {
              this.replaceStack(function(current) {
                return [' != null ? ', current, ' : ""'];
              });
              this.pushSource(this.appendToBuffer(this.popStack()));
            } else {
              var local = this.popStack();
              this.pushSource(['if (', local, ' != null) { ', this.appendToBuffer(local, undefined, true), ' }']);
              if (this.environment.isSimple) {
                this.pushSource(['else { ', this.appendToBuffer("''", undefined, true), ' }']);
              }
            }
          },
          appendEscaped: function appendEscaped() {
            this.pushSource(this.appendToBuffer([this.aliasable('container.escapeExpression'), '(', this.popStack(), ')']));
          },
          getContext: function getContext(depth) {
            this.lastContext = depth;
          },
          pushContext: function pushContext() {
            this.pushStackLiteral(this.contextName(this.lastContext));
          },
          lookupOnContext: function lookupOnContext(parts, falsy, strict, scoped) {
            var i = 0;
            if (!scoped && this.options.compat && !this.lastContext) {
              this.push(this.depthedLookup(parts[i++]));
            } else {
              this.pushContext();
            }
            this.resolvePath('context', parts, i, falsy, strict);
          },
          lookupBlockParam: function lookupBlockParam(blockParamId, parts) {
            this.useBlockParams = true;
            this.push(['blockParams[', blockParamId[0], '][', blockParamId[1], ']']);
            this.resolvePath('context', parts, 1);
          },
          lookupData: function lookupData(depth, parts, strict) {
            if (!depth) {
              this.pushStackLiteral('data');
            } else {
              this.pushStackLiteral('container.data(data, ' + depth + ')');
            }
            this.resolvePath('data', parts, 0, true, strict);
          },
          resolvePath: function resolvePath(type, parts, i, falsy, strict) {
            var _this = this;
            if (this.options.strict || this.options.assumeObjects) {
              this.push(strictLookup(this.options.strict && strict, this, parts, type));
              return;
            }
            var len = parts.length;
            for (; i < len; i++) {
              this.replaceStack(function(current) {
                var lookup = _this.nameLookup(current, parts[i], type);
                if (!falsy) {
                  return [' != null ? ', lookup, ' : ', current];
                } else {
                  return [' && ', lookup];
                }
              });
            }
          },
          resolvePossibleLambda: function resolvePossibleLambda() {
            this.push([this.aliasable('container.lambda'), '(', this.popStack(), ', ', this.contextName(0), ')']);
          },
          pushStringParam: function pushStringParam(string, type) {
            this.pushContext();
            this.pushString(type);
            if (type !== 'SubExpression') {
              if (typeof string === 'string') {
                this.pushString(string);
              } else {
                this.pushStackLiteral(string);
              }
            }
          },
          emptyHash: function emptyHash(omitEmpty) {
            if (this.trackIds) {
              this.push('{}');
            }
            if (this.stringParams) {
              this.push('{}');
              this.push('{}');
            }
            this.pushStackLiteral(omitEmpty ? 'undefined' : '{}');
          },
          pushHash: function pushHash() {
            if (this.hash) {
              this.hashes.push(this.hash);
            }
            this.hash = {
              values: [],
              types: [],
              contexts: [],
              ids: []
            };
          },
          popHash: function popHash() {
            var hash = this.hash;
            this.hash = this.hashes.pop();
            if (this.trackIds) {
              this.push(this.objectLiteral(hash.ids));
            }
            if (this.stringParams) {
              this.push(this.objectLiteral(hash.contexts));
              this.push(this.objectLiteral(hash.types));
            }
            this.push(this.objectLiteral(hash.values));
          },
          pushString: function pushString(string) {
            this.pushStackLiteral(this.quotedString(string));
          },
          pushLiteral: function pushLiteral(value) {
            this.pushStackLiteral(value);
          },
          pushProgram: function pushProgram(guid) {
            if (guid != null) {
              this.pushStackLiteral(this.programExpression(guid));
            } else {
              this.pushStackLiteral(null);
            }
          },
          registerDecorator: function registerDecorator(paramSize, name) {
            var foundDecorator = this.nameLookup('decorators', name, 'decorator'),
                options = this.setupHelperArgs(name, paramSize);
            this.decorators.push(['fn = ', this.decorators.functionCall(foundDecorator, '', ['fn', 'props', 'container', options]), ' || fn;']);
          },
          invokeHelper: function invokeHelper(paramSize, name, isSimple) {
            var nonHelper = this.popStack(),
                helper = this.setupHelper(paramSize, name),
                simple = isSimple ? [helper.name, ' || '] : '';
            var lookup = ['('].concat(simple, nonHelper);
            if (!this.options.strict) {
              lookup.push(' || ', this.aliasable('helpers.helperMissing'));
            }
            lookup.push(')');
            this.push(this.source.functionCall(lookup, 'call', helper.callParams));
          },
          invokeKnownHelper: function invokeKnownHelper(paramSize, name) {
            var helper = this.setupHelper(paramSize, name);
            this.push(this.source.functionCall(helper.name, 'call', helper.callParams));
          },
          invokeAmbiguous: function invokeAmbiguous(name, helperCall) {
            this.useRegister('helper');
            var nonHelper = this.popStack();
            this.emptyHash();
            var helper = this.setupHelper(0, name, helperCall);
            var helperName = this.lastHelper = this.nameLookup('helpers', name, 'helper');
            var lookup = ['(', '(helper = ', helperName, ' || ', nonHelper, ')'];
            if (!this.options.strict) {
              lookup[0] = '(helper = ';
              lookup.push(' != null ? helper : ', this.aliasable('helpers.helperMissing'));
            }
            this.push(['(', lookup, helper.paramsInit ? ['),(', helper.paramsInit] : [], '),', '(typeof helper === ', this.aliasable('"function"'), ' ? ', this.source.functionCall('helper', 'call', helper.callParams), ' : helper))']);
          },
          invokePartial: function invokePartial(isDynamic, name, indent) {
            var params = [],
                options = this.setupParams(name, 1, params);
            if (isDynamic) {
              name = this.popStack();
              delete options.name;
            }
            if (indent) {
              options.indent = JSON.stringify(indent);
            }
            options.helpers = 'helpers';
            options.partials = 'partials';
            options.decorators = 'container.decorators';
            if (!isDynamic) {
              params.unshift(this.nameLookup('partials', name, 'partial'));
            } else {
              params.unshift(name);
            }
            if (this.options.compat) {
              options.depths = 'depths';
            }
            options = this.objectLiteral(options);
            params.push(options);
            this.push(this.source.functionCall('container.invokePartial', '', params));
          },
          assignToHash: function assignToHash(key) {
            var value = this.popStack(),
                context = undefined,
                type = undefined,
                id = undefined;
            if (this.trackIds) {
              id = this.popStack();
            }
            if (this.stringParams) {
              type = this.popStack();
              context = this.popStack();
            }
            var hash = this.hash;
            if (context) {
              hash.contexts[key] = context;
            }
            if (type) {
              hash.types[key] = type;
            }
            if (id) {
              hash.ids[key] = id;
            }
            hash.values[key] = value;
          },
          pushId: function pushId(type, name, child) {
            if (type === 'BlockParam') {
              this.pushStackLiteral('blockParams[' + name[0] + '].path[' + name[1] + ']' + (child ? ' + ' + JSON.stringify('.' + child) : ''));
            } else if (type === 'PathExpression') {
              this.pushString(name);
            } else if (type === 'SubExpression') {
              this.pushStackLiteral('true');
            } else {
              this.pushStackLiteral('null');
            }
          },
          compiler: JavaScriptCompiler,
          compileChildren: function compileChildren(environment, options) {
            var children = environment.children,
                child = undefined,
                compiler = undefined;
            for (var i = 0,
                l = children.length; i < l; i++) {
              child = children[i];
              compiler = new this.compiler();
              var index = this.matchExistingProgram(child);
              if (index == null) {
                this.context.programs.push('');
                index = this.context.programs.length;
                child.index = index;
                child.name = 'program' + index;
                this.context.programs[index] = compiler.compile(child, options, this.context, !this.precompile);
                this.context.decorators[index] = compiler.decorators;
                this.context.environments[index] = child;
                this.useDepths = this.useDepths || compiler.useDepths;
                this.useBlockParams = this.useBlockParams || compiler.useBlockParams;
              } else {
                child.index = index;
                child.name = 'program' + index;
                this.useDepths = this.useDepths || child.useDepths;
                this.useBlockParams = this.useBlockParams || child.useBlockParams;
              }
            }
          },
          matchExistingProgram: function matchExistingProgram(child) {
            for (var i = 0,
                len = this.context.environments.length; i < len; i++) {
              var environment = this.context.environments[i];
              if (environment && environment.equals(child)) {
                return i;
              }
            }
          },
          programExpression: function programExpression(guid) {
            var child = this.environment.children[guid],
                programParams = [child.index, 'data', child.blockParams];
            if (this.useBlockParams || this.useDepths) {
              programParams.push('blockParams');
            }
            if (this.useDepths) {
              programParams.push('depths');
            }
            return 'container.program(' + programParams.join(', ') + ')';
          },
          useRegister: function useRegister(name) {
            if (!this.registers[name]) {
              this.registers[name] = true;
              this.registers.list.push(name);
            }
          },
          push: function push(expr) {
            if (!(expr instanceof Literal)) {
              expr = this.source.wrap(expr);
            }
            this.inlineStack.push(expr);
            return expr;
          },
          pushStackLiteral: function pushStackLiteral(item) {
            this.push(new Literal(item));
          },
          pushSource: function pushSource(source) {
            if (this.pendingContent) {
              this.source.push(this.appendToBuffer(this.source.quotedString(this.pendingContent), this.pendingLocation));
              this.pendingContent = undefined;
            }
            if (source) {
              this.source.push(source);
            }
          },
          replaceStack: function replaceStack(callback) {
            var prefix = ['('],
                stack = undefined,
                createdStack = undefined,
                usedLiteral = undefined;
            if (!this.isInline()) {
              throw new _exception2['default']('replaceStack on non-inline');
            }
            var top = this.popStack(true);
            if (top instanceof Literal) {
              stack = [top.value];
              prefix = ['(', stack];
              usedLiteral = true;
            } else {
              createdStack = true;
              var _name = this.incrStack();
              prefix = ['((', this.push(_name), ' = ', top, ')'];
              stack = this.topStack();
            }
            var item = callback.call(this, stack);
            if (!usedLiteral) {
              this.popStack();
            }
            if (createdStack) {
              this.stackSlot--;
            }
            this.push(prefix.concat(item, ')'));
          },
          incrStack: function incrStack() {
            this.stackSlot++;
            if (this.stackSlot > this.stackVars.length) {
              this.stackVars.push('stack' + this.stackSlot);
            }
            return this.topStackName();
          },
          topStackName: function topStackName() {
            return 'stack' + this.stackSlot;
          },
          flushInline: function flushInline() {
            var inlineStack = this.inlineStack;
            this.inlineStack = [];
            for (var i = 0,
                len = inlineStack.length; i < len; i++) {
              var entry = inlineStack[i];
              if (entry instanceof Literal) {
                this.compileStack.push(entry);
              } else {
                var stack = this.incrStack();
                this.pushSource([stack, ' = ', entry, ';']);
                this.compileStack.push(stack);
              }
            }
          },
          isInline: function isInline() {
            return this.inlineStack.length;
          },
          popStack: function popStack(wrapped) {
            var inline = this.isInline(),
                item = (inline ? this.inlineStack : this.compileStack).pop();
            if (!wrapped && item instanceof Literal) {
              return item.value;
            } else {
              if (!inline) {
                if (!this.stackSlot) {
                  throw new _exception2['default']('Invalid stack pop');
                }
                this.stackSlot--;
              }
              return item;
            }
          },
          topStack: function topStack() {
            var stack = this.isInline() ? this.inlineStack : this.compileStack,
                item = stack[stack.length - 1];
            if (item instanceof Literal) {
              return item.value;
            } else {
              return item;
            }
          },
          contextName: function contextName(context) {
            if (this.useDepths && context) {
              return 'depths[' + context + ']';
            } else {
              return 'depth' + context;
            }
          },
          quotedString: function quotedString(str) {
            return this.source.quotedString(str);
          },
          objectLiteral: function objectLiteral(obj) {
            return this.source.objectLiteral(obj);
          },
          aliasable: function aliasable(name) {
            var ret = this.aliases[name];
            if (ret) {
              ret.referenceCount++;
              return ret;
            }
            ret = this.aliases[name] = this.source.wrap(name);
            ret.aliasable = true;
            ret.referenceCount = 1;
            return ret;
          },
          setupHelper: function setupHelper(paramSize, name, blockHelper) {
            var params = [],
                paramsInit = this.setupHelperArgs(name, paramSize, params, blockHelper);
            var foundHelper = this.nameLookup('helpers', name, 'helper'),
                callContext = this.aliasable(this.contextName(0) + ' != null ? ' + this.contextName(0) + ' : {}');
            return {
              params: params,
              paramsInit: paramsInit,
              name: foundHelper,
              callParams: [callContext].concat(params)
            };
          },
          setupParams: function setupParams(helper, paramSize, params) {
            var options = {},
                contexts = [],
                types = [],
                ids = [],
                objectArgs = !params,
                param = undefined;
            if (objectArgs) {
              params = [];
            }
            options.name = this.quotedString(helper);
            options.hash = this.popStack();
            if (this.trackIds) {
              options.hashIds = this.popStack();
            }
            if (this.stringParams) {
              options.hashTypes = this.popStack();
              options.hashContexts = this.popStack();
            }
            var inverse = this.popStack(),
                program = this.popStack();
            if (program || inverse) {
              options.fn = program || 'container.noop';
              options.inverse = inverse || 'container.noop';
            }
            var i = paramSize;
            while (i--) {
              param = this.popStack();
              params[i] = param;
              if (this.trackIds) {
                ids[i] = this.popStack();
              }
              if (this.stringParams) {
                types[i] = this.popStack();
                contexts[i] = this.popStack();
              }
            }
            if (objectArgs) {
              options.args = this.source.generateArray(params);
            }
            if (this.trackIds) {
              options.ids = this.source.generateArray(ids);
            }
            if (this.stringParams) {
              options.types = this.source.generateArray(types);
              options.contexts = this.source.generateArray(contexts);
            }
            if (this.options.data) {
              options.data = 'data';
            }
            if (this.useBlockParams) {
              options.blockParams = 'blockParams';
            }
            return options;
          },
          setupHelperArgs: function setupHelperArgs(helper, paramSize, params, useRegister) {
            var options = this.setupParams(helper, paramSize, params);
            options = this.objectLiteral(options);
            if (useRegister) {
              this.useRegister('options');
              params.push('options');
              return ['options=', options];
            } else if (params) {
              params.push(options);
              return '';
            } else {
              return options;
            }
          }
        };
        (function() {
          var reservedWords = ('break else new var' + ' case finally return void' + ' catch for switch while' + ' continue function this with' + ' default if throw' + ' delete in try' + ' do instanceof typeof' + ' abstract enum int short' + ' boolean export interface static' + ' byte extends long super' + ' char final native synchronized' + ' class float package throws' + ' const goto private transient' + ' debugger implements protected volatile' + ' double import public let yield await' + ' null true false').split(' ');
          var compilerWords = JavaScriptCompiler.RESERVED_WORDS = {};
          for (var i = 0,
              l = reservedWords.length; i < l; i++) {
            compilerWords[reservedWords[i]] = true;
          }
        })();
        JavaScriptCompiler.isValidJavaScriptVariableName = function(name) {
          return !JavaScriptCompiler.RESERVED_WORDS[name] && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(name);
        };
        function strictLookup(requireTerminal, compiler, parts, type) {
          var stack = compiler.popStack(),
              i = 0,
              len = parts.length;
          if (requireTerminal) {
            len--;
          }
          for (; i < len; i++) {
            stack = compiler.nameLookup(stack, parts[i], type);
          }
          if (requireTerminal) {
            return [compiler.aliasable('container.strict'), '(', stack, ', ', compiler.quotedString(parts[i]), ')'];
          } else {
            return stack;
          }
        }
        exports['default'] = JavaScriptCompiler;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        function Visitor() {
          this.parents = [];
        }
        Visitor.prototype = {
          constructor: Visitor,
          mutating: false,
          acceptKey: function acceptKey(node, name) {
            var value = this.accept(node[name]);
            if (this.mutating) {
              if (value && !Visitor.prototype[value.type]) {
                throw new _exception2['default']('Unexpected node type "' + value.type + '" found when accepting ' + name + ' on ' + node.type);
              }
              node[name] = value;
            }
          },
          acceptRequired: function acceptRequired(node, name) {
            this.acceptKey(node, name);
            if (!node[name]) {
              throw new _exception2['default'](node.type + ' requires ' + name);
            }
          },
          acceptArray: function acceptArray(array) {
            for (var i = 0,
                l = array.length; i < l; i++) {
              this.acceptKey(array, i);
              if (!array[i]) {
                array.splice(i, 1);
                i--;
                l--;
              }
            }
          },
          accept: function accept(object) {
            if (!object) {
              return;
            }
            if (!this[object.type]) {
              throw new _exception2['default']('Unknown type: ' + object.type, object);
            }
            if (this.current) {
              this.parents.unshift(this.current);
            }
            this.current = object;
            var ret = this[object.type](object);
            this.current = this.parents.shift();
            if (!this.mutating || ret) {
              return ret;
            } else if (ret !== false) {
              return object;
            }
          },
          Program: function Program(program) {
            this.acceptArray(program.body);
          },
          MustacheStatement: visitSubExpression,
          Decorator: visitSubExpression,
          BlockStatement: visitBlock,
          DecoratorBlock: visitBlock,
          PartialStatement: visitPartial,
          PartialBlockStatement: function PartialBlockStatement(partial) {
            visitPartial.call(this, partial);
            this.acceptKey(partial, 'program');
          },
          ContentStatement: function ContentStatement() {},
          CommentStatement: function CommentStatement() {},
          SubExpression: visitSubExpression,
          PathExpression: function PathExpression() {},
          StringLiteral: function StringLiteral() {},
          NumberLiteral: function NumberLiteral() {},
          BooleanLiteral: function BooleanLiteral() {},
          UndefinedLiteral: function UndefinedLiteral() {},
          NullLiteral: function NullLiteral() {},
          Hash: function Hash(hash) {
            this.acceptArray(hash.pairs);
          },
          HashPair: function HashPair(pair) {
            this.acceptRequired(pair, 'value');
          }
        };
        function visitSubExpression(mustache) {
          this.acceptRequired(mustache, 'path');
          this.acceptArray(mustache.params);
          this.acceptKey(mustache, 'hash');
        }
        function visitBlock(block) {
          visitSubExpression.call(this, block);
          this.acceptKey(block, 'program');
          this.acceptKey(block, 'inverse');
        }
        function visitPartial(partial) {
          this.acceptRequired(partial, 'name');
          this.acceptArray(partial.params);
          this.acceptKey(partial, 'hash');
        }
        exports['default'] = Visitor;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        (function(global) {
          'use strict';
          exports.__esModule = true;
          exports['default'] = function(Handlebars) {
            var root = typeof global !== 'undefined' ? global : window,
                $Handlebars = root.Handlebars;
            Handlebars.noConflict = function() {
              if (root.Handlebars === Handlebars) {
                root.Handlebars = $Handlebars;
              }
            };
          };
          module.exports = exports['default'];
        }.call(exports, (function() {
          return this;
        }())));
      }, function(module, exports, __webpack_require__) {
        "use strict";
        exports["default"] = function(obj) {
          return obj && obj.__esModule ? obj : {"default": obj};
        };
        exports.__esModule = true;
      }, function(module, exports, __webpack_require__) {
        "use strict";
        exports["default"] = function(obj) {
          if (obj && obj.__esModule) {
            return obj;
          } else {
            var newObj = {};
            if (obj != null) {
              for (var key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key))
                  newObj[key] = obj[key];
              }
            }
            newObj["default"] = obj;
            return newObj;
          }
        };
        exports.__esModule = true;
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        exports.HandlebarsEnvironment = HandlebarsEnvironment;
        var _utils = __webpack_require__(13);
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        var _helpers = __webpack_require__(19);
        var _decorators = __webpack_require__(20);
        var _logger = __webpack_require__(21);
        var _logger2 = _interopRequireDefault(_logger);
        var VERSION = '4.0.3';
        exports.VERSION = VERSION;
        var COMPILER_REVISION = 7;
        exports.COMPILER_REVISION = COMPILER_REVISION;
        var REVISION_CHANGES = {
          1: '<= 1.0.rc.2',
          2: '== 1.0.0-rc.3',
          3: '== 1.0.0-rc.4',
          4: '== 1.x.x',
          5: '== 2.0.0-alpha.x',
          6: '>= 2.0.0-beta.1',
          7: '>= 4.0.0'
        };
        exports.REVISION_CHANGES = REVISION_CHANGES;
        var objectType = '[object Object]';
        function HandlebarsEnvironment(helpers, partials, decorators) {
          this.helpers = helpers || {};
          this.partials = partials || {};
          this.decorators = decorators || {};
          _helpers.registerDefaultHelpers(this);
          _decorators.registerDefaultDecorators(this);
        }
        HandlebarsEnvironment.prototype = {
          constructor: HandlebarsEnvironment,
          logger: _logger2['default'],
          log: _logger2['default'].log,
          registerHelper: function registerHelper(name, fn) {
            if (_utils.toString.call(name) === objectType) {
              if (fn) {
                throw new _exception2['default']('Arg not supported with multiple helpers');
              }
              _utils.extend(this.helpers, name);
            } else {
              this.helpers[name] = fn;
            }
          },
          unregisterHelper: function unregisterHelper(name) {
            delete this.helpers[name];
          },
          registerPartial: function registerPartial(name, partial) {
            if (_utils.toString.call(name) === objectType) {
              _utils.extend(this.partials, name);
            } else {
              if (typeof partial === 'undefined') {
                throw new _exception2['default']('Attempting to register a partial as undefined');
              }
              this.partials[name] = partial;
            }
          },
          unregisterPartial: function unregisterPartial(name) {
            delete this.partials[name];
          },
          registerDecorator: function registerDecorator(name, fn) {
            if (_utils.toString.call(name) === objectType) {
              if (fn) {
                throw new _exception2['default']('Arg not supported with multiple decorators');
              }
              _utils.extend(this.decorators, name);
            } else {
              this.decorators[name] = fn;
            }
          },
          unregisterDecorator: function unregisterDecorator(name) {
            delete this.decorators[name];
          }
        };
        var log = _logger2['default'].log;
        exports.log = log;
        exports.createFrame = _utils.createFrame;
        exports.logger = _logger2['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        function SafeString(string) {
          this.string = string;
        }
        SafeString.prototype.toString = SafeString.prototype.toHTML = function() {
          return '' + this.string;
        };
        exports['default'] = SafeString;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];
        function Exception(message, node) {
          var loc = node && node.loc,
              line = undefined,
              column = undefined;
          if (loc) {
            line = loc.start.line;
            column = loc.start.column;
            message += ' - ' + line + ':' + column;
          }
          var tmp = Error.prototype.constructor.call(this, message);
          for (var idx = 0; idx < errorProps.length; idx++) {
            this[errorProps[idx]] = tmp[errorProps[idx]];
          }
          if (Error.captureStackTrace) {
            Error.captureStackTrace(this, Exception);
          }
          if (loc) {
            this.lineNumber = line;
            this.column = column;
          }
        }
        Exception.prototype = new Error();
        exports['default'] = Exception;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        exports.extend = extend;
        exports.indexOf = indexOf;
        exports.escapeExpression = escapeExpression;
        exports.isEmpty = isEmpty;
        exports.createFrame = createFrame;
        exports.blockParams = blockParams;
        exports.appendContextPath = appendContextPath;
        var escape = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '`': '&#x60;',
          '=': '&#x3D;'
        };
        var badChars = /[&<>"'`=]/g,
            possible = /[&<>"'`=]/;
        function escapeChar(chr) {
          return escape[chr];
        }
        function extend(obj) {
          for (var i = 1; i < arguments.length; i++) {
            for (var key in arguments[i]) {
              if (Object.prototype.hasOwnProperty.call(arguments[i], key)) {
                obj[key] = arguments[i][key];
              }
            }
          }
          return obj;
        }
        var toString = Object.prototype.toString;
        exports.toString = toString;
        var isFunction = function isFunction(value) {
          return typeof value === 'function';
        };
        if (isFunction(/x/)) {
          exports.isFunction = isFunction = function(value) {
            return typeof value === 'function' && toString.call(value) === '[object Function]';
          };
        }
        exports.isFunction = isFunction;
        var isArray = Array.isArray || function(value) {
          return value && typeof value === 'object' ? toString.call(value) === '[object Array]' : false;
        };
        exports.isArray = isArray;
        function indexOf(array, value) {
          for (var i = 0,
              len = array.length; i < len; i++) {
            if (array[i] === value) {
              return i;
            }
          }
          return -1;
        }
        function escapeExpression(string) {
          if (typeof string !== 'string') {
            if (string && string.toHTML) {
              return string.toHTML();
            } else if (string == null) {
              return '';
            } else if (!string) {
              return string + '';
            }
            string = '' + string;
          }
          if (!possible.test(string)) {
            return string;
          }
          return string.replace(badChars, escapeChar);
        }
        function isEmpty(value) {
          if (!value && value !== 0) {
            return true;
          } else if (isArray(value) && value.length === 0) {
            return true;
          } else {
            return false;
          }
        }
        function createFrame(object) {
          var frame = extend({}, object);
          frame._parent = object;
          return frame;
        }
        function blockParams(params, ids) {
          params.path = ids;
          return params;
        }
        function appendContextPath(contextPath, id) {
          return (contextPath ? contextPath + '.' : '') + id;
        }
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireWildcard = __webpack_require__(9)['default'];
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        exports.checkRevision = checkRevision;
        exports.template = template;
        exports.wrapProgram = wrapProgram;
        exports.resolvePartial = resolvePartial;
        exports.invokePartial = invokePartial;
        exports.noop = noop;
        var _utils = __webpack_require__(13);
        var Utils = _interopRequireWildcard(_utils);
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        var _base = __webpack_require__(10);
        function checkRevision(compilerInfo) {
          var compilerRevision = compilerInfo && compilerInfo[0] || 1,
              currentRevision = _base.COMPILER_REVISION;
          if (compilerRevision !== currentRevision) {
            if (compilerRevision < currentRevision) {
              var runtimeVersions = _base.REVISION_CHANGES[currentRevision],
                  compilerVersions = _base.REVISION_CHANGES[compilerRevision];
              throw new _exception2['default']('Template was precompiled with an older version of Handlebars than the current runtime. ' + 'Please update your precompiler to a newer version (' + runtimeVersions + ') or downgrade your runtime to an older version (' + compilerVersions + ').');
            } else {
              throw new _exception2['default']('Template was precompiled with a newer version of Handlebars than the current runtime. ' + 'Please update your runtime to a newer version (' + compilerInfo[1] + ').');
            }
          }
        }
        function template(templateSpec, env) {
          if (!env) {
            throw new _exception2['default']('No environment passed to template');
          }
          if (!templateSpec || !templateSpec.main) {
            throw new _exception2['default']('Unknown template object: ' + typeof templateSpec);
          }
          templateSpec.main.decorator = templateSpec.main_d;
          env.VM.checkRevision(templateSpec.compiler);
          function invokePartialWrapper(partial, context, options) {
            if (options.hash) {
              context = Utils.extend({}, context, options.hash);
              if (options.ids) {
                options.ids[0] = true;
              }
            }
            partial = env.VM.resolvePartial.call(this, partial, context, options);
            var result = env.VM.invokePartial.call(this, partial, context, options);
            if (result == null && env.compile) {
              options.partials[options.name] = env.compile(partial, templateSpec.compilerOptions, env);
              result = options.partials[options.name](context, options);
            }
            if (result != null) {
              if (options.indent) {
                var lines = result.split('\n');
                for (var i = 0,
                    l = lines.length; i < l; i++) {
                  if (!lines[i] && i + 1 === l) {
                    break;
                  }
                  lines[i] = options.indent + lines[i];
                }
                result = lines.join('\n');
              }
              return result;
            } else {
              throw new _exception2['default']('The partial ' + options.name + ' could not be compiled when running in runtime-only mode');
            }
          }
          var container = {
            strict: function strict(obj, name) {
              if (!(name in obj)) {
                throw new _exception2['default']('"' + name + '" not defined in ' + obj);
              }
              return obj[name];
            },
            lookup: function lookup(depths, name) {
              var len = depths.length;
              for (var i = 0; i < len; i++) {
                if (depths[i] && depths[i][name] != null) {
                  return depths[i][name];
                }
              }
            },
            lambda: function lambda(current, context) {
              return typeof current === 'function' ? current.call(context) : current;
            },
            escapeExpression: Utils.escapeExpression,
            invokePartial: invokePartialWrapper,
            fn: function fn(i) {
              var ret = templateSpec[i];
              ret.decorator = templateSpec[i + '_d'];
              return ret;
            },
            programs: [],
            program: function program(i, data, declaredBlockParams, blockParams, depths) {
              var programWrapper = this.programs[i],
                  fn = this.fn(i);
              if (data || depths || blockParams || declaredBlockParams) {
                programWrapper = wrapProgram(this, i, fn, data, declaredBlockParams, blockParams, depths);
              } else if (!programWrapper) {
                programWrapper = this.programs[i] = wrapProgram(this, i, fn);
              }
              return programWrapper;
            },
            data: function data(value, depth) {
              while (value && depth--) {
                value = value._parent;
              }
              return value;
            },
            merge: function merge(param, common) {
              var obj = param || common;
              if (param && common && param !== common) {
                obj = Utils.extend({}, common, param);
              }
              return obj;
            },
            noop: env.VM.noop,
            compilerInfo: templateSpec.compiler
          };
          function ret(context) {
            var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
            var data = options.data;
            ret._setup(options);
            if (!options.partial && templateSpec.useData) {
              data = initData(context, data);
            }
            var depths = undefined,
                blockParams = templateSpec.useBlockParams ? [] : undefined;
            if (templateSpec.useDepths) {
              if (options.depths) {
                depths = context !== options.depths[0] ? [context].concat(options.depths) : options.depths;
              } else {
                depths = [context];
              }
            }
            function main(context) {
              return '' + templateSpec.main(container, context, container.helpers, container.partials, data, blockParams, depths);
            }
            main = executeDecorators(templateSpec.main, main, container, options.depths || [], data, blockParams);
            return main(context, options);
          }
          ret.isTop = true;
          ret._setup = function(options) {
            if (!options.partial) {
              container.helpers = container.merge(options.helpers, env.helpers);
              if (templateSpec.usePartial) {
                container.partials = container.merge(options.partials, env.partials);
              }
              if (templateSpec.usePartial || templateSpec.useDecorators) {
                container.decorators = container.merge(options.decorators, env.decorators);
              }
            } else {
              container.helpers = options.helpers;
              container.partials = options.partials;
              container.decorators = options.decorators;
            }
          };
          ret._child = function(i, data, blockParams, depths) {
            if (templateSpec.useBlockParams && !blockParams) {
              throw new _exception2['default']('must pass block params');
            }
            if (templateSpec.useDepths && !depths) {
              throw new _exception2['default']('must pass parent depths');
            }
            return wrapProgram(container, i, templateSpec[i], data, 0, blockParams, depths);
          };
          return ret;
        }
        function wrapProgram(container, i, fn, data, declaredBlockParams, blockParams, depths) {
          function prog(context) {
            var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
            var currentDepths = depths;
            if (depths && context !== depths[0]) {
              currentDepths = [context].concat(depths);
            }
            return fn(container, context, container.helpers, container.partials, options.data || data, blockParams && [options.blockParams].concat(blockParams), currentDepths);
          }
          prog = executeDecorators(fn, prog, container, depths, data, blockParams);
          prog.program = i;
          prog.depth = depths ? depths.length : 0;
          prog.blockParams = declaredBlockParams || 0;
          return prog;
        }
        function resolvePartial(partial, context, options) {
          if (!partial) {
            if (options.name === '@partial-block') {
              partial = options.data['partial-block'];
            } else {
              partial = options.partials[options.name];
            }
          } else if (!partial.call && !options.name) {
            options.name = partial;
            partial = options.partials[partial];
          }
          return partial;
        }
        function invokePartial(partial, context, options) {
          options.partial = true;
          if (options.ids) {
            options.data.contextPath = options.ids[0] || options.data.contextPath;
          }
          var partialBlock = undefined;
          if (options.fn && options.fn !== noop) {
            options.data = _base.createFrame(options.data);
            partialBlock = options.data['partial-block'] = options.fn;
            if (partialBlock.partials) {
              options.partials = Utils.extend({}, options.partials, partialBlock.partials);
            }
          }
          if (partial === undefined && partialBlock) {
            partial = partialBlock;
          }
          if (partial === undefined) {
            throw new _exception2['default']('The partial ' + options.name + ' could not be found');
          } else if (partial instanceof Function) {
            return partial(context, options);
          }
        }
        function noop() {
          return '';
        }
        function initData(context, data) {
          if (!data || !('root' in data)) {
            data = data ? _base.createFrame(data) : {};
            data.root = context;
          }
          return data;
        }
        function executeDecorators(fn, prog, container, depths, data, blockParams) {
          if (fn.decorator) {
            var props = {};
            prog = fn.decorator(prog, props, container, depths && depths[0], data, blockParams, depths);
            Utils.extend(prog, props);
          }
          return prog;
        }
      }, function(module, exports, __webpack_require__) {
        "use strict";
        var handlebars = (function() {
          var parser = {
            trace: function trace() {},
            yy: {},
            symbols_: {
              "error": 2,
              "root": 3,
              "program": 4,
              "EOF": 5,
              "program_repetition0": 6,
              "statement": 7,
              "mustache": 8,
              "block": 9,
              "rawBlock": 10,
              "partial": 11,
              "partialBlock": 12,
              "content": 13,
              "COMMENT": 14,
              "CONTENT": 15,
              "openRawBlock": 16,
              "rawBlock_repetition_plus0": 17,
              "END_RAW_BLOCK": 18,
              "OPEN_RAW_BLOCK": 19,
              "helperName": 20,
              "openRawBlock_repetition0": 21,
              "openRawBlock_option0": 22,
              "CLOSE_RAW_BLOCK": 23,
              "openBlock": 24,
              "block_option0": 25,
              "closeBlock": 26,
              "openInverse": 27,
              "block_option1": 28,
              "OPEN_BLOCK": 29,
              "openBlock_repetition0": 30,
              "openBlock_option0": 31,
              "openBlock_option1": 32,
              "CLOSE": 33,
              "OPEN_INVERSE": 34,
              "openInverse_repetition0": 35,
              "openInverse_option0": 36,
              "openInverse_option1": 37,
              "openInverseChain": 38,
              "OPEN_INVERSE_CHAIN": 39,
              "openInverseChain_repetition0": 40,
              "openInverseChain_option0": 41,
              "openInverseChain_option1": 42,
              "inverseAndProgram": 43,
              "INVERSE": 44,
              "inverseChain": 45,
              "inverseChain_option0": 46,
              "OPEN_ENDBLOCK": 47,
              "OPEN": 48,
              "mustache_repetition0": 49,
              "mustache_option0": 50,
              "OPEN_UNESCAPED": 51,
              "mustache_repetition1": 52,
              "mustache_option1": 53,
              "CLOSE_UNESCAPED": 54,
              "OPEN_PARTIAL": 55,
              "partialName": 56,
              "partial_repetition0": 57,
              "partial_option0": 58,
              "openPartialBlock": 59,
              "OPEN_PARTIAL_BLOCK": 60,
              "openPartialBlock_repetition0": 61,
              "openPartialBlock_option0": 62,
              "param": 63,
              "sexpr": 64,
              "OPEN_SEXPR": 65,
              "sexpr_repetition0": 66,
              "sexpr_option0": 67,
              "CLOSE_SEXPR": 68,
              "hash": 69,
              "hash_repetition_plus0": 70,
              "hashSegment": 71,
              "ID": 72,
              "EQUALS": 73,
              "blockParams": 74,
              "OPEN_BLOCK_PARAMS": 75,
              "blockParams_repetition_plus0": 76,
              "CLOSE_BLOCK_PARAMS": 77,
              "path": 78,
              "dataName": 79,
              "STRING": 80,
              "NUMBER": 81,
              "BOOLEAN": 82,
              "UNDEFINED": 83,
              "NULL": 84,
              "DATA": 85,
              "pathSegments": 86,
              "SEP": 87,
              "$accept": 0,
              "$end": 1
            },
            terminals_: {
              2: "error",
              5: "EOF",
              14: "COMMENT",
              15: "CONTENT",
              18: "END_RAW_BLOCK",
              19: "OPEN_RAW_BLOCK",
              23: "CLOSE_RAW_BLOCK",
              29: "OPEN_BLOCK",
              33: "CLOSE",
              34: "OPEN_INVERSE",
              39: "OPEN_INVERSE_CHAIN",
              44: "INVERSE",
              47: "OPEN_ENDBLOCK",
              48: "OPEN",
              51: "OPEN_UNESCAPED",
              54: "CLOSE_UNESCAPED",
              55: "OPEN_PARTIAL",
              60: "OPEN_PARTIAL_BLOCK",
              65: "OPEN_SEXPR",
              68: "CLOSE_SEXPR",
              72: "ID",
              73: "EQUALS",
              75: "OPEN_BLOCK_PARAMS",
              77: "CLOSE_BLOCK_PARAMS",
              80: "STRING",
              81: "NUMBER",
              82: "BOOLEAN",
              83: "UNDEFINED",
              84: "NULL",
              85: "DATA",
              87: "SEP"
            },
            productions_: [0, [3, 2], [4, 1], [7, 1], [7, 1], [7, 1], [7, 1], [7, 1], [7, 1], [7, 1], [13, 1], [10, 3], [16, 5], [9, 4], [9, 4], [24, 6], [27, 6], [38, 6], [43, 2], [45, 3], [45, 1], [26, 3], [8, 5], [8, 5], [11, 5], [12, 3], [59, 5], [63, 1], [63, 1], [64, 5], [69, 1], [71, 3], [74, 3], [20, 1], [20, 1], [20, 1], [20, 1], [20, 1], [20, 1], [20, 1], [56, 1], [56, 1], [79, 2], [78, 1], [86, 3], [86, 1], [6, 0], [6, 2], [17, 1], [17, 2], [21, 0], [21, 2], [22, 0], [22, 1], [25, 0], [25, 1], [28, 0], [28, 1], [30, 0], [30, 2], [31, 0], [31, 1], [32, 0], [32, 1], [35, 0], [35, 2], [36, 0], [36, 1], [37, 0], [37, 1], [40, 0], [40, 2], [41, 0], [41, 1], [42, 0], [42, 1], [46, 0], [46, 1], [49, 0], [49, 2], [50, 0], [50, 1], [52, 0], [52, 2], [53, 0], [53, 1], [57, 0], [57, 2], [58, 0], [58, 1], [61, 0], [61, 2], [62, 0], [62, 1], [66, 0], [66, 2], [67, 0], [67, 1], [70, 1], [70, 2], [76, 1], [76, 2]],
            performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {
              var $0 = $$.length - 1;
              switch (yystate) {
                case 1:
                  return $$[$0 - 1];
                  break;
                case 2:
                  this.$ = yy.prepareProgram($$[$0]);
                  break;
                case 3:
                  this.$ = $$[$0];
                  break;
                case 4:
                  this.$ = $$[$0];
                  break;
                case 5:
                  this.$ = $$[$0];
                  break;
                case 6:
                  this.$ = $$[$0];
                  break;
                case 7:
                  this.$ = $$[$0];
                  break;
                case 8:
                  this.$ = $$[$0];
                  break;
                case 9:
                  this.$ = {
                    type: 'CommentStatement',
                    value: yy.stripComment($$[$0]),
                    strip: yy.stripFlags($$[$0], $$[$0]),
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 10:
                  this.$ = {
                    type: 'ContentStatement',
                    original: $$[$0],
                    value: $$[$0],
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 11:
                  this.$ = yy.prepareRawBlock($$[$0 - 2], $$[$0 - 1], $$[$0], this._$);
                  break;
                case 12:
                  this.$ = {
                    path: $$[$0 - 3],
                    params: $$[$0 - 2],
                    hash: $$[$0 - 1]
                  };
                  break;
                case 13:
                  this.$ = yy.prepareBlock($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], $$[$0], false, this._$);
                  break;
                case 14:
                  this.$ = yy.prepareBlock($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], $$[$0], true, this._$);
                  break;
                case 15:
                  this.$ = {
                    open: $$[$0 - 5],
                    path: $$[$0 - 4],
                    params: $$[$0 - 3],
                    hash: $$[$0 - 2],
                    blockParams: $$[$0 - 1],
                    strip: yy.stripFlags($$[$0 - 5], $$[$0])
                  };
                  break;
                case 16:
                  this.$ = {
                    path: $$[$0 - 4],
                    params: $$[$0 - 3],
                    hash: $$[$0 - 2],
                    blockParams: $$[$0 - 1],
                    strip: yy.stripFlags($$[$0 - 5], $$[$0])
                  };
                  break;
                case 17:
                  this.$ = {
                    path: $$[$0 - 4],
                    params: $$[$0 - 3],
                    hash: $$[$0 - 2],
                    blockParams: $$[$0 - 1],
                    strip: yy.stripFlags($$[$0 - 5], $$[$0])
                  };
                  break;
                case 18:
                  this.$ = {
                    strip: yy.stripFlags($$[$0 - 1], $$[$0 - 1]),
                    program: $$[$0]
                  };
                  break;
                case 19:
                  var inverse = yy.prepareBlock($$[$0 - 2], $$[$0 - 1], $$[$0], $$[$0], false, this._$),
                      program = yy.prepareProgram([inverse], $$[$0 - 1].loc);
                  program.chained = true;
                  this.$ = {
                    strip: $$[$0 - 2].strip,
                    program: program,
                    chain: true
                  };
                  break;
                case 20:
                  this.$ = $$[$0];
                  break;
                case 21:
                  this.$ = {
                    path: $$[$0 - 1],
                    strip: yy.stripFlags($$[$0 - 2], $$[$0])
                  };
                  break;
                case 22:
                  this.$ = yy.prepareMustache($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], $$[$0 - 4], yy.stripFlags($$[$0 - 4], $$[$0]), this._$);
                  break;
                case 23:
                  this.$ = yy.prepareMustache($$[$0 - 3], $$[$0 - 2], $$[$0 - 1], $$[$0 - 4], yy.stripFlags($$[$0 - 4], $$[$0]), this._$);
                  break;
                case 24:
                  this.$ = {
                    type: 'PartialStatement',
                    name: $$[$0 - 3],
                    params: $$[$0 - 2],
                    hash: $$[$0 - 1],
                    indent: '',
                    strip: yy.stripFlags($$[$0 - 4], $$[$0]),
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 25:
                  this.$ = yy.preparePartialBlock($$[$0 - 2], $$[$0 - 1], $$[$0], this._$);
                  break;
                case 26:
                  this.$ = {
                    path: $$[$0 - 3],
                    params: $$[$0 - 2],
                    hash: $$[$0 - 1],
                    strip: yy.stripFlags($$[$0 - 4], $$[$0])
                  };
                  break;
                case 27:
                  this.$ = $$[$0];
                  break;
                case 28:
                  this.$ = $$[$0];
                  break;
                case 29:
                  this.$ = {
                    type: 'SubExpression',
                    path: $$[$0 - 3],
                    params: $$[$0 - 2],
                    hash: $$[$0 - 1],
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 30:
                  this.$ = {
                    type: 'Hash',
                    pairs: $$[$0],
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 31:
                  this.$ = {
                    type: 'HashPair',
                    key: yy.id($$[$0 - 2]),
                    value: $$[$0],
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 32:
                  this.$ = yy.id($$[$0 - 1]);
                  break;
                case 33:
                  this.$ = $$[$0];
                  break;
                case 34:
                  this.$ = $$[$0];
                  break;
                case 35:
                  this.$ = {
                    type: 'StringLiteral',
                    value: $$[$0],
                    original: $$[$0],
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 36:
                  this.$ = {
                    type: 'NumberLiteral',
                    value: Number($$[$0]),
                    original: Number($$[$0]),
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 37:
                  this.$ = {
                    type: 'BooleanLiteral',
                    value: $$[$0] === 'true',
                    original: $$[$0] === 'true',
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 38:
                  this.$ = {
                    type: 'UndefinedLiteral',
                    original: undefined,
                    value: undefined,
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 39:
                  this.$ = {
                    type: 'NullLiteral',
                    original: null,
                    value: null,
                    loc: yy.locInfo(this._$)
                  };
                  break;
                case 40:
                  this.$ = $$[$0];
                  break;
                case 41:
                  this.$ = $$[$0];
                  break;
                case 42:
                  this.$ = yy.preparePath(true, $$[$0], this._$);
                  break;
                case 43:
                  this.$ = yy.preparePath(false, $$[$0], this._$);
                  break;
                case 44:
                  $$[$0 - 2].push({
                    part: yy.id($$[$0]),
                    original: $$[$0],
                    separator: $$[$0 - 1]
                  });
                  this.$ = $$[$0 - 2];
                  break;
                case 45:
                  this.$ = [{
                    part: yy.id($$[$0]),
                    original: $$[$0]
                  }];
                  break;
                case 46:
                  this.$ = [];
                  break;
                case 47:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 48:
                  this.$ = [$$[$0]];
                  break;
                case 49:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 50:
                  this.$ = [];
                  break;
                case 51:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 58:
                  this.$ = [];
                  break;
                case 59:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 64:
                  this.$ = [];
                  break;
                case 65:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 70:
                  this.$ = [];
                  break;
                case 71:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 78:
                  this.$ = [];
                  break;
                case 79:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 82:
                  this.$ = [];
                  break;
                case 83:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 86:
                  this.$ = [];
                  break;
                case 87:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 90:
                  this.$ = [];
                  break;
                case 91:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 94:
                  this.$ = [];
                  break;
                case 95:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 98:
                  this.$ = [$$[$0]];
                  break;
                case 99:
                  $$[$0 - 1].push($$[$0]);
                  break;
                case 100:
                  this.$ = [$$[$0]];
                  break;
                case 101:
                  $$[$0 - 1].push($$[$0]);
                  break;
              }
            },
            table: [{
              3: 1,
              4: 2,
              5: [2, 46],
              6: 3,
              14: [2, 46],
              15: [2, 46],
              19: [2, 46],
              29: [2, 46],
              34: [2, 46],
              48: [2, 46],
              51: [2, 46],
              55: [2, 46],
              60: [2, 46]
            }, {1: [3]}, {5: [1, 4]}, {
              5: [2, 2],
              7: 5,
              8: 6,
              9: 7,
              10: 8,
              11: 9,
              12: 10,
              13: 11,
              14: [1, 12],
              15: [1, 20],
              16: 17,
              19: [1, 23],
              24: 15,
              27: 16,
              29: [1, 21],
              34: [1, 22],
              39: [2, 2],
              44: [2, 2],
              47: [2, 2],
              48: [1, 13],
              51: [1, 14],
              55: [1, 18],
              59: 19,
              60: [1, 24]
            }, {1: [2, 1]}, {
              5: [2, 47],
              14: [2, 47],
              15: [2, 47],
              19: [2, 47],
              29: [2, 47],
              34: [2, 47],
              39: [2, 47],
              44: [2, 47],
              47: [2, 47],
              48: [2, 47],
              51: [2, 47],
              55: [2, 47],
              60: [2, 47]
            }, {
              5: [2, 3],
              14: [2, 3],
              15: [2, 3],
              19: [2, 3],
              29: [2, 3],
              34: [2, 3],
              39: [2, 3],
              44: [2, 3],
              47: [2, 3],
              48: [2, 3],
              51: [2, 3],
              55: [2, 3],
              60: [2, 3]
            }, {
              5: [2, 4],
              14: [2, 4],
              15: [2, 4],
              19: [2, 4],
              29: [2, 4],
              34: [2, 4],
              39: [2, 4],
              44: [2, 4],
              47: [2, 4],
              48: [2, 4],
              51: [2, 4],
              55: [2, 4],
              60: [2, 4]
            }, {
              5: [2, 5],
              14: [2, 5],
              15: [2, 5],
              19: [2, 5],
              29: [2, 5],
              34: [2, 5],
              39: [2, 5],
              44: [2, 5],
              47: [2, 5],
              48: [2, 5],
              51: [2, 5],
              55: [2, 5],
              60: [2, 5]
            }, {
              5: [2, 6],
              14: [2, 6],
              15: [2, 6],
              19: [2, 6],
              29: [2, 6],
              34: [2, 6],
              39: [2, 6],
              44: [2, 6],
              47: [2, 6],
              48: [2, 6],
              51: [2, 6],
              55: [2, 6],
              60: [2, 6]
            }, {
              5: [2, 7],
              14: [2, 7],
              15: [2, 7],
              19: [2, 7],
              29: [2, 7],
              34: [2, 7],
              39: [2, 7],
              44: [2, 7],
              47: [2, 7],
              48: [2, 7],
              51: [2, 7],
              55: [2, 7],
              60: [2, 7]
            }, {
              5: [2, 8],
              14: [2, 8],
              15: [2, 8],
              19: [2, 8],
              29: [2, 8],
              34: [2, 8],
              39: [2, 8],
              44: [2, 8],
              47: [2, 8],
              48: [2, 8],
              51: [2, 8],
              55: [2, 8],
              60: [2, 8]
            }, {
              5: [2, 9],
              14: [2, 9],
              15: [2, 9],
              19: [2, 9],
              29: [2, 9],
              34: [2, 9],
              39: [2, 9],
              44: [2, 9],
              47: [2, 9],
              48: [2, 9],
              51: [2, 9],
              55: [2, 9],
              60: [2, 9]
            }, {
              20: 25,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 36,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              4: 37,
              6: 3,
              14: [2, 46],
              15: [2, 46],
              19: [2, 46],
              29: [2, 46],
              34: [2, 46],
              39: [2, 46],
              44: [2, 46],
              47: [2, 46],
              48: [2, 46],
              51: [2, 46],
              55: [2, 46],
              60: [2, 46]
            }, {
              4: 38,
              6: 3,
              14: [2, 46],
              15: [2, 46],
              19: [2, 46],
              29: [2, 46],
              34: [2, 46],
              44: [2, 46],
              47: [2, 46],
              48: [2, 46],
              51: [2, 46],
              55: [2, 46],
              60: [2, 46]
            }, {
              13: 40,
              15: [1, 20],
              17: 39
            }, {
              20: 42,
              56: 41,
              64: 43,
              65: [1, 44],
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              4: 45,
              6: 3,
              14: [2, 46],
              15: [2, 46],
              19: [2, 46],
              29: [2, 46],
              34: [2, 46],
              47: [2, 46],
              48: [2, 46],
              51: [2, 46],
              55: [2, 46],
              60: [2, 46]
            }, {
              5: [2, 10],
              14: [2, 10],
              15: [2, 10],
              18: [2, 10],
              19: [2, 10],
              29: [2, 10],
              34: [2, 10],
              39: [2, 10],
              44: [2, 10],
              47: [2, 10],
              48: [2, 10],
              51: [2, 10],
              55: [2, 10],
              60: [2, 10]
            }, {
              20: 46,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 47,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 48,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 42,
              56: 49,
              64: 43,
              65: [1, 44],
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              33: [2, 78],
              49: 50,
              65: [2, 78],
              72: [2, 78],
              80: [2, 78],
              81: [2, 78],
              82: [2, 78],
              83: [2, 78],
              84: [2, 78],
              85: [2, 78]
            }, {
              23: [2, 33],
              33: [2, 33],
              54: [2, 33],
              65: [2, 33],
              68: [2, 33],
              72: [2, 33],
              75: [2, 33],
              80: [2, 33],
              81: [2, 33],
              82: [2, 33],
              83: [2, 33],
              84: [2, 33],
              85: [2, 33]
            }, {
              23: [2, 34],
              33: [2, 34],
              54: [2, 34],
              65: [2, 34],
              68: [2, 34],
              72: [2, 34],
              75: [2, 34],
              80: [2, 34],
              81: [2, 34],
              82: [2, 34],
              83: [2, 34],
              84: [2, 34],
              85: [2, 34]
            }, {
              23: [2, 35],
              33: [2, 35],
              54: [2, 35],
              65: [2, 35],
              68: [2, 35],
              72: [2, 35],
              75: [2, 35],
              80: [2, 35],
              81: [2, 35],
              82: [2, 35],
              83: [2, 35],
              84: [2, 35],
              85: [2, 35]
            }, {
              23: [2, 36],
              33: [2, 36],
              54: [2, 36],
              65: [2, 36],
              68: [2, 36],
              72: [2, 36],
              75: [2, 36],
              80: [2, 36],
              81: [2, 36],
              82: [2, 36],
              83: [2, 36],
              84: [2, 36],
              85: [2, 36]
            }, {
              23: [2, 37],
              33: [2, 37],
              54: [2, 37],
              65: [2, 37],
              68: [2, 37],
              72: [2, 37],
              75: [2, 37],
              80: [2, 37],
              81: [2, 37],
              82: [2, 37],
              83: [2, 37],
              84: [2, 37],
              85: [2, 37]
            }, {
              23: [2, 38],
              33: [2, 38],
              54: [2, 38],
              65: [2, 38],
              68: [2, 38],
              72: [2, 38],
              75: [2, 38],
              80: [2, 38],
              81: [2, 38],
              82: [2, 38],
              83: [2, 38],
              84: [2, 38],
              85: [2, 38]
            }, {
              23: [2, 39],
              33: [2, 39],
              54: [2, 39],
              65: [2, 39],
              68: [2, 39],
              72: [2, 39],
              75: [2, 39],
              80: [2, 39],
              81: [2, 39],
              82: [2, 39],
              83: [2, 39],
              84: [2, 39],
              85: [2, 39]
            }, {
              23: [2, 43],
              33: [2, 43],
              54: [2, 43],
              65: [2, 43],
              68: [2, 43],
              72: [2, 43],
              75: [2, 43],
              80: [2, 43],
              81: [2, 43],
              82: [2, 43],
              83: [2, 43],
              84: [2, 43],
              85: [2, 43],
              87: [1, 51]
            }, {
              72: [1, 35],
              86: 52
            }, {
              23: [2, 45],
              33: [2, 45],
              54: [2, 45],
              65: [2, 45],
              68: [2, 45],
              72: [2, 45],
              75: [2, 45],
              80: [2, 45],
              81: [2, 45],
              82: [2, 45],
              83: [2, 45],
              84: [2, 45],
              85: [2, 45],
              87: [2, 45]
            }, {
              52: 53,
              54: [2, 82],
              65: [2, 82],
              72: [2, 82],
              80: [2, 82],
              81: [2, 82],
              82: [2, 82],
              83: [2, 82],
              84: [2, 82],
              85: [2, 82]
            }, {
              25: 54,
              38: 56,
              39: [1, 58],
              43: 57,
              44: [1, 59],
              45: 55,
              47: [2, 54]
            }, {
              28: 60,
              43: 61,
              44: [1, 59],
              47: [2, 56]
            }, {
              13: 63,
              15: [1, 20],
              18: [1, 62]
            }, {
              15: [2, 48],
              18: [2, 48]
            }, {
              33: [2, 86],
              57: 64,
              65: [2, 86],
              72: [2, 86],
              80: [2, 86],
              81: [2, 86],
              82: [2, 86],
              83: [2, 86],
              84: [2, 86],
              85: [2, 86]
            }, {
              33: [2, 40],
              65: [2, 40],
              72: [2, 40],
              80: [2, 40],
              81: [2, 40],
              82: [2, 40],
              83: [2, 40],
              84: [2, 40],
              85: [2, 40]
            }, {
              33: [2, 41],
              65: [2, 41],
              72: [2, 41],
              80: [2, 41],
              81: [2, 41],
              82: [2, 41],
              83: [2, 41],
              84: [2, 41],
              85: [2, 41]
            }, {
              20: 65,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              26: 66,
              47: [1, 67]
            }, {
              30: 68,
              33: [2, 58],
              65: [2, 58],
              72: [2, 58],
              75: [2, 58],
              80: [2, 58],
              81: [2, 58],
              82: [2, 58],
              83: [2, 58],
              84: [2, 58],
              85: [2, 58]
            }, {
              33: [2, 64],
              35: 69,
              65: [2, 64],
              72: [2, 64],
              75: [2, 64],
              80: [2, 64],
              81: [2, 64],
              82: [2, 64],
              83: [2, 64],
              84: [2, 64],
              85: [2, 64]
            }, {
              21: 70,
              23: [2, 50],
              65: [2, 50],
              72: [2, 50],
              80: [2, 50],
              81: [2, 50],
              82: [2, 50],
              83: [2, 50],
              84: [2, 50],
              85: [2, 50]
            }, {
              33: [2, 90],
              61: 71,
              65: [2, 90],
              72: [2, 90],
              80: [2, 90],
              81: [2, 90],
              82: [2, 90],
              83: [2, 90],
              84: [2, 90],
              85: [2, 90]
            }, {
              20: 75,
              33: [2, 80],
              50: 72,
              63: 73,
              64: 76,
              65: [1, 44],
              69: 74,
              70: 77,
              71: 78,
              72: [1, 79],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {72: [1, 80]}, {
              23: [2, 42],
              33: [2, 42],
              54: [2, 42],
              65: [2, 42],
              68: [2, 42],
              72: [2, 42],
              75: [2, 42],
              80: [2, 42],
              81: [2, 42],
              82: [2, 42],
              83: [2, 42],
              84: [2, 42],
              85: [2, 42],
              87: [1, 51]
            }, {
              20: 75,
              53: 81,
              54: [2, 84],
              63: 82,
              64: 76,
              65: [1, 44],
              69: 83,
              70: 77,
              71: 78,
              72: [1, 79],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              26: 84,
              47: [1, 67]
            }, {47: [2, 55]}, {
              4: 85,
              6: 3,
              14: [2, 46],
              15: [2, 46],
              19: [2, 46],
              29: [2, 46],
              34: [2, 46],
              39: [2, 46],
              44: [2, 46],
              47: [2, 46],
              48: [2, 46],
              51: [2, 46],
              55: [2, 46],
              60: [2, 46]
            }, {47: [2, 20]}, {
              20: 86,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              4: 87,
              6: 3,
              14: [2, 46],
              15: [2, 46],
              19: [2, 46],
              29: [2, 46],
              34: [2, 46],
              47: [2, 46],
              48: [2, 46],
              51: [2, 46],
              55: [2, 46],
              60: [2, 46]
            }, {
              26: 88,
              47: [1, 67]
            }, {47: [2, 57]}, {
              5: [2, 11],
              14: [2, 11],
              15: [2, 11],
              19: [2, 11],
              29: [2, 11],
              34: [2, 11],
              39: [2, 11],
              44: [2, 11],
              47: [2, 11],
              48: [2, 11],
              51: [2, 11],
              55: [2, 11],
              60: [2, 11]
            }, {
              15: [2, 49],
              18: [2, 49]
            }, {
              20: 75,
              33: [2, 88],
              58: 89,
              63: 90,
              64: 76,
              65: [1, 44],
              69: 91,
              70: 77,
              71: 78,
              72: [1, 79],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              65: [2, 94],
              66: 92,
              68: [2, 94],
              72: [2, 94],
              80: [2, 94],
              81: [2, 94],
              82: [2, 94],
              83: [2, 94],
              84: [2, 94],
              85: [2, 94]
            }, {
              5: [2, 25],
              14: [2, 25],
              15: [2, 25],
              19: [2, 25],
              29: [2, 25],
              34: [2, 25],
              39: [2, 25],
              44: [2, 25],
              47: [2, 25],
              48: [2, 25],
              51: [2, 25],
              55: [2, 25],
              60: [2, 25]
            }, {
              20: 93,
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 75,
              31: 94,
              33: [2, 60],
              63: 95,
              64: 76,
              65: [1, 44],
              69: 96,
              70: 77,
              71: 78,
              72: [1, 79],
              75: [2, 60],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 75,
              33: [2, 66],
              36: 97,
              63: 98,
              64: 76,
              65: [1, 44],
              69: 99,
              70: 77,
              71: 78,
              72: [1, 79],
              75: [2, 66],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 75,
              22: 100,
              23: [2, 52],
              63: 101,
              64: 76,
              65: [1, 44],
              69: 102,
              70: 77,
              71: 78,
              72: [1, 79],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              20: 75,
              33: [2, 92],
              62: 103,
              63: 104,
              64: 76,
              65: [1, 44],
              69: 105,
              70: 77,
              71: 78,
              72: [1, 79],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {33: [1, 106]}, {
              33: [2, 79],
              65: [2, 79],
              72: [2, 79],
              80: [2, 79],
              81: [2, 79],
              82: [2, 79],
              83: [2, 79],
              84: [2, 79],
              85: [2, 79]
            }, {33: [2, 81]}, {
              23: [2, 27],
              33: [2, 27],
              54: [2, 27],
              65: [2, 27],
              68: [2, 27],
              72: [2, 27],
              75: [2, 27],
              80: [2, 27],
              81: [2, 27],
              82: [2, 27],
              83: [2, 27],
              84: [2, 27],
              85: [2, 27]
            }, {
              23: [2, 28],
              33: [2, 28],
              54: [2, 28],
              65: [2, 28],
              68: [2, 28],
              72: [2, 28],
              75: [2, 28],
              80: [2, 28],
              81: [2, 28],
              82: [2, 28],
              83: [2, 28],
              84: [2, 28],
              85: [2, 28]
            }, {
              23: [2, 30],
              33: [2, 30],
              54: [2, 30],
              68: [2, 30],
              71: 107,
              72: [1, 108],
              75: [2, 30]
            }, {
              23: [2, 98],
              33: [2, 98],
              54: [2, 98],
              68: [2, 98],
              72: [2, 98],
              75: [2, 98]
            }, {
              23: [2, 45],
              33: [2, 45],
              54: [2, 45],
              65: [2, 45],
              68: [2, 45],
              72: [2, 45],
              73: [1, 109],
              75: [2, 45],
              80: [2, 45],
              81: [2, 45],
              82: [2, 45],
              83: [2, 45],
              84: [2, 45],
              85: [2, 45],
              87: [2, 45]
            }, {
              23: [2, 44],
              33: [2, 44],
              54: [2, 44],
              65: [2, 44],
              68: [2, 44],
              72: [2, 44],
              75: [2, 44],
              80: [2, 44],
              81: [2, 44],
              82: [2, 44],
              83: [2, 44],
              84: [2, 44],
              85: [2, 44],
              87: [2, 44]
            }, {54: [1, 110]}, {
              54: [2, 83],
              65: [2, 83],
              72: [2, 83],
              80: [2, 83],
              81: [2, 83],
              82: [2, 83],
              83: [2, 83],
              84: [2, 83],
              85: [2, 83]
            }, {54: [2, 85]}, {
              5: [2, 13],
              14: [2, 13],
              15: [2, 13],
              19: [2, 13],
              29: [2, 13],
              34: [2, 13],
              39: [2, 13],
              44: [2, 13],
              47: [2, 13],
              48: [2, 13],
              51: [2, 13],
              55: [2, 13],
              60: [2, 13]
            }, {
              38: 56,
              39: [1, 58],
              43: 57,
              44: [1, 59],
              45: 112,
              46: 111,
              47: [2, 76]
            }, {
              33: [2, 70],
              40: 113,
              65: [2, 70],
              72: [2, 70],
              75: [2, 70],
              80: [2, 70],
              81: [2, 70],
              82: [2, 70],
              83: [2, 70],
              84: [2, 70],
              85: [2, 70]
            }, {47: [2, 18]}, {
              5: [2, 14],
              14: [2, 14],
              15: [2, 14],
              19: [2, 14],
              29: [2, 14],
              34: [2, 14],
              39: [2, 14],
              44: [2, 14],
              47: [2, 14],
              48: [2, 14],
              51: [2, 14],
              55: [2, 14],
              60: [2, 14]
            }, {33: [1, 114]}, {
              33: [2, 87],
              65: [2, 87],
              72: [2, 87],
              80: [2, 87],
              81: [2, 87],
              82: [2, 87],
              83: [2, 87],
              84: [2, 87],
              85: [2, 87]
            }, {33: [2, 89]}, {
              20: 75,
              63: 116,
              64: 76,
              65: [1, 44],
              67: 115,
              68: [2, 96],
              69: 117,
              70: 77,
              71: 78,
              72: [1, 79],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {33: [1, 118]}, {
              32: 119,
              33: [2, 62],
              74: 120,
              75: [1, 121]
            }, {
              33: [2, 59],
              65: [2, 59],
              72: [2, 59],
              75: [2, 59],
              80: [2, 59],
              81: [2, 59],
              82: [2, 59],
              83: [2, 59],
              84: [2, 59],
              85: [2, 59]
            }, {
              33: [2, 61],
              75: [2, 61]
            }, {
              33: [2, 68],
              37: 122,
              74: 123,
              75: [1, 121]
            }, {
              33: [2, 65],
              65: [2, 65],
              72: [2, 65],
              75: [2, 65],
              80: [2, 65],
              81: [2, 65],
              82: [2, 65],
              83: [2, 65],
              84: [2, 65],
              85: [2, 65]
            }, {
              33: [2, 67],
              75: [2, 67]
            }, {23: [1, 124]}, {
              23: [2, 51],
              65: [2, 51],
              72: [2, 51],
              80: [2, 51],
              81: [2, 51],
              82: [2, 51],
              83: [2, 51],
              84: [2, 51],
              85: [2, 51]
            }, {23: [2, 53]}, {33: [1, 125]}, {
              33: [2, 91],
              65: [2, 91],
              72: [2, 91],
              80: [2, 91],
              81: [2, 91],
              82: [2, 91],
              83: [2, 91],
              84: [2, 91],
              85: [2, 91]
            }, {33: [2, 93]}, {
              5: [2, 22],
              14: [2, 22],
              15: [2, 22],
              19: [2, 22],
              29: [2, 22],
              34: [2, 22],
              39: [2, 22],
              44: [2, 22],
              47: [2, 22],
              48: [2, 22],
              51: [2, 22],
              55: [2, 22],
              60: [2, 22]
            }, {
              23: [2, 99],
              33: [2, 99],
              54: [2, 99],
              68: [2, 99],
              72: [2, 99],
              75: [2, 99]
            }, {73: [1, 109]}, {
              20: 75,
              63: 126,
              64: 76,
              65: [1, 44],
              72: [1, 35],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              5: [2, 23],
              14: [2, 23],
              15: [2, 23],
              19: [2, 23],
              29: [2, 23],
              34: [2, 23],
              39: [2, 23],
              44: [2, 23],
              47: [2, 23],
              48: [2, 23],
              51: [2, 23],
              55: [2, 23],
              60: [2, 23]
            }, {47: [2, 19]}, {47: [2, 77]}, {
              20: 75,
              33: [2, 72],
              41: 127,
              63: 128,
              64: 76,
              65: [1, 44],
              69: 129,
              70: 77,
              71: 78,
              72: [1, 79],
              75: [2, 72],
              78: 26,
              79: 27,
              80: [1, 28],
              81: [1, 29],
              82: [1, 30],
              83: [1, 31],
              84: [1, 32],
              85: [1, 34],
              86: 33
            }, {
              5: [2, 24],
              14: [2, 24],
              15: [2, 24],
              19: [2, 24],
              29: [2, 24],
              34: [2, 24],
              39: [2, 24],
              44: [2, 24],
              47: [2, 24],
              48: [2, 24],
              51: [2, 24],
              55: [2, 24],
              60: [2, 24]
            }, {68: [1, 130]}, {
              65: [2, 95],
              68: [2, 95],
              72: [2, 95],
              80: [2, 95],
              81: [2, 95],
              82: [2, 95],
              83: [2, 95],
              84: [2, 95],
              85: [2, 95]
            }, {68: [2, 97]}, {
              5: [2, 21],
              14: [2, 21],
              15: [2, 21],
              19: [2, 21],
              29: [2, 21],
              34: [2, 21],
              39: [2, 21],
              44: [2, 21],
              47: [2, 21],
              48: [2, 21],
              51: [2, 21],
              55: [2, 21],
              60: [2, 21]
            }, {33: [1, 131]}, {33: [2, 63]}, {
              72: [1, 133],
              76: 132
            }, {33: [1, 134]}, {33: [2, 69]}, {15: [2, 12]}, {
              14: [2, 26],
              15: [2, 26],
              19: [2, 26],
              29: [2, 26],
              34: [2, 26],
              47: [2, 26],
              48: [2, 26],
              51: [2, 26],
              55: [2, 26],
              60: [2, 26]
            }, {
              23: [2, 31],
              33: [2, 31],
              54: [2, 31],
              68: [2, 31],
              72: [2, 31],
              75: [2, 31]
            }, {
              33: [2, 74],
              42: 135,
              74: 136,
              75: [1, 121]
            }, {
              33: [2, 71],
              65: [2, 71],
              72: [2, 71],
              75: [2, 71],
              80: [2, 71],
              81: [2, 71],
              82: [2, 71],
              83: [2, 71],
              84: [2, 71],
              85: [2, 71]
            }, {
              33: [2, 73],
              75: [2, 73]
            }, {
              23: [2, 29],
              33: [2, 29],
              54: [2, 29],
              65: [2, 29],
              68: [2, 29],
              72: [2, 29],
              75: [2, 29],
              80: [2, 29],
              81: [2, 29],
              82: [2, 29],
              83: [2, 29],
              84: [2, 29],
              85: [2, 29]
            }, {
              14: [2, 15],
              15: [2, 15],
              19: [2, 15],
              29: [2, 15],
              34: [2, 15],
              39: [2, 15],
              44: [2, 15],
              47: [2, 15],
              48: [2, 15],
              51: [2, 15],
              55: [2, 15],
              60: [2, 15]
            }, {
              72: [1, 138],
              77: [1, 137]
            }, {
              72: [2, 100],
              77: [2, 100]
            }, {
              14: [2, 16],
              15: [2, 16],
              19: [2, 16],
              29: [2, 16],
              34: [2, 16],
              44: [2, 16],
              47: [2, 16],
              48: [2, 16],
              51: [2, 16],
              55: [2, 16],
              60: [2, 16]
            }, {33: [1, 139]}, {33: [2, 75]}, {33: [2, 32]}, {
              72: [2, 101],
              77: [2, 101]
            }, {
              14: [2, 17],
              15: [2, 17],
              19: [2, 17],
              29: [2, 17],
              34: [2, 17],
              39: [2, 17],
              44: [2, 17],
              47: [2, 17],
              48: [2, 17],
              51: [2, 17],
              55: [2, 17],
              60: [2, 17]
            }],
            defaultActions: {
              4: [2, 1],
              55: [2, 55],
              57: [2, 20],
              61: [2, 57],
              74: [2, 81],
              83: [2, 85],
              87: [2, 18],
              91: [2, 89],
              102: [2, 53],
              105: [2, 93],
              111: [2, 19],
              112: [2, 77],
              117: [2, 97],
              120: [2, 63],
              123: [2, 69],
              124: [2, 12],
              136: [2, 75],
              137: [2, 32]
            },
            parseError: function parseError(str, hash) {
              throw new Error(str);
            },
            parse: function parse(input) {
              var self = this,
                  stack = [0],
                  vstack = [null],
                  lstack = [],
                  table = this.table,
                  yytext = "",
                  yylineno = 0,
                  yyleng = 0,
                  recovering = 0,
                  TERROR = 2,
                  EOF = 1;
              this.lexer.setInput(input);
              this.lexer.yy = this.yy;
              this.yy.lexer = this.lexer;
              this.yy.parser = this;
              if (typeof this.lexer.yylloc == "undefined")
                this.lexer.yylloc = {};
              var yyloc = this.lexer.yylloc;
              lstack.push(yyloc);
              var ranges = this.lexer.options && this.lexer.options.ranges;
              if (typeof this.yy.parseError === "function")
                this.parseError = this.yy.parseError;
              function popStack(n) {
                stack.length = stack.length - 2 * n;
                vstack.length = vstack.length - n;
                lstack.length = lstack.length - n;
              }
              function lex() {
                var token;
                token = self.lexer.lex() || 1;
                if (typeof token !== "number") {
                  token = self.symbols_[token] || token;
                }
                return token;
              }
              var symbol,
                  preErrorSymbol,
                  state,
                  action,
                  a,
                  r,
                  yyval = {},
                  p,
                  len,
                  newState,
                  expected;
              while (true) {
                state = stack[stack.length - 1];
                if (this.defaultActions[state]) {
                  action = this.defaultActions[state];
                } else {
                  if (symbol === null || typeof symbol == "undefined") {
                    symbol = lex();
                  }
                  action = table[state] && table[state][symbol];
                }
                if (typeof action === "undefined" || !action.length || !action[0]) {
                  var errStr = "";
                  if (!recovering) {
                    expected = [];
                    for (p in table[state])
                      if (this.terminals_[p] && p > 2) {
                        expected.push("'" + this.terminals_[p] + "'");
                      }
                    if (this.lexer.showPosition) {
                      errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
                    } else {
                      errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1 ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
                    }
                    this.parseError(errStr, {
                      text: this.lexer.match,
                      token: this.terminals_[symbol] || symbol,
                      line: this.lexer.yylineno,
                      loc: yyloc,
                      expected: expected
                    });
                  }
                }
                if (action[0] instanceof Array && action.length > 1) {
                  throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
                }
                switch (action[0]) {
                  case 1:
                    stack.push(symbol);
                    vstack.push(this.lexer.yytext);
                    lstack.push(this.lexer.yylloc);
                    stack.push(action[1]);
                    symbol = null;
                    if (!preErrorSymbol) {
                      yyleng = this.lexer.yyleng;
                      yytext = this.lexer.yytext;
                      yylineno = this.lexer.yylineno;
                      yyloc = this.lexer.yylloc;
                      if (recovering > 0)
                        recovering--;
                    } else {
                      symbol = preErrorSymbol;
                      preErrorSymbol = null;
                    }
                    break;
                  case 2:
                    len = this.productions_[action[1]][1];
                    yyval.$ = vstack[vstack.length - len];
                    yyval._$ = {
                      first_line: lstack[lstack.length - (len || 1)].first_line,
                      last_line: lstack[lstack.length - 1].last_line,
                      first_column: lstack[lstack.length - (len || 1)].first_column,
                      last_column: lstack[lstack.length - 1].last_column
                    };
                    if (ranges) {
                      yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
                    }
                    r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
                    if (typeof r !== "undefined") {
                      return r;
                    }
                    if (len) {
                      stack = stack.slice(0, -1 * len * 2);
                      vstack = vstack.slice(0, -1 * len);
                      lstack = lstack.slice(0, -1 * len);
                    }
                    stack.push(this.productions_[action[1]][0]);
                    vstack.push(yyval.$);
                    lstack.push(yyval._$);
                    newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
                    stack.push(newState);
                    break;
                  case 3:
                    return true;
                }
              }
              return true;
            }
          };
          var lexer = (function() {
            var lexer = {
              EOF: 1,
              parseError: function parseError(str, hash) {
                if (this.yy.parser) {
                  this.yy.parser.parseError(str, hash);
                } else {
                  throw new Error(str);
                }
              },
              setInput: function setInput(input) {
                this._input = input;
                this._more = this._less = this.done = false;
                this.yylineno = this.yyleng = 0;
                this.yytext = this.matched = this.match = '';
                this.conditionStack = ['INITIAL'];
                this.yylloc = {
                  first_line: 1,
                  first_column: 0,
                  last_line: 1,
                  last_column: 0
                };
                if (this.options.ranges)
                  this.yylloc.range = [0, 0];
                this.offset = 0;
                return this;
              },
              input: function input() {
                var ch = this._input[0];
                this.yytext += ch;
                this.yyleng++;
                this.offset++;
                this.match += ch;
                this.matched += ch;
                var lines = ch.match(/(?:\r\n?|\n).*/g);
                if (lines) {
                  this.yylineno++;
                  this.yylloc.last_line++;
                } else {
                  this.yylloc.last_column++;
                }
                if (this.options.ranges)
                  this.yylloc.range[1]++;
                this._input = this._input.slice(1);
                return ch;
              },
              unput: function unput(ch) {
                var len = ch.length;
                var lines = ch.split(/(?:\r\n?|\n)/g);
                this._input = ch + this._input;
                this.yytext = this.yytext.substr(0, this.yytext.length - len - 1);
                this.offset -= len;
                var oldLines = this.match.split(/(?:\r\n?|\n)/g);
                this.match = this.match.substr(0, this.match.length - 1);
                this.matched = this.matched.substr(0, this.matched.length - 1);
                if (lines.length - 1)
                  this.yylineno -= lines.length - 1;
                var r = this.yylloc.range;
                this.yylloc = {
                  first_line: this.yylloc.first_line,
                  last_line: this.yylineno + 1,
                  first_column: this.yylloc.first_column,
                  last_column: lines ? (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
                };
                if (this.options.ranges) {
                  this.yylloc.range = [r[0], r[0] + this.yyleng - len];
                }
                return this;
              },
              more: function more() {
                this._more = true;
                return this;
              },
              less: function less(n) {
                this.unput(this.match.slice(n));
              },
              pastInput: function pastInput() {
                var past = this.matched.substr(0, this.matched.length - this.match.length);
                return (past.length > 20 ? '...' : '') + past.substr(-20).replace(/\n/g, "");
              },
              upcomingInput: function upcomingInput() {
                var next = this.match;
                if (next.length < 20) {
                  next += this._input.substr(0, 20 - next.length);
                }
                return (next.substr(0, 20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
              },
              showPosition: function showPosition() {
                var pre = this.pastInput();
                var c = new Array(pre.length + 1).join("-");
                return pre + this.upcomingInput() + "\n" + c + "^";
              },
              next: function next() {
                if (this.done) {
                  return this.EOF;
                }
                if (!this._input)
                  this.done = true;
                var token,
                    match,
                    tempMatch,
                    index,
                    col,
                    lines;
                if (!this._more) {
                  this.yytext = '';
                  this.match = '';
                }
                var rules = this._currentRules();
                for (var i = 0; i < rules.length; i++) {
                  tempMatch = this._input.match(this.rules[rules[i]]);
                  if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                    match = tempMatch;
                    index = i;
                    if (!this.options.flex)
                      break;
                  }
                }
                if (match) {
                  lines = match[0].match(/(?:\r\n?|\n).*/g);
                  if (lines)
                    this.yylineno += lines.length;
                  this.yylloc = {
                    first_line: this.yylloc.last_line,
                    last_line: this.yylineno + 1,
                    first_column: this.yylloc.last_column,
                    last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
                  };
                  this.yytext += match[0];
                  this.match += match[0];
                  this.matches = match;
                  this.yyleng = this.yytext.length;
                  if (this.options.ranges) {
                    this.yylloc.range = [this.offset, this.offset += this.yyleng];
                  }
                  this._more = false;
                  this._input = this._input.slice(match[0].length);
                  this.matched += match[0];
                  token = this.performAction.call(this, this.yy, this, rules[index], this.conditionStack[this.conditionStack.length - 1]);
                  if (this.done && this._input)
                    this.done = false;
                  if (token)
                    return token;
                  else
                    return;
                }
                if (this._input === "") {
                  return this.EOF;
                } else {
                  return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                    text: "",
                    token: null,
                    line: this.yylineno
                  });
                }
              },
              lex: function lex() {
                var r = this.next();
                if (typeof r !== 'undefined') {
                  return r;
                } else {
                  return this.lex();
                }
              },
              begin: function begin(condition) {
                this.conditionStack.push(condition);
              },
              popState: function popState() {
                return this.conditionStack.pop();
              },
              _currentRules: function _currentRules() {
                return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
              },
              topState: function topState() {
                return this.conditionStack[this.conditionStack.length - 2];
              },
              pushState: function begin(condition) {
                this.begin(condition);
              }
            };
            lexer.options = {};
            lexer.performAction = function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {
              function strip(start, end) {
                return yy_.yytext = yy_.yytext.substr(start, yy_.yyleng - end);
              }
              var YYSTATE = YY_START;
              switch ($avoiding_name_collisions) {
                case 0:
                  if (yy_.yytext.slice(-2) === "\\\\") {
                    strip(0, 1);
                    this.begin("mu");
                  } else if (yy_.yytext.slice(-1) === "\\") {
                    strip(0, 1);
                    this.begin("emu");
                  } else {
                    this.begin("mu");
                  }
                  if (yy_.yytext)
                    return 15;
                  break;
                case 1:
                  return 15;
                  break;
                case 2:
                  this.popState();
                  return 15;
                  break;
                case 3:
                  this.begin('raw');
                  return 15;
                  break;
                case 4:
                  this.popState();
                  if (this.conditionStack[this.conditionStack.length - 1] === 'raw') {
                    return 15;
                  } else {
                    yy_.yytext = yy_.yytext.substr(5, yy_.yyleng - 9);
                    return 'END_RAW_BLOCK';
                  }
                  break;
                case 5:
                  return 15;
                  break;
                case 6:
                  this.popState();
                  return 14;
                  break;
                case 7:
                  return 65;
                  break;
                case 8:
                  return 68;
                  break;
                case 9:
                  return 19;
                  break;
                case 10:
                  this.popState();
                  this.begin('raw');
                  return 23;
                  break;
                case 11:
                  return 55;
                  break;
                case 12:
                  return 60;
                  break;
                case 13:
                  return 29;
                  break;
                case 14:
                  return 47;
                  break;
                case 15:
                  this.popState();
                  return 44;
                  break;
                case 16:
                  this.popState();
                  return 44;
                  break;
                case 17:
                  return 34;
                  break;
                case 18:
                  return 39;
                  break;
                case 19:
                  return 51;
                  break;
                case 20:
                  return 48;
                  break;
                case 21:
                  this.unput(yy_.yytext);
                  this.popState();
                  this.begin('com');
                  break;
                case 22:
                  this.popState();
                  return 14;
                  break;
                case 23:
                  return 48;
                  break;
                case 24:
                  return 73;
                  break;
                case 25:
                  return 72;
                  break;
                case 26:
                  return 72;
                  break;
                case 27:
                  return 87;
                  break;
                case 28:
                  break;
                case 29:
                  this.popState();
                  return 54;
                  break;
                case 30:
                  this.popState();
                  return 33;
                  break;
                case 31:
                  yy_.yytext = strip(1, 2).replace(/\\"/g, '"');
                  return 80;
                  break;
                case 32:
                  yy_.yytext = strip(1, 2).replace(/\\'/g, "'");
                  return 80;
                  break;
                case 33:
                  return 85;
                  break;
                case 34:
                  return 82;
                  break;
                case 35:
                  return 82;
                  break;
                case 36:
                  return 83;
                  break;
                case 37:
                  return 84;
                  break;
                case 38:
                  return 81;
                  break;
                case 39:
                  return 75;
                  break;
                case 40:
                  return 77;
                  break;
                case 41:
                  return 72;
                  break;
                case 42:
                  yy_.yytext = yy_.yytext.replace(/\\([\\\]])/g, '$1');
                  return 72;
                  break;
                case 43:
                  return 'INVALID';
                  break;
                case 44:
                  return 5;
                  break;
              }
            };
            lexer.rules = [/^(?:[^\x00]*?(?=(\{\{)))/, /^(?:[^\x00]+)/, /^(?:[^\x00]{2,}?(?=(\{\{|\\\{\{|\\\\\{\{|$)))/, /^(?:\{\{\{\{(?=[^/]))/, /^(?:\{\{\{\{\/[^\s!"#%-,\.\/;->@\[-\^`\{-~]+(?=[=}\s\/.])\}\}\}\})/, /^(?:[^\x00]*?(?=(\{\{\{\{)))/, /^(?:[\s\S]*?--(~)?\}\})/, /^(?:\()/, /^(?:\))/, /^(?:\{\{\{\{)/, /^(?:\}\}\}\})/, /^(?:\{\{(~)?>)/, /^(?:\{\{(~)?#>)/, /^(?:\{\{(~)?#\*?)/, /^(?:\{\{(~)?\/)/, /^(?:\{\{(~)?\^\s*(~)?\}\})/, /^(?:\{\{(~)?\s*else\s*(~)?\}\})/, /^(?:\{\{(~)?\^)/, /^(?:\{\{(~)?\s*else\b)/, /^(?:\{\{(~)?\{)/, /^(?:\{\{(~)?&)/, /^(?:\{\{(~)?!--)/, /^(?:\{\{(~)?![\s\S]*?\}\})/, /^(?:\{\{(~)?\*?)/, /^(?:=)/, /^(?:\.\.)/, /^(?:\.(?=([=~}\s\/.)|])))/, /^(?:[\/.])/, /^(?:\s+)/, /^(?:\}(~)?\}\})/, /^(?:(~)?\}\})/, /^(?:"(\\["]|[^"])*")/, /^(?:'(\\[']|[^'])*')/, /^(?:@)/, /^(?:true(?=([~}\s)])))/, /^(?:false(?=([~}\s)])))/, /^(?:undefined(?=([~}\s)])))/, /^(?:null(?=([~}\s)])))/, /^(?:-?[0-9]+(?:\.[0-9]+)?(?=([~}\s)])))/, /^(?:as\s+\|)/, /^(?:\|)/, /^(?:([^\s!"#%-,\.\/;->@\[-\^`\{-~]+(?=([=~}\s\/.)|]))))/, /^(?:\[(\\\]|[^\]])*\])/, /^(?:.)/, /^(?:$)/];
            lexer.conditions = {
              "mu": {
                "rules": [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
                "inclusive": false
              },
              "emu": {
                "rules": [2],
                "inclusive": false
              },
              "com": {
                "rules": [6],
                "inclusive": false
              },
              "raw": {
                "rules": [3, 4, 5],
                "inclusive": false
              },
              "INITIAL": {
                "rules": [0, 1, 44],
                "inclusive": true
              }
            };
            return lexer;
          })();
          parser.lexer = lexer;
          function Parser() {
            this.yy = {};
          }
          Parser.prototype = parser;
          parser.Parser = Parser;
          return new Parser();
        })();
        exports.__esModule = true;
        exports['default'] = handlebars;
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _visitor = __webpack_require__(6);
        var _visitor2 = _interopRequireDefault(_visitor);
        function WhitespaceControl() {
          var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
          this.options = options;
        }
        WhitespaceControl.prototype = new _visitor2['default']();
        WhitespaceControl.prototype.Program = function(program) {
          var doStandalone = !this.options.ignoreStandalone;
          var isRoot = !this.isRootSeen;
          this.isRootSeen = true;
          var body = program.body;
          for (var i = 0,
              l = body.length; i < l; i++) {
            var current = body[i],
                strip = this.accept(current);
            if (!strip) {
              continue;
            }
            var _isPrevWhitespace = isPrevWhitespace(body, i, isRoot),
                _isNextWhitespace = isNextWhitespace(body, i, isRoot),
                openStandalone = strip.openStandalone && _isPrevWhitespace,
                closeStandalone = strip.closeStandalone && _isNextWhitespace,
                inlineStandalone = strip.inlineStandalone && _isPrevWhitespace && _isNextWhitespace;
            if (strip.close) {
              omitRight(body, i, true);
            }
            if (strip.open) {
              omitLeft(body, i, true);
            }
            if (doStandalone && inlineStandalone) {
              omitRight(body, i);
              if (omitLeft(body, i)) {
                if (current.type === 'PartialStatement') {
                  current.indent = /([ \t]+$)/.exec(body[i - 1].original)[1];
                }
              }
            }
            if (doStandalone && openStandalone) {
              omitRight((current.program || current.inverse).body);
              omitLeft(body, i);
            }
            if (doStandalone && closeStandalone) {
              omitRight(body, i);
              omitLeft((current.inverse || current.program).body);
            }
          }
          return program;
        };
        WhitespaceControl.prototype.BlockStatement = WhitespaceControl.prototype.DecoratorBlock = WhitespaceControl.prototype.PartialBlockStatement = function(block) {
          this.accept(block.program);
          this.accept(block.inverse);
          var program = block.program || block.inverse,
              inverse = block.program && block.inverse,
              firstInverse = inverse,
              lastInverse = inverse;
          if (inverse && inverse.chained) {
            firstInverse = inverse.body[0].program;
            while (lastInverse.chained) {
              lastInverse = lastInverse.body[lastInverse.body.length - 1].program;
            }
          }
          var strip = {
            open: block.openStrip.open,
            close: block.closeStrip.close,
            openStandalone: isNextWhitespace(program.body),
            closeStandalone: isPrevWhitespace((firstInverse || program).body)
          };
          if (block.openStrip.close) {
            omitRight(program.body, null, true);
          }
          if (inverse) {
            var inverseStrip = block.inverseStrip;
            if (inverseStrip.open) {
              omitLeft(program.body, null, true);
            }
            if (inverseStrip.close) {
              omitRight(firstInverse.body, null, true);
            }
            if (block.closeStrip.open) {
              omitLeft(lastInverse.body, null, true);
            }
            if (!this.options.ignoreStandalone && isPrevWhitespace(program.body) && isNextWhitespace(firstInverse.body)) {
              omitLeft(program.body);
              omitRight(firstInverse.body);
            }
          } else if (block.closeStrip.open) {
            omitLeft(program.body, null, true);
          }
          return strip;
        };
        WhitespaceControl.prototype.Decorator = WhitespaceControl.prototype.MustacheStatement = function(mustache) {
          return mustache.strip;
        };
        WhitespaceControl.prototype.PartialStatement = WhitespaceControl.prototype.CommentStatement = function(node) {
          var strip = node.strip || {};
          return {
            inlineStandalone: true,
            open: strip.open,
            close: strip.close
          };
        };
        function isPrevWhitespace(body, i, isRoot) {
          if (i === undefined) {
            i = body.length;
          }
          var prev = body[i - 1],
              sibling = body[i - 2];
          if (!prev) {
            return isRoot;
          }
          if (prev.type === 'ContentStatement') {
            return (sibling || !isRoot ? /\r?\n\s*?$/ : /(^|\r?\n)\s*?$/).test(prev.original);
          }
        }
        function isNextWhitespace(body, i, isRoot) {
          if (i === undefined) {
            i = -1;
          }
          var next = body[i + 1],
              sibling = body[i + 2];
          if (!next) {
            return isRoot;
          }
          if (next.type === 'ContentStatement') {
            return (sibling || !isRoot ? /^\s*?\r?\n/ : /^\s*?(\r?\n|$)/).test(next.original);
          }
        }
        function omitRight(body, i, multiple) {
          var current = body[i == null ? 0 : i + 1];
          if (!current || current.type !== 'ContentStatement' || !multiple && current.rightStripped) {
            return;
          }
          var original = current.value;
          current.value = current.value.replace(multiple ? /^\s+/ : /^[ \t]*\r?\n?/, '');
          current.rightStripped = current.value !== original;
        }
        function omitLeft(body, i, multiple) {
          var current = body[i == null ? body.length - 1 : i - 1];
          if (!current || current.type !== 'ContentStatement' || !multiple && current.leftStripped) {
            return;
          }
          var original = current.value;
          current.value = current.value.replace(multiple ? /\s+$/ : /[ \t]+$/, '');
          current.leftStripped = current.value !== original;
          return current.leftStripped;
        }
        exports['default'] = WhitespaceControl;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        exports.SourceLocation = SourceLocation;
        exports.id = id;
        exports.stripFlags = stripFlags;
        exports.stripComment = stripComment;
        exports.preparePath = preparePath;
        exports.prepareMustache = prepareMustache;
        exports.prepareRawBlock = prepareRawBlock;
        exports.prepareBlock = prepareBlock;
        exports.prepareProgram = prepareProgram;
        exports.preparePartialBlock = preparePartialBlock;
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        function validateClose(open, close) {
          close = close.path ? close.path.original : close;
          if (open.path.original !== close) {
            var errorNode = {loc: open.path.loc};
            throw new _exception2['default'](open.path.original + " doesn't match " + close, errorNode);
          }
        }
        function SourceLocation(source, locInfo) {
          this.source = source;
          this.start = {
            line: locInfo.first_line,
            column: locInfo.first_column
          };
          this.end = {
            line: locInfo.last_line,
            column: locInfo.last_column
          };
        }
        function id(token) {
          if (/^\[.*\]$/.test(token)) {
            return token.substr(1, token.length - 2);
          } else {
            return token;
          }
        }
        function stripFlags(open, close) {
          return {
            open: open.charAt(2) === '~',
            close: close.charAt(close.length - 3) === '~'
          };
        }
        function stripComment(comment) {
          return comment.replace(/^\{\{~?\!-?-?/, '').replace(/-?-?~?\}\}$/, '');
        }
        function preparePath(data, parts, loc) {
          loc = this.locInfo(loc);
          var original = data ? '@' : '',
              dig = [],
              depth = 0,
              depthString = '';
          for (var i = 0,
              l = parts.length; i < l; i++) {
            var part = parts[i].part,
                isLiteral = parts[i].original !== part;
            original += (parts[i].separator || '') + part;
            if (!isLiteral && (part === '..' || part === '.' || part === 'this')) {
              if (dig.length > 0) {
                throw new _exception2['default']('Invalid path: ' + original, {loc: loc});
              } else if (part === '..') {
                depth++;
                depthString += '../';
              }
            } else {
              dig.push(part);
            }
          }
          return {
            type: 'PathExpression',
            data: data,
            depth: depth,
            parts: dig,
            original: original,
            loc: loc
          };
        }
        function prepareMustache(path, params, hash, open, strip, locInfo) {
          var escapeFlag = open.charAt(3) || open.charAt(2),
              escaped = escapeFlag !== '{' && escapeFlag !== '&';
          var decorator = /\*/.test(open);
          return {
            type: decorator ? 'Decorator' : 'MustacheStatement',
            path: path,
            params: params,
            hash: hash,
            escaped: escaped,
            strip: strip,
            loc: this.locInfo(locInfo)
          };
        }
        function prepareRawBlock(openRawBlock, contents, close, locInfo) {
          validateClose(openRawBlock, close);
          locInfo = this.locInfo(locInfo);
          var program = {
            type: 'Program',
            body: contents,
            strip: {},
            loc: locInfo
          };
          return {
            type: 'BlockStatement',
            path: openRawBlock.path,
            params: openRawBlock.params,
            hash: openRawBlock.hash,
            program: program,
            openStrip: {},
            inverseStrip: {},
            closeStrip: {},
            loc: locInfo
          };
        }
        function prepareBlock(openBlock, program, inverseAndProgram, close, inverted, locInfo) {
          if (close && close.path) {
            validateClose(openBlock, close);
          }
          var decorator = /\*/.test(openBlock.open);
          program.blockParams = openBlock.blockParams;
          var inverse = undefined,
              inverseStrip = undefined;
          if (inverseAndProgram) {
            if (decorator) {
              throw new _exception2['default']('Unexpected inverse block on decorator', inverseAndProgram);
            }
            if (inverseAndProgram.chain) {
              inverseAndProgram.program.body[0].closeStrip = close.strip;
            }
            inverseStrip = inverseAndProgram.strip;
            inverse = inverseAndProgram.program;
          }
          if (inverted) {
            inverted = inverse;
            inverse = program;
            program = inverted;
          }
          return {
            type: decorator ? 'DecoratorBlock' : 'BlockStatement',
            path: openBlock.path,
            params: openBlock.params,
            hash: openBlock.hash,
            program: program,
            inverse: inverse,
            openStrip: openBlock.strip,
            inverseStrip: inverseStrip,
            closeStrip: close && close.strip,
            loc: this.locInfo(locInfo)
          };
        }
        function prepareProgram(statements, loc) {
          if (!loc && statements.length) {
            var firstLoc = statements[0].loc,
                lastLoc = statements[statements.length - 1].loc;
            if (firstLoc && lastLoc) {
              loc = {
                source: firstLoc.source,
                start: {
                  line: firstLoc.start.line,
                  column: firstLoc.start.column
                },
                end: {
                  line: lastLoc.end.line,
                  column: lastLoc.end.column
                }
              };
            }
          }
          return {
            type: 'Program',
            body: statements,
            strip: {},
            loc: loc
          };
        }
        function preparePartialBlock(open, program, close, locInfo) {
          validateClose(open, close);
          return {
            type: 'PartialBlockStatement',
            name: open.path,
            params: open.params,
            hash: open.hash,
            program: program,
            openStrip: open.strip,
            closeStrip: close && close.strip,
            loc: this.locInfo(locInfo)
          };
        }
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        var SourceNode = undefined;
        try {
          if (false) {
            var SourceMap = require('source-map');
            SourceNode = SourceMap.SourceNode;
          }
        } catch (err) {}
        if (!SourceNode) {
          SourceNode = function(line, column, srcFile, chunks) {
            this.src = '';
            if (chunks) {
              this.add(chunks);
            }
          };
          SourceNode.prototype = {
            add: function add(chunks) {
              if (_utils.isArray(chunks)) {
                chunks = chunks.join('');
              }
              this.src += chunks;
            },
            prepend: function prepend(chunks) {
              if (_utils.isArray(chunks)) {
                chunks = chunks.join('');
              }
              this.src = chunks + this.src;
            },
            toStringWithSourceMap: function toStringWithSourceMap() {
              return {code: this.toString()};
            },
            toString: function toString() {
              return this.src;
            }
          };
        }
        function castChunk(chunk, codeGen, loc) {
          if (_utils.isArray(chunk)) {
            var ret = [];
            for (var i = 0,
                len = chunk.length; i < len; i++) {
              ret.push(codeGen.wrap(chunk[i], loc));
            }
            return ret;
          } else if (typeof chunk === 'boolean' || typeof chunk === 'number') {
            return chunk + '';
          }
          return chunk;
        }
        function CodeGen(srcFile) {
          this.srcFile = srcFile;
          this.source = [];
        }
        CodeGen.prototype = {
          isEmpty: function isEmpty() {
            return !this.source.length;
          },
          prepend: function prepend(source, loc) {
            this.source.unshift(this.wrap(source, loc));
          },
          push: function push(source, loc) {
            this.source.push(this.wrap(source, loc));
          },
          merge: function merge() {
            var source = this.empty();
            this.each(function(line) {
              source.add(['  ', line, '\n']);
            });
            return source;
          },
          each: function each(iter) {
            for (var i = 0,
                len = this.source.length; i < len; i++) {
              iter(this.source[i]);
            }
          },
          empty: function empty() {
            var loc = this.currentLocation || {start: {}};
            return new SourceNode(loc.start.line, loc.start.column, this.srcFile);
          },
          wrap: function wrap(chunk) {
            var loc = arguments.length <= 1 || arguments[1] === undefined ? this.currentLocation || {start: {}} : arguments[1];
            if (chunk instanceof SourceNode) {
              return chunk;
            }
            chunk = castChunk(chunk, this, loc);
            return new SourceNode(loc.start.line, loc.start.column, this.srcFile, chunk);
          },
          functionCall: function functionCall(fn, type, params) {
            params = this.generateList(params);
            return this.wrap([fn, type ? '.' + type + '(' : '(', params, ')']);
          },
          quotedString: function quotedString(str) {
            return '"' + (str + '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '"';
          },
          objectLiteral: function objectLiteral(obj) {
            var pairs = [];
            for (var key in obj) {
              if (obj.hasOwnProperty(key)) {
                var value = castChunk(obj[key], this);
                if (value !== 'undefined') {
                  pairs.push([this.quotedString(key), ':', value]);
                }
              }
            }
            var ret = this.generateList(pairs);
            ret.prepend('{');
            ret.add('}');
            return ret;
          },
          generateList: function generateList(entries) {
            var ret = this.empty();
            for (var i = 0,
                len = entries.length; i < len; i++) {
              if (i) {
                ret.add(',');
              }
              ret.add(castChunk(entries[i], this));
            }
            return ret;
          },
          generateArray: function generateArray(entries) {
            var ret = this.generateList(entries);
            ret.prepend('[');
            ret.add(']');
            return ret;
          }
        };
        exports['default'] = CodeGen;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        exports.registerDefaultHelpers = registerDefaultHelpers;
        var _helpersBlockHelperMissing = __webpack_require__(22);
        var _helpersBlockHelperMissing2 = _interopRequireDefault(_helpersBlockHelperMissing);
        var _helpersEach = __webpack_require__(23);
        var _helpersEach2 = _interopRequireDefault(_helpersEach);
        var _helpersHelperMissing = __webpack_require__(24);
        var _helpersHelperMissing2 = _interopRequireDefault(_helpersHelperMissing);
        var _helpersIf = __webpack_require__(25);
        var _helpersIf2 = _interopRequireDefault(_helpersIf);
        var _helpersLog = __webpack_require__(26);
        var _helpersLog2 = _interopRequireDefault(_helpersLog);
        var _helpersLookup = __webpack_require__(27);
        var _helpersLookup2 = _interopRequireDefault(_helpersLookup);
        var _helpersWith = __webpack_require__(28);
        var _helpersWith2 = _interopRequireDefault(_helpersWith);
        function registerDefaultHelpers(instance) {
          _helpersBlockHelperMissing2['default'](instance);
          _helpersEach2['default'](instance);
          _helpersHelperMissing2['default'](instance);
          _helpersIf2['default'](instance);
          _helpersLog2['default'](instance);
          _helpersLookup2['default'](instance);
          _helpersWith2['default'](instance);
        }
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        exports.registerDefaultDecorators = registerDefaultDecorators;
        var _decoratorsInline = __webpack_require__(29);
        var _decoratorsInline2 = _interopRequireDefault(_decoratorsInline);
        function registerDefaultDecorators(instance) {
          _decoratorsInline2['default'](instance);
        }
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        var logger = {
          methodMap: ['debug', 'info', 'warn', 'error'],
          level: 'info',
          lookupLevel: function lookupLevel(level) {
            if (typeof level === 'string') {
              var levelMap = _utils.indexOf(logger.methodMap, level.toLowerCase());
              if (levelMap >= 0) {
                level = levelMap;
              } else {
                level = parseInt(level, 10);
              }
            }
            return level;
          },
          log: function log(level) {
            level = logger.lookupLevel(level);
            if (typeof console !== 'undefined' && logger.lookupLevel(logger.level) <= level) {
              var method = logger.methodMap[level];
              if (!console[method]) {
                method = 'log';
              }
              for (var _len = arguments.length,
                  message = Array(_len > 1 ? _len - 1 : 0),
                  _key = 1; _key < _len; _key++) {
                message[_key - 1] = arguments[_key];
              }
              console[method].apply(console, message);
            }
          }
        };
        exports['default'] = logger;
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        exports['default'] = function(instance) {
          instance.registerHelper('blockHelperMissing', function(context, options) {
            var inverse = options.inverse,
                fn = options.fn;
            if (context === true) {
              return fn(this);
            } else if (context === false || context == null) {
              return inverse(this);
            } else if (_utils.isArray(context)) {
              if (context.length > 0) {
                if (options.ids) {
                  options.ids = [options.name];
                }
                return instance.helpers.each(context, options);
              } else {
                return inverse(this);
              }
            } else {
              if (options.data && options.ids) {
                var data = _utils.createFrame(options.data);
                data.contextPath = _utils.appendContextPath(options.data.contextPath, options.name);
                options = {data: data};
              }
              return fn(context, options);
            }
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        exports['default'] = function(instance) {
          instance.registerHelper('each', function(context, options) {
            if (!options) {
              throw new _exception2['default']('Must pass iterator to #each');
            }
            var fn = options.fn,
                inverse = options.inverse,
                i = 0,
                ret = '',
                data = undefined,
                contextPath = undefined;
            if (options.data && options.ids) {
              contextPath = _utils.appendContextPath(options.data.contextPath, options.ids[0]) + '.';
            }
            if (_utils.isFunction(context)) {
              context = context.call(this);
            }
            if (options.data) {
              data = _utils.createFrame(options.data);
            }
            function execIteration(field, index, last) {
              if (data) {
                data.key = field;
                data.index = index;
                data.first = index === 0;
                data.last = !!last;
                if (contextPath) {
                  data.contextPath = contextPath + field;
                }
              }
              ret = ret + fn(context[field], {
                data: data,
                blockParams: _utils.blockParams([context[field], field], [contextPath + field, null])
              });
            }
            if (context && typeof context === 'object') {
              if (_utils.isArray(context)) {
                for (var j = context.length; i < j; i++) {
                  if (i in context) {
                    execIteration(i, i, i === context.length - 1);
                  }
                }
              } else {
                var priorKey = undefined;
                for (var key in context) {
                  if (context.hasOwnProperty(key)) {
                    if (priorKey !== undefined) {
                      execIteration(priorKey, i - 1);
                    }
                    priorKey = key;
                    i++;
                  }
                }
                if (priorKey !== undefined) {
                  execIteration(priorKey, i - 1, true);
                }
              }
            }
            if (i === 0) {
              ret = inverse(this);
            }
            return ret;
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        var _interopRequireDefault = __webpack_require__(8)['default'];
        exports.__esModule = true;
        var _exception = __webpack_require__(12);
        var _exception2 = _interopRequireDefault(_exception);
        exports['default'] = function(instance) {
          instance.registerHelper('helperMissing', function() {
            if (arguments.length === 1) {
              return undefined;
            } else {
              throw new _exception2['default']('Missing helper: "' + arguments[arguments.length - 1].name + '"');
            }
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        exports['default'] = function(instance) {
          instance.registerHelper('if', function(conditional, options) {
            if (_utils.isFunction(conditional)) {
              conditional = conditional.call(this);
            }
            if (!options.hash.includeZero && !conditional || _utils.isEmpty(conditional)) {
              return options.inverse(this);
            } else {
              return options.fn(this);
            }
          });
          instance.registerHelper('unless', function(conditional, options) {
            return instance.helpers['if'].call(this, conditional, {
              fn: options.inverse,
              inverse: options.fn,
              hash: options.hash
            });
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        exports['default'] = function(instance) {
          instance.registerHelper('log', function() {
            var args = [undefined],
                options = arguments[arguments.length - 1];
            for (var i = 0; i < arguments.length - 1; i++) {
              args.push(arguments[i]);
            }
            var level = 1;
            if (options.hash.level != null) {
              level = options.hash.level;
            } else if (options.data && options.data.level != null) {
              level = options.data.level;
            }
            args[0] = level;
            instance.log.apply(instance, args);
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        exports['default'] = function(instance) {
          instance.registerHelper('lookup', function(obj, field) {
            return obj && obj[field];
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        exports['default'] = function(instance) {
          instance.registerHelper('with', function(context, options) {
            if (_utils.isFunction(context)) {
              context = context.call(this);
            }
            var fn = options.fn;
            if (!_utils.isEmpty(context)) {
              var data = options.data;
              if (options.data && options.ids) {
                data = _utils.createFrame(options.data);
                data.contextPath = _utils.appendContextPath(options.data.contextPath, options.ids[0]);
              }
              return fn(context, {
                data: data,
                blockParams: _utils.blockParams([context], [data && data.contextPath])
              });
            } else {
              return options.inverse(this);
            }
          });
        };
        module.exports = exports['default'];
      }, function(module, exports, __webpack_require__) {
        'use strict';
        exports.__esModule = true;
        var _utils = __webpack_require__(13);
        exports['default'] = function(instance) {
          instance.registerDecorator('inline', function(fn, props, container, options) {
            var ret = fn;
            if (!props.partials) {
              props.partials = {};
              ret = function(context, options) {
                var original = container.partials;
                container.partials = _utils.extend({}, original, props.partials);
                var ret = fn(context, options);
                container.partials = original;
                return ret;
              };
            }
            props.partials[options.args[0]] = options.fn;
            return ret;
          });
        };
        module.exports = exports['default'];
      }]);
    });
    ;
  })();
  return _retrieveGlobal();
});

$__System.registerDynamic("65", ["64"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('64');
  global.define = __define;
  return module.exports;
});

$__System.register('66', [], function (_export) {
	'use strict';

	// Implementation from http://stackoverflow.com/a/2893259

	_export('equals', equals);

	_export('formatXml', formatXml);

	function equals(leftVal, rightVal, options) {
		if (arguments.length < 3) throw new Error("Handlebars Helper equal needs 2 parameters");
		if (leftVal !== rightVal) {
			return options.inverse(this);
		} else {
			return options.fn(this);
		}
	}

	function formatXml(xml) {
		var reg = /(>)\s*(<)(\/*)/g;
		var wsexp = / *(.*) +\n/g;
		var contexp = /(<.+>)(.+\n)/g;
		xml = xml.replace(reg, '$1\n$2$3').replace(wsexp, '$1\n').replace(contexp, '$1\n$2');
		var formatted = '';
		var lines = xml.split('\n');
		var indent = 0;
		var lastType = 'other';
		// 4 types of tags - single, closing, opening, other (text, doctype, comment) - 4*4 = 16 transitions
		var transitions = {
			'single->single': 0,
			'single->closing': -1,
			'single->opening': 0,
			'single->other': 0,
			'closing->single': 0,
			'closing->closing': -1,
			'closing->opening': 0,
			'closing->other': 0,
			'opening->single': 1,
			'opening->closing': 0,
			'opening->opening': 1,
			'opening->other': 1,
			'other->single': 0,
			'other->closing': -1,
			'other->opening': 0,
			'other->other': 0
		};

		for (var i = 0; i < lines.length; i++) {
			var ln = lines[i];
			var single = Boolean(ln.match(/<.+\/>/)); // is this line a single tag? ex. <br />
			var closing = Boolean(ln.match(/<\/.+>/)); // is this a closing tag? ex. </a>
			var opening = Boolean(ln.match(/<[^!].*>/)); // is this even a tag (that's not <!something>)
			var type = single ? 'single' : closing ? 'closing' : opening ? 'opening' : 'other';
			var fromTo = lastType + '->' + type;
			lastType = type;
			var padding = '';

			indent += transitions[fromTo];

			for (var j = 0; j < indent; j++) {
				padding += '\t';
			}

			if (fromTo === 'opening->closing') {
				// substr removes line break (\n) from prev loop
				formatted = formatted.substr(0, formatted.length - 1) + ln + '\n';
			} else {
				formatted += padding + ln + '\n';
			}
		}

		return formatted;
	}

	return {
		setters: [],
		execute: function () {}
	};
});
$__System.register("67", [], function (_export) {
	"use strict";

	var data, image, title, header, xmlString;
	return {
		setters: [],
		execute: function () {
			data = "<data{{#boundVariableName}} source=\"{{.}}\"{{/boundVariableName}}>\n\t{{#label}}<label>{{.}}</label>{{/label}}\n\t{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}\n\t{{#stringTemplate}}<format>{{.}}</format>{{/stringTemplate}}\n</data>";
			image = "<image{{#boundVariableName}} source=\"{{.}}\"{{/boundVariableName}}>\n\t{{#caption}}\n\t\t<caption{{#boundVariableName}} source=\"{{.}}\"{{/boundVariableName}}>\n\t\t\t{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}\n\t\t\t{{#stringTemplate}}<format>{{.}}</format>{{/stringTemplate}}\n\t\t</caption>\n\t{{/caption}}\n\t{{#if altDefaultValue}}\n\t\t<alt{{#altBoundVariableName}} source=\"{{.}}\"{{/altBoundVariableName}}>\n\t\t\t<default>{{altDefaultValue}}</default>\n\t\t</alt>\n\t{{/if}}\n\t{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}\n</image>";
			title = "<title{{#boundVariableName}} source=\"{{.}}\"{{/boundVariableName}}>\n\t{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}\n\t{{#stringTemplate}}<format>{{.}}</format>{{/stringTemplate}}\n</title>";

			// headers within groups use the "title" node type
			header = "<header>{{value}}</header>";
			xmlString = "<infobox{{#theme}} theme=\"{{.}}\"{{/theme}}{{#themeVarName}} theme-source=\"{{.}}\"{{/themeVarName}}{{#layout}} layout=\"{{.}}\"{{/layout}}>\n\t{{#each items as |item|}}\n\t\t{{#equals item._nodeType 'data'}}" + data + "{{/equals}}\n\t\t{{#equals item._nodeType 'image'}}" + image + "{{/equals}}\n\t\t{{#equals item._nodeType 'title'}}" + title + "{{/equals}}\n\t\t{{#equals item._nodeType 'group'}}\n\t\t\t<group>\n\t\t\t\t{{#each item.items as |groupItem|}}\n\t\t\t\t\t{{#equals groupItem._nodeType 'data'}}" + data + "{{/equals}}\n\t\t\t\t\t{{#equals groupItem._nodeType 'image'}}" + image + "{{/equals}}\n\t\t\t\t\t{{#equals groupItem._nodeType 'title'}}" + header + "{{/equals}}\n\t\t\t\t{{/each}}\n\t\t\t</group>\n\t\t{{/equals}}\n\t{{/each}}\n</infobox>";

			_export("xmlString", xmlString);
		}
	};
});
$__System.register('68', ['25', '37', '65', '66', '67', '2e', '2b'], function (_export) {
	var _Object$assign, InfoboxData, equals, formatXml, xmlString, InfoboxThemeData, isString;

	function createElements(child) {
		var nodeName = child.nodeName;

		var create = InfoboxData.newElement;

		var defaultTag = child.querySelector('default');
		var formatTag = child.querySelector('format');

		var props = {
			defaultValue: defaultTag && defaultTag.textContent,
			boundVariableName: child.getAttribute('source')
		};

		switch (nodeName.toLowerCase()) {
			case 'title':
				return create('Title', _Object$assign(props, {
					stringTemplate: formatTag && formatTag.textContent
				}));

			case 'image':
				var altTag = child.querySelector('alt');
				var altDefaultTag = altTag && altTag.querySelector('default');
				var captionTag = child.querySelector('caption');
				var captionFormatTag = captionTag && captionTag.querySelector('format');

				var imageProps = _Object$assign(props, {
					altBoundVariableName: altTag && altTag.getAttribute('source'),
					altDefaultValue: altDefaultTag && altDefaultTag.textContent
				});

				imageProps.caption = create('Caption', {
					value: captionTag && captionTag.textContent,
					boundVariableName: captionTag && captionTag.getAttribute('source'),
					stringTemplate: captionFormatTag && captionFormatTag.textContent
				});

				return create('Image', imageProps);

			case 'header':
				return create('Title', _Object$assign(props, { value: child.textContent }));

			case 'data':
				var labelTag = child.querySelector('label');
				return create('Field', _Object$assign(props, {
					label: labelTag && labelTag.textContent,
					stringTemplate: formatTag && formatTag.textContent
				}));

			case 'group':
				return create('Group', _Object$assign(props, {
					layout: child.getAttribute('layout'),
					show: child.getAttribute('show'),
					items: Array.prototype.map.call(child.children, createElements)
				}));

			default:
				return null;
		}
	}

	/**
  * serialize
  *
  * @param data {InfoboxData}
  * @param theme {InfoboxThemeData}
  * @return {string} A string of portable infobox data
  */

	function serialize(data, theme) {
		var template = Handlebars.compile(xmlString);
		return formatXml(template(data));
	}

	/**
  * deserialize
  *
  * @param doc {string} A string of portable infobox xml
  * @return {object} an object containing new instances of InfoboxData and InfoboxThemeData
  */

	function deserialize(doc) {

		if (!isString(doc)) {
			throw new TypeError('document supplied to deserialize must be a string');
		}

		var parser = new DOMParser();

		var _doc = parser.parseFromString(doc, 'text/html');

		var infobox = _doc.querySelector('infobox');

		var infoboxProps = {
			layout: infobox.getAttribute('layout'),
			theme: infobox.getAttribute('theme'),
			themeVarName: infobox.getAttribute('theme-source'),
			items: Array.prototype.map.call(infobox.children, createElements)
		};

		return {
			data: new InfoboxData(infoboxProps),
			theme: null //new InfoboxThemeData()
		};
	}

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_4) {
			InfoboxData = _4.InfoboxData;
		}, function (_2) {}, function (_3) {
			equals = _3.equals;
			formatXml = _3.formatXml;
		}, function (_5) {
			xmlString = _5.xmlString;
		}, function (_e) {
			InfoboxThemeData = _e.InfoboxThemeData;
		}, function (_b) {
			isString = _b.isString;
		}],
		execute: function () {
			'use strict';

			_export('serialize', serialize);

			_export('deserialize', deserialize);

			Handlebars.registerHelper('equals', equals);
		}
	};
});
$__System.register('1', ['25', '37', '63', '68', 'f', '1a', '1d', '1e', '2e', '2d'], function (_export) {
	var _Object$assign, InfoboxData, persist, _serialize, deserialize, _get, _inherits, _createClass, _classCallCheck, InfoboxThemeData, Model, defaultProps, Core;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			InfoboxData = _2.InfoboxData;
		}, function (_3) {
			persist = _3.persist;
		}, function (_4) {
			_serialize = _4.serialize;
			deserialize = _4.deserialize;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_d) {
			_createClass = _d['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_e2) {
			InfoboxThemeData = _e2.InfoboxThemeData;
		}, function (_d2) {
			Model = _d2.Model;
		}],
		execute: function () {
			'use strict';

			defaultProps = {
				// Options to be passed to InfoboxData constructor
				dataOptions: null,
				// Options to be passed to InfoboxThemeData constructor
				themeOptions: null,
				// The 'from' property's value is a string whose contents are serialized Portable Infobox XML
				from: null,
				// In the case of mediawiki storage, this is the article title. Otherwise, a string title for the infobox template.
				persistOptions: null
			};

			Core = (function (_Model) {
				_inherits(Core, _Model);

				function Core() {
					var params = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

					_classCallCheck(this, Core);

					_get(Object.getPrototypeOf(Core.prototype), 'constructor', this).call(this);

					// extend the properties
					params = _Object$assign(defaultProps, params);

					var _params = params;
					var from = _params.from;

					/*
      * If builder is instantiated with a serialized document, we will deconstruct it
      * into our internal representation, and populate the builder with those values
      */
					if (from) {

						var deserialized = deserialize(from);

						this.data = deserialized.data;
						this.theme = deserialized.theme;
					} else {
						// If 'from' is not defined, we instantiate a fresh infobox
						this.data = new InfoboxData(params.dataOptions);
						this.theme = new InfoboxThemeData();
					}

					// store config for persistence method
					this.persistOptions = params.persistOptions;
				}

				// semver

				_createClass(Core, [{
					key: 'serialize',
					value: function serialize() {
						return _serialize(this.data, this.theme);
					}
				}, {
					key: 'save',
					value: function save() {
						var _this = this;

						var data = this.serialize();
						return persist(data, this.persistOptions).then(function () {
							return _this.emit('save', data);
						})['catch'](function (err) {
							return _this.emit('errorWhileSaving', err);
						});
					}
				}]);

				return Core;
			})(Model);

			Core.VERSION = '0.1.0';

			if (window) {
				// export the class for clients that don't use dependency injection
				window.InfoboxTemplateBuilder = Core;
			}

			_export('InfoboxTemplateBuilder', Core);
		}
	};
});
})
(function(factory) {
  if (typeof define == 'function' && define.amd)
    define([], factory);
  else
    factory();
});
//# sourceMappingURL=infobox-template-builder.amd.js.map