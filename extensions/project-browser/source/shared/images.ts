/**
 * Image thumbnails: which file to decode for an image asset (the source file
 * when the browser can read it, else the PNG Cocos wrote to the library for
 * TGA / PSD / TIFF / HDR / EXR...), the sprite frame's rectangle, contain-fit
 * sizes and RGBE decoding. Pure: tested in node.
 */

/** Formats Chromium decodes (createImageBitmap / <img>). */
export const BROWSER_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.avif', '.apng', '.svg', '.jfif', '.pjpeg', '.pjp'];

/** Lower-case extension with the dot: "C:/a/B.PNG" -> ".png". */
export function extOf(path: string): string {
    const m = /(\.[^./\\]+)$/.exec(path || '');
    return m ? m[1].toLowerCase() : '';
}

export function isBrowserImage(path: string): boolean {
    return BROWSER_IMAGE_EXTS.indexOf(extOf(path)) >= 0;
}

/** MIME type for a Blob of an image file. */
export function imageMime(path: string): string {
    const e = extOf(path);
    if (e === '.jpg' || e === '.jpeg' || e === '.jfif' || e === '.pjpeg' || e === '.pjp') return 'image/jpeg';
    if (e === '.svg') return 'image/svg+xml';
    if (e === '.ico') return 'image/x-icon';
    if (e === '.apng') return 'image/apng';
    return 'image/' + (e.slice(1) || 'png');
}

/**
 * The file to decode for an image asset: the source when the browser reads it
 * (and it is not RGBE-packed), else the first readable file of the library map
 * (".png" first). Null when nothing is readable.
 */
export function pickImagePath(source: string | undefined, library: Record<string, string> | undefined, rgbe: boolean): string | null {
    if (source && isBrowserImage(source) && !rgbe) return source;
    const lib = library || {};
    const order = ['.png', '.webp', '.jpg', '.jpeg', '.bmp', '.gif'];
    for (let i = 0; i < order.length; i++) if (lib[order[i]]) return lib[order[i]];
    const keys = Object.keys(lib);
    for (let i = 0; i < keys.length; i++) if (isBrowserImage(lib[keys[i]] || keys[i]) && lib[keys[i]]) return lib[keys[i]];
    if (source && isBrowserImage(source)) return source;
    return null;
}

/** The image asset a texture / sprite frame reads from (userData.imageUuidOrDatabaseUri), as a main uuid or a db url. */
export function imageRef(userData: any): { uuid?: string; url?: string } | null {
    const ref = userData && userData.imageUuidOrDatabaseUri;
    if (typeof ref !== 'string' || !ref) return null;
    if (ref.indexOf('db://') === 0) return { url: ref };
    const at = ref.indexOf('@');
    return { uuid: at > 0 ? ref.slice(0, at) : ref };
}

export interface SpriteCrop {
    /** Rectangle in the texture (already swapped when rotated). */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Packed 90° clockwise (atlases): drawn back counter-clockwise. */
    rotated: boolean;
    /** Size of the frame as shown. */
    frameW: number;
    frameH: number;
}

/** A sprite frame's rectangle from its meta userData (trimX, trimY, width, height, rotated). */
export function spriteCrop(userData: any): SpriteCrop | null {
    if (!userData) return null;
    const w = Number(userData.width);
    const h = Number(userData.height);
    if (!(w > 0) || !(h > 0)) return null;
    const x = Math.max(0, Number(userData.trimX) || 0);
    const y = Math.max(0, Number(userData.trimY) || 0);
    const rotated = !!userData.rotated;
    return { x, y, w: rotated ? h : w, h: rotated ? w : h, rotated, frameW: w, frameH: h };
}

/** Contain-fit size inside max x max, never upscaled, at least 1 px. */
export function containSize(w: number, h: number, max: number): { w: number; h: number } {
    if (!(w > 0) || !(h > 0)) return { w: 1, h: 1 };
    const s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * Cocos RGBE pixel (rgb mantissa, alpha exponent: value = rgb * 1.1^(a*255 - 128),
 * as unpackRGBE in the engine's chunks) to displayable sRGB bytes, with Reinhard
 * tone mapping. In place over an RGBA byte array.
 */
export function decodeRGBE(data: Uint8ClampedArray | Uint8Array | number[]): void {
    const pow: number[] = [];
    for (let e = 0; e < 256; e++) pow[e] = Math.pow(1.1, e - 128) / 255;
    for (let i = 0; i < data.length; i += 4) {
        const s = pow[data[i + 3]];
        for (let c = 0; c < 3; c++) {
            const v = data[i + c] * s;
            data[i + c] = Math.round(Math.pow(v / (1 + v), 1 / 2.2) * 255);
        }
        data[i + 3] = 255;
    }
}
