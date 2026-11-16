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
var fs2 = __toESM(require("fs")), path4 = __toESM(require("path"));

// source/main/output.ts
var fs = __toESM(require("fs")), path = __toESM(require("path"));
function stemOf(file) {
  return path.basename(file, path.extname(file));
}
function planCopyPath(source, ext, suffix, folder, exists) {
  let dir = folder || path.dirname(source), clean = String(suffix || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, ""), stem = stemOf(source) + clean, candidate = path.join(dir, stem + ext);
  for (let i = 1; exists(candidate) || samePath(candidate, source); i++) candidate = path.join(dir, `${stem}-${i}${ext}`);
  return candidate;
}
function planOverwritePath(source, ext) {
  return path.extname(source).toLowerCase() === ext.toLowerCase() ? source : path.join(path.dirname(source), stemOf(source) + ext);
}
function samePath(a, b) {
  let na = path.resolve(a), nb = path.resolve(b);
  return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}
var MAX_SESSIONS = 20, OutputWriter = class {
  constructor(projectPath, db) {
    this.db = db;
    this.backupRoot = path.join(projectPath, "temp", "media-utils", "backup"), this.tempRoot = path.join(projectPath, "temp", "media-utils", "out");
  }
  // ---- sessions ----
  beginSession(label) {
    let id = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-") + "-" + Math.random().toString(36).slice(2, 6), dir = path.join(this.backupRoot, id);
    return fs.mkdirSync(dir, { recursive: !0 }), this.writeManifest({ id, label, time: Date.now(), entries: [] }), this.prune(), id;
  }
  manifestPath(id) {
    return path.join(this.backupRoot, id, "manifest.json");
  }
  readManifest(id) {
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath(id), "utf8"));
    } catch {
      return null;
    }
  }
  writeManifest(m) {
    fs.writeFileSync(this.manifestPath(m.id), JSON.stringify(m, null, 2));
  }
  /** Sessions with at least one file, newest first. */
  sessions() {
    let ids = [];
    try {
      ids = fs.readdirSync(this.backupRoot);
    } catch {
      return [];
    }
    return ids.map((id) => this.readManifest(id)).filter((m) => !!m && m.entries.length > 0).sort((a, b) => b.time - a.time);
  }
  summary() {
    let list = this.sessions(), last = list[0];
    return { sessions: list.length, last: last ? { id: last.id, label: last.label, time: last.time, files: last.entries.length } : null };
  }
  prune() {
    let ids = [];
    try {
      ids = fs.readdirSync(this.backupRoot).sort();
    } catch {
      return;
    }
    for (; ids.length > MAX_SESSIONS; ) {
      let id = ids.shift();
      fs.rmSync(path.join(this.backupRoot, id), { recursive: !0, force: !0 });
    }
  }
  backup(session, file) {
    let m = this.readManifest(session);
    if (!m) throw new Error(`Unknown backup session ${session}.`);
    let name = `${m.entries.length}-${path.basename(file)}`, backup = path.join(this.backupRoot, session, name);
    fs.copyFileSync(file, backup);
    let entry = { original: file, current: file, backup };
    return m.entries.push(entry), this.writeManifest(m), entry;
  }
  setCurrent(session, original, current) {
    let m = this.readManifest(session);
    if (m) {
      for (let e of m.entries) samePath(e.original, original) && (e.current = current);
      this.writeManifest(m);
    }
  }
  /** Restores every file of the newest session and deletes it. Returns the restored paths. */
  async restoreLast() {
    let m = this.sessions()[0];
    if (!m) return { label: "", files: [] };
    let restored = [];
    for (let e of m.entries.slice().reverse()) {
      if (!samePath(e.current, e.original) && fs.existsSync(e.current)) {
        let fromUrl = this.db ? await this.db.urlOf(e.current) : null, toUrl = this.db ? await this.db.urlOf(e.original) : null;
        fromUrl && toUrl ? await this.db.move(fromUrl, toUrl) : (fs.renameSync(e.current, e.original), fs.existsSync(e.current + ".meta") && fs.renameSync(e.current + ".meta", e.original + ".meta"));
      }
      fs.copyFileSync(e.backup, e.original), await this.refresh(e.original), restored.push(e.original);
    }
    return fs.rmSync(path.join(this.backupRoot, m.id), { recursive: !0, force: !0 }), { label: m.label, files: restored };
  }
  async refresh(file) {
    if (!this.db) return null;
    let url = await this.db.urlOf(file);
    if (url)
      try {
        await this.db.refresh(url);
      } catch (e) {
        console.warn("[Media Utils] refresh-asset failed for", url, e);
      }
    return url;
  }
  // ---- saving ----
  async save(req2) {
    let bytes = Buffer.from(req2.bytes.buffer, req2.bytes.byteOffset, req2.bytes.byteLength), ext = req2.ext.startsWith(".") ? req2.ext : "." + req2.ext;
    return req2.save.mode === "overwrite" ? this.overwrite(req2.source, ext, bytes, req2.session) : this.copy(req2.source, ext, bytes, req2.save);
  }
  async overwrite(source, ext, bytes, session) {
    if (!fs.existsSync(source)) throw new Error(`File not found: ${source}`);
    let target = planOverwritePath(source, ext), renamed = !samePath(target, source);
    if (renamed && fs.existsSync(target)) throw new Error(`Cannot change the format in place: ${path.basename(target)} already exists.`);
    if (session && this.backup(session, source), renamed) {
      let fromUrl = this.db ? await this.db.urlOf(source) : null;
      if (fromUrl && this.db) {
        let toUrl = fromUrl.replace(/\.[^./]+$/, "") + ext;
        await this.db.move(fromUrl, toUrl);
      } else
        fs.renameSync(source, target), fs.existsSync(source + ".meta") && fs.renameSync(source + ".meta", target + ".meta");
      session && this.setCurrent(session, source, target);
    }
    fs.writeFileSync(target, bytes);
    let url = await this.refresh(target);
    return { path: target, url, size: bytes.length, overwritten: !0, renamed };
  }
  async copy(source, ext, bytes, save) {
    let folder = save.folder && save.folder.trim() ? save.folder.trim() : null;
    folder && fs.mkdirSync(folder, { recursive: !0 });
    let planned = planCopyPath(source, ext, save.suffix, folder, (p) => fs.existsSync(p)), url = this.db ? await this.db.urlOf(planned) : null;
    if (url && this.db) {
      let free = await this.db.availableUrl(url);
      fs.mkdirSync(this.tempRoot, { recursive: !0 });
      let temp = path.join(this.tempRoot, `${Date.now()}-${path.basename(planned)}`);
      fs.writeFileSync(temp, bytes);
      try {
        let finalUrl = await this.db.importFile(temp, free) || free;
        return { path: await this.db.pathOf(finalUrl) || planned, url: finalUrl, size: bytes.length, overwritten: !1, renamed: !1 };
      } catch (e) {
        console.warn("[Media Utils] import-asset failed, writing the file directly:", e);
        let direct = await this.db.pathOf(free) || planned;
        fs.writeFileSync(direct, bytes);
        let u = await this.refresh(direct);
        return { path: direct, url: u, size: bytes.length, overwritten: !1, renamed: !1 };
      } finally {
        fs.rmSync(temp, { force: !0 });
      }
    }
    return fs.writeFileSync(planned, bytes), { path: planned, url: null, size: bytes.length, overwritten: !1, renamed: !1 };
  }
};

