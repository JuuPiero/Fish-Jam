"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/main.ts
var main_exports = {};
__export(main_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(main_exports);
var import_fs = require("fs"), import_path = require("path"), NAME = "spine-plus";
function scene(method, ...args) {
  return Editor.Message.request("scene", "execute-scene-script", { name: NAME, method, args });
}
var pendingPreview = null, methods = {
  openPanel() {
    Editor.Panel.open(NAME);
  },
  /** Opens the Preview panel on a spine-data asset. */
  async openPreview(assetUuid) {
    if (pendingPreview = assetUuid || null, await Editor.Panel.open(NAME), assetUuid)
      try {
        await Editor.Message.request(NAME, "preview-asset", assetUuid), pendingPreview = null;
      } catch {
      }
  },
  takePendingPreview() {
    let uuid = pendingPreview;
    return pendingPreview = null, uuid;
  },
  /** Node with a SkeletonAnimation for this asset, in the open scene. */
  async createSkeleton(assetUuid) {
    try {
      await scene("spCreate", assetUuid || "");
    } catch (e) {
      console.error("[Spine Plus] Could not create the skeleton (is a scene open?):", e);
    }
  },
  /** Writes what the scene script sees to diagnostics.json in the extension folder. */
  async saveDiagnostics() {
    let file = (0, import_path.join)(__dirname, "..", "diagnostics.json"), data;
    try {
      data = await scene("spDiagnostics");
    } catch (e) {
      data = { error: String(e) };
    }
    (0, import_fs.writeFileSync)(file, JSON.stringify({ time: (/* @__PURE__ */ new Date()).toISOString(), editor: Editor.App.version, ...data }, null, 2)), console.log(`[Spine Plus] Diagnostics saved to ${file}`);
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
//# sourceMappingURL=main.js.map
