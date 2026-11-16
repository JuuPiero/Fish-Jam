/**
 * Asset packages on disk (main process): collect assets and their
 * dependencies, write a package folder, open a package (folder, zip, Cocos'
 * own exported zip), classify it against the project and import it (staged
 * in temp, then moved into assets/). The asset database is reached through
 * a small interface, so this is tested in node with a fake one.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { zipList, zipRead, zipWrite, ZipEntry } from './binary';
import {
    actionsFor, buildManifest, classifyEntry, collectClosure, defaultAction, ExistingAsset, extractUuids, ImportAction, isUuid, LooseFile, mainOf, MANIFEST_NAME,
    manifestFromFiles, PackageAsset, PackageManifest, parentPath, parseManifest, PlanRow, remapUuids, resolveImport, safeRelPath, scriptImports, stampName, TargetMode, targetPathFor, uniquePath, urlToRel,
} from './package';

export interface DbInfo {
    uuid: string;
    url: string;
    file: string;
    type?: string;
    importer?: string;
    isDirectory?: boolean;
    readonly?: boolean;
}

export interface DbLike {
    /** asset-db query-asset-info (uuid, url or absolute path). */
    info(key: string): Promise<DbInfo | null>;
    /** asset-db query-asset-dependencies (uuid, 'all'); null when the message is not available. */
    deps?(uuid: string): Promise<string[] | null>;
}

export interface CollectedAsset {
    uuid: string;
    /** Project-relative path ("assets/Art/x.png"). */
    rel: string;
    file: string;
    type?: string;
    importer?: string;
    isDirectory: boolean;
    dependency: boolean;
    container?: boolean;
}

export function sha1(buf: Buffer): string {
    return crypto.createHash('sha1').update(buf).digest('hex');
}

function fileHash(file: string): string {
    try {
        return sha1(fs.readFileSync(file));
    } catch (e) {
        return '';
    }
}

/** Text worth scanning for uuids (no NUL byte in the first 8 KB, not huge). */
export function isTextBuffer(buf: Buffer): boolean {
    if (buf.length > 32 * 1024 * 1024) return false;
    const n = Math.min(buf.length, 8192);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
    return true;
}

function readMetaUuid(file: string): string {
    try {
        const j = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
        return j && typeof j.uuid === 'string' && isUuid(j.uuid) ? j.uuid.toLowerCase() : '';
    } catch (e) {
        return '';
    }
}

function relOf(projectPath: string, file: string): string {
    return path.relative(projectPath, file).split(path.sep).join('/');
}

/** Every file and folder below a directory (with a .meta: Cocos assets), parents first. */
function walkAssets(dir: string, out: string[]): void {
    let names: string[] = [];
    try {
        names = fs.readdirSync(dir);
    } catch (e) {
        return;
    }
    names.sort();
    for (let i = 0; i < names.length; i++) {
        const n = names[i];
        if (/\.meta$/i.test(n)) continue;
        const f = path.join(dir, n);
        if (!fs.existsSync(f + '.meta')) continue; // not an asset (hidden, ignored)
        out.push(f);
        try {
            if (fs.statSync(f).isDirectory()) walkAssets(f, out);
        } catch (e) {
            // gone
        }
    }
}

/**
 * Uuids an asset needs: asset-db's dependency list, plus the uuids written in
 * the file and its .meta, plus the scripts a script imports with relative paths.
 */
