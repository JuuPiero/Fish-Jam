import { writeFileSync } from 'fs';
import { join } from 'path';

const NAME = 'spine-plus';

function scene(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request('scene', 'execute-scene-script', { name: NAME, method, args });
}

/** Asset the Preview panel should show once it is open. */
let pendingPreview: string | null = null;

export const methods: Record<string, (...args: any[]) => any> = {
    openPanel() {
        Editor.Panel.open(NAME);
    },

    /** Opens the Preview panel on a spine-data asset. */
    async openPreview(assetUuid?: string) {
        pendingPreview = assetUuid || null;
        await Editor.Panel.open(NAME);
        if (assetUuid) {
            try {
                await Editor.Message.request(NAME, 'preview-asset', assetUuid);
                pendingPreview = null;
            } catch {
                // the panel picks it up with take-pending-preview when ready
            }
        }
    },

    takePendingPreview() {
        const uuid = pendingPreview;
        pendingPreview = null;
        return uuid;
    },

    /** Node with a SkeletonAnimation for this asset, in the open scene. */
    async createSkeleton(assetUuid?: string) {
        try {
            await scene('spCreate', assetUuid || '');
        } catch (e) {
            console.error('[Spine Plus] Could not create the skeleton (is a scene open?):', e);
        }
    },

    /** Writes what the scene script sees to diagnostics.json in the extension folder. */
    async saveDiagnostics() {
        const file = join(__dirname, '..', 'diagnostics.json');
        let data: any;
        try {
            data = await scene('spDiagnostics');
        } catch (e) {
            data = { error: String(e) };
        }
        writeFileSync(file, JSON.stringify({ time: new Date().toISOString(), editor: Editor.App.version, ...data }, null, 2));
        console.log(`[Spine Plus] Diagnostics saved to ${file}`);
    },
};

export function load() {}

export function unload() {}
