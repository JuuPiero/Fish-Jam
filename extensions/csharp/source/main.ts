/**
 * C# scripting for Cocos Creator (main process).
 *
 * .cs files under assets/ are compiled with Roslyn by the transpiler tool (tool/bin, a .NET
 * console app run as a long-lived server over stdin/stdout JSON lines) and written as .ts next
 * to them; Cocos then compiles those like any script. This process:
 * - builds the tool once when needed (dotnet build) and keeps the server running;
 * - recompiles when a .cs changes (file watcher + asset-db broadcasts), refreshes the written
 *   .ts assets and prints C# errors in the Console (file(line,col): error CSxxxx: ...);
 * - moves / deletes the generated .ts with its .cs (move-asset keeps the .ts uuid, so scenes
 *   keep their components);
 * - writes CocosGame.csproj for IntelliSense, regenerates the bindings from cc.d.ts;
 * - TS interop: keeps temp/csharp/TsBindings.g.cs (C# stubs of the project's and extensions'
 *   exported TypeScript) up to date when .ts files change, then recompiles the C#.
 */
import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { EXCLUDE_KEY, GENERATED_FROM_CS, interopRoots, isExcluded, isInteropTsUrl, normalizeExclude } from './shared/interop-paths';
import {
    classNameFromFile,
    classTemplate,
    componentTemplate,
    csprojText,
    Diagnostic,
    formatDiagnostic,
    GENERATED_PREFIX,
    isAssetsCs,
    renamedTemplate,
    targetFrameworkFromSdks,
    toDbUrl,
    tsUrlOf,
} from './shared/scripts';

const PKG = 'csharp';
const TAG = '[C#]';
const EXT_DIR = path.join(__dirname, '..');
const TOOL_DIR = path.join(EXT_DIR, 'tool');
const BIN_DIR = path.join(TOOL_DIR, 'bin');
const TOOL_DLL = path.join(BIN_DIR, 'CsTranspiler.dll');

function projectRoot(): string {
    return Editor.Project.path;
}

function dotnet(): string {
    return process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
}

// ------------------------------------------------------------------ tool build
/** Newest write time of the tool's sources (C# and the generated bindings). */
function newestSource(): number {
    let t = 0;
    const visit = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'bin' || e.name === 'obj') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) visit(p);
            else if (/\.(cs|csproj)$/.test(e.name)) t = Math.max(t, fs.statSync(p).mtimeMs);
        }
    };
    visit(TOOL_DIR);
    return t;
}

function toolIsCurrent(): boolean {
    return fs.existsSync(TOOL_DLL) && fs.statSync(TOOL_DLL).mtimeMs >= newestSource();
}

/** dotnet build of the tool (and the bindings), asynchronously. */
function buildTool(): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(TAG + ' Building the C# transpiler (dotnet build)...');
        const p = spawn(dotnet(), ['build', path.join(TOOL_DIR, 'CsTranspiler', 'CsTranspiler.csproj'), '-c', 'Release', '-o', BIN_DIR, '-v', 'q', '-nologo'], { cwd: TOOL_DIR, windowsHide: true });
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (out += d));
        p.on('error', (e) => {
            console.error(TAG + ' Could not run dotnet. Install the .NET SDK 9 or newer (https://dotnet.microsoft.com) and restart Creator. ' + e.message);
            resolve(false);
        });
        p.on('close', (code) => {
            if (code === 0) {
                console.log(TAG + ' Transpiler built.');
                resolve(true);
            } else {
                console.error(TAG + ' dotnet build failed:\n' + out.split('\n').filter((l) => /error/i.test(l)).slice(0, 20).join('\n'));
                resolve(false);
            }
        });
    });
}

// ------------------------------------------------------------------ server
class ToolServer {
    private proc: ChildProcess | null = null;
    private buf = '';
    private nextId = 1;
    private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>();
    private ready: Promise<void> | null = null;

