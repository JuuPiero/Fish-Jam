/**
 * Real-engine test: bundles the Cocos Creator 3.8.6 engine TS sources (with the
 * module mocks of the engine's own jest setup) and the unity-style runtime into
 * one Node script and runs it with the real physics backends: Bullet, PhysX
 * (wasm), cannon.js, builtin (3D) and Box2D wasm, builtin (2D).
 * jsdom provides the browser globals.
 *
 *   npm run test:engine                   everything
 *   npm run test:engine -- physics3d      one section (physics3d | physics2d | engine)
 *   LOOSE=1 BABEL_DIR=<node_modules with @babel/*> npm run test:engine
 *       compiles assets/ and tests/engine/fixtures with Babel the way Cocos web
 *       builds do (preset-env loose, IE 11 target: generators via regenerator, for-of,
 *       arrows...; classes stay native because the test engine itself is ES2020)
 *   COCOS_ENGINE=<path to resources/3d/engine> overrides the engine location.
 *
 * Every assets/ and fixtures/ module runs inside an _RF.push/_RF.pop frame
 * named after its file, as the editor's compiler emits.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const E = (process.env.COCOS_ENGINE || 'D:/App/cocos/editors/Creator/3.8.6/resources/resources/3d/engine').replace(/\\/g, '/');
const EXT = path.join(__dirname, '..', '..');
const here = __dirname;
const ts = require('typescript');
const LOOSE = !!process.env.LOOSE;
const BABEL_DIR = process.env.BABEL_DIR || '';

if (!fs.existsSync(path.join(E, 'cocos', 'physics'))) {
    console.log('Cocos engine sources not found at ' + E + ' (set COCOS_ENGINE). Skipped.');
    process.exit(0);
}

let babel = null;
if (LOOSE) {
    if (!BABEL_DIR) {
        console.error('LOOSE=1 needs BABEL_DIR (a node_modules folder with @babel/core, preset-env, preset-typescript, plugin-proposal-decorators, plugin-proposal-class-properties).');
        process.exit(1);
    }
    babel = require(path.join(BABEL_DIR, '@babel/core'));
}

const pal = {
    'pal/audio': E + '/pal/audio/web/player.ts',
    'pal/minigame': E + '/pal/minigame/non-minigame.ts',
    'pal/system-info': E + '/pal/system-info/web/system-info.ts',
    'pal/env': E + '/pal/env/web/env.ts',
    'pal/pacer': E + '/pal/pacer/pacer-web.ts',
    'pal/screen-adapter': E + '/pal/screen-adapter/web/screen-adapter.ts',
    'pal/input': E + '/pal/input/web/index.ts',
    'pal/wasm': here + '/pal-wasm.ts',
    'internal:constants': here + '/constants.ts',
    'cc.decorator': E + '/cocos/core/data/decorators/index.ts',
    cc: here + '/cc-shim.ts',
    'cc/env': here + '/cc-env.ts',
};

const ours = [path.join(EXT, 'assets').replace(/\\/g, '/') + '/', path.join(here, 'fixtures').replace(/\\/g, '/') + '/'];
function isOurs(p) {
    const f = p.replace(/\\/g, '/');
    return ours.some((o) => f.startsWith(o));
}
let looseCount = 0;
let uuid = 0;

const plugin = {
    name: 'cocos-aliases',
    setup(b) {
        b.onResolve({ filter: /^(pal\/|internal:|cc\.decorator$|cc$|cc\/env$)/ }, (a) => {
            if (pal[a.path]) return { path: path.resolve(pal[a.path]) };
            if (a.path === 'internal:native') return { path: 'internal:native', namespace: 'stub' };
            return undefined;
        });
        b.onResolve({ filter: /^engine:\// }, (a) => {
            const rel = a.path.slice('engine:/'.length);
            const base = path.resolve(E, rel);
            for (const ext of ['', '.ts', '/index.ts']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return { path: base + ext };
            return { path: base + '.ts' };
        });
        b.onResolve({ filter: /^external:/ }, (a) => {
            const rel = a.path.slice('external:'.length);
            if (/\.wasm$/.test(rel) || /\.mem$/.test(rel)) return { path: a.path, namespace: 'wasm-url' };
            return { path: path.resolve(E, 'native/external', rel) };
        });
        b.onLoad({ filter: /\.ts$/ }, (a) => {
            let src = fs.readFileSync(a.path, 'utf8');
            if (/[\\/]native-2d\.ts$/.test(a.path)) {
                // declarations of JSB classes only: give the names a value for the web build
                const names = [];
                src.replace(/export declare (?:class|const|function) (\w+)/g, (m, n) => names.push(n));
                return { contents: names.map((n) => 'export const ' + n + ' = undefined;').join('\n'), loader: 'js' };
            }
            const mine = isOurs(a.path);
            if (mine) {
                // the editor compiler's requiring frame around each project script
                const name = path.basename(a.path, '.ts');
                src = "import { cclegacy as __rfcc } from 'cc';\n__rfcc._RF.push({}, 'test-uuid-" + ++uuid + "', " + JSON.stringify(name) + ', undefined);\n' + src + '\n__rfcc._RF.pop();\n';
            }
            if (mine && babel) {
                looseCount++;
                const out = babel.transformSync(src, {
                    filename: a.path,
                    babelrc: false,
                    configFile: false,
                    presets: [
                        [path.join(BABEL_DIR, '@babel/preset-typescript'), { allowDeclareFields: false, onlyRemoveTypeImports: false }],
                        // classes (and the super(...args) spread of implicit constructors) stay native here only because the
                        // test engine is ES2020 and an ES5 class cannot extend a native one;
                        // everything else is lowered as in a web build: generators (regenerator), spread, for-of, arrows...
                        [path.join(BABEL_DIR, '@babel/preset-env'), { loose: true, targets: 'ie 11', modules: false, exclude: ['@babel/plugin-transform-classes', '@babel/plugin-transform-spread'] }],
                    ],
                    plugins: [
                        [path.join(BABEL_DIR, '@babel/plugin-proposal-decorators'), { legacy: true }],
                        [path.join(BABEL_DIR, '@babel/plugin-proposal-class-properties'), { loose: true }],
                    ],
                });
                if (/function\*|=>/.test(out.code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'|"[^"\n]*"/g, ''))) {
                    console.log('[loose] note: generator or arrow syntax left in ' + path.basename(a.path));
                }
                return { contents: out.code, loader: 'js', resolveDir: path.dirname(a.path) };
            }
            const r = ts.transpileModule(src, {
                fileName: a.path,
                compilerOptions: {
                    target: ts.ScriptTarget.ES2020,
                    module: ts.ModuleKind.ESNext,
                    experimentalDecorators: true,
                    useDefineForClassFields: false,
                    preserveConstEnums: true,
                    isolatedModules: false,
                    sourceMap: false,
                    inlineSourceMap: true,
                    inlineSources: true,
                },
            });
            return { contents: r.outputText, loader: 'js', resolveDir: path.dirname(a.path) };
        });
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = { __esModule: true, default: {} };', loader: 'js' }));
        b.onLoad({ filter: /.*/, namespace: 'wasm-url' }, (a) => ({ contents: 'export default ' + JSON.stringify(a.path) + ';', loader: 'js' }));
    },
};

const out = path.join(here, 'out', LOOSE ? 'engine-loose.js' : 'engine.js');
esbuild
    .build({
        entryPoints: [path.join(here, 'entry.ts')],
        outfile: out,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'error',
        plugins: [plugin],
        external: ['jsdom', 'canvas'],
        nodePaths: [E + '/node_modules', path.join(EXT, 'node_modules')].concat(BABEL_DIR ? [BABEL_DIR] : []),
        define: { CC_DEV: 'true', CC_TEST: 'true', CC_PHYSICS_BUILTIN: 'true', __ENGINE_ROOT__: JSON.stringify(E) },
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false, target: 'es2020' } },
        loader: { '.wasm': 'file' },
    })
    .then(() => {
        if (LOOSE) console.log('[loose] Babel (loose, ie 11) compiled ' + looseCount + ' assets/ + fixtures/ files');
        const r = spawnSync(process.execPath, ['--enable-source-maps', '--stack-size=4000', out].concat(process.argv.slice(2)), { stdio: 'inherit' });
        process.exitCode = r.status;
    })
    .catch((e) => {
        console.error(e.message);
        process.exitCode = 1;
    });
