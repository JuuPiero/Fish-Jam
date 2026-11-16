/**
 * Asset packages: a folder (or a zip of it) holding assets with their .meta
 * files under assets/..., plus asset-package.json, so another Cocos project
 * can import them with their uuids (like a .unitypackage). Also the helpers
 * of the drag out to the OS and of the clipboard. Pure: tested in node.
 *
 * Package layout:
 *   asset-package.json
 *   assets/Art/hero.png
 *   assets/Art/hero.png.meta
 *   assets/Art.meta              (folders keep their uuid too)
 */

export const MANIFEST_NAME = 'asset-package.json';
export const MANIFEST_FORMAT = 'cocos-asset-package';
export const MANIFEST_VERSION = 1;

export interface PackageAsset {
    /** Path inside the package, '/' separated, always under "assets/". */
    path: string;
    /** The uuid from the .meta; '' when the file has no .meta (it gets a new uuid). */
    uuid: string;
    type?: string;
    importer?: string;
    isDirectory?: boolean;
    /** Pulled in as a dependency of what was picked (not picked itself). */
    dependency?: boolean;
    /** A parent folder carried only for its .meta (keeps the folder's uuid); not picked. */
    container?: boolean;
    /** SHA-1 of the file (not for folders). */
    hash?: string;
    size?: number;
    /** A .meta file sits next to it in the package. */
    hasMeta?: boolean;
}

export interface PackageManifest {
    format: string;
    version: number;
    createdBy: string;
    createdAt: string;
    source: { project: string; path?: string; creator?: string };
    /** Uuids that were picked (dependencies not included). */
    roots: string[];
    assets: PackageAsset[];
}

// ------------------------------------------------------------------ paths

/** A package-relative path, or null when it would leave the package (.., absolute, drive letters). */
export function safeRelPath(p: string): string | null {
    const s = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    if (!s || /^[a-zA-Z]:/.test(s) || s[0] === '/' || /[\u0000-\u001f]/.test(s)) return null;
    const parts = s.split('/');
    for (let i = 0; i < parts.length; i++) if (!parts[i] || parts[i] === '.' || parts[i] === '..') return null;
    return parts.join('/');
}

export function parentPath(p: string): string {
    const i = p.lastIndexOf('/');
    return i > 0 ? p.slice(0, i) : '';
}

export function baseName(p: string): string {
    return p.slice(p.lastIndexOf('/') + 1);
}

/** db://assets/Art/x.png -> assets/Art/x.png (only the assets database). */
export function urlToRel(url: string): string | null {
    const m = /^db:\/\/assets(\/.*)?$/.exec(url || '');
    if (!m) return null;
    return 'assets' + (m[1] || '');
}

export function relToUrl(rel: string): string {
    return 'db://' + rel;
}

/** The deepest folder holding every picked entry (containers ignored). */
export function commonDir(assets: PackageAsset[]): string {
    let common: string[] | null = null;
    for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        if (a.container) continue;
        const dir = parentPath(a.path).split('/').filter((s) => !!s);
        if (!common) {
            common = dir;
            continue;
        }
        let k = 0;
        while (k < common.length && k < dir.length && common[k] === dir[k]) k++;
        common = common.slice(0, k);
    }
    return common && common.length ? common.join('/') : 'assets';
}

export type TargetMode = { kind: 'original' } | { kind: 'folder'; folder: string; root: string };

/**
 * Where a package path lands in the project (relative to the project root):
 * "original" keeps assets/...; "folder" puts what is below `root` under `folder`.
 * Null: a container folder above `root`, which is not imported in folder mode.
 */
export function targetPathFor(path: string, mode: TargetMode): string | null {
    if (mode.kind === 'original') return path;
    if (path === mode.root) return null;
    if (path.indexOf(mode.root + '/') !== 0) return null;
    return mode.folder + path.slice(mode.root.length);
}

/** Unity-style free name: "hero.png", "hero 1.png", "hero 2.png"... (folders: "Art 1"). */
export function uniquePath(path: string, taken: (p: string) => boolean, isDirectory = false, max = 1000): string {
    if (!taken(path)) return path;
    const dir = parentPath(path);
    const name = baseName(path);
    const dot = isDirectory ? -1 : name.indexOf('.') > 0 ? name.indexOf('.') : -1;
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; i < max; i++) {
        const p = (dir ? dir + '/' : '') + stem + ' ' + i + ext;
        if (!taken(p)) return p;
    }
    return (dir ? dir + '/' : '') + stem + ' ' + Date.now() + ext;
}

