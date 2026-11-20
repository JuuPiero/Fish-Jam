import { BoxCollider, CapsuleCollider, Collider, ConeCollider, CylinderCollider, director, Mat4, PlaneCollider, Quat, SphereCollider, Vec3 } from 'cc';
import { Shape3 } from '../core/geometry3d';

/**
 * World-space shapes of Cocos 3D colliders (from their component data and
 * node transform, as the backends size them), and the list of live colliders
 * in the scene for the overlap queries.
 *
 * Exact: Box, Sphere, Capsule, Plane. Approximate (`shape.approx`):
 * Cylinder and Cone use their bounding box; Mesh, Terrain and Simplex use
 * the collider's world AABB from the backend.
 */

const _m = new Mat4();
const _q = new Quat();
const _s = new Vec3();
const _c = new Vec3();
const _ax = new Vec3();
const _ay = new Vec3();
const _az = new Vec3();
const _h = new Vec3();
const _a = new Vec3();
const _b = new Vec3();

function absMax(a: number, b: number): number {
    return Math.max(Math.abs(a), Math.abs(b));
}

/** Fills `out` with the collider's world shape; false when it has none we can use. */
export function colliderShape(col: Collider, out: Shape3): boolean {
    const node = col.node;
    node.getWorldMatrix(_m);
    node.getWorldRotation(_q);
    node.getWorldScale(_s);
    const sx = Math.abs(_s.x);
    const sy = Math.abs(_s.y);
    const sz = Math.abs(_s.z);
    Vec3.transformMat4(_c, col.center, _m);
    Vec3.transformQuat(_ax, Vec3.UNIT_X, _q);
    Vec3.transformQuat(_ay, Vec3.UNIT_Y, _q);
    Vec3.transformQuat(_az, Vec3.UNIT_Z, _q);
    if (BoxCollider && col instanceof BoxCollider) {
        _h.set(col.size.x / 2 * sx, col.size.y / 2 * sy, col.size.z / 2 * sz);
        out.setBox(_c, _ax, _ay, _az, _h);
        return true;
    }
    if (SphereCollider && col instanceof SphereCollider) {
        out.setSphere(_c, col.radius * Math.max(sx, sy, sz));
        return true;
    }
    if (CapsuleCollider && col instanceof CapsuleCollider) {
        const dir = col.direction;
        let r: number;
        let hh: number;
        let axis: Vec3;
        if (dir === 0) {
            r = col.radius * absMax(sy, sz);
            hh = col.cylinderHeight / 2 * sx;
            axis = _ax;
        } else if (dir === 2) {
            r = col.radius * absMax(sx, sy);
            hh = col.cylinderHeight / 2 * sz;
            axis = _az;
        } else {
            r = col.radius * absMax(sx, sz);
            hh = col.cylinderHeight / 2 * sy;
            axis = _ay;
        }
        Vec3.scaleAndAdd(_a, _c, axis, -hh);
        Vec3.scaleAndAdd(_b, _c, axis, hh);
        out.setCapsule(_a, _b, r);
        return true;
    }
    if ((CylinderCollider && col instanceof CylinderCollider) || (ConeCollider && col instanceof ConeCollider)) {
        const c = col as CylinderCollider;
        const dir = c.direction;
        const r = c.radius;
        const hh = c.height / 2;
        if (dir === 0) _h.set(hh * sx, r * sy, r * sz);
        else if (dir === 2) _h.set(r * sx, r * sy, hh * sz);
        else _h.set(r * sx, hh * sy, r * sz);
        out.setBox(_c, _ax, _ay, _az, _h);
        out.approx = true;
        return true;
    }
    if (PlaneCollider && col instanceof PlaneCollider) {
        const n = new Vec3();
        Vec3.transformQuat(n, col.normal, _q);
        if (n.normalize().length() === 0) return false;
        Vec3.transformMat4(_a, Vec3.ZERO, _m);
        out.setPlane(n, Vec3.dot(n, _a) + col.constant);
        return true;
    }
    // Mesh, Terrain, Simplex: the backend's world bounds
    try {
        const bb = col.worldBounds;
        if (!bb || (bb.halfExtents.x === 0 && bb.halfExtents.y === 0 && bb.halfExtents.z === 0)) return false;
        Vec3.subtract(_a, bb.center, bb.halfExtents);
        Vec3.add(_b, bb.center, bb.halfExtents);
        out.setAabb(_a, _b);
        out.approx = true;
        return true;
    } catch (e) {
        return false;
    }
}

let cacheFrame = -1;
let cache: Collider[] = [];

/**
 * Enabled colliders of the running scene. Collected once per frame (scene
 * walk); Physics.SyncTransforms() or invalidateColliderCache() forces a new
 * walk, e.g. after instantiating colliders and querying in the same frame.
 */
export function sceneColliders(): Collider[] {
    const f = director.getTotalFrames();
    if (f === cacheFrame) return cache;
    cacheFrame = f;
    const scene = director.getScene();
    const all: Collider[] = scene && Collider ? (scene.getComponentsInChildren(Collider) as Collider[]) : [];
    const out: Collider[] = [];
    for (let i = 0; i < all.length; i++) {
        const c = all[i];
        if (c.enabledInHierarchy) out.push(c);
    }
    cache = out;
    return out;
}

export function invalidateColliderCache(): void {
    cacheFrame = -1;
}

/** The collider's group (0 before it is initialized). */
export function colliderGroup(c: Collider): number {
    try {
        return c.getGroup() >>> 0;
    } catch (e) {
        return 0;
    }
}
