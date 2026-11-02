/**
 * Inspector renderer for script components ('cc.Class' contribution).
 *
 * The engine renders every component without its own renderer with
 * editor/inspector/components/class.js, and contributed renderers for the same
 * type run next to it. For classes that use advanced-inspector attributes this
 * renderer hides the engine's panel and draws the component itself; for all
 * other classes it hides itself.
 *
 * Plain properties are still drawn by the engine's <ui-prop type="dump">, so
 * every field type keeps working; attributes add layout, conditions, messages
 * and buttons around them, or swap in a custom control.
 */
import type { ClassMeta, EvalRequest, EvalResult, MemberMeta } from '../shared/meta';
import {
    buildEvalRequest, buildLayout, dropdownItems, inspectedMembers, isEmptyValue, memberState, nicify, numberFrom, testCondition,
    validationFor, valueSignature, type ComponentDump, type DumpProp, type GroupNode, type ItemNode, type LayoutNode, type MemberState,
} from './logic';
import {
    dropdownControl, escapeHtml, h, labelOf, minMaxControl, progressControl, rgba, syncChildren, togglesControl, type Control,
} from './controls';
import { createInspectView, type InspectActions, type InspectView } from './inspect-view';
import { style as css } from './style';

const PKG = 'advanced-inspector';
const META_TTL = 1500;
const POLL_MS = 500;
const CHANGE_WINDOW_MS = 2000;

// ------------------------------------------------------------------ types

interface ItemView {
    id: string;
    sig: string;
    root: HTMLElement & { __aiKey?: string };
    pre: HTMLElement;
    row: HTMLElement;
    extra: HTMLElement;
    post: HTMLElement;
    control: Control | null;
    dumpProp: (HTMLElement & { render(dump: any): void }) | null;
    button: HTMLButtonElement | null;
    inspect: InspectView | null;
    html: { pre: string; extra: string; post: string; button: string };
}

interface GroupView {
    id: string;
    kind: string;
    root: HTMLElement;
    body: HTMLElement;
    header?: HTMLElement;
    bar?: HTMLElement;
    pages?: Map<string, HTMLElement>;
    barHtml?: string;
}

interface State {
    token: number;
    dump: ComponentDump | null;
    meta: ClassMeta | null;
    request: EvalRequest | null;
    needsRemote: boolean;
    remote: EvalResult | null;
    remoteSig: string;
    views: Map<string, ItemView>;
    groups: Map<string, GroupView>;
    /** Components the values below belong to (sections are reused across nodes). */
    uuid: string;
    lastValues: Map<string, string>;
    pending: Map<string, number>;
    timer: ReturnType<typeof setInterval> | null;
    polling: boolean;
    /** Evaluate again once the running evaluation ends (it may predate an edit). */
    again: boolean;
}

interface Panel {
    $: { root: HTMLElement };
    $this: HTMLElement & { messageProtocol?: { scene?: string } };
    dump?: ComponentDump;
    __ai?: State;
    /** Set by mountInspector; component panels use componentHost(). */
    __aiHost?: InspectorHost;
}

/**
 * Where the inspected values live: the selected components (the Inspector's
 * component sections) or another object, e.g. a ScriptableObject asset.
 */
export interface InspectorHost {
    /** Ids of the inspected targets (a change resets per-target state). */
    ids(dump: ComponentDump | null): string[];
    /** Scene message target used for class metadata. */
    protocol(): string;
    /** Evaluates conditions, getters and validations on the target. */
    eval(request: EvalRequest): Promise<EvalResult | null>;
    /** Calls a method of the target (buttons, @onValueChanged). */
    invoke(method: string): Promise<void>;
    /** Edits a @showInInspector value; resolves true or an error message. */
    set(path: string, op: 'set' | 'delete' | 'add', value?: unknown, key?: unknown): Promise<unknown>;
    /** true: the class has no attributes, show the plain drawing; false: show ours. */
    showDefault(show: boolean): void;
}

interface Ctx {
    panel: Panel;
    st: State;
    dump: ComponentDump;
    remote: EvalResult | null;
}

// ---------------------------------------------------------------- helpers

