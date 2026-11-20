/**
 * Inspector for LineRenderer: Unity's Scene Tools (Edit Points / Create
 * Points, Simplify) above the component's properties.
 */
import { BASE_STYLE, RendererContext, callScene, componentUuids, h, isEditing, renderProps } from './shared';
import { onBroadcast } from '../shared/broadcast';

interface ToolState {
    primary: boolean;
    target: string | null;
    mode: string;
    selection: number[];
    count: number;
    simplified: number;
    settings: {
        inputMode: string;
        minVertexDistance: number;
        viewDistance: number;
        surfaceOffset: number;
        simplifyPreview: boolean;
        tolerance: number;
    };
    is2D: boolean;
}

export const template = /* html */ `
<div class="lr-inspector">
    <div class="sp-section tools">
        <div class="sp-bar">
            <ui-button class="edit" title="Select and move points in the Scene view">Edit Points</ui-button>
            <ui-button class="create" title="Click or drag in the Scene view to add points">Create Points</ui-button>
        </div>
        <div class="sp-note status"></div>
        <div class="options"></div>
    </div>
    <div class="props"></div>
</div>
`;

export const style = BASE_STYLE + /* css */ `
.lr-row { display: flex; align-items: center; gap: 6px; min-height: 24px; }
.lr-row > span { width: 120px; flex: none; color: var(--color-normal-contrast-weaker, #aaa); }
.lr-row > ui-num-input, .lr-row > ui-select { flex: 1; min-width: 0; }
.lr-sub { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-normal-border, rgba(255,255,255,0.08)); }
.lr-keys { color: var(--color-normal-contrast-weaker, #999); font-size: 11px; line-height: 1.5; margin-top: 4px; }
`;

export const $ = {
    edit: '.edit',
    create: '.create',
    status: '.status',
    options: '.options',
    props: '.props',
};

type Ctx = RendererContext & {
    state: ToolState | null;
    info: { points: number; length: number } | null;
    off?: () => void;
    timer?: any;
    pending?: boolean;
};

function uuid(ctx: Ctx): string | null {
    const ids = componentUuids(ctx.dump);
    return ids.length === 1 ? ids[0] : null;
}

async function refresh(ctx: Ctx): Promise<void> {
    const id = uuid(ctx);
    if (!id) {
        ctx.state = null;
        draw(ctx);
        return;
    }
    try {
        const [state, info] = await Promise.all([callScene('lrState', id), callScene('lrInfo', id)]);
        ctx.state = state;
        ctx.info = info;
    } catch {
        ctx.state = null;
    }
    draw(ctx);
}

function schedule(ctx: Ctx, delay = 30): void {
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => refresh(ctx), delay);
}

async function call(ctx: Ctx, method: string, ...args: any[]): Promise<void> {
    try {
        const s = await callScene(method, ...args);
        if (s && typeof s === 'object' && 'mode' in s) ctx.state = s;
    } catch (e) {
        console.warn('[LineRenderer]', e);
    }
    schedule(ctx, 0);
}

function num(value: number, onConfirm: (v: number) => void, step = 0.1, min = 0): HTMLElement {
    const el = h('ui-num-input', { step: String(step), min: String(min) });
    (el as any).value = value;
    el.addEventListener('confirm', (e: any) => {
        const v = Number(e.target.value);
        if (isFinite(v)) onConfirm(v);
    });
    return el;
}

function row(label: string, control: HTMLElement, title?: string): HTMLElement {
    return h('div', { class: 'lr-row', title }, [h('span', {}, [label]), control]);
}

