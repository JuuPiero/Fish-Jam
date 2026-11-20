/**
 * Undoable point edits used by the keyboard and the Inspector, and line creation.
 */
import { V3, v3, lerp } from '../../assets/core/math';
import { simplifyIndices } from '../../assets/core/line-geometry';
import { findNode, is2DView, lineClass, repaint, selectedNodeUuids } from './env';
import { newPoint, pointWorld } from './model';
import { S, setSelection, bumpState } from './state';
import { recordEdit } from './undo';
import { sceneCamera, screenRay, rayPlane, worldPerPixel, cameraForward, cameraPosition } from './view';

function touched(): void {
    bumpState();
    repaint();
}

export async function deleteSelected(): Promise<void> {
    const comp = S.target;
    if (!comp || !S.selection.length) return;
    const drop = new Set(S.selection);
    await recordEdit([comp], () => {
        comp.positions = comp.positions.filter((_: any, i: number) => !drop.has(i));
    });
    setSelection([]);
    touched();
}

/** Unity's Subdivide Selected: a point in the middle of every segment between two selected points. */
export async function subdivideSelected(): Promise<void> {
    const comp = S.target;
    if (!comp || !S.selection.length) return;
    const n = comp.positions.length;
    const sel = new Set(S.selection);
    const segs: number[] = [];
    const count = comp.loop && n > 2 ? n : n - 1;
    for (let i = 0; i < count; i++) if (sel.has(i) && sel.has((i + 1) % n)) segs.push(i);
    if (!segs.length) {
        // One point: split the segments next to it.
        for (const i of sel) {
            if (i > 0 || comp.loop) segs.push((i - 1 + n) % n);
            if (i < n - 1 || comp.loop) segs.push(i);
        }
    }
    const unique = [...new Set(segs)].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
    if (!unique.length) return;
    const newSel: number[] = [];
    await recordEdit([comp], () => {
        const pts = comp.positions.slice();
        const out: any[] = [];
        for (let i = 0; i < n; i++) {
            out.push(pts[i]);
            if (sel.has(i)) newSel.push(out.length - 1);
            if (unique.includes(i)) {
                out.push(newPoint(comp, lerp(v3(), pointWorld(comp, i), pointWorld(comp, (i + 1) % n), 0.5)));
                newSel.push(out.length - 1);
            }
        }
        comp.positions = out;
    });
    setSelection(newSel);
    touched();
}

export function selectAll(): void {
    const comp = S.target;
    if (!comp) return;
    if (S.mode !== 'edit') S.mode = 'edit';
    setSelection(comp.positions.map((_: any, i: number) => i));
    touched();
}

export async function simplifyLine(tolerance: number): Promise<number> {
    const comp = S.target;
    if (!comp) return 0;
    const keep = simplifyIndices(comp.positions, tolerance, comp.loop);
    const removed = comp.positions.length - keep.length;
    if (!removed) return 0;
    await recordEdit([comp], () => {
        comp.positions = keep.map((i) => comp.positions[i]);
    });
    setSelection([]);
    touched();
    return removed;
}

/** Inserts a point on segment `index` (between points index and index + 1). */
export async function insertOnSegment(comp: any, index: number, world: V3): Promise<number> {
    const at = index + 1;
    await recordEdit([comp], () => {
        const pts = comp.positions.slice();
        pts.splice(at, 0, newPoint(comp, world));
        comp.positions = pts;
    });
    setSelection([at]);
    touched();
    return at;
}

// ------------------------------------------------------------- creation

function niceSize(v: number): number {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function viewCenter(is2D: boolean): { pos: V3; size: number } {
    const cam = sceneCamera();
    if (!cam) return { pos: v3(), size: is2D ? 100 : 1 };
    const ray = screenRay(cam, cam.width / 2, cam.height / 2);
    let pos = rayPlane(ray, v3(), is2D ? v3(0, 0, 1) : v3(0, 1, 0));
    if (!pos) {
        const f = cameraForward(cam);
        const c = cameraPosition(cam);
        pos = v3(c.x + f.x * 10, c.y + f.y * 10, c.z + f.z * 10);
    }
    return { pos, size: niceSize(worldPerPixel(cam, pos) * Math.min(cam.width, cam.height) * 0.2) };
}

/** Node > Effects > Line Renderer / Draw Line. */
export async function createLineNode(kind: string): Promise<string | null> {
    const is2D = is2DView();
    const sel = selectedNodeUuids();
    const options: any = { name: 'Line' };
    if (sel.length) options.parent = sel[0];
    if (is2D) options.canvasRequired = true;
    const uuid = (await Editor.Message.request('scene', 'create-node', options)) as unknown as string;
    if (!uuid || typeof uuid !== 'string') return null;
    await Editor.Message.request('scene', 'create-component', { uuid, component: 'LineRenderer' } as any);
    const node = findNode(uuid);
    const C = lineClass();
    const comp = node && C ? node.getComponent(C) : null;
    if (!comp) return uuid;
    const { pos, size } = viewCenter(is2D);
    await recordEdit([comp], () => {
        node.setWorldPosition(pos.x, pos.y, pos.z);
        if (kind === 'draw') {
            comp.positions = [];
        } else {
            const half = size;
            const a = is2D ? v3(pos.x - half, pos.y, 0) : v3(pos.x - half, pos.y, pos.z);
            const b = is2D ? v3(pos.x + half, pos.y, 0) : v3(pos.x + half, pos.y, pos.z);
            comp.positions = [newPoint(comp, a), newPoint(comp, b)];
            if (!is2D) comp.widthMultiplier = niceSize(size * 0.1);
        }
    });
    try {
        Editor.Selection.clear('node');
        Editor.Selection.select('node', uuid);
    } catch {
        // selection API missing
    }
    pendingMode = { comp, mode: kind === 'draw' ? 'create' : 'none', until: Date.now() + 3000 };
    repaint();
    return uuid;
}

/** Mode to enter once the created line is selected. */
export let pendingMode: { comp: any; mode: 'none' | 'create' | 'edit'; until: number } | null = null;

export function takePendingMode(target: any): 'none' | 'create' | 'edit' | null {
    const p = pendingMode;
    if (!p) return null;
    if (p.comp === target) {
        pendingMode = null;
        return p.mode;
    }
    if (Date.now() > p.until) pendingMode = null;
    return null;
}
