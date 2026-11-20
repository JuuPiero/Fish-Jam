import { Collider, Color, geometry, PhysicsSystem, Quat, Vec3 } from 'cc';
import {
    closestPoint, overlaps, raycastShape, RayHit3, Shape3, shapeBounds, boundsOverlap, sweepShape, SweepHit3, travelToPoint, V3,
    SHAPE_BOX, SHAPE_CAPSULE, SHAPE_SPHERE, SHAPE_PLANE,
} from '../core/geometry3d';
import { matrixCollides, setMatrixPair } from '../core/layers';
import { DebugDraw } from '../engine/debug-draw';
import { colliderGroup, colliderShape, invalidateColliderCache, sceneColliders } from './collider-shapes';
import { LayerMask } from './layer-mask';
import { QueryTriggerInteraction, RaycastHit } from './physics-types';

/** Cocos' own default (it must not be given Infinity). Infinity maps to this. */
const COCOS_MAX = 10000000;

const _ray = new geometry.Ray();
const _dir = new Vec3();
const _o = new Vec3();
const _q = new Quat();
const _shape = new Shape3();
const _target = new Shape3();
const _min = new Vec3();
const _max = new Vec3();
const _tmin = new Vec3();
const _tmax = new Vec3();
const _rh: RayHit3 = { t: 0, normal: new Vec3() };
const _sh: SweepHit3 = { t: 0, point: new Vec3(), normal: new Vec3() };

const RAY_HIT = new Color(80, 220, 120, 255);
const RAY_MISS = new Color(230, 80, 80, 255);
const SHAPE_COLOR = new Color(90, 170, 255, 255);

function isRay(x: any): x is geometry.Ray {
    return !!x && typeof x === 'object' && !!x.o && !!x.d && x.x === undefined;
}

function isQuat(x: any): x is Quat {
    return !!x && typeof x === 'object' && typeof x.w === 'number';
}

function sys(): PhysicsSystem | null {
    return PhysicsSystem ? PhysicsSystem.instance || null : null;
}

/** Which backend runs: 'bullet' | 'physx' | 'cannon.js' | 'builtin' | '' (none). */
function backendId(): string {
    if (!PhysicsSystem) return '';
    if (PhysicsSystem.PHYSICS_BULLET) return 'bullet';
    if (PhysicsSystem.PHYSICS_PHYSX) return 'physx';
    if (PhysicsSystem.PHYSICS_CANNON) return 'cannon.js';
    if (PhysicsSystem.PHYSICS_BUILTIN) return 'builtin';
    return '';
}

function hasNativeSweep(): boolean {
    const b = backendId();
    return (b === 'bullet' || b === 'physx') && !Physics.emulateShapeCasts;
}

function wantTriggers(qti: QueryTriggerInteraction | undefined): boolean {
    if (qti === QueryTriggerInteraction.Collide) return true;
    if (qti === QueryTriggerInteraction.Ignore) return false;
    return Physics.queriesHitTriggers;
}

function dist(d: any): number {
    if (typeof d !== 'number' || !(d < COCOS_MAX) || d !== d) return COCOS_MAX;
    return d < 0 ? 0 : d;
}

function maskOr(m: any, def: number): number {
    return typeof m === 'number' ? m | 0 : def;
}

/** Normalized direction into _dir; false for a zero vector. */
function setDir(d: Readonly<Vec3>): boolean {
    _dir.set(d.x, d.y, d.z);
    const l = _dir.length();
    if (!(l > 0)) return false;
    _dir.multiplyScalar(1 / l);
    return true;
}

function fill(hit: RaycastHit, point: V3, normal: V3, distance: number, col: Collider): RaycastHit {
    hit.point.set(point.x, point.y, point.z);
    hit.normal.set(normal.x, normal.y, normal.z);
    hit.distance = distance;
    hit.collider = col;
    hit.triangleIndex = -1;
    return hit;
}

function byDistance(a: RaycastHit, b: RaycastHit): number {
    return a.distance - b.distance;
}

function accept(col: Collider | null, mask: number, triggers: boolean): boolean {
    if (!col || !col.isValid || !col.shape) return false; // no shape: not supported by this backend
    if (!triggers && col.isTrigger) return false;
    if (mask !== -1 && !((colliderGroup(col) & (mask >>> 0)) >>> 0)) return false;
    return true;
}

/** Builtin ray results carry a zero normal: compute it from the collider's shape. */
function fixNormal(hit: RaycastHit, origin: Vec3, dir: Vec3): void {
    if (hit.normal.lengthSqr() > 0 || !hit.collider) return;
    if (colliderShape(hit.collider, _target) && raycastShape(_target, origin, dir, Infinity, _rh) >= 0) hit.normal.set(_rh.normal.x, _rh.normal.y, _rh.normal.z);
    else hit.normal.set(-dir.x, -dir.y, -dir.z);
}

// ------------------------------------------------------------------ rays

