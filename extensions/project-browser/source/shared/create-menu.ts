/**
 * The Create menu, built like Cocos' Assets panel:
 * - asset-db `query-create-menu-list` (each asset handler's createInfo.generateMenuInfo()),
 *   grouped by `group` with separators;
 * - every enabled extension's `contributions.assets.menu.createMenu` (and `assetMenu` for
 *   the right-click menu of an asset), which return Electron menu items with their own clicks.
 * Pure helpers only; the panel does the requests.
 */

/** One entry of asset-db's create menu list (ICreateMenuInfo). */
export interface CreateMenuInfo {
    label?: string;
    type?: string;
    fullFileName?: string;
    content?: any;
    template?: string;
    handler?: string;
    group?: string;
    submenu?: CreateMenuInfo[];
}

/** True for the entry that makes a folder (the panel adds its own Folder item first). */
export function isFolderEntry(it: CreateMenuInfo, label: string): boolean {
    if (!it) return false;
    if (it.handler === 'directory' || it.handler === 'folder') return true;
    if (/^(folder|directory)$/i.test(String(it.fullFileName || ''))) return true;
    return /^(folder|new folder|文件夹)$/i.test(label.trim()) && !it.template && it.content === undefined;
}

/** An entry that creates an asset by itself (not a submenu or separator). */
export function isCreatable(it: CreateMenuInfo): boolean {
    return !!it && it.type !== 'separator' && !(Array.isArray(it.submenu) && it.submenu.length) && !!(it.fullFileName || it.template || it.content !== undefined || it.handler);
}

/**
 * The default file name of a new asset, split in base and extension:
 * fullFileName ("NewComponent.ts"), else the template's file name, else "New <Label>".
 */
export function defaultNewName(it: CreateMenuInfo, label: string): { base: string; ext: string } {
    let full = String(it.fullFileName || '');
    if (!full && it.template) {
        const m = /([^/\\]+)$/.exec(String(it.template));
        if (m && /\.[A-Za-z0-9]+$/.test(m[1])) full = m[1];
    }
    if (!full) full = 'New ' + (label || 'Asset').replace(/[\\/:*?"<>|]/g, '').trim();
    const dot = full.lastIndexOf('.');
    if (dot > 0) return { base: full.slice(0, dot), ext: full.slice(dot) };
    return { base: full, ext: '' };
}

/**
 * Inserts a separator wherever the `group` changes between two neighbours, like
 * the Assets panel. Never starts, ends or doubles a separator.
 */
export function withGroupSeparators<T extends { type?: string; group?: string }>(list: T[], sep: () => T): T[] {
    const out: T[] = [];
    let lastGroup: string | undefined;
    for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it) continue;
        if (it.type === 'separator') {
            if (out.length && out[out.length - 1].type !== 'separator') out.push(it);
            continue;
        }
        const g = it.group;
        if (out.length && g !== undefined && lastGroup !== undefined && g !== lastGroup && out[out.length - 1].type !== 'separator') out.push(sep());
        if (g !== undefined) lastGroup = g;
        out.push(it);
    }
    while (out.length && out[out.length - 1].type === 'separator') out.pop();
    return out;
}

export type AssetsMenuKind = 'createMenu' | 'assetMenu' | 'dbMenu' | 'panelMenu';

/** Where an extension's assets menu hook lives: its methods file and the function name. */
export interface MenuHook {
    pkg: string;
    file: string;
    fn: string;
}

/** The hooks of one kind declared by the given packages (`contributions.assets.menu`). */
export function menuHooks(pkgs: { name?: string; path?: string; enable?: boolean; info?: any }[], kind: AssetsMenuKind, join: (a: string, b: string) => string, skip?: string): MenuHook[] {
    const out: MenuHook[] = [];
    for (let i = 0; i < (pkgs || []).length; i++) {
        const p = pkgs[i];
        if (!p || p.enable === false || !p.path || !p.info || p.name === skip) continue;
        const menu = p.info.contributions && p.info.contributions.assets && p.info.contributions.assets.menu;
        if (!menu || typeof menu.methods !== 'string' || typeof menu[kind] !== 'string' || !menu[kind]) continue;
        out.push({ pkg: String(p.name || p.info.name || ''), file: join(p.path, menu.methods), fn: menu[kind] });
    }
    return out;
}
