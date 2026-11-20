/**
 * Generates the TS interop stubs of a Cocos project from the command line.
 *
 *   node scripts/ts-interop.js [projectRoot] [--out <dir>] [--exclude <glob>]... [--no-global]
 *
 * --no-global: skip the global extensions folder (%USERPROFILE%/.CocosCreator/extensions).
 *
 * Default project: the one containing this extension. Default output: <project>/temp/csharp.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bundle = path.join(root, 'tests', 'out', 'ts-interop-cli.js');
esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: ['source/bindings/ts-interop-files.ts'],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    external: ['typescript'],
    logLevel: 'warning',
});
const interop = require(bundle);

const args = process.argv.slice(2);
let project = path.join(root, '..', '..');
let out = null;
const exclude = [];
let globalDir = interop.globalExtensionsDir();
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--exclude') exclude.push(args[++i]);
    else if (args[i] === '--no-global') globalDir = null;
    else project = args[i];
}
const gcs = path.join(root, 'tool', 'Cocos.Bindings', 'Cocos.g.cs');
const t0 = Date.now();
if (out) {
    // write somewhere else than the project's temp/
    const mods = interop.collectInteropModules(project, exclude, globalDir);
    const r = interop.generateTsInterop(mods.modules, interop.readCcNames(gcs));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'TsBindings.g.cs'), r.code);
    fs.writeFileSync(path.join(out, 'ts-bindings-report.txt'), [JSON.stringify(r.stats), 'excluded: ' + mods.excluded.length, ''].concat(r.report).join('\n') + '\n');
    console.log(JSON.stringify(Object.assign({ excluded: mods.excluded.length, ms: Date.now() - t0 }, r.stats)));
} else {
    const r = interop.runTsInterop(project, exclude, gcs, undefined, globalDir);
    console.log(JSON.stringify(Object.assign({ excluded: r.excluded, changed: r.changed, ms: Date.now() - t0 }, r.result.stats)) + '\n' + r.output);
}
