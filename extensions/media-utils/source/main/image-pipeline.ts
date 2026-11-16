/**
 * The Image Tools pipeline (main process). Order:
 *   decode + EXIF orientation -> crop -> trim transparent -> rotate / flip ->
 *   resize -> pad canvas -> colour adjust -> alpha (bleed / premultiply) -> encode
 *
 * sharp decodes, resizes, pads and encodes; the other steps are pure
 * TypeScript on raw RGBA (shared/image/pixels.ts) so their order is explicit.
 * Inputs are read into memory first, so libvips never holds a file open
 * (Windows would then refuse to overwrite it).
 */
import { ImageFormat, ImageOptions, extOf, parseColor, resolveFormat } from '../shared/image/options';
import { cropRaw, flipRaw, growRect, RawImage, rotateRaw } from '../shared/image/pixels';
import { pixelJob } from './pixel-job';
import { cropRect, planResize } from '../shared/image/sizing';

export interface ImageStats {
    width: number;
    height: number;
    format: string;
    size: number;
    hasAlpha: boolean;
}

export interface PipelineResult {
    buffer: Buffer;
    format: ImageFormat;
    source: ImageStats;
    result: ImageStats;
    /** Width of the image before resizing / after resizing (preview alignment). */
    displayScale: number;
    /** True when nothing but re-encoding happened. */
    encodeOnly: boolean;
    warnings: string[];
}

function rawInput(img: RawImage) {
    return { raw: { width: img.width, height: img.height, channels: 4 as const } };
}

async function toRaw(pipeline: any): Promise<RawImage> {
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`Unexpected channel count ${info.channels}.`);
    return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

function sharpColor(hex: string) {
    const c = parseColor(hex);
    return { r: c.r, g: c.g, b: c.b, alpha: c.alpha };
}

export function isEncodeOnly(o: ImageOptions): boolean {
    return !o.crop.enabled && !o.trim.enabled && !o.transform.rotate && !o.transform.flipH && !o.transform.flipV && !o.resize.enabled && !o.pad.enabled && !o.adjust.enabled && !o.alpha.enabled;
}

export async function readStats(sharp: any, input: Buffer): Promise<ImageStats> {
    const meta = await sharp(input, { animated: false }).metadata();
    const swap = meta.orientation && meta.orientation >= 5;
    return {
        width: (swap ? meta.height : meta.width) || 0,
        height: (swap ? meta.width : meta.height) || 0,
        format: meta.format === 'jpeg' ? 'jpg' : meta.format === 'heif' ? 'avif' : String(meta.format || ''),
        size: input.length,
        hasAlpha: !!meta.hasAlpha,
    };
}

/**
 * Encodes raw RGBA. `facts` (from a pixel job) says whether any pixel is
 * transparent and how many colours there are (up to 257).
 */
export async function encodeRaw(sharp: any, img: RawImage, format: ImageFormat, o: ImageOptions['encode'], facts: { transparent: boolean; colours: number }): Promise<Buffer> {
    let p = sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img));
    // Opaque images are written without an alpha channel (smaller files).
    if (!facts.transparent) p = p.removeAlpha();
    if (format === 'png') {
        const png: any = { compressionLevel: clampInt(o.pngCompression, 0, 9), adaptiveFiltering: true };
        if (o.pngPalette) {
            png.palette = true;
            png.colours = clampInt(o.pngColors, 2, 256);
            png.quality = clampInt(o.pngQuality, 0, 100);
            png.dither = Math.max(0, Math.min(1, Number(o.pngDither)));
            png.effort = clampInt(o.pngEffort, 1, 10);
        }
        p = p.png(png);
        if (!o.pngPalette) {
            // Lossless optimisation: an image with at most 256 colours is also
            // written as an exact indexed PNG; the smaller file wins.
            const colours = facts.colours;
            if (colours <= 256) {
                const [truecolour, indexed] = await Promise.all([
                    p.toBuffer(),
                    sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img))
                        .png({ palette: true, colours: Math.max(2, colours), quality: 100, dither: 0, effort: 10, compressionLevel: png.compressionLevel })
                        .toBuffer(),
                ]);
                return indexed.length < truecolour.length ? indexed : truecolour;
            }
        }
    } else if (format === 'jpg') {
        p = p.flatten({ background: sharpColor(o.jpgBackground || '#ffffff') }).jpeg({
            quality: clampInt(o.jpgQuality, 1, 100),
            progressive: !!o.jpgProgressive,
            mozjpeg: !!o.jpgMozjpeg,
            chromaSubsampling: o.jpgChroma === '4:4:4' ? '4:4:4' : '4:2:0',
        });
    } else if (format === 'webp') {
        p = p.webp({
            quality: clampInt(o.webpQuality, 1, 100),
            lossless: !!o.webpLossless,
            nearLossless: !!o.webpNearLossless && !o.webpLossless,
            alphaQuality: clampInt(o.webpAlphaQuality, 0, 100),
            effort: clampInt(o.webpEffort, 0, 6),
        });
    } else if (format === 'avif') {
        p = p.avif({
            quality: clampInt(o.avifQuality, 1, 100),
            lossless: !!o.avifLossless,
            effort: clampInt(o.avifEffort, 0, 9),
            chromaSubsampling: o.avifChroma === '4:2:0' ? '4:2:0' : '4:4:4',
        });
    } else {
        throw new Error(`Unsupported output format: ${format}`);
    }
    return p.toBuffer();
}

