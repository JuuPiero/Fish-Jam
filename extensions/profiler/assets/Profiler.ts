/**
 * Profiler, game side (Unity's Profiler API and player connection).
 *
 * - Profiler.beginSample(name) / endSample(): your own markers, nested.
 * - Every frame (while the editor records): the frame's parts (input, Start /
 *   Update / LateUpdate of the scripts, each director System, post update,
 *   rendering), draw calls / triangles / instances, memory and node counts.
 * - Talks to the editor's Profiler window over a WebSocket: telemetry out, a
 *   fixed set of commands in (record on/off, capture a frame, step). No code
 *   is ever sent or run.
 *
 * On by itself in previews and debug builds (Play in Editor, browser preview,
 * a phone opening the preview URL). Release builds stay inert unless a
 * ProfilerConnector component or Profiler.enable() opts in.
 */
import { assetManager, director, Director, js, RenderTexture, sys, Texture2D, TextureCube } from 'cc';
import { DEBUG, EDITOR, EDITOR_NOT_IN_PREVIEW, PREVIEW } from 'cc/env';
import { PHASE, systemSample } from './core/phases';
import { EditorCommand, FrameData, parseCommand, PROFILER_PATH, PROFILER_PORTS } from './core/protocol';
import { FrameRecorder } from './core/recorder';
import { FrameCapture } from './FrameCapture';

function now(): number {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

const recorder = new FrameRecorder(now);
const capture = new FrameCapture();

let enabled = false;
let recording = false;
let deep = false;
let socket: WebSocket | null = null;
let portIndex = 0;
let failures = 0;
let retryTimer: any = null;
let options: { host?: string; port?: number } = {};
let lastSend = 0;
let lastMemory = 0;
let hooksInstalled = false;

// ------------------------------------------------------------------ method wrapping (only while recording)

interface Wrapped {
    target: any;
    name: string;
    hadOwn: boolean;
    own: any;
}

const wrapped: Wrapped[] = [];

/** Shadows target[name] with a timed version (an own property, removed by unwrapAll). */
function wrap(target: any, name: string, sample: string): void {
    if (!target) return;
    const orig = target[name];
    if (typeof orig !== 'function' || (orig as any).__profilerWrap) return;
    const hadOwn = Object.prototype.hasOwnProperty.call(target, name);
    const w = function (this: any) {
        recorder.begin(sample);
        try {
            return orig.apply(this, arguments as any);
        } finally {
            recorder.end();
        }
    };
    (w as any).__profilerWrap = true;
    try {
        target[name] = w;
        wrapped.push({ target, name, hadOwn, own: hadOwn ? orig : null });
    } catch (e) {
        // read-only on this platform
    }
}

function unwrapAll(): void {
    for (let i = wrapped.length - 1; i >= 0; i--) {
        const w = wrapped[i];
        try {
            if (w.hadOwn) w.target[w.name] = w.own;
            else delete w.target[w.name];
        } catch (e) {
            // leave it
        }
    }
    wrapped.length = 0;
    wrappedSystems.length = 0;
    deepProtos.length = 0;
}

const wrappedSystems: any[] = [];

function wrapEngine(): void {
    const sched: any = (director as any)._compScheduler;
    if (sched) {
        wrap(sched, 'startPhase', PHASE.start);
        wrap(sched, 'updatePhase', PHASE.update);
        wrap(sched, 'lateUpdatePhase', PHASE.lateUpdate);
    }
    const root: any = director.root;
    if (root) wrap(root, 'frameMove', PHASE.pipeline);
    wrapSystems();
}

/** Director systems (physics, animation, tween, scheduler...): each update / postUpdate. */
function wrapSystems(): void {
    const list: any[] = (director as any)._systems || [];
    for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (wrappedSystems.indexOf(s) >= 0) continue;
        wrappedSystems.push(s);
        const id = String(s.id || js.getClassName(s) || 'system');
        wrap(s, 'update', systemSample(id, 'update'));
        wrap(s, 'postUpdate', systemSample(id, 'postUpdate'));
    }
}

