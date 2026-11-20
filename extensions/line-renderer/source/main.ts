import { writeFileSync } from 'fs';
import { join } from 'path';

const NAME = 'line-renderer';

function scene(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request('scene', 'execute-scene-script', { name: NAME, method, args });
}

export const methods: Record<string, (...args: any[]) => any> = {
    /** Node > Effects > Line Renderer / Draw Line... */
    async createLine(kind?: string) {
        try {
            await scene('lrCreate', kind || 'line');
        } catch (e) {
            console.error('[LineRenderer] Could not create the line (is a scene open?):', e);
        }
    },

    /** Writes what the scene script sees to diagnostics.json in the extension folder. */
    async saveDiagnostics() {
        const file = join(__dirname, '..', 'diagnostics.json');
        let data: any;
        try {
            data = await scene('lrDiagnostics');
        } catch (e) {
            data = { error: String(e) };
        }
        writeFileSync(file, JSON.stringify({ time: new Date().toISOString(), editor: Editor.App.version, ...data }, null, 2));
        console.log(`[LineRenderer] Diagnostics saved to ${file}`);
    },

    /** The edit scene process marks itself primary (Play-in-Editor's process only draws). */
    async onSceneReady() {
        try {
            await scene('lrPrimary');
        } catch {
            // scene not ready yet
        }
    },
};

export function load() {
    setTimeout(() => methods.onSceneReady(), 1500);
}

export function unload() {}
