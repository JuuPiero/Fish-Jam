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
var fs2 = __toESM(require("fs")), import_path = require("path");

// source/shared/binary.ts
var zlib = __toESM(require("zlib")), crcTable = null;
function crc32(buf, seed = 0) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c2 = n;
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 3988292384 ^ c2 >>> 1 : c2 >>> 1;
      crcTable[n] = c2 >>> 0;
    }
  }
  let c = (seed ^ 4294967295) >>> 0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function dosTime(d) {
  let year = Math.max(1980, d.getFullYear());
  return {
    time: d.getHours() << 11 | d.getMinutes() << 5 | Math.floor(d.getSeconds() / 2),
    date: year - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate()
  };
}
function zipWrite(entries, when = /* @__PURE__ */ new Date()) {
  let locals = [], centrals = [], offset = 0, t = dosTime(when);
  for (let i = 0; i < entries.length; i++) {
    let e = entries[i], name = Buffer.from(e.name.replace(/\\/g, "/"), "utf8"), raw = e.data || Buffer.alloc(0), isDir = /\/$/.test(e.name), method = 0, body = raw;
    if (!isDir && raw.length > 64) {
      let d = zlib.deflateRawSync(raw);
      d.length < raw.length && (method = 8, body = d);
    }
    let crc = crc32(raw), local = Buffer.alloc(30);
    local.writeUInt32LE(67324752, 0), local.writeUInt16LE(20, 4), local.writeUInt16LE(2048, 6), local.writeUInt16LE(method, 8), local.writeUInt16LE(t.time, 10), local.writeUInt16LE(t.date, 12), local.writeUInt32LE(crc, 14), local.writeUInt32LE(body.length, 18), local.writeUInt32LE(raw.length, 22), local.writeUInt16LE(name.length, 26), local.writeUInt16LE(0, 28);
    let central = Buffer.alloc(46);
    central.writeUInt32LE(33639248, 0), central.writeUInt16LE(20, 4), central.writeUInt16LE(20, 6), central.writeUInt16LE(2048, 8), central.writeUInt16LE(method, 10), central.writeUInt16LE(t.time, 12), central.writeUInt16LE(t.date, 14), central.writeUInt32LE(crc, 16), central.writeUInt32LE(body.length, 20), central.writeUInt32LE(raw.length, 24), central.writeUInt16LE(name.length, 28), central.writeUInt32LE(isDir ? 16 : 0, 38), central.writeUInt32LE(offset, 42), locals.push(local, name, body), centrals.push(central, name), offset += local.length + name.length + body.length;
  }
  let cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  return end.writeUInt32LE(101010256, 0), end.writeUInt16LE(entries.length, 8), end.writeUInt16LE(entries.length, 10), end.writeUInt32LE(cd.length, 12), end.writeUInt32LE(offset, 16), Buffer.concat(locals.concat([cd, end]));
}
function zipList(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (buf.readUInt32LE(i) === 101010256) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Not a zip file");
  let count = buf.readUInt16LE(eocd + 10), p = buf.readUInt32LE(eocd + 16), out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 33639248) throw new Error("Broken zip directory");
    let nlen = buf.readUInt16LE(p + 28), flags = buf.readUInt16LE(p + 8), nameBuf = buf.slice(p + 46, p + 46 + nlen);
    out.push((flags & 2048 ? nameBuf.toString("utf8") : nameBuf.toString("latin1")).replace(/\\/g, "/")), p += 46 + nlen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}
function zipRead(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (buf.readUInt32LE(i) === 101010256) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Not a zip file");
  let count = buf.readUInt16LE(eocd + 10), p = buf.readUInt32LE(eocd + 16), out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 33639248) throw new Error("Broken zip directory");
    let flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42), nameBuf = buf.slice(p + 46, p + 46 + nlen), name = (flags & 2048 || /[^\x00-\x7f]/.test(nameBuf.toString("latin1")) ? nameBuf.toString("utf8") : nameBuf.toString("latin1")).replace(/\\/g, "/");
    if (p += 46 + nlen + xlen + clen, flags & 1) throw new Error("Encrypted zip entries are not supported: " + name);
    if (buf.readUInt32LE(local) !== 67324752) throw new Error("Broken zip entry: " + name);
    let start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), body = buf.slice(start, start + csize), data;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) data = zlib.inflateRawSync(body);
    else throw new Error("Unsupported zip compression (" + method + "): " + name);
    out.push({ name, data });
  }
  return out;
}
function pngEncode(width, height, rgba) {
  let chunk = (type, data) => {
    let len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    let td = Buffer.concat([Buffer.from(type, "ascii"), data]), crc = Buffer.alloc(4);
    return crc.writeUInt32BE(crc32(td), 0), Buffer.concat([len, td, crc]);
  }, ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0), ihdr.writeUInt32BE(height, 4), ihdr[8] = 8, ihdr[9] = 6;
  let raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    raw[y * (width * 4 + 1)] = 0, Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
function dragIconPixels(kind, count, size = 32) {
  let px = new Uint8Array(size * size * 4), set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    let i = (y * size + x) * 4;
    px[i] = r, px[i + 1] = g, px[i + 2] = b, px[i + 3] = a;
  }, s = size / 32;
  if (kind === "package")
    for (let y = Math.round(8 * s); y < Math.round(28 * s); y++)
      for (let x = Math.round(4 * s); x < Math.round(28 * s); x++) {
        let edge = y === Math.round(8 * s) || y === Math.round(28 * s) - 1 || x === Math.round(4 * s) || x === Math.round(28 * s) - 1, lid = y < Math.round(13 * s), tape = Math.abs(x - size / 2) < 2 * s;
        edge ? set(x, y, 90, 62, 30) : tape ? set(x, y, 214, 190, 140) : lid ? set(x, y, 196, 148, 88) : set(x, y, 170, 122, 66);
      }
  else {
    let l = Math.round(7 * s), r = Math.round(25 * s), t = Math.round(4 * s), b = Math.round(28 * s), fold = Math.round(6 * s);
    for (let y = t; y < b; y++)
      for (let x = l; x < r; x++) {
        let cx = x - (r - fold), cy = y - t;
        if (cx >= 0 && cy < fold && cx > cy) continue;
        let edge = y === t || y === b - 1 || x === l || x === r - 1 || cx >= 0 && cy < fold && cx === cy, inFold = cx >= 0 && cy < fold && cx <= cy;
        edge ? set(x, y, 70, 70, 70) : inFold ? set(x, y, 200, 200, 200) : set(x, y, 236, 236, 236);
      }
    for (let k = 0; k < 4; k++) {
      let y = Math.round((13 + k * 4) * s);
      for (let x = Math.round(10 * s); x < Math.round(22 * s); x++) set(x, y, 150, 150, 150);
    }
  }
  if (count > 1) {
    for (let y = Math.round(24 * s); y < size; y++) for (let x = Math.round(18 * s); x < size; x++) set(x, y, 58, 121, 187);
    for (let k = 0; k < Math.min(4, count); k++) for (let y = Math.round(27 * s); y < Math.round(29 * s); y++) for (let x = Math.round((20 + k * 3) * s); x < Math.round((22 + k * 3) * s); x++) set(x, y, 255, 255, 255);
  }
  return px;
}

