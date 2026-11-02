/**
 * Stand-ins for the editor's ui-* custom elements, close enough to exercise
 * the renderer: same properties, attributes and events it relies on.
 */
const BASE = ':host{display:block;font:12px sans-serif;color:#ccc}';

class UIBase extends HTMLElement {
    dispatch(name: string) {
        this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
    }
}

class UILabel extends UIBase {
    static get observedAttributes() {
        return ['value'];
    }
    connectedCallback() {
        this.textContent = this.getAttribute('value') || '';
    }
    attributeChangedCallback() {
        this.textContent = this.getAttribute('value') || '';
    }
}

/** <ui-prop>: slots for custom content, or a small editor for type="dump". */
class UIProp extends UIBase {
    dump: any;
    private label: HTMLElement;
    private content: HTMLElement;
    private kind = '';

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${BASE}:host{display:flex;align-items:center;min-height:22px;min-width:0}
            .l{width:38%;flex:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#bbb}
            :host([no-label]) .l{display:none}
            .c{flex:1;display:flex;align-items:center;gap:4px;min-width:0}
            input,select{background:#1f1f1f;color:#ddd;border:1px solid #111;border-radius:2px;height:18px;min-width:0;flex:1}
            input[type=checkbox]{flex:none;height:14px}
            input:disabled,select:disabled{opacity:.5}
            .unit{color:#888}</style>
            <div class="l"><slot name="label"></slot><span id="dl"></span></div>
            <div class="c"><slot name="content"></slot><span id="dc" style="display:contents"></span></div>`;
        this.label = root.getElementById('dl')!;
        this.content = root.getElementById('dc')!;
        this.content.addEventListener('change', (e) => this.onChange(e));
    }

    render(dump: any) {
        this.dump = dump;
        if (this.getAttribute('type') !== 'dump') return;
        this.label.textContent = dump.displayName || dump.name;
        const kind = dump.type === 'Boolean' ? 'bool' : dump.type === 'Enum' ? 'enum' : dump.type === 'cc.Vec2' ? 'vec2'
            : dump.type === 'Number' || dump.type === 'Integer' ? 'num' : dump.type === 'String' ? 'str' : 'ref';
        if (kind !== this.kind) {
            this.kind = kind;
            this.content.innerHTML = kind === 'bool' ? '<input type="checkbox">'
                : kind === 'enum' ? '<select></select>'
                    : kind === 'vec2' ? '<input type="number" data-k="x"><input type="number" data-k="y">'
                        : kind === 'num' ? '<input type="number"><span class="unit"></span>'
                            : kind === 'str' ? '<input type="text">' : '<span class="ref"></span>';
        }
        const ro = !!dump.readonly;
        this.content.querySelectorAll('input,select').forEach((el) => ((el as HTMLInputElement).disabled = ro));
        if (kind === 'bool') (this.content.querySelector('input') as HTMLInputElement).checked = !!dump.value;
        if (kind === 'num') {
            (this.content.querySelector('input') as HTMLInputElement).value = String(dump.value);
            this.content.querySelector('.unit')!.textContent = dump.unit || '';
        }
        if (kind === 'str') (this.content.querySelector('input') as HTMLInputElement).value = dump.value;
        if (kind === 'enum') {
            const s = this.content.querySelector('select') as HTMLSelectElement;
            s.innerHTML = dump.enumList.map((e: any) => `<option value="${e.value}">${e.name}</option>`).join('');
            s.value = String(dump.value);
        }
        if (kind === 'vec2') this.content.querySelectorAll('input').forEach((i) => (i.value = String(dump.value[i.dataset.k!])));
        if (kind === 'ref') this.content.querySelector('.ref')!.textContent = dump.value?.uuid ? dump.value.uuid : 'None';
    }

    private onChange(e: Event) {
        const t = e.target as HTMLInputElement;
        const d = this.dump;
        if (this.kind === 'bool') d.value = t.checked;
        else if (this.kind === 'num' || this.kind === 'enum') d.value = Number(t.value);
        else if (this.kind === 'vec2') d.value = { ...d.value, [t.dataset.k!]: Number(t.value) };
        else d.value = t.value;
        this.dispatch('change-dump');
        this.dispatch('confirm-dump');
    }
}

class UISection extends UIBase {
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${BASE}.h{padding:3px 0;font-weight:bold;cursor:pointer}.h::before{content:'\\25B8 '}
            :host([expand]) .h::before{content:'\\25BE '}.b{display:none;padding-left:10px}:host([expand]) .b{display:block}</style>
            <div class="h"><slot name="header"></slot></div><div class="b"><slot></slot></div>`;
        root.querySelector('.h')!.addEventListener('click', () => this.toggleAttribute('expand'));
    }
}

class UISelect extends UIBase {
    private select: HTMLSelectElement;
    private v = '';
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = '<style>:host{display:flex;flex:1}select{flex:1;background:#1f1f1f;color:#ddd;border:1px solid #111;height:20px}</style><select></select>';
        this.select = root.querySelector('select')!;
        this.select.addEventListener('change', () => {
            this.v = this.select.value;
            this.dispatchEvent(new Event('change', { bubbles: true }));
        });
        new MutationObserver(() => this.sync()).observe(this, { childList: true, subtree: true });
    }
    private sync() {
        this.select.innerHTML = this.innerHTML;
        this.select.value = this.v;
    }
    get value() {
        return this.v;
    }
    set value(v: string) {
        this.v = String(v);
        this.sync();
    }
    get options() {
        return Array.from(this.select.options).map((o) => o.textContent);
    }
}

/** ui-num-input / ui-input / ui-checkbox: a native input in a shadow root. */
class UIInputBase extends UIBase {
    static get observedAttributes() {
        return ['disabled'];
    }
    protected input: HTMLInputElement;
    constructor(type: string) {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>:host{display:inline-flex;min-width:0}input{width:100%;min-width:0;background:#1f1f1f;color:#ddd;border:1px solid #111;height:18px}
            input[type=checkbox]{width:auto;height:14px}input:disabled{opacity:.5}</style><input type="${type}">`;
        this.input = root.querySelector('input')!;
        this.input.addEventListener('input', () => this.dispatchEvent(new Event('change', { bubbles: true })));
        this.input.addEventListener('change', () => {
            if (type === 'checkbox') this.dispatchEvent(new Event('change', { bubbles: true }));
            this.dispatchEvent(new Event('confirm', { bubbles: true }));
        });
    }
    attributeChangedCallback() {
        this.input.disabled = this.hasAttribute('disabled');
    }
}

class UINumInput extends UIInputBase {
    constructor() {
        super('number');
    }
    get value() {
        return Number(this.input.value);
    }
    set value(v: number) {
        this.input.value = String(v);
    }
}

class UIInput extends UIInputBase {
    constructor() {
        super('text');
    }
    get value() {
        return this.input.value;
    }
    set value(v: string) {
        this.input.value = String(v);
    }
}

class UICheckbox extends UIInputBase {
    constructor() {
        super('checkbox');
    }
    get value() {
        return this.input.checked;
    }
    set value(v: boolean) {
        this.input.checked = !!v;
    }
}

class UIPanel extends HTMLElement {}

export function defineStubs() {
    customElements.define('ui-label', UILabel);
    customElements.define('ui-prop', UIProp);
    customElements.define('ui-section', UISection);
    customElements.define('ui-select', UISelect);
    customElements.define('ui-num-input', UINumInput);
    customElements.define('ui-input', UIInput);
    customElements.define('ui-checkbox', UICheckbox);
    customElements.define('ui-panel', UIPanel);
}
