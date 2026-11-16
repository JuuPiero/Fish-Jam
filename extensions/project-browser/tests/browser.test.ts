import assert from 'assert';
import { dragPayload, dropUuids } from '../source/shared/drag';
import { allLabels, AssetEntry, displayName, matchesType, parseQuery, pruneLabels, search, setLabel, sortAssets, tokenize, toggleToken, TYPE_FILTERS, typeLabel } from '../source/shared/search';
import {
    breadcrumb, buildTrees, childrenOf, dbOf, folderLabel, inScope, isPackageUrl, isReadonlyUrl, PACKAGES_ROOT, parentUrl, renamedUrl, validName,
} from '../source/shared/tree';
import { hasIcon, iconNames, iconSvg } from '../source/panels/icons';
import { results, test } from './harness';

// ------------------------------------------------------------------ fixtures

let n = 0;
function asset(url: string, importer: string, type: string, extra: Partial<AssetEntry> = {}): AssetEntry {
    const name = url.slice(url.lastIndexOf('/') + 1);
    return Object.assign({ uuid: 'u' + n++, url, name, importer, type, isDirectory: false }, extra);
}
function folder(url: string): AssetEntry {
    return asset(url, 'directory', 'cc.Asset', { isDirectory: true });
}

const fbx = asset('db://assets/Models/Hero.fbx', 'fbx', 'cc.Asset', { uuid: 'fbx1' });
fbx.subAssets = [
    { uuid: 'fbx1@mesh', url: 'db://assets/Models/Hero.fbx/Body.mesh', name: 'Body.mesh', displayName: 'Body', type: 'cc.Mesh', importer: 'gltf-mesh', isDirectory: false, parent: 'fbx1' },
    { uuid: 'fbx1@run', url: 'db://assets/Models/Hero.fbx/Run.animation', name: 'Run.animation', displayName: 'Run', type: 'cc.AnimationClip', importer: 'gltf-animation', isDirectory: false, parent: 'fbx1' },
    { uuid: 'fbx1@prefab', url: 'db://assets/Models/Hero.fbx/Hero.prefab', name: 'Hero.prefab', displayName: 'Hero', type: 'cc.Prefab', importer: 'gltf-scene', isDirectory: false, parent: 'fbx1' },
];

const ASSETS: AssetEntry[] = [
    folder('db://assets'),
    folder('db://assets/Models'),
    folder('db://assets/Art'),
    folder('db://assets/Art/Characters'),
    folder('db://assets/Empty'),
    fbx,
    asset('db://assets/Art/hero.png', 'image', 'cc.ImageAsset', { uuid: 'img1' }),
    asset('db://assets/Art/Characters/Hero.mtl', 'material', 'cc.Material', { uuid: 'mat1' }),
    asset('db://assets/Art/Characters/Hero.prefab', 'prefab', 'cc.Prefab', { uuid: 'pre1' }),
    asset('db://assets/Main.scene', 'scene', 'cc.SceneAsset', { uuid: 'scene1' }),
    asset('db://assets/Player.ts', 'typescript', 'cc.Script', { uuid: 'ts1' }),
    asset('db://assets/legacy.js', 'javascript', 'cc.Script', { uuid: 'js1' }),
    asset('db://assets/Hero Walk.anim', 'animation-clip', 'cc.AnimationClip', { uuid: 'anim1' }),
    asset('db://assets/Player.controller.json', 'json', 'cc.JsonAsset', { uuid: 'ctrl1' }),
    asset('db://assets/config.json', 'json', 'cc.JsonAsset', { uuid: 'json1' }),
    asset('db://assets/item10.png', 'image', 'cc.ImageAsset', { uuid: 'i10' }),
    asset('db://assets/item2.png', 'image', 'cc.ImageAsset', { uuid: 'i2' }),
    asset('db://input-system/core/Input.ts', 'typescript', 'cc.Script', { uuid: 'pkg1' }),
    asset('db://internal/effects/builtin-standard.effect', 'effect', 'cc.EffectAsset', { uuid: 'int1' }),
    asset('db://internal/default-materials/default.mtl', 'material', 'cc.Material', { uuid: 'int2' }),
    asset('db://addressables/Settings.mtl', 'material', 'cc.Material', { uuid: 'pkg2' }),
];
const noLabels = () => [] as string[];
const names = (list: AssetEntry[]) => list.map((a) => a.name);

