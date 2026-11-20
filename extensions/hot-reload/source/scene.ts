/**
 * Scene script of Hot Reload. Loaded by Cocos in every scene process; it only
 * acts in the process that runs Play-in-Editor (where `PreviewPlay.start` runs).
 *
 * Cocos 3.8.6 loads project scripts with lib-programming's Executor:
 * - every script is a SystemJS module compiled into the quick pack (`pack:///...` URLs);
 * - `Executor.reload()` re-reads the pack, unregisters every project cc class,
 *   deletes every pack module and re-imports them all.
 *
 * While the game plays, Hot Reload replaces that by a targeted swap: it refreshes
 * the pack, finds the chunks whose timestamp changed, re-imports only those
 * modules through Cocos' own SystemJS loader and moves their new code into the
 * running classes (see core/patch.ts). Only modules Cocos compiled from the
 * project are loaded; no code comes from anywhere else.
 */
import {
    addMissingFields,
    applyClass,
    compare,
    ExportedClass,
    exportedClasses,
    instrument,
    pairClasses,
    PropInfo,
    SCHEDULED_LIFECYCLE,
    summarize,
} from './core/patch';

const PKG = 'hot-reload';
const CH_COMPILED = 'hot-reload:compiled';
const CH_CONFIG = 'hot-reload:config';
const CH_DIAGNOSE = 'hot-reload:diagnose';
const PACK_PREFIX = 'pack:///';
const DELIM = '$_$';

type AnyMap = Record<string, any>;

const S = {
    enabled: true,
    /** True between PreviewPlay.start and PreviewPlay.stop in this process. */
    playing: false,
    /** Inside PreviewPlay.start (Cocos may load scripts then: that reload is not intercepted). */
    starting: false,
    /** Something was hot-swapped or refused this play session: reload everything on Stop. */
    needsFullReload: false,
    busy: false,
    again: false,
    timer: 0 as any,
    poll: 0 as any,
    /** The first namespace seen for each module URL: its classes are the running ones. */
    originalNs: {} as Record<string, any>,
    instrumented: 0,
    wrapped: { start: false, stop: false, reload: false },
    log: [] as { t: number; event: string; detail?: unknown }[],
    restore: [] as (() => void)[],
};

function note(event: string, detail?: unknown): void {
    S.log.push({ t: Date.now(), event, detail });
    if (S.log.length > 80) S.log.splice(0, S.log.length - 80);
}

function g(): AnyMap {
    return globalThis as AnyMap;
}

function cc(): AnyMap {
    return require('cc');
}

function previewPlay(): AnyMap | null {
    const cce = g().cce;
    return (cce && cce.PreviewPlay) || null;
}

function own(o: any, k: string): boolean {
    return !!o && Object.prototype.hasOwnProperty.call(o, k);
}

/** lib-programming's Executor singleton of this process (found in Node's module cache). */
function executor(): AnyMap | null {
    const cache: AnyMap = (require as any).cache || {};
    const keys = Object.keys(cache);
    for (let i = 0; i < keys.length; i++) {
        if (!/lib-programming[\\/]dist[\\/]executor[\\/]index\.js$/.test(keys[i])) continue;
        const ex = cache[keys[i]] && cache[keys[i]].exports;
        if (ex && ex.Executor && ex.Executor._inst) return ex.Executor._inst;
    }
    return null;
}

/** Sends report lines to the main process (printed in the Console), or logs them here. */
function report(lines: string[], level: 'log' | 'warn' | 'error' = 'log'): void {
    if (!lines.length) return;
    note('report', lines);
    try {
        if (g().Editor && Editor.Message && Editor.Message.send) {
            Editor.Message.send(PKG, 'report', { lines, level });
            return;
        }
    } catch (e) {
        // fall back to this console
    }
    lines.forEach((l) => (console as any)[level]('[Hot Reload] ' + l));
}

// ------------------------------------------------------------- class metadata

