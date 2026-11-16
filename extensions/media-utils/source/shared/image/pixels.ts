/**
 * Per-pixel operations on raw RGBA8 data (straight, not premultiplied alpha):
 * transparent-border bounds, colour adjustments, premultiply and alpha bleed.
 * Pure TypeScript so the results are the same everywhere and testable in Node.
 */
import { AdjustOptions, parseColor } from './options';

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Bounding box of pixels whose alpha is above `threshold` (null when fully transparent). */
export function opaqueBounds(rgba: Uint8Array, width: number, height: number, threshold = 0): Rect | null {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        const row = y * width * 4;
        for (let x = 0; x < width; x++) {
            if (rgba[row + x * 4 + 3] > threshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Grows a rect by `margin` pixels, clamped to the image. */
export function growRect(r: Rect, margin: number, width: number, height: number): Rect {
    const left = Math.max(0, r.left - margin);
    const top = Math.max(0, r.top - margin);
    const right = Math.min(width, r.left + r.width + margin);
    const bottom = Math.min(height, r.top + r.height + margin);
    return { left, top, width: right - left, height: bottom - top };
}

type Mat3 = number[];

function mul(a: Mat3, b: Mat3): Mat3 {
    const o: Mat3 = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
    return o;
}

/** CSS filter saturate(s) matrix (Rec. 709 luma). */
export function saturateMatrix(s: number): Mat3 {
    return [
        0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s,
        0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s,
        0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s,
    ];
}

/** CSS filter hue-rotate(deg) matrix. */
export function hueMatrix(deg: number): Mat3 {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ];
}

function isIdentity(o: AdjustOptions): boolean {
    return !o.brightness && !o.contrast && !o.saturation && !o.hue && !o.grayscale && !(o.tintAmount > 0);
}

/**
 * Brightness (additive), contrast (around mid grey), saturation, hue,
 * grayscale and a multiply tint, in that order. Alpha is untouched.
 */
export function adjustPixels(rgba: Uint8Array, o: AdjustOptions): void {
    if (isIdentity(o)) return;
    const lut = new Uint8ClampedArray(256);
    const b = (Math.max(-100, Math.min(100, o.brightness || 0)) / 100) * 255;
    const C = Math.max(-100, Math.min(100, o.contrast || 0)) * 2.55;
    const cf = (259 * (C + 255)) / (255 * (259 - C));
    for (let v = 0; v < 256; v++) lut[v] = cf * (v + b - 128) + 128;

    let m: Mat3 | null = null;
    const sat = o.grayscale ? 0 : 1 + Math.max(-100, Math.min(100, o.saturation || 0)) / 100;
    if (sat !== 1) m = saturateMatrix(sat);
    if (o.hue) m = m ? mul(hueMatrix(o.hue), m) : hueMatrix(o.hue);

    const t = parseColor(o.tint || '#ffffff');
    const ta = Math.max(0, Math.min(100, o.tintAmount || 0)) / 100;
    const tr = 1 - ta + (ta * t.r) / 255;
    const tg = 1 - ta + (ta * t.g) / 255;
    const tb = 1 - ta + (ta * t.b) / 255;

    for (let i = 0; i < rgba.length; i += 4) {
        let r = lut[rgba[i]];
        let g = lut[rgba[i + 1]];
        let bl = lut[rgba[i + 2]];
        if (m) {
            const nr = m[0] * r + m[1] * g + m[2] * bl;
            const ng = m[3] * r + m[4] * g + m[5] * bl;
            const nb = m[6] * r + m[7] * g + m[8] * bl;
            r = nr;
            g = ng;
            bl = nb;
        }
        r *= tr;
        g *= tg;
        bl *= tb;
        rgba[i] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
        rgba[i + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
        rgba[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : Math.round(bl);
    }
}

/** RGB *= alpha (for textures sampled with premultiplied-alpha blending). */
export function premultiply(rgba: Uint8Array): void {
    for (let i = 0; i < rgba.length; i += 4) {
        const a = rgba[i + 3];
        if (a === 255) continue;
        rgba[i] = Math.round((rgba[i] * a) / 255);
        rgba[i + 1] = Math.round((rgba[i + 1] * a) / 255);
        rgba[i + 2] = Math.round((rgba[i + 2] * a) / 255);
    }
}

/**
 * Alpha bleed: gives every fully transparent pixel the average colour of its
 * nearest visible neighbours, spreading outwards ring by ring until the whole
 * transparent area is filled. Alpha stays 0, so the image looks the same, but
 * bilinear filtering and mipmaps no longer pull in black (or white) from the
 * transparent area: no more dark halos around sprites.
 */
export function alphaBleed(rgba: Uint8Array, width: number, height: number): void {
    const n = width * height;
    const filled = new Uint8Array(n);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] > 0) filled[i] = 1;
    const isEdge = (i: number) => {
        const x = i % width;
        const y = (i - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx;
                if ((dx || dy) && xx >= 0 && xx < width && filled[yy * width + xx]) return true;
            }
        }
        return false;
    };
    for (let i = 0; i < n; i++) if (!filled[i] && isEdge(i)) frontier.push(i);
    if (!frontier.length) return;
    const queued = new Uint8Array(n);
    for (const i of frontier) queued[i] = 1;
    while (frontier.length) {
        const done: number[] = [];
        for (const i of frontier) {
            const x = i % width;
            const y = (i - x) / width;
            let r = 0;
            let g = 0;
            let b = 0;
            let count = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx;
                    if (!(dx || dy) || xx < 0 || xx >= width) continue;
                    const j = yy * width + xx;
                    if (!filled[j]) continue;
                    r += rgba[j * 4];
                    g += rgba[j * 4 + 1];
                    b += rgba[j * 4 + 2];
                    count++;
                }
            }
            if (count) {
                rgba[i * 4] = Math.round(r / count);
                rgba[i * 4 + 1] = Math.round(g / count);
                rgba[i * 4 + 2] = Math.round(b / count);
                done.push(i);
            }
        }
        for (const i of done) filled[i] = 1;
        const next: number[] = [];
        for (const i of done) {
            const x = i % width;
            const y = (i - x) / width;
            for (let dy = -1; dy <= 1; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx;
                    if (xx < 0 || xx >= width) continue;
                    const j = yy * width + xx;
                    if (!filled[j] && !queued[j]) {
                        queued[j] = 1;
                        next.push(j);
                    }
                }
            }
        }
        frontier = next;
    }
}

