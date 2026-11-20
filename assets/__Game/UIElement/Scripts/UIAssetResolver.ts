import { SpriteFrame, Texture2D, warn } from 'cc';

const _cache = new WeakMap<SpriteFrame, string>();

/**
 * Converts a SpriteFrame into a URL usable from HTML/CSS (<img src>, background-image...).
 * Handles atlas / auto-atlas packing, rotated frames and trimmed frames by cropping
 * the frame out of its texture through a 2D canvas. Results are cached per SpriteFrame.
 */
export function spriteFrameToUrl(spriteFrame: SpriteFrame | null): string {
    if (!spriteFrame) return '';
    const cached = _cache.get(spriteFrame);
    if (cached !== undefined) return cached;

    const texture = spriteFrame.texture as Texture2D;
    const image = texture && texture.image;
    const source = image && image.data as CanvasImageSource;
    if (!source || ArrayBuffer.isView(source)) {
        warn(`[UIDocument] SpriteFrame "${spriteFrame.name}" has no drawable image source (compressed texture?).`);
        _cache.set(spriteFrame, '');
        return '';
    }

    const rect = spriteFrame.rect;
    const original = spriteFrame.originalSize;
    const offset = spriteFrame.offset;
    const isWholeImage = !spriteFrame.rotated
        && rect.x === 0 && rect.y === 0
        && rect.width === original.width && rect.height === original.height
        && rect.width === image.width && rect.height === image.height;

    // Fast path: the frame is the whole image, reuse its URL directly.
    if (isWholeImage && typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement && source.src) {
        _cache.set(spriteFrame, source.src);
        return source.src;
    }

    const canvas = document.createElement('canvas');
    canvas.width = original.width;
    canvas.height = original.height;
    const ctx = canvas.getContext('2d')!;
    // Restore trimmed transparent padding (Cocos offset is center-based, y-up).
    const dx = (original.width - rect.width) / 2 + offset.x;
    const dy = (original.height - rect.height) / 2 - offset.y;

    if (spriteFrame.rotated) {
        // Packers rotate frames 90° clockwise; the region in the texture is (rect.height x rect.width).
        ctx.translate(dx, dy + rect.height);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(source, rect.x, rect.y, rect.height, rect.width, 0, 0, rect.height, rect.width);
    } else {
        ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, dx, dy, rect.width, rect.height);
    }

    let url = '';
    try {
        url = canvas.toDataURL('image/png');
    } catch (e) {
        warn(`[UIDocument] Cannot export SpriteFrame "${spriteFrame.name}" (tainted canvas?).`, e);
    }
    _cache.set(spriteFrame, url);
    return url;
}
