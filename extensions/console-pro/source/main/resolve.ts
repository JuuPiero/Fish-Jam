/**
 * Maps stack frames to real files: compiled chunks through their source maps, db:// urls
 * through the asset-db, and generated C# scripts to their .cs file (approximate line).
 */
import * as fs from 'fs';
import * as path from 'path';
import { generatedFrom, mapTsLineToCs } from '../shared/csharp';
import { originalPosition, parseSourceMap, SourceMapIndex, sourceMappingUrl } from '../shared/sourcemap';
import { chunkFile, classifyUrl, displayPath, fileUrlToPath, isInside, isUserFile, staticPath } from '../shared/urls';
import { ResolvedFrame, StackFrame } from '../shared/types';

export interface ResolverHost {
    projectRoot: string;
    /** asset-db url -> absolute path ('' when unknown). */
    queryDbPath(url: string): Promise<string>;
    /** package name -> its folder ('' when unknown). */
    packagePath(name: string): string;
}

interface Cached<T> {
    mtime: number;
    value: T;
}

const MAX_MAP_BYTES = 30 * 1024 * 1024;

export class FrameResolver {
    private maps = new Map<string, Cached<{ map: SourceMapIndex; mapFile: string } | null>>();
    private texts = new Map<string, Cached<string>>();

    constructor(private host: ResolverHost) {}

    private mtime(file: string): number {
        try {
            return fs.statSync(file).mtimeMs;
        } catch (e) {
            return -1;
        }
    }

    private exists(file: string): boolean {
        return !!file && this.mtime(file) >= 0;
    }

    private readText(file: string): string {
        const m = this.mtime(file);
        if (m < 0) return '';
        const c = this.texts.get(file);
        if (c && c.mtime === m) return c.value;
        let value = '';
        try {
            value = fs.readFileSync(file, 'utf8');
        } catch (e) {
            value = '';
        }
        if (this.texts.size > 200) this.texts.clear();
        this.texts.set(file, { mtime: m, value });
        return value;
    }

    /** The source map of a compiled script (sibling .map, sourceMappingURL file or inline data url). */
    private mapOf(jsFile: string): { map: SourceMapIndex; mapFile: string } | null {
        const m = this.mtime(jsFile);
        if (m < 0) return null;
        const c = this.maps.get(jsFile);
        if (c && c.mtime === m) return c.value;
        let value: { map: SourceMapIndex; mapFile: string } | null = null;
        try {
            const code = this.readText(jsFile);
            const ref = sourceMappingUrl(code);
            let json = '';
            let mapFile = jsFile + '.map';
            if (/^data:/i.test(ref)) {
                const comma = ref.indexOf(',');
                json = /;base64/i.test(ref.slice(0, comma)) ? Buffer.from(ref.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(ref.slice(comma + 1));
                mapFile = jsFile;
            } else {
                if (ref) mapFile = /^file:/i.test(ref) ? fileUrlToPath(ref) : path.resolve(path.dirname(jsFile), ref);
                if (this.exists(mapFile) && fs.statSync(mapFile).size < MAX_MAP_BYTES) json = fs.readFileSync(mapFile, 'utf8');
            }
            const map = json ? parseSourceMap(json) : null;
            value = map ? { map, mapFile } : null;
        } catch (e) {
            value = null;
        }
        if (this.maps.size > 300) this.maps.clear();
        this.maps.set(jsFile, { mtime: m, value });
        return value;
    }

    private sourceToPath(source: string, mapFile: string): string {
        if (/^file:/i.test(source)) return fileUrlToPath(source);
        if (/^[A-Za-z]:[\\/]/.test(source) || source.charAt(0) === '/') return source;
        if (/^[a-z][\w+.-]*:/i.test(source)) {
            // webpack:///, db://, ...: try the project-relative part
            const db = /^db:\/\/assets\/(.*)$/i.exec(source);
            return db ? path.join(this.host.projectRoot, 'assets', db[1]) : '';
        }
        return path.resolve(path.dirname(mapFile), source);
    }

    /** The file of a url (before source maps), or ''. */
    private async fileOf(url: string): Promise<string> {
        const info = classifyUrl(url);
        const root = this.host.projectRoot;
        switch (info.kind) {
            case 'chunk': {
                const order: ('editor' | 'preview')[] = info.chunk!.target === 'preview' ? ['preview', 'editor'] : ['editor', 'preview'];
                for (let i = 0; i < order.length; i++) {
                    const f = chunkFile(root, info.chunk!, order[i]);
                    if (this.exists(f)) return f;
                }
                return '';
            }
            case 'db': {
                const p = staticPath(info, root);
                if (p) return p;
                if (info.name === 'internal') return '';
                try {
                    return (await this.host.queryDbPath('db://' + info.name + '/' + (info.rel || ''))) || '';
                } catch (e) {
                    return '';
                }
            }
            case 'package': {
                const dir = this.host.packagePath(info.name || '');
                return dir ? path.join(dir, info.rel || '') : '';
            }
            case 'file': {
                const p = info.path || '';
                return p && !path.isAbsolute(p) && !/^[A-Za-z]:/.test(p) ? path.join(root, p) : p;
            }
            default:
                return '';
        }
    }

    async resolve(frame: StackFrame): Promise<ResolvedFrame> {
        const root = this.host.projectRoot;
        let file = await this.fileOf(frame.url);
        let line = frame.line;
        let col = frame.col;
        let mapped = false;
        if (!file || !this.exists(file)) {
            return { file: '', line, col, display: frame.url || frame.raw, user: false };
        }
        // compiled script of the project (chunks, extension bundles): follow its source map
        if (/\.m?js$/i.test(file) && isInside(file, root) && line > 0) {
            const sm = this.mapOf(file);
            if (sm) {
                const pos = originalPosition(sm.map, line, col);
                if (pos) {
                    const src = this.sourceToPath(pos.source, sm.mapFile);
                    if (src && this.exists(src)) {
                        file = src;
                        line = pos.line;
                        col = pos.col;
                        mapped = true;
                    }
                }
            }
        }
        file = path.normalize(file);
        const out: ResolvedFrame = { file, line, col, display: displayPath(file, root) + (line ? ':' + line + (col ? ':' + col : '') : ''), user: isUserFile(file, root), mapped };
        const cs = this.csharpOf(file, line);
        if (cs) out.cs = cs;
        return out;
    }

    /** For a .ts written by the csharp extension: its .cs file and the approximate line. */
    csharpOf(tsFile: string, tsLine: number): ResolvedFrame['cs'] | undefined {
        if (!/\.ts$/i.test(tsFile)) return undefined;
        const ts = this.readText(tsFile);
        if (!ts) return undefined;
        const from = generatedFrom(ts.slice(0, 400).split(/\r?\n/)[0]);
        if (!from) return undefined;
        const csFile = path.join(path.dirname(tsFile), from);
        if (!this.exists(csFile)) return undefined;
        const line = tsLine > 0 ? mapTsLineToCs(ts, this.readText(csFile), tsLine) : 1;
        return { file: csFile, line, display: displayPath(csFile, this.host.projectRoot) + ':' + line };
    }
}
