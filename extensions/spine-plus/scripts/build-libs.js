/**
 * Bundles the official spine-core runtimes (4.2 and 4.3, from npm) into
 * single CommonJS files under assets/lib, where Cocos compiles them with the
 * component scripts.
 *
 *   node scripts/build-libs.js
 *
 * Both versions are shipped because the data formats differ: 4.3 reads
 * constraints from one "constraints" list, 4.2 from separate ik / transform /
 * path / physics lists, so each runtime only understands its own exports.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'lib');
fs.mkdirSync(outDir, { recursive: true });

for (const [pkg, file] of [['spine-core-42', 'spine-core-4.2.js'], ['spine-core-43', 'spine-core-4.3.js']]) {
    const dir = path.join(root, 'node_modules', pkg);
    const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    const license = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8').trim();
    esbuild.buildSync({
        entryPoints: [path.join(dir, 'dist', 'index.js')],
        outfile: path.join(outDir, file),
        bundle: true,
        format: 'cjs',
        platform: 'neutral',
        target: 'es2017',
        minify: true,
        legalComments: 'none',
        banner: { js: `/* @esotericsoftware/spine-core ${version}\n\n${license.replace(/\*\//g, '* /')}\n*/` },
        logLevel: 'warning',
    });
    console.log(`${file}: spine-core ${version}, ${(fs.statSync(path.join(outDir, file)).size / 1024).toFixed(0)} KB`);
}