function className(C: any): string {
    return C && C.prototype && own(C.prototype, '__classname__') ? String(C.prototype.__classname__) : '';
}

function isCcClass(C: any): boolean {
    return !!C && !!C.prototype && (own(C.prototype, '__classname__') || own(C.prototype, '__cid__'));
}

function typeName(v: any): string {
    if (v === undefined || v === null) return '';
    if (typeof v === 'function') return cc().js.getClassName(v) || v.name || 'fn';
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        } catch (e) {
            return 'object';
        }
    }
    return String(v);
}

function propInfo(C: any): PropInfo {
    const props: string[] | null = own(C, '__props__') && Array.isArray(C.__props__) ? C.__props__.slice() : null;
    const types: Record<string, string> = {};
    if (props) {
        let attrs: AnyMap = {};
        try {
            attrs = (own(C, '__attrs__') && C.__attrs__) || cc().CCClass.Attr.getClassAttrs(C) || {};
        } catch (e) {
            attrs = {};
        }
        props.forEach((p) => {
            types[p] = [typeName(attrs[p + DELIM + 'type']), typeName(attrs[p + DELIM + 'ctor']), attrs[p + DELIM + 'serializable'] === false ? 'no-save' : ''].join('|');
        });
    }
    return { props, types };
}

// ------------------------------------------------------------- class registry

function unregister(list: any[]): void {
    const js = cc().js;
    list.forEach((C) => {
        try {
            js.unregisterClass(C);
        } catch (e) {
            // not registered
        }
        try {
            const EC = g().EditorExtends && g().EditorExtends.Component;
            if (EC && EC.removeMenu) EC.removeMenu(C);
        } catch (e) {
            // no editor menu
        }
    });
}

/** Puts the running classes back under their cid and name (they own the tags on their prototype). */
function reregister(list: any[]): void {
    const js = cc().js;
    list.forEach((C) => {
        const p = C.prototype;
        try {
            if (own(p, '__cid__') && p.__cid__ && js._setClassId) js._setClassId(p.__cid__, C);
            if (own(p, '__classname__') && p.__classname__) js.setClassName(p.__classname__, C);
        } catch (e) {
            note('reregister-failed', String(e));
        }
    });
}

// ------------------------------------------------------------- live objects

function eachNode(fn: (node: AnyMap) => void): void {
    const { director } = cc();
    const seen: any[] = [];
    const walk = (n: AnyMap) => {
        if (!n || seen.indexOf(n) >= 0) return;
        seen.push(n);
        fn(n);
        const ch = n.children || [];
        for (let i = 0; i < ch.length; i++) walk(ch[i]);
    };
    walk(director.getScene());
    const persist = director._persistRootNodes || {};
    Object.keys(persist).forEach((k) => walk(persist[k]));
}

function liveComponents(C: any): any[] {
    const out: any[] = [];
    try {
        eachNode((n) => {
            const comps = n._components || n.components || [];
            for (let i = 0; i < comps.length; i++) if (comps[i] instanceof C) out.push(comps[i]);
        });
    } catch (e) {
        note('walk-failed', String(e));
    }
    return out;
}

function invokerHas(inv: AnyMap, comp: any): boolean | null {
    const parts = ['_zero', '_neg', '_pos'].map((k) => inv && inv[k] && inv[k].array);
    if (!parts.every(Array.isArray)) return null;
    return parts.some((a: any[]) => a.indexOf(comp) >= 0);
}

