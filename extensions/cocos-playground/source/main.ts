import * as service from './connect/service';
import { exportPlayablePackage } from './export';

/**
 * Panel calls come back as `{ ok, value }` / `{ ok: false, error }`: an exception thrown across the
 * editor's IPC loses its message on the way.
 */
async function reply<T>(work: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    try {
        return { ok: true, value: await work() };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[cocos-playground] ${message}`);
        return { ok: false, error: message };
    }
}

/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    openPanel() {
        Editor.Panel.open('cocos-playground');
    },

    /**
     * @en Scans @playGroundField values and zips them with the existing web-mobile build.
     * @zh 扫描 @playGroundField 字段，并与已有的 web-mobile 构建打包成压缩包
     */
    async exportPlayable() {
        try {
            const outFile = await exportPlayablePackage();
            console.log(`[cocos-playground] Exported playable package to ${outFile}`);
            await Editor.Dialog.info(`Playable package exported to:\n${outFile}`, {
                title: 'Cocos Playground',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[cocos-playground] Failed to export playable package: ${message}`);
            await Editor.Dialog.error(message, { title: 'Cocos Playground — Export failed' });
        }
    },

    // The panel (source/panels/default) — see connect/service.ts.
    panelState: () => reply(() => service.getState()),
    panelRefresh: () => reply(() => service.refresh()),
    setServerUrl: (url: string) => reply(() => service.changeServer(url)),
    signIn: () => reply(() => service.signIn()),
    cancelSignIn: () => reply(() => service.cancelSignIn()),
    signOut: () => reply(() => service.signOut()),
    listApplications: () => reply(() => service.applications()),
    listConcepts: (applicationId: number) => reply(() => service.concepts(applicationId)),
    createConcept: (applicationId: number, name: string) => reply(() => service.createConcept(applicationId, name)),
    select: (applicationId: number | null, conceptId: number | null) => reply(() => service.select(applicationId, conceptId)),
    listExports: () => reply(() => service.exports()),
    deleteExport: (file: string) => reply(() => service.deleteExport(file)),
    build: (upload: boolean) => reply(() => service.build(upload)),
    packageExisting: () => reply(() => service.packageExisting()),
    uploadExport: (file: string) => reply(() => service.uploadExport(file)),
    openUrl: (url: string) => reply(() => service.openUrl(url)),
    reveal: (file: string) => reply(() => service.reveal(file)),
};

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export function load() {}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export function unload() {}
