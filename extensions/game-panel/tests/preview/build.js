/* Bundles tests/preview/harness.ts into a standalone HTML page (no Cocos needed). */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'harness.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2019',
    outfile: path.join(out, 'harness.js'),
    alias: { vue: 'vue/dist/vue.esm-bundler.js' },
    define: {
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'warning',
});

const css = fs.readFileSync(path.join(root, 'static/style/default/index.css'), 'utf8');
const tpl = fs.readFileSync(path.join(root, 'static/template/vue/app.html'), 'utf8');
fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Game panel preview</title>
<style>
html, body { margin: 0; height: 100%; background: #383838; }
body { display: flex; flex-direction: column; }
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>window.__TEMPLATE__ = ${JSON.stringify(tpl).replace(/</g, '\\u003c')};</script>
<script src="harness.js"></script>
</body>
</html>
`);
console.log('wrote', path.join(out, 'preview.html'));

// capture.ts checks (WebGL2 async readback, JPEG encoder).
esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'capture.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2019',
    outfile: path.join(out, 'capture.js'),
    logLevel: 'warning',
});
fs.writeFileSync(path.join(out, 'capture.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Capture checks</title></head><body><script src="capture.js"></script></body></html>\n');
console.log('wrote', path.join(out, 'capture.html'));