/** True when any pixel is not fully opaque. */
export function hasTransparency(rgba: Uint8Array): boolean {
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
    return false;
}

/** Raw RGBA image. */
export interface RawImage {
    data: Uint8Array;
    width: number;
    height: number;
}

export function cropRaw(img: RawImage, r: Rect): RawImage {
    const out = new Uint8Array(r.width * r.height * 4);
    for (let y = 0; y < r.height; y++) {
        const from = ((r.top + y) * img.width + r.left) * 4;
        out.set(img.data.subarray(from, from + r.width * 4), y * r.width * 4);
    }
    return { data: out, width: r.width, height: r.height };
}

/** Clockwise rotation by 90 / 180 / 270 degrees. */
export function rotateRaw(img: RawImage, degrees: number): RawImage {
    const d = ((Math.round(degrees / 90) % 4) + 4) % 4;
    if (!d) return img;
    const { width: w, height: h, data } = img;
    const ow = d === 2 ? w : h;
    const oh = d === 2 ? h : w;
    const out = new Uint8Array(data.length);
    const src32 = view32(data, w * h);
    const dst32 = new Uint32Array(out.buffer, 0, w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let nx: number;
            let ny: number;
            if (d === 1) {
                nx = h - 1 - y;
                ny = x;
            } else if (d === 2) {
                nx = w - 1 - x;
                ny = h - 1 - y;
            } else {
                nx = y;
                ny = w - 1 - x;
            }
            dst32[ny * ow + nx] = src32[y * w + x];
        }
    }
    return { data: out, width: ow, height: oh };
}

/** Mirrors horizontally (flipH) and / or vertically (flipV). */
export function flipRaw(img: RawImage, flipH: boolean, flipV: boolean): RawImage {
    if (!flipH && !flipV) return img;
    const { width: w, height: h, data } = img;
    const out = new Uint8Array(data.length);
    const src32 = view32(data, w * h);
    const dst32 = new Uint32Array(out.buffer, 0, w * h);
    for (let y = 0; y < h; y++) {
        const sy = flipV ? h - 1 - y : y;
        for (let x = 0; x < w; x++) dst32[y * w + x] = src32[sy * w + (flipH ? w - 1 - x : x)];
    }
    return { data: out, width: w, height: h };
}

/** A 32-bit view of RGBA data (copies when the bytes are not 4-byte aligned). */
function view32(data: Uint8Array, pixels: number): Uint32Array {
    const src = data.byteOffset % 4 ? data.slice() : data;
    return new Uint32Array(src.buffer, src.byteOffset, pixels);
}
