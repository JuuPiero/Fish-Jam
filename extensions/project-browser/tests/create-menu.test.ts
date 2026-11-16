import assert from 'assert';
import { test, results } from './harness';
import { defaultNewName, isCreatable, isFolderEntry, menuHooks, withGroupSeparators } from '../source/shared/create-menu';

test('default names come from fullFileName, the template, or the label', () => {
    assert.deepStrictEqual(defaultNewName({ fullFileName: 'NewComponent.ts' }, 'TypeScript'), { base: 'NewComponent', ext: '.ts' });
    assert.deepStrictEqual(defaultNewName({ template: 'db://internal/default_file_content/scene/default.scene' }, 'Scene'), { base: 'default', ext: '.scene' });
    assert.deepStrictEqual(defaultNewName({ handler: 'auto-atlas' }, 'Auto Atlas'), { base: 'New Auto Atlas', ext: '' });
    assert.deepStrictEqual(defaultNewName({ fullFileName: 'New.Material.mtl' }, 'Material'), { base: 'New.Material', ext: '.mtl' });
});

test('creatable entries include handler-only ones; folders are recognised', () => {
    assert.ok(isCreatable({ fullFileName: 'a.anim', handler: 'animation-clip' }));
    assert.ok(isCreatable({ handler: 'render-texture', fullFileName: 'rt.rt' }));
    assert.ok(isCreatable({ handler: 'auto-atlas' }), 'handler only: the handler creates the content');
    assert.ok(!isCreatable({ label: 'Effect', submenu: [{ fullFileName: 'a.effect' }] }));
    assert.ok(!isCreatable({ type: 'separator' }));
    assert.ok(isFolderEntry({ handler: 'directory' }, 'Folder'));
    assert.ok(isFolderEntry({}, 'Folder'));
    assert.ok(!isFolderEntry({ template: 'x' }, 'Folder'), 'a templated entry named Folder is not the folder item');
});

test('separators between groups, never doubled or at the ends', () => {
    const sep = () => ({ type: 'separator' } as any);
    const list: any[] = [{ label: 'A', group: 'g1' }, { label: 'B', group: 'g1' }, { label: 'C', group: 'g2' }, { type: 'separator' }, { label: 'D', group: 'g3' }, { type: 'separator' }];
    const out = withGroupSeparators(list, sep).map((x: any) => x.label || '-');
    assert.deepStrictEqual(out, ['A', 'B', '-', 'C', '-', 'D']);
    assert.deepStrictEqual(withGroupSeparators([{ type: 'separator' }, { label: 'X' }] as any[], sep).map((x: any) => x.label || '-'), ['X']);
    assert.deepStrictEqual(withGroupSeparators([{ label: 'X' }, { label: 'Y', group: 'a' }] as any[], sep).map((x: any) => x.label || '-'), ['X', 'Y'], 'no group before: no separator');
});

test('extension menu hooks from package infos', () => {
    const join = (a: string, b: string) => a + '/' + b.replace(/^\.\//, '');
    const pkgs: any[] = [
        { name: 'shader-graph', path: 'E:/x/shader-graph', enable: true, info: { contributions: { assets: { menu: { methods: './dist/assets-menu.js', createMenu: 'onCreateMenu', assetMenu: 'onAssetMenu' } } } } },
        { name: 'addressables', path: 'E:/x/addressables', enable: true, info: { contributions: { assets: { menu: { methods: './dist/assets-menu.js', assetMenu: 'onAssetMenu' } } } } },
        { name: 'off', path: 'E:/x/off', enable: false, info: { contributions: { assets: { menu: { methods: 'm.js', createMenu: 'c' } } } } },
        { name: 'project-browser', path: 'E:/x/pb', enable: true, info: { contributions: { assets: { menu: { methods: 'm.js', createMenu: 'c' } } } } },
        { name: 'plain', path: 'E:/x/plain', enable: true, info: {} },
    ];
    assert.deepStrictEqual(menuHooks(pkgs, 'createMenu', join, 'project-browser'), [{ pkg: 'shader-graph', file: 'E:/x/shader-graph/dist/assets-menu.js', fn: 'onCreateMenu' }]);
    assert.deepStrictEqual(menuHooks(pkgs, 'assetMenu', join, 'project-browser').map((h) => h.pkg), ['shader-graph', 'addressables']);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