async function dependenciesOf(db: DbLike, projectPath: string, info: DbInfo): Promise<string[]> {
    const out: string[] = [];
    const add = (u: string) => {
        const m = mainOf(u);
        if (m && m !== info.uuid && out.indexOf(m) < 0) out.push(m);
    };
    if (db.deps) {
        try {
            const d = await db.deps(info.uuid);
            if (Array.isArray(d)) d.forEach(add);
        } catch (e) {
            // not available
        }
    }
    if (info.isDirectory || !info.file) return out;
    let buf: Buffer | null = null;
    try {
        buf = fs.readFileSync(info.file);
    } catch (e) {
        buf = null;
    }
    if (buf && isTextBuffer(buf)) {
        const text = buf.toString('utf8');
        extractUuids(text).forEach(add);
        if (/\.(ts|js)$/i.test(info.file)) {
            const rel = relOf(projectPath, info.file);
            const specs = scriptImports(text);
            for (let i = 0; i < specs.length; i++) {
                const target = resolveImport(rel, specs[i], (p) => fs.existsSync(path.join(projectPath, p)));
                if (target) {
                    const u = readMetaUuid(path.join(projectPath, target));
                    if (u) add(u);
                }
            }
        }
    }
    try {
        extractUuids(fs.readFileSync(info.file + '.meta', 'utf8')).forEach(add);
    } catch (e) {
        // no meta
    }
    return out;
}

export interface CollectOptions {
    /** Follow dependencies (recursively). */
    deps: boolean;
    /** A picked folder brings everything below it (default true). */
    expandFolders?: boolean;
}

/**
 * The assets of a package: the picked ones (folders with their content),
 * their dependencies when asked, and the parent folders (for their .meta).
 * Only db://assets: Cocos Internal and extension databases are left out.
 */
export async function collectAssets(db: DbLike, projectPath: string, uuids: string[], opts: CollectOptions): Promise<CollectedAsset[]> {
    const infos: Record<string, DbInfo> = {};
    const getInfo = async (u: string): Promise<DbInfo | null> => {
        if (infos[u]) return infos[u];
        let i: DbInfo | null = null;
        try {
            i = await db.info(u);
        } catch (e) {
            i = null;
        }
        if (i && i.uuid) infos[u] = i;
        return i;
    };
    const roots: string[] = [];
    const pushRoot = (u: string) => {
        if (u && roots.indexOf(u) < 0) roots.push(u);
    };
    for (let i = 0; i < uuids.length; i++) {
        const u = mainOf(uuids[i]);
        const info = await getInfo(u);
        if (!info) continue;
        pushRoot(info.uuid);
        if (info.isDirectory && opts.expandFolders !== false && info.file) {
            const files: string[] = [];
            walkAssets(info.file, files);
            for (let k = 0; k < files.length; k++) {
                const id = readMetaUuid(files[k]);
                if (id) pushRoot(id);
            }
        }
    }
    const accept = async (u: string) => {
        const i = await getInfo(u);
        return !!i && !i.readonly && urlToRel(i.url) !== null && urlToRel(i.url) !== 'assets' && !!i.file && fs.existsSync(i.file);
    };
    const depsOf = async (u: string) => {
        if (!opts.deps) return [];
        const i = await getInfo(u);
        return i ? dependenciesOf(db, projectPath, i) : [];
    };
    const closure = await collectClosure(roots, depsOf, accept);
    const out: CollectedAsset[] = [];
    const byRel: Record<string, boolean> = {};
    for (let i = 0; i < closure.length; i++) {
        const info = infos[closure[i].uuid];
        const rel = urlToRel(info.url) as string;
        byRel[rel.toLowerCase()] = true;
        out.push({ uuid: info.uuid, rel, file: info.file, type: info.type, importer: info.importer, isDirectory: !!info.isDirectory, dependency: closure[i].dependency });
    }
    // parent folders, carried for their .meta (the folder keeps its uuid in the other project)
    const extra: CollectedAsset[] = [];
    for (let i = 0; i < out.length; i++) {
        let dir = parentPath(out[i].rel);
        while (dir && dir !== 'assets' && !byRel[dir.toLowerCase()]) {
            byRel[dir.toLowerCase()] = true;
            const abs = path.join(projectPath, dir);
            extra.push({ uuid: readMetaUuid(abs), rel: dir, file: abs, isDirectory: true, dependency: false, container: true, importer: 'directory' });
            dir = parentPath(dir);
        }
    }
    return out.concat(extra);
}

