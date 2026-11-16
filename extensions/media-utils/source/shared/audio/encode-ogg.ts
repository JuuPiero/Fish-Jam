/**
 * Ogg Vorbis encoding: libvorbis / libogg (BSD-3-Clause, Xiph.Org) compiled to
 * WebAssembly (ogg.wasm from the MIT-licensed wasm-media-encoders package).
 */
import { createEncoder } from 'wasm-media-encoders/esnext';
import { AudioData } from './types';
import { streamEncode } from './encode-common';

export async function encodeOgg(data: AudioData, wasm: Uint8Array | ArrayBuffer, quality: number, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
    const encoder = await createEncoder('audio/ogg', wasm);
    encoder.configure({
        sampleRate: data.sampleRate,
        channels: data.channels.length as 1 | 2,
        vbrQuality: Math.max(-1, Math.min(10, quality)),
    });
    return streamEncode(encoder, data.channels, onProgress);
}
