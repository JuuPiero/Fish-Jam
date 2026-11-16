import assert from 'assert';
import { test, results } from './harness';
import { BETWEEN_FRAMES, FrameRecorder, MAX_SAMPLES } from '../assets/core/recorder';
import { buildHierarchy, flattenHierarchy, topLevelMs } from '../assets/core/hierarchy';
import { cpuBreakdown, PHASE } from '../assets/core/phases';
import { formatBytes, frameAtX, gridLines, niceMax, stack, xOfFrame } from '../assets/core/chart';
import { RingBuffer } from '../assets/core/ring';
import { FrameData, parseCommand, parseGameMessage, SAMPLE_STRIDE } from '../assets/core/protocol';
import { groupByPass, loadOpName, summarize } from '../assets/core/capture';

let clock = 0;
const rec = () => new FrameRecorder(() => clock);
const at = (t: number) => (clock = t);

function nameMap(r: FrameRecorder): (id: number) => string {
    const all: Record<number, string> = {};
    r.names.resendAll();
    const m = r.names.takeNew() || {};
    Object.keys(m).forEach((k) => (all[Number(k)] = m[Number(k)]));
    return (id) => all[id];
}

function near(a: number, b: number, eps = 1e-9, msg = ''): void {
    assert.ok(Math.abs(a - b) <= eps, msg + ' expected ' + b + ' got ' + a);
}

test('recorder: nested samples, durations, frame and cpu time', () => {
    const r = rec();
    at(0);
    r.beginFrame(1);
    at(1);
    r.begin('Update');
    at(2);
    r.begin('Player.update');
    at(5);
    r.end();
    at(6);
    r.end();
    at(10);
    r.endFrame();
    assert.strictEqual(r.take().length, 0, 'a frame is finished at the next frame start');
    at(16);
    r.beginFrame(2);
    const fs = r.take();
    assert.strictEqual(fs.length, 1);
    const f = fs[0];
    assert.strictEqual(f.index, 1);
    near(f.cpuMs, 10);
    near(f.frameMs, 16);
    const s = f.samples;
    assert.strictEqual(s.length, 2 * SAMPLE_STRIDE);
    assert.strictEqual(s[1], -1, 'Update is top level');
    assert.strictEqual(s[5], 0, 'Player.update is under Update');
    near(s[3], 5, 1e-9, 'Update duration');
    near(s[7], 3, 1e-9, 'Player.update duration');
});

test('recorder: open samples are closed at the frame end; extra ends are ignored', () => {
    const r = rec();
    at(0);
    r.beginFrame(1);
    r.end(); // nothing open
    at(1);
    r.begin('Leaky');
    at(4);
    r.endFrame();
    at(5);
    r.beginFrame(2);
    const f = r.take()[0];
    near(f.samples[3], 3, 1e-9, 'closed at the frame end');
});

test('recorder: work between frames goes under "Between Frames" of the next frame', () => {
    const r = rec();
    at(0);
    r.beginFrame(1);
    at(2);
    r.endFrame();
    at(3);
    r.begin('onKeyDown');
    at(4);
    r.begin('inner');
    at(5);
    r.end();
    at(6);
    r.end();
    at(10);
    r.beginFrame(2);
    at(12);
    r.endFrame();
    at(14);
    r.beginFrame(3);
    const frames = r.take();
    const f2 = frames[frames.length - 1];
    const names = nameMap(r);
    const h = buildHierarchy(f2, names);
    assert.strictEqual(h[0].name, BETWEEN_FRAMES);
    near(h[0].totalMs, 3);
    assert.strictEqual(h[0].children[0].name, 'onKeyDown');
    assert.strictEqual(h[0].children[0].children[0].name, 'inner');
    near(h[0].children[0].children[0].totalMs, 1);
});

