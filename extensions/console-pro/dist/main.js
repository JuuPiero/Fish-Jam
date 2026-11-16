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
var fs2 = __toESM(require("fs")), path2 = __toESM(require("path"));

// source/shared/tags.ts
var PIE_PREFIX_RE = /^\s*\[?\s*PreviewInEditor\s*\]?\s*:?\s*/, NOT_TAGS = /^(previewineditor|object object|object|array|\d+|[\d.,:\s-]+|x|\s*|log|info|warn|warning|error|debug)$/i;
function detectTag(text) {
  let s = (text || "").replace(PIE_PREFIX_RE, "");
  for (let guard = 0; guard < 3; guard++) {
    let m = /^\s*\[([^\[\]\r\n]{1,40})\]/.exec(s);
    if (!m) return "";
    let tag = m[1].trim();
    if (/^[\d:.\s/-]+$/.test(tag)) {
      s = s.slice(m[0].length);
      continue;
    }
    return NOT_TAGS.test(tag) ? "" : tag;
  }
  return "";
}
var SCENE_HINTS = /builtin[\\/]scene[\\/]|[\\/]engine[\\/](?:bin|editor|cocos)[\\/]|cce:\/|pack:\/\/\/|[\\/]chunks[\\/][0-9a-f]{2}[\\/]|packer-driver/i, PANEL_HINTS = /packages:\/\/|[\\/]panels?[\\/]|[\\/]dist[\\/]panel|@editor[\\/]panel|[\\/]dock[\\/]/i;
function guessSource(process2, text, stack) {
  let p = (process2 || "").toLowerCase();
  if (p === "browser" || p === "main" || p === "worker") return "main";
  if (PIE_PREFIX_RE.test(text || "") || /PreviewInEditor/.test((stack || "").slice(0, 300))) return "game";
  let s = stack || "";
  return SCENE_HINTS.test(s) ? PANEL_HINTS.test(firstFrames(s)) ? "panel" : "scene" : PANEL_HINTS.test(s) || p === "renderer" ? "panel" : "main";
}
function firstFrames(stack) {
  return stack.split(/\r?\n/).slice(0, 6).join(`
`);
}
function toLevel(type) {
  let t = String(type || "").toLowerCase();
  return t === "warn" || t === "warning" ? "warn" : t === "error" || t === "fatal" || t === "assert" ? "error" : t === "info" ? "info" : t === "success" || t === "ok" ? "success" : "log";
}
function headMatches(text, head) {
  if (!head) return !0;
  let t = (text || "").replace(PIE_PREFIX_RE, "");
  if (t.startsWith(head)) return !0;
  let at = t.indexOf(head);
  return at >= 0 && at < 64;
}

