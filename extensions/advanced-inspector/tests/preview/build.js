/**
 * Bundles the browser harness (tests/preview/harness.ts -> harness.js).
 * Open index.html#interact to run the checks, #shot / #shot2 to look at it.
 */
const esbuild = require('esbuild');
const path = require('path');

const ext = path.join(__dirname, '..', '..');
const map = {
    'cc': path.join(ext, 'tests', 'stubs', 'cc.ts'),
    'cc/env': path.join(ext, 'tests', 'stubs', 'cc-env.ts'),
    'db://advanced-inspector/AdvancedInspector': path.join(ext, 'assets', 'AdvancedInspector.ts'),
};

esbuild.build({
    entryPoints: [path.join(__dirname, 'harness.ts')],
    outfile: path.join(__dirname, 'harness.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome100',
    logLevel: 'error',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    plugins: [{
        name: 'aliases',
        setup(build) {
            build.onResolve({ filter: /^(cc|cc\/env|db:\/\/advanced-inspector\/AdvancedInspector)$/ }, (args) => ({ path: map[args.path] }));
        },
    }],
}).catch(() => process.exit(1));
