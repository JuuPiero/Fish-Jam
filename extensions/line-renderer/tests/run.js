/**
 * Bundles each tests/*.test.ts with esbuild and runs it with node.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

let failed = false;
for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts'))) {
    const bundle = path.join(out, file.replace(/\.ts$/, '.js'));
    esbuild.buildSync({
        absWorkingDir: root,
        entryPoints: [path.join('tests', file)],
        outfile: bundle,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node16',
        sourcemap: 'inline',
        logLevel: 'warning',
        // The engine is replaced by small stubs (tests/stubs).
        alias: { 'cc': './tests/stubs/cc.ts', 'cc/env': './tests/stubs/cc-env.ts' },
    });
    console.log(`\n# ${file}`);
    const r = spawnSync(process.execPath, ['--enable-source-maps', bundle], { stdio: 'inherit' });
    if (r.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
