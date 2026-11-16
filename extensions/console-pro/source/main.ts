/**
 * Main process of Console Pro.
 *
 * - Follows Cocos' log hub (see main/capture.ts) and keeps the last N lines in a ring
 *   buffer, so the panel can reload or open late without losing history.
 * - Pairs renderer lines with the console calls the scene script reports, to tell the
 *   edit scene from the running game (PIE); adds uncaught errors Cocos did not record.
 * - Error Pause, Clear on Play, opening files in the code editor, export, settings.
 *
 * Nothing in Cocos' own Console is changed: its list, Clear button and settings work as before.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LoggerApi, LoggerFollower, LoggerRecord, SourceTagger, toEntry } from './main/capture';
import { FrameResolver } from './main/resolve';
import { launchFor, programInfo, vsCodeCandidates } from './shared/editor-launch';
import { RingBuffer } from './shared/ring';
import { detectTag } from './shared/tags';
import { ConsoleConfig, DEFAULT_CONFIG, LogEntry, PlayState, ResolvedFrame, SceneBatch, Source, StackFrame } from './shared/types';

const PKG = 'console-pro';
const TAG = '[Console Pro]';
const HISTORY_KEEP = 10000;

const S = {
    config: Object.assign({}, DEFAULT_CONFIG) as ConsoleConfig,
    ring: new RingBuffer<LogEntry>(DEFAULT_CONFIG.capacity),
    nextId: 1,
    outbox: [] as LogEntry[],
    retags: [] as { id: number; source: Source }[],
    flushTimer: null as any,
    saveTimer: null as any,
    dirty: false,
    clearedAt: 0,
    play: { playing: false, paused: false } as PlayState,
    playKnown: false,
    lastPause: 0,
    follower: null as LoggerFollower | null,
    tagger: new SourceTagger(),
    resolver: null as FrameResolver | null,
    /** Last time each scene process reported (diagnostics). */
    sceneSeen: {} as Record<string, number>,
    inHandler: false,
};

function projectRoot(): string {
    try {
        return Editor.Project.path;
    } catch (e) {
        return process.cwd();
    }
}

function historyFile(): string {
    return path.join(projectRoot(), 'temp', PKG, 'history.json');
}

function broadcast(name: string, payload?: any): void {
    try {
        Editor.Message.broadcast(PKG + ':' + name, payload);
    } catch (e) {
        // editor shutting down
    }
}

// ------------------------------------------------------------------ entries

function scheduleFlush(): void {
    if (S.flushTimer) return;
    S.flushTimer = setTimeout(flush, 50);
}

function flush(): void {
    S.flushTimer = null;
    if (S.outbox.length) {
        const out = S.outbox;
        S.outbox = [];
        for (let i = 0; i < out.length; i += 5000) broadcast('entries', out.slice(i, i + 5000));
    }
    if (S.retags.length) {
        const r = S.retags;
        S.retags = [];
        broadcast('retag', r);
    }
}

function push(e: LogEntry): void {
    S.ring.push(e);
    S.outbox.push(e);
    S.dirty = true;
    if (e.level === 'error' && e.source === 'game') maybeErrorPause();
    scheduleFlush();
}

function onRecords(records: LoggerRecord[]): void {
    // a console call made while handling a record would come back here: never log inside
    if (S.inHandler) return;
    S.inHandler = true;
    try {
        for (let i = 0; i < records.length; i++) {
            const e = toEntry(records[i], S.nextId++);
            S.tagger.onEntry(e);
            push(e);
        }
    } catch (err) {
        // a malformed record: drop it silently (logging here would loop)
    } finally {
        S.inHandler = false;
    }
}

function onLoggerClear(): void {
    // Cocos' own Clear (or its Clear on Play) empties its list only; Console Pro keeps its history.
}

function clearAll(): void {
    S.ring.clear();
    S.outbox = [];
    S.retags = [];
    S.tagger.clear();
    S.clearedAt = Date.now();
    S.dirty = true;
    broadcast('cleared');
}

// ------------------------------------------------------------------ play state / Error Pause

function setPlay(next: PlayState): void {
    const was = S.play.playing;
    S.play = { playing: !!next.playing, paused: !!next.paused };
    S.playKnown = true;
    if (!was && S.play.playing && S.config.clearOnPlay) clearAll();
    broadcast('play-state', S.play);
}

