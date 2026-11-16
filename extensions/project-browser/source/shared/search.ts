/**
 * Unity Project-window search: plain words match names, `t:Type` filters by
 * asset type, `l:Label` by label, `*.png` globs the full file name, quotes
 * keep phrases together. Pure: tested in node.
 */

/** What the browser knows about an asset (a subset of asset-db's AssetInfo). */
export interface AssetEntry {
    uuid: string;
    url: string;
    name: string;
    displayName?: string;
    type: string;
    importer: string;
    isDirectory: boolean;
    readonly?: boolean;
    visible?: boolean;
    extends?: string[];
    file?: string;
    /** Sub-assets (FBX meshes and clips, an image's texture and sprite frame...). */
    subAssets?: AssetEntry[];
    /** For sub-assets: the main asset's uuid. */
    parent?: string;
}

export interface SearchQuery {
    words: string[];
    types: string[];
    labels: string[];
    globs: RegExp[];
    /** Nothing to filter on. */
    empty: boolean;
}

/** Splits the search text into tokens, keeping "quoted phrases" whole. */
export function tokenize(text: string): string[] {
    const out: string[] = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text || ''))) {
        if (m[1] !== undefined) {
            if (m[1].trim()) out.push(m[1].trim());
        } else out.push(m[2]);
    }
    return out;
}

function globToRegExp(glob: string): RegExp {
    const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + esc + '$', 'i');
}

export function parseQuery(text: string): SearchQuery {
    const q: SearchQuery = { words: [], types: [], labels: [], globs: [], empty: true };
    const tokens = tokenize(text);
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const lower = t.toLowerCase();
        if (lower.indexOf('t:') === 0 && t.length > 2) q.types.push(t.slice(2));
        else if (lower.indexOf('l:') === 0 && t.length > 2) q.labels.push(t.slice(2));
        else if (t.indexOf('*') >= 0 || t.indexOf('?') >= 0) q.globs.push(globToRegExp(t));
        else q.words.push(lower);
    }
    q.empty = !q.words.length && !q.types.length && !q.labels.length && !q.globs.length;
    return q;
}

/** Writes a query back as text (for the type / label dropdowns). */
export function toggleToken(text: string, prefix: 't:' | 'l:', value: string): string {
    const tokens = tokenize(text);
    const token = prefix + (value.indexOf(' ') >= 0 ? '"' + value + '"' : value);
    const idx = tokens.findIndex((t) => t.toLowerCase() === (prefix + value).toLowerCase());
    if (idx >= 0) tokens.splice(idx, 1);
    else tokens.push(token);
    return tokens.map((t) => (t.indexOf(' ') >= 0 && t.charAt(0) !== '"' && t.indexOf(':') < 0 ? '"' + t + '"' : t)).join(' ');
}

// ------------------------------------------------------------------ types

export interface TypeFilter {
    /** Unity's name, used after t: */
    name: string;
    test: (a: AssetEntry) => boolean;
}

const has = (list: string[], v: string) => list.indexOf(v) >= 0;
const ext = (a: AssetEntry) => {
    const m = /\.([^./]+)$/.exec(a.name || '');
    return m ? m[1].toLowerCase() : '';
};

/** Unity type names → Cocos importers / types. */
export const TYPE_FILTERS: TypeFilter[] = [
    { name: 'AnimationClip', test: (a) => a.type === 'cc.AnimationClip' },
    { name: 'AnimatorController', test: (a) => /\.controller\.json$/i.test(a.name) || a.type === 'cc.animation.AnimationGraph' },
    { name: 'AudioClip', test: (a) => a.type === 'cc.AudioClip' },
    { name: 'Folder', test: (a) => a.isDirectory },
    { name: 'Font', test: (a) => has(['cc.TTFFont', 'cc.BitmapFont', 'cc.LabelAtlas'], a.type) },
    { name: 'Json', test: (a) => a.type === 'cc.JsonAsset' },
    { name: 'Material', test: (a) => a.type === 'cc.Material' },
    { name: 'Mesh', test: (a) => a.type === 'cc.Mesh' },
    { name: 'Model', test: (a) => !a.isDirectory && !a.parent && (has(['fbx', 'gltf'], a.importer) || has(['fbx', 'gltf', 'glb', 'obj'], ext(a))) },
    { name: 'PhysicsMaterial', test: (a) => a.type === 'cc.PhysicsMaterial' },
    { name: 'Prefab', test: (a) => a.importer === 'prefab' },
    { name: 'Scene', test: (a) => a.type === 'cc.SceneAsset' || a.importer === 'scene' },
    { name: 'Script', test: (a) => has(['typescript', 'javascript'], a.importer) || (!a.isDirectory && /\.cs$/i.test(a.name || '')) },
    { name: 'Shader', test: (a) => has(['effect', 'effect-header'], a.importer) || a.type === 'cc.EffectAsset' },
    { name: 'Sprite', test: (a) => a.type === 'cc.SpriteFrame' || a.importer === 'sprite-frame' },
    { name: 'TextAsset', test: (a) => a.type === 'cc.TextAsset' },
    {
        name: 'Texture',
        test: (a) => has(['image', 'texture', 'texture-cube', 'erp-texture-cube', 'render-texture'], a.importer) || has(['cc.ImageAsset', 'cc.Texture2D', 'cc.TextureCube', 'cc.RenderTexture'], a.type),
    },
];

