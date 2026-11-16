/** The scene script in a fake PIE process: console calls, uncaught errors, play state. */
import assert from 'assert';
import { run, test } from './harness';

const sent: any[] = [];
const listeners: Record<string, ((e: any) => void)[]> = {};
const g = globalThis as any;
g.isPreviewProcess = true;
g.window = {
    addEventListener: (n: string, f: any) => (listeners[n] = listeners[n] || []).push(f),
    removeEventListener: (n: string, f: any) => (listeners[n] = (listeners[n] || []).filter((x) => x !== f)),
};
g.Editor = { Message: { send: (_p: string, _m: string, b: any) => sent.push(JSON.parse(JSON.stringify(b))), request: async () => ({ sceneHook: true }) } };
const order: string[] = [];
const pp = {
    _state: 'stop',
    paused: false,
    isPause() {
        return this.paused;
    },
    async start() {
        order.push('start');
        this._state = 'play';
    },
    async stop() {
        this._state = 'stop';
    },
};
g.cce = { PreviewPlay: pp };

const realLog = console.log;
const seen: string[] = [];
console.log = (...a: any[]) => {
    seen.push(String(a[0]));
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const scene = require('../source/scene');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const all = (k: string) => sent.reduce((a: any[], b) => a.concat(b[k] ? (Array.isArray(b[k]) ? b[k] : [b[k]]) : []), []);

test('console calls still reach the console and are reported as {level, head}', async () => {
    scene.load();
    console.log('Score: %d', 3);
    console.warn('careful');
    await sleep(80);
    assert.deepStrictEqual(seen, ['Score: %d'], 'the original console still gets the call');
    const calls = all('calls');
    assert.deepStrictEqual(calls.map((c: any) => [c.level, c.head]), [['log', 'Score: '], ['warn', 'careful']]);
    assert.ok(sent.every((b) => b.source === 'game'));
});

test('uncaught errors and rejections are reported', async () => {
    listeners.error.forEach((f) => f({ message: 'Uncaught TypeError: x', error: { stack: 'TypeError: x\n    at f (pack:///chunks/00/a.js:1:1)' } }));
    listeners.error.forEach((f) => f({ type: 'error', target: {} })); // a resource load error
    listeners.unhandledrejection.forEach((f) => f({ reason: new Error('nope') }));
    await sleep(80);
    const errs = all('errors');
    assert.deepStrictEqual(errs.map((e: any) => [e.kind, e.message]), [['error', 'TypeError: x'], ['rejection', 'nope']]);
});

test('PreviewPlay.start is reported before the game starts', async () => {
    sent.length = 0;
    await pp.start();
    const first = sent[0];
    assert.ok(first && first.play && first.play.playing === true, 'sent synchronously from the start wrapper');
    assert.deepStrictEqual(order, ['start']);
    pp.paused = true;
    await sleep(300);
    assert.ok(all('play').some((p: any) => p.playing && p.paused), 'pause seen by polling');
    await pp.stop();
    await sleep(10);
    const plays = all('play');
    assert.strictEqual(plays[plays.length - 1].playing, false);
});

test('unload restores console and PreviewPlay', async () => {
    scene.unload();
    seen.length = 0;
    sent.length = 0;
    console.log('after');
    await sleep(60);
    assert.deepStrictEqual(seen, ['after']);
    assert.strictEqual(all('calls').length, 0);
    assert.strictEqual(listeners.error.length, 0);
    console.log = realLog;
});

run();
