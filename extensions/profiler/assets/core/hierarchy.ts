/**
 * The Hierarchy view of a frame (Unity's Profiler Hierarchy): samples with
 * the same name under the same parent are merged (Calls), with Total and
 * Self time. Pure.
 */
import { FrameData, SAMPLE_STRIDE } from './protocol';

export interface HierarchyNode {
    /** Path of names from the top ("Update/PlayerController.update"): stable across frames. */
    key: string;
    name: string;
    depth: number;
    totalMs: number;
    selfMs: number;
    calls: number;
    children: HierarchyNode[];
}

export type SortColumn = 'name' | 'total' | 'self' | 'calls';

/** The merged tree of one frame. Unknown name ids show as "#id". */
export function buildHierarchy(frame: FrameData, names: (id: number) => string): HierarchyNode[] {
    const s = frame.samples || [];
    const n = Math.floor(s.length / SAMPLE_STRIDE);
    const nodeOf: HierarchyNode[] = new Array(n);
    const roots: HierarchyNode[] = [];
    const byKey = new Map<string, HierarchyNode>();
    for (let i = 0; i < n; i++) {
        const k = i * SAMPLE_STRIDE;
        const name = names(s[k]) || '#' + s[k];
        const parentIdx = s[k + 1];
        const dur = Math.max(0, s[k + 3]);
        const parent = parentIdx >= 0 && parentIdx < i ? nodeOf[parentIdx] : null;
        const key = parent ? parent.key + '/' + name : name;
        let node = byKey.get(key);
        if (!node) {
            node = { key, name, depth: parent ? parent.depth + 1 : 0, totalMs: 0, selfMs: 0, calls: 0, children: [] };
            byKey.set(key, node);
            (parent ? parent.children : roots).push(node);
        }
        node.totalMs += dur;
        node.calls++;
        nodeOf[i] = node;
    }
    const self = (node: HierarchyNode): void => {
        let c = 0;
        for (let i = 0; i < node.children.length; i++) {
            self(node.children[i]);
            c += node.children[i].totalMs;
        }
        node.selfMs = Math.max(0, node.totalMs - c);
    };
    for (let i = 0; i < roots.length; i++) self(roots[i]);
    return roots;
}

function compare(col: SortColumn, desc: boolean) {
    return (a: HierarchyNode, b: HierarchyNode): number => {
        let d: number;
        if (col === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        else if (col === 'self') d = a.selfMs - b.selfMs;
        else if (col === 'calls') d = a.calls - b.calls;
        else d = a.totalMs - b.totalMs;
        return desc ? -d : d;
    };
}

/** Rows to show: depth-first, sorted per level, children only under expanded keys. */
export function flattenHierarchy(roots: HierarchyNode[], expanded: (key: string) => boolean, col: SortColumn = 'total', desc = true): HierarchyNode[] {
    const out: HierarchyNode[] = [];
    const cmp = compare(col, desc);
    const walk = (list: HierarchyNode[]) => {
        const sorted = list.slice().sort(cmp);
        for (let i = 0; i < sorted.length; i++) {
            out.push(sorted[i]);
            if (sorted[i].children.length && expanded(sorted[i].key)) walk(sorted[i].children);
        }
    };
    walk(roots);
    return out;
}

/** Total time of the top-level samples with this name (a phase of the frame), 0 when absent. */
export function topLevelMs(frame: FrameData, nameId: number): number {
    const s = frame.samples || [];
    let t = 0;
    for (let k = 0; k + 3 < s.length; k += SAMPLE_STRIDE) if (s[k] === nameId && s[k + 1] === -1) t += Math.max(0, s[k + 3]);
    return t;
}