// source/os-clipboard.ts
var import_child_process = require("child_process");

// source/shared/package.ts
var MANIFEST_NAME = "asset-package.json", MANIFEST_FORMAT = "cocos-asset-package";
function safeRelPath(p) {
  let s = String(p || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!s || /^[a-zA-Z]:/.test(s) || s[0] === "/" || /[\u0000-\u001f]/.test(s)) return null;
  let parts = s.split("/");
  for (let i = 0; i < parts.length; i++) if (!parts[i] || parts[i] === "." || parts[i] === "..") return null;
  return parts.join("/");
}
function parentPath(p) {
  let i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "";
}
function baseName(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}
function urlToRel(url) {
  let m = /^db:\/\/assets(\/.*)?$/.exec(url || "");
  return m ? "assets" + (m[1] || "") : null;
}
function commonDir(assets) {
  let common = null;
  for (let i = 0; i < assets.length; i++) {
    let a = assets[i];
    if (a.container) continue;
    let dir = parentPath(a.path).split("/").filter((s) => !!s);
    if (!common) {
      common = dir;
      continue;
    }
    let k = 0;
    for (; k < common.length && k < dir.length && common[k] === dir[k]; ) k++;
    common = common.slice(0, k);
  }
  return common && common.length ? common.join("/") : "assets";
}
function targetPathFor(path2, mode) {
  return mode.kind === "original" ? path2 : path2 === mode.root || path2.indexOf(mode.root + "/") !== 0 ? null : mode.folder + path2.slice(mode.root.length);
}
function uniquePath(path2, taken, isDirectory = !1, max = 1e3) {
  if (!taken(path2)) return path2;
  let dir = parentPath(path2), name = baseName(path2), dot = isDirectory ? -1 : name.indexOf(".") > 0 ? name.indexOf(".") : -1, stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i < max; i++) {
    let p = (dir ? dir + "/" : "") + stem + " " + i + ext;
    if (!taken(p)) return p;
  }
  return (dir ? dir + "/" : "") + stem + " " + Date.now() + ext;
}
function isInside(file, dir) {
  let norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase(), f = norm(file), d = norm(dir);
  return !!d && (f === d || f.indexOf(d + "/") === 0);
}
function stampName(d) {
  let p = (n, w = 2) => String(n).padStart(w, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + "-" + p(d.getMilliseconds(), 3);
}
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", UUID_SRC = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
function isUuid(s) {
  return new RegExp("^" + UUID_SRC + "$", "i").test(String(s || ""));
}
function mainOf(uuid) {
  let i = String(uuid || "").indexOf("@");
  return i > 0 ? uuid.slice(0, i) : uuid;
}
function decompressUuid(s) {
  if (!s || s.length !== 22 && s.length !== 23) return "";
  let keep = s.length === 23 ? 5 : 2, hex = s.slice(0, keep);
  if (!/^[0-9a-f]+$/.test(hex)) return "";
  for (let i = keep; i < s.length; i += 2) {
    let a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]);
    if (a < 0 || b < 0) return "";
    hex += (a >> 2).toString(16) + ((a & 3) << 2 | b >> 4).toString(16) + (b & 15).toString(16);
  }
  return hex.length !== 32 ? "" : hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}
