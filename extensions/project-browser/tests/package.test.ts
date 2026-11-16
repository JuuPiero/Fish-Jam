import assert from 'assert';
import {
    actionsFor, buildManifest, canRemapUuid, classifyEntry, collectClosure, commonDir, decodeClipboardText, decodeFileNameW, decompressUuid, defaultAction, encodeClipboardText, encodeFileNameW,
    extractUuids, isInside, manifestFromFiles, osDragFiles, osDragMode, PackageAsset, parseManifest, remapUuids, resolveImport, rowsUnder, safeRelPath, scriptImports, targetPathFor, treeRows, uniquePath, urlToRel,
} from '../source/shared/package';
import { finish, test, testAsync } from './harness';

const U1 = '620b6bf3-0369-4560-837f-2a2c00b73c26';
const U2 = '1263d74c-8167-4928-91a6-4e2672411f47';
const U3 = 'f18b9b1a-a7c1-41a3-a99e-e9f0eb03f997';

// ------------------------------------------------------------------ uuids and dependencies

test('decompressUuid: script class ids of "__type__" (23 and 22 chars)', () => {
    // checked against CocosGoat: assets/Tests/InputSystemTest.ts.meta
    assert.strictEqual(decompressUuid('3ab89v3xT5F6pL/A6tBHs8+'), '3ab89bf7-c53e-45ea-92ff-03ab411ecf3e');
    // the 22-char form keeps 2 hex digits: round trip through Cocos' compression
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const compress = (u: string, keep: number) => {
        const hex = u.replace(/-/g, '');
        let s = hex.slice(0, keep);
        for (let i = keep; i < 32; i += 3) {
            const v = parseInt(hex.slice(i, i + 3), 16);
            s += B64[v >> 6] + B64[v & 63];
        }
        return s;
    };
    const u = '3ab89bf7-c53e-45ea-92ff-03ab411ecf3e';
    assert.strictEqual(compress(u, 5), '3ab89v3xT5F6pL/A6tBHs8+', 'the compression above matches Cocos');
    assert.strictEqual(compress(u, 2).length, 22);
    assert.strictEqual(decompressUuid(compress(u, 2)), u);
    assert.strictEqual(decompressUuid(compress(U1, 5)), U1);
    assert.strictEqual(decompressUuid('cc.Node'), '');
    assert.strictEqual(decompressUuid('zzzzzzzzzzzzzzzzzzzzzzz'), '', 'the kept digits must be hex');
});

test('extractUuids: __uuid__ refs, sub-asset ids, meta userData and script class ids; main uuids once', () => {
    const prefab = JSON.stringify([
        { __type__: 'cc.Prefab', data: { __id__: 1 } },
        { __type__: '3ab89v3xT5F6pL/A6tBHs8+', node: { __id__: 1 } },
        { __type__: 'cc.MeshRenderer', _materials: [{ __uuid__: U1, __expectedType__: 'cc.Material' }], _mesh: { __uuid__: U2 + '@a804a' } },
        { _mesh2: { __uuid__: U2 + '@b1234' } },
    ]);
    assert.deepStrictEqual(extractUuids(prefab), [U1, U2, '3ab89bf7-c53e-45ea-92ff-03ab411ecf3e']);
    const meta = JSON.stringify({ uuid: U3, subMetas: { '6c48a': { uuid: U3 + '@6c48a', userData: { imageUuidOrDatabaseUri: U3 } } }, userData: { redirect: U3 + '@6c48a' } });
    assert.deepStrictEqual(extractUuids(meta), [U3]);
    assert.deepStrictEqual(extractUuids(''), []);
});

test('remapUuids: whole uuids, also as the main part of "x@sub"; others untouched', () => {
    const NEW = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const text = JSON.stringify({ a: U3, b: U3 + '@6c48a', c: U1, d: 'x' + U3.slice(1) });
    const out = JSON.parse(remapUuids(text, { [U3]: NEW }));
    assert.strictEqual(out.a, NEW);
    assert.strictEqual(out.b, NEW + '@6c48a');
    assert.strictEqual(out.c, U1);
    assert.strictEqual(out.d, 'x' + U3.slice(1), 'not a uuid: left alone');
    assert.strictEqual(remapUuids('same', {}), 'same');
});