// source/main/sharp-loader.ts
var path2 = __toESM(require("path")), cached = null;
function candidates() {
  let list = [];
  process.env.MEDIA_UTILS_SHARP && list.push(process.env.MEDIA_UTILS_SHARP);
  let res = process.resourcesPath;
  return res && (list.push(path2.join(res, "app.asar", "node_modules", "sharp")), list.push(path2.join(res, "app.asar.unpacked", "node_modules", "sharp"))), list.push("sharp"), list;
}
var dynamicRequire = require;
function loadSharp() {
  if (cached && cached.sharp) return cached;
  let errors = [];
  for (let p of candidates())
    try {
      let sharp = dynamicRequire(p);
      if (typeof sharp != "function") throw new Error("not the sharp module");
      let formats = {};
      for (let f of ["png", "jpeg", "webp", "avif", "heif", "gif", "tiff"])
        formats[f] = !!(sharp.format && sharp.format[f] && sharp.format[f].output && sharp.format[f].output.buffer);
      let versions = sharp.versions || {}, version = "";
      try {
        version = dynamicRequire(path2.join(p === "sharp" ? path2.dirname(dynamicRequire.resolve("sharp/package.json")) : p, "package.json")).version;
      } catch {
        version = versions.sharp || "";
      }
      return cached = { sharp, path: p, version, vips: versions.vips || "", error: "", formats }, cached;
    } catch (e) {
      errors.push(`${p}: ${e && e.message ? e.message.split(`
`)[0] : e}`);
    }
  return cached = { sharp: null, path: "", version: "", vips: "", error: `Could not load sharp.
` + errors.join(`
`), formats: {} }, cached;
}
function requireSharp() {
  let info = loadSharp();
  if (!info.sharp) throw new Error(info.error);
  return info.sharp;
}

