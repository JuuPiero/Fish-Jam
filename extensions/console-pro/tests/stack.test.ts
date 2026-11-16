import assert from 'assert';
import { dropInternal, entryFrames, messageLocations, messageOnly, parseFrameLine, parseStack, splitLocation } from '../source/shared/stack';
import { chunkFile, classifyUrl, displayPath, fileUrlToPath, isUserFile, staticPath } from '../source/shared/urls';
import { run, test } from './harness';

const CHUNK = '00791f00102a72a2d20a452c5df935ed506a1501';

const V8 = [
    'Error: boom',
    '    at Player.start (pack:///chunks/00/' + CHUNK + '.js:12:15)',
    '    at Object.<anonymous> (E:\\Workspace\\cocos\\CocosGoat\\assets\\a.js:3:7)',
    '    at async Promise.all (index 0)',
    '    at new Foo (file:///E:/Workspace/cocos/CocosGoat/temp/programming/packer-driver/targets/editor/chunks/ab/abcdef0123456789abcdef0123456789abcdef01.js:5:3)',
    '    at Foo.bar [as baz] (db://assets/scripts/Foo.ts:10:2)',
    '    at eval (eval at run (file:///E:/x/y.js:4:9), <anonymous>:1:1)',
    '    at file:///E:/Proj/assets/Main.ts:20:4',
    '    at Generator.next (<anonymous>)',
    '    at http://localhost:7456/scripting/x/chunks/ab/abcdef0123456789abcdef0123456789abcdef01.js:7:9',
    '    at node:internal/process/task_queues:95:5',
].join('\n');

test('splitLocation keeps drive colons and schemes in the url', () => {
    assert.deepStrictEqual(splitLocation('E:\\a\\b.js:3:7'), { url: 'E:\\a\\b.js', line: 3, col: 7 });
    assert.deepStrictEqual(splitLocation('file:///E:/a.ts:20'), { url: 'file:///E:/a.ts', line: 20, col: 0 });
    assert.deepStrictEqual(splitLocation('pack:///chunks/00/x.js'), { url: 'pack:///chunks/00/x.js', line: 0, col: 0 });
});

test('V8 frames: names, async, new, [as], eval, Windows paths, urls', () => {
    const f = parseStack(V8);
    assert.strictEqual(f.length, 10);
    assert.deepStrictEqual([f[0].fn, f[0].url, f[0].line, f[0].col], ['Player.start', 'pack:///chunks/00/' + CHUNK + '.js', 12, 15]);
    assert.deepStrictEqual([f[1].fn, f[1].url, f[1].line], ['Object.<anonymous>', 'E:\\Workspace\\cocos\\CocosGoat\\assets\\a.js', 3]);
    assert.deepStrictEqual([f[2].fn, f[2].url], ['Promise.all', ''], 'async frame without location');
    assert.strictEqual(f[3].fn, 'new Foo');
    assert.strictEqual(f[4].fn, 'Foo.bar [as baz]');
    assert.strictEqual(f[4].url, 'db://assets/scripts/Foo.ts');
    assert.deepStrictEqual([f[5].fn, f[5].url, f[5].line, f[5].col], ['eval', 'file:///E:/x/y.js', 4, 9], 'eval frames point at the caller');
    assert.deepStrictEqual([f[6].fn, f[6].url, f[6].line], ['', 'file:///E:/Proj/assets/Main.ts', 20]);
    assert.strictEqual(f[7].url, '<anonymous>');
    assert.strictEqual(f[8].url, 'http://localhost:7456/scripting/x/chunks/ab/abcdef0123456789abcdef0123456789abcdef01.js');
});

test('Firefox / Safari frames', () => {
    const f = parseStack('start@http://localhost:7456/scripting/x/chunks/ab/abcdef0123456789abcdef0123456789abcdef01.js:3:5\n@db://assets/a.ts:1:2\nmail me @ home: 12');
    assert.strictEqual(f.length, 2);
    assert.deepStrictEqual([f[0].fn, f[0].line, f[0].col], ['start', 3, 5]);
    assert.deepStrictEqual([f[1].fn, f[1].url], ['', 'db://assets/a.ts']);
});

