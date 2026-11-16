/**
 * Read-only analysis used by the Audio Editor: zero-crossing snapping,
 * waveform peaks (min/max per screen column) and sample-rate probing of
 * compressed files (decodeAudioData resamples to its context's rate, so the
 * file's own rate must be known first).
 */

// ---------------------------------------------------------------- zero crossings

/**
 * The zero crossing nearest to `index` within +-`radius` frames, looking at
 * the sum of all channels (like Audacity). A crossing at i means the signal
 * changes sign between i-1 and i (or is exactly 0 at i). Returns `index`
 * when there is none in range.
 */
export function snapToZeroCrossing(channels: Float32Array[], index: number, radius: number): number {
    const n = channels.length ? channels[0].length : 0;
    if (n < 2) return Math.max(0, Math.min(n, index));
    index = Math.max(0, Math.min(n, Math.round(index)));
    if (index === 0 || index === n) return index;
    const mix = (i: number) => {
        let v = 0;
        for (const ch of channels) v += ch[i];
        return v;
    };
    const isCrossing = (i: number) => {
        if (i <= 0 || i >= n) return false;
        const a = mix(i - 1);
        const b = mix(i);
        return b === 0 || (a < 0 && b > 0) || (a > 0 && b < 0);
    };
    for (let d = 0; d <= radius; d++) {
        if (index - d >= 0 && isCrossing(index - d)) return index - d;
        if (index + d <= n && isCrossing(index + d)) return index + d;
    }
    return index;
}

// ---------------------------------------------------------------- peaks

/** Min/max of every BLOCK frames, per channel: [min0, max0, min1, max1, ...]. */
export const PEAK_BLOCK = 256;

export interface PeakCache {
    block: number;
    channels: Float32Array[];
}

export function buildPeaks(channels: Float32Array[], block = PEAK_BLOCK): PeakCache {
    return {
        block,
        channels: channels.map((ch) => {
            const count = Math.ceil(ch.length / block);
            const out = new Float32Array(count * 2);
            for (let b = 0; b < count; b++) {
                let lo = Infinity;
                let hi = -Infinity;
                const end = Math.min(ch.length, (b + 1) * block);
                for (let i = b * block; i < end; i++) {
                    const v = ch[i];
                    if (v < lo) lo = v;
                    if (v > hi) hi = v;
                }
                out[b * 2] = lo;
                out[b * 2 + 1] = hi;
            }
            return out;
        }),
    };
}

/**
 * Min/max of frames [from, to) of one channel, using the block cache for the
 * whole blocks inside the range.
 */
export function rangeMinMax(ch: Float32Array, peaks: Float32Array | null, block: number, from: number, to: number): [number, number] {
    from = Math.max(0, Math.floor(from));
    to = Math.min(ch.length, Math.ceil(to));
    let lo = Infinity;
    let hi = -Infinity;
    if (to <= from) return [0, 0];
    if (!peaks || to - from < block * 2) {
        for (let i = from; i < to; i++) {
            const v = ch[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        return [lo, hi];
    }
    const b0 = Math.ceil(from / block);
    const b1 = Math.floor(to / block);
    for (let i = from; i < b0 * block; i++) {
        const v = ch[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    for (let b = b0; b < b1; b++) {
        if (peaks[b * 2] < lo) lo = peaks[b * 2];
        if (peaks[b * 2 + 1] > hi) hi = peaks[b * 2 + 1];
    }
    for (let i = b1 * block; i < to; i++) {
        const v = ch[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    return [lo, hi];
}

// ---------------------------------------------------------------- probing

const MP3_RATES: number[][] = [
    [11025, 12000, 8000], // MPEG 2.5
    [], // reserved
    [22050, 24000, 16000], // MPEG 2
    [44100, 48000, 32000], // MPEG 1
];

function skipId3(bytes: Uint8Array): number {
    if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
        return 10 + size + (bytes[5] & 0x10 ? 10 : 0);
    }
    return 0;
}

export function probeMp3(bytes: Uint8Array): { sampleRate: number; channels: number } | null {
    const limit = Math.min(bytes.length - 4, 1 << 20);
    for (let i = skipId3(bytes); i < limit; i++) {
        if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
        const version = (bytes[i + 1] >> 3) & 3;
        const layer = (bytes[i + 1] >> 1) & 3;
        const rateIdx = (bytes[i + 2] >> 2) & 3;
        const bitrateIdx = bytes[i + 2] >> 4;
        if (version === 1 || layer === 0 || rateIdx === 3 || bitrateIdx === 15 || bitrateIdx === 0) continue;
        const mode = bytes[i + 3] >> 6;
        return { sampleRate: MP3_RATES[version][rateIdx], channels: mode === 3 ? 1 : 2 };
    }
    return null;
}

/** Ogg Vorbis or Ogg Opus identification header. */
export function probeOgg(bytes: Uint8Array): { sampleRate: number; channels: number } | null {
    if (bytes.length < 64 || bytes[0] !== 0x4f || bytes[1] !== 0x67 || bytes[2] !== 0x67 || bytes[3] !== 0x53) return null;
    const segments = bytes[26];
    const at = 27 + segments;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // "\x01vorbis"
    if (bytes[at] === 1 && String.fromCharCode(bytes[at + 1], bytes[at + 2], bytes[at + 3], bytes[at + 4], bytes[at + 5], bytes[at + 6]) === 'vorbis') {
        return { channels: bytes[at + 11], sampleRate: view.getUint32(at + 12, true) };
    }
    // "OpusHead": decoders always output 48 kHz
    if (String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3], bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]) === 'OpusHead') {
        return { channels: bytes[at + 9], sampleRate: 48000 };
    }
    return null;
}

/** MP4 / M4A: the first "mp4a" sample entry (rate is 16.16 fixed point). */
export function probeMp4(bytes: Uint8Array): { sampleRate: number; channels: number } | null {
    if (bytes.length < 12 || String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) !== 'ftyp') return null;
    const limit = bytes.length - 36; // "moov" may sit at the end of the file
    for (let i = 8; i < limit; i++) {
        if (bytes[i] === 0x6d && bytes[i + 1] === 0x70 && bytes[i + 2] === 0x34 && bytes[i + 3] === 0x61) {
            const base = i + 4; // after the type: 6 reserved, 2 data ref index, 8 reserved
            const channels = (bytes[base + 16] << 8) | bytes[base + 17];
            const rate = (bytes[base + 24] << 8) | bytes[base + 25];
            if (rate > 0 && channels > 0 && channels <= 8) return { sampleRate: rate, channels };
        }
    }
    return null;
}

export function probeFlac(bytes: Uint8Array): { sampleRate: number; channels: number } | null {
    if (bytes.length < 42 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43) return null;
    const b = 8; // STREAMINFO body
    const rate = (bytes[b + 10] << 12) | (bytes[b + 11] << 4) | (bytes[b + 12] >> 4);
    const channels = ((bytes[b + 12] >> 1) & 7) + 1;
    return rate ? { sampleRate: rate, channels } : null;
}

/** The file's own sample rate, or null when unknown. */
export function probeSampleRate(bytes: Uint8Array): number | null {
    const r = probeOgg(bytes) || probeFlac(bytes) || probeMp4(bytes) || probeMp3(bytes);
    return r ? r.sampleRate : null;
}
