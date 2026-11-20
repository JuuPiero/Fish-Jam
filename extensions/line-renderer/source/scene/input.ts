/**
 * Mouse and keyboard in the Scene view for the line tools (Unity's Edit
 * Points / Create Points), plus picking lines by clicking them.
 */
import { V3, v3, sub, add, dot, normalize, scaleAndAdd, dist } from '../../assets/core/math';
import { cc, cce, findNode, is2DView, runtimeReady, selectedNodeUuids, snapConfig, repaint } from './env';
import {
    sceneCamera, eventToScreen, screenRay, rayPlane, cameraForward, showRect, hideRect, showTip, hideTip, worldPerPixel, toScreen, Ray,
} from './view';
import { inCanvas, newPoint, pointWorld, setPointWorld } from './model';
import { S, Hit, note, bumpState, setSelection, toggleSelection, isSelected } from './state';
import {
    hitTest, pointsInRect, currentHandleFrame, setHandleAxesOverride, setDragAxis, setExtraDrawer, updateTarget, pickLine,
} from './render';
import { startHandleDrag, HandleDrag } from './handles';
import { EditSession } from './undo';
import { deleteSelected, selectAll, insertOnSegment } from './ops';
import * as D from './draw';

/** Above the editor's gizmos (99) and camera (98). */
export const PRIORITY = 100;
/**
 * Picking lines the editor can't see. It must run before the gizmo layer,
 * which also handles click selection; clicks near the selected nodes (where
 * their transform gizmo is) are left to the editor.
 */
export const PICK_PRIORITY = 100;
const GIZMO_RADIUS_PX = 110;
const DRAG_PX = 4;

type Active =
    | { kind: 'handle'; drag: HandleDrag; session: EditSession }
    | { kind: 'point'; index: number; x0: number; y0: number; dragging: boolean; toggled: boolean; session: EditSession | null; grab: V3 | null; starts: { i: number; pos: V3 }[] }
    | { kind: 'rect'; x0: number; y0: number; moved: boolean; additive: boolean; base: number[]; down: any; onSegment: boolean }
    | { kind: 'create'; session: EditSession; last: V3; normal: V3 | null };

let active: Active | null = null;
let lastHoverKey = '';

function changed(): void {
    bumpState();
    repaint();
}

function canEdit(): boolean {
    return S.primary && !S.replaying && runtimeReady();
}

function pointer(ev: any): { cam: any; x: number; y: number } | null {
    const cam = sceneCamera();
    if (!cam) return null;
    const p = eventToScreen(cam, ev);
    return { cam, x: p.x, y: p.y };
}

function hitKey(h: Hit | null): string {
    if (!h) return '';
    return h.kind === 'handle' ? `h:${h.axis}` : `${h.kind}:${h.index}`;
}

function setHover(h: Hit | null): void {
    S.hover = h;
    const key = hitKey(h);
    if (key !== lastHoverKey) {
        lastHoverKey = key;
        repaint();
    }
}

export function setMode(mode: 'none' | 'edit' | 'create'): void {
    if (S.mode === mode) return;
    cancelActive();
    S.mode = mode;
    S.hover = null;
    S.preview = null;
    if (mode !== 'edit') S.selection = [];
    changed();
}

// ---------------------------------------------------------------- mouse

export function onMouseDown(ev: any): boolean {
    if (!canEdit()) return true;
    if (active) cancelActive();
    S.diag.mouseDowns++;
    const left = ev.button === 0 || (ev.button === undefined && ev.leftButton);
    if (!left || ev.altKey) return true;
    const p = pointer(ev);
    if (!p) return true;
    const comp = updateTarget();
    if (!comp) return true;
    try {
        if (S.mode === 'create') return createDown(p.cam, p.x, p.y, comp, ev);
        return editDown(p.cam, p.x, p.y, comp, ev);
    } catch (e) {
        note(`mousedown: ${(e as Error)?.stack || e}`);
        active = null;
        return true;
    }
}