function maybeErrorPause(): void {
    if (!S.config.errorPause) return;
    if (S.playKnown && (!S.play.playing || S.play.paused)) return;
    const now = Date.now();
    if (now - S.lastPause < 1000) return;
    S.lastPause = now;
    // Cocos' own PIE pause (the toolbar's Pause does the same call)
    Promise.resolve((Editor.Message.request as any)('scene', 'editor-preview-call-method', 'pause', true))
        .then(() => {
            S.play = { playing: true, paused: true };
            broadcast('play-state', { playing: true, paused: true, reason: 'error-pause' });
        })
        .catch(() => undefined);
}

function addUncaught(source: 'scene' | 'game', err: { message: string; stack: string; t: number; kind: string }): void {
    // Cocos' logger may record the same error itself: wait for it, then skip duplicates
    setTimeout(() => {
        const head = String(err.message || '').replace(/^Uncaught\s+/, '').slice(0, 80);
        if (!head) return;
        let dup = false;
        S.ring.forEachNewest((e) => {
            if (err.t - e.t > 5000) return false;
            if (e.level === 'error' && (e.text.indexOf(head) >= 0 || (!!e.stack && e.stack.indexOf(head) >= 0))) {
                dup = true;
                return false;
            }
            return true;
        });
        if (dup) return;
        const text = (err.kind === 'rejection' ? 'Uncaught (in promise) ' : 'Uncaught ') + err.message;
        push({ id: S.nextId++, t: err.t || Date.now(), level: 'error', text, stack: String(err.stack || ''), source, tag: detectTag(String(err.message || '')), uncaught: true, sure: true });
    }, 700);
}

// ------------------------------------------------------------------ history across extension reloads

function saveHistory(sync: boolean): void {
    if (!S.dirty) return;
    S.dirty = false;
    const all = S.ring.toArray();
    const entries = all.slice(Math.max(0, all.length - HISTORY_KEEP)).map((e) => (e.stack.length > 8000 ? Object.assign({}, e, { stack: e.stack.slice(0, 8000) }) : e));
    const data = JSON.stringify({ version: 1, pid: process.pid, clearedAt: S.clearedAt, entries });
    try {
        fs.mkdirSync(path.dirname(historyFile()), { recursive: true });
        if (sync) fs.writeFileSync(historyFile(), data);
        else fs.writeFile(historyFile(), data, () => undefined);
    } catch (e) {
        // temp/ not writable: history lives in memory only
    }
}

/** History saved by the previous load of this extension in the same editor session. */
function loadHistory(): { entries: LogEntry[]; clearedAt: number } {
    try {
        const o = JSON.parse(fs.readFileSync(historyFile(), 'utf8'));
        if (o && o.version === 1 && o.pid === process.pid && Array.isArray(o.entries)) return { entries: o.entries, clearedAt: Number(o.clearedAt) || 0 };
    } catch (e) {
        // no history
    }
    return { entries: [], clearedAt: 0 };
}

// ------------------------------------------------------------------ Logger access

/** Cocos' logger module (already loaded by the editor), found in the module cache: never loaded a second time. */
function cachedElectronLogger(): any {
    const cache: Record<string, any> = (require as any).cache || {};
    const keys = Object.keys(cache);
    for (let i = 0; i < keys.length; i++) {
        if (!/@base[\\/]electron-logger[\\/](index\.js|lib[\\/]browser[\\/]index\.js)$/.test(keys[i])) continue;
        const m = cache[keys[i]] && cache[keys[i]].exports;
        if (m && typeof m.on === 'function' && typeof m.query === 'function') return m;
    }
    return null;
}

function loggerApi(): LoggerApi {
    const L: any = (Editor as any).Logger;
    const prot = L && L.__protected__;
    const api: LoggerApi = { query: () => (L && typeof L.query === 'function' ? L.query() : []) };
    if (prot && typeof prot.on === 'function') {
        api.on = (a, f) => prot.on(a, f);
        if (typeof prot.removeListener === 'function') api.off = (a, f) => prot.removeListener(a, f);
    } else {
        const hub = cachedElectronLogger();
        if (hub) {
            api.on = (a, f) => hub.on(a, f);
            api.off = (a, f) => hub.removeListener(a, f);
        }
    }
    return api;
}

// ------------------------------------------------------------------ code editor

function exists(file: string): boolean {
    try {
        return !!file && fs.existsSync(file);
    } catch (e) {
        return false;
    }
}

async function scriptEditor(): Promise<{ path: string; commandArgument: string } | null> {
    try {
        const info = programInfo(await (Editor.Message.request as any)('program', 'query-program-info', 'scriptEditor'));
        if (info && exists(info.path)) return info;
    } catch (e) {
        // older editors: read the profile below
    }
    try {
        const info = programInfo(await Editor.Profile.getConfig('program', 'scriptEditor'));
        if (info && exists(info.path)) return info;
    } catch (e) {
        // not set
    }
    return null;
}

