/**
 * The panel's model, kept out of Vue's reactivity: every entry, the rows that pass
 * the filter (entry indices, or groups when Collapse is on), and the counters.
 * Appends are incremental; a filter or collapse change rebuilds the rows in one pass.
 */
import { Level, LEVELS, LogEntry, Source, SOURCES } from './types';

export interface Group {
    key: string;
    /** The first entry with this key (its text is shown). */
    first: LogEntry;
    /** The newest entry with this key (its time is shown). */
    last: LogEntry;
    count: number;
}

/** Entries that collapse together: same level, source, text and top of the stack. */
export function collapseKey(e: LogEntry): string {
    return e.level + '\u0001' + e.source + '\u0001' + e.text + '\u0001' + (e.stack ? e.stack.slice(0, 240) : '');
}

function zeroLevels(): Record<Level, number> {
    const o = {} as Record<Level, number>;
    for (let i = 0; i < LEVELS.length; i++) o[LEVELS[i]] = 0;
    return o;
}

function zeroSources(): Record<Source, number> {
    const o = {} as Record<Source, number>;
    for (let i = 0; i < SOURCES.length; i++) o[SOURCES[i]] = 0;
    return o;
}

export class LogStore {
    entries: LogEntry[] = [];
    groups: Group[] = [];
    private groupIndex = new Map<string, number>();
    /** Rows of the list: entry indices, or group indices when collapsed. */
    rows: number[] = [];
    collapse = false;
    capacity: number;
    /** Entry / group counts per level (all of them, like Unity: the filter does not change them). */
    levelCounts = zeroLevels();
    sourceCounts = zeroSources();
    tagCounts = new Map<string, number>();
    private pred: (e: LogEntry) => boolean = () => true;

    constructor(capacity = 50000) {
        this.capacity = capacity;
    }

    setPredicate(pred: (e: LogEntry) => boolean): void {
        this.pred = pred;
        this.rebuildRows();
    }

    setCollapse(on: boolean): void {
        if (this.collapse === on) return;
        this.collapse = on;
        this.recount();
        this.rebuildRows();
    }

    /** Number of rows that pass the filter. */
    get length(): number {
        return this.rows.length;
    }

    /** The entry a row shows (the first of its group when collapsed). */
    rowEntry(row: number): LogEntry | undefined {
        const i = this.rows[row];
        if (i === undefined) return undefined;
        return this.collapse ? this.groups[i] && this.groups[i].first : this.entries[i];
    }

    /** The newest entry of a row (differs from rowEntry only when collapsed). */
    rowLatest(row: number): LogEntry | undefined {
        const i = this.rows[row];
        if (i === undefined) return undefined;
        return this.collapse ? this.groups[i] && this.groups[i].last : this.entries[i];
    }

    rowCount(row: number): number {
        if (!this.collapse) return 1;
        const g = this.groups[this.rows[row]];
        return g ? g.count : 0;
    }

    /** A stable key for a row (selection survives appends and filter changes). */
    rowKey(row: number): string {
        const i = this.rows[row];
        if (i === undefined) return '';
        return this.collapse ? 'g:' + this.groups[i].key : 'e:' + this.entries[i].id;
    }

    /** Row index of a key, or -1. */
    findRow(key: string): number {
        if (!key) return -1;
        if (key.startsWith('e:')) {
            if (this.collapse) return -1;
            const id = Number(key.slice(2));
            const ei = this.indexOfId(id);
            if (ei < 0) return -1;
            return binarySearch(this.rows, ei);
        }
        if (!this.collapse) return -1;
        const gi = this.groupIndex.get(key.slice(2));
        if (gi === undefined) return -1;
        return binarySearch(this.rows, gi);
    }

    /** Index of an entry id (ids increase), or -1. */
    indexOfId(id: number): number {
        let lo = 0;
        let hi = this.entries.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const v = this.entries[mid].id;
            if (v === id) return mid;
            if (v < id) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }

