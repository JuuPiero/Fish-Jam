import { BoxCollider2D, CircleCollider2D, Collider2D, Color, Contact2DType, director, ERaycast2DType, IPhysics2DContact, PhysicsSystem2D, PolygonCollider2D, Quat, Rect, Size, Vec2, Vec3 } from 'cc';
import { cast2, CastHit2, overlapPoint2, overlaps2, raycast2, Shape2 } from '../core/geometry2d';
import { matrixCollides, setMatrixPair } from '../core/layers';
import { DebugDraw } from '../engine/debug-draw';
import { LayerMask } from './layer-mask';
import { RaycastHit2D } from './physics-types';

/** Unity's CapsuleDirection2D. */
export enum CapsuleDirection2D {
    Vertical = 0,
    Horizontal = 1,
}

const _q = new Quat();
const _p = new Vec3();
const _s = new Vec3();
const _shape = new Shape2();
const _target = new Shape2();
const _rect = new Rect();
const _b = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
const _hit: CastHit2 = { t: 0, px: 0, py: 0, nx: 0, ny: 0, cx: 0, cy: 0 };
const _v0 = new Vec2();
const _v1 = new Vec2();

const HIT = new Color(80, 220, 120, 255);
const MISS = new Color(230, 80, 80, 255);
const SHAPE = new Color(90, 170, 255, 255);

function sys(): PhysicsSystem2D | null {
    return PhysicsSystem2D ? PhysicsSystem2D.instance || null : null;
}

function backendId(): string {
    if (!PhysicsSystem2D) return '';
    if (PhysicsSystem2D.PHYSICS_BOX2D_WASM) return 'box2d-wasm';
    if (PhysicsSystem2D.PHYSICS_BOX2D) return 'box2d';
    if (PhysicsSystem2D.PHYSICS_BUILTIN) return 'builtin';
    return '';
}

/** The 2D shape of a collider in world units; false when it has none. */
export function collider2DShape(c: Collider2D, out: Shape2): boolean {
    const node = c.node;
    node.getWorldPosition(_p);
    node.getWorldRotation(_q);
    node.getWorldScale(_s);
    const ang = 2 * Math.atan2(_q.z, _q.w);
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const sx = Math.abs(_s.x);
    const sy = Math.abs(_s.y);
    const ox = c.offset.x * sx;
    const oy = c.offset.y * sy;
    if (CircleCollider2D && c instanceof CircleCollider2D) {
        out.setCircle(_p.x + ox * cs - oy * sn, _p.y + ox * sn + oy * cs, c.radius * sx);
        return true;
    }
    let pts: number[] | null = null;
    if (BoxCollider2D && c instanceof BoxCollider2D) {
        const hw = c.size.width / 2;
        const hh = c.size.height / 2;
        pts = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
        for (let i = 0; i < 8; i += 2) {
            pts[i] = pts[i] * sx + ox;
            pts[i + 1] = pts[i + 1] * sy + oy;
        }
    } else if (PolygonCollider2D && c instanceof PolygonCollider2D) {
        const src = c.points;
        pts = [];
        for (let i = 0; i < src.length; i++) {
            pts.push(src[i].x * sx + ox, src[i].y * sy + oy);
        }
    }
    if (!pts || pts.length < 2) return false;
    for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i];
        const y = pts[i + 1];
        pts[i] = _p.x + x * cs - y * sn;
        pts[i + 1] = _p.y + x * sn + y * cs;
    }
    out.setPolygon(pts);
    return true;
}

function wantTriggers(): boolean {
    return Physics2D.queriesHitTriggers;
}

function maskOr(m: any, def: number): number {
    return typeof m === 'number' ? m | 0 : def;
}

function dist(d: any): number {
    if (typeof d !== 'number' || d !== d || d > Physics2D.infiniteDistance) return Physics2D.infiniteDistance;
    return d < 0 ? 0 : d;
}

