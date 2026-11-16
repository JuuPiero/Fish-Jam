/**
 * media-utils main process: opens the two panels, resolves Assets-panel
 * selections, runs the image pipeline with Cocos' own sharp, and writes
 * results (overwrite with backup, or copy through asset-db).
 *
 * Audio is decoded, edited and encoded in the Audio Editor panel; the main
 * process only reads source files and writes the encoded bytes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AssetDbApi, OutputWriter, SaveRequest } from './main/output';
import { loadSharp, requireSharp } from './main/sharp-loader';
import { mimeOf, readStats, runImagePipeline } from './main/image-pipeline';
import { ImageOptions, SaveOptions, extensionFor, extOf, isAudioPath, isImagePath, mergeImageOptions } from './shared/image/options';

const PKG = 'media-utils';
type Kind = 'image' | 'audio';

// ------------------------------------------------------------------ asset-db

function req(target: string, message: string, ...args: any[]): Promise<any> {
    return (Editor.Message.request as any)(target, message, ...args);
}

const assetDb: AssetDbApi = {
    async urlOf(file: string) {
        const lookup = async (p: string): Promise<string | null> => {
            try {
                const info = await req('asset-db', 'query-asset-info', p);
                if (info && info.url) return info.url;
            } catch (e) {
                // not an asset
            }
            try {
                return (await req('asset-db', 'query-url', p)) || null;
            } catch (e) {
                return null;
            }
        };
        const own = await lookup(file);
        if (own) return own;
        // A file that does not exist yet: url of its folder + its name.
        const dirUrl = await lookup(path.dirname(file));
        if (dirUrl) return dirUrl.replace(/\/$/, '') + '/' + path.basename(file);
        return null;
    },
    async refresh(url: string) {
        await req('asset-db', 'refresh-asset', url);
    },
    async move(fromUrl: string, toUrl: string) {
        const info = await req('asset-db', 'move-asset', fromUrl, toUrl);
        if (!info) throw new Error(`asset-db could not move ${fromUrl} to ${toUrl}.`);
    },
    async importFile(file: string, url: string) {
        const info = await req('asset-db', 'import-asset', file, url);
        return info ? info.url || url : null;
    },
    async availableUrl(url: string) {
        try {
            return (await req('asset-db', 'generate-available-url', url)) || url;
        } catch (e) {
            return url;
        }
    },
    async pathOf(url: string) {
        try {
            return await req('asset-db', 'query-path', url);
        } catch (e) {
            return null;
        }
    },
};

let writer: OutputWriter | null = null;
function output(): OutputWriter {
    if (!writer) writer = new OutputWriter(Editor.Project.path, assetDb);
    return writer;
}

/** Absolute file paths from uuids, db:// urls, file:// urls or paths. */
async function resolveItems(items: string[]): Promise<string[]> {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (p: string) => {
        const key = process.platform === 'win32' ? p.toLowerCase() : p;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(p);
        }
    };
    for (const raw of items || []) {
        if (typeof raw !== 'string' || !raw.trim()) continue;
        let item = raw.trim();
        if (item.startsWith('file://')) {
            try {
                item = require('url').fileURLToPath(item);
            } catch (e) {
                continue;
            }
        }
        if (path.isAbsolute(item) && fs.existsSync(item)) {
            add(item);
            continue;
        }
        try {
            const info = await req('asset-db', 'query-asset-info', item.split('@')[0]);
            if (info && info.file && !info.isDirectory) add(info.file);
        } catch (e) {
            // stale uuid
        }
    }
    return out;
}

function ofKind(paths: string[], kind: Kind): string[] {
    return paths.filter((p) => (kind === 'image' ? isImagePath(p) : isAudioPath(p)));
}

const pending: Record<Kind, string[]> = { image: [], audio: [] };

function panelId(kind: Kind): string {
    return kind === 'image' ? PKG + '.image-tools' : PKG + '.audio-editor';
}

function toBuffer(bytes: any): Buffer {
    if (Buffer.isBuffer(bytes)) return bytes;
    if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
    if (bytes && bytes.type === 'Buffer' && Array.isArray(bytes.data)) return Buffer.from(bytes.data);
    if (typeof bytes === 'string') return Buffer.from(bytes, 'base64');
    if (bytes && typeof bytes === 'object' && typeof bytes.length === 'number') return Buffer.from(Array.from(bytes as ArrayLike<number>));
    throw new Error('Expected binary data.');
}

function fileInfo(file: string) {
    const stat = fs.statSync(file);
    return { path: file, name: path.basename(file), ext: extOf(file), size: stat.size, mtime: stat.mtimeMs };
}

