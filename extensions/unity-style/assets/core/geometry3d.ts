/**
 * Pure 3D shape maths for the queries the engine does not have (overlaps,
 * ClosestPoint, sweeps on the builtin and cannon.js backends) and for fixing
 * engine results (builtin ray normals, Bullet sweep distances).
 *
 * No 'cc' import: it works on plain { x, y, z } objects (cc.Vec3 fits), so the
 * node tests run it without the engine.
 *
 * Shapes, all in world space:
 *   sphere   centre c, radius r
 *   box      centre c, unit axes ax/ay/az, half extents h (an oriented box)
 *   capsule  segment a-b, radius r
 *   plane    n.x = d, solid on the side n.x <= d (an infinite half-space)
 */

export interface V3 {
    x: number;
    y: number;
    z: number;
}

export const SHAPE_SPHERE = 0;
export const SHAPE_BOX = 1;
export const SHAPE_CAPSULE = 2;
export const SHAPE_PLANE = 3;

export function v3(x = 0, y = 0, z = 0): V3 {
    return { x, y, z };
}

export function set3(out: V3, x: number, y: number, z: number): V3 {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
}

export function copy3(out: V3, a: V3): V3 {
    out.x = a.x;
    out.y = a.y;
    out.z = a.z;
    return out;
}