/** Writes a package folder (files, .meta files, asset-package.json) and returns its manifest. */
export function writePackage(projectPath: string, list: CollectedAsset[], destDir: string, source: PackageManifest['source'], roots: string[]): PackageManifest {
    fs.mkdirSync(destDir, { recursive: true });
    const assets: PackageAsset[] = [];
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const out = path.join(destDir, ...a.rel.split('/'));
        fs.mkdirSync(a.isDirectory ? out : path.dirname(out), { recursive: true });
        const e: PackageAsset = { path: a.rel, uuid: a.uuid, isDirectory: a.isDirectory || undefined, hasMeta: false };
        if (a.type) e.type = a.type;
        if (a.importer) e.importer = a.importer;
        if (a.dependency) e.dependency = true;
        if (a.container) e.container = true;
        if (!a.isDirectory) {
            const buf = fs.readFileSync(a.file);
            fs.writeFileSync(out, buf);
            e.hash = sha1(buf);
            e.size = buf.length;
        }
        if (fs.existsSync(a.file + '.meta')) {
            fs.copyFileSync(a.file + '.meta', out + '.meta');
            e.hasMeta = true;
        }
        assets.push(e);
    }
    const manifest = buildManifest(source, roots, assets);
    fs.writeFileSync(path.join(destDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
    return manifest;
}

/** Every file below a folder as zip entries (paths relative to the folder). */
export function zipFolder(dir: string): Buffer {
    const entries: ZipEntry[] = [];
    const walk = (d: string, prefix: string) => {
        const names = fs.readdirSync(d).sort();
        for (let i = 0; i < names.length; i++) {
            const f = path.join(d, names[i]);
            const name = prefix + names[i];
            if (fs.statSync(f).isDirectory()) {
                entries.push({ name: name + '/', data: Buffer.alloc(0) });
                walk(f, name + '/');
            } else entries.push({ name, data: fs.readFileSync(f) });
        }
    };
    walk(dir, '');
    return zipWrite(entries);
}

// ------------------------------------------------------------------ opening a package

export interface OpenedPackage {
    /** Folder holding asset-package.json (or the loose files). */
    dir: string;
    manifest: PackageManifest;
    /** ours: an asset-package.json; loose: files with .meta (Cocos' own zip, a plain folder). */
    kind: 'ours' | 'loose';
    /** What the user picked or dropped. */
    source: string;
}

function hasManifest(dir: string): boolean {
    return fs.existsSync(path.join(dir, MANIFEST_NAME));
}

/** Is this path a package of ours (folder, its asset-package.json, or a zip holding one)? */
export function probePackage(p: string): boolean {
    try {
        const st = fs.statSync(p);
        if (st.isDirectory()) return hasManifest(p);
        if (path.basename(p).toLowerCase() === MANIFEST_NAME) return true;
        if (/\.zip$/i.test(p)) return zipList(fs.readFileSync(p)).some((n) => n === MANIFEST_NAME || /^[^/]+\/asset-package\.json$/.test(n));
    } catch (e) {
        // not readable
    }
    return false;
}

/** Unpacks a zip into a folder (unsafe paths skipped). */
export function unzipTo(buf: Buffer, dir: string): void {
    const entries = zipRead(buf);
    for (let i = 0; i < entries.length; i++) {
        const isDir = /\/$/.test(entries[i].name);
        const rel = safeRelPath(entries[i].name);
        if (!rel || /(^|\/)__MACOSX(\/|$)/.test(rel)) continue;
        const out = path.join(dir, ...rel.split('/'));
        if (isDir) fs.mkdirSync(out, { recursive: true });
        else {
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, entries[i].data);
        }
    }
}

function looseFiles(dir: string): LooseFile[] {
    const out: LooseFile[] = [];
    const walk = (d: string, prefix: string) => {
        const names = fs.readdirSync(d).sort();
        for (let i = 0; i < names.length; i++) {
            if (/\.meta$/i.test(names[i])) continue;
            const f = path.join(d, names[i]);
            const rel = prefix + names[i];
            const isDir = fs.statSync(f).isDirectory();
            let meta: string | null = null;
            try {
                meta = fs.readFileSync(f + '.meta', 'utf8');
            } catch (e) {
                meta = null;
            }
            const lf: LooseFile = { path: rel, isDirectory: isDir, meta };
            if (!isDir) {
                const buf = fs.readFileSync(f);
                lf.hash = sha1(buf);
                lf.size = buf.length;
            }
            out.push(lf);
            if (isDir) walk(f, rel + '/');
        }
    };
    walk(dir, '');
    return out;
}