function extractUuids(text) {
  let out = [], add = (u) => {
    let m2 = mainOf(u).toLowerCase();
    m2 && out.indexOf(m2) < 0 && out.push(m2);
  }, re = new RegExp(UUID_SRC, "gi"), m;
  for (; m = re.exec(text || ""); ) add(m[0]);
  let tre = /"__type__"\s*:\s*"([0-9a-zA-Z+/]{22,23})"/g;
  for (; m = tre.exec(text || ""); ) {
    let u = decompressUuid(m[1]);
    u && add(u);
  }
  return out;
}
function remapUuids(text, map) {
  return Object.keys(map).length ? String(text).replace(new RegExp(UUID_SRC, "gi"), (u) => {
    let k = u.toLowerCase();
    return map[k] || u;
  }) : text;
}
function scriptImports(text) {
  let out = [], re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"\n]+)['"]/g, m;
  for (; m = re.exec(text || ""); ) out.indexOf(m[1]) < 0 && out.push(m[1]);
  return out;
}
function resolveImport(fromPath, spec, exists) {
  let parts = parentPath(fromPath).split("/").filter((s) => !!s), segs = spec.split("/");
  for (let i = 0; i < segs.length; i++)
    segs[i] === "." || !segs[i] || (segs[i] === ".." ? parts.pop() : parts.push(segs[i]));
  let base = parts.join("/"), tries = [base, base + ".ts", base + ".js", base + "/index.ts", base + "/index.js"];
  for (let i = 0; i < tries.length; i++) if (/\.(ts|js)$/.test(tries[i]) && exists(tries[i])) return tries[i];
  return null;
}
async function collectClosure(roots, depsOf, accept, max = 2e4) {
  let out = [], seen = {}, queue = [];
  for (let i = 0; i < roots.length; i++) {
    let u = mainOf(roots[i]);
    u && !seen[u] && (seen[u] = !0, queue.push({ uuid: u, dependency: !1 }));
  }
  for (; queue.length && out.length < max; ) {
    let cur = queue.shift();
    if (!await accept(cur.uuid)) continue;
    out.push(cur);
    let deps = [];
    try {
      deps = await depsOf(cur.uuid) || [];
    } catch {
      deps = [];
    }
    for (let i = 0; i < deps.length; i++) {
      let u = mainOf(deps[i]);
      u && !seen[u] && (seen[u] = !0, queue.push({ uuid: u, dependency: !0 }));
    }
  }
  return out;
}
function parseManifest(input) {
  let j = input;
  if (typeof input == "string")
    try {
      j = JSON.parse(input.replace(/^﻿/, ""));
    } catch {
      throw new Error(MANIFEST_NAME + " is not valid JSON");
    }
  if (!j || typeof j != "object" || j.format !== MANIFEST_FORMAT) throw new Error("Not an asset package (" + MANIFEST_NAME + ' has no "format": "' + MANIFEST_FORMAT + '")');
  if (typeof j.version != "number" || j.version > 1) throw new Error("This asset package needs a newer Project Browser (version " + j.version + ")");
  if (!Array.isArray(j.assets)) throw new Error(MANIFEST_NAME + " lists no assets");
  let assets = [], seen = {};
  for (let i = 0; i < j.assets.length; i++) {
    let a = j.assets[i];
    if (!a || typeof a.path != "string") continue;
    let path2 = safeRelPath(a.path);
    if (!path2 || path2 !== "assets" && path2.indexOf("assets/") !== 0) throw new Error("Unsafe path in the package: " + a.path);
    if (path2 === "assets" || seen[path2.toLowerCase()]) continue;
    seen[path2.toLowerCase()] = !0;
    let uuid = typeof a.uuid == "string" && isUuid(a.uuid) ? a.uuid.toLowerCase() : "", e = { path: path2, uuid, hasMeta: a.hasMeta !== !1 && !!uuid };
    typeof a.type == "string" && (e.type = a.type), typeof a.importer == "string" && (e.importer = a.importer), a.isDirectory && (e.isDirectory = !0), a.dependency && (e.dependency = !0), a.container && (e.container = !0), typeof a.hash == "string" && (e.hash = a.hash), typeof a.size == "number" && (e.size = a.size), assets.push(e);
  }
  let src = j.source && typeof j.source == "object" ? j.source : {};
  return {
    format: MANIFEST_FORMAT,
    version: j.version,
    createdBy: String(j.createdBy || ""),
    createdAt: String(j.createdAt || ""),
    source: { project: String(src.project || "Unknown project"), path: src.path ? String(src.path) : void 0, creator: src.creator ? String(src.creator) : void 0 },
    roots: Array.isArray(j.roots) ? j.roots.filter((u) => typeof u == "string") : [],
    assets: sortByPath(assets)
  };
}
function buildManifest(source, roots, assets, when = /* @__PURE__ */ new Date()) {
  return {
    format: MANIFEST_FORMAT,
    version: 1,
    createdBy: "project-browser",
    createdAt: when.toISOString(),
    source,
    roots: roots.slice(),
    assets: sortByPath(assets.slice())
  };
}
function sortByPath(list) {
  return list.sort((a, b) => {
    let x = a.path.split("/"), y = b.path.split("/");
    for (let i = 0; i < Math.min(x.length, y.length); i++)
      if (x[i] !== y[i])
        return x[i].localeCompare(y[i], void 0, { numeric: !0, sensitivity: "base" }) || (x[i] < y[i] ? -1 : 1);
    return x.length - y.length;
  });
}
function manifestFromFiles(files, project) {
  let list = files.filter((f) => !/\.meta$/i.test(f.path) && !!safeRelPath(f.path) && baseName(f.path) !== MANIFEST_NAME), allUnderAssets = list.length > 0 && list.every((f) => f.path === "assets" || f.path.indexOf("assets/") === 0), assets = [];
  for (let i = 0; i < list.length; i++) {
    let f = list[i], path2 = allUnderAssets ? f.path : "assets/" + f.path;
    if (path2 === "assets") continue;
    let meta = null;
    try {
      meta = f.meta ? JSON.parse(f.meta) : null;
    } catch {
      meta = null;
    }
    let uuid = meta && typeof meta.uuid == "string" && isUuid(meta.uuid) ? meta.uuid.toLowerCase() : "", a = { path: path2, uuid, hasMeta: !!uuid };
    meta && typeof meta.importer == "string" && (a.importer = meta.importer), f.isDirectory && (a.isDirectory = !0), f.hash && (a.hash = f.hash), typeof f.size == "number" && (a.size = f.size), assets.push(a);
  }
  return buildManifest({ project }, [], assets);
}
function classifyEntry(a, target, byUuid, atPath) {
  let same = (x, y) => x.toLowerCase() === y.toLowerCase();
  return a.isDirectory ? atPath ? "folder-exists" : "folder-new" : a.uuid && byUuid && !byUuid.isDirectory ? same(byUuid.path, target) ? a.hash && byUuid.hash && a.hash === byUuid.hash ? "identical" : "changed" : "moved" : atPath ? "taken" : "new";
}
function canRemapUuid(a) {
  if (a.isDirectory || !a.uuid) return !1;
  let imp = String(a.importer || "").toLowerCase();
  return imp === "typescript" || imp === "javascript" ? !1 : !/\.(ts|js|mjs|cjs)$/i.test(a.path);
}
function actionsFor(status, a) {
  switch (status) {
    case "new":
      return ["import", "skip"];
    case "identical":
      return ["skip"];
    case "changed":
      return ["overwrite", "skip"];
    case "moved":
      return canRemapUuid(a) ? ["skip", "overwrite", "copy"] : ["skip", "overwrite"];
    case "taken":
      return a.uuid ? ["rename", "overwrite", "skip"] : ["rename", "skip"];
    default:
      return ["import"];
  }
}
function defaultAction(status, a) {
  return actionsFor(status, a)[0];
}
var CLIP_HEAD = "Cocos asset package: ";
function encodeClipboardText(p) {
  let lines = [CLIP_HEAD + p.path, "From " + p.project + ", " + p.paths.length + " asset" + (p.paths.length === 1 ? "" : "s") + ":"], shown = p.paths.slice(0, 50);
  for (let i = 0; i < shown.length; i++) lines.push("  " + shown[i]);
  return p.paths.length > shown.length && lines.push("  ..."), lines.join(`
`);
}
function decodeClipboardText(text) {
  let first = String(text || "").replace(/^﻿/, "").split(/\r?\n/)[0];
  return first.indexOf(CLIP_HEAD) !== 0 ? "" : first.slice(CLIP_HEAD.length).trim();
}
function encodeFileNameW(path2) {
  return Buffer.from(String(path2) + "\0", "utf16le");
}
function decodeFileNameW(buf) {
  if (!buf || buf.length < 2) return "";
  let s = buf.toString("utf16le", 0, buf.length - buf.length % 2), nul = s.indexOf("\0");
  return (nul >= 0 ? s.slice(0, nul) : s).trim();
}

