/**
 * Bundles tests/*.test.ts with esbuild and runs them in Node.
 *
 *   node tests/run.js
 */
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'game-panel-tests-'));
for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts'))) {
    const outfile = path.join(out, file.replace(/\.ts$/, '.js'));
    esbuild.buildSync({ entryPoints: [path.join(__dirname, file)], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node16', logLevel: 'error' });
    require(outfile);
}
