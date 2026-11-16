/**
 * Smoke test of the panel in headless Chrome (or Edge): bundles the real panel app,
 * opens tests/smoke/smoke.html (mocked Editor, 100k lines) over the DevTools protocol,
 * prints the checks and saves a screenshot to tests/out/smoke/shot.png.
 *
 *   node tests/smoke/run.js [path-to-chrome]
 */
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..', '..');
const out = path.join(root, 'tests', 'out', 'smoke');
fs.mkdirSync(out, { recursive: true });

esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: [path.join('tests', 'smoke', 'entry.ts')],
    outfile: path.join(out, 'bundle.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
    alias: { vue: 'vue/dist/vue.esm-bundler.js' },
    define: {
        'process.env.NODE_ENV': '"development"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    logLevel: 'warning',
});

const candidates = [
    process.argv[2],
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
].filter(Boolean);
const chrome = candidates.find((c) => fs.existsSync(c));
if (!chrome) {
    console.log('No Chrome / Edge found: pass its path as the first argument.');
    process.exit(1);
}

const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'console-pro-chrome-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=1040,760', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function finish(code) {
    try {
        proc.kill();
    } catch (e) {
        // gone
    }
    setTimeout(() => {
        try {
            fs.rmSync(profile, { recursive: true, force: true });
        } catch (e) {
            // Chrome still holds files
        }
        process.exit(code);
    }, 500);
}

(async () => {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
        try {
            target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find((x) => x.type === 'page');
        } catch (e) {
            await sleep(200);
        }
    }
    if (!target) throw new Error('Chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    const logs = [];
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) {
            pending.get(m.id)(m);
            pending.delete(m.id);
        } else if (m.method === 'Runtime.exceptionThrown') {
            logs.push('EXCEPTION: ' + JSON.stringify((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
        }
    };
    const send = (method, params = {}) =>
        new Promise((r) => {
            const n = ++id;
            pending.set(n, r);
            ws.send(JSON.stringify({ id: n, method, params }));
        });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'smoke.html')).href });
    const start = Date.now();
    let text = null;
    while (Date.now() - start < 90000) {
        await sleep(400);
        const r = await send('Runtime.evaluate', { expression: "document.getElementById('result') ? document.getElementById('result').textContent : null", returnByValue: true });
        text = r.result && r.result.result ? r.result.result.value : null;
        if (text) break;
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, 'shot.png'), Buffer.from(shot.result.data, 'base64'));
    console.log(text || 'TIMEOUT');
    if (logs.length) console.log('--- page exceptions ---\n' + logs.slice(0, 20).join('\n'));
    ws.close();
    finish(text && / 0 failed$/.test(text) && !logs.length ? 0 : 1);
})().catch((e) => {
    console.log('ERROR', e.message);
    finish(1);
});
