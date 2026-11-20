/**
 * Scene view drawing for the line tools, and what is under the mouse.
 */
import { V3, v3, lerp } from '../../assets/core/math';
import { simplifyIndices } from '../../assets/core/line-geometry';
import { allLines, runtimeReady } from './env';
import { sceneCamera, toScreen, worldPerPixel, distToSegment, beginLabels, addLabel, endLabels, ScreenPoint } from './view';
import * as D from './draw';
import { currentLine, pointWorld, worldPoints } from './model';
import { Hit, S, isSelected } from './state';
import { computeFrame, drawHandle, hitHandle, HandleFrame } from './handles';

const POINT_PX = 4.5;
const HIT_POINT = 8;
const HIT_SEGMENT = 6;

/** The line being edited, kept in sync with the selection. */
export function updateTarget(): any {
    const comp = currentLine();
    if (comp !== S.target) {
        S.target = comp;
        S.selection = [];
        S.hover = null;
        S.preview = null;
        if (!comp) S.mode = 'none';
        S.stateVersion++;
    }
    if (comp) {
        const n = comp.positions.length;
        const valid = S.selection.filter((i) => i >= 0 && i < n);
        if (valid.length !== S.selection.length) {
            S.selection = valid;
            S.stateVersion++;
        }
    }
    return comp;
}

let axesOverride: [V3, V3, V3] | null = null;
let dragAxis: any = null;

export function setHandleAxesOverride(axes: [V3, V3, V3] | null): void {
    axesOverride = axes;
}

export function setDragAxis(a: any): void {
    dragAxis = a;
}

export function currentHandleFrame(cam: any): HandleFrame | null {
    if (S.mode !== 'edit' || !S.target || !S.selection.length) return null;
    return computeFrame(cam, S.target, S.selection, axesOverride);
}

let extraDrawer: ((cam: any) => void) | null = null;
export function setExtraDrawer(fn: ((cam: any) => void) | null): void {
    extraDrawer = fn;
}

export function drawFrame(): void {
    if (!runtimeReady()) return;
    const cam = sceneCamera();
    if (!cam) return;
    const comp = updateTarget();
    if (!comp) {
        endLabels();
        return;
    }
    if (!D.beginDraw(cam)) return;
    S.diag.draws++;
    beginLabels();
    const pts = worldPoints(comp);
    const editing = S.mode !== 'none';

    if (editing) {
        // The path through the points (the line itself may be thin or transparent).
        for (let i = 0; i + 1 < pts.length; i++) {
            const hot = S.hover?.kind === 'segment' && S.hover.index === i;
            D.line(pts[i], pts[i + 1], hot ? D.Colors.curveHover : D.Colors.curveDim);
        }
        if (comp.loop && pts.length > 2) {
            const hot = S.hover?.kind === 'segment' && S.hover.index === pts.length - 1;
            D.line(pts[pts.length - 1], pts[0], hot ? D.Colors.curveHover : D.Colors.curveDim);
        }
    }

    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!editing) {
            D.disc(p, 2.5, D.Colors.curveSelected, 8);
            continue;
        }
        const selected = S.mode === 'edit' && isSelected(i);
        const hovered = S.hover?.kind === 'point' && S.hover.index === i;
        const r = selected || hovered ? POINT_PX + 1 : POINT_PX;
        D.disc(p, r, selected ? D.Colors.selected : D.Colors.point, 12);
        D.circle(p, r, hovered ? D.Colors.hover : D.Colors.pointOutline, 12);
    }

    if (editing && S.settings.simplifyPreview && pts.length > 2) {
        const keep = simplifyIndices(comp.positions, S.settings.tolerance, comp.loop);
        for (let k = 0; k + 1 < keep.length; k++) D.thickLine(pts[keep[k]], pts[keep[k + 1]], D.Colors.simplify, 2);
        if (comp.loop && keep.length > 2) D.thickLine(pts[keep[keep.length - 1]], pts[keep[0]], D.Colors.simplify, 2);
        const sp = toScreen(cam, pts[0]);
        if (sp.visible) addLabel(cam, sp.x, sp.y + 14, `Simplify: ${pts.length} → ${keep.length} points`, '#ffd23c');
    }

    if (S.mode === 'edit') {
        const f = currentHandleFrame(cam);
        if (f) drawHandle(cam, f, S.hover?.kind === 'handle' ? S.hover.axis : dragAxis);
    }
    extraDrawer?.(cam);
    endLabels();
}

