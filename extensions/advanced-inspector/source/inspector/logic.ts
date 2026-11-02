/**
 * DOM-free part of the Inspector renderer: layout tree, conditions and
 * validation. Unit-tested in tests/logic.test.ts.
 */
import type { ClassMeta, Condition, DropdownItem, EvalRequest, EvalResult, GroupRef, MemberMeta } from '../shared/meta';

/** One property of a component dump (see IProperty in @cocos/creator-types). */
export interface DumpProp {
    name?: string;
    value?: any;
    values?: any[];
    visible?: boolean;
    readonly?: boolean;
    type?: string;
    isArray?: boolean;
    path?: string;
    displayName?: string;
    displayOrder?: number;
    tooltip?: string;
    unit?: string;
    group?: { id?: string; name?: string; style?: string; displayOrder?: number };
    enumList?: { name: string; value: number }[];
    bitmaskList?: { name: string; value: number }[];
    min?: number;
    max?: number;
    step?: number;
    [key: string]: any;
}

export interface ComponentDump {
    type: string;
    value: Record<string, DumpProp>;
    groups?: Record<string, { style?: string }>;
    [key: string]: any;
}

// ----------------------------------------------------------------- naming

/** Same rules as the engine's getName: "moveSpeed" -> "Move Speed". */
export function nicify(name: string): string {
    let s = (name || '').trim().replace(/^_+/, '');
    s = s.replace(/^\S/, (c) => c.toUpperCase());
    s = s.replace(/_/g, ' ');
    s = s.replace(/ \S/g, (c) => ` ${c.toUpperCase()}`);
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    return s.replace(/\s+/g, ' ').trim();
}

export function lastSegment(path: string): string {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
}

// ----------------------------------------------------------------- layout

export interface GroupDef {
    kind: GroupRef['kind'];
    path: string;
    label: string;
    showLabel: boolean;
    expanded: boolean;
}

export interface ItemNode {
    kind: 'item';
    /** "f:<key>" for fields, "m:<key>" for buttons, "s:<key>" for @showInInspector members. */
    id: string;
    key: string;
    isMethod: boolean;
    /** A @showInInspector member that isn't a serialized property. */
    isInspected: boolean;
    meta?: MemberMeta;
}

/** @showInInspector members drawn from scene values (serialized ones are drawn normally). */
export function inspectedMembers(meta: ClassMeta | null, dump: ComponentDump): MemberMeta[] {
    return (meta?.members || []).filter((m) => m.showInInspector && m.kind === 'field' && !dump.value?.[m.name]);
}

export interface TabNode {
    name: string;
    children: LayoutNode[];
}

export interface GroupNode {
    kind: 'group';
    id: string;
    def: GroupDef;
    children: LayoutNode[];
    tabs: TabNode[];
}

export type LayoutNode = ItemNode | GroupNode;