export const methods: { [name: string]: (...args: any[]) => any } = {
    openImageTools() {
        return Editor.Panel.open(panelId('image'));
    },

    openAudioEditor() {
        return Editor.Panel.open(panelId('audio'));
    },

    async openDocs() {
        try {
            await require('electron').shell.openPath(path.join(__dirname, '..', 'README.md'));
        } catch (e) {
            console.error('[Media Utils] Could not open the README:', e);
        }
    },

    /** From the Assets panel menu: open a panel with these assets. */
    async openAssets(kind: Kind, items: string[]) {
        const files = ofKind(await resolveItems(items || []), kind);
        pending[kind] = files;
        await Editor.Panel.open(panelId(kind));
        Editor.Message.broadcast(kind === 'image' ? 'media-utils:pending-image' : 'media-utils:pending-audio');
        return files.length;
    },

    /** Files queued by openAssets for a panel (taken once). */
    takePending(kind: Kind): string[] {
        const list = pending[kind] || [];
        pending[kind] = [];
        return list;
    },

    async resolveAssets(kind: Kind, items: string[]) {
        return ofKind(await resolveItems(items || []), kind);
    },

    async selectedAssets(kind: Kind) {
        const uuids = Editor.Selection.getSelected('asset') || [];
        return ofKind(await resolveItems(uuids), kind);
    },

    async pickFiles(kind: Kind, multi = true) {
        const exts = kind === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tif', 'tiff'] : ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'opus'];
        const result = await Editor.Dialog.select({
            title: kind === 'image' ? 'Add Images' : 'Open Audio',
            path: path.join(Editor.Project.path, 'assets'),
            type: 'file',
            multi,
            filters: [{ name: kind === 'image' ? 'Images' : 'Audio', extensions: exts }],
        });
        return result.canceled ? [] : result.filePaths || [];
    },

    async pickFolder(current?: string) {
        const result = await Editor.Dialog.select({
            title: 'Output Folder',
            path: current || path.join(Editor.Project.path, 'assets'),
            type: 'directory',
            multi: false,
        });
        return result.canceled || !result.filePaths || !result.filePaths[0] ? null : result.filePaths[0];
    },

    fileInfo(file: string) {
        return fileInfo(file);
    },

    /** Raw bytes of a file (audio decoding, image display). */
    readFile(file: string) {
        return fs.readFileSync(file);
    },

    imageCapabilities() {
        const s = loadSharp();
        return { loaded: !!s.sharp, path: s.path, version: s.version, vips: s.vips, formats: s.formats, error: s.error };
    },

    /** Size, dimensions and displayable bytes (TIFF and other formats Chromium can't show become PNG). */
    async imageInfo(file: string, withDisplay = true) {
        const sharp = requireSharp();
        const input = fs.readFileSync(file);
        const stats = await readStats(sharp, input);
        const url = await assetDb.urlOf(file);
        const showable = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].indexOf(extOf(file)) >= 0;
        const display = !withDisplay ? null : showable ? input : await sharp(input, { animated: false }).rotate().png().toBuffer();
        return { ...fileInfo(file), url, width: stats.width, height: stats.height, format: stats.format, hasAlpha: stats.hasAlpha, display, displayMime: showable ? mimeOf(file) : 'image/png' };
    },

    /** Runs the pipeline without saving. */
    async imagePreview(file: string, options: ImageOptions) {
        const sharp = requireSharp();
        const o = mergeImageOptions(options);
        const r = await runImagePipeline(sharp, fs.readFileSync(file), file, o);
        return {
            bytes: r.buffer,
            mime: mimeOf('x.' + r.format),
            source: r.source,
            result: r.result,
            displayScale: r.displayScale,
            warnings: r.warnings,
        };
    },

    /** Runs the pipeline and saves the result. */
    async imageProcess(file: string, options: ImageOptions, save: SaveOptions, session?: string) {
        const sharp = requireSharp();
        const o = mergeImageOptions(options);
        const input = fs.readFileSync(file);
        const r = await runImagePipeline(sharp, input, file, o);
        const ext = extensionFor(r.format, file);
        const sameFormat = ext.toLowerCase() === extOf(file) || (r.format === 'jpg' && (extOf(file) === '.jpg' || extOf(file) === '.jpeg'));
        if (o.encode.skipIfLarger && r.encodeOnly && sameFormat && r.buffer.length >= input.length) {
            return { path: file, url: await assetDb.urlOf(file), size: input.length, before: input.length, overwritten: false, renamed: false, skipped: true, warnings: r.warnings };
        }
        const saved = await output().save({ source: file, ext, bytes: r.buffer, save, session });
        return { ...saved, before: input.length, warnings: r.warnings };
    },

    /** Saves bytes made in a panel (encoded audio). */
    async saveOutput(request: SaveRequest, bytes?: any) {
        // The bytes travel as their own argument: typed arrays nested in JSON would not survive.
        return output().save({ ...request, bytes: toBuffer(bytes !== undefined ? bytes : request.bytes) });
    },

    backupBegin(label: string) {
        return output().beginSession(label || 'Overwrite');
    },

    backupInfo() {
        return output().summary();
    },

    async restoreLast() {
        const r = await output().restoreLast();
        if (r.files.length) {
            console.log(`[Media Utils] Restored ${r.files.length} file(s) from "${r.label}".`);
            Editor.Message.broadcast('media-utils:restored', r.files);
        } else {
            console.log('[Media Utils] Nothing to restore.');
        }
        return r;
    },

    /** Selects and pings a file in the Assets panel. */
    async reveal(file: string) {
        try {
            const info = await req('asset-db', 'query-asset-info', file);
            if (info && info.uuid) {
                Editor.Selection.clear('asset');
                Editor.Selection.select('asset', info.uuid);
                Editor.Message.send('assets', 'twinkle', info.uuid);
                return true;
            }
        } catch (e) {
            // not an asset
        }
        try {
            require('electron').shell.showItemInFolder(file);
        } catch (e) {
            // ignore
        }
        return false;
    },

    /** The encoder WebAssembly binaries (shipped in dist/wasm). */
    encoderWasm(kind: 'mp3' | 'ogg') {
        if (kind !== 'mp3' && kind !== 'ogg') throw new Error('Unknown encoder.');
        return fs.readFileSync(path.join(__dirname, 'wasm', kind + '.wasm'));
    },
};

export function load() {}

export function unload() {}