function spawnDetached(cmd: string, args: string[], shell = false): void {
    const { spawn } = require('child_process');
    const quoted = shell ? args.map((a) => (/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a)) : args;
    const child = spawn(cmd, quoted, { detached: true, stdio: 'ignore', windowsHide: false, shell });
    child.on('error', () => undefined);
    child.unref();
}

async function openInEditor(file: string, line: number, col: number): Promise<{ ok: boolean; via: string }> {
    if (!exists(file)) return { ok: false, via: 'missing file' };
    const root = projectRoot();
    const pref = await scriptEditor();
    if (pref && !/\.app$/i.test(pref.path)) {
        const l = launchFor(pref.path, file, line, col, root, pref.commandArgument);
        spawnDetached(l.cmd, l.args);
        return { ok: true, via: path.basename(pref.path) };
    }
    const candidates = vsCodeCandidates(process.env as Record<string, string>, process.platform);
    for (let i = 0; i < candidates.length; i++) {
        if (!exists(candidates[i])) continue;
        const l = launchFor(candidates[i], file, line, col, root);
        spawnDetached(l.cmd, l.args);
        return { ok: true, via: path.basename(candidates[i]) };
    }
    try {
        const { spawnSync } = require('child_process');
        const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['code'], { encoding: 'utf8', windowsHide: true });
        if (r.status === 0) {
            const l = launchFor('code', file, line, col, root);
            spawnDetached('code', l.args, true);
            return { ok: true, via: 'code' };
        }
    } catch (e) {
        // no code on PATH
    }
    const err = await require('electron').shell.openPath(file);
    return { ok: !err, via: 'system' };
}

// ------------------------------------------------------------------ messages

function plain<T>(v: T): T {
    return JSON.parse(JSON.stringify(v === undefined ? null : v));
}

