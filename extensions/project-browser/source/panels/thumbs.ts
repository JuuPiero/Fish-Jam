/**
 * Thumbnails for the Project window.
 *
 * - Images (image / texture / sprite frame, and plain .gif / .svg / .ico files
 *   Cocos does not import as images): the whole picture, decoded here and
 *   scaled to fit 256 px. The source file when Chromium reads it, else the PNG
 *   Cocos wrote to the library (TGA, PSD, TIFF, HDR, EXR...); RGBE images
 *   (HDR) are tone-mapped; sprite frames show their own rectangle. Cached on
 *   disk against the source, its .meta and the library file. Falls back to
 *   asset-db 'query-asset-thumbnail' (a file or a Cocos icon name).
 * - Materials, prefabs, meshes, models: rendered with Cocos' own preview
 *   scenes, the ones the asset Inspector uses: PreviewExtends (GLPreview) on
 *   'scene:material-preview' / 'scene:prefab-preview' / 'scene:mesh-preview' /
 *   'scene:model-preview', after setting the asset ('preview-material',
 *   call-preview-function setPrefab / setMesh / setModel). One at a time, into a
 *   128 px canvas, cached on disk by the main process.
 * - Everything else: a type icon.
 */
import { containSize, decodeRGBE, extOf, imageMime, imageRef, isBrowserImage, pickImagePath, SpriteCrop, spriteCrop } from '../shared/images';
import { AssetEntry } from '../shared/search';

export type ThumbKind = 'image' | 'material' | 'prefab' | 'mesh' | 'model';

export interface Thumb {
    /** An image to show (file:// or data: URL). */
    src?: string;
    /** A Cocos icon name (ui-icon). */
    icon?: string;
}

const PKG = 'project-browser';
const SIZE = 128;
/** Image thumbnails: crisp at the largest cell size on high-DPI screens. */
const IMAGE_SIZE = 256;

const IMAGE_IMPORTERS = ['image', 'texture', 'sprite-frame', 'render-texture', 'texture-cube', 'erp-texture-cube'];
const IMAGE_TYPES = ['cc.ImageAsset', 'cc.Texture2D', 'cc.SpriteFrame', 'cc.TextureCube'];

export function thumbKind(a: AssetEntry): ThumbKind | null {
    if (a.isDirectory) return null;
    if (IMAGE_IMPORTERS.indexOf(a.importer) >= 0 || IMAGE_TYPES.indexOf(a.type) >= 0) return 'image';
    // a picture Cocos keeps as a plain file (.gif, .svg, .ico...)
    if (!a.parent && isBrowserImage(a.file || a.url)) return 'image';
    if (a.type === 'cc.Material') return 'material';
    if (a.importer === 'prefab' && !a.parent) return 'prefab';
    if (a.type === 'cc.Mesh') return 'mesh';
    if ((a.importer === 'fbx' || a.importer === 'gltf') && !a.parent && modelPrefab(a)) return 'model';
    return null;
}

/** The prefab sub-asset of a model (what the model preview shows). */
function modelPrefab(a: AssetEntry): string | null {
    const subs = a.subAssets || [];
    for (let i = 0; i < subs.length; i++) if (subs[i].type === 'cc.Prefab') return subs[i].uuid;
    return null;
}

interface PreviewKind {
    channel: string;
    query: string;
    set(a: AssetEntry): Promise<any>;
}

function callPreview(channel: string, fn: string, ...args: any[]): Promise<any> {
    return Editor.Message.request('scene', 'call-preview-function' as any, channel, fn, ...args) as Promise<any>;
}

