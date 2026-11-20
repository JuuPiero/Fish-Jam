import { Quat, Vec2, Vec3 } from 'cc';
import { Mathf, Ref } from '../core/mathf';
import { Time } from './time';

/**
 * Unity's Vector3 / Vector2 / Quaternion statics over cc.Vec3 / Vec2 / Quat.
 * Each returns a new value (pass `out` as the last argument to reuse one).
 * cc types are references, not structs: copy (clone()) before you keep one.
 *
 * Axes follow Cocos: forward is -Z (Vec3.FORWARD, node.forward), so
 * Vector3.forward is (0, 0, -1) and LookRotation(dir) turns a node's
 * forward (-Z) toward dir, matching node.lookAt. Unity's +Z forward does not
 * apply here. Euler angles use Cocos' convention (Quat.fromEuler), which
 * differs from Unity's Z-X-Y order when more than one axis turns.
 */
export class Vector3 {
    static get zero(): Vec3 { return new Vec3(0, 0, 0); }
    static get one(): Vec3 { return new Vec3(1, 1, 1); }
    static get up(): Vec3 { return new Vec3(0, 1, 0); }
    static get down(): Vec3 { return new Vec3(0, -1, 0); }
    static get left(): Vec3 { return new Vec3(-1, 0, 0); }
    static get right(): Vec3 { return new Vec3(1, 0, 0); }
    /** (0, 0, -1): Cocos' forward. */
    static get forward(): Vec3 { return new Vec3(0, 0, -1); }
    static get back(): Vec3 { return new Vec3(0, 0, 1); }

    static Add(a: Readonly<Vec3>, b: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.add(out, a, b); }
    static Sub(a: Readonly<Vec3>, b: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.subtract(out, a, b); }
    static Mul(a: Readonly<Vec3>, s: number, out = new Vec3()): Vec3 { return Vec3.multiplyScalar(out, a, s); }
    static Div(a: Readonly<Vec3>, s: number, out = new Vec3()): Vec3 { return Vec3.multiplyScalar(out, a, 1 / s); }
    static Neg(a: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.negate(out, a); }

    static Distance(a: Readonly<Vec3>, b: Readonly<Vec3>): number { return Vec3.distance(a, b); }
    static Dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number { return Vec3.dot(a, b); }
    static Cross(a: Readonly<Vec3>, b: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.cross(out, a, b); }
    static Magnitude(a: Readonly<Vec3>): number { return Vec3.len(a); }
    static SqrMagnitude(a: Readonly<Vec3>): number { return Vec3.lengthSqr(a); }

    /** Unit vector, or zero for a (near) zero vector. */
    static Normalize(a: Readonly<Vec3>, out = new Vec3()): Vec3 {
        const l = Vec3.len(a);
        if (l < 1e-5) return out.set(0, 0, 0);
        return Vec3.multiplyScalar(out, a, 1 / l);
    }

    static Scale(a: Readonly<Vec3>, b: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.multiply(out, a, b); }
    static Min(a: Readonly<Vec3>, b: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.min(out, a, b); }
    static Max(a: Readonly<Vec3>, b: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.max(out, a, b); }

    static Lerp(a: Readonly<Vec3>, b: Readonly<Vec3>, t: number, out = new Vec3()): Vec3 { return Vec3.lerp(out, a, b, Mathf.Clamp01(t)); }
    static LerpUnclamped(a: Readonly<Vec3>, b: Readonly<Vec3>, t: number, out = new Vec3()): Vec3 { return Vec3.lerp(out, a, b, t); }

