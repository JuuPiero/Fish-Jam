/**
 * Folder tree and paths: "Assets" is db://assets; "Packages" holds every
 * other asset database (one folder per extension, db://<name>) and Cocos'
 * db://internal as the read-only "Cocos Internal". Pure: tested in node.
 */
import { AssetEntry, displayName } from './search';

export const ASSETS_DB = 'assets';
export const INTERNAL_DB = 'internal';
export const ASSETS_ROOT = 'db://assets';
/** Virtual url of the Packages root (not an asset-db url). */
export const PACKAGES_ROOT = 'packages://';

export type SearchScope = 'assets' | 'folder' | 'packages';

export interface TreeNode {
    url: string;
    name: string;
    children: TreeNode[];
    /** assets: db://assets, package: an extension's database, internal: db://internal, root: the Packages root. */
    kind: 'assets' | 'package' | 'internal' | 'root';
    readonly: boolean;
}

/** Database name of a url: "db://input-system/core/x.ts" -> "input-system". */
export function dbOf(url: string): string {
    const m = /^db:\/\/([^/]+)/.exec(url || '');
    return m ? m[1] : '';
}

export function isPackageUrl(url: string): boolean {
    if (url === PACKAGES_ROOT) return true;
    const db = dbOf(url);
    return !!db && db !== ASSETS_DB;
}

/** Nothing may be created, renamed, moved or deleted here. */
export function isReadonlyUrl(url: string): boolean {
    return url === PACKAGES_ROOT || dbOf(url) === INTERNAL_DB;
}

export function parentUrl(url: string): string {
    const i = url.lastIndexOf('/');
    if (i <= 'db://'.length) return url;
    const p = url.slice(0, i);
    return p.length < 'db://x'.length ? url : p;
}

/** The main asset of a uuid: "main@6c48a@f9941" -> "main". */
export function mainUuid(uuid: string): string {
    const s = String(uuid || '').trim();
    const i = s.indexOf('@');
    return i > 0 ? s.slice(0, i) : s;
}

/** Folders from the database root down to a folder: db://assets, db://assets/Art, db://assets/Art/UI. */
export function folderChain(folderUrl: string): string[] {
    const db = dbOf(folderUrl);
    if (!db) return [];
    const base = 'db://' + db;
    const out = [base];
    const rest = folderUrl.slice(base.length).split('/').filter((s) => !!s);
    let cur = base;
    for (let i = 0; i < rest.length; i++) {
        cur += '/' + rest[i];
        out.push(cur);
    }
    return out;
}

/**
 * The uuid in a "locate this asset" message (ui-kit:touch-asset and the like):
 * a uuid, a list of them (first one), or an object with uuid / value.
 */
export function touchedUuid(args: any[]): string {
    for (let i = 0; i < args.length; i++) {
        let v = args[i];
        if (Array.isArray(v)) v = v[0];
        if (v && typeof v === 'object') v = v.uuid || v.value;
        if (typeof v === 'string' && v.trim() && v.indexOf('db://') !== 0) return v.trim();
    }
    return '';
}

export function dbLabel(db: string): string {
    return db === INTERNAL_DB ? 'Cocos Internal' : db === ASSETS_DB ? 'Assets' : db;
}

/** Breadcrumb segments of a folder url. */
export function breadcrumb(url: string): { label: string; url: string }[] {
    if (url === PACKAGES_ROOT) return [{ label: 'Packages', url: PACKAGES_ROOT }];
    const db = dbOf(url);
    if (!db) return [];
    const out: { label: string; url: string }[] = [];
    if (db !== ASSETS_DB) out.push({ label: 'Packages', url: PACKAGES_ROOT });
    const base = 'db://' + db;
    out.push({ label: dbLabel(db), url: base });
    const rest = url.slice(base.length).split('/').filter((s) => !!s);
    let cur = base;
    for (let i = 0; i < rest.length; i++) {
        cur += '/' + rest[i];
        out.push({ label: rest[i], url: cur });
    }
    return out;
}

function makeNode(url: string, name: string, kind: TreeNode['kind']): TreeNode {
    return { url, name, children: [], kind, readonly: kind === 'internal' || kind === 'root' };
}