const request = (Editor.Message.request as any).bind(Editor.Message) as (target: string, message: string, ...args: any[]) => Promise<any>;

function sceneProtocol(el: Element | null): string {
    let e: any = el;
    while (e) {
        if (e.messageProtocol?.scene) return e.messageProtocol.scene;
        e = e.parentElement || (e.getRootNode?.() as any)?.host || null;
    }
    return 'scene';
}

function componentUuids(dump: ComponentDump | null): string[] {
    const u = dump?.value?.uuid;
    if (!u) return [];
    return Array.isArray(u.values) && u.values.length ? u.values : u.value ? [u.value] : [];
}

/** Tab selection, kept while the editor runs. */
const activeTabs = new Map<string, string>();

/** Expanded @showInInspector values per component type (top levels start expanded). */
const openStates = new Map<string, Map<string, boolean>>();

function openState(type: string): Map<string, boolean> {
    let s = openStates.get(type);
    if (!s) openStates.set(type, (s = new Map()));
    return s;
}

function isOpen(type: string, path: string, depth: number): boolean {
    return openState(type).get(path) ?? depth === 0;
}

function openPaths(type: string, meta: ClassMeta, dump: ComponentDump): string[] {
    const paths = inspectedMembers(meta, dump).map((m) => m.name).filter((name) => isOpen(type, name, 0));
    for (const [path, open] of openState(type)) if (open && path.includes('/')) paths.push(path);
    return paths;
}

// ------------------------------------------------------------------- meta

interface MetaEntry {
    at: number;
    json: string;
    meta: ClassMeta | null;
    loading?: Promise<void>;
}

const metaCache = new Map<string, MetaEntry>();

function isEngineType(type: string): boolean {
    return /^(cc|sp|dragonBones)\./.test(type);
}

function loadMeta(protocol: string, type: string): Promise<void> {
    const entry = metaCache.get(type);
    if (entry?.loading) return entry.loading;
    const loading = request(protocol, 'execute-scene-script', { name: PKG, method: 'getMeta', args: [type] })
        .then((m: any) => (m && Array.isArray(m.members) ? (m as ClassMeta) : null))
        .catch(() => null)
        .then((meta: ClassMeta | null) => {
            const json = JSON.stringify(meta);
            const prev = metaCache.get(type);
            metaCache.set(type, { at: Date.now(), json, meta: prev && prev.json === json ? prev.meta : meta });
        });
    metaCache.set(type, { ...(entry || { json: 'null', meta: null }), at: entry?.at ?? 0, loading });
    return loading;
}

/**
 * Class metadata for a component type. Known types answer from the cache at
 * once and refresh in the background; `onChange` runs if the refresh differs.
 */
async function getMeta(protocol: string, type: string, onChange: () => void): Promise<ClassMeta | null> {
    if (!type || isEngineType(type)) return null;
    const entry = metaCache.get(type);
    if (!entry || (entry.at === 0 && entry.loading)) {
        await loadMeta(protocol, type);
        return metaCache.get(type)?.meta ?? null;
    }
    if (Date.now() - entry.at > META_TTL && !entry.loading) {
        const before = entry.json;
        loadMeta(protocol, type).then(() => {
            if (metaCache.get(type)?.json !== before) onChange();
        });
    }
    return entry.meta;
}

// ------------------------------------------------------------- scene calls