    static MoveTowards(current: Readonly<Vec3>, target: Readonly<Vec3>, maxDistanceDelta: number, out = new Vec3()): Vec3 {
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const dz = target.z - current.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d === 0 || (maxDistanceDelta >= 0 && d <= maxDistanceDelta)) return out.set(target);
        const k = maxDistanceDelta / d;
        return out.set(current.x + dx * k, current.y + dy * k, current.z + dz * k);
    }

    /** Unsigned angle in degrees. */
    static Angle(from: Readonly<Vec3>, to: Readonly<Vec3>): number {
        const den = Math.sqrt(Vec3.lengthSqr(from) * Vec3.lengthSqr(to));
        if (den < 1e-15) return 0;
        return Math.acos(Mathf.Clamp(Vec3.dot(from, to) / den, -1, 1)) * Mathf.Rad2Deg;
    }

    /** Angle in degrees, signed by the side of `axis`. */
    static SignedAngle(from: Readonly<Vec3>, to: Readonly<Vec3>, axis: Readonly<Vec3>): number {
        const a = Vector3.Angle(from, to);
        const c = Vec3.cross(new Vec3(), from, to);
        return Vec3.dot(axis, c) < 0 ? -a : a;
    }

    static ClampMagnitude(v: Readonly<Vec3>, maxLength: number, out = new Vec3()): Vec3 {
        const l = Vec3.len(v);
        if (l > maxLength && l > 0) return Vec3.multiplyScalar(out, v, maxLength / l);
        return out.set(v);
    }

    static Project(v: Readonly<Vec3>, onNormal: Readonly<Vec3>, out = new Vec3()): Vec3 {
        const ll = Vec3.lengthSqr(onNormal);
        if (ll < 1e-15) return out.set(0, 0, 0);
        return Vec3.multiplyScalar(out, onNormal, Vec3.dot(v, onNormal) / ll);
    }

    static ProjectOnPlane(v: Readonly<Vec3>, planeNormal: Readonly<Vec3>, out = new Vec3()): Vec3 {
        const p = Vector3.Project(v, planeNormal);
        return Vec3.subtract(out, v, p);
    }

    static Reflect(inDirection: Readonly<Vec3>, inNormal: Readonly<Vec3>, out = new Vec3()): Vec3 {
        const k = -2 * Vec3.dot(inNormal, inDirection);
        return out.set(inDirection.x + inNormal.x * k, inDirection.y + inNormal.y * k, inDirection.z + inNormal.z * k);
    }

    /** Spherical interpolation of directions (lengths are interpolated linearly). */
    static Slerp(a: Readonly<Vec3>, b: Readonly<Vec3>, t: number, out = new Vec3()): Vec3 {
        t = Mathf.Clamp01(t);
        const la = Vec3.len(a);
        const lb = Vec3.len(b);
        if (la < 1e-9 || lb < 1e-9) return Vec3.lerp(out, a, b, t);
        const na = Vec3.multiplyScalar(new Vec3(), a, 1 / la);
        const nb = Vec3.multiplyScalar(new Vec3(), b, 1 / lb);
        const dot = Mathf.Clamp(Vec3.dot(na, nb), -1, 1);
        const theta = Math.acos(dot) * t;
        const rel = Vec3.scaleAndAdd(new Vec3(), nb, na, -dot);
        if (Vec3.len(rel) < 1e-9) return Vec3.lerp(out, a, b, t);
        rel.normalize();
        const dir = new Vec3(na.x * Math.cos(theta) + rel.x * Math.sin(theta), na.y * Math.cos(theta) + rel.y * Math.sin(theta), na.z * Math.cos(theta) + rel.z * Math.sin(theta));
        return Vec3.multiplyScalar(out, dir, la + (lb - la) * t);
    }

    /** Spring toward target; currentVelocity ({ value: Vec3 }) is read and written. */
    static SmoothDamp(current: Readonly<Vec3>, target: Readonly<Vec3>, currentVelocity: Ref<Vec3>, smoothTime: number, maxSpeed = Infinity, deltaTime = Time.deltaTime, out = new Vec3()): Vec3 {
        const v = currentVelocity.value;
        const rx: Ref<number> = { value: v.x };
        const ry: Ref<number> = { value: v.y };
        const rz: Ref<number> = { value: v.z };
        // per-axis damping, then the overall speed cap
        const x = Mathf.SmoothDamp(current.x, target.x, rx, smoothTime, Infinity, deltaTime);
        const y = Mathf.SmoothDamp(current.y, target.y, ry, smoothTime, Infinity, deltaTime);
        const z = Mathf.SmoothDamp(current.z, target.z, rz, smoothTime, Infinity, deltaTime);
        v.set(rx.value, ry.value, rz.value);
        if (maxSpeed < Infinity) {
            const sp = v.length();
            if (sp > maxSpeed && sp > 0) v.multiplyScalar(maxSpeed / sp);
            const step = Vec3.subtract(new Vec3(), new Vec3(x, y, z), current);
            const maxStep = maxSpeed * deltaTime;
            if (step.length() > maxStep) {
                step.normalize().multiplyScalar(maxStep);
                return Vec3.add(out, current, step);
            }
        }
        return out.set(x, y, z);
    }
}

