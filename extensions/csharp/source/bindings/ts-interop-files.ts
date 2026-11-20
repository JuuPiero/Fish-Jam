/**
 * TS interop on disk: finds the TypeScript of a Cocos project (assets/ and the asset dbs its
 * extensions mount), applies the exclude list, writes temp/csharp/TsBindings.g.cs and the report.
 * Built as dist/ts-interop.js, loaded on demand (it needs the TypeScript compiler).
 */
import * as fs from 'fs';
import * as path from 'path';
import { GENERATED_FROM_CS, globalExtensionsDir, InteropRoot, interopRoots, isExcluded } from '../shared/interop-paths';
import { CcNames, generateTsInterop, InteropModule, InteropResult, parseCcNames } from './ts-interop';

export { generateTsInterop, parseCcNames } from './ts-interop';
export { GENERATED_FROM_CS, globalExtensionsDir, interopRoots, isExcluded, globToRegExp } from '../shared/interop-paths';

/** Cocos names from the generated bindings (Cocos.g.cs) and the hand-written attributes next to it (Lang.cs). */
export function readCcNames(cocosGcsPath: string): CcNames {
    let text = fs.readFileSync(cocosGcsPath, 'utf8');
    const lang = path.join(path.dirname(cocosGcsPath), 'Lang.cs');
    if (fs.existsSync(lang)) text += '\n' + fs.readFileSync(lang, 'utf8');
    return parseCcNames(text);
}

export interface InteropFiles {
    modules: InteropModule[];
    excluded: string[];
    roots: InteropRoot[];
}

function listTs(dir: string, out: string[]) {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        return;
    }
    for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) listTs(p, out);
        else if (/\.ts$/i.test(e.name) && !/\.d\.ts$/i.test(e.name)) out.push(p);
    }
}

/** `globalDir`: Creator's global extensions folder (default), or null to read only the project. */
export function collectInteropModules(projectRoot: string, exclude: string[], globalDir: string | null = globalExtensionsDir()): InteropFiles {
    const roots = interopRoots(projectRoot, globalDir);
    const modules: InteropModule[] = [];
    const excluded: string[] = [];
    for (const r of roots) {
        const files: string[] = [];
        listTs(r.dir, files);
        for (const abs of files) {
            const rel = path.relative(r.dir, abs).replace(/\\/g, '/');
            const dbUrl = 'db://' + r.db + '/' + rel;
            const projRel = path.relative(projectRoot, abs).replace(/\\/g, '/');
            if (isExcluded(exclude, dbUrl, projRel)) {
                excluded.push(dbUrl);
                continue;
            }
            let text: string;
            try {
                text = fs.readFileSync(abs, 'utf8');
            } catch (e) {
                continue;
            }
            if (text.startsWith(GENERATED_FROM_CS)) continue; // C# output: the .cs is already visible to C#
            modules.push({ id: dbUrl.replace(/\.ts$/i, ''), text });
        }
    }
    return { modules, excluded, roots };
}

export interface InteropRun {
    result: InteropResult;
    excluded: number;
    changed: boolean;
    output: string;
    reportPath: string;
}

/** Generates temp/csharp/TsBindings.g.cs (written only when it changes) and its report. */
export function runTsInterop(projectRoot: string, exclude: string[], cocosGcsPath: string, ccNames?: CcNames, globalDir: string | null = globalExtensionsDir()): InteropRun {
    const cc = ccNames || readCcNames(cocosGcsPath);
    const files = collectInteropModules(projectRoot, exclude, globalDir);
    const result = generateTsInterop(files.modules, cc);
    const dir = path.join(projectRoot, 'temp', 'csharp');
    fs.mkdirSync(dir, { recursive: true });
    const output = path.join(dir, 'TsBindings.g.cs');
    const old = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : null;
    const changed = old !== result.code;
    if (changed) fs.writeFileSync(output, result.code);
    const reportPath = path.join(dir, 'ts-bindings-report.txt');
    const s = result.stats;
    const head = [
        'TS interop: TypeScript exports visible to C# (' + new Date().toISOString() + ')',
        `${s.modules} module(s), ${s.exports} export(s): ${s.bound} bound, ${s.partial} bound with dynamic parts, ${s.skipped} skipped; ${s.clashes} name clash(es); ${files.excluded.length} file(s) excluded; ${s.decorators} decorator(s) as attributes (${s.decoratorsPartial} with parts left out, ${s.decoratorsDuplicate} duplicate(s) of csharp's own attributes not bound)`,
        'Exclude list: ' + (exclude.length ? exclude.join(', ') : '(empty)'),
        '',
    ];
    const excludedLines = files.excluded.length ? ['excluded files:'].concat(files.excluded.map((u) => '  ' + u), ['']) : [];
    fs.writeFileSync(reportPath, head.concat(excludedLines, result.report).join('\n') + '\n');
    return { result, excluded: files.excluded.length, changed, output, reportPath };
}