// ------------------------------------------------------------------ query parser

test('tokenize keeps quoted phrases', () => {
    assert.deepStrictEqual(tokenize('hero "walk cycle"  t:Material'), ['hero', 'walk cycle', 't:Material']);
    assert.deepStrictEqual(tokenize('  '), []);
    assert.deepStrictEqual(tokenize('"" a'), ['a']);
});

test('parseQuery splits words, types, labels and globs', () => {
    const q = parseQuery('Hero t:Material l:Env *.png "Big Rock"');
    assert.deepStrictEqual(q.words, ['hero', 'big rock']);
    assert.deepStrictEqual(q.types, ['Material']);
    assert.deepStrictEqual(q.labels, ['Env']);
    assert.strictEqual(q.globs.length, 1);
    assert.ok(q.globs[0].test('hero.PNG'));
    assert.ok(!q.globs[0].test('hero.png.meta'));
    assert.strictEqual(q.empty, false);
    assert.strictEqual(parseQuery('   ').empty, true);
    assert.deepStrictEqual(parseQuery('t:').words, ['t:'], 'a bare prefix is a word');
});

test('toggleToken adds and removes t: / l: tokens', () => {
    assert.strictEqual(toggleToken('hero', 't:', 'Material'), 'hero t:Material');
    assert.strictEqual(toggleToken('hero t:material', 't:', 'Material'), 'hero');
    assert.strictEqual(toggleToken('', 'l:', 'Env'), 'l:Env');
    assert.strictEqual(toggleToken('"walk cycle"', 'l:', 'Env'), '"walk cycle" l:Env', 'phrases keep their quotes');
});

// ------------------------------------------------------------------ type mapping

test('t: types map to Cocos importers and types', () => {
    const by = (uuid: string) => ASSETS.find((a) => a.uuid === uuid)!;
    assert.ok(matchesType(by('mat1'), 'Material'));
    assert.ok(matchesType(by('pre1'), 'prefab'), 'case-insensitive');
    assert.ok(matchesType(by('scene1'), 'Scene'));
    assert.ok(matchesType(by('ts1'), 'Script') && matchesType(by('js1'), 'Script'));
    assert.ok(matchesType(by('img1'), 'Texture'));
    assert.ok(matchesType(fbx, 'Model'));
    assert.ok(!matchesType(fbx.subAssets![0], 'Model'), 'a mesh inside a model is not a model');
    assert.ok(matchesType(fbx.subAssets![0], 'Mesh'));
    assert.ok(matchesType(by('ctrl1'), 'AnimatorController'));
    assert.ok(matchesType(by('int1'), 'Shader'));
    assert.ok(matchesType(by('mat1'), 'cc.Material'), 'unknown names match part of the engine type');
    assert.ok(matchesType(by('anim1'), 'animation-clip'), 'or the importer');
    assert.ok(!matchesType(by('mat1'), 'Prefab'));
});

test('typeLabel gives Unity names', () => {
    const by = (uuid: string) => ASSETS.find((a) => a.uuid === uuid)!;
    assert.strictEqual(typeLabel(folder('db://assets/X')), 'Folder');
    assert.strictEqual(typeLabel(by('mat1')), 'Material');
    assert.strictEqual(typeLabel(by('ctrl1')), 'AnimatorController', 'before Json');
    assert.strictEqual(typeLabel(by('json1')), 'Json');
    assert.strictEqual(typeLabel(fbx), 'Model');
    assert.strictEqual(typeLabel(fbx.subAssets![2]), 'Prefab');
    assert.strictEqual(typeLabel(asset('db://assets/a.atlas', 'auto-atlas', 'cc.SpriteAtlas')), 'SpriteAtlas');
});