function rayAll(origin: Vec3, dir: Vec3, maxDist: number, mask: number, triggers: boolean): RaycastHit[] {
    const s = sys();
    const out: RaycastHit[] = [];
    if (!s) return out;
    _ray.o.set(origin);
    _ray.d.set(dir);
    if (!s.raycast(_ray, mask >>> 0, maxDist, triggers)) return out;
    const rs = s.raycastResults;
    for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (!accept(r.collider, mask, triggers)) continue;
        // one hit per collider, the nearest (cannon.js can report a collider more than once)
        let dup = -1;
        for (let k = 0; k < out.length; k++) if (out[k].collider === r.collider) dup = k;
        if (dup >= 0) {
            if (r.distance < out[dup].distance) fill(out[dup], r.hitPoint, r.hitNormal, r.distance, r.collider);
            continue;
        }
        const h = fill(new RaycastHit(), r.hitPoint, r.hitNormal, r.distance, r.collider);
        fixNormal(h, origin, dir);
        out.push(h);
    }
    out.sort(byDistance);
    return out;
}

function rayClosest(origin: Vec3, dir: Vec3, maxDist: number, mask: number, triggers: boolean, hit: RaycastHit | null): boolean {
    const s = sys();
    if (!s) return false;
    _ray.o.set(origin);
    _ray.d.set(dir);
    let found = false;
    if (s.raycastClosest(_ray, mask >>> 0, maxDist, triggers)) {
        const r = s.raycastClosestResult;
        if (accept(r.collider, mask, triggers)) {
            found = true;
            if (hit) {
                fill(hit, r.hitPoint, r.hitNormal, r.distance, r.collider);
                fixNormal(hit, origin, dir);
            }
        } else {
            // the backend returned a trigger we must skip (builtin ignores the flag): take the nearest accepted one
            const all = rayAll(origin, dir, maxDist, mask, triggers);
            if (all.length) {
                found = true;
                if (hit) hit.copyFrom(all[0]);
            }
        }
    }
    if (!found && hit) hit.clear();
    return found;
}

// ------------------------------------------------------------------ shape casts

/** The query shape at its start: kind + parameters. */
interface CastQuery {
    shape: Shape3;
    /** box half extents / capsule radius+height for the native sweeps */
    half: Vec3;
    radius: number;
    height: number;
    rot: Quat;
}

const _cq: CastQuery = { shape: new Shape3(), half: new Vec3(), radius: 0, height: 0, rot: new Quat() };

function sphereQuery(c: Readonly<Vec3>, r: number): CastQuery {
    _cq.shape.setSphere(c, r);
    _cq.radius = r;
    return _cq;
}

function boxQuery(c: Readonly<Vec3>, half: Readonly<Vec3>, rot: Readonly<Quat> | null): CastQuery {
    if (rot) _cq.rot.set(rot.x, rot.y, rot.z, rot.w);
    else _cq.rot.set(0, 0, 0, 1);
    const ax = Vec3.transformQuat(new Vec3(), Vec3.UNIT_X, _cq.rot);
    const ay = Vec3.transformQuat(new Vec3(), Vec3.UNIT_Y, _cq.rot);
    const az = Vec3.transformQuat(new Vec3(), Vec3.UNIT_Z, _cq.rot);
    _cq.half.set(Math.abs(half.x), Math.abs(half.y), Math.abs(half.z));
    _cq.shape.setBox(c, ax, ay, az, _cq.half);
    return _cq;
}

function capsuleQuery(p1: Readonly<Vec3>, p2: Readonly<Vec3>, r: number): CastQuery {
    _cq.shape.setCapsule(p1, p2, r);
    _cq.radius = r;
    const axis = new Vec3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    _cq.height = axis.length();
    if (_cq.height > 1e-9) {
        axis.multiplyScalar(1 / _cq.height);
        Quat.rotationTo(_cq.rot, Vec3.UNIT_Y, axis);
    } else {
        _cq.rot.set(0, 0, 0, 1);
    }
    return _cq;
}

function nativeSweep(q: CastQuery, closest: boolean, maxDist: number, mask: number, triggers: boolean): boolean {
    const s = sys() as PhysicsSystem;
    const k = q.shape.kind;
    _ray.o.set(q.shape.c.x, q.shape.c.y, q.shape.c.z);
    _ray.d.set(_dir);
    const m = mask >>> 0;
    if (k === SHAPE_SPHERE) return closest ? s.sweepSphereClosest(_ray, q.radius, m, maxDist, triggers) : s.sweepSphere(_ray, q.radius, m, maxDist, triggers);
    if (k === SHAPE_BOX) return closest ? s.sweepBoxClosest(_ray, q.half, q.rot, m, maxDist, triggers) : s.sweepBox(_ray, q.half, q.rot, m, maxDist, triggers);
    return closest ? s.sweepCapsuleClosest(_ray, q.radius, q.height, q.rot, m, maxDist, triggers) : s.sweepCapsule(_ray, q.radius, q.height, q.rot, m, maxDist, triggers);
}

