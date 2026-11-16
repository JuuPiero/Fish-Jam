/**
 * The edited audio "project": sample data plus markers and a loop region, and a
 * multi-level undo/redo history.
 *
 * Every edit is a splice: "replace frames [start, end) with these frames".
 * Cut, delete, paste, insert silence, duplicate and effects on a range are all
 * splices, so the history only keeps the frames that were replaced, not a full
 * copy of the file. Edits that change the format (channel count, sample rate)
 * keep the whole previous data instead.
 */
import { AudioData, LoopRegion, Marker, cloneChannels, frameCount, makeSilence } from './types';

export interface Selection {
    start: number;
    end: number;
}

interface Meta {
    markers: Marker[];
    loop: LoopRegion | null;
    selection: Selection;
}

interface SpliceStep {
    kind: 'splice';
    label: string;
    start: number;
    /** Frames to put back when this step is applied (undo or redo). */
    frames: Float32Array[];
    /** How many frames currently sit at `start` and get replaced. */
    length: number;
    meta: Meta;
}

interface FullStep {
    kind: 'full';
    label: string;
    data: AudioData;
    meta: Meta;
}

type Step = SpliceStep | FullStep;

function stepSamples(step: Step): number {
    const chans = step.kind === 'splice' ? step.frames : step.data.channels;
    let n = 0;
    for (const c of chans) n += c.length;
    return n;
}

function copyMarkers(markers: Marker[]): Marker[] {
    return markers.map((m) => ({ id: m.id, name: m.name, position: m.position }));
}

/** Copies frames [start, end) of every channel. */
export function sliceFrames(channels: Float32Array[], start: number, end: number): Float32Array[] {
    return channels.map((ch) => ch.slice(start, end));
}

/** New channels with [start, end) replaced by `insert` (channel counts must match). */
export function spliceFrames(channels: Float32Array[], start: number, end: number, insert: Float32Array[]): Float32Array[] {
    const insLen = insert.length ? insert[0].length : 0;
    return channels.map((ch, c) => {
        const out = new Float32Array(ch.length - (end - start) + insLen);
        out.set(ch.subarray(0, start), 0);
        if (insLen) out.set(insert[c], start);
        out.set(ch.subarray(end), start + insLen);
        return out;
    });
}

/** Moves marker / loop positions after a splice of [start, end) into `insLen` frames. */
export function shiftPosition(pos: number, start: number, end: number, insLen: number): number {
    if (pos < start) return pos;
    if (pos >= end) return pos - (end - start) + insLen;
    return start + Math.min(pos - start, insLen);
}

export class AudioDocument {
    data: AudioData;
    markers: Marker[] = [];
    loop: LoopRegion | null = null;
    selection: Selection = { start: 0, end: 0 };
    /** Steps older than this are dropped (memory guard, in samples). */
    maxHistorySamples = 96 * 1024 * 1024;
    maxSteps = 200;

    private undoStack: Step[] = [];
    private redoStack: Step[] = [];
    private nextMarkerId = 1;
    /** Increments on every change (cheap "is the waveform cache still valid" check). */
    version = 0;
    /** version at the last save. */
    savedVersion = 0;

    constructor(data: AudioData, markers: Marker[] = [], loop: LoopRegion | null = null) {
        this.data = data;
        this.markers = copyMarkers(markers);
        for (const m of this.markers) this.nextMarkerId = Math.max(this.nextMarkerId, m.id + 1);
        this.loop = loop ? { start: loop.start, end: loop.end } : null;
    }

    get length(): number {
        return frameCount(this.data);
    }

    get channelCount(): number {
        return this.data.channels.length;
    }

    get sampleRate(): number {
        return this.data.sampleRate;
    }

    get dirty(): boolean {
        return this.version !== this.savedVersion;
    }