/** Maps Cocos' own `@property({ group })` to a group of ours. */
export function ccGroupRef(prop: DumpProp, dump: ComponentDump): GroupRef | undefined {
    const g = prop.group;
    if (!g || !g.name) return undefined;
    const id = g.id || 'default';
    const style = g.style || dump.groups?.[id]?.style || 'tab';
    const name = String(g.name).replace(/\//g, ' ');
    if (style === 'section') return { kind: 'foldout', path: `#${id}:${name}`, label: name, expanded: true };
    return { kind: 'tab', path: `#${id}`, tab: name };
}

function toDef(path: string, ref: GroupRef | undefined, fallbackKind: GroupRef['kind']): GroupDef {
    const kind = ref?.kind ?? fallbackKind;
    return {
        kind,
        path,
        label: ref?.label ?? nicify(lastSegment(path)),
        showLabel: ref?.showLabel ?? !path.startsWith('#'),
        expanded: ref?.expanded ?? false,
    };
}

interface Entry {
    key: string;
    isMethod: boolean;
    isInspected: boolean;
    meta?: MemberMeta;
    group?: GroupRef;
    order: number;
    base: number;
    seq: number;
}

/**
 * Orders visible properties, @button methods and @showInInspector members and
 * nests them into groups. Fields keep the dump order (Cocos' displayOrder
 * respected); the others follow the property declared before them;
 * @propertyOrder sorts on top of that.
 */
export function buildLayout(dump: ComponentDump, meta: ClassMeta | null): LayoutNode[] {
    const metaByName = new Map<string, MemberMeta>();
    for (const m of meta?.members || []) metaByName.set(m.name, m);

    const keys = Object.keys(dump.value || {});
    const keyIndex = new Map(keys.map((k, i) => [k, i] as [string, number]));
    const entries: Entry[] = [];
    let seq = 0;

    keys.forEach((key, i) => {
        const prop = dump.value[key];
        if (!prop || !prop.visible) return;
        const m = metaByName.get(key);
        entries.push({
            key,
            isMethod: false,
            isInspected: false,
            meta: m,
            group: m?.group ?? ccGroupRef(prop, dump),
            order: m?.order ?? 0,
            base: typeof prop.displayOrder === 'number' ? prop.displayOrder : i,
            seq: seq++,
        });
    });

    const perAnchor = new Map<string, number>();
    let head = 0;
    let tail = 0;
    const inspected = new Set(inspectedMembers(meta, dump));
    for (const m of meta?.members || []) {
        const isButton = m.kind === 'method' && !!m.button;
        if (!isButton && !inspected.has(m)) continue;
        let base: number;
        if (m.anchor === null) {
            base = -1 + (head++ + 1) * 1e-4;
        } else if (typeof m.anchor === 'string' && keyIndex.has(m.anchor)) {
            const n = (perAnchor.get(m.anchor) || 0) + 1;
            perAnchor.set(m.anchor, n);
            const anchorProp = dump.value[m.anchor];
            const anchorBase = typeof anchorProp?.displayOrder === 'number' ? anchorProp.displayOrder : keyIndex.get(m.anchor)!;
            base = anchorBase + n * 1e-4;
        } else {
            base = keys.length + tail++;
        }
        entries.push({ key: m.name, isMethod: isButton, isInspected: !isButton, meta: m, group: m.group, order: m.order ?? 0, base, seq: seq++ });
    }

    entries.sort((a, b) => a.order - b.order || a.base - b.base || a.seq - b.seq);

    // Group definitions: the first member naming a path defines it.
    const defs = new Map<string, GroupRef>();
    for (const e of entries) if (e.group && !defs.has(e.group.path)) defs.set(e.group.path, e.group);

    const root: LayoutNode[] = [];
    const groups = new Map<string, GroupNode>();

    const getGroup = (path: string, parent: LayoutNode[], leafKind: GroupRef['kind']): GroupNode => {
        let g = groups.get(path);
        if (g) return g;
        const fallback: GroupRef['kind'] = leafKind === 'foldout' ? 'foldout' : 'box';
        g = { kind: 'group', id: `g:${path}`, def: toDef(path, defs.get(path), fallback), children: [], tabs: [] };
        groups.set(path, g);
        parent.push(g);
        return g;
    };

    const tabChildren = (g: GroupNode, name: string): LayoutNode[] => {
        let t = g.tabs.find((x) => x.name === name);
        if (!t) {
            t = { name, children: [] };
            g.tabs.push(t);
        }
        return t.children;
    };

    const containerFor = (ref: GroupRef): LayoutNode[] => {
        const segs = ref.path.split('/').filter(Boolean);
        let container = root;
        let prefix = '';
        for (let i = 0; i < segs.length; i++) {
            prefix = prefix ? `${prefix}/${segs[i]}` : segs[i];
            const g = getGroup(prefix, container, ref.kind);
            if (g.def.kind === 'tab') {
                if (i + 1 < segs.length) {
                    i++;
                    prefix = `${prefix}/${segs[i]}`;
                    container = tabChildren(g, segs[i]);
                } else {
                    container = tabChildren(g, ref.tab ?? g.tabs[0]?.name ?? 'Tab');
                }
            } else {
                container = g.children;
            }
        }
        return container;
    };

    for (const e of entries) {
        const prefix = e.isMethod ? 'm' : e.isInspected ? 's' : 'f';
        const item: ItemNode = { kind: 'item', id: `${prefix}:${e.key}`, key: e.key, isMethod: e.isMethod, isInspected: e.isInspected, meta: e.meta };
        (e.group ? containerFor(e.group) : root).push(item);
    }
    return root;
}

// -------------------------------------------------------------- conditions

/** A dump value reduced to something a condition can test. */
export function dumpPlain(prop: DumpProp | undefined): unknown {
    if (!prop) return undefined;
    const v = prop.value;
    if (prop.isArray) return Array.isArray(v) ? v.length : 0;
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    if ('uuid' in v) return v.uuid ? true : null;
    return true;
}

function splitNot(member: string): { name: string; not: boolean } {
    const not = member.startsWith('!');
    return { name: (not ? member.slice(1) : member).trim(), not };
}

export function readMember(name: string, dump: ComponentDump, remote: EvalResult | null): unknown {
    const prop = dump.value?.[name];
    if (prop) return dumpPlain(prop);
    return remote?.values?.[name];
}

export function looseEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a === 'object' || typeof b === 'object') return false;
    return String(a) === String(b);
}

