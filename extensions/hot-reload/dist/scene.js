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

// source/core/patch.ts
var PROTO_SKIP = { constructor: !0 }, STATIC_SKIP = {
  length: !0,
  name: !0,
  prototype: !0,
  caller: !0,
  arguments: !0,
  _sealed: !0,
  // class decorators (compared, never copied)
  _executeInEditMode: !0,
  _requireComponent: !0,
  _disallowMultiple: !0,
  _executionOrder: !0,
  _playOnFocus: !0,
  _inspector: !0,
  _icon: !0,
  _help: !0
};
function isInternalKey(key) {
  return key.length > 2 && key.charAt(0) === "_" && key.charAt(1) === "_";
}
var DECORATOR_STATICS = ["_executeInEditMode", "_requireComponent", "_disallowMultiple", "_executionOrder", "_playOnFocus"], SCHEDULED_LIFECYCLE = ["update", "lateUpdate"];
function isStub(fn) {
  return typeof fn == "function" && fn.__hrStub === !0;
}
function makeStub(name, impl) {
  let stub = function() {
    return stub.__hrImpl.apply(this, arguments);
  };
  stub.__hrImpl = impl, stub.__hrStub = !0;
  try {
    Object.defineProperty(stub, "name", { value: name, configurable: !0 });
  } catch {
  }
  return stub;
}
function ownKeys(o) {
  return Object.getOwnPropertyNames(o);
}
function descriptorOf(o, key) {
  return Object.getOwnPropertyDescriptor(o, key);
}
function isMethodDescriptor(d) {
  return !!d && "value" in d && typeof d.value == "function";
}
function isAccessor(d) {
  return !!d && (typeof d.get == "function" || typeof d.set == "function");
}
function protoKeyAllowed(key) {
  return !PROTO_SKIP[key] && !isInternalKey(key);
}
function staticKeyAllowed(key) {
  return !STATIC_SKIP[key] && !isInternalKey(key);
}
function isClassLike(v) {
  if (typeof v != "function" || !v.prototype) return !1;
  if (/^class[\s{]/.test(Function.prototype.toString.call(v))) return !0;
  let p = v.prototype;
  return ownKeys(p).some((k) => k !== "constructor") || Object.getPrototypeOf(p) !== Object.prototype;
}
function instrument(C) {
  if (typeof C != "function" || !C.prototype) return 0;
  let n = 0, wrap = (target, key) => {
    let d = descriptorOf(target, key);
    if (!isMethodDescriptor(d) || isStub(d.value) || !d.configurable && !d.writable) return;
    let stub = makeStub(key, d.value);
    try {
      Object.defineProperty(target, key, { value: stub, writable: !0, configurable: !0, enumerable: !!d.enumerable }), n++;
    } catch {
    }
  }, proto = C.prototype;
  return ownKeys(proto).forEach((k) => {
    protoKeyAllowed(k) && wrap(proto, k);
  }), ownKeys(C).forEach((k) => {
    staticKeyAllowed(k) && wrap(C, k);
  }), n;
}
function compare(oldC, newC, opts = {}) {
  let reasons = [], oldBase = Object.getPrototypeOf(oldC), newBase = Object.getPrototypeOf(newC);
  if (opts.oldOf && newBase && opts.oldOf(newBase) && (newBase = opts.oldOf(newBase)), oldBase !== newBase && reasons.push("base class changed"), opts.propInfo) {
    let a = opts.propInfo(oldC), b = opts.propInfo(newC), pa = a.props || [], pb = b.props || [];
    pb.forEach((p) => {
      pa.indexOf(p) < 0 && reasons.push("new @property '" + p + "'");
    }), pa.forEach((p) => {
      pb.indexOf(p) < 0 && reasons.push("removed @property '" + p + "'");
    }), pb.forEach((p) => {
      pa.indexOf(p) >= 0 && (a.types[p] || "") !== (b.types[p] || "") && reasons.push("@property '" + p + "' changed type");
    });
  }
  return DECORATOR_STATICS.forEach((k) => {
    let va = normalizeDecorator(k, oldC, oldC[k]), vb = normalizeDecorator(k, newC, newC[k]);
    va !== vb && reasons.push("class decorator changed (" + k.replace(/^_/, "") + ")");
  }), reasons;
}
function normalizeDecorator(key, C, v) {
  return key === "_disallowMultiple" ? v ? "yes" : "" : key === "_requireComponent" ? (Array.isArray(v) ? v : v ? [v] : []).map((x) => x && (x.__classname__ || x.prototype && x.prototype.__classname__ || x.name) || String(x)).join(",") : v == null || v === !1 || v === 0 || v === "" ? "" : String(v);
}
function sameSource(a, b) {
  try {
    return Function.prototype.toString.call(a) === Function.prototype.toString.call(b);
  } catch {
    return !1;
  }
}
function applyClass(oldC, newC) {
  let r = { updated: [], added: [], removed: [], accessors: [], staticsAdded: [], late: [], lifecycleAdded: [], lifecycleRemoved: [] }, swapMethods = (target, source, allowed, prefix, isProto) => {
    let newKeys = ownKeys(source).filter(allowed);
    newKeys.forEach((k) => {
      let nd = descriptorOf(source, k), od = descriptorOf(target, k);
      if (isAccessor(nd)) {
        if (isProto || isAccessor(od) || !od)
          try {
            Object.defineProperty(target, k, nd), r.accessors.push(prefix + k);
          } catch {
          }
        return;
      }
      if (!isMethodDescriptor(nd)) return;
      let fn = isStub(nd.value) ? nd.value.__hrImpl : nd.value;
      isMethodDescriptor(od) ? isStub(od.value) ? (sameSource(od.value.__hrImpl, fn) || r.updated.push(prefix + k), od.value.__hrImpl = fn) : (sameSource(od.value, fn) || (r.updated.push(prefix + k), r.late.push(prefix + k)), Object.defineProperty(target, k, { value: makeStub(k, fn), writable: !0, configurable: !0, enumerable: !!od.enumerable })) : od || (Object.defineProperty(target, k, { value: makeStub(k, fn), writable: !0, configurable: !0, enumerable: !1 }), r.added.push(prefix + k), isProto && SCHEDULED_LIFECYCLE.indexOf(k) >= 0 && r.lifecycleAdded.push(k));
    }), ownKeys(target).filter(allowed).forEach((k) => {
      if (newKeys.indexOf(k) >= 0) return;
      let od = descriptorOf(target, k);
      isMethodDescriptor(od) && (isProto && SCHEDULED_LIFECYCLE.indexOf(k) >= 0 && (delete target[k], r.lifecycleRemoved.push(k)), r.removed.push(prefix + k));
    });
  };
  return swapMethods(oldC.prototype, newC.prototype, protoKeyAllowed, "", !0), swapMethods(oldC, newC, staticKeyAllowed, "static ", !1), ownKeys(newC).filter(staticKeyAllowed).forEach((k) => {
    let nd = descriptorOf(newC, k);
    if (!(!nd || !("value" in nd) || typeof nd.value == "function") && !descriptorOf(oldC, k))
      try {
        Object.defineProperty(oldC, k, { value: nd.value, writable: !0, configurable: !0, enumerable: !!nd.enumerable }), r.staticsAdded.push(k);
      } catch {
      }
  }), shareWithRunningClass(oldC, newC), r;
}
function shareWithRunningClass(oldC, newC) {
  ownKeys(oldC).filter(staticKeyAllowed).forEach((k) => {
    let od = descriptorOf(oldC, k);
    if (!(!od || !("value" in od) || typeof od.value == "function"))
      try {
        Object.defineProperty(newC, k, {
          get: () => oldC[k],
          set: (v) => {
            oldC[k] = v;
          },
          configurable: !0,
          enumerable: !!od.enumerable
        });
      } catch {
      }
  });
  try {
    let defaultHasInstance = Function.prototype[Symbol.hasInstance];
    Object.defineProperty(newC, Symbol.hasInstance, {
      value: (o) => defaultHasInstance.call(oldC, o) || defaultHasInstance.call(newC, o),
      configurable: !0
    });
  } catch {
  }
  try {
    Object.defineProperty(newC, "_sealed", { value: !1, writable: !0, configurable: !0 });
  } catch {
  }
}
function addMissingFields(instances, makeTemp) {
  let added = {};
  for (let i = 0; i < instances.length; i++) {
    let inst = instances[i], tmp;
    try {
      tmp = makeTemp();
    } catch {
      return Object.keys(added);
    }
    if (!tmp) continue;
    let keys = Object.keys(tmp);
    for (let k = 0; k < keys.length; k++) {
      let key = keys[k];
      if (!(key in inst))
        try {
          inst[key] = tmp[key], added[key] = !0;
        } catch {
        }
    }
  }
  return Object.keys(added);
}
function exportedClasses(ns) {
  let out = [];
  if (!ns) return out;
  let keys = Object.keys(ns);
  for (let i = 0; i < keys.length; i++) {
    let v;
    try {
      v = ns[keys[i]];
    } catch {
      continue;
    }
    isClassLike(v) && !out.some((e) => e.ctor === v) && out.push({ exportName: keys[i], ctor: v });
  }
  return out;
}
function pairClasses(oldList, newList, className2) {
  let res = { pairs: [], added: [], missing: [] }, used = [];
  return newList.forEach((n) => {
    let cn = className2(n.ctor), match;
    cn && (match = oldList.filter((o) => used.indexOf(o.ctor) < 0 && className2(o.ctor) === cn)[0]), match || (match = oldList.filter((o) => used.indexOf(o.ctor) < 0 && o.exportName === n.exportName)[0]), match ? (used.push(match.ctor), res.pairs.push({ name: cn || n.exportName, oldC: match.ctor, newC: n.ctor })) : res.added.push(n);
  }), oldList.forEach((o) => {
    used.indexOf(o.ctor) < 0 && res.missing.push(o);
  }), res;
}
function summarize(r, fields) {
  let parts = [], plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  return r.updated.length && parts.push(plural(r.updated.length, "method updated", "methods updated")), r.added.length && parts.push(plural(r.added.length, "method added", "methods added")), r.accessors.length && parts.push(plural(r.accessors.length, "accessor updated", "accessors updated")), r.staticsAdded.length && parts.push(plural(r.staticsAdded.length, "static added", "statics added")), fields.length && parts.push(plural(fields.length, "field added", "fields added") + " (" + fields.join(", ") + ")"), r.removed.length && parts.push("removed: " + r.removed.join(", ") + (r.removed.some((k) => SCHEDULED_LIFECYCLE.indexOf(k) < 0) ? " (kept for code that still calls it)" : "")), parts.join(", ");
}

// source/scene.ts
var PKG = "hot-reload", CH_COMPILED = "hot-reload:compiled", CH_CONFIG = "hot-reload:config", CH_DIAGNOSE = "hot-reload:diagnose", PACK_PREFIX = "pack:///", DELIM = "$_$", S = {
  enabled: !0,
  /** True between PreviewPlay.start and PreviewPlay.stop in this process. */
  playing: !1,
  /** Inside PreviewPlay.start (Cocos may load scripts then: that reload is not intercepted). */
  starting: !1,
  /** Something was hot-swapped or refused this play session: reload everything on Stop. */
  needsFullReload: !1,
  busy: !1,
  again: !1,
  timer: 0,
  poll: 0,
  /** The first namespace seen for each module URL: its classes are the running ones. */
  originalNs: {},
  instrumented: 0,
  wrapped: { start: !1, stop: !1, reload: !1 },
  log: [],
  restore: []
};
function note(event, detail) {
  S.log.push({ t: Date.now(), event, detail }), S.log.length > 80 && S.log.splice(0, S.log.length - 80);
}
function g() {
  return globalThis;
}
function cc() {
  return require("cc");
}
function previewPlay() {
  let cce = g().cce;
  return cce && cce.PreviewPlay || null;
}
function own(o, k) {
  return !!o && Object.prototype.hasOwnProperty.call(o, k);
}
function executor() {
  let cache = require.cache || {}, keys = Object.keys(cache);
  for (let i = 0; i < keys.length; i++) {
    if (!/lib-programming[\\/]dist[\\/]executor[\\/]index\.js$/.test(keys[i])) continue;
    let ex = cache[keys[i]] && cache[keys[i]].exports;
    if (ex && ex.Executor && ex.Executor._inst) return ex.Executor._inst;
  }
  return null;
}
function report(lines, level = "log") {
  if (lines.length) {
    note("report", lines);
    try {
      if (g().Editor && Editor.Message && Editor.Message.send) {
        Editor.Message.send(PKG, "report", { lines, level });
        return;
      }
    } catch {
    }
    lines.forEach((l) => console[level]("[Hot Reload] " + l));
  }
}
function className(C) {
  return C && C.prototype && own(C.prototype, "__classname__") ? String(C.prototype.__classname__) : "";
}
function isCcClass(C) {
  return !!C && !!C.prototype && (own(C.prototype, "__classname__") || own(C.prototype, "__cid__"));
}
function typeName(v) {
  if (v == null) return "";
  if (typeof v == "function") return cc().js.getClassName(v) || v.name || "fn";
  if (typeof v == "object")
    try {
      return JSON.stringify(v);
    } catch {
      return "object";
    }
  return String(v);
}
function propInfo(C) {
  let props = own(C, "__props__") && Array.isArray(C.__props__) ? C.__props__.slice() : null, types = {};
  if (props) {
    let attrs = {};
    try {
      attrs = own(C, "__attrs__") && C.__attrs__ || cc().CCClass.Attr.getClassAttrs(C) || {};
    } catch {
      attrs = {};
    }
    props.forEach((p) => {
      types[p] = [typeName(attrs[p + DELIM + "type"]), typeName(attrs[p + DELIM + "ctor"]), attrs[p + DELIM + "serializable"] === !1 ? "no-save" : ""].join("|");
    });
  }
  return { props, types };
}
function unregister(list) {
  let js = cc().js;
  list.forEach((C) => {
    try {
      js.unregisterClass(C);
    } catch {
    }
    try {
      let EC = g().EditorExtends && g().EditorExtends.Component;
      EC && EC.removeMenu && EC.removeMenu(C);
    } catch {
    }
  });
}
function reregister(list) {
  let js = cc().js;
  list.forEach((C) => {
    let p = C.prototype;
    try {
      own(p, "__cid__") && p.__cid__ && js._setClassId && js._setClassId(p.__cid__, C), own(p, "__classname__") && p.__classname__ && js.setClassName(p.__classname__, C);
    } catch (e) {
      note("reregister-failed", String(e));
    }
  });
}
function eachNode(fn) {
  let { director } = cc(), seen = [], walk = (n) => {
    if (!n || seen.indexOf(n) >= 0) return;
    seen.push(n), fn(n);
    let ch = n.children || [];
    for (let i = 0; i < ch.length; i++) walk(ch[i]);
  };
  walk(director.getScene());
  let persist = director._persistRootNodes || {};
  Object.keys(persist).forEach((k) => walk(persist[k]));
}
function liveComponents(C) {
  let out = [];
  try {
    eachNode((n) => {
      let comps = n._components || n.components || [];
      for (let i = 0; i < comps.length; i++) comps[i] instanceof C && out.push(comps[i]);
    });
  } catch (e) {
    note("walk-failed", String(e));
  }
  return out;
}
function invokerHas(inv, comp) {
  let parts = ["_zero", "_neg", "_pos"].map((k) => inv && inv[k] && inv[k].array);
  return parts.every(Array.isArray) ? parts.some((a) => a.indexOf(comp) >= 0) : null;
}
function syncLifecycle(C, added, removed) {
  let problems = [];
  if (!added.length && !removed.length) return problems;
  let sched = cc().director._compScheduler;
  if (!sched) return ["update()/lateUpdate() changes take effect after a restart"];
  let inv = { update: sched.updateInvoker, lateUpdate: sched.lateUpdateInvoker };
  return liveComponents(C).forEach((comp) => {
    comp.enabledInHierarchy && SCHEDULED_LIFECYCLE.forEach((name) => {
      if (added.indexOf(name) < 0 && removed.indexOf(name) < 0) return;
      let i = inv[name], has = invokerHas(i, comp);
      if (has === null) {
        problems.push(name + "() change takes effect after a restart");
        return;
      }
      let should = typeof comp[name] == "function";
      should && !has ? i.add(comp) : !should && has && i.remove(comp);
    });
  }), problems.filter((p, k, a) => a.indexOf(p) === k);
}
function moduleLabel(ex, url, classes) {
  try {
    let imports = ex._editorSystem && ex._editorSystem.importMap && ex._editorSystem.importMap.imports || {}, keys = Object.keys(imports);
    for (let i = 0; i < keys.length; i++)
      if (imports[keys[i]] === url && /^file:/.test(keys[i])) return decodeURIComponent(keys[i].replace(/^.*[\\/]/, ""));
  } catch {
  }
  return classes.length ? classes.map((c) => c.exportName).join(", ") : url.replace(/^.*\//, "");
}
function chunkIdOf(ex, url) {
  if (url.indexOf(PACK_PREFIX) !== 0) return null;
  try {
    return ex._packLoader.getChunkId(url.slice(PACK_PREFIX.length));
  } catch {
    return null;
  }
}
function packModules(ex) {
  let list = (ex._instantiatedPackMods || []).slice();
  return list.filter((u, i) => list.indexOf(u) === i);
}
function systemGet(url) {
  try {
    return g().System.get(url);
  } catch {
    return null;
  }
}
function instrumentAll() {
  let ex = executor();
  if (!ex) {
    note("instrument-no-executor");
    return;
  }
  let n = 0, seen = [], add = (C) => {
    !C || seen.indexOf(C) >= 0 || (seen.push(C), n += instrument(C));
  };
  packModules(ex).forEach((url) => {
    let ns = systemGet(url);
    ns && !S.originalNs[url] && (S.originalNs[url] = ns), exportedClasses(S.originalNs[url] || ns).forEach((e) => add(e.ctor));
  }), (ex._registeredClasses || []).forEach(add), S.instrumented += n, note("instrumented", { methods: n, classes: seen.length });
}
async function reloadModule(ex, url) {
  let System = g().System, ccm = cc(), oldNs = S.originalNs[url] || systemGet(url);
  if (!oldNs) {
    note("skip-not-loaded", url);
    return;
  }
  S.originalNs[url] = oldNs;
  let oldList = exportedClasses(oldNs), label = moduleLabel(ex, url, oldList), oldCc = oldList.map((e) => e.ctor).filter(isCcClass);
  unregister(oldCc);
  let registered = [], EE = g().EditorExtends, onRegistered = (ctor) => registered.push(ctor), newNs = null;
  try {
    EE && EE.on && EE.on("class-registered", onRegistered), System.delete(url), newNs = await System.import(url);
  } catch (err) {
    report([label + ": the new code failed to load, keeping the running code (" + String(err && err.message || err) + ")"], "error"), revert(url, oldNs, oldCc, registered), S.needsFullReload = !0;
    return;
  } finally {
    EE && EE.removeListener && EE.removeListener("class-registered", onRegistered);
    try {
      ccm.cclegacy._RF.reset();
    } catch {
    }
  }
  let newList = exportedClasses(newNs), newCc = newList.map((e) => e.ctor).filter(isCcClass).concat(registered).filter((C, i, a) => a.indexOf(C) === i && oldCc.indexOf(C) < 0), pairing = pairClasses(oldList, newList, className), oldOf = (n) => {
    let p = pairing.pairs.filter((x) => x.newC === n)[0];
    return p ? p.oldC : null;
  }, reasons = [];
  if (pairing.pairs.forEach((p) => {
    compare(p.oldC, p.newC, { propInfo, oldOf }).forEach((r) => reasons.push(r + (pairing.pairs.length > 1 ? " in " + p.name : "")));
  }), pairing.added.forEach((a) => {
    isCcClass(a.ctor) && reasons.push("new class " + (className(a.ctor) || a.exportName));
  }), reasons.length) {
    revert(url, oldNs, oldCc, newCc), S.needsFullReload = !0, report([label + ": restart needed (" + reasons.join("; ") + "), keeping the running code"], "warn");
    return;
  }
  let lines = [];
  pairing.pairs.forEach((p) => {
    instrument(p.oldC);
    let r = applyClass(p.oldC, p.newC), fields = [], live = [];
    typeof ccm.Component == "function" && p.oldC.prototype instanceof ccm.Component && (live = liveComponents(p.oldC), fields = addMissingFields(live, () => new p.newC()));
    let lifeProblems = syncLifecycle(p.oldC, r.lifecycleAdded, r.lifecycleRemoved), text = summarize(r, fields);
    text && lines.push((pairing.pairs.length > 1 ? p.name + ": " : "") + text), r.late.length && lines.push("callbacks registered before Play keep the old " + r.late.join(", ")), lifeProblems.forEach((x) => lines.push(x));
  }), unregister(newCc), reregister(oldCc), S.needsFullReload = !0, pairing.missing.length && lines.push("no longer exported: " + pairing.missing.map((m) => m.exportName).join(", ") + " (kept)"), report([label + ": " + (lines.length ? lines.join("; ") : "no class changes (module re-run)")]);
}
function revert(url, oldNs, oldCc, newCc) {
  unregister(newCc), reregister(oldCc);
  let System = g().System;
  try {
    System.delete(url), typeof System.set == "function" && System.set(url, oldNs);
  } catch (e) {
    note("revert-registry-failed", String(e));
  }
}
async function hotReload(trigger) {
  if (S.busy) {
    S.again = !0;
    return;
  }
  S.busy = !0;
  try {
    let ex = executor();
    if (!ex || !ex._packModInstantiation || !ex._reloadPackMods) {
      note("no-executor", trigger), report(["cannot reach the script loader in this Cocos version; restart the game to use your changes"], "warn");
      return;
    }
    let pmi = ex._packModInstantiation, before = Object.keys(pmi._cachedRegisters || {}), unlock = null;
    try {
      unlock = await pmi.lock();
    } catch {
      unlock = null;
    }
    try {
      await ex._reloadPackMods();
    } finally {
      if (unlock)
        try {
          await unlock();
        } catch {
        }
    }
    let after = pmi._cachedRegisters || {}, changed = before.filter((id) => !(id in after));
    if (note("compiled", { trigger, changedChunks: changed.length }), !changed.length) return;
    let urls = packModules(ex).filter((u) => {
      let id = chunkIdOf(ex, u);
      return !!id && changed.indexOf(id) >= 0;
    });
    for (let i = 0; i < urls.length; i++) await reloadModule(ex, urls[i]);
  } catch (err) {
    report(["hot reload failed: " + String(err && err.stack || err)], "error");
  } finally {
    S.busy = !1, S.again && (S.again = !1, schedule("again"));
  }
}
function schedule(trigger) {
  !S.enabled || !S.playing || (S.timer && clearTimeout(S.timer), S.timer = setTimeout(() => {
    S.timer = 0, hotReload(trigger);
  }, 120));
}
function onPlayStarted() {
  S.playing = !0, S.needsFullReload = !1, S.originalNs = {}, S.enabled && instrumentAll(), note("play-start");
}
async function onPlayStopped() {
  if (S.playing = !1, note("play-stop", { needsFullReload: S.needsFullReload }), !S.needsFullReload) return;
  S.needsFullReload = !1, S.originalNs = {};
  let ex = executor(), reload = ex && (ex.__hrOriginalReload || ex.reload);
  if (reload)
    try {
      await reload.call(ex);
    } catch (e) {
      note("full-reload-failed", String(e));
    }
}
function hook(obj, key, make) {
  let hadOwn = own(obj, key), orig = obj[key];
  return obj[key] = make(orig), () => {
    hadOwn ? obj[key] = orig : delete obj[key];
  };
}
function wrapPreviewPlay() {
  let pp = previewPlay();
  if (pp) {
    if (!S.wrapped.start && typeof pp.start == "function") {
      let undo = hook(pp, "start", (orig) => async function(...args) {
        try {
          onPlayStarted();
        } catch (e) {
          note("start-hook-failed", String(e));
        }
        S.starting = !0;
        try {
          return await orig.apply(this, args);
        } finally {
          S.starting = !1, S.enabled && S.playing && instrumentAll();
        }
      });
      S.wrapped.start = !0, S.restore.push(() => {
        undo(), S.wrapped.start = !1;
      });
    }
    if (!S.wrapped.stop && typeof pp.stop == "function") {
      let undo = hook(pp, "stop", (orig) => async function(...args) {
        let r = await orig.apply(this, args);
        return await onPlayStopped(), r;
      });
      S.wrapped.stop = !0, S.restore.push(() => {
        undo(), S.wrapped.stop = !1;
      });
    }
  }
}
function wrapExecutor() {
  let ex = executor();
  if (!ex || S.wrapped.reload || typeof ex.reload != "function") return;
  ex.__hrOriginalReload = ex.reload;
  let undo = hook(ex, "reload", (orig) => async function(...args) {
    if (S.enabled && S.playing && !S.starting) {
      note("executor-reload-intercepted", String(new Error().stack || "").split(`
`).slice(2, 7).join(" | ")), await hotReload("executor"), S.needsFullReload = !0;
      return;
    }
    let r = await orig.apply(this, args);
    return S.enabled && S.playing && (S.originalNs = {}, instrumentAll()), r;
  });
  S.wrapped.reload = !0, S.restore.push(() => {
    undo(), delete ex.__hrOriginalReload, S.wrapped.reload = !1;
  });
}
function pollState() {
  wrapPreviewPlay(), wrapExecutor();
  let running = gameRunningHere();
  running && !S.playing && onPlayStarted(), !running && S.playing && !S.wrapped.stop && onPlayStopped();
}
function gameRunningHere() {
  let pp = previewPlay();
  if (!pp) return !1;
  let st = pp._state;
  return typeof st == "string" && st !== "" && !/^(stop|stopped|none|idle)$/i.test(st) && !!(pp._scene || pp._currSceneData || pp.startSceneJson);
}
function onIpc(channel, fn) {
  try {
    let { ipcRenderer } = require("electron"), handler = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, handler), S.restore.push(() => ipcRenderer.removeListener(channel, handler));
  } catch {
    note("no-ipc", channel);
  }
}
function diagnostics() {
  let pp = previewPlay(), ex = executor();
  return {
    href: typeof location < "u" ? location.href : "",
    enabled: S.enabled,
    playing: S.playing,
    previewState: pp ? pp._state : null,
    executorFound: !!ex,
    executorApi: ex ? {
      reload: typeof ex.reload,
      _reloadPackMods: typeof ex._reloadPackMods,
      packModInstantiation: !!ex._packModInstantiation,
      cachedChunks: ex._packModInstantiation ? Object.keys(ex._packModInstantiation._cachedRegisters || {}).length : null,
      packMods: (ex._instantiatedPackMods || []).length,
      registeredClasses: (ex._registeredClasses || []).length
    } : null,
    systemApi: g().System ? { get: typeof g().System.get, delete: typeof g().System.delete, set: typeof g().System.set } : null,
    wrapped: S.wrapped,
    instrumented: S.instrumented,
    needsFullReload: S.needsFullReload,
    log: S.log.slice(-40)
  };
}
function load() {
  onIpc(CH_COMPILED, () => schedule("compiled")), onIpc(CH_CONFIG, (cfg) => {
    cfg && typeof cfg.enabled == "boolean" && (S.enabled = cfg.enabled);
  }), onIpc(CH_DIAGNOSE, () => {
    try {
      Editor.Message.send(PKG, "diagnostics", diagnostics());
    } catch {
    }
  });
  try {
    Promise.resolve(Editor.Message.request(PKG, "get-config")).then((cfg) => {
      cfg && typeof cfg.enabled == "boolean" && (S.enabled = cfg.enabled);
    }).catch(() => {
    });
  } catch {
  }
  pollState(), S.poll = setInterval(pollState, 400);
}
function unload() {
  S.poll && clearInterval(S.poll), S.timer && clearTimeout(S.timer), S.restore.splice(0).forEach((fn) => {
    try {
      fn();
    } catch {
    }
  });
}
var methods = {
  /** Read-only state of this scene process (diagnostics). */
  hrState() {
    return diagnostics();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
