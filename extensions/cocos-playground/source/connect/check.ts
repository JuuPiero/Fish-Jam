import * as fs from 'fs';
import * as path from 'path';
import type { PlayableManifest } from '../analysis/types';
import { buildManifest } from '../export';
import type { CheckIssue, CheckReport } from '../shared';

/*
 * The project check, run before building / packaging: the same scan Export does (decorators, launch
 * scene, prefabs), with what it would only print to the console collected as issues, plus a few
 * checks of the result. Fast — no build, no zip.
 */

/** The scanners' console warnings that mean a field won't reach the dashboard are errors. */
function levelOf(message: string): CheckIssue['level'] {
    if (/^enum .*not a compile-time constant/.test(message)) return 'warning';
    if (/matching it by property name|on more than one class/.test(message)) return 'warning';
    return 'error';
}

/** Runs `work` with console.warn collected instead of printed. */
function collectWarnings<T>(work: () => T): { result: T; warnings: string[] } {
    const warnings: string[] = [];
    const warn0 = console.warn;
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' ').replace(/^\[cocos-playground\]\s*/, ''));
    };
    try {
        return { result: work(), warnings };
    } finally {
        console.warn = warn0;
    }
}

/** The newest script / scene / prefab under assets/, to tell a stale build. */
function newestSource(assetsDir: string): { file: string; mtimeMs: number } | null {
    let newest: { file: string; mtimeMs: number } | null = null;
    const walk = (dir: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(ts|scene|prefab)$/i.test(entry.name)) {
                const mtimeMs = fs.statSync(full).mtimeMs;
                if (!newest || mtimeMs > newest.mtimeMs) newest = { file: full, mtimeMs };
            }
        }
    };
    walk(assetsDir);
    return newest;
}

/**
 * @param webMobileDir the build the manifest is read against (launch scene, native files)
 * @param packaging    true when packaging that build as it is: also warn if it's older than the sources
 */
export function checkProject(projectRoot: string, webMobileDir: string, packaging = false): { report: CheckReport; manifest: PlayableManifest } {
    const assetsDir = path.join(projectRoot, 'assets');
    const issues: CheckIssue[] = [];

    const { result: manifest, warnings } = collectWarnings(() => buildManifest(assetsDir, webMobileDir));
    for (const message of new Set(warnings)) issues.push({ level: levelOf(message), message });
    const fields = manifest.fields.length;

    if (fields === 0) {
        issues.push({ level: 'warning', message: 'No @playGroundField found in the launch scene or the prefabs: the dashboard will have nothing to edit.' });
    }

    const byKey = new Map<string, number>();
    for (const field of manifest.fields) byKey.set(field.key, (byKey.get(field.key) ?? 0) + 1);
    for (const [key, count] of byKey) {
        if (count > 1) {
            issues.push({ level: 'warning', message: `${count} nodes share the field key "${key}" (same node path): the dashboard edits them as one. Rename one of the nodes to edit them separately.` });
        }
    }

    const settings = path.join(webMobileDir, 'src', 'settings.json');
    if (packaging) {
        const index = path.join(webMobileDir, 'index.html');
        if (fs.existsSync(index)) {
            const builtAt = fs.statSync(index).mtimeMs;
            const newest = newestSource(assetsDir);
            if (newest && newest.mtimeMs > builtAt + 2000) {
                issues.push({
                    level: 'warning',
                    message: `The build in ${path.relative(projectRoot, webMobileDir) || webMobileDir} is older than your changes (${path.relative(assetsDir, newest.file).split(path.sep).join('/')} changed after it): the package won't match the editor. Build again.`,
                });
            }
        }
    }
    if (fs.existsSync(path.join(webMobileDir, 'index.html')) && !fs.existsSync(settings)) {
        issues.push({ level: 'warning', message: 'The build has no src/settings.json, so every scene was scanned instead of only the launch scene.' });
    }

    // Errors first; the scan order within each level.
    issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
    return { report: { at: new Date().toISOString(), fields, issues }, manifest };
}

/** Same issues as an earlier check (the user already saw and accepted them). */
export const sameIssues = (a: CheckIssue[], b: CheckIssue[]) =>
    a.length === b.length && a.every((issue, i) => issue.level === b[i].level && issue.message === b[i].message);