// source/os-clipboard.ts
var LOAD_FORMS = "$ProgressPreference = 'SilentlyContinue'; [void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')", WRITE_PS = [
  LOAD_FORMS,
  "$files = [System.Collections.Specialized.StringCollection]::new()",
  "foreach ($p in ($env:PB_CLIP_FILES -split [char]10)) { if ($p) { [void]$files.Add($p) } }",
  "$d = [System.Windows.Forms.DataObject]::new()",
  "if ($files.Count) { $d.SetFileDropList($files) }",
  "if ($env:PB_CLIP_TEXT) { $d.SetText($env:PB_CLIP_TEXT, [System.Windows.Forms.TextDataFormat]::UnicodeText) }",
  "[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)"
].join(`
`), READ_FILES_PS = [
  LOAD_FORMS,
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "foreach ($f in [System.Windows.Forms.Clipboard]::GetFileDropList()) { [Console]::Out.WriteLine($f) }"
].join(`
`);
function powershell(script, env) {
  return new Promise((resolve, reject) => {
    let enc = Buffer.from(script, "utf16le").toString("base64");
    (0, import_child_process.execFile)(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
      { env: Object.assign({}, process.env, env), timeout: 15e3, windowsHide: !0, encoding: "utf8" },
      (err, stdout) => err ? reject(err) : resolve(String(stdout || ""))
    );
  });
}
function electronClipboard() {
  return require("electron").clipboard;
}
async function writeClipboard(files, text) {
  let cb = electronClipboard();
  if (process.platform === "win32") {
    try {
      if (await powershell(WRITE_PS, { PB_CLIP_FILES: files.join(`
`), PB_CLIP_TEXT: text }), decodeClipboardText(cb.readText()) === decodeClipboardText(text)) return "files+text";
    } catch (e) {
      console.warn("[Project Browser] Could not put the files on the clipboard with PowerShell:", e);
    }
    if (files.length)
      try {
        return cb.writeBuffer("FileNameW", encodeFileNameW(files[0])), "filename";
      } catch {
      }
  }
  return cb.writeText(text), "text";
}
async function readClipboard() {
  let cb = electronClipboard(), text = "";
  try {
    text = cb.readText() || "";
  } catch {
    text = "";
  }
  let packagePath = decodeClipboardText(text), files = [];
  if (!packagePath && process.platform === "win32") {
    let one = "";
    try {
      one = decodeFileNameW(cb.readBuffer("FileNameW"));
    } catch {
      one = "";
    }
    if (one) {
      try {
        files = (await powershell(READ_FILES_PS, {})).split(/\r?\n/).map((s) => s.trim()).filter((s) => !!s);
      } catch {
        files = [];
      }
      files.length || (files = [one]);
    }
  }
  return { text, packagePath, files };
}

