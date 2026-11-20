/**
 * Line geometry (pure, no engine dependency): the vertex data the line
 * shader expands into a ribbon facing the camera (or the node's Z axis).
 *
 * Each vertex sits on the line and carries the direction(s) of the line there,
 * a half width and a "kind"; the vertex shader offsets it sideways in the
 * plane facing the viewer:
 *   kind 0  edge   : offset = side * halfWidth * normal(dirA)
 *   kind 1  corner : round join, rotating from normal(dirA) to normal(dirB) on the outer side (fan = 0..1)
 *   kind 2  center : no offset (center of a corner or cap fan)
 *   kind 3  cap    : round cap, half circle around the end (side -1 start, +1 end; fan = 0..1)
 * where normal(d) = normalize(cross(d, towardsViewer)).
 */
import { V3, v3, sub, normalize, len, dist, add, scale, cross, dot, lenSq, copy, set, scaleAndAdd, M4, m4TransformPoint, m4TransformDir, EPSILON } from './math';

export enum LineAlignment {
    /** The line faces the camera. */
    View = 0,
    /** The line faces the node's Z axis (flat in the node's XY plane). */
    TransformZ = 1,
}

export enum LineTextureMode {
    /** The texture once along the whole line. */
    Stretch = 0,
    /** The texture repeats every world unit (times Texture Scale X). */
    Tile = 1,
    /** The texture once along the line, every segment getting the same share. */
    DistributePerSegment = 2,
    /** The texture once per segment. */
    RepeatPerSegment = 3,
}

export const KIND_EDGE = 0;
export const KIND_CORNER = 1;
export const KIND_CENTER = 2;
export const KIND_CAP = 3;

/**
 * Vertex layout (17 floats, 68 bytes):
 * 0-2 position, 3-5 dirA, 6-8 dirB, 9 kind, 10-11 uv, 12 halfWidth, 13 side, 14 fan, 15 alignment, 16 color (RGBA8).
 */
export const FLOATS_PER_VERTEX = 17;
export const MAX_VERTICES = 65535;

export interface RGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface LineInput {
    /** Points in the space the vertices are built in (the node's local space). */
    points: V3[];
    loop: boolean;
    /** Full width (world units) at normalized length t. */
    width: (t: number) => number;
    /** Color (0..255) at normalized length t. */
    color: (t: number, out: RGBA) => RGBA;
    cornerVertices: number;
    capVertices: number;
    alignment: number;
    textureMode: number;
    textureScale: { x: number; y: number };
}

export interface LineBuffers {
    data: Float32Array;
    u32: Uint32Array;
    indices: Uint16Array;
    vertexCount: number;
    indexCount: number;
    min: V3;
    max: V3;
    maxHalfWidth: number;
    /** Points actually used (consecutive duplicates removed). */
    pointCount: number;
    length: number;
}

export function emptyBuffers(): LineBuffers {
    return {
        data: new Float32Array(0),
        u32: new Uint32Array(0),
        indices: new Uint16Array(0),
        vertexCount: 0,
        indexCount: 0,
        min: v3(),
        max: v3(),
        maxHalfWidth: 0,
        pointCount: 0,
        length: 0,
    };
}

/** Points without consecutive duplicates (and without a closing duplicate for loops). */
export function cleanPoints(points: V3[], loop: boolean): V3[] {
    const res: V3[] = [];
    for (const p of points) {
        if (!res.length || dist(res[res.length - 1], p) > 1e-6) res.push(p);
    }
    if (loop && res.length > 2 && dist(res[0], res[res.length - 1]) <= 1e-6) res.pop();
    return res;
}

function countFor(n: number, loop: boolean, cv: number, cap: number): { verts: number; indices: number } {
    if (n < 2) return { verts: 0, indices: 0 };
    const segments = loop ? n : n - 1;
    let verts: number;
    let indices = segments * 6;
    if (cv <= 0) {
        verts = 2 * (n + (loop ? 1 : 0));
    } else {
        const joints = loop ? n : n - 2;
        verts = joints * (cv + 6) + (loop ? 0 : 4);
        indices += joints * cv * 3;
    }
    if (!loop && cap > 0) {
        verts += 2 * (cap + 2);
        indices += 2 * cap * 3;
    }
    return { verts, indices };
}

function ensure(out: LineBuffers, verts: number, indices: number): void {
    if (out.data.length < verts * FLOATS_PER_VERTEX) {
        let cap = Math.max(64, out.data.length / FLOATS_PER_VERTEX);
        while (cap < verts) cap *= 2;
        out.data = new Float32Array(cap * FLOATS_PER_VERTEX);
        out.u32 = new Uint32Array(out.data.buffer);
    }
    if (out.indices.length < indices) {
        let cap = Math.max(96, out.indices.length);
        while (cap < indices) cap *= 2;
        out.indices = new Uint16Array(cap);
    }
}

