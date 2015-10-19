"format global";
"globals.EventEmitter event-emitter";
"globals.Handlebars handlebars";
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

(['1'], ["66","2c"], function($__System) {

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

$__System.register('29', [], function (_export) {
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
$__System.register('2a', ['28', '29', '1c'], function (_export) {
	var _Object$keys, isNumeric, isString, _Object$defineProperty;

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
		}, function (_2) {
			isNumeric = _2.isNumeric;
			isString = _2.isString;
		}, function (_c) {
			_Object$defineProperty = _c['default'];
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
$__System.register('2b', ['25', '28', '1d', '1e', '2c', '2a'], function (_export) {
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
		}, function (_c) {
			EventEmitter = _c['default'];
		}, function (_a) {
			deepSet = _a.deepSet;
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
$__System.register('2d', ['25', '29', 'f', '1a', '1e', '2b'], function (_export) {
	var _Object$assign, isString, _get, _inherits, _classCallCheck, Model, defaultProperties, InfoboxThemeData;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			Model = _b.Model;
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
$__System.register('2e', ['25', '29', 'f', '1a', '1d', '1e', '2b', '2a'], function (_export) {
	var _Object$assign, isNumeric, _get, _inherits, _createClass, _classCallCheck, Model, copyArray, swapArrayElements, Collection;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isNumeric = _2.isNumeric;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_d) {
			_createClass = _d['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			Model = _b.Model;
		}, function (_a2) {
			copyArray = _a2.copyArray;
			swapArrayElements = _a2.swapArrayElements;
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
$__System.register('2f', ['25', '29', 'f', '1a', '1e', '2b'], function (_export) {
	var _Object$assign, isString, _get, _inherits, _classCallCheck, Model, defaultProperties, Elem;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_b) {
			Model = _b.Model;
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
$__System.register('30', ['25', '29', 'f', '1a', '1e', '2f'], function (_export) {
	var _Object$assign, isString, _get, _inherits, _classCallCheck, Elem, defaultProperties, Field;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_f2) {
			Elem = _f2.Elem;
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
$__System.register('31', ['25', '29', 'f', '1a', '1e', '2e'], function (_export) {
	var _Object$assign, isString, _get, _inherits, _classCallCheck, Collection, defaultProperties, Group;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_e2) {
			Collection = _e2.Collection;
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
$__System.register('32', ['25', '29', 'f', '1a', '1e', '2f'], function (_export) {
	var _Object$assign, isObject, isString, _get, _inherits, _classCallCheck, Elem, defaultProperties, Image;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isObject = _2.isObject;
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_f2) {
			Elem = _f2.Elem;
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
$__System.register('33', ['25', '29', 'f', '1a', '1e', '2f'], function (_export) {
	var _Object$assign, isString, _get, _inherits, _classCallCheck, Elem, defaultProperties, Title;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_f2) {
			Elem = _f2.Elem;
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
$__System.register('34', ['25', '29', 'f', '1a', '1e', '2f'], function (_export) {
	var _Object$assign, isString, _get, _inherits, _classCallCheck, Elem, defaultProperties, Caption;

	return {
		setters: [function (_) {
			_Object$assign = _['default'];
		}, function (_2) {
			isString = _2.isString;
		}, function (_f) {
			_get = _f['default'];
		}, function (_a) {
			_inherits = _a['default'];
		}, function (_e) {
			_classCallCheck = _e['default'];
		}, function (_f2) {
			Elem = _f2.Elem;
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
$__System.register('35', ['30', '31', '32', '33', '34'], function (_export) {
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
$__System.register('36', ['25', '35', 'f', '1a', '1d', '1e', '2e'], function (_export) {
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
		}, function (_e2) {
			Collection = _e2.Collection;
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
$__System.registerDynamic("37", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("38", [], true, function(req, exports, module) {
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

$__System.registerDynamic("39", ["38", "5"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = req('38'),
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

$__System.registerDynamic("3a", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3b", [], true, function(req, exports, module) {
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

$__System.registerDynamic("3c", ["a"], true, function(req, exports, module) {
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

$__System.registerDynamic("3d", ["2", "3b", "3c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('2'),
      createDesc = req('3b');
  module.exports = req('3c') ? function(object, key, value) {
    return $.setDesc(object, key, createDesc(1, value));
  } : function(object, key, value) {
    object[key] = value;
    return object;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3e", ["3d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('3d');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3f", ["7"], true, function(req, exports, module) {
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

$__System.registerDynamic("40", [], true, function(req, exports, module) {
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

$__System.registerDynamic("41", ["3f", "7", "40"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var store = req('3f')('wks'),
      Symbol = req('7').Symbol;
  module.exports = function(name) {
    return store[name] || (store[name] = Symbol && Symbol[name] || (Symbol || req('40'))('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("42", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("43", ["21", "3d", "41"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var has = req('21'),
      hide = req('3d'),
      TAG = req('41')('toStringTag');
  module.exports = function(it, tag, stat) {
    if (it && !has(it = stat ? it : it.prototype, TAG))
      hide(it, TAG, tag);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("44", ["2", "3d", "41", "3b", "43"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = req('2'),
      IteratorPrototype = {};
  req('3d')(IteratorPrototype, req('41')('iterator'), function() {
    return this;
  });
  module.exports = function(Constructor, NAME, next) {
    Constructor.prototype = $.create(IteratorPrototype, {next: req('3b')(1, next)});
    req('43')(Constructor, NAME + ' Iterator');
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("45", ["3a", "9", "3e", "3d", "21", "41", "42", "44", "2", "43"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var LIBRARY = req('3a'),
      $def = req('9'),
      $redef = req('3e'),
      hide = req('3d'),
      has = req('21'),
      SYMBOL_ITERATOR = req('41')('iterator'),
      Iterators = req('42'),
      BUGGY = !([].keys && 'next' in [].keys()),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values';
  var returnThis = function() {
    return this;
  };
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCE) {
    req('44')(Constructor, NAME, next);
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
      req('43')(IteratorPrototype, TAG, true);
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

$__System.registerDynamic("46", ["39", "45"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $at = req('39')(true);
  req('45')(String, 'String', function(iterated) {
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

$__System.registerDynamic("47", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function() {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("48", [], true, function(req, exports, module) {
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

$__System.registerDynamic("49", ["47", "48", "42", "6", "45"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var setUnscope = req('47'),
      step = req('48'),
      Iterators = req('42'),
      toIObject = req('6');
  req('45')(Array, 'Array', function(iterated, kind) {
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

$__System.registerDynamic("4a", ["49", "42"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('49');
  var Iterators = req('42');
  Iterators.NodeList = Iterators.HTMLCollection = Iterators.Array;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4b", ["3", "41"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = req('3'),
      TAG = req('41')('toStringTag'),
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

$__System.registerDynamic("4c", [], true, function(req, exports, module) {
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

$__System.registerDynamic("4d", ["13"], true, function(req, exports, module) {
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

$__System.registerDynamic("4e", ["42", "41"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var Iterators = req('42'),
      ITERATOR = req('41')('iterator');
  module.exports = function(it) {
    return (Iterators.Array || Array.prototype[ITERATOR]) === it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4f", ["38"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = req('38'),
      min = Math.min;
  module.exports = function(it) {
    return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("50", ["4b", "41", "42", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var classof = req('4b'),
      ITERATOR = req('41')('iterator'),
      Iterators = req('42');
  module.exports = req('8').getIteratorMethod = function(it) {
    if (it != undefined)
      return it[ITERATOR] || it['@@iterator'] || Iterators[classof(it)];
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("51", ["15", "4d", "4e", "13", "4f", "50"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ctx = req('15'),
      call = req('4d'),
      isArrayIter = req('4e'),
      anObject = req('13'),
      toLength = req('4f'),
      getIterFn = req('50');
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

$__System.registerDynamic("52", [], true, function(req, exports, module) {
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

$__System.registerDynamic("53", ["2", "41", "3c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = req('2'),
      SPECIES = req('41')('species');
  module.exports = function(C) {
    if (req('3c') && !(SPECIES in C))
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

$__System.registerDynamic("54", [], true, function(req, exports, module) {
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

$__System.registerDynamic("55", ["7"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('7').document && document.documentElement;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("56", ["12", "7"], true, function(req, exports, module) {
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

$__System.registerDynamic("57", [], true, function(req, exports, module) {
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

$__System.registerDynamic("58", ["57"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('57');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("59", ["58"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__System._nodeRequire ? process : req('58');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5a", ["59"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('59');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5b", ["15", "54", "55", "56", "7", "3", "5a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var ctx = req('15'),
        invoke = req('54'),
        html = req('55'),
        cel = req('56'),
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
  })(req('5a'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5c", ["7", "5b", "3", "5a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    var global = req('7'),
        macrotask = req('5b').set,
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
  })(req('5a'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5d", ["3e"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $redef = req('3e');
  module.exports = function(target, src) {
    for (var key in src)
      $redef(target, key, src[key]);
    return target;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5e", ["41"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var SYMBOL_ITERATOR = req('41')('iterator'),
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

$__System.registerDynamic("5f", ["2", "3a", "7", "15", "4b", "9", "12", "13", "14", "4c", "51", "16", "52", "53", "41", "40", "5c", "3c", "5d", "43", "8", "5e", "5a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = req('2'),
        LIBRARY = req('3a'),
        global = req('7'),
        ctx = req('15'),
        classof = req('4b'),
        $def = req('9'),
        isObject = req('12'),
        anObject = req('13'),
        aFunction = req('14'),
        strictNew = req('4c'),
        forOf = req('51'),
        setProto = req('16').set,
        same = req('52'),
        species = req('53'),
        SPECIES = req('41')('species'),
        RECORD = req('40')('record'),
        asap = req('5c'),
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
        if (works && req('3c')) {
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
      req('5d')(P.prototype, {
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
    req('43')(P, PROMISE);
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
    $def($def.S + $def.F * !(useNative && req('5e')(function(iter) {
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
  })(req('5a'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("60", ["37", "46", "4a", "5f", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('37');
  req('46');
  req('4a');
  req('5f');
  module.exports = req('8').Promise;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("61", ["60"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('60'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.register('62', ['28', '29', '61', '2a'], function (_export) {
	var _Object$keys, isString, _Promise, xhrPost;

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
		}, function (_3) {
			isString = _3.isString;
		}, function (_) {
			_Promise = _['default'];
		}, function (_a) {
			xhrPost = _a.xhrPost;
		}],
		execute: function () {
			'use strict';

			_export('persist', persist);
		}
	};
});
$__System.register('63', [], function (_export) {
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
$__System.register("64", [], function (_export) {
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
$__System.register('65', ['25', '29', '36', '63', '64', '66', '2d'], function (_export) {
	var _Object$assign, isString, InfoboxData, equals, formatXml, xmlString, InfoboxThemeData;

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
		}, function (_6) {
			isString = _6.isString;
		}, function (_4) {
			InfoboxData = _4.InfoboxData;
		}, function (_3) {
			equals = _3.equals;
			formatXml = _3.formatXml;
		}, function (_5) {
			xmlString = _5.xmlString;
		}, function (_2) {}, function (_d) {
			InfoboxThemeData = _d.InfoboxThemeData;
		}],
		execute: function () {
			'use strict';

			_export('serialize', serialize);

			_export('deserialize', deserialize);

			Handlebars.registerHelper('equals', equals);
		}
	};
});
$__System.register('1', ['25', '36', '62', '65', 'f', '1a', '1d', '1e', '2d', '2b'], function (_export) {
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
		}, function (_d2) {
			InfoboxThemeData = _d2.InfoboxThemeData;
		}, function (_b) {
			Model = _b.Model;
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
  factory(Handlebars, EventEmitter);
});
//# sourceMappingURL=infobox-template-builder.js.map