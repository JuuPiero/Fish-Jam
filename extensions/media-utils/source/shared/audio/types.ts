/**
 * Plain audio data shared by the Audio Editor panel, its worker and the tests.
 * Samples are 32-bit float, one Float32Array per channel, nominally in [-1, 1].
 */
export interface AudioData {
    sampleRate: number;
    channels: Float32Array[];
}

/** A named position on the timeline, in samples. */
export interface Marker {
    id: number;
    name: string;
    position: number;
}

/** A loop region, in samples (end exclusive). */
export interface LoopRegion {
    start: number;
    end: number;
}

export function frameCount(data: { channels: Float32Array[] }): number {
    return data.channels.length ? data.channels[0].length : 0;
}

export function makeSilence(channelCount: number, length: number): Float32Array[] {
    const out: Float32Array[] = [];
    for (let c = 0; c < channelCount; c++) out.push(new Float32Array(Math.max(0, length | 0)));
    return out;
}

export function cloneChannels(channels: Float32Array[]): Float32Array[] {
    return channels.map((ch) => new Float32Array(ch));
}

export function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

export function dbToGain(db: number): number {
    return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
    return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}

/** "m:ss.mmm" or "h:mm:ss.mmm". */
export function formatTime(seconds: number, withMillis = true): string {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalS = Math.floor(totalMs / 1000);
    const s = totalS % 60;
    const m = Math.floor(totalS / 60) % 60;
    const h = Math.floor(totalS / 3600);
    const ss = (s < 10 ? '0' : '') + s;
    const mm = h > 0 ? (m < 10 ? '0' : '') + m : String(m);
    const head = h > 0 ? h + ':' + mm : mm;
    if (!withMillis) return head + ':' + ss;
    return head + ':' + ss + '.' + ('00' + ms).slice(-3);
}

/** Parses "1:02.5", "62.5", "0:01:02.500" back into seconds (NaN when invalid). */
export function parseTime(text: string): number {
    const parts = String(text).trim().split(':');
    if (!parts.length || parts.length > 3) return NaN;
    let total = 0;
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i].trim();
        if (!/^\d*(\.\d*)?$/.test(p) || p === '' || p === '.') return NaN;
        total = total * 60 + parseFloat(p);
    }
    return total;
}
