import { Asset, Color, Component, js, Node, Quat, Rect, Size, Vec2, Vec3, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';

/**
 * Odin-style inspector attributes for Cocos Creator components.
 *
 * Put them next to `@property` (fields) or on methods (`@button`). They only
 * record metadata on the class; the advanced-inspector extension reads it and
 * draws the Inspector. In a built game they cost nothing but that metadata.
 *
 * ```ts
 * @ccclass('Enemy')
 * export class Enemy extends Component {
 *     @title('Stats')
 *     @property hp = 100;
 *
 *     @property isBoss = false;
 *
 *     @showIf('isBoss')
 *     @infoBox('Bosses ignore knockback', 'warning')
 *     @property bossPhase = 1;
 *
 *     @button('Kill')
 *     kill() { this.hp = 0; }
 * }
 * ```
 */

// ------------------------------------------------------------------ types

export type InfoBoxType = 'none' | 'info' | 'warning' | 'error';
export type ButtonSize = 'small' | 'medium' | 'large' | number;
export type ButtonColor = 'default' | 'blue' | 'red' | 'green';

/** `member` is a field, getter or method name ("!name" negates); with values, it must equal one of them. */
export interface Condition {
    member: string;
    values?: unknown[];
}

export interface GroupRef {
    kind: 'box' | 'foldout' | 'tab' | 'horizontal' | 'buttons';
    /** Slash separated, e.g. "Settings/Advanced". */
    path: string;
    /** Tab name (kind 'tab'). */
    tab?: string;
    label?: string;
    showLabel?: boolean;
    expanded?: boolean;
}

export interface DropdownItem {
    label: string;
    value: unknown;
}

export interface MemberMeta {
    name: string;
    kind: 'field' | 'method';
    /** Declaration order of decorated members. */
    seq: number;
    /** The last @property declared before this member, null when none (places buttons and shown members). */
    anchor?: string | null;
    order?: number;
    spaceBefore?: number;
    spaceAfter?: number;
    title?: { title: string; subtitle?: string; bold?: boolean; line?: boolean };
    group?: GroupRef;
    showIf?: Condition[];
    hideIf?: Condition[];
    enableIf?: Condition[];
    disableIf?: Condition[];
    readOnly?: boolean;
    hideInPlayMode?: boolean;
    hideInEditMode?: boolean;
    disableInPlayMode?: boolean;
    disableInEditMode?: boolean;
    infoBoxes?: { message: string; type: InfoBoxType; visibleIf?: Condition }[];
    required?: { message?: string };
    validate?: { method: string; message?: string };
    label?: string;
    hideLabel?: boolean;
    suffix?: string;
    color?: [number, number, number, number];
    progressBar?: { min: number | string; max: number | string; color?: [number, number, number, number] };
    minMax?: { min: number; max: number; showFields: boolean };
    dropdown?: { items?: DropdownItem[]; member?: string };
    toggleButtons?: boolean;
    onChanged?: string[];
    button?: { label?: string; size?: ButtonSize; color?: ButtonColor };
    inlineButtons?: { method: string; label?: string }[];
    showInInspector?: boolean;
}

export interface ClassMeta {
    version: 1;
    members: MemberMeta[];
}

// --------------------------------------------------------------- registry

const META = '__advInspectorMeta__';
const CC_CACHE = '__ccclassCache__';
/** Classes using attributes (editor only, for Extension → Advanced Inspector → Show Info). */
const classes: Set<any> | null = EDITOR ? new Set() : null;
let seq = 0;

function member(target: any, key: string, kind: MemberMeta['kind']): MemberMeta {
    const ctor = target.constructor;
    if (!Object.prototype.hasOwnProperty.call(ctor, META)) classes?.add(ctor);
    const own: ClassMeta = Object.prototype.hasOwnProperty.call(ctor, META)
        ? ctor[META]
        : (ctor[META] = { version: 1, members: [] });
    let m = own.members.find((x) => x.name === key);
    if (!m) {
        m = { name: key, kind, seq: seq++ };
        // Cocos collects @property declarations in declaration order while the
        // class body is decorated (@ccclass consumes them afterwards); the last
        // one seen is the property a button or a @showInInspector member follows.
        const props = Object.prototype.hasOwnProperty.call(ctor, CC_CACHE) ? ctor[CC_CACHE]?.proto?.properties : null;
        m.anchor = props ? (Object.keys(props).pop() ?? null) : null;
        own.members.push(m);
    }
    if (kind === 'method') m.kind = 'method';
    return m;
}

/** Metadata of a class, including its base classes (base members first). */
export function getClassMeta(ctor: any): ClassMeta | null {
    const chain: ClassMeta[] = [];
    for (let c = ctor; c && c !== Component && c !== Object; c = Object.getPrototypeOf(c)) {
        if (Object.prototype.hasOwnProperty.call(c, META)) chain.unshift(c[META]);
    }
    if (!chain.length) return null;
    const byName = new Map<string, MemberMeta>();
    for (const cm of chain) for (const m of cm.members) byName.set(m.name, { ...(byName.get(m.name) || {}), ...m });
    return { version: 1, members: Array.from(byName.values()).sort((a, b) => a.seq - b.seq) };
}

type Decorator = (target: any, key: string, descriptor?: any) => void;

function fieldDecorator(apply: (m: MemberMeta) => void): Decorator {
    return (target, key, descriptor) => {
        const isMethod = !!descriptor && typeof descriptor.value === 'function';
        apply(member(target, key, isMethod ? 'method' : 'field'));
    };
}

/** Lets a flag decorator be used as `@flag` or `@flag()`. */
function flag(apply: (m: MemberMeta) => void) {
    function decorator(): Decorator;
    function decorator(target: any, key: string, descriptor?: any): void;
    function decorator(target?: any, key?: string, descriptor?: any): any {
        const d = fieldDecorator(apply);
        if (target !== undefined && typeof key === 'string') return d(target, key, descriptor);
        return d;
    }
    return decorator;
}

function toConditions(member: string, values: unknown[]): Condition[] {
    return [values.length ? { member, values } : { member }];
}

function parseColor(c: string | number[]): [number, number, number, number] {
    if (Array.isArray(c)) return [c[0] ?? 255, c[1] ?? 255, c[2] ?? 255, c[3] ?? 255];
    const hex = c.replace('#', '');
    const n = parseInt(hex.length <= 4 ? hex.split('').map((x) => x + x).join('') : hex, 16);
    if (hex.length === 8 || hex.length === 4) return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function listItems(list: unknown): DropdownItem[] {
    if (!Array.isArray(list)) return [];
    return list.map((it: any) => (it && typeof it === 'object' && 'value' in it
        ? { label: String(it.label ?? it.value), value: it.value }
        : { label: String(it), value: it }));
}

// --------------------------------------------------------------- buttons

/** Show a method as a button. */
export function button(label?: string, options: { size?: ButtonSize; color?: ButtonColor } = {}): Decorator {
    return fieldDecorator((m) => {
        m.button = { label, size: options.size, color: options.color };
    });
}

/** Put this @button (or field) in a horizontal row named `path`. */
export function buttonGroup(path = 'Buttons'): Decorator {
    return fieldDecorator((m) => {
        m.group = { kind: 'buttons', path };
    });
}

/** A small button after the field that calls `method`. */
export function inlineButton(method: string, label?: string): Decorator {
    return fieldDecorator((m) => {
        (m.inlineButtons ??= []).push({ method, label });
    });
}

// ---------------------------------------------------------------- layout

export function title(text: string, options: { subtitle?: string; bold?: boolean; line?: boolean } = {}): Decorator {
    return fieldDecorator((m) => {
        m.title = { title: text, subtitle: options.subtitle, bold: options.bold ?? true, line: options.line ?? true };
    });
}

export function boxGroup(path: string, options: { label?: string; showLabel?: boolean } = {}): Decorator {
    return fieldDecorator((m) => {
        m.group = { kind: 'box', path, label: options.label, showLabel: options.showLabel ?? true };
    });
}

export function foldoutGroup(path: string, options: { label?: string; expanded?: boolean } = {}): Decorator {
    return fieldDecorator((m) => {
        m.group = { kind: 'foldout', path, label: options.label, expanded: options.expanded ?? false };
    });
}

/** `@tabGroup('Tab')` (group "Tabs") or `@tabGroup('Group', 'Tab')`. */
export function tabGroup(groupOrTab: string, tab?: string): Decorator {
    return fieldDecorator((m) => {
        m.group = tab === undefined ? { kind: 'tab', path: 'Tabs', tab: groupOrTab } : { kind: 'tab', path: groupOrTab, tab };
    });
}

export function horizontalGroup(path = 'Row'): Decorator {
    return fieldDecorator((m) => {
        m.group = { kind: 'horizontal', path };
    });
}

export function propertySpace(before = 8, after = 0): Decorator {
    return fieldDecorator((m) => {
        m.spaceBefore = before;
        m.spaceAfter = after;
    });
}

/** Lower first; members without an order count as 0. */
export function propertyOrder(order: number): Decorator {
    return fieldDecorator((m) => {
        m.order = order;
    });
}

// ------------------------------------------------------------- conditions

/** Show when `member` is truthy, or equals one of `values`. "!member" negates. */
export function showIf(member: string, ...values: unknown[]): Decorator {
    return fieldDecorator((m) => {
        (m.showIf ??= []).push(...toConditions(member, values));
    });
}

export function hideIf(member: string, ...values: unknown[]): Decorator {
    return fieldDecorator((m) => {
        (m.hideIf ??= []).push(...toConditions(member, values));
    });
}

export function enableIf(member: string, ...values: unknown[]): Decorator {
    return fieldDecorator((m) => {
        (m.enableIf ??= []).push(...toConditions(member, values));
    });
}

export function disableIf(member: string, ...values: unknown[]): Decorator {
    return fieldDecorator((m) => {
        (m.disableIf ??= []).push(...toConditions(member, values));
    });
}

export const readOnly = flag((m) => {
    m.readOnly = true;
});

export const hideInPlayMode = flag((m) => {
    m.hideInPlayMode = true;
});

export const hideInEditMode = flag((m) => {
    m.hideInEditMode = true;
});

export const disableInPlayMode = flag((m) => {
    m.disableInPlayMode = true;
});

export const disableInEditMode = flag((m) => {
    m.disableInEditMode = true;
});

// --------------------------------------------------------------- messages

/** Message box above the member; `visibleIf` is a member name like showIf. */
export function infoBox(message: string, type: InfoBoxType = 'info', visibleIf?: string): Decorator {
    return fieldDecorator((m) => {
        (m.infoBoxes ??= []).push({ message, type, visibleIf: visibleIf ? { member: visibleIf } : undefined });
    });
}

/** Error box when the value is empty (null reference, empty string). */
export function required(message?: string): Decorator {
    return fieldDecorator((m) => {
        m.required = { message };
    });
}

/** `method(value)` returns true when valid, false or an error message otherwise. */
export function validateInput(method: string, message?: string): Decorator {
    return fieldDecorator((m) => {
        m.validate = { method, message };
    });
}

// ------------------------------------------------------------------ label

export function labelText(text: string): Decorator {
    return fieldDecorator((m) => {
        m.label = text;
    });
}

export const hideLabel = flag((m) => {
    m.hideLabel = true;
});

/** Text after the field, e.g. "px", "sec". */
export function suffixLabel(text: string): Decorator {
    return fieldDecorator((m) => {
        m.suffix = text;
    });
}

/** Tint the member: "#ff8800", "#ff880080" or [r, g, b, a?]. */
export function guiColor(color: string | number[]): Decorator {
    return fieldDecorator((m) => {
        m.color = parseColor(color);
    });
}

// ----------------------------------------------------------------- values

/** Draw a number as a draggable progress bar. min/max may be member names. */
export function progressBar(min: number | string = 0, max: number | string = 100, color?: string | number[]): Decorator {
    return fieldDecorator((m) => {
        m.progressBar = { min, max, color: color ? parseColor(color) : undefined };
    });
}

/** Draw a Vec2 (x = min, y = max) as a range slider. */
export function minMaxSlider(min: number, max: number, showFields = true): Decorator {
    return fieldDecorator((m) => {
        m.minMax = { min, max, showFields };
    });
}

/**
 * Pick the value from a list: values, `{ label, value }` items, or the name of
 * a member (field, getter or method) returning such a list.
 */
export function valueDropdown(items: string | ReadonlyArray<unknown>): Decorator {
    return fieldDecorator((m) => {
        m.dropdown = typeof items === 'string' ? { member: items } : { items: listItems(items) };
    });
}

/** Draw an enum (or bitmask) as a row of buttons. */
export const enumToggleButtons = flag((m) => {
    m.toggleButtons = true;
});

/** Call `method` after the value was changed in the Inspector. */
export function onValueChanged(method: string): Decorator {
    return fieldDecorator((m) => {
        (m.onChanged ??= []).push(method);
    });
}

/**
 * Show a member that isn't a `@property`: a plain field, a getter, or values
 * Cocos can't serialize such as Map and Set. Its contents can be edited, but
 * like any non-serialized value they are not saved with the scene.
 */
export const showInInspector = flag((m) => {
    m.showInInspector = true;
});

// --------------------------------------------------------- editor support

/** What the Inspector asks a component for: dynamic conditions and validations. */
export interface EvalRequest {
    members?: string[];
    validate?: { method: string; member: string }[];
    lists?: string[];
    /** @showInInspector members to describe. */
    inspect?: string[];
    /** Expanded paths in those members. */
    open?: string[];
}

// ------------------------------------------------- @showInInspector values

/** Items shown per collection. */
const LIST_LIMIT = 100;
const TEXT_LIMIT = 2000;

/**
 * A value described for the Inspector. `p` is its path: the member name, then
 * "/i<n>" (list item), "/e<n>" (map entry value) or "/k<encoded key>" per level.
 */
type InspectNode = { t: string; p: string; [key: string]: any };

function childPath(p: string, kind: 'i' | 'e' | 'k', id: string | number): string {
    return `${p}/${kind}${kind === 'k' ? encodeURIComponent(String(id)) : id}`;
}

function classNameOf(v: any): string {
    try {
        return js.getClassName(v) || v?.constructor?.name || 'Object';
    } catch {
        return 'Object';
    }
}

function describe(v: any, p: string, open: Set<string>, path: Set<unknown>): InspectNode {
    if (v === null) return { t: 'null', p };
    switch (typeof v) {
        case 'undefined':
            return { t: 'undef', p };
        case 'number':
            return Number.isFinite(v) ? { t: 'num', p, v } : { t: 'text', p, v: String(v) };
        case 'string':
            return v.length > TEXT_LIMIT ? { t: 'text', p, v: `${v.slice(0, TEXT_LIMIT)}…` } : { t: 'str', p, v };
        case 'boolean':
            return { t: 'bool', p, v };
        case 'function':
            return { t: 'text', p, v: `ƒ ${v.name || 'anonymous'}()` };
        case 'object':
            break;
        default:
            return { t: 'text', p, v: String(v) };
    }

    if (v instanceof Vec2) return { t: 'vec', p, cls: 'Vec2', v: { x: v.x, y: v.y } };
    if (v instanceof Vec3) return { t: 'vec', p, cls: 'Vec3', v: { x: v.x, y: v.y, z: v.z } };
    if (v instanceof Vec4) return { t: 'vec', p, cls: 'Vec4', v: { x: v.x, y: v.y, z: v.z, w: v.w } };
    if (v instanceof Quat) return { t: 'vec', p, cls: 'Quat', v: { x: v.x, y: v.y, z: v.z, w: v.w } };
    if (v instanceof Size) return { t: 'vec', p, cls: 'Size', v: { width: v.width, height: v.height } };
    if (v instanceof Rect) return { t: 'vec', p, cls: 'Rect', v: { x: v.x, y: v.y, width: v.width, height: v.height } };
    if (v instanceof Color) return { t: 'color', p, v: { r: v.r, g: v.g, b: v.b, a: v.a } };
    if (v instanceof Node) return { t: 'ref', p, kind: 'node', cls: 'cc.Node', name: v.isValid ? v.name : '', uuid: v.uuid, valid: v.isValid };
    if (v instanceof Component) {
        return { t: 'ref', p, kind: 'component', cls: classNameOf(v), name: v.isValid ? v.node?.name ?? '' : '', uuid: v.node?.uuid ?? '', valid: v.isValid };
    }
    if (v instanceof Asset) return { t: 'ref', p, kind: 'asset', cls: classNameOf(v), name: v.name, uuid: v.uuid, valid: v.isValid };
    if (v instanceof Date) return { t: 'text', p, v: v.toISOString() };
    if (path.has(v)) return { t: 'text', p, v: `(circular) ${classNameOf(v)}` };

    const expanded = open.has(p);
    path.add(v);
    try {
        if (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView))) {
            const list = v as ArrayLike<unknown>;
            const node: InspectNode = { t: 'list', p, cls: Array.isArray(v) ? 'Array' : classNameOf(v), size: list.length };
            if (expanded) {
                const n = Math.min(list.length, LIST_LIMIT);
                node.items = [];
                for (let i = 0; i < n; i++) node.items.push(describe(list[i], childPath(p, 'i', i), open, path));
                if (list.length > n) node.more = list.length - n;
            }
            return node;
        }
        if (v instanceof Set) {
            const node: InspectNode = { t: 'list', p, cls: 'Set', size: v.size };
            if (expanded) {
                node.items = [];
                let i = 0;
                for (const item of v) {
                    if (i >= LIST_LIMIT) break;
                    node.items.push(describe(item, childPath(p, 'i', i), open, path));
                    i++;
                }
                if (v.size > i) node.more = v.size - i;
            }
            return node;
        }
        if (v instanceof Map) {
            const node: InspectNode = { t: 'map', p, size: v.size };
            if (expanded) {
                node.entries = [];
                let i = 0;
                for (const [key, value] of v) {
                    if (i >= LIST_LIMIT) break;
                    node.entries.push({ k: describe(key, '', new Set(), path), v: describe(value, childPath(p, 'e', i), open, path) });
                    i++;
                }
                if (v.size > i) node.more = v.size - i;
            }
            return node;
        }
        const keys = Object.keys(v).filter((k) => typeof v[k] !== 'function');
        const node: InspectNode = { t: 'obj', p, cls: classNameOf(v), size: keys.length };
        if (expanded) {
            node.keys = keys.slice(0, LIST_LIMIT).map((k) => ({ k, v: describe(v[k], childPath(p, 'k', k), open, path) }));
            if (keys.length > LIST_LIMIT) node.more = keys.length - LIST_LIMIT;
        }
        return node;
    } finally {
        path.delete(v);
    }
}

