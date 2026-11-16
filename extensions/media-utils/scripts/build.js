/**
 * Bundles the extension into dist/ with esbuild (Vue, the audio worker and
 * everything else included; nothing is installed or fetched at runtime) and
 * copies the encoder WebAssembly binaries to dist/wasm.
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

/** The worker is bundled first and inlined into the panel as source text. */
function buildWorker() {
    const r = esbuild.buildSync({
        absWorkingDir: root,
        entryPoints: ['source/panels/audio/worker.ts'],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: 'es2020',
        minifySyntax: true,
        minifyWhitespace: true,
        logLevel: 'warning',
    });
    return r.outputFiles[0].text;
}

const workerPlugin = {
    name: 'audio-worker',
    setup(build) {
        build.onResolve({ filter: /^virtual:audio-worker$/ }, () => ({ path: 'audio-worker', namespace: 'virtual' }));
        build.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
            contents: 'export default ' + JSON.stringify(buildWorker()) + ';',
            loader: 'js',
            watchFiles: [path.join(root, 'source', 'panels', 'audio', 'worker.ts')],
        }));
    },
};

const options = {
    absWorkingDir: root,
    entryPoints: {
        'main': 'source/main.ts',
        'assets-menu': 'source/assets-menu.ts',
        'pixel-worker': 'source/main/pixel-worker.ts',
        'panels/image-tools': 'source/panels/image-tools.ts',
        'panels/audio-editor': 'source/panels/audio-editor.ts',
    },
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
    plugins: [workerPlugin],
    minifySyntax: true,
    logLevel: 'info',
};

function copyWasm() {
    const out = path.join(dist, 'wasm');
    fs.mkdirSync(out, { recursive: true });
    // (the package's "exports" map hides package.json from require.resolve)
    const src = path.join(root, 'node_modules', 'wasm-media-encoders');
    for (const f of ['mp3.wasm', 'ogg.wasm']) fs.copyFileSync(path.join(src, 'wasm', f), path.join(out, f));
}

fs.rmSync(dist, { recursive: true, force: true });

if (watch) {
    esbuild.context(options).then((ctx) => {
        copyWasm();
        return ctx.watch();
    });
} else {
    esbuild.build(options).then(copyWasm, (e) => {
        console.error(e);
        process.exitCode = 1;
    });
}