test('scriptImports + resolveImport: relative imports to files', () => {
    const src = [
        "import { Util } from './util';",
        "import Base from '../core/Base.ts';",
        "export * from './reexport';",
        "import './side-effect';",
        "const lazy = await import('./lazy');",
        "import { _decorator } from 'cc';",
        "const x = require('./legacy');",
    ].join('\n');
    assert.deepStrictEqual(scriptImports(src), ['./util', '../core/Base.ts', './reexport', './side-effect', './lazy', './legacy']);
    const files = ['assets/Scripts/util.ts', 'assets/core/Base.ts', 'assets/Scripts/lazy/index.ts', 'assets/Scripts/legacy.js'];
    const exists = (p: string) => files.indexOf(p) >= 0;
    const from = 'assets/Scripts/Hero.ts';
    assert.strictEqual(resolveImport(from, './util', exists), 'assets/Scripts/util.ts');
    assert.strictEqual(resolveImport(from, '../core/Base.ts', exists), 'assets/core/Base.ts');
    assert.strictEqual(resolveImport(from, './lazy', exists), 'assets/Scripts/lazy/index.ts');
    assert.strictEqual(resolveImport(from, './legacy', exists), 'assets/Scripts/legacy.js');
    assert.strictEqual(resolveImport(from, './missing', exists), null);
});

testAsync('collectClosure: roots first, dependencies breadth first, cycles once, refused uuids left out', async () => {
    const graph: Record<string, string[]> = { prefab: ['mat', 'script@x'], mat: ['tex', 'internal', 'prefab'], tex: [], script: ['util'], util: ['script'], internal: [] };
    const out = await collectClosure(['prefab', 'prefab@sub'], async (u) => graph[u] || [], (u) => u !== 'internal');
    assert.deepStrictEqual(out, [
        { uuid: 'prefab', dependency: false },
        { uuid: 'mat', dependency: true },
        { uuid: 'script', dependency: true },
        { uuid: 'tex', dependency: true },
        { uuid: 'util', dependency: true },
    ]);
});

// ------------------------------------------------------------------ paths

test('safeRelPath refuses paths leaving the package', () => {
    assert.strictEqual(safeRelPath('assets\\Art\\x.png'), 'assets/Art/x.png');
    assert.strictEqual(safeRelPath('./assets/x/'), 'assets/x');
    assert.strictEqual(safeRelPath('../x'), null);
    assert.strictEqual(safeRelPath('assets/../../x'), null);
    assert.strictEqual(safeRelPath('/etc/passwd'), null);
    assert.strictEqual(safeRelPath('C:/Windows/x'), null);
    assert.strictEqual(safeRelPath('assets//x'), null);
});

test('urlToRel only maps db://assets', () => {
    assert.strictEqual(urlToRel('db://assets/Art/x.png'), 'assets/Art/x.png');
    assert.strictEqual(urlToRel('db://assets'), 'assets');
    assert.strictEqual(urlToRel('db://internal/x.effect'), null);
    assert.strictEqual(urlToRel('db://input-system/x.ts'), null);
});

test('commonDir + targetPathFor: original paths, or below a folder (containers above the root dropped)', () => {
    const assets: PackageAsset[] = [
        { path: 'assets/Game', uuid: 'g', isDirectory: true, container: true },
        { path: 'assets/Game/Art', uuid: 'a', isDirectory: true },
        { path: 'assets/Game/Art/hero.png', uuid: 'h' },
        { path: 'assets/Game/Art/Mat/hero.mtl', uuid: 'm' },
    ];
    const root = commonDir(assets);
    assert.strictEqual(root, 'assets/Game');
    const folder = { kind: 'folder' as const, folder: 'assets/Imported', root };
    assert.strictEqual(targetPathFor('assets/Game/Art/hero.png', { kind: 'original' }), 'assets/Game/Art/hero.png');
    assert.strictEqual(targetPathFor('assets/Game/Art/hero.png', folder), 'assets/Imported/Art/hero.png');
    assert.strictEqual(targetPathFor('assets/Game/Art/Mat/hero.mtl', folder), 'assets/Imported/Art/Mat/hero.mtl');
    assert.strictEqual(targetPathFor('assets/Game', folder), null, 'the container above the root');
    assert.strictEqual(targetPathFor('assets/GameX/a.png', folder), null, 'a sibling with the same prefix is not below the root');
    assert.strictEqual(commonDir([{ path: 'assets/a.png', uuid: '' }]), 'assets');
    assert.strictEqual(commonDir([{ path: 'assets/A/x.png', uuid: '' }, { path: 'assets/B/y.png', uuid: '' }]), 'assets');
});

