/**
 * Runs the real scene script against a fake Cocos: lib-programming's Executor
 * internals, a SystemJS registry, the cc.js class registry (with the engine's
 * "id already registered" error), PreviewPlay and the component scheduler.
 */
import assert from 'assert';

/* eslint-disable @typescript-eslint/no-explicit-any, max-classes-per-file */

const out: string[] = [];
const ok = (c: any, m: string) => out.push((c ? '  ok   ' : '  FAIL ') + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------- fake engine
const errors: string[] = [];
const nameToClass: Record<string, any> = {};
const idToClass: Record<string, any> = {};
const js = {
    unregisterClass(...cs: any[]) {
        cs.forEach((C) => {
            const p = C.prototype;
            if (p.hasOwnProperty('__cid__')) delete idToClass[p.__cid__];
            if (p.hasOwnProperty('__classname__')) delete nameToClass[p.__classname__];
        });
    },
    _setClassId(id: string, C: any) {
        if (C.prototype.hasOwnProperty('__cid__')) delete idToClass[C.prototype.__cid__];
        Object.defineProperty(C.prototype, '__cid__', { value: id, writable: true, configurable: true });
        if (idToClass[id] && idToClass[id] !== C) errors.push('16334 id ' + id);
        else idToClass[id] = C;
    },
    setClassName(name: string, C: any) {
        if (C.prototype.hasOwnProperty('__classname__')) delete nameToClass[C.prototype.__classname__];
        Object.defineProperty(C.prototype, '__classname__', { value: name, writable: true, configurable: true });
        nameToClass[name] = C;
    },
    getClassName(C: any) {
        return (C && C.prototype && C.prototype.__classname__) || '';
    },
    getClassByName(n: string) {
        return nameToClass[n];
    },
};
const listeners: Record<string, ((...a: any[]) => void)[]> = {};
const EditorExtends = {
    on(ev: string, fn: any) {
        (listeners[ev] = listeners[ev] || []).push(fn);
    },
    removeListener(ev: string, fn: any) {
        listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
    },
    emit(ev: string, ...a: any[]) {
        (listeners[ev] || []).slice().forEach((f) => f(...a));
    },
};
/** What a ccclass decorator does: name + id + "class-registered". */
function ccclass(C: any, name: string, cid: string, props: string[]) {
    js._setClassId(cid, C);
    js.setClassName(name, C);
    C.__props__ = props;
    C.__attrs__ = {};
    EditorExtends.emit('class-registered', C, { uuid: cid });
    return C;
}
class Component {
    node: any = null;
    _enabled = true;
    get enabledInHierarchy() {
        return this._enabled;
    }
}
function makeInvoker() {
    return {
        _zero: { array: [] as any[] },
        _neg: { array: [] as any[] },
        _pos: { array: [] as any[] },
        add(c: any) {
            this._zero.array.push(c);
        },
        remove(c: any) {
            const i = this._zero.array.indexOf(c);
            if (i >= 0) this._zero.array.splice(i, 1);
        },
    };
}
const sched = { updateInvoker: makeInvoker(), lateUpdateInvoker: makeInvoker() };
const sceneRoot: any = { children: [] as any[], _components: [] as any[] };
const fakeCc = {
    js,
    Component,
    director: { getScene: () => sceneRoot, _persistRootNodes: {}, _compScheduler: sched },
    cclegacy: { _RF: { reset() {} } },
    CCClass: { Attr: { getClassAttrs: (C: any) => C.__attrs__ || {} } },
};

// SystemJS registry + module factories
const registry: Record<string, any> = {};
const factories: Record<string, () => any> = {};
let importThrows = false;
(globalThis as any).System = {
    get: (u: string) => registry[u] || null,
    delete: (u: string) => delete registry[u],
    set: (u: string, ns: any) => {
        registry[u] = ns;
        return ns;
    },
    import: async (u: string) => {
        if (registry[u]) return registry[u];
        if (importThrows) throw new Error('SyntaxError: Unexpected token');
        registry[u] = factories[u]();
        return registry[u];
    },
};

// lib-programming Executor in Node's module cache
const cached: Record<string, any> = { a: 1, b: 1 };
let fullReloads = 0;
let changedNow: string[] = [];
const executorInst: any = {
    _packModInstantiation: {
        _cachedRegisters: cached,
        lock: async () => async () => undefined,
    },
    _packLoader: { getChunkId: (link: string) => link },
    _instantiatedPackMods: ['pack:///a', 'pack:///b'],
    _registeredClasses: [] as any[],
    _editorSystem: { importMap: { imports: { 'file:///E:/proj/assets/Player.ts': 'pack:///a', 'file:///E:/proj/assets/Other.ts': 'pack:///b' } } },
    async _reloadPackMods() {
        changedNow.forEach((id) => delete cached[id]);
    },
    async reload() {
        fullReloads++;
    },
};
const Module = require('module');
const fakeExecutorPath = 'E:\\fake\\node_modules\\@editor\\lib-programming\\dist\\executor\\index.js';
require.cache[fakeExecutorPath] = { id: fakeExecutorPath, filename: fakeExecutorPath, loaded: true, exports: { Executor: { _inst: executorInst } } } as any;
const ipcHandlers: Record<string, any> = {};
const origLoad = Module._load;
Module._load = function (req: string, ...rest: any[]) {
    if (req === 'cc') return fakeCc;
    if (req === 'electron') return { ipcRenderer: { on: (ch: string, fn: any) => (ipcHandlers[ch] = fn), removeListener() {} } };
    return origLoad.call(this, req, ...rest);
};
const sent: any[] = [];
(globalThis as any).Editor = {
    Message: {
        send: (_p: string, msg: string, data: any) => sent.push({ msg, data }),
        request: async () => ({ enabled: true }),
    },
};
(globalThis as any).EditorExtends = EditorExtends;
const pp: any = { _state: 'stop', _scene: null, start: async () => undefined, stop: async () => undefined };
(globalThis as any).cce = { PreviewPlay: pp };

// ------------------------------------------------------------- project v1
class Player extends Component {
    speed = 2;
    x = 0;
    update(dt: number) {
        this.x += this.speed * dt;
    }
    label() {
        return 'v1';
    }
}
ccclass(Player, 'Player', 'cidPlayer', ['speed']);
class Other {
    hi() {
        return 'other';
    }
}
registry['pack:///a'] = { Player };
registry['pack:///b'] = { Other };
executorInst._registeredClasses.push(Player);
const live = new Player();
sceneRoot._components.push(live);
sched.updateInvoker.add(live);

function lastReport(): string {
    const r = sent.filter((s) => s.msg === 'report').pop();
    return r ? r.data.lines.join(' | ') : '';
}

(async () => {
    try {
        const scene = require('../source/scene');
        const origStart = pp.start;
        const origReload = executorInst.reload;
        scene.load();
        ok(typeof pp.start === 'function' && pp.hasOwnProperty('start'), 'PreviewPlay.start wrapped');
        pp._state = 'pause';
        pp._scene = {};
        await pp.start();
        const grabbed = live.label; // like schedule(this.label) after Play started
        ok((Player.prototype as any).label.__hrStub === true, 'methods wrapped at Play start');

        // --- v2: same properties, new formula, new method, new plain field
        factories['pack:///a'] = () => {
            class Player2 extends Component {
                speed = 2;
                x = 0;
                trail: number[] = [];
                update(dt: number) {
                    this.x += this.speed * dt * 10;
                }
                label() {
                    return 'v2';
                }
                jump() {
                    return 'jump';
                }
            }
            ccclass(Player2, 'Player', 'cidPlayer', ['speed']);
            return { Player: Player2 };
        };
        changedNow = ['a'];
        await executorInst.reload(); // Cocos asks for a full reload while playing: intercepted
        ok(fullReloads === 0, 'full reload intercepted while playing');
        ok(errors.length === 0, 'no "class id already registered" errors: ' + errors.join(','));
        ok(js.getClassByName('Player') === Player, 'registry points at the running class again');
        live.update(1);
        ok(live.x === 20, 'new update() formula on the live component, state kept (x=' + live.x + ')');
        ok(grabbed.call(live) === 'v2', 'callback grabbed before the swap runs the new code');
        ok((live as any).jump() === 'jump', 'new method available');
        ok(Array.isArray((live as any).trail), 'new field added to the live component');
        ok(/Player\.ts: 2 methods updated, 1 method added, 1 field added \(trail\)/.test(lastReport()), 'report: ' + lastReport());
        ok(registry['pack:///b'].Other === Other, 'unchanged module untouched');

        // --- v3: a new @property: refused, running code kept
        cached.a = 1;
        factories['pack:///a'] = () => {
            class Player3 extends Component {
                speed = 2;
                hp = 10;
                label() {
                    return 'v3';
                }
            }
            ccclass(Player3, 'Player', 'cidPlayer', ['speed', 'hp']);
            return { Player: Player3 };
        };
        delete registry['pack:///a']; // the swap re-imports it
        registry['pack:///a'] = { Player };
        await executorInst.reload();
        ok(/restart needed \(new @property 'hp'\)/.test(lastReport()), 'restart needed reported: ' + lastReport());
        ok(live.label() === 'v2', 'running code kept after a refused change');
        ok(js.getClassByName('Player') === Player && errors.length === 0, 'registry restored, no errors');
        ok(registry['pack:///a'].Player === Player, 'module registry restored to the running module');

        // --- v4: a syntax error: reported, nothing changes
        cached.a = 1;
        importThrows = true;
        await executorInst.reload();
        importThrows = false;
        ok(/failed to load/.test(lastReport()), 'load failure reported: ' + lastReport());
        ok(live.label() === 'v2' && js.getClassByName('Player') === Player, 'running code and registry intact');

        // --- v5: update() removed: taken out of the scheduler
        cached.a = 1;
        registry['pack:///a'] = { Player };
        factories['pack:///a'] = () => {
            class Player5 extends Component {
                speed = 2;
                label() {
                    return 'v5';
                }
            }
            ccclass(Player5, 'Player', 'cidPlayer', ['speed']);
            return { Player: Player5 };
        };
        await executorInst.reload();
        ok(sched.updateInvoker._zero.array.indexOf(live) < 0, 'removed update() unscheduled');
        ok(live.label() === 'v5', 'label updated');

        // --- stop: Cocos' full reload runs once so the next Play is clean
        await pp.stop();
        ok(fullReloads === 1, 'full reload after Stop (' + fullReloads + ')');
        // not playing: reloads pass through
        await executorInst.reload();
        ok(fullReloads === 2, 'reload passes through when not playing');
        scene.unload();
        const before = fullReloads;
        await executorInst.reload();
        ok(pp.start === origStart && executorInst.reload === origReload && fullReloads === before + 1 && !executorInst.__hrOriginalReload, 'hooks removed on unload, originals back');
    } catch (e) {
        out.push('  FAIL exception ' + ((e as Error).stack || e));
    }
    console.log(out.join('\n'));
    const failed = out.filter((l) => l.indexOf('FAIL') >= 0).length;
    console.log(`\n${out.length - failed} passed, ${failed} failed`);
    assert.ok(true);
    process.exit(failed ? 1 : 0);
})();
