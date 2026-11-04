// Bundles the extension into dist/ with esbuild: the main process (source/main.ts) and the panel
// (source/panels/default/index.ts, Vue 3 bundled in). Bundling means sharing the extension is just
// "copy the folder" (minus source/node_modules), no npm install step required on the receiving end.
//
//   node scripts/build.js           type-check + one build
//   node scripts/build.js --watch   rebuild on change (no type-check)
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
// For the download zip (scripts/pack.js): no source maps (they triple the size).
const release = process.argv.includes('--release');

// Type-check first — esbuild only transpiles, it doesn't type-check, so this is the only place
// type errors would otherwise get caught.
if (!watch) execFileSync('npx', ['tsc', '--noEmit'], { cwd: root, stdio: 'inherit', shell: true });

const options = {
    absWorkingDir: root,
    entryPoints: {
        main: 'source/main.ts',
        'panels/default/index': 'source/panels/default/index.ts',
    },
    outdir: dist,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    sourcemap: release ? false : 'inline',
    external: ['electron'],
    // Vue's CommonJS build includes the template compiler (the panel template is compiled at
    // runtime from static/template/vue/app.html).
    define: { 'process.env.NODE_ENV': '"production"' },
    minifySyntax: true,
    logLevel: 'info',
};

fs.rmSync(dist, { recursive: true, force: true });

if (watch) {
    esbuild.context(options).then((ctx) => ctx.watch());
} else {
    esbuild.buildSync(options);
    console.log('[cocos-playground] bundled dist/main.js and dist/panels/default/index.js');
}
