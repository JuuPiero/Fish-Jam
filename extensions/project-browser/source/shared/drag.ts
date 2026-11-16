/**
 * Drag data in the shape Cocos' drop targets read: ui-drag-item puts
 * { type, value, additional } into Editor.UI.DragArea.currentDragInfo, and
 * the Scene, Hierarchy and Inspector read it (entries may carry `extends`
 * and `subAssets`, as the Assets panel's do). Pure: tested in node.
 */
import { AssetEntry } from './search';

export interface DragEntry {
    type: string;
    value: string;
    name: string;
    extends?: string[];
    subAssets?: Record<string, { type: string; value: string; name: string }>;
}

export interface DragPayload {
    /** ui-drag-item `type`: the first asset's type. */
    type: string;
    /** ui-drag-item `value` / dataTransfer 'value': the uuids, comma-separated. */
    value: string;
    /** ui-drag-item `types`: every type a drop target may accept (types, extends, sub-asset types). */
    types: string;
    additional: DragEntry[];
}

/** Sub-asset types of an image that are listed as entries of their own (see dragPayload). */
const FLAT_SUB_TYPES = ['cc.SpriteFrame', 'cc.Texture2D', 'cc.TextureCube'];

function isImage(a: AssetEntry): boolean {
    return a.type === 'cc.ImageAsset' || a.importer === 'image';
}

/** Drag data for some assets (each uuid once). */
export function dragPayload(list: AssetEntry[]): DragPayload {
    const additional: DragEntry[] = [];
    const mains: string[] = [];
    const types: string[] = [];
    const seen: Record<string, boolean> = {};
    const addType = (t?: string) => {
        if (t && types.indexOf(t) < 0) types.push(t);
    };
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a || seen[a.uuid] || a.uuid.indexOf('pkg:') === 0) continue;
        seen[a.uuid] = true;
        const type = a.isDirectory ? 'cc.Asset' : a.type || 'cc.Asset';
        const e: DragEntry = { type, value: a.uuid, name: a.name };
        addType(type);
        if (a.extends && a.extends.length) {
            e.extends = a.extends.slice();
            a.extends.forEach(addType);
        }
        const flat: DragEntry[] = [];
        if (a.subAssets && a.subAssets.length) {
            e.subAssets = {};
            for (let k = 0; k < a.subAssets.length; k++) {
                const s: AssetEntry = a.subAssets[k];
                const key = s.uuid.indexOf('@') >= 0 ? s.uuid.slice(s.uuid.indexOf('@') + 1) : s.name;
                e.subAssets[key] = { type: s.type, value: s.uuid, name: s.name };
                addType(s.type);
                // an image's texture / sprite frame also as their own entries, after the image: an
                // Inspector field (ui-asset) matches top-level entries, so the image itself can be
                // dropped on a SpriteFrame or Texture2D field, like in Unity
                if (isImage(a) && FLAT_SUB_TYPES.indexOf(s.type) >= 0 && !seen[s.uuid]) {
                    seen[s.uuid] = true;
                    flat.push({ type: s.type, value: s.uuid, name: s.name });
                }
            }
        }
        additional.push(e);
        mains.push(a.uuid);
        for (let k = 0; k < flat.length; k++) additional.push(flat[k]);
    }
    return {
        type: additional.length ? additional[0].type : '',
        // the dragged assets themselves (an image's listed parts are not "dragged")
        value: mains.join(','),
        types: types.join(','),
        additional,
    };
}

/** Asset uuids out of a drop (ours or the Assets panel's): each once, main uuid kept as is. */
export function dropUuids(info: any, dataTransferValue?: string, dataTransferAdditional?: string): string[] {
    const out: string[] = [];
    const add = (v: any) => {
        if (typeof v === 'string' && v && out.indexOf(v) < 0) out.push(v);
    };
    const walkList = (list: any) => {
        if (Array.isArray(list)) for (let i = 0; i < list.length; i++) if (list[i]) add(list[i].value);
    };
    if (info) {
        walkList(info.additional);
        if (typeof info.value === 'string') info.value.split(',').forEach((s: string) => add(s.trim()));
    }
    if (dataTransferAdditional) {
        try {
            walkList(JSON.parse(dataTransferAdditional));
        } catch (e) {
            // not JSON
        }
    }
    if (dataTransferValue) dataTransferValue.split(',').forEach((s) => add(s.trim()));
    // "img@sprite" listed beside "img" is the image's own sprite frame (dragPayload adds those for
    // Inspector fields): moving or adding the image covers it. A sub-asset dragged on its own stays.
    return out.filter((u) => {
        const at = u.indexOf('@');
        return at < 0 || out.indexOf(u.slice(0, at)) < 0;
    });
}
