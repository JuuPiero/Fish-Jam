/**
 * Bundles the editor half of the extension into dist/ with esbuild.
 *
 *   node scripts/build.js           one build
 *   node scripts/build.js --watch   rebuild on change
 *
 * The runtime in assets/ is compiled by Cocos (it is mounted as
 * db://unity-style); only the editor script is bundled here.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const options = {
    absWorkingDir: root,
    entryPoints: { main: 'source/main.ts', 'assets-menu': 'source/assets-menu.ts' },
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: 'linked',
    external: ['cc', 'cc/env', 'electron'],
    minifySyntax: true,
    logLevel: 'info',
};

fs.rmSync(dist, { recursive: true, force: true });

if (watch) {
    esbuild.context(options).then((ctx) => ctx.watch());
} else {
    esbuild.buildSync(options);
}
