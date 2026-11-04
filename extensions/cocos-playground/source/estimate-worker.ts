/**
 * dist/estimate-worker.js: packs one package for one ad network and reports the file's size, in a
 * child process of the editor (Cocos Creator's own Node, ELECTRON_RUN_AS_NODE) so the editor stays
 * responsive while the builder works, and its memory is freed when it exits. Driven by
 * connect/estimate.ts over the fork IPC channel: one request in, one answer out.
 */
import { measure } from './exporters/measure';
import type { PlayableBuilder } from './exporters/types';

interface Request {
    packageFile: string;
    builder: PlayableBuilder;
    channel: string;
}

process.once('message', async (request: Request) => {
    try {
        const value = await measure(request.packageFile, request.builder, request.channel);
        process.send?.({ ok: true, value }, () => process.exit(0));
    } catch (error) {
        process.send?.({ ok: false, error: error instanceof Error ? error.message : String(error) }, () => process.exit(0));
    }
});