// source/shared/image/options.ts
function defaultImageOptions() {
  return {
    crop: { enabled: !1, x: 0, y: 0, width: 1, height: 1 },
    trim: { enabled: !1, threshold: 0, margin: 0 },
    transform: { rotate: 0, flipH: !1, flipV: !1 },
    resize: {
      enabled: !1,
      mode: "percent",
      width: 512,
      height: 512,
      percent: 50,
      keepAspect: !0,
      fit: "fill",
      kernel: "lanczos3",
      rounding: "none",
      allowEnlarge: !0,
      background: "#00000000"
    },
    pad: { enabled: !1, top: 0, right: 0, bottom: 0, left: 0, color: "#00000000", extendWith: "background" },
    adjust: { enabled: !1, brightness: 0, contrast: 0, saturation: 0, hue: 0, grayscale: !1, tint: "#ffffff", tintAmount: 0 },
    alpha: { enabled: !1, mode: "bleed" },
    encode: {
      format: "keep",
      pngCompression: 9,
      pngPalette: !1,
      pngColors: 256,
      pngQuality: 90,
      pngDither: 1,
      pngEffort: 7,
      jpgQuality: 85,
      jpgProgressive: !1,
      jpgMozjpeg: !0,
      jpgChroma: "4:2:0",
      jpgBackground: "#ffffff",
      webpQuality: 85,
      webpLossless: !1,
      webpNearLossless: !1,
      webpAlphaQuality: 100,
      webpEffort: 4,
      avifQuality: 60,
      avifLossless: !1,
      avifEffort: 4,
      avifChroma: "4:4:4",
      skipIfLarger: !0
    }
  };
}
function mergeImageOptions(stored) {
  let base = defaultImageOptions();
  if (!stored || typeof stored != "object") return base;
  for (let section of Object.keys(base)) {
    let src = stored[section];
    if (!(!src || typeof src != "object"))
      for (let key of Object.keys(base[section]))
        src[key] !== void 0 && typeof src[key] == typeof base[section][key] && (base[section][key] = src[key]);
  }
  return base;
}
var IMAGE_INPUT_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff"], AUDIO_INPUT_EXTS = [".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac", ".opus", ".weba", ".webm"];
function extOf(path5) {
  let m = /\.[^./\\]+$/.exec(path5 || "");
  return m ? m[0].toLowerCase() : "";
}
function isImagePath(path5) {
  return IMAGE_INPUT_EXTS.indexOf(extOf(path5)) >= 0;
}
function isAudioPath(path5) {
  return AUDIO_INPUT_EXTS.indexOf(extOf(path5)) >= 0;
}
function resolveFormat(sourcePath, format) {
  if (format !== "keep") return format;
  let ext = extOf(sourcePath);
  return ext === ".jpg" || ext === ".jpeg" ? "jpg" : ext === ".webp" ? "webp" : ext === ".avif" ? "avif" : "png";
}
function extensionFor(format, sourcePath) {
  return format === "jpg" && sourcePath && extOf(sourcePath) === ".jpeg" ? ".jpeg" : "." + format;
}
function parseColor(hex) {
  let h = String(hex || "").trim().replace(/^#/, "");
  (h.length === 3 || h.length === 4) && (h = h.split("").map((c) => c + c).join(""));
  let n = (i) => parseInt(h.slice(i, i + 2), 16);
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h) ? { r: n(0), g: n(2), b: n(4), alpha: h.length === 8 ? n(6) / 255 : 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
}

// source/shared/image/pixels.ts
function opaqueBounds(rgba, width, height, threshold = 0) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    let row = y * width * 4;
    for (let x = 0; x < width; x++)
      rgba[row + x * 4 + 3] > threshold && (x < minX && (minX = x), x > maxX && (maxX = x), y < minY && (minY = y), y > maxY && (maxY = y));
  }
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
function growRect(r, margin, width, height) {
  let left = Math.max(0, r.left - margin), top = Math.max(0, r.top - margin), right = Math.min(width, r.left + r.width + margin), bottom = Math.min(height, r.top + r.height + margin);
  return { left, top, width: right - left, height: bottom - top };
}
function mul(a, b) {
  let o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}