/** Converts one engine sweep result; null when it must be skipped. */
function sweepResult(q: CastQuery, r: { hitPoint: Vec3; hitNormal: Vec3; distance: number; collider: Collider }, mask: number, triggers: boolean): RaycastHit | null {
    const col = r.collider;
    if (!accept(col, mask, triggers)) return null;
    // Unity's casts skip colliders the shape overlaps at its start
    if (colliderShape(col, _target)) {
        if (!_target.approx && overlaps(q.shape, _target)) return null;
    }
    let d = r.distance;
    if (backendId() === 'bullet') {
        // Bullet reports the distance from the origin to the hit point; Unity wants the travel distance
        const t = travelToPoint(q.shape, r.hitPoint, _dir);
        if (t >= 0) d = t;
    }
    if (d <= 0 && _target.approx) return null;
    return fill(new RaycastHit(), r.hitPoint, r.hitNormal, d, col);
}

function emulatedCast(q: CastQuery, maxDist: number, mask: number, triggers: boolean, closestOnly: boolean): RaycastHit[] {
    const out: RaycastHit[] = [];
    // swept bounds
    shapeBounds(q.shape, _min, _max);
    const reach = Math.min(maxDist, 1e6);
    Vec3.scaleAndAdd(_tmin, _min, _dir, reach);
    Vec3.scaleAndAdd(_tmax, _max, _dir, reach);
    Vec3.min(_min, _min, _tmin);
    Vec3.max(_max, _max, _tmax);
    const cols = sceneColliders();
    let best: RaycastHit | null = null;
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!accept(c, mask, triggers)) continue;
        if (!colliderShape(c, _target)) continue;
        shapeBounds(_target, _tmin, _tmax);
        if (!boundsOverlap(_min, _max, _tmin, _tmax)) continue;
        const t = sweepShape(q.shape, _dir, best ? Math.min(maxDist, best.distance) : maxDist, _target, _sh);
        if (t < 0) continue;
        const h = fill(new RaycastHit(), _sh.point, _sh.normal, t, c);
        if (closestOnly) {
            if (!best || t < best.distance) best = h;
        } else {
            out.push(h);
        }
    }
    if (closestOnly && best) out.push(best);
    out.sort(byDistance);
    return out;
}

function castAll(q: CastQuery, maxDist: number, mask: number, triggers: boolean): RaycastHit[] {
    if (!sys()) return [];
    if (!hasNativeSweep()) return emulatedCast(q, maxDist, mask, triggers, false);
    const out: RaycastHit[] = [];
    if (nativeSweep(q, false, maxDist, mask, triggers)) {
        const rs = (sys() as PhysicsSystem).sweepCastResults;
        for (let i = 0; i < rs.length; i++) {
            const h = sweepResult(q, rs[i], mask, triggers);
            if (h) out.push(h);
        }
    }
    out.sort(byDistance);
    return out;
}

function castClosest(q: CastQuery, maxDist: number, mask: number, triggers: boolean, hit: RaycastHit | null): boolean {
    let h: RaycastHit | null = null;
    if (sys()) {
        if (!hasNativeSweep()) {
            const r = emulatedCast(q, maxDist, mask, triggers, true);
            h = r.length ? r[0] : null;
        } else {
            if (nativeSweep(q, true, maxDist, mask, triggers)) h = sweepResult(q, (sys() as PhysicsSystem).sweepCastClosestResult, mask, triggers);
            if (!h) {
                // nothing, or the closest was skipped (start overlap, trigger): look at all hits
                const all = castAll(q, maxDist, mask, triggers);
                h = all.length ? all[0] : null;
            }
        }
    }
    if (hit) {
        if (h) hit.copyFrom(h);
        else hit.clear();
    }
    return !!h;
}

// ------------------------------------------------------------------ overlaps

function overlapList(q: Shape3, mask: number, triggers: boolean, firstOnly: boolean): Collider[] {
    const out: Collider[] = [];
    shapeBounds(q, _min, _max);
    const cols = sceneColliders();
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!accept(c, mask, triggers)) continue;
        if (!colliderShape(c, _target)) continue;
        shapeBounds(_target, _tmin, _tmax);
        if (!boundsOverlap(_min, _max, _tmin, _tmax)) continue;
        if (overlaps(q, _target)) {
            out.push(c);
            if (firstOnly) break;
        }
    }
    return out;
}

// ------------------------------------------------------------------ debug draw

function drawRay(origin: Vec3, dir: Vec3, maxDist: number, hit: boolean, distance: number): void {
    if (!Physics.debugDrawQueries) return;
    const len = hit ? distance : Math.min(maxDist, Physics.debugDrawMissLength);
    const end = new Vec3();
    Vec3.scaleAndAdd(end, origin, dir, len);
    DebugDraw.line(origin, end, hit ? RAY_HIT : RAY_MISS, Physics.debugDrawDuration);
    if (hit) DebugDraw.cross(end, 0.2, RAY_HIT, Physics.debugDrawDuration);
}