/** Does an asset match one t: value (a Unity name, or part of a cc type name)? */
export function matchesType(a: AssetEntry, t: string): boolean {
    const lower = t.toLowerCase();
    for (let i = 0; i < TYPE_FILTERS.length; i++) if (TYPE_FILTERS[i].name.toLowerCase() === lower) return TYPE_FILTERS[i].test(a);
    // any other word: part of the engine type or the importer (t:Spine, t:cc.Material)
    return (a.type || '').toLowerCase().indexOf(lower) >= 0 || (a.importer || '').toLowerCase() === lower;
}

/** Name shown in the browser: Unity hides the extension. */
export function displayName(a: AssetEntry): string {
    if (a.displayName && a.parent) return a.displayName;
    if (a.isDirectory) return a.name;
    const n = a.name || '';
    // keep compound extensions readable: "Controls.inputactions.json" -> "Controls.inputactions"
    const dot = n.lastIndexOf('.');
    return dot > 0 ? n.slice(0, dot) : n;
}

/** Short type label for list mode. */
export function typeLabel(a: AssetEntry): string {
    if (a.isDirectory) return 'Folder';
    for (let i = 0; i < TYPE_FILTERS.length; i++) {
        const f = TYPE_FILTERS[i];
        if (f.name !== 'Folder' && f.test(a)) return f.name;
    }
    // files Cocos doesn't know: "XYZ File", like a file manager
    const importer = a.importer || '';
    if (importer === '*' || importer === '' || importer === 'unknown') {
        const m = /\.([A-Za-z0-9_+-]{1,16})$/.exec(a.name || '');
        if (m) return m[1].toUpperCase() + ' File';
    }
    return (a.type || a.importer || '').replace(/^cc\./, '');
}

// ------------------------------------------------------------------ matching

export type LabelLookup = (uuid: string) => string[];

/** Does an asset pass the query? */
export function matches(a: AssetEntry, q: SearchQuery, labelsOf: LabelLookup): boolean {
    if (q.empty) return true;
    const name = (a.name || '').toLowerCase();
    const shown = displayName(a).toLowerCase();
    for (let i = 0; i < q.words.length; i++) if (name.indexOf(q.words[i]) < 0 && shown.indexOf(q.words[i]) < 0) return false;
    for (let i = 0; i < q.globs.length; i++) if (!q.globs[i].test(a.name || '')) return false;
    if (q.types.length) {
        let ok = false;
        for (let i = 0; i < q.types.length && !ok; i++) ok = matchesType(a, q.types[i]);
        if (!ok) return false;
    }
    if (q.labels.length) {
        const ls = labelsOf(a.parent || a.uuid).map((l) => l.toLowerCase());
        let ok = false;
        for (let i = 0; i < q.labels.length && !ok; i++) ok = ls.indexOf(q.labels[i].toLowerCase()) >= 0;
        if (!ok) return false;
    }
    return true;
}

/**
 * Runs a query over assets: main assets that match, plus sub-assets that
 * match a type filter (t:AnimationClip finds the clips inside an FBX, like Unity).
 */
export function search(assets: AssetEntry[], q: SearchQuery, labelsOf: LabelLookup, limit = 5000): AssetEntry[] {
    const out: AssetEntry[] = [];
    for (let i = 0; i < assets.length && out.length < limit; i++) {
        const a = assets[i];
        if (a.visible === false) continue;
        if (matches(a, q, labelsOf)) out.push(a);
        else if (q.types.length && a.subAssets) {
            for (let k = 0; k < a.subAssets.length; k++) if (matches(a.subAssets[k], q, labelsOf)) out.push(a.subAssets[k]);
        }
    }
    return sortAssets(out);
}

/** Folders first, then by name (natural, case-insensitive), like Unity. */
export function sortAssets(list: AssetEntry[]): AssetEntry[] {
    return list.slice().sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return displayName(a).localeCompare(displayName(b), undefined, { numeric: true, sensitivity: 'base' });
    });
}

// ------------------------------------------------------------------ labels

export type LabelStore = Record<string, string[]>;

export function allLabels(store: LabelStore): string[] {
    const set: Record<string, boolean> = {};
    Object.keys(store).forEach((k) => (store[k] || []).forEach((l) => (set[l] = true)));
    return Object.keys(set).sort((a, b) => a.localeCompare(b));
}

/** Adds or removes a label on several assets; returns a new store (empty entries dropped). */
export function setLabel(store: LabelStore, uuids: string[], label: string, on: boolean): LabelStore {
    const out: LabelStore = {};
    Object.keys(store).forEach((k) => (out[k] = (store[k] || []).slice()));
    const l = label.trim();
    if (!l) return out;
    for (let i = 0; i < uuids.length; i++) {
        const list = out[uuids[i]] || [];
        const at = list.indexOf(l);
        if (on && at < 0) list.push(l);
        if (!on && at >= 0) list.splice(at, 1);
        if (list.length) out[uuids[i]] = list.sort((a, b) => a.localeCompare(b));
        else delete out[uuids[i]];
    }
    return out;
}

/** Drops labels of assets that no longer exist. */
export function pruneLabels(store: LabelStore, exists: (uuid: string) => boolean): LabelStore {
    const out: LabelStore = {};
    Object.keys(store).forEach((k) => {
        if (exists(k) && store[k] && store[k].length) out[k] = store[k].slice();
    });
    return out;
}
