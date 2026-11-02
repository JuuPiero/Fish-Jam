/**
 * DOM-free part of @showInInspector: turns a described value into the rows
 * the Inspector shows (tested in tests/inspect.test.ts).
 */
import type { InspectNode, InspectResult } from '../shared/meta';
import { nicify } from './logic';

type Container = Extract<InspectNode, { t: 'list' | 'map' | 'obj' }>;
type Primitive = 'num' | 'str' | 'bool';

export interface InspectRow {
    /** Stable key for reusing the row's element. */
    key: string;
    kind: 'leaf' | 'container' | 'more' | 'add' | 'error';
    depth: number;
    label: string;
    node?: InspectNode;
    /** The value can be replaced from the Inspector. */
    editable: boolean;
    /** The item can be removed from its collection. */
    removable: boolean;
    /** 'add' rows: the collection and the new item's default value (and key type for maps). */
    add?: { path: string; value: unknown; keyType?: 'num' | 'str' };
    /** 'more' and 'error' rows. */
    text?: string;
}

export interface FlattenOptions {
    label: string;
    disabled: boolean;
    isOpen(path: string, depth: number): boolean;
}

const DEFAULTS: Record<Primitive, unknown> = { num: 0, str: '', bool: false };

export function isContainer(n: InspectNode): n is Container {
    return n.t === 'list' || n.t === 'map' || n.t === 'obj';
}

export function summary(n: InspectNode): string {
    if (n.t === 'list') return `${n.cls} (${n.size})`;
    if (n.t === 'map') return `Map (${n.size})`;
    if (n.t === 'obj') return n.size ? n.cls : `${n.cls} {}`;
    return '';
}

/** How a value reads as a label (map keys). */
export function keyLabel(n: InspectNode): string {
    switch (n.t) {
        case 'str':
        case 'text':
            return n.v;
        case 'num':
        case 'bool':
            return String(n.v);
        case 'null':
            return 'null';
        case 'undef':
            return 'undefined';
        case 'vec':
            return `(${Object.values(n.v).map((x) => Number(x.toFixed(3))).join(', ')})`;
        case 'color':
            return `rgba(${n.v.r}, ${n.v.g}, ${n.v.b}, ${n.v.a})`;
        case 'ref':
            return n.valid ? n.name || n.cls : 'Missing';
        default:
            return summary(n);
    }
}

function primitiveType(nodes: InspectNode[]): Primitive | null {
    if (!nodes.length) return null;
    const t = nodes[0].t;
    if (t !== 'num' && t !== 'str' && t !== 'bool') return null;
    return nodes.every((n) => n.t === t) ? t : null;
}

function canSetChild(parent: Container): boolean {
    return !(parent.t === 'list' && parent.cls === 'Set');
}

function canRemoveChild(parent: Container): boolean {
    return parent.t === 'map' || (parent.t === 'list' && (parent.cls === 'Array' || parent.cls === 'Set'));
}

/** What a new item would look like, inferred from the items there (primitives only). */
export function addInfo(n: InspectNode): InspectRow['add'] | undefined {
    if (n.t === 'list' && (n.cls === 'Array' || n.cls === 'Set')) {
        const t = primitiveType(n.items || []);
        return t ? { path: n.p, value: DEFAULTS[t] } : undefined;
    }
    if (n.t === 'map') {
        const entries = n.entries || [];
        const kt = primitiveType(entries.map((e) => e.k));
        const vt = primitiveType(entries.map((e) => e.v));
        if ((kt === 'num' || kt === 'str') && vt) return { path: n.p, value: DEFAULTS[vt], keyType: kt };
    }
    return undefined;
}

export function flattenInspect(result: InspectResult | undefined, o: FlattenOptions): InspectRow[] {
    const base = { depth: 0, label: o.label, editable: false, removable: false };
    if (!result) return [{ ...base, key: '#loading', kind: 'more', text: '…' }];
    if ('error' in result) return [{ ...base, key: '#error', kind: 'error', text: result.error }];

    const rows: InspectRow[] = [];
    const walk = (node: InspectNode, label: string, depth: number, parent: Container | null) => {
        const container = isContainer(node);
        const editable = !o.disabled && !container && (parent ? canSetChild(parent) : result.writable);
        const removable = !o.disabled && !!parent && canRemoveChild(parent);
        rows.push({ key: node.p, kind: container ? 'container' : 'leaf', depth, label, node, editable, removable });
        if (!container || !o.isOpen(node.p, depth)) return;

        if (node.t === 'list') node.items?.forEach((c, i) => walk(c, String(i), depth + 1, node));
        else if (node.t === 'map') node.entries?.forEach((e) => walk(e.v, keyLabel(e.k), depth + 1, node));
        else node.keys?.forEach((e) => walk(e.v, node.cls === 'Object' ? e.k : nicify(e.k), depth + 1, node));

        const child = { depth: depth + 1, label: '', editable: false, removable: false };
        if (node.more) rows.push({ ...child, key: `${node.p}#more`, kind: 'more', text: `… ${node.more} more` });
        const add = o.disabled ? undefined : addInfo(node);
        if (add) rows.push({ ...child, key: `${node.p}#add`, kind: 'add', add });
    };
    walk(result.node, o.label, 0, null);
    return rows;
}
