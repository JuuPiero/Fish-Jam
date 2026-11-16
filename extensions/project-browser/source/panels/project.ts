/**
 * Project window (Unity's Project Browser): Favorites and folder tree on the
 * left, breadcrumb + thumbnail grid / list on the right, search with t: and
 * l: filters, labels, drag and drop with the rest of the editor.
 */
import { createApp, markRaw } from 'vue';
import { DragPayload, dragPayload, dropUuids } from '../shared/drag';
import { DragKind, dragKindOf, DropVerdict, moveVerdict, nodeDropUuids, pickDropEffect, popupPlacement, uniquePrefabUrl } from '../shared/drop';
import { allLabels, AssetEntry, displayName, LabelStore, parseQuery, pruneLabels, search, setLabel, sortAssets, tokenize, toggleToken, TYPE_FILTERS, typeLabel } from '../shared/search';
import {
    ASSETS_ROOT, breadcrumb, buildTrees, childrenOf, dbOf, folderLabel, inScope, INTERNAL_DB, isPackageUrl, isReadonlyUrl, mainUuid, PACKAGES_ROOT, parentUrl, renamedUrl, SearchScope, touchedUuid, TreeNode, validName,
} from '../shared/tree';
import { AssetsMenuKind, CreateMenuInfo, defaultNewName, isCreatable, isFolderEntry, menuHooks, withGroupSeparators } from '../shared/create-menu';
import { cleanFolderColors, FOLDER_COLORS, FolderColorStore, normalizeColor, pruneFolderColors, setFolderColors, sharedColor } from '../shared/folder-colors';
import { actionLabel, ImportAction, osDragFiles, osDragMode, rowsUnder, statusLabel, treeRows } from '../shared/package';
import { extIconFor, extIconSvg, hasIcon, iconSvg } from './icons';
import { STYLE } from './style';
import { TEMPLATE } from './template';
import { Thumb, ThumbService, thumbKind } from './thumbs';

const PKG = 'project-browser';
const UI_KEY = 'project-browser.ui';
const LIMIT = 5000;

interface Favorite {
    label: string;
    query: string;
    builtin?: boolean;
}

const BUILTIN_FAVORITES: Favorite[] = [
    { label: 'All Materials', query: 't:Material', builtin: true },
    { label: 'All Models', query: 't:Model', builtin: true },
    { label: 'All Prefabs', query: 't:Prefab', builtin: true },
    { label: 'All Scenes', query: 't:Scene', builtin: true },
    { label: 'All Scripts', query: 't:Script', builtin: true },
    { label: 'All Textures', query: 't:Texture', builtin: true },
];

interface UiState {
    leftWidth: number;
    zoom: number;
    folder: string;
    expanded: Record<string, boolean>;
    renderPreviews: boolean;
    /** The girl peeking from the right edge (on unless turned off). */
    mascot?: boolean;
    /** The girl peeking over the toolbar's bottom edge (on unless turned off). */
    peek?: boolean;
    /** Diagnostics: drops into the panel are only logged (see logDrop). */
    logDrag?: boolean;
}

/** Numbers the placeholders of new assets ("new:1", ...). */
let pendingSeq = 0;

/** The mouseup listener of a press that selects on release (removed when a drag starts). */
let pendingClickUp: ((e: MouseEvent) => void) | null = null;
function cancelClickSelect(): void {
    if (pendingClickUp) document.removeEventListener('mouseup', pendingClickUp, true);
    pendingClickUp = null;
}

/**
 * Loads an extension's assets menu methods file. Reloaded when the file changes
 * (an extension rebuilt while the editor runs), otherwise taken from require's cache.
 */
const hookModules: Record<string, { mtime: number; mod: any }> = {};
function loadHookModule(file: string): any {
    const fs = require('fs');
    let mtime = 0;
    try {
        mtime = fs.statSync(file).mtimeMs;
    } catch (e) {
        return null;
    }
    const cached = hookModules[file];
    if (cached && cached.mtime === mtime) return cached.mod;
    try {
        delete require.cache[require.resolve(file)];
    } catch (e) {
        // not loaded yet
    }
    const mod = require(file);
    hookModules[file] = { mtime, mod };
    return mod;
}

/** An item of an Electron menu template (submenus searched too) whose label matches. */
function findMenuItem(items: any[], match: (label: string) => boolean): any {
    for (let i = 0; i < (items || []).length; i++) {
        const it = items[i];
        if (!it) continue;
        if (it.label && match(i18n(String(it.label)))) return it;
        if (Array.isArray(it.submenu)) {
            const f = findMenuItem(it.submenu, match);
            if (f) return f;
        }
    }
    return null;
}

/** file:// URL of an image in static/ (the bundle runs from dist/panels); empty if it is missing. */
function mascotUrl(name = 'hiding.png'): string {
    try {
        const path = require('path');
        const file = path.join(__dirname, '..', '..', 'static', name);
        return require('fs').existsSync(file) ? require('url').pathToFileURL(file).href : '';
    } catch (e) {
        return '';
    }
}

function loadUi(): UiState {
    const def: UiState = { leftWidth: 220, zoom: 45, folder: ASSETS_ROOT, expanded: { [ASSETS_ROOT]: true, '#favorites': true }, renderPreviews: true };
    try {
        const raw = localStorage.getItem(UI_KEY);
        if (raw) return Object.assign(def, JSON.parse(raw));
    } catch (e) {
        // defaults
    }
    return def;
}

function request(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request(PKG, method, ...args) as Promise<any>;
}

/**
 * Saves a store in the project profile. Always a plain JSON copy: the editor's IPC clones its
 * arguments and throws on Vue's reactive proxies (labels, favorites and folder colours are reactive).
 */
async function saveStore(key: string, value: any): Promise<void> {
    try {
        await request('set-store', key, JSON.parse(JSON.stringify(value === undefined ? null : value)));
    } catch (e) {
        console.warn('[Project Browser] Could not save ' + key + ':', e);
    }
}

/** ipcRenderer channel of the drag out to the OS (main answers with webContents.startDrag on the sender). */
const OS_DRAG_CHANNEL = 'project-browser:start-os-drag';

/**
 * Asks the main process to start a native file drag. Over ipcRenderer the main
 * process gets this window's webContents as the sender; without it (no Node
 * integration) an editor message, and main uses the focused webContents.
 */
function sendOsDrag(payload: any): void {
    const plain = JSON.parse(JSON.stringify(payload));
    try {
        const ipc = require('electron').ipcRenderer;
        if (ipc && typeof ipc.send === 'function') {
            ipc.send(OS_DRAG_CHANNEL, plain);
            return;
        }
    } catch (e) {
        // no electron module here
    }
    try {
        Editor.Message.send(PKG, 'start-os-drag', plain);
    } catch (e) {
        console.warn('[Project Browser] Could not start the drag:', e);
    }
}

/** The main assets of a list (a sub-asset counts as its main asset), each once. */
function mainUuids(list: AssetEntry[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
        const u = list[i].parent || list[i].uuid;
        if (out.indexOf(u) < 0) out.push(u);
    }
    return out;
}

/** Was the key event typed into a text field (input, textarea, select, contenteditable)? */
function inTextField(t: any): boolean {
    if (!t) return false;
    const tag = String(t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'UI-INPUT' || tag === 'UI-TEXTAREA' || tag === 'UI-NUM-INPUT') return true;
    return !!t.isContentEditable;
}

function db(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request('asset-db', method as any, ...args) as Promise<any>;
}

function i18n(label: string): string {
    if (label && label.indexOf('i18n:') === 0) {
        try {
            const t = Editor.I18n.t(label.slice(5) as any);
            if (t) return t;
        } catch (e) {
            // untranslated
        }
        return label.slice(label.lastIndexOf('.') + 1);
    }
    return label;
}

async function confirm(message: string, ok: string): Promise<boolean> {
    try {
        const r: any = await Editor.Dialog.warn(message, { buttons: [ok, 'Cancel'], default: 0, cancel: 1, title: 'Project' } as any);
        return r && r.response === 0;
    } catch (e) {
        return false;
    }
}

/** asset-db AssetInfo -> AssetEntry (sub-assets as a list). */
function toEntry(info: any, parent?: string): AssetEntry {
    const e: AssetEntry = {
        uuid: info.uuid,
        url: info.url,
        name: info.name || '',
        displayName: info.displayName || '',
        type: info.type || '',
        importer: info.importer || '',
        isDirectory: !!info.isDirectory,
        readonly: !!info.readonly,
        visible: info.visible !== false,
        extends: Array.isArray(info.extends) ? info.extends : undefined,
        file: info.file || '',
    };
    if (parent) e.parent = parent;
    if (info.subAssets && typeof info.subAssets === 'object') {
        const subs: AssetEntry[] = [];
        Object.keys(info.subAssets).forEach((k) => {
            const s = info.subAssets[k];
            if (!s || s.visible === false) return;
            const se = toEntry(s, info.uuid);
            if (!se.url) se.url = info.url + '/' + (s.name || k);
            subs.push(se);
        });
        if (subs.length) e.subAssets = sortAssets(subs);
    }
    return e;
}

interface VisibleItem {
    key: string;
    a: AssetEntry;
    x: number;
    y: number;
}

