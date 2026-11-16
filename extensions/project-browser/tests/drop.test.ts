import assert from 'assert';
import { dragKindOf, moveVerdict, nodeDropUuids, pickDropEffect, popupPlacement, prefabBaseName, prefabFileName, uniquePrefabUrl } from '../source/shared/drop';
import { containSize, decodeRGBE, extOf, imageMime, imageRef, isBrowserImage, pickImagePath, spriteCrop } from '../source/shared/images';
import { AssetEntry } from '../source/shared/search';
import { folderChain, mainUuid, touchedUuid } from '../source/shared/tree';
import { results, test } from './harness';

function entry(url: string, isDirectory = false, extra: Partial<AssetEntry> = {}): AssetEntry {
    return Object.assign({ uuid: 'u:' + url, url, name: url.slice(url.lastIndexOf('/') + 1), type: '', importer: isDirectory ? 'directory' : 'x', isDirectory }, extra);
}

// ------------------------------------------------------------------ Hierarchy nodes

test('nodeDropUuids: Hierarchy drag info (type cc.Node) gives its nodes, each once', () => {
    const isAsset = () => false;
    const info = { type: 'cc.Node', value: 'n1,n2', additional: [{ type: 'cc.Node', value: 'n1' }, { type: 'cc.Node', value: 'n3' }] };
    assert.deepStrictEqual(nodeDropUuids(info, '', '', isAsset), ['n1', 'n3', 'n2']);
    // entries without a type under a cc.Node drag are nodes too
    assert.deepStrictEqual(nodeDropUuids({ type: 'cc.Node', additional: [{ value: 'n9' }] }, '', '', isAsset), ['n9']);
});

test('nodeDropUuids: dataTransfer additional with cc.Node entries; a bare value only when the drag said node', () => {
    const isAsset = (u: string) => u === 'asset1';
    const add = JSON.stringify([{ type: 'cc.Node', value: 'n1' }, { type: 'cc.Material', value: 'asset1' }]);
    assert.deepStrictEqual(nodeDropUuids(null, 'n1,n2', add, isAsset), ['n1', 'n2']);
    assert.deepStrictEqual(nodeDropUuids(null, 'n1,n2', '', isAsset), [], 'bare value: unknown kind');
    assert.deepStrictEqual(nodeDropUuids({ type: 'cc.Material', value: 'asset1' }, 'asset1', '', isAsset), []);
    assert.deepStrictEqual(nodeDropUuids(null, '', 'not json', isAsset), []);
});

test('nodeDropUuids: uuids the asset index knows are never nodes', () => {
    const info = { type: 'cc.Node', value: 'n1,asset1' };
    assert.deepStrictEqual(nodeDropUuids(info, '', '', (u) => u === 'asset1'), ['n1']);
});

test('dragKindOf: ours, files, Hierarchy nodes, Assets panel assets', () => {
    assert.strictEqual(dragKindOf(true, null, []), 'assets');
    assert.strictEqual(dragKindOf(false, null, ['Files']), 'files');
    assert.strictEqual(dragKindOf(false, { type: 'cc.Node', value: 'n' }, ['value']), 'nodes');
    assert.strictEqual(dragKindOf(false, { type: '', additional: [{ type: 'cc.Node', value: 'n' }] }, []), 'nodes');
    assert.strictEqual(dragKindOf(false, { type: 'cc.Prefab', value: 'p' }, []), 'assets');
    assert.strictEqual(dragKindOf(false, null, ['additional', 'value']), 'assets');
    assert.strictEqual(dragKindOf(false, null, ['text/plain']), 'unknown');
    assert.strictEqual(dragKindOf(false, null, null), 'unknown');
});

// ------------------------------------------------------------------ moves

test('moveVerdict: not into itself, its children, or where everything already is', () => {
    const art = entry('db://assets/Art', true);
    const hero = entry('db://assets/Art/hero.png');
    const tex = entry('db://assets/Textures', true);
    assert.strictEqual(moveVerdict([art], 'db://assets/Art'), 'deny', 'into itself');
    assert.strictEqual(moveVerdict([art], 'db://assets/Art/Characters'), 'deny', 'into its child');
    assert.strictEqual(moveVerdict([hero], 'db://assets/Art'), 'deny', 'already there');
    assert.strictEqual(moveVerdict([hero], 'db://assets/Textures'), 'accept');
    assert.strictEqual(moveVerdict([hero, tex], 'db://assets/Art'), 'accept', 'one of them moves');
    assert.strictEqual(moveVerdict([art], 'db://assets/ArtBackup'), 'accept', 'a sibling with the same prefix is not a child');
    assert.strictEqual(moveVerdict([entry('db://assets/Art/hero.png/sprite', false, { parent: 'x' })], 'db://assets'), 'deny', 'sub-assets do not move');
    assert.strictEqual(moveVerdict([], 'db://assets'), 'deny');
});