    start(): Promise<void> {
        if (this.ready) return this.ready;
        this.ready = new Promise<void>((resolve, reject) => {
            const p = spawn(dotnet(), [TOOL_DLL, 'server'], { cwd: BIN_DIR, windowsHide: true });
            this.proc = p;
            let started = false;
            p.stdout!.setEncoding('utf8');
            p.stdout!.on('data', (chunk: string) => {
                this.buf += chunk;
                let i: number;
                while ((i = this.buf.indexOf('\n')) >= 0) {
                    const line = this.buf.slice(0, i).trim();
                    this.buf = this.buf.slice(i + 1);
                    if (!line) continue;
                    let msg: any;
                    try {
                        msg = JSON.parse(line);
                    } catch (e) {
                        continue;
                    }
                    if (msg.event === 'ready') {
                        started = true;
                        resolve();
                        continue;
                    }
                    const w = this.pending.get(msg.id);
                    if (!w) continue;
                    this.pending.delete(msg.id);
                    clearTimeout(w.timer);
                    if (msg.ok) w.resolve(msg);
                    else w.reject(new Error(msg.error || 'transpiler error'));
                }
            });
            p.stderr!.on('data', (d) => console.warn(TAG + ' ' + String(d).trim()));
            p.on('error', (e) => {
                if (!started) reject(e);
            });
            p.on('close', () => {
                this.proc = null;
                this.ready = null;
                for (const [, w] of this.pending) {
                    clearTimeout(w.timer);
                    w.reject(new Error('the transpiler stopped'));
                }
                this.pending.clear();
                if (!started) reject(new Error('the transpiler did not start'));
            });
        });
        return this.ready;
    }

    async request(cmd: string, payload: Record<string, any> = {}, timeoutMs = 120000): Promise<any> {
        await this.start();
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('the transpiler did not answer in time'));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.proc!.stdin!.write(JSON.stringify(Object.assign({ id, cmd }, payload)) + '\n');
        });
    }

    stop() {
        if (!this.proc) return;
        try {
            this.proc.stdin!.write(JSON.stringify({ cmd: 'exit' }) + '\n');
        } catch (e) {
            // already gone
        }
        const p = this.proc;
        setTimeout(() => {
            try {
                p.kill();
            } catch (e) {
                // gone
            }
        }, 1500);
        this.proc = null;
        this.ready = null;
    }
}

const server = new ToolServer();
let toolOk = false;
let toolPreparing: Promise<boolean> | null = null;

function prepareTool(): Promise<boolean> {
    if (toolOk) return Promise.resolve(true);
    if (!toolPreparing)
        toolPreparing = (async () => {
            if (!toolIsCurrent() && !(await buildTool())) return false;
            try {
                await server.start();
                toolOk = true;
                return true;
            } catch (e: any) {
                console.error(TAG + ' The transpiler did not start: ' + (e && e.message));
                return false;
            } finally {
                toolPreparing = null;
            }
        })();
    return toolPreparing;
}

// ------------------------------------------------------------------ compiling
let compiling = false;
let dirty = false;
let timer: any = null;
/** Moves being handled: a compile now would write the moved script's .ts under a new uuid. */
let moving = 0;
let lastReport = '';
let lastResult: any = null;

function scheduleCompile(delay = 150) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        compileNow();
    }, delay);
}

function hasCsFiles(dir: string): boolean {
    if (!fs.existsSync(dir)) return false;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory() ? hasCsFiles(p) : /\.cs$/i.test(e.name)) return true;
    }
    return false;
}

async function compileNow(force = false): Promise<any> {
    if (compiling || moving > 0) {
        dirty = true;
        if (!compiling) scheduleCompile(200);
        return null;
    }
    const root = projectRoot();
    if (!force && !hasCsFiles(path.join(root, 'assets'))) return null;
    compiling = true;
    try {
        if (!(await prepareTool())) return null;
        // the first compile of a session waits for the TS interop stubs (TS types used from C#)
        if (!interopDone) await runInterop(false, false);
        const r = await server.request('compile', { root, write: true });
        lastResult = r;
        await afterCompile(r, force);
        return r;
    } catch (e: any) {
        console.error(TAG + ' ' + (e && e.message));
        return null;
    } finally {
        compiling = false;
        if (dirty) {
            dirty = false;
            scheduleCompile(50);
        }
    }
}

