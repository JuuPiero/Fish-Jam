/**
 * Regenerates tool/Cocos.Bindings/Cocos.g.cs from cc.d.ts.
 *
 *   node scripts/gen-bindings.js [path/to/cc.d.ts]
 *
 * Default: the project's temp/declarations/cc.d.ts, else the editor's engine declarations.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'tests', 'out', 'gen-bindings.js');
esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: ['source/bindings/generate.ts'],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    external: ['typescript'],
    logLevel: 'warning',
});
const { generateBindings } = require(out);

/** The real cc.d.ts: the project's temp/declarations/cc.d.ts is a `/// <reference path>` to it. */
function findDts() {
    if (process.argv[2]) return process.argv[2];
    const project = path.join(root, '..', '..', 'temp', 'declarations', 'cc.d.ts');
    if (fs.existsSync(project)) {
        const m = /<reference\s+path="([^"]+)"/.exec(fs.readFileSync(project, 'utf8'));
        if (m && fs.existsSync(m[1])) return m[1];
        return project;
    }
    return 'D:/App/cocos/editors/Creator/3.8.6/resources/resources/3d/engine/bin/.declarations/cc.d.ts';
}

const dts = findDts();
const t0 = Date.now();
const r = generateBindings(fs.readFileSync(dts, 'utf8'));
const dir = path.join(root, 'tool', 'Cocos.Bindings');
fs.writeFileSync(path.join(dir, 'Cocos.g.cs'), r.code);
fs.writeFileSync(path.join(dir, 'bindings-report.txt'), ['Generated from ' + dts, JSON.stringify(r.stats), ''].concat(r.report).join('\n') + '\n');
console.log('Bindings from ' + dts + ' in ' + (Date.now() - t0) + ' ms: ' + JSON.stringify(r.stats));
