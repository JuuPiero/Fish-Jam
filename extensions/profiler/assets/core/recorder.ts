/**
 * Records the samples of each frame (Unity's Profiler.BeginSample /
 * EndSample): a stack of open samples, flattened depth-first into numbers.
 * Pure: the clock is passed in, so it is tested in node.
 */
import { FrameData, SAMPLE_STRIDE } from './protocol';

/** Sample names <-> ids; new names are reported once, with the next batch. */
export class NameTable {
    private ids = new Map<string, number>();
    private fresh: Record<number, string> | null = null;

    id(name: string): number {
        let id = this.ids.get(name);
        if (id === undefined) {
            id = this.ids.size;
            this.ids.set(name, id);
            if (!this.fresh) this.fresh = {};
            this.fresh[id] = name;
        }
        return id;
    }

    /** Names added since the last call (null when none). */
    takeNew(): Record<number, string> | null {
        const f = this.fresh;
        this.fresh = null;
        return f;
    }

    /** Everything again (after a reconnect). */
    resendAll(): void {
        const all: Record<number, string> = {};
        this.ids.forEach((id, name) => (all[id] = name));
        this.fresh = all;
    }
}

/** Name of the synthetic sample holding work done between two frames (input events on the web). */
export const BETWEEN_FRAMES = 'Between Frames';
/** Samples per frame are capped (a runaway loop of beginSample calls). */
export const MAX_SAMPLES = 8000;

interface OpenFrame {
    index: number;
    start: number;
    samples: number[];
    stack: number[];
    end: number;
}

export class FrameRecorder {
    readonly names = new NameTable();
    /** Samples outside a frame are kept for the next one. */
    private loose: { name: number; start: number; dur: number; depth: number }[] = [];
    private looseStack: { name: number; start: number; depth: number }[] = [];
    private frame: OpenFrame | null = null;
    /** Finished frame waiting for the next start (to know its full length). */
    private ended: OpenFrame | null = null;
    private done: FrameData[] = [];
    /** Counters for the frame that just ended (set by the runtime before beginFrame). */
    private extra: Partial<FrameData> | null = null;
    private overflowWarned = false;

    constructor(private now: () => number) {}

    get inFrame(): boolean {
        return this.frame !== null;
    }

    /** Starts a frame; the previous one gets its full length. */
    beginFrame(index: number): void {
        const t = this.now();
        if (this.frame) this.endFrame();
        this.finish(t);
        const f: OpenFrame = { index, start: t, samples: [], stack: [], end: t };
        this.frame = f;
        this.adoptLoose(f);
    }

    /** Ends the frame's work (open samples are closed). */
    endFrame(): void {
        const f = this.frame;
        if (!f) return;
        const t = this.now();
        while (f.stack.length) this.close(f, f.stack.pop()!, t);
        f.end = t;
        this.ended = f;
        this.frame = null;
    }

    /** Extra data (render / memory counters) for the frame that ended last. */
    attach(extra: Partial<FrameData>): void {
        this.extra = Object.assign(this.extra || {}, extra);
    }

    begin(name: string): void {
        const id = this.names.id(name);
        const t = this.now();
        const f = this.frame;
        if (!f) {
            this.looseStack.push({ name: id, start: t, depth: this.looseStack.length });
            return;
        }
        if (f.samples.length >= MAX_SAMPLES * SAMPLE_STRIDE) {
            f.stack.push(-1);
            if (!this.overflowWarned) {
                this.overflowWarned = true;
                console.warn('[Profiler] More than ' + MAX_SAMPLES + ' samples in a frame: the rest are dropped.');
            }
            return;
        }
        const parent = f.stack.length ? f.stack[f.stack.length - 1] : -1;
        const at = f.samples.length / SAMPLE_STRIDE;
        f.samples.push(id, parent, t - f.start, -1);
        f.stack.push(at);
    }

    /** Ends the innermost open sample. Extra ends are ignored. */
    end(): void {
        const t = this.now();
        const f = this.frame;
        if (!f) {
            const s = this.looseStack.pop();
            if (s) this.loose.push({ name: s.name, start: s.start, dur: t - s.start, depth: s.depth });
            return;
        }
        if (!f.stack.length) return;
        this.close(f, f.stack.pop()!, t);
    }

    /** Frames finished since the last call. */
    take(): FrameData[] {
        const d = this.done;
        this.done = [];
        return d;
    }

    /** Drops everything (recording turned off). */
    reset(): void {
        this.frame = null;
        this.ended = null;
        this.done = [];
        this.loose = [];
        this.looseStack = [];
        this.extra = null;
    }

    private close(f: OpenFrame, at: number, t: number): void {
        if (at < 0) return;
        const k = at * SAMPLE_STRIDE;
        f.samples[k + 3] = t - f.start - f.samples[k + 2];
    }

    private finish(nextStart: number): void {
        const f = this.ended;
        if (!f) return;
        this.ended = null;
        const data: FrameData = { index: f.index, time: f.start, frameMs: nextStart - f.start, cpuMs: f.end - f.start, samples: f.samples };
        if (this.extra) {
            Object.assign(data, this.extra);
            this.extra = null;
        }
        this.done.push(data);
    }

    /** Samples taken between frames go under a "Between Frames" sample at the start of the next frame. */
    private adoptLoose(f: OpenFrame): void {
        // samples still open between frames are cut at the frame start
        while (this.looseStack.length) {
            const s = this.looseStack.pop()!;
            this.loose.push({ name: s.name, start: s.start, dur: f.start - s.start, depth: s.depth });
        }
        if (!this.loose.length) return;
        // loose samples were pushed when they ended (children before parents): order by start, parents first
        const list = this.loose.sort((a, b) => a.start - b.start || a.depth - b.depth);
        this.loose = [];
        let first = Infinity;
        let total = 0;
        for (let i = 0; i < list.length; i++) {
            first = Math.min(first, list[i].start);
            if (list[i].depth === 0) total += list[i].dur;
        }
        const root = 0;
        f.samples.push(this.names.id(BETWEEN_FRAMES), -1, first - f.start, total);
        const parents: number[] = [root];
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            const at = f.samples.length / SAMPLE_STRIDE;
            parents.length = s.depth + 1;
            f.samples.push(s.name, parents[s.depth], s.start - f.start, s.dur);
            parents[s.depth + 1] = at;
        }
    }
}
