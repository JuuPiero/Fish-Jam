/**
 * Main process of project-browser: opens the Project window, keeps the
 * thumbnail cache on disk (<project>/temp/project-browser/thumbs, keyed by
 * uuid and the source file's modification time), stores labels and saved
 * searches in the project profile, small OS helpers (Explorer, clipboard),
 * the drag out to the OS (webContents.startDrag) and asset packages
 * (build, open, classify, import, export).
 */
import * as fs from 'fs';
import { join } from 'path';
import { dragIconPixels, pngEncode, zipList } from './shared/binary';
import { readClipboard, writeClipboard } from './os-clipboard';
import { encodeClipboardText, ImportAction, isInside, mainOf, MANIFEST_NAME, PackageManifest, stampName, TargetMode, commonDir, urlToRel } from './shared/package';
import { classifyPackage, collectAssets, DbLike, importPackage, OpenedPackage, openPackage, probePackage, writePackage, zipFolder } from './shared/package-io';

const PKG = 'project-browser';
/** ipcRenderer channel of the drag out to the OS: the sender is the panel's own webContents. */
const OS_DRAG_CHANNEL = 'project-browser:start-os-drag';

function cacheDir(): string {
    const dir = join(Editor.Project.path, 'temp', PKG, 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

let index: Record<string, number> | null = null;

function indexFile(): string {
    return join(cacheDir(), 'index.json');
}

function loadIndex(): Record<string, number> {
    if (index) return index;
    try {
        index = JSON.parse(fs.readFileSync(indexFile(), 'utf8')) || {};
    } catch (e) {
        index = {};
    }
    return index!;
}

let saveTimer: any = null;
function saveIndex(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            fs.writeFileSync(indexFile(), JSON.stringify(index || {}));
        } catch (e) {
            // best effort
        }
    }, 1000);
}

function safeId(uuid: string): string {
    return uuid.replace(/[^0-9a-zA-Z@_-]/g, '_').replace(/@/g, '_');
}

function mtimeOf(file: string): number {
    try {
        return fs.statSync(file).mtimeMs;
    } catch (e) {
        return 0;
    }
}

// ------------------------------------------------------------------ packages

function tempDir(...parts: string[]): string {
    return join(Editor.Project.path, 'temp', PKG, ...parts);
}

const assetDb: DbLike = {
    async info(key: string) {
        try {
            return ((await Editor.Message.request('asset-db', 'query-asset-info', key)) as any) || null;
        } catch (e) {
            return null;
        }
    },
    async deps(uuid: string) {
        try {
            const r: any = await Editor.Message.request('asset-db', 'query-asset-dependencies', uuid, 'all' as any);
            return Array.isArray(r) ? r : null;
        } catch (e) {
            return null;
        }
    },
};

function projectSource(): PackageManifest['source'] {
    let name = '';
    try {
        name = Editor.Project.name;
    } catch (e) {
        name = '';
    }
    let creator = '';
    try {
        creator = Editor.App.version;
    } catch (e) {
        creator = '';
    }
    return { project: name || Editor.Project.path.split(/[\\/]/).pop() || 'Project', path: Editor.Project.path, creator };
}

/** Removes packages and unpacked zips older than a day (they are only needed for one drag or paste). */
function cleanTemp(keep: string): void {
    const now = Date.now();
    ['packages', 'incoming', 'staging', 'export'].forEach((sub) => {
        const dir = tempDir(sub);
        let names: string[] = [];
        try {
            names = fs.readdirSync(dir);
        } catch (e) {
            return;
        }
        for (let i = 0; i < names.length; i++) {
            const p = join(dir, names[i]);
            if (p === keep) continue;
            try {
                if (now - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) fs.rmSync(p, { recursive: true, force: true });
            } catch (e) {
                // in use
            }
        }
    });
}

/** Builds a package of the assets and everything they need in temp/project-browser/packages/<time>. */
async function buildTempPackage(uuids: string[]): Promise<{ dir: string; manifest: PackageManifest }> {
    const list = await collectAssets(assetDb, Editor.Project.path, uuids, { deps: true });
    if (!list.some((a) => !a.container)) throw new Error('Nothing to pack: only assets under Assets can go into a package.');
    const dir = tempDir('packages', stampName(new Date()));
    const manifest = writePackage(Editor.Project.path, list, dir, projectSource(), uuids.map(mainOf));
    cleanTemp(dir);
    return { dir, manifest };
}

/** A package built ahead (Alt+Shift pressed on an item) for the drag that follows. */
let prepared: { key: string; promise: Promise<{ dir: string; manifest: PackageManifest }> } | null = null;

function packageFor(uuids: string[]): Promise<{ dir: string; manifest: PackageManifest }> {
    const key = uuids.slice().sort().join(',');
    if (prepared && prepared.key === key) {
        const p = prepared.promise;
        prepared = null;
        return p;
    }
    return buildTempPackage(uuids);
}

