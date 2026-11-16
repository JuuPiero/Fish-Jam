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

// source/scene.ts
var scene_exports = {};
__export(scene_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(scene_exports);

// source/shared/tags.ts
var PIE_PREFIX_RE = /^\s*\[?\s*PreviewInEditor\s*\]?\s*:?\s*/;
function callHead(args) {
  if (!args || !args.length || typeof args[0] != "string") return "";
  let s = args[0], pct = s.search(/%[sdifjoOc%]/);
  return pct >= 0 && (s = s.slice(0, pct)), s.replace(PIE_PREFIX_RE, "").slice(0, 80);
}

// source/scene.ts
var PKG = "console-pro", METHODS = ["log", "info", "warn", "error"], g = globalThis, SOURCE = g.isPreviewProcess ? "game" : "scene", S = {
  calls: [],
  errors: [],
  play: null,
  lastPlay: "",
  timer: 0,
  poll: 0,
  restore: [],
  consoleRestore: [],
  consoleWrapped: !1,
  /** Set by the PreviewPlay.start / stop wrappers (more reliable than polling the state). */
  startStop: null
};
function send(batch) {
  try {
    g.Editor && g.Editor.Message && g.Editor.Message.send && g.Editor.Message.send(PKG, "scene-events", batch);
  } catch {
  }
}
function flush() {
  S.timer = 0;
  let batch = { source: SOURCE };
  S.calls.length && (batch.calls = S.calls.splice(0, S.calls.length)), S.errors.length && (batch.errors = S.errors.splice(0, S.errors.length)), S.play && (batch.play = S.play, S.play = null), (batch.calls || batch.errors || batch.play) && send(batch);
}
function queue(now = !1) {
  if (now) {
    S.timer && clearTimeout(S.timer), flush();
    return;
  }
  S.timer || (S.timer = setTimeout(flush, 40));
}
function wrapConsole() {
  if (S.consoleWrapped) return;
  let c = console;
  METHODS.forEach((level) => {
    let orig = c[level];
    if (typeof orig != "function") return;
    let wrapper = function() {
      try {
        S.calls.push({ level, head: callHead(Array.prototype.slice.call(arguments, 0, 1)), t: Date.now() }), S.calls.length > 5e3 && S.calls.splice(0, S.calls.length - 5e3), queue();
      } catch {
      }
      return orig.apply(this === void 0 ? console : this, arguments);
    };
    c[level] = wrapper, S.consoleRestore.push(() => {
      c[level] === wrapper && (c[level] = orig);
    });
  }), S.consoleWrapped = !0;
}
function unwrapConsole() {
  S.consoleRestore.splice(0).forEach((fn) => {
    try {
      fn();
    } catch {
    }
  }), S.consoleWrapped = !1;
}
function onError(ev) {
  if (!ev || typeof ev.message != "string") return;
  let err = ev.error, stack = err && err.stack ? String(err.stack) : "";
  !stack && ev.filename && (stack = "    at " + ev.filename + ":" + (ev.lineno || 0) + ":" + (ev.colno || 0)), S.errors.push({ message: String(ev.message).replace(/^Uncaught\s+/, ""), stack, t: Date.now(), kind: "error" }), queue();
}
function onRejection(ev) {
  let r = ev && ev.reason, message = r && r.message ? String(r.message) : String(r);
  S.errors.push({ message, stack: r && r.stack ? String(r.stack) : "", t: Date.now(), kind: "rejection" }), queue();
}
function previewPlay() {
  let cce = g.cce;
  return cce && cce.PreviewPlay || null;
}
function stateSaysPlaying(pp) {
  let st = pp._state;
  return typeof st == "number" ? st > 0 : typeof st != "string" || !st ? !1 : !/^(stop|stopped|none|idle|init|ready)$/i.test(st);
}
function reportPlay(now = !1) {
  let pp = previewPlay();
  if (!pp) return;
  let playing = S.startStop !== null ? S.startStop : stateSaysPlaying(pp), paused = !1;
  try {
    paused = playing && typeof pp.isPause == "function" ? !!pp.isPause() : !1;
  } catch {
    paused = !1;
  }
  let key = playing + "/" + paused;
  key !== S.lastPlay && (S.lastPlay = key, S.play = { playing, paused, t: Date.now() }, queue(now));
}
function hook(obj, key, make) {
  let orig = obj[key];
  if (typeof orig != "function") return;
  let wrapped = make(orig);
  obj[key] = wrapped, S.restore.push(() => {
    obj[key] === wrapped && (obj[key] = orig);
  });
}
var wrappedPreview = null;
function wrapPreviewPlay() {
  let pp = previewPlay();
  !pp || pp === wrappedPreview || (wrappedPreview = pp, hook(pp, "start", (orig) => function() {
    return S.startStop = !0, reportPlay(!0), orig.apply(this, arguments);
  }), hook(pp, "stop", (orig) => function() {
    let r = orig.apply(this, arguments);
    return Promise.resolve(r).then(
      () => {
        S.startStop = !1, reportPlay(!0);
      },
      () => {
      }
    ), r;
  }));
}
function load() {
  wrapConsole(), typeof window < "u" && window.addEventListener && (window.addEventListener("error", onError), window.addEventListener("unhandledrejection", onRejection), S.restore.push(() => {
    window.removeEventListener("error", onError), window.removeEventListener("unhandledrejection", onRejection);
  }));
  try {
    Promise.resolve(g.Editor.Message.request(PKG, "get-config")).then((cfg) => {
      cfg && cfg.sceneHook === !1 && unwrapConsole();
    }).catch(() => {
    });
  } catch {
  }
  SOURCE === "game" && (wrapPreviewPlay(), reportPlay(), S.poll = setInterval(() => {
    wrapPreviewPlay(), reportPlay();
  }, 250));
}
function unload() {
  S.poll && clearInterval(S.poll), S.timer && clearTimeout(S.timer), flush(), unwrapConsole(), S.restore.splice(0).forEach((fn) => {
    try {
      fn();
    } catch {
    }
  });
}
var methods = {
  /** Read-only state of this process (diagnostics). */
  cpState() {
    let pp = previewPlay();
    return { source: SOURCE, consoleWrapped: S.consoleWrapped, previewState: pp ? String(pp._state) : null, startStop: S.startStop };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
