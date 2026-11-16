/**
 * Audio effects. Each takes channels (one Float32Array per channel) and returns
 * new channels; inputs are never modified. They run in the Audio Editor's
 * worker, on the selection or on the whole file.
 */
import { clamp, dbToGain } from './types';
import { resample, resampleRatio } from './resample';
import { changePitch, changeTempo } from './stretch';

export type FadeCurve = 'linear' | 'exponential' | 'logarithmic' | 'scurve';

/** Curvature of the "exponential" fade (gain = (e^(k t) - 1) / (e^k - 1)). */
const EXP_K = 4;

/** Fade-in gain at t in [0, 1]. Fade-outs use fadeGain(1 - t). */
export function fadeGain(t: number, curve: FadeCurve): number {
    t = clamp(t, 0, 1);
    switch (curve) {
        case 'exponential':
            return (Math.exp(EXP_K * t) - 1) / (Math.exp(EXP_K) - 1);
        case 'logarithmic':
            return 1 - (Math.exp(EXP_K * (1 - t)) - 1) / (Math.exp(EXP_K) - 1);
        case 'scurve':
            return 0.5 - 0.5 * Math.cos(Math.PI * t);
        default:
            return t;
    }
}

export function peakOf(channels: Float32Array[]): number {
    let peak = 0;
    for (const ch of channels) {
        for (let i = 0; i < ch.length; i++) {
            const v = ch[i] < 0 ? -ch[i] : ch[i];
            if (v > peak) peak = v;
        }
    }
    return peak;
}

export function amplify(channels: Float32Array[], db: number, allowClipping = true): Float32Array[] {
    const g = dbToGain(db);
    return channels.map((ch) => {
        const out = new Float32Array(ch.length);
        for (let i = 0; i < ch.length; i++) {
            const v = ch[i] * g;
            out[i] = allowClipping ? v : clamp(v, -1, 1);
        }
        return out;
    });
}

/** Amplify so the peak lands on `peakDb` (dBFS). `independent` normalizes each channel on its own. */
export function normalize(channels: Float32Array[], peakDb = -1, options: { independent?: boolean; removeDc?: boolean } = {}): Float32Array[] {
    const src = options.removeDc ? removeDc(channels) : channels.map((c) => new Float32Array(c));
    const target = dbToGain(peakDb);
    if (options.independent) {
        return src.map((ch) => {
            const p = peakOf([ch]);
            if (p <= 0) return ch;
            const g = target / p;
            for (let i = 0; i < ch.length; i++) ch[i] *= g;
            return ch;
        });
    }
    const p = peakOf(src);
    if (p <= 0) return src;
    const g = target / p;
    for (const ch of src) for (let i = 0; i < ch.length; i++) ch[i] *= g;
    return src;
}

export function fade(channels: Float32Array[], direction: 'in' | 'out', curve: FadeCurve = 'linear'): Float32Array[] {
    return channels.map((ch) => {
        const n = ch.length;
        const out = new Float32Array(n);
        const last = Math.max(1, n - 1);
        for (let i = 0; i < n; i++) {
            const t = i / last;
            out[i] = ch[i] * fadeGain(direction === 'in' ? t : 1 - t, curve);
        }
        return out;
    });
}

export function reverse(channels: Float32Array[]): Float32Array[] {
    return channels.map((ch) => {
        const out = new Float32Array(ch);
        out.reverse();
        return out;
    });
}

/** Plays `speed` x faster: shorter and higher (like a tape). 0.5 = half speed. */
export function changeSpeed(channels: Float32Array[], speed: number): Float32Array[] {
    if (!(speed > 0)) throw new Error('Speed must be greater than 0.');
    return resampleRatio(channels, 1 / speed);
}

export { changePitch, changeTempo, resample };

export function toMono(channels: Float32Array[]): Float32Array[] {
    if (channels.length <= 1) return channels.map((c) => new Float32Array(c));
    const n = channels[0].length;
    const out = new Float32Array(n);
    const k = 1 / channels.length;
    for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] * k;
    return [out];
}

export function toStereo(channels: Float32Array[]): Float32Array[] {
    if (channels.length === 2) return channels.map((c) => new Float32Array(c));
    const mono = toMono(channels)[0];
    return [mono, new Float32Array(mono)];
}

