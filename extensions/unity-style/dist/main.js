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
var import_path = require("path");

// source/templates.ts
function classNameFromFile(fileName, fallback = "NewMonoBehaviour") {
  let name = fileName.replace(/\.(ts|cs)$/i, "").split(/[^A-Za-z0-9_]+/).filter((p) => p.length > 0).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return name || (name = fallback), /^[0-9]/.test(name) && (name = "_" + name), name;
}
function tsMonoBehaviour(className) {
  return [
    "import { Node } from 'cc';",
    "import { MonoBehaviour, Serializable, SerializeField, Debug } from 'db://unity-style/index';",
    "",
    "@Serializable",
    `export class ${className} extends MonoBehaviour {`,
    "    @SerializeField speed = 1;",
    "    @SerializeField(Node) target: Node | null = null;",
    "",
    "    Start() {",
    "    }",
    "",
    "    Update(dt: number) {",
    "    }",
    "}",
    ""
  ].join(`
`);
}
function csMonoBehaviour(className) {
  return [
    "using System.Collections;",
    "using cc;",
    "using static cc.Globals;",
    "using Ext.UnityStyle;",
    "",
    `public class ${className} : MonoBehaviour`,
    "{",
    "    [SerializeField] private double speed = 1;",
    "    [SerializeField] private Node target;",
    "",
    "    void Start()",
    "    {",
    "    }",
    "",
    "    void Update(double dt)",
    "    {",
    "    }",
    "}",
    ""
  ].join(`
`);
}
function templateFor(kind, className) {
  return kind === "cs" ? csMonoBehaviour(className) : tsMonoBehaviour(className);
}
function isScriptUrl(url, kind) {
  return /^db:\/\/assets\//.test(url) && (kind === "cs" ? /\.cs$/i : /\.ts$/i).test(url) && !/\.d\.ts$/i.test(url);
}

// source/main.ts
var TAG = "[Unity Style]";
async function createScriptFile(url, kind) {
  let name = classNameFromFile(url.split("/").pop() || "");
  return Editor.Message.request("asset-db", "create-asset", url, templateFor(kind, name));
}
var methods = {
  async openDocs() {
    try {
      let { shell } = require("electron");
      await shell.openPath((0, import_path.join)(__dirname, "..", "README.md"));
    } catch (e) {
      console.error(TAG + " Could not open the README:", e);
    }
  },
  /** Cocos' Assets panel: NewMonoBehaviour.ts/.cs in the folder, selected, then renamed there. */
  async createScript(folderUrl, kind = "ts") {
    let ext = kind === "cs" ? ".cs" : ".ts", url = await Editor.Message.request("asset-db", "generate-available-url", String(folderUrl || "db://assets").replace(/\/+$/, "") + "/NewMonoBehaviour" + ext), info = await createScriptFile(url, kind);
    return info && info.uuid && (Editor.Selection.clear("asset"), Editor.Selection.select("asset", [info.uuid]), setTimeout(() => {
      try {
        Editor.Message.send("assets", "rename", info.uuid);
      } catch {
      }
    }, 300)), info;
  },
  /** Project Browser: the file was named first, the class takes that name. */
  async createScriptAt(url, kind = "ts") {
    if (typeof url != "string" || !isScriptUrl(url, kind)) throw new Error("Expected a " + (kind === "cs" ? ".cs" : ".ts") + " file in db://assets: " + url);
    return createScriptFile(url, kind);
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
