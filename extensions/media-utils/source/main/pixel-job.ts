/**
 * Pixel jobs on raw RGBA, run in a worker thread when possible (see
 * pixel-worker.ts) or inline as a fallback.
 */
import * as path from 'path';
import { AdjustOptions } from '../shared/image/options';
import { adjustPixels, alphaBleed, hasTransparency, opaqueBounds, premultiply, Rect } from '../shared/image/pixels';

export interface PixelJob {
    width: number;
    height: number;
    /** Return the bounding box of pixels with alpha above this. */
    boundsThreshold?: number;
    adjust?: AdjustOptions;
    alpha?: 'bleed' | 'premultiply';
    /** Count distinct colours up to this limit. */
    countColours?: number;
    /** Report whether any pixel is not opaque. */
    transparency?: boolean;
}

export interface PixelResult {
    bounds?: Rect | null;
    colours?: number;
    transparent?: boolean;
}

/** Number of distinct RGBA colours, counting stops at limit + 1. */
export function countColours(rgba: Uint8Array, limit: number): number {
    const seen = new Set<number>();
    for (let i = 0; i < rgba.length; i += 4) {
        const key = ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]) >>> 0;
        if (!seen.has(key)) {
            seen.add(key);
            if (seen.size > limit) return seen.size;
        }
    }
    return seen.size;
}

/** Runs the job in place on `data` (adjust / alpha modify it). */
export function runPixelJob(data: Uint8Array, job: PixelJob): PixelResult {
    const out: PixelResult = {};
    if (job.boundsThreshold !== undefined) out.bounds = opaqueBounds(data, job.width, job.height, job.boundsThreshold);
    if (job.adjust) adjustPixels(data, job.adjust);
    if (job.alpha === 'premultiply') premultiply(data);
    else if (job.alpha === 'bleed') alphaBleed(data, job.width, job.height);
    if (job.transparency) out.transparent = hasTransparency(data);
    if (job.countColours !== undefined) out.colours = countColours(data, job.countColours);
    return out;
}

// ---------------------------------------------------------------- client

let worker: any = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

/** Below this many pixels the job runs inline (posting costs more than it saves). */
const INLINE_PIXELS = 512 * 512;

function getWorker(): any {
    if (worker || workerFailed) return worker;
    try {
        const { Worker } = require('worker_threads');
        const file = path.join(__dirname, 'pixel-worker.js');
        if (!require('fs').existsSync(file)) throw new Error('pixel-worker.js not found');
        worker = new Worker(file);
        worker.unref();
        worker.on('message', (msg: any) => {
            const p = pending.get(msg.id);
            if (!p) return;
            pending.delete(msg.id);
            if (msg.ok) p.resolve(msg);
            else p.reject(new Error(msg.error));
        });
        worker.on('error', (e: any) => {
            console.warn('[Media Utils] pixel worker failed, running inline:', e);
            workerFailed = true;
            worker = null;
            for (const p of pending.values()) p.reject(e);
            pending.clear();
        });
    } catch (e) {
        workerFailed = true;
        worker = null;
    }
    return worker;
}

/**
 * Runs a pixel job, off the main thread for large images. Returns the
 * (possibly new) pixel data and the job's results.
 */
export async function pixelJob(data: Uint8Array, job: PixelJob): Promise<{ data: Uint8Array; result: PixelResult }> {
    const w = job.width * job.height >= INLINE_PIXELS ? getWorker() : null;
    if (!w) {
        const result = runPixelJob(data, job);
        return { data, result };
    }
    // Copy into a plain ArrayBuffer: sharp's buffers are external memory and cannot be transferred.
    const copy = new Uint8Array(data.length);
    copy.set(data);
    try {
        const msg: any = await new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            w.postMessage({ id, job, data: copy.buffer }, [copy.buffer]);
        });
        return { data: new Uint8Array(msg.data), result: msg.result };
    } catch (e) {
        if (!workerFailed) throw e;
        return { data, result: runPixelJob(data, job) };
    }
}

export function disposePixelWorker(): void {
    if (worker) worker.terminate();
    worker = null;
}
