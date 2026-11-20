/**
 * Bundles the extension into dist/ with esbuild.
 *
 *   node scripts/build.js
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: {
        main: 'source/main.ts',
        scene: 'source/scene.ts',
    },
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: 'linked',
    // provided by the editor / the scene process at run time
    external: ['electron', 'cc'],
    minifySyntax: true,
    logLevel: 'info',
});
