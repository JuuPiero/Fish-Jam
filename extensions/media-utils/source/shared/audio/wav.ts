/**
 * WAV (RIFF/WAVE) encoder and decoder.
 *
 * Decodes PCM 8/16/24/32-bit integer, 32/64-bit float and WAVE_FORMAT_EXTENSIBLE.
 * Markers are stored the standard way (a "cue " chunk plus LIST/adtl "labl"
 * names) and the loop region in a "smpl" chunk, which most audio tools read.
 */
import { AudioData, LoopRegion, Marker } from './types';

export type WavBitDepth = 16 | 24 | 32;

export interface WavEncodeOptions {
    /** 16 / 24-bit integer PCM, or 32-bit float. Default 16. */
    bitDepth?: WavBitDepth;
    markers?: Marker[];
    loop?: LoopRegion | null;
}

export interface WavDecoded extends AudioData {
    markers: Marker[];
    loop: LoopRegion | null;
    bitDepth: number;
    float: boolean;
}

function writeStr(view: DataView, at: number, s: string): void {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i) & 0xff);
}

function readStr(view: DataView, at: number, len: number): string {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(at + i));
    return s;
}

function pad2(n: number): number {
    return n + (n & 1);
}

export function encodeWav(data: AudioData, options: WavEncodeOptions = {}): Uint8Array {
    const bitDepth = options.bitDepth || 16;
    const isFloat = bitDepth === 32;
    const channels = data.channels;
    const nch = channels.length;
    const frames = nch ? channels[0].length : 0;
    const bytesPer = bitDepth / 8;
    const dataBytes = frames * nch * bytesPer;
    const markers = (options.markers || []).filter((m) => m.position >= 0 && m.position <= frames);
    const loop = options.loop && options.loop.end > options.loop.start ? options.loop : null;

    // Optional chunks.
    const cueBytes = markers.length ? 4 + markers.length * 24 : 0;
    const labels = markers.map((m, i) => {
        const text = unescape(encodeURIComponent(m.name || `Marker ${i + 1}`)) + '\0';
        return { id: i + 1, text };
    });
    const adtlBytes = markers.length ? 4 + labels.reduce((sum, l) => sum + 8 + pad2(4 + l.text.length), 0) : 0;
    const smplBytes = loop ? 36 + 24 : 0;

    const fmtBytes = 16;
    let total = 4 + (8 + fmtBytes) + (8 + pad2(dataBytes));
    if (cueBytes) total += 8 + cueBytes;
    if (adtlBytes) total += 8 + adtlBytes;
    if (smplBytes) total += 8 + smplBytes;

    const buffer = new ArrayBuffer(8 + total);
    const view = new DataView(buffer);
    let p = 0;
    writeStr(view, p, 'RIFF');
    view.setUint32(p + 4, total, true);
    writeStr(view, p + 8, 'WAVE');
    p = 12;

    writeStr(view, p, 'fmt ');
    view.setUint32(p + 4, fmtBytes, true);
    view.setUint16(p + 8, isFloat ? 3 : 1, true);
    view.setUint16(p + 10, nch, true);
    view.setUint32(p + 12, data.sampleRate, true);
    view.setUint32(p + 16, data.sampleRate * nch * bytesPer, true);
    view.setUint16(p + 20, nch * bytesPer, true);
    view.setUint16(p + 22, bitDepth, true);
    p += 8 + fmtBytes;

    writeStr(view, p, 'data');
    view.setUint32(p + 4, dataBytes, true);
    p += 8;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < nch; c++) {
            let v = channels[c][i];
            if (isFloat) {
                view.setFloat32(p, v, true);
                p += 4;
                continue;
            }
            if (v > 1) v = 1;
            else if (v < -1) v = -1;
            if (bitDepth === 16) {
                view.setInt16(p, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true);
                p += 2;
            } else {
                let s = v < 0 ? Math.round(v * 8388608) : Math.round(v * 8388607);
                if (s < 0) s += 0x1000000;
                view.setUint8(p, s & 0xff);
                view.setUint8(p + 1, (s >> 8) & 0xff);
                view.setUint8(p + 2, (s >> 16) & 0xff);
                p += 3;
            }
        }
    }
    if (dataBytes & 1) p++;

    if (cueBytes) {
        writeStr(view, p, 'cue ');
        view.setUint32(p + 4, cueBytes, true);
        view.setUint32(p + 8, markers.length, true);
        let q = p + 12;
        markers.forEach((m, i) => {
            view.setUint32(q, i + 1, true); // id
            view.setUint32(q + 4, m.position, true); // play order position
            writeStr(view, q + 8, 'data');
            view.setUint32(q + 12, 0, true);
            view.setUint32(q + 16, 0, true);
            view.setUint32(q + 20, m.position, true); // sample offset
            q += 24;
        });
        p += 8 + cueBytes;
    }
    if (adtlBytes) {
        writeStr(view, p, 'LIST');
        view.setUint32(p + 4, adtlBytes, true);
        writeStr(view, p + 8, 'adtl');
        let q = p + 12;
        for (const l of labels) {
            writeStr(view, q, 'labl');
            view.setUint32(q + 4, 4 + l.text.length, true);
            view.setUint32(q + 8, l.id, true);
            writeStr(view, q + 12, l.text);
            q += 8 + pad2(4 + l.text.length);
        }
        p += 8 + adtlBytes;
    }
    if (smplBytes && loop) {
        writeStr(view, p, 'smpl');
        view.setUint32(p + 4, smplBytes, true);
        const q = p + 8;
        view.setUint32(q + 8, Math.round(1e9 / data.sampleRate), true); // sample period (ns)
        view.setUint32(q + 12, 60, true); // MIDI unity note
        view.setUint32(q + 28, 1, true); // loop count
        view.setUint32(q + 36, 0, true); // cue id
        view.setUint32(q + 40, 0, true); // type: forward
        view.setUint32(q + 44, loop.start, true);
        view.setUint32(q + 48, loop.end - 1, true); // inclusive end
        p += 8 + smplBytes;
    }
    return new Uint8Array(buffer);
}