// ------------------------------------------------------------------ deep profiling (every script's update)

const deepProtos: any[] = [];
let lastDeepScan = 0;

/** Wraps update / lateUpdate of every component class in the scene (on the prototype, once per class). */
function scanDeep(): void {
    const scene = director.getScene();
    if (!scene) return;
    const walk = (n: any) => {
        const comps = n.components;
        for (let i = 0; i < comps.length; i++) {
            const proto = Object.getPrototypeOf(comps[i]);
            if (!proto || deepProtos.indexOf(proto) >= 0) continue;
            deepProtos.push(proto);
            const cls = js.getClassName(comps[i]) || (proto.constructor && proto.constructor.name) || 'Component';
            // only methods the class itself defines
            if (Object.prototype.hasOwnProperty.call(proto, 'update')) wrap(proto, 'update', cls + '.update');
            if (Object.prototype.hasOwnProperty.call(proto, 'lateUpdate')) wrap(proto, 'lateUpdate', cls + '.lateUpdate');
        }
        const ch = n.children;
        for (let i = 0; i < ch.length; i++) walk(ch[i]);
    };
    walk(scene);
}

// ------------------------------------------------------------------ counters

function renderCounters(): FrameData['render'] {
    try {
        const dev: any = director.root ? director.root.device : null;
        if (!dev) return undefined;
        return {
            drawCalls: Number(dev.numDrawCalls) || 0,
            triangles: Number(dev.numTris) || 0,
            instances: Number(dev.numInstances) || 0,
            passes: capture.countPasses ? capture.passCount : -1,
        };
    } catch (e) {
        return undefined;
    }
}

function textureBytes(a: any): number {
    try {
        if (a instanceof RenderTexture) return (a.width || 0) * (a.height || 0) * 8; // color + depth
        if (a instanceof TextureCube) return (a.width || 0) * (a.height || 0) * 4 * 6;
        if (a instanceof Texture2D) {
            const base = (a.width || 0) * (a.height || 0) * 4;
            return a.mipmapLevel > 1 || (a as any)._mipmapMode ? Math.round(base * 1.33) : base;
        }
    } catch (e) {
        // ignore
    }
    return 0;
}

function countNodes(): number {
    const scene = director.getScene();
    if (!scene) return 0;
    let n = 0;
    const walk = (node: any) => {
        n++;
        const ch = node.children;
        for (let i = 0; i < ch.length; i++) walk(ch[i]);
    };
    walk(scene);
    return n;
}

function memoryCounters(): FrameData['memory'] {
    const pm: any = typeof performance !== 'undefined' ? (performance as any).memory : null;
    let assets = 0;
    let tex = 0;
    try {
        const cache: any = assetManager.assets;
        assets = cache.count || 0;
        cache.forEach((a: any) => {
            tex += textureBytes(a);
        });
    } catch (e) {
        // ignore
    }
    return {
        heapUsed: pm ? Number(pm.usedJSHeapSize) || 0 : -1,
        heapTotal: pm ? Number(pm.totalJSHeapSize) || 0 : -1,
        assets,
        textureBytes: tex,
    };
}

// ------------------------------------------------------------------ frame events

function onBeginFrame(): void {
    const frame = director.getTotalFrames();
    if (recording) {
        // counters of the frame that just ended (the device reports them at present)
        const extra: Partial<FrameData> = { render: renderCounters() };
        const t = now();
        if (t - lastMemory > 500) {
            lastMemory = t;
            extra.memory = memoryCounters();
            extra.nodes = countNodes();
        }
        recorder.attach(extra);
        recorder.beginFrame(frame);
        if (deep && t - lastDeepScan > 1000) {
            lastDeepScan = t;
            scanDeep();
        }
        if (((director as any)._systems || []).length !== wrappedSystems.length) wrapSystems();
        recorder.begin(PHASE.input);
    }
    capture.beginFrame(frame);
}

