/**
 * Bundles the extension's editor scripts into dist/ with esbuild.
 *
 *   node scripts/build.js
 *
 * The transpiler itself is a .NET tool (tool/), built with `npm run build:tool` or by the
 * extension on first use. The runtime helpers in assets/ are compiled by Cocos (db://csharp).
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
        'assets-menu': 'source/assets-menu.ts',
        // loaded on demand by "Regenerate Bindings"; typescript comes from node_modules
        bindings: 'source/bindings/generate.ts',
        // TS interop: run in a worker thread when .ts files change (typescript from node_modules too)
        'ts-interop-worker': 'source/bindings/ts-interop-worker.ts',
        'panels/interop': 'source/panels/interop.ts',
    },
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: 'linked',
    external: ['electron', 'typescript'],
    minifySyntax: true,
    logLevel: 'info',
});
