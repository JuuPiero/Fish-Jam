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
var import_path = require("path"), PKG = "hot-reload", CH_COMPILED = "hot-reload:compiled", CH_CONFIG = "hot-reload:config", CH_DIAGNOSE = "hot-reload:diagnose", enabled = !0, collecting = null;
function el() {
  return require("electron");
}
function sendToScenes(channel, payload) {
  let n = 0;
  try {
    let all = el().webContents.getAllWebContents();
    for (let i = 0; i < all.length; i++) {
      let w = all[i];
      try {
        !w.isDestroyed() && w.getType() === "webview" && (w.send(channel, payload), n++);
      } catch {
      }
    }
  } catch (e) {
    console.warn("[Hot Reload] Could not reach the scene views:", e);
  }
  return n;
}
async function loadConfig() {
  try {
    let v = await Editor.Profile.getConfig(PKG, "enabled");
    typeof v == "boolean" && (enabled = v);
  } catch {
    enabled = !0;
  }
}
var methods = {
  /** Broadcast by Cocos when the project's scripts were rebuilt. */
  onPackBuilt() {
    enabled && sendToScenes(CH_COMPILED);
  },
  getConfig() {
    return { enabled };
  },
  /** From the scene script: lines to print. */
  report(msg) {
    let lines = (msg && Array.isArray(msg.lines) ? msg.lines : []).map((l) => "[Hot Reload] " + String(l)), level = msg && (msg.level === "warn" || msg.level === "error") ? msg.level : "log";
    lines.forEach((l) => console[level](l));
  },
  async toggleEnabled() {
    enabled = !enabled;
    try {
      await Editor.Profile.setConfig(PKG, "enabled", enabled);
    } catch {
    }
    sendToScenes(CH_CONFIG, { enabled }), console.log("[Hot Reload] " + (enabled ? "On: saving a script while the game runs swaps the new code in." : "Off: Cocos handles script changes as usual."));
  },
  /** Stop and play again (Play-in-Editor). */
  async restartGame() {
    try {
      await Editor.Message.request("scene", "editor-preview-set-play", !1), await new Promise((r) => setTimeout(r, 300)), await Editor.Message.request("scene", "editor-preview-set-play", !0);
    } catch (e) {
      console.warn("[Hot Reload] Could not restart the game:", e);
    }
  },
  /** From the scene scripts: their state, while saveDiagnostics collects. */
  diagnostics(data) {
    collecting && collecting.push(data);
  },
  async saveDiagnostics() {
    collecting = [];
    let n = sendToScenes(CH_DIAGNOSE);
    await new Promise((r) => setTimeout(r, 1200));
    let out = { time: (/* @__PURE__ */ new Date()).toISOString(), enabled, sceneViews: n, processes: collecting };
    collecting = null;
    let file = (0, import_path.join)(__dirname, "..", "diagnostics.json");
    try {
      require("fs").writeFileSync(file, JSON.stringify(out, null, 2)), console.log("[Hot Reload] Diagnostics written to " + file);
    } catch (e) {
      console.error("[Hot Reload] Could not write diagnostics:", e);
    }
  },
  async openDocs() {
    try {
      await el().shell.openPath((0, import_path.join)(__dirname, "..", "README.md"));
    } catch (e) {
      console.error("[Hot Reload] Could not open the README:", e);
    }
  }
};
async function load() {
  await loadConfig(), sendToScenes(CH_CONFIG, { enabled });
}
function unload() {
  collecting = null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=main.js.map