function draw(ctx: Ctx): void {
    const s = ctx.state;
    const id = uuid(ctx);
    const mine = !!s && !!id && s.target === id;
    const mode = mine ? s!.mode : 'none';
    const edit = ctx.$.edit as any;
    const create = ctx.$.create as any;
    edit.classList.toggle('blue', mode === 'edit');
    create.classList.toggle('blue', mode === 'create');
    edit.disabled = !id;
    create.disabled = !id;
    const info = ctx.info;
    let status = !id ? 'Select a single node to edit its points.' : info ? `${info.points} points · length ${info.length}` : '';
    if (id && s && !mine) status += ' · select this node to use the tools';
    if (mode === 'edit' && s) status += s.selection.length ? ` · ${s.selection.length} selected` : ' · click points, drag a rectangle';
    if (mode === 'create') status += ' · click or drag in the Scene view, Esc to stop';
    ctx.$.status.textContent = status;

    const root = ctx.$.options;
    if (isEditing(root)) {
        ctx.pending = true;
        return;
    }
    ctx.pending = false;
    root.textContent = '';
    if (!s || !id) return;
    const set = (key: string, value: any) => call(ctx, 'lrSetSetting', key, value);

    if (mode === 'edit') {
        root.appendChild(h('div', { class: 'sp-bar' }, [
            h('ui-button', { class: 'tiny', disabled: !s.selection.length, title: 'Add a point in the middle of each segment between selected points', onclick: () => call(ctx, 'lrAction', id, 'subdivide') }, ['Subdivide Selected']),
            h('ui-button', { class: 'tiny', onclick: () => call(ctx, 'lrAction', id, 'selectAll') }, ['Select All']),
            h('ui-button', { class: 'tiny red', disabled: !s.selection.length, onclick: () => call(ctx, 'lrAction', id, 'delete') }, ['Delete']),
        ]));
        root.appendChild(h('div', { class: 'lr-keys' }, [
            'Click / Shift+click points · drag to move (Ctrl: snap) · W / E / R handles · double-click a segment to insert · Delete · Ctrl+A · Esc',
        ]));
    }
    if (mode === 'create') {
        const input = h('ui-select', {}, [
            h('option', { value: 'plane' }, [s.is2D ? 'Plane (node XY)' : 'Plane (ground)']),
            h('option', { value: 'view' }, ['Camera Distance']),
            h('option', { value: 'surface' }, ['Surfaces']),
        ]);
        (input as any).value = s.settings.inputMode;
        input.addEventListener('change', (e: any) => set('inputMode', e.target.value));
        root.appendChild(row('Input', input, 'Where new points go'));
        root.appendChild(row('Min Vertex Distance', num(s.settings.minVertexDistance, (v) => set('minVertexDistance', v), 0.01), 'Dragging adds a point every this distance'));
        if (s.settings.inputMode === 'view') {
            root.appendChild(row('Offset', num(s.settings.viewDistance, (v) => set('viewDistance', v), 0.5), 'Distance from the camera'));
        } else if (s.settings.inputMode === 'surface') {
            root.appendChild(row('Offset', num(s.settings.surfaceOffset, (v) => set('surfaceOffset', v), 0.01), 'Lift off the surface towards the camera'));
        }
    }
    const simp = h('div', { class: 'lr-sub' });
    const preview = h('ui-checkbox', {}, ['Simplify Preview']);
    (preview as any).value = s.settings.simplifyPreview;
    preview.addEventListener('change', (e: any) => set('simplifyPreview', !!e.target.value));
    simp.appendChild(h('div', { class: 'lr-row' }, [preview]));
    simp.appendChild(row('Tolerance', num(s.settings.tolerance, (v) => set('tolerance', v), 0.01), 'Points closer than this to the simplified line are removed'));
    simp.appendChild(h('div', { class: 'sp-bar' }, [
        h('ui-button', { title: `Remove points (${s.count} → ${s.simplified})`, disabled: !mine || s.simplified >= s.count, onclick: () => call(ctx, 'lrAction', id, 'simplify', s.settings.tolerance) }, [`Simplify (${s.count} → ${s.simplified})`]),
    ]));
    root.appendChild(simp);
}

async function selectThisNode(ctx: Ctx): Promise<void> {
    const node = ctx.dump?.value?.node?.value?.uuid ?? ctx.dump?.value?.node?.value;
    const nodeUuid = typeof node === 'string' ? node : null;
    if (!nodeUuid) return;
    try {
        if (!Editor.Selection.getSelected('node').includes(nodeUuid)) {
            Editor.Selection.clear('node');
            Editor.Selection.select('node', nodeUuid);
            await new Promise((r) => setTimeout(r, 80));
        }
    } catch {
        // selection API missing
    }
}

export function ready(this: Ctx) {
    this.state = null;
    this.info = null;
    const toggle = async (mode: 'edit' | 'create') => {
        const id = uuid(this);
        if (!id) return;
        const current = this.state?.target === id ? this.state.mode : 'none';
        await selectThisNode(this);
        call(this, 'lrSetMode', id, current === mode ? 'none' : mode);
    };
    this.$.edit.addEventListener('click', () => toggle('edit'));
    this.$.create.addEventListener('click', () => toggle('create'));
    this.off = onBroadcast('line-renderer:state', () => schedule(this, 40));
    this.$.options.addEventListener('focusout', () => {
        if (this.pending) setTimeout(() => draw(this), 0);
    });
}

export function update(this: Ctx, dump: any) {
    this.dump = dump;
    renderProps(this, this.$.props, dump);
    schedule(this);
}

export function close(this: Ctx) {
    clearTimeout(this.timer);
    this.off?.();
}