test('displayName hides the extension', () => {
    assert.strictEqual(displayName(fbx), 'Hero');
    assert.strictEqual(displayName(fbx.subAssets![1]), 'Run');
    assert.strictEqual(displayName(folder('db://assets/a.b')), 'a.b');
    assert.strictEqual(displayName(asset('db://assets/Controls.inputactions.json', 'json', 'cc.JsonAsset')), 'Controls.inputactions');
});

// ------------------------------------------------------------------ search, filter, sort

test('search matches words against names (AND)', () => {
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('hero'), noLabels)).sort(), ['Hero.fbx', 'Hero.mtl', 'Hero.prefab', 'Hero Walk.anim', 'hero.png'].sort());
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('hero walk'), noLabels)), ['Hero Walk.anim']);
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('"hero walk"'), noLabels)), ['Hero Walk.anim']);
});

test('search: types are OR, globs filter the file name', () => {
    const r = names(search(ASSETS, parseQuery('t:Material t:Prefab hero'), noLabels));
    assert.deepStrictEqual(r.sort(), ['Hero.mtl', 'Hero.prefab'], 'a model\'s prefab sub-asset is t:Model, not t:Prefab');
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('item*.png'), noLabels)), ['item2.png', 'item10.png'], 'natural sort');
});

test('search finds sub-assets only through a t: filter', () => {
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('t:AnimationClip'), noLabels)).sort(), ['Hero Walk.anim', 'Run.animation'].sort());
    assert.ok(names(search(ASSETS, parseQuery('run'), noLabels)).indexOf('Run.animation') < 0);
});

test('search: labels by main asset uuid', () => {
    const store = setLabel({}, ['mat1', 'fbx1'], 'Hero', true);
    const lookup = (u: string) => store[u] || [];
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('l:hero'), lookup)), ['Hero.fbx', 'Hero.mtl']);
    assert.deepStrictEqual(names(search(ASSETS, parseQuery('l:hero t:Mesh'), lookup)), ['Body.mesh'], "sub-assets use their model's labels");
    assert.deepStrictEqual(search(ASSETS, parseQuery('l:other'), lookup), []);
});

test('search honors the limit', () => {
    assert.strictEqual(search(ASSETS, parseQuery('*'), noLabels, 3).length, 3);
});

test('sortAssets: folders first, natural order', () => {
    const list = [asset('db://assets/b10', 'x', ''), folder('db://assets/z'), asset('db://assets/B2', 'x', ''), folder('db://assets/a')];
    assert.deepStrictEqual(names(sortAssets(list)), ['a', 'z', 'B2', 'b10']);
});

// ------------------------------------------------------------------ labels

test('label store: set, unset, all, prune', () => {
    let s = setLabel({}, ['a', 'b'], 'Env', true);
    s = setLabel(s, ['a'], 'Rock', true);
    s = setLabel(s, ['a'], 'Env', true);
    assert.deepStrictEqual(s, { a: ['Env', 'Rock'], b: ['Env'] });
    assert.deepStrictEqual(allLabels(s), ['Env', 'Rock']);
    const t = setLabel(s, ['b'], 'Env', false);
    assert.deepStrictEqual(t, { a: ['Env', 'Rock'] }, 'empty entries are dropped');
    assert.deepStrictEqual(s.b, ['Env'], 'the input store is not mutated');
    assert.deepStrictEqual(setLabel(s, ['a'], '  ', true), s, 'blank label: no change');
    assert.deepStrictEqual(pruneLabels(s, (u) => u === 'b'), { b: ['Env'] });
});

// ------------------------------------------------------------------ tree and paths