// source/shared/package-io.ts
var crypto = __toESM(require("crypto")), fs = __toESM(require("fs")), path = __toESM(require("path"));
function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}
function fileHash(file) {
  try {
    return sha1(fs.readFileSync(file));
  } catch {
    return "";
  }
}
function isTextBuffer(buf) {
  if (buf.length > 32 * 1024 * 1024) return !1;
  let n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return !1;
  return !0;
}
function readMetaUuid(file) {
  try {
    let j = JSON.parse(fs.readFileSync(file + ".meta", "utf8"));
    return j && typeof j.uuid == "string" && isUuid(j.uuid) ? j.uuid.toLowerCase() : "";
  } catch {
    return "";
  }
}
function relOf(projectPath, file) {
  return path.relative(projectPath, file).split(path.sep).join("/");
}
function walkAssets(dir, out) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  names.sort();
  for (let i = 0; i < names.length; i++) {
    let n = names[i];
    if (/\.meta$/i.test(n)) continue;
    let f = path.join(dir, n);
    if (fs.existsSync(f + ".meta")) {
      out.push(f);
      try {
        fs.statSync(f).isDirectory() && walkAssets(f, out);
      } catch {
      }
    }
  }
}
async function dependenciesOf(db, projectPath, info) {
  let out = [], add = (u) => {
    let m = mainOf(u);
    m && m !== info.uuid && out.indexOf(m) < 0 && out.push(m);
  };
  if (db.deps)
    try {
      let d = await db.deps(info.uuid);
      Array.isArray(d) && d.forEach(add);
    } catch {
    }
  if (info.isDirectory || !info.file) return out;
  let buf = null;
  try {
    buf = fs.readFileSync(info.file);
  } catch {
    buf = null;
  }
  if (buf && isTextBuffer(buf)) {
    let text = buf.toString("utf8");
    if (extractUuids(text).forEach(add), /\.(ts|js)$/i.test(info.file)) {
      let rel = relOf(projectPath, info.file), specs = scriptImports(text);
      for (let i = 0; i < specs.length; i++) {
        let target = resolveImport(rel, specs[i], (p) => fs.existsSync(path.join(projectPath, p)));
        if (target) {
          let u = readMetaUuid(path.join(projectPath, target));
          u && add(u);
        }
      }
    }
  }
  try {
    extractUuids(fs.readFileSync(info.file + ".meta", "utf8")).forEach(add);
  } catch {
  }
  return out;
}
async function collectAssets(db, projectPath, uuids, opts) {
  let infos = {}, getInfo = async (u) => {
    if (infos[u]) return infos[u];
    let i = null;
    try {
      i = await db.info(u);
    } catch {
      i = null;
    }
    return i && i.uuid && (infos[u] = i), i;
  }, roots = [], pushRoot = (u) => {
    u && roots.indexOf(u) < 0 && roots.push(u);
  };
  for (let i = 0; i < uuids.length; i++) {
    let u = mainOf(uuids[i]), info = await getInfo(u);
    if (info && (pushRoot(info.uuid), info.isDirectory && opts.expandFolders !== !1 && info.file)) {
      let files = [];
      walkAssets(info.file, files);
      for (let k = 0; k < files.length; k++) {
        let id = readMetaUuid(files[k]);
        id && pushRoot(id);
      }
    }
  }
  let closure = await collectClosure(roots, async (u) => {
    if (!opts.deps) return [];
    let i = await getInfo(u);
    return i ? dependenciesOf(db, projectPath, i) : [];
  }, async (u) => {
    let i = await getInfo(u);
    return !!i && !i.readonly && urlToRel(i.url) !== null && urlToRel(i.url) !== "assets" && !!i.file && fs.existsSync(i.file);
  }), out = [], byRel = {};
  for (let i = 0; i < closure.length; i++) {
    let info = infos[closure[i].uuid], rel = urlToRel(info.url);
    byRel[rel.toLowerCase()] = !0, out.push({ uuid: info.uuid, rel, file: info.file, type: info.type, importer: info.importer, isDirectory: !!info.isDirectory, dependency: closure[i].dependency });
  }
  let extra = [];
  for (let i = 0; i < out.length; i++) {
    let dir = parentPath(out[i].rel);
    for (; dir && dir !== "assets" && !byRel[dir.toLowerCase()]; ) {
      byRel[dir.toLowerCase()] = !0;
      let abs = path.join(projectPath, dir);
      extra.push({ uuid: readMetaUuid(abs), rel: dir, file: abs, isDirectory: !0, dependency: !1, container: !0, importer: "directory" }), dir = parentPath(dir);
    }
  }
  return out.concat(extra);
}
function writePackage(projectPath, list, destDir, source, roots) {
  fs.mkdirSync(destDir, { recursive: !0 });
  let assets = [];
  for (let i = 0; i < list.length; i++) {
    let a = list[i], out = path.join(destDir, ...a.rel.split("/"));
    fs.mkdirSync(a.isDirectory ? out : path.dirname(out), { recursive: !0 });
    let e = { path: a.rel, uuid: a.uuid, isDirectory: a.isDirectory || void 0, hasMeta: !1 };
    if (a.type && (e.type = a.type), a.importer && (e.importer = a.importer), a.dependency && (e.dependency = !0), a.container && (e.container = !0), !a.isDirectory) {
      let buf = fs.readFileSync(a.file);
      fs.writeFileSync(out, buf), e.hash = sha1(buf), e.size = buf.length;
    }
    fs.existsSync(a.file + ".meta") && (fs.copyFileSync(a.file + ".meta", out + ".meta"), e.hasMeta = !0), assets.push(e);
  }
  let manifest = buildManifest(source, roots, assets);
  return fs.writeFileSync(path.join(destDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2)), manifest;
}
function zipFolder(dir) {
  let entries = [], walk = (d, prefix) => {
    let names = fs.readdirSync(d).sort();
    for (let i = 0; i < names.length; i++) {
      let f = path.join(d, names[i]), name = prefix + names[i];
      fs.statSync(f).isDirectory() ? (entries.push({ name: name + "/", data: Buffer.alloc(0) }), walk(f, name + "/")) : entries.push({ name, data: fs.readFileSync(f) });
    }
  };
  return walk(dir, ""), zipWrite(entries);
}
function hasManifest(dir) {
  return fs.existsSync(path.join(dir, MANIFEST_NAME));
}
function probePackage(p) {
  try {
    if (fs.statSync(p).isDirectory()) return hasManifest(p);
    if (path.basename(p).toLowerCase() === MANIFEST_NAME) return !0;
    if (/\.zip$/i.test(p)) return zipList(fs.readFileSync(p)).some((n) => n === MANIFEST_NAME || /^[^/]+\/asset-package\.json$/.test(n));
  } catch {
  }
  return !1;
}
function unzipTo(buf, dir) {
  let entries = zipRead(buf);
  for (let i = 0; i < entries.length; i++) {
    let isDir = /\/$/.test(entries[i].name), rel = safeRelPath(entries[i].name);
    if (!rel || /(^|\/)__MACOSX(\/|$)/.test(rel)) continue;
    let out = path.join(dir, ...rel.split("/"));
    isDir ? fs.mkdirSync(out, { recursive: !0 }) : (fs.mkdirSync(path.dirname(out), { recursive: !0 }), fs.writeFileSync(out, entries[i].data));
  }
}
function looseFiles(dir) {
  let out = [], walk = (d, prefix) => {
    let names = fs.readdirSync(d).sort();
    for (let i = 0; i < names.length; i++) {
      if (/\.meta$/i.test(names[i])) continue;
      let f = path.join(d, names[i]), rel = prefix + names[i], isDir = fs.statSync(f).isDirectory(), meta = null;
      try {
        meta = fs.readFileSync(f + ".meta", "utf8");
      } catch {
        meta = null;
      }
      let lf = { path: rel, isDirectory: isDir, meta };
      if (!isDir) {
        let buf = fs.readFileSync(f);
        lf.hash = sha1(buf), lf.size = buf.length;
      }
      out.push(lf), isDir && walk(f, rel + "/");
    }
  };
  return walk(dir, ""), out;
}
function openPackage(p, workDir) {
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    throw new Error("Not found: " + p);
  }
  let dir = p;
  if (!st.isDirectory())
    if (path.basename(p).toLowerCase() === MANIFEST_NAME) dir = path.dirname(p);
    else if (/\.zip$/i.test(p)) {
      if (dir = path.join(workDir, stampName(/* @__PURE__ */ new Date())), unzipTo(fs.readFileSync(p), dir), !hasManifest(dir)) {
        let tops = fs.readdirSync(dir).filter((n) => !/^__MACOSX$/.test(n));
        tops.length === 1 && fs.statSync(path.join(dir, tops[0])).isDirectory() && hasManifest(path.join(dir, tops[0])) && (dir = path.join(dir, tops[0]));
      }
    } else throw new Error("Not an asset package: " + p);
  if (hasManifest(dir)) {
    let manifest = parseManifest(fs.readFileSync(path.join(dir, MANIFEST_NAME), "utf8"));
    return { dir, manifest, kind: "ours", source: p };
  }
  let files = looseFiles(dir);
  if (!files.some((f) => !!f.meta)) throw new Error("No asset package here: no " + MANIFEST_NAME + " and no .meta files in " + p);
  return { dir, manifest: manifestFromFiles(files, path.basename(p).replace(/\.zip$/i, "")), kind: "loose", source: p };
}
function packageFile(pkg, a) {
  let direct = path.join(pkg.dir, ...a.path.split("/"));
  return pkg.kind === "ours" || fs.existsSync(direct) ? direct : path.join(pkg.dir, ...a.path.split("/").slice(1));
}
async function existingByUuid(db, uuid) {
  if (!uuid) return null;
  let info = null;
  try {
    info = await db.info(uuid);
  } catch {
    info = null;
  }
  return !info || !info.uuid || mainOf(info.uuid) !== uuid ? null : { path: urlToRel(info.url) || info.url, uuid, isDirectory: !!info.isDirectory, hash: info.isDirectory || !info.file ? "" : fileHash(info.file) };
}
function existingAtPath(projectPath, rel) {
  let abs = path.join(projectPath, ...rel.split("/")), st;
  try {
    st = fs.statSync(abs);
  } catch {
    return null;
  }
  return { path: rel, uuid: readMetaUuid(abs), isDirectory: st.isDirectory() };
}
async function classifyPackage(pkg, projectPath, db, mode) {
  let rows = [], targets = {};
  for (let i = 0; i < pkg.manifest.assets.length; i++) {
    let a = pkg.manifest.assets[i], target = targetPathFor(a.path, mode), byUuid = target ? await existingByUuid(db, a.uuid) : null, atPath = target ? existingAtPath(projectPath, target) : null, status = classifyEntry(a, target || a.path, byUuid, atPath), row = {
      path: a.path,
      target,
      isDirectory: !!a.isDirectory,
      status,
      action: defaultAction(status, a),
      actions: actionsFor(status, a),
      uuid: a.uuid,
      hasMeta: !!a.hasMeta
    };
    status === "identical" && (row.actions = ["skip", "overwrite"]), byUuid && (status === "moved" || status === "changed") && (row.existingPath = byUuid.path), status === "moved" && byUuid && byUuid.path.indexOf("assets/") !== 0 && (row.actions = row.actions.filter((x) => x !== "overwrite")), a.type && (row.type = a.type), a.importer && (row.importer = a.importer), a.dependency && (row.dependency = !0), a.container && (row.container = !0), rows.push(row), target && (targets[target.toLowerCase()] = !0);
  }
  let extra = [];
  for (let i = 0; i < rows.length; i++) {
    let dir = rows[i].target ? parentPath(rows[i].target) : "";
    for (; dir && dir !== "assets" && !targets[dir.toLowerCase()]; ) {
      targets[dir.toLowerCase()] = !0;
      let at = existingAtPath(projectPath, dir);
      extra.push({ path: "#" + dir, target: dir, isDirectory: !0, status: at ? "folder-exists" : "folder-new", action: "import", actions: ["import"], uuid: "", hasMeta: !1, virtual: !0 }), dir = parentPath(dir);
    }
  }
  return rows.concat(extra);
}
function copyIntoProject(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: !0 });
  try {
    fs.existsSync(to) && fs.rmSync(to, { force: !0 }), fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
  }
}
async function importPackage(pkg, projectPath, db, mode, decisions, stagingRoot, newUuid = () => crypto.randomUUID()) {
  let rows = await classifyPackage(pkg, projectPath, db, mode), result = { written: [], skipped: 0, errors: [], refresh: [], overwritten: [], remapped: {} }, byPath = {};
  pkg.manifest.assets.forEach((a) => byPath[a.path] = a);
  let plan = [], planned = {}, taken = (rel) => !!planned[rel.toLowerCase()] || !!existingAtPath(projectPath, rel), files = rows.filter((r) => !r.isDirectory && r.target);
  for (let i = 0; i < files.length; i++) {
    let r = files[i], want = decisions[r.path], action = want && r.actions.indexOf(want) >= 0 ? want : r.action;
    if (action === "skip") {
      result.skipped++;
      continue;
    }
    let dest = r.target;
    action === "overwrite" && r.status === "moved" && r.existingPath && (dest = r.existingPath), (action === "rename" || action === "copy" && taken(dest)) && (dest = uniquePath(dest, taken)), action === "copy" && (result.remapped[r.uuid] = newUuid()), planned[dest.toLowerCase()] = !0, plan.push({ row: r, action, dest, keepMeta: r.hasMeta }), action === "overwrite" && result.overwritten.push(dest);
  }
  let folders = rows.filter((r) => r.isDirectory && r.target);
  for (let i = 0; i < folders.length; i++) {
    let r = folders[i], t = r.target.toLowerCase(), holds = plan.some((p) => p.dest.toLowerCase().indexOf(t + "/") === 0), empty = !r.virtual && !r.container && decisions[r.path] !== "skip";
    if (!holds && !empty || r.status === "folder-exists") continue;
    let byUuid = r.uuid ? await existingByUuid(db, r.uuid) : null;
    plan.push({ row: r, action: "import", dest: r.target, keepMeta: r.hasMeta && !byUuid });
  }
  if (!plan.length) return result;
  let stage = path.join(stagingRoot, stampName(/* @__PURE__ */ new Date())), remap = result.remapped, fixText = (buf) => Object.keys(remap).length && isTextBuffer(buf) ? Buffer.from(remapUuids(buf.toString("utf8"), remap), "utf8") : buf;
  try {
    for (let i = 0; i < plan.length; i++) {
      let p = plan[i], out = path.join(stage, ...p.dest.split("/")), a = byPath[p.row.path], src = a ? packageFile(pkg, a) : "";
      p.row.isDirectory ? fs.mkdirSync(out, { recursive: !0 }) : (fs.mkdirSync(path.dirname(out), { recursive: !0 }), fs.writeFileSync(out, fixText(fs.readFileSync(src)))), p.keepMeta && src && fs.existsSync(src + ".meta") && fs.writeFileSync(out + ".meta", fixText(fs.readFileSync(src + ".meta")));
    }
    plan.sort((x, y) => x.row.isDirectory === y.row.isDirectory ? x.dest.length - y.dest.length : x.row.isDirectory ? -1 : 1);
    for (let i = 0; i < plan.length; i++) {
      let p = plan[i], from = path.join(stage, ...p.dest.split("/")), to = path.join(projectPath, ...p.dest.split("/"));
      try {
        p.row.isDirectory ? fs.mkdirSync(to, { recursive: !0 }) : copyIntoProject(from, to), fs.existsSync(from + ".meta") && copyIntoProject(from + ".meta", to + ".meta"), result.written.push(p.dest);
      } catch (e) {
        result.errors.push(p.dest + ": " + String(e.message || e));
      }
    }
  } finally {
    try {
      fs.rmSync(stage, { recursive: !0, force: !0 });
    } catch {
    }
  }
  return result.refresh = refreshUrls(result.written, (rel) => rows.some((r) => r.isDirectory && r.target === rel && r.status === "folder-new")), result;
}
function refreshUrls(written, isNewFolder) {
  let dirs = [];
  for (let i = 0; i < written.length; i++) {
    let dir = parentPath(written[i]) || "assets";
    for (; dir && dir !== "assets" && isNewFolder(dir); ) dir = parentPath(dir) || "assets";
    dirs.indexOf(dir) < 0 && dirs.push(dir);
  }
  return dirs.filter((d) => !dirs.some((o) => o !== d && d.indexOf(o + "/") === 0)).map((d) => "db://" + d);
}