test('uniquePath: Unity-style "name 1.ext", folders without extension', () => {
    const used = ['assets/Art/hero.png', 'assets/Art/hero 1.png', 'assets/Art/Folder', 'assets/Art/a.b.c'];
    const taken = (p: string) => used.indexOf(p) >= 0;
    assert.strictEqual(uniquePath('assets/Art/new.png', taken), 'assets/Art/new.png');
    assert.strictEqual(uniquePath('assets/Art/hero.png', taken), 'assets/Art/hero 2.png');
    assert.strictEqual(uniquePath('assets/Art/Folder', taken, true), 'assets/Art/Folder 1');
    assert.strictEqual(uniquePath('assets/Art/a.b.c', taken), 'assets/Art/a 1.b.c');
});

test('isInside: case-insensitive, separator-agnostic, not a prefix sibling', () => {
    assert.ok(isInside('E:\\Proj\\assets\\a.png', 'e:/proj/assets'));
    assert.ok(isInside('E:/Proj/assets', 'E:\\Proj\\assets\\'));
    assert.ok(!isInside('E:/Proj/assets2/a.png', 'E:/Proj/assets'));
    assert.ok(!isInside('E:/x', ''));
});

// ------------------------------------------------------------------ manifest

test('manifest: build, serialize, parse back (sorted, normalized)', () => {
    const m = buildManifest({ project: 'CocosGoat', path: 'E:/CocosGoat', creator: '3.8.6' }, [U1], [
        { path: 'assets/Art/hero.png', uuid: U3.toUpperCase(), type: 'cc.ImageAsset', importer: 'image', hash: 'abc', size: 3, hasMeta: true },
        { path: 'assets/Art', uuid: U2, isDirectory: true, container: true, hasMeta: true },
        { path: 'assets/Art/hero.mtl', uuid: U1, dependency: true, hasMeta: true },
    ], new Date(Date.UTC(2026, 10, 14)));
    const back = parseManifest(JSON.stringify(m));
    assert.strictEqual(back.source.project, 'CocosGoat');
    assert.strictEqual(back.createdAt, '2026-11-14T00:00:00.000Z');
    assert.deepStrictEqual(back.assets.map((a) => a.path), ['assets/Art', 'assets/Art/hero.mtl', 'assets/Art/hero.png']);
    assert.strictEqual(back.assets[2].uuid, U3, 'uuids lower-cased');
    assert.ok(back.assets[0].container && back.assets[0].isDirectory);
    assert.ok(back.assets[1].dependency);
    assert.deepStrictEqual(back.roots, [U1]);
});

test('manifest: refuses other JSON, newer versions and unsafe paths', () => {
    assert.throws(() => parseManifest('{nope'), /not valid JSON/);
    assert.throws(() => parseManifest({ format: 'x' }), /Not an asset package/);
    assert.throws(() => parseManifest({ format: 'cocos-asset-package', version: 99, assets: [] }), /newer/);
    assert.throws(() => parseManifest({ format: 'cocos-asset-package', version: 1, assets: [{ path: 'assets/../../evil.js', uuid: U1 }] }), /Unsafe path/);
    assert.throws(() => parseManifest({ format: 'cocos-asset-package', version: 1, assets: [{ path: 'library/x.json', uuid: U1 }] }), /Unsafe path/);
    const ok = parseManifest({ format: 'cocos-asset-package', version: 1, assets: [{ path: 'assets/a.png', uuid: 'not-a-uuid' }, { path: 'assets/a.png', uuid: U1 }] });
    assert.strictEqual(ok.assets.length, 1, 'duplicates dropped');
    assert.strictEqual(ok.assets[0].uuid, '');
    assert.strictEqual(ok.assets[0].hasMeta, false);
});

