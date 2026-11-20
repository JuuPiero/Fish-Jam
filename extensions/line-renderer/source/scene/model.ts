/**
 * Points of the edited LineRenderer in world space, and the line being edited.
 */
import { V3, v3, copy, m4TransformPoint } from '../../assets/core/math';
import { cc, findNode, lineClass, selectedNodeUuids } from './env';

const _inv = new Map<any, { stamp: string; m: any }>();

function inverse(node: any): any {
    const m = node.worldMatrix;
    const stamp = `${m.m00},${m.m01},${m.m02},${m.m04},${m.m05},${m.m06},${m.m08},${m.m09},${m.m10},${m.m12},${m.m13},${m.m14}`;
    let e = _inv.get(node);
    if (!e || e.stamp !== stamp) {
        const { Mat4 } = cc();
        const inv = new Mat4();
        Mat4.invert(inv, m);
        e = { stamp, m: inv };
        _inv.set(node, e);
    }
    return e.m;
}

/** World position of point i. */
export function pointWorld(comp: any, i: number, out: V3 = v3()): V3 {
    const p = comp.positions[i];
    if (!p) return out;
    if (comp.useWorldSpace) return copy(out, p);
    return m4TransformPoint(out, comp.node.worldMatrix, p);
}

export function worldPoints(comp: any): V3[] {
    const res: V3[] = [];
    for (let i = 0; i < comp.positions.length; i++) res.push(pointWorld(comp, i));
    return res;
}

/** A world position in the line's point space. */
export function toPointSpace(comp: any, world: V3, out: V3 = v3()): V3 {
    if (comp.useWorldSpace) return copy(out, world);
    return m4TransformPoint(out, inverse(comp.node), world);
}

export function setPointWorld(comp: any, i: number, world: V3): void {
    const p = comp.positions[i];
    if (!p) return;
    const local = toPointSpace(comp, world);
    p.set(local.x, local.y, local.z);
}

/** A new engine Vec3 in the line's point space. */
export function newPoint(comp: any, world: V3): any {
    const { Vec3 } = cc();
    const p = toPointSpace(comp, world);
    return new Vec3(p.x, p.y, p.z);
}

/** The node's world rotation as a plain quaternion. */
export function nodeRotation(comp: any): { x: number; y: number; z: number; w: number } {
    const r = comp.node.worldRotation;
    return { x: r.x, y: r.y, z: r.z, w: r.w };
}

/** The LineRenderer on the first selected node (the one the tools edit). */
export function currentLine(): any {
    const C = lineClass();
    if (!C) return null;
    for (const uuid of selectedNodeUuids()) {
        const node = findNode(uuid);
        if (!node || !node.isValid || !node.activeInHierarchy) continue;
        const comp = node.getComponent(C);
        if (comp && comp.enabledInHierarchy) return comp;
    }
    return null;
}

/** The line lies in a 2D (UI) hierarchy. */
export function inCanvas(comp: any): boolean {
    const UITransform = cc().UITransform;
    for (let n = comp.node; n; n = n.parent) if (n.getComponent?.(UITransform)) return true;
    return false;
}