/** Opened packages (dialog open in a panel), by id. */
const opened: Record<string, OpenedPackage> = {};
let openSeq = 0;

function modeFor(pkg: OpenedPackage, folderUrl: string | null): TargetMode {
    const folder = folderUrl ? urlToRel(folderUrl) : null;
    return folder ? { kind: 'folder', folder, root: commonDir(pkg.manifest.assets) } : { kind: 'original' };
}

/** The 32 px drag icon: the asset's cached thumbnail, else a drawn page or box. */
function dragIcon(mode: string, count: number, thumbUuid?: string): any {
    const { nativeImage } = require('electron');
    if (thumbUuid && count === 1 && mode === 'files') {
        try {
            const f = join(cacheDir(), safeId(thumbUuid) + '.png');
            if (fs.existsSync(f)) {
                const img = nativeImage.createFromPath(f);
                if (!img.isEmpty()) {
                    const s = img.getSize();
                    return s.width >= s.height ? img.resize({ width: 32 }) : img.resize({ height: 32 });
                }
            }
        } catch (e) {
            // drawn icon
        }
    }
    return nativeImage.createFromBuffer(pngEncode(32, 32, dragIconPixels(mode === 'package' ? 'package' : 'files', count)));
}

/** The webContents a drag starts from: the IPC sender, or the focused one. */
function dragSource(sender?: any): any {
    if (sender && typeof sender.startDrag === 'function') return sender;
    const { webContents, BrowserWindow } = require('electron');
    try {
        const wc = webContents.getFocusedWebContents();
        if (wc) return wc;
    } catch (e) {
        // older Electron
    }
    const win = BrowserWindow.getFocusedWindow();
    return win ? win.webContents : null;
}

interface OsDragRequest {
    mode: 'files' | 'package';
    files?: string[];
    uuids?: string[];
    thumbUuid?: string;
}

let ipcListener: ((event: any, payload: OsDragRequest) => void) | null = null;
/** Pending "Import / Export Package" asked from the Extension menu, taken by a Project window. */
let pendingMenu = '';

