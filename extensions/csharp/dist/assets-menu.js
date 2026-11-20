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

// source/assets-menu.ts
var assets_menu_exports = {};
__export(assets_menu_exports, {
  onAssetMenu: () => onAssetMenu,
  onCreateMenu: () => onCreateMenu
});
module.exports = __toCommonJS(assets_menu_exports);
var PKG = "csharp";
function folderOf(info) {
  return !info || !info.url ? "db://assets" : info.isDirectory ? info.url : info.url.replace(/\/[^/]*$/, "");
}
function create(folder, kind) {
  if (!/^db:\/\/assets(\/|$)/.test(folder)) {
    console.warn("[C#] C# scripts must be in db://assets.");
    return;
  }
  Editor.Message.request(PKG, "create-script", folder, kind).catch((e) => console.error("[C#]", e));
}
function onCreateMenu(assetInfo) {
  let folder = folderOf(assetInfo);
  if (!/^db:\/\/assets(\/|$)/.test(folder)) return [];
  let item = (label, kind, fullFileName) => ({
    label,
    click: () => create(folder, kind),
    nameFirst: { fullFileName, message: [PKG, "create-script-at", kind] }
  });
  return [item("C# Script", "component", "NewComponent.cs"), item("C# Class", "class", "NewClass.cs")];
}
function onAssetMenu(assetInfo) {
  return !assetInfo || !/\.cs$/i.test(assetInfo.url || "") ? [] : [
    { label: "Open C# Project", click: () => Editor.Message.request(PKG, "open-project").catch(() => {
    }) },
    { label: "Recompile C# Scripts", click: () => Editor.Message.request(PKG, "recompile-all").catch(() => {
    }) }
  ];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onAssetMenu,
  onCreateMenu
});
//# sourceMappingURL=assets-menu.js.map