export const methods: { [name: string]: (...args: any[]) => any } = {
    openPanel() {
        Editor.Panel.open(PKG + '.console');
    },

    openCocosConsole() {
        Editor.Panel.open('console');
    },

    async openDocs() {
        try {
            await require('electron').shell.openPath(path.join(__dirname, '..', 'README.md'));
        } catch (e) {
            console.warn(TAG + ' Could not open the README:', e);
        }
    },

    /** Everything the panel needs when it opens. */
    queryLogs() {
        return { entries: S.ring.toArray(), config: S.config, play: S.play, mode: S.follower ? S.follower.mode : 'none', projectRoot: projectRoot() };
    },

    clear() {
        clearAll();
        return true;
    },

    getConfig() {
        return S.config;
    },

    async setConfig(key: keyof ConsoleConfig, value: any) {
        if (!(key in DEFAULT_CONFIG)) return S.config;
        const def = (DEFAULT_CONFIG as any)[key];
        let v = value;
        if (typeof def === 'boolean') v = !!value;
        if (typeof def === 'number') v = Math.max(1000, Math.min(500000, Math.floor(Number(value) || def)));
        (S.config as any)[key] = v;
        if (key === 'capacity') S.ring.resize(v);
        try {
            await Editor.Profile.setConfig(PKG, key, v);
        } catch (e) {
            // kept for this session only
        }
        broadcast('config', S.config);
        return S.config;
    },

    async resolveFrames(frames: StackFrame[]): Promise<ResolvedFrame[]> {
        const r = S.resolver;
        const list = Array.isArray(frames) ? frames.slice(0, 60) : [];
        const out: ResolvedFrame[] = [];
        for (let i = 0; i < list.length; i++) {
            try {
                out.push(r ? await r.resolve(list[i]) : { file: '', line: 0, col: 0, display: list[i].url, user: false });
            } catch (e) {
                out.push({ file: '', line: list[i].line, col: list[i].col, display: list[i].url || list[i].raw, user: false });
            }
        }
        return plain(out);
    },

    async openLocation(loc: { file: string; line?: number; col?: number }) {
        if (!loc || !loc.file) return { ok: false, via: 'no file' };
        try {
            return await openInEditor(loc.file, Number(loc.line) || 1, Number(loc.col) || 1);
        } catch (e) {
            console.warn(TAG + ' Could not open ' + loc.file + ':', e);
            return { ok: false, via: String(e) };
        }
    },

    copyText(text: string) {
        require('electron').clipboard.writeText(String(text || ''));
        return true;
    },

    async exportText(text: string, suggested: string) {
        const name = String(suggested || 'console.log').replace(/[\\/:*?"<>|]/g, '_');
        const r: any = await Editor.Dialog.save({
            title: 'Export Console',
            path: path.join(projectRoot(), name),
            filters: [
                { name: 'Log file', extensions: ['log'] },
                { name: 'Text file', extensions: ['txt'] },
            ],
        });
        const file = r && (r.filePath || (typeof r === 'string' ? r : ''));
        if (!file || (r && r.canceled)) return '';
        fs.writeFileSync(file, String(text || ''), 'utf8');
        return file;
    },

    /** Batches from the scene script (scene and PIE processes). */
    sceneEvents(batch: SceneBatch) {
        if (!batch || (batch.source !== 'scene' && batch.source !== 'game')) return;
        S.sceneSeen[batch.source] = Date.now();
        if (batch.play) setPlay(batch.play);
        if (batch.calls && batch.calls.length) {
            const changed = S.tagger.onCalls(batch);
            if (changed.length) {
                for (let i = 0; i < changed.length; i++) S.retags.push(changed[i]);
                if (changed.some((c) => c.source === 'game')) {
                    const ids: Record<number, true> = {};
                    changed.forEach((c) => (ids[c.id] = true));
                    let error = false;
                    S.ring.forEachNewest((e) => {
                        if (ids[e.id] && e.level === 'error') error = true;
                        return !error && Date.now() - e.t < 10000;
                    });
                    if (error) maybeErrorPause();
                }
                S.dirty = true;
                scheduleFlush();
            }
        }
        if (batch.errors) for (let i = 0; i < batch.errors.length; i++) addUncaught(batch.source, batch.errors[i]);
    },

    /** Broadcast scene:preview-stop. */
    onPreviewStop() {
        setPlay({ playing: false, paused: false });
    },

    /** Diagnostics for the panel's menu. */
    status() {
        return plain({
            mode: S.follower ? S.follower.mode : 'none',
            loggerProtectedApi: !!((Editor as any).Logger && (Editor as any).Logger.__protected__ && (Editor as any).Logger.__protected__.on),
            entries: S.ring.size,
            capacity: S.ring.capacity,
            nextId: S.nextId,
            play: S.play,
            playKnown: S.playKnown,
            sceneScriptSeen: S.sceneSeen,
            config: S.config,
        });
    },
};

export async function load() {
    // settings
    try {
        const keys = Object.keys(DEFAULT_CONFIG) as (keyof ConsoleConfig)[];
        for (let i = 0; i < keys.length; i++) {
            const v = await Editor.Profile.getConfig(PKG, keys[i]);
            if (v !== undefined && v !== null && typeof v === typeof (DEFAULT_CONFIG as any)[keys[i]]) (S.config as any)[keys[i]] = v;
        }
    } catch (e) {
        // defaults
    }
    S.ring = new RingBuffer<LogEntry>(S.config.capacity);

    S.resolver = new FrameResolver({
        projectRoot: projectRoot(),
        queryDbPath: async (url) => String((await Editor.Message.request('asset-db', 'query-path', url)) || ''),
        packagePath: (name) => {
            try {
                const list: any[] = (Editor.Package as any).getPackages({ name }) || [];
                return list.length ? String(list[0].path || '') : '';
            } catch (e) {
                return '';
            }
        },
    });

    // history from before a reload of this extension, then what Cocos' logger holds
    const saved = loadHistory();
    S.clearedAt = saved.clearedAt;
    S.follower = new LoggerFollower(loggerApi(), onRecords, onLoggerClear);
    const existing = S.follower.start();
    const fromLogger: LogEntry[] = [];
    for (let i = 0; i < existing.length; i++) {
        const e = toEntry(existing[i], 0);
        if (e.t > S.clearedAt) fromLogger.push(e);
    }
    const firstT = existing.length ? toEntry(existing[0], 0).t : Infinity;
    const restored = saved.entries.filter((e) => e && e.t < firstT && e.t > S.clearedAt);
    const all = restored.concat(fromLogger);
    for (let i = 0; i < all.length; i++) {
        all[i].id = S.nextId++;
        S.ring.push(all[i]);
    }
    S.saveTimer = setInterval(() => saveHistory(false), 20000);
}

export function unload() {
    if (S.follower) S.follower.stop();
    if (S.flushTimer) clearTimeout(S.flushTimer);
    if (S.saveTimer) clearInterval(S.saveTimer);
    S.dirty = true;
    saveHistory(true);
}
