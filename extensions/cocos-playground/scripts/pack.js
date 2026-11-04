// Makes the zip teammates download from the dashboard (Settings → Cocos Creator extension download):
// a release build (no source maps) and only what Cocos Creator loads, under a `cocos-playground/`
// folder, so unzipping into a project's `extensions/` puts it in place.
//
//   npm run pack   →   build/cocos-playground-<version>.zip
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

execFileSync('node', [path.join(__dirname, 'build.js'), '--release'], { cwd: root, stdio: 'inherit' });

const INCLUDE = ['package.json', 'dist', 'static', 'i18n', 'runtime', 'README.md', 'README.zh-CN.md'];
const zip = new JSZip();
const top = zip.folder('cocos-playground');

function add(relative) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isDirectory()) {
        for (const name of fs.readdirSync(full)) add(path.join(relative, name));
    } else {
        top.file(relative.split(path.sep).join('/'), fs.readFileSync(full));
    }
}
INCLUDE.forEach(add);

// The shipped package.json: no dev scripts / dependencies (nothing to install).
const shipped = { ...pkg };
delete shipped.scripts;
delete shipped.devDependencies;
top.file('package.json', JSON.stringify(shipped, null, 4));

const outDir = path.join(root, 'build');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `cocos-playground-${pkg.version}.zip`);
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }).then((buffer) => {
    fs.writeFileSync(out, buffer);
    console.log(`[cocos-playground] ${path.relative(root, out)} (${(buffer.length / 1024 / 1024).toFixed(2)} MB): upload it in the dashboard's Settings`);
});