test('prose lines are not frames', () => {
    assert.strictEqual(parseFrameLine('at least one item is missing'), null);
    assert.strictEqual(parseFrameLine('Loading scene'), null);
    assert.strictEqual(parseFrameLine(''), null);
});

test('dropInternal removes logger frames from the top only', () => {
    const f = parseStack([
        '    at console.log (E:\\App\\resources\\app.asar\\node_modules\\@base\\electron-logger\\lib\\renderer.js:1:2)',
        '    at console.log (E:\\Proj\\extensions\\console-pro\\dist\\scene.js:10:3)',
        '    at Player.start (pack:///chunks/00/' + CHUNK + '.js:12:15)',
        '    at node:internal/x:1:1',
    ].join('\n'));
    const d = dropInternal(f);
    assert.strictEqual(d.length, 2);
    assert.strictEqual(d[0].fn, 'Player.start');
});

test('entryFrames prefers the stack field, then the text', () => {
    assert.strictEqual(entryFrames('Error: x\n    at a (file:///E:/p/assets/a.ts:1:1)', '').length, 1);
    assert.strictEqual(entryFrames('hello', '    at b (db://assets/b.ts:2:2)\n    at c (db://assets/c.ts:3:3)').length, 2);
    assert.strictEqual(entryFrames('hello', '').length, 0);
});

test('messageOnly drops stack lines printed into the message', () => {
    assert.strictEqual(messageOnly('TypeError: x is undefined\n    at a (file:///E:/p/a.ts:1:1)'), 'TypeError: x is undefined');
    assert.strictEqual(messageOnly('two\nlines'), 'two\nlines');
});

test('messageLocations finds compiler output and urls in a message', () => {
    const l = messageLocations('assets/Scripts/Player.cs(12,9): error CS0103: The name x does not exist');
    assert.deepStrictEqual(l.map((x) => [x.url, x.line, x.col]), [['assets/Scripts/Player.cs', 12, 9]]);
    const m = messageLocations('Failed in file:///E:/Proj/assets/a.ts:4:2 and db://assets/b.ts:7');
    assert.deepStrictEqual(m.map((x) => [x.url, x.line, x.col]), [['file:///E:/Proj/assets/a.ts', 4, 2], ['db://assets/b.ts', 7, 0]]);
    assert.strictEqual(messageLocations('see src/a.ts for details').length, 0, 'relative paths outside assets/extensions are ignored');
    assert.strictEqual(messageLocations('E:\\Proj\\assets\\c.ts:3:1')[0].line, 3);
});

// ------------------------------------------------------------------ urls

test('classifyUrl: chunks of every form', () => {
    const p = classifyUrl('pack:///chunks/00/' + CHUNK + '.js');
    assert.deepStrictEqual([p.kind, p.chunk!.shard, p.chunk!.id, p.chunk!.target], ['chunk', '00', CHUNK, '']);
    const f = classifyUrl('file:///E:/G/temp/programming/packer-driver/targets/editor/chunks/ab/abcdef0123456789abcdef0123456789abcdef01.js');
    assert.deepStrictEqual([f.kind, f.chunk!.target], ['chunk', 'editor']);
    const w = classifyUrl('http://localhost:7456/scripting/x/chunks/ab/abcdef0123456789abcdef0123456789abcdef01.js?t=123');
    assert.deepStrictEqual([w.kind, w.chunk!.target], ['chunk', 'preview']);
    const pv = classifyUrl('E:\\G\\temp\\programming\\packer-driver\\targets\\preview\\chunks\\ab\\abcdef0123456789abcdef0123456789abcdef01.js');
    assert.deepStrictEqual([pv.kind, pv.chunk!.target], ['chunk', 'preview']);
});

