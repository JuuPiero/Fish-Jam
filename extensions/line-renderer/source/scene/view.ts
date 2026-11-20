/**
 * The Scene view camera and screen-space helpers.
 *
 * Screen coordinates follow the engine's camera convention: pixels of the
 * render window with the origin at the bottom-left (what screenPointToRay
 * and worldToScreen use).
 */
import { V3, v3, set, sub, dot, normalize, len, cross, scaleAndAdd, EPSILON } from '../../assets/core/math';
import { cc } from './env';

export interface ScreenPoint {
    x: number;
    y: number;
    /** In front of the camera. */
    visible: boolean;
}

export interface Ray {
    o: V3;
    d: V3;
}

let lastCamera: any = null;

/** The Scene view camera (not game cameras, not the gizmo camera). */
export function sceneCamera(): any {
    try {
        const { director, renderer } = cc();
        const root: any = director.root;
        if (!root) return null;
        if (lastCamera && lastCamera.enabled && lastCamera.window === root.mainWindow && root.cameraList.includes(lastCamera)) return lastCamera;
        for (const cam of root.cameraList) {
            if (cam.cameraUsage === renderer.scene.CameraUsage.SCENE_VIEW && cam.enabled && cam.window === root.mainWindow) {
                lastCamera = cam;
                return cam;
            }
        }
    } catch {
        // engine not ready
    }
    return null;
}

const _tmp = v3();

export function cameraPosition(cam: any, out: V3 = v3()): V3 {
    const p = cam.node.worldPosition;
    return set(out, p.x, p.y, p.z);
}

export function cameraForward(cam: any, out: V3 = v3()): V3 {
    const f = cam.forward ?? cam.node.forward;
    return normalize(out, set(out, f.x, f.y, f.z));
}

export function cameraRight(cam: any, out: V3 = v3()): V3 {
    const r = cam.node.right;
    return normalize(out, set(out, r.x, r.y, r.z));
}

export function cameraUp(cam: any, out: V3 = v3()): V3 {
    const u = cam.node.up;
    return normalize(out, set(out, u.x, u.y, u.z));
}

export function isOrtho(cam: any): boolean {
    try {
        return cam.projectionType === cc().renderer.scene.CameraProjection.ORTHO;
    } catch {
        return false;
    }
}

const _ws = v3();
const _fw = v3();

/** World position to screen pixels. */
export function toScreen(cam: any, p: V3, out: ScreenPoint = { x: 0, y: 0, visible: true }): ScreenPoint {
    // worldToScreen only reads/writes x, y, z, so plain objects do.
    cam.worldToScreen(_ws, p);
    out.x = _ws.x;
    out.y = _ws.y;
    if (isOrtho(cam)) out.visible = true;
    else {
        cameraPosition(cam, _tmp);
        cameraForward(cam, _fw);
        out.visible = dot(sub(_tmp, p, _tmp), _fw) > (cam.nearClip ?? 0.01);
    }
    return out;
}

/** Ray from the camera through a screen pixel. */
export function screenRay(cam: any, x: number, y: number): Ray {
    const { geometry } = cc();
    const r = new geometry.Ray();
    cam.screenPointToRay(r, x, y);
    return { o: v3(r.o.x, r.o.y, r.o.z), d: normalize(v3(), v3(r.d.x, r.d.y, r.d.z)) };
}

/** World units per screen pixel at a world position. */
export function worldPerPixel(cam: any, p: V3): number {
    const right = cameraRight(cam);
    const a = toScreen(cam, p);
    const b = toScreen(cam, scaleAndAdd(v3(), p, right, 1));
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(d > EPSILON) || !a.visible) {
        // Behind the camera or degenerate: use the distance to the camera.
        const dist = len(sub(v3(), p, cameraPosition(cam)));
        return Math.max(dist, 1) * 0.002;
    }
    return 1 / d;
}

/** Intersection of a ray with a plane (point + normal); null if parallel or behind. */
export function rayPlane(ray: Ray, point: V3, normal: V3, allowBehind = false): V3 | null {
    const denom = dot(ray.d, normal);
    if (Math.abs(denom) < 1e-6) return null;
    const t = dot(sub(v3(), point, ray.o), normal) / denom;
    if (t < 0 && !allowBehind) return null;
    return scaleAndAdd(v3(), ray.o, ray.d, t);
}

