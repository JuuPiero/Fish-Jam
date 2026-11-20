/**
 * Bundles the extension into dist/ with esbuild.
 *
 *   node scripts/build.js           one build
 *   node scripts/build.js --watch   rebuild on change
 *
 * The runtime in assets/ is compiled by Cocos (it is mounted as
 * db://line-renderer); the editor scripts bundle the geometry core themselves.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const options = {
    absWorkingDir: root,
    entryPoints: {
        'main': 'source/main.ts',
        'scene': 'source/scene/index.ts',
        'inspector/line-renderer': 'source/inspector/line-renderer.ts',
    },
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: 'linked',
    external: ['cc', 'cc/env', 'electron'],
    define: { 'process.env.NODE_ENV': '"production"' },
    minifySyntax: true,
    logLevel: 'info',
};

fs.rmSync(dist, { recursive: true, force: true });

if (watch) {
    esbuild.context(options).then((ctx) => ctx.watch());
} else {
    esbuild.buildSync(options);
}
