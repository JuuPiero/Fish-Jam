/**
 * The main process against a fake editor: Logger records in, broadcasts out,
 * scene-script pairing, uncaught errors, Clear on Play, Error Pause, history.
 */
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { run, test } from './harness';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'console-pro-main-'));
const logs: any[] = [];
const handlers: Record<string, ((...a: any[]) => void)[]> = {};
const broadcasts: { name: string; payload: any }[] = [];
const requests: any[][] = [];
const profile: Record<string, any> = {};

function record(r: any) {
    logs.push(r);
    (handlers.record || []).forEach((f) => f(r));
}

(globalThis as any).Editor = {
    Project: { path: root, name: 'Fake' },
    Logger: {
        query: () => logs,
        clear: () => {
            logs.length = 0;
            (handlers.clear || []).forEach((f) => f());
        },
        __protected__: {
            on: (a: string, f: any) => (handlers[a] = handlers[a] || []).push(f),
            removeListener: (a: string, f: any) => (handlers[a] = (handlers[a] || []).filter((x) => x !== f)),
        },
    },
    Message: {
        broadcast: (name: string, payload: any) => broadcasts.push({ name, payload: JSON.parse(JSON.stringify(payload === undefined ? null : payload)) }),
        request: async (...args: any[]) => {
            requests.push(args);
            return true;
        },
        send: () => undefined,
    },
    Profile: {
        getConfig: async (_pkg: string, key: string) => profile[key],
        setConfig: async (_pkg: string, key: string, v: any) => (profile[key] = v),
    },
    Package: { getPackages: () => [] },
    Panel: { open: () => undefined },
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const main = require('../source/main');
const M = main.methods;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const entriesOut = () => broadcasts.filter((b) => b.name === 'console-pro:entries').reduce((a: any[], b) => a.concat(b.payload), []);

test('load takes the Logger history; records are broadcast in batches', async () => {
    record({ type: 'log', message: 'early', time: Date.now() - 1000, process: 'browser' });
    await main.load();
    let q = M.queryLogs();
    assert.deepStrictEqual(q.entries.map((e: any) => e.text), ['early']);
    assert.strictEqual(q.mode, 'event');
    record({ type: 'warn', message: '[Net] slow', time: Date.now(), process: 'browser' });
    record({ type: 'error', message: 'boom', stack: 'Error: boom\n    at a (db://assets/a.ts:1:1)', time: Date.now(), process: 'renderer' });
    await sleep(80);
    const out = entriesOut();
    assert.deepStrictEqual(out.map((e: any) => [e.level, e.tag, e.source]), [['warn', 'Net', 'main'], ['error', '', 'panel']]);
    assert.ok(out[0].id < out[1].id);
    q = M.queryLogs();
    assert.strictEqual(q.entries.length, 3);
});

test('scene-script calls confirm sources (retag broadcast)', async () => {
    broadcasts.length = 0;
    const t = Date.now();
    record({ type: 'log', message: 'Player spawned', time: t, process: 'renderer' });
    M.sceneEvents({ source: 'game', calls: [{ level: 'log', head: 'Player spawned', t }] });
    await sleep(80);
    const ent = entriesOut().find((e: any) => e.text === 'Player spawned');
    const retag = broadcasts.filter((b) => b.name === 'console-pro:retag').reduce((a: any[], b) => a.concat(b.payload), []);
    // either the entry left with the game source already, or a retag followed
    assert.ok(ent.source === 'game' || retag.some((r: any) => r.id === ent.id && r.source === 'game'));
    assert.strictEqual(M.queryLogs().entries.find((e: any) => e.text === 'Player spawned').source, 'game');
});

test('uncaught errors are added unless Cocos recorded them', async () => {
    broadcasts.length = 0;
    const t = Date.now();
    M.sceneEvents({ source: 'game', errors: [{ message: 'x is not defined', stack: 'ReferenceError: x is not defined\n    at f (pack:///chunks/00/abc.js:1:1)', t, kind: 'error' }] });
    M.sceneEvents({ source: 'game', errors: [{ message: 'dup message', stack: '', t, kind: 'error' }] });
    record({ type: 'error', message: 'Uncaught dup message', time: t, process: 'renderer' });
    await sleep(900);
    const texts = entriesOut().map((e: any) => e.text);
    assert.ok(texts.indexOf('Uncaught x is not defined') >= 0);
    assert.strictEqual(texts.filter((s: string) => s.indexOf('dup message') >= 0).length, 1, 'no duplicate');
    const u = entriesOut().find((e: any) => e.text === 'Uncaught x is not defined');
    assert.ok(u.uncaught && u.source === 'game' && u.sure);
});

test('Clear on Play clears when PIE starts; Error Pause pauses PIE once', async () => {
    await M.setConfig('clearOnPlay', true);
    await M.setConfig('errorPause', true);
    assert.strictEqual(profile.clearOnPlay, true);
    broadcasts.length = 0;
    M.sceneEvents({ source: 'game', play: { playing: true, paused: false, t: Date.now() } });
    assert.ok(broadcasts.some((b) => b.name === 'console-pro:cleared'));
    assert.strictEqual(M.queryLogs().entries.length, 0);
    requests.length = 0;
    record({ type: 'error', message: 'PreviewInEditor game error', time: Date.now(), process: 'renderer' });
    record({ type: 'error', message: 'PreviewInEditor second error', time: Date.now(), process: 'renderer' });
    await sleep(80);
    const pauses = requests.filter((r) => r[0] === 'scene' && r[1] === 'editor-preview-call-method' && r[2] === 'pause' && r[3] === true);
    assert.strictEqual(pauses.length, 1, 'paused once (throttled)');
    assert.ok(broadcasts.some((b) => b.name === 'console-pro:play-state' && b.payload.reason === 'error-pause'));
    // a scene (edit-mode) error does not pause
    M.onPreviewStop();
    requests.length = 0;
    await sleep(1100);
    record({ type: 'error', message: 'edit mode error', time: Date.now(), process: 'renderer' });
    await sleep(80);
    assert.strictEqual(requests.filter((r) => r[1] === 'editor-preview-call-method').length, 0);
    await M.setConfig('clearOnPlay', false);
    await M.setConfig('errorPause', false);
});

test("Cocos' own Clear does not clear Console Pro; ours does not clear Cocos'", async () => {
    record({ type: 'log', message: 'keep me', time: Date.now(), process: 'browser' });
    (globalThis as any).Editor.Logger.clear();
    assert.ok(M.queryLogs().entries.some((e: any) => e.text === 'keep me'));
    record({ type: 'log', message: 'after cocos clear', time: Date.now(), process: 'browser' });
    M.clear();
    assert.strictEqual(M.queryLogs().entries.length, 0);
    assert.strictEqual(logs.length, 1, "Cocos' list is untouched");
});

test('capacity setting trims the ring buffer', async () => {
    for (let i = 0; i < 1500; i++) record({ type: 'log', message: 'n' + i, time: Date.now(), process: 'browser' });
    const c = await M.setConfig('capacity', 1000);
    assert.strictEqual(c.capacity, 1000);
    const q = M.queryLogs();
    assert.strictEqual(q.entries.length, 1000);
    assert.strictEqual(q.entries[999].text, 'n1499');
    await M.setConfig('capacity', 50000);
});

test('history survives an extension reload (same editor process)', async () => {
    M.clear();
    await sleep(5);
    record({ type: 'log', message: 'before reload', time: Date.now(), process: 'browser' });
    main.unload();
    assert.ok(fs.existsSync(path.join(root, 'temp', 'console-pro', 'history.json')));
    // Cocos keeps its list; a fresh load sees both (and no duplicates)
    await main.load();
    const texts = M.queryLogs().entries.map((e: any) => e.text);
    assert.strictEqual(texts.filter((s: string) => s === 'before reload').length, 1);
    assert.ok(texts.indexOf('after cocos clear') < 0, 'lines cleared in Console Pro stay cleared');
    main.unload();
    fs.rmSync(root, { recursive: true, force: true });
});

run();
