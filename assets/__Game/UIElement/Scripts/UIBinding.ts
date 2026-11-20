/**
 * Lightweight reactive data binding for UIDocument and navigation screens.
 *
 * Supported attributes (expressions are dot paths, optionally prefixed with `!`):
 *   data-bind="player.name"          text content, or value/checked for form controls (two-way)
 *   data-show="!isPaused"            toggles visibility
 *   data-class="active: selected; locked: !unlocked"
 *
 * State objects are made reactive with `reactive()`. Any write to a reactive object (including
 * nested objects / arrays) schedules a single refresh of every live binding on the next microtask,
 * so one store can be shared by several bindings (document + screens).
 *
 * Scopes: a binding only handles elements whose closest `[data-bind-scope]` ancestor is its own
 * root. Navigation screens are scopes, so the document binding never touches screen content.
 */

export const BIND_SCOPE_ATTR = 'data-bind-scope';

const _proxyOf = new WeakMap<object, any>();
const _rawOf = new WeakMap<object, object>();
const _liveBindings = new Set<UIBinding<any>>();
let _refreshScheduled = false;

function scheduleRefreshAll() {
    if (_refreshScheduled) return;
    _refreshScheduled = true;
    Promise.resolve().then(() => {
        _refreshScheduled = false;
        _liveBindings.forEach(binding => binding.refresh());
    });
}

/**
 * Returns a reactive proxy of `data` (the same proxy for the same object). Writes through it refresh
 * every binding. Use it to create stores shared between screens:
 *   export const store = reactive({ coins: 0 });
 */
export function reactive<T extends object>(data: T): T {
    if (_rawOf.has(data)) return data;
    const existing = _proxyOf.get(data);
    if (existing) return existing;

    const proxy = new Proxy(data, {
        get: (target, key) => {
            const value = Reflect.get(target, key);
            return isObservable(value) ? reactive(value) : value;
        },
        set: (target, key, value) => {
            const ok = Reflect.set(target, key, toRaw(value));
            scheduleRefreshAll();
            return ok;
        },
        deleteProperty: (target, key) => {
            const ok = Reflect.deleteProperty(target, key);
            scheduleRefreshAll();
            return ok;
        },
    });
    _proxyOf.set(data, proxy);
    _rawOf.set(proxy, data);
    return proxy;
}

/** Original object behind a reactive proxy (or the value itself). */
export function toRaw<T>(value: T): T {
    return (value && typeof value === 'object' && _rawOf.get(value as any) as T) || value;
}

export class UIBinding<T extends object> {
    readonly state: T;

    private readonly _raw: T;
    private _disposed = false;

    constructor(private readonly _root: HTMLElement, data: T) {
        this.state = reactive(data);
        this._raw = toRaw(data);
        _root.setAttribute(BIND_SCOPE_ATTR, '');
        _root.addEventListener('input', this.onInput);
        _root.addEventListener('change', this.onInput);
        _liveBindings.add(this);
        this.refresh();
    }

    dispose() {
        this._disposed = true;
        _liveBindings.delete(this);
        this._root.removeEventListener('input', this.onInput);
        this._root.removeEventListener('change', this.onInput);
    }

    /** Re-applies every binding. Call after inserting new bound elements manually. */
    refresh() {
        if (this._disposed) return;
        this.each('[data-bind]', el => {
            applyValue(el, this.evaluate(el.dataset.bind!));
        });
        this.each('[data-show]', el => {
            el.classList.toggle('ui-hidden', !this.evaluate(el.dataset.show!));
        });
        this.each('[data-class]', el => {
            for (const pair of el.dataset.class!.split(';')) {
                const index = pair.indexOf(':');
                if (index < 0) continue;
                const className = pair.slice(0, index).trim();
                const expr = pair.slice(index + 1).trim();
                if (className && expr) el.classList.toggle(className, !!this.evaluate(expr));
            }
        });
    }

    scheduleRefresh() {
        scheduleRefreshAll();
    }

    private each(selector: string, apply: (el: HTMLElement) => void) {
        this._root.querySelectorAll<HTMLElement>(selector).forEach(el => {
            if (this.owns(el)) apply(el);
        });
    }

    private owns(el: Element): boolean {
        return el.closest(`[${BIND_SCOPE_ATTR}]`) === this._root;
    }

    private evaluate(expr: string): any {
        expr = expr.trim();
        let negate = false;
        while (expr.startsWith('!')) {
            negate = !negate;
            expr = expr.slice(1).trim();
        }
        const value = getPath(this._raw, expr);
        return negate ? !value : value;
    }

    private onInput = (ev: Event) => {
        const el = ev.target as HTMLElement;
        const path = el.dataset && el.dataset.bind;
        if (!path || path.trim().startsWith('!') || !this.owns(el)) return;

        let value: any;
        if (el instanceof HTMLInputElement) {
            if (el.type === 'checkbox') value = el.checked;
            else if (el.type === 'number' || el.type === 'range') {
                if (isNaN(el.valueAsNumber)) return;
                value = el.valueAsNumber;
            } else value = el.value;
        } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            value = el.value;
        } else {
            return;
        }
        setPath(this.state, path.trim(), value);
    };
}

function isObservable(value: any): value is object {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return true;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function getPath(obj: any, path: string): any {
    if (!path) return undefined;
    let current = obj;
    for (const key of path.split('.')) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

function setPath(obj: any, path: string, value: any) {
    const keys = path.split('.');
    const last = keys.pop()!;
    let current = obj;
    for (const key of keys) {
        if (current == null) return;
        current = current[key];
    }
    if (current != null) current[last] = value;
}

function applyValue(el: HTMLElement, value: any) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = !!value;
        return;
    }
    const text = value == null ? '' : String(value);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.value !== text) el.value = text;
    } else if (el.textContent !== text) {
        el.textContent = text;
    }
}
