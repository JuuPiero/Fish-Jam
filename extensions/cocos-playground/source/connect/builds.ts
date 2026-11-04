import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import type { PlayableManifest } from '../analysis/types';
import type { Builder, CheckIssue, ExportItem, SizeEstimate } from '../shared';

/*
 * The packages in build/cocos-playground-export/ (what Export / Build made). Each `<name>.zip` may
 * have a `<name>.zip.meta.json` beside it: the project check made when it was packaged, and the
 * network sizes estimated for it.
 */

export interface PackageMeta {
    issues?: CheckIssue[];
    estimates?: Partial<Record<Builder, SizeEstimate>>;
}

export const exportDir = (projectRoot: string) => path.join(projectRoot, 'build', 'cocos-playground-export');
const metaFile = (file: string) => `${file}.meta.json`;

export function readMeta(file: string): PackageMeta {
    try {
        return JSON.parse(fs.readFileSync(metaFile(file), 'utf8')) as PackageMeta;
    } catch {
        return {};
    }
}

export function writeMeta(file: string, patch: PackageMeta): void {
    fs.writeFileSync(metaFile(file), JSON.stringify({ ...readMeta(file), ...patch }, null, 2));
}

// Reading a manifest means opening the zip: keep what was read, keyed by file + mtime.
const manifests = new Map<string, PlayableManifest | null>();

/** The package's `playground-manifest.json`, or null if it has none / can't be read. */
export async function readManifest(file: string): Promise<PlayableManifest | null> {
    const key = `${file}|${fs.statSync(file).mtimeMs}`;
    if (manifests.has(key)) return manifests.get(key)!;
    let manifest: PlayableManifest | null = null;
    try {
        const zip = await JSZip.loadAsync(fs.readFileSync(file));
        const parsed = JSON.parse((await zip.file('playground-manifest.json')?.async('string')) ?? 'null');
        manifest = Array.isArray(parsed?.fields) ? parsed : null;
    } catch {
        manifest = null;
    }
    manifests.set(key, manifest);
    return manifest;
}

/** The packages in the project's export folder, newest first. */
export async function listExports(projectRoot: string, limit = 50): Promise<ExportItem[]> {
    const dir = exportDir(projectRoot);
    if (!fs.existsSync(dir)) return [];
    const files = fs
        .readdirSync(dir)
        .filter((name) => name.toLowerCase().endsWith('.zip'))
        .map((name) => {
            const file = path.join(dir, name);
            return { file, name, stat: fs.statSync(file) };
        })
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
        .slice(0, limit);
    return Promise.all(
        files.map(async ({ file, name, stat }) => {
            const meta = readMeta(file);
            return {
                file,
                name,
                bytes: stat.size,
                createdAt: stat.mtime.toISOString(),
                fields: (await readManifest(file))?.fields.length ?? null,
                issues: meta.issues ?? null,
                estimates: meta.estimates ?? {},
            };
        }),
    );
}

/** Only files inside the export folder may be uploaded or deleted from the panel. */
export function requireExport(projectRoot: string, file: string): string {
    const resolved = path.resolve(file);
    if (path.dirname(resolved) !== path.resolve(exportDir(projectRoot)) || !resolved.toLowerCase().endsWith('.zip') || !fs.existsSync(resolved)) {
        throw new Error('That package is no longer in build/cocos-playground-export');
    }
    return resolved;
}

export function deletePackage(file: string): void {
    fs.rmSync(file);
    fs.rmSync(metaFile(file), { force: true });
}
