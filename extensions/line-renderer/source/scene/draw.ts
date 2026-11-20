/**
 * Drawing into the Scene view camera's GeometryRenderer. Shapes added on
 * Director.EVENT_BEFORE_COMMIT render in the same frame.
 *
 * Sizes given in pixels are converted to world units at the shape's position
 * so handles keep a constant size on screen.
 */
import { V3, v3, set, add, sub, scale, scaleAndAdd, normalize, cross, lenSq, copy } from '../../assets/core/math';
import { cc } from './env';
import { cameraForward, cameraRight, cameraUp, worldPerPixel, toScreen } from './view';

export type Color = import('cc').Color;

let gr: any = null;
let cam: any = null;
const camRight = v3();
const camUp = v3();
const camFwd = v3();

/** Starts drawing for this frame. False if the camera has no geometry renderer. */
export function beginDraw(camera: any): boolean {
    cam = camera;
    if (!camera.geometryRenderer && camera.initGeometryRenderer) camera.initGeometryRenderer();
    gr = camera.geometryRenderer || null;
    if (!gr) return false;
    cameraRight(camera, camRight);
    cameraUp(camera, camUp);
    cameraForward(camera, camFwd);
    return true;
}

export function color(r: number, g: number, b: number, a = 255): Color {
    return new (cc().Color)(r, g, b, a);
}

/** Unity-like palette. */
export const Colors = {
    get curve() { return c('curve', 200, 200, 200); },
    get curveDim() { return c('curveDim', 140, 140, 140, 200); },
    get curveSelected() { return c('curveSelected', 240, 240, 240); },
    get curveHover() { return c('curveHover', 255, 255, 255); },
    get point() { return c('point', 52, 52, 52); },
    get pointOutline() { return c('pointOutline', 230, 230, 230); },
    get simplify() { return c('simplify', 255, 210, 60); },
    get selected() { return c('selected', 54, 179, 255); },
    get hover() { return c('hover', 255, 255, 255); },
    get linked() { return c('linked', 255, 196, 64); },
    get tangentLine() { return c('tangentLine', 160, 160, 160); },
    get tangent() { return c('tangent', 210, 210, 210); },
    get flow() { return c('flow', 255, 255, 255, 140); },
    get normal() { return c('normal', 120, 230, 120, 200); },
    get preview() { return c('preview', 255, 255, 255, 170); },
    get insert() { return c('insert', 120, 220, 120); },
    get axisX() { return c('axisX', 219, 62, 29); },
    get axisY() { return c('axisY', 154, 243, 72); },
    get axisZ() { return c('axisZ', 58, 122, 248); },
    get axisHot() { return c('axisHot', 246, 242, 50); },
    get axisView() { return c('axisView', 220, 220, 220); },
    get planeFill() { return c('planeFill', 255, 255, 255, 40); },
};

const cache = new Map<string, Color>();
function c(name: string, r: number, g: number, b: number, a = 255): Color {
    let col = cache.get(name);
    if (!col) {
        col = color(r, g, b, a);
        cache.set(name, col);
    }
    return col;
}

/** A copy of a color with another alpha. */
export function withAlpha(col: Color, a: number): Color {
    const key = `${col.r},${col.g},${col.b},${a}`;
    let res = cache.get(key);
    if (!res) {
        res = color(col.r, col.g, col.b, a);
        cache.set(key, res);
    }
    return res;
}

export function line(a: V3, b: V3, col: Color, depthTest = false): void {
    gr.addLine(a, b, col, depthTest);
}

const _o = v3();
const _a = v3();
const _b = v3();

