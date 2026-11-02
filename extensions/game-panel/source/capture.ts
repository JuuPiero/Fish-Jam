/**
 * Getting the Game view's pixels out of the GPU without stalling it.
 *
 * RenderTexture.readPixels is a synchronous glReadPixels: the GPU must finish
 * everything queued before it returns, and Chromium's GPU process is shared by
 * the whole editor, so every captured frame froze the editor for that long.
 * AsyncReadback copies the texture into a pixel buffer (PBO) and waits on a
 * fence instead; the bytes are fetched on a later call, once the copy is done.
 *
 * JpegEncoder turns the pixels into JPEG on a worker thread, off the game's
 * thread. Both fall back to the old way when something isn't available.
 */

export interface Readback {
    pixels: Uint8Array;
    width: number;
    height: number;
    /** What the caller tagged the copy with (the frame id). */
    tag: number;
}

const GIVE_UP_MS = 2000;

/** One texture -> PBO copy in flight at a time (WebGL2 only). */
export class AsyncReadback {
    private fbo: WebGLFramebuffer | null;
    private pbo: WebGLBuffer | null;
    private size = 0;
    private attached: WebGLTexture | null = null;
    private pending: { sync: WebGLSync; width: number; height: number; tag: number; at: number } | null = null;

    constructor(private gl: WebGL2RenderingContext) {
        this.fbo = gl.createFramebuffer();
        this.pbo = gl.createBuffer();
        if (!this.fbo || !this.pbo) throw new Error('could not create readback objects');
    }

    get busy(): boolean {
        return !!this.pending;
    }

    get pendingTag(): number {
        return this.pending ? this.pending.tag : -1;
    }

    /**
     * Queues a copy of `texture` (RGBA8). Restores every binding it touches,
     * so the engine's own state cache stays right.
     */
    start(texture: WebGLTexture, width: number, height: number, tag: number) {
        if (this.pending) throw new Error('a readback is already in flight');
        const gl = this.gl;
        const len = width * height * 4;
        const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
        const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        try {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
            if (this.attached !== texture) {
                gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                this.attached = texture;
                const status = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
                if (status !== gl.FRAMEBUFFER_COMPLETE) {
                    this.attached = null;
                    throw new Error(`readback framebuffer incomplete (0x${status.toString(16)})`);
                }
            }
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
            if (this.size !== len) {
                gl.bufferData(gl.PIXEL_PACK_BUFFER, len, gl.STREAM_READ);
                this.size = len;
            }
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        } finally {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!sync) throw new Error('fenceSync failed');
        gl.flush();
        this.pending = { sync, width, height, tag, at: performance.now() };
    }

    /**
     * The copied pixels (rows bottom-up) once the GPU is done, else null. Never
     * waits. `alloc` provides the buffer to read into.
     */
    poll(alloc?: (bytes: number) => Uint8Array): Readback | null {
        const p = this.pending;
        if (!p) return null;
        const gl = this.gl;
        const status = gl.clientWaitSync(p.sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) {
            if (performance.now() - p.at > GIVE_UP_MS) this.drop();
            return null;
        }
        gl.deleteSync(p.sync);
        this.pending = null;
        if (status === gl.WAIT_FAILED) return null;
        const len = p.width * p.height * 4;
        const given = alloc?.(len);
        const out = given && given.length >= len ? given.subarray(0, len) : new Uint8Array(len);
        const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        try {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out, 0, len);
        } finally {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
        }
        return { pixels: out, width: p.width, height: p.height, tag: p.tag };
    }

    /** Forget the copy in flight (e.g. the texture was resized). */
    drop() {
        if (!this.pending) return;
        this.gl.deleteSync(this.pending.sync);
        this.pending = null;
    }

    dispose() {
        this.drop();
        this.gl.deleteFramebuffer(this.fbo);
        this.gl.deleteBuffer(this.pbo);
        this.fbo = null;
        this.pbo = null;
        this.attached = null;
    }
}

// ----------------------------------------------------------------- encoding