function onBeforeUpdate(): void {
    if (recording && recorder.inFrame) recorder.end();
}

function onAfterUpdate(): void {
    if (recording && recorder.inFrame) recorder.begin(PHASE.postUpdate);
}

function onBeforeDraw(): void {
    if (!recording || !recorder.inFrame) return;
    recorder.end();
    recorder.begin(PHASE.rendering);
}

function onAfterDraw(): void {
    if (!recording || !recorder.inFrame) return;
    recorder.end();
    recorder.begin(PHASE.endOfFrame);
}

function onEndFrame(): void {
    if (recording && recorder.inFrame) {
        recorder.end();
        recorder.endFrame();
    }
    const cap = capture.endFrame();
    if (cap) send({ type: 'capture', capture: cap });
    if (recording) {
        const t = now();
        if (t - lastSend >= 100) {
            lastSend = t;
            flush();
        }
    }
}

function flush(): void {
    const frames = recorder.take();
    if (!frames.length) return;
    if (!isOpen()) return;
    const names = recorder.names.takeNew();
    send(names ? { type: 'frames', names, frames } : { type: 'frames', frames });
}

function installDirectorHooks(): void {
    if (hooksInstalled) return;
    hooksInstalled = true;
    director.on(Director.EVENT_BEGIN_FRAME, onBeginFrame);
    director.on(Director.EVENT_BEFORE_UPDATE, onBeforeUpdate);
    director.on(Director.EVENT_AFTER_UPDATE, onAfterUpdate);
    director.on(Director.EVENT_BEFORE_DRAW, onBeforeDraw);
    director.on(Director.EVENT_AFTER_DRAW, onAfterDraw);
    director.on(Director.EVENT_END_FRAME, onEndFrame);
}

function removeDirectorHooks(): void {
    if (!hooksInstalled) return;
    hooksInstalled = false;
    director.off(Director.EVENT_BEGIN_FRAME, onBeginFrame);
    director.off(Director.EVENT_BEFORE_UPDATE, onBeforeUpdate);
    director.off(Director.EVENT_AFTER_UPDATE, onAfterUpdate);
    director.off(Director.EVENT_BEFORE_DRAW, onBeforeDraw);
    director.off(Director.EVENT_AFTER_DRAW, onAfterDraw);
    director.off(Director.EVENT_END_FRAME, onEndFrame);
}

function setRecording(on: boolean, deepOn: boolean): void {
    if (on === recording && deepOn === deep) return;
    unwrapAll();
    recorder.reset();
    recording = on;
    deep = on && deepOn;
    capture.countPasses = on && FrameCapture.supported();
    capture.setStep(capture.stepLimit);
    if (on) {
        recorder.names.resendAll();
        wrapEngine();
        if (deep) {
            lastDeepScan = now();
            scanDeep();
        }
    }
}

// ------------------------------------------------------------------ connection

function isOpen(): boolean {
    return !!socket && socket.readyState === 1;
}

function send(msg: any): void {
    if (!isOpen()) return;
    try {
        socket!.send(JSON.stringify(msg));
    } catch (e) {
        // closed meanwhile
    }
}

/** Where the editor may be: the given host, the preview page's host (a phone on the LAN), then this machine. */
function hosts(): string[] {
    if (options.host) return [options.host];
    let h = '';
    try {
        h = (globalThis as any).location ? String((globalThis as any).location.hostname || '') : '';
    } catch (e) {
        h = '';
    }
    return h && h !== '127.0.0.1' && h !== 'localhost' ? [h, '127.0.0.1'] : ['127.0.0.1'];
}

function ports(): number[] {
    return options.port ? [options.port] : PROFILER_PORTS;
}