async function afterCompile(r: any, force: boolean) {
    const root = projectRoot();
    // the Console shows each set of messages once
    const diags: Diagnostic[] = r.diagnostics || [];
    const report = diags.map(formatDiagnostic).join('\n');
    if (report !== lastReport || force) {
        for (const d of diags) {
            const text = TAG + ' ' + formatDiagnostic(d);
            if (d.severity === 'error') console.error(text);
            else if (d.severity === 'warning') console.warn(text);
            else console.log(text); // hints, e.g. "[ccclass] is no longer needed"
        }
        if (!diags.length && lastReport) console.log(TAG + ' No errors.');
        lastReport = report;
    }
    if (force) console.log(TAG + ` ${r.files} file(s): ${r.written.length} written, ${r.unchanged} unchanged, ${r.errors} error(s), ${r.ms} ms.`);
    // let Cocos import what changed
    for (const abs of r.written as string[]) {
        const url = toDbUrl(root, abs);
        if (url) await Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});
    }
    // generated scripts whose .cs is gone (moved or deleted outside the editor)
    for (const abs of r.orphans as string[]) {
        const url = toDbUrl(root, abs);
        if (url && isGenerated(abs)) await Editor.Message.request('asset-db', 'delete-asset', url).catch(() => {});
    }
}

function isGenerated(absTs: string): boolean {
    try {
        const fd = fs.openSync(absTs, 'r');
        const b = Buffer.alloc(GENERATED_PREFIX.length);
        fs.readSync(fd, b, 0, b.length, 0);
        fs.closeSync(fd);
        return b.toString('utf8') === GENERATED_PREFIX;
    } catch (e) {
        return false;
    }
}

// ------------------------------------------------------------------ asset events
/** uuid -> url of the .cs assets, to tell moves and renames. */
const csUrls: Record<string, string> = {};

