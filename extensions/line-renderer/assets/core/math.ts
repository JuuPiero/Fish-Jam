/**
 * Small vector / quaternion helpers on plain {x, y, z} objects.
 *
 * The spline core uses these instead of cc.Vec3 so it has no engine
 * dependency: cc.Vec3 / cc.Quat satisfy the interfaces, and the core can be
 * unit-tested outside the editor.
 *
 * Knot space follows Unity's convention: a knot's local +Z is the direction
 * of its out tangent and local +Y is its up vector.
 */

export interface V3 {
    x: number;
    y: number;
    z: number;
}

export interface Q4 {
    x: number;
    y: number;
    z: number;
    w: number;
}

export const EPSILON = 1e-6;

export function v3(x = 0, y = 0, z = 0): V3 {
    return { x, y, z };
}

export function q4(x = 0, y = 0, z = 0, w = 1): Q4 {
    return { x, y, z, w };
}

export function set<T extends V3>(out: T, x: number, y: number, z: number): T {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
}

export function copy<T extends V3>(out: T, a: V3): T {
    out.x = a.x;
    out.y = a.y;
    out.z = a.z;
    return out;
}

export function clone(a: V3): V3 {
    return { x: a.x, y: a.y, z: a.z };
}

export function add<T extends V3>(out: T, a: V3, b: V3): T {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    return out;
}

export function sub<T extends V3>(out: T, a: V3, b: V3): T {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
    return out;
}

export function scale<T extends V3>(out: T, a: V3, s: number): T {
    out.x = a.x * s;
    out.y = a.y * s;
    out.z = a.z * s;
    return out;
}

/** out = a + b * s */
export function scaleAndAdd<T extends V3>(out: T, a: V3, b: V3, s: number): T {
    out.x = a.x + b.x * s;
    out.y = a.y + b.y * s;
    out.z = a.z + b.z * s;
    return out;
}

export function negate<T extends V3>(out: T, a: V3): T {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
    return out;
}

