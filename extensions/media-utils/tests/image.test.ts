import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assert, run, skip, test } from './harness';
import { loadSharp } from '../source/main/sharp-loader';
import { runImagePipeline } from '../source/main/image-pipeline';
import { OutputWriter, planCopyPath, planOverwritePath } from '../source/main/output';
import { defaultImageOptions, ImageOptions, mergeImageOptions, resolveFormat, extensionFor } from '../source/shared/image/options';
import { adjustPixels, alphaBleed, cropRaw, flipRaw, opaqueBounds, premultiply, rotateRaw } from '../source/shared/image/pixels';
import { cropRect, planResize, potDown, potNearest, potUp, roundSize } from '../source/shared/image/sizing';

// ------------------------------------------------------------ pure parts

test('power-of-two and multiple-of-4 rounding', () => {
    assert.deepStrictEqual([potUp(300), potDown(300), potNearest(300), potNearest(400)], [512, 256, 256, 512]);
    assert.strictEqual(roundSize(301, 'multiple4'), 304);
    assert.strictEqual(roundSize(1, 'multiple4'), 4);
    assert.strictEqual(roundSize(64, 'pot-up'), 64);
});

test('resize plans: percent, keep aspect, fit modes, no enlarge', () => {
    const base = defaultImageOptions().resize;
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'percent', percent: 50 }), { width: 200, height: 100, fit: 'fill' });
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'pixels', width: 100, height: 100, keepAspect: true, fit: 'fill' }), { width: 100, height: 50, fit: 'fill' });
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'pixels', width: 100, height: 100, keepAspect: false, fit: 'fill' }), { width: 100, height: 100, fit: 'fill' });
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'pixels', width: 100, height: 100, fit: 'cover' }), { width: 100, height: 100, fit: 'cover' });
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'pixels', width: 100, height: 100, keepAspect: false, fit: 'outside' }), { width: 200, height: 100, fit: 'fill' });
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'pixels', width: 0, height: 50 }), { width: 100, height: 50, fit: 'fill' });
    assert.deepStrictEqual(planResize(400, 200, { ...base, mode: 'percent', percent: 200, allowEnlarge: false }), { width: 400, height: 200, fit: 'fill' });
    assert.deepStrictEqual(planResize(300, 150, { ...base, mode: 'percent', percent: 100, rounding: 'pot-up' }), { width: 512, height: 256, fit: 'fill' });
});

test('normalized crop rect is clamped to the image', () => {
    assert.deepStrictEqual(cropRect(100, 50, { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }), { left: 10, top: 10, width: 50, height: 25 });
    assert.deepStrictEqual(cropRect(100, 50, { x: 0.9, y: 0.9, width: 0.5, height: 0.5 }), { left: 90, top: 45, width: 10, height: 5 });
});