async function indexCsAssets() {
    try {
        const list: any[] = (await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.cs' })) || [];
        for (const a of list) if (isAssetsCs(a.url)) csUrls[a.uuid] = a.url;
    } catch (e) {
        // the db is not ready yet
    }
}

async function onCsMoved(uuid: string, oldUrl: string, newUrl: string) {
    const root = projectRoot();
    const oldTs = tsUrlOf(oldUrl);
    const newTs = tsUrlOf(newUrl);
    const oldTsAbs = await Editor.Message.request('asset-db', 'query-path', oldTs).catch(() => null);
    if (oldTsAbs && fs.existsSync(oldTsAbs as string) && isGenerated(oldTsAbs as string)) {
        // move-asset keeps the .ts uuid: components in scenes and prefabs stay attached
        await Editor.Message.request('asset-db', 'move-asset', oldTs, newTs).catch((e: any) => console.warn(TAG + ' Could not move ' + oldTs + ': ' + e));
    }
    // a script renamed before being edited: its class follows the file name
    const newAbs = (await Editor.Message.request('asset-db', 'query-path', newUrl).catch(() => null)) as string | null;
    if (newAbs && fs.existsSync(newAbs)) {
        const text = fs.readFileSync(newAbs, 'utf8');
        const renamed = renamedTemplate(text, path.basename(oldUrl), path.basename(newUrl));
        if (renamed) fs.writeFileSync(newAbs, renamed);
    }
    void root;
    void uuid;
}

// ------------------------------------------------------------------ IDE project
function globalUsingsPath(): string {
    return path.join(projectRoot(), 'temp', 'csharp', 'GlobalUsings.g.cs');
}

/** temp/csharp/GlobalUsings.g.cs for the IDE: cc, System, and the TS interop namespace of this project. */
async function writeGlobalUsings() {
    try {
        const u = await server.request('usings', { root: projectRoot() });
        fs.mkdirSync(path.dirname(globalUsingsPath()), { recursive: true });
        if (!fs.existsSync(globalUsingsPath()) || fs.readFileSync(globalUsingsPath(), 'utf8') !== u.text) fs.writeFileSync(globalUsingsPath(), u.text);
    } catch (e: any) {
        console.warn(TAG + ' ' + (e && e.message));
    }
}

async function writeIdeProject(): Promise<string | null> {
    if (!(await prepareTool())) return null;
    const root = projectRoot();
    await writeGlobalUsings();
    let sdks = '';
    try {
        sdks = spawnSync(dotnet(), ['--list-sdks'], { encoding: 'utf8', windowsHide: true }).stdout || '';
    } catch (e) {
        // default framework
    }
    const csproj = path.join(root, 'CocosGame.csproj');
    const text = csprojText({ projectRoot: root, bindingsDll: path.join(BIN_DIR, 'Cocos.Bindings.dll'), globalUsings: globalUsingsPath(), targetFramework: targetFrameworkFromSdks(sdks) });
    if (!fs.existsSync(csproj) || fs.readFileSync(csproj, 'utf8') !== text) fs.writeFileSync(csproj, text);
    return csproj;
}

// ------------------------------------------------------------------ bindings
async function regenerateBindings() {
    const root = projectRoot();
    let dts = path.join(root, 'temp', 'declarations', 'cc.d.ts');
    if (fs.existsSync(dts)) {
        const m = /<reference\s+path="([^"]+)"/.exec(fs.readFileSync(dts, 'utf8'));
        if (m && fs.existsSync(m[1])) dts = m[1];
    }
    if (!fs.existsSync(dts)) {
        console.error(TAG + ' cc.d.ts not found in temp/declarations. Open a script once so Creator writes it, then try again.');
        return;
    }
    console.log(TAG + ' Generating the C# bindings from ' + dts + '...');
    // dist/bindings.js (built next to main.js), loaded only when needed
    const { generateBindings } = require(path.join(__dirname, 'bindings.js'));
    const r = generateBindings(fs.readFileSync(dts, 'utf8'));
    const dir = path.join(TOOL_DIR, 'Cocos.Bindings');
    fs.writeFileSync(path.join(dir, 'Cocos.g.cs'), r.code);
    fs.writeFileSync(path.join(dir, 'bindings-report.txt'), ['Generated from ' + dts, JSON.stringify(r.stats), ''].concat(r.report).join('\n') + '\n');
    console.log(TAG + ' Bindings: ' + JSON.stringify(r.stats));
    server.stop();
    toolOk = false;
    if (await buildTool()) {
        // the TS interop stubs refer to the cc types: regenerate them too
        await runInterop(true);
        await writeIdeProject();
        await compileNow(true);
    }
}

// ------------------------------------------------------------------ TS interop
let interopDone = false;
let interopRunning: Promise<InteropState> | null = null;
let interopAgain = false;
let interopTimer: any = null;
let interopState: InteropState = { summary: 'Not generated yet.', stats: null, excluded: 0, reportPath: '', error: '' };
let interopWarned = false;

interface InteropState {
    summary: string;
    stats: { modules: number; exports: number; bound: number; partial: number; skipped: number; clashes: number; decorators: number; decoratorsPartial: number; decoratorsDuplicate?: number } | null;
    excluded: number;
    reportPath: string;
    error: string;
}

async function readExclude(): Promise<string[]> {
    try {
        const v: any = await Editor.Profile.getProject(PKG, EXCLUDE_KEY.split('.')[0]);
        return normalizeExclude(v && v.exclude);
    } catch (e) {
        return [];
    }
}

async function writeExclude(list: string[]) {
    await Editor.Profile.setProject(PKG, EXCLUDE_KEY.split('.')[0], { exclude: normalizeExclude(list) });
}

/** One run of the generator, in a worker thread (it parses every exported TypeScript file). */
function interopWorker(exclude: string[]): Promise<any> {
    return new Promise((resolve) => {
        let done = false;
        const finish = (v: any) => {
            if (done) return;
            done = true;
            resolve(v);
        };
        try {
            const w = new Worker(path.join(__dirname, 'ts-interop-worker.js'), {
                workerData: { root: projectRoot(), exclude, gcs: path.join(TOOL_DIR, 'Cocos.Bindings', 'Cocos.g.cs') },
            });
            w.on('message', finish);
            w.on('error', (e) => finish({ ok: false, error: String((e && e.message) || e) }));
            w.on('exit', () => finish({ ok: false, error: 'the generator stopped' }));
        } catch (e: any) {
            finish({ ok: false, error: String((e && e.message) || e) });
        }
    });
}

