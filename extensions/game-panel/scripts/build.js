/**
 * Bundles the extension into dist/ with esbuild (Vue is bundled in, so the
 * extension runs without node_modules).
 *
 *   node scripts/build.js           one build
 *   node scripts/build.js --watch   rebuild on change
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const watch = process.argv.includes('--watch');

const entries = {
    'main': 'source/main.ts',
    'scene': 'source/scene.ts',
};
if (fs.existsSync(path.join(root, 'source/panels/default/app.ts'))) {
    entries['panels/default/index'] = 'source/panels/default/index.ts';
}

const options = {
    absWorkingDir: root,
    entryPoints: entries,
    outdir: path.join(root, 'dist'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node14',
    sourcemap: 'linked',
    external: ['cc', 'cc/env', 'electron'],
    define: { 'process.env.NODE_ENV': '"production"' },
    minifySyntax: true,
    logLevel: 'info',
};

if (watch) {
    esbuild.context(options).then((ctx) => ctx.watch());
} else {
    esbuild.buildSync(options);
}
