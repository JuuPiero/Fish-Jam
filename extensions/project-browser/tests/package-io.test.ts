/**
 * Asset packages on disk: two fixture projects in a temp folder and a fake
 * asset-db that reads their .meta files (uuid -> file and url), like Cocos'.
 */
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { zipWrite } from '../source/shared/binary';
import { MANIFEST_NAME, parseManifest } from '../source/shared/package';
import { classifyPackage, collectAssets, DbInfo, DbLike, importPackage, openPackage, probePackage, refreshUrls, writePackage, zipFolder } from '../source/shared/package-io';
import { finish, testAsync } from './harness';

const DIR = 'aaaaaaaa-0000-4000-8000-000000000001';
const IMG = 'bbbbbbbb-0000-4000-8000-000000000002';
const MTL = 'cccccccc-0000-4000-8000-000000000003';
const PRE = 'dddddddd-0000-4000-8000-000000000004';
const SCRIPT = '3ab89bf7-c53e-45ea-92ff-03ab411ecf3e'; // "__type__": "3ab89v3xT5F6pL/A6tBHs8+"
const UTIL = 'eeeeeeee-0000-4000-8000-000000000006';
const OTHER = 'ffffffff-0000-4000-8000-000000000007';
const INTERNAL = '11111111-0000-4000-8000-000000000008';
const PREFABS = '22222222-0000-4000-8000-000000000009';
const SCRIPTS = '33333333-0000-4000-8000-00000000000a';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-pkg-'));
process.on('exit', () => {
    try {
        fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
        // leave it
    }
});

function write(root: string, rel: string, content: string | Buffer, meta?: any) {
    const f = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
    if (meta) fs.writeFileSync(f + '.meta', JSON.stringify(meta, null, 2));
}
function dir(root: string, rel: string, uuid: string) {
    const f = path.join(root, ...rel.split('/'));
    fs.mkdirSync(f, { recursive: true });
    fs.writeFileSync(f + '.meta', JSON.stringify({ ver: '1.2.0', importer: 'directory', uuid, files: [], subMetas: {}, userData: {} }, null, 2));
}
function read(root: string, rel: string): string {
    return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
}
function exists(root: string, rel: string): boolean {
    return fs.existsSync(path.join(root, ...rel.split('/')));
}

/** A fake asset-db over a project folder: every asset with a .meta, plus one read-only internal asset. */
function fakeDb(root: string, depsMap?: Record<string, string[]>): DbLike {
    const scan = (): Record<string, DbInfo> => {
        const out: Record<string, DbInfo> = {};
        const walk = (d: string, url: string) => {
            for (const n of fs.readdirSync(d)) {
                if (/\.meta$/.test(n)) continue;
                const f = path.join(d, n);
                if (!fs.existsSync(f + '.meta')) continue;
                const meta = JSON.parse(fs.readFileSync(f + '.meta', 'utf8'));
                const isDir = fs.statSync(f).isDirectory();
                out[meta.uuid] = { uuid: meta.uuid, url: url + '/' + n, file: f, importer: meta.importer, isDirectory: isDir, type: isDir ? 'cc.Asset' : 'cc.Asset' };
                if (isDir) walk(f, url + '/' + n);
            }
        };
        walk(path.join(root, 'assets'), 'db://assets');
        out[INTERNAL] = { uuid: INTERNAL, url: 'db://internal/effects/builtin-standard.effect', file: path.join(tmp, 'internal.effect'), readonly: true, importer: 'effect' };
        return out;
    };
    return {
        async info(key: string) {
            const all = scan();
            const k = key.split('@')[0];
            if (all[k]) return all[k];
            for (const u of Object.keys(all)) if (all[u].url === key || all[u].file === key) return all[u];
            return null;
        },
        async deps(uuid: string) {
            return depsMap ? depsMap[uuid] || [] : null;
        },
    };
}

// ------------------------------------------------------------------ project A (the source)