function drawShape(s: Shape3, color: Color): void {
    const d = Physics.debugDrawDuration;
    if (s.kind === SHAPE_SPHERE) DebugDraw.sphere(s.c as Vec3, s.r, color, d);
    else if (s.kind === SHAPE_BOX) DebugDraw.box(s.c as Vec3, s.ax as Vec3, s.ay as Vec3, s.az as Vec3, s.h as Vec3, color, d);
    else if (s.kind === SHAPE_CAPSULE) DebugDraw.capsule(s.a as Vec3, s.b as Vec3, s.r, color, d);
}

function drawCast(q: CastQuery, maxDist: number, hit: boolean, distance: number): void {
    if (!Physics.debugDrawQueries) return;
    drawShape(q.shape, SHAPE_COLOR);
    const c = new Vec3(q.shape.c.x, q.shape.c.y, q.shape.c.z);
    drawRay(c, _dir, maxDist, hit, distance);
    if (hit) {
        const moved = new Shape3().copyFrom(q.shape).translate(_dir, distance);
        drawShape(moved, RAY_HIT);
    }
}

function drawOverlap(q: Shape3, found: boolean): void {
    if (Physics.debugDrawQueries) drawShape(q, found ? RAY_HIT : SHAPE_COLOR);
}

// ------------------------------------------------------------------ ignore pairs

const ignoredPairs: Collider[] = [];
let warnedIgnore = false;

function findPair(a: Collider, b: Collider): number {
    for (let i = 0; i < ignoredPairs.length; i += 2) {
        if ((ignoredPairs[i] === a && ignoredPairs[i + 1] === b) || (ignoredPairs[i] === b && ignoredPairs[i + 1] === a)) return i;
    }
    return -1;
}

function bulletIgnore(a: Collider, b: Collider, ignore: boolean): boolean {
    const bt: any = (globalThis as any).Bullet;
    if (!bt || typeof bt.CollisionObject_setIgnoreCollisionCheck !== 'function') return false;
    const sa: any = a.shape && (a.shape as any).sharedBody;
    const sb: any = b.shape && (b.shape as any).sharedBody;
    if (!sa || !sb) return false;
    const pa = a.isTrigger ? sa.ghost : sa.body;
    const pb = b.isTrigger ? sb.ghost : sb.body;
    if (!pa || !pb) return false;
    bt.CollisionObject_setIgnoreCollisionCheck(pa, pb, ignore);
    bt.CollisionObject_setIgnoreCollisionCheck(pb, pa, ignore);
    return true;
}

/** Rotates/moves a world shape from the collider's pose to (position, rotation). */
function repose(s: Shape3, col: Collider, position: Readonly<Vec3> | undefined, rotation: Readonly<Quat> | undefined): void {
    const np = col.node.worldPosition;
    const nr = col.node.worldRotation;
    const pos = position || np;
    const dq = new Quat();
    if (rotation) Quat.multiply(dq, rotation, Quat.invert(new Quat(), nr));
    const pts = [s.c, s.a, s.b];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i] as Vec3;
        const v = new Vec3(p.x - np.x, p.y - np.y, p.z - np.z);
        Vec3.transformQuat(v, v, dq);
        p.x = pos.x + v.x;
        p.y = pos.y + v.y;
        p.z = pos.z + v.z;
    }
    const axes = [s.ax, s.ay, s.az, s.n];
    for (let i = 0; i < axes.length; i++) Vec3.transformQuat(axes[i] as Vec3, axes[i] as Vec3, dq);
    if (s.kind === SHAPE_PLANE) s.d = Vec3.dot(s.n as Vec3, pos) + (col as any).constant;
}

/**
 * Unity's Physics (3D) over the Cocos PhysicsSystem.
 *
 * Out parameters: pass a RaycastHit to be filled, e.g.
 *   const hit = new RaycastHit();
 *   if (Physics.Raycast(origin, dir, hit, 100, mask)) { hit.point ... }
 *
 * Layer masks are physics group masks (see LayerMask). Infinity distances
 * are passed to Cocos as 10,000,000 (its own default).
 */
export class Physics {
    /** Mask of every layer. */
    static readonly AllLayers = -1;
    /** Layer 0 (DEFAULT). */
    static readonly DefaultLayer = 0;

    /** Do queries report trigger colliders by default (QueryTriggerInteraction.UseGlobal)? */
    static queriesHitTriggers = true;
    /** Draw the queries (rays, casts, overlaps) with the geometry renderer. */
    static debugDrawQueries = false;
    /** Seconds the drawn queries stay (0: one frame). */
    static debugDrawDuration = 0;
    /** Length drawn for a missed infinite ray. */
    static debugDrawMissLength = 100;
    /** Force the geometric shape casts even on Bullet and PhysX (testing, or to get Unity's skip-start-overlap on all colliders). */
    static emulateShapeCasts = false;