/** Can `obj[name] = value` work (a field, or an accessor with a setter)? */
function isWritable(obj: any, name: string): boolean {
    for (let o = obj; o; o = Object.getPrototypeOf(o)) {
        const d = Object.getOwnPropertyDescriptor(o, name);
        if (d) return 'value' in d ? !!d.writable : !!d.set;
    }
    return true;
}

function entryAt(map: Map<unknown, unknown>, index: number): [unknown, unknown] {
    let i = 0;
    for (const entry of map) if (i++ === index) return entry;
    throw new Error('The entry no longer exists.');
}

function childOf(c: any, seg: string): any {
    const kind = seg[0];
    const id = seg.slice(1);
    if (kind === 'i') return c instanceof Set ? Array.from(c)[Number(id)] : c[Number(id)];
    if (kind === 'e') return entryAt(c, Number(id))[1];
    if (kind === 'k') return c[decodeURIComponent(id)];
    throw new Error(`Bad path segment "${seg}".`);
}

/**
 * Edits a @showInInspector value: 'set' the value at `path`, 'delete' the
 * item at `path`, or 'add' an item to the collection at `path`.
 * Returns true, or why it failed.
 */
function setByPath(this: any, path: string, op: 'set' | 'delete' | 'add', value?: unknown, key?: unknown): true | string {
    try {
        const [memberName, ...segs] = path.split('/');
        if (op === 'add') {
            let c = this[memberName];
            for (const s of segs) c = childOf(c, s);
            if (Array.isArray(c)) c.push(value);
            else if (c instanceof Set) c.add(value);
            else if (c instanceof Map) c.set(key, value);
            else return 'Only arrays, sets and maps can get new items.';
            return true;
        }
        if (!segs.length) {
            if (op !== 'set') return 'Members cannot be deleted.';
            if (!isWritable(this, memberName)) return `${memberName} is read-only.`;
            this[memberName] = value;
            return true;
        }
        let parent = this[memberName];
        for (const s of segs.slice(0, -1)) parent = childOf(parent, s);
        const last = segs[segs.length - 1];
        const kind = last[0];
        const id = last.slice(1);
        if (kind === 'i') {
            const i = Number(id);
            if (parent instanceof Set) {
                if (op !== 'delete') return 'Set items cannot be changed, only removed.';
                parent.delete(Array.from(parent)[i]);
            } else if (op === 'delete') {
                if (!Array.isArray(parent)) return 'Items of fixed-size arrays cannot be removed.';
                parent.splice(i, 1);
            } else {
                parent[i] = value;
            }
        } else if (kind === 'e') {
            const [k] = entryAt(parent, Number(id));
            if (op === 'delete') parent.delete(k);
            else parent.set(k, value);
        } else if (kind === 'k') {
            const k = decodeURIComponent(id);
            if (op === 'delete') delete parent[k];
            else parent[k] = value;
        } else {
            return `Bad path "${path}".`;
        }
        return true;
    } catch (e) {
        return String((e as Error)?.message || e);
    }
}