const A = path.join(tmp, 'ProjectA');
fs.writeFileSync(path.join(tmp, 'internal.effect'), 'effect');
dir(A, 'assets/Art', DIR);
write(A, 'assets/Art/hero.png', Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]), {
    ver: '1.0.27', importer: 'image', uuid: IMG,
    subMetas: { '6c48a': { importer: 'texture', uuid: IMG + '@6c48a', userData: { imageUuidOrDatabaseUri: IMG } } },
    userData: { type: 'texture', redirect: IMG + '@6c48a' },
});
write(A, 'assets/Art/hero.mtl', JSON.stringify({ __type__: 'cc.Material', _effectAsset: { __uuid__: INTERNAL }, _props: [{ mainTexture: { __uuid__: IMG + '@6c48a', __expectedType__: 'cc.Texture2D' } }] }, null, 2), { ver: '1.0.21', importer: 'material', uuid: MTL });
dir(A, 'assets/Prefabs', PREFABS);
write(A, 'assets/Prefabs/Hero.prefab', JSON.stringify([
    { __type__: 'cc.Prefab', data: { __id__: 1 } },
    { __type__: 'cc.Node', _components: [{ __id__: 2 }, { __id__: 3 }] },
    { __type__: 'cc.MeshRenderer', _materials: [{ __uuid__: MTL, __expectedType__: 'cc.Material' }] },
    { __type__: '3ab89v3xT5F6pL/A6tBHs8+', node: { __id__: 1 } },
], null, 2), { ver: '1.1.50', importer: 'prefab', uuid: PRE });
dir(A, 'assets/Scripts', SCRIPTS);
write(A, 'assets/Scripts/Hero.ts', "import { _decorator, Component } from 'cc';\nimport { clamp } from './util';\nexport class Hero extends Component {}\n", { ver: '4.0.24', importer: 'typescript', uuid: SCRIPT });
write(A, 'assets/Scripts/util.ts', 'export function clamp(v: number) { return v; }\n', { ver: '4.0.24', importer: 'typescript', uuid: UTIL });
write(A, 'assets/Other/unrelated.txt', 'nobody uses me', { ver: '1.0.0', importer: 'text', uuid: OTHER });
fs.writeFileSync(path.join(A, 'assets', 'Other.meta'), JSON.stringify({ importer: 'directory', uuid: '44444444-0000-4000-8000-00000000000b' }));
const dbA = fakeDb(A);

const relsOf = (list: { rel: string }[]) => list.map((a) => a.rel).sort();

testAsync('collectAssets: a prefab brings its material, image, script and the script it imports; internal left out', async () => {
    const list = await collectAssets(dbA, A, [PRE], { deps: true });
    assert.deepStrictEqual(relsOf(list), ['assets/Art', 'assets/Art/hero.mtl', 'assets/Art/hero.png', 'assets/Prefabs', 'assets/Prefabs/Hero.prefab', 'assets/Scripts', 'assets/Scripts/Hero.ts', 'assets/Scripts/util.ts']);
    const byRel: Record<string, any> = {};
    list.forEach((a) => (byRel[a.rel] = a));
    assert.strictEqual(byRel['assets/Prefabs/Hero.prefab'].dependency, false);
    assert.strictEqual(byRel['assets/Art/hero.mtl'].dependency, true);
    assert.ok(byRel['assets/Art'].container && byRel['assets/Art'].uuid === DIR, 'parent folders carried for their uuid');
    assert.ok(!list.some((a) => a.uuid === INTERNAL || a.uuid === OTHER));
});

testAsync('collectAssets: asset-db dependency lists are used too; no deps when not asked; folders expand', async () => {
    const db = fakeDb(A, { [OTHER]: [IMG + '@6c48a'] });
    assert.deepStrictEqual(relsOf(await collectAssets(db, A, [OTHER], { deps: true })), ['assets/Art', 'assets/Art/hero.png', 'assets/Other', 'assets/Other/unrelated.txt']);
    assert.deepStrictEqual(relsOf(await collectAssets(dbA, A, [PRE], { deps: false })), ['assets/Prefabs', 'assets/Prefabs/Hero.prefab']);
    assert.deepStrictEqual(relsOf(await collectAssets(dbA, A, [DIR], { deps: false })), ['assets/Art', 'assets/Art/hero.mtl', 'assets/Art/hero.png']);
    assert.deepStrictEqual(relsOf(await collectAssets(dbA, A, [DIR], { deps: false, expandFolders: false })), ['assets/Art']);
    assert.deepStrictEqual(relsOf(await collectAssets(dbA, A, [IMG + '@6c48a'], { deps: false })), ['assets/Art', 'assets/Art/hero.png'], 'a sub-asset packs its main file');
});

