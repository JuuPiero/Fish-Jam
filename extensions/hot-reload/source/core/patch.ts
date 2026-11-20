/**
 * Hot reload core: swaps the code of a running class for the code of its
 * freshly compiled version, keeping the running class object (and so every
 * live instance, `instanceof` check and registry entry) and its state.
 *
 * How it works:
 * - `instrument(C)` replaces each method of C (prototype and static) by a small
 *   forwarding stub `function () { return stub.__hrImpl.apply(this, arguments) }`.
 *   Code that already grabbed `this.tick` (schedule, input.on, node.on, tween
 *   callbacks...) holds the stub, so it follows later swaps too.
 * - `applyClass(oldC, newC)` points every stub at the new implementation,
 *   installs stubs for new methods, replaces accessors, copies new statics and
 *   makes the new class share the old class's static state and `instanceof`.
 * - `compare(oldC, newC)` tells when a swap is not enough and the game must be
 *   restarted (serialized properties, base class or class decorators changed).
 *
 * Plain JavaScript only (no engine import), so it is unit-tested in Node.
 */

export interface HotStub {
    (this: any, ...args: any[]): any;
    __hrImpl: (...args: any[]) => any;
    __hrStub: true;
}

/** Engine metadata that belongs to the running class and is never copied. */
const PROTO_SKIP: Record<string, boolean> = { constructor: true };
const STATIC_SKIP: Record<string, boolean> = {
    length: true,
    name: true,
    prototype: true,
    caller: true,
    arguments: true,
    _sealed: true,
    // class decorators (compared, never copied)
    _executeInEditMode: true,
    _requireComponent: true,
    _disallowMultiple: true,
    _executionOrder: true,
    _playOnFocus: true,
    _inspector: true,
    _icon: true,
    _help: true,
};

/** Keys starting with "__" are engine bookkeeping: __cid__, __classname__, __props__, __attrs__... */
function isInternalKey(key: string): boolean {
    return key.length > 2 && key.charAt(0) === '_' && key.charAt(1) === '_';
}

/** Class decorators that change how Cocos treats the class: a change needs a restart. */
export const DECORATOR_STATICS = ['_executeInEditMode', '_requireComponent', '_disallowMultiple', '_executionOrder', '_playOnFocus'];

/** Lifecycle methods the engine looks up once, when a component is enabled. */
export const SCHEDULED_LIFECYCLE = ['update', 'lateUpdate'];

export function isStub(fn: any): fn is HotStub {
    return typeof fn === 'function' && fn.__hrStub === true;
}

export function makeStub(name: string, impl: (...args: any[]) => any): HotStub {
    const stub = function (this: any) {
        // eslint-disable-next-line prefer-rest-params
        return (stub as HotStub).__hrImpl.apply(this, arguments as any);
    } as unknown as HotStub;
    stub.__hrImpl = impl;
    stub.__hrStub = true;
    try {
        Object.defineProperty(stub, 'name', { value: name, configurable: true });
    } catch (e) {
        // name is cosmetic
    }
    return stub;
}

function ownKeys(o: any): string[] {
    return Object.getOwnPropertyNames(o);
}

function descriptorOf(o: any, key: string): PropertyDescriptor | undefined {
    return Object.getOwnPropertyDescriptor(o, key);
}

/** A data property holding a function (a method), not an accessor. */
function isMethodDescriptor(d: PropertyDescriptor | undefined): d is PropertyDescriptor & { value: (...a: any[]) => any } {
    return !!d && 'value' in d && typeof d.value === 'function';
}

function isAccessor(d: PropertyDescriptor | undefined): boolean {
    return !!d && (typeof d.get === 'function' || typeof d.set === 'function');
}

function protoKeyAllowed(key: string): boolean {
    return !PROTO_SKIP[key] && !isInternalKey(key);
}

function staticKeyAllowed(key: string): boolean {
    return !STATIC_SKIP[key] && !isInternalKey(key);
}