test('manifestFromFiles: a zip without manifest (Cocos export), paths put under assets/', () => {
    const m = manifestFromFiles([
        { path: 'Art', isDirectory: true, meta: JSON.stringify({ uuid: U2, importer: 'directory' }) },
        { path: 'Art/hero.png', isDirectory: false, meta: JSON.stringify({ uuid: U3, importer: 'image' }), hash: 'h', size: 10 },
        { path: 'Art/hero.png.meta', isDirectory: false, meta: null },
        { path: 'readme.txt', isDirectory: false, meta: null },
    ], 'pack');
    assert.deepStrictEqual(m.assets.map((a) => [a.path, a.uuid, !!a.isDirectory, a.importer || '']), [
        ['assets/Art', U2, true, 'directory'],
        ['assets/Art/hero.png', U3, false, 'image'],
        ['assets/readme.txt', '', false, ''],
    ]);
    const kept = manifestFromFiles([{ path: 'assets/a.png', isDirectory: false, meta: JSON.stringify({ uuid: U1 }) }], 'p');
    assert.strictEqual(kept.assets[0].path, 'assets/a.png', 'already under assets/');
});

// ------------------------------------------------------------------ conflicts

test('classifyEntry: new, identical, changed, moved, taken, folders', () => {
    const a: PackageAsset = { path: 'assets/Art/hero.png', uuid: U3, hash: 'H1' };
    const t = 'assets/Art/hero.png';
    assert.strictEqual(classifyEntry(a, t, null, null), 'new');
    assert.strictEqual(classifyEntry(a, t, { path: t, hash: 'H1' }, { path: t }), 'identical');
    assert.strictEqual(classifyEntry(a, t, { path: 'assets/art/HERO.png', hash: 'H1' }, { path: t }), 'identical', 'paths compare case-insensitively');
    assert.strictEqual(classifyEntry(a, t, { path: t, hash: 'H2' }, { path: t }), 'changed');
    assert.strictEqual(classifyEntry(a, t, { path: 'assets/Old/hero.png', hash: 'H1' }, null), 'moved');
    assert.strictEqual(classifyEntry(a, t, null, { path: t, uuid: U1 }), 'taken');
    assert.strictEqual(classifyEntry({ path: 'assets/a.txt', uuid: '' }, 'assets/a.txt', null, { path: 'assets/a.txt' }), 'taken', 'no meta, path used');
    assert.strictEqual(classifyEntry({ path: 'assets/Art', uuid: U2, isDirectory: true }, 'assets/Art', null, { path: 'assets/Art', isDirectory: true }), 'folder-exists');
    assert.strictEqual(classifyEntry({ path: 'assets/Art', uuid: U2, isDirectory: true }, 'assets/Art', null, null), 'folder-new');
});

test('actions: copies with a new uuid only when references can be remapped (not scripts)', () => {
    const png: PackageAsset = { path: 'assets/a.png', uuid: U1, importer: 'image' };
    const ts: PackageAsset = { path: 'assets/A.ts', uuid: U2, importer: 'typescript' };
    assert.ok(canRemapUuid(png));
    assert.ok(!canRemapUuid(ts));
    assert.ok(!canRemapUuid({ path: 'assets/x.js', uuid: U3 }));
    assert.ok(!canRemapUuid({ path: 'assets/Dir', uuid: U3, isDirectory: true }));
    assert.deepStrictEqual(actionsFor('moved', png), ['skip', 'overwrite', 'copy']);
    assert.deepStrictEqual(actionsFor('moved', ts), ['skip', 'overwrite']);
    assert.deepStrictEqual(actionsFor('taken', png), ['rename', 'overwrite', 'skip']);
    assert.deepStrictEqual(actionsFor('taken', { path: 'assets/x.txt', uuid: '' }), ['rename', 'skip']);
    assert.strictEqual(defaultAction('new', png), 'import');
    assert.strictEqual(defaultAction('identical', png), 'skip');
    assert.strictEqual(defaultAction('changed', png), 'overwrite');
    assert.strictEqual(defaultAction('moved', png), 'skip');
    assert.strictEqual(defaultAction('taken', png), 'rename');
});