let pkgDir = '';
testAsync('writePackage: files and .meta mirrored under assets/, asset-package.json lists them with hashes', async () => {
    const list = await collectAssets(dbA, A, [PRE], { deps: true });
    pkgDir = path.join(tmp, 'pkg1');
    const m = writePackage(A, list, pkgDir, { project: 'ProjectA', path: A, creator: '3.8.6' }, [PRE]);
    assert.ok(exists(pkgDir, MANIFEST_NAME));
    assert.ok(exists(pkgDir, 'assets/Art/hero.png') && exists(pkgDir, 'assets/Art/hero.png.meta') && exists(pkgDir, 'assets/Art.meta'));
    const back = parseManifest(read(pkgDir, MANIFEST_NAME));
    assert.strictEqual(back.assets.length, m.assets.length);
    const png = back.assets.find((a) => a.path === 'assets/Art/hero.png')!;
    assert.strictEqual(png.uuid, IMG);
    assert.strictEqual(png.size, 8);
    assert.ok(/^[0-9a-f]{40}$/.test(png.hash || ''));
    assert.ok(probePackage(pkgDir) && probePackage(path.join(pkgDir, MANIFEST_NAME)));
    assert.ok(!probePackage(path.join(A, 'assets')));
});

// ------------------------------------------------------------------ project B (the destination)

testAsync('import into an empty project: everything new, uuids kept, folders keep theirs, refresh the top folders', async () => {
    const B = path.join(tmp, 'ProjectB');
    fs.mkdirSync(path.join(B, 'assets'), { recursive: true });
    const dbB = fakeDb(B);
    const pkg = openPackage(pkgDir, path.join(tmp, 'work'));
    const rows = await classifyPackage(pkg, B, dbB, { kind: 'original' });
    assert.ok(rows.filter((r) => !r.isDirectory).every((r) => r.status === 'new' && r.action === 'import'));
    const r = await importPackage(pkg, B, dbB, { kind: 'original' }, {}, path.join(tmp, 'staging'));
    assert.deepStrictEqual(r.errors, []);
    assert.strictEqual(JSON.parse(read(B, 'assets/Art/hero.png.meta')).uuid, IMG);
    assert.strictEqual(JSON.parse(read(B, 'assets/Art.meta')).uuid, DIR);
    assert.strictEqual(read(B, 'assets/Prefabs/Hero.prefab'), read(A, 'assets/Prefabs/Hero.prefab'));
    assert.deepStrictEqual(r.refresh, ['db://assets']);
    assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'staging')), [], 'staging cleaned');
    // again: identical, nothing written by default
    const again = await classifyPackage(pkg, B, dbB, { kind: 'original' });
    assert.ok(again.filter((x) => !x.isDirectory).every((x) => x.status === 'identical' && x.action === 'skip'));
    const r2 = await importPackage(pkg, B, dbB, { kind: 'original' }, {}, path.join(tmp, 'staging'));
    assert.strictEqual(r2.written.length, 0);
});