/** A line `widthPx` wide, drawn as parallel lines offset on screen. */
export function thickLine(a: V3, b: V3, col: Color, widthPx: number, depthTest = false): void {
    gr.addLine(a, b, col, depthTest);
    if (widthPx <= 1.2) return;
    // Offset perpendicular to the line, in the view plane.
    sub(_o, b, a);
    cross(_o, _o, camFwd);
    if (lenSq(_o) < 1e-12) return;
    normalize(_o, _o);
    const wpp = worldPerPixel(cam, a);
    const half = Math.floor(widthPx / 2);
    for (let i = 1; i <= half; i++) {
        const s = wpp * i * 0.7;
        gr.addLine(scaleAndAdd(_a, a, _o, s), scaleAndAdd(_b, b, _o, s), col, depthTest);
        gr.addLine(scaleAndAdd(_a, a, _o, -s), scaleAndAdd(_b, b, _o, -s), col, depthTest);
    }
}

export function polyline(points: V3[], col: Color, widthPx = 1, depthTest = false): void {
    for (let i = 0; i + 1 < points.length; i++) {
        if (widthPx > 1.2) thickLine(points[i], points[i + 1], col, widthPx, depthTest);
        else gr.addLine(points[i], points[i + 1], col, depthTest);
    }
}

const circlePts: V3[] = [];
function screenCirclePoints(center: V3, radiusPx: number, segments: number): V3[] {
    const r = worldPerPixel(cam, center) * radiusPx;
    while (circlePts.length <= segments) circlePts.push(v3());
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const p = circlePts[i];
        copy(p, center);
        scaleAndAdd(p, p, camRight, Math.cos(a) * r);
        scaleAndAdd(p, p, camUp, Math.sin(a) * r);
    }
    return circlePts;
}

/** Circle facing the camera. */
export function circle(center: V3, radiusPx: number, col: Color, segments = 16, depthTest = false): void {
    const pts = screenCirclePoints(center, radiusPx, segments);
    for (let i = 0; i < segments; i++) gr.addLine(pts[i], pts[i + 1], col, depthTest);
}

/** Filled disc facing the camera. */
export function disc(center: V3, radiusPx: number, col: Color, segments = 12, depthTest = false): void {
    const pts = screenCirclePoints(center, radiusPx, segments);
    for (let i = 0; i < segments; i++) gr.addTriangle(center, pts[i], pts[i + 1], col, false, depthTest, true);
}

/** Square facing the camera (filled or outline). */
export function square(center: V3, halfPx: number, col: Color, filled: boolean, depthTest = false): void {
    const h = worldPerPixel(cam, center) * halfPx;
    const p0 = add(v3(), scaleAndAdd(v3(), center, camRight, -h), scale(v3(), camUp, -h));
    const p1 = add(v3(), scaleAndAdd(v3(), center, camRight, h), scale(v3(), camUp, -h));
    const p2 = add(v3(), scaleAndAdd(v3(), center, camRight, h), scale(v3(), camUp, h));
    const p3 = add(v3(), scaleAndAdd(v3(), center, camRight, -h), scale(v3(), camUp, h));
    gr.addQuad(p0, p1, p2, p3, col, !filled, depthTest, true);
}

/** Diamond facing the camera (filled or outline). */
export function diamond(center: V3, halfPx: number, col: Color, filled: boolean, depthTest = false): void {
    const h = worldPerPixel(cam, center) * halfPx;
    const p0 = scaleAndAdd(v3(), center, camUp, -h);
    const p1 = scaleAndAdd(v3(), center, camRight, h);
    const p2 = scaleAndAdd(v3(), center, camUp, h);
    const p3 = scaleAndAdd(v3(), center, camRight, -h);
    gr.addQuad(p0, p1, p2, p3, col, !filled, depthTest, true);
}