function saturateMatrix(s) {
  return [
    0.2126 + 0.7874 * s,
    0.7152 - 0.7152 * s,
    0.0722 - 0.0722 * s,
    0.2126 - 0.2126 * s,
    0.7152 + 0.2848 * s,
    0.0722 - 0.0722 * s,
    0.2126 - 0.2126 * s,
    0.7152 - 0.7152 * s,
    0.0722 + 0.9278 * s
  ];
}
function hueMatrix(deg) {
  let a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072
  ];
}
function isIdentity(o) {
  return !o.brightness && !o.contrast && !o.saturation && !o.hue && !o.grayscale && !(o.tintAmount > 0);
}
function adjustPixels(rgba, o) {
  if (isIdentity(o)) return;
  let lut = new Uint8ClampedArray(256), b = Math.max(-100, Math.min(100, o.brightness || 0)) / 100 * 255, C = Math.max(-100, Math.min(100, o.contrast || 0)) * 2.55, cf = 259 * (C + 255) / (255 * (259 - C));
  for (let v = 0; v < 256; v++) lut[v] = cf * (v + b - 128) + 128;
  let m = null, sat = o.grayscale ? 0 : 1 + Math.max(-100, Math.min(100, o.saturation || 0)) / 100;
  sat !== 1 && (m = saturateMatrix(sat)), o.hue && (m = m ? mul(hueMatrix(o.hue), m) : hueMatrix(o.hue));
  let t = parseColor(o.tint || "#ffffff"), ta = Math.max(0, Math.min(100, o.tintAmount || 0)) / 100, tr = 1 - ta + ta * t.r / 255, tg = 1 - ta + ta * t.g / 255, tb = 1 - ta + ta * t.b / 255;
  for (let i = 0; i < rgba.length; i += 4) {
    let r = lut[rgba[i]], g = lut[rgba[i + 1]], bl = lut[rgba[i + 2]];
    if (m) {
      let nr = m[0] * r + m[1] * g + m[2] * bl, ng = m[3] * r + m[4] * g + m[5] * bl, nb = m[6] * r + m[7] * g + m[8] * bl;
      r = nr, g = ng, bl = nb;
    }
    r *= tr, g *= tg, bl *= tb, rgba[i] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r), rgba[i + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g), rgba[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : Math.round(bl);
  }
}
function premultiply(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    let a = rgba[i + 3];
    a !== 255 && (rgba[i] = Math.round(rgba[i] * a / 255), rgba[i + 1] = Math.round(rgba[i + 1] * a / 255), rgba[i + 2] = Math.round(rgba[i + 2] * a / 255));
  }
}
function alphaBleed(rgba, width, height) {
  let n = width * height, filled = new Uint8Array(n), frontier = [];
  for (let i = 0; i < n; i++) rgba[i * 4 + 3] > 0 && (filled[i] = 1);
  let isEdge = (i) => {
    let x = i % width, y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      let yy = y + dy;
      if (!(yy < 0 || yy >= height))
        for (let dx = -1; dx <= 1; dx++) {
          let xx = x + dx;
          if ((dx || dy) && xx >= 0 && xx < width && filled[yy * width + xx]) return !0;
        }
    }
    return !1;
  };
  for (let i = 0; i < n; i++) !filled[i] && isEdge(i) && frontier.push(i);
  if (!frontier.length) return;
  let queued = new Uint8Array(n);
  for (let i of frontier) queued[i] = 1;
  for (; frontier.length; ) {
    let done = [];
    for (let i of frontier) {
      let x = i % width, y = (i - x) / width, r = 0, g = 0, b = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        let yy = y + dy;
        if (!(yy < 0 || yy >= height))
          for (let dx = -1; dx <= 1; dx++) {
            let xx = x + dx;
            if (!(dx || dy) || xx < 0 || xx >= width) continue;
            let j = yy * width + xx;
            filled[j] && (r += rgba[j * 4], g += rgba[j * 4 + 1], b += rgba[j * 4 + 2], count++);
          }
      }
      count && (rgba[i * 4] = Math.round(r / count), rgba[i * 4 + 1] = Math.round(g / count), rgba[i * 4 + 2] = Math.round(b / count), done.push(i));
    }
    for (let i of done) filled[i] = 1;
    let next = [];
    for (let i of done) {
      let x = i % width, y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        let yy = y + dy;
        if (!(yy < 0 || yy >= height))
          for (let dx = -1; dx <= 1; dx++) {
            let xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            let j = yy * width + xx;
            !filled[j] && !queued[j] && (queued[j] = 1, next.push(j));
          }
      }
    }
    frontier = next;
  }
}
function hasTransparency(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return !0;
  return !1;
}
function cropRaw(img, r) {
  let out = new Uint8Array(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    let from = ((r.top + y) * img.width + r.left) * 4;
    out.set(img.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return { data: out, width: r.width, height: r.height };
}
function rotateRaw(img, degrees) {
  let d = (Math.round(degrees / 90) % 4 + 4) % 4;
  if (!d) return img;
  let { width: w, height: h, data } = img, ow = d === 2 ? w : h, oh = d === 2 ? h : w, out = new Uint8Array(data.length), src32 = view32(data, w * h), dst32 = new Uint32Array(out.buffer, 0, w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let nx, ny;
      d === 1 ? (nx = h - 1 - y, ny = x) : d === 2 ? (nx = w - 1 - x, ny = h - 1 - y) : (nx = y, ny = w - 1 - x), dst32[ny * ow + nx] = src32[y * w + x];
    }
  return { data: out, width: ow, height: oh };
}
function flipRaw(img, flipH, flipV) {
  if (!flipH && !flipV) return img;
  let { width: w, height: h, data } = img, out = new Uint8Array(data.length), src32 = view32(data, w * h), dst32 = new Uint32Array(out.buffer, 0, w * h);
  for (let y = 0; y < h; y++) {
    let sy = flipV ? h - 1 - y : y;
    for (let x = 0; x < w; x++) dst32[y * w + x] = src32[sy * w + (flipH ? w - 1 - x : x)];
  }
  return { data: out, width: w, height: h };
}
function view32(data, pixels) {
  let src = data.byteOffset % 4 ? data.slice() : data;
  return new Uint32Array(src.buffer, src.byteOffset, pixels);
}

// source/main/pixel-job.ts
var path3 = __toESM(require("path"));
function countColours(rgba, limit) {
  let seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    let key = (rgba[i] << 24 | rgba[i + 1] << 16 | rgba[i + 2] << 8 | rgba[i + 3]) >>> 0;
    if (!seen.has(key) && (seen.add(key), seen.size > limit))
      return seen.size;
  }
  return seen.size;
}
function runPixelJob(data, job) {
  let out = {};
  return job.boundsThreshold !== void 0 && (out.bounds = opaqueBounds(data, job.width, job.height, job.boundsThreshold)), job.adjust && adjustPixels(data, job.adjust), job.alpha === "premultiply" ? premultiply(data) : job.alpha === "bleed" && alphaBleed(data, job.width, job.height), job.transparency && (out.transparent = hasTransparency(data)), job.countColours !== void 0 && (out.colours = countColours(data, job.countColours)), out;
}
var worker = null, workerFailed = !1, nextId = 1, pending = /* @__PURE__ */ new Map(), INLINE_PIXELS = 512 * 512;
function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    let { Worker } = require("worker_threads"), file = path3.join(__dirname, "pixel-worker.js");
    if (!require("fs").existsSync(file)) throw new Error("pixel-worker.js not found");
    worker = new Worker(file), worker.unref(), worker.on("message", (msg) => {
      let p = pending.get(msg.id);
      p && (pending.delete(msg.id), msg.ok ? p.resolve(msg) : p.reject(new Error(msg.error)));
    }), worker.on("error", (e) => {
      console.warn("[Media Utils] pixel worker failed, running inline:", e), workerFailed = !0, worker = null;
      for (let p of pending.values()) p.reject(e);
      pending.clear();
    });
  } catch {
    workerFailed = !0, worker = null;
  }
  return worker;
}
async function pixelJob(data, job) {
  let w = job.width * job.height >= INLINE_PIXELS ? getWorker() : null;
  if (!w) {
    let result = runPixelJob(data, job);
    return { data, result };
  }
  let copy = new Uint8Array(data.length);
  copy.set(data);
  try {
    let msg = await new Promise((resolve2, reject) => {
      let id = nextId++;
      pending.set(id, { resolve: resolve2, reject }), w.postMessage({ id, job, data: copy.buffer }, [copy.buffer]);
    });
    return { data: new Uint8Array(msg.data), result: msg.result };
  } catch (e) {
    if (!workerFailed) throw e;
    return { data, result: runPixelJob(data, job) };
  }
}