function editDown(cam: any, x: number, y: number, comp: any, ev: any): boolean {
    const hit = hitTest(cam, x, y, { segments: S.mode === 'edit' });
    if (S.mode === 'none') {
        // Clicking a point of the selected line starts editing it.
        if (hit?.kind !== 'point') return true;
        setMode('edit');
    }
    if (hit?.kind === 'handle') {
        const frame = currentHandleFrame(cam);
        if (!frame) return false;
        const drag = startHandleDrag(cam, frame, hit.axis, x, y, comp, S.selection);
        if (!drag) return false;
        setHandleAxesOverride(frame.axes);
        setDragAxis(hit.axis);
        active = { kind: 'handle', drag, session: new EditSession([comp]) };
        return false;
    }
    if (hit?.kind === 'point') {
        const additive = !!(ev.shiftKey || ev.ctrlKey || ev.metaKey);
        let toggled = false;
        if (additive) {
            toggleSelection(hit.index);
            toggled = true;
        } else if (!isSelected(hit.index)) {
            setSelection([hit.index]);
        } else {
            // Make it the active point.
            setSelection([...S.selection.filter((i) => i !== hit.index), hit.index]);
        }
        changed();
        active = { kind: 'point', index: hit.index, x0: x, y0: y, dragging: false, toggled, session: null, grab: null, starts: [] };
        return false;
    }
    active = {
        kind: 'rect',
        x0: x,
        y0: y,
        moved: false,
        additive: !!(ev.shiftKey || ev.ctrlKey || ev.metaKey),
        base: S.selection.slice(),
        down: cloneEvent(ev),
        onSegment: hit?.kind === 'segment',
    };
    return false;
}

function cloneEvent(ev: any): any {
    const o: any = {};
    for (const k in ev) if (typeof ev[k] !== 'function') o[k] = ev[k];
    return o;
}

export function onMouseMove(ev: any): boolean {
    if (!canEdit()) return true;
    const p = pointer(ev);
    if (!p) return true;
    try {
        if (!active) {
            hover(p.cam, p.x, p.y);
            return true;
        }
        return dragMove(p.cam, p.x, p.y, ev);
    } catch (e) {
        note(`mousemove: ${(e as Error)?.stack || e}`);
        return true;
    }
}

function hover(cam: any, x: number, y: number): void {
    const comp = S.target;
    if (!comp || S.mode === 'none') {
        if (S.hover) setHover(null);
        return;
    }
    if (S.mode === 'create') {
        const place = placement(cam, x, y, comp);
        S.preview = place ? place.world : null;
        repaint();
        return;
    }
    setHover(hitTest(cam, x, y));
}

function dragMove(cam: any, x: number, y: number, ev: any): boolean {
    const a = active!;
    const comp = S.target;
    switch (a.kind) {
        case 'handle': {
            let text = '';
            a.session.apply(() => {
                text = a.drag.update(x, y, ev);
            });
            if (text) showTip(cam, x, y, text);
            return false;
        }
        case 'point': {
            if (!comp) return false;
            if (!a.dragging) {
                if (Math.hypot(x - a.x0, y - a.y0) < DRAG_PX || a.toggled) return false;
                a.dragging = true;
                a.starts = S.selection.map((i) => ({ i, pos: pointWorld(comp, i) }));
                a.grab = pointWorld(comp, a.index);
                a.session = new EditSession([comp]);
            }
            const grab = a.grab!;
            const hit = rayPlane(screenRay(cam, x, y), grab, cameraForward(cam), true);
            if (!hit) return false;
            const delta = sub(v3(), hit, grab);
            const snap = snapConfig();
            if (snap.isPositionSnapEnabled !== !!ev.ctrlKey) {
                const t = add(v3(), grab, delta);
                t.x = Math.round(t.x / (snap.position.x || 1)) * (snap.position.x || 1);
                t.y = Math.round(t.y / (snap.position.y || 1)) * (snap.position.y || 1);
                if (!is2DView()) t.z = Math.round(t.z / (snap.position.z || 1)) * (snap.position.z || 1);
                sub(delta, t, grab);
            }
            a.session!.apply(() => {
                for (const s of a.starts) setPointWorld(comp, s.i, add(v3(), s.pos, delta));
            });
            return false;
        }
        case 'rect': {
            if (!a.moved && Math.hypot(x - a.x0, y - a.y0) < DRAG_PX) return false;
            a.moved = true;
            showRect(cam, a.x0, a.y0, x, y);
            const inside = pointsInRect(cam, a.x0, a.y0, x, y);
            setSelection(a.additive ? [...a.base, ...inside] : inside);
            repaint();
            return false;
        }
        case 'create': {
            if (!comp) return false;
            const place = placement(cam, x, y, comp);
            if (!place) return false;
            S.preview = place.world;
            // Drawing: a new point every Min Vertex Distance (at least a few pixels).
            const minDist = Math.max(S.settings.minVertexDistance, worldPerPixel(cam, place.world) * 3);
            if (dist(place.world, a.last) >= minDist) {
                a.last = place.world;
                const w = place.world;
                a.session.apply(() => {
                    comp.positions = [...comp.positions, newPoint(comp, w)];
                });
            }
            repaint();
            return false;
        }
    }
    return false;
}