// source/main/capture.ts
function fingerprint(r) {
  return r ? String(r.time || r.date || 0) + "|" + String(r.type || "") + "|" + String(r.message === void 0 ? "" : r.message).slice(0, 200) : "";
}
function toEntry(r, id) {
  let text = typeof r.message == "string" ? r.message : r.message === void 0 || r.message === null ? "" : safeString(r.message), stack = typeof r.stack == "string" ? r.stack : r.stack ? safeString(r.stack) : "", t = Number(r.time || r.date || 0);
  !t || !isFinite(t) ? t = Date.now() : t < 1e11 && (t *= 1e3);
  let level = toLevel(r.type || "log"), e = { id, t, level, text, stack, source: guessSource(r.process, text, stack), tag: detectTag(text) };
  return r.process && (e.process = String(r.process)), e;
}
function safeString(v) {
  try {
    return typeof v == "object" ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}
var LoggerFollower = class {
  constructor(api, onRecords2, onClear) {
    this.api = api;
    this.onRecords = onRecords2;
    this.onClear = onClear;
    this.mode = "none";
    this.seen = 0;
    this.lastFp = "";
    this.timer = null;
    this.handlers = [];
  }
  /** Records already in the list (history before this extension loaded). */
  start() {
    let list = this.safeQuery();
    this.seen = list.length, this.lastFp = fingerprint(list[list.length - 1]);
    let evented = !1;
    if (this.api.on)
      try {
        let rec = (r) => this.onEvent(r), clr = () => this.onClearEvent();
        this.api.on("record", rec), this.api.on("clear", clr), this.handlers.push({ action: "record", fn: rec }, { action: "clear", fn: clr }), evented = !0;
      } catch {
        evented = !1;
      }
    return this.mode = evented ? "event" : "poll", this.timer = setInterval(() => this.tick(), evented ? 1e3 : 150), list.slice();
  }
  stop() {
    if (this.timer && clearInterval(this.timer), this.timer = null, this.api.off)
      for (let i = 0; i < this.handlers.length; i++)
        try {
          this.api.off(this.handlers[i].action, this.handlers[i].fn);
        } catch {
        }
    this.handlers = [];
  }
  safeQuery() {
    try {
      let l = this.api.query();
      return Array.isArray(l) ? l : [];
    } catch {
      return [];
    }
  }
  onEvent(r) {
    this.seen++, this.lastFp = fingerprint(r), this.onRecords([r]);
  }
  onClearEvent() {
    this.seen = 0, this.lastFp = "", this.onClear();
  }
  /** Picks up records the event did not deliver (or every record, in poll mode). */
  tick() {
    let list = this.safeQuery(), n = list.length;
    if (n === 0) {
      this.seen > 0 && (this.seen = 0, this.lastFp = "");
      return;
    }
    let from = this.seen;
    if ((from > n || from > 0 && fingerprint(list[from - 1]) !== this.lastFp) && (from = 0, this.lastFp)) {
      for (let i = n - 1; i >= 0; i--)
        if (fingerprint(list[i]) === this.lastFp) {
          from = i + 1;
          break;
        }
    }
    if (from < n) {
      let fresh = list.slice(from);
      this.mode === "event" && fresh.length && (this.mode = "poll", this.timer && clearInterval(this.timer), this.timer = setInterval(() => this.tick(), 150)), this.seen = n, this.lastFp = fingerprint(list[n - 1]), this.onRecords(fresh);
    } else
      this.seen = n;
  }
}, SourceTagger = class {
  constructor(now = Date.now) {
    this.now = now;
    /** Renderer entries not confirmed yet (newest last). */
    this.open = [];
    this.pending = [];
  }
  /** A new entry: confirmed from an earlier call when one matches. */
  onEntry(e) {
    if (!(e.process && e.process !== "renderer") && e.source !== "main") {
      this.expire();
      for (let i = 0; i < this.pending.length; i++) {
        let c = this.pending[i];
        if (c.level === e.level && this.matches(e, c)) {
          e.source = c.source, e.sure = !0, this.pending.splice(i, 1);
          return;
        }
      }
      this.open.push(e), this.open.length > 2e3 && this.open.splice(0, this.open.length - 2e3);
    }
  }
  matches(e, c) {
    return Math.abs(e.t - c.t) > (c.head ? 3e3 : 400) ? !1 : headMatches(e.text, c.head);
  }
  /** Console calls seen by a scene script; returns the entries whose source changed. */
  onCalls(batch) {
    let changed = [], calls = batch.calls || [];
    this.expire();
    for (let k = 0; k < calls.length; k++) {
      let c = calls[k], hit = -1;
      for (let i = 0; i < this.open.length; i++) {
        let e = this.open[i];
        if (e.level === c.level && this.matches(e, c)) {
          hit = i;
          break;
        }
      }
      if (hit >= 0) {
        let e = this.open[hit];
        this.open.splice(hit, 1), e.sure = !0, e.source !== batch.source && (e.source = batch.source, changed.push({ id: e.id, source: e.source }));
      } else
        this.pending.push({ source: batch.source, level: c.level, head: c.head, t: c.t, at: this.now() });
    }
    return this.pending.length > 2e3 && this.pending.splice(0, this.pending.length - 2e3), changed;
  }
  expire() {
    let now = this.now();
    for (; this.pending.length && now - this.pending[0].at > 1500; ) this.pending.shift();
    for (; this.open.length && now - this.open[0].t > 5e3; ) this.open.shift();
  }
  clear() {
    this.open = [], this.pending = [];
  }
};

// source/main/resolve.ts
var fs = __toESM(require("fs")), path = __toESM(require("path"));

// source/shared/csharp.ts
var HEADER_RE = /^﻿?\s*\/\/\s*<auto-generated>\s*from\s+([^\s]+?\.cs)\b/i;
function generatedFrom(firstLine) {
  let m = HEADER_RE.exec(firstLine || "");
  return m ? m[1] : "";
}
var TS_SKIP = /^(if|for|while|switch|catch|return|function|else|do|try|with|typeof|new|super|await|yield)$/;
function tsMemberAt(lines, index) {
  let member = null;
  for (let i = index; i >= 0; i--) {
    let s = lines[i];
    if (!member) {
      let m = /^\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set)\s+)*(constructor|[A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\([^;]*$/.exec(s);
      m && !TS_SKIP.test(m[1]) && /\{\s*$|\)\s*(?::[^=]+)?$/.test(s) && (member = { name: m[1], line: i });
    }
    let c = /\bclass\s+([A-Za-z_$][\w$]*)/.exec(s);
    if (c) return member ? { name: member.name, line: member.line, className: c[1] } : null;
  }
  return member ? { name: member.name, line: member.line, className: "" } : null;
}
function csMemberLine(lines, name, className, from) {
  let isCtor = name === "constructor", ident = isCtor ? className : name;
  if (!ident) return -1;
  let re = new RegExp("^\\s*(?:\\[[^\\]]*\\]\\s*)*(?:(?:public|private|protected|internal|static|override|virtual|async|abstract|sealed|new|extern|unsafe|partial)\\s+)*" + (isCtor ? "" : "[\\w<>\\[\\],.?]+\\s+") + escapeRe(ident) + "\\s*(?:<[^>()]*>)?\\s*\\(");
  for (let i = Math.max(0, from); i < lines.length; i++) if (re.test(lines[i])) return i;
  let prop = new RegExp("\\b" + escapeRe(ident) + "\\b\\s*(?:\\{|=>)");
  for (let i = Math.max(0, from); i < lines.length; i++) if (prop.test(lines[i])) return i;
  return -1;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var TOKEN_SKIP = /^(this|const|let|var|new|return|void|number|string|boolean|double|float|int|long|bool|null|undefined|true|false|as|of|in|is|public|private|protected|static|readonly|override)$/;
function tokens(line) {
  let out = [], re = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?/g, m;
  for (; m = re.exec(line); ) {
    let t = m[0].toLowerCase().replace(/^_+/, "") || m[0];
    TOKEN_SKIP.test(t) || out.push(t);
  }
  return out;
}
function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  let setB = {};
  for (let i = 0; i < b.length; i++) setB[b[i]] = (setB[b[i]] || 0) + 1;
  let common = 0;
  for (let i = 0; i < a.length; i++)
    setB[a[i]] && (setB[a[i]]--, common++);
  return 2 * common / (a.length + b.length);
}
function blockEnd(lines, start) {
  let depth = 0, opened = !1;
  for (let i = start; i < lines.length; i++) {
    let s = lines[i].replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*$/g, "");
    for (let k = 0; k < s.length; k++)
      if (s[k] === "{")
        depth++, opened = !0;
      else if (s[k] === "}" && (depth--, opened && depth <= 0))
        return i + 1;
    if (!opened && i > start && /;\s*$/.test(s)) return i + 1;
  }
  return lines.length;
}
function isCodeLine(s) {
  let t = s.trim();
  return !!t && !/^[{}]+;?$/.test(t) && !/^\/\//.test(t) && !/^\[.*\]$/.test(t);
}
function mapTsLineToCs(ts, cs, tsLine) {
  let tl = ts.split(/\r?\n/), cl = cs.split(/\r?\n/), idx = Math.min(Math.max(0, tsLine - 1), tl.length - 1), want = tokens(tl[idx] || ""), from = 0, to = cl.length, expected = -1, member = tsMemberAt(tl, idx);
  if (member) {
    let classLine = 0;
    if (member.className) {
      let cre = new RegExp("\\bclass\\s+" + escapeRe(member.className) + "\\b");
      for (let i = 0; i < cl.length; i++) if (cre.test(cl[i])) {
        classLine = i;
        break;
      }
    }
    let ml = csMemberLine(cl, member.name, member.className, classLine);
    if (ml >= 0) {
      from = ml, to = blockEnd(cl, ml);
      let n = 0;
      for (let i = member.line + 1; i <= idx; i++) isCodeLine(tl[i]) && n++;
      expected = ml;
      for (let i = ml + 1; i < to && n > 0; i++)
        isCodeLine(cl[i]) && (n--, expected = i);
      if (idx === member.line) return ml + 1;
    }
  }
  let best = -1, bestScore = 0;
  for (let i = from; i < to; i++) {
    let score = similarity(want, tokens(cl[i]));
    expected >= 0 && (score -= Math.min(0.15, Math.abs(i - expected) * 0.01)), score > bestScore && (bestScore = score, best = i);
  }
  return best >= 0 && bestScore >= 0.3 ? best + 1 : expected >= 0 ? expected + 1 : best >= 0 ? best + 1 : 1;
}

// source/shared/sourcemap.ts
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", B64_INDEX = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;
function decodeMappings(mappings) {
  let lines = [], cur = [], genCol = 0, src = 0, origLine = 0, origCol = 0, name = 0, seg = [0, 0, 0, 0, 0], segLen = 0, value = 0, shift = 0, endSegment = () => {
    segLen !== 0 && (genCol += seg[0], segLen >= 4 && (src += seg[1], origLine += seg[2], origCol += seg[3], segLen >= 5 && (name += seg[4]), cur.push(genCol, src, origLine, origCol)), segLen = 0);
  };
  for (let i = 0; i < mappings.length; i++) {
    let c = mappings[i];
    if (c === ",") {
      endSegment();
      continue;
    }
    if (c === ";") {
      endSegment(), lines.push(cur), cur = [], genCol = 0;
      continue;
    }
    let digit = B64_INDEX[c];
    if (digit !== void 0)
      if (value += (digit & 31) << shift, digit & 32)
        shift += 5;
      else {
        let negative = value & 1;
        value >>>= 1, segLen < 5 && (seg[segLen++] = negative ? -value : value), value = 0, shift = 0;
      }
  }
  endSegment(), lines.push(cur);
  for (let l = 0; l < lines.length; l++) {
    let a = lines[l], sorted = !0;
    for (let k = 4; k < a.length; k += 4) a[k] < a[k - 4] && (sorted = !1);
    if (!sorted) {
      let quads = [];
      for (let k = 0; k < a.length; k += 4) quads.push([a[k], a[k + 1], a[k + 2], a[k + 3]]);
      quads.sort((x, y) => x[0] - y[0]), lines[l] = [].concat.apply([], quads);
    }
  }
  return lines;
}
function parseSourceMap(json) {
  let o;
  try {
    o = typeof json == "string" ? JSON.parse(json) : json;
  } catch {
    return null;
  }
  return !o || typeof o.mappings != "string" || !Array.isArray(o.sources) ? null : { sources: o.sources.map(String), sourceRoot: String(o.sourceRoot || ""), lines: decodeMappings(o.mappings) };
}
function originalPosition(map, line, col) {
  let segs = map.lines[line - 1];
  if (!segs || !segs.length) return null;
  let target = Math.max(0, col - 1), lo = 0, hi = segs.length / 4 - 1, best = 0;
  for (; lo <= hi; ) {
    let mid = lo + hi >> 1;
    segs[mid * 4] <= target ? (best = mid, lo = mid + 1) : hi = mid - 1;
  }
  let k = best * 4, source = map.sources[segs[k + 1]];
  return source === void 0 ? null : { source: map.sourceRoot && !/^[a-z]+:/i.test(source) ? map.sourceRoot.replace(/\/?$/, "/") + source : source, line: segs[k + 2] + 1, col: segs[k + 3] + 1 };
}
function sourceMappingUrl(code) {
  let m = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m.exec(code.slice(-4e3));
  return m ? m[1] : "";
}

// source/shared/urls.ts
var CHUNK_RE = /(?:^|[/\\])chunks[/\\]([0-9a-f]{2})[/\\]([0-9a-f]{16,64})\.js$/i;
function stripQuery(url) {
  return url.replace(/[?#].*$/, "");
}
function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
function fileUrlToPath(url) {
  let p = stripQuery(url).replace(/^file:\/\//i, "");
  return /^\/[A-Za-z]:[/\\]/.test(p) ? p = p.slice(1) : /^[^/]+\/[A-Za-z]:\//.test(p) && (p = p.slice(p.indexOf("/") + 1)), decode(p);
}
function classifyUrl(raw) {
  let url = (raw || "").trim();
  if (!url || url === "<anonymous>" || url === "native" || /^<.*>$/.test(url)) return { kind: "none" };
  let clean = stripQuery(url), chunk = CHUNK_RE.exec(clean);
  if (chunk) {
    let target = /targets[/\\]editor[/\\]/i.test(clean) ? "editor" : /targets[/\\]preview[/\\]|^https?:|\/scripting\//i.test(clean) ? "preview" : "";
    return { kind: "chunk", chunk: { shard: chunk[1].toLowerCase(), id: chunk[2].toLowerCase(), target } };
  }
  let m = /^db:\/\/([^/]+)\/?(.*)$/i.exec(clean);
  return m ? { kind: "db", name: m[1], rel: decode(m[2]) } : (m = /^packages:\/\/([^/]+)\/?(.*)$/i.exec(clean), m ? { kind: "package", name: m[1], rel: decode(m[2]) } : /^file:\/\//i.test(clean) ? { kind: "file", path: fileUrlToPath(clean) } : /^[A-Za-z]:[/\\]/.test(clean) || /^\\\\/.test(clean) ? { kind: "file", path: clean } : /^https?:\/\//i.test(clean) ? { kind: "web", path: clean } : /^(cce|node|internal|electron|chrome|devtools|extensions|webpack|blob|data):/i.test(clean) || /^internal[/\\]/.test(clean) ? { kind: "internal" } : clean.charAt(0) === "/" ? { kind: "file", path: clean } : /^(assets|extensions)[/\\]/i.test(clean) ? { kind: "file", path: clean } : { kind: "none" });
}
function normPath(p) {
  let s = (p || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(s) && (s = s.toLowerCase()), s;
}
function joinPath(root, rel) {
  let r = (root || "").replace(/[\\/]+$/, ""), t = (rel || "").replace(/^[\\/]+/, "");
  return t ? r + "/" + t : r;
}
function chunkFile(projectRoot2, chunk, target) {
  return joinPath(projectRoot2, "temp/programming/packer-driver/targets/" + target + "/chunks/" + chunk.shard + "/" + chunk.id + ".js");
}
function isInside(file, dir) {
  let f = normPath(file), d = normPath(dir);
  return !!d && (f === d || f.startsWith(d + "/"));
}
function displayPath(file, projectRoot2) {
  return !projectRoot2 || !isInside(file, projectRoot2) ? file.replace(/\\/g, "/") : file.replace(/\\/g, "/").slice(projectRoot2.replace(/\\/g, "/").replace(/\/+$/, "").length + 1);
}
function isUserFile(file, projectRoot2) {
  if (!file || !projectRoot2 || !isInside(file, projectRoot2)) return !1;
  let rel = normPath(displayPath(file, projectRoot2)).toLowerCase();
  return !(/(^|\/)node_modules\//.test(rel) || /^(temp|library|build|local|profiles|settings|native)\//.test(rel));
}
function staticPath(info, projectRoot2) {
  switch (info.kind) {
    case "file":
      return info.path || "";
    case "db":
      return info.name === "assets" ? joinPath(projectRoot2, "assets/" + (info.rel || "")) : "";
    default:
      return "";
  }
}

// source/main/resolve.ts
var MAX_MAP_BYTES = 30 * 1024 * 1024, FrameResolver = class {
  constructor(host) {
    this.host = host;
    this.maps = /* @__PURE__ */ new Map();
    this.texts = /* @__PURE__ */ new Map();
  }
  mtime(file) {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return -1;
    }
  }
  exists(file) {
    return !!file && this.mtime(file) >= 0;
  }
  readText(file) {
    let m = this.mtime(file);
    if (m < 0) return "";
    let c = this.texts.get(file);
    if (c && c.mtime === m) return c.value;
    let value = "";
    try {
      value = fs.readFileSync(file, "utf8");
    } catch {
      value = "";
    }
    return this.texts.size > 200 && this.texts.clear(), this.texts.set(file, { mtime: m, value }), value;
  }
  /** The source map of a compiled script (sibling .map, sourceMappingURL file or inline data url). */
  mapOf(jsFile) {
    let m = this.mtime(jsFile);
    if (m < 0) return null;
    let c = this.maps.get(jsFile);
    if (c && c.mtime === m) return c.value;
    let value = null;
    try {
      let code = this.readText(jsFile), ref = sourceMappingUrl(code), json = "", mapFile = jsFile + ".map";
      if (/^data:/i.test(ref)) {
        let comma = ref.indexOf(",");
        json = /;base64/i.test(ref.slice(0, comma)) ? Buffer.from(ref.slice(comma + 1), "base64").toString("utf8") : decodeURIComponent(ref.slice(comma + 1)), mapFile = jsFile;
      } else
        ref && (mapFile = /^file:/i.test(ref) ? fileUrlToPath(ref) : path.resolve(path.dirname(jsFile), ref)), this.exists(mapFile) && fs.statSync(mapFile).size < MAX_MAP_BYTES && (json = fs.readFileSync(mapFile, "utf8"));
      let map = json ? parseSourceMap(json) : null;
      value = map ? { map, mapFile } : null;
    } catch {
      value = null;
    }
    return this.maps.size > 300 && this.maps.clear(), this.maps.set(jsFile, { mtime: m, value }), value;
  }
  sourceToPath(source, mapFile) {
    if (/^file:/i.test(source)) return fileUrlToPath(source);
    if (/^[A-Za-z]:[\\/]/.test(source) || source.charAt(0) === "/") return source;
    if (/^[a-z][\w+.-]*:/i.test(source)) {
      let db = /^db:\/\/assets\/(.*)$/i.exec(source);
      return db ? path.join(this.host.projectRoot, "assets", db[1]) : "";
    }
    return path.resolve(path.dirname(mapFile), source);
  }
  /** The file of a url (before source maps), or ''. */
  async fileOf(url) {
    let info = classifyUrl(url), root = this.host.projectRoot;
    switch (info.kind) {
      case "chunk": {
        let order = info.chunk.target === "preview" ? ["preview", "editor"] : ["editor", "preview"];
        for (let i = 0; i < order.length; i++) {
          let f = chunkFile(root, info.chunk, order[i]);
          if (this.exists(f)) return f;
        }
        return "";
      }
      case "db": {
        let p = staticPath(info, root);
        if (p) return p;
        if (info.name === "internal") return "";
        try {
          return await this.host.queryDbPath("db://" + info.name + "/" + (info.rel || "")) || "";
        } catch {
          return "";
        }
      }
      case "package": {
        let dir = this.host.packagePath(info.name || "");
        return dir ? path.join(dir, info.rel || "") : "";
      }
      case "file": {
        let p = info.path || "";
        return p && !path.isAbsolute(p) && !/^[A-Za-z]:/.test(p) ? path.join(root, p) : p;
      }
      default:
        return "";
    }
  }
  async resolve(frame) {
    let root = this.host.projectRoot, file = await this.fileOf(frame.url), line = frame.line, col = frame.col, mapped = !1;
    if (!file || !this.exists(file))
      return { file: "", line, col, display: frame.url || frame.raw, user: !1 };
    if (/\.m?js$/i.test(file) && isInside(file, root) && line > 0) {
      let sm = this.mapOf(file);
      if (sm) {
        let pos = originalPosition(sm.map, line, col);
        if (pos) {
          let src = this.sourceToPath(pos.source, sm.mapFile);
          src && this.exists(src) && (file = src, line = pos.line, col = pos.col, mapped = !0);
        }
      }
    }
    file = path.normalize(file);
    let out = { file, line, col, display: displayPath(file, root) + (line ? ":" + line + (col ? ":" + col : "") : ""), user: isUserFile(file, root), mapped }, cs = this.csharpOf(file, line);
    return cs && (out.cs = cs), out;
  }
  /** For a .ts written by the csharp extension: its .cs file and the approximate line. */
  csharpOf(tsFile, tsLine) {
    if (!/\.ts$/i.test(tsFile)) return;
    let ts = this.readText(tsFile);
    if (!ts) return;
    let from = generatedFrom(ts.slice(0, 400).split(/\r?\n/)[0]);
    if (!from) return;
    let csFile = path.join(path.dirname(tsFile), from);
    if (!this.exists(csFile)) return;
    let line = tsLine > 0 ? mapTsLineToCs(ts, this.readText(csFile), tsLine) : 1;
    return { file: csFile, line, display: displayPath(csFile, this.host.projectRoot) + ":" + line };
  }
};

// source/shared/editor-launch.ts
function baseName(p) {
  return (p || "").replace(/\\/g, "/").split("/").pop().toLowerCase();
}
function splitArgs(s) {
  let out = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g, m;
  for (; m = re.exec(s || ""); ) out.push(m[1] !== void 0 ? m[1] : m[2] !== void 0 ? m[2] : m[3]);
  return out;
}
var PLACEHOLDER = /\$\{(file|line|col|column|project|root)\}|\{(file|line|col|column|project|root)\}|%(file|line|col|column|project|root)%|\$\((file|line|col|column|project|root)\)/gi;
function hasPlaceholders(commandArgument) {
  return PLACEHOLDER.lastIndex = 0, PLACEHOLDER.test(commandArgument || "");
}
function fill(arg, file, line, col, root) {
  return arg.replace(PLACEHOLDER, (_all, a, b, c, d) => {
    let k = String(a || b || c || d).toLowerCase();
    return k === "file" ? file : k === "line" ? String(line || 1) : k === "col" || k === "column" ? String(col || 1) : root;
  });
}
function editorKind(exe) {
  let b = baseName(exe);
  return /^(code|code - insiders|codium|vscodium|cursor|windsurf|trae)(\.exe|\.cmd)?$/.test(b) || /visual studio code/i.test(exe) ? "vscode" : /^(rider|webstorm|idea|phpstorm|pycharm|clion|goland|rubymine)(64)?(\.exe|\.sh|\.bat)?$/.test(b) ? "jetbrains" : /^(sublime_text|subl|zed|atom)(\.exe)?$/.test(b) ? "sublime" : /^notepad\+\+(\.exe)?$/.test(b) ? "notepad++" : /^devenv(\.exe)?$/.test(b) ? "visualstudio" : /^g?n?vim?(-qt)?(\.exe)?$/.test(b) ? "vim" : "generic";
}
function launchFor(exe, file, line, col, projectRoot2, commandArgument = "") {
  let ln = Math.max(1, line || 1), cl = Math.max(1, col || 1);
  if (commandArgument && hasPlaceholders(commandArgument))
    return { cmd: exe, args: splitArgs(commandArgument).map((a) => fill(a, file, ln, cl, projectRoot2)) };
  switch (editorKind(exe)) {
    case "vscode":
      return { cmd: exe, args: projectRoot2 ? [projectRoot2, "-g", file + ":" + ln + ":" + cl] : ["-g", file + ":" + ln + ":" + cl] };
    case "jetbrains":
      return { cmd: exe, args: ["--line", String(ln), "--column", String(cl), file] };
    case "sublime":
      return { cmd: exe, args: [file + ":" + ln + ":" + cl] };
    case "notepad++":
      return { cmd: exe, args: ["-n" + ln, "-c" + cl, file] };
    case "visualstudio":
      return { cmd: exe, args: ["/Edit", file] };
    case "vim":
      return { cmd: exe, args: ["+" + ln, file] };
    default:
      return { cmd: exe, args: [file] };
  }
}
function vsCodeCandidates(env, platform) {
  if (platform === "win32") {
    let local = env.LOCALAPPDATA || "", pf = env.ProgramFiles || "C:\\Program Files", pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", out = [];
    return local && out.push(local + "\\Programs\\Microsoft VS Code\\Code.exe"), out.push(pf + "\\Microsoft VS Code\\Code.exe", pf86 + "\\Microsoft VS Code\\Code.exe"), local && out.push(local + "\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe", local + "\\Programs\\cursor\\Cursor.exe"), out;
  }
  return platform === "darwin" ? ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", (env.HOME || "") + "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", "/usr/local/bin/code", "/opt/homebrew/bin/code"] : ["/usr/bin/code", "/usr/local/bin/code", "/snap/bin/code"];
}
function programInfo(v) {
  return v ? typeof v == "string" ? v.trim() ? { path: v.trim(), commandArgument: "" } : null : typeof v == "object" && typeof v.path == "string" && v.path.trim() ? { path: v.path.trim(), commandArgument: String(v.commandArgument || "") } : null : null;
}

// source/shared/ring.ts
var RingBuffer = class {
  constructor(cap) {
    this.cap = cap;
    this.start = 0;
    this.count = 0;
    this.cap = Math.max(1, Math.floor(cap)), this.buf = new Array(this.cap);
  }
  get capacity() {
    return this.cap;
  }
  get size() {
    return this.count;
  }
  push(item) {
    this.count < this.cap ? (this.buf[(this.start + this.count) % this.cap] = item, this.count++) : (this.buf[this.start] = item, this.start = (this.start + 1) % this.cap);
  }
  /** i = 0 is the oldest item. */
  get(i) {
    if (!(i < 0 || i >= this.count))
      return this.buf[(this.start + i) % this.cap];
  }
  /** The newest items first, walking back while `fn` returns true. */
  forEachNewest(fn) {
    for (let i = this.count - 1; i >= 0; i--) if (!fn(this.buf[(this.start + i) % this.cap])) return;
  }
  toArray() {
    let out = new Array(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.buf[(this.start + i) % this.cap];
    return out;
  }
  clear() {
    this.buf = new Array(this.cap), this.start = 0, this.count = 0;
  }
  /** Changes the capacity, keeping the newest items. */
  resize(cap) {
    let items = this.toArray();
    this.cap = Math.max(1, Math.floor(cap)), this.clear();
    let from = Math.max(0, items.length - this.cap);
    for (let i = from; i < items.length; i++) this.push(items[i]);
  }
  /** Removes the items for which `fn` returns false (keeps order). */
  filter(fn) {
    let items = this.toArray();
    this.clear();
    for (let i = 0; i < items.length; i++) fn(items[i]) && this.push(items[i]);
  }
};

// source/shared/types.ts
var DEFAULT_CONFIG = {
  errorPause: !1,
  clearOnPlay: !1,
  capacity: 5e4,
  sceneHook: !0
};

// source/main.ts
var PKG = "console-pro", TAG = "[Console Pro]", HISTORY_KEEP = 1e4, S = {
  config: Object.assign({}, DEFAULT_CONFIG),
  ring: new RingBuffer(DEFAULT_CONFIG.capacity),
  nextId: 1,
  outbox: [],
  retags: [],
  flushTimer: null,
  saveTimer: null,
  dirty: !1,
  clearedAt: 0,
  play: { playing: !1, paused: !1 },
  playKnown: !1,
  lastPause: 0,
  follower: null,
  tagger: new SourceTagger(),
  resolver: null,
  /** Last time each scene process reported (diagnostics). */
  sceneSeen: {},
  inHandler: !1
};
function projectRoot() {
  try {
    return Editor.Project.path;
  } catch {
    return process.cwd();
  }
}
function historyFile() {
  return path2.join(projectRoot(), "temp", PKG, "history.json");
}
function broadcast(name, payload) {
  try {
    Editor.Message.broadcast(PKG + ":" + name, payload);
  } catch {
  }
}
function scheduleFlush() {
  S.flushTimer || (S.flushTimer = setTimeout(flush, 50));
}
function flush() {
  if (S.flushTimer = null, S.outbox.length) {
    let out = S.outbox;
    S.outbox = [];
    for (let i = 0; i < out.length; i += 5e3) broadcast("entries", out.slice(i, i + 5e3));
  }
  if (S.retags.length) {
    let r = S.retags;
    S.retags = [], broadcast("retag", r);
  }
}
function push(e) {
  S.ring.push(e), S.outbox.push(e), S.dirty = !0, e.level === "error" && e.source === "game" && maybeErrorPause(), scheduleFlush();
}
function onRecords(records) {
  if (!S.inHandler) {
    S.inHandler = !0;
    try {
      for (let i = 0; i < records.length; i++) {
        let e = toEntry(records[i], S.nextId++);
        S.tagger.onEntry(e), push(e);
      }
    } catch {
    } finally {
      S.inHandler = !1;
    }
  }
}
function onLoggerClear() {
}
function clearAll() {
  S.ring.clear(), S.outbox = [], S.retags = [], S.tagger.clear(), S.clearedAt = Date.now(), S.dirty = !0, broadcast("cleared");
}
function setPlay(next) {
  let was = S.play.playing;
  S.play = { playing: !!next.playing, paused: !!next.paused }, S.playKnown = !0, !was && S.play.playing && S.config.clearOnPlay && clearAll(), broadcast("play-state", S.play);
}
function maybeErrorPause() {
  if (!S.config.errorPause || S.playKnown && (!S.play.playing || S.play.paused)) return;
  let now = Date.now();
  now - S.lastPause < 1e3 || (S.lastPause = now, Promise.resolve(Editor.Message.request("scene", "editor-preview-call-method", "pause", !0)).then(() => {
    S.play = { playing: !0, paused: !0 }, broadcast("play-state", { playing: !0, paused: !0, reason: "error-pause" });
  }).catch(() => {
  }));
}
function addUncaught(source, err) {
  setTimeout(() => {
    let head = String(err.message || "").replace(/^Uncaught\s+/, "").slice(0, 80);
    if (!head) return;
    let dup = !1;
    if (S.ring.forEachNewest((e) => err.t - e.t > 5e3 ? !1 : e.level === "error" && (e.text.indexOf(head) >= 0 || e.stack && e.stack.indexOf(head) >= 0) ? (dup = !0, !1) : !0), dup) return;
    let text = (err.kind === "rejection" ? "Uncaught (in promise) " : "Uncaught ") + err.message;
    push({ id: S.nextId++, t: err.t || Date.now(), level: "error", text, stack: String(err.stack || ""), source, tag: detectTag(String(err.message || "")), uncaught: !0, sure: !0 });
  }, 700);
}
function saveHistory(sync) {
  if (!S.dirty) return;
  S.dirty = !1;
  let all = S.ring.toArray(), entries = all.slice(Math.max(0, all.length - HISTORY_KEEP)).map((e) => e.stack.length > 8e3 ? Object.assign({}, e, { stack: e.stack.slice(0, 8e3) }) : e), data = JSON.stringify({ version: 1, pid: process.pid, clearedAt: S.clearedAt, entries });
  try {
    fs2.mkdirSync(path2.dirname(historyFile()), { recursive: !0 }), sync ? fs2.writeFileSync(historyFile(), data) : fs2.writeFile(historyFile(), data, () => {
    });
  } catch {
  }
}
function loadHistory() {
  try {
    let o = JSON.parse(fs2.readFileSync(historyFile(), "utf8"));
    if (o && o.version === 1 && o.pid === process.pid && Array.isArray(o.entries)) return { entries: o.entries, clearedAt: Number(o.clearedAt) || 0 };
  } catch {
  }
  return { entries: [], clearedAt: 0 };
}
function cachedElectronLogger() {
  let cache = require.cache || {}, keys = Object.keys(cache);
  for (let i = 0; i < keys.length; i++) {
    if (!/@base[\\/]electron-logger[\\/](index\.js|lib[\\/]browser[\\/]index\.js)$/.test(keys[i])) continue;
    let m = cache[keys[i]] && cache[keys[i]].exports;
    if (m && typeof m.on == "function" && typeof m.query == "function") return m;
  }
  return null;
}
function loggerApi() {
  let L = Editor.Logger, prot = L && L.__protected__, api = { query: () => L && typeof L.query == "function" ? L.query() : [] };
  if (prot && typeof prot.on == "function")
    api.on = (a, f) => prot.on(a, f), typeof prot.removeListener == "function" && (api.off = (a, f) => prot.removeListener(a, f));
  else {
    let hub = cachedElectronLogger();
    hub && (api.on = (a, f) => hub.on(a, f), api.off = (a, f) => hub.removeListener(a, f));
  }
  return api;
}
function exists(file) {
  try {
    return !!file && fs2.existsSync(file);
  } catch {
    return !1;
  }
}
async function scriptEditor() {
  try {
    let info = programInfo(await Editor.Message.request("program", "query-program-info", "scriptEditor"));
    if (info && exists(info.path)) return info;
  } catch {
  }
  try {
    let info = programInfo(await Editor.Profile.getConfig("program", "scriptEditor"));
    if (info && exists(info.path)) return info;
  } catch {
  }
  return null;
}
function spawnDetached(cmd, args, shell = !1) {
  let { spawn } = require("child_process"), quoted = shell ? args.map((a) => /[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a) : args, child = spawn(cmd, quoted, { detached: !0, stdio: "ignore", windowsHide: !1, shell });
  child.on("error", () => {
  }), child.unref();
}
async function openInEditor(file, line, col) {
  if (!exists(file)) return { ok: !1, via: "missing file" };
  let root = projectRoot(), pref = await scriptEditor();
  if (pref && !/\.app$/i.test(pref.path)) {
    let l = launchFor(pref.path, file, line, col, root, pref.commandArgument);
    return spawnDetached(l.cmd, l.args), { ok: !0, via: path2.basename(pref.path) };
  }
  let candidates = vsCodeCandidates(process.env, process.platform);
  for (let i = 0; i < candidates.length; i++) {
    if (!exists(candidates[i])) continue;
    let l = launchFor(candidates[i], file, line, col, root);
    return spawnDetached(l.cmd, l.args), { ok: !0, via: path2.basename(candidates[i]) };
  }
  try {
    let { spawnSync } = require("child_process");
    if (spawnSync(process.platform === "win32" ? "where" : "which", ["code"], { encoding: "utf8", windowsHide: !0 }).status === 0) {
      let l = launchFor("code", file, line, col, root);
      return spawnDetached("code", l.args, !0), { ok: !0, via: "code" };
    }
  } catch {
  }
  return { ok: !await require("electron").shell.openPath(file), via: "system" };
}
function plain(v) {
  return JSON.parse(JSON.stringify(v === void 0 ? null : v));
}
var methods = {
  openPanel() {
    Editor.Panel.open(PKG + ".console");
  },
  openCocosConsole() {
    Editor.Panel.open("console");
  },
  async openDocs() {
    try {
      await require("electron").shell.openPath(path2.join(__dirname, "..", "README.md"));
    } catch (e) {
      console.warn(TAG + " Could not open the README:", e);
    }
  },
  /** Everything the panel needs when it opens. */
  queryLogs() {
    return { entries: S.ring.toArray(), config: S.config, play: S.play, mode: S.follower ? S.follower.mode : "none", projectRoot: projectRoot() };
  },
  clear() {
    return clearAll(), !0;
  },
  getConfig() {
    return S.config;
  },
  async setConfig(key, value) {
    if (!(key in DEFAULT_CONFIG)) return S.config;
    let def = DEFAULT_CONFIG[key], v = value;
    typeof def == "boolean" && (v = !!value), typeof def == "number" && (v = Math.max(1e3, Math.min(5e5, Math.floor(Number(value) || def)))), S.config[key] = v, key === "capacity" && S.ring.resize(v);
    try {
      await Editor.Profile.setConfig(PKG, key, v);
    } catch {
    }
    return broadcast("config", S.config), S.config;
  },
  async resolveFrames(frames) {
    let r = S.resolver, list = Array.isArray(frames) ? frames.slice(0, 60) : [], out = [];
    for (let i = 0; i < list.length; i++)
      try {
        out.push(r ? await r.resolve(list[i]) : { file: "", line: 0, col: 0, display: list[i].url, user: !1 });
      } catch {
        out.push({ file: "", line: list[i].line, col: list[i].col, display: list[i].url || list[i].raw, user: !1 });
      }
    return plain(out);
  },
  async openLocation(loc) {
    if (!loc || !loc.file) return { ok: !1, via: "no file" };
    try {
      return await openInEditor(loc.file, Number(loc.line) || 1, Number(loc.col) || 1);
    } catch (e) {
      return console.warn(TAG + " Could not open " + loc.file + ":", e), { ok: !1, via: String(e) };
    }
  },
  copyText(text) {
    return require("electron").clipboard.writeText(String(text || "")), !0;
  },
  async exportText(text, suggested) {
    let name = String(suggested || "console.log").replace(/[\\/:*?"<>|]/g, "_"), r = await Editor.Dialog.save({
      title: "Export Console",
      path: path2.join(projectRoot(), name),
      filters: [
        { name: "Log file", extensions: ["log"] },
        { name: "Text file", extensions: ["txt"] }
      ]
    }), file = r && (r.filePath || (typeof r == "string" ? r : ""));
    return !file || r && r.canceled ? "" : (fs2.writeFileSync(file, String(text || ""), "utf8"), file);
  },
  /** Batches from the scene script (scene and PIE processes). */
  sceneEvents(batch) {
    if (!(!batch || batch.source !== "scene" && batch.source !== "game")) {
      if (S.sceneSeen[batch.source] = Date.now(), batch.play && setPlay(batch.play), batch.calls && batch.calls.length) {
        let changed = S.tagger.onCalls(batch);
        if (changed.length) {
          for (let i = 0; i < changed.length; i++) S.retags.push(changed[i]);
          if (changed.some((c) => c.source === "game")) {
            let ids = {};
            changed.forEach((c) => ids[c.id] = !0);
            let error = !1;
            S.ring.forEachNewest((e) => (ids[e.id] && e.level === "error" && (error = !0), !error && Date.now() - e.t < 1e4)), error && maybeErrorPause();
          }
          S.dirty = !0, scheduleFlush();
        }
      }
      if (batch.errors) for (let i = 0; i < batch.errors.length; i++) addUncaught(batch.source, batch.errors[i]);
    }
  },
  /** Broadcast scene:preview-stop. */
  onPreviewStop() {
    setPlay({ playing: !1, paused: !1 });
  },
  /** Diagnostics for the panel's menu. */
  status() {
    return plain({
      mode: S.follower ? S.follower.mode : "none",
      loggerProtectedApi: !!(Editor.Logger && Editor.Logger.__protected__ && Editor.Logger.__protected__.on),
      entries: S.ring.size,
      capacity: S.ring.capacity,
      nextId: S.nextId,
      play: S.play,
      playKnown: S.playKnown,
      sceneScriptSeen: S.sceneSeen,
      config: S.config
    });
  }
};
async function load() {
  try {
    let keys = Object.keys(DEFAULT_CONFIG);
    for (let i = 0; i < keys.length; i++) {
      let v = await Editor.Profile.getConfig(PKG, keys[i]);
      v != null && typeof v == typeof DEFAULT_CONFIG[keys[i]] && (S.config[keys[i]] = v);
    }
  } catch {
  }
  S.ring = new RingBuffer(S.config.capacity), S.resolver = new FrameResolver({
    projectRoot: projectRoot(),
    queryDbPath: async (url) => String(await Editor.Message.request("asset-db", "query-path", url) || ""),
    packagePath: (name) => {
      try {
        let list = Editor.Package.getPackages({ name }) || [];
        return list.length ? String(list[0].path || "") : "";
      } catch {
        return "";
      }
    }
  });
  let saved = loadHistory();
  S.clearedAt = saved.clearedAt, S.follower = new LoggerFollower(loggerApi(), onRecords, onLoggerClear);
  let existing = S.follower.start(), fromLogger = [];
  for (let i = 0; i < existing.length; i++) {
    let e = toEntry(existing[i], 0);
    e.t > S.clearedAt && fromLogger.push(e);
  }
  let firstT = existing.length ? toEntry(existing[0], 0).t : 1 / 0, all = saved.entries.filter((e) => e && e.t < firstT && e.t > S.clearedAt).concat(fromLogger);
  for (let i = 0; i < all.length; i++)
    all[i].id = S.nextId++, S.ring.push(all[i]);
  S.saveTimer = setInterval(() => saveHistory(!1), 2e4);
}
function unload() {
  S.follower && S.follower.stop(), S.flushTimer && clearTimeout(S.flushTimer), S.saveTimer && clearInterval(S.saveTimer), S.dirty = !0, saveHistory(!0);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=main.js.map
