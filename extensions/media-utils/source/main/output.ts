/**
 * Writing results: overwrite in place (keeping the asset's .meta and uuid) or
 * save as a copy (imported through asset-db), plus backups of overwritten
 * files in <project>/temp/media-utils/backup with "Restore Last".
 *
 * Overwrite:
 *  - same extension: the file's bytes are replaced and asset-db refreshes it;
 *    the .meta (uuid, import settings, sub-assets) is untouched.
 *  - new extension (png -> webp, wav -> ogg): asset-db `move-asset` renames the
 *    file together with its .meta (the uuid stays, so references survive), then
 *    the new bytes are written and refreshed.
 * Copy: the bytes go to a temporary file which asset-db `import-asset` copies
 * to a free name (so it gets a .meta and is imported); outside asset-db the
 * file is written directly.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SaveOptions } from '../shared/image/options';

export interface AssetDbApi {
    /** db:// url of an absolute path, or null when it is not inside a mounted asset database. */
    urlOf(file: string): Promise<string | null>;
    refresh(url: string): Promise<void>;
    move(fromUrl: string, toUrl: string): Promise<void>;
    /** Copies an external file into the database at `url`; returns the final url. */
    importFile(file: string, url: string): Promise<string | null>;
    /** A free url next to `url` ("name-1.png"). */
    availableUrl(url: string): Promise<string>;
    /** Absolute path of a db:// url. */
    pathOf(url: string): Promise<string | null>;
}

export interface SaveRequest {
    /** File the result comes from. */
    source: string;
    /** Extension of the result, with the dot (".webp"). */
    ext: string;
    bytes: Uint8Array;
    save: SaveOptions;
    /** Backup session for overwrites (from beginSession). */
    session?: string;
}

export interface SaveResult {
    path: string;
    url: string | null;
    size: number;
    overwritten: boolean;
    renamed: boolean;
    skipped?: boolean;
}

export function stemOf(file: string): string {
    return path.basename(file, path.extname(file));
}