/**
 * Regenerates temp/csharp/TsBindings.g.cs. When it changed, the C# is recompiled and the IDE's
 * global usings refreshed. Prints a one-line summary when asked or when the stubs changed.
 */
function runInterop(verbose: boolean, recompile = true): Promise<InteropState> {
    if (interopRunning) {
        interopAgain = true;
        return interopRunning;
    }
    interopRunning = (async () => {
        const exclude = await readExclude();
        interopExclude = exclude;
        interopDbList = null;
        const r = await interopWorker(exclude);
        interopDone = true;
        if (!r.ok) {
            interopState = { summary: 'TS interop failed: ' + r.error, stats: null, excluded: 0, reportPath: '', error: r.error };
            if (verbose || !interopWarned) {
                const hint = /typescript/i.test(r.error) ? ' (TS interop needs the typescript package: run npm install in extensions/csharp)' : '';
                console.warn(TAG + ' TS interop: ' + r.error + hint);
                interopWarned = true;
            }
            return interopState;
        }
        const s = r.stats;
        const summary = `TS interop: ${s.bound + s.partial} TypeScript export(s) usable from C# (${s.partial} with dynamic parts), ${s.skipped} skipped, ${s.clashes} name clash(es), ${r.excluded} file(s) excluded; ${s.decorators} decorator(s) as C# attributes.`;
        if (verbose || r.changed) console.log(TAG + ' ' + summary + ' Details: temp/csharp/ts-bindings-report.txt');
        interopState = { summary, stats: s, excluded: r.excluded, reportPath: r.reportPath, error: '' };
        if (r.changed && toolOk && recompile) {
            await writeGlobalUsings();
            if (!compiling) scheduleCompile(50);
            else dirty = true;
        }
        return interopState;
    })().finally(() => {
        interopRunning = null;
        if (interopAgain) {
            interopAgain = false;
            scheduleInterop(100);
        }
    });
    return interopRunning;
}

function scheduleInterop(delay = 800) {
    if (interopTimer) clearTimeout(interopTimer);
    interopTimer = setTimeout(() => {
        interopTimer = null;
        // nothing to keep up to date until the project has C# scripts
        if (Object.keys(csUrls).length === 0 && !hasCsFiles(path.join(projectRoot(), 'assets'))) return;
        runInterop(false);
    }, delay);
}

/** A changed .ts the stubs depend on: hand-written (not C# output) and not excluded. */
function interopRelevant(abs: string | null, url: string | null): boolean {
    if (abs && fs.existsSync(abs)) {
        try {
            const fd = fs.openSync(abs, 'r');
            const b = Buffer.alloc(GENERATED_FROM_CS.length);
            fs.readSync(fd, b, 0, b.length, 0);
            fs.closeSync(fd);
            if (b.toString('utf8') === GENERATED_FROM_CS) return false;
        } catch (e) {
            // unreadable now: let the generator decide
        }
    }
    if (url && abs && interopExclude.length && isExcluded(interopExclude, url, path.relative(projectRoot(), abs).replace(/\\/g, '/'))) return false;
    return true;
}

/** The exclude list as last read (for the watchers; the generator reads it fresh). */
let interopExclude: string[] = [];

let interopDbList: string[] | null = null;

function interopDbs(): string[] {
    if (!interopDbList) interopDbList = interopRoots(projectRoot()).map((r) => r.db);
    return interopDbList;
}

async function onTsAsset(info: any) {
    if (!info || !isInteropTsUrl(info.url, interopDbs())) return;
    const abs: string | null = info.file || ((await Editor.Message.request('asset-db', 'query-path', info.url).catch(() => null)) as string | null);
    if (interopRelevant(abs, info.url)) scheduleInterop();
}

// ------------------------------------------------------------------ watcher
let watchers: fs.FSWatcher[] = [];