const PREVIEWS: Record<string, PreviewKind> = {
    material: { channel: 'scene:material-preview', query: 'query-material-preview-data', set: (a) => Editor.Message.request('scene', 'preview-material' as any, a.uuid) as Promise<any> },
    prefab: { channel: 'scene:prefab-preview', query: 'query-prefab-preview-data', set: (a) => callPreview('scene:prefab-preview', 'setPrefab', a.uuid) },
    mesh: { channel: 'scene:mesh-preview', query: 'query-mesh-preview-data', set: (a) => callPreview('scene:mesh-preview', 'setMesh', a.uuid) },
    model: { channel: 'scene:model-preview', query: 'query-model-preview-data', set: (a) => callPreview('scene:model-preview', 'setModel', modelPrefab(a)) },
};

function fileUrl(path: string): string {
    try {
        return require('url').pathToFileURL(path).href;
    } catch (e) {
        return 'file:///' + path.replace(/\\/g, '/');
    }
}

async function resolveImagePath(value: string): Promise<string | null> {
    if (!value) return null;
    if (value.indexOf('db://') === 0) {
        try {
            return ((await Editor.Message.request('asset-db', 'query-path', value)) as any) || null;
        } catch (e) {
            return null;
        }
    }
    if (value.indexOf('project://') === 0) return require('path').join(Editor.Project.path, value.slice('project://'.length));
    if (value.indexOf('packages://') === 0) return null;
    return value;
}

export interface ThumbOptions {
    /** Render materials / prefabs / meshes / models with Cocos' preview scenes. */
    renderPreviews: () => boolean;
    /** Kind of an asset by uuid (to keep away from the preview the Inspector shows). */
    kindOf: (uuid: string) => ThumbKind | null;
    /** A thumbnail is ready. */
    onReady: (uuid: string, t: Thumb) => void;
}

/** Thumbnail queue: visible items ask; images first, previews one at a time. */
export class ThumbService {
    private cache: Record<string, Thumb | null> = {};
    private queue: AssetEntry[] = [];
    private queued: Record<string, boolean> = {};
    private busy = false;
    private gl: Record<string, { preview: any; canvas: HTMLCanvasElement; ready: boolean }> = {};
    private disposed = false;

    constructor(private opts: ThumbOptions) {}

    get(uuid: string): Thumb | null | undefined {
        return this.cache[uuid];
    }

    /** Forget an asset (it changed), sub-assets included. */
    invalidate(uuid: string): void {
        delete this.cache[uuid];
        const prefix = uuid + '@';
        Object.keys(this.cache).forEach((k) => {
            if (k.indexOf(prefix) === 0) delete this.cache[k];
        });
    }

    clear(): void {
        this.cache = {};
    }

    /** Ask for a thumbnail; `front` puts it before the others (visible now). */
    request(a: AssetEntry, front = false): void {
        if (this.disposed || this.cache[a.uuid] !== undefined || this.queued[a.uuid]) return;
        const kind = thumbKind(a);
        if (!kind || (kind !== 'image' && !this.opts.renderPreviews())) {
            this.cache[a.uuid] = null;
            return;
        }
        this.queued[a.uuid] = true;
        if (front) this.queue.unshift(a);
        else this.queue.push(a);
        this.pump();
    }

    dispose(): void {
        this.disposed = true;
        this.queue.length = 0;
    }

    private async pump(): Promise<void> {
        if (this.busy || this.disposed) return;
        this.busy = true;
        try {
            while (this.queue.length && !this.disposed) {
                // images first: they are cheap
                let idx = this.queue.findIndex((x) => thumbKind(x) === 'image');
                if (idx < 0) idx = 0;
                const a = this.queue.splice(idx, 1)[0];
                const kind = thumbKind(a);
                if (kind && kind !== 'image' && this.inspectorShows(kind)) {
                    // the Inspector is showing this preview scene right now: come back later
                    this.queue.push(a);
                    if (this.queue.every((x) => thumbKind(x) !== 'image' && this.inspectorShows(thumbKind(x)!))) {
                        await wait(1500);
                    }
                    continue;
                }
                delete this.queued[a.uuid];
                let t: Thumb | null = null;
                try {
                    t = kind === 'image' ? await this.image(a) : kind ? await this.preview(kind, a) : null;
                } catch (e) {
                    t = null;
                }
                this.cache[a.uuid] = t;
                if (t) this.opts.onReady(a.uuid, t);
                if (kind && kind !== 'image') await wait(30);
            }
        } finally {
            this.busy = false;
        }
    }

