import * as fs from 'fs';
import * as path from 'path';
import { ManifestAssetRef } from './types';

/*
 * Uuid plumbing shared by the scanners: the compressed uuids Cocos writes as a custom component's
 * `__type__`, the project's asset uuids (from .meta files) and where each asset ended up in the build.
 */

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Cocos's own `compressUuid(uuid, min = true)`: the first 5 hex digits as-is, then every 3 hex digits
 * (12 bits) as two base64 characters — 23 characters in all. A script's component class serializes as
 * this (e.g. `dd0a767d-…` → `dd0a7Z9TVR…`).
 */
export function compressUuid(uuid: string): string {
    const hex = uuid.replace(/-/g, '');
    if (!/^[0-9a-fA-F]{32}$/.test(hex)) return uuid;
    let out = hex.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const value = parseInt(hex.slice(i, i + 3), 16);
        out += BASE64_KEYS[value >> 6] + BASE64_KEYS[value & 63];
    }
    return out;
}

/** The `uuid` in `<file>.meta`, if there is one. */
export function readMetaUuid(file: string): string | undefined {
    try {
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
        return typeof meta?.uuid === 'string' ? meta.uuid : undefined;
    } catch {
        return undefined;
    }
}

function walk(dir: string, visit: (file: string) => void): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath, visit);
        else if (entry.isFile()) visit(fullPath);
    }
}

export interface AssetInfo {
    name: string;
    path: string;
}

/**
 * Every asset uuid under assets/ → its source file: main assets by their own uuid, sub-assets
 * (`<uuid>@6c48a` = an image's Texture2D, `@f9941` its SpriteFrame, …) by theirs.
 */
export function scanAssetMetas(assetsDir: string): Map<string, AssetInfo> {
    const assets = new Map<string, AssetInfo>();
    walk(assetsDir, (file) => {
        if (!file.endsWith('.meta')) return;
        let meta: any;
        try {
            meta = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            return;
        }
        if (typeof meta?.uuid !== 'string') return;
        const source = file.slice(0, -'.meta'.length);
        const info: AssetInfo = {
            name: path.basename(source, path.extname(source)),
            path: path.relative(assetsDir, source).split(path.sep).join('/'),
        };
        assets.set(meta.uuid, info);
        for (const sub of Object.values<any>(meta.subMetas ?? {})) {
            if (typeof sub?.uuid === 'string') assets.set(sub.uuid, info);
        }
    });
    return assets;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Main asset uuid → its native file in the web-mobile build (`assets/<bundle>/native/ab/<uuid>[.<md5>].png`),
 * relative to the build folder: what the dashboard previews as a field's current image/audio.
 */
export function scanBuildNatives(webMobileDir: string): Map<string, string> {
    const natives = new Map<string, string>();
    walk(path.join(webMobileDir, 'assets'), (file) => {
        const relative = path.relative(webMobileDir, file).split(path.sep).join('/');
        if (!/\/native\//.test(relative)) return;
        const match = UUID_PATTERN.exec(path.basename(file));
        if (match && !natives.has(match[0])) natives.set(match[0], relative);
    });
    return natives;
}

export interface AssetLookup {
    metas: Map<string, AssetInfo>;
    natives: Map<string, string>;
}

/** A serialized `{"__uuid__": "…"}` reference → what the manifest says about that asset. */
export function describeAssetRef(raw: any, lookup: AssetLookup): ManifestAssetRef | null {
    const uuid = raw && typeof raw === 'object' && typeof raw.__uuid__ === 'string' ? raw.__uuid__ : undefined;
    if (!uuid) return null;
    const info = lookup.metas.get(uuid);
    const buildPath = lookup.natives.get(uuid.split('@')[0]);
    return {
        uuid,
        ...(info ? { name: info.name, path: info.path } : {}),
        ...(buildPath ? { buildPath } : {}),
    };
}
