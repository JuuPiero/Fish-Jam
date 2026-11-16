/**
 * Receives every line Cocos' Console receives.
 *
 * Cocos' log hub is `@base/electron-logger` in the main process: it patches the main
 * process console, every renderer (panels, the scene webview, the PIE webview) sends
 * its console calls to it over IPC, and it keeps them in one list (`Editor.Logger.query()`)
 * and emits "record" / "clear". We read that list:
 * 1. `Editor.Logger.__protected__.on('record' | 'clear')` (protected editor API) for immediate lines;
 * 2. a watchdog that reads `Editor.Logger.query()` (public API) and picks up whatever the
 *    event did not deliver; if the event never fires, this poll becomes the only path.
 */
import { LogEntry, SceneBatch, Source } from '../shared/types';
import { detectTag, guessSource, headMatches, toLevel } from '../shared/tags';

/** A Logger record: { type, message, stack, time, process }. */
export interface LoggerRecord {
    type?: string;
    message?: any;
    stack?: any;
    time?: number;
    date?: number;
    process?: string;
}

export function fingerprint(r: LoggerRecord | undefined): string {
    if (!r) return '';
    return String(r.time || r.date || 0) + '|' + String(r.type || '') + '|' + String(r.message === undefined ? '' : r.message).slice(0, 200);
}

/** A Logger record as an entry (the id is set by the caller). */
export function toEntry(r: LoggerRecord, id: number): LogEntry {
    const text = typeof r.message === 'string' ? r.message : r.message === undefined || r.message === null ? '' : safeString(r.message);
    const stack = typeof r.stack === 'string' ? r.stack : r.stack ? safeString(r.stack) : '';
    let t = Number(r.time || r.date || 0);
    if (!t || !isFinite(t)) t = Date.now();
    else if (t < 1e11) t *= 1000; // seconds
    const level = toLevel(r.type || 'log');
    const e: LogEntry = { id, t, level, text, stack, source: guessSource(r.process, text, stack), tag: detectTag(text) };
    if (r.process) e.process = String(r.process);
    return e;
}

function safeString(v: any): string {
    try {
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
    } catch (e) {
        return String(v);
    }
}

export interface LoggerApi {
    query(): LoggerRecord[];
    /** Subscribe to Logger events; null when the protected API is missing. */
    on?: (action: string, fn: (...a: any[]) => void) => void;
    off?: (action: string, fn: (...a: any[]) => void) => void;
}

/**
 * Follows the Logger list. `onRecords` gets new records in order, `onClear` when Cocos' list
 * was cleared (Cocos' Clear button / its Clear on Play).
 */
export class LoggerFollower {
    mode: 'event' | 'poll' | 'none' = 'none';
    private seen = 0;
    private lastFp = '';
    private timer: any = null;
    private handlers: { action: string; fn: (...a: any[]) => void }[] = [];

    constructor(private api: LoggerApi, private onRecords: (r: LoggerRecord[]) => void, private onClear: () => void) {}