testAsync('conflicts: changed (overwrite), uuid used elsewhere (copy with new uuid, references remapped), path taken (renamed, uuid kept)', async () => {
    const C = path.join(tmp, 'ProjectC');
    fs.mkdirSync(path.join(C, 'assets'), { recursive: true });
    // the image's uuid already belongs to another file here
    write(C, 'assets/Old/h.png', Buffer.from([1, 2, 3]), { importer: 'image', uuid: IMG });
    fs.writeFileSync(path.join(C, 'assets', 'Old.meta'), JSON.stringify({ importer: 'directory', uuid: '55555555-0000-4000-8000-00000000000c' }));
    // another asset sits where the material goes
    dir(C, 'assets/Art', DIR);
    write(C, 'assets/Art/hero.mtl', '{"other":true}', { importer: 'material', uuid: '66666666-0000-4000-8000-00000000000d' });
    // the prefab is here, same uuid and path, older content
    dir(C, 'assets/Prefabs', PREFABS);
    write(C, 'assets/Prefabs/Hero.prefab', '[]', { importer: 'prefab', uuid: PRE });
    // the script's uuid is used elsewhere: no copy offered (class ids cannot be remapped)
    write(C, 'assets/Elsewhere.ts', '// x', { importer: 'typescript', uuid: SCRIPT });
    const dbC = fakeDb(C);
    const pkg = openPackage(pkgDir, path.join(tmp, 'work'));
    const rows = await classifyPackage(pkg, C, dbC, { kind: 'original' });
    const by: Record<string, any> = {};
    rows.forEach((r) => (by[r.path] = r));
    assert.strictEqual(by['assets/Art/hero.png'].status, 'moved');
    assert.strictEqual(by['assets/Art/hero.png'].existingPath, 'assets/Old/h.png');
    assert.deepStrictEqual(by['assets/Art/hero.png'].actions, ['skip', 'overwrite', 'copy']);
    assert.strictEqual(by['assets/Art/hero.mtl'].status, 'taken');
    assert.strictEqual(by['assets/Prefabs/Hero.prefab'].status, 'changed');
    assert.strictEqual(by['assets/Scripts/Hero.ts'].status, 'moved');
    assert.deepStrictEqual(by['assets/Scripts/Hero.ts'].actions, ['skip', 'overwrite']);
    assert.strictEqual(by['assets/Art'].status, 'folder-exists');
    const NEW = '99999999-0000-4000-8000-0000000000ff';
    const r = await importPackage(pkg, C, dbC, { kind: 'original' }, { 'assets/Art/hero.png': 'copy', 'assets/Scripts/Hero.ts': 'copy' /* not allowed: default */ }, path.join(tmp, 'staging'), () => NEW);
    assert.deepStrictEqual(r.errors, []);
    assert.deepStrictEqual(r.remapped, { [IMG]: NEW });
    // the copy: new uuid in its meta, sub-asset ids and userData too
    const meta = JSON.parse(read(C, 'assets/Art/hero.png.meta'));
    assert.strictEqual(meta.uuid, NEW);
    assert.strictEqual(meta.subMetas['6c48a'].uuid, NEW + '@6c48a');
    assert.strictEqual(meta.subMetas['6c48a'].userData.imageUuidOrDatabaseUri, NEW);
    // the material that uses it was renamed (path taken) and points at the copy
    assert.ok(exists(C, 'assets/Art/hero 1.mtl'));
    assert.strictEqual(JSON.parse(read(C, 'assets/Art/hero 1.mtl.meta')).uuid, MTL, 'renamed keeps its uuid');
    assert.ok(read(C, 'assets/Art/hero 1.mtl').indexOf(NEW + '@6c48a') >= 0);
    assert.strictEqual(read(C, 'assets/Art/hero.mtl'), '{"other":true}', 'the asset that was there is untouched');
    // the old image untouched; the prefab overwritten; the script skipped (its default)
    assert.deepStrictEqual(Array.from(fs.readFileSync(path.join(C, 'assets', 'Old', 'h.png'))), [1, 2, 3]);
    assert.strictEqual(read(C, 'assets/Prefabs/Hero.prefab'), read(A, 'assets/Prefabs/Hero.prefab'));
    assert.deepStrictEqual(r.overwritten, ['assets/Prefabs/Hero.prefab']);
    assert.ok(!exists(C, 'assets/Scripts/Hero.ts'));
    assert.ok(exists(C, 'assets/Scripts/util.ts'));
});

testAsync('overwrite of a uuid used elsewhere writes in place (the asset keeps its location)', async () => {
    const D = path.join(tmp, 'ProjectD');
    write(D, 'assets/Moved/hero.png', Buffer.from([9]), { importer: 'image', uuid: IMG });
    fs.writeFileSync(path.join(D, 'assets', 'Moved.meta'), JSON.stringify({ importer: 'directory', uuid: '77777777-0000-4000-8000-00000000000e' }));
    const dbD = fakeDb(D);
    const pkg = openPackage(pkgDir, path.join(tmp, 'work'));
    const decisions: Record<string, any> = {};
    pkg.manifest.assets.forEach((a) => (decisions[a.path] = 'skip'));
    decisions['assets/Art/hero.png'] = 'overwrite';
    const r = await importPackage(pkg, D, dbD, { kind: 'original' }, decisions, path.join(tmp, 'staging'));
    assert.deepStrictEqual(r.written, ['assets/Moved/hero.png']);
    assert.strictEqual(fs.readFileSync(path.join(D, 'assets', 'Moved', 'hero.png')).length, 8);
    assert.ok(!exists(D, 'assets/Art'), 'no empty folder left behind');
});

