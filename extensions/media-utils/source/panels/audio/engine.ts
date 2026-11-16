/**
 * Runs effects and encoders in a Web Worker (created from the bundled worker
 * source through a Blob URL). If a worker cannot be created, the same code runs
 * on the panel's thread instead, after a short delay so the UI can show "Working".
 */
import workerSource from 'virtual:audio-worker';
import { runEffect, EffectRequest, EffectResult } from '../../shared/audio/effects';
import { encodeAudio } from '../../shared/audio/export';
import type { EncodeJob } from './worker';

interface Pending {
    resolve: (v: any) => void;
    reject: (e: any) => void;
    progress?: (f: number) => void;
}

export class AudioEngine {
    private worker: Worker | null = null;
    private url = '';
    private nextId = 1;
    private pending = new Map<number, Pending>();
    /** Why the worker is not used (empty when it is). */
    workerError = '';

    constructor() {
        try {
            this.url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
            this.worker = new Worker(this.url);
            this.worker.onmessage = (ev) => this.onMessage(ev.data);
            this.worker.onerror = (ev) => {
                this.workerError = ev.message || 'worker error';
                console.warn('[Media Utils] Audio worker failed, falling back to the panel thread:', ev.message);
                this.failAll(new Error(this.workerError));
                this.disposeWorker();
            };
        } catch (e: any) {
            this.workerError = e && e.message ? e.message : String(e);
            this.worker = null;
        }
    }

    get usesWorker(): boolean {
        return !!this.worker;
    }

    private onMessage(msg: any): void {
        const p = this.pending.get(msg.id);
        if (!p) return;
        if (msg.progress !== undefined) {
            if (p.progress) p.progress(msg.progress);
            return;
        }
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error));
    }

    private failAll(err: Error): void {
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
    }

    private post(type: string, payload: any, transfer: Transferable[], progress?: (f: number) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            this.pending.set(id, { resolve, reject, progress });
            this.worker!.postMessage({ id, type, payload }, transfer);
        });
    }

    /** `req.channels` is transferred to the worker (pass copies). */
    async effect(req: EffectRequest): Promise<EffectResult> {
        if (this.worker) {
            try {
                return await this.post('effect', req, req.channels.map((c) => c.buffer));
            } catch (e) {
                if (this.worker) throw e; // a real effect error
                // The worker died: the buffers were transferred, so the caller must retry with fresh copies.
                throw new Error('The audio worker stopped; please try again.');
            }
        }
        await later();
        return runEffect(req);
    }

    /** `job.data.channels` is transferred to the worker (pass copies). */
    async encode(job: EncodeJob, progress?: (f: number) => void): Promise<Uint8Array> {
        if (this.worker) return this.post('encode', job, job.data.channels.map((c) => c.buffer), progress);
        await later();
        return encodeAudio(job.data, job.options, job.wasm, job.extra, progress);
    }

    private disposeWorker(): void {
        if (this.worker) this.worker.terminate();
        this.worker = null;
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = '';
    }

    dispose(): void {
        this.failAll(new Error('Audio engine closed.'));
        this.disposeWorker();
    }
}

function later(): Promise<void> {
    return new Promise((r) => setTimeout(r, 16));
}