test('treeRows: folders before files at each level, depth from the path; rowsUnder', () => {
    const rows = [
        { target: 'assets/b.png', isDirectory: false },
        { target: 'assets/Art/z.png', isDirectory: false },
        { target: 'assets/Art', isDirectory: true },
        { target: 'assets/Art/Sub/x.png', isDirectory: false },
        { target: 'assets/Art/Sub', isDirectory: true },
        { target: 'assets/Art/a.png', isDirectory: false },
        { target: null, isDirectory: true },
    ];
    const out = treeRows(rows);
    assert.deepStrictEqual(out.map((r) => r.target + ':' + r.depth), ['assets/Art:0', 'assets/Art/Sub:1', 'assets/Art/Sub/x.png:2', 'assets/Art/a.png:1', 'assets/Art/z.png:1', 'assets/b.png:0']);
    assert.strictEqual(out[1].name, 'Sub');
    assert.deepStrictEqual(rowsUnder(out, 'assets/Art').map((r) => r.target), ['assets/Art/Sub', 'assets/Art/Sub/x.png', 'assets/Art/a.png', 'assets/Art/z.png']);
});

// ------------------------------------------------------------------ drag out and clipboard

test('osDragMode: Alt files, Alt+Shift package, otherwise the editor drag', () => {
    assert.strictEqual(osDragMode(false, false), 'none');
    assert.strictEqual(osDragMode(false, true), 'none');
    assert.strictEqual(osDragMode(true, false), 'files');
    assert.strictEqual(osDragMode(true, true), 'package');
});

test('osDragFiles: sub-assets give their main file, folders cover their content, each file once', () => {
    const files: Record<string, string> = { img: 'E:\\P\\assets\\Art\\hero.png', dir: 'E:\\P\\assets\\Art', other: 'E:\\P\\assets\\b.mtl' };
    const fileOf = (u: string) => files[u] || '';
    assert.deepStrictEqual(osDragFiles([{ uuid: 'img@6c48a', parent: 'img' }, { uuid: 'img', file: files.img }], fileOf), [files.img]);
    assert.deepStrictEqual(osDragFiles([{ uuid: 'img', file: files.img }, { uuid: 'dir', file: files.dir, isDirectory: true }, { uuid: 'other', file: files.other }], fileOf), [files.dir, files.other]);
    assert.deepStrictEqual(osDragFiles([{ uuid: 'pkg:db://x' }, { uuid: 'new:1' }, { uuid: 'nofile' }], fileOf), []);
});

test('clipboard text: encode / decode the package folder; other text is not a package', () => {
    const t = encodeClipboardText({ path: 'E:\\P\\temp\\project-browser\\packages\\20261114-101500-001', project: 'CocosGoat', paths: ['assets/a.png', 'assets/b.mtl'] });
    assert.ok(t.split('\n')[1].indexOf('From CocosGoat, 2 assets:') === 0);
    assert.strictEqual(decodeClipboardText(t), 'E:\\P\\temp\\project-browser\\packages\\20261114-101500-001');
    assert.strictEqual(decodeClipboardText(t.replace(/\n/g, '\r\n')), 'E:\\P\\temp\\project-browser\\packages\\20261114-101500-001');
    assert.strictEqual(decodeClipboardText('hello'), '');
    assert.strictEqual(decodeClipboardText(''), '');
    const many = encodeClipboardText({ path: 'x', project: 'p', paths: new Array(60).fill('assets/a.png') });
    assert.strictEqual(many.split('\n').length, 2 + 50 + 1, 'long lists are cut');
});

test('FileNameW: UTF-16LE path with a NUL terminator, decoded back', () => {
    const p = 'E:\\Dự án\\temp\\pkg';
    const buf = encodeFileNameW(p);
    assert.strictEqual(buf.length, (p.length + 1) * 2);
    assert.strictEqual(buf.readUInt16LE(buf.length - 2), 0);
    assert.strictEqual(buf.readUInt16LE(0), 'E'.charCodeAt(0));
    assert.strictEqual(decodeFileNameW(buf), p);
    assert.strictEqual(decodeFileNameW(Buffer.concat([buf, Buffer.from('garbage', 'utf16le')])), p, 'stops at the NUL');
    assert.strictEqual(decodeFileNameW(null), '');
});

finish();
