/**
 * Undo through the editor's recording API: begin-recording snapshots the
 * nodes, end-recording turns the difference into one undo step.
 *
 * Edits made while a recording is being opened are held back until it is
 * open, so the snapshot always has the state from before the edit.
 */
import { notifyNodeChanged, repaint } from './env';

async function request(name: string, ...args: any[]): Promise<any> {
    return Editor.Message.request('scene', name as any, ...args);
}

export async function beginRecording(uuids: string[]): Promise<string | null> {
    if (!uuids.length) return null;
    try {
        const id = await request('begin-recording', uuids);
        return typeof id === 'string' && id ? id : null;
    } catch (e) {
        console.warn('[LineRenderer] begin-recording failed:', e);
        return null;
    }
}

export async function endRecording(id: string | null, cancel = false): Promise<void> {
    if (!id) return;
    try {
        await request(cancel ? 'cancel-recording' : 'end-recording', id);
    } catch (e) {
        console.warn('[LineRenderer] end-recording failed:', e);
    }
}

function nodesOf(comps: any[]): any[] {
    const set = new Set<any>();
    for (const c of comps) if (c && c.isValid && c.node && c.node.isValid) set.add(c.node);
    return [...set];
}

/** Rebuilds the lines and tells the editor the nodes changed. */
export function afterEdit(comps: any[]): void {
    for (const c of comps) {
        if (!c || !c.isValid) continue;
        try {
            c.markDirty?.();
            c.rebuild?.();
        } catch {
            // a failing rebuild must not break editing
        }
    }
    for (const n of nodesOf(comps)) notifyNodeChanged(n);
    repaint();
}

/** One undoable edit applied at once. */
export async function recordEdit(comps: any[], fn: () => void): Promise<void> {
    const id = await beginRecording(nodesOf(comps).map((n) => n.uuid));
    let ok = false;
    try {
        fn();
        ok = true;
    } finally {
        afterEdit(comps);
        await endRecording(id, !ok);
    }
}

const NOTIFY_MS = 120;

/**
 * An undoable edit spread over many updates (a drag). `apply` calls before
 * the recording is open are deferred; only the latest one runs.
 */
export class EditSession {
    private id: string | null = null;
    private opened = false;
    private ended = false;
    private pending: (() => void) | null = null;
    private changed = false;
    private notifiedAt = 0;
    private readonly ready: Promise<void>;

    constructor(private comps: any[]) {
        this.ready = beginRecording(nodesOf(comps).map((n) => n.uuid)).then((id) => {
            this.id = id;
            this.opened = true;
            if (this.pending && !this.ended) {
                const fn = this.pending;
                this.pending = null;
                this.run(fn);
            }
        });
    }

    /** Applies an edit (now, or as soon as the recording is open). */
    apply(fn: () => void): void {
        if (this.ended) return;
        if (!this.opened) {
            this.pending = fn;
            return;
        }
        this.run(fn);
    }

    private run(fn: () => void): void {
        fn();
        this.changed = true;
        for (const c of this.comps) {
            c.markDirty?.();
            c.rebuild?.();
        }
        const now = Date.now();
        if (now - this.notifiedAt > NOTIFY_MS) {
            this.notifiedAt = now;
            for (const n of nodesOf(this.comps)) notifyNodeChanged(n);
        }
        repaint();
    }

    async end(): Promise<void> {
        if (this.ended) return;
        this.ended = true;
        await this.ready;
        if (this.pending) {
            const fn = this.pending;
            this.pending = null;
            this.run(fn);
        }
        if (this.changed) afterEdit(this.comps);
        await endRecording(this.id, !this.changed);
    }
}
