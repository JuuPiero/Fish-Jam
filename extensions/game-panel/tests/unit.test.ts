import assert from 'assert';
import { fitToWindow } from '../source/camera-fit';
import { fromBase64, toBase64, toOpaqueImage } from '../source/capture';
import { FramePacer, frameInterval } from '../source/pacing';

const results = { passed: 0, failed: 0 };
function test(name: string, fn: () => void) {
    try {
        fn();
        results.passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  FAIL ${name}\n       ${String((e as Error).message).split('\n').join('\n       ')}`);
    }
}

/** Frames run in one second of rAFs every `rafMs` (with optional jitter). */
function ticksPerSecond(rafMs: number, fps: number, jitter = 0): number {
    const p = new FramePacer();
    p.interval = frameInterval(fps);
    let n = 0;
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    for (let t = 0; t < 1000; t += rafMs + rand() * jitter) if (p.due(t)) n++;
    return n;
}

console.log('\npacing');

test('60 fps on a 144 Hz screen', () => {
    const n = ticksPerSecond(1000 / 144, 60);
    assert.ok(n >= 59 && n <= 61, String(n));
});

test('60 fps on a 60 Hz screen ticks every frame', () => {
    const n = ticksPerSecond(1000 / 60, 60, 0.5);
    assert.ok(n >= 59 && n <= 61, String(n));
});

test('a slow screen (30 Hz) ticks every frame', () => {
    const n = ticksPerSecond(1000 / 30, 60);
    assert.ok(n >= 29 && n <= 31, String(n));
});

test('30 fps games on 144 Hz, with jitter', () => {
    const n = ticksPerSecond(1000 / 144, 30, 1.5);
    assert.ok(n >= 29 && n <= 31, String(n));
});

test('after a long stall the schedule starts over (no burst)', () => {
    const p = new FramePacer();
    p.interval = frameInterval(60);
    assert.ok(p.due(0));
    assert.ok(p.due(1000), 'stalled frame runs');
    assert.ok(!p.due(1007), 'no catch-up burst');
    assert.ok(p.due(1017));
});

test('frameRate values', () => {
    assert.strictEqual(frameInterval(60), 1000 / 60);
    assert.strictEqual(frameInterval('30'), 1000 / 30);
    assert.strictEqual(frameInterval(0), 1000 / 60);
    assert.strictEqual(frameInterval(undefined), 1000 / 60);
    assert.strictEqual(frameInterval(1000), 1000 / 240);
});

console.log('\npixels');

test('flips GL rows and makes pixels opaque', () => {
    // 2x2: bottom row first (as glReadPixels returns it).
    const src = new Uint8Array([1, 2, 3, 0, 4, 5, 6, 10, 7, 8, 9, 0, 10, 11, 12, 255]);
    const flipped = toOpaqueImage(src, 2, 2, true);
    assert.deepStrictEqual([...flipped], [7, 8, 9, 255, 10, 11, 12, 255, 1, 2, 3, 255, 4, 5, 6, 255]);
    const kept = toOpaqueImage(src, 2, 2, false);
    assert.deepStrictEqual([...kept], [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
});

test('reuses the output buffer and reads a larger source', () => {
    const out = new Uint8ClampedArray(4);
    const src = new Uint8Array([9, 9, 9, 9, 1, 1, 1, 1]);
    assert.strictEqual(toOpaqueImage(src, 1, 1, false, out), out);
    assert.deepStrictEqual([...out], [9, 9, 9, 255]);
});

test('base64 round trip', () => {
    const bytes = new Uint8Array(70000).map((_, i) => (i * 7) & 255);
    const b64 = toBase64(bytes.buffer);
    assert.strictEqual(b64, Buffer.from(bytes).toString('base64'));
    assert.deepStrictEqual(fromBase64(b64), bytes);
});

console.log('\ncamera sizing');

/** Like Cocos' render camera: resize() only marks the projection dirty, update() rebuilds it. */
class FakeCamera {
    width = 0;
    height = 0;
    projAspect = 0;
    dirty = false;
    resizes = 0;
    resize(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.dirty = true;
        this.resizes++;
    }
    update() {
        if (this.dirty) this.projAspect = this.width / this.height;
        this.dirty = false;
    }
    /** A ray's x for screen x: uses the size now, but the projection built at the last update. */
    rayX(screenX: number) {
        return ((screenX / this.width) * 2 - 1) * this.projAspect;
    }
}

test('a parked camera fitted to the screen raycasts like the screen', () => {
    const temp = { width: 275, height: 597 }; // PIE's device size, kept by the temp window
    const main = { width: 960, height: 540 }; // the game's real screen after the aspect change
    const cam = new FakeCamera();
    fitToWindow(cam, temp);
    cam.update();
    // The mouse at the screen's right edge should give the right edge of the view (x = aspect).
    const stale = cam.rayX(main.width);
    fitToWindow(cam, main);
    const notUpdated = cam.rayX(main.width);
    cam.update();
    const fixed = cam.rayX(main.width);
    assert.ok(Math.abs(stale - main.width / main.height) > 0.5, `stale ${stale}`);
    assert.ok(Math.abs(notUpdated - main.width / main.height) > 0.5, 'resize alone is not enough');
    assert.ok(Math.abs(fixed - main.width / main.height) < 1e-9, `fixed ${fixed}`);
});

test('fitting only resizes when the size differs, and follows rotated surfaces', () => {
    const cam = new FakeCamera();
    fitToWindow(cam, { width: 100, height: 50 });
    fitToWindow(cam, { width: 100, height: 50 });
    assert.strictEqual(cam.resizes, 1);
    fitToWindow(cam, { width: 100, height: 50, swapchain: { surfaceTransform: 1 } });
    assert.deepStrictEqual([cam.width, cam.height], [50, 100]);
    fitToWindow(cam, null);
    fitToWindow(cam, { width: 0, height: 10 });
    assert.deepStrictEqual([cam.width, cam.height, cam.resizes], [50, 100, 2]);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exitCode = results.failed ? 1 : 0;
