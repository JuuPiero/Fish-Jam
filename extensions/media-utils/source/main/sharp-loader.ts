/**
 * Loads the `sharp` image library that ships with Cocos Creator (3.8.6 bundles
 * sharp 0.32.6 / libvips 8.14.5 for its own image importer). Using Cocos' copy
 * means no native module of our own, so no Electron ABI mismatch and nothing
 * to install.
 *
 * In the editor's main process `process.resourcesPath/app.asar/node_modules/sharp`
 * resolves its JS dependencies inside app.asar, and Electron redirects the
 * native .node file to app.asar.unpacked. Tests outside Electron set
 * MEDIA_UTILS_SHARP to the unpacked folder (see tests/run.js).
 */
import * as path from 'path';

export interface SharpInfo {
    sharp: any | null;
    path: string;
    version: string;
    vips: string;
    error: string;
    /** Output formats this build can write. */
    formats: Record<string, boolean>;
}

let cached: SharpInfo | null = null;

function candidates(): string[] {
    const list: string[] = [];
    if (process.env.MEDIA_UTILS_SHARP) list.push(process.env.MEDIA_UTILS_SHARP);
    const res = (process as any).resourcesPath as string | undefined;
    if (res) {
        list.push(path.join(res, 'app.asar', 'node_modules', 'sharp'));
        list.push(path.join(res, 'app.asar.unpacked', 'node_modules', 'sharp'));
    }
    list.push('sharp');
    return list;
}

// A plain `require` that bundlers leave alone (the path is only known at runtime).
const dynamicRequire: NodeRequire = require;

export function loadSharp(): SharpInfo {
    if (cached && cached.sharp) return cached;
    const errors: string[] = [];
    for (const p of candidates()) {
        try {
            const sharp = dynamicRequire(p);
            if (typeof sharp !== 'function') throw new Error('not the sharp module');
            const formats: Record<string, boolean> = {};
            for (const f of ['png', 'jpeg', 'webp', 'avif', 'heif', 'gif', 'tiff']) {
                formats[f] = !!(sharp.format && sharp.format[f] && sharp.format[f].output && sharp.format[f].output.buffer);
            }
            const versions = sharp.versions || {};
            let version = '';
            try {
                version = dynamicRequire(path.join(p === 'sharp' ? path.dirname(dynamicRequire.resolve('sharp/package.json')) : p, 'package.json')).version;
            } catch (e) {
                version = versions.sharp || '';
            }
            cached = { sharp, path: p, version, vips: versions.vips || '', error: '', formats };
            return cached;
        } catch (e: any) {
            errors.push(`${p}: ${e && e.message ? e.message.split('\n')[0] : e}`);
        }
    }
    cached = { sharp: null, path: '', version: '', vips: '', error: 'Could not load sharp.\n' + errors.join('\n'), formats: {} };
    return cached;
}

export function requireSharp(): any {
    const info = loadSharp();
    if (!info.sharp) throw new Error(info.error);
    return info.sharp;
}
