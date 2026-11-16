/**
 * Folder colours: a tint for a folder's icon, chosen from a small muted palette or
 * any custom colour. Stored per folder uuid (renames and moves keep it) in the
 * project profile. Pure: tested in node.
 */

export type FolderColorStore = Record<string, string>;

/** The palette of the Folder Color menu: muted tones readable on dark and light themes. */
export const FOLDER_COLORS: { name: string; hex: string }[] = [
    { name: 'Red', hex: '#E06C6C' },
    { name: 'Orange', hex: '#E39A4F' },
    { name: 'Yellow', hex: '#D9BE4A' },
    { name: 'Green', hex: '#6DB86D' },
    { name: 'Teal', hex: '#4FB2A8' },
    { name: 'Blue', hex: '#5B9BE0' },
    { name: 'Purple', hex: '#9B7BDF' },
    { name: 'Pink', hex: '#DE7BB0' },
    { name: 'Brown', hex: '#B08360' },
    { name: 'Gray', hex: '#8A9099' },
];

/** #RGB or #RRGGBB, normalised to upper-case #RRGGBB; null otherwise. */
export function normalizeColor(c: unknown): string | null {
    if (typeof c !== 'string') return null;
    let h = c.trim();
    if (h.charAt(0) === '#') h = h.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toUpperCase() : null;
}

/** A store read back from the profile: only string keys with valid colours. */
export function cleanFolderColors(raw: unknown): FolderColorStore {
    const out: FolderColorStore = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const keys = Object.keys(raw as object);
    for (let i = 0; i < keys.length; i++) {
        const c = normalizeColor((raw as any)[keys[i]]);
        if (keys[i] && c) out[keys[i]] = c;
    }
    return out;
}

/** The store with these folders set to `color` (null or '' removes their colour). */
export function setFolderColors(store: FolderColorStore, uuids: string[], color: string | null): FolderColorStore {
    const out: FolderColorStore = Object.assign({}, store);
    const c = color ? normalizeColor(color) : null;
    for (let i = 0; i < uuids.length; i++) {
        const u = uuids[i];
        if (!u) continue;
        if (c) out[u] = c;
        else delete out[u];
    }
    return out;
}

/** Drops the colours of folders that no longer exist. */
export function pruneFolderColors(store: FolderColorStore, exists: (uuid: string) => boolean): FolderColorStore {
    const out: FolderColorStore = {};
    const keys = Object.keys(store);
    for (let i = 0; i < keys.length; i++) if (exists(keys[i])) out[keys[i]] = store[keys[i]];
    return out;
}

/** The colour the given folders share, '' when none, or null when they differ. */
export function sharedColor(store: FolderColorStore, uuids: string[]): string | null {
    let c: string | undefined;
    for (let i = 0; i < uuids.length; i++) {
        const v = store[uuids[i]] || '';
        if (c === undefined) c = v;
        else if (c !== v) return null;
    }
    return c === undefined ? '' : c;
}
