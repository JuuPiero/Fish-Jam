/**
 * Bundles the extension into dist/ with esbuild (Vue and the icons included,
 * nothing is fetched at runtime).
 *
 *   node scripts/build.js           one build
 *   node scripts/build.js --watch   rebuild on change
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = {
    'main': 'source/main.ts',
    'panels/project': 'source/panels/project.ts',
};

const options = {
    absWorkingDir: root,
    entryPoints,
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: 'linked',
    external: ['electron'],
    // Templates are compiled at runtime: use the Vue build with the compiler.
    alias: { vue: 'vue/dist/vue.esm-bundler.js' },
    define: {
        'process.env.NODE_ENV': '"production"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    minifySyntax: true,
    logLevel: 'info',
};

fs.rmSync(dist, { recursive: true, force: true });

if (watch) {
    esbuild.context(options).then((ctx) => ctx.watch());
} else {
    esbuild.buildSync(options);
}
