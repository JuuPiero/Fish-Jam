/**
 * The main process glue (source/main.ts) with a mocked Editor and electron:
 * the drag out (sender webContents, icon, package build), the clipboard
 * messages and the package messages between two fixture projects.
 */
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { decodeClipboardText, MANIFEST_NAME } from '../source/shared/package';
import { finish, testAsync } from './harness';

const IMG = 'bbbbbbbb-0000-4000-8000-000000000002';
const MTL = 'cccccccc-0000-4000-8000-000000000003';
const DIR = 'aaaaaaaa-0000-4000-8000-000000000001';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-main-'));
process.on('exit', () => {
    try {
        fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
        // leave it
    }
});

function write(root: string, rel: string, content: string | Buffer, meta: any) {
    const f = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
    fs.writeFileSync(f + '.meta', JSON.stringify(meta));
}

const A = path.join(tmp, 'Source');
write(A, 'assets/Art', '', { importer: 'directory', uuid: DIR });
fs.rmSync(path.join(A, 'assets', 'Art'));
fs.mkdirSync(path.join(A, 'assets', 'Art'));
write(A, 'assets/Art/hero.png', Buffer.from([1, 2, 3]), { importer: 'image', uuid: IMG, subMetas: { '6c48a': { uuid: IMG + '@6c48a' } } });
write(A, 'assets/Art/hero.mtl', JSON.stringify({ tex: { __uuid__: IMG + '@6c48a' } }), { importer: 'material', uuid: MTL });
const B = path.join(tmp, 'Dest');
fs.mkdirSync(path.join(B, 'assets'), { recursive: true });

/** asset-db over the current project's metas. */
function infoOf(root: string, key: string): any {
    const walk = (d: string, url: string): any => {
        for (const n of fs.readdirSync(d)) {
            if (/\.meta$/.test(n)) continue;
            const f = path.join(d, n);
            if (!fs.existsSync(f + '.meta')) continue;
            const meta = JSON.parse(fs.readFileSync(f + '.meta', 'utf8'));
            const isDir = fs.statSync(f).isDirectory();
            const info = { uuid: meta.uuid, url: url + '/' + n, file: f, importer: meta.importer, isDirectory: isDir, type: 'cc.Asset' };
            if (meta.uuid === key.split('@')[0] || info.url === key || f === key) return info;
            if (isDir) {
                const r = walk(f, url + '/' + n);
                if (r) return r;
            }
        }
        return null;
    };
    return walk(path.join(root, 'assets'), 'db://assets');
}

const calls: string[] = [];
const g: any = global;
g.Editor = {
    Project: { path: A, name: 'Source' },
    App: { version: '3.8.6' },
    Panel: { open: (p: string) => calls.push('panel.open ' + p) },
    Profile: {},
    Message: {
        async request(pkg: string, method: string, ...args: any[]) {
            calls.push(pkg + ':' + method + ' ' + JSON.stringify(args));
            if (pkg !== 'asset-db') return null;
            if (method === 'query-asset-info') return infoOf(g.Editor.Project.path, args[0]);
            if (method === 'query-asset-dependencies') return null; // not available: the file parser does it
            return null;
        },
        send() {},
        broadcast: (m: string) => calls.push('broadcast ' + m),
    },
};

// electron
let clipText = '';
const drags: any[] = [];
const shown: string[] = [];
const fakeImage = (kind: string) => ({ kind, isEmpty: () => false, getSize: () => ({ width: 64, height: 32 }), resize: (o: any) => ({ kind: kind + ':resized', o }) });
const focused = { id: 2, startDrag: (item: any) => drags.push({ from: 'focused', item }) };
const ipcHandlers: Record<string, any> = {};
const electron = {
    ipcMain: { on: (ch: string, fn: any) => (ipcHandlers[ch] = fn), removeListener: (ch: string) => delete ipcHandlers[ch] },
    webContents: { getFocusedWebContents: () => focused },
    BrowserWindow: { getFocusedWindow: () => null },
    nativeImage: { createFromPath: (f: string) => fakeImage('path:' + path.basename(f)), createFromBuffer: (b: Buffer) => fakeImage('png:' + b.length) },
    clipboard: { writeText: (t: string) => (clipText = t), readText: () => clipText, writeBuffer() {}, readBuffer: () => Buffer.alloc(0) },
    shell: { showItemInFolder: (f: string) => shown.push(f) },
};
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, ...rest: any[]) {
    if (request === 'electron') return electron;
    return origLoad.call(this, request, ...rest);
};
// the clipboard goes through Electron (the Windows PowerShell path is checked by hand, see README)
Object.defineProperty(process, 'platform', { value: 'linux' });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const main = require('../source/main');
main.load();