function watchAssets() {
    const root = projectRoot();
    for (const r of interopRoots(root)) {
        try {
            // edits saved in the IDE; the longer delay lets the asset db report moves first.
            // .cs only in assets/; hand-written .ts anywhere feeds the TS interop stubs
            const isAssets = r.db === 'assets';
            watchers.push(
                fs.watch(r.dir, { recursive: true }, (_ev, file) => {
                    const f = file ? String(file) : '';
                    if (isAssets && /\.cs$/i.test(f)) scheduleCompile(600);
                    else if (/\.ts$/i.test(f) && !/\.d\.ts$/i.test(f)) {
                        const abs = path.join(r.dir, f);
                        if (interopRelevant(abs, 'db://' + r.db + '/' + f.replace(/\\/g, '/'))) scheduleInterop();
                    }
                })
            );
        } catch (e) {
            // recursive watching is not available everywhere: asset-db broadcasts still trigger compiles
        }
    }
}

/**
 * VS Code's executable in its usual install folders (user and system installs, Insiders),
 * so it opens even when `code` is not on the PATH Cocos was started with. Null if absent.
 */
function findVsCode(): string | null {
    const fs = require('fs');
    const env = process.env;
    const candidates: string[] = [];
    if (process.platform === 'win32') {
        const local = env.LOCALAPPDATA || '';
        const pf = env.ProgramFiles || 'C:\\Program Files';
        const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        candidates.push(
            path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
            path.join(pf, 'Microsoft VS Code', 'Code.exe'),
            path.join(pf86, 'Microsoft VS Code', 'Code.exe'),
            path.join(local, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
        );
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', path.join(env.HOME || '', 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'));
    }
    for (let i = 0; i < candidates.length; i++) {
        try {
            if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i];
        } catch (e) {
            // keep looking
        }
    }
    return null;
}

/** Writes a new script from the template, its class named after the file. */
async function createScriptFile(url: string, kind: 'component' | 'class'): Promise<any> {
    const name = classNameFromFile(url.split('/').pop() || (kind === 'class' ? 'NewClass' : 'NewComponent'));
    const content = kind === 'class' ? classTemplate(name) : componentTemplate(name);
    const info: any = await Editor.Message.request('asset-db', 'create-asset', url, content);
    if (info && info.uuid) csUrls[info.uuid] = url;
    scheduleCompile();
    return info;
}