test('classifyUrl: db, packages, files, internals', () => {
    assert.deepStrictEqual(classifyUrl('db://assets/scripts/My%20Foo.ts'), { kind: 'db', name: 'assets', rel: 'scripts/My Foo.ts' });
    assert.deepStrictEqual(classifyUrl('db://input-system/core/Input.ts'), { kind: 'db', name: 'input-system', rel: 'core/Input.ts' });
    assert.deepStrictEqual(classifyUrl('packages://console-pro/dist/main.js'), { kind: 'package', name: 'console-pro', rel: 'dist/main.js' });
    assert.deepStrictEqual(classifyUrl('file:///E:/My%20Game/assets/a.ts'), { kind: 'file', path: 'E:/My Game/assets/a.ts' });
    assert.deepStrictEqual(classifyUrl('E:\\G\\assets\\a.ts'), { kind: 'file', path: 'E:\\G\\assets\\a.ts' });
    assert.deepStrictEqual(classifyUrl('/Users/me/G/assets/a.ts'), { kind: 'file', path: '/Users/me/G/assets/a.ts' });
    assert.deepStrictEqual(classifyUrl('assets/Scripts/Player.cs'), { kind: 'file', path: 'assets/Scripts/Player.cs' });
    assert.strictEqual(classifyUrl('cce:/internal/x/cc').kind, 'internal');
    assert.strictEqual(classifyUrl('node:internal/timers').kind, 'internal');
    assert.strictEqual(classifyUrl('<anonymous>').kind, 'none');
    assert.strictEqual(classifyUrl('').kind, 'none');
    assert.strictEqual(classifyUrl('http://localhost:7456/index.js').kind, 'web');
});

test('fileUrlToPath handles drives, hosts, queries and escapes', () => {
    assert.strictEqual(fileUrlToPath('file:///E:/a%20b/x.ts?x=1'), 'E:/a b/x.ts');
    assert.strictEqual(fileUrlToPath('file:///Users/me/x.ts'), '/Users/me/x.ts');
    assert.strictEqual(fileUrlToPath('file://localhost/E:/x.ts'), 'E:/x.ts');
});

test('url -> project file mapping', () => {
    const root = 'E:/Workspace/cocos/CocosGoat';
    assert.strictEqual(staticPath(classifyUrl('db://assets/a/b.ts'), root), root + '/assets/a/b.ts');
    assert.strictEqual(staticPath(classifyUrl('db://input-system/a.ts'), root), '', 'other dbs need the asset-db');
    assert.strictEqual(chunkFile(root, { shard: '00', id: CHUNK }, 'editor'), root + '/temp/programming/packer-driver/targets/editor/chunks/00/' + CHUNK + '.js');
    assert.strictEqual(displayPath('E:\\Workspace\\cocos\\CocosGoat\\assets\\a.ts', 'E:\\Workspace\\cocos\\CocosGoat'), 'assets/a.ts');
    assert.strictEqual(displayPath('D:/App/engine/x.js', root), 'D:/App/engine/x.js');
});

test('isUserFile: project code yes, generated and engine code no', () => {
    const root = 'E:\\Workspace\\cocos\\CocosGoat';
    assert.ok(isUserFile('e:/workspace/cocos/cocosgoat/assets/Player.ts', root), 'case-insensitive drive paths');
    assert.ok(isUserFile(root + '\\extensions\\csharp\\source\\main.ts', root));
    assert.ok(!isUserFile(root + '\\temp\\programming\\packer-driver\\targets\\editor\\chunks\\00\\x.js', root));
    assert.ok(!isUserFile(root + '\\extensions\\csharp\\node_modules\\vue\\index.js', root));
    assert.ok(!isUserFile(root + '\\library\\aa\\x.js', root));
    assert.ok(!isUserFile('D:\\App\\cocos\\resources\\3d\\engine\\bin\\x.js', root));
});

run();