// source/main.ts
var PKG = "project-browser", OS_DRAG_CHANNEL = "project-browser:start-os-drag";
function cacheDir() {
  let dir = (0, import_path.join)(Editor.Project.path, "temp", PKG, "thumbs");
  return fs2.mkdirSync(dir, { recursive: !0 }), dir;
}
var index = null;
function indexFile() {
  return (0, import_path.join)(cacheDir(), "index.json");
}
function loadIndex() {
  if (index) return index;
  try {
    index = JSON.parse(fs2.readFileSync(indexFile(), "utf8")) || {};
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
      fs2.writeFileSync(indexFile(), JSON.stringify(index || {}));
    } catch {
    }
  }, 1e3));
}
function safeId(uuid) {
  return uuid.replace(/[^0-9a-zA-Z@_-]/g, "_").replace(/@/g, "_");
}
function mtimeOf(file) {
  try {
    return fs2.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}
function tempDir(...parts) {
  return (0, import_path.join)(Editor.Project.path, "temp", PKG, ...parts);
}
var assetDb = {
  async info(key) {
    try {
      return await Editor.Message.request("asset-db", "query-asset-info", key) || null;
    } catch {
      return null;
    }
  },
  async deps(uuid) {
    try {
      let r = await Editor.Message.request("asset-db", "query-asset-dependencies", uuid, "all");
      return Array.isArray(r) ? r : null;
    } catch {
      return null;
    }
  }
};
function projectSource() {
  let name = "";
  try {
    name = Editor.Project.name;
  } catch {
    name = "";
  }
  let creator = "";
  try {
    creator = Editor.App.version;
  } catch {
    creator = "";
  }
  return { project: name || Editor.Project.path.split(/[\\/]/).pop() || "Project", path: Editor.Project.path, creator };
}
function cleanTemp(keep) {
  let now = Date.now();
  ["packages", "incoming", "staging", "export"].forEach((sub) => {
    let dir = tempDir(sub), names = [];
    try {
      names = fs2.readdirSync(dir);
    } catch {
      return;
    }
    for (let i = 0; i < names.length; i++) {
      let p = (0, import_path.join)(dir, names[i]);
      if (p !== keep)
        try {
          now - fs2.statSync(p).mtimeMs > 24 * 3600 * 1e3 && fs2.rmSync(p, { recursive: !0, force: !0 });
        } catch {
        }
    }
  });
}
async function buildTempPackage(uuids) {
  let list = await collectAssets(assetDb, Editor.Project.path, uuids, { deps: !0 });
  if (!list.some((a) => !a.container)) throw new Error("Nothing to pack: only assets under Assets can go into a package.");
  let dir = tempDir("packages", stampName(/* @__PURE__ */ new Date())), manifest = writePackage(Editor.Project.path, list, dir, projectSource(), uuids.map(mainOf));
  return cleanTemp(dir), { dir, manifest };
}
var prepared = null;
function packageFor(uuids) {
  let key = uuids.slice().sort().join(",");
  if (prepared && prepared.key === key) {
    let p = prepared.promise;
    return prepared = null, p;
  }
  return buildTempPackage(uuids);
}
var opened = {}, openSeq = 0;
function modeFor(pkg, folderUrl) {
  let folder = folderUrl ? urlToRel(folderUrl) : null;
  return folder ? { kind: "folder", folder, root: commonDir(pkg.manifest.assets) } : { kind: "original" };
}
function dragIcon(mode, count, thumbUuid) {
  let { nativeImage } = require("electron");
  if (thumbUuid && count === 1 && mode === "files")
    try {
      let f = (0, import_path.join)(cacheDir(), safeId(thumbUuid) + ".png");
      if (fs2.existsSync(f)) {
        let img = nativeImage.createFromPath(f);
        if (!img.isEmpty()) {
          let s = img.getSize();
          return s.width >= s.height ? img.resize({ width: 32 }) : img.resize({ height: 32 });
        }
      }
    } catch {
    }
  return nativeImage.createFromBuffer(pngEncode(32, 32, dragIconPixels(mode === "package" ? "package" : "files", count)));
}
function dragSource(sender) {
  if (sender && typeof sender.startDrag == "function") return sender;
  let { webContents, BrowserWindow } = require("electron");
  try {
    let wc = webContents.getFocusedWebContents();
    if (wc) return wc;
  } catch {
  }
  let win = BrowserWindow.getFocusedWindow();
  return win ? win.webContents : null;
}
var ipcListener = null, pendingMenu = "", methods = {
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
      return "data:image/png;base64," + fs2.readFileSync((0, import_path.join)(cacheDir(), safeId(uuid) + ".png")).toString("base64");
    } catch {
      return null;
    }
  },
  /** Stores a rendered thumbnail (PNG data URL). */
  thumbPut(uuid, dataUrl) {
    let m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || "");
    if (!m) return !1;
    try {
      return fs2.writeFileSync((0, import_path.join)(cacheDir(), safeId(uuid) + ".png"), Buffer.from(m[1], "base64")), loadIndex()[uuid] = Date.now(), saveIndex(), !0;
    } catch {
      return !1;
    }
  },
  /** Forgets every cached thumbnail. */
  thumbClear() {
    try {
      fs2.rmSync(cacheDir(), { recursive: !0, force: !0 });
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
  },
  // -------------------------------------------------------------- drag out to the OS
  /** Alt+Shift pressed on an item: start building its package, so the drag starts sooner. */
  prepareOsDrag(uuids) {
    if (!Array.isArray(uuids) || !uuids.length) return;
    let key = uuids.slice().sort().join(",");
    if (prepared && prepared.key === key) return;
    let promise = buildTempPackage(uuids);
    promise.catch(() => {
    }), prepared = { key, promise };
  },
  /**
   * Starts a native file drag (Explorer, a browser upload, chat apps, another
   * Cocos project). Called over ipcRenderer (`sender` is the panel's
   * webContents) or as an editor message (then the focused webContents).
   */
  async startOsDrag(req, sender) {
    try {
      let files = [];
      req && req.mode === "package" ? files = [(await packageFor(req.uuids || [])).dir] : files = (req && req.files || []).filter((f) => typeof f == "string" && fs2.existsSync(f));
      let wc = dragSource(sender);
      return !files.length || !wc ? !1 : (wc.startDrag({ file: files[0], files, icon: dragIcon(req.mode, req.mode === "package" ? 1 : files.length, req.thumbUuid) }), !0);
    } catch (e) {
      return console.warn("[Project Browser] Could not start the drag:", e), !1;
    }
  },
  // -------------------------------------------------------------- clipboard
  /** Ctrl+C: a package of the assets (and their dependencies) on the system clipboard. */
  async copyPackage(uuids) {
    try {
      let pkg = await buildTempPackage(uuids || []), paths = pkg.manifest.assets.filter((a) => !a.container).map((a) => a.path), how = await writeClipboard([pkg.dir], encodeClipboardText({ path: pkg.dir, project: pkg.manifest.source.project, paths }));
      return { ok: !0, dir: pkg.dir, count: paths.length, how };
    } catch (e) {
      return { ok: !1, error: String(e.message || e) };
    }
  },
  /** Ctrl+V: a package (ours, or a folder / zip copied in Explorer), or plain files to import. */
  async readClipboard() {
    let c = await readClipboard();
    if (c.packagePath && probePackage(c.packagePath)) return { kind: "package", path: c.packagePath };
    let pkgs = c.files.filter((f) => probePackage(f));
    return pkgs.length ? { kind: "package", path: pkgs[0] } : c.files.length ? { kind: "files", files: c.files } : { kind: "none" };
  },
  // -------------------------------------------------------------- opening and importing packages
  /** Which of these paths are asset packages (folders or zips with asset-package.json). */
  probePaths(paths) {
    return (paths || []).filter((p) => typeof p == "string" && probePackage(p));
  },
  /** Is a path inside this project's assets folder (an Alt drag dropped back on itself)? */
  insideProject(paths) {
    let assets = (0, import_path.join)(Editor.Project.path, "assets");
    return (paths || []).map((p) => isInside(String(p || ""), assets));
  },
  /** Opens a package for the import dialog. */
  openPackage(p) {
    try {
      let pkg = openPackage(p, tempDir("incoming")), id = "pkg" + ++openSeq;
      opened[id] = pkg;
      let src = pkg.manifest.source;
      return {
        ok: !0,
        id,
        kind: pkg.kind,
        project: src.project,
        sourcePath: src.path || "",
        creator: src.creator || "",
        createdAt: pkg.manifest.createdAt,
        fromThisProject: !!src.path && isInside(src.path, Editor.Project.path) && isInside(Editor.Project.path, src.path),
        // a package this project just built (an Alt+Shift drag dropped back on itself)
        ownTemp: isInside(p, tempDir("packages")),
        roots: pkg.manifest.roots.slice(),
        count: pkg.manifest.assets.filter((a) => !a.isDirectory).length,
        root: commonDir(pkg.manifest.assets),
        path: p
      };
    } catch (e) {
      return { ok: !1, error: String(e.message || e) };
    }
  },
  /** Rows of the import dialog for a target (null: the original paths). */
  async classifyPackage(id, folderUrl) {
    let pkg = opened[id];
    if (!pkg) return { ok: !1, error: "The package was closed." };
    let rows = await classifyPackage(pkg, Editor.Project.path, assetDb, modeFor(pkg, folderUrl));
    return { ok: !0, rows: JSON.parse(JSON.stringify(rows)) };
  },
  /** Imports the package with the dialog's choices, then refreshes the asset database. */
  async importPackage(id, folderUrl, decisions) {
    let pkg = opened[id];
    if (!pkg) return { ok: !1, error: "The package was closed." };
    try {
      let r = await importPackage(pkg, Editor.Project.path, assetDb, modeFor(pkg, folderUrl), decisions || {}, tempDir("staging"));
      for (let i = 0; i < r.refresh.length; i++)
        try {
          await Editor.Message.request("asset-db", "refresh-asset", r.refresh[i]);
        } catch (e) {
          r.errors.push("refresh " + r.refresh[i] + ": " + e);
        }
      for (let i = 0; i < r.overwritten.length; i++)
        try {
          await Editor.Message.request("asset-db", "reimport-asset", "db://" + r.overwritten[i]);
        } catch {
        }
      r.errors.length && console.warn(`[Project Browser] Package import problems:
` + r.errors.join(`
`));
      let first = r.written.find((w) => !fs2.statSync((0, import_path.join)(Editor.Project.path, w)).isDirectory()) || r.written[0] || "";
      return { ok: !0, written: r.written.length, skipped: r.skipped, errors: r.errors, remapped: Object.keys(r.remapped).length, first: first ? "db://" + first : "" };
    } catch (e) {
      return { ok: !1, error: String(e.message || e) };
    }
  },
  closePackage(id) {
    delete opened[id];
  },
  // -------------------------------------------------------------- export
  /** The Export Package checklist: the picked assets (folders expanded) and their dependencies. */
  async collectExport(uuids) {
    try {
      return { ok: !0, rows: (await collectAssets(assetDb, Editor.Project.path, uuids || [], { deps: !0 })).filter((a) => !a.container).map((a) => ({ uuid: a.uuid, path: a.rel, type: a.type || "", importer: a.importer || "", isDirectory: a.isDirectory, dependency: a.dependency })) };
    } catch (e) {
      return { ok: !1, error: String(e.message || e) };
    }
  },
  /** Writes the checked assets as a package folder or a .zip at `dest`. */
  async exportPackage(uuids, roots, dest, zip) {
    try {
      let list = await collectAssets(assetDb, Editor.Project.path, uuids || [], { deps: !1, expandFolders: !1 });
      if (!list.some((a) => !a.container)) return { ok: !1, error: "Nothing to export." };
      let tmp = tempDir("export", stampName(/* @__PURE__ */ new Date()));
      if (writePackage(Editor.Project.path, list, tmp, projectSource(), roots || []), zip)
        fs2.writeFileSync(dest, zipFolder(tmp)), fs2.rmSync(tmp, { recursive: !0, force: !0 });
      else {
        if (fs2.existsSync(dest) && fs2.readdirSync(dest).length && !fs2.existsSync((0, import_path.join)(dest, MANIFEST_NAME))) return { ok: !1, error: "The folder is not empty: " + dest };
        fs2.mkdirSync(dest, { recursive: !0 }), fs2.cpSync(tmp, dest, { recursive: !0, force: !0 }), fs2.rmSync(tmp, { recursive: !0, force: !0 });
      }
      return require("electron").shell.showItemInFolder(zip ? dest : (0, import_path.join)(dest, MANIFEST_NAME)), { ok: !0, path: dest, count: list.filter((a) => !a.container).length };
    } catch (e) {
      return { ok: !1, error: String(e.message || e) };
    }
  },
  /** Is this zip one of ours (asset-package.json inside)? Used to tell Cocos' own zips apart. */
  zipHasManifest(file) {
    try {
      return zipList(fs2.readFileSync(file)).some((n) => /(^|\/)asset-package\.json$/.test(n));
    } catch {
      return !1;
    }
  },
  // -------------------------------------------------------------- Extension menu
  importPackageMenu() {
    pendingMenu = "import", Editor.Panel.open(PKG + ".project"), Editor.Message.broadcast(PKG + ":package-menu");
  },
  exportPackageMenu() {
    pendingMenu = "export", Editor.Panel.open(PKG + ".project"), Editor.Message.broadcast(PKG + ":package-menu");
  },
  /** The Extension menu's pending request, taken once (by the first Project window that asks). */
  takePendingMenu() {
    let m = pendingMenu;
    return pendingMenu = "", m;
  }
};
function load() {
  try {
    let { ipcMain } = require("electron");
    ipcListener = (event, payload) => {
      methods.startOsDrag(payload, event && event.sender);
    }, ipcMain.on(OS_DRAG_CHANNEL, ipcListener);
  } catch (e) {
    console.warn("[Project Browser] No ipcMain: the drag out to the OS goes through editor messages.", e);
  }
}
function unload() {
  try {
    ipcListener && require("electron").ipcMain.removeListener(OS_DRAG_CHANNEL, ipcListener);
  } catch {
  }
  ipcListener = null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=main.js.map
