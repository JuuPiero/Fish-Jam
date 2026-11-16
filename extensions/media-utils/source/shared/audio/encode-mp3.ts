/**
 * MP3 encoding. The encoder is LAME compiled to WebAssembly (mp3.wasm from the
 * wasm-media-encoders package). LAME is licensed under the LGPL 2.0 (or later):
 * it is kept in its own, unmodified, separately loaded mp3.wasm file, so it can
 * be replaced by the user. The JavaScript glue (wasm-media-encoders) is MIT.
 */
import { createEncoder } from 'wasm-media-encoders/esnext';
import { AudioData } from './types';
import { streamEncode } from './encode-common';

export interface Mp3Params {
    bitrate?: number;
    vbrQuality?: number;
}

export async function encodeMp3(data: AudioData, wasm: Uint8Array | ArrayBuffer, params: Mp3Params, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
    const encoder = await createEncoder('audio/mpeg', wasm);
    const channels = data.channels.length as 1 | 2;
    const config: any = { sampleRate: data.sampleRate, channels };
    if (params.vbrQuality !== undefined) config.vbrQuality = Math.max(0, Math.min(9.99, params.vbrQuality));
    else config.bitrate = params.bitrate || 128;
    config.outputSampleRate = data.sampleRate;
    encoder.configure(config);
    return streamEncode(encoder, data.channels, onProgress);
}
