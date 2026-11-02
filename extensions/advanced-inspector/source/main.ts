/**
 * Main-process entry. The work happens in the Inspector renderer
 * (inspector/component.ts) and the scene script (scene.ts); this only adds
 * a diagnostics menu item.
 */
export const methods: Record<string, (...args: any[]) => any> = {
    async showInfo() {
        try {
            const info = await Editor.Message.request('scene', 'execute-scene-script', {
                name: 'advanced-inspector',
                method: 'info',
                args: [],
            });
            console.log('[Advanced Inspector]', JSON.stringify(info, null, 2));
            if (info && !info.runtimeLoaded) {
                console.warn('[Advanced Inspector] No script imports db://advanced-inspector/AdvancedInspector yet.');
            }
        } catch (e) {
            console.error('[Advanced Inspector] Scene is not ready:', e);
        }
    },
};

export function load() {}

export function unload() {}
