/* Bundles tests/preview/harness.ts into a standalone page (no Cocos needed). */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

esbuild.build({
    entryPoints: [path.join(__dirname, 'harness.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2019',
    outfile: path.join(out, 'harness.js'),
    logLevel: 'warning',
}).then(() => {
    fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Line Renderer preview</title>
<style>
:root { --color-normal-border: #171717; --color-normal-contrast: #ccc; --color-normal-contrast-weaker: #999; --color-warn-fill: #d9a33a; }
html, body { margin: 0; background: #232323; font-family: sans-serif; color: #ccc; font-size: 12px; }
#inspector { width: 380px; margin: 8px; border: 1px solid #111; padding: 6px; }
#result { white-space: pre; font: 12px monospace; padding: 8px; color: #ccc; }
</style>
</head>
<body>
<div id="inspector"></div>
<script src="harness.js"></script>
</body>
</html>
`);
    console.log('wrote', path.join(out, 'preview.html'));
}).catch(() => process.exit(1));
