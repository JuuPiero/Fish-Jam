/**
 * Bundles the extension into dist/ with esbuild.
 *
 *   node scripts/build.js           one build
 *   node scripts/build.js --watch   rebuild on change
 */
const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');
const watch = process.argv.includes('--watch');

const options = {
    absWorkingDir: root,
    entryPoints: {
        'main': 'source/main.ts',
        'scene': 'source/scene.ts',
        'inspector/component': 'source/inspector/component.ts',
    },
    outdir: path.join(root, 'dist'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node14',
    sourcemap: 'linked',
    external: ['cc', 'cc/env', 'electron'],
    logLevel: 'info',
};

if (watch) {
    esbuild.context(options).then((ctx) => ctx.watch());
} else {
    esbuild.buildSync(options);
}
