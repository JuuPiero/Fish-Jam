/**
 * Runtime helpers for TypeScript generated from C# scripts (extensions/csharp).
 * Imported by generated files as `import { __cs } from 'db://csharp/cs-runtime'`.
 * Written for Cocos' loose ES5 builds: only arrays are iterated with for..of.
 */

function multicast(list: Function[]): any {
    const f: any = function (this: any) {
        let r: any;
        const args = arguments;
        for (let i = 0; i < list.length; i++) r = list[i].apply(this, args);
        return r;
    };
    f.__csList = list;
    return f;
}

function listOf(d: any): Function[] {
    return d && d.__csList ? d.__csList : [d];
}

function num(v: any): number {
    return typeof v === 'number' ? v : Number(v);
}

export const __cs = {
    /**
     * `obj.method` used as a value: a function bound to obj, the same function every time
     * (so `node.off(type, method, this)` finds what `node.on` registered).
     */
    bind(obj: any, name: string): any {
        if (obj == null) return undefined;
        let cache = obj.__csBound as { [name: string]: Function } | undefined;
        if (!cache) {
            cache = {};
            Object.defineProperty(obj, '__csBound', { value: cache, enumerable: false, configurable: true, writable: true });
        }
        let f = cache[name];
        if (!f) {
            f = cache[name] = function (this: any) {
                return obj[name].apply(obj, arguments);
            };
        }
        return f;
    },

    /**
     * `obj.method(a, b, ...array)` without spread syntax (Cocos' loose build turns spread into
     * concat/apply, which loses data on non-arrays): the receiver is evaluated once.
     */
    invoke(obj: any, name: string, args: any[]): any {
        return obj[name].apply(obj, args);
    },

    /** `a += b` on delegates and events. */
    combine(a: any, b: any): any {
        if (!a) return b;
        if (!b) return a;
        return multicast(listOf(a).concat(listOf(b)));
    },

    /** `a -= b` on delegates and events: removes the last occurrence, like C#. */
    remove(a: any, b: any): any {
        if (!a || !b) return a;
        const list = listOf(a).slice();
        const rem = listOf(b);
        for (let i = rem.length - 1; i >= 0; i--) {
            const at = list.lastIndexOf(rem[i]);
            if (at >= 0) list.splice(at, 1);
        }
        if (!list.length) return null;
        return list.length === 1 ? list[0] : multicast(list);
    },

    throw_(e: any): never {
        throw e;
    },

    /** Task.Delay(ms) */
    delay(ms: number): Promise<void> {
        return new Promise<void>((resolve) => setTimeout(resolve, ms));
    },

    /** new TaskCompletionSource<T>(): a promise resolved from outside (SetResult -> resolve). */
    tcs<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: any) => void } {
        let resolve: (value: T) => void = null as any;
        let reject: (error: any) => void = null as any;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    },

    // ---- lists
    listRemove<T>(list: T[], item: T): boolean {
        const i = list.indexOf(item);
        if (i < 0) return false;
        list.splice(i, 1);
        return true;
    },
    removeAll<T>(list: T[], pred: (x: T) => boolean): number {
        let w = 0;
        const n = list.length;
        for (let r = 0; r < n; r++) if (!pred(list[r])) list[w++] = list[r];
        list.length = w;
        return n - w;
    },
    findLast<T>(list: T[], pred: (x: T) => boolean): T {
        for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) return list[i];
        return null as any;
    },

    // ---- dictionaries and sets
    getOr<K, V>(map: Map<K, V>, key: K, def: V): V {
        return map.has(key) ? (map.get(key) as V) : def;
    },
    tryAdd<K, V>(map: Map<K, V>, key: K, value: V): boolean {
        if (map.has(key)) return false;
        map.set(key, value);
        return true;
    },
    containsValue<K, V>(map: Map<K, V>, value: V): boolean {
        let found = false;
        map.forEach((v) => {
            if (v === value) found = true;
        });
        return found;
    },
    setAdd<T>(set: Set<T>, value: T): boolean {
        if (set.has(value)) return false;
        set.add(value);
        return true;
    },
    unionWith<T>(set: Set<T>, items: T[] | Set<T>): void {
        const arr = Array.isArray(items) ? items : Array.from(items);
        for (const x of arr) set.add(x);
    },

    // ---- LINQ subset (eager, on arrays)
    first<T>(arr: T[], pred?: (x: T) => boolean): T {
        for (const x of arr) if (!pred || pred(x)) return x;
        throw new Error('Sequence contains no matching element');
    },
    firstOrDefault<T>(arr: T[], pred?: (x: T) => boolean): T {
        for (const x of arr) if (!pred || pred(x)) return x;
        return null as any;
    },
    last<T>(arr: T[], pred?: (x: T) => boolean): T {
        for (let i = arr.length - 1; i >= 0; i--) if (!pred || pred(arr[i])) return arr[i];
        throw new Error('Sequence contains no matching element');
    },
    lastOrDefault<T>(arr: T[], pred?: (x: T) => boolean): T {
        for (let i = arr.length - 1; i >= 0; i--) if (!pred || pred(arr[i])) return arr[i];
        return null as any;
    },
    sum<T>(arr: T[], sel?: (x: T) => number): number {
        let s = 0;
        for (const x of arr) s += sel ? sel(x) : num(x);
        return s;
    },
    average<T>(arr: T[], sel?: (x: T) => number): number {
        if (!arr.length) throw new Error('Sequence contains no elements');
        return __cs.sum(arr, sel) / arr.length;
    },
    min<T>(arr: T[], sel?: (x: T) => number): number {
        if (!arr.length) throw new Error('Sequence contains no elements');
        let m = Infinity;
        for (const x of arr) m = Math.min(m, sel ? sel(x) : num(x));
        return m;
    },
    max<T>(arr: T[], sel?: (x: T) => number): number {
        if (!arr.length) throw new Error('Sequence contains no elements');
        let m = -Infinity;
        for (const x of arr) m = Math.max(m, sel ? sel(x) : num(x));
        return m;
    },
    /** OrderBy / OrderByDescending: a stable sorted copy. */
    orderBy<T>(arr: T[], key: (x: T) => any, descending: boolean): T[] {
        const indexed = arr.map((x, i) => ({ x, i, k: key(x) }));
        indexed.sort((a, b) => {
            const c = __cs.compare(a.k, b.k);
            return c !== 0 ? (descending ? -c : c) : a.i - b.i;
        });
        return indexed.map((e) => e.x);
    },
    toDictionary<T, K, V>(arr: T[], key: (x: T) => K, value?: (x: T) => V): Map<K, V> {
        const m = new Map<K, V>();
        for (const x of arr) m.set(key(x), value ? value(x) : (x as any));
        return m;
    },
    selectMany<T, R>(arr: T[], sel: (x: T) => R[]): R[] {
        const out: R[] = [];
        for (const x of arr) for (const y of sel(x)) out.push(y);
        return out;
    },

    // ---- strings and numbers
    compare(a: any, b: any): number {
        if (a === b) return 0;
        if (a == null) return -1;
        if (b == null) return 1;
        if (typeof a.compareTo === 'function') return a.compareTo(b);
        return a < b ? -1 : a > b ? 1 : 0;
    },
    padLeft(s: string, width: number, ch?: string): string {
        s = String(s);
        const c = ch || ' ';
        while (s.length < width) s = c + s;
        return s;
    },
    padRight(s: string, width: number, ch?: string): string {
        s = String(s);
        const c = ch || ' ';
        while (s.length < width) s = s + c;
        return s;
    },
    isBlank(s: string): boolean {
        return s == null || String(s).trim() === '';
    },
    /**
     * string.Format with {0}, {1:F2}..., the arguments after fmt. Kept for scripts generated
     * before formatv; reads `arguments` instead of a rest parameter (no `...` in shipped code).
     */
    format(fmt: string, _a0?: any, _a1?: any, _a2?: any, _a3?: any, _a4?: any, _a5?: any, _a6?: any, _a7?: any): string {
        return __cs.formatv(fmt, Array.prototype.slice.call(arguments, 1));
    },
    /** string.Format with the arguments in an array (a C# array passed to `params object[]`). */
    formatv(fmt: string, args: any[]): string {
        return String(fmt).replace(/\{(\d+)(?::([^}]+))?\}/g, (_m: string, i: string, f: string) => {
            const v = args[Number(i)];
            if (f && typeof v === 'number') {
                const fx = /^[FfNn](\d*)$/.exec(f);
                if (fx) return v.toFixed(fx[1] === '' ? 2 : Number(fx[1]));
            }
            return String(v);
        });
    },
    round(x: number, digits: number): number {
        const p = Math.pow(10, digits);
        return Math.round(x * p) / p;
    },
    /** int.Parse / TryParse: NaN when the text is not an integer. */
    parseInt(s: string): number {
        return /^\s*[-+]?\d+\s*$/.test(String(s)) ? parseInt(String(s), 10) : NaN;
    },
    /** float/double.Parse / TryParse: NaN when the text is not a number. */
    parseFloat(s: string): number {
        return /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(String(s)) ? parseFloat(String(s)) : NaN;
    },

    /** IEnumerator.MoveNext() on a JavaScript iterator (a generator): steps it, keeps the value for Current. */
    moveNext(it: any): boolean {
        const r = it.next();
        it.__csCurrent = r.done ? undefined : r.value;
        return !r.done;
    },
    /** IEnumerator.Current: the value of the last MoveNext(). */
    current(it: any): any {
        return it.__csCurrent;
    },
    /** IEnumerator<T>.Dispose(): ends the iterator, running its finally blocks. */
    dispose(it: any): void {
        if (it && typeof it.return === 'function') it.return(undefined);
    },
};
