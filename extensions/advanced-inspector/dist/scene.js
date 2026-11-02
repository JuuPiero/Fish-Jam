"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// source/scene.ts
var scene_exports = {};
__export(scene_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(scene_exports);
var import_path = require("path");
module.paths.push((0, import_path.join)(Editor.App.path, "node_modules"));
function cc() {
  return require("cc");
}
var g = globalThis;
var methods = {
  /** Attribute metadata of a component class, or null when it has none. */
  getMeta(type) {
    const getClassMeta = g.__advInspectorGetClassMeta;
    if (typeof getClassMeta !== "function" || typeof type !== "string") return null;
    const ctor = cc().js.getClassByName(type);
    if (!ctor) return null;
    const meta = getClassMeta(ctor);
    return meta ? JSON.parse(JSON.stringify(meta)) : null;
  },
  info() {
    const set = g.__advInspectorClasses;
    const js = cc().js;
    return {
      runtimeLoaded: typeof g.__advInspectorGetClassMeta === "function",
      classes: set ? [...set].map((ctor) => js.getClassName(ctor) || ctor.name) : []
    };
  }
};
function load() {
}
function unload() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