/**
 * Pixels -> opaque, top-down RGBA: flips GL's bottom-up rows when asked and
 * sets alpha to 255 (a cleared alpha of 0 would encode as black).
 */
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export function toOpaqueImage(src: Uint8Array, width: number, height: number, flip: boolean, out?: Pixels): Pixels {
    const len = width * height * 4;
    const dst = out && out.length === len ? out : new Uint8ClampedArray(len);
    const row = width * 4;
    if (flip) {
        for (let y = 0; y < height; y++) dst.set(src.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    } else {
        dst.set(src.subarray(0, len));
    }
    // Little-endian: alpha is the high byte of each 32-bit pixel.
    const px = new Uint32Array(dst.buffer, dst.byteOffset, len >> 2);
    for (let i = 0; i < px.length; i++) px[i] |= 0xff000000;
    return dst;
}

/** The worker's code, built from the same function the main thread falls back to. */
const WORKER_SOURCE = `
const toOpaqueImage = (${toOpaqueImage.toString()});
let canvas = null;
let ctx = null;
let image = null;
self.onmessage = async (e) => {
    const { id, buffer, width, height, flip, quality } = e.data;
    try {
        image = toOpaqueImage(new Uint8Array(buffer), width, height, flip, image && image.length === width * height * 4 ? image : undefined);
        if (!canvas || canvas.width !== width || canvas.height !== height) {
            canvas = new OffscreenCanvas(width, height);
            ctx = canvas.getContext('2d');
        }
        ctx.putImageData(new ImageData(image, width, height), 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        const jpeg = await blob.arrayBuffer();
        self.postMessage({ id, ok: true, jpeg, buffer }, [jpeg, buffer]);
    } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.message || err), buffer }, [buffer]);
    }
};
`;

interface Job {
    resolve(v: ArrayBuffer): void;
    reject(e: Error): void;
}

/** JPEG encoding on a worker (pixels are transferred, not copied), or on this thread. */
export class JpegEncoder {
    private worker: Worker | null = null;
    private jobs = new Map<number, Job>();
    private seq = 0;
    private spare: ArrayBuffer[] = [];
    private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
    private image: Pixels | null = null;
    /** 'worker' or 'main' (after the worker failed or wasn't available). */
    mode: 'worker' | 'main' = 'main';

    constructor(useWorker = true) {
        if (!useWorker || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
        try {
            const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
            this.worker = new Worker(url);
            URL.revokeObjectURL(url);
            this.worker.onmessage = (e) => this.onMessage(e.data);
            this.worker.onerror = (e) => this.fail(new Error(e.message || 'encoder worker error'));
            this.mode = 'worker';
        } catch {
            this.worker = null;
        }
    }

    /** A buffer of at least `size` bytes to read pixels into (reused between frames). */
    buffer(size: number): Uint8Array {
        const i = this.spare.findIndex((b) => b.byteLength >= size);
        const buf = i >= 0 ? this.spare.splice(i, 1)[0] : new ArrayBuffer(size);
        return new Uint8Array(buf, 0, size);
    }

    /** Encodes `pixels` (from buffer(); handed over, don't use it afterwards). */
    encode(pixels: Uint8Array, width: number, height: number, flip: boolean, quality: number): Promise<ArrayBuffer> {
        if (this.worker) {
            const id = ++this.seq;
            const worker = this.worker;
            // If the worker dies the job is rejected (that frame is lost) and later frames encode here.
            return new Promise<ArrayBuffer>((resolve, reject) => {
                this.jobs.set(id, { resolve, reject });
                worker.postMessage({ id, buffer: pixels.buffer, width, height, flip, quality }, [pixels.buffer]);
            });
        }
        return this.encodeHere(pixels, width, height, flip, quality);
    }

    private async encodeHere(pixels: Uint8Array, width: number, height: number, flip: boolean, quality: number): Promise<ArrayBuffer> {
        try {
            this.image = toOpaqueImage(pixels, width, height, flip, this.image && this.image.length === width * height * 4 ? this.image : undefined);
            if (!this.canvas) this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
            const canvas = this.canvas as any;
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            canvas.getContext('2d').putImageData(new ImageData(this.image, width, height), 0, 0);
            const blob: Blob = canvas.convertToBlob
                ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
                : await new Promise<Blob>((resolve) => canvas.toBlob((b: Blob) => resolve(b), 'image/jpeg', quality));
            return await blob.arrayBuffer();
        } finally {
            this.recycle(pixels.buffer as ArrayBuffer);
        }
    }

    private recycle(buf: ArrayBuffer) {
        if (buf.byteLength && this.spare.length < 3) this.spare.push(buf);
    }

    private onMessage(m: { id: number; ok: boolean; jpeg?: ArrayBuffer; error?: string; buffer?: ArrayBuffer }) {
        if (m.buffer) this.recycle(m.buffer);
        const job = this.jobs.get(m.id);
        if (!job) return;
        this.jobs.delete(m.id);
        if (m.ok && m.jpeg) job.resolve(m.jpeg);
        else job.reject(new Error(m.error || 'encode failed'));
    }

    private fail(e: Error) {
        this.worker?.terminate();
        this.worker = null;
        this.mode = 'main';
        for (const job of this.jobs.values()) job.reject(e);
        this.jobs.clear();
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.jobs.clear();
        this.spare = [];
    }
}

/** Base64 of bytes (Node's Buffer when there is one; it is native). */
export function toBase64(bytes: ArrayBuffer): string {
    const B = (globalThis as any).Buffer;
    if (B) return B.from(bytes).toString('base64');
    let s = '';
    const u8 = new Uint8Array(bytes);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
    return btoa(s);
}

/** Bytes of base64 (Node's Buffer when there is one). */
export function fromBase64(data: string): Uint8Array {
    const B = (globalThis as any).Buffer;
    if (B) return new Uint8Array(B.from(data, 'base64'));
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