/** update/lateUpdate added or removed: the engine only looks them up when a component is enabled. */
function syncLifecycle(C: any, added: string[], removed: string[]): string[] {
    const problems: string[] = [];
    if (!added.length && !removed.length) return problems;
    const sched = cc().director._compScheduler;
    if (!sched) return ['update()/lateUpdate() changes take effect after a restart'];
    const inv: Record<string, AnyMap> = { update: sched.updateInvoker, lateUpdate: sched.lateUpdateInvoker };
    liveComponents(C).forEach((comp) => {
        if (!comp.enabledInHierarchy) return;
        SCHEDULED_LIFECYCLE.forEach((name) => {
            if (added.indexOf(name) < 0 && removed.indexOf(name) < 0) return;
            const i = inv[name];
            const has = invokerHas(i, comp);
            if (has === null) {
                problems.push(name + '() change takes effect after a restart');
                return;
            }
            const should = typeof comp[name] === 'function';
            if (should && !has) i.add(comp);
            else if (!should && has) i.remove(comp);
        });
    });
    return problems.filter((p, k, a) => a.indexOf(p) === k);
}

// ------------------------------------------------------------- modules

function moduleLabel(ex: AnyMap, url: string, classes: ExportedClass[]): string {
    try {
        const imports: AnyMap = (ex._editorSystem && ex._editorSystem.importMap && ex._editorSystem.importMap.imports) || {};
        const keys = Object.keys(imports);
        for (let i = 0; i < keys.length; i++) {
            if (imports[keys[i]] === url && /^file:/.test(keys[i])) return decodeURIComponent(keys[i].replace(/^.*[\\/]/, ''));
        }
    } catch (e) {
        // fall back to class names
    }
    return classes.length ? classes.map((c) => c.exportName).join(', ') : url.replace(/^.*\//, '');
}

function chunkIdOf(ex: AnyMap, url: string): string | null {
    if (url.indexOf(PACK_PREFIX) !== 0) return null;
    try {
        return ex._packLoader.getChunkId(url.slice(PACK_PREFIX.length));
    } catch (e) {
        return null;
    }
}

/** Project modules currently loaded (SystemJS registry ids of the quick pack). */
function packModules(ex: AnyMap): string[] {
    const list: string[] = (ex._instantiatedPackMods || []).slice();
    return list.filter((u, i) => list.indexOf(u) === i);
}

function systemGet(url: string): any {
    try {
        return g().System.get(url);
    } catch (e) {
        return null;
    }
}

/** Wraps the methods of every class the project's modules export (see core/patch instrument). */
function instrumentAll(): void {
    const ex = executor();
    if (!ex) {
        note('instrument-no-executor');
        return;
    }
    let n = 0;
    const seen: any[] = [];
    const add = (C: any) => {
        if (!C || seen.indexOf(C) >= 0) return;
        seen.push(C);
        n += instrument(C);
    };
    packModules(ex).forEach((url) => {
        const ns = systemGet(url);
        if (ns && !S.originalNs[url]) S.originalNs[url] = ns;
        exportedClasses(S.originalNs[url] || ns).forEach((e) => add(e.ctor));
    });
    (ex._registeredClasses || []).forEach(add);
    S.instrumented += n;
    note('instrumented', { methods: n, classes: seen.length });
}

/** Re-imports one changed module and moves its new code into the running classes. */
async function reloadModule(ex: AnyMap, url: string): Promise<void> {
    const System = g().System;
    const ccm = cc();
    const oldNs = S.originalNs[url] || systemGet(url);
    if (!oldNs) {
        note('skip-not-loaded', url);
        return;
    }
    S.originalNs[url] = oldNs;
    const oldList = exportedClasses(oldNs);
    const label = moduleLabel(ex, url, oldList);
    const oldCc = oldList.map((e) => e.ctor).filter(isCcClass);

    // free the names and ids so the new module registers its classes without errors
    unregister(oldCc);
    const registered: any[] = [];
    const EE = g().EditorExtends;
    const onRegistered = (ctor: any) => registered.push(ctor);
    let newNs: any = null;
    try {
        if (EE && EE.on) EE.on('class-registered', onRegistered);
        System.delete(url);
        newNs = await System.import(url);
    } catch (err) {
        report([label + ': the new code failed to load, keeping the running code (' + String((err && (err as Error).message) || err) + ')'], 'error');
        revert(url, oldNs, oldCc, registered);
        S.needsFullReload = true;
        return;
    } finally {
        if (EE && EE.removeListener) EE.removeListener('class-registered', onRegistered);
        try {
            ccm.cclegacy._RF.reset();
        } catch (e) {
            // older engine
        }
    }
    const newList = exportedClasses(newNs);
    const newCc = newList
        .map((e) => e.ctor)
        .filter(isCcClass)
        .concat(registered)
        .filter((C, i, a) => a.indexOf(C) === i && oldCc.indexOf(C) < 0);
    const pairing = pairClasses(oldList, newList, className);
    const oldOf = (n: any) => {
        const p = pairing.pairs.filter((x) => x.newC === n)[0];
        return p ? p.oldC : null;
    };

    const reasons: string[] = [];
    pairing.pairs.forEach((p) => {
        compare(p.oldC, p.newC, { propInfo, oldOf }).forEach((r) => reasons.push(r + (pairing.pairs.length > 1 ? ' in ' + p.name : '')));
    });
    pairing.added.forEach((a) => {
        if (isCcClass(a.ctor)) reasons.push('new class ' + (className(a.ctor) || a.exportName));
    });
    if (reasons.length) {
        revert(url, oldNs, oldCc, newCc);
        S.needsFullReload = true;
        report([label + ': restart needed (' + reasons.join('; ') + '), keeping the running code'], 'warn');
        return;
    }

    const lines: string[] = [];
    pairing.pairs.forEach((p) => {
        instrument(p.oldC);
        const r = applyClass(p.oldC, p.newC);
        let fields: string[] = [];
        let live: any[] = [];
        if (typeof ccm.Component === 'function' && p.oldC.prototype instanceof ccm.Component) {
            live = liveComponents(p.oldC);
            fields = addMissingFields(live, () => new p.newC());
        }
        const lifeProblems = syncLifecycle(p.oldC, r.lifecycleAdded, r.lifecycleRemoved);
        const text = summarize(r, fields);
        if (text) lines.push((pairing.pairs.length > 1 ? p.name + ': ' : '') + text);
        if (r.late.length) lines.push('callbacks registered before Play keep the old ' + r.late.join(', '));
        lifeProblems.forEach((x) => lines.push(x));
    });
    // the running classes stay the registered ones; the new ones only lend their code
    unregister(newCc);
    reregister(oldCc);
    S.needsFullReload = true;
    if (pairing.missing.length) lines.push('no longer exported: ' + pairing.missing.map((m) => m.exportName).join(', ') + ' (kept)');
    report([label + ': ' + (lines.length ? lines.join('; ') : 'no class changes (module re-run)')]);
}

function revert(url: string, oldNs: any, oldCc: any[], newCc: any[]): void {
    unregister(newCc);
    reregister(oldCc);
    const System = g().System;
    try {
        System.delete(url);
        if (typeof System.set === 'function') System.set(url, oldNs);
    } catch (e) {
        note('revert-registry-failed', String(e));
    }
}

/** Finds what the last compile changed and swaps it in. */
async function hotReload(trigger: string): Promise<void> {
    if (S.busy) {
        S.again = true;
        return;
    }
    S.busy = true;
    try {
        const ex = executor();
        if (!ex || !ex._packModInstantiation || !ex._reloadPackMods) {
            note('no-executor', trigger);
            report(['cannot reach the script loader in this Cocos version; restart the game to use your changes'], 'warn');
            return;
        }
        const pmi = ex._packModInstantiation;
        const before = Object.keys(pmi._cachedRegisters || {});
        let unlock: (() => Promise<void>) | null = null;
        try {
            unlock = await pmi.lock();
        } catch (e) {
            unlock = null;
        }
        try {
            await ex._reloadPackMods();
        } finally {
            if (unlock) {
                try {
                    await unlock();
                } catch (e) {
                    // released elsewhere
                }
            }
        }
        const after = pmi._cachedRegisters || {};
        const changed = before.filter((id) => !(id in after));
        note('compiled', { trigger, changedChunks: changed.length });
        if (!changed.length) return;
        const urls = packModules(ex).filter((u) => {
            const id = chunkIdOf(ex, u);
            return !!id && changed.indexOf(id) >= 0;
        });
        for (let i = 0; i < urls.length; i++) await reloadModule(ex, urls[i]);
    } catch (err) {
        report(['hot reload failed: ' + String((err && (err as Error).stack) || err)], 'error');
    } finally {
        S.busy = false;
        if (S.again) {
            S.again = false;
            schedule('again');
        }
    }
}

function schedule(trigger: string): void {
    if (!S.enabled || !S.playing) return;
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(() => {
        S.timer = 0;
        hotReload(trigger);
    }, 120);
}

// ------------------------------------------------------------- hooks

function onPlayStarted(): void {
    S.playing = true;
    S.needsFullReload = false;
    S.originalNs = {};
    if (S.enabled) instrumentAll();
    note('play-start');
}

async function onPlayStopped(): Promise<void> {
    S.playing = false;
    note('play-stop', { needsFullReload: S.needsFullReload });
    if (!S.needsFullReload) return;
    S.needsFullReload = false;
    S.originalNs = {};
    // the next Play starts from freshly loaded scripts, exactly as Cocos would load them
    const ex = executor();
    const reload = ex && (ex.__hrOriginalReload || ex.reload);
    if (reload) {
        try {
            await reload.call(ex);
        } catch (e) {
            note('full-reload-failed', String(e));
        }
    }
}

/** Replaces obj[key]; the returned function puts the original back (own property or inherited). */
function hook(obj: AnyMap, key: string, make: (orig: any) => any): () => void {
    const hadOwn = own(obj, key);
    const orig = obj[key];
    obj[key] = make(orig);
    return () => {
        if (hadOwn) obj[key] = orig;
        else delete obj[key];
    };
}

function wrapPreviewPlay(): void {
    const pp = previewPlay();
    if (!pp) return;
    if (!S.wrapped.start && typeof pp.start === 'function') {
        const undo = hook(pp, 'start', (orig) => async function (this: any, ...args: any[]) {
            try {
                onPlayStarted();
            } catch (e) {
                note('start-hook-failed', String(e));
            }
            // a script reload Cocos does while starting is a real reload, not a hot swap
            S.starting = true;
            try {
                return await orig.apply(this, args);
            } finally {
                S.starting = false;
                if (S.enabled && S.playing) instrumentAll();
            }
        });
        S.wrapped.start = true;
        S.restore.push(() => {
            undo();
            S.wrapped.start = false;
        });
    }
    if (!S.wrapped.stop && typeof pp.stop === 'function') {
        const undo = hook(pp, 'stop', (orig) => async function (this: any, ...args: any[]) {
            const r = await orig.apply(this, args);
            await onPlayStopped();
            return r;
        });
        S.wrapped.stop = true;
        S.restore.push(() => {
            undo();
            S.wrapped.stop = false;
        });
    }
}

/** While playing, Cocos' full script reload is replaced by the targeted swap. */
function wrapExecutor(): void {
    const ex = executor();
    if (!ex || S.wrapped.reload || typeof ex.reload !== 'function') return;
    ex.__hrOriginalReload = ex.reload;
    const undo = hook(ex, 'reload', (orig) => async function (this: any, ...args: any[]) {
        if (S.enabled && S.playing && !S.starting) {
            note('executor-reload-intercepted', String(new Error().stack || '').split('\n').slice(2, 7).join(' | '));
            await hotReload('executor');
            S.needsFullReload = true;
            return;
        }
        const r = await orig.apply(this, args);
        if (S.enabled && S.playing) {
            // fresh classes (reload while starting): wrap them before the game grabs callbacks
            S.originalNs = {};
            instrumentAll();
        }
        return r;
    });
    S.wrapped.reload = true;
    S.restore.push(() => {
        undo();
        delete ex.__hrOriginalReload;
        S.wrapped.reload = false;
    });
}

/** PreviewPlay may start before this script loads, or be replaced: check now and then. */
function pollState(): void {
    wrapPreviewPlay();
    wrapExecutor();
    const running = gameRunningHere();
    // started before this script was loaded: methods are wrapped late (callbacks taken earlier keep old code)
    if (running && !S.playing) onPlayStarted();
    if (!running && S.playing && !S.wrapped.stop) onPlayStopped();
}

/**
 * True when this process runs the game: PreviewPlay is in a playing/paused state and
 * holds a game scene. The edit process has PreviewPlay too, but never a game scene.
 */
function gameRunningHere(): boolean {
    const pp = previewPlay();
    if (!pp) return false;
    const st = pp._state;
    const active = typeof st === 'string' && st !== '' && !/^(stop|stopped|none|idle)$/i.test(st);
    return active && !!(pp._scene || pp._currSceneData || pp.startSceneJson);
}

function onIpc(channel: string, fn: (payload: any) => void): void {
    try {
        const { ipcRenderer } = require('electron');
        const handler = (_e: any, payload: any) => fn(payload);
        ipcRenderer.on(channel, handler);
        S.restore.push(() => ipcRenderer.removeListener(channel, handler));
    } catch (e) {
        note('no-ipc', channel);
    }
}

function diagnostics(): AnyMap {
    const pp = previewPlay();
    const ex = executor();
    return {
        href: typeof location !== 'undefined' ? location.href : '',
        enabled: S.enabled,
        playing: S.playing,
        previewState: pp ? pp._state : null,
        executorFound: !!ex,
        executorApi: ex
            ? {
                  reload: typeof ex.reload,
                  _reloadPackMods: typeof ex._reloadPackMods,
                  packModInstantiation: !!ex._packModInstantiation,
                  cachedChunks: ex._packModInstantiation ? Object.keys(ex._packModInstantiation._cachedRegisters || {}).length : null,
                  packMods: (ex._instantiatedPackMods || []).length,
                  registeredClasses: (ex._registeredClasses || []).length,
              }
            : null,
        systemApi: g().System ? { get: typeof g().System.get, delete: typeof g().System.delete, set: typeof g().System.set } : null,
        wrapped: S.wrapped,
        instrumented: S.instrumented,
        needsFullReload: S.needsFullReload,
        log: S.log.slice(-40),
    };
}

export function load(): void {
    onIpc(CH_COMPILED, () => schedule('compiled'));
    onIpc(CH_CONFIG, (cfg: AnyMap) => {
        if (cfg && typeof cfg.enabled === 'boolean') S.enabled = cfg.enabled;
    });
    onIpc(CH_DIAGNOSE, () => {
        try {
            Editor.Message.send(PKG, 'diagnostics', diagnostics());
        } catch (e) {
            // no editor messaging here
        }
    });
    try {
        Promise.resolve(Editor.Message.request(PKG, 'get-config'))
            .then((cfg: any) => {
                if (cfg && typeof cfg.enabled === 'boolean') S.enabled = cfg.enabled;
            })
            .catch(() => undefined);
    } catch (e) {
        // default: enabled
    }
    pollState();
    S.poll = setInterval(pollState, 400);
}

export function unload(): void {
    if (S.poll) clearInterval(S.poll);
    if (S.timer) clearTimeout(S.timer);
    S.restore.splice(0).forEach((fn) => {
        try {
            fn();
        } catch (e) {
            // already gone
        }
    });
}

export const methods: Record<string, (...args: any[]) => any> = {
    /** Read-only state of this scene process (diagnostics). */
    hrState() {
        return diagnostics();
    },
};
