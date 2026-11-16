import assert from 'assert';
import { test, results } from './harness';
import { cleanFolderColors, FOLDER_COLORS, normalizeColor, pruneFolderColors, setFolderColors, sharedColor } from '../source/shared/folder-colors';

test('colours are normalised; junk from the profile is dropped', () => {
    assert.strictEqual(normalizeColor('#abc'), '#AABBCC');
    assert.strictEqual(normalizeColor('5b9be0'), '#5B9BE0');
    assert.strictEqual(normalizeColor('red'), null);
    assert.deepStrictEqual(cleanFolderColors({ a: '#e06c6c', b: 'nope', c: 3 }), { a: '#E06C6C' });
    assert.deepStrictEqual(cleanFolderColors(null), {});
    assert.deepStrictEqual(cleanFolderColors(['#fff']), {});
});

test('set, clear, prune and the shared colour of a selection', () => {
    let s = setFolderColors({}, ['f1', 'f2'], '#5b9be0');
    assert.deepStrictEqual(s, { f1: '#5B9BE0', f2: '#5B9BE0' });
    assert.strictEqual(sharedColor(s, ['f1', 'f2']), '#5B9BE0');
    s = setFolderColors(s, ['f2'], FOLDER_COLORS[0].hex);
    assert.strictEqual(sharedColor(s, ['f1', 'f2']), null, 'different colours');
    assert.strictEqual(sharedColor(s, ['f3']), '', 'no colour');
    s = setFolderColors(s, ['f1'], null);
    assert.deepStrictEqual(s, { f2: '#E06C6C' });
    assert.deepStrictEqual(pruneFolderColors({ f2: '#E06C6C', gone: '#000000' }, (u) => u !== 'gone'), { f2: '#E06C6C' });
    assert.ok(FOLDER_COLORS.every((c) => normalizeColor(c.hex) === c.hex), 'palette is normalised');
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
