/**
 * Draws a @showInInspector member: one row per value, collections as
 * foldouts (Map entries keyed by their key), primitives and vectors editable.
 * Rows are keyed by value path and reused, so values can refresh while the
 * user is typing in one of them.
 */
import { childPath, type InspectNode, type InspectResult } from '../shared/meta';
import { h, isFocused, syncChildren } from './controls';
import { flattenInspect, summary, type InspectRow } from './inspect-logic';

export interface InspectActions {
    isOpen(path: string, depth: number): boolean;
    toggle(path: string, depth: number): void;
    set(path: string, value: unknown): void;
    remove(path: string): void;
    add(path: string, value: unknown, key?: unknown): void;
    select(node: Extract<InspectNode, { t: 'ref' }>): void;
}

export interface InspectInput {
    result: InspectResult | undefined;
    label: string;
    disabled: boolean;
    hideLabel: boolean;
}

export interface InspectView {
    el: HTMLElement;
    update(input: InspectInput): void;
}

type UI = HTMLElement & { value: any };

interface RowEl extends HTMLElement {
    __row: InspectRow;
    __shape: string;
    __label: HTMLElement;
    __arrow: HTMLElement;
    __text: HTMLElement;
    __content: HTMLElement;
    __refresh(row: InspectRow): void;
}

function shapeOf(r: InspectRow): string {
    const n = r.node;
    const axes = n?.t === 'vec' ? Object.keys(n.v).join(',') : '';
    return `${r.kind}|${n?.t ?? ''}|${r.editable ? 1 : 0}|${r.removable ? 1 : 0}|${axes}|${r.add?.keyType ?? (r.add ? 'list' : '')}`;
}

function text(cls: string, value = ''): HTMLElement {
    const s = h('span', cls);
    s.textContent = value;
    return s;
}

