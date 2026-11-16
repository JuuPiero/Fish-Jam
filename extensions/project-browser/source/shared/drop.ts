/**
 * Drop rules of the Project window: which folder accepts which drag, the
 * drop effect to ask for, nodes from the Hierarchy (prefab creation) and
 * prefab file names. Pure: tested in node.
 */
import { AssetEntry } from './search';

/** What is being dragged over the window. */
export type DragKind = 'assets' | 'nodes' | 'files' | 'unknown';

/** What a folder does with a drag: take it, or refuse it (not-allowed cursor). */
export type DropVerdict = 'accept' | 'deny';

const NODE_TYPES = ['cc.Node', 'cc.Scene'];

function isNodeType(t: any): boolean {
    return typeof t === 'string' && NODE_TYPES.indexOf(t) >= 0;
}

/**
 * Node uuids out of a drop from the Hierarchy. The Hierarchy's rows are
 * `<ui-drag-item type="cc.Node">`, so the drag info says `cc.Node`; entries of
 * `additional` carry their own type. Uuids the asset index knows are never
 * nodes. Each uuid once.
 */
export function nodeDropUuids(info: any, dataTransferValue: string, dataTransferAdditional: string, isAsset: (uuid: string) => boolean): string[] {
    const out: string[] = [];
    const add = (v: any) => {
        if (typeof v === 'string') v = v.trim();
        if (typeof v === 'string' && v && !isAsset(v) && out.indexOf(v) < 0) out.push(v);
    };
    const walk = (list: any, all: boolean) => {
        if (!Array.isArray(list)) return;
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e && (all ? !e.type || isNodeType(e.type) : isNodeType(e.type))) add(e.value);
        }
    };
    const infoIsNode = !!info && isNodeType(info.type);
    if (info) {
        walk(info.additional, infoIsNode);
        if (infoIsNode && typeof info.value === 'string') info.value.split(',').forEach(add);
    }
    let additional: any = null;
    if (dataTransferAdditional) {
        try {
            additional = JSON.parse(dataTransferAdditional);
        } catch (e) {
            additional = null;
        }
    }
    walk(additional, false);
    // a bare 'value' is a node only when the drag said so
    const additionalSaysNode = Array.isArray(additional) && additional.some((e: any) => e && isNodeType(e.type));
    if ((infoIsNode || additionalSaysNode) && dataTransferValue) dataTransferValue.split(',').forEach(add);
    return out;
}

/** Kind of a drag while it is over the window (dataTransfer data is hidden until the drop). */
export function dragKindOf(internal: boolean, info: any, types: ArrayLike<string> | null | undefined): DragKind {
    if (internal) return 'assets';
    const list: string[] = types ? Array.prototype.slice.call(types) : [];
    if (list.indexOf('Files') >= 0) return 'files';
    if (info && (isNodeType(info.type) || (Array.isArray(info.additional) && info.additional.some((e: any) => e && isNodeType(e.type))))) return 'nodes';
    if (info && (info.value || (Array.isArray(info.additional) && info.additional.length))) return 'assets';
    if (list.indexOf('value') >= 0 || list.indexOf('additional') >= 0) return 'assets';
    return 'unknown';
}

/** db://a/b/c -> db://a/b */
function parentOf(url: string): string {
    const i = url.lastIndexOf('/');
    return i > 'db://'.length ? url.slice(0, i) : url;
}

/**
 * Can these assets move into a folder? Not into themselves or their own
 * children, and not where every one of them already is.
 */
export function moveVerdict(list: AssetEntry[], folderUrl: string): DropVerdict {
    const movable = list.filter((a) => !!a && !a.parent && a.uuid.indexOf('pkg:') !== 0);
    if (!movable.length) return 'deny';
    for (let i = 0; i < movable.length; i++) {
        const a = movable[i];
        if (a.url === folderUrl || folderUrl.indexOf(a.url + '/') === 0) return 'deny';
    }
    if (movable.every((a) => parentOf(a.url) === folderUrl)) return 'deny';
    return 'accept';
}

/**
 * The dropEffect to ask for. A drop only happens when the effect is one the
 * source allowed (the Hierarchy may allow 'copy' only, the Assets panel 'move').
 */
export function pickDropEffect(effectAllowed: string | undefined, preferred: 'move' | 'copy' | 'link'): 'move' | 'copy' | 'link' {
    const allowed = (effectAllowed || 'all').toLowerCase();
    if (allowed === 'all' || allowed === 'uninitialized' || allowed === 'none') return preferred;
    const can = (e: string) => allowed === e || allowed.indexOf(e) >= 0;
    if (can(preferred)) return preferred;
    if (can('copy')) return 'copy';
    if (can('move')) return 'move';
    return 'link';
}

/** A node name as a file name (characters Windows refuses become '_'). */
export function prefabBaseName(nodeName: string): string {
    const n = String(nodeName || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/^[\s.]+|[\s.]+$/g, '');
    return n || 'Node';
}

/** Unity-style unique file names: "Cube.prefab", then "Cube 1.prefab", "Cube 2.prefab"... */
export function prefabFileName(base: string, attempt: number): string {
    return (attempt > 0 ? base + ' ' + attempt : base) + '.prefab';
}

/** The first free prefab url in a folder; `taken` holds urls in use (case-insensitive). */
export function uniquePrefabUrl(folderUrl: string, nodeName: string, taken: (url: string) => boolean, maxAttempts = 1000): string {
    const base = prefabBaseName(nodeName);
    for (let i = 0; i < maxAttempts; i++) {
        const url = folderUrl + '/' + prefabFileName(base, i);
        if (!taken(url)) return url;
    }
    return folderUrl + '/' + base + ' ' + Date.now() + '.prefab';
}

// ------------------------------------------------------------------ popups

export interface PopupPlacement {
    /** Open above the anchor. */
    up: boolean;
    /** Max height in px (the list scrolls inside it). */
    maxHeight: number;
}

/**
 * Where a dropdown fits: below the anchor unless the room there is short and
 * there is more room above. `below` / `above` are the free pixels between the
 * anchor and the edge of the visible panel; `content` the list's full height.
 */
export function popupPlacement(below: number, above: number, content: number, minHeight = 80): PopupPlacement {
    const b = Math.max(0, Math.floor(below));
    const a = Math.max(0, Math.floor(above));
    const up = content > b && a > b;
    const room = up ? a : b;
    return { up, maxHeight: Math.max(Math.min(room, Math.max(content, 0)), Math.min(minHeight, room)) };
}
