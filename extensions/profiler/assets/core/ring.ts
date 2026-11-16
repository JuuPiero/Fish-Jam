/** A fixed-size buffer keeping the newest items (the editor keeps ~300 frames). Pure. */
export class RingBuffer<T> {
    private items: (T | undefined)[];
    private head = 0;
    private size = 0;

    constructor(readonly capacity: number) {
        this.items = new Array(Math.max(1, capacity));
    }

    get length(): number {
        return this.size;
    }

    push(item: T): void {
        this.items[(this.head + this.size) % this.capacity] = item;
        if (this.size < this.capacity) this.size++;
        else this.head = (this.head + 1) % this.capacity;
    }

    /** i = 0 is the oldest kept item. */
    get(i: number): T | undefined {
        if (i < 0 || i >= this.size) return undefined;
        return this.items[(this.head + i) % this.capacity];
    }

    last(): T | undefined {
        return this.size ? this.get(this.size - 1) : undefined;
    }

    toArray(): T[] {
        const out: T[] = [];
        for (let i = 0; i < this.size; i++) out.push(this.get(i)!);
        return out;
    }

    clear(): void {
        this.items = new Array(this.capacity);
        this.head = 0;
        this.size = 0;
    }
}
