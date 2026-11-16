/**
 * Feeds PCM to a wasm-media-encoders encoder in chunks and collects the output
 * (the encoder owns its output buffer, so every chunk is copied).
 */
export interface StreamEncoder {
    encode(samples: readonly Float32Array[]): Uint8Array;
    finalize(): Uint8Array;
}

const CHUNK = 1152 * 64;

export function streamEncode(encoder: StreamEncoder, channels: Float32Array[], onProgress?: (fraction: number) => void): Uint8Array {
    const n = channels.length ? channels[0].length : 0;
    const parts: Uint8Array[] = [];
    let total = 0;
    const keep = (bytes: Uint8Array) => {
        if (!bytes.length) return;
        parts.push(bytes.slice());
        total += bytes.length;
    };
    for (let at = 0; at < n; at += CHUNK) {
        const end = Math.min(n, at + CHUNK);
        // Clamp to [-1, 1]: the encoders expect it, and effects may overshoot.
        keep(encoder.encode(channels.map((ch) => {
            const part = ch.slice(at, end);
            for (let i = 0; i < part.length; i++) {
                const v = part[i];
                if (v > 1) part[i] = 1;
                else if (v < -1) part[i] = -1;
                else if (v !== v) part[i] = 0;
            }
            return part;
        })));
        if (onProgress) onProgress(end / n);
    }
    keep(encoder.finalize());
    const out = new Uint8Array(total);
    let p = 0;
    for (const part of parts) {
        out.set(part, p);
        p += part.length;
    }
    return out;
}