function img(w: number, h: number, fill: (x: number, y: number) => number[]) {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fill(x, y), (y * w + x) * 4);
    return { data, width: w, height: h };
}
const px = (im: { data: Uint8Array; width: number }, x: number, y: number) => Array.from(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

test('rotate / flip / crop on raw RGBA', () => {
    const a = img(3, 2, (x, y) => [x, y, 0, 255]);
    const r90 = rotateRaw(a, 90);
    assert.deepStrictEqual([r90.width, r90.height], [2, 3]);
    assert.deepStrictEqual(px(r90, 1, 0), [0, 0, 0, 255], 'top-left goes to top-right');
    assert.deepStrictEqual(px(rotateRaw(a, 180), 0, 0), [2, 1, 0, 255]);
    assert.deepStrictEqual(px(rotateRaw(a, 270), 0, 0), [2, 0, 0, 255]);
    assert.deepStrictEqual(px(flipRaw(a, true, false), 0, 0), [2, 0, 0, 255]);
    assert.deepStrictEqual(px(flipRaw(a, false, true), 0, 0), [0, 1, 0, 255]);
    const c = cropRaw(a, { left: 1, top: 1, width: 2, height: 1 });
    assert.deepStrictEqual(px(c, 0, 0), [1, 1, 0, 255]);
});

test('transparent bounds, alpha bleed, premultiply', () => {
    const a = img(5, 5, (x, y) => (x >= 1 && x <= 2 && y === 2 ? [200, 100, 50, 255] : [0, 0, 0, 0]));
    assert.deepStrictEqual(opaqueBounds(a.data, 5, 5), { left: 1, top: 2, width: 2, height: 1 });
    alphaBleed(a.data, 5, 5);
    assert.deepStrictEqual(px(a, 4, 4), [200, 100, 50, 0], 'far corner gets the sprite colour, alpha stays 0');
    assert.deepStrictEqual(px(a, 0, 0), [200, 100, 50, 0]);
    const b = img(1, 1, () => [200, 100, 50, 128]);
    premultiply(b.data);
    assert.deepStrictEqual(px(b, 0, 0), [100, 50, 25, 128]);
});

test('colour adjust: grayscale, brightness, tint', () => {
    const a = img(1, 1, () => [200, 100, 50, 77]);
    adjustPixels(a.data, { ...defaultImageOptions().adjust, enabled: true, grayscale: true });
    const p = px(a, 0, 0);
    assert.ok(p[0] === p[1] && p[1] === p[2], 'gray');
    assert.strictEqual(p[3], 77, 'alpha untouched');
    const b = img(1, 1, () => [100, 100, 100, 255]);
    adjustPixels(b.data, { ...defaultImageOptions().adjust, brightness: 20 });
    assert.strictEqual(px(b, 0, 0)[0], 151);
    const c = img(1, 1, () => [200, 200, 200, 255]);
    adjustPixels(c.data, { ...defaultImageOptions().adjust, tint: '#ff0000', tintAmount: 100 });
    assert.deepStrictEqual(px(c, 0, 0), [200, 0, 0, 255]);
});

test('settings merge keeps defaults for missing or wrong-typed keys', () => {
    const m = mergeImageOptions({ resize: { enabled: true, percent: 'x', width: 64 }, bogus: 1 });
    assert.strictEqual(m.resize.enabled, true);
    assert.strictEqual(m.resize.percent, 50);
    assert.strictEqual(m.resize.width, 64);
    assert.strictEqual(resolveFormat('a.JPEG', 'keep'), 'jpg');
    assert.strictEqual(extensionFor('jpg', 'a.jpeg'), '.jpeg');
    assert.strictEqual(resolveFormat('a.gif', 'keep'), 'png');
});

// ------------------------------------------------------------ sharp (Cocos' copy)

const sharpInfo = loadSharp();
const scratch = process.env.MEDIA_UTILS_SCRATCH || '';
const samples = scratch && fs.existsSync(scratch) ? fs.readdirSync(scratch) : [];
const pngSample = samples.find((f) => /\.png$/i.test(f));
const jpgSample = samples.find((f) => /\.jpe?g$/i.test(f));

function opts(patch: (o: ImageOptions) => void): ImageOptions {
    const o = defaultImageOptions();
    patch(o);
    return o;
}

function magic(buf: Buffer): string {
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buf.toString('ascii', 4, 8) === 'ftyp' && /avif|avis|mif1/.test(buf.toString('ascii', 8, 12))) return 'avif';
    return '?';
}

