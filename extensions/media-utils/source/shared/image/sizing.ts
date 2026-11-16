/**
 * Resize maths: target size from the Resize settings, power-of-two and
 * multiple-of-4 rounding (texture compression formats such as ETC2, ASTC,
 * PVRTC want them), and the size after rotation / padding.
 */
import { ResizeOptions, SizeRounding } from './options';

export function isPowerOfTwo(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
}

export function potUp(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

export function potDown(n: number): number {
    let p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
}

export function potNearest(n: number): number {
    const up = potUp(n);
    const down = potDown(n);
    return up - n < n - down ? up : down;
}

export function multipleOf(n: number, m: number): number {
    return Math.max(m, Math.ceil(n / m) * m);
}

export function roundSize(n: number, rounding: SizeRounding): number {
    n = Math.max(1, Math.round(n));
    switch (rounding) {
        case 'pot-nearest':
            return potNearest(n);
        case 'pot-up':
            return potUp(n);
        case 'pot-down':
            return potDown(n);
        case 'multiple4':
            return multipleOf(n, 4);
        default:
            return n;
    }
}

export interface ResizePlan {
    width: number;
    height: number;
    /** 'fill' = exactly width x height; 'contain' letterboxes, 'cover' crops. */
    fit: 'fill' | 'contain' | 'cover';
}

/** Output size for a srcW x srcH image. */
export function planResize(srcW: number, srcH: number, o: ResizeOptions): ResizePlan {
    let w: number;
    let h: number;
    let fit: ResizePlan['fit'] = 'fill';
    if (o.mode === 'percent') {
        const p = Math.max(0.1, Number(o.percent) || 100) / 100;
        w = srcW * p;
        h = srcH * p;
    } else {
        let bw = Math.max(0, Math.round(o.width) || 0);
        let bh = Math.max(0, Math.round(o.height) || 0);
        if (!bw && !bh) {
            bw = srcW;
            bh = srcH;
        } else if (!bw) bw = Math.round((bh * srcW) / srcH);
        else if (!bh) bh = Math.round((bw * srcH) / srcW);
        let mode = o.fit;
        if (mode === 'fill' && o.keepAspect) mode = 'inside';
        if (mode === 'inside' || mode === 'outside') {
            const sx = bw / srcW;
            const sy = bh / srcH;
            const s = mode === 'inside' ? Math.min(sx, sy) : Math.max(sx, sy);
            w = srcW * s;
            h = srcH * s;
        } else {
            w = bw;
            h = bh;
            fit = mode;
        }
    }
    if (!o.allowEnlarge && (w > srcW || h > srcH)) {
        if (fit === 'fill') {
            const s = Math.min(srcW / w, srcH / h);
            w *= s;
            h *= s;
        } else {
            w = Math.min(w, srcW);
            h = Math.min(h, srcH);
        }
    }
    return { width: roundSize(w, o.rounding), height: roundSize(h, o.rounding), fit };
}

/** Size after a 90/180/270 rotation. */
export function rotatedSize(w: number, h: number, rotate: number): { width: number; height: number } {
    return rotate === 90 || rotate === 270 ? { width: h, height: w } : { width: w, height: h };
}

/** Pixel crop rectangle from a normalized one, clamped to the image (at least 1 x 1). */
export function cropRect(w: number, h: number, c: { x: number; y: number; width: number; height: number }): { left: number; top: number; width: number; height: number } {
    const left = Math.max(0, Math.min(w - 1, Math.round(c.x * w)));
    const top = Math.max(0, Math.min(h - 1, Math.round(c.y * h)));
    const right = Math.max(left + 1, Math.min(w, Math.round((c.x + c.width) * w)));
    const bottom = Math.max(top + 1, Math.min(h, Math.round((c.y + c.height) * h)));
    return { left, top, width: right - left, height: bottom - top };
}

/** Texture-friendliness of a size, for the panel's info line. */
export function sizeHints(w: number, h: number): string[] {
    const hints: string[] = [];
    if (isPowerOfTwo(w) && isPowerOfTwo(h)) hints.push('POT');
    else if (w % 4 === 0 && h % 4 === 0) hints.push('x4');
    else hints.push('NPOT');
    return hints;
}
