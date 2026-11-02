/**
 * Helpers shared by the component Inspector renderers.
 *
 * A renderer registered for a component type replaces the default one, so
 * these renderers draw the component's ordinary properties themselves (with
 * <ui-prop type="dump">, like the default) and add their own sections.
 */

export interface RendererContext {
    $: Record<string, HTMLElement>;
    $this: HTMLElement & { messageProtocol?: { scene: string } };
    dump: any;
    [key: string]: any;
}

/** The scene message target of the Inspector (the edit scene, or the prefab / animation scene). */
export function sceneTarget(ctx: RendererContext): string {
    let el: any = ctx.$this;
    while (el) {
        if (el.messageProtocol?.scene) return el.messageProtocol.scene;
        el = el.parentElement || el.getRootNode?.().host;
    }
    return 'scene';
}

export function callScene(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request('scene', 'execute-scene-script', { name: 'spine-plus', method, args });
}

export function componentUuids(dump: any): string[] {
    const u = dump?.value?.uuid;
    if (!u) return [];
    return Array.isArray(u.values) && u.values.length ? u.values : [u.value];
}

export function nodeUuids(dump: any): string[] {
    const n = dump?.value?.node;
    const vals = n?.values ?? (n?.value ? [n.value] : []);
    return vals.map((v: any) => (typeof v === 'string' ? v : v?.uuid)).filter(Boolean);
}

/** Runs a method on the component(s), as one undo step. */
export async function callComponent(ctx: RendererContext, name: string, args: any[] = [], undoable = true): Promise<any[]> {
    const target = sceneTarget(ctx);
    const uuids = componentUuids(ctx.dump);
    let undoId: string | null = null;
    if (undoable) {
        try {
            undoId = (await Editor.Message.request(target as any, 'begin-recording', uuids)) as any;
        } catch {
            undoId = null;
        }
    }
    const results: any[] = [];
    try {
        for (const uuid of uuids) {
            results.push(await Editor.Message.request(target as any, 'execute-component-method', { uuid, name, args }));
        }
    } finally {
        if (undoId) await Editor.Message.request(target as any, 'end-recording', undoId).catch(() => undefined);
    }
    return results;
}

/** Small DOM builder. */
export function h(tag: string, attrs: Record<string, any> = {}, children: (Node | string | null | undefined | false)[] = []): HTMLElement {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'value' || k === 'checked' || k === 'disabled') (el as any)[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
}

/**
 * Draws the visible properties of a component dump with <ui-prop type="dump">
 * (reusing the elements across updates), skipping `skip`.
 */
export function renderProps(ctx: RendererContext, container: HTMLElement, dump: any, skip: string[] = []): void {
    const props: Record<string, any> = (ctx.__props ||= {});
    const keys = Object.keys(dump?.value || {})
        .filter((k) => dump.value[k] && dump.value[k].visible && !skip.includes(k))
        .map((k, i) => {
            const info = dump.value[k];
            const order = info.group?.displayOrder ?? info.displayOrder;
            return { k, order: order === undefined ? i : Number(order), i };
        })
        .sort((a, b) => a.order - b.order || a.i - b.i)
        .map((x) => x.k);
    for (const k of Object.keys(props)) {
        if (!keys.includes(k)) {
            props[k].remove();
            delete props[k];
        }
    }
    let prev: Element | null = null;
    for (const k of keys) {
        let el = props[k];
        if (!el) {
            el = props[k] = document.createElement('ui-prop');
            el.setAttribute('type', 'dump');
        }
        const want = prev ? prev.nextElementSibling : container.firstElementChild;
        if (want !== el) container.insertBefore(el, want);
        el.render(dump.value[k]);
        prev = el;
    }
}

/** True while the user edits a field inside `el` (re-rendering would steal focus). */
export function isEditing(el: HTMLElement): boolean {
    const root = el.getRootNode() as Document | ShadowRoot;
    const active = (root as any).activeElement as Element | null;
    return !!active && el.contains(active);
}

export const BASE_STYLE = `
.sp-section { margin: 6px 0 4px; padding: 6px; border: 1px solid var(--color-normal-border, rgba(255,255,255,0.08)); border-radius: 3px; }
.sp-bar { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.sp-bar > ui-button { flex: 1; min-width: 70px; }
.sp-note { color: var(--color-normal-contrast-weaker, #aaa); font-size: 11px; margin: 4px 0; line-height: 1.4; }
.sp-warn { color: var(--color-warn-fill, #d9a33a); font-size: 11px; margin: 4px 0; }
.sp-flex { flex: 1; }
`;
