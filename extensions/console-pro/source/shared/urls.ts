/**
 * Script urls found in Cocos stack traces, and how they map to files of the project.
 *
 * - `db://assets/x/Player.ts`            asset-db url
 * - `file:///E:/Game/assets/Player.ts`   a file url
 * - `E:\Game\assets\Player.ts`, `/Users/me/Game/assets/Player.ts`   plain paths
 * - `pack:///chunks/ab/<sha1>.js`, `file:///E:/Game/temp/programming/packer-driver/targets/editor/chunks/ab/<sha1>.js`,
 *   `http://localhost:7456/scripting/x/chunks/ab/<sha1>.js`        compiled chunks of project scripts
 *   (a `.js.map` next to each chunk names the original .ts)
 * - `packages://<pkg>/dist/x.js`          extension files loaded by the editor
 * - `cce:/internal/...`, `node:internal/...`, `<anonymous>`, `native`        not openable
 */

export type UrlKind = 'none' | 'file' | 'db' | 'chunk' | 'package' | 'web' | 'internal';

export interface UrlInfo {
    kind: UrlKind;
    /** file: the absolute path (forward slashes kept as written, decoded). */
    path?: string;
    /** db: database name ("assets", "internal", an extension name); package: the package name. */
    name?: string;
    /** db / package: the path inside it, without a leading slash. */
    rel?: string;
    /** chunk: shard ("ab"), id (sha1) and the build target when the url tells it. */
    chunk?: { shard: string; id: string; target: 'editor' | 'preview' | '' };
}

const CHUNK_RE = /(?:^|[/\\])chunks[/\\]([0-9a-f]{2})[/\\]([0-9a-f]{16,64})\.js$/i;

/** Removes "?query" and "#hash" (dev servers add ?t=... to script urls). */
function stripQuery(url: string): string {
    return url.replace(/[?#].*$/, '');
}

function decode(s: string): string {
    try {
        return decodeURIComponent(s);
    } catch (e) {
        return s;
    }
}

/** A file:// url as a path ("file:///E:/a%20b/x.ts" -> "E:/a b/x.ts"). */
export function fileUrlToPath(url: string): string {
    let p = stripQuery(url).replace(/^file:\/\//i, '');
    if (/^\/[A-Za-z]:[/\\]/.test(p)) p = p.slice(1); // "/E:/..." on Windows
    else if (/^[^/]+\/[A-Za-z]:\//.test(p)) p = p.slice(p.indexOf('/') + 1); // "localhost/E:/..."
    return decode(p);
}

export function classifyUrl(raw: string): UrlInfo {
    const url = (raw || '').trim();
    if (!url || url === '<anonymous>' || url === 'native' || /^<.*>$/.test(url)) return { kind: 'none' };

    const clean = stripQuery(url);
    const chunk = CHUNK_RE.exec(clean);
    if (chunk) {
        const target: 'editor' | 'preview' | '' = /targets[/\\]editor[/\\]/i.test(clean)
            ? 'editor'
            : /targets[/\\]preview[/\\]|^https?:|\/scripting\//i.test(clean)
            ? 'preview'
            : '';
        return { kind: 'chunk', chunk: { shard: chunk[1].toLowerCase(), id: chunk[2].toLowerCase(), target } };
    }

    let m = /^db:\/\/([^/]+)\/?(.*)$/i.exec(clean);
    if (m) return { kind: 'db', name: m[1], rel: decode(m[2]) };

    m = /^packages:\/\/([^/]+)\/?(.*)$/i.exec(clean);
    if (m) return { kind: 'package', name: m[1], rel: decode(m[2]) };

    if (/^file:\/\//i.test(clean)) return { kind: 'file', path: fileUrlToPath(clean) };
    if (/^[A-Za-z]:[/\\]/.test(clean) || /^\\\\/.test(clean)) return { kind: 'file', path: clean };
    if (/^https?:\/\//i.test(clean)) return { kind: 'web', path: clean };
    if (/^(cce|node|internal|electron|chrome|devtools|extensions|webpack|blob|data):/i.test(clean) || /^internal[/\\]/.test(clean)) return { kind: 'internal' };
    if (clean.charAt(0) === '/') return { kind: 'file', path: clean };
    // project-relative paths in compiler messages ("assets/Player.cs")
    if (/^(assets|extensions)[/\\]/i.test(clean)) return { kind: 'file', path: clean };
    return { kind: 'none' };
}

/** Forward slashes, no trailing slash, lower case on Windows-like paths (for comparisons only). */
export function normPath(p: string): string {
    let s = (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (/^[A-Za-z]:\//.test(s)) s = s.toLowerCase();
    return s;
}

export function joinPath(root: string, rel: string): string {
    const r = (root || '').replace(/[\\/]+$/, '');
    const t = (rel || '').replace(/^[\\/]+/, '');
    return t ? r + '/' + t : r;
}

/** The compiled chunk file of a target. */
export function chunkFile(projectRoot: string, chunk: { shard: string; id: string }, target: 'editor' | 'preview'): string {
    return joinPath(projectRoot, 'temp/programming/packer-driver/targets/' + target + '/chunks/' + chunk.shard + '/' + chunk.id + '.js');
}

/** True when `file` lies inside `dir`. */
export function isInside(file: string, dir: string): boolean {
    const f = normPath(file);
    const d = normPath(dir);
    return !!d && (f === d || f.startsWith(d + '/'));
}

/** Path relative to the project ("assets/Player.ts"), or the path itself when it lies outside. */
export function displayPath(file: string, projectRoot: string): string {
    if (!projectRoot || !isInside(file, projectRoot)) return file.replace(/\\/g, '/');
    return file.replace(/\\/g, '/').slice(projectRoot.replace(/\\/g, '/').replace(/\/+$/, '').length + 1);
}

/**
 * Project code the user wrote: inside the project, but not in generated or third-party
 * folders (temp, library, build, node_modules, an extension's dist without a source map...).
 */
export function isUserFile(file: string, projectRoot: string): boolean {
    if (!file || !projectRoot || !isInside(file, projectRoot)) return false;
    const rel = normPath(displayPath(file, projectRoot)).toLowerCase();
    if (/(^|\/)node_modules\//.test(rel)) return false;
    if (/^(temp|library|build|local|profiles|settings|native)\//.test(rel)) return false;
    return true;
}

/** Static resolution of a url to a file path (db://assets, file urls, plain paths). '' when it needs a lookup or is not a file. */
export function staticPath(info: UrlInfo, projectRoot: string): string {
    switch (info.kind) {
        case 'file':
            return info.path || '';
        case 'db':
            if (info.name === 'assets') return joinPath(projectRoot, 'assets/' + (info.rel || ''));
            return '';
        default:
            return '';
    }
}