/** The Assets tree and the Packages tree, folders only, sorted by name. */
export function buildTrees(assets: AssetEntry[]): { assets: TreeNode; packages: TreeNode } {
    const roots: Record<string, TreeNode> = {};
    const byUrl: Record<string, TreeNode> = {};
    const assetsRoot = makeNode(ASSETS_ROOT, 'Assets', 'assets');
    const packages = makeNode(PACKAGES_ROOT, 'Packages', 'root');
    roots[ASSETS_DB] = assetsRoot;
    byUrl[ASSETS_ROOT] = assetsRoot;
    const rootOf = (db: string): TreeNode => {
        let r = roots[db];
        if (!r) {
            r = makeNode('db://' + db, dbLabel(db), db === INTERNAL_DB ? 'internal' : 'package');
            roots[db] = r;
            byUrl[r.url] = r;
            packages.children.push(r);
        }
        return r;
    };
    const ensure = (url: string): TreeNode | null => {
        const existing = byUrl[url];
        if (existing) return existing;
        const db = dbOf(url);
        if (!db) return null;
        const root = rootOf(db);
        if (url === root.url) return root;
        const parent = ensure(parentUrl(url));
        if (!parent) return null;
        const node = makeNode(url, url.slice(url.lastIndexOf('/') + 1), root.kind);
        byUrl[url] = node;
        parent.children.push(node);
        return node;
    };
    for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        if (!a.url || a.visible === false) continue;
        if (a.isDirectory) ensure(a.url);
        else ensure(parentUrl(a.url));
    }
    const sort = (n: TreeNode) => {
        n.children.sort((x, y) => {
            // Cocos Internal last among packages
            if (x.kind !== y.kind && (x.kind === 'internal' || y.kind === 'internal')) return x.kind === 'internal' ? 1 : -1;
            return x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        n.children.forEach(sort);
    };
    sort(assetsRoot);
    sort(packages);
    return { assets: assetsRoot, packages };
}

/** Direct children (folders and main assets) of a folder; for the Packages root, the database folders. */
export function childrenOf(assets: AssetEntry[], folderUrl: string, packageRoots?: TreeNode): AssetEntry[] {
    if (folderUrl === PACKAGES_ROOT) {
        const list = packageRoots ? packageRoots.children : [];
        return list.map((n) => ({ uuid: 'pkg:' + n.url, url: n.url, name: n.name, type: '', importer: 'database', isDirectory: true, readonly: n.readonly }));
    }
    const out: AssetEntry[] = [];
    for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        if (a.visible === false || a.url === folderUrl) continue;
        if (parentUrl(a.url) === folderUrl) out.push(a);
    }
    return out;
}

/** Is an asset inside the search scope? */
export function inScope(url: string, scope: SearchScope, folderUrl: string): boolean {
    if (scope === 'packages') return isPackageUrl(url);
    if (scope === 'folder') {
        if (folderUrl === PACKAGES_ROOT) return isPackageUrl(url);
        return url.indexOf(folderUrl + '/') === 0;
    }
    return dbOf(url) === ASSETS_DB;
}

/** Folder path shown under search results ("Assets/Art/Characters"). */
export function folderLabel(url: string): string {
    return breadcrumb(parentUrl(url))
        .map((b) => b.label)
        .join('/');
}

/** Valid file name for a rename (no path separators or reserved characters). */
export function validName(name: string): string | null {
    const n = (name || '').trim();
    if (!n || n === '.' || n === '..') return null;
    if (/[\\/:*?"<>|]/.test(n)) return null;
    return n;
}

/** The url after renaming an asset, keeping its extension(s) unless the new name has one. */
export function renamedUrl(a: AssetEntry, newName: string): string {
    const dir = parentUrl(a.url);
    if (a.isDirectory) return dir + '/' + newName;
    const shown = displayName(a);
    const extPart = (a.name || '').slice(shown.length); // ".png", ".json"...
    const hasExt = extPart && newName.toLowerCase().slice(-extPart.length) === extPart.toLowerCase();
    return dir + '/' + newName + (hasExt ? '' : extPart);
}