    private inspectorShows(kind: ThumbKind): boolean {
        try {
            const sel = Editor.Selection.getSelected('asset') || [];
            for (let i = 0; i < sel.length; i++) if (this.opts.kindOf(sel[i]) === kind) return true;
        } catch (e) {
            // no selection API
        }
        return false;
    }

    private async image(a: AssetEntry): Promise<Thumb | null> {
        let src: ImageSource | null = null;
        try {
            src = await imageSource(a);
        } catch (e) {
            src = null;
        }
        if (src) {
            const cached = (await Editor.Message.request(PKG, 'thumb-get', a.uuid, src.files)) as any;
            if (typeof cached === 'string' && cached) return { src: cached };
            let url: string | null = null;
            try {
                url = await renderImage(src);
            } catch (e) {
                url = null;
            }
            if (url) {
                Editor.Message.request(PKG, 'thumb-put', a.uuid, url).catch(() => undefined);
                return { src: url };
            }
        }
        // Cocos' own thumbnail: render textures, formats nothing here can decode
        let info: any = null;
        try {
            info = await Editor.Message.request('asset-db', 'query-asset-thumbnail' as any, a.uuid, 'large');
        } catch (e) {
            info = null;
        }
        // the query string defeats Chromium's image cache after a reimport (same path, new pixels)
        const bust = '?v=' + Date.now();
        if (info && info.type === 'image') {
            const p = await resolveImagePath(String(info.value || ''));
            if (p) return { src: fileUrl(p) + bust };
        }
        if (info && info.type === 'icon' && info.value) return { icon: String(info.value) };
        // a plain image file can be shown as it is
        if (a.importer === 'image' && a.file) return { src: fileUrl(a.file) + bust };
        return null;
    }

