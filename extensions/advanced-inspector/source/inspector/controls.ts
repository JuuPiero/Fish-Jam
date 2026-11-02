/**
 * Controls drawn instead of the engine's default property UI. Each one is a
 * <ui-prop> (so labels line up with the rest of the Inspector) that reports
 * edits the engine way: set dump.value, then dispatch 'change-dump' and
 * 'confirm-dump' (the confirm closes the undo step).
 */
import type { DropdownItem, MemberMeta, RGBA } from '../shared/meta';
import { looseEqual, nicify, type DumpProp } from './logic';

export interface ControlInput {
    info: DumpProp;
    meta: MemberMeta;
    disabled: boolean;
    /** progressBar: resolved bounds. */
    min?: number;
    max?: number;
    /** valueDropdown: resolved items. */
    items?: DropdownItem[];
}

export interface Control {
    el: HTMLElement;
    update(input: ControlInput): void;
}

type UIElement = HTMLElement & { value: any; dump?: any; dispatch(name: string): void; render?(dump: any): void };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, attrs?: Record<string, string>): HTMLElementTagNameMap[K];
export function h(tag: string, cls?: string, attrs?: Record<string, string>): HTMLElement;
export function h(tag: string, cls?: string, attrs?: Record<string, string>): HTMLElement {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

/** Put `els` into `container` in order, moving as little as possible. */
export function syncChildren(container: HTMLElement, els: HTMLElement[]) {
    els.forEach((el, i) => {
        const at = container.children[i] || null;
        if (at !== el) container.insertBefore(el, at);
    });
    while (container.children.length > els.length) container.lastElementChild!.remove();
}

export function isFocused(el: HTMLElement): boolean {
    return el.matches(':focus, :focus-within');
}

export function escapeHtml(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
}

export function rgba(c: RGBA, alpha = 1): string {
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${((c[3] ?? 255) / 255) * alpha})`;
}

export function labelOf(info: DumpProp | undefined, meta: MemberMeta | undefined, key: string): string {
    if (meta?.label) return meta.label;
    const d = typeof info?.displayName === 'string' ? info.displayName.trim() : '';
    if (d && !d.startsWith('i18n:')) return d;
    return nicify(info?.name || key);
}

/** A labelled <ui-prop> with a content slot. */
function shell(hideLabel: boolean): { prop: UIElement; label: UIElement; content: HTMLElement } {
    const prop = h('ui-prop', 'ai-main') as UIElement;
    const label = h('ui-label', '', { slot: 'label' }) as UIElement;
    const content = h('div', 'ai-custom', { slot: 'content' });
    content.style.display = 'flex';
    content.style.alignItems = 'center';
    content.style.flex = '1 1 auto';
    content.style.minWidth = '0';
    if (hideLabel) prop.setAttribute('no-label', '');
    else prop.appendChild(label);
    prop.appendChild(content);
    return { prop, label, content };
}

function setLabel(label: UIElement, input: ControlInput) {
    const text = labelOf(input.info, input.meta, input.info.name || '');
    if (label.getAttribute('value') !== text) label.setAttribute('value', text);
    const tip = input.info.tooltip && !String(input.info.tooltip).startsWith('i18n:') ? String(input.info.tooltip) : '';
    if (tip) label.setAttribute('tooltip', tip);
    else label.removeAttribute('tooltip');
}

/** Write a new value into the dump and let the Inspector apply it. */
function commit(prop: UIElement, info: DumpProp, value: any, confirm: boolean) {
    info.value = value;
    if (Array.isArray(info.values)) info.values = info.values.map(() => value);
    prop.dump = info;
    prop.dispatch('change-dump');
    if (confirm) prop.dispatch('confirm-dump');
}

function isMultipleInvalid(info: DumpProp): boolean {
    return Array.isArray(info.values) && info.values.some((v) => !looseEqual(v, info.value) && JSON.stringify(v) !== JSON.stringify(info.value));
}

function decimals(step: number): number {
    const s = String(step);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
}

function roundTo(v: number, step: number): number {
    if (!(step > 0)) return v;
    return Number((Math.round(v / step) * step).toFixed(decimals(step)));
}

function capture(el: HTMLElement, pointerId: number) {
    try {
        el.setPointerCapture(pointerId);
    } catch {
        // pointer already gone
    }
}

function format(v: number): string {
    if (!Number.isFinite(v)) return String(v);
    return String(Number(v.toFixed(3)));
}

// --------------------------------------------------------------- progress

export function progressControl(hideLabel: boolean): Control {
    const { prop, label, content } = shell(hideLabel);
    const bar = h('div', 'ai-progress');
    const fill = h('div', 'ai-progress-fill');
    const text = h('div', 'ai-progress-text');
    bar.append(fill, text);
    content.appendChild(bar);

    let input: ControlInput | null = null;
    let dragging = false;

    const bounds = () => {
        const min = input?.min ?? 0;
        const max = input?.max ?? 100;
        return max > min ? { min, max } : { min, max: min + 1 };
    };

    const step = () => {
        const info = input!.info;
        if (typeof info.step === 'number' && info.step > 0) return info.step;
        if (info.type === 'Integer') return 1;
        const { min, max } = bounds();
        return max - min > 1 ? 0.01 : 0.001;
    };

    const valueAt = (clientX: number) => {
        const r = bar.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
        const { min, max } = bounds();
        return roundTo(min + t * (max - min), step());
    };

    const draw = (value: number, invalid: boolean) => {
        const { min, max } = bounds();
        const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
        fill.style.width = `${t * 100}%`;
        const suffix = input?.meta.suffix ? ` ${input.meta.suffix}` : '';
        text.textContent = invalid ? '-' : `${format(value)}${suffix}`;
    };

    bar.addEventListener('pointerdown', (e) => {
        if (!input || input.disabled || e.button !== 0) return;
        dragging = true;
        capture(bar, e.pointerId);
        const v = valueAt(e.clientX);
        draw(v, false);
        commit(prop, input.info, v, false);
    });
    bar.addEventListener('pointermove', (e) => {
        if (!dragging || !input) return;
        const v = valueAt(e.clientX);
        if (v === input.info.value) return;
        draw(v, false);
        commit(prop, input.info, v, false);
    });
    const end = (e: PointerEvent) => {
        if (!dragging || !input) return;
        dragging = false;
        if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
        prop.dump = input.info;
        prop.dispatch('confirm-dump');
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);

    return {
        el: prop,
        update(next) {
            input = next;
            setLabel(label, next);
            const color = next.meta.progressBar?.color;
            if (color) bar.style.setProperty('--ai-bar', rgba(color));
            else bar.style.removeProperty('--ai-bar');
            bar.style.cursor = next.disabled ? 'default' : '';
            if (!dragging) draw(Number(next.info.value) || 0, isMultipleInvalid(next.info));
        },
    };
}

// ---------------------------------------------------------- min max slider

export function minMaxControl(hideLabel: boolean): Control {
    const { prop, label, content } = shell(hideLabel);
    const box = h('div', 'ai-minmax');
    const lo = h('ui-num-input') as UIElement;
    const hi = h('ui-num-input') as UIElement;
    const track = h('div', 'ai-mm-track');
    const rail = h('div', 'ai-mm-rail');
    const range = h('div', 'ai-mm-range');
    const t0 = h('div', 'ai-mm-thumb');
    const t1 = h('div', 'ai-mm-thumb');
    track.append(rail, range, t0, t1);
    box.append(lo, track, hi);
    content.appendChild(box);

    let input: ControlInput | null = null;
    let drag: 0 | 1 | -1 = -1;
    let cur = { x: 0, y: 0 };

    const limits = () => {
        const mm = input?.meta.minMax;
        const min = mm?.min ?? 0;
        const max = mm?.max ?? 1;
        return max > min ? { min, max } : { min, max: min + 1 };
    };
    const step = () => {
        const { min, max } = limits();
        return max - min > 10 ? 0.1 : max - min > 1 ? 0.01 : 0.001;
    };

    const draw = () => {
        const { min, max } = limits();
        const p = (v: number) => `${Math.min(1, Math.max(0, (v - min) / (max - min))) * 100}%`;
        t0.style.left = p(cur.x);
        t1.style.left = p(cur.y);
        range.style.left = p(cur.x);
        range.style.width = `calc(${p(cur.y)} - ${p(cur.x)})`;
        if (!isFocused(lo)) lo.value = cur.x;
        if (!isFocused(hi)) hi.value = cur.y;
    };

    const send = (confirm: boolean) => {
        if (!input) return;
        const base = input.info.value && typeof input.info.value === 'object' ? input.info.value : {};
        commit(prop, input.info, { ...base, x: cur.x, y: cur.y }, confirm);
    };

    const valueAt = (clientX: number) => {
        const r = track.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
        const { min, max } = limits();
        return roundTo(min + t * (max - min), step());
    };

    const apply = (which: 0 | 1, v: number) => {
        if (which === 0) cur = { x: Math.min(v, cur.y), y: cur.y };
        else cur = { x: cur.x, y: Math.max(v, cur.x) };
    };

    track.addEventListener('pointerdown', (e) => {
        if (!input || input.disabled || e.button !== 0) return;
        const v = valueAt(e.clientX);
        drag = Math.abs(v - cur.x) <= Math.abs(v - cur.y) && !(v > cur.y) ? 0 : 1;
        if (cur.x === cur.y) drag = v < cur.x ? 0 : 1;
        capture(track, e.pointerId);
        apply(drag, v);
        draw();
        send(false);
    });
    track.addEventListener('pointermove', (e) => {
        if (drag < 0) return;
        apply(drag as 0 | 1, valueAt(e.clientX));
        draw();
        send(false);
    });
    const end = (e: PointerEvent) => {
        if (drag < 0 || !input) return;
        drag = -1;
        if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
        prop.dump = input.info;
        prop.dispatch('confirm-dump');
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    const onField = (which: 0 | 1) => (e: Event) => {
        e.stopPropagation();
        const v = Number((e.target as UIElement).value);
        if (!Number.isFinite(v)) return;
        apply(which, v);
        draw();
        send(false);
    };
    const onConfirm = (e: Event) => {
        e.stopPropagation();
        if (!input) return;
        prop.dump = input.info;
        prop.dispatch('confirm-dump');
    };
    lo.addEventListener('change', onField(0));
    hi.addEventListener('change', onField(1));
    lo.addEventListener('confirm', onConfirm);
    hi.addEventListener('confirm', onConfirm);

    return {
        el: prop,
        update(next) {
            input = next;
            setLabel(label, next);
            const show = next.meta.minMax?.showFields !== false;
            lo.style.display = hi.style.display = show ? '' : 'none';
            for (const f of [lo, hi]) {
                if (next.disabled) f.setAttribute('disabled', '');
                else f.removeAttribute('disabled');
            }
            if (drag < 0) {
                const v = next.info.value || {};
                cur = { x: Number(v.x) || 0, y: Number(v.y) || 0 };
                draw();
            }
        },
    };
}

// --------------------------------------------------------------- dropdown

export function dropdownControl(hideLabel: boolean): Control {
    const { prop, label, content } = shell(hideLabel);
    const select = h('ui-select', 'ai-dropdown') as UIElement;
    content.appendChild(select);

    let input: ControlInput | null = null;
    let items: DropdownItem[] = [];
    let html = '';

    select.addEventListener('change', (e) => {
        e.stopPropagation();
        if (!input) return;
        const i = Number((e.target as UIElement).value);
        const item = items[i];
        if (!item) return;
        let value = item.value;
        if (typeof input.info.value === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) value = Number(value);
        commit(prop, input.info, value, true);
    });
    select.addEventListener('confirm', (e) => e.stopPropagation());

    return {
        el: prop,
        update(next) {
            input = next;
            items = next.items || [];
            setLabel(label, next);
            const invalid = isMultipleInvalid(next.info);
            const index = invalid ? -1 : items.findIndex((it) => looseEqual(it.value, next.info.value));
            let options = items.map((it, i) => `<option value="${i}">${escapeHtml(it.label)}</option>`).join('');
            if (index < 0) options = `<option value="-1">${invalid ? '-' : escapeHtml(next.info.value)}</option>${options}`;
            if (options !== html) {
                select.innerHTML = options;
                html = options;
            }
            select.value = String(index);
            if (next.disabled) select.setAttribute('disabled', '');
            else select.removeAttribute('disabled');
        },
    };
}

// ---------------------------------------------------------- toggle buttons

export function togglesControl(hideLabel: boolean): Control {
    const { prop, label, content } = shell(hideLabel);
    const row = h('div', 'ai-toggles');
    content.appendChild(row);

    let input: ControlInput | null = null;
    let html = '';

    row.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('[data-v]') as HTMLElement | null;
        if (!btn || !input || input.disabled) return;
        const v = Number(btn.dataset.v);
        if (input.info.bitmaskList?.length) {
            const cur = Number(input.info.value) || 0;
            commit(prop, input.info, v === 0 ? 0 : cur ^ v, true);
        } else {
            commit(prop, input.info, v, true);
        }
    });

    return {
        el: prop,
        update(next) {
            input = next;
            setLabel(label, next);
            const list = next.info.bitmaskList?.length ? next.info.bitmaskList : next.info.enumList || [];
            const markup = list.map((it) => `<button class="ai-btn ai-toggle" data-v="${Number(it.value)}">${escapeHtml(nicify(it.name))}</button>`).join('');
            if (markup !== html) {
                row.innerHTML = markup;
                html = markup;
            }
            const invalid = isMultipleInvalid(next.info);
            const value = Number(next.info.value) || 0;
            const bitmask = !!next.info.bitmaskList?.length;
            row.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => {
                const v = Number(b.dataset.v);
                const on = !invalid && (bitmask ? (v === 0 ? value === 0 : (value & v) === v) : v === value);
                b.classList.toggle('on', on);
                if (next.disabled) b.setAttribute('disabled', '');
                else b.removeAttribute('disabled');
            });
        },
    };
}
