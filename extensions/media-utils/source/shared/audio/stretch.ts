/**
 * Time stretching without changing pitch (WSOLA: waveform-similarity overlap-add).
 *
 * Frames of ~40 ms are copied with a Hann window and 50 % overlap. Each new
 * frame is taken near its nominal input position, shifted (within +-10 ms) to
 * the place that best continues the previous frame, so periodic sounds stay
 * in phase. Good for voice, SFX and most music; very large factors smear
 * transients, as in every overlap-add stretcher.
 *
 * Pitch shifting = stretch by r, then resample by 1/r (same length, pitch x r).
 */
import { resampleRatio } from './resample';

function hann(n: number): Float32Array {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    return w;
}

function mixDown(channels: Float32Array[]): Float32Array {
    if (channels.length === 1) return channels[0];
    const n = channels[0].length;
    const out = new Float32Array(n);
    const k = 1 / channels.length;
    for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] * k;
    return out;
}

/** Cross-correlation of mono[a .. a+len) and mono[b .. b+len), sampled every `step`. */
function correlate(mono: Float32Array, a: number, b: number, len: number, step: number): number {
    let acc = 0;
    const n = mono.length;
    for (let i = 0; i < len; i += step) {
        const ia = a + i;
        const ib = b + i;
        if (ia < 0 || ib < 0 || ia >= n || ib >= n) continue;
        acc += mono[ia] * mono[ib];
    }
    return acc;
}

/**
 * Stretches by `factor` (2 = twice as long, 0.5 = half as long), pitch kept.
 * The result has round(length * factor) frames.
 */
export function timeStretch(channels: Float32Array[], sampleRate: number, factor: number): Float32Array[] {
    if (!(factor > 0) || !isFinite(factor)) throw new Error('Invalid stretch factor.');
    const n = channels.length ? channels[0].length : 0;
    const outLen = Math.max(0, Math.round(n * factor));
    if (!n || !outLen) return channels.map(() => new Float32Array(outLen));
    if (Math.abs(factor - 1) < 1e-9) return channels.map((c) => new Float32Array(c));

    const frame = Math.max(64, 2 * Math.round((sampleRate * 0.04) / 2));
    const hs = frame / 2; // synthesis hop
    const ha = hs / factor; // analysis hop
    const tolerance = Math.max(8, Math.round(sampleRate * 0.01));
    const window = hann(frame);
    const mono = mixDown(channels);
    const coarse = 4;

    const out = channels.map(() => new Float32Array(outLen + frame));
    const weight = new Float32Array(outLen + frame);
    let prev = 0; // input position of the previously copied frame

    for (let k = 0; ; k++) {
        const s = k * hs;
        if (s >= outLen) break;
        const nominal = Math.round(k * ha);
        let best = nominal;
        if (k > 0) {
            const natural = prev + hs; // where the previous frame "continues"
            let bestScore = -Infinity;
            const lo = Math.max(0, nominal - tolerance);
            const hi = Math.min(n - 1, nominal + tolerance);
            for (let p = lo; p <= hi; p += coarse) {
                const score = correlate(mono, p, natural, frame, coarse);
                if (score > bestScore) {
                    bestScore = score;
                    best = p;
                }
            }
            const fineLo = Math.max(lo, best - coarse);
            const fineHi = Math.min(hi, best + coarse);
            bestScore = -Infinity;
            for (let p = fineLo; p <= fineHi; p++) {
                const score = correlate(mono, p, natural, frame, 2);
                if (score > bestScore) {
                    bestScore = score;
                    best = p;
                }
            }
        }
        for (let c = 0; c < channels.length; c++) {
            const src = channels[c];
            const dst = out[c];
            for (let i = 0; i < frame; i++) {
                const si = best + i;
                if (si >= n) break;
                dst[s + i] += src[si] * window[i];
            }
        }
        for (let i = 0; i < frame; i++) weight[s + i] += window[i];
        prev = best;
    }

    return out.map((buf) => {
        const res = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const w = weight[i];
            res[i] = w > 1e-3 ? buf[i] / w : buf[i];
        }
        return res;
    });
}

/** Changes tempo (1.5 = 50 % faster, shorter) without changing pitch. */
export function changeTempo(channels: Float32Array[], sampleRate: number, tempo: number): Float32Array[] {
    return timeStretch(channels, sampleRate, 1 / tempo);
}

/** Shifts pitch by `semitones` and keeps the length. */
export function changePitch(channels: Float32Array[], sampleRate: number, semitones: number): Float32Array[] {
    const n = channels.length ? channels[0].length : 0;
    if (!semitones) return channels.map((c) => new Float32Array(c));
    const r = Math.pow(2, semitones / 12);
    const stretched = timeStretch(channels, sampleRate, r);
    return resampleRatio(stretched, 1 / r, n);
}