/** The Inspector's component sections: the selected components of the edit (or prefab) scene. */
function componentHost(panel: Panel): InspectorHost {
    const uuids = () => componentUuids(panel.__ai?.dump ?? null);
    const protocol = () => sceneProtocol(panel.$this);
    return {
        ids: (dump) => componentUuids(dump),
        protocol,
        async eval(req) {
            const uuid = uuids()[0];
            if (!uuid) return null;
            try {
                const r = await request(protocol(), 'execute-component-method', { uuid, name: '__advInspectorEval', args: [req] });
                return r && typeof r === 'object' ? (r as EvalResult) : null;
            } catch {
                return null;
            }
        },
        /** Calls the method on every selected component, as one undo step. */
        async invoke(method) {
            const ids = uuids();
            if (!ids.length) return;
            let undo: string | undefined;
            try {
                undo = await request(protocol(), 'begin-recording', ids);
            } catch {
                // e.g. Play-in-Editor: nothing to record
            }
            try {
                for (const uuid of ids) await request(protocol(), 'execute-component-method', { uuid, name: method, args: [] });
            } finally {
                if (undo) await request(protocol(), 'end-recording', undo).catch(() => undefined);
            }
        },
        /** Not recorded: these values aren't saved. */
        async set(path, op, value, key) {
            let result: unknown = true;
            for (const uuid of uuids()) {
                const r = await request(protocol(), 'execute-component-method', { uuid, name: '__advInspectorSet', args: [path, op, value, key] });
                if (r !== true) result = r;
            }
            return result;
        },
        showDefault(show) {
            const host = panel.$this;
            host.style.display = show ? 'none' : '';
            const parent = host.parentElement;
            if (!parent) return;
            for (const el of Array.from(parent.children)) {
                if (el !== host && el.tagName === 'UI-PANEL' && isEngineClassPanel(el)) (el as HTMLElement).style.display = show ? '' : 'none';
            }
        },
    };
}

function hostOf(panel: Panel): InspectorHost {
    if (!panel.__aiHost) panel.__aiHost = componentHost(panel);
    return panel.__aiHost;
}

async function evalRemote(panel: Panel): Promise<EvalResult | null> {
    const st = panel.__ai!;
    if (!st.request) return null;
    try {
        return await hostOf(panel).eval(st.request);
    } catch {
        return null;
    }
}

async function invoke(panel: Panel, method: string) {
    try {
        await hostOf(panel).invoke(method);
    } catch (e) {
        console.error(`[Advanced Inspector] ${method}():`, e);
    }
    refreshRemote(panel, true);
}

/**
 * Re-evaluate scene values and redraw if they changed. `force` makes sure an
 * evaluation starts after this call even if one is already running.
 */
async function refreshRemote(panel: Panel, force = false) {
    const st = panel.__ai;
    if (!st || !st.meta || !st.needsRemote) return;
    if (st.polling) {
        if (force) st.again = true;
        return;
    }
    st.polling = true;
    try {
        do {
            st.again = false;
            const r = await evalRemote(panel);
            const sig = JSON.stringify(r);
            if (r && sig !== st.remoteSig && st.meta) {
                st.remote = r;
                st.remoteSig = sig;
                render(panel);
            }
        } while (st.again);
    } finally {
        st.polling = false;
    }
}

/** Edit a @showInInspector value on the inspected targets. */
async function inspectEdit(panel: Panel, path: string, op: 'set' | 'delete' | 'add', value?: unknown, key?: unknown) {
    try {
        const r = await hostOf(panel).set(path, op, value, key);
        if (r !== true && r) console.warn(`[Advanced Inspector] ${r}`);
    } catch (e) {
        console.error('[Advanced Inspector]', e);
    }
    refreshRemote(panel, true);
}

function inspectActions(panel: Panel): InspectActions {
    const type = () => panel.__ai?.dump?.type || '';
    return {
        isOpen: (path, depth) => isOpen(type(), path, depth),
        toggle(path, depth) {
            const st = panel.__ai;
            if (!st?.dump || !st.meta || !st.request) return;
            openState(type()).set(path, !isOpen(type(), path, depth));
            st.request.open = openPaths(type(), st.meta, st.dump);
            render(panel);
            refreshRemote(panel, true);
        },
        set: (path, value) => inspectEdit(panel, path, 'set', value),
        remove: (path) => inspectEdit(panel, path, 'delete'),
        add: (path, value, key) => inspectEdit(panel, path, 'add', value, key),
        select(node) {
            const kind = node.kind === 'asset' ? 'asset' : 'node';
            const selection = (Editor as any).Selection;
            selection?.clear?.(kind);
            selection?.select?.(kind, [node.uuid]);
        },
    };
}

function startPoll(panel: Panel) {
    const st = panel.__ai!;
    if (st.timer) return;
    st.timer = setInterval(() => {
        if (!panel.$this.isConnected) {
            stopPoll(st);
            return;
        }
        if (document.hidden || !panel.$.root.offsetParent) return;
        refreshRemote(panel);
    }, POLL_MS);
}