testAsync('folder mode: below the drop folder, the common root stripped; zip of the package opens the same', async () => {
    const E = path.join(tmp, 'ProjectE');
    dir(E, 'assets/Imported', '88888888-0000-4000-8000-00000000000f');
    const dbE = fakeDb(E);
    const zipFile = path.join(tmp, 'pkg1.zip');
    fs.writeFileSync(zipFile, zipFolder(pkgDir));
    assert.ok(probePackage(zipFile));
    const pkg = openPackage(zipFile, path.join(tmp, 'work'));
    assert.strictEqual(pkg.kind, 'ours');
    const mode = { kind: 'folder' as const, folder: 'assets/Imported', root: 'assets' };
    const rows = await classifyPackage(pkg, E, dbE, mode);
    assert.deepStrictEqual(rows.filter((r) => !r.isDirectory).map((r) => r.target).sort(), ['assets/Imported/Art/hero.mtl', 'assets/Imported/Art/hero.png', 'assets/Imported/Prefabs/Hero.prefab', 'assets/Imported/Scripts/Hero.ts', 'assets/Imported/Scripts/util.ts']);
    const r = await importPackage(pkg, E, dbE, mode, {}, path.join(tmp, 'staging'));
    assert.deepStrictEqual(r.errors, []);
    assert.strictEqual(JSON.parse(read(E, 'assets/Imported/Art/hero.png.meta')).uuid, IMG);
    assert.deepStrictEqual(r.refresh, ['db://assets/Imported']);
});

testAsync('a zip without asset-package.json (Cocos export style): uuids from the .meta files, folders added for missing parents', async () => {
    const zip = zipWrite([
        { name: 'Textures/', data: Buffer.alloc(0) },
        { name: 'Textures/stone.png', data: Buffer.from([1, 2, 3, 4]) },
        { name: 'Textures/stone.png.meta', data: Buffer.from(JSON.stringify({ importer: 'image', uuid: OTHER })) },
        { name: '../evil.txt', data: Buffer.from('nope') },
    ]);
    const zipFile = path.join(tmp, 'cocos-export.zip');
    fs.writeFileSync(zipFile, zip);
    assert.ok(!probePackage(zipFile), 'not one of ours (no manifest)');
    const pkg = openPackage(zipFile, path.join(tmp, 'work'));
    assert.strictEqual(pkg.kind, 'loose');
    assert.deepStrictEqual(pkg.manifest.assets.map((a) => a.path), ['assets/Textures', 'assets/Textures/stone.png']);
    assert.ok(!fs.existsSync(path.join(tmp, 'evil.txt')) && !fs.existsSync(path.join(tmp, 'work', 'evil.txt')), 'unsafe zip paths are skipped');
    const F = path.join(tmp, 'ProjectF');
    fs.mkdirSync(path.join(F, 'assets'), { recursive: true });
    const r = await importPackage(pkg, F, fakeDb(F), { kind: 'original' }, {}, path.join(tmp, 'staging'));
    assert.deepStrictEqual(r.errors, []);
    assert.strictEqual(JSON.parse(read(F, 'assets/Textures/stone.png.meta')).uuid, OTHER);
    assert.ok(fs.statSync(path.join(F, 'assets', 'Textures')).isDirectory());
    assert.throws(() => openPackage(path.join(A, 'assets', 'Art', 'hero.png'), path.join(tmp, 'work')), /Not an asset package/);
});

testAsync('refreshUrls: the first existing folder above each written path, nested ones dropped', async () => {
    const isNew = (p: string) => ['assets/New', 'assets/New/Sub'].indexOf(p) >= 0;
    assert.deepStrictEqual(refreshUrls(['assets/New', 'assets/New/Sub', 'assets/New/Sub/a.png', 'assets/Old/b.png', 'assets/Old/Deep/c.png'], isNew), ['db://assets']);
    assert.deepStrictEqual(refreshUrls(['assets/Old/b.png', 'assets/Old/Deep/c.png'], isNew), ['db://assets/Old']);
});

finish();