test('pickDropEffect: the preferred effect when the source allows it', () => {
    assert.strictEqual(pickDropEffect('all', 'move'), 'move');
    assert.strictEqual(pickDropEffect('uninitialized', 'copy'), 'copy');
    assert.strictEqual(pickDropEffect(undefined, 'copy'), 'copy');
    assert.strictEqual(pickDropEffect('copyMove', 'move'), 'move');
    assert.strictEqual(pickDropEffect('copy', 'move'), 'copy');
    assert.strictEqual(pickDropEffect('move', 'copy'), 'move');
    assert.strictEqual(pickDropEffect('link', 'move'), 'link');
});

// ------------------------------------------------------------------ prefab names

test('prefab names: file-safe, Unity numbering, first free url', () => {
    assert.strictEqual(prefabBaseName('Player'), 'Player');
    assert.strictEqual(prefabBaseName('a/b:c*?"<>|'), 'a_b_c______');
    assert.strictEqual(prefabBaseName('  ..  '), 'Node');
    assert.strictEqual(prefabBaseName(''), 'Node');
    assert.strictEqual(prefabFileName('Cube', 0), 'Cube.prefab');
    assert.strictEqual(prefabFileName('Cube', 2), 'Cube 2.prefab');
    const used: Record<string, boolean> = { 'db://assets/prefabs/cube.prefab': true, 'db://assets/prefabs/cube 1.prefab': true };
    const taken = (u: string) => !!used[u.toLowerCase()];
    assert.strictEqual(uniquePrefabUrl('db://assets/Prefabs', 'Cube', taken), 'db://assets/Prefabs/Cube 2.prefab');
    assert.strictEqual(uniquePrefabUrl('db://assets/Prefabs', 'Sphere', taken), 'db://assets/Prefabs/Sphere.prefab');
    assert.ok(/^db:\/\/assets\/X\/Cube \d+\.prefab$/.test(uniquePrefabUrl('db://assets/X', 'Cube', () => true, 3)), 'gives up with a time stamp');
});

// ------------------------------------------------------------------ popups

test('popupPlacement: below when it fits, above when there is more room there, never past the edge', () => {
    assert.deepStrictEqual(popupPlacement(400, 20, 300), { up: false, maxHeight: 300 });
    assert.deepStrictEqual(popupPlacement(120, 20, 300), { up: false, maxHeight: 120 }, 'scrolls in the room below');
    assert.deepStrictEqual(popupPlacement(60, 500, 300), { up: true, maxHeight: 300 });
    assert.deepStrictEqual(popupPlacement(0, 150, 300), { up: true, maxHeight: 150 }, 'status bar: opens upward');
    assert.deepStrictEqual(popupPlacement(30, 10, 300), { up: false, maxHeight: 30 }, 'tiny panel: what there is');
    assert.deepStrictEqual(popupPlacement(-5, -5, 300), { up: false, maxHeight: 0 });
});

// ------------------------------------------------------------------ ping

test('mainUuid / folderChain / touchedUuid', () => {
    assert.strictEqual(mainUuid('abc@6c48a@f9941'), 'abc');
    assert.strictEqual(mainUuid('abc'), 'abc');
    assert.strictEqual(mainUuid(''), '');
    assert.deepStrictEqual(folderChain('db://assets/Art/UI'), ['db://assets', 'db://assets/Art', 'db://assets/Art/UI']);
    assert.deepStrictEqual(folderChain('db://input-system'), ['db://input-system']);
    assert.deepStrictEqual(folderChain('packages://'), []);
    assert.strictEqual(touchedUuid(['u1']), 'u1');
    assert.strictEqual(touchedUuid([['u2', 'u3']]), 'u2');
    assert.strictEqual(touchedUuid([{ uuid: 'u4' }]), 'u4');
    assert.strictEqual(touchedUuid([{ value: 'u5' }]), 'u5');
    assert.strictEqual(touchedUuid([undefined, ' u6 ']), 'u6');
    assert.strictEqual(touchedUuid(['db://assets/a.png']), '');
    assert.strictEqual(touchedUuid([]), '');
});

// ------------------------------------------------------------------ images

