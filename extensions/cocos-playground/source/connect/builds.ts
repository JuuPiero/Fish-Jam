import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

/** One playable package in build/cocos-playground-export/ (what Export / Build made). */
export interface ExportedBuild {
    file: string;
    name: string;
    bytes: number;
    createdAt: string;
    /** `@playGroundField` placements in its manifest; null if it can't be read. */
    fields: number | null;
}

export const exportDir = (projectRoot: string) => path.join(projectRoot, 'build', 'cocos-playground-export');

// Reading a manifest means opening the zip: keep what was read, keyed by file + mtime.
const fieldCounts = new Map<string, number | null>();

async function fieldCountOf(file: string, mtimeMs: number): Promise<number | null> {
    const key = `${file}|${mtimeMs}`;
    if (fieldCounts.has(key)) return fieldCounts.get(key)!;
    let count: number | null = null;
    try {
        const zip = await JSZip.loadAsync(fs.readFileSync(file));
        const manifest = JSON.parse((await zip.file('playground-manifest.json')?.async('string')) ?? 'null');
        count = Array.isArray(manifest?.fields) ? manifest.fields.length : null;
    } catch {
        count = null;
    }
    fieldCounts.set(key, count);
    return count;
}

/** The packages in the project's export folder, newest first. */
export async function listExports(projectRoot: string, limit = 50): Promise<ExportedBuild[]> {
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
        files.map(async ({ file, name, stat }) => ({
            file,
            name,
            bytes: stat.size,
            createdAt: stat.mtime.toISOString(),
            fields: await fieldCountOf(file, stat.mtimeMs),
        })),
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