    /** Mask of the layer named "Ignore Raycast" (any case/spacing), or 0 when the project has none. */
    static get IgnoreRaycastLayer(): number {
        const l = LayerMask.NameToLayer('Ignore Raycast');
        return l >= 0 ? 1 << l : 0;
    }

    /** Every layer except Ignore Raycast: the default mask of rays and casts. */
    static get DefaultRaycastLayers(): number {
        return ~Physics.IgnoreRaycastLayer;
    }

    /** The running backend: 'bullet' | 'physx' | 'cannon.js' | 'builtin' | '' when 3D physics is off. */
    static get backend(): string {
        return backendId();
    }

    /** World gravity (a copy; assign to change it). */
    static get gravity(): Vec3 {
        const s = sys();
        return s ? s.gravity.clone() : new Vec3(0, -10, 0);
    }

    static set gravity(v: Vec3) {
        const s = sys();
        if (s) s.gravity = new Vec3(v.x, v.y, v.z);
    }

    /** When false, the world only moves on Physics.Simulate(). */
    static get autoSimulation(): boolean {
        const s = sys();
        return s ? s.autoSimulation : false;
    }

    static set autoSimulation(v: boolean) {
        const s = sys();
        if (s) s.autoSimulation = v;
    }

    /** Fixed time step of the world (Unity's Time.fixedDeltaTime). */
    static get fixedDeltaTime(): number {
        const s = sys();
        return s ? s.fixedTimeStep : 1 / 60;
    }

    static set fixedDeltaTime(v: number) {
        const s = sys();
        if (s) s.fixedTimeStep = v;
    }

    static get sleepThreshold(): number {
        const s = sys();
        return s ? s.sleepThreshold : 0;
    }

    static set sleepThreshold(v: number) {
        const s = sys();
        if (s) s.sleepThreshold = v;
    }

    /** Steps the world by `step` seconds now: sync transforms, step, send collision and trigger events. */
    static Simulate(step: number): void {
        const s = sys();
        if (!s || !s.physicsWorld) return;
        s.syncSceneToPhysics();
        s.step(step);
        s.emitEvents();
        const w: any = s.physicsWorld;
        if (w.syncAfterEvents) w.syncAfterEvents();
        invalidateColliderCache();
    }

    /** Pushes moved node transforms into the physics world now (and refreshes the overlap query's collider list). */
    static SyncTransforms(): void {
        const s = sys();
        if (s) s.syncSceneToPhysics();
        invalidateColliderCache();
    }

    // ---------------------------------------------------------------- rays