test('dbOf / parentUrl / isPackageUrl / isReadonlyUrl', () => {
    assert.strictEqual(dbOf('db://input-system/core/x.ts'), 'input-system');
    assert.strictEqual(dbOf('file:///x'), '');
    assert.strictEqual(parentUrl('db://assets/Art/a.png'), 'db://assets/Art');
    assert.strictEqual(parentUrl('db://assets/a.png'), 'db://assets');
    assert.strictEqual(parentUrl('db://assets'), 'db://assets');
    assert.ok(isPackageUrl('db://input-system') && isPackageUrl(PACKAGES_ROOT) && isPackageUrl('db://internal/x'));
    assert.ok(!isPackageUrl('db://assets/x'));
    assert.ok(isReadonlyUrl('db://internal') && isReadonlyUrl('db://internal/effects') && isReadonlyUrl(PACKAGES_ROOT));
    assert.ok(!isReadonlyUrl('db://input-system/core') && !isReadonlyUrl('db://assets'));
});

test('breadcrumb: Assets, Packages, Cocos Internal', () => {
    assert.deepStrictEqual(breadcrumb('db://assets/Art/Characters').map((c) => c.label), ['Assets', 'Art', 'Characters']);
    assert.deepStrictEqual(breadcrumb('db://assets/Art').map((c) => c.url), ['db://assets', 'db://assets/Art']);
    assert.deepStrictEqual(breadcrumb('db://input-system/core').map((c) => c.label), ['Packages', 'input-system', 'core']);
    assert.strictEqual(breadcrumb('db://input-system/core')[0].url, PACKAGES_ROOT);
    assert.deepStrictEqual(breadcrumb('db://internal/effects').map((c) => c.label), ['Packages', 'Cocos Internal', 'effects']);
    assert.deepStrictEqual(breadcrumb(PACKAGES_ROOT).map((c) => c.label), ['Packages']);
    assert.deepStrictEqual(breadcrumb('nothing'), []);
});

test('buildTrees: folders only, packages under Packages, Cocos Internal last and read-only', () => {
    const t = buildTrees(ASSETS);
    assert.strictEqual(t.assets.name, 'Assets');
    assert.deepStrictEqual(t.assets.children.map((c) => c.name), ['Art', 'Empty', 'Models']);
    assert.deepStrictEqual(t.assets.children[0].children.map((c) => c.name), ['Characters']);
    assert.strictEqual(t.packages.name, 'Packages');
    assert.ok(t.packages.readonly);
    assert.deepStrictEqual(t.packages.children.map((c) => c.name), ['addressables', 'input-system', 'Cocos Internal']);
    const internal = t.packages.children[2];
    assert.strictEqual(internal.kind, 'internal');
    assert.ok(internal.readonly);
    assert.deepStrictEqual(internal.children.map((c) => c.name), ['default-materials', 'effects'], 'folders implied by asset urls');
    assert.strictEqual(internal.children[0].kind, 'internal', 'children inherit the read-only kind');
    assert.ok(internal.children[0].readonly);
    const input = t.packages.children[1];
    assert.strictEqual(input.kind, 'package');
    assert.ok(!input.readonly);
    assert.deepStrictEqual(input.children.map((c) => c.name), ['core']);
});

test('childrenOf: direct children; the Packages root lists the databases', () => {
    assert.deepStrictEqual(names(childrenOf(ASSETS, 'db://assets/Art')).sort(), ['Characters', 'hero.png']);
    assert.deepStrictEqual(childrenOf(ASSETS, 'db://assets/Empty'), []);
    const t = buildTrees(ASSETS);
    const pk = childrenOf(ASSETS, PACKAGES_ROOT, t.packages);
    assert.deepStrictEqual(pk.map((a) => a.url), ['db://addressables', 'db://input-system', 'db://internal']);
    assert.ok(pk.every((a) => a.isDirectory && a.uuid.indexOf('pkg:') === 0));
    assert.ok(pk[2].readonly);
});