function accept(c: Collider2D | null, mask: number, minDepth: any, maxDepth: any): boolean {
    if (!c || !c.isValid || !c.enabledInHierarchy) return false;
    if (!wantTriggers() && c.sensor) return false;
    if (mask !== -1 && !((c.group & (mask >>> 0)) >>> 0)) return false;
    const z = c.node.worldPosition.z;
    if (typeof minDepth === 'number' && z < minDepth) return false;
    if (typeof maxDepth === 'number' && z > maxDepth) return false;
    return true;
}

/** Colliders whose bounds may touch the rect (the backend's own broadphase). */
function candidates(xMin: number, yMin: number, xMax: number, yMax: number): Collider2D[] {
    const s = sys();
    if (!s) return [];
    _rect.set(xMin, yMin, Math.max(xMax - xMin, 1e-6), Math.max(yMax - yMin, 1e-6));
    const r = s.testAABB(_rect);
    const out: Collider2D[] = [];
    for (let i = 0; i < r.length; i++) out.push(r[i]);
    return out;
}

function makeHit(c: Collider2D, h: CastHit2, maxDist: number): RaycastHit2D {
    const r = new RaycastHit2D();
    r.collider = c;
    r.point.set(h.px, h.py);
    r.normal.set(h.nx, h.ny);
    r.distance = h.t;
    r.fraction = maxDist > 0 ? h.t / maxDist : 0;
    r.centroid.set(h.cx, h.cy);
    return r;
}

function byDistance(a: RaycastHit2D, b: RaycastHit2D): number {
    return a.distance - b.distance;
}

/** A shape cast of q against every candidate along the sweep; sorted hits. */
function castShape(q: Shape2, dx: number, dy: number, maxDist: number, mask: number, minDepth: any, maxDepth: any, firstOnly: boolean): RaycastHit2D[] {
    q.bounds(_b);
    const reach = Math.min(maxDist, Physics2D.infiniteDistance);
    const xMin = Math.min(_b.xMin, _b.xMin + dx * reach);
    const yMin = Math.min(_b.yMin, _b.yMin + dy * reach);
    const xMax = Math.max(_b.xMax, _b.xMax + dx * reach);
    const yMax = Math.max(_b.yMax, _b.yMax + dy * reach);
    const cands = candidates(xMin, yMin, xMax, yMax);
    const out: RaycastHit2D[] = [];
    let best = maxDist;
    for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (!accept(c, mask, minDepth, maxDepth)) continue;
        if (!collider2DShape(c, _target)) continue;
        const t = cast2(q, dx, dy, firstOnly ? best : maxDist, _target, _hit);
        if (t < 0) continue;
        if (t === 0 && !Physics2D.queriesStartInColliders) continue;
        out.push(makeHit(c, _hit, maxDist));
        if (firstOnly && t < best) best = t;
    }
    out.sort(byDistance);
    if (firstOnly && out.length > 1) out.length = 1;
    return out;
}

function rayHits(ox: number, oy: number, dx: number, dy: number, maxDist: number, mask: number, minDepth: any, maxDepth: any, firstOnly: boolean): RaycastHit2D[] {
    const s = sys();
    if (!s) return [];
    const b = backendId();
    if (b === 'builtin' || Physics2D.emulateRaycasts) {
        return castShape(_shape.setCircle(ox, oy, 0), dx, dy, maxDist, mask, minDepth, maxDepth, firstOnly);
    }
    const out: RaycastHit2D[] = [];
    if (maxDist > 0) {
        _v0.set(ox, oy);
        _v1.set(ox + dx * maxDist, oy + dy * maxDist);
        // with triggers excluded or a depth range, the closest native hit may be skipped: ask for all
        const filtered = !wantTriggers() || typeof minDepth === 'number' || typeof maxDepth === 'number';
        const type = firstOnly && !filtered ? ERaycast2DType.Closest : ERaycast2DType.All;
        const rs = s.raycast(_v0, _v1, type, mask >>> 0);
        for (let i = 0; i < rs.length; i++) {
            const r = rs[i];
            if (!accept(r.collider, mask, minDepth, maxDepth)) continue;
            const h = new RaycastHit2D();
            h.collider = r.collider;
            h.point.set(r.point.x, r.point.y);
            h.normal.set(r.normal.x, r.normal.y);
            h.fraction = r.fraction;
            h.distance = r.fraction * maxDist;
            h.centroid.set(h.point);
            out.push(h);
        }
    }
    // Box2D does not report a collider containing the origin; Unity does (queriesStartInColliders)
    if (Physics2D.queriesStartInColliders) {
        const inside = Physics2D.OverlapPointAll(_v0.set(ox, oy), mask, minDepth, maxDepth);
        for (let i = 0; i < inside.length; i++) {
            let dup = false;
            for (let j = 0; j < out.length; j++) if (out[j].collider === inside[i] && out[j].distance === 0) dup = true;
            if (dup) continue;
            const h = new RaycastHit2D();
            h.collider = inside[i];
            h.point.set(ox, oy);
            h.normal.set(-dx, -dy);
            h.centroid.set(ox, oy);
            out.push(h);
        }
    }
    out.sort(byDistance);
    if (firstOnly && out.length > 1) out.length = 1;
    return out;
}