/** Is `file` inside `dir` (or `dir` itself)? Windows paths compare case-insensitively. */
export function isInside(file: string, dir: string): boolean {
    const norm = (p: string) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const f = norm(file);
    const d = norm(dir);
    return !!d && (f === d || f.indexOf(d + '/') === 0);
}

/** Folder name for a new package: 20261114-153012-045. */
export function stampName(d: Date): string {
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + p(d.getMilliseconds(), 3);
}

// ------------------------------------------------------------------ uuids

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const UUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function isUuid(s: string): boolean {
    return new RegExp('^' + UUID_SRC + '$', 'i').test(String(s || ''));
}

/** The main asset of a uuid: "main@6c48a" -> "main". */
export function mainOf(uuid: string): string {
    const i = String(uuid || '').indexOf('@');
    return i > 0 ? uuid.slice(0, i) : uuid;
}

/**
 * A compressed uuid (script class ids in "__type__": 23 chars keep 5 hex
 * digits, 22 chars keep 2; the rest is base64, 2 chars per 3 hex digits)
 * back to its 36-char form; '' when it is not one.
 */
export function decompressUuid(s: string): string {
    if (!s || (s.length !== 22 && s.length !== 23)) return '';
    const keep = s.length === 23 ? 5 : 2;
    let hex = s.slice(0, keep);
    if (!/^[0-9a-f]+$/.test(hex)) return '';
    for (let i = keep; i < s.length; i += 2) {
        const a = B64.indexOf(s[i]);
        const b = B64.indexOf(s[i + 1]);
        if (a < 0 || b < 0) return '';
        hex += (a >> 2).toString(16) + (((a & 3) << 2) | (b >> 4)).toString(16) + (b & 15).toString(16);
    }
    if (hex.length !== 32) return '';
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/**
 * Main uuids a serialized asset or .meta refers to: every 36-char uuid
 * ("__uuid__", userData.imageUuidOrDatabaseUri, sub-asset ids "x@y") and the
 * script class ids of "__type__" (compressed uuids). Each once, in order.
 */
export function extractUuids(text: string): string[] {
    const out: string[] = [];
    const add = (u: string) => {
        const m = mainOf(u).toLowerCase();
        if (m && out.indexOf(m) < 0) out.push(m);
    };
    const re = new RegExp(UUID_SRC, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text || ''))) add(m[0]);
    const tre = /"__type__"\s*:\s*"([0-9a-zA-Z+/]{22,23})"/g;
    while ((m = tre.exec(text || ''))) {
        const u = decompressUuid(m[1]);
        if (u) add(u);
    }
    return out;
}

/** Replaces whole uuids (also as the main part of "x@sub") by their mapped value. */
export function remapUuids(text: string, map: Record<string, string>): string {
    if (!Object.keys(map).length) return text;
    return String(text).replace(new RegExp(UUID_SRC, 'gi'), (u) => {
        const k = u.toLowerCase();
        return map[k] || u;
    });
}

/** Relative module specifiers a script imports ("./util", "../core/x.ts"). */
export function scriptImports(text: string): string[] {
    const out: string[] = [];
    const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"\n]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text || ''))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
}

/** The file a relative import points at (package-style path), tried with .ts/.js and index files. */
export function resolveImport(fromPath: string, spec: string, exists: (p: string) => boolean): string | null {
    const parts = parentPath(fromPath).split('/').filter((s) => !!s);
    const segs = spec.split('/');
    for (let i = 0; i < segs.length; i++) {
        if (segs[i] === '.' || !segs[i]) continue;
        if (segs[i] === '..') parts.pop();
        else parts.push(segs[i]);
    }
    const base = parts.join('/');
    const tries = [base, base + '.ts', base + '.js', base + '/index.ts', base + '/index.js'];
    for (let i = 0; i < tries.length; i++) if (/\.(ts|js)$/.test(tries[i]) && exists(tries[i])) return tries[i];
    return null;
}

/**
 * Everything the roots need: breadth first over `depsOf`, keeping only the
 * uuids `accept` takes (no db://internal, no read-only package assets).
 */
export async function collectClosure(
    roots: string[],
    depsOf: (uuid: string) => Promise<string[]>,
    accept: (uuid: string) => Promise<boolean> | boolean,
    max = 20000,
): Promise<{ uuid: string; dependency: boolean }[]> {
    const out: { uuid: string; dependency: boolean }[] = [];
    const seen: Record<string, boolean> = {};
    const queue: { uuid: string; dependency: boolean }[] = [];
    for (let i = 0; i < roots.length; i++) {
        const u = mainOf(roots[i]);
        if (u && !seen[u]) {
            seen[u] = true;
            queue.push({ uuid: u, dependency: false });
        }
    }
    while (queue.length && out.length < max) {
        const cur = queue.shift()!;
        if (!(await accept(cur.uuid))) continue;
        out.push(cur);
        let deps: string[] = [];
        try {
            deps = (await depsOf(cur.uuid)) || [];
        } catch (e) {
            deps = [];
        }
        for (let i = 0; i < deps.length; i++) {
            const u = mainOf(deps[i]);
            if (u && !seen[u]) {
                seen[u] = true;
                queue.push({ uuid: u, dependency: true });
            }
        }
    }
    return out;
}