function stopPoll(st: State) {
    if (st.timer) clearInterval(st.timer);
    st.timer = null;
}

// ------------------------------------------------------- default renderer

function isEngineClassPanel(el: Element): boolean {
    const src = (el.getAttribute('src') || '').replace(/\\/g, '/');
    return /\/editor\/inspector\/components\/class\.js$/.test(src);
}

/** Show the engine's default panel (no attributes) or ours. */
function showDefault(panel: Panel, show: boolean) {
    hostOf(panel).showDefault(show);
}

// ------------------------------------------------------------------ items

function controlKind(node: ItemNode, info: DumpProp | undefined): string {
    if (node.isMethod) return 'method';
    if (node.isInspected) return 'inspect';
    const m = node.meta;
    const v = info?.value;
    if (m?.progressBar && typeof v === 'number') return 'progress';
    if (m?.minMax && v && typeof v === 'object' && 'x' in v && 'y' in v) return 'minmax';
    if (m?.dropdown && !info?.isArray) return 'dropdown';
    if (m?.toggleButtons && (info?.enumList?.length || info?.bitmaskList?.length)) return 'toggles';
    return 'dump';
}

function createItemView(ctx: Ctx, id: string, sig: string, kind: string, node: ItemNode): ItemView {
    const root = h('div', 'ai-item', { 'data-ai-id': id }) as ItemView['root'];
    const pre = h('div');
    const row = h('div', 'ai-row');
    const extra = h('div', 'ai-extra');
    const post = h('div');
    root.append(pre, row, post);
    const view: ItemView = {
        id, sig, root, pre, row, extra, post, control: null, dumpProp: null, button: null, inspect: null,
        html: { pre: '', extra: '', post: '', button: '' },
    };
    const hideLabel = !!node.meta?.hideLabel;
    if (kind === 'method') {
        root.classList.add('ai-method');
        row.style.marginTop = '0';
        view.button = h('button', 'ai-btn');
        view.button.dataset.aiMethod = node.key;
        row.appendChild(view.button);
    } else if (kind === 'inspect') {
        view.inspect = createInspectView(inspectActions(ctx.panel));
        row.appendChild(view.inspect.el);
    } else if (kind === 'dump') {
        const prop = h('ui-prop', 'ai-main', { type: 'dump' }) as any;
        if (hideLabel) prop.setAttribute('no-label', '');
        view.dumpProp = prop;
        row.appendChild(prop);
    } else {
        view.control = kind === 'progress' ? progressControl(hideLabel)
            : kind === 'minmax' ? minMaxControl(hideLabel)
                : kind === 'dropdown' ? dropdownControl(hideLabel)
                    : togglesControl(hideLabel);
        row.appendChild(view.control.el);
    }
    row.appendChild(extra);
    if (!node.isMethod && !node.isInspected) root.__aiKey = node.key;
    return view;
}

function getItemView(ctx: Ctx, node: ItemNode): ItemView {
    const info = node.isMethod ? undefined : ctx.dump.value[node.key];
    const kind = controlKind(node, info);
    const sig = `${kind}|${node.meta?.hideLabel ? 1 : 0}`;
    let view = ctx.st.views.get(node.id);
    if (view && view.sig !== sig) {
        view.root.remove();
        view = undefined;
    }
    if (!view) {
        view = createItemView(ctx, node.id, sig, kind, node);
        ctx.st.views.set(node.id, view);
    }
    return view;
}

function infoBoxHtml(type: string, message: string): string {
    const icon = type === 'none' ? '' : '<span class="ai-info-icon"></span>';
    return `<div class="ai-info ai-info-${escapeHtml(type)}">${icon}<span>${escapeHtml(message)}</span></div>`;
}

