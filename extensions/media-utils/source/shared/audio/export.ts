/**
 * Audio export: format conversion (channels, sample rate) and encoding to
 * WAV (own encoder), MP3 (LAME, LGPL, see encode-mp3.ts) or Ogg Vorbis
 * (libvorbis, BSD, see encode-ogg.ts). Runs in the Audio Editor's worker.
 */
import { AudioData, LoopRegion, Marker } from './types';
import { resample } from './resample';
import { toChannelCount } from './effects';
import { encodeWav, WavBitDepth } from './wav';
import { encodeMp3 } from './encode-mp3';
import { encodeOgg } from './encode-ogg';

export type AudioFormat = 'wav' | 'mp3' | 'ogg';

export interface ExportOptions {
    format: AudioFormat;
    /** 0 keeps the current rate. */
    sampleRate: number;
    /** 0 keeps the current channel count; 1 mono, 2 stereo. */
    channels: number;
    wavBitDepth: WavBitDepth;
    mp3Mode: 'cbr' | 'vbr';
    /** kbit/s for CBR. */
    mp3Bitrate: number;
    /** LAME VBR quality 0 (best) .. 9 (smallest). */
    mp3Quality: number;
    /** Vorbis quality -1 (smallest) .. 10 (best). */
    oggQuality: number;
}

export const DEFAULT_EXPORT: ExportOptions = {
    format: 'ogg',
    sampleRate: 0,
    channels: 0,
    wavBitDepth: 16,
    mp3Mode: 'cbr',
    mp3Bitrate: 128,
    mp3Quality: 4,
    oggQuality: 4,
};

export const MP3_SAMPLE_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
export const MP3_BITRATES = [8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

function nearest(list: number[], value: number): number {
    let best = list[0];
    for (const v of list) if (Math.abs(v - value) < Math.abs(best - value)) best = v;
    return best;
}

/** MP3 only supports the MPEG rates; anything else is resampled to the nearest one. */
export function mp3SampleRate(rate: number): number {
    return nearest(MP3_SAMPLE_RATES, rate);
}

export function mp3Bitrate(kbps: number): number {
    return nearest(MP3_BITRATES, kbps);
}

/** Approximate Vorbis bitrate (stereo 44.1 kHz) for a quality value, for the UI. */
export function oggApproxKbps(q: number): number {
    const table: [number, number][] = [[-1, 45], [0, 64], [1, 80], [2, 96], [3, 112], [4, 128], [5, 160], [6, 192], [7, 224], [8, 256], [9, 320], [10, 500]];
    for (let i = 1; i < table.length; i++) {
        if (q <= table[i][0]) {
            const [q0, k0] = table[i - 1];
            const [q1, k1] = table[i];
            return Math.round(k0 + ((q - q0) / (q1 - q0)) * (k1 - k0));
        }
    }
    return 500;
}

/** The sample rate and channel count the file will be written with. */
export function exportFormat(data: { sampleRate: number; channels: Float32Array[] }, options: ExportOptions): { sampleRate: number; channels: number } {
    let rate = options.sampleRate > 0 ? options.sampleRate : data.sampleRate;
    let channels = options.channels > 0 ? options.channels : data.channels.length;
    if (options.format !== 'wav') {
        channels = Math.min(2, Math.max(1, channels));
        if (options.format === 'mp3') rate = mp3SampleRate(rate);
    }
    return { sampleRate: rate, channels };
}

/** Converts channels / rate for export. */
export function prepareExport(data: AudioData, options: ExportOptions): AudioData {
    const target = exportFormat(data, options);
    let ch = toChannelCount(data.channels, target.channels);
    if (target.sampleRate !== data.sampleRate) ch = resample(ch, data.sampleRate, target.sampleRate);
    return { sampleRate: target.sampleRate, channels: ch };
}

export interface EncoderWasm {
    mp3?: Uint8Array | ArrayBuffer;
    ogg?: Uint8Array | ArrayBuffer;
}

export async function encodeAudio(
    data: AudioData,
    options: ExportOptions,
    wasm: EncoderWasm,
    extra: { markers?: Marker[]; loop?: LoopRegion | null } = {},
    onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
    const src = prepareExport(data, options);
    const ratio = src.sampleRate / data.sampleRate;
    if (options.format === 'wav') {
        const markers = (extra.markers || []).map((m) => ({ id: m.id, name: m.name, position: Math.round(m.position * ratio) }));
        const loop = extra.loop ? { start: Math.round(extra.loop.start * ratio), end: Math.round(extra.loop.end * ratio) } : null;
        const out = encodeWav(src, { bitDepth: options.wavBitDepth, markers, loop });
        if (onProgress) onProgress(1);
        return out;
    }
    if (options.format === 'mp3') {
        if (!wasm.mp3) throw new Error('The MP3 encoder (mp3.wasm) is not available.');
        return encodeMp3(src, wasm.mp3, options.mp3Mode === 'vbr' ? { vbrQuality: options.mp3Quality } : { bitrate: mp3Bitrate(options.mp3Bitrate) }, onProgress);
    }
    if (options.format === 'ogg') {
        if (!wasm.ogg) throw new Error('The Ogg Vorbis encoder (ogg.wasm) is not available.');
        return encodeOgg(src, wasm.ogg, options.oggQuality, onProgress);
    }
    throw new Error(`Unsupported export format: ${options.format}`);
}