test('recorder: attached counters land on the frame that ended', () => {
    const r = rec();
    at(0);
    r.beginFrame(1);
    at(5);
    r.endFrame();
    r.attach({ render: { drawCalls: 42, triangles: 1000, instances: 3, passes: 2 } });
    at(16);
    r.beginFrame(2);
    const f = r.take()[0];
    assert.strictEqual(f.render!.drawCalls, 42);
});

test('recorder: samples per frame are capped', () => {
    const r = rec();
    const warn = console.warn;
    console.warn = () => undefined;
    at(0);
    r.beginFrame(1);
    for (let i = 0; i < MAX_SAMPLES + 50; i++) {
        r.begin('x');
        r.end();
    }
    r.endFrame();
    at(1);
    r.beginFrame(2);
    console.warn = warn;
    assert.strictEqual(r.take()[0].samples.length, MAX_SAMPLES * SAMPLE_STRIDE);
});

test('hierarchy: same-name siblings merge (calls), self time, sorting and expansion', () => {
    const r = rec();
    at(0);
    r.beginFrame(1);
    for (let k = 0; k < 3; k++) {
        r.begin('Update');
        r.begin('Enemy.update');
        at(clock + 2);
        r.end();
        at(clock + 1);
        r.end();
    }
    r.begin('Rendering');
    at(clock + 4);
    r.end();
    r.endFrame();
    at(clock + 1);
    r.beginFrame(2);
    const f = r.take()[0];
    const names = nameMap(r);
    const h = buildHierarchy(f, names);
    const upd = h.find((n) => n.name === 'Update')!;
    assert.strictEqual(upd.calls, 3);
    near(upd.totalMs, 9);
    near(upd.selfMs, 3);
    assert.strictEqual(upd.children[0].calls, 3);
    near(upd.children[0].totalMs, 6);
    const collapsed = flattenHierarchy(h, () => false, 'total', true);
    assert.deepStrictEqual(collapsed.map((n) => n.name), ['Update', 'Rendering'], 'by total, descending');
    const open = flattenHierarchy(h, (k) => k === 'Update', 'name', false);
    assert.deepStrictEqual(open.map((n) => n.key), ['Rendering', 'Update', 'Update/Enemy.update']);
});

test('phases: CPU breakdown by category, Other and Idle', () => {
    const r = rec();
    at(0);
    r.beginFrame(1);
    r.begin(PHASE.input);
    at(1);
    r.end();
    r.begin(PHASE.update);
    at(5);
    r.end();
    r.begin('System: physics.postUpdate');
    at(7);
    r.end();
    r.begin(PHASE.rendering);
    at(10);
    r.end();
    at(11);
    r.endFrame();
    at(20);
    r.beginFrame(2);
    const f = r.take()[0];
    const b = cpuBreakdown(f, nameMap(r));
    near(b.Input, 1);
    near(b.Scripts, 4);
    near(b.Systems, 2);
    near(b.Rendering, 3);
    near(b.Other, 1, 1e-9, 'untimed rest of the CPU time');
    near(b.Idle, 9);
    const renderId = Object.entries((() => {
        r.names.resendAll();
        return r.names.takeNew() || {};
    })()).find((e) => e[1] === PHASE.rendering)![0];
    near(topLevelMs(f, Number(renderId)), 3);
});

test('chart math: nice max, gridlines, stacking, frame under the mouse', () => {
    assert.strictEqual(niceMax(13), 20);
    assert.strictEqual(niceMax(16.7), 20);
    assert.strictEqual(niceMax(2.3), 2.5);
    assert.strictEqual(niceMax(0), 1);
    assert.strictEqual(niceMax(1000), 1000);
    assert.deepStrictEqual(gridLines(20), [5, 10, 15, 20]);
    assert.deepStrictEqual(stack([[1, 2], [3, 4]]), [[1, 2], [4, 6]]);
    // 300-slot chart, 10 frames, newest at the right edge
    assert.strictEqual(frameAtX(299, 300, 10, 300), 9, 'the newest slot is [299, 300)');
    assert.strictEqual(frameAtX(299.5, 300, 10, 300), 9);
    assert.strictEqual(frameAtX(298.5, 300, 10, 300), 8);
    assert.strictEqual(frameAtX(290.5, 300, 10, 300), 0, 'the oldest of 10');
    assert.strictEqual(frameAtX(289.5, 300, 10, 300), -1, 'left of the data');
    assert.strictEqual(frameAtX(7.5, 30, 10, 10), 2, '3px slots');
    assert.strictEqual(xOfFrame(9, 300, 10, 300), 299);
    assert.strictEqual(formatBytes(1536), '1.5 KB');
});