export function createInspectView(actions: InspectActions): InspectView {
    const el = h('div', 'ai-inspect ai-main');
    const rows = new Map<string, RowEl>();

    /** Editor for a leaf value; returns how to show a new value in it. */
    function leafEditor(row: RowEl, r: InspectRow): (n: InspectNode) => void {
        const c = row.__content;
        const n = r.node!;
        const path = () => row.__row.node!.p;
        const disable = (e: HTMLElement) => {
            if (!r.editable) e.setAttribute('disabled', '');
        };

        if (n.t === 'num') {
            const input = h('ui-num-input') as UI;
            disable(input);
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const v = Number(input.value);
                if (Number.isFinite(v)) actions.set(path(), v);
            });
            input.addEventListener('confirm', (e) => e.stopPropagation());
            c.appendChild(input);
            return (x) => {
                if (x.t === 'num' && !isFocused(input)) input.value = x.v;
            };
        }
        if (n.t === 'str') {
            const input = h('ui-input') as UI;
            disable(input);
            input.addEventListener('change', (e) => e.stopPropagation());
            input.addEventListener('confirm', (e) => {
                e.stopPropagation();
                actions.set(path(), String(input.value ?? ''));
            });
            c.appendChild(input);
            return (x) => {
                if (x.t === 'str' && !isFocused(input)) input.value = x.v;
            };
        }
        if (n.t === 'bool') {
            const input = h('ui-checkbox') as UI;
            disable(input);
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                actions.set(path(), !!input.value);
            });
            input.addEventListener('confirm', (e) => e.stopPropagation());
            c.appendChild(input);
            return (x) => {
                if (x.t === 'bool') input.value = x.v;
            };
        }
        if (n.t === 'vec') {
            const box = h('div', 'ai-ivec');
            const inputs = new Map<string, UI>();
            for (const axis of Object.keys(n.v)) {
                const input = h('ui-num-input') as UI;
                disable(input);
                input.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const v = Number(input.value);
                    if (Number.isFinite(v)) actions.set(childPath(path(), 'k', axis), v);
                });
                input.addEventListener('confirm', (e) => e.stopPropagation());
                box.append(text('ai-iaxis', axis.length > 1 ? axis[0].toUpperCase() : axis.toUpperCase()), input);
                inputs.set(axis, input);
            }
            c.appendChild(box);
            return (x) => {
                if (x.t !== 'vec') return;
                for (const [axis, input] of inputs) if (!isFocused(input)) input.value = x.v[axis];
            };
        }
        if (n.t === 'color') {
            const swatch = text('ai-iswatch');
            const label = text('ai-ivalue');
            c.append(swatch, label);
            return (x) => {
                if (x.t !== 'color') return;
                const { r: R, g, b, a } = x.v;
                swatch.style.background = `rgba(${R}, ${g}, ${b}, ${a / 255})`;
                const hex = [R, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
                label.textContent = `#${hex.toUpperCase()}${a < 255 ? `  ${Math.round((a / 255) * 100)}%` : ''}`;
            };
        }
        if (n.t === 'ref') {
            const link = text('ai-iref');
            const cls = text('ai-idim');
            link.addEventListener('click', () => {
                const cur = row.__row.node;
                if (cur?.t === 'ref' && cur.valid && cur.uuid) actions.select(cur);
            });
            c.append(link, cls);
            return (x) => {
                if (x.t !== 'ref') return;
                link.textContent = x.valid ? x.name || '(unnamed)' : 'Missing';
                link.classList.toggle('missing', !x.valid);
                cls.textContent = x.cls;
            };
        }
        const value = text('ai-ivalue ai-idim');
        c.appendChild(value);
        return (x) => {
            value.textContent = x.t === 'null' ? 'null' : x.t === 'undef' ? 'undefined' : x.t === 'text' ? x.v : '';
        };
    }

    function createRow(r: InspectRow, shape: string): RowEl {
        const row = h('ui-prop', `ai-irow ai-irow-${r.kind}`) as RowEl;
        const label = h('div', 'ai-ilabel', { slot: 'label' });
        const arrow = text('ai-iarrow');
        const name = text('ai-itext');
        label.append(arrow, name);
        const content = h('div', 'ai-icontent', { slot: 'content' });
        row.append(label, content);
        Object.assign(row, { __row: r, __shape: shape, __label: label, __arrow: arrow, __text: name, __content: content });

        let refresh: (row: InspectRow) => void = () => undefined;
        if (r.kind === 'container') {
            const sum = text('ai-idim');
            content.appendChild(sum);
            arrow.classList.add('toggle');
            label.addEventListener('click', () => actions.toggle(row.__row.node!.p, row.__row.depth));
            refresh = (x) => {
                sum.textContent = x.node ? summary(x.node) : '';
            };
        } else if (r.kind === 'leaf') {
            const show = leafEditor(row, r);
            refresh = (x) => x.node && show(x.node);
        } else if (r.kind === 'more' || r.kind === 'error') {
            const t = text(r.kind === 'error' ? 'ai-ierror' : 'ai-idim');
            content.appendChild(t);
            refresh = (x) => {
                t.textContent = x.text || '';
            };
        } else if (r.kind === 'add') {
            let key: UI | null = null;
            if (r.add?.keyType) {
                key = (r.add.keyType === 'num' ? h('ui-num-input') : h('ui-input')) as UI;
                key.setAttribute('placeholder', 'New key');
                key.classList.add('ai-ikey');
                key.addEventListener('change', (e) => e.stopPropagation());
                key.addEventListener('confirm', (e) => e.stopPropagation());
                content.appendChild(key);
            }
            const btn = h('button', 'ai-btn ai-iadd');
            btn.textContent = key ? 'Add Entry' : 'Add Item';
            btn.addEventListener('click', () => {
                const add = row.__row.add;
                if (!add) return;
                if (!key) {
                    actions.add(add.path, add.value);
                    return;
                }
                const raw = key.value;
                const k = add.keyType === 'num' ? Number(raw) : String(raw ?? '').trim();
                if (add.keyType === 'num' ? !Number.isFinite(k as number) : k === '') return;
                actions.add(add.path, add.value, k);
                key.value = add.keyType === 'num' ? 0 : '';
            });
            content.appendChild(btn);
        }

        if (r.removable) {
            const remove = h('button', 'ai-btn ai-iremove', { title: 'Remove' });
            remove.textContent = '×';
            remove.addEventListener('click', () => actions.remove(row.__row.node!.p));
            content.appendChild(remove);
        }
        row.__refresh = refresh;
        return row;
    }

    function update(input: InspectInput) {
        const list = flattenInspect(input.result, { label: input.label, disabled: input.disabled, isOpen: actions.isOpen });
        const used = new Set<string>();
        const els = list.map((r, i) => {
            const shape = shapeOf(r);
            let row = rows.get(r.key);
            if (!row || row.__shape !== shape) {
                row?.remove();
                row = createRow(r, shape);
                rows.set(r.key, row);
            }
            used.add(r.key);
            row.__row = r;
            row.__text.textContent = r.label;
            row.__label.style.paddingLeft = `${r.depth * 12}px`;
            if (r.kind === 'container') row.__arrow.classList.toggle('open', actions.isOpen(r.node!.p, r.depth));
            // Top-level values without a foldout line up with the other properties.
            row.__arrow.style.display = r.depth === 0 && r.kind !== 'container' ? 'none' : '';
            if (i === 0 && input.hideLabel) row.setAttribute('no-label', '');
            else row.removeAttribute('no-label');
            row.__refresh(r);
            return row;
        });
        for (const [key, row] of rows) {
            if (!used.has(key)) {
                row.remove();
                rows.delete(key);
            }
        }
        syncChildren(el, els);
    }

    return { el, update };
}
