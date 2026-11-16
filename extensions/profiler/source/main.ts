/**
 * Main process of the profiler extension: runs the server games connect to,
 * keeps the record / deep settings, and relays frames and frame captures to
 * the Profiler and Frame Debugger windows (broadcasts).
 */
import { join } from 'path';
import { lanAddresses, ProfilerServer } from './server';

const PKG = 'profiler';

let recording = true;
let deep = false;
let lan = false;

function broadcast(msg: string, ...args: any[]): void {
    try {
        Editor.Message.broadcast(PKG + ':' + msg, ...args);
    } catch {
        // editor shutting down
    }
}

const server = new ProfilerServer({
    clients: (list) => broadcast('clients', list),
    frames: (id, frames, names) => broadcast('frames', { client: id, frames, names }),
    capture: (id, capture, error) => broadcast('capture', { client: id, capture, error }),
    // a game that connects picks up the current record settings
    hello: (id) => server.send(id, { cmd: 'record', on: recording, deep }),
});

function status() {
    return {
        clients: server.list(),
        port: server.port,
        host: server.host,
        running: server.running,
        error: server.error,
        lan,
        recording,
        deep,
        addresses: lanAddresses(),
    };
}

export const methods: Record<string, (...args: any[]) => any> = {
    openProfiler() {
        Editor.Panel.open(PKG + '.profiler');
    },
    openFrameDebugger() {
        Editor.Panel.open(PKG + '.frame-debugger');
    },
    async openDocs() {
        try {
            const { shell } = require('electron');
            await shell.openPath(join(__dirname, '..', 'README.md'));
        } catch (e) {
            console.error('[Profiler] Could not open the README:', e);
        }
    },

    /** Connected games, the server and the record settings. */
    status() {
        return status();
    },

    /** Accept games from other devices on the network (phones running a preview). */
    async setLan(on: boolean) {
        lan = !!on;
        try {
            await Editor.Profile.setConfig(PKG, 'lan', lan, 'global');
        } catch {
            // not saved
        }
        await server.start(lan);
        return status();
    },

    /** Record on / off and deep markers (every script's update) for every connected game. */
    async setRecording(arg: { on?: boolean; deep?: boolean }) {
        if (arg && typeof arg.on === 'boolean') recording = arg.on;
        if (arg && typeof arg.deep === 'boolean') deep = arg.deep;
        try {
            await Editor.Profile.setConfig(PKG, 'record', { recording, deep }, 'global');
        } catch {
            // not saved
        }
        server.send(0, { cmd: 'record', on: recording, deep });
        return status();
    },

    /** The frames kept for a game: { names, frames } (oldest first). */
    getFrames(clientId: number) {
        return server.frames(clientId);
    },

    clearFrames(clientId: number) {
        server.clear(clientId || 0);
        return true;
    },

    /** Frame Debugger: capture the next frame of a game (the answer arrives as a profiler:capture broadcast). */
    fdCapture(clientId: number) {
        return server.send(clientId, { cmd: 'capture' });
    },

    /** Frame Debugger: draw only up to draw `limit` (-1: everything). */
    fdStep(clientId: number, limit: number) {
        return server.send(clientId, { cmd: 'step', limit: Math.floor(Number(limit)) });
    },

    fdDisable(clientId: number) {
        return server.send(clientId || 0, { cmd: 'fd-off' });
    },

    /** The last capture of a game (Frame Debugger reopened). */
    lastCapture(clientId: number) {
        return server.lastCapture(clientId);
    },
};

export async function load() {
    try {
        lan = !!(await Editor.Profile.getConfig(PKG, 'lan'));
        const rec: any = await Editor.Profile.getConfig(PKG, 'record');
        if (rec && typeof rec === 'object') {
            recording = rec.recording !== false;
            deep = !!rec.deep;
        }
    } catch {
        // defaults
    }
    await server.start(lan);
    if (!server.running) console.warn(`[Profiler] Server could not start: ${server.error}`);
}

export async function unload() {
    server.send(0, { cmd: 'fd-off' });
    await server.stop();
}