function preHtml(ctx: Ctx, m: MemberMeta | undefined): string {
    if (!m) return '';
    let s = '';
    if (m.spaceBefore) s += `<div style="height:${Number(m.spaceBefore) || 0}px"></div>`;
    if (m.title) {
        const t = m.title;
        s += `<div class="ai-title${t.line !== false ? ' line' : ''}">`
            + `<div class="ai-title-text${t.bold !== false ? ' bold' : ''}">${escapeHtml(t.title)}</div>`
            + (t.subtitle ? `<div class="ai-subtitle">${escapeHtml(t.subtitle)}</div>` : '')
            + '</div>';
    }
    for (const box of m.infoBoxes || []) {
        if (box.visibleIf && !testCondition(box.visibleIf, ctx.dump, ctx.remote)) continue;
        s += infoBoxHtml(box.type, box.message);
    }
    return s;
}

function postHtml(ctx: Ctx, node: ItemNode, info: DumpProp | undefined): string {
    const m = node.meta;
    if (!m) return '';
    let s = '';
    if (info && m.required && isEmptyValue(info)) {
        s += infoBoxHtml('error', m.required.message || `${labelOf(info, m, node.key)} is required.`);
    }
    if (info && m.validate && ctx.st.request) {
        const r = validationFor(node.key, ctx.st.request, ctx.remote);
        if (r !== undefined && r !== true) s += infoBoxHtml('error', r || m.validate.message || 'Invalid value.');
    }
    if (m.spaceAfter) s += `<div style="height:${Number(m.spaceAfter) || 0}px"></div>`;
    return s;
}

function extraHtml(node: ItemNode, info: DumpProp | undefined, kind: string, disabled: boolean): string {
    const m = node.meta;
    if (!m || node.isMethod) return '';
    let s = '';
    if (m.suffix && !(kind === 'dump' && typeof info?.value === 'number') && kind !== 'progress') {
        s += `<span class="ai-suffix">${escapeHtml(m.suffix)}</span>`;
    }
    for (const b of m.inlineButtons || []) {
        s += `<button class="ai-btn ai-inline" data-ai-method="${escapeHtml(b.method)}"${disabled ? ' disabled' : ''}>${escapeHtml(b.label || nicify(b.method))}</button>`;
    }
    return s;
}

function setReadonlyDeep(d: any) {
    if (!d || typeof d !== 'object') return;
    if ('readonly' in d || 'value' in d) d.readonly = true;
    const v = d.value;
    if (Array.isArray(v)) v.forEach(setReadonlyDeep);
    else if (v && typeof v === 'object') for (const k in v) if (v[k] && typeof v[k] === 'object' && 'value' in v[k]) setReadonlyDeep(v[k]);
}

function updateItem(ctx: Ctx, view: ItemView, node: ItemNode, state: MemberState) {
    const m = node.meta;
    const info = node.isMethod ? undefined : ctx.dump.value[node.key];

    const pre = preHtml(ctx, m);
    if (pre !== view.html.pre) {
        view.pre.innerHTML = pre;
        view.html.pre = pre;
    }

    if (m?.color) {
        view.root.classList.add('ai-tinted');
        view.root.style.setProperty('--ai-tint', rgba(m.color));
        view.root.style.setProperty('--ai-tint-bg', rgba(m.color, 0.14));
    } else {
        view.root.classList.remove('ai-tinted');
    }
    view.root.classList.toggle('ai-disabled', state.disabled);

    if (view.button) {
        const b = m?.button || {};
        const markup = escapeHtml(b.label || nicify(node.key));
        if (markup !== view.html.button) {
            view.button.innerHTML = markup;
            view.html.button = markup;
        }
        const size = b.size === 'small' ? 20 : b.size === 'large' ? 34 : typeof b.size === 'number' ? b.size : 24;
        view.button.style.height = `${size}px`;
        view.button.className = `ai-btn${b.color && b.color !== 'default' ? ` ${b.color}` : ''}${m?.color ? ' tint' : ''}`;
        view.button.disabled = state.disabled;
        // The tint is on the button itself, not behind it.
        view.root.classList.remove('ai-tinted');
    } else if (view.inspect) {
        view.inspect.update({
            result: ctx.remote?.inspected?.[node.key],
            label: labelOf(undefined, m, node.key),
            disabled: state.disabled,
            hideLabel: !!m?.hideLabel,
        });
    } else if (view.dumpProp && info) {
        let d: DumpProp = { ...info };
        if (m?.label) d.displayName = m.label;
        if (m?.suffix && typeof info.value === 'number') d.unit = m.suffix;
        if (state.disabled) {
            d = JSON.parse(JSON.stringify(d));
            setReadonlyDeep(d);
        }
        view.dumpProp.render(d);
    } else if (view.control && info && m) {
        view.control.update({
            info: { ...info },
            meta: m,
            disabled: state.disabled || !!info.readonly,
            min: m.progressBar ? numberFrom(m.progressBar.min, ctx.dump, ctx.remote, 0) : undefined,
            max: m.progressBar ? numberFrom(m.progressBar.max, ctx.dump, ctx.remote, 100) : undefined,
            items: m.dropdown ? dropdownItems(m, ctx.remote) : undefined,
        });
    }

    const extra = extraHtml(node, info, view.sig.split('|')[0], state.disabled);
    if (extra !== view.html.extra) {
        view.extra.innerHTML = extra;
        view.html.extra = extra;
    }

    const post = postHtml(ctx, node, info);
    if (post !== view.html.post) {
        view.post.innerHTML = post;
        view.html.post = post;
    }
}