/**
 * Opens what the user dropped, pasted or picked: a package folder, its
 * asset-package.json, a zip of a package, or a zip / folder of assets with
 * .meta files and no manifest (Cocos' own "Export Asset Package" zip).
 * Zips are unpacked under `workDir`.
 */
export function openPackage(p: string, workDir: string): OpenedPackage {
    let st: fs.Stats;
    try {
        st = fs.statSync(p);
    } catch (e) {
        throw new Error('Not found: ' + p);
    }
    let dir = p;
    if (!st.isDirectory()) {
        if (path.basename(p).toLowerCase() === MANIFEST_NAME) dir = path.dirname(p);
        else if (/\.zip$/i.test(p)) {
            dir = path.join(workDir, stampName(new Date()));
            unzipTo(fs.readFileSync(p), dir);
            // a zip of the package folder itself: one top folder holding the manifest
            if (!hasManifest(dir)) {
                const tops = fs.readdirSync(dir).filter((n) => !/^__MACOSX$/.test(n));
                if (tops.length === 1 && fs.statSync(path.join(dir, tops[0])).isDirectory() && hasManifest(path.join(dir, tops[0]))) dir = path.join(dir, tops[0]);
            }
        } else throw new Error('Not an asset package: ' + p);
    }
    if (hasManifest(dir)) {
        const manifest = parseManifest(fs.readFileSync(path.join(dir, MANIFEST_NAME), 'utf8'));
        return { dir, manifest, kind: 'ours', source: p };
    }
    const files = looseFiles(dir);
    if (!files.some((f) => !!f.meta)) throw new Error('No asset package here: no ' + MANIFEST_NAME + ' and no .meta files in ' + p);
    return { dir, manifest: manifestFromFiles(files, path.basename(p).replace(/\.zip$/i, '')), kind: 'loose', source: p };
}

/** The file of a package entry (a loose package keeps its paths without the assets/ prefix sometimes). */
function packageFile(pkg: OpenedPackage, a: PackageAsset): string {
    const direct = path.join(pkg.dir, ...a.path.split('/'));
    if (pkg.kind === 'ours' || fs.existsSync(direct)) return direct;
    return path.join(pkg.dir, ...a.path.split('/').slice(1));
}

// ------------------------------------------------------------------ classify and import

async function existingByUuid(db: DbLike, uuid: string): Promise<ExistingAsset | null> {
    if (!uuid) return null;
    let info: DbInfo | null = null;
    try {
        info = await db.info(uuid);
    } catch (e) {
        info = null;
    }
    if (!info || !info.uuid || mainOf(info.uuid) !== uuid) return null;
    const rel = urlToRel(info.url);
    return { path: rel || info.url, uuid, isDirectory: !!info.isDirectory, hash: info.isDirectory || !info.file ? '' : fileHash(info.file) };
}

function existingAtPath(projectPath: string, rel: string): ExistingAsset | null {
    const abs = path.join(projectPath, ...rel.split('/'));
    let st: fs.Stats;
    try {
        st = fs.statSync(abs);
    } catch (e) {
        return null;
    }
    return { path: rel, uuid: readMetaUuid(abs), isDirectory: st.isDirectory() };
}

export interface PlanRowFull extends PlanRow {
    actions: ImportAction[];
    hasMeta: boolean;
    type?: string;
    importer?: string;
    dependency?: boolean;
    container?: boolean;
    /** Folder row added for a parent that the package does not list. */
    virtual?: boolean;
}

