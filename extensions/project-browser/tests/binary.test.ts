import assert from 'assert';
import * as zlib from 'zlib';
import { crc32, dragIconPixels, pngEncode, zipList, zipRead, zipWrite } from '../source/shared/binary';
import { results, test } from './harness';

/** A zip made by Windows PowerShell 5.1 Compress-Archive (deflate, backslash names): Art\hero.txt, its .meta, Art.meta. */
const PS_ZIP =
    'UEsDBBQAAAAIADOCbl284AkIEQAAAPAAAAAMAAAAQXJ0XGhlcm8udHh0y0jNyclXKM8vyklRyBgBbABQSwMEFAAAAAgAM4JuXVa8vBA3AAAATwAAABEAAABBcnRcaGVyby50eHQubWV0YatWKkstUrJSMtQz0DNQ0lHKzC3ILyoBC5WkVpQARUpLM1NACqBA1wgIdI2BQNcECHRNkYBSLQBQSwMEFAAAAAgAM4JuXdYO46I9AAAAVAAAAAgAAABBcnQubWV0YatWKkstUrJSMtQz0jNQ0lHKzC3ILyoBC6VkFqUml+QXVQKFS0szU4BCiVCgawQEusZAoGsCBLqmSECpFgBQSwECFAAUAAAACAAzgm5dvOAJCBEAAADwAAAADAAAAAAAAAAAAAAAAAAAAAAAQXJ0XGhlcm8udHh0UEsBAhQAFAAAAAgAM4JuXVa8vBA3AAAATwAAABEAAAAAAAAAAAAAAAAAOwAAAEFydFxoZXJvLnR4dC5tZXRhUEsBAhQAFAAAAAgAM4JuXdYO46I9AAAAVAAAAAgAAAAAAAAAAAAAAAAAoQAAAEFydC5tZXRhUEsFBgAAAAADAAMArwAAAAQBAAAAAA==';

test('crc32 of the standard check string', () => {
    assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926);
    assert.strictEqual(crc32(Buffer.alloc(0)), 0);
});

test('zip: write then read back (stored and deflated, UTF-8 names, folders)', () => {
    const big = Buffer.from('abc '.repeat(500));
    const entries = [
        { name: 'asset-package.json', data: Buffer.from('{"format":"cocos-asset-package"}') },
        { name: 'assets/', data: Buffer.alloc(0) },
        { name: 'assets/Ảnh/hero.png', data: Buffer.from([0, 1, 2, 3, 255]) },
        { name: 'assets/big.txt', data: big },
    ];
    const zip = zipWrite(entries);
    const back = zipRead(zip);
    assert.deepStrictEqual(back.map((e) => e.name), entries.map((e) => e.name));
    assert.ok(back[2].data.equals(entries[2].data));
    assert.ok(back[3].data.equals(big));
    assert.ok(zip.length < big.length, 'the repetitive file is deflated');
    assert.deepStrictEqual(zipList(zip), entries.map((e) => e.name));
});

test('zip: reads an archive made by Windows Compress-Archive (backslash names)', () => {
    const list = zipRead(Buffer.from(PS_ZIP, 'base64'));
    assert.deepStrictEqual(list.map((e) => e.name).sort(), ['Art.meta', 'Art/hero.txt', 'Art/hero.txt.meta']);
    const hero = list.find((e) => e.name === 'Art/hero.txt')!;
    assert.strictEqual(hero.data.toString(), 'hello world '.repeat(20));
    const meta = JSON.parse(list.find((e) => e.name === 'Art/hero.txt.meta')!.data.toString());
    assert.strictEqual(meta.uuid, '11111111-2222-3333-4444-555555555555');
});

test('zip: not a zip throws a readable error', () => {
    assert.throws(() => zipRead(Buffer.from('hello, not a zip at all, just text')), /Not a zip/);
});

test('png: 32 px drag icons are valid PNG files', () => {
    for (const kind of ['files', 'package'] as const) {
        for (const count of [1, 3]) {
            const px = dragIconPixels(kind, count);
            assert.strictEqual(px.length, 32 * 32 * 4);
            const png = pngEncode(32, 32, px);
            assert.deepStrictEqual(Array.from(png.slice(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            assert.strictEqual(png.toString('ascii', 12, 16), 'IHDR');
            assert.strictEqual(png.readUInt32BE(16), 32);
            // IDAT inflates to (1 filter byte + 32 * 4) * 32 rows
            const idatLen = png.readUInt32BE(33);
            assert.strictEqual(png.toString('ascii', 37, 41), 'IDAT');
            const raw = zlib.inflateSync(png.slice(41, 41 + idatLen));
            assert.strictEqual(raw.length, (32 * 4 + 1) * 32);
            // the chunk CRC is right
            assert.strictEqual(png.readUInt32BE(41 + idatLen), crc32(png.slice(37, 41 + idatLen)));
            // something is drawn, and the corners stay transparent
            assert.ok(px.some((v, i) => i % 4 === 3 && v === 255));
            assert.strictEqual(px[3], 0);
        }
    }
});

console.log(`${results.passed} passed, ${results.failed} failed`);
process.exitCode = results.failed ? 1 : 0;
