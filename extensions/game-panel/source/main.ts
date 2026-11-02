// @ts-ignore
import packageJSON from '../package.json';

/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    openPanel() {
        Editor.Panel.open(packageJSON.name);
    },

    /** Read-only list of the editor's web contents (diagnostics). */
    queryWebContents() {
        const { webContents } = require('electron');
        return webContents.getAllWebContents().map((w: any) => ({
            id: w.id,
            type: w.getType(),
            url: String(w.getURL()).slice(0, 200),
            title: w.getTitle(),
            host: w.hostWebContents ? w.hostWebContents.id : null,
        }));
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