/** Circle in the plane perpendicular to `normal` (world radius). */
export function ring(center: V3, normal: V3, radius: number, col: Color, segments = 48, depthTest = false, frontOnly = false): void {
    const n = normalize(v3(), normal);
    const u = normalize(v3(), cross(v3(), Math.abs(n.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0), n));
    const w = cross(v3(), n, u);
    let prev: V3 | null = null;
    const toCam = v3();
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const p = add(v3(), center, add(v3(), scale(v3(), u, Math.cos(a) * radius), scale(v3(), w, Math.sin(a) * radius)));
        if (prev) {
            let draw = true;
            if (frontOnly) {
                // Skip the half facing away from the camera.
                const mid = scale(v3(), add(v3(), prev, p), 0.5);
                sub(toCam, mid, center);
                draw = toCam.x * camFwd.x + toCam.y * camFwd.y + toCam.z * camFwd.z <= radius * 0.05;
            }
            if (draw) gr.addLine(prev, p, col, depthTest);
        }
        prev = p;
    }
}

/** Filled cone from `base` pointing along `dir` (world sizes). */
export function cone(base: V3, dir: V3, height: number, radius: number, col: Color, depthTest = false, segments = 10): void {
    const d = normalize(v3(), dir);
    const apex = scaleAndAdd(v3(), base, d, height);
    const u = normalize(v3(), cross(v3(), Math.abs(d.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0), d));
    const w = cross(v3(), d, u);
    const pts: V3[] = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(add(v3(), base, add(v3(), scale(v3(), u, Math.cos(a) * radius), scale(v3(), w, Math.sin(a) * radius))));
    }
    for (let i = 0; i < segments; i++) {
        gr.addTriangle(apex, pts[i], pts[i + 1], col, false, depthTest, true);
        gr.addTriangle(base, pts[i + 1], pts[i], col, false, depthTest, true);
    }
}

/** Filled cube with the given axes (half size in world units). */
export function cube(center: V3, half: number, ax: V3, ay: V3, az: V3, col: Color, depthTest = false): void {
    const corner = (sx: number, sy: number, sz: number) => {
        const p = copy(v3(), center);
        scaleAndAdd(p, p, ax, sx * half);
        scaleAndAdd(p, p, ay, sy * half);
        scaleAndAdd(p, p, az, sz * half);
        return p;
    };
    const c000 = corner(-1, -1, -1);
    const c100 = corner(1, -1, -1);
    const c110 = corner(1, 1, -1);
    const c010 = corner(-1, 1, -1);
    const c001 = corner(-1, -1, 1);
    const c101 = corner(1, -1, 1);
    const c111 = corner(1, 1, 1);
    const c011 = corner(-1, 1, 1);
    const q = (a: V3, b: V3, cc2: V3, d: V3) => gr.addQuad(a, b, cc2, d, col, false, depthTest, true);
    q(c000, c100, c110, c010);
    q(c001, c011, c111, c101);
    q(c000, c010, c011, c001);
    q(c100, c101, c111, c110);
    q(c000, c001, c101, c100);
    q(c010, c110, c111, c011);
}

export function quad(a: V3, b: V3, c2: V3, d: V3, col: Color, filled: boolean, depthTest = false): void {
    gr.addQuad(a, b, c2, d, col, !filled, depthTest, true);
}

/** Small arrow head (chevron) at `p` pointing along `dir`, sized in pixels. */
export function chevron(p: V3, dir: V3, sizePx: number, col: Color, depthTest = false): void {
    const d = normalize(v3(), dir);
    if (lenSq(d) < 1e-12) return;
    const side = normalize(v3(), cross(v3(), d, camFwd));
    if (lenSq(side) < 1e-12) return;
    const s = worldPerPixel(cam, p) * sizePx;
    const back = scaleAndAdd(v3(), p, d, -s);
    gr.addLine(scaleAndAdd(v3(), back, side, s * 0.7), p, col, depthTest);
    gr.addLine(scaleAndAdd(v3(), back, side, -s * 0.7), p, col, depthTest);
}

/** Screen-space length of a world segment (pixels). */
export function screenLength(a: V3, b: V3): number {
    const sa = toScreen(cam, a);
    const sb = toScreen(cam, b);
    return Math.hypot(sb.x - sa.x, sb.y - sa.y);
}

export function currentCamera(): any {
    return cam;
}

export { set as setV3 };