/** Each package entry with its status in this project, the target path and the default action. */
export async function classifyPackage(pkg: OpenedPackage, projectPath: string, db: DbLike, mode: TargetMode): Promise<PlanRowFull[]> {
    const rows: PlanRowFull[] = [];
    const targets: Record<string, boolean> = {};
    for (let i = 0; i < pkg.manifest.assets.length; i++) {
        const a = pkg.manifest.assets[i];
        const target = targetPathFor(a.path, mode);
        const byUuid = target ? await existingByUuid(db, a.uuid) : null;
        const atPath = target ? existingAtPath(projectPath, target) : null;
        const status = classifyEntry(a, target || a.path, byUuid, atPath);
        const row: PlanRowFull = {
            path: a.path,
            target,
            isDirectory: !!a.isDirectory,
            status,
            action: defaultAction(status, a),
            actions: actionsFor(status, a),
            uuid: a.uuid,
            hasMeta: !!a.hasMeta,
        };
        if (status === 'identical') row.actions = ['skip', 'overwrite'];
        if (byUuid && (status === 'moved' || status === 'changed')) row.existingPath = byUuid.path;
        if (status === 'moved' && byUuid && byUuid.path.indexOf('assets/') !== 0) row.actions = row.actions.filter((x) => x !== 'overwrite'); // read-only database
        if (a.type) row.type = a.type;
        if (a.importer) row.importer = a.importer;
        if (a.dependency) row.dependency = true;
        if (a.container) row.container = true;
        rows.push(row);
        if (target) targets[target.toLowerCase()] = true;
    }
    // parent folders the package does not list (a zip without folder .meta files)
    const extra: PlanRowFull[] = [];
    for (let i = 0; i < rows.length; i++) {
        let dir = rows[i].target ? parentPath(rows[i].target as string) : '';
        while (dir && dir !== 'assets' && !targets[dir.toLowerCase()]) {
            targets[dir.toLowerCase()] = true;
            const at = existingAtPath(projectPath, dir);
            extra.push({ path: '#' + dir, target: dir, isDirectory: true, status: at ? 'folder-exists' : 'folder-new', action: 'import', actions: ['import'], uuid: '', hasMeta: false, virtual: true });
            dir = parentPath(dir);
        }
    }
    return rows.concat(extra);
}

export interface ImportResult {
    /** Project-relative paths written (files and folders). */
    written: string[];
    skipped: number;
    errors: string[];
    /** Folder urls to refresh (the topmost written folders and the parents of written files). */
    refresh: string[];
    /** Existing assets that were overwritten (reimport them). */
    overwritten: string[];
    /** uuid -> new uuid for "Import as a copy". */
    remapped: Record<string, string>;
}

function copyIntoProject(from: string, to: string): void {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
        if (fs.existsSync(to)) fs.rmSync(to, { force: true });
        fs.renameSync(from, to);
    } catch (e) {
        fs.copyFileSync(from, to);
    }
}

/**
 * Imports a package: each row's action decided (default when not given),
 * everything written to a staging folder first (uuids remapped there for
 * copies), then moved into the project. The caller refreshes asset-db.
 */