// ----------------------------------------------------------------- groups

function createGroupView(ctx: Ctx, node: GroupNode): GroupView {
    const def = node.def;
    const type = ctx.dump.type;
    switch (def.kind) {
        case 'foldout': {
            const root = h('ui-section', 'ai-foldout');
            root.setAttribute('cache-expand', `advanced-inspector:${type}:${def.path}`);
            if (def.expanded) root.setAttribute('expand', '');
            const header = h('ui-label', '', { slot: 'header' });
            const body = h('div', 'ai-foldout-body');
            root.append(header, body);
            return { id: node.id, kind: def.kind, root, body, header };
        }
        case 'tab': {
            const root = h('div', 'ai-tabs');
            const bar = h('div', 'ai-tabbar');
            const body = h('div', 'ai-tabpages');
            root.append(bar, body);
            bar.dataset.aiTabs = `${type}|${def.path}`;
            return { id: node.id, kind: def.kind, root, body, bar, pages: new Map() };
        }
        case 'horizontal': {
            const root = h('div', 'ai-hgroup');
            return { id: node.id, kind: def.kind, root, body: root };
        }
        case 'buttons': {
            const root = h('div', 'ai-bgroup');
            return { id: node.id, kind: def.kind, root, body: root };
        }
        default: {
            const root = h('div', 'ai-box');
            const header = h('div', 'ai-box-header');
            const body = h('div', 'ai-box-body');
            root.append(header, body);
            return { id: node.id, kind: def.kind, root, body, header };
        }
    }
}

function getGroupView(ctx: Ctx, node: GroupNode): GroupView {
    let view = ctx.st.groups.get(node.id);
    if (view && view.kind !== node.def.kind) {
        view.root.remove();
        view = undefined;
    }
    if (!view) {
        view = createGroupView(ctx, node);
        ctx.st.groups.set(node.id, view);
    }
    if (view.header) {
        if (view.kind === 'foldout') {
            if (view.header.getAttribute('value') !== node.def.label) view.header.setAttribute('value', node.def.label);
        } else {
            view.header.textContent = node.def.label;
            view.header.classList.toggle('ai-hidden', !node.def.showLabel);
        }
    }
    return view;
}

function selectTab(bar: HTMLElement, pages: Map<string, HTMLElement>, name: string) {
    for (const [n, page] of pages) page.classList.toggle('active', n === name);
    bar.querySelectorAll<HTMLElement>('[data-ai-tab]').forEach((t) => t.classList.toggle('active', t.dataset.aiTab === name));
}

// ----------------------------------------------------------------- render

interface Pass {
    usedViews: Set<string>;
    usedGroups: Set<string>;
    updates: (() => void)[];
}