test('ring buffer keeps the newest items in order', () => {
    const r = new RingBuffer<number>(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    assert.deepStrictEqual(r.toArray(), [3, 4, 5]);
    assert.strictEqual(r.length, 3);
    assert.strictEqual(r.last(), 5);
    r.clear();
    assert.strictEqual(r.length, 0);
});

test('protocol: only the fixed command set is accepted', () => {
    assert.deepStrictEqual(parseCommand('{"cmd":"record","on":true,"deep":0}'), { cmd: 'record', on: true, deep: false });
    assert.deepStrictEqual(parseCommand('{"cmd":"step","limit":"12.7"}'), { cmd: 'step', limit: 12 });
    assert.deepStrictEqual(parseCommand('{"cmd":"step","limit":-5}'), { cmd: 'step', limit: -1 });
    assert.strictEqual(parseCommand('{"cmd":"eval","code":"alert(1)"}'), null);
    assert.strictEqual(parseCommand('not json'), null);
    assert.strictEqual(parseCommand('{"cmd":"step","limit":"x"}'), null);
    const hello = parseGameMessage('{"type":"hello","runtime":"Preview","frameDebugger":1}');
    assert.ok(hello && hello.type === 'hello' && hello.frameDebugger === true);
    assert.strictEqual(parseGameMessage('{"type":"run","code":"x"}'), null);
});

test('frame debugger model: groups by pass, totals, load ops', () => {
    const cap = {
        frame: 7,
        draws: 3,
        passes: 2,
        events: [
            { type: 'pass', pass: 0, width: 1024, height: 1024, color: [], depth: 'clear', clearColor: null },
            { type: 'draw', draw: 0, pass: 0, shader: 'shadow', effect: '', material: '', passIndex: 1, phase: '', node: 'Hero', vertices: 100, indices: 300, instances: 0, triangles: 100 },
            { type: 'pass', pass: 1, width: 800, height: 600, color: ['clear'], depth: 'clear', clearColor: [0, 0, 0, 1] },
            { type: 'draw', draw: 1, pass: 1, shader: 'standard', effect: 'builtin-standard', material: 'Hero', passIndex: 0, phase: '', node: 'Hero', vertices: 100, indices: 300, instances: 0, triangles: 100 },
            { type: 'draw', draw: 2, pass: 1, shader: 'standard', effect: 'builtin-standard', material: 'Rock', passIndex: 0, phase: '', node: 'Rock', vertices: 24, indices: 36, instances: 50, triangles: 600 },
        ],
    } as any;
    const g = groupByPass(cap.events);
    assert.strictEqual(g.length, 2);
    assert.strictEqual(g[1].draws.length, 2);
    const t = summarize(cap);
    assert.strictEqual(t.triangles, 800);
    assert.strictEqual(t.instances, 52);
    assert.strictEqual(loadOpName(1), 'clear');
    assert.strictEqual(loadOpName(0), 'load');
});

test('frame data survives JSON (what crosses the socket)', () => {
    const f: FrameData = { index: 3, time: 1, frameMs: 16, cpuMs: 9, samples: [0, -1, 0, 9], render: { drawCalls: 1, triangles: 2, instances: 0, passes: -1 } };
    const msg = parseGameMessage(JSON.stringify({ type: 'frames', names: { 0: 'Update' }, frames: [f] }));
    assert.ok(msg && msg.type === 'frames');
    assert.deepStrictEqual((msg as any).frames[0], f);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
