/**
 * Band-limited resampling (windowed sinc, Blackman window, table lookup).
 *
 * resampleRatio(ch, ratio) makes ratio x more frames: 2 doubles the length
 * (one octave down when played at the same rate), 0.5 halves it. When the
 * signal is shortened the kernel's cut-off follows the new Nyquist frequency,
 * so there is no aliasing.
 */

const ZERO_CROSSINGS = 16;
const TABLE_RES = 512; // kernel samples per input sample
const MAX_HALF_WIDTH = 384; // input samples (guards against huge kernels)

interface Kernel {
    halfWidth: number;
    table: Float32Array;
}

const kernelCache = new Map<number, Kernel>();

function kernelFor(cutoff: number): Kernel {
    const key = Math.round(cutoff * 1e6);
    const hit = kernelCache.get(key);
    if (hit) return hit;
    const halfWidth = Math.min(MAX_HALF_WIDTH, Math.ceil(ZERO_CROSSINGS / cutoff));
    const size = halfWidth * TABLE_RES + 2;
    const table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        const t = i / TABLE_RES;
        if (t >= halfWidth) {
            table[i] = 0;
            continue;
        }
        const x = Math.PI * cutoff * t;
        const sinc = x === 0 ? 1 : Math.sin(x) / x;
        const w = 0.42 + 0.5 * Math.cos((Math.PI * t) / halfWidth) + 0.08 * Math.cos((2 * Math.PI * t) / halfWidth);
        table[i] = cutoff * sinc * w;
    }
    const kernel = { halfWidth, table };
    if (kernelCache.size > 16) kernelCache.clear();
    kernelCache.set(key, kernel);
    return kernel;
}

/** One channel, `outLength` frames, reading input at position j / ratio. */
export function resampleChannel(input: Float32Array, ratio: number, outLength?: number): Float32Array {
    const n = input.length;
    const outLen = outLength !== undefined ? outLength : Math.max(0, Math.round(n * ratio));
    const out = new Float32Array(outLen);
    if (!n || !outLen) return out;
    if (Math.abs(ratio - 1) < 1e-12 && outLen === n) {
        out.set(input);
        return out;
    }
    const cutoff = Math.min(1, ratio) * 0.97; // a little below Nyquist
    const { halfWidth, table } = kernelFor(cutoff);
    const step = 1 / ratio;
    for (let j = 0; j < outLen; j++) {
        const x = j * step;
        const first = Math.max(0, Math.ceil(x - halfWidth));
        const last = Math.min(n - 1, Math.floor(x + halfWidth));
        let acc = 0;
        for (let i = first; i <= last; i++) {
            let d = x - i;
            if (d < 0) d = -d;
            const k = table[(d * TABLE_RES + 0.5) | 0];
            acc += input[i] * k;
        }
        out[j] = acc;
    }
    return out;
}

export function resampleRatio(channels: Float32Array[], ratio: number, outLength?: number): Float32Array[] {
    if (!(ratio > 0) || !isFinite(ratio)) throw new Error('Invalid resample ratio.');
    return channels.map((ch) => resampleChannel(ch, ratio, outLength));
}

/** Converts between sample rates (keeps duration and pitch). */
export function resample(channels: Float32Array[], fromRate: number, toRate: number): Float32Array[] {
    if (fromRate === toRate) return channels.map((c) => new Float32Array(c));
    const n = channels.length ? channels[0].length : 0;
    return resampleRatio(channels, toRate / fromRate, Math.round((n * toRate) / fromRate));
}