/** True when the value is a class (an ES class or a function with its own prototype methods). */
export function isClassLike(v: any): boolean {
    if (typeof v !== 'function' || !v.prototype) return false;
    if (/^class[\s{]/.test(Function.prototype.toString.call(v))) return true;
    const p = v.prototype;
    return ownKeys(p).some((k) => k !== 'constructor') || Object.getPrototypeOf(p) !== Object.prototype;
}

/**
 * Replaces the class's own methods (prototype and static) by forwarding stubs.
 * Idempotent: methods that are stubs already are left alone. Returns how many were wrapped.
 */
export function instrument(C: any): number {
    if (typeof C !== 'function' || !C.prototype) return 0;
    let n = 0;
    const wrap = (target: any, key: string) => {
        const d = descriptorOf(target, key);
        if (!isMethodDescriptor(d) || isStub(d.value) || !d.configurable && !d.writable) return;
        const stub = makeStub(key, d.value);
        try {
            Object.defineProperty(target, key, { value: stub, writable: true, configurable: true, enumerable: !!d.enumerable });
            n++;
        } catch (e) {
            // frozen: left as is
        }
    };
    const proto = C.prototype;
    ownKeys(proto).forEach((k) => {
        if (protoKeyAllowed(k)) wrap(proto, k);
    });
    ownKeys(C).forEach((k) => {
        if (staticKeyAllowed(k)) wrap(C, k);
    });
    return n;
}

export interface PropInfo {
    /** Serialized property names (CCClass __props__), or null for a plain class. */
    props: string[] | null;
    /** Per property, a string describing its type (type / ctor / serializable attributes). */
    types: Record<string, string>;
}

export interface CompareOptions {
    /** Reads the CCClass property list and types of a class. */
    propInfo?: (C: any) => PropInfo;
    /** The running counterpart of a class of the new module (to accept a new base from the same module). */
    oldOf?: (newC: any) => any;
}

/** Reasons the swap is not enough (empty: hot swappable). */
export function compare(oldC: any, newC: any, opts: CompareOptions = {}): string[] {
    const reasons: string[] = [];
    const oldBase = Object.getPrototypeOf(oldC);
    let newBase = Object.getPrototypeOf(newC);
    if (opts.oldOf && newBase && opts.oldOf(newBase)) newBase = opts.oldOf(newBase);
    if (oldBase !== newBase) reasons.push('base class changed');
    if (opts.propInfo) {
        const a = opts.propInfo(oldC);
        const b = opts.propInfo(newC);
        const pa = a.props || [];
        const pb = b.props || [];
        pb.forEach((p) => {
            if (pa.indexOf(p) < 0) reasons.push("new @property '" + p + "'");
        });
        pa.forEach((p) => {
            if (pb.indexOf(p) < 0) reasons.push("removed @property '" + p + "'");
        });
        pb.forEach((p) => {
            if (pa.indexOf(p) >= 0 && (a.types[p] || '') !== (b.types[p] || '')) reasons.push("@property '" + p + "' changed type");
        });
    }
    DECORATOR_STATICS.forEach((k) => {
        const va = normalizeDecorator(k, oldC, oldC[k]);
        const vb = normalizeDecorator(k, newC, newC[k]);
        if (va !== vb) reasons.push('class decorator changed (' + k.replace(/^_/, '') + ')');
    });
    return reasons;
}

function normalizeDecorator(key: string, C: any, v: any): string {
    if (key === '_disallowMultiple') return v ? 'yes' : '';
    if (key === '_requireComponent') {
        const list = Array.isArray(v) ? v : v ? [v] : [];
        return list.map((x: any) => (x && (x.__classname__ || (x.prototype && x.prototype.__classname__) || x.name)) || String(x)).join(',');
    }
    if (v === undefined || v === null || v === false || v === 0 || v === '') return '';
    return String(v);
}

export interface ApplyResult {
    /** Methods whose code was replaced. */
    updated: string[];
    /** Methods that did not exist before. */
    added: string[];
    /** Methods of the running class missing from the new code (kept, except scheduled lifecycle ones). */
    removed: string[];
    /** Getters/setters replaced. */
    accessors: string[];
    /** Static members added to the running class. */
    staticsAdded: string[];
    /** Methods that were not stubs yet (instrumented late): callbacks taken before keep the old code. */
    late: string[];
    /** Scheduled lifecycle methods added or removed (the caller updates the engine's invokers). */
    lifecycleAdded: string[];
    lifecycleRemoved: string[];
}

function sameSource(a: any, b: any): boolean {
    try {
        return Function.prototype.toString.call(a) === Function.prototype.toString.call(b);
    } catch (e) {
        return false;
    }
}

/**
 * Moves the code of `newC` into the running class `oldC` (see the file header).
 * Never touches instance data, engine metadata or the class identity.
 */
export function applyClass(oldC: any, newC: any): ApplyResult {
    const r: ApplyResult = { updated: [], added: [], removed: [], accessors: [], staticsAdded: [], late: [], lifecycleAdded: [], lifecycleRemoved: [] };
    const swapMethods = (target: any, source: any, allowed: (k: string) => boolean, prefix: string, isProto: boolean) => {
        const newKeys = ownKeys(source).filter(allowed);
        newKeys.forEach((k) => {
            const nd = descriptorOf(source, k);
            const od = descriptorOf(target, k);
            if (isAccessor(nd)) {
                if (isProto || isAccessor(od) || !od) {
                    try {
                        Object.defineProperty(target, k, nd as PropertyDescriptor);
                        r.accessors.push(prefix + k);
                    } catch (e) {
                        // non-configurable: keep the old one
                    }
                }
                return;
            }
            if (!isMethodDescriptor(nd)) return; // data: handled by statics below / instance fields
            const fn = isStub(nd.value) ? nd.value.__hrImpl : nd.value;
            if (isMethodDescriptor(od)) {
                if (isStub(od.value)) {
                    if (!sameSource(od.value.__hrImpl, fn)) r.updated.push(prefix + k);
                    od.value.__hrImpl = fn;
                } else {
                    if (!sameSource(od.value, fn)) {
                        r.updated.push(prefix + k);
                        r.late.push(prefix + k);
                    }
                    Object.defineProperty(target, k, { value: makeStub(k, fn), writable: true, configurable: true, enumerable: !!od.enumerable });
                }
            } else if (!od) {
                Object.defineProperty(target, k, { value: makeStub(k, fn), writable: true, configurable: true, enumerable: false });
                r.added.push(prefix + k);
                if (isProto && SCHEDULED_LIFECYCLE.indexOf(k) >= 0) r.lifecycleAdded.push(k);
            }
        });
        ownKeys(target)
            .filter(allowed)
            .forEach((k) => {
                if (newKeys.indexOf(k) >= 0) return;
                const od = descriptorOf(target, k);
                if (!isMethodDescriptor(od)) return;
                if (isProto && SCHEDULED_LIFECYCLE.indexOf(k) >= 0) {
                    delete target[k];
                    r.lifecycleRemoved.push(k);
                }
                r.removed.push(prefix + k);
            });
    };
    swapMethods(oldC.prototype, newC.prototype, protoKeyAllowed, '', true);
    swapMethods(oldC, newC, staticKeyAllowed, 'static ', false);

    // static data: the running class keeps its values; new ones are added
    ownKeys(newC)
        .filter(staticKeyAllowed)
        .forEach((k) => {
            const nd = descriptorOf(newC, k);
            if (!nd || !('value' in nd) || typeof nd.value === 'function') return;
            if (!descriptorOf(oldC, k)) {
                try {
                    Object.defineProperty(oldC, k, { value: nd.value, writable: true, configurable: true, enumerable: !!nd.enumerable });
                    r.staticsAdded.push(k);
                } catch (e) {
                    // frozen class
                }
            }
        });
    shareWithRunningClass(oldC, newC);
    return r;
}

/**
 * The new module's own code still refers to its new class by name (`Player.instance`,
 * `x instanceof Player`, `getComponent(Player)`). Make that class a view of the running one:
 * its static data reads and writes the running class, and running instances pass `instanceof`.
 */
export function shareWithRunningClass(oldC: any, newC: any): void {
    ownKeys(oldC)
        .filter(staticKeyAllowed)
        .forEach((k) => {
            const od = descriptorOf(oldC, k);
            if (!od || !('value' in od) || typeof od.value === 'function') return;
            try {
                Object.defineProperty(newC, k, {
                    get: () => oldC[k],
                    set: (v: any) => {
                        oldC[k] = v;
                    },
                    configurable: true,
                    enumerable: !!od.enumerable,
                });
            } catch (e) {
                // non-configurable static
            }
        });
    try {
        const defaultHasInstance = Function.prototype[Symbol.hasInstance];
        Object.defineProperty(newC, Symbol.hasInstance, {
            value: (o: any) => defaultHasInstance.call(oldC, o) || defaultHasInstance.call(newC, o),
            configurable: true,
        });
    } catch (e) {
        // no Symbol.hasInstance: instanceof against the new class fails for old objects
    }
    // Cocos compares `comp.constructor === C` for "sealed" classes; force the instanceof path
    try {
        Object.defineProperty(newC, '_sealed', { value: false, writable: true, configurable: true });
    } catch (e) {
        // ignore
    }
}

/**
 * Gives live instances the fields the new code initializes but they lack.
 * `makeTemp()` returns a fresh instance of the new class (one per live instance, so
 * mutable defaults are not shared). Existing values are never overwritten.
 * Returns the field names that were added (to at least one instance).
 */
export function addMissingFields(instances: any[], makeTemp: () => any): string[] {
    const added: Record<string, boolean> = {};
    for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        let tmp: any;
        try {
            tmp = makeTemp();
        } catch (e) {
            return Object.keys(added);
        }
        if (!tmp) continue;
        const keys = Object.keys(tmp);
        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            if (key in inst) continue;
            try {
                inst[key] = tmp[key];
                added[key] = true;
            } catch (e) {
                // read-only
            }
        }
    }
    return Object.keys(added);
}