    private async preview(kind: ThumbKind, a: AssetEntry): Promise<Thumb | null> {
        const file = a.file || '';
        const cached = (await Editor.Message.request(PKG, 'thumb-get', a.uuid, file)) as any;
        if (typeof cached === 'string' && cached) return { src: cached };
        const pk = PREVIEWS[kind];
        if (!pk) return null;
        let g = this.gl[kind];
        if (!g) {
            const GLPreview = (Editor as any)._Module.require('PreviewExtends').default;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            g = this.gl[kind] = { preview: new GLPreview(pk.channel, pk.query), canvas, ready: false };
        }
        if (!g.ready) {
            await g.preview.init({ width: SIZE, height: SIZE });
            await g.preview.initGL(g.canvas, { width: SIZE, height: SIZE });
            await g.preview.resizeGL(SIZE, SIZE);
            g.ready = true;
        }
        await pk.set(a);
        const data = await g.preview.queryPreviewData({ width: SIZE, height: SIZE });
        g.preview.drawGL(data);
        const url = g.canvas.toDataURL('image/png');
        if (!url || url.length < 200) return null;
        Editor.Message.request(PKG, 'thumb-put', a.uuid, url).catch(() => undefined);
        return { src: url };
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ------------------------------------------------------------------ images

interface ImageSource {
    /** File to decode (source or library). */
    path: string;
    /** RGBE-packed (HDR): tone-map after drawing. */
    rgbe: boolean;
    /** Sprite frame rectangle. */
    crop: SpriteCrop | null;
    /** Files whose modification makes the cached thumbnail stale. */
    files: string[];
}

function adb(method: string, ...args: any[]): Promise<any> {
    return (Editor.Message.request('asset-db', method as any, ...args) as Promise<any>).catch(() => null);
}

/** Which picture an image-like asset shows, and the rectangle of it. */
async function imageSource(a: AssetEntry): Promise<ImageSource | null> {
    let imageUuid = '';
    let crop: SpriteCrop | null = null;
    if (a.importer === 'image' && !a.parent) imageUuid = a.uuid;
    else if (a.parent || IMAGE_IMPORTERS.indexOf(a.importer) >= 0 || IMAGE_TYPES.indexOf(a.type) >= 0) {
        const meta: any = await adb('query-asset-meta', a.uuid);
        const ud = meta && meta.userData;
        const ref = imageRef(ud);
        if (ref && ref.uuid) imageUuid = ref.uuid;
        else if (ref && ref.url) imageUuid = (await adb('query-asset-uuid', ref.url)) || '';
        if (!imageUuid && a.parent) imageUuid = a.parent;
        if (a.importer === 'sprite-frame' || a.type === 'cc.SpriteFrame') crop = spriteCrop(ud);
    }
    if (!imageUuid) {
        // a picture Cocos did not import as an image (.gif, .svg...): the file itself
        if (a.file && isBrowserImage(a.file)) return { path: a.file, rgbe: false, crop: null, files: [a.file, a.file + '.meta'] };
        return null;
    }
    const info: any = await adb('query-asset-info', imageUuid);
    if (!info) return null;
    const meta: any = await adb('query-asset-meta', imageUuid);
    const rgbe = !!(meta && meta.userData && meta.userData.isRGBE);
    const path = pickImagePath(info.file, info.library, rgbe);
    if (!path) return null;
    const files = [info.file, info.file ? info.file + '.meta' : '', path].filter((f: string, i: number, all: string[]) => !!f && all.indexOf(f) === i);
    return { path, rgbe, crop, files };
}

/** Decodes the picture and draws it, whole (or the sprite's rectangle), into a PNG data URL. */
async function renderImage(src: ImageSource): Promise<string | null> {
    // read the bytes here: a Blob is same-origin, so the canvas stays readable (a file:// <img> may taint it)
    const buf: any = require('fs').readFileSync(src.path);
    const blob = new Blob([buf as BlobPart], { type: imageMime(src.path) });
    let source: CanvasImageSource;
    let iw = 0;
    let ih = 0;
    let done = () => undefined as void;
    if (extOf(src.path) === '.svg') {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        try {
            await img.decode();
        } catch (e) {
            URL.revokeObjectURL(url);
            return null;
        }
        source = img;
        iw = img.naturalWidth || IMAGE_SIZE;
        ih = img.naturalHeight || IMAGE_SIZE;
        done = () => URL.revokeObjectURL(url);
    } else {
        const bmp = await createImageBitmap(blob);
        source = bmp;
        iw = bmp.width;
        ih = bmp.height;
        done = () => bmp.close();
    }
    try {
        if (!iw || !ih) return null;
        let sx = 0;
        let sy = 0;
        let sw = iw;
        let sh = ih;
        let fw = iw;
        let fh = ih;
        let rotated = false;
        const c = src.crop;
        // a sprite frame shows its own rectangle (whole image when it covers it)
        if (c && c.x + c.w <= iw + 0.5 && c.y + c.h <= ih + 0.5) {
            sx = c.x;
            sy = c.y;
            sw = c.w;
            sh = c.h;
            fw = c.frameW;
            fh = c.frameH;
            rotated = c.rotated;
        }
        const size = containSize(fw, fh, IMAGE_SIZE);
        const canvas = document.createElement('canvas');
        canvas.width = size.w;
        canvas.height = size.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (rotated) {
            // atlases pack rotated frames 90° clockwise: turn them back
            ctx.translate(0, size.h);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(source, sx, sy, sw, sh, 0, 0, size.h, size.w);
        } else ctx.drawImage(source, sx, sy, sw, sh, 0, 0, size.w, size.h);
        if (src.rgbe) {
            const d = ctx.getImageData(0, 0, size.w, size.h);
            decodeRGBE(d.data);
            ctx.putImageData(d, 0, 0);
        }
        const url = canvas.toDataURL('image/png');
        return url && url.length > 100 ? url : null;
    } finally {
        done();
    }
}