// --------------------------------------------------------------- hit test

export function hitTest(cam: any, mx: number, my: number, opts: { handles?: boolean; segments?: boolean } = {}): Hit | null {
    const comp = S.target;
    if (!comp) return null;
    if (S.mode === 'edit' && opts.handles !== false) {
        const f = currentHandleFrame(cam);
        if (f) {
            const axis = hitHandle(cam, f, mx, my);
            if (axis) return { kind: 'handle', axis };
        }
    }
    const sp: ScreenPoint = { x: 0, y: 0, visible: true };
    let best = -1;
    let bestD = HIT_POINT;
    for (let i = 0; i < comp.positions.length; i++) {
        toScreen(cam, pointWorld(comp, i), sp);
        if (!sp.visible) continue;
        const d = Math.hypot(sp.x - mx, sp.y - my);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    if (best >= 0) return { kind: 'point', index: best };
    if (opts.segments === false) return null;
    return hitSegment(cam, comp, mx, my, HIT_SEGMENT);
}

export function hitSegment(cam: any, comp: any, mx: number, my: number, maxPx: number): { kind: 'segment'; index: number; t: number; world: V3 } | null {
    const pts = worldPoints(comp);
    const n = pts.length;
    const count = comp.loop && n > 2 ? n : n - 1;
    let best: { kind: 'segment'; index: number; t: number; world: V3 } | null = null;
    let bestD = maxPx;
    const a: ScreenPoint = { x: 0, y: 0, visible: true };
    const b: ScreenPoint = { x: 0, y: 0, visible: true };
    for (let i = 0; i < count; i++) {
        const pa = pts[i];
        const pb = pts[(i + 1) % n];
        toScreen(cam, pa, a);
        toScreen(cam, pb, b);
        if (!a.visible || !b.visible) continue;
        const r = distToSegment(mx, my, a.x, a.y, b.x, b.y);
        if (r.dist < bestD) {
            bestD = r.dist;
            best = { kind: 'segment', index: i, t: r.f, world: lerp(v3(), pa, pb, r.f) };
        }
    }
    return best;
}

/** Points inside a screen rectangle. */
export function pointsInRect(cam: any, x0: number, y0: number, x1: number, y1: number): number[] {
    const comp = S.target;
    if (!comp) return [];
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const res: number[] = [];
    const sp: ScreenPoint = { x: 0, y: 0, visible: true };
    for (let i = 0; i < comp.positions.length; i++) {
        toScreen(cam, pointWorld(comp, i), sp);
        if (sp.visible && sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) res.push(i);
    }
    return res;
}

/**
 * The line under the mouse (for selecting lines by clicking them: the
 * editor's own picking can't see their generated geometry).
 */
export function pickLine(cam: any, mx: number, my: number): any {
    let best: any = null;
    let bestD = Infinity;
    for (const comp of allLines()) {
        if (!comp.positions || comp.positions.length < 2) continue;
        const p0 = pointWorld(comp, 0);
        const halfPx = (comp.widthMultiplier * Math.max(comp.widthCurve?.evaluate?.(0) ?? 1, comp.widthCurve?.evaluate?.(1) ?? 1)) / 2 / worldPerPixel(cam, p0);
        const hit = hitSegment(cam, comp, mx, my, Math.max(5, Math.min(halfPx + 2, 60)));
        if (hit) {
            const sp = toScreen(cam, hit.world);
            const d = Math.hypot(sp.x - mx, sp.y - my);
            if (d < bestD) {
                bestD = d;
                best = comp;
            }
        }
    }
    return best;
}