/** Point on the line (origin + s * dir) closest to the ray. */
export function closestOnLine(ray: Ray, origin: V3, dir: V3): V3 | null {
    // Minimize |(o1 + s d1) - (o2 + t d2)|.
    const d1 = normalize(v3(), dir);
    const d2 = ray.d;
    const r = sub(v3(), origin, ray.o);
    const a = dot(d1, d1);
    const b = dot(d1, d2);
    const c = dot(d2, d2);
    const d = dot(d1, r);
    const e = dot(d2, r);
    const denom = a * c - b * b;
    if (Math.abs(denom) < 1e-8) return null;
    const s = (b * e - c * d) / denom;
    return scaleAndAdd(v3(), origin, d1, s);
}

/** Distance from point (px, py) to the segment a-b in screen space. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { dist: number; f: number } {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let f = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const x = ax + dx * f - px;
    const y = ay + dy * f - py;
    return { dist: Math.sqrt(x * x + y * y), f };
}

export function pointInPolygon(px: number, py: number, pts: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** A plane facing the camera through a point (for free dragging). */
export function viewPlaneNormal(cam: any, out: V3 = v3()): V3 {
    return cameraForward(cam, out);
}

/** Right / up axes perpendicular to `n`. */
export function planeBasis(n: V3): { u: V3; w: V3 } {
    const up = Math.abs(n.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0);
    const u = normalize(v3(), cross(v3(), up, n));
    const w = normalize(v3(), cross(v3(), n, u));
    return { u, w };
}

// ------------------------------------------------------------ mouse events

export type EventCoords = 'event' | 'event-flipped' | 'event-css' | 'event-css-flipped' | 'client' | 'unknown';

let coordMode: EventCoords = 'unknown';
let coordSamples = 0;

export function eventCoordMode(): EventCoords {
    return coordMode;
}

function canvasElement(): HTMLCanvasElement | null {
    try {
        const c = (cc().game as any).canvas as HTMLCanvasElement | null;
        if (c && typeof (c as any).getBoundingClientRect === 'function') return c;
    } catch {
        // fall through
    }
    return typeof document !== 'undefined' ? document.querySelector('canvas') : null;
}

/**
 * Screen pixels (bottom-left origin) of a scene mouse event. The editor's
 * event x/y convention is detected from the DOM coordinates on first use.
 */
export function eventToScreen(cam: any, ev: any): { x: number; y: number } {
    const canvas = canvasElement();
    const hasClient = typeof ev.clientX === 'number' && typeof ev.clientY === 'number';
    let fromClient: { x: number; y: number } | null = null;
    let css: { x: number; y: number; sx: number; sy: number; h: number } | null = null;
    if (canvas && hasClient) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const sx = cam.width / rect.width;
            const sy = cam.height / rect.height;
            const cx = ev.clientX - rect.left;
            const cy = ev.clientY - rect.top;
            css = { x: cx, y: cy, sx, sy, h: rect.height };
            fromClient = { x: cx * sx, y: (rect.height - cy) * sy };
        }
    }
    const hasXY = typeof ev.x === 'number' && typeof ev.y === 'number';
    if (coordMode === 'unknown' || (coordMode === 'client' && coordSamples < 5)) {
        coordSamples++;
        if (hasXY && css) {
            const near = (a: number, b: number) => Math.abs(a - b) < 2.5;
            if (near(ev.x, css.x * css.sx) && near(ev.y, (css.h - css.y) * css.sy)) coordMode = 'event';
            else if (near(ev.x, css.x * css.sx) && near(ev.y, css.y * css.sy)) coordMode = 'event-flipped';
            else if (near(ev.x, css.x) && near(ev.y, css.h - css.y)) coordMode = 'event-css';
            else if (near(ev.x, css.x) && near(ev.y, css.y)) coordMode = 'event-css-flipped';
            else coordMode = 'client';
        } else if (hasXY) {
            coordMode = 'event';
        } else if (css) {
            coordMode = 'client';
        }
    }
    switch (coordMode) {
        case 'event':
            return { x: ev.x, y: ev.y };
        case 'event-flipped':
            return { x: ev.x, y: cam.height - ev.y };
        case 'event-css':
            return css ? { x: ev.x * css.sx, y: ev.y * css.sy } : { x: ev.x, y: ev.y };
        case 'event-css-flipped':
            return css ? { x: ev.x * css.sx, y: (css.h - ev.y) * css.sy } : { x: ev.x, y: cam.height - ev.y };
        default:
            return fromClient ?? { x: ev.x ?? 0, y: ev.y ?? 0 };
    }
}