export function onMouseUp(ev: any): boolean {
    if (S.replaying || !active) return true;
    const a = active;
    active = null;
    try {
        switch (a.kind) {
            case 'handle':
                a.session.end();
                setHandleAxesOverride(null);
                setDragAxis(null);
                hideTip();
                break;
            case 'point':
                if (a.session) a.session.end();
                else if (!a.toggled && S.selection.length > 1) setSelection([a.index]);
                break;
            case 'rect':
                hideRect();
                if (!a.moved && !a.additive) {
                    if (a.onSegment || S.selection.length) setSelection([]);
                    else replayClick(a.down, ev);
                }
                break;
            case 'create':
                a.session.end();
                break;
        }
    } catch (e) {
        note(`mouseup: ${(e as Error)?.stack || e}`);
    }
    changed();
    return false;
}

function replayClick(down: any, up: any): void {
    const op = cce().Operation;
    if (!op?.emit) return;
    S.replaying = true;
    try {
        op.emit('mousedown', down);
        op.emit('mouseup', up);
    } catch (e) {
        note(`replay: ${e}`);
    } finally {
        S.replaying = false;
    }
}

export function onDblClick(ev: any): boolean {
    if (!canEdit() || S.mode !== 'edit' || !S.target) return true;
    const p = pointer(ev);
    if (!p) return true;
    const hit = hitTest(p.cam, p.x, p.y, { handles: false });
    if (hit?.kind !== 'segment') return true;
    insertOnSegment(S.target, hit.index, hit.world);
    return false;
}

export function cancelActive(): void {
    if (!active) return;
    const a = active;
    active = null;
    if (a.kind === 'handle' || a.kind === 'create') a.session.end();
    if (a.kind === 'point' && a.session) a.session.end();
    setHandleAxesOverride(null);
    setDragAxis(null);
    hideRect();
    hideTip();
}

export function isDragging(): boolean {
    return !!active;
}

// --------------------------------------------------------- Create Points

function createDown(cam: any, x: number, y: number, comp: any, _ev: any): boolean {
    const place = placement(cam, x, y, comp);
    if (!place) return false;
    const session = new EditSession([comp]);
    const w = place.world;
    session.apply(() => {
        comp.positions = [...comp.positions, newPoint(comp, w)];
    });
    active = { kind: 'create', session, last: w, normal: place.normal };
    return false;
}

/** Where Create Points puts a point for screen position (x, y). */
export function placement(cam: any, x: number, y: number, comp: any): { world: V3; normal: V3 | null } | null {
    const ray = screenRay(cam, x, y);
    const mode = S.settings.inputMode;
    if (mode === 'view') {
        return { world: scaleAndAdd(v3(), ray.o, ray.d, Math.max(0, S.settings.viewDistance)), normal: null };
    }
    if (mode === 'surface' && !is2DView()) {
        const hit = raycastScene(ray);
        if (hit) return { world: scaleAndAdd(v3(), hit, ray.d, -S.settings.surfaceOffset), normal: null };
    }
    // The node's XY plane in 2D, the ground through the last point in 3D.
    const flat = is2DView() || inCanvas(comp);
    let normal: V3;
    let origin: V3;
    const wp = comp.node.worldPosition;
    if (flat) {
        const r = comp.node.worldRotation;
        const z = { x: 2 * (r.x * r.z + r.w * r.y), y: 2 * (r.y * r.z - r.w * r.x), z: 1 - 2 * (r.x * r.x + r.y * r.y) };
        normal = normalize(v3(), v3(z.x, z.y, z.z));
        origin = v3(wp.x, wp.y, wp.z);
    } else {
        normal = v3(0, 1, 0);
        const n = comp.positions.length;
        origin = n ? pointWorld(comp, n - 1) : v3(wp.x, wp.y, wp.z);
    }
    let p: V3 | null = null;
    if (Math.abs(dot(ray.d, normal)) > 0.02) p = rayPlane(ray, origin, normal);
    if (!p) p = rayPlane(ray, origin, cameraForward(cam), true);
    if (!p) return null;
    return { world: p, normal };
}

function hasFlags(node: any, flags: number): boolean {
    for (let n = node; n; n = n.parent) if ((n._objFlags & flags) !== 0) return true;
    return false;
}

