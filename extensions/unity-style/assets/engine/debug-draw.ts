import { Color, director, Director, game, Vec3 } from 'cc';

/**
 * Lines drawn with the engine's geometry renderer, kept for a duration
 * (Unity's Debug.DrawLine semantics). Used by Debug.DrawLine / DrawRay and
 * by Physics.debugDrawQueries.
 *
 * Drawn into the first camera of the main window (as Cocos' own physics
 * debug draw does), or into DebugDraw.cameras when set. Needs the "Geometry
 * Renderer" engine module (Project Settings > Feature Cropping). Nothing is
 * drawn in a build without it, and nothing is an error.
 */
interface DebugLine {
    a: Vec3;
    b: Vec3;
    color: Color;
    until: number;
    depthTest: boolean;
}

const lines: DebugLine[] = [];
let hooked = false;

function now(): number {
    return game.totalTime;
}

function hook(): void {
    if (hooked) return;
    hooked = true;
    director.on(Director.EVENT_BEFORE_DRAW, flush);
}

function renderers(): any[] {
    const out: any[] = [];
    const list = DebugDraw.cameras;
    if (list && list.length) {
        for (let i = 0; i < list.length; i++) {
            const cam: any = list[i] && (list[i] as any).camera ? (list[i] as any).camera : list[i];
            if (cam && cam.initGeometryRenderer) {
                cam.initGeometryRenderer();
                if (cam.geometryRenderer) out.push(cam.geometryRenderer);
            }
        }
        return out;
    }
    const root: any = director.root;
    const win = root && root.mainWindow;
    const cams = win ? win.cameras : null;
    if (cams && cams.length && cams[0] && cams[0].initGeometryRenderer) {
        cams[0].initGeometryRenderer();
        if (cams[0].geometryRenderer) out.push(cams[0].geometryRenderer);
    }
    return out;
}

function flush(): void {
    if (!lines.length) return;
    let rs: any[] = [];
    try {
        rs = renderers();
    } catch (e) {
        rs = [];
    }
    const t = now();
    for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        for (let j = 0; j < lines.length; j++) {
            const l = lines[j];
            r.addLine(l.a, l.b, l.color, l.depthTest);
        }
    }
    let w = 0;
    for (let j = 0; j < lines.length; j++) {
        if (lines[j].until > t) lines[w++] = lines[j];
    }
    lines.length = w;
}

const _a = new Vec3();
const _b = new Vec3();

export class DebugDraw {
    /** Cameras (cc.Camera components or render cameras) to draw into; empty = the main window's first camera. */
    static cameras: any[] = [];
    /** Cap on stored lines, so a forgotten long duration cannot grow without bound. */
    static maxLines = 20000;

    /** A line for `duration` seconds (0: the next drawn frame only). */
    static line(a: Readonly<Vec3>, b: Readonly<Vec3>, color: Readonly<Color>, duration = 0, depthTest = true): void {
        hook();
        if (lines.length >= DebugDraw.maxLines) return;
        lines.push({ a: new Vec3(a.x, a.y, a.z), b: new Vec3(b.x, b.y, b.z), color: new Color(color.r, color.g, color.b, color.a), until: now() + Math.max(0, duration) * 1000, depthTest });
    }

    static clear(): void {
        lines.length = 0;
    }

    /** Number of stored lines (for tests and tooling). */
    static get count(): number {
        return lines.length;
    }

    static cross(p: Readonly<Vec3>, size: number, color: Readonly<Color>, duration = 0): void {
        const s = size / 2;
        DebugDraw.line(_a.set(p.x - s, p.y, p.z), _b.set(p.x + s, p.y, p.z), color, duration);
        DebugDraw.line(_a.set(p.x, p.y - s, p.z), _b.set(p.x, p.y + s, p.z), color, duration);
        DebugDraw.line(_a.set(p.x, p.y, p.z - s), _b.set(p.x, p.y, p.z + s), color, duration);
    }

    /** A circle around `axis` (unit). */
    static circle(c: Readonly<Vec3>, axis: Readonly<Vec3>, r: number, color: Readonly<Color>, duration = 0, segments = 24): void {
        const u = new Vec3();
        const v = new Vec3();
        basis(axis, u, v);
        const p0 = new Vec3();
        const p1 = new Vec3();
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            point(c, u, v, r, a0, p0);
            point(c, u, v, r, a1, p1);
            DebugDraw.line(p0, p1, color, duration);
        }
    }

    static sphere(c: Readonly<Vec3>, r: number, color: Readonly<Color>, duration = 0): void {
        DebugDraw.circle(c, Vec3.UNIT_X, r, color, duration);
        DebugDraw.circle(c, Vec3.UNIT_Y, r, color, duration);
        DebugDraw.circle(c, Vec3.UNIT_Z, r, color, duration);
    }

    /** An oriented box from its centre, unit axes and half extents. */
    static box(c: Readonly<Vec3>, ax: Readonly<Vec3>, ay: Readonly<Vec3>, az: Readonly<Vec3>, h: Readonly<Vec3>, color: Readonly<Color>, duration = 0): void {
        const corners: Vec3[] = [];
        for (let i = 0; i < 8; i++) {
            const sx = i & 1 ? 1 : -1;
            const sy = i & 2 ? 1 : -1;
            const sz = i & 4 ? 1 : -1;
            corners.push(new Vec3(
                c.x + ax.x * h.x * sx + ay.x * h.y * sy + az.x * h.z * sz,
                c.y + ax.y * h.x * sx + ay.y * h.y * sy + az.y * h.z * sz,
                c.z + ax.z * h.x * sx + ay.z * h.y * sy + az.z * h.z * sz,
            ));
        }
        const edges = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
        for (let i = 0; i < edges.length; i += 2) DebugDraw.line(corners[edges[i]], corners[edges[i + 1]], color, duration);
    }

    static capsule(a: Readonly<Vec3>, b: Readonly<Vec3>, r: number, color: Readonly<Color>, duration = 0): void {
        const axis = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z);
        if (axis.length() < 1e-6) {
            DebugDraw.sphere(a, r, color, duration);
            return;
        }
        axis.normalize();
        const u = new Vec3();
        const v = new Vec3();
        basis(axis, u, v);
        DebugDraw.circle(a, axis, r, color, duration);
        DebugDraw.circle(b, axis, r, color, duration);
        DebugDraw.sphere(a, r, color, duration);
        DebugDraw.sphere(b, r, color, duration);
        const dirs = [u, v];
        for (let k = 0; k < 2; k++) {
            for (let s = -1; s <= 1; s += 2) {
                const d = dirs[k];
                DebugDraw.line(_a.set(a.x + d.x * r * s, a.y + d.y * r * s, a.z + d.z * r * s), _b.set(b.x + d.x * r * s, b.y + d.y * r * s, b.z + d.z * r * s), color, duration);
            }
        }
    }
}

function basis(axis: Readonly<Vec3>, u: Vec3, v: Vec3): void {
    const ref = Math.abs(axis.y) < 0.9 ? Vec3.UNIT_Y : Vec3.UNIT_X;
    Vec3.cross(u, axis, ref).normalize();
    Vec3.cross(v, axis, u).normalize();
}

function point(c: Readonly<Vec3>, u: Vec3, v: Vec3, r: number, ang: number, out: Vec3): Vec3 {
    const cs = Math.cos(ang) * r;
    const sn = Math.sin(ang) * r;
    return out.set(c.x + u.x * cs + v.x * sn, c.y + u.y * cs + v.y * sn, c.z + u.z * cs + v.z * sn);
}