    markSaved(): void {
        this.savedVersion = this.version;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    undoLabel(): string {
        return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : '';
    }

    redoLabel(): string {
        return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : '';
    }

    /** Clamps and orders a range to the data. */
    range(start: number, end: number): Selection {
        const n = this.length;
        let a = Math.round(Math.min(start, end));
        let b = Math.round(Math.max(start, end));
        a = Math.max(0, Math.min(n, a));
        b = Math.max(0, Math.min(n, b));
        return { start: a, end: b };
    }

    hasSelection(): boolean {
        return this.selection.end > this.selection.start;
    }

    /** The selection, or the whole file when nothing is selected. */
    targetRange(): Selection {
        return this.hasSelection() ? { start: this.selection.start, end: this.selection.end } : { start: 0, end: this.length };
    }

    slice(start: number, end: number): Float32Array[] {
        const r = this.range(start, end);
        return sliceFrames(this.data.channels, r.start, r.end);
    }

    private meta(): Meta {
        return {
            markers: copyMarkers(this.markers),
            loop: this.loop ? { start: this.loop.start, end: this.loop.end } : null,
            selection: { start: this.selection.start, end: this.selection.end },
        };
    }

    private applyMeta(meta: Meta): void {
        this.markers = copyMarkers(meta.markers);
        this.loop = meta.loop ? { start: meta.loop.start, end: meta.loop.end } : null;
        this.selection = { start: meta.selection.start, end: meta.selection.end };
    }

    private push(step: Step): void {
        this.undoStack.push(step);
        this.redoStack.length = 0;
        this.trim();
        this.version++;
    }

    private trim(): void {
        while (this.undoStack.length > this.maxSteps) this.undoStack.shift();
        let total = 0;
        for (const s of this.undoStack) total += stepSamples(s);
        for (const s of this.redoStack) total += stepSamples(s);
        while (total > this.maxHistorySamples && this.undoStack.length > 1) {
            total -= stepSamples(this.undoStack.shift()!);
        }
    }

    /** Raw splice without history. Returns the frames that were replaced. */
    private rawSplice(start: number, end: number, insert: Float32Array[]): Float32Array[] {
        const insLen = insert.length ? insert[0].length : 0;
        if (start === end && insLen === 0) return makeSilence(this.channelCount, 0);
        const removed = sliceFrames(this.data.channels, start, end);
        this.data = { sampleRate: this.data.sampleRate, channels: spliceFrames(this.data.channels, start, end, insert) };
        for (const m of this.markers) m.position = shiftPosition(m.position, start, end, insLen);
        if (this.loop) {
            const a = shiftPosition(this.loop.start, start, end, insLen);
            const b = shiftPosition(this.loop.end, start, end, insLen);
            this.loop = b > a ? { start: a, end: b } : null;
        }
        return removed;
    }

    /**
     * Replaces [start, end) with `insert` as one undoable step and selects the
     * inserted frames (or puts the cursor at `start` when nothing is inserted).
     */
    splice(label: string, start: number, end: number, insert: Float32Array[]): void {
        const r = this.range(start, end);
        if (insert.length !== this.channelCount) throw new Error(`Channel count mismatch (${insert.length} vs ${this.channelCount}).`);
        const meta = this.meta();
        const insLen = insert.length ? insert[0].length : 0;
        const removed = this.rawSplice(r.start, r.end, insert);
        this.selection = { start: r.start, end: r.start + insLen };
        this.push({ kind: 'splice', label, start: r.start, frames: removed, length: insLen, meta });
    }

    /** Replaces all data (format changes: channels, sample rate). */
    replaceAll(label: string, data: AudioData, mapPosition?: (pos: number) => number): void {
        const meta = this.meta();
        const before = this.data;
        this.data = data;
        const n = frameCount(data);
        const map = mapPosition || ((p: number) => Math.min(p, n));
        for (const m of this.markers) m.position = Math.max(0, Math.min(n, Math.round(map(m.position))));
        if (this.loop) {
            const a = Math.max(0, Math.min(n, Math.round(map(this.loop.start))));
            const b = Math.max(0, Math.min(n, Math.round(map(this.loop.end))));
            this.loop = b > a ? { start: a, end: b } : null;
        }
        this.selection = { start: Math.min(n, Math.round(map(this.selection.start))), end: Math.min(n, Math.round(map(this.selection.end))) };
        this.push({ kind: 'full', label, data: before, meta });
    }

    /** Records a markers / loop change (no sample data) as an undoable step. */
    changeMeta(label: string, fn: () => void): void {
        const meta = this.meta();
        fn();
        this.push({ kind: 'splice', label, start: 0, frames: makeSilence(this.channelCount, 0), length: 0, meta });
    }

    private applyStep(step: Step): Step {
        const metaNow = this.meta();
        if (step.kind === 'splice') {
            const removed = this.rawSplice(step.start, step.start + step.length, step.frames);
            this.applyMeta(step.meta);
            const insLen = step.frames.length ? step.frames[0].length : 0;
            return { kind: 'splice', label: step.label, start: step.start, frames: removed, length: insLen, meta: metaNow };
        }
        const current = this.data;
        this.data = step.data;
        this.applyMeta(step.meta);
        return { kind: 'full', label: step.label, data: current, meta: metaNow };
    }

    undo(): boolean {
        const step = this.undoStack.pop();
        if (!step) return false;
        this.redoStack.push(this.applyStep(step));
        this.version++;
        return true;
    }

    redo(): boolean {
        const step = this.redoStack.pop();
        if (!step) return false;
        this.undoStack.push(this.applyStep(step));
        this.version++;
        return true;
    }

    // ---- edit commands ----

    /** Copies the selection (null when empty). */
    copy(): AudioData | null {
        if (!this.hasSelection()) return null;
        return { sampleRate: this.sampleRate, channels: this.slice(this.selection.start, this.selection.end) };
    }

    cut(): AudioData | null {
        const clip = this.copy();
        if (!clip) return null;
        this.splice('Cut', this.selection.start, this.selection.end, makeSilence(this.channelCount, 0));
        return clip;
    }

    deleteSelection(): boolean {
        if (!this.hasSelection()) return false;
        this.splice('Delete', this.selection.start, this.selection.end, makeSilence(this.channelCount, 0));
        return true;
    }

    /**
     * Pastes over the selection (or at the cursor). The clip must already match
     * this document's channel count and sample rate (see matchFormat).
     */
    paste(clip: AudioData): void {
        if (clip.channels.length !== this.channelCount) throw new Error('Clip channel count does not match.');
        this.splice('Paste', this.selection.start, this.selection.end, cloneChannels(clip.channels));
    }

    /** Keeps only the selection. */
    trimToSelection(): boolean {
        if (!this.hasSelection()) return false;
        const { start, end } = this.selection;
        const kept = this.slice(start, end);
        const meta = this.meta();
        const before = this.data;
        this.data = { sampleRate: this.sampleRate, channels: kept };
        const len = end - start;
        this.markers = this.markers
            .filter((m) => m.position >= start && m.position <= end)
            .map((m) => ({ id: m.id, name: m.name, position: m.position - start }));
        if (this.loop) {
            const a = Math.max(0, this.loop.start - start);
            const b = Math.min(len, this.loop.end - start);
            this.loop = b > a ? { start: a, end: b } : null;
        }
        this.selection = { start: 0, end: len };
        this.push({ kind: 'full', label: 'Trim', data: before, meta });
        return true;
    }

    /** Inserts `frames` of silence at the cursor (replacing the selection, like Audacity's Generate Silence). */
    insertSilence(frames: number): void {
        const n = Math.max(0, Math.round(frames));
        this.splice('Insert Silence', this.selection.start, this.selection.end, makeSilence(this.channelCount, n));
    }

    /** Inserts a copy of the selection right after it, and selects the copy. */
    duplicate(): boolean {
        if (!this.hasSelection()) return false;
        const { start, end } = this.selection;
        const clip = this.slice(start, end);
        this.splice('Duplicate', end, end, clip);
        return true;
    }

    // ---- markers / loop ----

    addMarker(position: number, name?: string): Marker {
        const id = this.nextMarkerId++;
        const marker: Marker = { id, name: name || `Marker ${id}`, position: Math.max(0, Math.min(this.length, Math.round(position))) };
        this.changeMeta('Add Marker', () => {
            this.markers.push(marker);
            this.markers.sort((a, b) => a.position - b.position);
        });
        return marker;
    }

    removeMarker(id: number): void {
        this.changeMeta('Remove Marker', () => {
            this.markers = this.markers.filter((m) => m.id !== id);
        });
    }

    updateMarker(id: number, patch: { name?: string; position?: number }): void {
        this.changeMeta('Edit Marker', () => {
            const m = this.markers.find((x) => x.id === id);
            if (!m) return;
            if (patch.name !== undefined) m.name = patch.name;
            if (patch.position !== undefined) m.position = Math.max(0, Math.min(this.length, Math.round(patch.position)));
            this.markers.sort((a, b) => a.position - b.position);
        });
    }

    setLoop(region: LoopRegion | null): void {
        this.changeMeta(region ? 'Set Loop' : 'Clear Loop', () => {
            if (!region) {
                this.loop = null;
                return;
            }
            const r = this.range(region.start, region.end);
            this.loop = r.end > r.start ? r : null;
        });
    }
}