// source/shared/image/sizing.ts
function potUp(n) {
  let p = 1;
  for (; p < n; ) p *= 2;
  return p;
}
function potDown(n) {
  let p = 1;
  for (; p * 2 <= n; ) p *= 2;
  return p;
}
function potNearest(n) {
  let up = potUp(n), down = potDown(n);
  return up - n < n - down ? up : down;
}
function multipleOf(n, m) {
  return Math.max(m, Math.ceil(n / m) * m);
}
function roundSize(n, rounding) {
  switch (n = Math.max(1, Math.round(n)), rounding) {
    case "pot-nearest":
      return potNearest(n);
    case "pot-up":
      return potUp(n);
    case "pot-down":
      return potDown(n);
    case "multiple4":
      return multipleOf(n, 4);
    default:
      return n;
  }
}
function planResize(srcW, srcH, o) {
  let w, h, fit = "fill";
  if (o.mode === "percent") {
    let p = Math.max(0.1, Number(o.percent) || 100) / 100;
    w = srcW * p, h = srcH * p;
  } else {
    let bw = Math.max(0, Math.round(o.width) || 0), bh = Math.max(0, Math.round(o.height) || 0);
    !bw && !bh ? (bw = srcW, bh = srcH) : bw ? bh || (bh = Math.round(bw * srcH / srcW)) : bw = Math.round(bh * srcW / srcH);
    let mode = o.fit;
    if (mode === "fill" && o.keepAspect && (mode = "inside"), mode === "inside" || mode === "outside") {
      let sx = bw / srcW, sy = bh / srcH, s = mode === "inside" ? Math.min(sx, sy) : Math.max(sx, sy);
      w = srcW * s, h = srcH * s;
    } else
      w = bw, h = bh, fit = mode;
  }
  if (!o.allowEnlarge && (w > srcW || h > srcH))
    if (fit === "fill") {
      let s = Math.min(srcW / w, srcH / h);
      w *= s, h *= s;
    } else
      w = Math.min(w, srcW), h = Math.min(h, srcH);
  return { width: roundSize(w, o.rounding), height: roundSize(h, o.rounding), fit };
}
function cropRect(w, h, c) {
  let left = Math.max(0, Math.min(w - 1, Math.round(c.x * w))), top = Math.max(0, Math.min(h - 1, Math.round(c.y * h))), right = Math.max(left + 1, Math.min(w, Math.round((c.x + c.width) * w))), bottom = Math.max(top + 1, Math.min(h, Math.round((c.y + c.height) * h)));
  return { left, top, width: right - left, height: bottom - top };
}

