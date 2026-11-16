/**
 * Image Tools settings (plain JSON: sent from the panel to the main process).
 * Each section has an `enabled` flag, like the foldouts in the panel.
 */

export type ImageFormat = 'png' | 'jpg' | 'webp' | 'avif';
export type OutputFormat = 'keep' | ImageFormat;
export type ResizeFit = 'fill' | 'contain' | 'cover' | 'inside' | 'outside';
export type ResizeKernel = 'nearest' | 'cubic' | 'mitchell' | 'lanczos2' | 'lanczos3';
export type SizeRounding = 'none' | 'pot-nearest' | 'pot-up' | 'pot-down' | 'multiple4';

export interface CropOptions {
    enabled: boolean;
    /** Normalized to the (auto-oriented) source, 0..1, so a batch crops the same region of each image. */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TrimOptions {
    enabled: boolean;
    /** Pixels with alpha <= threshold (0..255) count as transparent. */
    threshold: number;
    /** Transparent border kept around the content, in pixels. */
    margin: number;
}

export interface TransformOptions {
    rotate: 0 | 90 | 180 | 270;
    flipH: boolean;
    flipV: boolean;
}

export interface ResizeOptions {
    enabled: boolean;
    mode: 'pixels' | 'percent';
    width: number;
    height: number;
    percent: number;
    keepAspect: boolean;
    fit: ResizeFit;
    kernel: ResizeKernel;
    rounding: SizeRounding;
    /** When off, images are never made larger than they are. */
    allowEnlarge: boolean;
    /** Fill for 'contain' letterboxing (#rrggbbaa). */
    background: string;
}

export interface PadOptions {
    enabled: boolean;
    top: number;
    right: number;
    bottom: number;
    left: number;
    /** #rrggbbaa */
    color: string;
    extendWith: 'background' | 'copy' | 'mirror' | 'repeat';
}

export interface AdjustOptions {
    enabled: boolean;
    /** -100..100 */
    brightness: number;
    /** -100..100 */
    contrast: number;
    /** -100..100 (-100 = grayscale) */
    saturation: number;
    /** -180..180 degrees */
    hue: number;
    grayscale: boolean;
    /** #rrggbb */
    tint: string;
    /** 0..100 */
    tintAmount: number;
}

export interface AlphaOptions {
    enabled: boolean;
    /** 'bleed' fills transparent pixels' RGB from their neighbours (fixes dark halos); 'premultiply' multiplies RGB by alpha. */
    mode: 'bleed' | 'premultiply';
}

export interface EncodeOptions {
    format: OutputFormat;
    /** PNG */
    pngCompression: number; // 0..9
    pngPalette: boolean;
    pngColors: number; // 2..256
    pngQuality: number; // 0..100
    pngDither: number; // 0..1
    pngEffort: number; // 1..10
    /** JPG */
    jpgQuality: number;
    jpgProgressive: boolean;
    jpgMozjpeg: boolean;
    jpgChroma: '4:2:0' | '4:4:4';
    /** Background used to flatten transparency (#rrggbb). */
    jpgBackground: string;
    /** WebP */
    webpQuality: number;
    webpLossless: boolean;
    webpNearLossless: boolean;
    webpAlphaQuality: number;
    webpEffort: number; // 0..6
    /** AVIF */
    avifQuality: number;
    avifLossless: boolean;
    avifEffort: number; // 0..9
    avifChroma: '4:2:0' | '4:4:4';
    /** Keep the original file when the result is not smaller (same format, no edits). */
    skipIfLarger: boolean;
}

export interface ImageOptions {
    crop: CropOptions;
    trim: TrimOptions;
    transform: TransformOptions;
    resize: ResizeOptions;
    pad: PadOptions;
    adjust: AdjustOptions;
    alpha: AlphaOptions;
    encode: EncodeOptions;
}

export type SaveMode = 'overwrite' | 'copy';

export interface SaveOptions {
    mode: SaveMode;
    /** Appended to the file name for copies ("-small"). */
    suffix: string;
    /** Absolute folder for copies (null = next to the source). */
    folder: string | null;
}

export function defaultImageOptions(): ImageOptions {
    return {
        crop: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
        trim: { enabled: false, threshold: 0, margin: 0 },
        transform: { rotate: 0, flipH: false, flipV: false },
        resize: {
            enabled: false,
            mode: 'percent',
            width: 512,
            height: 512,
            percent: 50,
            keepAspect: true,
            fit: 'fill',
            kernel: 'lanczos3',
            rounding: 'none',
            allowEnlarge: true,
            background: '#00000000',
        },
        pad: { enabled: false, top: 0, right: 0, bottom: 0, left: 0, color: '#00000000', extendWith: 'background' },
        adjust: { enabled: false, brightness: 0, contrast: 0, saturation: 0, hue: 0, grayscale: false, tint: '#ffffff', tintAmount: 0 },
        alpha: { enabled: false, mode: 'bleed' },
        encode: {
            format: 'keep',
            pngCompression: 9,
            pngPalette: false,
            pngColors: 256,
            pngQuality: 90,
            pngDither: 1,
            pngEffort: 7,
            jpgQuality: 85,
            jpgProgressive: false,
            jpgMozjpeg: true,
            jpgChroma: '4:2:0',
            jpgBackground: '#ffffff',
            webpQuality: 85,
            webpLossless: false,
            webpNearLossless: false,
            webpAlphaQuality: 100,
            webpEffort: 4,
            avifQuality: 60,
            avifLossless: false,
            avifEffort: 4,
            avifChroma: '4:4:4',
            skipIfLarger: true,
        },
    };
}

export function defaultSaveOptions(): SaveOptions {
    return { mode: 'copy', suffix: '-edited', folder: null };
}

/** Deep-merges stored settings over the defaults (unknown keys dropped). */
export function mergeImageOptions(stored: any): ImageOptions {
    const base: any = defaultImageOptions();
    if (!stored || typeof stored !== 'object') return base;
    for (const section of Object.keys(base)) {
        const src = stored[section];
        if (!src || typeof src !== 'object') continue;
        for (const key of Object.keys(base[section])) {
            if (src[key] !== undefined && typeof src[key] === typeof base[section][key]) base[section][key] = src[key];
        }
    }
    return base;
}

export const IMAGE_INPUT_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.tif', '.tiff'];
export const AUDIO_INPUT_EXTS = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.opus', '.weba', '.webm'];

export function extOf(path: string): string {
    const m = /\.[^./\\]+$/.exec(path || '');
    return m ? m[0].toLowerCase() : '';
}

export function isImagePath(path: string): boolean {
    return IMAGE_INPUT_EXTS.indexOf(extOf(path)) >= 0;
}

export function isAudioPath(path: string): boolean {
    return AUDIO_INPUT_EXTS.indexOf(extOf(path)) >= 0;
}

/** Output format for a source file ("keep" resolves to the source's format; GIF/TIFF become PNG). */
export function resolveFormat(sourcePath: string, format: OutputFormat): ImageFormat {
    if (format !== 'keep') return format;
    const ext = extOf(sourcePath);
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
    if (ext === '.webp') return 'webp';
    if (ext === '.avif') return 'avif';
    return 'png';
}

/** File extension written for a format; keeps ".jpeg" when the source used it. */
export function extensionFor(format: ImageFormat, sourcePath?: string): string {
    if (format === 'jpg' && sourcePath && extOf(sourcePath) === '.jpeg') return '.jpeg';
    return '.' + format;
}

/** #rgb, #rrggbb or #rrggbbaa -> {r,g,b,alpha 0..1} */
export function parseColor(hex: string): { r: number; g: number; b: number; alpha: number } {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return { r: 0, g: 0, b: 0, alpha: 0 };
    return { r: n(0), g: n(2), b: n(4), alpha: h.length === 8 ? n(6) / 255 : 1 };
}