testAsync('drag out: ipcRenderer sender gets startDrag with the files and a drawn icon', async () => {
    const sender = { startDrag: (item: any) => drags.push({ from: 'sender', item }) };
    const handler = ipcHandlers['project-browser:start-os-drag'];
    assert.ok(handler, 'ipcMain channel registered on load');
    const png = path.join(A, 'assets', 'Art', 'hero.png');
    handler({ sender }, { mode: 'files', files: [png, path.join(A, 'missing.png')] });
    await new Promise((r) => setTimeout(r, 20));
    const d = drags.pop();
    assert.strictEqual(d.from, 'sender');
    assert.deepStrictEqual(d.item.files, [png], 'missing files dropped');
    assert.strictEqual(d.item.file, png);
    assert.ok(/^png:\d+$/.test(d.item.icon.kind), 'drawn PNG icon (no cached thumbnail)');
});

testAsync('drag out: a cached thumbnail is the icon; without a sender the focused webContents drags', async () => {
    const thumbs = path.join(A, 'temp', 'project-browser', 'thumbs');
    fs.mkdirSync(thumbs, { recursive: true });
    fs.writeFileSync(path.join(thumbs, IMG + '.png'), 'x');
    const ok = await main.methods.startOsDrag({ mode: 'files', files: [path.join(A, 'assets', 'Art', 'hero.png')], thumbUuid: IMG });
    assert.strictEqual(ok, true);
    const d = drags.pop();
    assert.strictEqual(d.from, 'focused');
    assert.strictEqual(d.item.icon.kind, 'path:' + IMG + '.png:resized');
    assert.deepStrictEqual(d.item.icon.o, { width: 32 });
    assert.strictEqual(await main.methods.startOsDrag({ mode: 'files', files: [] }), false);
});

let pkgDir = '';
testAsync('drag out as a package: prepared on press, built with dependencies, the folder is dragged', async () => {
    main.methods.prepareOsDrag([MTL]);
    await main.methods.startOsDrag({ mode: 'package', uuids: [MTL] }, focused);
    const d = drags.pop();
    assert.strictEqual(d.item.files.length, 1);
    pkgDir = d.item.files[0];
    assert.ok(pkgDir.indexOf(path.join(A, 'temp', 'project-browser', 'packages')) === 0, pkgDir);
    const m = JSON.parse(fs.readFileSync(path.join(pkgDir, MANIFEST_NAME), 'utf8'));
    assert.deepStrictEqual(m.assets.map((a: any) => a.path), ['assets/Art', 'assets/Art/hero.mtl', 'assets/Art/hero.png']);
    assert.strictEqual(m.source.project, 'Source');
    assert.strictEqual(m.source.creator, '3.8.6');
    assert.ok(/^png:/.test(d.item.icon.kind));
});

testAsync('Ctrl+C / Ctrl+V: package path on the clipboard, read back as a package', async () => {
    const r = await main.methods.copyPackage([IMG]);
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.how, 'text');
    assert.strictEqual(decodeClipboardText(clipText), r.dir);
    assert.ok(fs.existsSync(path.join(r.dir, 'assets', 'Art', 'hero.png.meta')));
    const back = await main.methods.readClipboard();
    assert.deepStrictEqual(back, { kind: 'package', path: r.dir });
    clipText = 'just text';
    assert.deepStrictEqual(await main.methods.readClipboard(), { kind: 'none' });
    const bad = await main.methods.copyPackage(['nope']);
    assert.ok(!bad.ok && /Nothing to pack/.test(bad.error));
});

