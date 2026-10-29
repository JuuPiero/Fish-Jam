import { exportPlayablePackage } from './export';

/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    /**
     * @en A method that can be triggered by message
     * @zh 通过 message 触发的方法
     */
    showLog() {
        console.log('Hello World');
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
};

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export function load() { }

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export function unload() { }