export function dot(a: V3, b: V3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross<T extends V3>(out: T, a: V3, b: V3): T {
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
}

export function lenSq(a: V3): number {
    return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function len(a: V3): number {
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function distSq(a: V3, b: V3): number {
    const x = a.x - b.x;
    const y = a.y - b.y;
    const z = a.z - b.z;
    return x * x + y * y + z * z;
}

export function dist(a: V3, b: V3): number {
    return Math.sqrt(distSq(a, b));
}

/** Normalizes `a` into `out`; a zero vector stays zero. */
export function normalize<T extends V3>(out: T, a: V3): T {
    const l = len(a);
    if (l < EPSILON) return set(out, 0, 0, 0);
    return scale(out, a, 1 / l);
}

export function lerp<T extends V3>(out: T, a: V3, b: V3, t: number): T {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
}

export function equals(a: V3, b: V3, eps = EPSILON): boolean {
    return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}

/** Any unit vector perpendicular to `a` (which must not be zero). */
export function anyPerpendicular<T extends V3>(out: T, a: V3): T {
    // Cross with the axis least aligned with `a`.
    const ax = Math.abs(a.x);
    const ay = Math.abs(a.y);
    const az = Math.abs(a.z);
    if (ax <= ay && ax <= az) cross(out, a, { x: 1, y: 0, z: 0 });
    else if (ay <= az) cross(out, a, { x: 0, y: 1, z: 0 });
    else cross(out, a, { x: 0, y: 0, z: 1 });
    return normalize(out, out);
}

/** Removes the part of `v` along unit vector `n`. */
export function projectOnPlane<T extends V3>(out: T, v: V3, n: V3): T {
    const d = dot(v, n);
    return scaleAndAdd(out, v, n, -d);
}

// ------------------------------------------------------------ quaternions

export function qSet<T extends Q4>(out: T, x: number, y: number, z: number, w: number): T {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
    return out;
}

export function qCopy<T extends Q4>(out: T, a: Q4): T {
    return qSet(out, a.x, a.y, a.z, a.w);
}

export function qIdentity<T extends Q4>(out: T): T {
    return qSet(out, 0, 0, 0, 1);
}

export function qMul<T extends Q4>(out: T, a: Q4, b: Q4): T {
    const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    return qSet(out, x, y, z, w);
}

export function qNormalize<T extends Q4>(out: T, a: Q4): T {
    const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w);
    if (l < EPSILON) return qIdentity(out);
    return qSet(out, a.x / l, a.y / l, a.z / l, a.w / l);
}

/** Inverse of a unit quaternion (its conjugate). */
export function qInvert<T extends Q4>(out: T, a: Q4): T {
    const l = a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w;
    if (l < EPSILON) return qIdentity(out);
    return qSet(out, -a.x / l, -a.y / l, -a.z / l, a.w / l);
}

/** Rotates vector `v` by quaternion `q`. */
export function qRotate<T extends V3>(out: T, q: Q4, v: V3): T {
    // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
    const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
    const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
    return set(out, x, y, z);
}

export function qFromAxisAngle<T extends Q4>(out: T, axis: V3, rad: number): T {
    const n = normalize(v3(), axis);
    const s = Math.sin(rad / 2);
    return qSet(out, n.x * s, n.y * s, n.z * s, Math.cos(rad / 2));
}

/** Rotation matrix columns (x, y, z axes) to quaternion. */
export function qFromAxes<T extends Q4>(out: T, x: V3, y: V3, z: V3): T {
    const m00 = x.x, m01 = y.x, m02 = z.x;
    const m10 = x.y, m11 = y.y, m12 = z.y;
    const m20 = x.z, m21 = y.z, m22 = z.z;
    const trace = m00 + m11 + m22;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        return qNormalize(out, qSet(out, (m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s));
    }
    if (m00 > m11 && m00 > m22) {
        const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        return qNormalize(out, qSet(out, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s));
    }
    if (m11 > m22) {
        const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        return qNormalize(out, qSet(out, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s));
    }
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    return qNormalize(out, qSet(out, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s));
}

/**
 * Rotation that maps +Z to `forward` and +Y as close as possible to `up`
 * (Unity's LookRotation). Degenerate input falls back to a perpendicular up.
 */
export function qLookRotation<T extends Q4>(out: T, forward: V3, up: V3): T {
    const z = normalize(v3(), forward);
    if (lenSq(z) < EPSILON) return qIdentity(out);
    const x = cross(v3(), up, z);
    if (lenSq(x) < EPSILON) {
        // up is parallel to forward: keep a stable perpendicular.
        anyPerpendicular(x, z);
    }
    normalize(x, x);
    const y = cross(v3(), z, x);
    return qFromAxes(out, x, y, z);
}

export function qSlerp<T extends Q4>(out: T, a: Q4, b: Q4, t: number): T {
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
    if (cos < 0) {
        cos = -cos;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }
    let s0: number;
    let s1: number;
    if (1 - cos > EPSILON) {
        const omega = Math.acos(Math.min(1, cos));
        const sin = Math.sin(omega);
        s0 = Math.sin((1 - t) * omega) / sin;
        s1 = Math.sin(t * omega) / sin;
    } else {
        s0 = 1 - t;
        s1 = t;
    }
    return qNormalize(out, qSet(out, s0 * a.x + s1 * bx, s0 * a.y + s1 * by, s0 * a.z + s1 * bz, s0 * a.w + s1 * bw));
}

/** Rotation taking unit vector `from` onto unit vector `to` (shortest arc). */
export function qFromTo<T extends Q4>(out: T, from: V3, to: V3): T {
    const d = dot(from, to);
    if (d >= 1 - EPSILON) return qIdentity(out);
    if (d <= -1 + EPSILON) {
        const axis = anyPerpendicular(v3(), from);
        return qSet(out, axis.x, axis.y, axis.z, 0);
    }
    const c = cross(v3(), from, to);
    return qNormalize(out, qSet(out, c.x, c.y, c.z, 1 + d));
}

/** Euler angles in degrees (Cocos order: rotate around Z, then Y, then X... matching cc.Quat.toEuler). */
export function qToEuler<T extends V3>(out: T, q: Q4): T {
    // Same formula as cc.Quat.toEuler (outerZ = false).
    const { x, y, z, w } = q;
    let bank = 0;
    let heading = 0;
    let attitude = 0;
    const test = x * y + z * w;
    if (test > 0.499999) {
        bank = 0;
        heading = (2 * Math.atan2(x, w) * 180) / Math.PI;
        attitude = 90;
    } else if (test < -0.499999) {
        bank = 0;
        heading = (-2 * Math.atan2(x, w) * 180) / Math.PI;
        attitude = -90;
    } else {
        const sqx = x * x;
        const sqy = y * y;
        const sqz = z * z;
        bank = (Math.atan2(2 * x * w - 2 * y * z, 1 - 2 * sqx - 2 * sqz) * 180) / Math.PI;
        heading = (Math.atan2(2 * y * w - 2 * x * z, 1 - 2 * sqy - 2 * sqz) * 180) / Math.PI;
        attitude = (Math.asin(2 * test) * 180) / Math.PI;
    }
    return set(out, bank, heading, attitude);
}

/** Inverse of qToEuler (same as cc.Quat.fromEuler). */
export function qFromEuler<T extends Q4>(out: T, ex: number, ey: number, ez: number): T {
    const halfToRad = (0.5 * Math.PI) / 180;
    const x = ex * halfToRad;
    const y = ey * halfToRad;
    const z = ez * halfToRad;
    const sx = Math.sin(x);
    const cx = Math.cos(x);
    const sy = Math.sin(y);
    const cy = Math.cos(y);
    const sz = Math.sin(z);
    const cz = Math.cos(z);
    return qSet(
        out,
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    );
}

// --------------------------------------------------------------- matrices

/** Column-major 4x4 matrix, laid out like cc.Mat4 (m00..m15). */
export interface M4 {
    m00: number; m01: number; m02: number; m03: number;
    m04: number; m05: number; m06: number; m07: number;
    m08: number; m09: number; m10: number; m11: number;
    m12: number; m13: number; m14: number; m15: number;
}

export function m4TransformPoint<T extends V3>(out: T, m: M4, p: V3): T {
    const { x, y, z } = p;
    let w = m.m03 * x + m.m07 * y + m.m11 * z + m.m15;
    w = w ? 1 / w : 1;
    return set(
        out,
        (m.m00 * x + m.m04 * y + m.m08 * z + m.m12) * w,
        (m.m01 * x + m.m05 * y + m.m09 * z + m.m13) * w,
        (m.m02 * x + m.m06 * y + m.m10 * z + m.m14) * w,
    );
}

export function m4TransformDir<T extends V3>(out: T, m: M4, d: V3): T {
    const { x, y, z } = d;
    return set(out, m.m00 * x + m.m04 * y + m.m08 * z, m.m01 * x + m.m05 * y + m.m09 * z, m.m02 * x + m.m06 * y + m.m10 * z);
}

export function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Positive modulo: wraps `v` into [0, n). */
export function wrap(v: number, n: number): number {
    return ((v % n) + n) % n;
}
