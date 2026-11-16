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
  onAssetMenu: () => onAssetMenu
});
module.exports = __toCommonJS(assets_menu_exports);

// source/shared/image/options.ts
var IMAGE_INPUT_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff"], AUDIO_INPUT_EXTS = [".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac", ".opus", ".weba", ".webm"];
function extOf(path) {
  let m = /\.[^./\\]+$/.exec(path || "");
  return m ? m[0].toLowerCase() : "";
}
function isImagePath(path) {
  return IMAGE_INPUT_EXTS.indexOf(extOf(path)) >= 0;
}
function isAudioPath(path) {
  return AUDIO_INPUT_EXTS.indexOf(extOf(path)) >= 0;
}

// source/assets-menu.ts
var PKG = "media-utils";
function nameOf(info) {
  return String(info && (info.file || info.url || info.name) || "");
}
function selectedUuids(clicked) {
  let list = [];
  try {
    list = (Editor.Selection.getSelected("asset") || []).slice();
  } catch {
    list = [];
  }
  return list.indexOf(clicked) < 0 && (list = [clicked]), list;
}
function onAssetMenu(assetInfo) {
  if (!assetInfo || assetInfo.isDirectory) return [];
  let name = nameOf(assetInfo);
  return isImagePath(name) ? [
    {
      label: "Open in Image Tools",
      click() {
        let uuids = selectedUuids(assetInfo.uuid);
        Editor.Message.request(PKG, "open-assets", "image", uuids).catch((e) => console.error("[Media Utils]", e));
      }
    }
  ] : isAudioPath(name) ? [
    {
      label: "Open in Audio Editor",
      click() {
        Editor.Message.request(PKG, "open-assets", "audio", [assetInfo.uuid]).catch((e) => console.error("[Media Utils]", e));
      }
    }
  ] : [];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onAssetMenu
});
//# sourceMappingURL=assets-menu.js.map