function createProjectApp(el: HTMLElement) {
    let thumbs: ThumbService | null = null;
    let refreshTimer: any = null;
    let searchTimer: any = null;
    let resize: ResizeObserver | null = null;
    /** Editor selection broadcasts come in bursts (clear + select): read the result once. */
    let syncTimer: any = null;
    /** The selection this window last sent (to tell it from selections made elsewhere). */
    let ownSelection = '';
    /** Tree folder a drag hovers, opened after a moment (Unity's spring-loaded folders). */
    let expandKey = '';
    let expandTimer: any = null;
    let pingTimer: any = null;
    /** Button of the open dropdown. */
    let menuAnchor: HTMLElement | null = null;
    const cancelExpand = () => {
        if (expandTimer) clearTimeout(expandTimer);
        expandTimer = null;
        expandKey = '';
    };
    /** Removes the document-level drag listeners (set up in mounted). */
    let unlistenDoc: (() => void) | null = null;
    /** Last pointer position over the items (null: outside), and the "peek back" timer. */
    let mascotPos: { x: number; y: number } | null = null;
    let mascotTimer: any = null;
    let resizeFrame = 0;
    let noticeTimer: any = null;
    /** Window listeners of the Alt hint (set up in mounted). */
    let unlistenMods: (() => void) | null = null;
    const app = createApp({
        template: TEMPLATE,
        data() {
            return {
                assets: [] as AssetEntry[],
                byUuid: {} as Record<string, AssetEntry>,
                /** Folder urls that hold at least one asset (empty-folder icon otherwise). */
                nonEmpty: {} as Record<string, boolean>,
                trees: { assets: null as TreeNode | null, packages: null as TreeNode | null },
                ui: loadUi(),
                folder: ASSETS_ROOT,
                query: '',
                appliedQuery: '',
                scope: 'assets' as SearchScope,
                selection: [] as string[],
                anchor: -1,
                openSubs: {} as Record<string, boolean>,
                labelStore: {} as LabelStore,
                favorites: [] as Favorite[],
                activeFavorite: '',
                menu: '',
                renaming: '',
                renameText: '',
                dropTarget: '',
                /** Asset flashing after a ping (Inspector reference clicked, prefab created). */
                pingUuid: '',
                thumbVersion: 0,
                thumbMap: {} as Record<string, Thumb>,
                iconMap: {} as Record<string, any>,
                view: { width: 600, height: 400, scrollTop: 0 },
                packagesRoot: PACKAGES_ROOT,
                limit: LIMIT,
                internalDrag: null as AssetEntry[] | null,
                mascotSrc: mascotUrl('hiding.png'),
                /** Measured room the grid mascot takes at the left of the items (see gridInset). */
                mascotInset: 0,
                /** A new asset waiting for its name: { entry, item, dir, ext, label } (see startCreate). */
                pendingCreate: null as any,
                /** Folder uuid -> icon tint (project profile, see folder-colors.ts). */
                folderColors: {} as FolderColorStore,
                /** The Custom... colour box: { uuids, value, x, y } while open. */
                colorPick: null as null | { uuids: string[]; value: string; x: number; y: number },
                peekSrc: mascotUrl('undertable.png'),
                /** She ducks behind the edge while the pointer is near her. */
                mascotShy: false,
                /** Alt / Shift held (the status bar shows what an Alt drag does). */
                mods: { alt: false, shift: false },
                /** A short message in the status bar (copied, imported...). */
                notice: '',
                /** Import Asset Package dialog: { info, mode, folderUrl, rows, decisions, busy, error } while open. */
                importDlg: null as any,
                /** Export Package dialog: { rows, checked, includeDeps, roots, busy, error } while open. */
                exportDlg: null as any,
            };
        },
        computed: {
            typeNames(): string[] {
                return TYPE_FILTERS.map((t) => t.name);
            },
            labels(this: any): string[] {
                return allLabels(this.labelStore);
            },
            searching(this: any): boolean {
                return !!this.appliedQuery.trim();
            },
            listMode(this: any): boolean {
                return this.ui.zoom < 8;
            },
            readonlyFolder(this: any): boolean {
                return isReadonlyUrl(this.folder);
            },
            folderName(this: any): string {
                const c = breadcrumb(this.folder);
                return c.length ? c[c.length - 1].label : '';
            },
            crumbs(this: any) {
                return breadcrumb(this.folder);
            },
            /** Main entries of the view: the folder's content or the search results. */
            baseItems(this: any): AssetEntry[] {
                if (this.searching) {
                    const q = parseQuery(this.appliedQuery);
                    const scoped = this.assets.filter((a: AssetEntry) => inScope(a.url, this.scope, this.folder));
                    return search(scoped, q, (u: string) => this.labelStore[u] || [], LIMIT);
                }
                return sortAssets(childrenOf(this.assets, this.folder, this.trees.packages || undefined));
            },
            /** With the sub-assets of the expanded items after them. */
            items(this: any): AssetEntry[] {
                const out: AssetEntry[] = [];
                const base: AssetEntry[] = this.baseItems;
                // a new asset being named (see startCreate) shows first in its folder
                const pend = this.pendingCreate;
                if (pend && !this.searching && pend.dir === this.folder) out.push(pend.entry);
                for (let i = 0; i < base.length; i++) {
                    const a = base[i];
                    out.push(a);
                    if (a.subAssets && this.openSubs[a.uuid]) for (let k = 0; k < a.subAssets.length; k++) out.push(a.subAssets[k]);
                }
                return out;
            },
            /** Room kept free at the left of the items for the grid mascot (0 when she is hidden). */
            gridInset(this: any): number {
                return this.ui.mascot !== false && this.mascotSrc && this.view.width > 240 ? this.mascotInset : 0;
            },
            layout(this: any) {
                const n = this.items.length;
                if (this.listMode) return { list: true, size: 16, cellW: 0, cellH: 20, cols: 1, height: n * 20 };
                const size = Math.round(36 + (this.ui.zoom / 100) * 110);
                const cellW = size + 18;
                const cellH = size + 40;
                const cols = Math.max(1, Math.floor((this.view.width - 8 - this.gridInset) / cellW));
                return { list: false, size, cellW, cellH, cols, height: Math.ceil(n / cols) * cellH + 8 };
            },
            visible(this: any): VisibleItem[] {
                const L = this.layout;
                const items: AssetEntry[] = this.items;
                const top = this.view.scrollTop;
                const bottom = top + this.view.height;
                const out: VisibleItem[] = [];
                if (L.list) {
                    const first = Math.max(0, Math.floor(top / 20) - 5);
                    const last = Math.min(items.length, Math.ceil(bottom / 20) + 5);
                    for (let i = first; i < last; i++) out.push({ key: items[i].uuid, a: items[i], x: 0, y: i * 20 });
                } else {
                    const firstRow = Math.max(0, Math.floor(top / L.cellH) - 2);
                    const lastRow = Math.ceil(bottom / L.cellH) + 2;
                    for (let r = firstRow; r <= lastRow; r++) {
                        for (let c = 0; c < L.cols; c++) {
                            const i = r * L.cols + c;
                            if (i >= items.length) break;
                            out.push({ key: items[i].uuid, a: items[i], x: 4 + this.gridInset + c * L.cellW, y: 4 + r * L.cellH });
                        }
                    }
                }
                return out;
            },
            treeRows(this: any) {
                const rows: any[] = [];
                const exp = this.ui.expanded;
                rows.push({ key: '#favorites', label: 'Favorites', depth: 0, head: true, hasChildren: true, open: !!exp['#favorites'], icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="#C9A33A" d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>', kind: 'header' });
                if (exp['#favorites']) {
                    const favs: Favorite[] = BUILTIN_FAVORITES.concat(this.favorites);
                    for (let i = 0; i < favs.length; i++) {
                        const f = favs[i];
                        rows.push({ key: 'fav:' + f.label, label: f.label, depth: 1, fav: f, sel: this.activeFavorite === f.label && this.searching, icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="2"><circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/></svg>', kind: 'favorite' });
                    }
                }
                const walk = (n: TreeNode, depth: number) => {
                    const open = !!exp[n.url];
                    const hasChildren = n.children.length > 0;
                    let icon: string;
                    if (depth === 1 && n.kind === 'internal') icon = iconSvg('PackageLocked');
                    else if (depth === 1 && n.kind === 'package') icon = iconSvg('Package');
                    else if (open && hasChildren) icon = iconSvg('FolderOpen');
                    else icon = iconSvg(n.kind === 'root' || this.nonEmpty[n.url] ? 'Folder' : 'FolderEmpty');
                    const fu = this.uuidByUrl[n.url];
                    rows.push({
                        key: n.url, url: n.url, label: n.name, depth, node: n, readonly: n.readonly, hasChildren, open,
                        sel: !this.searching && this.folder === n.url, head: depth === 0, icon, kind: 'folder',
                        color: (fu && this.folderColors[fu]) || '',
                    });
                    if (open) for (let i = 0; i < n.children.length; i++) walk(n.children[i], depth + 1);
                };
                if (this.trees.assets) walk(this.trees.assets, 0);
                if (this.trees.packages) walk(this.trees.packages, 0);
                return rows;
            },
            /** Folder url -> uuid (the tree knows folders by url; colours are kept by uuid). */
            uuidByUrl(this: any): Record<string, string> {
                const map: Record<string, string> = {};
                const list: AssetEntry[] = this.assets;
                for (let i = 0; i < list.length; i++) if (list[i].isDirectory) map[list[i].url] = list[i].uuid;
                return map;
            },
            selectedEntries(this: any): AssetEntry[] {
                return this.selection.map((u: string) => this.byUuid[u]).filter((a: any) => !!a);
            },
            /** Drag payload of the selection, computed once per selection change. */
            selectionDrag(this: any): DragPayload & { json: string } {
                const p = dragPayload(this.selectedEntries);
                return Object.assign(p, { json: JSON.stringify(p.additional) });
            },
            selectionReadonly(this: any): boolean {
                return this.selectedEntries.some((a: AssetEntry) => isReadonlyUrl(a.url));
            },
            statusPath(this: any): string {
                const s: AssetEntry[] = this.selectedEntries;
                if (s.length === 1) return s[0].url;
                if (s.length > 1) return s.length + ' assets selected';
                return this.searching ? this.items.length + ' results' : this.folder === PACKAGES_ROOT ? 'Packages' : this.folder;
            },
            /** Status bar text: a notice, the Alt drag hint while Alt is held, else the path. */
            statusText(this: any): string {
                if (this.notice) return this.notice;
                if (this.mods.alt) {
                    return this.mods.shift
                        ? 'Alt+Shift drag: a package (files, dependencies, .meta) to drop on another Cocos project\'s Project window'
                        : 'Alt drag: the files themselves, to Explorer, a browser upload, a chat... (add Shift: a package for another Cocos project)';
                }
                return this.statusPath;
            },
            /** Rows of the import dialog: tree order, with labels and check state. */
            importRows(this: any): any[] {
                const d = this.importDlg;
                if (!d) return [];
                const rows = treeRows(d.rows as any[]);
                return rows.map((r: any) => {
                    const action: ImportAction = r.isDirectory ? 'import' : d.decisions[r.path] || r.action;
                    let checked: boolean | null = action !== 'skip';
                    if (r.isDirectory) {
                        const under = rowsUnder(rows, r.target).filter((x: any) => !x.isDirectory);
                        const on = under.filter((x: any) => (d.decisions[x.path] || x.action) !== 'skip').length;
                        checked = on === 0 ? false : on === under.length ? true : null;
                    }
                    return Object.assign({}, r, {
                        checked,
                        actionNow: action,
                        statusText: statusLabel(r.status),
                        choices: r.isDirectory ? [] : (r.actions as ImportAction[]).map((a) => ({ value: a, label: actionLabel(a, r.status) })),
                        conflict: r.status === 'changed' || r.status === 'moved' || r.status === 'taken',
                    });
                });
            },
            importSummary(this: any): string {
                const d = this.importDlg;
                if (!d) return '';
                const files = (d.rows as any[]).filter((r) => !r.isDirectory && r.target);
                const on = files.filter((r) => (d.decisions[r.path] || r.action) !== 'skip').length;
                const conflicts = files.filter((r) => r.status === 'changed' || r.status === 'moved' || r.status === 'taken').length;
                const same = files.filter((r) => r.status === 'identical').length;
                return on + ' of ' + files.length + ' to import' + (conflicts ? ', ' + conflicts + ' conflict' + (conflicts > 1 ? 's' : '') : '') + (same ? ', ' + same + ' identical' : '');
            },
            exportCount(this: any): number {
                const d = this.exportDlg;
                return d ? (d.rows as any[]).filter((r) => d.checked[r.uuid]).length : 0;
            },
            selectedLabels(this: any): string[] {
                const s: AssetEntry[] = this.selectedEntries;
                if (s.length !== 1) return [];
                return this.labelStore[s[0].parent || s[0].uuid] || [];
            },
        },
        watch: {
            visible(this: any) {
                this.requestThumbs();
            },
            /** Esc while naming a new asset cancels it (commitRename takes the placeholder before this runs). */
            renaming(this: any, now: string) {
                if (!now && this.pendingCreate) this.pendingCreate = null;
            },
        },
        methods: {
            // -------------------------------------------------------------- data
            async reload(this: any) {
                let list: any[] = [];
                try {
                    list = (await db('query-assets')) || [];
                } catch (e) {
                    list = [];
                }
                const assets: AssetEntry[] = [];
                const byUuid: Record<string, AssetEntry> = {};
                const nonEmpty: Record<string, boolean> = {};
                for (let i = 0; i < list.length; i++) {
                    const info = list[i];
                    if (!info || !info.url || /\.meta$/.test(info.url) || info.visible === false) continue;
                    const e = toEntry(info);
                    assets.push(e);
                    byUuid[e.uuid] = e;
                    nonEmpty[parentUrl(e.url)] = true;
                    if (e.subAssets) for (let k = 0; k < e.subAssets.length; k++) byUuid[e.subAssets[k].uuid] = e.subAssets[k];
                }
                // thousands of entries: keep them out of Vue's deep reactivity (they are replaced, not mutated)
                this.assets = markRaw(assets);
                this.byUuid = markRaw(byUuid);
                this.nonEmpty = markRaw(nonEmpty);
                this.trees = markRaw(buildTrees(assets));
                if (this.folder !== PACKAGES_ROOT && this.folder !== ASSETS_ROOT && !assets.some((a: AssetEntry) => a.url === this.folder || a.url.indexOf(this.folder + '/') === 0)) {
                    // the folder is gone, or is an empty database root
                    if (!/^db:\/\/[^/]+$/.test(this.folder)) this.folder = ASSETS_ROOT;
                }
                this.selection = this.selection.filter((u: string) => !!byUuid[u]);
            },
            /** asset-db broadcast: drop the asset's thumbnail and reload the index (debounced). */
            assetChanged(this: any, uuid?: string) {
                if (typeof uuid === 'string' && uuid) {
                    // the asset and its sub-assets (an image's texture and sprite frame)
                    Object.keys(this.thumbMap).forEach((k) => {
                        if (k === uuid || k.indexOf(uuid + '@') === 0) delete this.thumbMap[k];
                    });
                    if (thumbs) thumbs.invalidate(uuid);
                    this.thumbVersion++;
                }
                this.scheduleReload();
            },
            scheduleReload(this: any) {
                if (refreshTimer) clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => this.reload(), 250);
            },
            async loadStores(this: any) {
                const labels = await request('get-store', 'labels');
                this.labelStore = labels && typeof labels === 'object' ? labels : {};
                const favs = await request('get-store', 'favorites');
                this.favorites = Array.isArray(favs) ? favs.filter((f: any) => f && f.label && f.query) : [];
                this.folderColors = cleanFolderColors(await request('get-store', 'folderColors'));
                try {
                    this.iconMap = (await db('query-icon-config-map')) || {};
                } catch (e) {
                    this.iconMap = {};
                }
            },
            saveUi(this: any) {
                try {
                    localStorage.setItem(UI_KEY, JSON.stringify(Object.assign({}, this.ui, { folder: this.folder })));
                } catch (e) {
                    // not persisted
                }
            },
            async saveLabels(this: any, store: LabelStore) {
                this.labelStore = pruneLabels(store, (u: string) => !!this.byUuid[u]);
                await saveStore('labels', this.labelStore);
            },

            // -------------------------------------------------------------- view
            measure(this: any) {
                const box = this.$refs.items as HTMLElement | undefined;
                if (!box) return;
                this.view.width = box.clientWidth;
                this.view.height = box.clientHeight;
                this.view.scrollTop = box.scrollTop;
                this.mascotInset = this.measureMascot(box);
                if (this.menu) this.placeMenu();
            },
            /**
             * Width of the grid mascot's visible part (right of the tree border), plus a small gap.
             * Her size follows the grid height, so this is measured again on every resize.
             */
            measureMascot(this: any, box: HTMLElement): number {
                const img = this.$refs.mascot as HTMLImageElement | undefined;
                let w = img ? img.offsetWidth : 0; // layout width: the duck transform doesn't change it
                if (!w) {
                    // not loaded yet: the CSS default (200 px tall, at most 60% of the grid; picture 426 x 1192)
                    const h = (box.parentElement && box.parentElement.clientHeight) || box.clientHeight;
                    w = (Math.min(200, 0.6 * h) * 426) / 1192;
                }
                // 9.2% of her width lies past the wall (the fingers over the tree); the wall sits --mascot-wall px
                // left of the grid, so she covers 0.908 w - wall of the grid; keep 6 px clear after her
                let wall = 4;
                try {
                    const v = parseFloat(getComputedStyle(box.parentElement || box).getPropertyValue('--mascot-wall'));
                    if (isFinite(v)) wall = v;
                } catch (e) {
                    // default
                }
                return Math.max(0, Math.ceil(w * (1 - 0.092) - wall)) + 6;
            },
            onScroll(this: any) {
                const box = this.$refs.items as HTMLElement;
                if (box) this.view.scrollTop = box.scrollTop;
            },
            setZoom(this: any, v: number) {
                this.ui.zoom = v;
                this.saveUi();
            },
            /** One wheel notch = 5 steps of the size slider (up: bigger). */
            zoomWheel(this: any, e: WheelEvent) {
                const dir = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
                if (!dir) return;
                const v = Math.max(0, Math.min(100, Math.round(this.ui.zoom + dir * 5)));
                if (v !== this.ui.zoom) this.setZoom(v);
            },
            /** Ctrl + wheel over the items zooms (Unity's Project window); the plain wheel keeps scrolling. */
            gridWheel(this: any, e: WheelEvent) {
                if (!(e.ctrlKey || e.metaKey)) return;
                e.preventDefault();
                this.zoomWheel(e);
            },
            startSplit(this: any, e: MouseEvent) {
                const x0 = e.clientX;
                const w0 = this.ui.leftWidth;
                const move = (ev: MouseEvent) => {
                    this.ui.leftWidth = Math.max(120, Math.min(600, w0 + ev.clientX - x0));
                };
                const up = () => {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                    this.saveUi();
                    this.$nextTick(() => this.measure());
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            },
            nameOf(a: AssetEntry): string {
                return displayName(a);
            },
            typeOf(a: AssetEntry): string {
                return a.uuid.indexOf('pkg:') === 0 ? 'Package' : typeLabel(a);
            },
            folderOf(a: AssetEntry): string {
                return folderLabel(a.parent && this.byUuid[a.parent] ? this.byUuid[a.parent].url + '/x' : a.url);
            },
            iconFor(this: any, a: AssetEntry): string {
                if (a.uuid.indexOf('pkg:') === 0) return iconSvg(dbOf(a.url) === INTERNAL_DB ? 'PackageLocked' : 'Package');
                if (a.isDirectory) return iconSvg(this.nonEmpty[a.url] ? 'Folder' : 'FolderEmpty');
                const kind = typeLabel(a);
                const ext = extIconFor(a, hasIcon(kind));
                if (ext !== null) return extIconSvg(ext); // .cs, files Cocos doesn't know, .md/.csv...
                return iconSvg(kind, a.importer === 'javascript' ? 'js' : undefined);
            },
            /**
             * What the cell shows, like Unity: a rendered thumbnail (image, material,
             * model...), else our drawn icon for known kinds, else Cocos' own icon for
             * the importer, else (empty result) the plain page icon from iconFor.
             */
            thumbOf(this: any, a: AssetEntry): Thumb {
                void this.thumbVersion;
                const t: Thumb | undefined = this.thumbMap[a.uuid];
                if (t && t.src) return t;
                if (a.isDirectory || a.uuid.indexOf('pkg:') === 0 || hasIcon(typeLabel(a))) return {};
                // our extension badge (iconFor) instead of Cocos' importer icon, which is blank for unknown files
                if (extIconFor(a, false) !== null) return {};
                if (t && t.icon) return t;
                const cfg = this.iconMap[a.importer] || this.iconMap[a.type];
                if (cfg && cfg.type === 'icon' && cfg.value) return { icon: String(cfg.value) };
                return {};
            },
            requestThumbs(this: any) {
                if (!thumbs) return;
                const vis: VisibleItem[] = this.visible;
                for (let i = vis.length - 1; i >= 0; i--) thumbs.request(vis[i].a, true);
            },
            hasSubs(a: AssetEntry): boolean {
                return !a.parent && !!a.subAssets && a.subAssets.length > 0;
            },
            subsOpen(this: any, a: AssetEntry): boolean {
                return !!this.openSubs[a.uuid];
            },
            toggleSubs(this: any, a: AssetEntry) {
                this.openSubs = Object.assign({}, this.openSubs, { [a.uuid]: !this.openSubs[a.uuid] });
            },

            // -------------------------------------------------------------- navigation and search
            navigate(this: any, url: string) {
                this.folder = url;
                this.appliedQuery = '';
                this.query = '';
                this.activeFavorite = '';
                this.renaming = '';
                const box = this.$refs.items as HTMLElement;
                if (box) box.scrollTop = 0;
                this.view.scrollTop = 0;
                // open the tree down to it
                const exp = Object.assign({}, this.ui.expanded);
                let u = url;
                for (let guard = 0; guard < 64 && /^db:\/\/[^/]+\//.test(u); guard++) {
                    u = parentUrl(u);
                    exp[u] = true;
                }
                if (isPackageUrl(url)) exp[PACKAGES_ROOT] = true;
                this.ui.expanded = exp;
                this.saveUi();
            },
            setQuery(this: any, text: string) {
                this.query = text;
                this.activeFavorite = '';
                if (searchTimer) clearTimeout(searchTimer);
                searchTimer = setTimeout(() => this.applyQuery(), 150);
            },
            applyQuery(this: any) {
                const wasSearching = this.searching;
                this.appliedQuery = this.query;
                // starting a search: packages are searched only from a package folder (or In Packages)
                if (!wasSearching && this.searching) this.scope = isPackageUrl(this.folder) ? 'folder' : 'assets';
                const box = this.$refs.items as HTMLElement;
                if (box) box.scrollTop = 0;
                this.view.scrollTop = 0;
            },
            setScope(this: any, s: SearchScope) {
                this.scope = s;
            },
            hasToken(this: any, prefix: string, v: string): boolean {
                return tokenize(this.query).some((t) => t.toLowerCase() === (prefix + v).toLowerCase());
            },
            toggleType(this: any, t: string) {
                this.query = toggleToken(this.query, 't:', t);
                this.applyQuery();
            },
            toggleLabel(this: any, l: string) {
                this.query = toggleToken(this.query, 'l:', l);
                this.applyQuery();
            },
            async saveSearch(this: any) {
                const q = this.query.trim();
                if (!q) return;
                const label = q.length > 28 ? q.slice(0, 26) + '…' : q;
                if (this.favorites.some((f: Favorite) => f.query === q)) return;
                this.favorites = this.favorites.concat([{ label, query: q }]);
                this.ui.expanded = Object.assign({}, this.ui.expanded, { '#favorites': true });
                await saveStore('favorites', this.favorites);
            },
            toggleMenu(this: any, name: string, e?: Event) {
                this.menu = this.menu === name ? '' : name;
                menuAnchor = this.menu && e && e.currentTarget ? (e.currentTarget as HTMLElement) : this.menu ? menuAnchor : null;
                if (!this.menu) return;
                this.$nextTick(() => {
                    this.placeMenu();
                    if (this.menu === 'labels' && this.$refs.newLabel) (this.$refs.newLabel as HTMLElement).focus();
                });
            },
            /**
             * Fits the open dropdown into the visible part of the panel: below its
             * button, or above it when there is more room there; the list scrolls
             * inside the height it gets, so the last entries are never cut off.
             */
            placeMenu(this: any) {
                const el = this.$refs.menuEl as HTMLElement | undefined;
                const anchor = menuAnchor;
                const root = this.$el as HTMLElement;
                if (!el || !anchor || !anchor.isConnected || !root || !root.getBoundingClientRect) return;
                const box = el.parentElement as HTMLElement; // the .pb-drop the menu is positioned in
                if (!box) return;
                const area = root.getBoundingClientRect();
                const r = anchor.getBoundingClientRect();
                const b = box.getBoundingClientRect();
                const margin = 4;
                const bottomEdge = Math.min(area.bottom, window.innerHeight || area.bottom);
                const topEdge = Math.max(area.top, 0);
                el.style.maxHeight = 'none';
                const content = el.scrollHeight + 2;
                const p = popupPlacement(bottomEdge - r.bottom - margin, r.top - topEdge - margin, content);
                el.style.maxHeight = p.maxHeight + 'px';
                if (p.up) {
                    el.style.top = 'auto';
                    el.style.bottom = Math.round(b.bottom - r.top + 2) + 'px';
                } else {
                    el.style.bottom = 'auto';
                    el.style.top = Math.round(r.bottom - b.top + 2) + 'px';
                }
                // right-aligned under the button; flip to left-aligned when that would leave the panel
                el.style.left = '';
                el.style.right = '0px';
                const m = el.getBoundingClientRect();
                if (m.left < area.left + margin) {
                    el.style.right = 'auto';
                    el.style.left = Math.round(area.left + margin - b.left) + 'px';
                }
            },
            closeMenus(this: any, e: MouseEvent) {
                const t = e.target as HTMLElement;
                if (this.menu && !(t.closest && t.closest('.pb-drop'))) this.menu = '';
            },

            // -------------------------------------------------------------- tree
            toggleNode(this: any, r: any) {
                if (!r.hasChildren) return;
                this.ui.expanded = Object.assign({}, this.ui.expanded, { [r.key]: !this.ui.expanded[r.key] });
                this.saveUi();
            },
            treeClick(this: any, r: any) {
                if (r.kind === 'header') return this.toggleNode(r);
                if (r.kind === 'favorite') {
                    this.query = r.fav.query;
                    this.appliedQuery = r.fav.query;
                    this.scope = 'assets';
                    this.activeFavorite = r.fav.label;
                    return;
                }
                this.navigate(r.url);
            },
            treeMenu(this: any, r: any, e: MouseEvent) {
                if (r.kind === 'favorite') {
                    if (r.fav.builtin) return;
                    Editor.Menu.popup({
                        x: e.clientX,
                        y: e.clientY,
                        menu: [{ label: 'Remove from Favorites', click: () => this.removeFavorite(r.fav) }],
                    } as any);
                    return;
                }
                if (r.kind !== 'folder') return;
                this.navigate(r.url);
                this.gridMenu(null, e);
            },
            async removeFavorite(this: any, f: Favorite) {
                this.favorites = this.favorites.filter((x: Favorite) => x !== f);
                await saveStore('favorites', this.favorites);
            },

            // -------------------------------------------------------------- selection
            isSel(this: any, a: AssetEntry): boolean {
                return this.selection.indexOf(a.uuid) >= 0;
            },
            itemDown(this: any, v: VisibleItem, e: MouseEvent) {
                const el = this.$el as HTMLElement;
                if (el && el.focus) el.focus();
                this.trackMods(e);
                // Alt+Shift press: start packing now, so the package drag that may follow starts sooner
                if (e.button === 0 && e.altKey && e.shiftKey && v.a.uuid.indexOf('pkg:') !== 0) {
                    const list: AssetEntry[] = this.isSel(v.a) ? this.selectedEntries : [v.a];
                    try {
                        Editor.Message.send(PKG, 'prepare-os-drag', mainUuids(list));
                    } catch (err) {
                        // built at drag start instead
                    }
                }
                if (e.button !== 0 && this.isSel(v.a)) return;
                const items: AssetEntry[] = this.items;
                const idx = items.indexOf(v.a);
                // with Alt held a press is the start of a drag out (or a plain click): no range / toggle
                if (e.shiftKey && !e.altKey && this.anchor >= 0) {
                    const a = Math.min(this.anchor, idx);
                    const b = Math.max(this.anchor, idx);
                    this.setSelection(items.slice(a, b + 1).map((x) => x.uuid));
                } else if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const sel = this.selection.slice();
                    const at = sel.indexOf(v.a.uuid);
                    if (at >= 0) sel.splice(at, 1);
                    else sel.push(v.a.uuid);
                    this.anchor = idx;
                    this.setSelection(sel);
                } else if (this.isSel(v.a) && this.selection.length === 1) {
                    this.anchor = idx;
                } else {
                    // Like Unity: a plain press selects on release, and only if no drag started. Dragging an
                    // item out (to an Inspector field, the Scene...) leaves the selection alone, so the
                    // Inspector keeps showing what it showed. A press on one of several selected items
                    // keeps them all for the drag; a click without drag selects it alone.
                    this.anchor = idx;
                    this.armClickSelect(v.a.uuid);
                }
            },
            /** Selects `uuid` on the next mouseup unless a drag starts first (see itemDown / dragStart). */
            armClickSelect(this: any, uuid: string) {
                cancelClickSelect();
                const up = () => {
                    cancelClickSelect();
                    if (!this.internalDrag) this.setSelection([uuid]);
                };
                document.addEventListener('mouseup', up, true);
                pendingClickUp = up;
            },
            clickEmpty(this: any, e: MouseEvent) {
                if (e.button !== 0) return;
                const el = this.$el as HTMLElement;
                if (el && el.focus) el.focus();
                if (!e.ctrlKey && !e.shiftKey) this.setSelection([]);
            },
            setSelection(this: any, uuids: string[]) {
                // A plain array of strings. `this.selection` reads back as a Vue proxy, and a
                // proxy cannot cross the editor's IPC ("An object could not be cloned"): the
                // Inspector never heard of the selection before.
                const list: string[] = [];
                for (let i = 0; i < uuids.length; i++) {
                    const u = uuids[i];
                    if (typeof u === 'string' && u && u.indexOf('pkg:') !== 0 && u.indexOf('new:') !== 0 && list.indexOf(u) < 0) list.push(String(u));
                }
                this.selection = list;
                ownSelection = list.join('|');
                try {
                    Editor.Selection.clear('asset');
                    if (list.length) Editor.Selection.select('asset', list.slice());
                } catch (e) {
                    console.warn('[Project Browser] Could not select in the editor:', e);
                }
            },
            /** Editor selection broadcast: read the result once the burst (clear + select) is over. */
            scheduleSync(this: any) {
                if (syncTimer) clearTimeout(syncTimer);
                syncTimer = setTimeout(() => {
                    syncTimer = null;
                    this.syncSelection();
                }, 30);
            },
            /** Editor selection changed (here, in the Assets panel, from the Inspector...). */
            syncSelection(this: any) {
                let sel: string[] = [];
                try {
                    sel = (Editor.Selection.getSelected('asset') || []).filter((u: string) => !!this.byUuid[u]);
                } catch (e) {
                    return;
                }
                const key = sel.join('|');
                if (key === this.selection.join('|')) return;
                this.selection = sel;
                // selected elsewhere: bring it into view when it is in this folder
                if (key !== ownSelection && sel.length) {
                    const idx = this.items.indexOf(this.byUuid[sel[sel.length - 1]]);
                    if (idx >= 0) this.$nextTick(() => this.scrollTo(idx));
                }
            },

            // -------------------------------------------------------------- ping
            /**
             * Unity's ping: show an asset without selecting it. Opens its folder
             * (leaving a search that would hide it), scrolls to it and flashes it.
             * Sub-assets ping their main asset; uuids that are not assets (nodes,
             * components) are ignored.
             */
            async ping(this: any, uuid: string) {
                if (!uuid) return;
                const id = mainUuid(uuid);
                let a: AssetEntry | undefined = this.byUuid[id];
                if (!a) {
                    // maybe just created: the index reloads after asset-db's broadcast
                    let info: any = null;
                    try {
                        info = await db('query-asset-info', id);
                    } catch (e) {
                        info = null;
                    }
                    if (!info || !info.url) return;
                    await this.reload();
                    a = this.byUuid[id];
                    if (!a) return;
                }
                const folder = parentUrl(a.url);
                if (folder === a.url) {
                    // a database root: open it
                    this.navigate(a.url);
                    return;
                }
                if (this.searching || this.folder !== folder) this.navigate(folder);
                await this.$nextTick();
                const idx = this.items.indexOf(a);
                if (idx >= 0) this.scrollTo(idx, true);
                this.flash(a.uuid);
            },
            flash(this: any, uuid: string) {
                if (pingTimer) clearTimeout(pingTimer);
                this.pingUuid = '';
                this.$nextTick(() => {
                    this.pingUuid = uuid;
                    pingTimer = setTimeout(() => {
                        pingTimer = null;
                        this.pingUuid = '';
                    }, 1300);
                });
            },

            // -------------------------------------------------------------- open, rename, delete...
            async open(this: any, a: AssetEntry) {
                if (a.uuid.indexOf('pkg:') === 0 || a.isDirectory) return this.navigate(a.url);
                if (this.hasSubs(a) && !this.openSubs[a.uuid] && (a.importer === 'fbx' || a.importer === 'gltf')) return this.toggleSubs(a);
                try {
                    await db('open-asset', a.uuid);
                } catch (e) {
                    console.warn('[Project Browser] Could not open ' + a.url, e);
                }
            },
            startRename(this: any, a?: AssetEntry) {
                const t = a || this.selectedEntries[0];
                if (!t || t.parent || t.uuid.indexOf('pkg:') === 0 || isReadonlyUrl(t.url) || t.readonly || /^db:\/\/[^/]+$/.test(t.url)) return;
                this.renaming = t.uuid;
                this.renameText = displayName(t);
                this.$nextTick(() => {
                    const r: any = this.$refs.rename;
                    const input = Array.isArray(r) ? r[0] : r;
                    if (input) {
                        input.focus();
                        input.select();
                    }
                });
            },
            async commitRename(this: any) {
                const uuid = this.renaming;
                if (!uuid) return;
                this.renaming = '';
                if (uuid.indexOf('new:') === 0) {
                    const pend = this.pendingCreate;
                    this.pendingCreate = null;
                    if (pend && pend.entry.uuid === uuid) await this.finishCreate(pend, this.renameText);
                    return;
                }
                const a: AssetEntry = this.byUuid[uuid];
                const name = validName(this.renameText);
                if (!a || !name || name === displayName(a)) return;
                const target = renamedUrl(a, name);
                try {
                    const exists = await db('query-asset-info', target);
                    if (exists) {
                        console.warn('[Project Browser] ' + target + ' already exists.');
                        return;
                    }
                    await db('move-asset', a.url, target);
                } catch (e) {
                    console.warn('[Project Browser] Rename failed:', e);
                }
            },
            async deleteSelection(this: any) {
                const list: AssetEntry[] = this.selectedEntries.filter((a: AssetEntry) => !a.parent && !isReadonlyUrl(a.url) && !a.readonly && !/^db:\/\/[^/]+$/.test(a.url));
                if (!list.length) return;
                const what = list.length === 1 ? '"' + list[0].url + '"' : list.length + ' assets';
                if (!(await confirm('Delete ' + what + '?\nThis cannot be undone.', 'Delete'))) return;
                for (let i = 0; i < list.length; i++) {
                    try {
                        await db('delete-asset', list[i].url);
                    } catch (e) {
                        console.warn('[Project Browser] Could not delete ' + list[i].url, e);
                    }
                }
                this.setSelection([]);
            },
            async duplicateSelection(this: any) {
                const list: AssetEntry[] = this.selectedEntries.filter((a: AssetEntry) => !a.parent && !isReadonlyUrl(a.url) && !/^db:\/\/[^/]+$/.test(a.url));
                for (let i = 0; i < list.length; i++) {
                    try {
                        const target = await db('generate-available-url', list[i].url);
                        await db('copy-asset', list[i].url, target);
                    } catch (e) {
                        console.warn('[Project Browser] Could not duplicate ' + list[i].url, e);
                    }
                }
            },
            async reimport(this: any, list: AssetEntry[]) {
                for (let i = 0; i < list.length; i++) {
                    try {
                        const main: AssetEntry | undefined = list[i].parent ? this.byUuid[list[i].parent as string] : undefined;
                        await db('reimport-asset', main ? main.url : list[i].url);
                    } catch (e) {
                        console.warn('[Project Browser] Reimport failed:', e);
                    }
                }
            },
            targetFolder(this: any): string {
                if (this.searching || this.folder === PACKAGES_ROOT) return '';
                return this.folder;
            },
            async createFolder(this: any) {
                const dir = this.targetFolder();
                if (!dir || isReadonlyUrl(dir)) return;
                try {
                    const url = await db('generate-available-url', dir + '/New Folder');
                    const info = await db('create-asset', url, null);
                    if (info && info.uuid) this.afterCreate(info.uuid);
                } catch (e) {
                    console.warn('[Project Browser] Could not create the folder:', e);
                }
            },
            /** New assets: select them (and rename them, for folders created before naming), like Unity. */
            afterCreate(this: any, uuid: string, rename = true) {
                const tryRename = (n: number) => {
                    if (this.byUuid[uuid]) {
                        this.setSelection([uuid]);
                        if (rename) this.startRename(this.byUuid[uuid]);
                        else {
                            const idx = this.items.indexOf(this.byUuid[uuid]);
                            if (idx >= 0) this.scrollTo(idx);
                        }
                    } else if (n > 0) setTimeout(() => tryRename(n - 1), 200);
                };
                this.reload().then(() => tryRename(10));
            },
            /**
             * Create menu as in Cocos' Assets panel: Folder, then asset-db's list (every asset
             * handler, grouped), then what extensions add through contributions.assets.menu.createMenu.
             */
            async createMenuItems(this: any, withPackages = false): Promise<any[]> {
                const items: any[] = [{ label: 'Folder', click: () => this.createFolder() }];
                let list: CreateMenuInfo[] = [];
                try {
                    list = (await db('query-create-menu-list')) || [];
                } catch (e) {
                    list = [];
                }
                const sep = () => ({ type: 'separator' } as any);
                const map = (it: CreateMenuInfo): any => {
                    if (!it) return null;
                    if (it.type === 'separator') return { type: 'separator' };
                    const label = i18n(it.label || '');
                    if (isFolderEntry(it, label)) return null; // our own Folder item is first
                    if (Array.isArray(it.submenu) && it.submenu.length) {
                        const sub = withGroupSeparators(it.submenu.map(map).filter((x: any) => !!x), sep);
                        return sub.length ? { label, group: it.group, submenu: sub } : null;
                    }
                    if (!isCreatable(it)) return null;
                    return { label, group: it.group, click: () => this.startCreate(it, label) };
                };
                const builtin = withGroupSeparators(list.map(map).filter((x: any) => !!x), sep);
                if (builtin.length) items.push(sep(), ...builtin);
                // extensions (Shader Graph, Input Actions, Animator Controller, ...)
                const dir = this.targetFolder();
                const ext = dir ? await this.extensionMenu('createMenu', await this.menuInfo(dir)) : [];
                // items that declare `nameFirst` ({ fullFileName, message: [pkg, msg, ...args] }) get our
                // name-first placeholder; the extension's message then creates the file at the chosen url
                const nameFirst = (it: any): any => {
                    if (!it || typeof it !== 'object') return it;
                    const nf = it.nameFirst;
                    if (nf && typeof nf.fullFileName === 'string' && Array.isArray(nf.message) && nf.message.length >= 2) {
                        const label = String(it.label || nf.fullFileName);
                        return { label, enabled: it.enabled, click: () => this.startCreate({ fullFileName: nf.fullFileName }, label, nf.message.slice()) };
                    }
                    if (Array.isArray(it.submenu)) return Object.assign({}, it, { submenu: it.submenu.map(nameFirst) });
                    return it;
                };
                if (ext.length) items.push(sep(), ...ext.map(nameFirst));
                // packages (like the Assets panel's Import Asset Package)
                if (withPackages && dir && !isReadonlyUrl(dir)) items.push(sep(), { label: 'Import Asset Package...', click: () => this.pickPackage(dir) });
                return items.map((m: any) => {
                    if (m && m.group !== undefined) delete m.group;
                    return m;
                });
            },
            /** Asset info in the shape extension menu hooks expect (MenuAssetInfo). */
            async menuInfo(this: any, urlOrUuid: string): Promise<any> {
                let info: any = null;
                try {
                    info = await db('query-asset-info', urlOrUuid);
                } catch (e) {
                    info = null;
                }
                if (info) return info;
                const name = urlOrUuid.replace(/^.*\//, '');
                return { name, displayName: name, url: urlOrUuid, file: '', uuid: '', importer: 'directory', type: '', isDirectory: true, readonly: false, imported: true, invalid: false };
            },
            /**
             * Items from every enabled extension's contributions.assets.menu hook of this kind.
             * The methods file is loaded here, in the panel, like Cocos' Assets panel does,
             * so the items keep their own click handlers.
             */
            async extensionMenu(this: any, kind: AssetsMenuKind, info: any): Promise<any[]> {
                let pkgs: any[] = [];
                try {
                    pkgs = (Editor.Package.getPackages({ enable: true } as any) as any[]) || [];
                } catch (e) {
                    pkgs = [];
                }
                const path = require('path');
                const hooks = menuHooks(pkgs, kind, (a: string, b: string) => path.join(a, b), PKG);
                const out: any[] = [];
                for (let i = 0; i < hooks.length; i++) {
                    const h = hooks[i];
                    try {
                        const mod = loadHookModule(h.file);
                        const fn = mod && mod[h.fn];
                        if (typeof fn !== 'function') continue;
                        const r = await fn(info);
                        if (Array.isArray(r)) for (let k = 0; k < r.length; k++) if (r[k]) out.push(r[k]);
                    } catch (e) {
                        console.warn('[Project Browser] The ' + kind + ' of ' + h.pkg + ' failed:', e);
                    }
                }
                return out;
            },
            /**
             * Starts creating an asset the way Unity and Cocos do: a placeholder is named first,
             * the file is made when the name is confirmed. Script templates take their class name
             * from the file name at creation, so renaming afterwards would leave the old class name.
             */
            startCreate(this: any, it: CreateMenuInfo, label: string, hookMessage?: any[]) {
                const dir = this.targetFolder();
                if (!dir || isReadonlyUrl(dir)) return;
                if (this.folder !== dir) this.navigate(dir);
                if (this.query) this.setQuery('');
                const nm = defaultNewName(it, label);
                const uuid = 'new:' + ++pendingSeq;
                const entry: any = {
                    uuid,
                    url: dir + '/' + nm.base + nm.ext,
                    name: nm.base + nm.ext,
                    type: '',
                    importer: it.handler || '',
                    isDirectory: false,
                    readonly: false,
                    pending: true,
                };
                this.pendingCreate = { entry, item: it, dir, ext: nm.ext, label, hookMessage: hookMessage || null };
                this.$nextTick(() => {
                    const idx = this.items.indexOf(entry);
                    if (idx >= 0) this.scrollTo(idx);
                    this.startRename(entry);
                });
            },
            /** The placeholder's name was confirmed: make the asset under that name. */
            async finishCreate(this: any, pend: any, rawName: string) {
                const base = validName(rawName) || defaultNewName(pend.item, pend.label).base;
                if (pend.hookMessage) {
                    // an extension's item (C# Script...): its own message creates the file at the chosen url
                    try {
                        const target = await db('generate-available-url', pend.dir + '/' + base + pend.ext);
                        const m: any[] = pend.hookMessage;
                        const info = await Editor.Message.request(m[0], m[1], target, ...m.slice(2));
                        let uuid = info && info.uuid;
                        if (!uuid) uuid = await db('query-asset-uuid', target);
                        if (uuid) this.afterCreate(uuid, false);
                    } catch (e) {
                        console.warn('[Project Browser] Could not create ' + (pend.label || 'the asset') + ':', e);
                    }
                    return;
                }
                try {
                    const target = await db('generate-available-url', pend.dir + '/' + base + pend.ext);
                    const it: CreateMenuInfo = pend.item;
                    const opts: any = { target };
                    if (it.content !== undefined) opts.content = it.content;
                    else if (it.template) opts.template = it.template;
                    if (it.handler) opts.handler = it.handler;
                    const info = await db('new-asset', opts);
                    if (info && info.uuid) this.afterCreate(info.uuid, false);
                } catch (e) {
                    console.warn('[Project Browser] Could not create ' + (pend.label || 'the asset') + ':', e);
                }
            },
            async createMenu(this: any, e: MouseEvent) {
                if (this.readonlyFolder) return;
                const r = (e.target as HTMLElement).getBoundingClientRect();
                Editor.Menu.popup({ x: Math.round(r.left), y: Math.round(r.bottom), menu: await this.createMenuItems(true) } as any);
            },
            async gridMenu(this: any, a: AssetEntry | null, e: MouseEvent) {
                if (a && !this.isSel(a)) this.setSelection([a.uuid]);
                const sel: AssetEntry[] = a ? this.selectedEntries : [];
                const one = sel.length === 1 ? sel[0] : null;
                const ro = !!a && sel.some((x) => isReadonlyUrl(x.url) || !!x.parent || x.uuid.indexOf('pkg:') === 0 || /^db:\/\/[^/]+$/.test(x.url));
                const dir = this.targetFolder();
                const menu: any[] = [];
                if (dir && !isReadonlyUrl(dir)) menu.push({ label: 'Create', submenu: await this.createMenuItems() }, { type: 'separator' });
                if (one) {
                    menu.push({ label: 'Open', click: () => this.open(one) });
                    menu.push({ label: 'Show in Explorer', click: () => request('show-in-explorer', one.file || '') });
                    menu.push({ label: 'Find in Assets Panel', click: () => request('reveal-in-assets', one.uuid) });
                    menu.push({ type: 'separator' });
                    menu.push({ label: 'Copy Path', click: () => request('copy-text', one.url) });
                    menu.push({ label: 'Copy UUID', click: () => request('copy-text', one.uuid) });
                    menu.push({ type: 'separator' });
                }
                // Folder Color: the selected folders, or the folder this menu was opened in
                const colorTargets = sel.length
                    ? (sel.every((x) => x.isDirectory && !x.parent && x.uuid.indexOf('pkg:') !== 0) ? sel.map((x) => x.uuid) : [])
                    : dir && this.uuidByUrl[dir] ? [this.uuidByUrl[dir]] : [];
                if (colorTargets.length) menu.push({ label: 'Folder Color', submenu: this.folderColorMenu(colorTargets, e) }, { type: 'separator' });
                if (sel.length) {
                    const packable = sel.filter((x) => x.uuid.indexOf('pkg:') !== 0 && dbOf(x.url) === 'assets');
                    menu.push({ label: 'Copy as Package (Ctrl+C)', enabled: packable.length > 0, click: () => this.copySelection() });
                    menu.push({ label: 'Export Package...', enabled: packable.length > 0, click: () => this.openExport(mainUuids(packable)) });
                    menu.push({ type: 'separator' });
                    menu.push({ label: 'Rename', enabled: !!one && !ro, click: () => this.startRename(one) });
                    menu.push({ label: 'Duplicate', enabled: !ro, click: () => this.duplicateSelection() });
                    menu.push({ label: 'Delete', enabled: !ro, click: () => this.deleteSelection() });
                    menu.push({ type: 'separator' });
                    menu.push({ label: 'Reimport', enabled: !sel.some((x) => x.uuid.indexOf('pkg:') === 0), click: () => this.reimport(sel) });
                    // what extensions add for this asset (contributions.assets.menu.assetMenu), as in the Assets panel
                    if (one && one.uuid.indexOf('pkg:') !== 0) {
                        const ext = await this.extensionMenu('assetMenu', await this.menuInfo(one.uuid));
                        if (ext.length) menu.push({ type: 'separator' }, ...ext);
                    }
                } else if (dir) {
                    menu.push({ label: 'Show in Explorer', click: async () => request('show-in-explorer', (await db('query-path', dir)) || '') });
                    menu.push({ label: 'Refresh', click: () => db('refresh-asset', dir).then(() => this.reload()) });
                }
                if (dir && !isReadonlyUrl(dir)) {
                    menu.push({ type: 'separator' });
                    menu.push({ label: 'Paste (Ctrl+V)', click: () => this.paste() });
                    menu.push({ label: 'Import Asset Package...', click: () => this.pickPackage(dir) });
                    menu.push({ label: "Cocos' Import Asset Package (built-in)...", click: () => this.cocosImportPackage(dir) });
                }
                menu.push({ type: 'separator' });
                menu.push({ label: 'Render Previews (Materials, Models, Prefabs)', type: 'checkbox', checked: !!this.ui.renderPreviews, click: () => this.togglePreviews() });
                menu.push({ label: 'Clear Thumbnail Cache', click: () => this.clearThumbs() });
                menu.push({ label: 'Show Grid Mascot', type: 'checkbox', checked: this.ui.mascot !== false, click: () => this.toggleMascot() });
                menu.push({ label: 'Show Toolbar Mascot', type: 'checkbox', checked: this.ui.peek !== false, click: () => this.togglePeek() });
                menu.push({ type: 'separator' });
                menu.push({ label: 'Log Drag Data (diagnostics)', type: 'checkbox', checked: !!this.ui.logDrag, click: () => this.toggleLogDrag() });
                Editor.Menu.popup({ x: e.clientX, y: e.clientY, menu } as any);
            },
            // -------------------------------------------------------------- folder colours
            /** Inline style tinting a folder's icon (the folder SVGs draw with currentColor). */
            folderStyle(this: any, a: AssetEntry): any {
                const c = a && a.isDirectory ? this.folderColors[a.uuid] : '';
                return c ? { color: c } : null;
            },
            async setFolderColor(this: any, uuids: string[], color: string | null) {
                const next = pruneFolderColors(setFolderColors(this.folderColors, uuids, color), (u: string) => !!this.byUuid[u]);
                this.folderColors = next;
                await saveStore('folderColors', next);
            },
            /** The Folder Color submenu for these folders (Custom... opens a colour box in the panel). */
            folderColorMenu(this: any, uuids: string[], e: MouseEvent): any[] {
                const cur = sharedColor(this.folderColors, uuids);
                const items: any[] = [{ label: 'None', type: 'checkbox', checked: cur === '', click: () => this.setFolderColor(uuids, null) }, { type: 'separator' }];
                for (let i = 0; i < FOLDER_COLORS.length; i++) {
                    const c = FOLDER_COLORS[i];
                    items.push({ label: c.name, type: 'checkbox', checked: cur === c.hex, click: () => this.setFolderColor(uuids, c.hex) });
                }
                const custom = !!cur && !FOLDER_COLORS.some((c) => c.hex === cur);
                items.push({ type: 'separator' }, { label: custom ? 'Custom (' + cur + ')...' : 'Custom...', type: custom ? 'checkbox' : 'normal', checked: custom, click: () => this.openColorPick(uuids, e) });
                return items;
            },
            /** A small colour box at the pointer (a native menu can't open the colour picker itself). */
            openColorPick(this: any, uuids: string[], e: MouseEvent) {
                const root = this.$el as HTMLElement;
                const r = root.getBoundingClientRect();
                const x = Math.max(4, Math.min(r.width - 210, (e ? e.clientX : r.left + 40) - r.left));
                const y = Math.max(4, Math.min(r.height - 90, (e ? e.clientY : r.top + 40) - r.top));
                this.colorPick = { uuids: uuids.slice(), value: (sharedColor(this.folderColors, uuids) || '#5B9BE0').toLowerCase(), x, y };
            },
            async applyColorPick(this: any) {
                const p = this.colorPick;
                this.colorPick = null;
                const c = p && normalizeColor(p.value);
                if (p && c) await this.setFolderColor(p.uuids, c);
            },
            toggleLogDrag(this: any) {
                this.ui.logDrag = !this.ui.logDrag;
                this.saveUi();
                console.log('[Project Browser] Log Drag Data is ' + (this.ui.logDrag ? 'on: drops into this panel are only logged, nothing moves.' : 'off.'));
            },
            /** While Log Drag Data is on, the panel only records drops (so dropping never moves anything). */
            logDragOver(this: any, e: DragEvent) {
                if (!this.ui.logDrag) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            },
            /**
             * Diagnostics: prints what a drop carries, the editor's drag info (filled by the
             * ui-drag-item that started the drag, the same object the Scene reads) and every
             * dataTransfer entry. Drag the same file from the Assets panel and from this panel
             * to compare.
             */
            logDrop(this: any, e: DragEvent) {
                if (!this.ui.logDrag) return;
                e.preventDefault();
                e.stopPropagation();
                let info: any = null;
                try {
                    const U: any = (Editor as any).UI;
                    const area = U && (U.DragArea || (U.__protected__ && U.__protected__.DragArea));
                    info = area ? area.currentDragInfo : null;
                } catch (err) {
                    info = '(not readable)';
                }
                const data: Record<string, string> = {};
                const dt = e.dataTransfer;
                if (dt) {
                    const types = Array.prototype.slice.call(dt.types || []);
                    for (let i = 0; i < types.length; i++) {
                        try {
                            data[types[i]] = dt.getData(types[i]);
                        } catch (err) {
                            data[types[i]] = '(not readable)';
                        }
                    }
                }
                const from = this.internalDrag ? 'Project Browser' : 'another panel';
                let text = '';
                try {
                    text = JSON.stringify({ from, currentDragInfo: info, dataTransfer: data }, null, 1);
                } catch (err) {
                    text = String(err);
                }
                console.log('[Project Browser] Drag data (from ' + from + '):\n' + text);
                this.endDrag();
            },
            toggleMascot(this: any) {
                this.ui.mascot = this.ui.mascot === false;
                this.mascotShy = false;
                this.saveUi();
            },
            togglePeek(this: any) {
                this.ui.peek = this.ui.peek === false;
                this.saveUi();
            },
            /** True when the point is over the girl's resting place (her un-ducked box, plus a margin). */
            mascotNear(this: any, p: { x: number; y: number } | null): boolean {
                const img = this.$refs.mascot as HTMLElement | undefined;
                const parent = img && (img.offsetParent as HTMLElement | null);
                if (!p || !img || !parent) return false;
                // offsetLeft/Top ignore the transform, so ducking doesn't move the box (no flicker)
                const r = parent.getBoundingClientRect();
                const left = r.left + img.offsetLeft;
                const top = r.top + img.offsetTop;
                const pad = 14;
                return p.x >= left - pad && p.x <= left + img.offsetWidth + pad && p.y >= top - pad && p.y <= top + img.offsetHeight + pad;
            },
            mascotTrack(this: any, e: MouseEvent) {
                mascotPos = { x: e.clientX, y: e.clientY };
                this.mascotUpdate();
            },
            mascotLeave(this: any) {
                mascotPos = null;
                this.mascotUpdate();
            },
            mascotUpdate(this: any) {
                if (this.mascotNear(mascotPos)) {
                    if (mascotTimer) clearTimeout(mascotTimer);
                    mascotTimer = null;
                    this.mascotShy = true;
                } else if (this.mascotShy && !mascotTimer) {
                    // peek back a moment after the pointer went away
                    mascotTimer = setTimeout(() => {
                        mascotTimer = null;
                        if (!this.mascotNear(mascotPos)) this.mascotShy = false;
                    }, 700);
                }
            },
            togglePreviews(this: any) {
                this.ui.renderPreviews = !this.ui.renderPreviews;
                this.saveUi();
                this.clearThumbs(false);
            },
            async clearThumbs(this: any, disk = true) {
                if (disk) await request('thumb-clear');
                this.thumbMap = {};
                if (thumbs) thumbs.clear();
                this.thumbVersion++;
                this.requestThumbs();
            },

            // -------------------------------------------------------------- labels
            labelState(this: any, l: string): string {
                const s: AssetEntry[] = this.selectedEntries;
                const n = s.filter((a) => (this.labelStore[a.parent || a.uuid] || []).indexOf(l) >= 0).length;
                return n === 0 ? '' : n === s.length ? '✓' : '–';
            },
            async toggleSelectionLabel(this: any, l: string) {
                const ids = this.selectedEntries.map((a: AssetEntry) => a.parent || a.uuid);
                const on = this.labelState(l) !== '✓';
                await this.saveLabels(setLabel(this.labelStore, ids, l, on));
            },
            async addLabel(this: any, text: string) {
                const l = String(text || '').trim().replace(/\s+/g, '_');
                if (!l) return;
                const ids = this.selectedEntries.map((a: AssetEntry) => a.parent || a.uuid);
                await this.saveLabels(setLabel(this.labelStore, ids, l, true));
            },

            // -------------------------------------------------------------- drag and drop
            /** ui-drag-item attributes: the whole selection when dragging a selected item. */
            dragFor(this: any, a: AssetEntry): DragPayload & { json: string } {
                if (this.selection.length > 1 && this.isSel(a)) return this.selectionDrag;
                const p = dragPayload([a]);
                return Object.assign(p, { json: JSON.stringify(p.additional) });
            },
            dragStart(this: any, a: AssetEntry, e: DragEvent) {
                if (a.uuid.indexOf('pkg:') === 0) {
                    e.preventDefault();
                    return;
                }
                // a drag is not a click: keep the current selection (and the Inspector) as it is
                cancelClickSelect();
                const list: AssetEntry[] = this.isSel(a) ? this.selectedEntries : [a];
                // Alt: a native file drag out of the editor instead (Explorer, browser, chat, another project)
                const mode = osDragMode(!!e.altKey || this.mods.alt, !!e.shiftKey || (this.mods.alt && this.mods.shift));
                if (mode !== 'none') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startOsDrag(list, mode);
                    return;
                }
                this.internalDrag = list;
                const p = dragPayload(list);
                try {
                    // ui-drag-item fills Editor.UI.DragArea.currentDragInfo itself; the dataTransfer copy is for plain DOM targets
                    e.dataTransfer!.setData('value', p.value);
                    e.dataTransfer!.setData('additional', JSON.stringify(p.additional));
                    e.dataTransfer!.effectAllowed = 'copyMove';
                } catch (err) {
                    // read-only dataTransfer
                }
            },
            dragEnd(this: any) {
                setTimeout(() => (this.internalDrag = null), 0);
                this.endDrag();
            },
            /** Drop feedback off (drop, drag end, drag left the window). */
            endDrag(this: any) {
                this.dropTarget = '';
                cancelExpand();
                this.mascotLeave();
            },
            /** The drag left the window (not just moved onto a child element). */
            rootDragLeave(this: any, e: DragEvent) {
                const to = e.relatedTarget as Node | null;
                const root = this.$el as HTMLElement;
                if (!to || !root || !root.contains(to)) this.endDrag();
            },
            /** dragleave of a drop target: ignore moves onto its own children. */
            dragLeave(this: any, key: string, e: DragEvent) {
                const to = e.relatedTarget as Node | null;
                const cur = e.currentTarget as HTMLElement | null;
                if (to && cur && cur.contains && cur.contains(to)) return;
                if (this.dropTarget === key) this.dropTarget = '';
                if (expandKey === key) cancelExpand();
            },
            /** Cocos' drag info (set by ui-drag-item in this window: Assets panel, Hierarchy rows). */
            dragInfo(): any {
                try {
                    return (Editor as any).UI.DragArea.currentDragInfo || null;
                } catch (err) {
                    return null;
                }
            },
            dragKind(this: any, e: DragEvent): DragKind {
                return dragKindOf(!!this.internalDrag, this.dragInfo(), e.dataTransfer ? e.dataTransfer.types : null);
            },
            /** The assets being dragged, when they can be known before the drop. */
            draggedAssets(this: any): AssetEntry[] | null {
                if (this.internalDrag) return this.internalDrag;
                const info = this.dragInfo();
                if (!info) return null;
                const list = dropUuids(info)
                    .map((u: string) => this.byUuid[u])
                    .filter((a: AssetEntry | undefined) => !!a);
                return list.length ? list : null;
            },
            /** Would a folder take this drag? Assets: not into themselves or where they already are. */
            dropVerdict(this: any, url: string, e: DragEvent): DropVerdict {
                if (!this.canDropInto(url)) return 'deny';
                if (this.dragKind(e) === 'assets') {
                    const list = this.draggedAssets();
                    return list ? moveVerdict(list, url) : 'accept';
                }
                return 'accept';
            },
            /** dragover on a folder: highlight it, or the not-allowed cursor. */
            hoverDrop(this: any, key: string, url: string, e: DragEvent): boolean {
                const ok = this.dropVerdict(url, e) === 'accept';
                const dt = e.dataTransfer;
                if (dt) {
                    try {
                        dt.dropEffect = ok ? pickDropEffect(dt.effectAllowed, this.dragKind(e) === 'assets' ? 'move' : 'copy') : 'none';
                    } catch (err) {
                        // read-only dataTransfer
                    }
                }
                this.dropTarget = ok ? key : '';
                return ok;
            },
            /** Uuids being dropped (ours, the Assets panel's), Hierarchy nodes and OS file paths. */
            readDrop(this: any, e: DragEvent): { uuids: string[]; files: string[]; nodes: string[] } {
                const files: string[] = [];
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length) for (let i = 0; i < dt.files.length; i++) if ((dt.files[i] as any).path) files.push((dt.files[i] as any).path);
                if (files.length) return { uuids: [], files, nodes: [] };
                if (this.internalDrag) return { uuids: this.internalDrag.map((a: AssetEntry) => a.uuid), files, nodes: [] };
                const info = this.dragInfo();
                let v = '';
                let add = '';
                try {
                    v = dt ? dt.getData('value') : '';
                    add = dt ? dt.getData('additional') : '';
                } catch (err) {
                    // protected during dragover
                }
                const isAsset = (u: string) => !!this.byUuid[u] || !!this.byUuid[mainUuid(u)];
                const all = dropUuids(info, v, add);
                let nodes = nodeDropUuids(info, v, add, isAsset);
                // a Hierarchy in another window: no drag info here; unknown uuids may be nodes (checked with the scene)
                if (!nodes.length) nodes = all.filter((u: string) => !isAsset(u));
                return { uuids: all.filter(isAsset), files, nodes };
            },
            canDropInto(url: string): boolean {
                return !!url && url !== PACKAGES_ROOT && !isReadonlyUrl(url);
            },
            treeDragOver(this: any, r: any, e: DragEvent) {
                if (r.kind !== 'folder') {
                    this.dropTarget = '';
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
                    return;
                }
                this.hoverDrop(r.key, r.url, e);
                // hovering a closed folder opens it, so a drag can reach its subfolders
                if (r.hasChildren && !r.open) {
                    if (expandKey !== r.key) {
                        cancelExpand();
                        expandKey = r.key;
                        expandTimer = setTimeout(() => {
                            expandTimer = null;
                            if (expandKey === r.key && !this.ui.expanded[r.key]) this.ui.expanded = Object.assign({}, this.ui.expanded, { [r.key]: true });
                        }, 600);
                    }
                } else if (expandKey !== r.key) cancelExpand();
            },
            treeDrop(this: any, r: any, e: DragEvent) {
                this.endDrag();
                if (r.kind === 'folder') this.folderDrop(r.url, e);
            },
            crumbDragOver(this: any, c: { url: string }, e: DragEvent) {
                this.hoverDrop('crumb:' + c.url, c.url, e);
            },
            crumbDrop(this: any, c: { url: string }, e: DragEvent) {
                this.endDrag();
                this.folderDrop(c.url, e);
            },
            itemDragOver(this: any, a: AssetEntry, e: DragEvent) {
                if (a.isDirectory) this.hoverDrop(a.uuid, a.url, e);
                else this.gridDragOver(e);
            },
            itemDrop(this: any, a: AssetEntry, e: DragEvent) {
                this.endDrag();
                if (a.isDirectory) this.folderDrop(a.url, e);
                else this.gridDrop(e);
            },
            gridDragOver(this: any, e: DragEvent) {
                const dir = this.targetFolder();
                if (!dir) {
                    this.dropTarget = '';
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
                    return;
                }
                this.hoverDrop('#grid', dir, e);
            },
            gridDrop(this: any, e: DragEvent) {
                this.endDrag();
                const dir = this.targetFolder();
                if (dir) this.folderDrop(dir, e);
            },
            /**
             * Nodes dropped from the Hierarchy become prefabs in the folder, like
             * Unity: "<Node name>.prefab" ("Cube 1.prefab" when the name is taken),
             * one per node, linked to the node by Cocos (scene 'create-prefab').
             */
            async createPrefabs(this: any, nodeUuids: string[], folderUrl: string) {
                if (!this.canDropInto(folderUrl)) return;
                const known: Record<string, boolean> = {};
                const assets: AssetEntry[] = this.assets;
                for (let i = 0; i < assets.length; i++) known[assets[i].url.toLowerCase()] = true;
                const taken = (u: string) => !!known[u.toLowerCase()];
                const made: string[] = [];
                for (let i = 0; i < nodeUuids.length; i++) {
                    let dump: any = null;
                    try {
                        dump = await Editor.Message.request('scene', 'query-node', nodeUuids[i]);
                    } catch (err) {
                        dump = null;
                    }
                    if (!dump || typeof dump !== 'object') continue; // not a node of the open scene
                    const type = dump.__type__ || (dump.type && dump.type.value) || '';
                    if (type === 'cc.Scene' || dump.isScene) {
                        console.warn('[Project Browser] The scene itself cannot become a prefab.');
                        continue;
                    }
                    const name = dump.name && typeof dump.name === 'object' ? dump.name.value : dump.name;
                    let url = uniquePrefabUrl(folderUrl, String(name || 'Node'), taken);
                    // the index may be behind the disk
                    for (let guard = 0; guard < 50; guard++) {
                        let exists: any = null;
                        try {
                            exists = await db('query-asset-info', url);
                        } catch (err) {
                            exists = null;
                        }
                        if (!exists) break;
                        known[url.toLowerCase()] = true;
                        url = uniquePrefabUrl(folderUrl, String(name || 'Node'), taken);
                    }
                    known[url.toLowerCase()] = true;
                    try {
                        await Editor.Message.request('scene', 'create-prefab' as any, nodeUuids[i], url);
                        made.push(url);
                    } catch (err) {
                        console.warn('[Project Browser] Could not create the prefab ' + url + ':', err);
                    }
                }
                if (!made.length) return;
                await this.reload();
                // show the new prefab (without taking the selection away from the node, like Unity)
                const first = this.assets.find((a: AssetEntry) => a.url === made[0]);
                if (first && parentUrl(first.url) === this.folder && !this.searching) {
                    const idx = this.items.indexOf(first);
                    if (idx >= 0) this.scrollTo(idx, true);
                    this.flash(first.uuid);
                }
            },
            async folderDrop(this: any, url: string, e: DragEvent) {
                if (!this.canDropInto(url)) return;
                const { uuids, files, nodes } = this.readDrop(e);
                if (!files.length && !uuids.length && nodes.length) return this.createPrefabs(nodes, url);
                if (files.length) return this.dropFiles(files, url);
                const list = uuids
                    .map((u: string) => this.byUuid[u])
                    .filter((a: AssetEntry | undefined) => !!a && !a.parent && !isReadonlyUrl(a.url) && parentUrl(a.url) !== url && url.indexOf(a.url + '/') !== 0 && a.url !== url) as AssetEntry[];
                if (!list.length) return;
                if (list.length > 1 && !(await confirm('Move ' + list.length + ' assets into ' + url + '?', 'Move'))) return;
                for (let i = 0; i < list.length; i++) {
                    const a = list[i];
                    try {
                        const target = await db('generate-available-url', url + '/' + a.name);
                        await db('move-asset', a.url, target);
                    } catch (err) {
                        console.warn('[Project Browser] Could not move ' + a.url, err);
                    }
                }
            },

            /** OS files into a folder: asset packages open the import dialog, other files are imported (new uuids). */
            async dropFiles(this: any, files: string[], url: string) {
                let pkgs: string[] = [];
                try {
                    const r = await request('probe-paths', files.slice());
                    pkgs = Array.isArray(r) ? r : [];
                } catch (err) {
                    pkgs = [];
                }
                let rest = files.filter((f) => pkgs.indexOf(f) < 0);
                // an Alt drag dropped back on this project: its own files are not imported again
                if (rest.length) {
                    let inside: boolean[] = [];
                    try {
                        const r = await request('inside-project', rest.slice());
                        inside = Array.isArray(r) ? r : [];
                    } catch (err) {
                        inside = [];
                    }
                    const own = rest.filter((f, i) => !!inside[i]);
                    if (own.length) {
                        rest = rest.filter((f, i) => !inside[i]);
                        this.flashNotice(own.length === 1 ? 'That file is already in this project: not imported again (Ctrl+D duplicates).' : own.length + ' files are already in this project: not imported again.');
                    }
                }
                await this.importFiles(rest, url);
                if (pkgs.length) await this.openImport(pkgs[0], url);
            },
            /** Imports OS files into a folder (asset-db import-asset; Cocos gives them new uuids). */
            async importFiles(this: any, files: string[], url: string) {
                for (let i = 0; i < files.length; i++) {
                    const base = files[i].replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Imported';
                    try {
                        const target = await db('generate-available-url', url + '/' + base);
                        await db('import-asset', files[i], target);
                    } catch (err) {
                        console.warn('[Project Browser] Could not import ' + files[i], err);
                    }
                }
            },

            // -------------------------------------------------------------- drag out to the OS, clipboard
            /** Alt / Shift state for the status bar hint (any key or mouse event over the window). */
            trackMods(this: any, e: { altKey?: boolean; shiftKey?: boolean }) {
                const alt = !!e.altKey;
                const shift = !!e.shiftKey;
                if (this.mods.alt !== alt || this.mods.shift !== shift) this.mods = { alt, shift };
            },
            flashNotice(this: any, text: string, ms = 5000) {
                if (noticeTimer) clearTimeout(noticeTimer);
                this.notice = text;
                noticeTimer = setTimeout(() => {
                    noticeTimer = null;
                    this.notice = '';
                }, ms);
            },
            /**
             * Alt drag: the HTML drag is cancelled and the main process starts a native
             * file drag (webContents.startDrag). 'files': the files themselves (sub-assets
             * give their main file, folders drag as folders); 'package': a package folder
             * with the dependencies and .meta files, for another Cocos project.
             */
            startOsDrag(this: any, list: AssetEntry[], mode: 'files' | 'package') {
                // ui-drag-item filled the editor's drag info before this handler: the drag is cancelled, clear it
                try {
                    const area = (Editor as any).UI && (Editor as any).UI.DragArea;
                    if (area && area.currentDragInfo) area.currentDragInfo = null;
                } catch (err) {
                    // read-only
                }
                const real = list.filter((a) => a.uuid.indexOf('pkg:') !== 0 && a.uuid.indexOf('new:') !== 0);
                if (!real.length) return;
                if (mode === 'package') {
                    const uuids = mainUuids(real.filter((a) => dbOf(a.url) === 'assets'));
                    if (!uuids.length) {
                        this.flashNotice('Only assets under Assets can go into a package.');
                        return;
                    }
                    this.flashNotice('Packing ' + uuids.length + ' asset' + (uuids.length > 1 ? 's' : '') + ' with dependencies... keep holding the mouse button.');
                    sendOsDrag({ mode, uuids });
                    return;
                }
                const files = osDragFiles(real, (u: string) => (this.byUuid[u] && this.byUuid[u].file) || '');
                if (!files.length) return;
                sendOsDrag({ mode, files, thumbUuid: real.length === 1 ? real[0].uuid : '' });
            },
            /** Ctrl+C: the selection (and what it needs) as a package on the system clipboard. */
            async copySelection(this: any) {
                const list: AssetEntry[] = this.selectedEntries.filter((a: AssetEntry) => a.uuid.indexOf('pkg:') !== 0 && dbOf(a.url) === 'assets');
                if (!list.length) {
                    if (this.selectedEntries.length) this.flashNotice('Only assets under Assets can be copied as a package.');
                    return;
                }
                this.flashNotice('Copying ' + list.length + ' asset' + (list.length > 1 ? 's' : '') + ' as a package...', 30000);
                let r: any = null;
                try {
                    r = await request('copy-package', mainUuids(list));
                } catch (err) {
                    r = { ok: false, error: String(err) };
                }
                if (!r || !r.ok) {
                    this.flashNotice('Copy failed: ' + ((r && r.error) || 'no answer'));
                    return;
                }
                this.flashNotice(
                    'Copied a package of ' + r.count + ' asset' + (r.count === 1 ? '' : 's') + '. Ctrl+V in another project\'s Project window' + (r.how === 'files+text' ? '; Explorer pastes the package folder.' : '.'),
                    8000,
                );
            },
            /** Ctrl+V: a package opens the import dialog; files copied in Explorer are imported. */
            async paste(this: any) {
                const dir = this.targetFolder() || ASSETS_ROOT;
                if (isReadonlyUrl(dir)) return;
                let r: any = null;
                try {
                    r = await request('read-clipboard');
                } catch (err) {
                    r = null;
                }
                if (r && r.kind === 'package') return this.openImport(r.path, dir, true);
                if (r && r.kind === 'files' && Array.isArray(r.files) && r.files.length) return this.dropFiles(r.files.slice(), dir);
                this.flashNotice('Nothing to paste: copy assets in a Project window, or files in Explorer.');
            },

            // -------------------------------------------------------------- import package dialog
            /** "Import Asset Package...": pick a package (zip, or the asset-package.json of a folder). */
            async pickPackage(this: any, dir?: string) {
                const folder = dir || this.targetFolder() || ASSETS_ROOT;
                let r: any = null;
                try {
                    r = await Editor.Dialog.select({
                        title: 'Import Asset Package',
                        type: 'file',
                        filters: [{ name: 'Asset packages (.zip, asset-package.json)', extensions: ['zip', 'json'] }],
                    } as any);
                } catch (err) {
                    r = null;
                }
                const p = r && !r.canceled && r.filePaths && r.filePaths[0];
                if (p) await this.openImport(String(p), folder);
            },
            /** Opens the import dialog for a package (folder, zip, asset-package.json, Cocos zip). */
            async openImport(this: any, path: string, folderUrl: string, pasted = false) {
                if (this.importDlg) this.closeImport();
                const info: any = await request('open-package', path).catch((err: any) => ({ ok: false, error: String(err) }));
                if (!info || !info.ok) {
                    this.flashNotice('Not an asset package: ' + ((info && info.error) || path), 8000);
                    return;
                }
                if (info.ownTemp) {
                    request('close-package', info.id);
                    // Ctrl+C then Ctrl+V in the same project: paste copies here (new uuids), like Explorer
                    if (pasted) return this.pasteCopies(info.roots || [], folderUrl);
                    this.flashNotice('That package was made from this project: nothing to import.');
                    return;
                }
                const folder = folderUrl && !isReadonlyUrl(folderUrl) && folderUrl !== PACKAGES_ROOT ? folderUrl : ASSETS_ROOT;
                this.importDlg = { info, mode: 'original', folderUrl: folder, rows: [], decisions: {}, busy: true, error: '' };
                await this.classifyImport();
            },
            /** Copies of assets of this project into a folder (asset-db copy-asset: new uuids). */
            async pasteCopies(this: any, uuids: string[], folderUrl: string) {
                const dir = folderUrl && !isReadonlyUrl(folderUrl) && folderUrl !== PACKAGES_ROOT ? folderUrl : ASSETS_ROOT;
                let n = 0;
                let first = '';
                for (let i = 0; i < uuids.length; i++) {
                    const a: AssetEntry | undefined = this.byUuid[uuids[i]];
                    if (!a || a.parent || dir === a.url || dir.indexOf(a.url + '/') === 0) continue;
                    try {
                        const target = await db('generate-available-url', dir + '/' + a.name);
                        const info = await db('copy-asset', a.url, target);
                        n++;
                        if (!first && info && info.uuid) first = info.uuid;
                    } catch (err) {
                        console.warn('[Project Browser] Could not paste ' + a.url, err);
                    }
                }
                this.flashNotice(n ? 'Pasted ' + n + ' cop' + (n === 1 ? 'y' : 'ies') + ' into ' + dir + '.' : 'Nothing to paste here.');
                if (first) this.afterCreate(first, false);
            },
            async classifyImport(this: any) {
                const d = this.importDlg;
                if (!d) return;
                d.busy = true;
                const r: any = await request('classify-package', d.info.id, d.mode === 'folder' ? d.folderUrl : null).catch((err: any) => ({ ok: false, error: String(err) }));
                if (this.importDlg !== d) return;
                d.busy = false;
                if (!r || !r.ok) {
                    d.error = (r && r.error) || 'Could not read the package.';
                    d.rows = [];
                    return;
                }
                d.error = '';
                d.rows = r.rows;
                // keep choices that still apply after a target change
                const next: Record<string, ImportAction> = {};
                (r.rows as any[]).forEach((row) => {
                    const prev = d.decisions[row.path];
                    next[row.path] = prev && row.actions.indexOf(prev) >= 0 ? prev : row.action;
                });
                d.decisions = next;
            },
            folderTitle(url: string): string {
                const c = breadcrumb(url || ASSETS_ROOT);
                return c.length ? c[c.length - 1].label : 'Assets';
            },
            /** Icon of a package row: folders, else the icon its type or file extension gets in the grid. */
            pkgIcon(this: any, r: any): string {
                if (r.isDirectory) return iconSvg('Folder');
                const p = String(r.target || r.path || '');
                const name = p.slice(p.lastIndexOf('/') + 1);
                return this.iconFor({ uuid: 'row:' + p, url: 'db://' + p, name, type: r.type || '', importer: r.importer || '', isDirectory: false });
            },
            statusTitle(r: any): string {
                switch (r.status) {
                    case 'new':
                        return 'Not in this project yet';
                    case 'identical':
                        return 'Already in this project with the same uuid, path and content';
                    case 'changed':
                        return 'Same uuid and path, other content: Overwrite replaces the file and its .meta';
                    case 'moved':
                        return 'This uuid belongs to ' + (r.existingPath || 'another asset') + (r.actions.indexOf('copy') >= 0 ? '' : '. Scripts cannot take a new uuid (class ids), so only Skip or Overwrite.');
                    case 'taken':
                        return 'Another asset is at this path: Import renamed keeps the package uuid under a free name';
                }
                return '';
            },
            setImportMode(this: any, mode: 'original' | 'folder') {
                if (!this.importDlg || this.importDlg.mode === mode) return;
                this.importDlg.mode = mode;
                this.classifyImport();
            },
            /** The checkbox of a row: off = skip; on = the row's first non-skip choice. Folders toggle their content. */
            toggleImportRow(this: any, row: any) {
                const d = this.importDlg;
                if (!d) return;
                const on = (r: any) => (r.actions as ImportAction[]).find((a) => a !== 'skip') || 'skip';
                if (row.isDirectory) {
                    const turnOn = row.checked !== true;
                    rowsUnder(d.rows as any[], row.target).forEach((r: any) => {
                        if (!r.isDirectory) d.decisions[r.path] = turnOn ? (r.status === 'identical' ? 'skip' : on(r)) : 'skip';
                    });
                } else d.decisions[row.path] = row.checked ? 'skip' : on(row);
                d.decisions = Object.assign({}, d.decisions);
            },
            setImportAction(this: any, row: any, action: ImportAction) {
                const d = this.importDlg;
                if (!d || row.actions.indexOf(action) < 0) return;
                d.decisions = Object.assign({}, d.decisions, { [row.path]: action });
            },
            /** All: every row to its default (identical ones stay skipped); None: everything skipped. */
            importAll(this: any, on: boolean) {
                const d = this.importDlg;
                if (!d) return;
                const next: Record<string, ImportAction> = {};
                (d.rows as any[]).forEach((r) => (next[r.path] = on ? r.action : 'skip'));
                d.decisions = next;
            },
            closeImport(this: any) {
                const d = this.importDlg;
                this.importDlg = null;
                if (d && d.info) request('close-package', d.info.id).catch(() => undefined);
            },
            async runImport(this: any) {
                const d = this.importDlg;
                if (!d || d.busy) return;
                d.busy = true;
                const decisions = JSON.parse(JSON.stringify(d.decisions));
                const r: any = await request('import-package', d.info.id, d.mode === 'folder' ? d.folderUrl : null, decisions).catch((err: any) => ({ ok: false, error: String(err) }));
                if (this.importDlg !== d) return;
                d.busy = false;
                if (!r || !r.ok) {
                    d.error = (r && r.error) || 'Import failed.';
                    return;
                }
                this.closeImport();
                const parts = [r.written + ' written'];
                if (r.skipped) parts.push(r.skipped + ' skipped');
                if (r.remapped) parts.push(r.remapped + ' copied with a new uuid');
                if (r.errors && r.errors.length) parts.push(r.errors.length + ' failed (see the console)');
                this.flashNotice('Package imported: ' + parts.join(', ') + '.', 8000);
                await this.reload();
                if (r.first) {
                    const a = this.assets.find((x: AssetEntry) => x.url === r.first);
                    if (a) this.ping(a.uuid);
                }
            },
            /**
             * Cocos' own Import Asset Package (the built-in package-asset extension): its
             * assets menu hook is loaded and its import item clicked, as the Assets panel
             * does; else its import panel is opened.
             */
            async cocosImportPackage(this: any, dir: string) {
                const path = require('path');
                try {
                    const pkgs: any[] = (Editor.Package.getPackages({ name: 'package-asset' } as any) as any[]) || [];
                    const p = pkgs.find((x: any) => x && x.name === 'package-asset');
                    const menu = p && p.info && p.info.contributions && p.info.contributions.assets && p.info.contributions.assets.menu;
                    if (menu && menu.methods) {
                        const file = path.join(p.path, menu.methods);
                        let mod: any = null;
                        try {
                            mod = require(file);
                        } catch (err) {
                            mod = require(file.replace(/\.js$/, ''));
                        }
                        const info = await this.menuInfo(dir);
                        const names = [menu.panelMenu, menu.dbMenu, menu.assetMenu].filter((n: any) => typeof n === 'string');
                        for (let i = 0; i < names.length; i++) {
                            const fn = mod && mod[names[i]];
                            if (typeof fn !== 'function') continue;
                            const items = (await fn(info)) || [];
                            const found = findMenuItem(items, (label: string) => /import/i.test(label) && !/new/i.test(label));
                            if (found && typeof found.click === 'function') {
                                found.click();
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn("[Project Browser] Could not run Cocos' Import Asset Package menu:", err);
                }
                try {
                    Editor.Panel.open('package-asset.import');
                } catch (err) {
                    this.flashNotice("Cocos' Import Asset Package is not available.");
                }
            },

            // -------------------------------------------------------------- export package dialog
            /** "Export Package...": the picked assets and their dependencies as a checklist (Unity's Export Package). */
            async openExport(this: any, uuids: string[]) {
                const roots = (uuids || []).filter((u) => typeof u === 'string' && u.indexOf('pkg:') !== 0);
                if (!roots.length) {
                    this.flashNotice('Select the assets to export first.');
                    return;
                }
                this.exportDlg = { rows: [], checked: {}, includeDeps: true, roots: roots.slice(), busy: true, error: '' };
                const d = this.exportDlg;
                const r: any = await request('collect-export', roots.slice()).catch((err: any) => ({ ok: false, error: String(err) }));
                if (this.exportDlg !== d) return;
                d.busy = false;
                if (!r || !r.ok) {
                    d.error = (r && r.error) || 'Could not collect the assets.';
                    return;
                }
                d.rows = treeRows((r.rows as any[]).map((x) => Object.assign({ target: x.path }, x)));
                const checked: Record<string, boolean> = {};
                (r.rows as any[]).forEach((x) => (checked[x.uuid] = true));
                d.checked = checked;
            },
            toggleExportRow(this: any, row: any) {
                const d = this.exportDlg;
                if (!d) return;
                const on = !d.checked[row.uuid];
                const next = Object.assign({}, d.checked, { [row.uuid]: on });
                if (row.isDirectory) rowsUnder(d.rows as any[], row.path).forEach((r: any) => (next[r.uuid] = on));
                d.checked = next;
            },
            setIncludeDeps(this: any, on: boolean) {
                const d = this.exportDlg;
                if (!d) return;
                d.includeDeps = on;
                const next = Object.assign({}, d.checked);
                (d.rows as any[]).forEach((r) => {
                    if (r.dependency) next[r.uuid] = on;
                });
                d.checked = next;
            },
            async runExport(this: any, zip: boolean) {
                const d = this.exportDlg;
                if (!d || d.busy) return;
                const uuids = (d.rows as any[]).filter((r) => d.checked[r.uuid]).map((r) => r.uuid);
                if (!uuids.length) return;
                const first = (d.rows as any[]).find((r) => d.roots.indexOf(r.uuid) >= 0) || d.rows[0];
                const base = String((first && first.name) || 'Package').replace(/\.[^.]+$/, '') || 'Package';
                let r: any = null;
                try {
                    r = await Editor.Dialog.save({
                        title: zip ? 'Export Package as .zip' : 'Export Package to a Folder',
                        path: base + (zip ? '.zip' : ' Package'),
                        filters: zip ? [{ name: 'Zip', extensions: ['zip'] }] : [],
                    } as any);
                } catch (err) {
                    r = null;
                }
                const dest = r && !r.canceled && r.filePath;
                if (!dest) return;
                d.busy = true;
                const res: any = await request('export-package', uuids, d.roots.slice(), String(dest), zip).catch((err: any) => ({ ok: false, error: String(err) }));
                if (this.exportDlg !== d) return;
                d.busy = false;
                if (!res || !res.ok) {
                    d.error = (res && res.error) || 'Export failed.';
                    return;
                }
                this.exportDlg = null;
                this.flashNotice('Exported ' + res.count + ' asset' + (res.count === 1 ? '' : 's') + ' to ' + res.path, 8000);
            },
            /** Extension › Project Browser › Import / Export Package: take the request (once, in one window). */
            async takePackageMenu(this: any) {
                let m = '';
                try {
                    m = await request('take-pending-menu');
                } catch (err) {
                    m = '';
                }
                if (m === 'import') this.pickPackage(this.targetFolder() || ASSETS_ROOT);
                else if (m === 'export') {
                    let sel: string[] = [];
                    try {
                        sel = (Editor.Selection.getSelected('asset') || []).slice();
                    } catch (err) {
                        sel = [];
                    }
                    if (!sel.length) sel = this.selection.slice();
                    this.openExport(sel.filter((u: string) => !!this.byUuid[u] && dbOf(this.byUuid[u].url) === 'assets').map((u: string) => mainUuid(u)));
                }
            },

            // -------------------------------------------------------------- keyboard
            onKey(this: any, e: KeyboardEvent) {
                const t = e.target as HTMLElement;
                if (inTextField(t)) return;
                const ctrl = e.ctrlKey || e.metaKey;
                if (this.importDlg || this.exportDlg) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        if (this.importDlg) this.closeImport();
                        else this.exportDlg = null;
                    }
                    return;
                }
                if (ctrl && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.copySelection();
                    return;
                }
                if (ctrl && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.paste();
                    return;
                }
                if (e.key === 'F2') {
                    e.preventDefault();
                    this.startRename();
                } else if (e.key === 'Delete') {
                    e.preventDefault();
                    this.deleteSelection();
                } else if (ctrl && (e.key === 'd' || e.key === 'D')) {
                    e.preventDefault();
                    this.duplicateSelection();
                } else if (ctrl && (e.key === 'a' || e.key === 'A')) {
                    e.preventDefault();
                    this.setSelection(this.items.map((a: AssetEntry) => a.uuid));
                } else if (ctrl && (e.key === 'f' || e.key === 'F')) {
                    e.preventDefault();
                    const s = this.$refs.search as HTMLInputElement;
                    if (s) s.focus();
                } else if (e.key === 'Enter') {
                    const one = this.selectedEntries[0];
                    if (one) this.open(one);
                } else if (e.key === 'Backspace' && !this.searching && /^db:\/\/[^/]+\//.test(this.folder)) {
                    this.navigate(parentUrl(this.folder));
                } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
                    e.preventDefault();
                    this.moveSelection(e.key, e.shiftKey);
                }
            },
            moveSelection(this: any, key: string, extend: boolean) {
                const items: AssetEntry[] = this.items;
                if (!items.length) return;
                const cols = this.layout.list ? 1 : this.layout.cols;
                const cur = this.selection.length ? items.findIndex((a) => a.uuid === this.selection[this.selection.length - 1]) : -1;
                let next = cur < 0 ? 0 : cur;
                if (cur >= 0) {
                    if (key === 'ArrowLeft') next = cur - 1;
                    if (key === 'ArrowRight') next = cur + 1;
                    if (key === 'ArrowUp') next = cur - cols;
                    if (key === 'ArrowDown') next = cur + cols;
                }
                next = Math.max(0, Math.min(items.length - 1, next));
                if (extend && this.anchor >= 0) {
                    const a = Math.min(this.anchor, next);
                    const b = Math.max(this.anchor, next);
                    this.setSelection(items.slice(a, b + 1).map((x) => x.uuid));
                } else {
                    this.anchor = next;
                    this.setSelection([items[next].uuid]);
                }
                this.scrollTo(next);
            },
            /** Scrolls an item into view (`center`: in the middle, as a ping does). */
            scrollTo(this: any, index: number, center?: boolean) {
                const box = this.$refs.items as HTMLElement;
                if (!box) return;
                const L = this.layout;
                const y = L.list ? index * 20 : Math.floor(index / L.cols) * L.cellH;
                const h = L.list ? 20 : L.cellH;
                const visible = y >= box.scrollTop && y + h <= box.scrollTop + box.clientHeight;
                if (center && !visible) box.scrollTop = Math.max(0, y + h / 2 - box.clientHeight / 2);
                else if (y < box.scrollTop) box.scrollTop = y;
                else if (y + h > box.scrollTop + box.clientHeight) box.scrollTop = y + h - box.clientHeight;
                // render the rows there now, not on the scroll event
                this.view.scrollTop = box.scrollTop;
            },
        },
        async mounted(this: any) {
            this.folder = this.ui.folder || ASSETS_ROOT;
            thumbs = new ThumbService({
                renderPreviews: () => !!this.ui.renderPreviews,
                kindOf: (u: string) => (this.byUuid[u] ? thumbKind(this.byUuid[u]) : null),
                onReady: (u: string, t: Thumb) => {
                    this.thumbMap[u] = t;
                    this.thumbVersion++;
                },
            });
            // a drag that ends anywhere (dropped elsewhere, Esc) leaves no highlight behind
            const end = () => this.endDrag();
            document.addEventListener('dragend', end, true);
            document.addEventListener('drop', end, true);
            unlistenDoc = () => {
                document.removeEventListener('dragend', end, true);
                document.removeEventListener('drop', end, true);
            };
            // the Alt drag hint: Alt / Shift as the keyboard and the pointer report them
            const mods = (e: KeyboardEvent | MouseEvent) => this.trackMods(e);
            const blur = () => this.trackMods({});
            window.addEventListener('keydown', mods, true);
            window.addEventListener('keyup', mods, true);
            window.addEventListener('blur', blur);
            unlistenMods = () => {
                window.removeEventListener('keydown', mods, true);
                window.removeEventListener('keyup', mods, true);
                window.removeEventListener('blur', blur);
            };
            await this.loadStores();
            await this.reload();
            this.syncSelection();
            // Extension › Project Browser › Import / Export Package opened this window
            this.takePackageMenu();
            this.$nextTick(() => {
                this.measure();
                const box = this.$refs.items as HTMLElement;
                if (box && (window as any).ResizeObserver) {
                    // measure on the next frame: changing the layout inside the callback makes
                    // Chromium report "ResizeObserver loop completed with undelivered notifications"
                    resize = new ResizeObserver(() => {
                        if (resizeFrame) return;
                        resizeFrame = requestAnimationFrame(() => {
                            resizeFrame = 0;
                            this.measure();
                        });
                    });
                    resize.observe(box);
                }
                this.requestThumbs();
            });
        },
    });
    app.config.compilerOptions.isCustomElement = (tag: string) => tag.startsWith('ui-');
    const vm: any = app.mount(el);
    return {
        vm,
        dispose() {
            if (resize) resize.disconnect();
            if (thumbs) thumbs.dispose();
            if (refreshTimer) clearTimeout(refreshTimer);
            if (searchTimer) clearTimeout(searchTimer);
            if (syncTimer) clearTimeout(syncTimer);
            if (pingTimer) clearTimeout(pingTimer);
            if (noticeTimer) clearTimeout(noticeTimer);
            if (unlistenMods) unlistenMods();
            cancelExpand();
            if (unlistenDoc) unlistenDoc();
            app.unmount();
        },
    };
}

const apps = new WeakMap<object, ReturnType<typeof createProjectApp>>();

module.exports = Editor.Panel.define({
    template: '<div id="app"></div>',
    style: STYLE,
    $: { app: '#app' },
    methods: {
        /** asset-db added / changed / deleted assets. */
        onAssetsChanged(this: any, uuid?: string) {
            const a = apps.get(this);
            if (a) a.vm.assetChanged(uuid);
        },
        onThumbsCleared(this: any) {
            const a = apps.get(this);
            if (a) a.vm.clearThumbs(false);
        },
        onSelectionChanged(this: any, type?: string) {
            const a = apps.get(this);
            if (a && (!type || type === 'asset')) a.vm.scheduleSync();
        },
        /**
         * 'ui-kit:touch-asset': an asset field (ui-asset) in the Inspector was
         * clicked; Cocos' Assets panel twinkles the asset, this window pings it.
         */
        /** Extension › Project Browser › Import Asset Package / Export Package. */
        onPackageMenu(this: any) {
            const a = apps.get(this);
            if (a) a.vm.takePackageMenu();
        },
        onTouchAsset(this: any, ...args: any[]) {
            const a = apps.get(this);
            const uuid = touchedUuid(args);
            if (a && uuid) a.vm.ping(uuid);
        },
    },
    ready(this: any) {
        apps.set(this, createProjectApp(this.$.app as HTMLElement));
    },
    close(this: any) {
        const a = apps.get(this);
        if (a) a.dispose();
    },
});