// ------------------------------------------------------------------ manifest

/** The manifest of a package folder or zip; throws a readable error when it is not one. */
export function parseManifest(input: string | any): PackageManifest {
    let j: any = input;
    if (typeof input === 'string') {
        try {
            j = JSON.parse(input.replace(/^﻿/, ''));
        } catch (e) {
            throw new Error(MANIFEST_NAME + ' is not valid JSON');
        }
    }
    if (!j || typeof j !== 'object' || j.format !== MANIFEST_FORMAT) throw new Error('Not an asset package (' + MANIFEST_NAME + ' has no "format": "' + MANIFEST_FORMAT + '")');
    if (typeof j.version !== 'number' || j.version > MANIFEST_VERSION) throw new Error('This asset package needs a newer Project Browser (version ' + j.version + ')');
    if (!Array.isArray(j.assets)) throw new Error(MANIFEST_NAME + ' lists no assets');
    const assets: PackageAsset[] = [];
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < j.assets.length; i++) {
        const a = j.assets[i];
        if (!a || typeof a.path !== 'string') continue;
        const path = safeRelPath(a.path);
        if (!path || (path !== 'assets' && path.indexOf('assets/') !== 0)) throw new Error('Unsafe path in the package: ' + a.path);
        if (path === 'assets' || seen[path.toLowerCase()]) continue;
        seen[path.toLowerCase()] = true;
        const uuid = typeof a.uuid === 'string' && isUuid(a.uuid) ? a.uuid.toLowerCase() : '';
        const e: PackageAsset = { path, uuid, hasMeta: a.hasMeta !== false && !!uuid };
        if (typeof a.type === 'string') e.type = a.type;
        if (typeof a.importer === 'string') e.importer = a.importer;
        if (a.isDirectory) e.isDirectory = true;
        if (a.dependency) e.dependency = true;
        if (a.container) e.container = true;
        if (typeof a.hash === 'string') e.hash = a.hash;
        if (typeof a.size === 'number') e.size = a.size;
        assets.push(e);
    }
    const src = j.source && typeof j.source === 'object' ? j.source : {};
    return {
        format: MANIFEST_FORMAT,
        version: j.version,
        createdBy: String(j.createdBy || ''),
        createdAt: String(j.createdAt || ''),
        source: { project: String(src.project || 'Unknown project'), path: src.path ? String(src.path) : undefined, creator: src.creator ? String(src.creator) : undefined },
        roots: Array.isArray(j.roots) ? j.roots.filter((u: any) => typeof u === 'string') : [],
        assets: sortByPath(assets),
    };
}

export function buildManifest(source: PackageManifest['source'], roots: string[], assets: PackageAsset[], when = new Date()): PackageManifest {
    return {
        format: MANIFEST_FORMAT,
        version: MANIFEST_VERSION,
        createdBy: 'project-browser',
        createdAt: when.toISOString(),
        source,
        roots: roots.slice(),
        assets: sortByPath(assets.slice()),
    };
}

/** Parents first, then by name (case-insensitive, numeric). */
export function sortByPath<T extends { path: string }>(list: T[]): T[] {
    return list.sort((a, b) => {
        const x = a.path.split('/');
        const y = b.path.split('/');
        for (let i = 0; i < Math.min(x.length, y.length); i++) {
            if (x[i] === y[i]) continue;
            return x[i].localeCompare(y[i], undefined, { numeric: true, sensitivity: 'base' }) || (x[i] < y[i] ? -1 : 1);
        }
        return x.length - y.length;
    });
}

export interface LooseFile {
    /** Path inside the archive or folder ('/' separated). */
    path: string;
    isDirectory: boolean;
    /** Text of "<path>.meta" when present. */
    meta: string | null;
    hash?: string;
    size?: number;
}

/**
 * A manifest for files that came without one (Cocos' own exported zip, a
 * folder of assets with .meta files): every file and folder, uuids from the
 * .meta files. Paths go under assets/ (kept when they already start with it).
 */
