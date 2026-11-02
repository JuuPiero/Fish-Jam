/**
 * Inspector for SkeletonAnimation: skin and animation pickers (from the
 * loaded data), status, and buttons (Preview, Restart, Reset Physics, Fit
 * UITransform) above the component's other properties.
 */
import { BASE_STYLE, RendererContext, callComponent, componentUuids, h, nodeUuids, renderProps } from './shared';

export const template = /* html */ `
<div class="spa-inspector">
    <div class="sp-section">
        <div class="spa-status"></div>
        <div class="sp-warn spa-warn"></div>
        <div class="sp-bar">
            <ui-button class="preview" title="Open the Spine Preview panel on this skeleton">Preview</ui-button>
            <ui-button class="restart" title="Reload the data and restart the animation">Restart</ui-button>
            <ui-button class="reset" title="Put physics at rest">Reset Physics</ui-button>
            <ui-button class="fit" title="Size the UITransform to the skeleton">Fit UITransform</ui-button>
        </div>
    </div>
    <div class="spa-top"></div>
    <div class="props"></div>
</div>
`;

export const style = BASE_STYLE + /* css */ `
.spa-status { font-size: 11px; margin: 0 0 6px; line-height: 1.5; color: var(--color-normal-contrast-weaker, #aaa); }
.spa-status.error { color: var(--color-danger-fill, #e5674f); }
.spa-warn:empty { display: none; }
.spa-warn ui-button { margin-left: 6px; }
.spa-hidden { display: none; }
`;

export const $ = {
    status: '.spa-status',
    warn: '.spa-warn',
    preview: '.preview',
    restart: '.restart',
    reset: '.reset',
    fit: '.fit',
    top: '.spa-top',
    props: '.props',
};

interface EditorInfo {
    error: string;
    info: null | {
        exported: string;
        runtime: string;
        bones: number;
        slots: number;
        physics: number;
        animations: { name: string; duration: number }[];
        skins: string[];
        pma: boolean;
    };
    batches: number;
    vertices: number;
    overflow: boolean;
    inCanvas: boolean;
    uiRenderer: boolean;
    hasData: boolean;
}

type Ctx = RendererContext & {
    editorInfo: EditorInfo | null;
    timer?: any;
    top?: {
        data: any;
        skin: HTMLElement;
        skinSelect: any;
        anim: HTMLElement;
        animSelect: any;
        loop: any;
        skinDump: any;
        animDump: any;
    };
    optionsKey?: string;
};

/** Writes a value through a dump-rendered ui-prop, so the Inspector records it (undo, multi-select). */
function writeDump(el: any, value: any): void {
    const info = el?.dump;
    if (!info) return;
    info.value = value;
    if (Array.isArray(info.values)) info.values = info.values.map(() => value);
    el.dispatch('change-dump');
    el.dispatch('confirm-dump');
}

function pickerRow(label: string, tooltip: string): { row: HTMLElement; select: any } {
    const select = h('ui-select', { slot: 'content' }) as any;
    const row = h('ui-prop', { tooltip }, [h('ui-label', { slot: 'label', value: label }), select]);
    return { row, select };
}

function setOptions(select: any, values: { value: string; label: string }[], current: string): void {
    const key = JSON.stringify(values);
    if (select.__key !== key) {
        select.__key = key;
        select.innerHTML = '';
        for (const v of values) {
            const o = document.createElement('option');
            o.value = v.value;
            o.textContent = v.label;
            select.appendChild(o);
        }
    }
    select.value = current;
}

function buildTop(ctx: Ctx): void {
    if (ctx.top) return;
    const data = document.createElement('ui-prop');
    data.setAttribute('type', 'dump');
    const skin = pickerRow('Skin', 'Skin to show');
    const anim = pickerRow('Animation', 'Animation on track 0 when the skeleton starts');
    const loop = document.createElement('ui-prop');
    loop.setAttribute('type', 'dump');
    // Hidden dump props that carry the edits to the scene.
    const skinDump = document.createElement('ui-prop');
    skinDump.setAttribute('type', 'dump');
    skinDump.className = 'spa-hidden';
    const animDump = document.createElement('ui-prop');
    animDump.setAttribute('type', 'dump');
    animDump.className = 'spa-hidden';
    skin.select.addEventListener('change', (e: any) => writeDump(skinDump, e.target.value === '<default>' ? '' : e.target.value));
    anim.select.addEventListener('change', (e: any) => writeDump(animDump, e.target.value === '<none>' ? '' : e.target.value));
    ctx.$.top.append(data, skin.row, anim.row, loop, skinDump, animDump);
    ctx.top = { data, skin: skin.row, skinSelect: skin.select, anim: anim.row, animSelect: anim.select, loop, skinDump, animDump };
}