function handle(cmd: EditorCommand): void {
    switch (cmd.cmd) {
        case 'record':
            setRecording(cmd.on, cmd.deep);
            break;
        case 'capture':
            if (FrameCapture.supported()) capture.arm();
            else send({ type: 'capture', capture: null, error: 'The Frame Debugger needs the web renderer (browser preview, Play in Editor or a web build).' });
            break;
        case 'step':
            capture.setStep(cmd.limit);
            break;
        case 'fd-off':
            capture.setStep(-1);
            break;
    }
}

function connect(): void {
    retryTimer = null;
    if (!enabled || typeof WebSocket === 'undefined') return;
    const hs = hosts();
    const ps = ports();
    const port = ps[portIndex % ps.length];
    const host = hs[Math.floor(portIndex / ps.length) % hs.length];
    let ws: WebSocket;
    try {
        ws = new WebSocket('ws://' + host + ':' + port + PROFILER_PATH);
    } catch (e) {
        portIndex++;
        schedule(3000);
        return;
    }
    let opened = false;
    ws.onopen = () => {
        opened = true;
        socket = ws;
        const loc = (globalThis as any).location;
        const nav = (globalThis as any).navigator;
        send({
            type: 'hello',
            runtime: EDITOR ? 'Play in Editor' : PREVIEW ? 'Preview' : 'Build',
            url: loc ? String(loc.href) : '',
            agent: nav ? String(nav.userAgent || '') : '',
            platform: String(sys.platform) + ' / ' + String(sys.os),
            frameDebugger: FrameCapture.supported(),
        });
    };
    ws.onmessage = (ev: MessageEvent) => {
        const cmd = parseCommand(String(ev.data));
        if (cmd) handle(cmd);
    };
    ws.onclose = () => {
        if (socket === ws) {
            socket = null;
            setRecording(false, false);
            capture.setStep(-1);
        }
        if (opened) failures = 0;
        else {
            portIndex++;
            failures++;
        }
        // no editor around (a debug build on a server): try less often after two rounds
        schedule(opened ? 1000 : failures > hs.length * ps.length * 2 ? 30000 : 3000);
    };
    ws.onerror = () => {
        // onclose follows
    };
}

function schedule(delay: number): void {
    if (retryTimer) clearTimeout(retryTimer);
    if (enabled) retryTimer = setTimeout(connect, delay);
}

// ------------------------------------------------------------------ public API

export class Profiler {
    /** Starts a named marker (Unity's Profiler.BeginSample). Free when the editor is not recording. */
    static beginSample(name: string): void {
        if (recording) recorder.begin(name);
    }

    /** Ends the innermost marker (Unity's Profiler.EndSample). */
    static endSample(): void {
        if (recording) recorder.end();
    }

    /** Runs fn inside a marker. */
    static sample<T>(name: string, fn: () => T): T {
        if (!recording) return fn();
        recorder.begin(name);
        try {
            return fn();
        } finally {
            recorder.end();
        }
    }

    /** Connected to an editor and recording frames. */
    static get recording(): boolean {
        return recording;
    }

    static get connected(): boolean {
        return isOpen();
    }

    static get enabled(): boolean {
        return enabled;
    }

    /**
     * Connects to the editor's Profiler (also in release builds).
     * host: the editor machine's IP when the game is not served by it (a native build on a phone);
     * port: when the editor uses another one.
     */
    static enable(opts?: { host?: string; port?: number }): void {
        options = opts || {};
        portIndex = 0;
        failures = 0;
        if (enabled) {
            if (socket) socket.close();
            return;
        }
        enabled = true;
        installDirectorHooks();
        schedule(500);
    }

    /** Disconnects and removes every hook. */
    static disable(): void {
        enabled = false;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        setRecording(false, false);
        capture.dispose();
        removeDirectorHooks();
        if (socket) socket.close();
        socket = null;
    }
}

if ((PREVIEW || DEBUG) && !EDITOR_NOT_IN_PREVIEW) Profiler.enable();