// ------------------------------------------------------------ DOM overlay

interface Overlay {
    root: HTMLDivElement;
    labels: HTMLDivElement[];
    used: number;
    rect: HTMLDivElement;
    tip: HTMLDivElement;
}

let overlay: Overlay | null = null;

function ensureOverlay(): Overlay | null {
    if (overlay && overlay.root.isConnected) return overlay;
    if (typeof document === 'undefined' || !document.body) return null;
    const root = document.createElement('div');
    root.id = 'line-renderer-overlay';
    root.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;font:11px/1.2 sans-serif;';
    const rect = document.createElement('div');
    rect.style.cssText = 'position:fixed;display:none;border:1px solid rgba(80,170,255,0.9);background:rgba(80,170,255,0.15);pointer-events:none;';
    root.appendChild(rect);
    const tip = document.createElement('div');
    tip.style.cssText = 'position:fixed;display:none;padding:2px 6px;border-radius:3px;background:rgba(20,20,20,0.85);color:#ddd;white-space:nowrap;pointer-events:none;';
    root.appendChild(tip);
    document.body.appendChild(root);
    overlay = { root, labels: [], used: 0, rect, tip };
    return overlay;
}

function cssOf(cam: any, x: number, y: number): { left: number; top: number } | null {
    const canvas = canvasElement();
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    return { left: r.left + (x * r.width) / cam.width, top: r.top + r.height - (y * r.height) / cam.height };
}

/** Starts a frame of overlay labels. */
export function beginLabels(): void {
    const o = ensureOverlay();
    if (o) o.used = 0;
}

export function addLabel(cam: any, x: number, y: number, text: string, color = '#fff'): void {
    const o = ensureOverlay();
    if (!o) return;
    const css = cssOf(cam, x, y);
    if (!css) return;
    let el = o.labels[o.used];
    if (!el) {
        el = document.createElement('div');
        el.style.cssText = 'position:fixed;transform:translate(6px,-100%);text-shadow:0 0 2px #000,0 0 2px #000;pointer-events:none;white-space:nowrap;';
        o.root.appendChild(el);
        o.labels.push(el);
    }
    o.used++;
    if (el.textContent !== text) el.textContent = text;
    el.style.color = color;
    el.style.left = `${css.left}px`;
    el.style.top = `${css.top}px`;
    el.style.display = 'block';
}

/** Hides labels not used this frame. */
export function endLabels(): void {
    const o = overlay;
    if (!o) return;
    for (let i = o.used; i < o.labels.length; i++) o.labels[i].style.display = 'none';
}

export function showRect(cam: any, x0: number, y0: number, x1: number, y1: number): void {
    const o = ensureOverlay();
    if (!o) return;
    const a = cssOf(cam, Math.min(x0, x1), Math.max(y0, y1));
    const b = cssOf(cam, Math.max(x0, x1), Math.min(y0, y1));
    if (!a || !b) return;
    o.rect.style.left = `${a.left}px`;
    o.rect.style.top = `${a.top}px`;
    o.rect.style.width = `${Math.max(0, b.left - a.left)}px`;
    o.rect.style.height = `${Math.max(0, b.top - a.top)}px`;
    o.rect.style.display = 'block';
}

export function hideRect(): void {
    if (overlay) overlay.rect.style.display = 'none';
}

export function showTip(cam: any, x: number, y: number, text: string): void {
    const o = ensureOverlay();
    if (!o) return;
    const css = cssOf(cam, x, y);
    if (!css) return;
    o.tip.textContent = text;
    o.tip.style.left = `${css.left + 14}px`;
    o.tip.style.top = `${css.top + 14}px`;
    o.tip.style.display = 'block';
}

export function hideTip(): void {
    if (overlay) overlay.tip.style.display = 'none';
}

export function removeOverlay(): void {
    if (overlay?.root.isConnected) overlay.root.remove();
    overlay = null;
}