if (!sharpInfo.sharp) {
    skip('sharp image tests', sharpInfo.error);
} else {
    const sharp = sharpInfo.sharp;
    test(`Cocos sharp loads (${sharpInfo.version}, libvips ${sharpInfo.vips}) and writes PNG/JPG/WebP/AVIF`, () => {
        assert.ok(sharpInfo.formats.png && sharpInfo.formats.jpeg && sharpInfo.formats.webp);
        assert.ok(sharpInfo.formats.heif || sharpInfo.formats.avif, 'AVIF (heif) output');
        console.log(`       loaded from ${sharpInfo.path}`);
    });

    if (!pngSample || !jpgSample) {
        skip('sample-file conversions', 'sample PNG/JPG not found');
    } else {
        const png = fs.readFileSync(path.join(scratch, pngSample));
        const jpg = fs.readFileSync(path.join(scratch, jpgSample));

        test('convert PNG -> WebP / JPG / AVIF and JPG -> PNG', async () => {
            const meta = await sharp(png).metadata();
            for (const format of ['webp', 'jpg', 'avif'] as const) {
                const r = await runImagePipeline(sharp, png, 'a.png', opts((o) => (o.encode.format = format)));
                assert.strictEqual(magic(r.buffer), format);
                assert.deepStrictEqual([r.result.width, r.result.height], [meta.width, meta.height]);
                console.log(`       png ${png.length} B -> ${format} ${r.buffer.length} B`);
            }
            const r2 = await runImagePipeline(sharp, jpg, 'b.jpg', opts((o) => (o.encode.format = 'png')));
            assert.strictEqual(magic(r2.buffer), 'png');
        });

        test('PNG palette quantisation is smaller than lossless and is indexed', async () => {
            const lossless = await runImagePipeline(sharp, png, 'a.png', defaultImageOptions());
            const palette = await runImagePipeline(sharp, png, 'a.png', opts((o) => {
                o.encode.pngPalette = true;
                o.encode.pngColors = 64;
                o.encode.pngQuality = 80;
            }));
            assert.strictEqual(magic(palette.buffer), 'png');
            assert.strictEqual(palette.buffer[25], 3, 'IHDR colour type 3 = indexed');
            assert.ok(palette.buffer.length < lossless.buffer.length, `${palette.buffer.length} < ${lossless.buffer.length}`);
            console.log(`       original ${png.length} B, lossless ${lossless.buffer.length} B, 64-colour palette ${palette.buffer.length} B`);
        });

        test('lossless PNG re-encode of an indexed PNG stays indexed and pixel-exact', async () => {
            const r = await runImagePipeline(sharp, png, 'a.png', defaultImageOptions());
            const a = await sharp(png).ensureAlpha().raw().toBuffer();
            const b = await sharp(r.buffer).ensureAlpha().raw().toBuffer();
            assert.ok(a.equals(b), 'same pixels');
            console.log(`       original ${png.length} B -> lossless ${r.buffer.length} B (colour type ${r.buffer[25]})`);
            assert.ok(r.buffer.length < png.length * 1.2, 'not much bigger than the source');
        });

        test('JPG / WebP quality changes the size', async () => {
            const q90 = await runImagePipeline(sharp, jpg, 'b.jpg', opts((o) => (o.encode.jpgQuality = 90)));
            const q40 = await runImagePipeline(sharp, jpg, 'b.jpg', opts((o) => (o.encode.jpgQuality = 40)));
            assert.ok(q40.buffer.length < q90.buffer.length);
            const w90 = await runImagePipeline(sharp, jpg, 'b.jpg', opts((o) => { o.encode.format = 'webp'; o.encode.webpQuality = 90; }));
            const w40 = await runImagePipeline(sharp, jpg, 'b.jpg', opts((o) => { o.encode.format = 'webp'; o.encode.webpQuality = 40; }));
            assert.ok(w40.buffer.length < w90.buffer.length);
        });

        test('resize 50 % / power of two / multiple of 4 / contain', async () => {
            const meta = await sharp(png).metadata();
            const half = await runImagePipeline(sharp, png, 'a.png', opts((o) => { o.resize.enabled = true; o.resize.mode = 'percent'; o.resize.percent = 50; }));
            assert.deepStrictEqual([half.result.width, half.result.height], [Math.round(meta.width / 2), Math.round(meta.height / 2)]);
            const back = await sharp(half.buffer).metadata();
            assert.deepStrictEqual([back.width, back.height], [half.result.width, half.result.height]);
            const pot = await runImagePipeline(sharp, png, 'a.png', opts((o) => { o.resize.enabled = true; o.resize.percent = 33; o.resize.rounding = 'pot-nearest'; o.resize.kernel = 'mitchell'; }));
            assert.ok((pot.result.width & (pot.result.width - 1)) === 0 && (pot.result.height & (pot.result.height - 1)) === 0);
            const m4 = await runImagePipeline(sharp, png, 'a.png', opts((o) => { o.resize.enabled = true; o.resize.percent = 37; o.resize.rounding = 'multiple4'; }));
            assert.ok(m4.result.width % 4 === 0 && m4.result.height % 4 === 0);
            const box = await runImagePipeline(sharp, png, 'a.png', opts((o) => { o.resize.enabled = true; o.resize.mode = 'pixels'; o.resize.width = 128; o.resize.height = 128; o.resize.fit = 'contain'; }));
            assert.deepStrictEqual([box.result.width, box.result.height], [128, 128]);
        });

        test('crop, rotate 90, pad, trim on a sample', async () => {
            const meta = await sharp(png).metadata();
            const r = await runImagePipeline(sharp, png, 'a.png', opts((o) => {
                o.crop = { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
                o.transform.rotate = 90;
                o.pad = { enabled: true, top: 2, right: 3, bottom: 4, left: 5, color: '#ff000080', extendWith: 'background' };
            }));
            const cw = Math.round(meta.width * 0.75) - Math.round(meta.width * 0.25);
            const ch = Math.round(meta.height * 0.75) - Math.round(meta.height * 0.25);
            assert.deepStrictEqual([r.result.width, r.result.height], [ch + 8, cw + 6]);
            const raw = await sharp(r.buffer).ensureAlpha().raw().toBuffer();
            assert.deepStrictEqual(Array.from(raw.subarray(0, 4)), [255, 0, 0, 128], 'padding colour');
            // Trim the padding off again (only the padding is translucent... use a fully transparent pad).
            const padded = await runImagePipeline(sharp, png, 'a.png', opts((o) => { o.pad = { enabled: true, top: 7, right: 7, bottom: 7, left: 7, color: '#00000000', extendWith: 'background' }; }));
            const trimmed = await runImagePipeline(sharp, padded.buffer, 'p.png', opts((o) => { o.trim.enabled = true; }));
            assert.ok(trimmed.result.width <= meta.width && trimmed.result.height <= meta.height);
            assert.ok(trimmed.result.width < padded.result.width);
        });

        test('alpha bleed result keeps alpha and fills hidden RGB', async () => {
            const sprite = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite([{ input: await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 200, b: 255, alpha: 1 } } }).png().toBuffer(), left: 6, top: 6 }])
                .png()
                .toBuffer();
            const r = await runImagePipeline(sharp, sprite, 's.png', opts((o) => { o.alpha.enabled = true; o.alpha.mode = 'bleed'; }));
            const raw = await sharp(r.buffer).ensureAlpha().raw().toBuffer();
            assert.deepStrictEqual(Array.from(raw.subarray(0, 4)), [0, 200, 255, 0]);
        });

        // ------------------------------------------------------------ output writer (no asset-db)

        test('overwrite keeps the same path and the .meta; backup restores it', async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-utils-out-'));
            const file = path.join(dir, 'sprite.png');
            fs.writeFileSync(file, png);
            fs.writeFileSync(file + '.meta', '{"uuid":"keep-me"}');
            const w = new OutputWriter(dir, null);
            const r = await runImagePipeline(sharp, png, file, opts((o) => { o.resize.enabled = true; o.resize.percent = 25; }));
            const session = w.beginSession('test');
            const saved = await w.save({ source: file, ext: '.png', bytes: r.buffer, save: { mode: 'overwrite', suffix: '', folder: null }, session });
            assert.strictEqual(saved.path, file, 'same path');
            assert.strictEqual(fs.readFileSync(file + '.meta', 'utf8'), '{"uuid":"keep-me"}');
            assert.strictEqual(fs.readFileSync(file).length, r.buffer.length);
            assert.strictEqual(w.summary().last!.files, 1);
            const restored = await w.restoreLast();
            assert.deepStrictEqual(restored.files, [file]);
            assert.ok(fs.readFileSync(file).equals(png), 'original bytes back');
            assert.strictEqual(w.summary().last, null);
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('overwrite with a new format renames file + .meta; restore puts them back', async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-utils-out-'));
            const file = path.join(dir, 'icon.png');
            fs.writeFileSync(file, png);
            fs.writeFileSync(file + '.meta', 'meta');
            const w = new OutputWriter(dir, null);
            const r = await runImagePipeline(sharp, png, file, opts((o) => (o.encode.format = 'webp')));
            const session = w.beginSession('to webp');
            const saved = await w.save({ source: file, ext: '.webp', bytes: r.buffer, save: { mode: 'overwrite', suffix: '', folder: null }, session });
            assert.strictEqual(saved.path, path.join(dir, 'icon.webp'));
            assert.ok(saved.renamed && !fs.existsSync(file) && fs.readFileSync(saved.path + '.meta', 'utf8') === 'meta');
            await w.restoreLast();
            assert.ok(fs.existsSync(file) && !fs.existsSync(saved.path));
            assert.strictEqual(fs.readFileSync(file + '.meta', 'utf8'), 'meta');
            assert.ok(fs.readFileSync(file).equals(png));
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('save as copy uses the suffix and never overwrites', async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-utils-out-'));
            const file = path.join(dir, 'a.jpg');
            fs.writeFileSync(file, jpg);
            const w = new OutputWriter(dir, null);
            const r = await runImagePipeline(sharp, jpg, file, opts((o) => (o.encode.format = 'webp')));
            const s1 = await w.save({ source: file, ext: '.webp', bytes: r.buffer, save: { mode: 'copy', suffix: '-small', folder: null } });
            const s2 = await w.save({ source: file, ext: '.webp', bytes: r.buffer, save: { mode: 'copy', suffix: '-small', folder: null } });
            assert.strictEqual(path.basename(s1.path), 'a-small.webp');
            assert.strictEqual(path.basename(s2.path), 'a-small-1.webp');
            const s3 = await w.save({ source: file, ext: '.jpg', bytes: r.buffer, save: { mode: 'copy', suffix: '', folder: path.join(dir, 'out') } });
            assert.strictEqual(s3.path, path.join(dir, 'out', 'a.jpg'));
            assert.ok(fs.readFileSync(file).equals(jpg), 'source untouched');
            fs.rmSync(dir, { recursive: true, force: true });
        });
    }
}

test('copy / overwrite path planning', () => {
    const taken = new Set([path.join('x', 'a-s.png'), path.join('x', 'a-s-1.png')]);
    assert.strictEqual(planCopyPath(path.join('x', 'a.png'), '.png', '-s', null, (p) => taken.has(p)), path.join('x', 'a-s-2.png'));
    assert.strictEqual(planCopyPath(path.join('x', 'a.png'), '.png', '', null, () => false), path.join('x', 'a-1.png'), 'never the source itself');
    assert.strictEqual(planOverwritePath(path.join('x', 'a.png'), '.webp'), path.join('x', 'a.webp'));
    assert.strictEqual(planOverwritePath(path.join('x', 'a.PNG'), '.png'), path.join('x', 'a.PNG'));
});

run();
