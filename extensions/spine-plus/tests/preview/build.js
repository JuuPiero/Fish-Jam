/*
 * Builds tests/preview/out/preview.html: the Spine Preview panel in a plain
 * page with a fake editor bridge and the project's sample exports embedded.
 *
 *   node tests/preview/build.js
 *   (then open out/preview.html, or out/preview.html#interact to run checks)
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, 'out');
const projectAssets = path.join(root, '..', '..', 'assets');
fs.mkdirSync(out, { recursive: true });

const samples = {
    fish: { dir: path.join(projectAssets, 'Fish'), skeleton: 'skeleton.json', atlas: 'skeleton.atlas.txt' },
    x43: { dir: path.join(projectAssets, 'exports_4.3'), skeleton: 'skeleton.json', atlas: 'skeleton.atlas.txt' },
};

const fixtures = {};
for (const [key, s] of Object.entries(samples)) {
    if (!fs.existsSync(path.join(s.dir, s.skeleton))) continue;
    const atlas = fs.readFileSync(path.join(s.dir, s.atlas), 'utf8');
    const pages = {};
    let expect = true;
    for (const raw of atlas.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) expect = true;
        else if (expect) {
            expect = false;
            const p = path.join(s.dir, line);
            if (fs.existsSync(p)) pages[line] = fs.readFileSync(p).toString('base64');
        }
    }
    fixtures[key] = { name: `${key}/${s.skeleton}`, json: fs.readFileSync(path.join(s.dir, s.skeleton), 'utf8'), atlas, pages };
}
fs.writeFileSync(path.join(out, 'fixtures.js'), `window.FIXTURES = ${JSON.stringify(fixtures)};`);

esbuild.build({
    absWorkingDir: root,
    entryPoints: [path.join(__dirname, 'harness.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2019',
    outfile: path.join(out, 'harness.js'),
    alias: { vue: 'vue/dist/vue.esm-bundler.js' },
    // Only the editor bridge (not used here) reads files.
    external: ['fs', 'path'],
    define: {
        'process.env.NODE_ENV': '"production"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    logLevel: 'warning',
}).then(() => {
    const css = fs.readFileSync(path.join(root, 'static', 'style', 'panel.css'), 'utf8');
    fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Spine Preview</title>
<style>
html, body { margin: 0; height: 100%; background: #232323; }
#host { position: relative; width: 900px; height: 620px; }
#result { white-space: pre; font: 12px monospace; padding: 8px; color: #ccc; }
${css}
</style>
</head>
<body>
<div id="host"><div id="app"></div></div>
<script src="fixtures.js"></script>
<script src="harness.js"></script>
</body>
</html>
`);
    console.log('wrote', path.join(out, 'preview.html'));
}).catch(() => process.exit(1));
