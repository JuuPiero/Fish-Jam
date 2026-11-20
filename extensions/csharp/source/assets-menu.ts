/**
 * Assets panel menus: Create > C# Script / C# Class, and on .cs files Open C# Project
 * and Recompile C# Scripts.
 */
const PKG = 'csharp';

type Item = Editor.Menu.ContextMenuItem;

function folderOf(info: any): string {
    if (!info || !info.url) return 'db://assets';
    if (info.isDirectory) return info.url;
    return info.url.replace(/\/[^/]*$/, '');
}

function create(folder: string, kind: 'component' | 'class') {
    if (!/^db:\/\/assets(\/|$)/.test(folder)) {
        console.warn('[C#] C# scripts must be in db://assets.');
        return;
    }
    Editor.Message.request(PKG, 'create-script', folder, kind).catch((e: any) => console.error('[C#]', e));
}

/**
 * Create menu items. `nameFirst` is plain data (no functions, so Cocos' menu can clone it):
 * the Project browser reads it to show its "name the new asset first" placeholder and then
 * sends `message` with the chosen url. Cocos' Assets panel ignores it and runs `click`,
 * which creates the file and puts it into rename mode there.
 */
export function onCreateMenu(assetInfo: any): Item[] {
    const folder = folderOf(assetInfo);
    if (!/^db:\/\/assets(\/|$)/.test(folder)) return [];
    const item = (label: string, kind: 'component' | 'class', fullFileName: string): Item =>
        ({
            label,
            click: () => create(folder, kind),
            nameFirst: { fullFileName, message: [PKG, 'create-script-at', kind] },
        } as any);
    return [item('C# Script', 'component', 'NewComponent.cs'), item('C# Class', 'class', 'NewClass.cs')];
}

export function onAssetMenu(assetInfo: any): Item[] {
    if (!assetInfo || !/\.cs$/i.test(assetInfo.url || '')) return [];
    return [
        { label: 'Open C# Project', click: () => Editor.Message.request(PKG, 'open-project').catch(() => {}) },
        { label: 'Recompile C# Scripts', click: () => Editor.Message.request(PKG, 'recompile-all').catch(() => {}) },
    ];
}