function syncNodes(ctx: Ctx, container: HTMLElement, nodes: LayoutNode[], pass: Pass): boolean {
    const els: HTMLElement[] = [];
    let anyVisible = false;
    for (const node of nodes) {
        if (node.kind === 'item') {
            const view = getItemView(ctx, node);
            pass.usedViews.add(node.id);
            const state = memberState(node.meta, ctx.dump, ctx.remote);
            view.root.classList.toggle('ai-hidden', state.hidden);
            els.push(view.root);
            if (!state.hidden) {
                anyVisible = true;
                pass.updates.push(() => updateItem(ctx, view, node, state));
            }
            continue;
        }

        const g = getGroupView(ctx, node);
        pass.usedGroups.add(node.id);
        let visible: boolean;
        if (g.kind === 'tab' && g.pages && g.bar) {
            const pages: HTMLElement[] = [];
            const shown: string[] = [];
            for (const tab of node.tabs) {
                let page = g.pages.get(tab.name);
                if (!page) {
                    page = h('div', 'ai-tabpage');
                    g.pages.set(tab.name, page);
                }
                if (syncNodes(ctx, page, tab.children, pass)) shown.push(tab.name);
                pages.push(page);
            }
            for (const name of [...g.pages.keys()]) if (!node.tabs.some((t) => t.name === name)) g.pages.delete(name);
            syncChildren(g.body, pages);
            const barHtml = node.tabs
                .filter((t) => shown.includes(t.name))
                .map((t) => `<div class="ai-tab" data-ai-tab="${escapeHtml(t.name)}">${escapeHtml(nicify(t.name))}</div>`)
                .join('');
            if (barHtml !== g.barHtml) {
                g.bar.innerHTML = barHtml;
                g.barHtml = barHtml;
            }
            const key = g.bar.dataset.aiTabs!;
            let active = activeTabs.get(key);
            if (!active || !shown.includes(active)) active = shown[0];
            if (active) selectTab(g.bar, g.pages, active);
            visible = shown.length > 0;
        } else {
            visible = syncNodes(ctx, g.body, node.children, pass);
        }
        g.root.classList.toggle('ai-hidden', !visible);
        if (visible) anyVisible = true;
        els.push(g.root);
    }
    syncChildren(container, els);
    return anyVisible;
}

function render(panel: Panel) {
    const st = panel.__ai!;
    if (!st.dump || !st.meta) return;
    const ctx: Ctx = { panel, st, dump: st.dump, remote: st.remote };
    const pass: Pass = { usedViews: new Set(), usedGroups: new Set(), updates: [] };
    syncNodes(ctx, panel.$.root, buildLayout(st.dump, st.meta), pass);
    for (const [id, v] of st.views) {
        if (!pass.usedViews.has(id)) {
            v.root.remove();
            st.views.delete(id);
        }
    }
    for (const [id, g] of st.groups) {
        if (!pass.usedGroups.has(id)) {
            g.root.remove();
            st.groups.delete(id);
        }
    }
    for (const u of pass.updates) {
        try {
            u();
        } catch (e) {
            console.error('[Advanced Inspector]', e);
        }
    }
}

function clear(panel: Panel) {
    const st = panel.__ai!;
    panel.$.root.innerHTML = '';
    st.views.clear();
    st.groups.clear();
}

// ---------------------------------------------------------- value changes

/** Calls @onValueChanged methods for values changed from this Inspector. */
function fireValueChanged(panel: Panel) {
    const st = panel.__ai!;
    if (!st.dump || !st.meta) return;
    const now = Date.now();
    for (const m of st.meta.members) {
        if (!m.onChanged?.length || m.kind !== 'field') continue;
        const sig = valueSignature(st.dump.value[m.name]);
        const prev = st.lastValues.get(m.name);
        st.lastValues.set(m.name, sig);
        const at = st.pending.get(m.name);
        if (prev === undefined || prev === sig || !at || now - at > CHANGE_WINDOW_MS) continue;
        for (const method of m.onChanged) invoke(panel, method);
    }
}

function keyOfEvent(e: Event): string | undefined {
    for (const t of e.composedPath()) {
        const key = (t as any).__aiKey;
        if (typeof key === 'string') return key;
    }
    return undefined;
}

// ------------------------------------------------------------ panel module

export const template = '<div class="ai-root"></div>';
export const style = css;
export const $ = { root: '.ai-root' };