testAsync('the destination project: open, classify, import with uuids, refresh and reimport messages', async () => {
    g.Editor.Project.path = B;
    g.Editor.Project.name = 'Dest';
    assert.deepStrictEqual(main.methods.probePaths([pkgDir, path.join(A, 'assets')]), [pkgDir]);
    assert.deepStrictEqual(main.methods.insideProject([path.join(B, 'assets', 'x.png'), path.join(A, 'assets', 'x.png')]), [true, false]);
    const info = main.methods.openPackage(pkgDir);
    assert.ok(info.ok, info.error);
    assert.strictEqual(info.project, 'Source');
    assert.strictEqual(info.fromThisProject, false);
    assert.strictEqual(info.ownTemp, false);
    assert.strictEqual(info.count, 2);
    const c = await main.methods.classifyPackage(info.id, null);
    assert.ok(c.ok);
    assert.deepStrictEqual(c.rows.filter((r: any) => !r.isDirectory).map((r: any) => r.status), ['new', 'new']);
    const folder = await main.methods.classifyPackage(info.id, 'db://assets');
    assert.deepStrictEqual(folder.rows.filter((r: any) => !r.isDirectory).map((r: any) => r.target).sort(), ['assets/hero.mtl', 'assets/hero.png'], 'the common root (assets/Art) goes straight into the folder');
    calls.length = 0;
    const r = await main.methods.importPackage(info.id, null, {});
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.written, 3);
    assert.strictEqual(r.first, 'db://assets/Art/hero.mtl');
    assert.ok(calls.indexOf('asset-db:refresh-asset ["db://assets"]') >= 0, calls.join('\n'));
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(B, 'assets', 'Art', 'hero.png.meta'), 'utf8')).uuid, IMG);
    main.methods.closePackage(info.id);
    const closed = await main.methods.classifyPackage(info.id, null);
    assert.ok(!closed.ok);
    // its own temp package dropped back on the project that made it
    g.Editor.Project.path = A;
    const own = main.methods.openPackage(pkgDir);
    assert.strictEqual(own.ownTemp, true);
    assert.strictEqual(own.fromThisProject, true);
    const notPkg = main.methods.openPackage(path.join(A, 'assets', 'Art', 'hero.png'));
    assert.ok(!notPkg.ok && /Not an asset package/.test(notPkg.error));
});

testAsync('Export Package: checklist with dependencies, then a .zip and a folder', async () => {
    g.Editor.Project.path = A;
    const list = await main.methods.collectExport([MTL]);
    assert.ok(list.ok);
    assert.deepStrictEqual(list.rows.map((r: any) => [r.path, r.dependency]), [['assets/Art/hero.mtl', false], ['assets/Art/hero.png', true]]);
    const zip = path.join(tmp, 'out', 'hero.zip');
    fs.mkdirSync(path.dirname(zip), { recursive: true });
    const r = await main.methods.exportPackage([MTL], [MTL], zip, true);
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.count, 1);
    assert.ok(main.methods.zipHasManifest(zip));
    assert.deepStrictEqual(shown.pop(), zip);
    const folder = path.join(tmp, 'out', 'Hero Package');
    const r2 = await main.methods.exportPackage([MTL, IMG], [MTL], folder, false);
    assert.ok(r2.ok, r2.error);
    assert.ok(fs.existsSync(path.join(folder, 'assets', 'Art', 'hero.png.meta')) && fs.existsSync(path.join(folder, 'assets', 'Art.meta')));
    const full = path.join(tmp, 'out');
    const r3 = await main.methods.exportPackage([MTL], [MTL], full, false);
    assert.ok(!r3.ok && /not empty/.test(r3.error), 'never writes into a non-empty folder');
});

testAsync('Extension menu: the request waits for a Project window and is taken once', async () => {
    main.methods.importPackageMenu();
    assert.ok(calls.indexOf('panel.open project-browser.project') >= 0);
    assert.ok(calls.indexOf('broadcast project-browser:package-menu') >= 0);
    assert.strictEqual(main.methods.takePendingMenu(), 'import');
    assert.strictEqual(main.methods.takePendingMenu(), '');
    main.unload();
    assert.ok(!ipcHandlers['project-browser:start-os-drag'], 'channel removed on unload');
});

finish();