function drawTop(ctx: Ctx): void {
    buildTop(ctx);
    const t = ctx.top!;
    const v = ctx.dump?.value || {};
    if (v.skeletonData) (t.data as any).render(v.skeletonData);
    if (v.loop) (t.loop as any).render(v.loop);
    if (v.skin) (t.skinDump as any).render(v.skin);
    if (v.animation) (t.animDump as any).render(v.animation);
    const info = ctx.editorInfo?.info;
    const skin = v.skin?.value ?? '';
    const anim = v.animation?.value ?? '';
    const skins = info ? info.skins : [];
    const anims = info ? info.animations.map((a) => a.name) : [];
    const skinOptions = skins.map((s) => ({ value: s === 'default' ? '<default>' : s, label: s }));
    if (!skins.includes('default')) skinOptions.unshift({ value: '<default>', label: 'default' });
    if (skin && !skins.includes(skin)) skinOptions.push({ value: skin, label: `${skin} (missing)` });
    setOptions(t.skinSelect, skinOptions, skin && skin !== 'default' ? skin : '<default>');
    const animOptions = [{ value: '<none>', label: '<None> (setup pose)' }, ...anims.map((a) => ({ value: a, label: a }))];
    if (anim && !anims.includes(anim)) animOptions.push({ value: anim, label: `${anim} (missing)` });
    setOptions(t.animSelect, animOptions, anim || '<none>');
    const multi = componentUuids(ctx.dump).length > 1;
    t.skinSelect.disabled = !info || multi;
    t.animSelect.disabled = !info || multi;
}

function drawStatus(ctx: Ctx): void {
    const e = ctx.editorInfo;
    const status = ctx.$.status;
    const warn = ctx.$.warn;
    status.classList.remove('error');
    warn.textContent = '';
    const multi = componentUuids(ctx.dump).length > 1;
    if (!e) {
        status.textContent = multi ? 'Several skeletons selected.' : '';
    } else if (e.error) {
        status.textContent = e.error;
        status.classList.add('error');
    } else if (!e.hasData) {
        status.textContent = 'Assign a Spine export (.json or .skel with its atlas) to Skeleton Data. Spine 4.2 and 4.3 are supported.';
    } else if (e.info) {
        const i = e.info;
        status.textContent = `Spine ${i.exported || '?'} · ${i.runtime} runtime · ${i.bones} bones · ${i.slots} slots · `
            + `${i.physics} physics · ${e.batches} batch${e.batches === 1 ? '' : 'es'} · ${e.vertices} vertices${i.pma ? ' · PMA' : ''}`;
    }
    if (e?.overflow) warn.appendChild(document.createTextNode('More than 65535 vertices: the rest is not drawn.'));
    if (e && e.inCanvas && !e.uiRenderer) {
        warn.appendChild(document.createTextNode('In a Canvas: add a SkeletonUIRenderer to draw in the UI with sprites.'));
        warn.appendChild(h('ui-button', { class: 'tiny', onclick: () => addUIRenderer(ctx) }, ['Add']));
    }
    (ctx.$.fit as any).disabled = !e?.inCanvas || !e?.info;
    (ctx.$.preview as any).disabled = !ctx.dump?.value?.skeletonData?.value?.uuid;
}

async function addUIRenderer(ctx: Ctx): Promise<void> {
    for (const uuid of nodeUuids(ctx.dump)) {
        await Editor.Message.request('scene', 'create-component', { uuid, component: 'SkeletonUIRenderer' } as any).catch(() => undefined);
    }
    schedule(ctx, 100);
}

async function refresh(ctx: Ctx): Promise<void> {
    const ids = componentUuids(ctx.dump);
    if (ids.length) {
        try {
            const [info] = await callComponent(ctx, 'getEditorInfo', [], false);
            ctx.editorInfo = info || null;
        } catch {
            ctx.editorInfo = null;
        }
    } else {
        ctx.editorInfo = null;
    }
    drawStatus(ctx);
    drawTop(ctx);
}

function schedule(ctx: Ctx, delay = 30): void {
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => refresh(ctx), delay);
}

export function ready(this: Ctx) {
    this.editorInfo = null;
    this.$.preview.addEventListener('click', () => {
        const uuid = this.dump?.value?.skeletonData?.value?.uuid;
        if (uuid) Editor.Message.send('spine-plus', 'open-preview', uuid);
    });
    this.$.restart.addEventListener('click', async () => {
        await callComponent(this, 'reload', [], false);
        schedule(this, 50);
    });
    this.$.reset.addEventListener('click', () => callComponent(this, 'resetPhysics', [], false));
    this.$.fit.addEventListener('click', async () => {
        const nodes = nodeUuids(this.dump);
        let undo: any = null;
        try {
            undo = await Editor.Message.request('scene', 'begin-recording', nodes);
        } catch {
            undo = null;
        }
        await callComponent(this, 'fitUITransform', [], false);
        if (undo) await Editor.Message.request('scene', 'end-recording', undo).catch(() => undefined);
    });
}

export function update(this: Ctx, dump: any) {
    this.dump = dump;
    drawTop(this);
    renderProps(this, this.$.props, dump, ['skeletonData', 'skin', 'animation', 'loop']);
    // The data and options may change with this edit: refresh shortly after the scene applied it.
    schedule(this, 60);
}

export function close(this: Ctx) {
    clearTimeout(this.timer);
}