export function dot3(a: V3, b: V3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function len3(a: V3): number {
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function dist3(a: V3, b: V3): number {
    const x = a.x - b.x;
    const y = a.y - b.y;
    const z = a.z - b.z;
    return Math.sqrt(x * x + y * y + z * z);
}

/** out = a + b * s */
export function madd3(out: V3, a: V3, b: V3, s: number): V3 {
    out.x = a.x + b.x * s;
    out.y = a.y + b.y * s;
    out.z = a.z + b.z * s;
    return out;
}

export function sub3(out: V3, a: V3, b: V3): V3 {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
    return out;
}

/** Normalizes in place; returns the old length (0 leaves the vector as is). */
export function normalize3(a: V3): number {
    const l = len3(a);
    if (l > 0) {
        a.x /= l;
        a.y /= l;
        a.z /= l;
    }
    return l;
}

/** A shape, mutable so queries can reuse instances. */
export class Shape3 {
    kind = SHAPE_SPHERE;
    c: V3 = v3();
    r = 0;
    a: V3 = v3();
    b: V3 = v3();
    ax: V3 = v3(1, 0, 0);
    ay: V3 = v3(0, 1, 0);
    az: V3 = v3(0, 0, 1);
    h: V3 = v3();
    n: V3 = v3(0, 1, 0);
    d = 0;
    /** True when the shape stands for something else (a mesh's bounds, a cylinder's box). */
    approx = false;

    setSphere(c: V3, r: number): this {
        this.kind = SHAPE_SPHERE;
        copy3(this.c, c);
        this.r = r;
        this.approx = false;
        return this;
    }

    /** Axes must be unit length and orthogonal. */
    setBox(c: V3, ax: V3, ay: V3, az: V3, h: V3): this {
        this.kind = SHAPE_BOX;
        copy3(this.c, c);
        copy3(this.ax, ax);
        copy3(this.ay, ay);
        copy3(this.az, az);
        copy3(this.h, h);
        this.approx = false;
        return this;
    }

    setAabb(min: V3, max: V3): this {
        this.kind = SHAPE_BOX;
        set3(this.c, (min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
        set3(this.ax, 1, 0, 0);
        set3(this.ay, 0, 1, 0);
        set3(this.az, 0, 0, 1);
        set3(this.h, Math.abs(max.x - min.x) / 2, Math.abs(max.y - min.y) / 2, Math.abs(max.z - min.z) / 2);
        this.approx = false;
        return this;
    }

    setCapsule(a: V3, b: V3, r: number): this {
        this.kind = SHAPE_CAPSULE;
        copy3(this.a, a);
        copy3(this.b, b);
        set3(this.c, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        this.r = r;
        this.approx = false;
        return this;
    }

    /** n must be unit length. Solid where n.x <= d. */
    setPlane(n: V3, d: number): this {
        this.kind = SHAPE_PLANE;
        copy3(this.n, n);
        this.d = d;
        this.approx = false;
        return this;
    }

    /** Moves the shape by v * s. */
    translate(v: V3, s: number): this {
        madd3(this.c, this.c, v, s);
        madd3(this.a, this.a, v, s);
        madd3(this.b, this.b, v, s);
        if (this.kind === SHAPE_PLANE) this.d += dot3(this.n, v) * s;
        return this;
    }

    copyFrom(o: Shape3): this {
        this.kind = o.kind;
        copy3(this.c, o.c);
        this.r = o.r;
        copy3(this.a, o.a);
        copy3(this.b, o.b);
        copy3(this.ax, o.ax);
        copy3(this.ay, o.ay);
        copy3(this.az, o.az);
        copy3(this.h, o.h);
        copy3(this.n, o.n);
        this.d = o.d;
        this.approx = o.approx;
        return this;
    }
}

const BIG = 1e30;

/** World AABB of a shape (a plane is unbounded). */
export function shapeBounds(s: Shape3, min: V3, max: V3): void {
    if (s.kind === SHAPE_SPHERE) {
        set3(min, s.c.x - s.r, s.c.y - s.r, s.c.z - s.r);
        set3(max, s.c.x + s.r, s.c.y + s.r, s.c.z + s.r);
    } else if (s.kind === SHAPE_CAPSULE) {
        set3(min, Math.min(s.a.x, s.b.x) - s.r, Math.min(s.a.y, s.b.y) - s.r, Math.min(s.a.z, s.b.z) - s.r);
        set3(max, Math.max(s.a.x, s.b.x) + s.r, Math.max(s.a.y, s.b.y) + s.r, Math.max(s.a.z, s.b.z) + s.r);
    } else if (s.kind === SHAPE_BOX) {
        const ex = Math.abs(s.ax.x) * s.h.x + Math.abs(s.ay.x) * s.h.y + Math.abs(s.az.x) * s.h.z;
        const ey = Math.abs(s.ax.y) * s.h.x + Math.abs(s.ay.y) * s.h.y + Math.abs(s.az.y) * s.h.z;
        const ez = Math.abs(s.ax.z) * s.h.x + Math.abs(s.ay.z) * s.h.y + Math.abs(s.az.z) * s.h.z;
        set3(min, s.c.x - ex, s.c.y - ey, s.c.z - ez);
        set3(max, s.c.x + ex, s.c.y + ey, s.c.z + ez);
    } else {
        set3(min, -BIG, -BIG, -BIG);
        set3(max, BIG, BIG, BIG);
    }
}

export function boundsOverlap(amin: V3, amax: V3, bmin: V3, bmax: V3): boolean {
    return amin.x <= bmax.x && amax.x >= bmin.x && amin.y <= bmax.y && amax.y >= bmin.y && amin.z <= bmax.z && amax.z >= bmin.z;
}

// ------------------------------------------------------------ closest points

/** Closest point of segment a-b to p; returns the parameter t in [0, 1]. */
export function closestOnSegment(a: V3, b: V3, p: V3, out: V3): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const ll = abx * abx + aby * aby + abz * abz;
    let t = ll > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / ll : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    set3(out, a.x + abx * t, a.y + aby * t, a.z + abz * t);
    return t;
}

const _t0 = v3();
const _t1 = v3();
const _t2 = v3();

/**
 * Closest point of the shape's solid to p (p itself when p is inside), like
 * Unity's Physics.ClosestPoint.
 */
export function closestPoint(s: Shape3, p: V3, out: V3): V3 {
    if (s.kind === SHAPE_SPHERE) {
        sub3(_t0, p, s.c);
        const l = len3(_t0);
        if (l <= s.r) return copy3(out, p);
        return madd3(out, s.c, _t0, s.r / l);
    }
    if (s.kind === SHAPE_CAPSULE) {
        closestOnSegment(s.a, s.b, p, _t1);
        sub3(_t0, p, _t1);
        const l = len3(_t0);
        if (l <= s.r) return copy3(out, p);
        return madd3(out, _t1, _t0, s.r / l);
    }
    if (s.kind === SHAPE_BOX) {
        sub3(_t0, p, s.c);
        let x = dot3(_t0, s.ax);
        let y = dot3(_t0, s.ay);
        let z = dot3(_t0, s.az);
        x = x < -s.h.x ? -s.h.x : x > s.h.x ? s.h.x : x;
        y = y < -s.h.y ? -s.h.y : y > s.h.y ? s.h.y : y;
        z = z < -s.h.z ? -s.h.z : z > s.h.z ? s.h.z : z;
        set3(out, s.c.x + s.ax.x * x + s.ay.x * y + s.az.x * z, s.c.y + s.ax.y * x + s.ay.y * y + s.az.y * z, s.c.z + s.ax.z * x + s.ay.z * y + s.az.z * z);
        return out;
    }
    const e = dot3(s.n, p) - s.d;
    if (e <= 0) return copy3(out, p);
    return madd3(out, p, s.n, -e);
}

/** Distance from p to the shape's solid (0 inside). */
export function distanceToPoint(s: Shape3, p: V3): number {
    closestPoint(s, p, _t2);
    return dist3(p, _t2);
}

const _sa = v3();
const _sp = v3();
const GOLDEN = 0.6180339887498949;

/**
 * Smallest distance between segment a-b and the shape's solid. The distance
 * to a convex set is convex along a segment, so a golden-section search is
 * exact up to its tolerance. tOut (optional) gets the segment parameter.
 */
export function distanceToSegment(s: Shape3, a: V3, b: V3, tOut?: { t: number }): number {
    if (s.kind === SHAPE_PLANE) {
        const ea = dot3(s.n, a) - s.d;
        const eb = dot3(s.n, b) - s.d;
        if (tOut) tOut.t = ea <= eb ? 0 : 1;
        const m = Math.min(ea, eb);
        return m > 0 ? m : 0;
    }
    if (s.kind === SHAPE_SPHERE) {
        const t = closestOnSegment(a, b, s.c, _sp);
        if (tOut) tOut.t = t;
        const d = dist3(_sp, s.c) - s.r;
        return d > 0 ? d : 0;
    }
    if (s.kind === SHAPE_CAPSULE) {
        const r = segmentSegment(a, b, s.a, s.b);
        if (tOut) tOut.t = r.s;
        const d = r.d - s.r;
        return d > 0 ? d : 0;
    }
    // box: golden-section search on f(t) = distance(box, lerp(a, b, t))
    let lo = 0;
    let hi = 1;
    const f = (t: number): number => {
        set3(_sa, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        return distanceToPoint(s, _sa);
    };
    let x1 = hi - GOLDEN * (hi - lo);
    let x2 = lo + GOLDEN * (hi - lo);
    let f1 = f(x1);
    let f2 = f(x2);
    for (let i = 0; i < 48 && hi - lo > 1e-7; i++) {
        if (f1 <= f2) {
            hi = x2;
            x2 = x1;
            f2 = f1;
            x1 = hi - GOLDEN * (hi - lo);
            f1 = f(x1);
        } else {
            lo = x1;
            x1 = x2;
            f1 = f2;
            x2 = lo + GOLDEN * (hi - lo);
            f2 = f(x2);
        }
    }
    let t = (lo + hi) / 2;
    let best = f(t);
    const e0 = f(0);
    const e1 = f(1);
    if (e0 < best) {
        best = e0;
        t = 0;
    }
    if (e1 < best) {
        best = e1;
        t = 1;
    }
    if (tOut) tOut.t = t;
    return best;
}

const _segRes = { d: 0, s: 0, t: 0 };

/** Distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
export function segmentSegment(p1: V3, q1: V3, p2: V3, q2: V3): { d: number; s: number; t: number } {
    const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
    const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
    const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s = 0;
    let t = 0;
    const EPS = 1e-12;
    if (a <= EPS && e <= EPS) {
        s = 0;
        t = 0;
    } else if (a <= EPS) {
        s = 0;
        t = clamp01(f / e);
    } else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e <= EPS) {
            t = 0;
            s = clamp01(-c / a);
        } else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z;
            const denom = a * e - b * b;
            s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
            t = (b * s + f) / e;
            if (t < 0) {
                t = 0;
                s = clamp01(-c / a);
            } else if (t > 1) {
                t = 1;
                s = clamp01((b - c) / a);
            }
        }
    }
    const x = p1.x + d1x * s - (p2.x + d2x * t);
    const y = p1.y + d1y * s - (p2.y + d2y * t);
    const z = p1.z + d1z * s - (p2.z + d2z * t);
    _segRes.d = Math.sqrt(x * x + y * y + z * z);
    _segRes.s = s;
    _segRes.t = t;
    return _segRes;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ------------------------------------------------------------ overlap tests

/** Do the two solids touch? q is the query shape (sphere, box or capsule). */
export function overlaps(q: Shape3, s: Shape3): boolean {
    if (q.kind === SHAPE_PLANE) return overlaps(s, q);
    if (q.kind === SHAPE_SPHERE) return distanceToPoint(s, q.c) <= q.r;
    if (q.kind === SHAPE_CAPSULE) return distanceToSegment(s, q.a, q.b) <= q.r;
    // q is a box
    if (s.kind === SHAPE_SPHERE) return distanceToPoint(q, s.c) <= s.r;
    if (s.kind === SHAPE_CAPSULE) return distanceToSegment(q, s.a, s.b) <= s.r;
    if (s.kind === SHAPE_PLANE) {
        const proj = Math.abs(dot3(s.n, q.ax)) * q.h.x + Math.abs(dot3(s.n, q.ay)) * q.h.y + Math.abs(dot3(s.n, q.az)) * q.h.z;
        return dot3(s.n, q.c) - proj <= s.d;
    }
    return boxBox(q, s);
}

const _axes: V3[] = [];
for (let i = 0; i < 15; i++) _axes.push(v3());

function cross3(out: V3, a: V3, b: V3): V3 {
    return set3(out, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function boxRadius(b: Shape3, axis: V3): number {
    return Math.abs(dot3(b.ax, axis)) * b.h.x + Math.abs(dot3(b.ay, axis)) * b.h.y + Math.abs(dot3(b.az, axis)) * b.h.z;
}

/** Separating axis test of two oriented boxes. */
export function boxBox(p: Shape3, q: Shape3): boolean {
    const pa = [p.ax, p.ay, p.az];
    const qa = [q.ax, q.ay, q.az];
    let n = 0;
    for (let i = 0; i < 3; i++) copy3(_axes[n++], pa[i]);
    for (let i = 0; i < 3; i++) copy3(_axes[n++], qa[i]);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) cross3(_axes[n++], pa[i], qa[j]);
    }
    sub3(_t0, q.c, p.c);
    for (let i = 0; i < n; i++) {
        const axis = _axes[i];
        const l = len3(axis);
        if (l < 1e-9) continue;
        const dist = Math.abs(dot3(_t0, axis)) / l;
        const ra = boxRadius(p, axis) / l;
        const rb = boxRadius(q, axis) / l;
        if (dist > ra + rb) return false;
    }
    return true;
}

// ------------------------------------------------------------ rays

export interface RayHit3 {
    t: number;
    normal: V3;
}

/**
 * Ray o + dir * t (dir unit) against the shape's surface. Returns the entry
 * distance, or -1. A ray starting inside the solid misses (as Unity's
 * raycasts do), unless `insideIsHit`, which reports t = 0 with normal -dir.
 */
export function raycastShape(s: Shape3, o: V3, dir: V3, maxDist: number, out: RayHit3, insideIsHit = false): number {
    let t = -1;
    if (s.kind === SHAPE_SPHERE) {
        sub3(_t0, o, s.c);
        const b = dot3(_t0, dir);
        const c = dot3(_t0, _t0) - s.r * s.r;
        if (c <= 0) return inside(dir, out, insideIsHit);
        const disc = b * b - c;
        if (b > 0 || disc < 0) return -1;
        t = -b - Math.sqrt(disc);
        madd3(_t1, o, dir, t);
        sub3(out.normal, _t1, s.c);
        normalize3(out.normal);
    } else if (s.kind === SHAPE_PLANE) {
        const e = dot3(s.n, o) - s.d;
        if (e <= 0) return inside(dir, out, insideIsHit);
        const den = dot3(s.n, dir);
        if (den >= 0) return -1;
        t = -e / den;
        copy3(out.normal, s.n);
    } else if (s.kind === SHAPE_BOX) {
        sub3(_t0, o, s.c);
        const axes = [s.ax, s.ay, s.az];
        const hs = [s.h.x, s.h.y, s.h.z];
        let tmin = -Infinity;
        let tmax = Infinity;
        let hitAxis = -1;
        let hitSign = 1;
        let isInside = true;
        for (let i = 0; i < 3; i++) {
            const e = dot3(axes[i], _t0);
            const f = dot3(axes[i], dir);
            if (e < -hs[i] || e > hs[i]) isInside = false;
            if (Math.abs(f) < 1e-12) {
                if (e < -hs[i] || e > hs[i]) return -1;
                continue;
            }
            let t1 = (-hs[i] - e) / f;
            let t2 = (hs[i] - e) / f;
            let sign = -1;
            if (t1 > t2) {
                const tmp = t1;
                t1 = t2;
                t2 = tmp;
                sign = 1;
            }
            if (t1 > tmin) {
                tmin = t1;
                hitAxis = i;
                hitSign = sign;
            }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) return -1;
        }
        if (isInside) return inside(dir, out, insideIsHit);
        if (tmax < 0 || hitAxis < 0) return -1;
        t = tmin;
        const ax = axes[hitAxis];
        set3(out.normal, ax.x * hitSign, ax.y * hitSign, ax.z * hitSign);
    } else {
        t = raycastCapsule(s, o, dir, out, insideIsHit);
        if (t === 0 && insideIsHit) return 0;
    }
    if (t < 0 || t > maxDist) return -1;
    out.t = t;
    return t;
}

function inside(dir: V3, out: RayHit3, insideIsHit: boolean): number {
    if (!insideIsHit) return -1;
    out.t = 0;
    set3(out.normal, -dir.x, -dir.y, -dir.z);
    return 0;
}

const _cap = new Shape3();

function raycastCapsule(s: Shape3, o: V3, dir: V3, out: RayHit3, insideIsHit: boolean): number {
    closestOnSegment(s.a, s.b, o, _t1);
    if (dist3(o, _t1) <= s.r) return inside(dir, out, insideIsHit);
    let best = Infinity;
    // the cylinder part
    sub3(_t0, s.b, s.a);
    const L = len3(_t0);
    if (L > 1e-9) {
        const ux = _t0.x / L, uy = _t0.y / L, uz = _t0.z / L;
        const mx = o.x - s.a.x, my = o.y - s.a.y, mz = o.z - s.a.z;
        const md = mx * ux + my * uy + mz * uz;
        const nd = dir.x * ux + dir.y * uy + dir.z * uz;
        // components perpendicular to the axis
        const px = mx - ux * md, py = my - uy * md, pz = mz - uz * md;
        const qx = dir.x - ux * nd, qy = dir.y - uy * nd, qz = dir.z - uz * nd;
        const A = qx * qx + qy * qy + qz * qz;
        const B = px * qx + py * qy + pz * qz;
        const C = px * px + py * py + pz * pz - s.r * s.r;
        if (A > 1e-12) {
            const disc = B * B - A * C;
            if (disc >= 0) {
                const t = (-B - Math.sqrt(disc)) / A;
                const along = md + nd * t;
                if (t >= 0 && along >= 0 && along <= L) {
                    best = t;
                    madd3(_t1, o, dir, t);
                    set3(_t2, s.a.x + ux * along, s.a.y + uy * along, s.a.z + uz * along);
                    sub3(out.normal, _t1, _t2);
                    normalize3(out.normal);
                }
            }
        }
    }
    // the end spheres
    const tmp: RayHit3 = { t: 0, normal: v3() };
    for (let k = 0; k < 2; k++) {
        _cap.setSphere(k === 0 ? s.a : s.b, s.r);
        const t = raycastShape(_cap, o, dir, Infinity, tmp);
        if (t >= 0 && t < best) {
            best = t;
            copy3(out.normal, tmp.normal);
        }
    }
    return best === Infinity ? -1 : best;
}

// ------------------------------------------------------------ sweeps

export interface SweepHit3 {
    /** Distance the query shape travelled. */
    t: number;
    point: V3;
    normal: V3;
}

const _moved = new Shape3();
const _tt = { t: 0 };
const _p = v3();
const _q = v3();

/**
 * Moves the query shape q along dir (unit) up to maxDist and finds the first
 * contact with s. Returns the travelled distance, -1 for a miss, or -2 when q
 * already overlaps s at the start (Unity's casts skip such colliders).
 *
 * Sphere and capsule queries (and anything against a sphere, capsule or plane)
 * use sphere tracing on the exact distance; a box against a box steps by a
 * fraction of the smaller box and bisects, so it is approximate (tolerance).
 */
export function sweepShape(q: Shape3, dir: V3, maxDist: number, s: Shape3, out: SweepHit3, tolerance = 1e-4): number {
    if (overlaps(q, s)) return -2;
    let t = -1;
    if (q.kind === SHAPE_BOX && s.kind === SHAPE_BOX) {
        t = sweepBoxBox(q, dir, maxDist, s, tolerance);
    } else if (q.kind === SHAPE_BOX && s.kind === SHAPE_PLANE) {
        const proj = boxRadius(q, s.n);
        const e = dot3(s.n, q.c) - proj - s.d;
        const den = dot3(s.n, dir);
        if (den < 0) t = -e / den;
        if (t > maxDist) t = -1;
    } else {
        t = sphereTrace(q, dir, maxDist, s, tolerance);
    }
    if (t < 0) return -1;
    out.t = t;
    contactAt(q, dir, t, s, out);
    return t;
}

/** Distance between the query solid moved by t and s. */
function gap(q: Shape3, dir: V3, t: number, s: Shape3): number {
    _moved.copyFrom(q).translate(dir, t);
    if (_moved.kind === SHAPE_SPHERE) return distanceToPoint(s, _moved.c) - _moved.r;
    if (_moved.kind === SHAPE_CAPSULE) return distanceToSegment(s, _moved.a, _moved.b) - _moved.r;
    // a box query against a sphere, capsule or plane: measure from the target
    if (s.kind === SHAPE_SPHERE) return distanceToPoint(_moved, s.c) - s.r;
    if (s.kind === SHAPE_CAPSULE) return distanceToSegment(_moved, s.a, s.b) - s.r;
    return overlaps(_moved, s) ? 0 : 1;
}

function sphereTrace(q: Shape3, dir: V3, maxDist: number, s: Shape3, tol: number): number {
    let t = 0;
    for (let i = 0; i < 256; i++) {
        const g = gap(q, dir, t, s);
        if (g <= tol) return t;
        t += g;
        if (t > maxDist) return -1;
    }
    return -1;
}

function sweepBoxBox(q: Shape3, dir: V3, maxDist: number, s: Shape3, tol: number): number {
    const step = Math.max(tol, Math.min(q.h.x, q.h.y, q.h.z, s.h.x, s.h.y, s.h.z) * 0.5);
    // skip ahead to where the moving box's bounds can touch s's bounds
    let lo = 0;
    let t = 0;
    while (t <= maxDist + step) {
        const tc = Math.min(t, maxDist);
        _moved.copyFrom(q).translate(dir, tc);
        if (boxBox(_moved, s)) {
            let hi = tc;
            for (let i = 0; i < 40 && hi - lo > tol; i++) {
                const mid = (lo + hi) / 2;
                _moved.copyFrom(q).translate(dir, mid);
                if (boxBox(_moved, s)) hi = mid;
                else lo = mid;
            }
            return hi;
        }
        if (tc >= maxDist) break;
        lo = tc;
        t += step;
    }
    return -1;
}

/** Contact point (on s) and normal (pointing from s toward the query) once moved by t. */
function contactAt(q: Shape3, dir: V3, t: number, s: Shape3, out: SweepHit3): void {
    _moved.copyFrom(q).translate(dir, t);
    // a representative point of the query's core
    if (_moved.kind === SHAPE_SPHERE) copy3(_p, _moved.c);
    else if (_moved.kind === SHAPE_CAPSULE) {
        distanceToSegment(s, _moved.a, _moved.b, _tt);
        madd3(_p, _moved.a, sub3(_t0, _moved.b, _moved.a), _tt.t);
    } else {
        // box: the box point closest to the target's core
        if (s.kind === SHAPE_SPHERE) closestPoint(_moved, s.c, _p);
        else if (s.kind === SHAPE_CAPSULE) {
            distanceToSegment(_moved, s.a, s.b, _tt);
            madd3(_q, s.a, sub3(_t0, s.b, s.a), _tt.t);
            closestPoint(_moved, _q, _p);
        } else if (s.kind === SHAPE_PLANE) {
            // deepest box corner along -n
            copy3(_p, _moved.c);
            madd3(_p, _p, _moved.ax, dot3(_moved.ax, s.n) > 0 ? -_moved.h.x : _moved.h.x);
            madd3(_p, _p, _moved.ay, dot3(_moved.ay, s.n) > 0 ? -_moved.h.y : _moved.h.y);
            madd3(_p, _p, _moved.az, dot3(_moved.az, s.n) > 0 ? -_moved.h.z : _moved.h.z);
        } else {
            // box against box: the target point closest to the moved centre, then back
            closestPoint(s, _moved.c, _q);
            closestPoint(_moved, _q, _p);
        }
    }
    closestPoint(s, _p, out.point);
    sub3(out.normal, _p, out.point);
    if (s.kind === SHAPE_PLANE) copy3(out.normal, s.n);
    else if (normalize3(out.normal) < 1e-6) {
        // touching exactly: use the surface normal there, or face the motion
        if (s.kind === SHAPE_SPHERE) {
            sub3(out.normal, out.point, s.c);
            if (normalize3(out.normal) < 1e-9) set3(out.normal, -dir.x, -dir.y, -dir.z);
        } else if (s.kind === SHAPE_CAPSULE) {
            closestOnSegment(s.a, s.b, out.point, _q);
            sub3(out.normal, out.point, _q);
            if (normalize3(out.normal) < 1e-9) set3(out.normal, -dir.x, -dir.y, -dir.z);
        } else {
            boxFaceNormal(s, out.point, dir, out.normal);
        }
    }
}

/** The normal of the box face a surface point lies on (the face facing -dir on ties). */
function boxFaceNormal(s: Shape3, p: V3, dir: V3, out: V3): void {
    sub3(_t0, p, s.c);
    const axes = [s.ax, s.ay, s.az];
    const hs = [s.h.x, s.h.y, s.h.z];
    let best = -Infinity;
    for (let i = 0; i < 3; i++) {
        const e = dot3(axes[i], _t0);
        const sign = e >= 0 ? 1 : -1;
        // closeness to the face plus a preference for faces looking at the motion
        const score = -Math.abs(hs[i] - Math.abs(e)) * 1000 - sign * dot3(axes[i], dir);
        if (score > best) {
            best = score;
            set3(out, axes[i].x * sign, axes[i].y * sign, axes[i].z * sign);
        }
    }
}

/**
 * For a hit point p reported by an engine sweep, how far did the query shape
 * travel? The shape at its start position, moved by that distance, touches p,
 * so it is where a ray from p backwards first enters the start shape.
 */
export function travelToPoint(q: Shape3, p: V3, dir: V3): number {
    const back = v3(-dir.x, -dir.y, -dir.z);
    const hit: RayHit3 = { t: 0, normal: v3() };
    const t = raycastShape(q, p, back, Infinity, hit, true);
    return t < 0 ? -1 : t;
}
