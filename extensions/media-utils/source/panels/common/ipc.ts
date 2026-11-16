/**
 * Panel-side IPC helpers. Editor IPC structured-clones its arguments, and a
 * Vue reactive Proxy cannot be cloned, so every argument goes through plain()
 * first (JSON copy for objects; typed arrays and ArrayBuffers pass as is).
 */
const PKG = 'media-utils';

export function plain<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
    return JSON.parse(JSON.stringify(value));
}

export function call<T = any>(message: string, ...args: any[]): Promise<T> {
    return (Editor.Message.request as any)(PKG, message, ...args.map(plain));
}

/** Binary data back from the main process, whatever form IPC delivered it in. */
export function toBytes(x: any): Uint8Array {
    if (!x) return new Uint8Array(0);
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (x.type === 'Buffer' && Array.isArray(x.data)) return new Uint8Array(x.data);
    if (typeof x === 'string') {
        const bin = atob(x);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    if (typeof x.length === 'number') return Uint8Array.from(x as ArrayLike<number>);
    throw new Error('Expected binary data.');
}

/** An ArrayBuffer holding exactly these bytes (copies when the view is partial). */
export function exactBuffer(bytes: Uint8Array): ArrayBuffer {
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer as ArrayBuffer;
    return bytes.slice().buffer as ArrayBuffer;
}

export function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export function formatBytes(n: number): string {
    if (!isFinite(n)) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export function baseName(p: string): string {
    return String(p || '').split(/[\\/]/).pop() || '';
}

/** Uuids / paths from a drag coming from the Assets panel or the OS (deduplicated). */
export function dropItems(event: DragEvent): string[] {
    const found: string[] = [];
    const seen = new Set<string>();
    const add = (v: any) => {
        if (typeof v !== 'string') return;
        const s = v.trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        found.push(s);
    };
    const dt = event.dataTransfer;
    if (!dt) return found;
    for (const f of Array.from(dt.files || [])) add((f as any).path);
    try {
        const extra = JSON.parse(dt.getData('additional') || '[]');
        if (Array.isArray(extra)) for (const e of extra) add(e && e.value);
    } catch (e) {
        // not an Assets panel drag
    }
    const value = dt.getData('value');
    if (value) value.split(',').forEach(add);
    return found;
}
