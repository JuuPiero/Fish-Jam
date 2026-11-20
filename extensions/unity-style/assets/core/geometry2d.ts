/**
 * Pure 2D shape maths for Physics2D: overlaps, ray casts on the builtin 2D
 * backend (which has no ray cast), and exact shape casts (CircleCast,
 * BoxCast, CapsuleCast) on every backend. No 'cc' import.
 *
 * A shape is a polyline "core" inflated by a radius:
 *   circle   1 vertex,  radius r
 *   capsule  2 vertices (open), radius r
 *   polygon  n vertices (closed, may be concave), radius 0
 * Coordinates are flat [x0, y0, x1, y1, ...] arrays in world units.
 */

export class Shape2 {
    v: number[] = [];
    /** Number of vertices. */
    n = 0;
    closed = false;
    r = 0;
    /** Centre used as RaycastHit2D.centroid for casts. */
    cx = 0;
    cy = 0;

    setCircle(x: number, y: number, r: number): this {
        this.v.length = 2;
        this.v[0] = x;
        this.v[1] = y;
        this.n = 1;
        this.closed = false;
        this.r = r;
        this.cx = x;
        this.cy = y;
        return this;
    }

    setCapsule(x0: number, y0: number, x1: number, y1: number, r: number): this {
        this.v.length = 4;
        this.v[0] = x0;
        this.v[1] = y0;
        this.v[2] = x1;
        this.v[3] = y1;
        this.n = 2;
        this.closed = false;
        this.r = r;
        this.cx = (x0 + x1) / 2;
        this.cy = (y0 + y1) / 2;
        return this;
    }

    /** pts: flat array, copied. */
    setPolygon(pts: number[]): this {
        this.v.length = pts.length;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < pts.length; i += 2) {
            this.v[i] = pts[i];
            this.v[i + 1] = pts[i + 1];
            sx += pts[i];
            sy += pts[i + 1];
        }
        this.n = pts.length / 2;
        this.closed = this.n >= 3;
        this.r = 0;
        this.cx = this.n ? sx / this.n : 0;
        this.cy = this.n ? sy / this.n : 0;
        return this;
    }

    /** Oriented box: centre, full size, angle in degrees. */
    setBox(x: number, y: number, w: number, h: number, angleDeg: number): this {
        const a = (angleDeg * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const hx = w / 2;
        const hy = h / 2;
        const pts = [-hx, -hy, hx, -hy, hx, hy, -hx, hy];
        for (let i = 0; i < 8; i += 2) {
            const px = pts[i];
            const py = pts[i + 1];
            pts[i] = x + px * c - py * s;
            pts[i + 1] = y + px * s + py * c;
        }
        return this.setPolygon(pts);
    }

    /** Number of edges (a single vertex is one degenerate edge). */
    edgeCount(): number {
        if (this.n <= 1) return this.n;
        return this.closed ? this.n : this.n - 1;
    }

    translate(dx: number, dy: number): this {
        for (let i = 0; i < this.v.length; i += 2) {
            this.v[i] += dx;
            this.v[i + 1] += dy;
        }
        this.cx += dx;
        this.cy += dy;
        return this;
    }

    bounds(out: { xMin: number; yMin: number; xMax: number; yMax: number }): void {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < this.v.length; i += 2) {
            x0 = Math.min(x0, this.v[i]);
            y0 = Math.min(y0, this.v[i + 1]);
            x1 = Math.max(x1, this.v[i]);
            y1 = Math.max(y1, this.v[i + 1]);
        }
        out.xMin = x0 - this.r;
        out.yMin = y0 - this.r;
        out.xMax = x1 + this.r;
        out.yMax = y1 + this.r;
    }
}

/** Edge i of a shape as [ax, ay, bx, by] (degenerate for a single vertex). */
function edge(s: Shape2, i: number, out: number[]): void {
    const j = s.n <= 1 ? 0 : (i + 1) % s.n;
    out[0] = s.v[2 * i];
    out[1] = s.v[2 * i + 1];
    out[2] = s.v[2 * j];
    out[3] = s.v[2 * j + 1];
}