/** Converts a clip to `count` channels (mono <-> stereo; more than 2 are mixed). */
export function toChannelCount(channels: Float32Array[], count: number): Float32Array[] {
    if (channels.length === count) return channels.map((c) => new Float32Array(c));
    if (count === 1) return toMono(channels);
    if (count === 2) return toStereo(channels);
    const mono = toMono(channels)[0];
    const out: Float32Array[] = [];
    for (let c = 0; c < count; c++) out.push(new Float32Array(mono));
    return out;
}

export function removeDc(channels: Float32Array[]): Float32Array[] {
    return channels.map((ch) => {
        let sum = 0;
        for (let i = 0; i < ch.length; i++) sum += ch[i];
        const mean = ch.length ? sum / ch.length : 0;
        const out = new Float32Array(ch.length);
        for (let i = 0; i < ch.length; i++) out[i] = ch[i] - mean;
        return out;
    });
}

export interface GateOptions {
    /** Level below which the gate closes (dBFS). */
    thresholdDb: number;
    /** Attenuation when closed (dB, negative; -100 = silence). */
    reductionDb?: number;
    attackMs?: number;
    holdMs?: number;
    releaseMs?: number;
}

/** Simple noise gate (channels linked: the loudest channel opens it for all). */
export function noiseGate(channels: Float32Array[], sampleRate: number, options: GateOptions): Float32Array[] {
    const n = channels.length ? channels[0].length : 0;
    const threshold = dbToGain(options.thresholdDb);
    const floor = options.reductionDb === undefined || options.reductionDb <= -100 ? 0 : dbToGain(options.reductionDb);
    const attack = Math.max(1, ((options.attackMs ?? 5) / 1000) * sampleRate);
    const release = Math.max(1, ((options.releaseMs ?? 80) / 1000) * sampleRate);
    const hold = Math.max(0, Math.round(((options.holdMs ?? 30) / 1000) * sampleRate));
    // Envelope: peak over a short window (look-ahead of the attack time), so the
    // gate is already open when a transient starts.
    const look = Math.max(1, Math.round(attack));
    const level = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let v = 0;
        for (const ch of channels) {
            const a = ch[i] < 0 ? -ch[i] : ch[i];
            if (a > v) v = a;
        }
        level[i] = v;
    }
    const open = new Uint8Array(n);
    // Sliding max over [i, i + look) using a monotonic deque.
    const dq = new Int32Array(n + 1);
    let head = 0;
    let tail = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
        const limit = Math.min(n, i + look);
        while (j < limit) {
            while (tail > head && level[dq[tail - 1]] <= level[j]) tail--;
            dq[tail++] = j++;
        }
        while (dq[head] < i) head++;
        open[i] = level[dq[head]] >= threshold ? 1 : 0;
    }
    const out = channels.map((ch) => new Float32Array(ch.length));
    let gain = floor;
    let holdLeft = 0;
    const up = (1 - floor) / attack;
    const down = (1 - floor) / release;
    for (let i = 0; i < n; i++) {
        if (open[i]) {
            holdLeft = hold;
            gain = Math.min(1, gain + up);
        } else if (holdLeft > 0) {
            holdLeft--;
        } else {
            gain = Math.max(floor, gain - down);
        }
        for (let c = 0; c < channels.length; c++) out[c][i] = channels[c][i] * gain;
    }
    return out;
}

/** First and last frame above `thresholdDb` (null when everything is silent). */
export function audibleBounds(channels: Float32Array[], thresholdDb: number): { start: number; end: number } | null {
    const n = channels.length ? channels[0].length : 0;
    const t = dbToGain(thresholdDb);
    let first = -1;
    let last = -1;
    for (let i = 0; i < n; i++) {
        let loud = false;
        for (const ch of channels) if (ch[i] > t || ch[i] < -t) loud = true;
        if (loud) {
            if (first < 0) first = i;
            last = i;
        }
    }
    return first < 0 ? null : { start: first, end: last + 1 };
}

export interface TrimSilenceOptions {
    thresholdDb: number;
    /** Silence kept before the first / after the last audible frame, in ms. */
    paddingMs?: number;
    leading?: boolean;
    trailing?: boolean;
}