    static Raycast(origin: Readonly<Vec3>, direction: Readonly<Vec3>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static Raycast(origin: Readonly<Vec3>, direction: Readonly<Vec3>, hitInfo: RaycastHit, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static Raycast(ray: geometry.Ray, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static Raycast(ray: geometry.Ray, hitInfo: RaycastHit, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static Raycast(a: any, b?: any, c?: any, d?: any, e?: any, f?: any): boolean {
        const args = [a, b, c, d, e, f];
        let i = 1;
        if (isRay(a)) _o.set(a.o);
        else {
            _o.set(a);
            i = 2;
        }
        if (!setDir(isRay(a) ? a.d : b)) return false;
        let hit: RaycastHit | null = null;
        if (args[i] instanceof RaycastHit) hit = args[i++];
        const maxDist = dist(args[i]);
        const ok = rayClosest(_o, _dir, maxDist, maskOr(args[i + 1], Physics.DefaultRaycastLayers), wantTriggers(args[i + 2]), hit || (Physics.debugDrawQueries ? (hit = new RaycastHit()) : null));
        drawRay(_o, _dir, maxDist, ok, hit ? hit.distance : 0);
        return ok;
    }

    static RaycastAll(origin: Readonly<Vec3>, direction: Readonly<Vec3>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): RaycastHit[];
    static RaycastAll(ray: geometry.Ray, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): RaycastHit[];
    static RaycastAll(a: any, b?: any, c?: any, d?: any, e?: any): RaycastHit[] {
        const args = [a, b, c, d, e];
        let i = 1;
        if (isRay(a)) _o.set(a.o);
        else {
            _o.set(a);
            i = 2;
        }
        if (!setDir(isRay(a) ? a.d : b)) return [];
        const maxDist = dist(args[i]);
        const r = rayAll(_o, _dir, maxDist, maskOr(args[i + 1], Physics.DefaultRaycastLayers), wantTriggers(args[i + 2]));
        drawRay(_o, _dir, maxDist, r.length > 0, r.length ? r[r.length - 1].distance : 0);
        return r;
    }

    /** Fills `results` (existing entries are reused) and returns the count, at most results.length. */
    static RaycastNonAlloc(origin: Readonly<Vec3>, direction: Readonly<Vec3>, results: RaycastHit[], maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number;
    static RaycastNonAlloc(ray: geometry.Ray, results: RaycastHit[], maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number;
    static RaycastNonAlloc(a: any, b?: any, c?: any, d?: any, e?: any, f?: any): number {
        if (isRay(a)) return copyHits(Physics.RaycastAll(a, c, d, e), b);
        return copyHits(Physics.RaycastAll(a, b, d, e, f), c);
    }

    /** Is there any collider on the segment start-end? */
    static Linecast(start: Readonly<Vec3>, end: Readonly<Vec3>, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static Linecast(start: Readonly<Vec3>, end: Readonly<Vec3>, hitInfo: RaycastHit, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static Linecast(start: Readonly<Vec3>, end: Readonly<Vec3>, c?: any, d?: any, e?: any): boolean {
        const dir = new Vec3(end.x - start.x, end.y - start.y, end.z - start.z);
        const len = dir.length();
        if (c instanceof RaycastHit) return Physics.Raycast(start, dir, c, len, d, e);
        return Physics.Raycast(start, dir, len, c, d);
    }

    // ---------------------------------------------------------------- sphere casts

    static SphereCast(origin: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, hitInfo?: RaycastHit, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static SphereCast(origin: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static SphereCast(ray: geometry.Ray, radius: number, hitInfo?: RaycastHit, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static SphereCast(ray: geometry.Ray, radius: number, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static SphereCast(a: any, b: any, c?: any, d?: any, e?: any, f?: any, g?: any): boolean {
        const args = [a, b, c, d, e, f, g];
        let i = 2;
        let origin: Readonly<Vec3>;
        if (isRay(a)) {
            origin = a.o;
            if (!setDir(a.d)) return false;
        } else {
            origin = a;
            if (!setDir(c)) return false;
            i = 3;
        }
        let hit: RaycastHit | null = null;
        if (args[i] instanceof RaycastHit) hit = args[i++];
        else if (args[i] === undefined || args[i] === null) {
            if (args[i + 1] !== undefined || args[i] === null) i++;
        }
        const q = sphereQuery(origin, b);
        const maxDist = dist(args[i]);
        if (Physics.debugDrawQueries && !hit) hit = new RaycastHit();
        const ok = castClosest(q, maxDist, maskOr(args[i + 1], Physics.DefaultRaycastLayers), wantTriggers(args[i + 2]), hit);
        drawCast(q, maxDist, ok, hit ? hit.distance : 0);
        return ok;
    }

    static SphereCastAll(origin: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): RaycastHit[];
    static SphereCastAll(ray: geometry.Ray, radius: number, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): RaycastHit[];
    static SphereCastAll(a: any, b: any, c?: any, d?: any, e?: any, f?: any): RaycastHit[] {
        const args = [a, b, c, d, e, f];
        let i = 2;
        let origin: Readonly<Vec3>;
        if (isRay(a)) {
            origin = a.o;
            if (!setDir(a.d)) return [];
        } else {
            origin = a;
            if (!setDir(c)) return [];
            i = 3;
        }
        const q = sphereQuery(origin, b);
        const maxDist = dist(args[i]);
        const r = castAll(q, maxDist, maskOr(args[i + 1], Physics.DefaultRaycastLayers), wantTriggers(args[i + 2]));
        drawCast(q, maxDist, r.length > 0, r.length ? r[0].distance : 0);
        return r;
    }

    static SphereCastNonAlloc(origin: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, results: RaycastHit[], maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number;
    static SphereCastNonAlloc(ray: geometry.Ray, radius: number, results: RaycastHit[], maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number;
    static SphereCastNonAlloc(a: any, b: any, c: any, d?: any, e?: any, f?: any, g?: any): number {
        if (isRay(a)) return copyHits(Physics.SphereCastAll(a, b, d, e, f), c);
        return copyHits(Physics.SphereCastAll(a, b, c, e, f, g), d);
    }

    // ---------------------------------------------------------------- box casts

    static BoxCast(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, direction: Readonly<Vec3>, orientation?: Readonly<Quat>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static BoxCast(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, direction: Readonly<Vec3>, hitInfo: RaycastHit, orientation?: Readonly<Quat>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static BoxCast(center: any, halfExtents: any, direction: any, d?: any, e?: any, f?: any, g?: any, h?: any): boolean {
        if (!setDir(direction)) return false;
        const args = [d, e, f, g, h];
        let i = 0;
        let hit: RaycastHit | null = null;
        if (args[i] instanceof RaycastHit) hit = args[i++];
        let rot: Quat | null = null;
        if (isQuat(args[i])) rot = args[i++];
        else if (args[i] === null || (args[i] === undefined && args[i + 1] !== undefined)) i++;
        const q = boxQuery(center, halfExtents, rot);
        const maxDist = dist(args[i]);
        if (Physics.debugDrawQueries && !hit) hit = new RaycastHit();
        const ok = castClosest(q, maxDist, maskOr(args[i + 1], Physics.DefaultRaycastLayers), wantTriggers(args[i + 2]), hit);
        drawCast(q, maxDist, ok, hit ? hit.distance : 0);
        return ok;
    }

    static BoxCastAll(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, direction: Readonly<Vec3>, orientation?: Readonly<Quat>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): RaycastHit[] {
        if (!setDir(direction)) return [];
        const q = boxQuery(center, halfExtents, orientation || null);
        const maxDist = dist(maxDistance);
        const r = castAll(q, maxDist, maskOr(layerMask, Physics.DefaultRaycastLayers), wantTriggers(queryTriggerInteraction));
        drawCast(q, maxDist, r.length > 0, r.length ? r[0].distance : 0);
        return r;
    }

    static BoxCastNonAlloc(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, direction: Readonly<Vec3>, results: RaycastHit[], orientation?: Readonly<Quat>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number {
        return copyHits(Physics.BoxCastAll(center, halfExtents, direction, orientation, maxDistance, layerMask, queryTriggerInteraction), results);
    }

    // ---------------------------------------------------------------- capsule casts

    /** point1 / point2: the centres of the capsule's two end spheres. */
    static CapsuleCast(point1: Readonly<Vec3>, point2: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, hitInfo?: RaycastHit, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static CapsuleCast(point1: Readonly<Vec3>, point2: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean;
    static CapsuleCast(p1: any, p2: any, radius: any, direction: any, e?: any, f?: any, g?: any, h?: any): boolean {
        if (!setDir(direction)) return false;
        const args = [e, f, g, h];
        let i = 0;
        let hit: RaycastHit | null = null;
        if (args[i] instanceof RaycastHit) hit = args[i++];
        else if (args[i] === null) i++;
        const q = capsuleQuery(p1, p2, radius);
        const maxDist = dist(args[i]);
        if (Physics.debugDrawQueries && !hit) hit = new RaycastHit();
        const ok = castClosest(q, maxDist, maskOr(args[i + 1], Physics.DefaultRaycastLayers), wantTriggers(args[i + 2]), hit);
        drawCast(q, maxDist, ok, hit ? hit.distance : 0);
        return ok;
    }

    static CapsuleCastAll(point1: Readonly<Vec3>, point2: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): RaycastHit[] {
        if (!setDir(direction)) return [];
        const q = capsuleQuery(point1, point2, radius);
        const maxDist = dist(maxDistance);
        const r = castAll(q, maxDist, maskOr(layerMask, Physics.DefaultRaycastLayers), wantTriggers(queryTriggerInteraction));
        drawCast(q, maxDist, r.length > 0, r.length ? r[0].distance : 0);
        return r;
    }

    static CapsuleCastNonAlloc(point1: Readonly<Vec3>, point2: Readonly<Vec3>, radius: number, direction: Readonly<Vec3>, results: RaycastHit[], maxDistance?: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number {
        return copyHits(Physics.CapsuleCastAll(point1, point2, radius, direction, maxDistance, layerMask, queryTriggerInteraction), results);
    }

    // ---------------------------------------------------------------- overlaps

    static OverlapSphere(position: Readonly<Vec3>, radius: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): Collider[] {
        const q = _shape.setSphere(position, radius);
        const r = overlapList(q, maskOr(layerMask, Physics.AllLayers), wantTriggers(queryTriggerInteraction), false);
        drawOverlap(q, r.length > 0);
        return r;
    }

    static OverlapSphereNonAlloc(position: Readonly<Vec3>, radius: number, results: Collider[], layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number {
        return copyColliders(Physics.OverlapSphere(position, radius, layerMask, queryTriggerInteraction), results);
    }

    static OverlapBox(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, orientation?: Readonly<Quat>, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): Collider[] {
        const q = boxQuery(center, halfExtents, orientation || null).shape;
        const r = overlapList(q, maskOr(layerMask, Physics.AllLayers), wantTriggers(queryTriggerInteraction), false);
        drawOverlap(q, r.length > 0);
        return r;
    }

    static OverlapBoxNonAlloc(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, results: Collider[], orientation?: Readonly<Quat>, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number {
        return copyColliders(Physics.OverlapBox(center, halfExtents, orientation, layerMask, queryTriggerInteraction), results);
    }

    /** point0 / point1: the centres of the capsule's two end spheres. */
    static OverlapCapsule(point0: Readonly<Vec3>, point1: Readonly<Vec3>, radius: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): Collider[] {
        const q = _shape.setCapsule(point0, point1, radius);
        const r = overlapList(q, maskOr(layerMask, Physics.AllLayers), wantTriggers(queryTriggerInteraction), false);
        drawOverlap(q, r.length > 0);
        return r;
    }

    static OverlapCapsuleNonAlloc(point0: Readonly<Vec3>, point1: Readonly<Vec3>, radius: number, results: Collider[], layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): number {
        return copyColliders(Physics.OverlapCapsule(point0, point1, radius, layerMask, queryTriggerInteraction), results);
    }

    static CheckSphere(position: Readonly<Vec3>, radius: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean {
        const q = _shape.setSphere(position, radius);
        const ok = overlapList(q, maskOr(layerMask, Physics.DefaultRaycastLayers), wantTriggers(queryTriggerInteraction), true).length > 0;
        drawOverlap(q, ok);
        return ok;
    }

    static CheckBox(center: Readonly<Vec3>, halfExtents: Readonly<Vec3>, orientation?: Readonly<Quat>, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean {
        const q = boxQuery(center, halfExtents, orientation || null).shape;
        const ok = overlapList(q, maskOr(layerMask, Physics.DefaultRaycastLayers), wantTriggers(queryTriggerInteraction), true).length > 0;
        drawOverlap(q, ok);
        return ok;
    }

    static CheckCapsule(start: Readonly<Vec3>, end: Readonly<Vec3>, radius: number, layerMask?: number, queryTriggerInteraction?: QueryTriggerInteraction): boolean {
        const q = _shape.setCapsule(start, end, radius);
        const ok = overlapList(q, maskOr(layerMask, Physics.DefaultRaycastLayers), wantTriggers(queryTriggerInteraction), true).length > 0;
        drawOverlap(q, ok);
        return ok;
    }

    /**
     * Closest point of a collider to `point` (`point` itself when inside). By
     * default at the collider's current pose; position / rotation place the
     * collider's node elsewhere first, as Unity's version does. Mesh-like
     * colliders use their world bounds.
     */
    static ClosestPoint(point: Readonly<Vec3>, collider: Collider, position?: Readonly<Vec3>, rotation?: Readonly<Quat>): Vec3 {
        const out = new Vec3(point.x, point.y, point.z);
        if (!collider || !colliderShape(collider, _target)) return out;
        if (position || rotation) repose(_target, collider, position, rotation);
        closestPoint(_target, point, out);
        return out;
    }

    // ---------------------------------------------------------------- collision filtering

    /**
     * Makes two layers (not) collide by editing the collision matrix, then
     * re-applies the matrix to the bodies already in the scene of those layers.
     * Bodies created later read the matrix themselves.
     */
    static IgnoreLayerCollision(layer1: number, layer2: number, ignore = true): void {
        const s = sys();
        if (!s) return;
        setMatrixPair(s.collisionMatrix as any, layer1, layer2, !ignore);
        const b1 = (1 << layer1) >>> 0;
        const b2 = (1 << layer2) >>> 0;
        const cols = sceneColliders();
        for (let i = 0; i < cols.length; i++) {
            const g = colliderGroup(cols[i]);
            if (g & b1 || g & b2) {
                try {
                    cols[i].setMask((s.collisionMatrix as any)[g] >>> 0);
                } catch (e) {
                    // not initialized
                }
            }
        }
    }

    static GetIgnoreLayerCollision(layer1: number, layer2: number): boolean {
        const s = sys();
        if (!s) return false;
        return !matrixCollides(s.collisionMatrix as any, layer1, layer2);
    }

    /**
     * Stops contacts between two colliders. Native on Bullet (wasm); on the
     * other backends only PhysicsMessages honours it (their events between
     * the two are dropped), the bodies still collide. Returns whether the
     * contact itself is ignored.
     */
    static IgnoreCollision(collider1: Collider, collider2: Collider, ignore = true): boolean {
        if (!collider1 || !collider2) return false;
        const at = findPair(collider1, collider2);
        if (ignore && at < 0) ignoredPairs.push(collider1, collider2);
        if (!ignore && at >= 0) ignoredPairs.splice(at, 2);
        const ok = backendId() === 'bullet' && bulletIgnore(collider1, collider2, ignore);
        if (!ok && ignore && !warnedIgnore) {
            warnedIgnore = true;
            console.warn('[unity-style] Physics.IgnoreCollision only stops the contact on Bullet; on "' + backendId() + '" only the collision/trigger messages between the two colliders are dropped.');
        }
        return ok;
    }

    static GetIgnoreCollision(collider1: Collider, collider2: Collider): boolean {
        for (let i = ignoredPairs.length - 2; i >= 0; i -= 2) {
            if (!ignoredPairs[i].isValid || !ignoredPairs[i + 1].isValid) ignoredPairs.splice(i, 2);
        }
        return findPair(collider1, collider2) >= 0;
    }
}

function copyHits(src: RaycastHit[], results: RaycastHit[]): number {
    const n = Math.min(src.length, results ? results.length : 0);
    for (let i = 0; i < n; i++) {
        if (results[i] instanceof RaycastHit) results[i].copyFrom(src[i]);
        else results[i] = src[i];
    }
    return n;
}

function copyColliders(src: Collider[], results: Collider[]): number {
    const n = Math.min(src.length, results ? results.length : 0);
    for (let i = 0; i < n; i++) results[i] = src[i];
    return n;
}
