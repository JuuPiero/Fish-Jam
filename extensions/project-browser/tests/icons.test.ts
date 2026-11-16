import assert from 'assert';
import { test, results } from './harness';
import { extBadge, extIconFor, extIconSvg, extOf, hasExtBadge } from '../source/panels/icons';
import { typeLabel } from '../source/shared/search';

test('extensions are read lower-case without the dot', () => {
    assert.strictEqual(extOf('Player.cs'), 'cs');
    assert.strictEqual(extOf('Data.CSV'), 'csv');
    assert.strictEqual(extOf('archive.tar.gz'), 'gz');
    assert.strictEqual(extOf('README'), '');
    assert.strictEqual(extOf('.gitignore'), 'gitignore');
});

test('C#, unknown files and well-known text files get an extension badge', () => {
    assert.strictEqual(extIconFor({ name: 'Player.cs', importer: '*', type: 'cc.Asset' }, false), 'cs');
    assert.strictEqual(extIconFor({ name: 'Player.cs', importer: 'text', type: 'cc.TextAsset' }, true), 'cs', 'even if Cocos imports it as text');
    assert.strictEqual(extIconFor({ name: 'level.xyz', importer: '*', type: 'cc.Asset' }, false), 'xyz');
    assert.strictEqual(extIconFor({ name: 'notes.md', importer: 'text', type: 'cc.TextAsset' }, true), 'md');
    assert.strictEqual(extIconFor({ name: 'notes.txt', importer: 'text', type: 'cc.TextAsset' }, true), null, 'plain text keeps the text icon');
    assert.strictEqual(extIconFor({ name: 'weird.qqq', importer: 'text', type: 'cc.TextAsset' }, true), null, 'unknown text extensions keep the text icon');
    assert.strictEqual(extIconFor({ name: 'hero.png', importer: 'image', type: 'cc.ImageAsset' }, true), null, 'Cocos assets keep their icons');
    assert.strictEqual(extIconFor({ name: 'Folder.cs', isDirectory: true, importer: 'directory' }, false), null);
    assert.strictEqual(extIconFor({ name: 'NOEXT', importer: '*' }, false), '', 'no extension: plain page');
});

test('badges: own colours for common kinds, grey with the extension otherwise', () => {
    assert.deepStrictEqual(extBadge('cs'), { text: 'C#', bg: '#68217A', fg: '#FFFFFF' });
    assert.ok(hasExtBadge('pdf') && !hasExtBadge('qwerty'));
    assert.deepStrictEqual(extBadge('qwerty'), { text: 'QWER', bg: '#6B7280', fg: '#FFFFFF' }, 'at most 4 letters');
    const svg = extIconSvg('xyz');
    assert.ok(/<svg/.test(svg) && svg.indexOf('>XYZ<') > 0, 'the extension is written on the icon');
    assert.ok(extIconSvg('cs').indexOf('>C#<') > 0);
    assert.ok(extIconSvg('').indexOf('<text') < 0, 'plain page without a badge');
    assert.strictEqual(extIconSvg('xyz'), svg, 'cached');
});

test('list type labels: C# is a Script, unknown files are "XYZ File"', () => {
    assert.strictEqual(typeLabel({ uuid: 'a', url: 'db://assets/P.cs', name: 'P.cs', type: 'cc.Asset', importer: '*' } as any), 'Script');
    assert.strictEqual(typeLabel({ uuid: 'b', url: 'db://assets/l.xyz', name: 'l.xyz', type: 'cc.Asset', importer: '*' } as any), 'XYZ File');
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