/** Closest scene geometry under the ray (models of user nodes only). */
function raycastScene(ray: Ray): V3 | null {
    try {
        const { director, geometry, CCObject } = cc();
        const scene: any = director.getScene();
        const rs = scene?.renderScene;
        if (!rs) return null;
        const r = new geometry.Ray(ray.o.x, ray.o.y, ray.o.z, ray.d.x, ray.d.y, ray.d.z);
        const hidden = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
        let best = Infinity;
        const opts: any = { mode: geometry.ERaycastMode.CLOSEST, distance: Infinity, doubleSided: false };
        for (const model of rs.models) {
            const node = model.node;
            if (!model.enabled || !node || !node.activeInHierarchy || node.scene !== scene) continue;
            if (hasFlags(node, hidden)) continue;
            if (S.target && node === S.target.node) continue;
            if (model.worldBounds && !geometry.intersect.rayAABB(r, model.worldBounds)) continue;
            const d = geometry.intersect.rayModel(r, model, opts);
            if (d > 0 && d < best) best = d;
        }
        return isFinite(best) ? scaleAndAdd(v3(), ray.o, ray.d, best) : null;
    } catch (e) {
        note(`raycast: ${e}`);
        return null;
    }
}

function drawCreatePreview(_cam: any): void {
    const comp = S.target;
    if (S.mode !== 'create' || !comp || !S.preview) return;
    D.disc(S.preview, 4, D.Colors.preview);
    const n = comp.positions.length;
    if (n && !active) D.line(pointWorld(comp, n - 1), S.preview, D.Colors.preview);
}

setExtraDrawer(drawCreatePreview);

// --------------------------------------------------------------- picking

/** The click may be on the transform gizmo of a selected node. */
function nearSelectedGizmo(cam: any, x: number, y: number): boolean {
    for (const uuid of selectedNodeUuids()) {
        const n = findNode(uuid);
        if (!n || !n.isValid) continue;
        const wp = n.worldPosition;
        const sp = toScreen(cam, v3(wp.x, wp.y, wp.z));
        if (sp.visible && Math.hypot(sp.x - x, sp.y - y) < GIZMO_RADIUS_PX) return true;
    }
    return false;
}

/** Selects a line clicked in the Scene view (the editor's picking can't see line geometry). */
export function onPickMouseDown(ev: any): boolean {
    if (!canEdit() || S.mode !== 'none') return true;
    const left = ev.button === 0 || (ev.button === undefined && ev.leftButton);
    if (!left || ev.altKey) return true;
    const p = pointer(ev);
    if (!p) return true;
    if (nearSelectedGizmo(p.cam, p.x, p.y)) return true;
    const comp = pickLine(p.cam, p.x, p.y);
    if (!comp) return true;
    if (comp === S.target) {
        // Points of the edited line belong to Edit Points; elsewhere on it keep the selection.
        return hitTest(p.cam, p.x, p.y, { handles: false, segments: false })?.kind === 'point';
    }
    S.diag.picks++;
    try {
        const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
        if (!additive) Editor.Selection.clear('node');
        Editor.Selection.select('node', comp.node.uuid);
    } catch (e) {
        note(`pick: ${e}`);
    }
    return false;
}

// --------------------------------------------------------------- keyboard

export function onKeyDown(ev: any): boolean {
    if (!canEdit() || S.mode === 'none' || !S.target) return true;
    const key = String(ev.key || '').toLowerCase();
    try {
        switch (key) {
            case 'escape':
                if (active) {
                    cancelActive();
                    return false;
                }
                if (S.mode === 'edit' && S.selection.length) setSelection([]);
                else setMode('none');
                changed();
                return false;
            case 'enter':
                if (S.mode === 'create') {
                    setMode('none');
                    return false;
                }
                return true;
            case 'delete':
            case 'backspace':
                if (S.mode !== 'edit' || !S.selection.length) return true;
                deleteKey();
                return false;
            case 'a':
                if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return true;
                S.selectAllKeyAt = Date.now();
                selectAll();
                return false;
        }
    } catch (e) {
        note(`keydown: ${(e as Error)?.stack || e}`);
    }
    return true;
}

export function onKeyUp(_ev: any): boolean {
    return true;
}

export function deleteKey(): void {
    const now = Date.now();
    if (now - S.deleteKeyAt < 150) return;
    S.deleteKeyAt = now;
    deleteSelected();
}