export function manifestFromFiles(files: LooseFile[], project: string): PackageManifest {
    const list = files.filter((f) => !/\.meta$/i.test(f.path) && !!safeRelPath(f.path) && baseName(f.path) !== MANIFEST_NAME);
    const allUnderAssets = list.length > 0 && list.every((f) => f.path === 'assets' || f.path.indexOf('assets/') === 0);
    const assets: PackageAsset[] = [];
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const path = allUnderAssets ? f.path : 'assets/' + f.path;
        if (path === 'assets') continue;
        let meta: any = null;
        try {
            meta = f.meta ? JSON.parse(f.meta) : null;
        } catch (e) {
            meta = null;
        }
        const uuid = meta && typeof meta.uuid === 'string' && isUuid(meta.uuid) ? meta.uuid.toLowerCase() : '';
        const a: PackageAsset = { path, uuid, hasMeta: !!uuid };
        if (meta && typeof meta.importer === 'string') a.importer = meta.importer;
        if (f.isDirectory) a.isDirectory = true;
        if (f.hash) a.hash = f.hash;
        if (typeof f.size === 'number') a.size = f.size;
        assets.push(a);
    }
    return buildManifest({ project }, [], assets);
}

// ------------------------------------------------------------------ import: conflicts

/**
 * What an entry is in the destination project:
 * - new          neither its uuid nor its path is used
 * - identical    same uuid at the same path with the same content (nothing to do)
 * - changed      same uuid at the same path, other content
 * - moved        its uuid belongs to an asset at another path
 * - taken        its path holds another asset (other uuid, or no meta)
 * - folder-exists / folder-new   folders (structure only)
 */
export type EntryStatus = 'new' | 'identical' | 'changed' | 'moved' | 'taken' | 'folder-exists' | 'folder-new';

export interface ExistingAsset {
    /** Project-relative path ("assets/Art/x.png"). */
    path: string;
    uuid?: string;
    hash?: string;
    isDirectory?: boolean;
}

export function classifyEntry(a: PackageAsset, target: string, byUuid: ExistingAsset | null, atPath: ExistingAsset | null): EntryStatus {
    const same = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
    if (a.isDirectory) return atPath ? 'folder-exists' : 'folder-new';
    if (a.uuid && byUuid && !byUuid.isDirectory) {
        if (same(byUuid.path, target)) return a.hash && byUuid.hash && a.hash === byUuid.hash ? 'identical' : 'changed';
        return 'moved';
    }
    if (atPath) return 'taken';
    return 'new';
}

/**
 * import     write it (keeps its uuid)
 * skip       leave it out
 * overwrite  changed: replace the file; moved: replace the asset that has the uuid, where it is;
 *            taken: replace the file at that path (it takes the package's uuid)
 * copy       moved: import at the package path with a new uuid (references in the package remapped)
 * rename     taken: import next to it under a free name, keeping the uuid
 */
export type ImportAction = 'import' | 'skip' | 'overwrite' | 'copy' | 'rename';

/** A new uuid only works when references to it can be rewritten: not for scripts (class ids). */
export function canRemapUuid(a: PackageAsset): boolean {
    if (a.isDirectory || !a.uuid) return false;
    const imp = String(a.importer || '').toLowerCase();
    if (imp === 'typescript' || imp === 'javascript') return false;
    return !/\.(ts|js|mjs|cjs)$/i.test(a.path);
}

export function actionsFor(status: EntryStatus, a: PackageAsset): ImportAction[] {
    switch (status) {
        case 'new':
            return ['import', 'skip'];
        case 'identical':
            return ['skip'];
        case 'changed':
            return ['overwrite', 'skip'];
        case 'moved':
            return canRemapUuid(a) ? ['skip', 'overwrite', 'copy'] : ['skip', 'overwrite'];
        case 'taken':
            return a.uuid ? ['rename', 'overwrite', 'skip'] : ['rename', 'skip'];
        default:
            return ['import'];
    }
}

export function defaultAction(status: EntryStatus, a: PackageAsset): ImportAction {
    return actionsFor(status, a)[0];
}

export function actionLabel(action: ImportAction, status: EntryStatus): string {
    switch (action) {
        case 'import':
            return 'Import';
        case 'skip':
            return 'Skip';
        case 'overwrite':
            return status === 'moved' ? 'Overwrite it where it is' : status === 'taken' ? 'Replace the file there' : 'Overwrite';
        case 'copy':
            return 'Import as a copy (new uuid)';
        case 'rename':
            return 'Import renamed (keep uuid)';
    }
    return action;
}