function packColor(c: RGBA): number {
    const r = Math.max(0, Math.min(255, Math.round(c.r)));
    const g = Math.max(0, Math.min(255, Math.round(c.g)));
    const b = Math.max(0, Math.min(255, Math.round(c.b)));
    const a = Math.max(0, Math.min(255, Math.round(c.a)));
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Builds the vertex and index data of a line. Returns `out` (reused across
 * calls; its arrays grow as needed).
 */
export function buildLine(input: LineInput, out: LineBuffers = emptyBuffers()): LineBuffers {
    const pts = cleanPoints(input.points, input.loop);
    const loop = input.loop && pts.length > 2;
    const n = pts.length;
    const cv = Math.max(0, Math.min(90, Math.round(input.cornerVertices)));
    const cap = loop ? 0 : Math.max(0, Math.min(90, Math.round(input.capVertices)));
    const counts = countFor(n, loop, cv, cap);
    out.vertexCount = 0;
    out.indexCount = 0;
    out.pointCount = n;
    out.maxHalfWidth = 0;
    set(out.min, 0, 0, 0);
    set(out.max, 0, 0, 0);
    out.length = 0;
    if (counts.verts === 0 || counts.verts > MAX_VERTICES) return out;
    ensure(out, counts.verts, counts.indices);

    // Segment directions and cumulative lengths.
    const segments = loop ? n : n - 1;
    const dirs: V3[] = [];
    const cum: number[] = [0];
    for (let i = 0; i < segments; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const d = sub(v3(), b, a);
        const l = len(d);
        dirs.push(l > EPSILON ? scale(d, d, 1 / l) : v3(0, 0, 1));
        cum.push(cum[i] + l);
    }
    const total = cum[segments];
    out.length = total;
    const scaleX = input.textureScale.x;
    const scaleY = input.textureScale.y;
    const tOf = (i: number) => (total > EPSILON ? cum[i] / total : i / segments);
    const uOf = (i: number) => {
        switch (input.textureMode) {
            case LineTextureMode.Tile: return cum[i] * scaleX;
            case LineTextureMode.DistributePerSegment: return (i / segments) * scaleX;
            case LineTextureMode.RepeatPerSegment: return i * scaleX;
            default: return tOf(i) * scaleX;
        }
    };

    const data = out.data;
    const u32 = out.u32;
    const idx = out.indices;
    let vc = 0;
    let ic = 0;
    const col: RGBA = { r: 255, g: 255, b: 255, a: 255 };
    const min = v3(Infinity, Infinity, Infinity);
    const max = v3(-Infinity, -Infinity, -Infinity);
    const align = input.alignment;

    const vertex = (p: V3, a: V3, b: V3, kind: number, u: number, v: number, hw: number, side: number, fan: number, color: number): number => {
        const o = vc * FLOATS_PER_VERTEX;
        data[o] = p.x; data[o + 1] = p.y; data[o + 2] = p.z;
        data[o + 3] = a.x; data[o + 4] = a.y; data[o + 5] = a.z;
        data[o + 6] = b.x; data[o + 7] = b.y; data[o + 8] = b.z;
        data[o + 9] = kind;
        data[o + 10] = u; data[o + 11] = v;
        data[o + 12] = hw; data[o + 13] = side; data[o + 14] = fan; data[o + 15] = align;
        u32[o + 16] = color;
        if (p.x < min.x) min.x = p.x;
        if (p.y < min.y) min.y = p.y;
        if (p.z < min.z) min.z = p.z;
        if (p.x > max.x) max.x = p.x;
        if (p.y > max.y) max.y = p.y;
        if (p.z > max.z) max.z = p.z;
        return vc++;
    };
    const quad = (a0: number, a1: number, b0: number, b1: number) => {
        idx[ic++] = a0; idx[ic++] = b0; idx[ic++] = a1;
        idx[ic++] = a1; idx[ic++] = b0; idx[ic++] = b1;
    };
    const tri = (a: number, b: number, c: number) => {
        idx[ic++] = a; idx[ic++] = b; idx[ic++] = c;
    };

    // Per-point attributes. For loops, point index n is the seam (point 0 at the end).
    const hwAt = (i: number) => Math.max(0, input.width(tOf(i))) * 0.5;
    const colorAt = (i: number) => packColor(input.color(tOf(i), col));
    const vY = (side: number) => ((side + 1) / 2) * scaleY;
    const inDir = (i: number) => dirs[(i - 1 + segments) % segments];
    const outDir = (i: number) => dirs[i % segments];

    let maxHw = 0;
    const pointCount = loop ? n + 1 : n;
    const hws: number[] = [];
    const cols: number[] = [];
    for (let i = 0; i < pointCount; i++) {
        hws.push(hwAt(i));
        cols.push(colorAt(i));
        maxHw = Math.max(maxHw, hws[i]);
    }

    if (cv <= 0) {
        // Shared vertices; the width direction follows the average of the two segment directions.
        let prev: [number, number] | null = null;
        for (let i = 0; i < pointCount; i++) {
            const p = pts[i % n];
            let d: V3;
            if (!loop && i === 0) d = dirs[0];
            else if (!loop && i === n - 1) d = dirs[segments - 1];
            else {
                const a = inDir(i % n);
                const b = outDir(i % n);
                d = add(v3(), a, b);
                if (lenSq(d) < 1e-10) d = copy(v3(), b);
                normalize(d, d);
            }
            const u = uOf(i);
            const l = vertex(p, d, d, KIND_EDGE, u, vY(-1), hws[i], -1, 0, cols[i]);
            const r = vertex(p, d, d, KIND_EDGE, u, vY(1), hws[i], 1, 0, cols[i]);
            if (prev) quad(prev[0], prev[1], l, r);
            prev = [l, r];
        }
    } else {
        // Separate segment ends, with a round fan filling the outer side of each joint.
        const segStart: [number, number][] = [];
        const segEnd: [number, number][] = [];
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const isJoint = loop || (i > 0 && i < n - 1);
            if (i > 0 || loop) {
                // End of the incoming segment (for loops, point 0 closes the last segment with u at the seam).
                const k = i === 0 ? n : i;
                const a = inDir(i);
                const u = uOf(k);
                segEnd[(i - 1 + segments) % segments] = [
                    vertex(p, a, a, KIND_EDGE, u, vY(-1), hws[k], -1, 0, cols[k]),
                    vertex(p, a, a, KIND_EDGE, u, vY(1), hws[k], 1, 0, cols[k]),
                ];
            }
            if (i < n - 1 || loop) {
                const b = outDir(i);
                const u = uOf(i);
                segStart[i] = [
                    vertex(p, b, b, KIND_EDGE, u, vY(-1), hws[i], -1, 0, cols[i]),
                    vertex(p, b, b, KIND_EDGE, u, vY(1), hws[i], 1, 0, cols[i]),
                ];
            }
            if (isJoint) {
                const a = inDir(i);
                const b = outDir(i);
                const u = uOf(i);
                const c = vertex(p, a, b, KIND_CENTER, u, vY(0), hws[i], 0, 0, cols[i]);
                let prevFan = -1;
                for (let j = 0; j <= cv; j++) {
                    const f = vertex(p, a, b, KIND_CORNER, u, vY(1), hws[i], 1, j / cv, cols[i]);
                    if (prevFan >= 0) tri(c, prevFan, f);
                    prevFan = f;
                }
            }
        }
        for (let s = 0; s < segments; s++) {
            const a = segStart[s];
            const b = segEnd[s];
            quad(a[0], a[1], b[0], b[1]);
        }
    }

    if (cap > 0) {
        // Round caps: half circles behind the first point and past the last one.
        const ends: [number, V3, number][] = [[0, dirs[0], -1], [n - 1, dirs[segments - 1], 1]];
        for (const [i, d, side] of ends) {
            const p = pts[i];
            const u = uOf(i);
            const c = vertex(p, d, d, KIND_CENTER, u, vY(0), hws[i], side, 0, cols[i]);
            let prev = -1;
            for (let j = 0; j <= cap; j++) {
                const f = j / cap;
                const vv = (0.5 + 0.5 * Math.cos(f * Math.PI)) * scaleY;
                const k = vertex(p, d, d, KIND_CAP, u, vv, hws[i], side, f, cols[i]);
                if (prev >= 0) tri(c, prev, k);
                prev = k;
            }
        }
    }

    out.vertexCount = vc;
    out.indexCount = ic;
    out.maxHalfWidth = maxHw;
    copy(out.min, min);
    copy(out.max, max);
    return out;
}

