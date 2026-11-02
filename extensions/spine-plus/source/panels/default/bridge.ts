/**
 * What the Preview panel needs from the editor, behind an interface so the
 * panel can also run in a plain browser (tests/preview) with fake data.
 */
import type { SpineSource } from '../../../assets/core/spine-runtime';

export interface LoadedFiles {
    name: string;
    uuid: string;
    source: SpineSource;
}

/** What a selected node's SkeletonAnimation shows. */
export interface NodeSkeleton {
    assetUuid: string;
    skin: string;
    animation: string;
    loop: boolean;
}

export interface Bridge {
    /** Reads a spine-data asset's skeleton, atlas and page images. */
    load(assetUuid: string): Promise<LoadedFiles>;
    /** Calls back with spine-data asset uuids / node skeletons as the editor selection changes. */
    onSelection(cb: (sel: { asset?: string; node?: NodeSkeleton }) => void): () => void;
    /** The asset to open first (from the Assets context menu), if any. */
    pending(): Promise<string | null>;
    /** Loads saved panel settings / saves them. */
    loadSettings(): Promise<any>;
    saveSettings(settings: any): void;
}

export function loadImage(bytes: Uint8Array, type = 'image/png'): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer], { type }));
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('image could not be decoded'));
        };
        img.src = url;
    });
}

/** Page names in an atlas (the image file names): the first line after a blank one, as spine-core reads it. */
export function atlasPages(atlasText: string): string[] {
    const pages: string[] = [];
    let expectPage = true;
    for (const raw of atlasText.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) {
            expectPage = true;
        } else if (expectPage) {
            pages.push(line);
            expectPage = false;
        }
    }
    return pages;
}

function nodeSkeletonFromDump(dump: any): NodeSkeleton | null {
    for (const comp of dump?.__comps__ ?? []) {
        if (comp?.type !== 'SkeletonAnimation') continue;
        const v = comp.value ?? {};
        const asset = v.skeletonData?.value?.uuid;
        if (!asset) return null;
        return {
            assetUuid: asset,
            skin: v.skin?.value ?? '',
            animation: v.animation?.value ?? '',
            loop: v.loop?.value ?? true,
        };
    }
    return null;
}

/** The real editor. */
export function editorBridge(): Bridge {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const request = (pkg: string, msg: string, ...args: any[]) => (Editor.Message.request as any)(pkg, msg, ...args);

    const PKG = 'spine-plus';
    return {
        async load(uuid: string): Promise<LoadedFiles> {
            const info = await request('asset-db', 'query-asset-info', uuid);
            if (!info || !info.file) throw new Error('Asset not found.');
            if (info.importer !== 'spine-data') throw new Error(`${info.name} is not a Spine export (spine-data).`);
            const meta = await request('asset-db', 'query-asset-meta', uuid).catch(() => null);
            const file: string = info.file;
            const dir = path.dirname(file);
            let atlasFile = '';
            const atlasUuid = meta?.userData?.atlasUuid;
            if (atlasUuid) {
                const a = await request('asset-db', 'query-asset-info', atlasUuid).catch(() => null);
                if (a?.file) atlasFile = a.file;
            }
            if (!atlasFile) {
                const base = path.basename(file).replace(/\.(json|skel)$/i, '');
                const guess = fs.readdirSync(dir).find((f) => f.startsWith(base) && /\.atlas(\.txt)?$/i.test(f))
                    ?? fs.readdirSync(dir).find((f) => /\.atlas(\.txt)?$/i.test(f));
                if (guess) atlasFile = path.join(dir, guess);
            }
            if (!atlasFile) throw new Error('No atlas found next to the skeleton.');
            const atlasText = fs.readFileSync(atlasFile, 'utf8');
            const images = new Map<string, HTMLImageElement | null>();
            for (const page of atlasPages(atlasText)) {
                const p = path.join(path.dirname(atlasFile), page);
                try {
                    images.set(page, await loadImage(new Uint8Array(fs.readFileSync(p)), /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'image/png'));
                } catch {
                    images.set(page, null);
                }
            }
            const isJson = /\.json$/i.test(file);
            return {
                name: info.name,
                uuid,
                source: {
                    json: isJson ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
                    binary: isJson ? null : new Uint8Array(fs.readFileSync(file)),
                    atlasText,
                    pageImage: (name) => images.get(name) ?? null,
                },
            };
        },

        onSelection(cb) {
            const onSelect = async (type: string, uuids: string[]) => {
                const uuid = uuids?.[uuids.length - 1];
                if (!uuid) return;
                try {
                    if (type === 'asset') {
                        const info = await request('asset-db', 'query-asset-info', uuid);
                        if (info?.importer === 'spine-data') cb({ asset: uuid });
                    } else if (type === 'node') {
                        const dump = await request('scene', 'query-node', uuid);
                        const node = nodeSkeletonFromDump(dump);
                        if (node) cb({ node });
                    }
                } catch {
                    // selection of something we can't read
                }
            };
            const protectedApi = (Editor.Message as any).__protected__;
            const add = protectedApi?.addBroadcastListener ?? (Editor.Message as any).addBroadcastListener;
            const remove = protectedApi?.removeBroadcastListener ?? (Editor.Message as any).removeBroadcastListener;
            add?.call(protectedApi ?? Editor.Message, 'selection:select', onSelect);
            return () => remove?.call(protectedApi ?? Editor.Message, 'selection:select', onSelect);
        },

        async pending() {
            try {
                const fromMenu = await request(PKG, 'take-pending-preview');
                if (fromMenu) return fromMenu;
            } catch {
                // nothing pending
            }
            // Otherwise start with the selected spine asset, if any.
            try {
                const assets: string[] = Editor.Selection.getSelected('asset');
                for (const uuid of assets.slice().reverse()) {
                    const info = await request('asset-db', 'query-asset-info', uuid);
                    if (info?.importer === 'spine-data') return uuid;
                }
            } catch {
                // no selection
            }
            return null;
        },

        async loadSettings() {
            try {
                return await Editor.Profile.getConfig(PKG, 'preview');
            } catch {
                return null;
            }
        },

        saveSettings(settings: any) {
            Editor.Profile.setConfig(PKG, 'preview', settings, 'global').catch?.(() => undefined);
        },
    };
}
