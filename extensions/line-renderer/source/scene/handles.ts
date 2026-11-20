/**
 * Move / rotate / scale handles for the selected points. The handle follows
 * the Cocos transform tool (W / E / R), pivot and coordinate settings.
 */
import {
    V3, Q4, v3, q4, copy, add, sub, scale, scaleAndAdd, dot, cross, normalize, lenSq, qRotate, qFromAxisAngle, EPSILON,
} from '../../assets/core/math';
import {
    cameraForward, cameraPosition, closestOnLine, distToSegment, pointInPolygon, rayPlane, screenRay, toScreen, worldPerPixel,
} from './view';
import * as D from './draw';
import { nodeRotation, pointWorld, setPointWorld } from './model';
import { HandleAxis } from './state';
import { coordinateMode, is2DView, pivotMode, snapConfig, transformToolName } from './env';

export type HandleKind = 'move' | 'rotate' | 'scale';

export interface HandleFrame {
    kind: HandleKind;
    pivot: V3;
    axes: [V3, V3, V3];
    size: number;
    is2D: boolean;
}

const AXIS_PX = 90;
const HIT_PX = 7;
const AXIS_INDEX: Record<string, number> = { x: 0, y: 1, z: 2 };
const AXES: HandleAxis[] = ['x', 'y', 'z'];
const PLANES: { axis: HandleAxis; a: number; b: number; n: number }[] = [
    { axis: 'xy', a: 0, b: 1, n: 2 },
    { axis: 'yz', a: 1, b: 2, n: 0 },
    { axis: 'xz', a: 0, b: 2, n: 1 },
];

export function handleKind(): HandleKind | null {
    switch (transformToolName()) {
        case 'position':
        case 'rect':
            return 'move';
        case 'rotation':
            return 'rotate';
        case 'scale':
            return 'scale';
        default:
            return null;
    }
}

export function computeFrame(cam: any, comp: any, indices: number[], axesOverride?: [V3, V3, V3] | null): HandleFrame | null {
    const kind = handleKind();
    if (!kind || !indices.length) return null;
    let pivot: V3;
    if (pivotMode() === 'pivot') pivot = pointWorld(comp, indices[indices.length - 1]);
    else {
        pivot = v3();
        for (const i of indices) add(pivot, pivot, pointWorld(comp, i));
        scale(pivot, pivot, 1 / indices.length);
    }
    let axes: [V3, V3, V3] = [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)];
    if (coordinateMode() === 'local') {
        const q = nodeRotation(comp);
        axes = [qRotate(v3(), q, v3(1, 0, 0)), qRotate(v3(), q, v3(0, 1, 0)), qRotate(v3(), q, v3(0, 0, 1))];
    }
    return { kind, pivot, axes: axesOverride ?? axes, size: worldPerPixel(cam, pivot) * AXIS_PX, is2D: is2DView() };
}

function axisColor(i: number) {
    return i === 0 ? D.Colors.axisX : i === 1 ? D.Colors.axisY : D.Colors.axisZ;
}

function visibleAxes(f: HandleFrame): number[] {
    return f.is2D ? [0, 1] : [0, 1, 2];
}

function visiblePlanes(f: HandleFrame) {
    return f.is2D ? PLANES.filter((p) => p.axis === 'xy') : PLANES;
}

function planeQuad(cam: any, f: HandleFrame, p: { a: number; b: number }): V3[] {
    const toCam = sub(v3(), cameraPosition(cam), f.pivot);
    const sa = dot(f.axes[p.a], toCam) >= 0 ? 1 : -1;
    const sb = dot(f.axes[p.b], toCam) >= 0 ? 1 : -1;
    const lo = f.size * 0.16;
    const hi = f.size * 0.4;
    const pt = (x: number, y: number) => add(v3(), add(v3(), f.pivot, scale(v3(), f.axes[p.a], x * sa)), scale(v3(), f.axes[p.b], y * sb));
    return [pt(lo, lo), pt(hi, lo), pt(hi, hi), pt(lo, hi)];
}

function ringPoints(f: HandleFrame, normal: V3, radius: number, segments = 48): V3[] {
    const n = normalize(v3(), normal);
    const u = normalize(v3(), cross(v3(), Math.abs(n.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0), n));
    const w = cross(v3(), n, u);
    const pts: V3[] = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(add(v3(), f.pivot, add(v3(), scale(v3(), u, Math.cos(a) * radius), scale(v3(), w, Math.sin(a) * radius))));
    }
    return pts;
}