// ------------------------------------------------------------ CPU expansion

/** Unit normal of direction `d` facing `v` (same as the shader). */
export function sideNormal<T extends V3>(out: T, d: V3, v: V3): T {
    cross(out, d, v);
    if (lenSq(out) < 1e-12) {
        // Looking along the line: any perpendicular.
        cross(out, d, Math.abs(d.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0));
    }
    return normalize(out, out);
}

/**
 * World position of vertex `i` after the shader's expansion. `towards(p)`
 * gives the unit vector from world point p towards the viewer (ignored for
 * TransformZ, which uses the node's Z axis).
 */
export function expandVertex<T extends V3>(out: T, b: LineBuffers, i: number, matWorld: M4, towards: (p: V3) => V3): T {
    const d = b.data;
    const o = i * FLOATS_PER_VERTEX;
    const p = m4TransformPoint(v3(), matWorld, v3(d[o], d[o + 1], d[o + 2]));
    const ta = normalize(v3(), m4TransformDir(v3(), matWorld, v3(d[o + 3], d[o + 4], d[o + 5])));
    const tb = normalize(v3(), m4TransformDir(v3(), matWorld, v3(d[o + 6], d[o + 7], d[o + 8])));
    const kind = d[o + 9];
    const hw = d[o + 12];
    const side = d[o + 13];
    const fan = d[o + 14];
    const align = d[o + 15];
    const view = align > 0.5 ? normalize(v3(), m4TransformDir(v3(), matWorld, v3(0, 0, 1))) : towards(p);
    const offset = v3();
    if (kind < 0.5) {
        scale(offset, sideNormal(v3(), ta, view), side * hw);
    } else if (kind < 1.5) {
        const na = sideNormal(v3(), ta, view);
        const nb = sideNormal(v3(), tb, view);
        const turn = dot(cross(v3(), ta, tb), view);
        const s = turn >= 0 ? 1 : -1;
        const angle = Math.atan2(dot(cross(v3(), na, nb), view), dot(na, nb));
        const r = rotateAround(v3(), na, view, angle * fan);
        scale(offset, r, s * hw);
    } else if (kind > 2.5) {
        const nrm = sideNormal(v3(), ta, view);
        const fwd = normalize(v3(), cross(v3(), view, nrm));
        const a = fan * Math.PI;
        scaleAndAdd(offset, scale(offset, nrm, Math.cos(a) * hw), fwd, side * Math.sin(a) * hw);
    }
    return add(out, p, offset) as T;
}