export class Vector2 {
    static get zero(): Vec2 { return new Vec2(0, 0); }
    static get one(): Vec2 { return new Vec2(1, 1); }
    static get up(): Vec2 { return new Vec2(0, 1); }
    static get down(): Vec2 { return new Vec2(0, -1); }
    static get left(): Vec2 { return new Vec2(-1, 0); }
    static get right(): Vec2 { return new Vec2(1, 0); }

    static Distance(a: Readonly<Vec2>, b: Readonly<Vec2>): number { return Vec2.distance(a, b); }
    static Dot(a: Readonly<Vec2>, b: Readonly<Vec2>): number { return Vec2.dot(a, b); }
    static Lerp(a: Readonly<Vec2>, b: Readonly<Vec2>, t: number, out = new Vec2()): Vec2 { return Vec2.lerp(out, a, b, Mathf.Clamp01(t)); }
    static LerpUnclamped(a: Readonly<Vec2>, b: Readonly<Vec2>, t: number, out = new Vec2()): Vec2 { return Vec2.lerp(out, a, b, t); }

    static MoveTowards(current: Readonly<Vec2>, target: Readonly<Vec2>, maxDistanceDelta: number, out = new Vec2()): Vec2 {
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d === 0 || (maxDistanceDelta >= 0 && d <= maxDistanceDelta)) return out.set(target);
        return out.set(current.x + (dx / d) * maxDistanceDelta, current.y + (dy / d) * maxDistanceDelta);
    }

    /** Unsigned angle in degrees. */
    static Angle(from: Readonly<Vec2>, to: Readonly<Vec2>): number {
        const den = Math.sqrt(Vec2.lengthSqr(from) * Vec2.lengthSqr(to));
        if (den < 1e-15) return 0;
        return Math.acos(Mathf.Clamp(Vec2.dot(from, to) / den, -1, 1)) * Mathf.Rad2Deg;
    }

    /** Counter-clockwise positive, degrees. */
    static SignedAngle(from: Readonly<Vec2>, to: Readonly<Vec2>): number {
        const a = Vector2.Angle(from, to);
        return from.x * to.y - from.y * to.x < 0 ? -a : a;
    }

    static ClampMagnitude(v: Readonly<Vec2>, maxLength: number, out = new Vec2()): Vec2 {
        const l = v.length();
        if (l > maxLength && l > 0) return out.set(v.x * maxLength / l, v.y * maxLength / l);
        return out.set(v);
    }

    static Reflect(inDirection: Readonly<Vec2>, inNormal: Readonly<Vec2>, out = new Vec2()): Vec2 {
        const k = -2 * Vec2.dot(inNormal, inDirection);
        return out.set(inDirection.x + inNormal.x * k, inDirection.y + inNormal.y * k);
    }

    static Perpendicular(v: Readonly<Vec2>, out = new Vec2()): Vec2 {
        return out.set(-v.y, v.x);
    }
}

