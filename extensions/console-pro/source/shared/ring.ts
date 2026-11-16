/**
 * Fixed-capacity ring buffer: the main process keeps the last N lines here so the
 * panel can be closed, reloaded or opened late without losing history.
 */
export class RingBuffer<T> {
    private buf: (T | undefined)[];
    private start = 0;
    private count = 0;

    constructor(private cap: number) {
        this.cap = Math.max(1, Math.floor(cap));
        this.buf = new Array(this.cap);
    }

    get capacity(): number {
        return this.cap;
    }

    get size(): number {
        return this.count;
    }

    push(item: T): void {
        if (this.count < this.cap) {
            this.buf[(this.start + this.count) % this.cap] = item;
            this.count++;
        } else {
            this.buf[this.start] = item;
            this.start = (this.start + 1) % this.cap;
        }
    }

    /** i = 0 is the oldest item. */
    get(i: number): T | undefined {
        if (i < 0 || i >= this.count) return undefined;
        return this.buf[(this.start + i) % this.cap];
    }

    /** The newest items first, walking back while `fn` returns true. */
    forEachNewest(fn: (item: T) => boolean): void {
        for (let i = this.count - 1; i >= 0; i--) if (!fn(this.buf[(this.start + i) % this.cap] as T)) return;
    }

    toArray(): T[] {
        const out: T[] = new Array(this.count);
        for (let i = 0; i < this.count; i++) out[i] = this.buf[(this.start + i) % this.cap] as T;
        return out;
    }

    clear(): void {
        this.buf = new Array(this.cap);
        this.start = 0;
        this.count = 0;
    }

    /** Changes the capacity, keeping the newest items. */
    resize(cap: number): void {
        const items = this.toArray();
        this.cap = Math.max(1, Math.floor(cap));
        this.clear();
        const from = Math.max(0, items.length - this.cap);
        for (let i = from; i < items.length; i++) this.push(items[i]);
    }

    /** Removes the items for which `fn` returns false (keeps order). */
    filter(fn: (item: T) => boolean): void {
        const items = this.toArray();
        this.clear();
        for (let i = 0; i < items.length; i++) if (fn(items[i])) this.push(items[i]);
    }
}
