/**
 * Main process: Extension > Unity Style > Open README, and the Create menu's
 * MonoBehaviour Script (TypeScript or C#). The API itself is runtime code in
 * assets/ (db://unity-style).
 */
import { join } from 'path';
import { classNameFromFile, isScriptUrl, ScriptKind, templateFor } from './templates';

const TAG = '[Unity Style]';

async function createScriptFile(url: string, kind: ScriptKind): Promise<any> {
    const name = classNameFromFile(url.split('/').pop() || '');
    return Editor.Message.request('asset-db', 'create-asset', url, templateFor(kind, name));
}

export const methods: { [name: string]: (...args: any[]) => any } = {
    async openDocs() {
        try {
            const { shell } = require('electron');
            await shell.openPath(join(__dirname, '..', 'README.md'));
        } catch (e) {
            console.error(TAG + ' Could not open the README:', e);
        }
    },

    /** Cocos' Assets panel: NewMonoBehaviour.ts/.cs in the folder, selected, then renamed there. */
    async createScript(folderUrl: string, kind: ScriptKind = 'ts') {
        const ext = kind === 'cs' ? '.cs' : '.ts';
        const url: string = await Editor.Message.request('asset-db', 'generate-available-url', String(folderUrl || 'db://assets').replace(/\/+$/, '') + '/NewMonoBehaviour' + ext);
        const info: any = await createScriptFile(url, kind);
        if (info && info.uuid) {
            Editor.Selection.clear('asset');
            Editor.Selection.select('asset', [info.uuid]);
            // after the Assets panel has added and selected the new row
            setTimeout(() => {
                try {
                    Editor.Message.send('assets', 'rename', info.uuid);
                } catch (e) {
                    // no Assets panel open
                }
            }, 300);
        }
        return info;
    },

    /** Project Browser: the file was named first, the class takes that name. */
    async createScriptAt(url: string, kind: ScriptKind = 'ts') {
        if (typeof url !== 'string' || !isScriptUrl(url, kind)) throw new Error('Expected a ' + (kind === 'cs' ? '.cs' : '.ts') + ' file in db://assets: ' + url);
        return createScriptFile(url, kind);
    },
};

export function load() {}

export function unload() {}