export class Quaternion {
    static get identity(): Quat { return new Quat(0, 0, 0, 1); }

    /** From Euler angles in degrees (Cocos' convention). */
    static Euler(x: number | Readonly<Vec3>, y?: number, z?: number, out = new Quat()): Quat {
        if (typeof x === 'object') return Quat.fromEuler(out, x.x, x.y, x.z);
        return Quat.fromEuler(out, x, y || 0, z || 0);
    }

    /** Euler angles in degrees of a rotation (Unity's q.eulerAngles). */
    static EulerAngles(q: Readonly<Quat>, out = new Vec3()): Vec3 {
        return Quat.toEuler(out, q) as Vec3;
    }

    static AngleAxis(angle: number, axis: Readonly<Vec3>, out = new Quat()): Quat {
        const n = Vector3.Normalize(axis);
        return Quat.fromAxisAngle(out, n, angle * Mathf.Deg2Rad);
    }

    /** Rotation whose forward (-Z, as node.forward) points along `forward`. */
    static LookRotation(forward: Readonly<Vec3>, upwards: Readonly<Vec3> = Vec3.UNIT_Y, out = new Quat()): Quat {
        const back = new Vec3(-forward.x, -forward.y, -forward.z);
        if (Vec3.lengthSqr(back) < 1e-12) return out.set(0, 0, 0, 1);
        back.normalize();
        return Quat.fromViewUp(out, back, upwards);
    }

    static FromToRotation(fromDirection: Readonly<Vec3>, toDirection: Readonly<Vec3>, out = new Quat()): Quat {
        return Quat.rotationTo(out, Vector3.Normalize(fromDirection), Vector3.Normalize(toDirection));
    }

    static Inverse(q: Readonly<Quat>, out = new Quat()): Quat { return Quat.invert(out, q); }
    static Dot(a: Readonly<Quat>, b: Readonly<Quat>): number { return Quat.dot(a, b); }
    /** a * b (apply b, then a). */
    static Mul(a: Readonly<Quat>, b: Readonly<Quat>, out = new Quat()): Quat { return Quat.multiply(out, a, b); }
    /** Rotates a vector: q * v. */
    static MulVec3(q: Readonly<Quat>, v: Readonly<Vec3>, out = new Vec3()): Vec3 { return Vec3.transformQuat(out, v, q); }

    /** Angle between two rotations, degrees. */
    static Angle(a: Readonly<Quat>, b: Readonly<Quat>): number {
        const d = Math.min(Math.abs(Quat.dot(a, b)), 1);
        return d > 1 - 1e-6 ? 0 : Math.acos(d) * 2 * Mathf.Rad2Deg;
    }

    static Slerp(a: Readonly<Quat>, b: Readonly<Quat>, t: number, out = new Quat()): Quat { return Quat.slerp(out, a, b, Mathf.Clamp01(t)); }
    static SlerpUnclamped(a: Readonly<Quat>, b: Readonly<Quat>, t: number, out = new Quat()): Quat { return Quat.slerp(out, a, b, t); }
    static Lerp(a: Readonly<Quat>, b: Readonly<Quat>, t: number, out = new Quat()): Quat {
        Quat.lerp(out, a, b, Mathf.Clamp01(t));
        return Quat.normalize(out, out);
    }

    /** Turns `from` toward `to` by at most maxDegreesDelta. */
    static RotateTowards(from: Readonly<Quat>, to: Readonly<Quat>, maxDegreesDelta: number, out = new Quat()): Quat {
        const angle = Quaternion.Angle(from, to);
        if (angle === 0) return out.set(to);
        return Quat.slerp(out, from, to, Math.min(1, maxDegreesDelta / angle));
    }

    static Normalize(q: Readonly<Quat>, out = new Quat()): Quat { return Quat.normalize(out, q); }
}