/** Path of a copy: <folder or source dir>/<stem><suffix><ext>, numbered when taken. */
export function planCopyPath(source: string, ext: string, suffix: string, folder: string | null, exists: (p: string) => boolean): string {
    const dir = folder || path.dirname(source);
    const clean = String(suffix || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
    const stem = stemOf(source) + clean;
    let candidate = path.join(dir, stem + ext);
    for (let i = 1; exists(candidate) || samePath(candidate, source); i++) candidate = path.join(dir, `${stem}-${i}${ext}`);
    return candidate;
}

/** Path after an in-place overwrite (the extension may change). */
export function planOverwritePath(source: string, ext: string): string {
    if (path.extname(source).toLowerCase() === ext.toLowerCase()) return source;
    return path.join(path.dirname(source), stemOf(source) + ext);
}

export function samePath(a: string, b: string): boolean {
    const na = path.resolve(a);
    const nb = path.resolve(b);
    return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

// ------------------------------------------------------------------ backups

interface BackupEntry {
    original: string;
    current: string;
    backup: string;
}

interface BackupManifest {
    id: string;
    label: string;
    time: number;
    entries: BackupEntry[];
}

export interface BackupSummary {
    sessions: number;
    last: { id: string; label: string; time: number; files: number } | null;
}

const MAX_SESSIONS = 20;

export class OutputWriter {
    readonly backupRoot: string;
    readonly tempRoot: string;

    constructor(projectPath: string, private db: AssetDbApi | null) {
        this.backupRoot = path.join(projectPath, 'temp', 'media-utils', 'backup');
        this.tempRoot = path.join(projectPath, 'temp', 'media-utils', 'out');
    }

    // ---- sessions ----

    beginSession(label: string): string {
        const id = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-') + '-' + Math.random().toString(36).slice(2, 6);
        const dir = path.join(this.backupRoot, id);
        fs.mkdirSync(dir, { recursive: true });
        this.writeManifest({ id, label, time: Date.now(), entries: [] });
        this.prune();
        return id;
    }

    private manifestPath(id: string): string {
        return path.join(this.backupRoot, id, 'manifest.json');
    }

    private readManifest(id: string): BackupManifest | null {
        try {
            return JSON.parse(fs.readFileSync(this.manifestPath(id), 'utf8'));
        } catch (e) {
            return null;
        }
    }

    private writeManifest(m: BackupManifest): void {
        fs.writeFileSync(this.manifestPath(m.id), JSON.stringify(m, null, 2));
    }

    /** Sessions with at least one file, newest first. */
    sessions(): BackupManifest[] {
        let ids: string[] = [];
        try {
            ids = fs.readdirSync(this.backupRoot);
        } catch (e) {
            return [];
        }
        return ids
            .map((id) => this.readManifest(id))
            .filter((m): m is BackupManifest => !!m && m.entries.length > 0)
            .sort((a, b) => b.time - a.time);
    }

    summary(): BackupSummary {
        const list = this.sessions();
        const last = list[0];
        return { sessions: list.length, last: last ? { id: last.id, label: last.label, time: last.time, files: last.entries.length } : null };
    }

    private prune(): void {
        let ids: string[] = [];
        try {
            ids = fs.readdirSync(this.backupRoot).sort();
        } catch (e) {
            return;
        }
        while (ids.length > MAX_SESSIONS) {
            const id = ids.shift()!;
            fs.rmSync(path.join(this.backupRoot, id), { recursive: true, force: true });
        }
    }

    private backup(session: string, file: string): BackupEntry {
        const m = this.readManifest(session);
        if (!m) throw new Error(`Unknown backup session ${session}.`);
        const name = `${m.entries.length}-${path.basename(file)}`;
        const backup = path.join(this.backupRoot, session, name);
        fs.copyFileSync(file, backup);
        const entry = { original: file, current: file, backup };
        m.entries.push(entry);
        this.writeManifest(m);
        return entry;
    }

    private setCurrent(session: string, original: string, current: string): void {
        const m = this.readManifest(session);
        if (!m) return;
        for (const e of m.entries) if (samePath(e.original, original)) e.current = current;
        this.writeManifest(m);
    }

    /** Restores every file of the newest session and deletes it. Returns the restored paths. */
    async restoreLast(): Promise<{ label: string; files: string[] }> {
        const m = this.sessions()[0];
        if (!m) return { label: '', files: [] };
        const restored: string[] = [];
        for (const e of m.entries.slice().reverse()) {
            if (!samePath(e.current, e.original) && fs.existsSync(e.current)) {
                const fromUrl = this.db ? await this.db.urlOf(e.current) : null;
                const toUrl = this.db ? await this.db.urlOf(e.original) : null;
                if (fromUrl && toUrl) await this.db!.move(fromUrl, toUrl);
                else {
                    fs.renameSync(e.current, e.original);
                    if (fs.existsSync(e.current + '.meta')) fs.renameSync(e.current + '.meta', e.original + '.meta');
                }
            }
            fs.copyFileSync(e.backup, e.original);
            await this.refresh(e.original);
            restored.push(e.original);
        }
        fs.rmSync(path.join(this.backupRoot, m.id), { recursive: true, force: true });
        return { label: m.label, files: restored };
    }

    private async refresh(file: string): Promise<string | null> {
        if (!this.db) return null;
        const url = await this.db.urlOf(file);
        if (url) {
            try {
                await this.db.refresh(url);
            } catch (e) {
                console.warn('[Media Utils] refresh-asset failed for', url, e);
            }
        }
        return url;
    }

    // ---- saving ----

    async save(req: SaveRequest): Promise<SaveResult> {
        const bytes = Buffer.from(req.bytes.buffer, req.bytes.byteOffset, req.bytes.byteLength);
        const ext = req.ext.startsWith('.') ? req.ext : '.' + req.ext;
        if (req.save.mode === 'overwrite') return this.overwrite(req.source, ext, bytes, req.session);
        return this.copy(req.source, ext, bytes, req.save);
    }

    private async overwrite(source: string, ext: string, bytes: Buffer, session?: string): Promise<SaveResult> {
        if (!fs.existsSync(source)) throw new Error(`File not found: ${source}`);
        const target = planOverwritePath(source, ext);
        const renamed = !samePath(target, source);
        if (renamed && fs.existsSync(target)) throw new Error(`Cannot change the format in place: ${path.basename(target)} already exists.`);
        if (session) this.backup(session, source);
        if (renamed) {
            const fromUrl = this.db ? await this.db.urlOf(source) : null;
            if (fromUrl && this.db) {
                const toUrl = fromUrl.replace(/\.[^./]+$/, '') + ext;
                await this.db.move(fromUrl, toUrl);
            } else {
                fs.renameSync(source, target);
                if (fs.existsSync(source + '.meta')) fs.renameSync(source + '.meta', target + '.meta');
            }
            if (session) this.setCurrent(session, source, target);
        }
        fs.writeFileSync(target, bytes);
        const url = await this.refresh(target);
        return { path: target, url, size: bytes.length, overwritten: true, renamed };
    }

    private async copy(source: string, ext: string, bytes: Buffer, save: SaveOptions): Promise<SaveResult> {
        const folder = save.folder && save.folder.trim() ? save.folder.trim() : null;
        if (folder) fs.mkdirSync(folder, { recursive: true });
        const planned = planCopyPath(source, ext, save.suffix, folder, (p) => fs.existsSync(p));
        const url = this.db ? await this.db.urlOf(planned) : null;
        if (url && this.db) {
            const free = await this.db.availableUrl(url);
            fs.mkdirSync(this.tempRoot, { recursive: true });
            const temp = path.join(this.tempRoot, `${Date.now()}-${path.basename(planned)}`);
            fs.writeFileSync(temp, bytes);
            try {
                const finalUrl = (await this.db.importFile(temp, free)) || free;
                const finalPath = (await this.db.pathOf(finalUrl)) || planned;
                return { path: finalPath, url: finalUrl, size: bytes.length, overwritten: false, renamed: false };
            } catch (e) {
                // Fallback: write next to the source and let asset-db pick it up.
                console.warn('[Media Utils] import-asset failed, writing the file directly:', e);
                const direct = (await this.db.pathOf(free)) || planned;
                fs.writeFileSync(direct, bytes);
                const u = await this.refresh(direct);
                return { path: direct, url: u, size: bytes.length, overwritten: false, renamed: false };
            } finally {
                fs.rmSync(temp, { force: true });
            }
        }
        fs.writeFileSync(planned, bytes);
        return { path: planned, url: null, size: bytes.length, overwritten: false, renamed: false };
    }
}
