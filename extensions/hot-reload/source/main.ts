/**
 * Main process of Hot Reload.
 * - Forwards "scripts compiled" (`programming:pack-build-end`, `programming:compiled`)
 *   to the scene processes, where the scene script swaps the new code into a running game.
 * - Prints the scene script's reports in the Console.
 * - Menu: toggle, restart the game, diagnostics, README.
 * Messages to the scene processes are fixed channels without code.
 */
import { join } from 'path';

const PKG = 'hot-reload';
const CH_COMPILED = 'hot-reload:compiled';
const CH_CONFIG = 'hot-reload:config';
const CH_DIAGNOSE = 'hot-reload:diagnose';

let enabled = true;
let collecting: unknown[] | null = null;

function el(): any {
    return require('electron');
}

/** Sends a fixed message to every scene webview (the edit scene and Play-in-Editor). */
function sendToScenes(channel: string, payload?: unknown): number {
    let n = 0;
    try {
        const all = el().webContents.getAllWebContents();
        for (let i = 0; i < all.length; i++) {
            const w = all[i];
            try {
                if (!w.isDestroyed() && w.getType() === 'webview') {
                    w.send(channel, payload);
                    n++;
                }
            } catch (e) {
                // closing
            }
        }
    } catch (e) {
        console.warn('[Hot Reload] Could not reach the scene views:', e);
    }
    return n;
}

async function loadConfig(): Promise<void> {
    try {
        const v = await Editor.Profile.getConfig(PKG, 'enabled');
        if (typeof v === 'boolean') enabled = v;
    } catch (e) {
        enabled = true;
    }
}

export const methods: Record<string, (...args: any[]) => any> = {
    /** Broadcast by Cocos when the project's scripts were rebuilt. */
    onPackBuilt() {
        if (enabled) sendToScenes(CH_COMPILED);
    },
    getConfig() {
        return { enabled };
    },
    /** From the scene script: lines to print. */
    report(msg: { lines?: string[]; level?: string }) {
        const lines = (msg && Array.isArray(msg.lines) ? msg.lines : []).map((l) => '[Hot Reload] ' + String(l));
        const level = msg && (msg.level === 'warn' || msg.level === 'error') ? msg.level : 'log';
        lines.forEach((l) => (console as any)[level](l));
    },
    async toggleEnabled() {
        enabled = !enabled;
        try {
            await Editor.Profile.setConfig(PKG, 'enabled', enabled);
        } catch (e) {
            // not saved
        }
        sendToScenes(CH_CONFIG, { enabled });
        console.log('[Hot Reload] ' + (enabled ? 'On: saving a script while the game runs swaps the new code in.' : 'Off: Cocos handles script changes as usual.'));
    },
    /** Stop and play again (Play-in-Editor). */
    async restartGame() {
        try {
            await Editor.Message.request('scene', 'editor-preview-set-play', false);
            await new Promise((r) => setTimeout(r, 300));
            await Editor.Message.request('scene', 'editor-preview-set-play', true);
        } catch (e) {
            console.warn('[Hot Reload] Could not restart the game:', e);
        }
    },
    /** From the scene scripts: their state, while saveDiagnostics collects. */
    diagnostics(data: unknown) {
        if (collecting) collecting.push(data);
    },
    async saveDiagnostics() {
        collecting = [];
        const n = sendToScenes(CH_DIAGNOSE);
        await new Promise((r) => setTimeout(r, 1200));
        const out = { time: new Date().toISOString(), enabled, sceneViews: n, processes: collecting };
        collecting = null;
        const file = join(__dirname, '..', 'diagnostics.json');
        try {
            require('fs').writeFileSync(file, JSON.stringify(out, null, 2));
            console.log('[Hot Reload] Diagnostics written to ' + file);
        } catch (e) {
            console.error('[Hot Reload] Could not write diagnostics:', e);
        }
    },
    async openDocs() {
        try {
            await el().shell.openPath(join(__dirname, '..', 'README.md'));
        } catch (e) {
            console.error('[Hot Reload] Could not open the README:', e);
        }
    },
};

export async function load(): Promise<void> {
    await loadConfig();
    sendToScenes(CH_CONFIG, { enabled });
}

export function unload(): void {
    collecting = null;
}