// source/main/image-pipeline.ts
function rawInput(img) {
  return { raw: { width: img.width, height: img.height, channels: 4 } };
}
async function toRaw(pipeline) {
  let { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: !0 });
  if (info.channels !== 4) throw new Error(`Unexpected channel count ${info.channels}.`);
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}
function sharpColor(hex) {
  let c = parseColor(hex);
  return { r: c.r, g: c.g, b: c.b, alpha: c.alpha };
}
function isEncodeOnly(o) {
  return !o.crop.enabled && !o.trim.enabled && !o.transform.rotate && !o.transform.flipH && !o.transform.flipV && !o.resize.enabled && !o.pad.enabled && !o.adjust.enabled && !o.alpha.enabled;
}
async function readStats(sharp, input) {
  let meta = await sharp(input, { animated: !1 }).metadata(), swap = meta.orientation && meta.orientation >= 5;
  return {
    width: (swap ? meta.height : meta.width) || 0,
    height: (swap ? meta.width : meta.height) || 0,
    format: meta.format === "jpeg" ? "jpg" : meta.format === "heif" ? "avif" : String(meta.format || ""),
    size: input.length,
    hasAlpha: !!meta.hasAlpha
  };
}
async function encodeRaw(sharp, img, format, o, facts) {
  let p = sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img));
  if (facts.transparent || (p = p.removeAlpha()), format === "png") {
    let png = { compressionLevel: clampInt(o.pngCompression, 0, 9), adaptiveFiltering: !0 };
    if (o.pngPalette && (png.palette = !0, png.colours = clampInt(o.pngColors, 2, 256), png.quality = clampInt(o.pngQuality, 0, 100), png.dither = Math.max(0, Math.min(1, Number(o.pngDither))), png.effort = clampInt(o.pngEffort, 1, 10)), p = p.png(png), !o.pngPalette) {
      let colours = facts.colours;
      if (colours <= 256) {
        let [truecolour, indexed] = await Promise.all([
          p.toBuffer(),
          sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img)).png({ palette: !0, colours: Math.max(2, colours), quality: 100, dither: 0, effort: 10, compressionLevel: png.compressionLevel }).toBuffer()
        ]);
        return indexed.length < truecolour.length ? indexed : truecolour;
      }
    }
  } else if (format === "jpg")
    p = p.flatten({ background: sharpColor(o.jpgBackground || "#ffffff") }).jpeg({
      quality: clampInt(o.jpgQuality, 1, 100),
      progressive: !!o.jpgProgressive,
      mozjpeg: !!o.jpgMozjpeg,
      chromaSubsampling: o.jpgChroma === "4:4:4" ? "4:4:4" : "4:2:0"
    });
  else if (format === "webp")
    p = p.webp({
      quality: clampInt(o.webpQuality, 1, 100),
      lossless: !!o.webpLossless,
      nearLossless: !!o.webpNearLossless && !o.webpLossless,
      alphaQuality: clampInt(o.webpAlphaQuality, 0, 100),
      effort: clampInt(o.webpEffort, 0, 6)
    });
  else if (format === "avif")
    p = p.avif({
      quality: clampInt(o.avifQuality, 1, 100),
      lossless: !!o.avifLossless,
      effort: clampInt(o.avifEffort, 0, 9),
      chromaSubsampling: o.avifChroma === "4:2:0" ? "4:2:0" : "4:4:4"
    });
  else
    throw new Error(`Unsupported output format: ${format}`);
  return p.toBuffer();
}
function clampInt(v, lo, hi) {
  let n = Math.round(Number(v));
  return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}
async function runImagePipeline(sharp, input, sourcePath, o) {
  let warnings = [], source = await readStats(sharp, input), format = resolveFormat(sourcePath, o.encode.format), img = await toRaw(sharp(input, { animated: !1 }).rotate());
  if (o.crop.enabled && (img = cropRaw(img, cropRect(img.width, img.height, o.crop))), o.trim.enabled) {
    let job2 = await pixelJob(img.data, { width: img.width, height: img.height, boundsThreshold: clampInt(o.trim.threshold, 0, 254) });
    img = { data: job2.data, width: img.width, height: img.height };
    let bounds = job2.result.bounds;
    bounds ? img = cropRaw(img, growRect(bounds, Math.max(0, Math.round(o.trim.margin) || 0), img.width, img.height)) : warnings.push("The image is fully transparent; nothing to trim.");
  }
  o.transform.rotate && (img = rotateRaw(img, o.transform.rotate)), (o.transform.flipH || o.transform.flipV) && (img = flipRaw(img, o.transform.flipH, o.transform.flipV));
  let preResizeWidth = img.width;
  if (o.resize.enabled) {
    let plan = planResize(img.width, img.height, o.resize);
    (plan.width !== img.width || plan.height !== img.height || plan.fit !== "fill") && (img = await toRaw(
      sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img)).resize(plan.width, plan.height, {
        fit: plan.fit,
        kernel: o.resize.kernel,
        background: sharpColor(o.resize.background || "#00000000"),
        position: "centre"
      })
    ));
  }
  let resizedWidth = img.width;
  if (o.pad.enabled) {
    let t = Math.max(0, Math.round(o.pad.top) || 0), r = Math.max(0, Math.round(o.pad.right) || 0), b = Math.max(0, Math.round(o.pad.bottom) || 0), l = Math.max(0, Math.round(o.pad.left) || 0);
    (t || r || b || l) && (img = await toRaw(
      sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img)).extend({
        top: t,
        right: r,
        bottom: b,
        left: l,
        background: sharpColor(o.pad.color || "#00000000"),
        extendWith: o.pad.extendWith || "background"
      })
    ));
  }
  let job = await pixelJob(img.data, {
    width: img.width,
    height: img.height,
    adjust: o.adjust.enabled ? o.adjust : void 0,
    alpha: o.alpha.enabled ? o.alpha.mode : void 0,
    transparency: !0,
    countColours: format === "png" && !o.encode.pngPalette ? 256 : void 0
  });
  img = { data: job.data, width: img.width, height: img.height };
  let alpha = !!job.result.transparent;
  format === "jpg" && alpha && warnings.push("JPG has no transparency: transparent pixels are filled with the JPG background colour."), o.alpha.enabled && o.alpha.mode === "bleed" && format === "jpg" && warnings.push("Alpha bleed only matters for formats with transparency.");
  let buffer = await encodeRaw(sharp, img, format, o.encode, { transparent: alpha, colours: job.result.colours === void 0 ? 257 : job.result.colours });
  return {
    buffer,
    format,
    source,
    result: { width: img.width, height: img.height, format, size: buffer.length, hasAlpha: alpha && format !== "jpg" },
    displayScale: resizedWidth ? preResizeWidth / resizedWidth : 1,
    encodeOnly: isEncodeOnly(o),
    warnings
  };
}
function mimeOf(file) {
  let ext = extOf(file);
  return ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".avif" ? "image/avif" : ext === ".gif" ? "image/gif" : ext === ".mp3" ? "audio/mpeg" : ext === ".ogg" ? "audio/ogg" : ext === ".wav" ? "audio/wav" : "application/octet-stream";
}

