import { fork } from 'child_process';
import * as path from 'path';
import { channelOptions } from '../exporters/channels';
import type { MeasuredSize } from '../exporters/measure';
import type { Builder, ChannelOption } from '../shared';

/*
 * Network sizes, measured in the extension: the dashboard's builders (source/exporters) run in a
 * child process (dist/estimate-worker.js) on the editor's own Node, one network per run. No server,
 * no upload, no sign-in.
 */

const WORKER = path.join(__dirname, 'estimate-worker.js');
const TIMEOUT_MS = 10 * 60_000;

/** The networks each builder packs for, with their documented size caps. */
export function networks(): Record<Builder, ChannelOption[]> {
    const of = (builder: Builder) => channelOptions(builder).map((option) => ({ channel: option.id, label: option.label, maxBytes: option.maxBytes }));
    return { pnp: of('pnp'), 'super-html': of('super-html') };
}

export function measureInWorker(packageFile: string, builder: Builder, channel: string): Promise<MeasuredSize> {
    return new Promise((resolve, reject) => {
        // Electron's fork runs process.execPath (Cocos Creator) — as plain Node with ELECTRON_RUN_AS_NODE.
        const child = fork(WORKER, [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        let stderr = '';
        let settled = false;
        const finish = (work: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            work();
        };
        const timer = setTimeout(() => {
            child.kill();
            finish(() => reject(new Error('Measuring took over 10 minutes; stopped')));
        }, TIMEOUT_MS);
        child.stderr?.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
        child.on('message', (reply: { ok: true; value: MeasuredSize } | { ok: false; error: string }) =>
            finish(() => (reply.ok ? resolve(reply.value) : reject(new Error(reply.error)))),
        );
        child.on('error', (error) => finish(() => reject(error)));
        child.on('exit', (code) =>
            finish(() => reject(new Error(`The size worker stopped (exit ${code})${stderr.trim() ? `: ${stderr.trim().split('\n').pop()}` : ''}`))),
        );
        child.send({ packageFile, builder, channel });
    });
}
