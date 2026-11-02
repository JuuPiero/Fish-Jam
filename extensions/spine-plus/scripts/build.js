/**
 * Bundles the extension into dist/ with esbuild (Vue included).
 *
 *   node scripts/build.js           one build
 *   node scripts/build.js --watch   rebuild on change
 *
 * The runtime in assets/ is compiled by Cocos (it is mounted as
 * db://spine-plus); the Preview panel bundles the same spine core and the
 * spine-core runtimes itself.
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
        'assets-menu': 'source/assets-menu.ts',
        'panels/default': 'source/panels/default/index.ts',
        'inspector/skeleton-animation': 'source/inspector/skeleton-animation.ts',
    },
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: 'linked',
    external: ['cc', 'cc/env', 'electron'],
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