export function drawHandle(cam: any, f: HandleFrame, hot: HandleAxis | null): void {
    const hotColor = D.Colors.axisHot;
    if (f.kind === 'rotate') {
        for (const i of [0, 1, 2]) {
            if (f.is2D && i !== 2) continue;
            D.ring(f.pivot, f.axes[i], f.size, hot === AXES[i] ? hotColor : axisColor(i), 64, false, !f.is2D);
        }
        D.ring(f.pivot, cameraForward(cam), f.size * 1.15, hot === 'view' ? hotColor : D.Colors.axisView, 64);
        return;
    }
    for (const i of visibleAxes(f)) {
        const col = hot === AXES[i] ? hotColor : axisColor(i);
        const tip = scaleAndAdd(v3(), f.pivot, f.axes[i], f.size);
        D.thickLine(f.pivot, tip, col, 2);
        if (f.kind === 'move') D.cone(scaleAndAdd(v3(), f.pivot, f.axes[i], f.size * 0.82), f.axes[i], f.size * 0.22, f.size * 0.07, col);
        else D.cube(tip, f.size * 0.06, f.axes[0], f.axes[1], f.axes[2], col);
    }
    if (f.kind === 'move') {
        for (const p of visiblePlanes(f)) {
            const q = planeQuad(cam, f, p);
            const col = hot === p.axis ? hotColor : axisColor(p.n);
            D.quad(q[0], q[1], q[2], q[3], D.withAlpha(col, hot === p.axis ? 110 : 60), true);
            D.quad(q[0], q[1], q[2], q[3], col, false);
        }
        D.square(f.pivot, 5, hot === 'free' ? hotColor : D.Colors.axisView, false);
    } else {
        D.cube(f.pivot, f.size * 0.08, f.axes[0], f.axes[1], f.axes[2], hot === 'free' ? hotColor : D.Colors.axisView);
    }
}

export function hitHandle(cam: any, f: HandleFrame, mx: number, my: number): HandleAxis | null {
    const sp = toScreen(cam, f.pivot);
    if (!sp.visible) return null;
    if (f.kind === 'rotate') {
        let best: HandleAxis | null = null;
        let bestD = HIT_PX;
        const test = (axis: HandleAxis, pts: V3[]) => {
            let prev = toScreen(cam, pts[0]);
            for (let i = 1; i < pts.length; i++) {
                const cur = toScreen(cam, pts[i]);
                const d = distToSegment(mx, my, prev.x, prev.y, cur.x, cur.y).dist;
                if (d < bestD) {
                    bestD = d;
                    best = axis;
                }
                prev = cur;
            }
        };
        for (const i of [0, 1, 2]) {
            if (f.is2D && i !== 2) continue;
            test(AXES[i], ringPoints(f, f.axes[i], f.size));
        }
        test('view', ringPoints(f, cameraForward(cam), f.size * 1.15));
        return best;
    }
    if (Math.hypot(mx - sp.x, my - sp.y) <= (f.kind === 'scale' ? 9 : 7)) return 'free';
    let best: HandleAxis | null = null;
    let bestD = HIT_PX;
    for (const i of visibleAxes(f)) {
        const tip = toScreen(cam, scaleAndAdd(v3(), f.pivot, f.axes[i], f.size * 1.05));
        const d = distToSegment(mx, my, sp.x, sp.y, tip.x, tip.y).dist;
        if (d < bestD) {
            bestD = d;
            best = AXES[i];
        }
    }
    if (best) return best;
    if (f.kind === 'move') {
        for (const p of visiblePlanes(f)) {
            if (pointInPolygon(mx, my, planeQuad(cam, f, p).map((w) => toScreen(cam, w)))) return p.axis;
        }
    }
    return null;
}

export interface HandleDrag {
    frame: HandleFrame;
    axis: HandleAxis;
    /** Applies the drag for the current mouse position. Returns a status text. */
    update(mx: number, my: number, ev: any): string;
}

function snapStep(v: number, step: number): number {
    return step > 0 ? Math.round(v / step) * step : v;
}

function constraintPoint(cam: any, f: HandleFrame, axis: HandleAxis, mx: number, my: number): V3 | null {
    const ray = screenRay(cam, mx, my);
    if (axis in AXIS_INDEX) return closestOnLine(ray, f.pivot, f.axes[AXIS_INDEX[axis]]);
    if (axis === 'free') return rayPlane(ray, f.pivot, cameraForward(cam), true);
    const p = PLANES.find((pl) => pl.axis === axis);
    return p ? rayPlane(ray, f.pivot, f.axes[p.n], true) : null;
}

