/**
 * Assets panel hook: Create > MonoBehaviour Script (TypeScript) and, when the csharp
 * extension is enabled, Create > C# MonoBehaviour Script.
 *
 * `nameFirst` is plain data: the Project Browser shows its "name the new asset first"
 * placeholder and then sends `message` with the chosen url. Cocos' Assets panel ignores
 * it and runs `click`, which creates the file and starts a rename there.
 */
import { ScriptKind } from './templates';

const PKG = 'unity-style';

type Item = Editor.Menu.ContextMenuItem;

function folderOf(info: any): string {
    if (!info || !info.url) return 'db://assets';
    if (info.isDirectory) return info.url;
    return info.url.replace(/\/[^/]*$/, '');
}

function csharpEnabled(): boolean {
    try {
        const list: any[] = (Editor.Package as any).getPackages({ name: 'csharp', enable: true }) || [];
        return list.length > 0;
    } catch (e) {
        return false;
    }
}

export function onCreateMenu(assetInfo: any): Item[] {
    const folder = folderOf(assetInfo);
    if (!/^db:\/\/assets(\/|$)/.test(folder)) return [];
    const item = (label: string, kind: ScriptKind, fullFileName: string): Item =>
        ({
            label,
            click: () => Editor.Message.request(PKG, 'create-script', folder, kind).catch((e: any) => console.error('[Unity Style]', e)),
            nameFirst: { fullFileName, message: [PKG, 'create-script-at', kind] },
        } as any);
    const items = [item('MonoBehaviour Script', 'ts', 'NewMonoBehaviour.ts')];
    if (csharpEnabled()) items.push(item('C# MonoBehaviour Script', 'cs', 'NewMonoBehaviour.cs'));
    return items;
}
