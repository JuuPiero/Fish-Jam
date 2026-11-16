/**
 * The editor's server and a fake game over a real WebSocket: hello, frames
 * with their names, commands back, a capture, and refusal of other paths.
 */
import assert from 'assert';
import { WebSocket } from 'ws';
import { results } from './harness';
import { ProfilerServer } from '../source/server';
import { PROFILER_PATH } from '../assets/core/protocol';

function wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function until(cond: () => boolean, ms = 2000) {
    const t = Date.now();
    while (!cond()) {
        if (Date.now() - t > ms) throw new Error('timed out');
        await wait(10);
    }
}

async function run() {
    const events: any[] = [];
    let clients: any[] = [];
    const server = new ProfilerServer({
        clients: (l) => (clients = l),
        frames: (id, frames, names) => events.push({ kind: 'frames', id, frames, names }),
        capture: (id, capture, error) => events.push({ kind: 'capture', id, capture, error }),
        hello: (id) => server.send(id, { cmd: 'record', on: true, deep: false }),
    });
    const port = 7600 + Math.floor(Math.random() * 300);
    await server.start(false, [port, port + 1, port + 2]);
    assert.ok(server.running, 'listening');

    // another path is refused
    const stranger = new WebSocket('ws://127.0.0.1:' + server.port + '/other');
    let strangerClosed = false;
    stranger.on('close', () => (strangerClosed = true));
    stranger.on('error', () => undefined);
    await until(() => strangerClosed);

    const game = new WebSocket('ws://127.0.0.1:' + server.port + PROFILER_PATH);
    const got: any[] = [];
    game.on('message', (m) => got.push(JSON.parse(String(m))));
    await new Promise((r) => game.on('open', r));
    game.send(JSON.stringify({ type: 'hello', runtime: 'Preview', url: 'http://x', agent: 'test', platform: 'web', frameDebugger: true }));
    await until(() => clients.length === 1 && got.length === 1);
    assert.deepStrictEqual(got[0], { cmd: 'record', on: true, deep: false }, 'a new game gets the record settings');

    game.send(JSON.stringify({ type: 'frames', names: { 0: 'Update' }, frames: [{ index: 1, time: 0, frameMs: 16, cpuMs: 8, samples: [0, -1, 0, 8] }, { bad: true }] }));
    await until(() => events.some((e) => e.kind === 'frames'));
    const fr = events.find((e) => e.kind === 'frames');
    assert.strictEqual(fr.frames.length, 1, 'malformed frames are dropped');
    const kept = server.frames(clients[0].id)!;
    assert.strictEqual(kept.names[0], 'Update');
    assert.strictEqual(kept.frames.length, 1);

    assert.ok(server.send(clients[0].id, { cmd: 'step', limit: 3 }));
    await until(() => got.length === 2);
    assert.deepStrictEqual(got[1], { cmd: 'step', limit: 3 });

    game.send(JSON.stringify({ type: 'capture', capture: { frame: 2, events: [], draws: 0, passes: 0 } }));
    await until(() => events.some((e) => e.kind === 'capture'));
    assert.strictEqual(server.lastCapture(clients[0].id)!.frame, 2);

    game.close();
    await until(() => clients.length === 0);
    await server.stop();
    console.log('  ok   server: hello, frames, commands, capture, other paths refused');
    results.passed++;
}

run()
    .catch((e) => {
        results.failed++;
        console.log('  FAIL server round trip\n       ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join('\n       '));
    })
    .then(() => {
        console.log(`\n${results.passed} passed, ${results.failed} failed`);
        process.exit(results.failed ? 1 : 0);
    });