test('images: browser formats and MIME types', () => {
    ['a.png', 'A.JPG', 'b.jpeg', 'c.webp', 'd.gif', 'e.bmp', 'f.svg', 'g.ico', 'h.avif'].forEach((f) => assert.ok(isBrowserImage(f), f));
    ['a.tga', 'b.psd', 'c.tif', 'd.tiff', 'e.hdr', 'f.exr', 'g.dds', 'noext', 'dir.png/x'].forEach((f) => assert.ok(!isBrowserImage(f), f));
    assert.strictEqual(extOf('C:\\x\\Hero.PNG'), '.png');
    assert.strictEqual(imageMime('a.jpg'), 'image/jpeg');
    assert.strictEqual(imageMime('a.svg'), 'image/svg+xml');
    assert.strictEqual(imageMime('a.webp'), 'image/webp');
    assert.strictEqual(imageMime('a.ico'), 'image/x-icon');
});

test('pickImagePath: the source when readable, the library PNG for TGA / PSD / HDR / RGBE', () => {
    assert.strictEqual(pickImagePath('/p/a.png', { '.png': '/lib/a.png' }, false), '/p/a.png');
    assert.strictEqual(pickImagePath('/p/a.tga', { '.json': '/lib/a.json', '.png': '/lib/a.png' }, false), '/lib/a.png');
    assert.strictEqual(pickImagePath('/p/a.psd', { '.json': '/lib/a.json', '.png': '/lib/a.png' }, false), '/lib/a.png');
    assert.strictEqual(pickImagePath('/p/sky.hdr', { '.png': '/lib/sky.png' }, true), '/lib/sky.png');
    assert.strictEqual(pickImagePath('/p/sky.png', { '.png': '/lib/sky.png' }, true), '/lib/sky.png', 'RGBE PNG: decoded from the library copy');
    assert.strictEqual(pickImagePath('/p/a.webp', { '.webp': '/lib/a.webp' }, false), '/p/a.webp');
    assert.strictEqual(pickImagePath('/p/a.exr', { '.json': '/lib/a.json', '.bin': '/lib/a.bin' }, false), null);
    assert.strictEqual(pickImagePath('/p/a.tif', undefined, false), null);
    assert.strictEqual(pickImagePath('/p/a.png', undefined, true), '/p/a.png', 'nothing better: the source');
});

test('imageRef / spriteCrop: the image behind a texture or sprite frame, and its rectangle', () => {
    assert.deepStrictEqual(imageRef({ imageUuidOrDatabaseUri: 'img@6c48a' }), { uuid: 'img' });
    assert.deepStrictEqual(imageRef({ imageUuidOrDatabaseUri: 'img' }), { uuid: 'img' });
    assert.deepStrictEqual(imageRef({ imageUuidOrDatabaseUri: 'db://assets/a.png' }), { url: 'db://assets/a.png' });
    assert.strictEqual(imageRef({}), null);
    assert.strictEqual(imageRef(null), null);
    assert.deepStrictEqual(spriteCrop({ trimX: 4, trimY: 8, width: 30, height: 20, rotated: false }), { x: 4, y: 8, w: 30, h: 20, rotated: false, frameW: 30, frameH: 20 });
    assert.deepStrictEqual(spriteCrop({ trimX: 4, trimY: 8, width: 30, height: 20, rotated: true }), { x: 4, y: 8, w: 20, h: 30, rotated: true, frameW: 30, frameH: 20 });
    assert.strictEqual(spriteCrop({ width: 0, height: 10 }), null);
    assert.strictEqual(spriteCrop(undefined), null);
});

test('containSize: whole picture inside the box, aspect kept, never upscaled', () => {
    assert.deepStrictEqual(containSize(1024, 512, 256), { w: 256, h: 128 });
    assert.deepStrictEqual(containSize(300, 1200, 256), { w: 64, h: 256 });
    assert.deepStrictEqual(containSize(64, 32, 256), { w: 64, h: 32 });
    assert.deepStrictEqual(containSize(4000, 1, 256), { w: 256, h: 1 });
    assert.deepStrictEqual(containSize(0, 10, 256), { w: 1, h: 1 });
});

test('decodeRGBE: engine formula (rgb * 1.1^(a - 128)), tone-mapped, opaque', () => {
    const px = new Uint8ClampedArray([255, 0, 128, 128, 255, 255, 255, 200]);
    decodeRGBE(px);
    // a = 128: value = rgb / 255 -> 1 -> 0.5 after Reinhard -> 0.5^(1/2.2) * 255
    assert.strictEqual(px[0], Math.round(Math.pow(0.5, 1 / 2.2) * 255));
    assert.strictEqual(px[1], 0);
    assert.strictEqual(px[3], 255);
    // a = 200: very bright -> close to white
    assert.ok(px[4] >= 250 && px[7] === 255);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exitCode = 1;