export function isWav(bytes: Uint8Array): boolean {
    return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
}

export function decodeWav(bytes: Uint8Array): WavDecoded {
    if (!isWav(bytes)) throw new Error('Not a WAV file.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let format = 0;
    let nch = 0;
    let sampleRate = 0;
    let bits = 0;
    let dataAt = -1;
    let dataLen = 0;
    const cues: { id: number; position: number }[] = [];
    const names = new Map<number, string>();
    let loop: LoopRegion | null = null;

    let p = 12;
    while (p + 8 <= bytes.length) {
        const id = readStr(view, p, 4);
        let size = view.getUint32(p + 4, true);
        const body = p + 8;
        if (body + size > bytes.length) size = bytes.length - body;
        if (id === 'fmt ') {
            format = view.getUint16(body, true);
            nch = view.getUint16(body + 2, true);
            sampleRate = view.getUint32(body + 4, true);
            bits = view.getUint16(body + 14, true);
            if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
        } else if (id === 'data') {
            dataAt = body;
            dataLen = size;
        } else if (id === 'cue ') {
            const count = view.getUint32(body, true);
            for (let i = 0; i < count && body + 4 + i * 24 + 24 <= body + size; i++) {
                const q = body + 4 + i * 24;
                cues.push({ id: view.getUint32(q, true), position: view.getUint32(q + 20, true) });
            }
        } else if (id === 'LIST' && size >= 4 && readStr(view, body, 4) === 'adtl') {
            let q = body + 4;
            while (q + 8 <= body + size) {
                const sub = readStr(view, q, 4);
                const len = view.getUint32(q + 4, true);
                if (sub === 'labl' && len >= 4) {
                    const cueId = view.getUint32(q + 8, true);
                    let text = '';
                    for (let i = q + 12; i < q + 8 + len; i++) {
                        const ch = view.getUint8(i);
                        if (!ch) break;
                        text += String.fromCharCode(ch);
                    }
                    try {
                        text = decodeURIComponent(escape(text));
                    } catch (e) {
                        // keep latin-1 text
                    }
                    names.set(cueId, text);
                }
                q += 8 + pad2(len);
            }
        } else if (id === 'smpl' && size >= 36) {
            const loops = view.getUint32(body + 28, true);
            if (loops > 0 && size >= 36 + 24) {
                const start = view.getUint32(body + 36 + 8, true);
                const end = view.getUint32(body + 36 + 12, true) + 1;
                if (end > start) loop = { start, end };
            }
        }
        p = body + pad2(size);
    }
    if (!nch || !sampleRate || dataAt < 0) throw new Error('Invalid WAV file (missing fmt or data chunk).');
    const isFloat = format === 3;
    if (format !== 1 && !isFloat) throw new Error(`Unsupported WAV encoding (format ${format}).`);
    const bytesPer = bits / 8;
    const frames = Math.floor(dataLen / (bytesPer * nch));
    const channels: Float32Array[] = [];
    for (let c = 0; c < nch; c++) channels.push(new Float32Array(frames));
    let q = dataAt;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < nch; c++) {
            let v: number;
            if (isFloat) v = bits === 64 ? view.getFloat64(q, true) : view.getFloat32(q, true);
            else if (bits === 8) v = (view.getUint8(q) - 128) / 128;
            else if (bits === 16) v = view.getInt16(q, true) / 32768;
            else if (bits === 24) {
                let s = view.getUint8(q) | (view.getUint8(q + 1) << 8) | (view.getUint8(q + 2) << 16);
                if (s & 0x800000) s -= 0x1000000;
                v = s / 8388608;
            } else if (bits === 32) v = view.getInt32(q, true) / 2147483648;
            else throw new Error(`Unsupported WAV bit depth ${bits}.`);
            channels[c][i] = v;
            q += bytesPer;
        }
    }
    const markers: Marker[] = cues
        .filter((c) => c.position <= frames)
        .sort((a, b) => a.position - b.position)
        .map((c, i) => ({ id: i + 1, name: names.get(c.id) || `Marker ${i + 1}`, position: c.position }));
    if (loop && (loop.start >= frames || loop.end > frames)) loop = { start: Math.min(loop.start, frames), end: Math.min(loop.end, frames) };
    if (loop && loop.end <= loop.start) loop = null;
    return { sampleRate, channels, markers, loop, bitDepth: bits, float: isFloat };
}