function normDir(d: Readonly<Vec2>): Vec2 | null {
    const l = Math.sqrt(d.x * d.x + d.y * d.y);
    if (!(l > 0)) return null;
    return new Vec2(d.x / l, d.y / l);
}

function overlapAll(q: Shape2, mask: number, minDepth: any, maxDepth: any, firstOnly: boolean): Collider2D[] {
    q.bounds(_b);
    const cands = candidates(_b.xMin, _b.yMin, _b.xMax, _b.yMax);
    const out: Collider2D[] = [];
    for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (!accept(c, mask, minDepth, maxDepth)) continue;
        if (!collider2DShape(c, _target)) continue;
        if (overlaps2(q, _target)) {
            out.push(c);
            if (firstOnly) break;
        }
    }
    if (Physics2D.debugDrawQueries) drawShape(q, out.length ? HIT : SHAPE);
    return out;
}

function capsuleShape(point: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, direction: CapsuleDirection2D, angle: number, out: Shape2): Shape2 {
    const w = (size as any).width !== undefined ? (size as Size).width : (size as Vec2).x;
    const h = (size as any).height !== undefined ? (size as Size).height : (size as Vec2).y;
    let r: number;
    let half: number;
    let ax: number;
    let ay: number;
    if (direction === CapsuleDirection2D.Horizontal) {
        r = h / 2;
        half = Math.max(0, w / 2 - r);
        ax = 1;
        ay = 0;
    } else {
        r = w / 2;
        half = Math.max(0, h / 2 - r);
        ax = 0;
        ay = 1;
    }
    const a = ((angle || 0) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ux = ax * c - ay * s;
    const uy = ax * s + ay * c;
    return out.setCapsule(point.x - ux * half, point.y - uy * half, point.x + ux * half, point.y + uy * half, r);
}

function copyShape(q: Shape2): Shape2 {
    const c = new Shape2().setPolygon(q.v);
    c.n = q.n;
    c.closed = q.closed;
    c.r = q.r;
    c.cx = q.cx;
    c.cy = q.cy;
    return c;
}

function sizeOf(size: Readonly<Vec2> | Readonly<Size>): { w: number; h: number } {
    return (size as any).width !== undefined ? { w: (size as Size).width, h: (size as Size).height } : { w: (size as Vec2).x, h: (size as Vec2).y };
}

function drawShape(s: Shape2, color: Color): void {
    const d = Physics2D.debugDrawDuration;
    const z = Physics2D.debugDrawZ;
    if (s.n === 1) {
        DebugDraw.circle(new Vec3(s.v[0], s.v[1], z), Vec3.UNIT_Z, Math.max(s.r, 1e-3), color, d);
        return;
    }
    const ne = s.closed ? s.n : s.n - 1;
    for (let i = 0; i < ne; i++) {
        const j = (i + 1) % s.n;
        DebugDraw.line(new Vec3(s.v[2 * i], s.v[2 * i + 1], z), new Vec3(s.v[2 * j], s.v[2 * j + 1], z), color, d);
    }
    if (s.r > 0) {
        for (let i = 0; i < s.n; i++) DebugDraw.circle(new Vec3(s.v[2 * i], s.v[2 * i + 1], z), Vec3.UNIT_Z, s.r, color, d);
    }
}

function drawRay(ox: number, oy: number, dx: number, dy: number, maxDist: number, hit: RaycastHit2D | null): void {
    if (!Physics2D.debugDrawQueries) return;
    const len = hit ? hit.distance : Math.min(maxDist, Physics2D.debugDrawMissLength);
    const z = Physics2D.debugDrawZ;
    DebugDraw.line(new Vec3(ox, oy, z), new Vec3(ox + dx * len, oy + dy * len, z), hit ? HIT : MISS, Physics2D.debugDrawDuration);
}

// ------------------------------------------------------------------ IgnoreCollision (2D)

const ignored2D: Collider2D[] = [];

function ignoredIndex(a: Collider2D, b: Collider2D): number {
    for (let i = 0; i < ignored2D.length; i += 2) {
        if ((ignored2D[i] === a && ignored2D[i + 1] === b) || (ignored2D[i] === b && ignored2D[i + 1] === a)) return i;
    }
    return -1;
}

function onPreSolve(self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null): void {
    if (contact && ignoredIndex(self, other) >= 0) contact.disabled = true;
}

/**
 * Unity's Physics2D over the Cocos PhysicsSystem2D (Box2D or builtin).
 * Queries return RaycastHit2D / Collider2D, or null for nothing, so
 * `if (hit)` works. Distances and positions are in world units (pixels in
 * a usual 2D scene).
 */
export class Physics2D {
    static readonly AllLayers = -1;
    static readonly DefaultRaycastLayers = -1;
    /** Do queries report sensor (trigger) colliders? */
    static queriesHitTriggers = true;
    /** Do rays and casts that start inside a collider report it (distance 0, normal = -direction)? */
    static queriesStartInColliders = true;
    /** What an infinite distance becomes (Box2D needs an end point). */
    static infiniteDistance = 100000;
    /** Use the geometric ray cast even on Box2D (testing). */
    static emulateRaycasts = false;
    static debugDrawQueries = false;
    static debugDrawDuration = 0;
    static debugDrawMissLength = 2000;
    /** z of the drawn 2D queries. */
    static debugDrawZ = 0;

    static get IgnoreRaycastLayer(): number {
        const l = LayerMask.NameToLayer('Ignore Raycast');
        return l >= 0 ? 1 << l : 0;
    }

    /** 'box2d-wasm' | 'box2d' | 'builtin' | '' */
    static get backend(): string {
        return backendId();
    }

    static get gravity(): Vec2 {
        const s = sys();
        return s ? s.gravity.clone() : new Vec2(0, -10);
    }

    static set gravity(v: Vec2) {
        const s = sys();
        if (s) s.gravity = new Vec2(v.x, v.y);
    }

    static get autoSimulation(): boolean {
        const s = sys();
        return s ? s.autoSimulation : false;
    }

    static set autoSimulation(v: boolean) {
        const s = sys();
        if (s) s.autoSimulation = v;
    }

    static Simulate(step: number): void {
        const s = sys();
        if (s) s.step(step);
    }

    // ---------------------------------------------------------------- rays

    /** The first hit, or null. */
    static Raycast(origin: Readonly<Vec2>, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D | null {
        const d = normDir(direction);
        if (!d) return null;
        const maxDist = dist(distance);
        const r = rayHits(origin.x, origin.y, d.x, d.y, maxDist, maskOr(layerMask, Physics2D.DefaultRaycastLayers & ~Physics2D.IgnoreRaycastLayer), minDepth, maxDepth, true);
        const h = r.length ? r[0] : null;
        drawRay(origin.x, origin.y, d.x, d.y, maxDist, h);
        return h;
    }

    /** Every hit, nearest first. */
    static RaycastAll(origin: Readonly<Vec2>, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D[] {
        const d = normDir(direction);
        if (!d) return [];
        const maxDist = dist(distance);
        const r = rayHits(origin.x, origin.y, d.x, d.y, maxDist, maskOr(layerMask, Physics2D.DefaultRaycastLayers & ~Physics2D.IgnoreRaycastLayer), minDepth, maxDepth, false);
        drawRay(origin.x, origin.y, d.x, d.y, maxDist, r.length ? r[r.length - 1] : null);
        return r;
    }

    static Linecast(start: Readonly<Vec2>, end: Readonly<Vec2>, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D | null {
        const dir = new Vec2(end.x - start.x, end.y - start.y);
        const len = dir.length();
        if (len === 0) return null;
        return Physics2D.Raycast(start, dir, len, layerMask, minDepth, maxDepth);
    }

    static LinecastAll(start: Readonly<Vec2>, end: Readonly<Vec2>, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D[] {
        const dir = new Vec2(end.x - start.x, end.y - start.y);
        const len = dir.length();
        if (len === 0) return [];
        return Physics2D.RaycastAll(start, dir, len, layerMask, minDepth, maxDepth);
    }

    // ---------------------------------------------------------------- shape casts

    static CircleCast(origin: Readonly<Vec2>, radius: number, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D | null {
        const r = Physics2D.CircleCastAll(origin, radius, direction, distance, layerMask, minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static CircleCastAll(origin: Readonly<Vec2>, radius: number, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number, firstOnly = false): RaycastHit2D[] {
        const d = normDir(direction);
        if (!d) return [];
        const q = new Shape2().setCircle(origin.x, origin.y, radius);
        return Physics2D.cast(q, d, distance, layerMask, minDepth, maxDepth, firstOnly);
    }

    /** size: full width/height; angle: degrees. */
    static BoxCast(origin: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, angle: number, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D | null {
        const r = Physics2D.BoxCastAll(origin, size, angle, direction, distance, layerMask, minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static BoxCastAll(origin: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, angle: number, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number, firstOnly = false): RaycastHit2D[] {
        const d = normDir(direction);
        if (!d) return [];
        const sz = sizeOf(size);
        const q = new Shape2().setBox(origin.x, origin.y, sz.w, sz.h, angle || 0);
        q.cx = origin.x;
        q.cy = origin.y;
        return Physics2D.cast(q, d, distance, layerMask, minDepth, maxDepth, firstOnly);
    }

    static CapsuleCast(origin: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, capsuleDirection: CapsuleDirection2D, angle: number, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number): RaycastHit2D | null {
        const r = Physics2D.CapsuleCastAll(origin, size, capsuleDirection, angle, direction, distance, layerMask, minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static CapsuleCastAll(origin: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, capsuleDirection: CapsuleDirection2D, angle: number, direction: Readonly<Vec2>, distance?: number, layerMask?: number, minDepth?: number, maxDepth?: number, firstOnly = false): RaycastHit2D[] {
        const d = normDir(direction);
        if (!d) return [];
        const q = capsuleShape(origin, size, capsuleDirection, angle, new Shape2());
        return Physics2D.cast(q, d, distance, layerMask, minDepth, maxDepth, firstOnly);
    }

    private static cast(q: Shape2, d: Vec2, distance: number | undefined, layerMask: number | undefined, minDepth: any, maxDepth: any, firstOnly: boolean): RaycastHit2D[] {
        const maxDist = dist(distance);
        const r = castShape(q, d.x, d.y, maxDist, maskOr(layerMask, Physics2D.DefaultRaycastLayers & ~Physics2D.IgnoreRaycastLayer), minDepth, maxDepth, firstOnly);
        if (Physics2D.debugDrawQueries) {
            drawShape(q, SHAPE);
            drawRay(q.cx, q.cy, d.x, d.y, maxDist, r.length ? r[0] : null);
            if (r.length) drawShape(copyShape(q).translate(d.x * r[0].distance, d.y * r[0].distance), HIT);
        }
        return r;
    }

    // ---------------------------------------------------------------- overlaps

    static OverlapPoint(point: Readonly<Vec2>, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D | null {
        const r = Physics2D.OverlapPointAll(point, layerMask, minDepth, maxDepth);
        return r.length ? r[0] : null;
    }

    static OverlapPointAll(point: Readonly<Vec2>, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D[] {
        const mask = maskOr(layerMask, Physics2D.AllLayers);
        const cands = candidates(point.x - 0.5, point.y - 0.5, point.x + 0.5, point.y + 0.5);
        const out: Collider2D[] = [];
        for (let i = 0; i < cands.length; i++) {
            const c = cands[i];
            if (!accept(c, mask, minDepth, maxDepth)) continue;
            if (collider2DShape(c, _target) && overlapPoint2(_target, point.x, point.y)) out.push(c);
        }
        return out;
    }

    static OverlapCircle(point: Readonly<Vec2>, radius: number, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D | null {
        const r = overlapAll(_shape.setCircle(point.x, point.y, radius), maskOr(layerMask, Physics2D.AllLayers), minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static OverlapCircleAll(point: Readonly<Vec2>, radius: number, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D[] {
        return overlapAll(_shape.setCircle(point.x, point.y, radius), maskOr(layerMask, Physics2D.AllLayers), minDepth, maxDepth, false);
    }

    /** size: full width/height; angle: degrees. */
    static OverlapBox(point: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, angle?: number, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D | null {
        const r = Physics2D.OverlapBoxAll(point, size, angle, layerMask, minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static OverlapBoxAll(point: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, angle?: number, layerMask?: number, minDepth?: number, maxDepth?: number, firstOnly = false): Collider2D[] {
        const sz = sizeOf(size);
        return overlapAll(_shape.setBox(point.x, point.y, sz.w, sz.h, angle || 0), maskOr(layerMask, Physics2D.AllLayers), minDepth, maxDepth, firstOnly);
    }

    /** The axis-aligned rectangle between two corners. */
    static OverlapArea(pointA: Readonly<Vec2>, pointB: Readonly<Vec2>, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D | null {
        const r = Physics2D.OverlapAreaAll(pointA, pointB, layerMask, minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static OverlapAreaAll(pointA: Readonly<Vec2>, pointB: Readonly<Vec2>, layerMask?: number, minDepth?: number, maxDepth?: number, firstOnly = false): Collider2D[] {
        const x0 = Math.min(pointA.x, pointB.x);
        const y0 = Math.min(pointA.y, pointB.y);
        const x1 = Math.max(pointA.x, pointB.x);
        const y1 = Math.max(pointA.y, pointB.y);
        return overlapAll(_shape.setPolygon([x0, y0, x1, y0, x1, y1, x0, y1]), maskOr(layerMask, Physics2D.AllLayers), minDepth, maxDepth, firstOnly);
    }

    static OverlapCapsule(point: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, direction: CapsuleDirection2D, angle?: number, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D | null {
        const r = overlapAll(capsuleShape(point, size, direction, angle || 0, _shape), maskOr(layerMask, Physics2D.AllLayers), minDepth, maxDepth, true);
        return r.length ? r[0] : null;
    }

    static OverlapCapsuleAll(point: Readonly<Vec2>, size: Readonly<Vec2> | Readonly<Size>, direction: CapsuleDirection2D, angle?: number, layerMask?: number, minDepth?: number, maxDepth?: number): Collider2D[] {
        return overlapAll(capsuleShape(point, size, direction, angle || 0, _shape), maskOr(layerMask, Physics2D.AllLayers), minDepth, maxDepth, false);
    }

    /** Overlap of a collider's own shape with others (Unity's Physics2D.OverlapCollider, without the ContactFilter2D). */
    static OverlapCollider(collider: Collider2D, layerMask?: number): Collider2D[] {
        const q = new Shape2();
        if (!collider2DShape(collider, q)) return [];
        const r = overlapAll(q, maskOr(layerMask, Physics2D.AllLayers), undefined, undefined, false);
        const i = r.indexOf(collider);
        if (i >= 0) r.splice(i, 1);
        return r;
    }

    /** Point of a collider closest to `position` (the position itself when inside). */
    static ClosestPoint(position: Readonly<Vec2>, collider: Collider2D): Vec2 {
        const q = new Shape2();
        if (!collider2DShape(collider, q)) return new Vec2(position.x, position.y);
        if (overlapPoint2(q, position.x, position.y)) return new Vec2(position.x, position.y);
        // a zero-radius point cast toward the shape's centre finds the nearest surface point only for circles;
        // use the nearest point over the edges instead
        let best = Infinity;
        let bx = position.x;
        let by = position.y;
        const ne = q.n <= 1 ? 1 : q.closed ? q.n : q.n - 1;
        for (let i = 0; i < ne; i++) {
            const j = q.n <= 1 ? 0 : (i + 1) % q.n;
            const ax = q.v[2 * i];
            const ay = q.v[2 * i + 1];
            const ex = q.v[2 * j] - ax;
            const ey = q.v[2 * j + 1] - ay;
            const ll = ex * ex + ey * ey;
            let t = ll > 0 ? ((position.x - ax) * ex + (position.y - ay) * ey) / ll : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = ax + ex * t;
            const py = ay + ey * t;
            const d = Math.hypot(position.x - px, position.y - py);
            if (d < best) {
                best = d;
                bx = px + (d > 0 ? ((position.x - px) / d) * q.r : 0);
                by = py + (d > 0 ? ((position.y - py) / d) * q.r : 0);
            }
        }
        return new Vec2(bx, by);
    }

    // ---------------------------------------------------------------- filtering

    /** Edits the 2D collision matrix and refreshes the colliders of those layers. */
    static IgnoreLayerCollision(layer1: number, layer2: number, ignore = true): void {
        const s = sys();
        if (!s) return;
        setMatrixPair(s.collisionMatrix as any, layer1, layer2, !ignore);
        const b1 = (1 << layer1) >>> 0;
        const b2 = (1 << layer2) >>> 0;
        const scene = director.getScene();
        if (!scene || !Collider2D) return;
        const cols = scene.getComponentsInChildren(Collider2D) as Collider2D[];
        for (let i = 0; i < cols.length; i++) {
            const g = cols[i].group >>> 0;
            if (g & b1 || g & b2) cols[i].group = cols[i].group; // re-reads the matrix into the fixture filter
        }
    }

    static GetIgnoreLayerCollision(layer1: number, layer2: number): boolean {
        const s = sys();
        return s ? !matrixCollides(s.collisionMatrix as any, layer1, layer2) : false;
    }

    /**
     * Stops contacts between two colliders: on Box2D the contact is disabled
     * in pre-solve (this turns on enabledContactListener of their bodies);
     * PhysicsMessages drops the messages between them on every backend.
     */
    static IgnoreCollision(collider1: Collider2D, collider2: Collider2D, ignore = true): void {
        if (!collider1 || !collider2) return;
        const at = ignoredIndex(collider1, collider2);
        if (ignore && at < 0) {
            ignored2D.push(collider1, collider2);
            const pair = [collider1, collider2];
            for (let i = 0; i < 2; i++) {
                const c = pair[i];
                c.off(Contact2DType.PRE_SOLVE, onPreSolve);
                c.on(Contact2DType.PRE_SOLVE, onPreSolve);
                if (c.body) c.body.enabledContactListener = true;
            }
        } else if (!ignore && at >= 0) {
            ignored2D.splice(at, 2);
        }
    }

    static GetIgnoreCollision(collider1: Collider2D, collider2: Collider2D): boolean {
        for (let i = ignored2D.length - 2; i >= 0; i -= 2) {
            if (!ignored2D[i].isValid || !ignored2D[i + 1].isValid) ignored2D.splice(i, 2);
        }
        return ignoredIndex(collider1, collider2) >= 0;
    }
}