// source/main.ts
var PKG = "media-utils";
function req(target, message, ...args) {
  return Editor.Message.request(target, message, ...args);
}
var assetDb = {
  async urlOf(file) {
    let lookup = async (p) => {
      try {
        let info = await req("asset-db", "query-asset-info", p);
        if (info && info.url) return info.url;
      } catch {
      }
      try {
        return await req("asset-db", "query-url", p) || null;
      } catch {
        return null;
      }
    }, own = await lookup(file);
    if (own) return own;
    let dirUrl = await lookup(path4.dirname(file));
    return dirUrl ? dirUrl.replace(/\/$/, "") + "/" + path4.basename(file) : null;
  },
  async refresh(url) {
    await req("asset-db", "refresh-asset", url);
  },
  async move(fromUrl, toUrl) {
    if (!await req("asset-db", "move-asset", fromUrl, toUrl)) throw new Error(`asset-db could not move ${fromUrl} to ${toUrl}.`);
  },
  async importFile(file, url) {
    let info = await req("asset-db", "import-asset", file, url);
    return info ? info.url || url : null;
  },
  async availableUrl(url) {
    try {
      return await req("asset-db", "generate-available-url", url) || url;
    } catch {
      return url;
    }
  },
  async pathOf(url) {
    try {
      return await req("asset-db", "query-path", url);
    } catch {
      return null;
    }
  }
}, writer = null;
function output() {
  return writer || (writer = new OutputWriter(Editor.Project.path, assetDb)), writer;
}
async function resolveItems(items) {
  let out = [], seen = /* @__PURE__ */ new Set(), add = (p) => {
    let key = process.platform === "win32" ? p.toLowerCase() : p;
    seen.has(key) || (seen.add(key), out.push(p));
  };
  for (let raw of items || []) {
    if (typeof raw != "string" || !raw.trim()) continue;
    let item = raw.trim();
    if (item.startsWith("file://"))
      try {
        item = require("url").fileURLToPath(item);
      } catch {
        continue;
      }
    if (path4.isAbsolute(item) && fs2.existsSync(item)) {
      add(item);
      continue;
    }
    try {
      let info = await req("asset-db", "query-asset-info", item.split("@")[0]);
      info && info.file && !info.isDirectory && add(info.file);
    } catch {
    }
  }
  return out;
}
function ofKind(paths, kind) {
  return paths.filter((p) => kind === "image" ? isImagePath(p) : isAudioPath(p));
}
var pending2 = { image: [], audio: [] };
function panelId(kind) {
  return kind === "image" ? PKG + ".image-tools" : PKG + ".audio-editor";
}
function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (bytes && bytes.type === "Buffer" && Array.isArray(bytes.data)) return Buffer.from(bytes.data);
  if (typeof bytes == "string") return Buffer.from(bytes, "base64");
  if (bytes && typeof bytes == "object" && typeof bytes.length == "number") return Buffer.from(Array.from(bytes));
  throw new Error("Expected binary data.");
}
function fileInfo(file) {
  let stat = fs2.statSync(file);
  return { path: file, name: path4.basename(file), ext: extOf(file), size: stat.size, mtime: stat.mtimeMs };
}
var methods = {
  openImageTools() {
    return Editor.Panel.open(panelId("image"));
  },
  openAudioEditor() {
    return Editor.Panel.open(panelId("audio"));
  },
  async openDocs() {
    try {
      await require("electron").shell.openPath(path4.join(__dirname, "..", "README.md"));
    } catch (e) {
      console.error("[Media Utils] Could not open the README:", e);
    }
  },
  /** From the Assets panel menu: open a panel with these assets. */
  async openAssets(kind, items) {
    let files = ofKind(await resolveItems(items || []), kind);
    return pending2[kind] = files, await Editor.Panel.open(panelId(kind)), Editor.Message.broadcast(kind === "image" ? "media-utils:pending-image" : "media-utils:pending-audio"), files.length;
  },
  /** Files queued by openAssets for a panel (taken once). */
  takePending(kind) {
    let list = pending2[kind] || [];
    return pending2[kind] = [], list;
  },
  async resolveAssets(kind, items) {
    return ofKind(await resolveItems(items || []), kind);
  },
  async selectedAssets(kind) {
    let uuids = Editor.Selection.getSelected("asset") || [];
    return ofKind(await resolveItems(uuids), kind);
  },
  async pickFiles(kind, multi = !0) {
    let exts = kind === "image" ? ["png", "jpg", "jpeg", "webp", "avif", "gif", "tif", "tiff"] : ["mp3", "ogg", "wav", "m4a", "aac", "flac", "opus"], result = await Editor.Dialog.select({
      title: kind === "image" ? "Add Images" : "Open Audio",
      path: path4.join(Editor.Project.path, "assets"),
      type: "file",
      multi,
      filters: [{ name: kind === "image" ? "Images" : "Audio", extensions: exts }]
    });
    return result.canceled ? [] : result.filePaths || [];
  },
  async pickFolder(current) {
    let result = await Editor.Dialog.select({
      title: "Output Folder",
      path: current || path4.join(Editor.Project.path, "assets"),
      type: "directory",
      multi: !1
    });
    return result.canceled || !result.filePaths || !result.filePaths[0] ? null : result.filePaths[0];
  },
  fileInfo(file) {
    return fileInfo(file);
  },
  /** Raw bytes of a file (audio decoding, image display). */
  readFile(file) {
    return fs2.readFileSync(file);
  },
  imageCapabilities() {
    let s = loadSharp();
    return { loaded: !!s.sharp, path: s.path, version: s.version, vips: s.vips, formats: s.formats, error: s.error };
  },
  /** Size, dimensions and displayable bytes (TIFF and other formats Chromium can't show become PNG). */
  async imageInfo(file, withDisplay = !0) {
    let sharp = requireSharp(), input = fs2.readFileSync(file), stats = await readStats(sharp, input), url = await assetDb.urlOf(file), showable = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].indexOf(extOf(file)) >= 0, display = withDisplay ? showable ? input : await sharp(input, { animated: !1 }).rotate().png().toBuffer() : null;
    return { ...fileInfo(file), url, width: stats.width, height: stats.height, format: stats.format, hasAlpha: stats.hasAlpha, display, displayMime: showable ? mimeOf(file) : "image/png" };
  },
  /** Runs the pipeline without saving. */
  async imagePreview(file, options) {
    let sharp = requireSharp(), o = mergeImageOptions(options), r = await runImagePipeline(sharp, fs2.readFileSync(file), file, o);
    return {
      bytes: r.buffer,
      mime: mimeOf("x." + r.format),
      source: r.source,
      result: r.result,
      displayScale: r.displayScale,
      warnings: r.warnings
    };
  },
  /** Runs the pipeline and saves the result. */
  async imageProcess(file, options, save, session) {
    let sharp = requireSharp(), o = mergeImageOptions(options), input = fs2.readFileSync(file), r = await runImagePipeline(sharp, input, file, o), ext = extensionFor(r.format, file), sameFormat = ext.toLowerCase() === extOf(file) || r.format === "jpg" && (extOf(file) === ".jpg" || extOf(file) === ".jpeg");
    return o.encode.skipIfLarger && r.encodeOnly && sameFormat && r.buffer.length >= input.length ? { path: file, url: await assetDb.urlOf(file), size: input.length, before: input.length, overwritten: !1, renamed: !1, skipped: !0, warnings: r.warnings } : { ...await output().save({ source: file, ext, bytes: r.buffer, save, session }), before: input.length, warnings: r.warnings };
  },
  /** Saves bytes made in a panel (encoded audio). */
  async saveOutput(request, bytes) {
    return output().save({ ...request, bytes: toBuffer(bytes !== void 0 ? bytes : request.bytes) });
  },
  backupBegin(label) {
    return output().beginSession(label || "Overwrite");
  },
  backupInfo() {
    return output().summary();
  },
  async restoreLast() {
    let r = await output().restoreLast();
    return r.files.length ? (console.log(`[Media Utils] Restored ${r.files.length} file(s) from "${r.label}".`), Editor.Message.broadcast("media-utils:restored", r.files)) : console.log("[Media Utils] Nothing to restore."), r;
  },
  /** Selects and pings a file in the Assets panel. */
  async reveal(file) {
    try {
      let info = await req("asset-db", "query-asset-info", file);
      if (info && info.uuid)
        return Editor.Selection.clear("asset"), Editor.Selection.select("asset", info.uuid), Editor.Message.send("assets", "twinkle", info.uuid), !0;
    } catch {
    }
    try {
      require("electron").shell.showItemInFolder(file);
    } catch {
    }
    return !1;
  },
  /** The encoder WebAssembly binaries (shipped in dist/wasm). */
  encoderWasm(kind) {
    if (kind !== "mp3" && kind !== "ogg") throw new Error("Unknown encoder.");
    return fs2.readFileSync(path4.join(__dirname, "wasm", kind + ".wasm"));
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