// ------------------------------------------------------------------ messages
export const methods: { [name: string]: (...args: any[]) => any } = {
    async openProject() {
        const csproj = await writeIdeProject();
        if (!csproj) return;
        const root = projectRoot();
        // VS Code when it is installed (C# Dev Kit), else whatever opens .csproj files
        const exe = findVsCode();
        if (exe) {
            spawn(exe, [root], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
            console.log(TAG + ' Opened the project folder in VS Code: ' + root + ' (' + csproj + ')');
            return;
        }
        const code = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['code'], { encoding: 'utf8', windowsHide: true });
        if (code.status === 0) {
            spawn('code', [root], { shell: true, detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else {
            await require('electron').shell.openPath(csproj);
        }
        console.log(TAG + ' ' + csproj);
    },

    async recompileAll() {
        lastReport = '';
        return compileNow(true);
    },

    regenerateBindings() {
        return regenerateBindings();
    },

    // ---- TS interop (the "C# TS Interop" panel and menu)
    openInterop() {
        Editor.Panel.open(PKG + '.interop');
    },

    async interopState() {
        return { exclude: await readExclude(), dbs: interopDbs(), state: interopState };
    },

    async interopSave(exclude: string[]) {
        await writeExclude(Array.isArray(exclude) ? exclude.map(String) : []);
        await runInterop(true);
        return { exclude: await readExclude(), dbs: interopDbs(), state: interopState };
    },

    async interopRegenerate() {
        interopDbList = null;
        await runInterop(true);
        return { exclude: await readExclude(), dbs: interopDbs(), state: interopState };
    },

    async openInteropReport() {
        const p = interopState.reportPath || path.join(projectRoot(), 'temp', 'csharp', 'ts-bindings-report.txt');
        if (fs.existsSync(p)) await require('electron').shell.openPath(p);
        else console.warn(TAG + ' No TS interop report yet: ' + p);
    },

    async openDocs() {
        await require('electron').shell.openPath(path.join(EXT_DIR, 'README.md'));
    },

    /**
     * Create menu in Cocos' Assets panel: NewComponent.cs, selected and put into rename mode
     * right away (the Assets panel's own F2), like Unity. Renamed before it is edited, the
     * class follows the file name.
     */
    async createScript(folderUrl: string, kind: 'component' | 'class' = 'component') {
        const base = kind === 'class' ? 'NewClass' : 'NewComponent';
        const url: string = await Editor.Message.request('asset-db', 'generate-available-url', folderUrl.replace(/\/+$/, '') + '/' + base + '.cs');
        const info = await createScriptFile(url, kind);
        if (info && info.uuid) {
            Editor.Selection.clear('asset');
            Editor.Selection.select('asset', [info.uuid]);
            // after the Assets panel has added and selected the new row
            setTimeout(() => {
                try {
                    Editor.Message.send('assets', 'rename', info.uuid);
                } catch (e) {
                    // no Assets panel open
                }
            }, 300);
        }
        return info;
    },

    /**
     * Name-first creation (the Project browser's placeholder): the file is made at `url`, the
     * name the user typed, and the class is named after it.
     */
    async createScriptAt(url: string, kind: 'component' | 'class' = 'component') {
        if (typeof url !== 'string' || !isAssetsCs(url)) throw new Error('C# scripts must be .cs files in db://assets: ' + url);
        return createScriptFile(url, kind);
    },

    status() {
        return { toolOk, toolDll: TOOL_DLL, compiling, last: lastResult ? { files: lastResult.files, errors: lastResult.errors, ms: lastResult.ms } : null };
    },

    onDbReady() {
        indexCsAssets().then(() => scheduleCompile(300));
    },

    onAssetAdd(uuid: string, info: any) {
        onTsAsset(info);
        if (!info || !isAssetsCs(info.url)) return;
        csUrls[uuid] = info.url;
        scheduleCompile();
    },

    async onAssetChange(uuid: string, info: any) {
        if (!info || !info.url) return;
        onTsAsset(info);
        const old = csUrls[uuid];
        if (isAssetsCs(info.url)) {
            csUrls[uuid] = info.url;
            if (old && old !== info.url) {
                moving++;
                try {
                    await onCsMoved(uuid, old, info.url);
                } finally {
                    moving--;
                }
            }
            scheduleCompile();
        } else if (old) {
            delete csUrls[uuid];
        }
    },

    async onAssetDelete(uuid: string, info: any) {
        const url = (info && info.url) || csUrls[uuid];
        // a deleted hand-written .ts: its exports leave the stubs (a .ts with a .cs is C# output)
        if (isInteropTsUrl(url, interopDbs()) && !Object.values(csUrls).some((u) => tsUrlOf(u) === url)) scheduleInterop();
        if (!isAssetsCs(url)) return;
        delete csUrls[uuid];
        const ts = tsUrlOf(url);
        const abs = (await Editor.Message.request('asset-db', 'query-path', ts).catch(() => null)) as string | null;
        if (abs && fs.existsSync(abs) && isGenerated(abs)) await Editor.Message.request('asset-db', 'delete-asset', ts).catch(() => {});
        scheduleCompile();
    },
};

export async function load() {
    watchAssets();
    // first compile once the asset db answers (also covers scripts edited while Creator was closed)
    setTimeout(async () => {
        await indexCsAssets();
        const root = projectRoot();
        if (hasCsFiles(path.join(root, 'assets'))) {
            // TS interop stubs first: the IDE usings and the compile both read them
            await runInterop(false, false);
            await writeIdeProject();
            await compileNow();
        }
    }, 1500);
}

export function unload() {
    for (const w of watchers) w.close();
    watchers = [];
    if (timer) clearTimeout(timer);
    if (interopTimer) clearTimeout(interopTimer);
    server.stop();
}