export function testCondition(c: Condition, dump: ComponentDump, remote: EvalResult | null): boolean {
    const { name, not } = splitNot(c.member);
    const v = readMember(name, dump, remote);
    const result = c.values && c.values.length ? c.values.some((x) => looseEqual(x, v)) : !!v;
    return not ? !result : result;
}

export interface MemberState {
    hidden: boolean;
    disabled: boolean;
}

export function memberState(m: MemberMeta | undefined, dump: ComponentDump, remote: EvalResult | null): MemberState {
    if (!m) return { hidden: false, disabled: false };
    const playing = !!remote?.playing;
    const all = (cs?: Condition[]) => !cs || cs.every((c) => testCondition(c, dump, remote));
    const any = (cs?: Condition[]) => !!cs && cs.some((c) => testCondition(c, dump, remote));
    const hidden = !all(m.showIf) || any(m.hideIf) || (!!m.hideInPlayMode && playing) || (!!m.hideInEditMode && !playing);
    const disabled = !!m.readOnly || !all(m.enableIf) || any(m.disableIf)
        || (!!m.disableInPlayMode && playing) || (!!m.disableInEditMode && !playing);
    return { hidden, disabled };
}

/** Is a Required value missing? */
export function isEmptyValue(prop: DumpProp | undefined): boolean {
    if (!prop) return false;
    const v = prop.value;
    if (prop.isArray) return false;
    if (v === null || v === undefined || v === '') return true;
    if (typeof v === 'object' && 'uuid' in v) return !v.uuid;
    return false;
}

/** Members, validations and lists only the scene process can answer. */
export function buildEvalRequest(meta: ClassMeta, dump: ComponentDump): { request: EvalRequest; needed: boolean } {
    const members = new Set<string>();
    const lists = new Set<string>();
    const validate: { method: string; member: string }[] = [];
    let playFlags = false;

    const need = (member: string | undefined) => {
        if (!member) return;
        const { name } = splitNot(member);
        if (name && !dump.value?.[name]) members.add(name);
    };

    for (const m of meta.members) {
        for (const c of [...(m.showIf || []), ...(m.hideIf || []), ...(m.enableIf || []), ...(m.disableIf || [])]) need(c.member);
        for (const box of m.infoBoxes || []) need(box.visibleIf?.member);
        if (m.progressBar) {
            if (typeof m.progressBar.min === 'string') need(m.progressBar.min);
            if (typeof m.progressBar.max === 'string') need(m.progressBar.max);
        }
        if (m.dropdown?.member) lists.add(m.dropdown.member);
        if (m.validate && m.kind === 'field' && dump.value?.[m.name]) validate.push({ method: m.validate.method, member: m.name });
        if (m.hideInPlayMode || m.hideInEditMode || m.disableInPlayMode || m.disableInEditMode) playFlags = true;
    }

    const inspect = inspectedMembers(meta, dump).map((m) => m.name);
    const request: EvalRequest = { members: [...members], validate, lists: [...lists], inspect };
    return { request, needed: playFlags || members.size > 0 || lists.size > 0 || validate.length > 0 || inspect.length > 0 };
}

export function validationFor(member: string, request: EvalRequest, remote: EvalResult | null): true | string | undefined {
    if (!remote) return undefined;
    const i = (request.validate || []).findIndex((v) => v.member === member);
    return i < 0 ? undefined : remote.validations?.[i];
}

export function numberFrom(v: number | string, dump: ComponentDump, remote: EvalResult | null, fallback: number): number {
    if (typeof v === 'number') return v;
    const r = Number(readMember(v, dump, remote));
    return Number.isFinite(r) ? r : fallback;
}

export function dropdownItems(m: MemberMeta, remote: EvalResult | null): DropdownItem[] {
    if (m.dropdown?.items) return m.dropdown.items;
    if (m.dropdown?.member) return remote?.lists?.[m.dropdown.member] || [];
    return [];
}

/** A stable string for comparing values between updates. */
export function valueSignature(prop: DumpProp | undefined): string {
    if (!prop) return '';
    try {
        return JSON.stringify([prop.value, prop.values]);
    } catch {
        return String(prop.value);
    }
}