/** Rotates `a` (perpendicular to unit axis `k`) around `k` by `angle`. */
function rotateAround<T extends V3>(out: T, a: V3, k: V3, angle: number): T {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const kxa = cross(v3(), k, a);
    return set(out, a.x * c + kxa.x * s, a.y * c + kxa.y * s, a.z * c + kxa.z * s);
}

// ---------------------------------------------------------------- helpers

/** Indices of the points kept by Ramer-Douglas-Peucker simplification (Unity's Simplify). */
export function simplifyIndices(points: V3[], tolerance: number, loop = false): number[] {
    const n = points.length;
    if (n <= 2 || tolerance <= 0) return points.map((_, i) => i);
    const keep = new Uint8Array(n);
    const rdp = (a: number, b: number) => {
        let worst = -1;
        let at = -1;
        for (let i = a + 1; i < b; i++) {
            const d = distToSegment(points[i], points[a], points[b]);
            if (d > worst) {
                worst = d;
                at = i;
            }
        }
        if (worst > tolerance && at > 0) {
            keep[at] = 1;
            rdp(a, at);
            rdp(at, b);
        }
    };
    if (loop) {
        // Split the loop at the point farthest from the first one.
        let far = 1;
        for (let i = 2; i < n; i++) if (dist(points[i], points[0]) > dist(points[far], points[0])) far = i;
        keep[0] = 1;
        keep[far] = 1;
        rdp(0, far);
        const ext = [...points, points[0]];
        const keep2 = new Uint8Array(n + 1);
        const rdp2 = (a: number, b: number) => {
            let worst = -1;
            let at = -1;
            for (let i = a + 1; i < b; i++) {
                const d = distToSegment(ext[i], ext[a], ext[b]);
                if (d > worst) {
                    worst = d;
                    at = i;
                }
            }
            if (worst > tolerance && at > 0) {
                keep2[at] = 1;
                rdp2(a, at);
                rdp2(at, b);
            }
        };
        rdp2(far, n);
        for (let i = far + 1; i < n; i++) if (keep2[i]) keep[i] = 1;
    } else {
        keep[0] = 1;
        keep[n - 1] = 1;
        rdp(0, n - 1);
    }
    const res: number[] = [];
    for (let i = 0; i < n; i++) if (keep[i]) res.push(i);
    return res;
}

export function distToSegment(p: V3, a: V3, b: V3): number {
    const ab = sub(v3(), b, a);
    const l2 = lenSq(ab);
    if (l2 < 1e-12) return dist(p, a);
    let t = dot(sub(v3(), p, a), ab) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return dist(p, scaleAndAdd(v3(), a, ab, t));
}

/** Total length of a polyline. */
export function polylineLength(points: V3[], loop: boolean): number {
    let l = 0;
    for (let i = 0; i + 1 < points.length; i++) l += dist(points[i], points[i + 1]);
    if (loop && points.length > 2) l += dist(points[points.length - 1], points[0]);
    return l;
}
