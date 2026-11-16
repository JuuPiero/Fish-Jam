/**
 * Audio Editor worker: runs effects and encoders off the editor's UI thread.
 * Messages: { id, type: 'effect' | 'encode', payload }. Replies with
 * { id, ok, result } / { id, ok: false, error } and { id, progress }.
 * Channel buffers are transferred, not copied.
 */
import { runEffect, EffectRequest } from '../../shared/audio/effects';
import { encodeAudio, EncoderWasm, ExportOptions } from '../../shared/audio/export';
import { AudioData, LoopRegion, Marker } from '../../shared/audio/types';

export interface EncodeJob {
    data: AudioData;
    options: ExportOptions;
    wasm: EncoderWasm;
    extra: { markers?: Marker[]; loop?: LoopRegion | null };
}

const ctx: any = typeof self !== 'undefined' ? self : null;

if (ctx && typeof ctx.postMessage === 'function' && typeof (ctx as any).document === 'undefined') {
    ctx.onmessage = async (ev: MessageEvent) => {
        const { id, type, payload } = ev.data || {};
        try {
            if (type === 'effect') {
                const r = runEffect(payload as EffectRequest);
                ctx.postMessage({ id, ok: true, result: r }, r.channels.map((c) => c.buffer));
            } else if (type === 'encode') {
                const job = payload as EncodeJob;
                let last = 0;
                const bytes = await encodeAudio(job.data, job.options, job.wasm, job.extra, (f) => {
                    if (f - last >= 0.02 || f >= 1) {
                        last = f;
                        ctx.postMessage({ id, progress: f });
                    }
                });
                ctx.postMessage({ id, ok: true, result: bytes }, [bytes.buffer]);
            } else {
                throw new Error(`Unknown job type ${type}`);
            }
        } catch (e: any) {
            ctx.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
        }
    };
}