function state(panel: Panel): State {
    if (!panel.__ai) {
        panel.__ai = {
            token: 0, dump: null, meta: null, request: null, needsRemote: false, remote: null, remoteSig: '',
            views: new Map(), groups: new Map(), uuid: '', lastValues: new Map(), pending: new Map(), timer: null, polling: false,
            again: false,
        };
    }
    return panel.__ai;
}

export function ready(this: Panel) {
    const panel = this;
    state(panel);
    panel.$this.style.display = 'none';
    const root = panel.$.root;

    root.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest('[data-ai-method]') as HTMLButtonElement | null;
        if (btn) {
            if (!btn.disabled) invoke(panel, btn.dataset.aiMethod!);
            return;
        }
        const tab = target.closest('[data-ai-tab]') as HTMLElement | null;
        if (tab) {
            const bar = tab.parentElement!;
            const key = bar.dataset.aiTabs!;
            const view = [...panel.__ai!.groups.values()].find((g) => g.bar === bar);
            activeTabs.set(key, tab.dataset.aiTab!);
            if (view?.pages) selectTab(bar, view.pages, tab.dataset.aiTab!);
        }
    });

    // Remember which fields were edited here, for @onValueChanged.
    root.addEventListener('change-dump', (e) => {
        const key = keyOfEvent(e);
        if (key) panel.__ai!.pending.set(key, Date.now());
    });
}

export async function update(this: Panel, dump: ComponentDump) {
    const panel = this;
    const st = state(panel);
    st.dump = dump;
    const token = ++st.token;
    const host = hostOf(panel);
    const uuid = host.ids(dump).join(',');
    if (uuid !== st.uuid) {
        st.uuid = uuid;
        st.lastValues.clear();
        st.pending.clear();
        st.remote = null;
    }
    const protocol = host.protocol();

    const meta = await getMeta(protocol, dump?.type, () => {
        if (panel.__ai?.dump) update.call(panel, panel.__ai.dump);
    });
    if (token !== st.token) return;

    if (!meta || !meta.members.length) {
        st.meta = null;
        stopPoll(st);
        clear(panel);
        showDefault(panel, true);
        return;
    }

    if (st.meta !== meta) st.remote = null;
    st.meta = meta;
    const { request: req, needed } = buildEvalRequest(meta, dump);
    req.open = openPaths(dump.type, meta, dump);
    st.request = req;
    st.needsRemote = needed;
    let fresh = false;
    if (!needed) {
        st.remote = null;
        st.remoteSig = '';
    } else if (!st.remote) {
        st.remote = await evalRemote(panel);
        st.remoteSig = JSON.stringify(st.remote);
        fresh = true;
        if (token !== st.token) return;
    }

    showDefault(panel, false);
    render(panel);
    fireValueChanged(panel);

    if (needed) {
        startPoll(panel);
        // Getters may depend on the value that just changed.
        if (!fresh) refreshRemote(panel);
    } else {
        stopPoll(st);
    }
}

export function close(this: Panel) {
    const st = this.__ai;
    if (st) stopPoll(st);
}

export interface MountedInspector {
    /** Draws the dump; resolves true when its class uses attributes (advanced-inspector draws it). */
    update(dump: ComponentDump): Promise<boolean>;
    close(): void;
}

/**
 * Draws a dump with advanced-inspector attributes inside another Inspector
 * panel, e.g. the ScriptableObject asset Inspector. Values are read and
 * edited through `host`; plain property edits still bubble up as the usual
 * change-dump / confirm-dump events from the <ui-prop> elements.
 */
export function mountInspector(container: HTMLElement, host: InspectorHost): MountedInspector {
    const wrapper = document.createElement('div');
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    const root = document.createElement('div');
    root.className = 'ai-root';
    wrapper.append(styleEl, root);
    container.appendChild(wrapper);
    let ours = false;
    const panel = { $: { root }, $this: wrapper } as unknown as Panel;
    panel.__aiHost = {
        ...host,
        showDefault(show) {
            ours = !show;
            wrapper.style.display = show ? 'none' : '';
            host.showDefault(show);
        },
    };
    ready.call(panel);
    return {
        async update(dump) {
            await update.call(panel, dump);
            return ours;
        },
        close() {
            close.call(panel);
            wrapper.remove();
        },
    };
}