    /**
     * Appends a batch. Returns 'append' when rows were only added at the end (or counts changed),
     * 'rebuild' when old rows moved (history trimmed past the capacity).
     */
    add(batch: LogEntry[]): 'append' | 'rebuild' {
        for (let i = 0; i < batch.length; i++) this.addOne(batch[i]);
        if (this.entries.length > this.capacity * 1.1 + 100) {
            this.entries = this.entries.slice(this.entries.length - this.capacity);
            this.regroup();
            this.recount();
            this.rebuildRows();
            return 'rebuild';
        }
        return 'append';
    }

    private addOne(e: LogEntry): void {
        const index = this.entries.length;
        this.entries.push(e);
        this.sourceCounts[e.source] = (this.sourceCounts[e.source] || 0) + 1;
        this.tagCounts.set(e.tag, (this.tagCounts.get(e.tag) || 0) + 1);
        const key = collapseKey(e);
        let gi = this.groupIndex.get(key);
        if (gi === undefined) {
            gi = this.groups.length;
            this.groups.push({ key, first: e, last: e, count: 1 });
            this.groupIndex.set(key, gi);
            if (this.collapse) {
                this.levelCounts[e.level]++;
                if (this.pred(e)) this.rows.push(gi);
            }
        } else {
            const g = this.groups[gi];
            g.count++;
            g.last = e;
        }
        if (!this.collapse) {
            this.levelCounts[e.level]++;
            if (this.pred(e)) this.rows.push(index);
        }
    }

    clear(): void {
        this.entries = [];
        this.groups = [];
        this.groupIndex.clear();
        this.rows = [];
        this.levelCounts = zeroLevels();
        this.sourceCounts = zeroSources();
        this.tagCounts = new Map();
    }

    /** Replaces everything (history from the main process). */
    reset(entries: LogEntry[]): void {
        this.clear();
        this.add(entries);
    }

    /** Changes the source of entries (the scene script confirmed it). Returns true when rows must be rebuilt. */
    retag(changes: { id: number; source: Source }[]): boolean {
        let changed = false;
        for (let i = 0; i < changes.length; i++) {
            const ei = this.indexOfId(changes[i].id);
            if (ei < 0) continue;
            const e = this.entries[ei];
            if (e.source === changes[i].source) {
                e.sure = true;
                continue;
            }
            this.sourceCounts[e.source]--;
            e.source = changes[i].source;
            e.sure = true;
            this.sourceCounts[e.source] = (this.sourceCounts[e.source] || 0) + 1;
            changed = true;
        }
        if (changed) {
            this.regroup();
            this.recount();
            this.rebuildRows();
        }
        return changed;
    }

    private regroup(): void {
        this.groups = [];
        this.groupIndex.clear();
        this.sourceCounts = zeroSources();
        this.tagCounts = new Map();
        for (let i = 0; i < this.entries.length; i++) {
            const e = this.entries[i];
            this.sourceCounts[e.source] = (this.sourceCounts[e.source] || 0) + 1;
            this.tagCounts.set(e.tag, (this.tagCounts.get(e.tag) || 0) + 1);
            const key = collapseKey(e);
            const gi = this.groupIndex.get(key);
            if (gi === undefined) {
                this.groupIndex.set(key, this.groups.length);
                this.groups.push({ key, first: e, last: e, count: 1 });
            } else {
                this.groups[gi].count++;
                this.groups[gi].last = e;
            }
        }
    }

    private recount(): void {
        this.levelCounts = zeroLevels();
        if (this.collapse) for (let i = 0; i < this.groups.length; i++) this.levelCounts[this.groups[i].first.level]++;
        else for (let i = 0; i < this.entries.length; i++) this.levelCounts[this.entries[i].level]++;
    }

    rebuildRows(): void {
        const rows: number[] = [];
        const pred = this.pred;
        if (this.collapse) {
            for (let i = 0; i < this.groups.length; i++) if (pred(this.groups[i].first)) rows.push(i);
        } else {
            const list = this.entries;
            for (let i = 0; i < list.length; i++) if (pred(list[i])) rows.push(i);
        }
        this.rows = rows;
    }
}

function binarySearch(sorted: number[], v: number): number {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] === v) return mid;
        if (sorted[mid] < v) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}
