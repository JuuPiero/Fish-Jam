/**
 * Bundles each tests/*.test.ts with esbuild and runs it with node.
 *
 * Image tests use the sharp that ships with Cocos Creator. Outside Electron,
 * sharp's JS dependencies (semver, detect-libc) live only inside app.asar, so
 * they are extracted once to tests/out/asar-deps and put on NODE_PATH.
 *   COCOS_CREATOR  Cocos install (default D:\App\cocos\editors\Creator\3.8.6)
 *   MEDIA_UTILS_SAMPLES  folder with sample media (default E:\Workspace\cocos\MediaUtils\assets),
 *                        copied to a temp scratch folder before the tests run.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

const creator = process.env.COCOS_CREATOR || 'D:\\App\\cocos\\editors\\Creator\\3.8.6';
const resources = path.join(creator, 'resources');
const env = Object.assign({}, process.env);

function prepareSharp() {
    const unpacked = path.join(resources, 'app.asar.unpacked', 'node_modules', 'sharp');
    const asarFile = path.join(resources, 'app.asar');
    if (!fs.existsSync(unpacked) || !fs.existsSync(asarFile)) {
        console.log(`# Cocos sharp not found under ${creator}: image tests will be skipped.`);
        return;
    }
    const deps = path.join(out, 'asar-deps', 'node_modules');
    const names = ['semver', 'detect-libc', 'color', 'color-string', 'color-convert', 'color-name', 'simple-swizzle', 'is-arrayish', 'lru-cache', 'yallist'];
    const DEPS = new RegExp('^node_modules[\\\\/](' + names.join('|') + ')[\\\\/]');
    if (!fs.existsSync(path.join(deps, '.done'))) {
        const asar = require('@electron/asar');
        const files = asar.listPackage(asarFile);
        for (const f of files) {
            const rel = f.replace(/^[\\/]/, '');
            if (!DEPS.test(rel)) continue;
            let data;
            try {
                data = asar.extractFile(asarFile, rel);
            } catch (e) {
                continue; // a directory
            }
            const target = path.join(out, 'asar-deps', rel);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, data);
        }
        fs.mkdirSync(deps, { recursive: true });
        fs.writeFileSync(path.join(deps, '.done'), '');
    }
    env.MEDIA_UTILS_SHARP = unpacked;
    env.NODE_PATH = deps + (env.NODE_PATH ? path.delimiter + env.NODE_PATH : '');
}

function prepareSamples() {
    const src = process.env.MEDIA_UTILS_SAMPLES || 'E:\\Workspace\\cocos\\MediaUtils\\assets';
    const scratch = path.join(os.tmpdir(), 'media-utils-tests', 'samples');
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.mkdirSync(scratch, { recursive: true });
    if (fs.existsSync(src)) {
        for (const f of fs.readdirSync(src)) {
            if (/\.(png|jpe?g|mp3|ogg|wav)$/i.test(f)) fs.copyFileSync(path.join(src, f), path.join(scratch, f));
        }
    } else {
        console.log(`# Sample folder ${src} not found: sample-file tests will be skipped.`);
    }
    env.MEDIA_UTILS_SCRATCH = scratch;
}

prepareSharp();
prepareSamples();

let failed = false;
const only = process.argv[2];
for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts'))) {
    if (only && !file.includes(only)) continue;
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
    });
    console.log(`\n# ${file}`);
    const r = spawnSync(process.execPath, ['--enable-source-maps', bundle], { stdio: 'inherit', env });
    if (r.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