test('inScope: Assets, Packages, folder', () => {
    assert.ok(inScope('db://assets/a.png', 'assets', 'db://assets/Art'));
    assert.ok(!inScope('db://input-system/x', 'assets', 'db://assets'), 'packages are not searched from Assets');
    assert.ok(inScope('db://input-system/x', 'packages', 'db://assets'));
    assert.ok(inScope('db://internal/x', 'packages', 'db://assets'));
    assert.ok(!inScope('db://assets/x', 'packages', 'db://assets'));
    assert.ok(inScope('db://assets/Art/a.png', 'folder', 'db://assets/Art'));
    assert.ok(!inScope('db://assets/Artwork/a.png', 'folder', 'db://assets/Art'), 'prefix of a name is not a parent');
    assert.ok(inScope('db://input-system/core/x', 'folder', 'db://input-system'));
    assert.ok(inScope('db://internal/x', 'folder', PACKAGES_ROOT));
    // a scoped search over the fixture
    const inPkgs = ASSETS.filter((a) => inScope(a.url, 'packages', 'db://assets'));
    assert.deepStrictEqual(names(search(inPkgs, parseQuery('t:Material'), noLabels)), ['default.mtl', 'Settings.mtl']);
    const inAssets = ASSETS.filter((a) => inScope(a.url, 'assets', 'db://assets'));
    assert.deepStrictEqual(names(search(inAssets, parseQuery('t:Material'), noLabels)), ['Hero.mtl']);
});

test('folderLabel shows the folder of a search result', () => {
    assert.strictEqual(folderLabel('db://assets/Art/Characters/Hero.mtl'), 'Assets/Art/Characters');
    assert.strictEqual(folderLabel('db://internal/effects/a.effect'), 'Packages/Cocos Internal/effects');
});

test('validName / renamedUrl', () => {
    assert.strictEqual(validName('  Hero  '), 'Hero');
    assert.strictEqual(validName('a/b'), null);
    assert.strictEqual(validName('a:b'), null);
    assert.strictEqual(validName('..'), null);
    assert.strictEqual(validName(''), null);
    const mtl = ASSETS.find((a) => a.uuid === 'mat1')!;
    assert.strictEqual(renamedUrl(mtl, 'Villain'), 'db://assets/Art/Characters/Villain.mtl');
    assert.strictEqual(renamedUrl(mtl, 'Villain.mtl'), 'db://assets/Art/Characters/Villain.mtl', 'the extension is not doubled');
    assert.strictEqual(renamedUrl(folder('db://assets/Art/Old'), 'New'), 'db://assets/Art/New');
    const ctrl = ASSETS.find((a) => a.uuid === 'ctrl1')!;
    assert.strictEqual(renamedUrl(ctrl, 'Enemy.controller'), 'db://assets/Enemy.controller.json');
});

// ------------------------------------------------------------------ drag data

test('dragPayload: Assets-panel format, deduped', () => {
    const mat = ASSETS.find((a) => a.uuid === 'mat1')!;
    const p = dragPayload([mat, fbx, mat]);
    assert.strictEqual(p.type, 'cc.Material');
    assert.strictEqual(p.value, 'mat1,fbx1');
    assert.strictEqual(p.additional.length, 2);
    assert.deepStrictEqual(p.additional[0], { type: 'cc.Material', value: 'mat1', name: 'Hero.mtl' });
    assert.deepStrictEqual(Object.keys(p.additional[1].subAssets!), ['mesh', 'run', 'prefab'], 'sub-asset keys are the part after @');
    assert.deepStrictEqual(p.additional[1].subAssets!.prefab, { type: 'cc.Prefab', value: 'fbx1@prefab', name: 'Hero.prefab' });
    assert.deepStrictEqual(p.types.split(','), ['cc.Material', 'cc.Asset', 'cc.Mesh', 'cc.AnimationClip', 'cc.Prefab'], 'types list includes sub-asset types');
});

