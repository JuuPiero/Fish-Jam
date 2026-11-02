/**
 * Checks capture.ts in a real browser: the WebGL2 async readback (right
 * pixels, GL bindings restored, never blocks) and the JPEG encoder (worker and
 * fallback). Open out/capture.html#interact.
 */
import { AsyncReadback, JpegEncoder } from '../../source/capture';

const out: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => out.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
const nextTask = () => new Promise((r) => setTimeout(r, 0));

/** A texture whose rows are coloured by row number, plus the bytes uploaded. */
function makeTexture(gl: WebGL2RenderingContext, w: number, h: number) {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            data[i] = y < h / 2 ? 220 : 20; // red in the first half of the rows
            data[i + 1] = (x * 255) / (w - 1);
            data[i + 2] = y < h / 2 ? 20 : 200; // blue in the second half
            data[i + 3] = x === 0 ? 0 : 255; // a transparent column
        }
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, data };
}

async function pollUntil(rb: AsyncReadback) {
    for (let i = 0; i < 200; i++) {
        await nextTask();
        const r = rb.poll();
        if (r) return { r, tasks: i + 1 };
    }
    return { r: null, tasks: 200 };
}

async function decodeJpeg(bytes: ArrayBuffer, w: number, h: number) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, w, h).data;
}

async function run() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
        check('WebGL2 available in this browser', false);
        return;
    }
    const W = 64;
    const H = 32;
    const { tex, data } = makeTexture(gl, W, H);

    // State an engine would have bound (and caches).
    const engineFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, engineFbo);
    const enginePack = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, enginePack);

    const rb = new AsyncReadback(gl);
    rb.start(tex, W, H, 7);
    check('bindings restored after start', gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === engineFbo
        && gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === engineFbo && gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === enginePack);
    check('busy while copying', rb.busy && rb.pendingTag === 7);
    let threw = false;
    try {
        rb.start(tex, W, H, 8);
    } catch {
        threw = true;
    }
    check('one copy at a time', threw);
    const t0 = performance.now();
    const same = rb.poll();
    const pollMs = performance.now() - t0;
    check('poll never blocks', pollMs < 20, pollMs);

    const { r, tasks } = same ? { r: same, tasks: 0 } : await pollUntil(rb);
    check('copy finishes', !!r, tasks);
    if (!r) return;
    check('right size and tag', r.width === W && r.height === H && r.tag === 7);
    let diff = 0;
    for (let i = 0; i < data.length; i++) diff = Math.max(diff, Math.abs(r.pixels[i] - data[i]));
    check('pixels equal the texture', diff === 0, diff);
    check('bindings restored after poll', gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === enginePack);
    check('free again', !rb.busy);

    // Another texture and size: re-attaches and resizes the buffer.
    const second = makeTexture(gl, 16, 8);
    rb.start(second.tex, 16, 8, 9);
    const again = await pollUntil(rb);
    check('another texture / size', !!again.r && again.r.width === 16 && again.r.pixels[0] === second.data[0] && again.r.tag === 9);

    // Dropping a copy in flight.
    rb.start(tex, W, H, 10);
    rb.drop();
    check('drop', !rb.busy && rb.poll() === null);
    rb.dispose();

    // Encoders: GL rows are bottom-up, so flipping puts the first uploaded rows (red) at the bottom.
    for (const useWorker of [true, false]) {
        const enc = new JpegEncoder(useWorker);
        const name = useWorker ? `encoder (${enc.mode})` : 'encoder (main thread)';
        const px = enc.buffer(W * H * 4);
        px.set(data);
        const jpeg = await enc.encode(px, W, H, true, 0.9);
        const img = await decodeJpeg(jpeg, W, H);
        const at = (x: number, y: number) => [...img.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
        const top = at(W / 2, 2);
        const bottom = at(W / 2, H - 3);
        check(`${name}: flipped`, top[2] > 150 && top[0] < 80 && bottom[0] > 150 && bottom[2] < 80, { top, bottom });
        const edge = at(0, 2);
        check(`${name}: transparent pixels become opaque, not black`, edge[3] === 255 && edge[2] > 150, edge);
        if (useWorker) check('the worker is used', enc.mode === 'worker', enc.mode);
        // The pixel buffer comes back for reuse.
        const reused = enc.buffer(W * H * 4);
        check(`${name}: buffer reused`, reused.buffer.byteLength >= W * H * 4);
        enc.dispose();
    }
}

run()
    .catch((e) => check('exception', false, String(e?.stack || e)))
    .finally(() => {
        const pre = document.createElement('pre');
        pre.id = 'result';
        pre.textContent = out.join('\n');
        document.body.appendChild(pre);
    });