/** Reduce a value to something the Inspector can test (and IPC can carry). */
function plain(value: any): unknown {
    if (value === null || value === undefined) return null;
    const t = typeof value;
    if (t === 'number' || t === 'string' || t === 'boolean') return value;
    if (Array.isArray(value)) return value.length;
    if (t === 'object' && 'isValid' in value && !value.isValid) return null;
    return true;
}

function isPlaying(): boolean {
    const g = globalThis as any;
    return !!(g.isPreviewProcess || g.cc?.GAME_VIEW);
}

function evalComponent(this: any, req: EvalRequest) {
    const values: Record<string, unknown> = {};
    for (const name of req.members || []) {
        try {
            const v = this[name];
            values[name] = plain(typeof v === 'function' ? v.call(this) : v);
        } catch {
            values[name] = null;
        }
    }
    const validations: (true | string)[] = [];
    for (const v of req.validate || []) {
        try {
            const r = typeof this[v.method] === 'function' ? this[v.method](this[v.member]) : true;
            validations.push(r === true || r === undefined ? true : typeof r === 'string' ? r : '');
        } catch (e) {
            validations.push(String((e as Error)?.message || e));
        }
    }
    const lists: Record<string, DropdownItem[]> = {};
    for (const name of req.lists || []) {
        try {
            const v = this[name];
            lists[name] = listItems(typeof v === 'function' ? v.call(this) : v);
        } catch {
            lists[name] = [];
        }
    }
    const inspected: Record<string, { node: InspectNode; writable: boolean } | { error: string }> = {};
    const open = new Set(req.open || []);
    for (const name of req.inspect || []) {
        try {
            inspected[name] = { node: describe(this[name], name, open, new Set()), writable: isWritable(this, name) };
        } catch (e) {
            inspected[name] = { error: String((e as Error)?.message || e) };
        }
    }
    return { playing: isPlaying(), values, validations, lists, inspected };
}

if (EDITOR) {
    // Reached by the Inspector through 'execute-component-method', which runs in
    // whichever scene process owns the component (edit scene or Play-in-Editor).
    (Component.prototype as any).__advInspectorEval = evalComponent;
    (Component.prototype as any).__advInspectorSet = setByPath;
    // Other inspected objects (e.g. ScriptableObject assets): fn.call(target, ...).
    (globalThis as any).__advInspectorEval = evalComponent;
    (globalThis as any).__advInspectorSet = setByPath;
    (globalThis as any).__advInspectorGetClassMeta = getClassMeta;
    (globalThis as any).__advInspectorClasses = classes;
}