/** Closest point on segment a-b to p. */
export function closestOnSegment2(ax: number, ay: number, bx: number, by: number, px: number, py: number, out: number[]): number {
    const dx = bx - ax;
    const dy = by - ay;
    const ll = dx * dx + dy * dy;
    let t = ll > 0 ? ((px - ax) * dx + (py - ay) * dy) / ll : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out[0] = ax + dx * t;
    out[1] = ay + dy * t;
    return t;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
    return ax * by - ay * bx;
}

/** Do segments a-b and c-d intersect (touching counts)? */
export function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
    const d1 = cross(bx - ax, by - ay, cx - ax, cy - ay);
    const d2 = cross(bx - ax, by - ay, dx - ax, dy - ay);
    const d3 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
    const d4 = cross(dx - cx, dy - cy, bx - cx, by - cy);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    const c = [0, 0];
    const eps = 1e-12;
    if (Math.abs(d1) <= eps && onSeg(ax, ay, bx, by, cx, cy, c)) return true;
    if (Math.abs(d2) <= eps && onSeg(ax, ay, bx, by, dx, dy, c)) return true;
    if (Math.abs(d3) <= eps && onSeg(cx, cy, dx, dy, ax, ay, c)) return true;
    if (Math.abs(d4) <= eps && onSeg(cx, cy, dx, dy, bx, by, c)) return true;
    return false;
}

function onSeg(ax: number, ay: number, bx: number, by: number, px: number, py: number, tmp: number[]): boolean {
    closestOnSegment2(ax, ay, bx, by, px, py, tmp);
    return Math.abs(tmp[0] - px) < 1e-9 && Math.abs(tmp[1] - py) < 1e-9;
}

/** Distance between segments a-b and c-d. */
export function segmentDistance2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
    if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    const t = [0, 0];
    let best = Infinity;
    closestOnSegment2(cx, cy, dx, dy, ax, ay, t);
    best = Math.min(best, Math.hypot(t[0] - ax, t[1] - ay));
    closestOnSegment2(cx, cy, dx, dy, bx, by, t);
    best = Math.min(best, Math.hypot(t[0] - bx, t[1] - by));
    closestOnSegment2(ax, ay, bx, by, cx, cy, t);
    best = Math.min(best, Math.hypot(t[0] - cx, t[1] - cy));
    closestOnSegment2(ax, ay, bx, by, dx, dy, t);
    best = Math.min(best, Math.hypot(t[0] - dx, t[1] - dy));
    return best;
}