test('dragPayload: folders, extends, package pseudo-entries', () => {
    const tex = asset('db://assets/t.png', 'image', 'cc.ImageAsset', { uuid: 't1', extends: ['cc.Asset'] });
    const p = dragPayload([folder('db://assets/F'), tex, { uuid: 'pkg:db://x', url: 'db://x', name: 'x', type: '', importer: 'database', isDirectory: true }]);
    assert.strictEqual(p.additional.length, 2, 'Packages pseudo-entries are not draggable');
    assert.strictEqual(p.additional[0].type, 'cc.Asset');
    assert.deepStrictEqual(p.additional[1].extends, ['cc.Asset']);
    assert.strictEqual(p.types, 'cc.Asset,cc.ImageAsset');
    assert.deepStrictEqual(dragPayload([]), { type: '', value: '', types: '', additional: [] });
});

test('dragPayload: an image also lists its sprite frame and texture as entries (Inspector fields)', () => {
    const sf = asset('db://assets/hero.png/spriteFrame', 'sprite-frame', 'cc.SpriteFrame', { uuid: 'img@f9941', parent: 'img' });
    const tx = asset('db://assets/hero.png/texture', 'texture', 'cc.Texture2D', { uuid: 'img@6c48a', parent: 'img' });
    const img = asset('db://assets/hero.png', 'image', 'cc.ImageAsset', { uuid: 'img', subAssets: [tx, sf] });
    const p = dragPayload([img]);
    assert.deepStrictEqual(p.additional.map((e) => e.type + ':' + e.value), ['cc.ImageAsset:img', 'cc.Texture2D:img@6c48a', 'cc.SpriteFrame:img@f9941'], 'image first, then its parts');
    assert.ok(p.additional[0].subAssets!.f9941, 'the nested form stays too');
    assert.strictEqual(p.type, 'cc.ImageAsset');
    assert.strictEqual(p.value, 'img', 'value keeps the dragged asset only');
    // an FBX keeps the nested form only (Scene drops stay as they were)
    const fbxP = dragPayload([fbx]);
    assert.strictEqual(fbxP.additional.length, 1);
    // dropping it on ourselves moves the image, not its parts; a sprite frame dragged alone stays
    assert.deepStrictEqual(dropUuids({ type: p.type, value: p.value, additional: p.additional }), ['img']);
    assert.deepStrictEqual(dropUuids({ additional: [{ type: 'cc.SpriteFrame', value: 'img@f9941' }] }), ['img@f9941']);
});

test('dropUuids: DragArea info and dataTransfer, each uuid once', () => {
    const info = { type: 'cc.Material', value: 'a,b', additional: [{ type: 'cc.Material', value: 'a' }, { type: 'cc.Prefab', value: 'c' }] };
    assert.deepStrictEqual(dropUuids(info), ['a', 'c', 'b']);
    assert.deepStrictEqual(dropUuids(null, 'x, y,x', JSON.stringify([{ value: 'y' }, { value: 'z' }])), ['y', 'z', 'x']);
    assert.deepStrictEqual(dropUuids(info, 'a', 'not json'), ['a', 'c', 'b']);
    assert.deepStrictEqual(dropUuids(undefined), []);
});

// ------------------------------------------------------------------ icons

test('icons: every t: type has a drawn icon, SVG only, no external references', () => {
    TYPE_FILTERS.forEach((f) => assert.ok(hasIcon(f.name), 'icon for ' + f.name));
    ['FolderOpen', 'FolderEmpty', 'Package', 'PackageLocked', 'SpriteAtlas', 'Skeleton', 'VideoClip', 'ParticleAsset'].forEach((k) => assert.ok(hasIcon(k), k));
    iconNames().forEach((k) => {
        const s = iconSvg(k);
        assert.ok(/^<svg viewBox="0 0 32 32"[^>]*>[\s\S]*<\/svg>$/.test(s), k + ' is one svg');
        assert.ok(!/href|url\(|<image|<script|\son[a-z]+=/i.test(s), k + ' has no external references or handlers');
        assert.ok(!/ id=/.test(s), k + ' has no ids (copies are inserted many times)');
    });
    assert.ok(iconSvg('Script', 'js').indexOf('>JS<') > 0);
    assert.ok(iconSvg('Script').indexOf('>TS<') > 0);
    assert.strictEqual(iconSvg('Something.Unknown'), iconSvg('File'));
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exitCode = 1;
