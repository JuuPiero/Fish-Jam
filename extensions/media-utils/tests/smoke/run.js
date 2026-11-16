/**
 * Headless smoke test of both panels with a mocked `Editor`.
 *
 * A small HTTP server serves the built panel bundles and forwards every
 * Editor.Message.request('media-utils', ...) to the real dist/main.js (running
 * here in Node with a mocked Editor, sharp loaded from Cocos). Chrome runs the
 * panels headless and is driven over the DevTools protocol.
 *
 *   node tests/smoke/run.js         (after npm run build and npm test, which prepares sharp)
 *
 * Env: CHROME (path to chrome.exe), MEDIA_UTILS_SAMPLES, COCOS_CREATOR.
 * Screenshots go to <tmp>/media-utils-tests/smoke.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..', '..');
const creator = process.env.COCOS_CREATOR || 'D:\\App\\cocos\\editors\\Creator\\3.8.6';
process.env.MEDIA_UTILS_SHARP = process.env.MEDIA_UTILS_SHARP || path.join(creator, 'resources', 'app.asar.unpacked', 'node_modules', 'sharp');
// sharp's JS dependencies extracted from app.asar by tests/run.js
const deps = path.join(root, 'tests', 'out', 'asar-deps', 'node_modules');
require('module').globalPaths.push(deps);
process.env.NODE_PATH = deps;
require('module').Module._initPaths();

const work = path.join(os.tmpdir(), 'media-utils-tests', 'smoke');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'project', 'assets'), { recursive: true });
const samples = process.env.MEDIA_UTILS_SAMPLES || 'E:\\Workspace\\cocos\\MediaUtils\\assets';
const files = {};
for (const f of fs.readdirSync(samples)) {
    if (!/\.(png|jpe?g|mp3)$/i.test(f)) continue;
    const ext = path.extname(f).toLowerCase();
    const name = { '.png': 'sample.png', '.jpg': 'sample.jpg', '.jpeg': 'sample.jpg', '.mp3': 'music.mp3' }[ext];
    const target = path.join(work, 'project', 'assets', name);
    fs.copyFileSync(path.join(samples, f), target);
    fs.writeFileSync(target + '.meta', JSON.stringify({ uuid: 'meta-of-' + name }));
    files[name] = target;
}

// ---- a small fake asset-db over <project>/assets (db://assets) ----
const assetsDir = path.join(work, 'project', 'assets');
const dbLog = [];
let uuidSeq = 1;
function toPath(p) {
    if (typeof p !== 'string') return null;
    if (p.startsWith('db://assets')) return path.join(assetsDir, ...p.slice('db://assets'.length).split('/').filter(Boolean));
    return path.resolve(p);
}
function toUrl(p) {
    const rel = path.relative(assetsDir, p);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel ? 'db://assets/' + rel.split(path.sep).join('/') : 'db://assets';
}
const fakeDb = {
    'query-asset-info'(p) {
        const file = toPath(p);
        if (!file || !fs.existsSync(file) || !toUrl(file)) return null;
        let uuid = '';
        try {
            uuid = JSON.parse(fs.readFileSync(file + '.meta', 'utf8')).uuid;
        } catch (e) {
            // folder or no meta
        }
        return { url: toUrl(file), file, uuid, isDirectory: fs.statSync(file).isDirectory() };
    },
    'query-url'(p) {
        const file = toPath(p);
        return file && fs.existsSync(file) ? toUrl(file) : null;
    },
    'query-path'(url) {
        return toPath(url);
    },
    'refresh-asset'(url) {
        dbLog.push(['refresh', url]);
    },
    'move-asset'(from, to) {
        dbLog.push(['move', from, to]);
        const a = toPath(from);
        const b = toPath(to);
        fs.renameSync(a, b);
        if (fs.existsSync(a + '.meta')) fs.renameSync(a + '.meta', b + '.meta');
        return fakeDb['query-asset-info'](b);
    },
    'import-asset'(src, url) {
        dbLog.push(['import', url]);
        const b = toPath(url);
        fs.copyFileSync(src, b);
        fs.writeFileSync(b + '.meta', JSON.stringify({ uuid: 'imported-' + uuidSeq++ }));
        return fakeDb['query-asset-info'](b);
    },
    'generate-available-url'(url) {
        let p = toPath(url);
        const ext = path.extname(p);
        const stem = p.slice(0, -ext.length);
        for (let i = 1; fs.existsSync(p); i++) p = `${stem}-${String(i).padStart(3, '0')}${ext}`;
        return toUrl(p);
    },
};

// ---- mocked Editor for dist/main.js ----
const broadcasts = [];
global.Editor = {
    Project: { path: path.join(work, 'project') },
    Message: {
        request: async (target, msg, ...args) => {
            if (target === 'asset-db' && fakeDb[msg]) return fakeDb[msg](...args);
            throw new Error(`unexpected ${target}:${msg}`);
        },
        broadcast: (name, ...args) => broadcasts.push([name, args]),
        send: () => undefined,
    },
    Selection: { getSelected: () => [], clear: () => undefined, select: () => undefined },
    Panel: { open: async () => undefined },
    Dialog: { select: async () => ({ canceled: true, filePaths: [] }) },
};
const main = require(path.join(root, 'dist', 'main.js'));
const methodOf = (msg) => {
    const pkg = require(path.join(root, 'package.json'));
    const m = pkg.contributions.messages[msg];
    if (!m) throw new Error('No message ' + msg);
    return main.methods[m.methods[0]];
};

// Binary values cross the HTTP bridge as {__b64}.
function encode(v) {
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') };
    if (Array.isArray(v)) return v.map(encode);
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = encode(v[k]);
        return o;
    }
    return v;
}
function decode(v) {
    if (v && typeof v === 'object' && v.__b64 !== undefined) return Buffer.from(v.__b64, 'base64');
    if (Array.isArray(v)) return v.map(decode);
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = decode(v[k]);
        return o;
    }
    return v;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --color-normal-fill: #383838; --color-normal-contrast: #d2d2d2; --color-normal-border: #191919; --color-focus-fill-important: #2c5d87; }
html, body { margin: 0; height: 100%; background: #383838; font-family: sans-serif; }
#host { position: absolute; inset: 0; }
</style></head><body><div id="host"></div><script>
window.__log = [];
const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
function enc(v) {
  if (v instanceof ArrayBuffer) v = new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return { __b64: bytesToB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = enc(v[k]); return o; }
  return v;
}
function dec(v) {
  if (v && typeof v === 'object' && v.__b64 !== undefined) return b64ToBytes(v.__b64);
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o; }
  return v;
}
window.Editor = {
  Message: {
    request: async (pkg, msg, ...args) => {
      // Like Electron IPC, a Vue proxy must not get here.
      args.forEach((a) => { try { structuredClone(a); } catch (e) { throw new Error('IPC argument could not be cloned: ' + msg); } });
      const r = await fetch('/ipc', { method: 'POST', body: JSON.stringify({ msg, args: enc(args) }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      return dec(j.result);
    },
    send: () => undefined, broadcast: () => undefined,
  },
  Panel: { define: (o) => o },
};
window.mountPanel = async (name) => {
  window.module = { exports: {} };
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/dist/panels/' + name + '.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const def = window.module.exports;
  const host = document.getElementById('host');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<style>' + def.style + '</style>' + def.template;
  const ctx = { $: {} };
  for (const k of Object.keys(def.$)) ctx.$[k] = shadow.querySelector(def.$[k]);
  for (const k of Object.keys(def.methods || {})) ctx[k] = def.methods[k].bind(ctx);
  def.ready.call(ctx);
  window.panel = ctx;
  window.vm = () => ctx.$.app._vnode.component.proxy;
  return true;
};
window.addEventListener('error', (e) => window.__log.push('error: ' + e.message));
</script></body></html>`;

const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/' || req.url === '/index.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            return res.end(PAGE);
        }
        if (req.url.startsWith('/dist/')) {
            const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
            res.writeHead(200, { 'content-type': 'text/javascript' });
            return res.end(fs.readFileSync(file));
        }
        if (req.url === '/ipc') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const { msg, args } = JSON.parse(body);
            let out;
            try {
                out = { result: encode(await methodOf(msg)(...decode(args))) };
            } catch (e) {
                out = { error: e && e.message ? e.message : String(e) };
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify(out));
        }
        res.writeHead(404);
        res.end();
    } catch (e) {
        res.writeHead(500);
        res.end(String(e));
    }
});

// ---- minimal CDP client ----
async function cdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => {
        ws.onopen = r;
        ws.onerror = j;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            if (m.error) p.reject(new Error(m.error.message));
            else p.resolve(m.result);
        }
    };
    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const i = ++id;
            pending.set(i, { resolve, reject });
            ws.send(JSON.stringify({ id: i, method, params }));
        });
    return {
        send,
        async eval(expr) {
            const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
            if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
            return r.result.value;
        },
        async shot(file) {
            const r = await send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        },
        close: () => ws.close(),
    };
}

const checks = [];
function check(name, ok, detail) {
    checks.push({ name, ok: !!ok });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ' - ' + detail : ''}`);
}

async function openPage(port, chromePort, panel) {
    const t = await (await fetch(`http://127.0.0.1:${chromePort}/json/new?http://127.0.0.1:${port}/`, { method: 'PUT' })).json();
    const c = await cdp(t.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100; i++) {
        try {
            if (await c.eval("return typeof mountPanel === 'function'")) break;
        } catch (e) {
            // page still loading
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    await c.eval(`return mountPanel(${JSON.stringify(panel)})`);
    return c;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(c, expr, timeout = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        if (await c.eval(`return !!(${expr})`)) return true;
        await wait(150);
    }
    return false;
}

async function imageChecks(c) {
    console.log('# Image Tools');
    await c.eval(`const v = vm(); await v.addPaths(${JSON.stringify([files['sample.png'], files['sample.jpg']])}); return true;`);
    check('two images listed', (await c.eval('return vm().files.length')) === 2);
    check('preview rendered', await waitFor(c, 'vm().preview.result && vm().resultUrl'));
    const src = await c.eval('const f = vm().currentFile; return [f.width, f.height]');
    await c.eval(`const v = vm(); v.o.resize.enabled = true; v.o.resize.mode = 'percent'; v.o.resize.percent = 50; v.o.encode.format = 'webp'; return true;`);
    check('resize + WebP preview', await waitFor(c, `vm().preview.result && vm().preview.result.format === 'webp' && vm().preview.result.width === ${Math.round(src[0] / 2)}`), JSON.stringify(await c.eval('return vm().preview.result')));
    await wait(300);
    await c.shot(path.join(work, 'image-split.png'));
    await c.eval(`const v = vm(); v.toggleCropEdit(); Object.assign(v.o.crop, { x: 0.1, y: 0.1, width: 0.6, height: 0.5 }); return true;`);
    await wait(400);
    await c.shot(path.join(work, 'image-crop.png'));
    await c.eval(`const v = vm(); v.toggleCropEdit(); v.o.crop.enabled = false; return true;`);
    // Save as copy into a folder.
    const outDir = path.join(work, 'project', 'assets', 'out');
    await c.eval(`const v = vm(); v.save.mode = 'copy'; v.save.suffix = '-half'; v.save.folder = ${JSON.stringify(outDir)}; await v.apply(true); return true;`);
    const outs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => !f.endsWith('.meta')) : [];
    check('copies went through asset-db import-asset (with .meta)', dbLog.filter((l) => l[0] === 'import').length === 2 && outs.every((f) => fs.existsSync(path.join(outDir, f + '.meta'))));
    check('batch copy wrote 2 WebP files (same stem gets -1)', outs.length === 2 && outs.every((f) => /-half(-1)?\.webp$/.test(f)), outs.join(', '));
    check('batch progress complete', (await c.eval('return vm().batch.done')) === 2);
    // Overwrite in place (same format) with a backup, then restore.
    const before = fs.readFileSync(files['sample.png']);
    await c.eval(`const v = vm(); v.ask = async () => true; v.o.encode.format = 'keep'; v.o.resize.percent = 25; v.save.mode = 'overwrite'; await v.apply(false); return true;`);
    const after = fs.readFileSync(files['sample.png']);
    check('overwrite kept the path and the .meta', fs.existsSync(files['sample.png']) && !after.equals(before) && fs.readFileSync(files['sample.png'] + '.meta', 'utf8').includes('meta-of-sample.png'));
    check('overwrite refreshed the asset', dbLog.some((l) => l[0] === 'refresh' && l[1] === 'db://assets/sample.png'));
    check('backup recorded', !!(await c.eval('await vm().refreshBackup(); return vm().backup.last')));
    await c.eval(`const v = vm(); await v.restoreLast(); return true;`);
    check('restore last brought the original back', fs.readFileSync(files['sample.png']).equals(before));
    const errors = await c.eval('return window.__log');
    check('no page errors', !errors.length, errors.join(' | '));
}

async function audioChecks(c) {
    console.log('# Audio Editor');
    await c.eval(`await vm().openPath(${JSON.stringify(files['music.mp3'])}); return true;`);
    const info = await c.eval('return Object.assign({}, vm().info)');
    check('MP3 decoded at its own rate', info.length > 0 && info.sampleRate > 0, JSON.stringify(info));
    await wait(400);
    await c.shot(path.join(work, 'audio-open.png'));
    const n = info.length;
    await c.eval(`const v = vm(); v.setSelection(${Math.round(n * 0.25)}, ${Math.round(n * 0.5)}); v.cut(); return true;`);
    check('cut shortened the file', (await c.eval('return vm().info.length')) === n - (Math.round(n * 0.5) - Math.round(n * 0.25)));
    await c.eval('vm().undo(); return true;');
    check('undo restored the length', (await c.eval('return vm().info.length')) === n);
    await c.eval(`const v = vm(); v.setSelection(0, ${Math.round(n * 0.1)}); v.effectId = 'normalize'; v.params.normalize.peakDb = -3; await v.applyEffect(); return true;`);
    const peak = await c.eval('return vm().peak');
    check('normalize (worker) reached -3 dB', Math.abs(20 * Math.log10(peak) + 3) < 0.05, (20 * Math.log10(peak)).toFixed(3) + ' dB');
    check('effect ran in a worker', await c.eval('return vm()._engine.usesWorker'));
    await c.eval(`const v = vm(); v.effectId = 'pitch'; v.params.pitch.semitones = 3; await v.applyEffect(); return true;`);
    check('pitch shift kept the selection length', (await c.eval('return vm().sel.end - vm().sel.start')) === Math.round(n * 0.1));
    await c.eval(`const v = vm(); v.addMarker(); v.setSelection(1000, 50000); v.setLoopFromSelection(); v.zoomSelection(); return true;`);
    await wait(400);
    await c.shot(path.join(work, 'audio-zoom.png'));
    // Export OGG and MP3 copies, then WAV overwrite of a copy.
    await c.eval(`const v = vm(); v.ex.format = 'ogg'; v.ex.oggQuality = 3; v.save.mode = 'copy'; v.save.suffix = '-edit'; v.save.folder = null; await v.exportFile(); return true;`);
    const ogg = path.join(path.dirname(files['music.mp3']), 'music-edit.ogg');
    check('OGG copy exported', fs.existsSync(ogg) && fs.readFileSync(ogg).toString('ascii', 0, 4) === 'OggS', fs.existsSync(ogg) ? fs.statSync(ogg).size + ' B' : 'missing');
    await c.eval(`const v = vm(); v.ex.format = 'mp3'; v.ex.mp3Bitrate = 96; await v.exportFile(); return true;`);
    const mp3 = path.join(path.dirname(files['music.mp3']), 'music-edit.mp3');
    check('MP3 copy exported', fs.existsSync(mp3) && fs.statSync(mp3).size > 1000);
    await c.eval(`const v = vm(); v.ask = async () => true; v.ex.format = 'wav'; v.save.mode = 'overwrite'; await v.exportFile(); return true;`);
    const wav = path.join(path.dirname(files['music.mp3']), 'music.wav');
    check('overwrite as WAV renamed the file with its .meta', fs.existsSync(wav) && !fs.existsSync(files['music.mp3']) && fs.readFileSync(wav + '.meta', 'utf8').includes('meta-of-music.mp3'));
    check('format change used asset-db move-asset', dbLog.some((l) => l[0] === 'move' && l[1] === 'db://assets/music.mp3' && l[2] === 'db://assets/music.wav'));
    check('document marked saved', !(await c.eval('return vm().dirty')));
    await c.eval(`await vm().openPath(${JSON.stringify(wav)}); return true;`);
    check('WAV reopened with its marker and loop', (await c.eval('return vm().markerList.length')) === 1 && !!(await c.eval('return vm().loopRegion')));
    const errors = await c.eval('return window.__log');
    check('no page errors', !errors.length, errors.join(' | '));
    await c.eval(`vm().setSelection(0, 0); vm().zoomFit(); return true;`);
    await wait(300);
    await c.shot(path.join(work, 'audio-wav.png'));
}

async function main2() {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const chromePort = 9300 + Math.floor(Math.random() * 500);
    const profile = path.join(work, 'chrome-profile');
    const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${chromePort}`, `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
    try {
        let ok = false;
        for (let i = 0; i < 50 && !ok; i++) {
            try {
                await (await fetch(`http://127.0.0.1:${chromePort}/json/version`)).json();
                ok = true;
            } catch (e) {
                await wait(200);
            }
        }
        if (!ok) throw new Error('Chrome did not start.');
        const img = await openPage(port, chromePort, 'image-tools');
        await imageChecks(img);
        img.close();
        const aud = await openPage(port, chromePort, 'audio-editor');
        await audioChecks(aud);
        aud.close();
    } finally {
        proc.kill();
        server.close();
    }
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`  ${checks.length - failed} passed, ${failed} failed. Screenshots: ${work}`);
    // Exit explicitly: keep-alive sockets from Chrome would hold the event loop.
    process.exit(failed ? 1 : 0);
}

main2().catch((e) => {
    console.error(e);
    process.exitCode = 1;
    try {
        server.close();
    } catch (err) {
        // ignore
    }
});