    /** Records already in the list (history before this extension loaded). */
    start(): LoggerRecord[] {
        const list = this.safeQuery();
        this.seen = list.length;
        this.lastFp = fingerprint(list[list.length - 1]);
        let evented = false;
        if (this.api.on) {
            try {
                const rec = (r: LoggerRecord) => this.onEvent(r);
                const clr = () => this.onClearEvent();
                this.api.on('record', rec);
                this.api.on('clear', clr);
                this.handlers.push({ action: 'record', fn: rec }, { action: 'clear', fn: clr });
                evented = true;
            } catch (e) {
                evented = false;
            }
        }
        this.mode = evented ? 'event' : 'poll';
        this.timer = setInterval(() => this.tick(), evented ? 1000 : 150);
        return list.slice();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.api.off) {
            for (let i = 0; i < this.handlers.length; i++) {
                try {
                    this.api.off(this.handlers[i].action, this.handlers[i].fn);
                } catch (e) {
                    // already gone
                }
            }
        }
        this.handlers = [];
    }

    private safeQuery(): LoggerRecord[] {
        try {
            const l = this.api.query();
            return Array.isArray(l) ? l : [];
        } catch (e) {
            return [];
        }
    }

    private onEvent(r: LoggerRecord): void {
        this.seen++;
        this.lastFp = fingerprint(r);
        this.onRecords([r]);
    }

    private onClearEvent(): void {
        this.seen = 0;
        this.lastFp = '';
        this.onClear();
    }

    /** Picks up records the event did not deliver (or every record, in poll mode). */
    tick(): void {
        const list = this.safeQuery();
        const n = list.length;
        if (n === 0) {
            if (this.seen > 0) {
                this.seen = 0;
                this.lastFp = '';
            }
            return;
        }
        let from = this.seen;
        if (from > n || (from > 0 && fingerprint(list[from - 1]) !== this.lastFp)) {
            // the list was cleared or trimmed: find the last record we know from the end
            from = 0;
            if (this.lastFp) {
                for (let i = n - 1; i >= 0; i--) {
                    if (fingerprint(list[i]) === this.lastFp) {
                        from = i + 1;
                        break;
                    }
                }
            }
        }
        if (from < n) {
            const fresh = list.slice(from);
            if (this.mode === 'event' && fresh.length) {
                // the event missed these: from now on, poll quickly
                this.mode = 'poll';
                if (this.timer) clearInterval(this.timer);
                this.timer = setInterval(() => this.tick(), 150);
            }
            this.seen = n;
            this.lastFp = fingerprint(list[n - 1]);
            this.onRecords(fresh);
        } else {
            this.seen = n;
        }
    }
}

interface PendingCall {
    source: 'scene' | 'game';
    level: string;
    head: string;
    t: number;
    at: number;
}

/**
 * Pairs Logger records from renderers with the console calls the scene script saw in the
 * scene / PIE processes, so those lines get a confirmed source (scene or game) instead of a guess.
 */
export class SourceTagger {
    /** Renderer entries not confirmed yet (newest last). */
    private open: LogEntry[] = [];
    private pending: PendingCall[] = [];

    constructor(private now: () => number = Date.now) {}

    /** A new entry: confirmed from an earlier call when one matches. */
    onEntry(e: LogEntry): void {
        if (e.process && e.process !== 'renderer') return;
        if (e.source === 'main') return;
        this.expire();
        for (let i = 0; i < this.pending.length; i++) {
            const c = this.pending[i];
            if (c.level === e.level && this.matches(e, c)) {
                e.source = c.source;
                e.sure = true;
                this.pending.splice(i, 1);
                return;
            }
        }
        this.open.push(e);
        if (this.open.length > 2000) this.open.splice(0, this.open.length - 2000);
    }

    private matches(e: LogEntry, c: { head: string; t: number }): boolean {
        if (Math.abs(e.t - c.t) > (c.head ? 3000 : 400)) return false;
        return headMatches(e.text, c.head);
    }

    /** Console calls seen by a scene script; returns the entries whose source changed. */
    onCalls(batch: SceneBatch): { id: number; source: Source }[] {
        const changed: { id: number; source: Source }[] = [];
        const calls = batch.calls || [];
        this.expire();
        for (let k = 0; k < calls.length; k++) {
            const c = calls[k];
            let hit = -1;
            for (let i = 0; i < this.open.length; i++) {
                const e = this.open[i];
                if (e.level === c.level && this.matches(e, c)) {
                    hit = i;
                    break;
                }
            }
            if (hit >= 0) {
                const e = this.open[hit];
                this.open.splice(hit, 1);
                e.sure = true;
                if (e.source !== batch.source) {
                    e.source = batch.source;
                    changed.push({ id: e.id, source: e.source });
                }
            } else {
                this.pending.push({ source: batch.source, level: c.level, head: c.head, t: c.t, at: this.now() });
            }
        }
        if (this.pending.length > 2000) this.pending.splice(0, this.pending.length - 2000);
        return changed;
    }

    private expire(): void {
        const now = this.now();
        while (this.pending.length && now - this.pending[0].at > 1500) this.pending.shift();
        while (this.open.length && now - this.open[0].t > 5000) this.open.shift();
    }

    clear(): void {
        this.open = [];
        this.pending = [];
    }
}