export function statusLabel(status: EntryStatus): string {
    switch (status) {
        case 'new':
            return 'New';
        case 'identical':
            return 'Identical';
        case 'changed':
            return 'Changed';
        case 'moved':
            return 'UUID used elsewhere';
        case 'taken':
            return 'Path taken';
        case 'folder-exists':
            return '';
        case 'folder-new':
            return 'New';
    }
    return status;
}

export interface PlanRow {
    /** Package path (the key). */
    path: string;
    /** Where it lands (project-relative), or null when not imported in this mode. */
    target: string | null;
    isDirectory: boolean;
    status: EntryStatus;
    action: ImportAction;
    uuid: string;
    /** Path of the asset that already has the uuid (moved / changed). */
    existingPath?: string;
}

/** Rows of the import tree: target order, folders before their content, with depth. */
export function treeRows<T extends { target: string | null; isDirectory: boolean }>(rows: T[]): (T & { depth: number; name: string })[] {
    const list = rows.filter((r) => !!r.target).map((r) => Object.assign({}, r, { path_: r.target as string }));
    list.sort((a, b) => {
        const x = a.path_.split('/');
        const y = b.path_.split('/');
        for (let i = 0; i < Math.min(x.length, y.length); i++) {
            if (x[i] === y[i]) continue;
            // at the first difference: a folder (has more segments here, or is a directory) before a file
            const xd = i < x.length - 1 || a.isDirectory;
            const yd = i < y.length - 1 || b.isDirectory;
            if (xd !== yd) return xd ? -1 : 1;
            return x[i].localeCompare(y[i], undefined, { numeric: true, sensitivity: 'base' });
        }
        return x.length - y.length;
    });
    return list.map((r) => {
        const o: any = Object.assign({}, r, { depth: r.path_.split('/').length - 2, name: baseName(r.path_) });
        delete o.path_;
        return o;
    });
}

/** Rows below a folder row (by target path). */
export function rowsUnder<T extends { target: string | null }>(rows: T[], folderTarget: string): T[] {
    return rows.filter((r) => !!r.target && (r.target as string).indexOf(folderTarget + '/') === 0);
}

// ------------------------------------------------------------------ drag out to the OS

export type OsDragMode = 'none' | 'files' | 'package';

/** Alt: the files themselves; Alt+Shift: a package (files, dependencies and .meta). */
export function osDragMode(alt: boolean, shift: boolean): OsDragMode {
    if (!alt) return 'none';
    return shift ? 'package' : 'files';
}

/**
 * The files to hand to the OS for some assets: sub-assets give their main
 * file, folders drag as folders, a file inside a dragged folder is not listed
 * again, each path once.
 */
export function osDragFiles(list: { uuid: string; file?: string; parent?: string; isDirectory?: boolean }[], fileOf: (uuid: string) => string): string[] {
    const files: string[] = [];
    const key = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a || a.uuid.indexOf('pkg:') === 0 || a.uuid.indexOf('new:') === 0) continue;
        const f = a.parent ? fileOf(a.parent) : a.file || fileOf(a.uuid);
        if (!f) continue;
        if (files.some((x) => key(x) === key(f))) continue;
        files.push(f);
    }
    return files.filter((f) => !files.some((d) => d !== f && isInside(f, d)));
}

// ------------------------------------------------------------------ clipboard

const CLIP_HEAD = 'Cocos asset package: ';

/** Plain text put on the clipboard with a package: the first line carries its folder. */
export function encodeClipboardText(p: { path: string; project: string; paths: string[] }): string {
    const lines = [CLIP_HEAD + p.path, 'From ' + p.project + ', ' + p.paths.length + ' asset' + (p.paths.length === 1 ? '' : 's') + ':'];
    const shown = p.paths.slice(0, 50);
    for (let i = 0; i < shown.length; i++) lines.push('  ' + shown[i]);
    if (p.paths.length > shown.length) lines.push('  ...');
    return lines.join('\n');
}

/** The package folder of a clipboard text written by encodeClipboardText, or ''. */
export function decodeClipboardText(text: string): string {
    const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/)[0];
    if (first.indexOf(CLIP_HEAD) !== 0) return '';
    return first.slice(CLIP_HEAD.length).trim();
}

/** Windows' "FileNameW" clipboard format: one UTF-16LE path ending with a NUL character. */
export function encodeFileNameW(path: string): Buffer {
    return Buffer.from(String(path) + '\u0000', 'utf16le');
}

export function decodeFileNameW(buf: Buffer | null | undefined): string {
    if (!buf || buf.length < 2) return '';
    const s = buf.toString('utf16le', 0, buf.length - (buf.length % 2));
    const nul = s.indexOf('\u0000');
    return (nul >= 0 ? s.slice(0, nul) : s).trim();
}