/** The frame range kept by trimSilence. */
export function silenceTrimRange(channels: Float32Array[], sampleRate: number, options: TrimSilenceOptions): { start: number; end: number } {
    const n = channels.length ? channels[0].length : 0;
    const bounds = audibleBounds(channels, options.thresholdDb);
    if (!bounds) return { start: 0, end: 0 };
    const pad = Math.round(((options.paddingMs ?? 0) / 1000) * sampleRate);
    const start = options.leading === false ? 0 : Math.max(0, bounds.start - pad);
    const end = options.trailing === false ? n : Math.min(n, bounds.end + pad);
    return { start, end };
}

export function trimSilence(channels: Float32Array[], sampleRate: number, options: TrimSilenceOptions): Float32Array[] {
    const r = silenceTrimRange(channels, sampleRate, options);
    return channels.map((ch) => ch.slice(r.start, r.end));
}

// ---- effect registry (used by the panel and the worker) ----

export interface EffectRequest {
    name: EffectName;
    params: Record<string, any>;
    sampleRate: number;
    channels: Float32Array[];
}

export type EffectName =
    | 'amplify'
    | 'normalize'
    | 'fadeIn'
    | 'fadeOut'
    | 'reverse'
    | 'speed'
    | 'tempo'
    | 'pitch'
    | 'removeDc'
    | 'noiseGate'
    | 'trimSilence'
    | 'toMono'
    | 'toStereo'
    | 'resample';

export interface EffectResult {
    sampleRate: number;
    channels: Float32Array[];
}

/** Runs a named effect. Format-changing effects (toMono, toStereo, resample) return a new sample rate / channel count. */
export function runEffect(req: EffectRequest): EffectResult {
    const p = req.params || {};
    const ch = req.channels;
    const sr = req.sampleRate;
    switch (req.name) {
        case 'amplify':
            return { sampleRate: sr, channels: amplify(ch, Number(p.db) || 0, p.allowClipping !== false) };
        case 'normalize':
            return { sampleRate: sr, channels: normalize(ch, p.peakDb ?? -1, { independent: !!p.independent, removeDc: !!p.removeDc }) };
        case 'fadeIn':
            return { sampleRate: sr, channels: fade(ch, 'in', p.curve || 'linear') };
        case 'fadeOut':
            return { sampleRate: sr, channels: fade(ch, 'out', p.curve || 'linear') };
        case 'reverse':
            return { sampleRate: sr, channels: reverse(ch) };
        case 'speed':
            return { sampleRate: sr, channels: changeSpeed(ch, Number(p.speed) || 1) };
        case 'tempo':
            return { sampleRate: sr, channels: changeTempo(ch, sr, Number(p.tempo) || 1) };
        case 'pitch':
            return { sampleRate: sr, channels: changePitch(ch, sr, Number(p.semitones) || 0) };
        case 'removeDc':
            return { sampleRate: sr, channels: removeDc(ch) };
        case 'noiseGate':
            return { sampleRate: sr, channels: noiseGate(ch, sr, p as GateOptions) };
        case 'trimSilence':
            return { sampleRate: sr, channels: trimSilence(ch, sr, p as TrimSilenceOptions) };
        case 'toMono':
            return { sampleRate: sr, channels: toMono(ch) };
        case 'toStereo':
            return { sampleRate: sr, channels: toStereo(ch) };
        case 'resample': {
            const to = Math.round(Number(p.sampleRate) || sr);
            return { sampleRate: to, channels: resample(ch, sr, to) };
        }
        default:
            throw new Error(`Unknown effect: ${(req as any).name}`);
    }
}

/** Effects that change the channel count or sample rate (always applied to the whole file). */
export function isFormatEffect(name: EffectName): boolean {
    return name === 'toMono' || name === 'toStereo' || name === 'resample';
}

/** Converts a clipboard clip to a document's format (channels and sample rate). */
export function matchFormat(clip: { sampleRate: number; channels: Float32Array[] }, sampleRate: number, channelCount: number): Float32Array[] {
    let ch = toChannelCount(clip.channels, channelCount);
    if (clip.sampleRate !== sampleRate) ch = resample(ch, clip.sampleRate, sampleRate);
    return ch;
}