/** A class exported by a module namespace, with the name it is exported under. */
export interface ExportedClass {
    exportName: string;
    ctor: any;
}

export function exportedClasses(ns: any): ExportedClass[] {
    const out: ExportedClass[] = [];
    if (!ns) return out;
    const keys = Object.keys(ns);
    for (let i = 0; i < keys.length; i++) {
        let v: any;
        try {
            v = ns[keys[i]];
        } catch (e) {
            continue;
        }
        if (isClassLike(v) && !out.some((e) => e.ctor === v)) out.push({ exportName: keys[i], ctor: v });
    }
    return out;
}

export interface Pairing {
    pairs: { name: string; oldC: any; newC: any }[];
    /** Classes only in the new code. */
    added: ExportedClass[];
    /** Classes only in the running code. */
    missing: ExportedClass[];
}

/**
 * Matches the classes of the new module to the running ones: by @ccclass name
 * first (`className`), else by export name.
 */
export function pairClasses(oldList: ExportedClass[], newList: ExportedClass[], className: (C: any) => string): Pairing {
    const res: Pairing = { pairs: [], added: [], missing: [] };
    const used: any[] = [];
    newList.forEach((n) => {
        const cn = className(n.ctor);
        let match: ExportedClass | undefined;
        if (cn) match = oldList.filter((o) => used.indexOf(o.ctor) < 0 && className(o.ctor) === cn)[0];
        if (!match) match = oldList.filter((o) => used.indexOf(o.ctor) < 0 && o.exportName === n.exportName)[0];
        if (match) {
            used.push(match.ctor);
            res.pairs.push({ name: cn || n.exportName, oldC: match.ctor, newC: n.ctor });
        } else res.added.push(n);
    });
    oldList.forEach((o) => {
        if (used.indexOf(o.ctor) < 0) res.missing.push(o);
    });
    return res;
}

/** "3 methods updated, 1 added, 1 field added" style summary (empty when nothing changed). */
export function summarize(r: ApplyResult, fields: string[]): string {
    const parts: string[] = [];
    const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
    if (r.updated.length) parts.push(plural(r.updated.length, 'method updated', 'methods updated'));
    if (r.added.length) parts.push(plural(r.added.length, 'method added', 'methods added'));
    if (r.accessors.length) parts.push(plural(r.accessors.length, 'accessor updated', 'accessors updated'));
    if (r.staticsAdded.length) parts.push(plural(r.staticsAdded.length, 'static added', 'statics added'));
    if (fields.length) parts.push(plural(fields.length, 'field added', 'fields added') + ' (' + fields.join(', ') + ')');
    if (r.removed.length) parts.push('removed: ' + r.removed.join(', ') + (r.removed.some((k) => SCHEDULED_LIFECYCLE.indexOf(k) < 0) ? ' (kept for code that still calls it)' : ''));
    return parts.join(', ');
}