/** Even-odd point in polygon (closed shapes only). */
export function pointInPolygon(s: Shape2, px: number, py: number): boolean {
    if (!s.closed) return false;
    let inside = false;
    for (let i = 0, j = s.n - 1; i < s.n; j = i++) {
        const xi = s.v[2 * i];
        const yi = s.v[2 * i + 1];
        const xj = s.v[2 * j];
        const yj = s.v[2 * j + 1];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

const _ea = [0, 0, 0, 0];
const _eb = [0, 0, 0, 0];

/** Distance between the cores of two shapes (0 when they cross; containment not counted). */
export function coreDistance(a: Shape2, b: Shape2): number {
    let best = Infinity;
    const na = a.edgeCount();
    const nb = b.edgeCount();
    for (let i = 0; i < na; i++) {
        edge(a, i, _ea);
        for (let j = 0; j < nb; j++) {
            edge(b, j, _eb);
            const d = segmentDistance2(_ea[0], _ea[1], _ea[2], _ea[3], _eb[0], _eb[1], _eb[2], _eb[3]);
            if (d < best) best = d;
            if (best <= 0) return 0;
        }
    }
    return best;
}

/** Do the two solids touch? */
export function overlaps2(a: Shape2, b: Shape2): boolean {
    if (a.n === 0 || b.n === 0) return false;
    if (coreDistance(a, b) <= a.r + b.r) return true;
    if (b.closed && pointInPolygon(b, a.v[0], a.v[1])) return true;
    if (a.closed && pointInPolygon(a, b.v[0], b.v[1])) return true;
    return false;
}

export function overlapPoint2(s: Shape2, px: number, py: number): boolean {
    if (s.closed && pointInPolygon(s, px, py)) return true;
    const t = [0, 0];
    const ne = s.edgeCount();
    for (let i = 0; i < ne; i++) {
        edge(s, i, _ea);
        closestOnSegment2(_ea[0], _ea[1], _ea[2], _ea[3], px, py, t);
        if (Math.hypot(t[0] - px, t[1] - py) <= s.r) return true;
    }
    return false;
}

/** Ray o + d t (d unit) entering a circle; -1 when it misses or starts inside. */
function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
    const mx = ox - cx;
    const my = oy - cy;
    const c = mx * mx + my * my - r * r;
    if (c < 0) return -1;
    const b = mx * dx + my * dy;
    if (b > 0) return -1;
    const disc = b * b - c;
    if (disc < 0) return -1;
    return -b - Math.sqrt(disc);
}

/** Ray against segment a-b; -1 for none (parallel counts as none). */
function raySegment(ox: number, oy: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number): number {
    const ex = bx - ax;
    const ey = by - ay;
    const den = cross(dx, dy, ex, ey);
    if (Math.abs(den) < 1e-12) return -1;
    const t = cross(ax - ox, ay - oy, ex, ey) / den;
    const u = cross(ax - ox, ay - oy, dx, dy) / den;
    if (t < 0 || u < 0 || u > 1) return -1;
    return t;
}

/** Ray against the capsule (segment a-b inflated by R): entry distance or -1. */
export function rayCapsule2(ox: number, oy: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number, R: number): number {
    if (R <= 0) {
        if (ax === bx && ay === by) return -1;
        return raySegment(ox, oy, dx, dy, ax, ay, bx, by);
    }
    let best = -1;
    const consider = (t: number): void => {
        if (t >= 0 && (best < 0 || t < best)) best = t;
    };
    consider(rayCircle(ox, oy, dx, dy, ax, ay, R));
    consider(rayCircle(ox, oy, dx, dy, bx, by, R));
    const ex = bx - ax;
    const ey = by - ay;
    const l = Math.hypot(ex, ey);
    if (l > 0) {
        const nx = -ey / l;
        const ny = ex / l;
        consider(raySegment(ox, oy, dx, dy, ax + nx * R, ay + ny * R, bx + nx * R, by + ny * R));
        consider(raySegment(ox, oy, dx, dy, ax - nx * R, ay - ny * R, bx - nx * R, by - ny * R));
    }
    return best;
}

export interface CastHit2 {
    /** Distance travelled (0 when it started overlapping). */
    t: number;
    px: number;
    py: number;
    nx: number;
    ny: number;
    /** Centre of the cast shape at the hit. */
    cx: number;
    cy: number;
}

const _tmp = [0, 0];
const _moved2 = new Shape2();

/**
 * Moves q along unit (dx, dy) up to maxDist and finds the first contact with
 * s. Exact for any pair: the first contact is a vertex of one core reaching
 * an edge of the other inflated by both radii. Returns t, -1 for a miss, or 0
 * (out.t = 0, normal = -dir) when q starts overlapping s.
 */
export function cast2(q: Shape2, dx: number, dy: number, maxDist: number, s: Shape2, out: CastHit2): number {
    if (overlaps2(q, s)) {
        out.t = 0;
        out.nx = -dx;
        out.ny = -dy;
        out.px = q.cx;
        out.py = q.cy;
        out.cx = q.cx;
        out.cy = q.cy;
        return 0;
    }
    const R = q.r + s.r;
    let best = -1;
    // q's vertices against s's edges
    const ns = s.edgeCount();
    for (let i = 0; i < q.n; i++) {
        const vx = q.v[2 * i];
        const vy = q.v[2 * i + 1];
        for (let j = 0; j < ns; j++) {
            edge(s, j, _eb);
            const t = rayCapsule2(vx, vy, dx, dy, _eb[0], _eb[1], _eb[2], _eb[3], R);
            if (t >= 0 && (best < 0 || t < best)) best = t;
        }
    }
    // s's vertices moving backwards against q's edges
    const nq = q.edgeCount();
    for (let i = 0; i < s.n; i++) {
        const wx = s.v[2 * i];
        const wy = s.v[2 * i + 1];
        for (let j = 0; j < nq; j++) {
            edge(q, j, _ea);
            const t = rayCapsule2(wx, wy, -dx, -dy, _ea[0], _ea[1], _ea[2], _ea[3], R);
            if (t >= 0 && (best < 0 || t < best)) best = t;
        }
    }
    if (best < 0 || best > maxDist) return -1;
    out.t = best;
    contact2(q, dx, dy, best, s, out);
    return best;
}

function contact2(q: Shape2, dx: number, dy: number, t: number, s: Shape2, out: CastHit2): void {
    const m = _moved2.setPolygon(q.v);
    m.n = q.n;
    m.closed = q.closed;
    m.r = q.r;
    m.cx = q.cx;
    m.cy = q.cy;
    m.translate(dx * t, dy * t);
    // closest pair of core points
    let best = Infinity;
    let qx = 0;
    let qy = 0;
    let sx = 0;
    let sy = 0;
    const nq = m.edgeCount();
    const ns = s.edgeCount();
    for (let i = 0; i < nq; i++) {
        edge(m, i, _ea);
        for (let j = 0; j < ns; j++) {
            edge(s, j, _eb);
            // test the four endpoint-to-segment pairs (cores do not cross at first contact)
            for (let k = 0; k < 4; k++) {
                let px: number;
                let py: number;
                let cx: number;
                let cy: number;
                if (k < 2) {
                    px = _ea[k * 2];
                    py = _ea[k * 2 + 1];
                    closestOnSegment2(_eb[0], _eb[1], _eb[2], _eb[3], px, py, _tmp);
                    cx = _tmp[0];
                    cy = _tmp[1];
                    const d = Math.hypot(px - cx, py - cy);
                    if (d < best) {
                        best = d;
                        qx = px;
                        qy = py;
                        sx = cx;
                        sy = cy;
                    }
                } else {
                    cx = _eb[(k - 2) * 2];
                    cy = _eb[(k - 2) * 2 + 1];
                    closestOnSegment2(_ea[0], _ea[1], _ea[2], _ea[3], cx, cy, _tmp);
                    px = _tmp[0];
                    py = _tmp[1];
                    const d = Math.hypot(px - cx, py - cy);
                    if (d < best) {
                        best = d;
                        qx = px;
                        qy = py;
                        sx = cx;
                        sy = cy;
                    }
                }
            }
        }
    }
    let nx = qx - sx;
    let ny = qy - sy;
    const l = Math.hypot(nx, ny);
    if (l > 1e-9) {
        nx /= l;
        ny /= l;
    } else {
        // cores touch (both radii 0): the normal of the touched edge, facing the motion
        nx = -dx;
        ny = -dy;
        let bestDot = Infinity;
        for (let j = 0; j < ns; j++) {
            edge(s, j, _eb);
            closestOnSegment2(_eb[0], _eb[1], _eb[2], _eb[3], sx, sy, _tmp);
            if (Math.hypot(_tmp[0] - sx, _tmp[1] - sy) > 1e-6) continue;
            const ex = _eb[2] - _eb[0];
            const ey = _eb[3] - _eb[1];
            const el = Math.hypot(ex, ey);
            if (el === 0) continue;
            let ux = -ey / el;
            let uy = ex / el;
            if (ux * dx + uy * dy > 0) {
                ux = -ux;
                uy = -uy;
            }
            const dd = ux * dx + uy * dy;
            if (dd < bestDot) {
                bestDot = dd;
                nx = ux;
                ny = uy;
            }
        }
    }
    out.nx = nx;
    out.ny = ny;
    out.px = sx + nx * s.r;
    out.py = sy + ny * s.r;
    out.cx = m.cx;
    out.cy = m.cy;
}

/** A ray is a cast of a point. Returns t or -1 (a ray starting inside returns 0). */
export function raycast2(ox: number, oy: number, dx: number, dy: number, maxDist: number, s: Shape2, out: CastHit2): number {
    const p = _rayPoint.setCircle(ox, oy, 0);
    return cast2(p, dx, dy, maxDist, s, out);
}

const _rayPoint = new Shape2();