export async function importPackage(
    pkg: OpenedPackage,
    projectPath: string,
    db: DbLike,
    mode: TargetMode,
    decisions: Record<string, ImportAction>,
    stagingRoot: string,
    newUuid: () => string = () => crypto.randomUUID(),
): Promise<ImportResult> {
    const rows = await classifyPackage(pkg, projectPath, db, mode);
    const result: ImportResult = { written: [], skipped: 0, errors: [], refresh: [], overwritten: [], remapped: {} };
    const byPath: Record<string, PackageAsset> = {};
    pkg.manifest.assets.forEach((a) => (byPath[a.path] = a));
    // final action per row (only actions the row allows)
    const plan: { row: PlanRowFull; action: ImportAction; dest: string; keepMeta: boolean }[] = [];
    const planned: Record<string, boolean> = {};
    const taken = (rel: string) => !!planned[rel.toLowerCase()] || !!existingAtPath(projectPath, rel);
    const files = rows.filter((r) => !r.isDirectory && r.target);
    for (let i = 0; i < files.length; i++) {
        const r = files[i];
        const want = decisions[r.path];
        const action = want && r.actions.indexOf(want) >= 0 ? want : r.action;
        if (action === 'skip') {
            result.skipped++;
            continue;
        }
        let dest = r.target as string;
        if (action === 'overwrite' && r.status === 'moved' && r.existingPath) dest = r.existingPath;
        if (action === 'rename' || (action === 'copy' && taken(dest))) dest = uniquePath(dest, taken);
        if (action === 'copy') result.remapped[r.uuid] = newUuid();
        planned[dest.toLowerCase()] = true;
        plan.push({ row: r, action, dest, keepMeta: r.hasMeta });
        if (action === 'overwrite') result.overwritten.push(dest);
    }
    // folders: those holding something written, and empty folders the package lists (not containers)
    const folders = rows.filter((r) => r.isDirectory && r.target);
    for (let i = 0; i < folders.length; i++) {
        const r = folders[i];
        const t = (r.target as string).toLowerCase();
        const holds = plan.some((p) => p.dest.toLowerCase().indexOf(t + '/') === 0);
        const empty = !r.virtual && !r.container && decisions[r.path] !== 'skip';
        if (!holds && !empty) continue;
        if (r.status === 'folder-exists') continue;
        // keep the folder's uuid unless another asset already has it
        const byUuid = r.uuid ? await existingByUuid(db, r.uuid) : null;
        plan.push({ row: r, action: 'import', dest: r.target as string, keepMeta: r.hasMeta && !byUuid });
    }
    if (!plan.length) return result;
    // stage
    const stage = path.join(stagingRoot, stampName(new Date()));
    const remap = result.remapped;
    const fixText = (buf: Buffer): Buffer => (Object.keys(remap).length && isTextBuffer(buf) ? Buffer.from(remapUuids(buf.toString('utf8'), remap), 'utf8') : buf);
    try {
        for (let i = 0; i < plan.length; i++) {
            const p = plan[i];
            const out = path.join(stage, ...p.dest.split('/'));
            const a = byPath[p.row.path];
            const src = a ? packageFile(pkg, a) : '';
            if (p.row.isDirectory) fs.mkdirSync(out, { recursive: true });
            else {
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, fixText(fs.readFileSync(src)));
            }
            if (p.keepMeta && src && fs.existsSync(src + '.meta')) fs.writeFileSync(out + '.meta', fixText(fs.readFileSync(src + '.meta')));
        }
        // move into the project: folders first (parents before children), then files
        plan.sort((x, y) => (x.row.isDirectory === y.row.isDirectory ? x.dest.length - y.dest.length : x.row.isDirectory ? -1 : 1));
        for (let i = 0; i < plan.length; i++) {
            const p = plan[i];
            const from = path.join(stage, ...p.dest.split('/'));
            const to = path.join(projectPath, ...p.dest.split('/'));
            try {
                if (p.row.isDirectory) fs.mkdirSync(to, { recursive: true });
                else copyIntoProject(from, to);
                if (fs.existsSync(from + '.meta')) copyIntoProject(from + '.meta', to + '.meta');
                result.written.push(p.dest);
            } catch (e) {
                result.errors.push(p.dest + ': ' + String((e as Error).message || e));
            }
        }
    } finally {
        try {
            fs.rmSync(stage, { recursive: true, force: true });
        } catch (e) {
            // leave it
        }
    }
    result.refresh = refreshUrls(result.written, (rel) => rows.some((r) => r.isDirectory && r.target === rel && r.status === 'folder-new'));
    return result;
}

/**
 * The folders asset-db should refresh: for each written path, the first
 * folder above it that already existed (a new folder is found by refreshing
 * its parent). Folders inside another listed folder are dropped.
 */
export function refreshUrls(written: string[], isNewFolder: (rel: string) => boolean): string[] {
    const dirs: string[] = [];
    for (let i = 0; i < written.length; i++) {
        let dir = parentPath(written[i]) || 'assets';
        while (dir && dir !== 'assets' && isNewFolder(dir)) dir = parentPath(dir) || 'assets';
        if (dirs.indexOf(dir) < 0) dirs.push(dir);
    }
    const keep = dirs.filter((d) => !dirs.some((o) => o !== d && d.indexOf(o + '/') === 0));
    return keep.map((d) => 'db://' + d);
}