export const methods: { [name: string]: (...args: any[]) => any } = {
    /** Panel › Project */
    openPanel() {
        Editor.Panel.open(PKG + '.project');
    },

    async openDocs() {
        try {
            await require('electron').shell.openPath(join(__dirname, '..', 'README.md'));
        } catch (e) {
            console.error('[Project Browser] Could not open the README:', e);
        }
    },

    /** A cached thumbnail (data URL) when it is newer than its source file(s), or null. */
    thumbGet(uuid: string, file: string | string[]): string | null {
        const idx = loadIndex();
        const at = idx[uuid];
        if (!at) return null;
        const files = Array.isArray(file) ? file : [file];
        for (let i = 0; i < files.length; i++) if (files[i] && mtimeOf(files[i]) > at) return null;
        try {
            const buf = fs.readFileSync(join(cacheDir(), safeId(uuid) + '.png'));
            return 'data:image/png;base64,' + buf.toString('base64');
        } catch (e) {
            return null;
        }
    },

    /** Stores a rendered thumbnail (PNG data URL). */
    thumbPut(uuid: string, dataUrl: string): boolean {
        const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
        if (!m) return false;
        try {
            fs.writeFileSync(join(cacheDir(), safeId(uuid) + '.png'), Buffer.from(m[1], 'base64'));
            loadIndex()[uuid] = Date.now();
            saveIndex();
            return true;
        } catch (e) {
            return false;
        }
    },

    /** Forgets every cached thumbnail. */
    thumbClear(): boolean {
        try {
            fs.rmSync(cacheDir(), { recursive: true, force: true });
        } catch (e) {
            // already gone
        }
        index = {};
        // open Project windows drop their in-memory thumbnails too
        Editor.Message.broadcast(PKG + ':thumbs-cleared');
        return true;
    },

    showInExplorer(file: string) {
        if (file) require('electron').shell.showItemInFolder(file);
    },

    copyText(text: string) {
        require('electron').clipboard.writeText(String(text || ''));
    },

    /** Project profile values (labels, saved searches). */
    async getStore(key: string): Promise<any> {
        try {
            return await Editor.Profile.getProject(PKG, key);
        } catch (e) {
            return null;
        }
    },

    async setStore(key: string, value: any): Promise<boolean> {
        try {
            await Editor.Profile.setProject(PKG, key, value);
            return true;
        } catch (e) {
            console.warn('[Project Browser] Could not save ' + key + ':', e);
            return false;
        }
    },

    /** Highlights an asset in Cocos' Assets panel. */
    revealInAssets(uuid: string) {
        try {
            Editor.Message.send('assets', 'twinkle', uuid);
        } catch (e) {
            // the Assets panel is closed
        }
    },

    // -------------------------------------------------------------- drag out to the OS

    /** Alt+Shift pressed on an item: start building its package, so the drag starts sooner. */
    prepareOsDrag(uuids: string[]) {
        if (!Array.isArray(uuids) || !uuids.length) return;
        const key = uuids.slice().sort().join(',');
        if (prepared && prepared.key === key) return;
        const promise = buildTempPackage(uuids);
        promise.catch(() => undefined);
        prepared = { key, promise };
    },

    /**
     * Starts a native file drag (Explorer, a browser upload, chat apps, another
     * Cocos project). Called over ipcRenderer (`sender` is the panel's
     * webContents) or as an editor message (then the focused webContents).
     */
    async startOsDrag(req: OsDragRequest, sender?: any): Promise<boolean> {
        try {
            let files: string[] = [];
            if (req && req.mode === 'package') {
                const pkg = await packageFor(req.uuids || []);
                files = [pkg.dir];
            } else files = ((req && req.files) || []).filter((f) => typeof f === 'string' && fs.existsSync(f));
            const wc = dragSource(sender);
            if (!files.length || !wc) return false;
            wc.startDrag({ file: files[0], files, icon: dragIcon(req.mode, req.mode === 'package' ? 1 : files.length, req.thumbUuid) });
            return true;
        } catch (e) {
            console.warn('[Project Browser] Could not start the drag:', e);
            return false;
        }
    },

    // -------------------------------------------------------------- clipboard

    /** Ctrl+C: a package of the assets (and their dependencies) on the system clipboard. */
    async copyPackage(uuids: string[]): Promise<any> {
        try {
            const pkg = await buildTempPackage(uuids || []);
            const paths = pkg.manifest.assets.filter((a) => !a.container).map((a) => a.path);
            const how = await writeClipboard([pkg.dir], encodeClipboardText({ path: pkg.dir, project: pkg.manifest.source.project, paths }));
            return { ok: true, dir: pkg.dir, count: paths.length, how };
        } catch (e) {
            return { ok: false, error: String((e as Error).message || e) };
        }
    },

    /** Ctrl+V: a package (ours, or a folder / zip copied in Explorer), or plain files to import. */
    async readClipboard(): Promise<any> {
        const c = await readClipboard();
        if (c.packagePath && probePackage(c.packagePath)) return { kind: 'package', path: c.packagePath };
        const pkgs = c.files.filter((f) => probePackage(f));
        if (pkgs.length) return { kind: 'package', path: pkgs[0] };
        if (c.files.length) return { kind: 'files', files: c.files };
        return { kind: 'none' };
    },

    // -------------------------------------------------------------- opening and importing packages

    /** Which of these paths are asset packages (folders or zips with asset-package.json). */
    probePaths(paths: string[]): string[] {
        return (paths || []).filter((p) => typeof p === 'string' && probePackage(p));
    },

    /** Is a path inside this project's assets folder (an Alt drag dropped back on itself)? */
    insideProject(paths: string[]): boolean[] {
        const assets = join(Editor.Project.path, 'assets');
        return (paths || []).map((p) => isInside(String(p || ''), assets));
    },

    /** Opens a package for the import dialog. */
    openPackage(p: string): any {
        try {
            const pkg = openPackage(p, tempDir('incoming'));
            const id = 'pkg' + ++openSeq;
            opened[id] = pkg;
            const src = pkg.manifest.source;
            return {
                ok: true,
                id,
                kind: pkg.kind,
                project: src.project,
                sourcePath: src.path || '',
                creator: src.creator || '',
                createdAt: pkg.manifest.createdAt,
                fromThisProject: !!src.path && isInside(src.path, Editor.Project.path) && isInside(Editor.Project.path, src.path),
                // a package this project just built (an Alt+Shift drag dropped back on itself)
                ownTemp: isInside(p, tempDir('packages')),
                roots: pkg.manifest.roots.slice(),
                count: pkg.manifest.assets.filter((a) => !a.isDirectory).length,
                root: commonDir(pkg.manifest.assets),
                path: p,
            };
        } catch (e) {
            return { ok: false, error: String((e as Error).message || e) };
        }
    },

    /** Rows of the import dialog for a target (null: the original paths). */
    async classifyPackage(id: string, folderUrl: string | null): Promise<any> {
        const pkg = opened[id];
        if (!pkg) return { ok: false, error: 'The package was closed.' };
        const rows = await classifyPackage(pkg, Editor.Project.path, assetDb, modeFor(pkg, folderUrl));
        return { ok: true, rows: JSON.parse(JSON.stringify(rows)) };
    },

    /** Imports the package with the dialog's choices, then refreshes the asset database. */
    async importPackage(id: string, folderUrl: string | null, decisions: Record<string, ImportAction>): Promise<any> {
        const pkg = opened[id];
        if (!pkg) return { ok: false, error: 'The package was closed.' };
        try {
            const r = await importPackage(pkg, Editor.Project.path, assetDb, modeFor(pkg, folderUrl), decisions || {}, tempDir('staging'));
            for (let i = 0; i < r.refresh.length; i++) {
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', r.refresh[i]);
                } catch (e) {
                    r.errors.push('refresh ' + r.refresh[i] + ': ' + e);
                }
            }
            for (let i = 0; i < r.overwritten.length; i++) {
                try {
                    await Editor.Message.request('asset-db', 'reimport-asset', 'db://' + r.overwritten[i]);
                } catch (e) {
                    // refreshed anyway
                }
            }
            if (r.errors.length) console.warn('[Project Browser] Package import problems:\n' + r.errors.join('\n'));
            const first = r.written.find((w) => !fs.statSync(join(Editor.Project.path, w)).isDirectory()) || r.written[0] || '';
            return { ok: true, written: r.written.length, skipped: r.skipped, errors: r.errors, remapped: Object.keys(r.remapped).length, first: first ? 'db://' + first : '' };
        } catch (e) {
            return { ok: false, error: String((e as Error).message || e) };
        }
    },

    closePackage(id: string) {
        delete opened[id];
    },

    // -------------------------------------------------------------- export

    /** The Export Package checklist: the picked assets (folders expanded) and their dependencies. */
    async collectExport(uuids: string[]): Promise<any> {
        try {
            const list = await collectAssets(assetDb, Editor.Project.path, uuids || [], { deps: true });
            return { ok: true, rows: list.filter((a) => !a.container).map((a) => ({ uuid: a.uuid, path: a.rel, type: a.type || '', importer: a.importer || '', isDirectory: a.isDirectory, dependency: a.dependency })) };
        } catch (e) {
            return { ok: false, error: String((e as Error).message || e) };
        }
    },

    /** Writes the checked assets as a package folder or a .zip at `dest`. */
    async exportPackage(uuids: string[], roots: string[], dest: string, zip: boolean): Promise<any> {
        try {
            const list = await collectAssets(assetDb, Editor.Project.path, uuids || [], { deps: false, expandFolders: false });
            if (!list.some((a) => !a.container)) return { ok: false, error: 'Nothing to export.' };
            const tmp = tempDir('export', stampName(new Date()));
            writePackage(Editor.Project.path, list, tmp, projectSource(), roots || []);
            if (zip) {
                fs.writeFileSync(dest, zipFolder(tmp));
                fs.rmSync(tmp, { recursive: true, force: true });
            } else {
                if (fs.existsSync(dest) && fs.readdirSync(dest).length && !fs.existsSync(join(dest, MANIFEST_NAME))) return { ok: false, error: 'The folder is not empty: ' + dest };
                fs.mkdirSync(dest, { recursive: true });
                (fs as any).cpSync(tmp, dest, { recursive: true, force: true });
                fs.rmSync(tmp, { recursive: true, force: true });
            }
            require('electron').shell.showItemInFolder(zip ? dest : join(dest, MANIFEST_NAME));
            return { ok: true, path: dest, count: list.filter((a) => !a.container).length };
        } catch (e) {
            return { ok: false, error: String((e as Error).message || e) };
        }
    },

    /** Is this zip one of ours (asset-package.json inside)? Used to tell Cocos' own zips apart. */
    zipHasManifest(file: string): boolean {
        try {
            return zipList(fs.readFileSync(file)).some((n) => /(^|\/)asset-package\.json$/.test(n));
        } catch (e) {
            return false;
        }
    },

    // -------------------------------------------------------------- Extension menu

    importPackageMenu() {
        pendingMenu = 'import';
        Editor.Panel.open(PKG + '.project');
        Editor.Message.broadcast(PKG + ':package-menu');
    },

    exportPackageMenu() {
        pendingMenu = 'export';
        Editor.Panel.open(PKG + '.project');
        Editor.Message.broadcast(PKG + ':package-menu');
    },

    /** The Extension menu's pending request, taken once (by the first Project window that asks). */
    takePendingMenu(): string {
        const m = pendingMenu;
        pendingMenu = '';
        return m;
    },
};

export function load() {
    try {
        const { ipcMain } = require('electron');
        ipcListener = (event: any, payload: OsDragRequest) => {
            methods.startOsDrag(payload, event && event.sender);
        };
        ipcMain.on(OS_DRAG_CHANNEL, ipcListener);
    } catch (e) {
        console.warn('[Project Browser] No ipcMain: the drag out to the OS goes through editor messages.', e);
    }
}

export function unload() {
    try {
        if (ipcListener) require('electron').ipcMain.removeListener(OS_DRAG_CHANNEL, ipcListener);
    } catch (e) {
        // gone
    }
    ipcListener = null;
}