export function startHandleDrag(cam: any, f: HandleFrame, axis: HandleAxis, mx: number, my: number, comp: any, indices: number[]): HandleDrag | null {
    const starts = indices.map((i) => ({ i, pos: pointWorld(comp, i) }));
    if (!starts.length) return null;
    const pivot = copy(v3(), f.pivot);

    if (f.kind === 'move') {
        const start = constraintPoint(cam, f, axis, mx, my);
        if (!start) return null;
        return {
            frame: f,
            axis,
            update(x, y, ev) {
                const cur = constraintPoint(cam, f, axis, x, y);
                if (!cur) return '';
                const delta = sub(v3(), cur, start);
                const snap = snapConfig();
                if (snap.isPositionSnapEnabled !== !!ev?.ctrlKey) {
                    const steps = [snap.position.x, snap.position.y, snap.position.z];
                    const out = v3();
                    for (let i = 0; i < 3; i++) scaleAndAdd(out, out, f.axes[i], snapStep(dot(delta, f.axes[i]), steps[i]));
                    copy(delta, out);
                }
                for (const s of starts) setPointWorld(comp, s.i, add(v3(), s.pos, delta));
                return `Δ ${[0, 1, 2].map((i) => dot(delta, f.axes[i]).toFixed(3)).join(', ')}`;
            },
        };
    }

    if (f.kind === 'rotate') {
        const n = axis === 'view' ? scale(v3(), cameraForward(cam), -1) : copy(v3(), f.axes[AXIS_INDEX[axis] ?? 2]);
        const sp = toScreen(cam, pivot);
        const onPlane = (x: number, y: number) => {
            const hit = rayPlane(screenRay(cam, x, y), pivot, n, true);
            if (!hit) return null;
            const v = sub(v3(), hit, pivot);
            return lenSq(v) > EPSILON ? v : null;
        };
        const v0 = Math.abs(dot(n, cameraForward(cam))) < 0.15 ? null : onPlane(mx, my);
        const a0 = Math.atan2(my - sp.y, mx - sp.x);
        const screenSign = dot(n, cameraForward(cam)) > 0 ? 1 : -1;
        return {
            frame: f,
            axis,
            update(x, y, ev) {
                let angle: number;
                const v1 = v0 ? onPlane(x, y) : null;
                if (v0 && v1) angle = Math.atan2(dot(cross(v3(), v0, v1), n), dot(v0, v1));
                else angle = (Math.atan2(y - sp.y, x - sp.x) - a0) * -screenSign;
                let deg = (angle * 180) / Math.PI;
                const snap = snapConfig();
                if (snap.isRotationSnapEnabled !== !!ev?.ctrlKey) deg = snapStep(deg, snap.rotation || 15);
                const q: Q4 = qFromAxisAngle(q4(), n, (deg * Math.PI) / 180);
                for (const s of starts) setPointWorld(comp, s.i, add(v3(), pivot, qRotate(v3(), q, sub(v3(), s.pos, pivot))));
                return `${deg.toFixed(1)}°`;
            },
        };
    }

    // Scale the points around the pivot.
    const sp = toScreen(cam, pivot);
    let dirX = 1;
    let dirY = 0;
    let screenLen = 80;
    if (axis in AXIS_INDEX) {
        const tip = toScreen(cam, scaleAndAdd(v3(), pivot, f.axes[AXIS_INDEX[axis]], f.size));
        const l = Math.hypot(tip.x - sp.x, tip.y - sp.y);
        if (l > 1) {
            dirX = (tip.x - sp.x) / l;
            dirY = (tip.y - sp.y) / l;
            screenLen = l;
        }
    }
    return {
        frame: f,
        axis,
        update(x, y, ev) {
            let factor = axis === 'free' ? 1 + ((x - mx) + (y - my)) / 120 : 1 + ((x - mx) * dirX + (y - my) * dirY) / screenLen;
            const snap = snapConfig();
            if (snap.isScaleSnapEnabled !== !!ev?.ctrlKey) factor = 1 + snapStep(factor - 1, snap.scale || 0.1);
            const s: [number, number, number] = axis === 'free' ? [factor, factor, factor] : [1, 1, 1];
            if (axis in AXIS_INDEX) s[AXIS_INDEX[axis]] = factor;
            for (const st of starts) {
                const d = sub(v3(), st.pos, pivot);
                const out = copy(v3(), pivot);
                for (let i = 0; i < 3; i++) scaleAndAdd(out, out, f.axes[i], dot(d, f.axes[i]) * s[i]);
                setPointWorld(comp, st.i, out);
            }
            return `× ${factor.toFixed(3)}`;
        },
    };
}