function clampInt(v: any, lo: number, hi: number): number {
    const n = Math.round(Number(v));
    return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

export async function runImagePipeline(sharp: any, input: Buffer, sourcePath: string, o: ImageOptions): Promise<PipelineResult> {
    const warnings: string[] = [];
    const source = await readStats(sharp, input);
    const format = resolveFormat(sourcePath, o.encode.format);

    // Decode (and apply EXIF orientation) to raw RGBA.
    let img = await toRaw(sharp(input, { animated: false }).rotate());

    if (o.crop.enabled) img = cropRaw(img, cropRect(img.width, img.height, o.crop));

    if (o.trim.enabled) {
        const job = await pixelJob(img.data, { width: img.width, height: img.height, boundsThreshold: clampInt(o.trim.threshold, 0, 254) });
        img = { data: job.data, width: img.width, height: img.height };
        const bounds = job.result.bounds;
        if (!bounds) warnings.push('The image is fully transparent; nothing to trim.');
        else img = cropRaw(img, growRect(bounds, Math.max(0, Math.round(o.trim.margin) || 0), img.width, img.height));
    }

    if (o.transform.rotate) img = rotateRaw(img, o.transform.rotate);
    if (o.transform.flipH || o.transform.flipV) img = flipRaw(img, o.transform.flipH, o.transform.flipV);

    const preResizeWidth = img.width;
    if (o.resize.enabled) {
        const plan = planResize(img.width, img.height, o.resize);
        if (plan.width !== img.width || plan.height !== img.height || plan.fit !== 'fill') {
            img = await toRaw(
                sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img)).resize(plan.width, plan.height, {
                    fit: plan.fit,
                    kernel: o.resize.kernel,
                    background: sharpColor(o.resize.background || '#00000000'),
                    position: 'centre',
                }),
            );
        }
    }
    const resizedWidth = img.width;

    if (o.pad.enabled) {
        const t = Math.max(0, Math.round(o.pad.top) || 0);
        const r = Math.max(0, Math.round(o.pad.right) || 0);
        const b = Math.max(0, Math.round(o.pad.bottom) || 0);
        const l = Math.max(0, Math.round(o.pad.left) || 0);
        if (t || r || b || l) {
            img = await toRaw(
                sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), rawInput(img)).extend({
                    top: t,
                    right: r,
                    bottom: b,
                    left: l,
                    background: sharpColor(o.pad.color || '#00000000'),
                    extendWith: o.pad.extendWith || 'background',
                }),
            );
        }
    }

    // Colour adjust, alpha, and the facts the encoder needs (off the main thread for big images).
    const job = await pixelJob(img.data, {
        width: img.width,
        height: img.height,
        adjust: o.adjust.enabled ? o.adjust : undefined,
        alpha: o.alpha.enabled ? o.alpha.mode : undefined,
        transparency: true,
        countColours: format === 'png' && !o.encode.pngPalette ? 256 : undefined,
    });
    img = { data: job.data, width: img.width, height: img.height };
    const alpha = !!job.result.transparent;
    if (format === 'jpg' && alpha) warnings.push('JPG has no transparency: transparent pixels are filled with the JPG background colour.');
    if (o.alpha.enabled && o.alpha.mode === 'bleed' && format === 'jpg') warnings.push('Alpha bleed only matters for formats with transparency.');

    const buffer = await encodeRaw(sharp, img, format, o.encode, { transparent: alpha, colours: job.result.colours === undefined ? 257 : job.result.colours });
    return {
        buffer,
        format,
        source,
        result: { width: img.width, height: img.height, format, size: buffer.length, hasAlpha: alpha && format !== 'jpg' },
        displayScale: resizedWidth ? preResizeWidth / resizedWidth : 1,
        encodeOnly: isEncodeOnly(o),
        warnings,
    };
}

/** MIME type for a file extension (preview blobs). */
export function mimeOf(file: string): string {
    const ext = extOf(file);
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.avif') return 'image/avif';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.ogg') return 'audio/ogg';
    if (ext === '.wav') return 'audio/wav';
    return 'application/octet-stream';
}
