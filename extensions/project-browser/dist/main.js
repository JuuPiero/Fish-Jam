"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
)), __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/main.ts
var main_exports = {};
__export(main_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(main_exports);
var fs = __toESM(require("fs")), import_path = require("path"), PKG = "project-browser";
function cacheDir() {
  let dir = (0, import_path.join)(Editor.Project.path, "temp", PKG, "thumbs");
  return fs.mkdirSync(dir, { recursive: !0 }), dir;
}
var index = null;
function indexFile() {
  return (0, import_path.join)(cacheDir(), "index.json");
}
function loadIndex() {
  if (index) return index;
  try {
    index = JSON.parse(fs.readFileSync(indexFile(), "utf8")) || {};
  } catch {
    index = {};
  }
  return index;
}
var saveTimer = null;
function saveIndex() {
  saveTimer || (saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(indexFile(), JSON.stringify(index || {}));
    } catch {
    }
  }, 1e3));
}
function safeId(uuid) {
  return uuid.replace(/[^0-9a-zA-Z@_-]/g, "_").replace(/@/g, "_");
}
function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}
var methods = {
  /** Panel › Project */
  openPanel() {
    Editor.Panel.open(PKG + ".project");
  },
  async openDocs() {
    try {
      await require("electron").shell.openPath((0, import_path.join)(__dirname, "..", "README.md"));
    } catch (e) {
      console.error("[Project Browser] Could not open the README:", e);
    }
  },
  /** A cached thumbnail (data URL) when it is newer than its source file(s), or null. */
  thumbGet(uuid, file) {
    let at = loadIndex()[uuid];
    if (!at) return null;
    let files = Array.isArray(file) ? file : [file];
    for (let i = 0; i < files.length; i++) if (files[i] && mtimeOf(files[i]) > at) return null;
    try {
      return "data:image/png;base64," + fs.readFileSync((0, import_path.join)(cacheDir(), safeId(uuid) + ".png")).toString("base64");
    } catch {
      return null;
    }
  },
  /** Stores a rendered thumbnail (PNG data URL). */
  thumbPut(uuid, dataUrl) {
    let m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || "");
    if (!m) return !1;
    try {
      return fs.writeFileSync((0, import_path.join)(cacheDir(), safeId(uuid) + ".png"), Buffer.from(m[1], "base64")), loadIndex()[uuid] = Date.now(), saveIndex(), !0;
    } catch {
      return !1;
    }
  },
  /** Forgets every cached thumbnail. */
  thumbClear() {
    try {
      fs.rmSync(cacheDir(), { recursive: !0, force: !0 });
    } catch {
    }
    return index = {}, Editor.Message.broadcast(PKG + ":thumbs-cleared"), !0;
  },
  showInExplorer(file) {
    file && require("electron").shell.showItemInFolder(file);
  },
  copyText(text) {
    require("electron").clipboard.writeText(String(text || ""));
  },
  /** Project profile values (labels, saved searches). */
  async getStore(key) {
    try {
      return await Editor.Profile.getProject(PKG, key);
    } catch {
      return null;
    }
  },
  async setStore(key, value) {
    try {
      return await Editor.Profile.setProject(PKG, key, value), !0;
    } catch (e) {
      return console.warn("[Project Browser] Could not save " + key + ":", e), !1;
    }
  },
  /** Highlights an asset in Cocos' Assets panel. */
  revealInAssets(uuid) {
    try {
      Editor.Message.send("assets", "twinkle", uuid);
    } catch {
    }
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
