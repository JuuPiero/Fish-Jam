/**
 * A small source map (v3) reader: enough to map a compiled chunk position back to
 * the original script. Mappings are decoded once per map and kept as flat arrays.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;

export interface SourceMapIndex {
    sources: string[];
    sourceRoot: string;
    /** Per generated line: [genCol, sourceIndex, origLine, origCol] repeated, sorted by genCol. 0-based. */
    lines: number[][];
}

/** Decodes the "mappings" field. Segments without a source (length 1) are skipped. */
export function decodeMappings(mappings: string): number[][] {
    const lines: number[][] = [];
    let cur: number[] = [];
    let genCol = 0;
    let src = 0;
    let origLine = 0;
    let origCol = 0;
    let name = 0;
    const seg: number[] = [0, 0, 0, 0, 0];
    let segLen = 0;
    let value = 0;
    let shift = 0;

    const endSegment = () => {
        if (segLen === 0) return;
        genCol += seg[0];
        if (segLen >= 4) {
            src += seg[1];
            origLine += seg[2];
            origCol += seg[3];
            if (segLen >= 5) name += seg[4];
            cur.push(genCol, src, origLine, origCol);
        }
        segLen = 0;
    };

    for (let i = 0; i < mappings.length; i++) {
        const c = mappings[i];
        if (c === ',') {
            endSegment();
            continue;
        }
        if (c === ';') {
            endSegment();
            lines.push(cur);
            cur = [];
            genCol = 0;
            continue;
        }
        const digit = B64_INDEX[c];
        if (digit === undefined) continue;
        value += (digit & 31) << shift;
        if (digit & 32) {
            shift += 5;
        } else {
            const negative = value & 1;
            value >>>= 1;
            if (segLen < 5) seg[segLen++] = negative ? -value : value;
            value = 0;
            shift = 0;
        }
    }
    endSegment();
    lines.push(cur);
    // keep segments sorted by generated column (they nearly always are)
    for (let l = 0; l < lines.length; l++) {
        const a = lines[l];
        let sorted = true;
        for (let k = 4; k < a.length; k += 4) if (a[k] < a[k - 4]) sorted = false;
        if (!sorted) {
            const quads: number[][] = [];
            for (let k = 0; k < a.length; k += 4) quads.push([a[k], a[k + 1], a[k + 2], a[k + 3]]);
            quads.sort((x, y) => x[0] - y[0]);
            lines[l] = ([] as number[]).concat.apply([], quads);
        }
    }
    return lines;
}

export function parseSourceMap(json: string | Record<string, any>): SourceMapIndex | null {
    let o: Record<string, any>;
    try {
        o = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        return null;
    }
    if (!o || typeof o.mappings !== 'string' || !Array.isArray(o.sources)) return null;
    return { sources: o.sources.map(String), sourceRoot: String(o.sourceRoot || ''), lines: decodeMappings(o.mappings) };
}

/**
 * The original position of a generated one. `line` and `col` are 1-based (as in V8 stacks);
 * so is the result. col 0 (unknown) takes the first mapping of the line.
 */
export function originalPosition(map: SourceMapIndex, line: number, col: number): { source: string; line: number; col: number } | null {
    const segs = map.lines[line - 1];
    if (!segs || !segs.length) return null;
    const target = Math.max(0, col - 1);
    // last segment whose generated column <= target
    let lo = 0;
    let hi = segs.length / 4 - 1;
    let best = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (segs[mid * 4] <= target) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    const k = best * 4;
    const source = map.sources[segs[k + 1]];
    if (source === undefined) return null;
    return { source: map.sourceRoot && !/^[a-z]+:/i.test(source) ? map.sourceRoot.replace(/\/?$/, '/') + source : source, line: segs[k + 2] + 1, col: segs[k + 3] + 1 };
}

/** The sourceMappingURL comment of a script ('' when there is none). */
export function sourceMappingUrl(code: string): string {
    const m = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m.exec(code.slice(-4000));
    return m ? m[1] : '';
}

/** Encodes one VLQ value (used by the tests to build maps). */
export function encodeVlq(v: number): string {
    let n = v < 0 ? (-v << 1) | 1 : v << 1;
    let out = '';
    do {
        let digit = n & 31;
        n >>>= 5;
        if (n > 0) digit |= 32;
        out += B64[digit];
    } while (n > 0);
    return out;
}
