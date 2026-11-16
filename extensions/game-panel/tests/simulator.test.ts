import assert from 'assert';
import { cutoutPath, cutoutTransform, deviceLayout, DEVICES, findDevice, Orientation, pointerOnScreen, rotateRect, safeFractions, safeRect } from '../source/devices';

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

const ORIENTATIONS: Orientation[] = ['portrait', 'landscapeLeft', 'landscapeRight'];
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('\nsimulator: device data');

test('ids are unique and the default exists', () => {
    const ids = DEVICES.map((d) => d.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.ok(DEVICES.length >= 16, `${DEVICES.length} devices`);
    assert.strictEqual(findDevice('nope').id, 'iphone-14-pro');
});

test('insets are inside the screen and leave a safe rect in every orientation', () => {
    for (const d of DEVICES) {
        for (const o of ORIENTATIONS) {
            const l = deviceLayout(d, o);
            const s = l.safe;
            for (const v of [s.top, s.bottom, s.left, s.right]) assert.ok(v >= 0, `${d.id} ${o} negative inset`);
            const r = safeRect(l);
            assert.ok(r.w > l.screenW * 0.5 && r.h > l.screenH * 0.5, `${d.id} ${o} safe rect ${JSON.stringify(r)}`);
        }
    }
});

test('the cutout is on the screen and the portrait safe area covers it', () => {
    for (const d of DEVICES) {
        if (d.cutout.kind === 'none') continue;
        const c = d.cutout;
        assert.ok(c.width < d.width && c.top + c.height < d.height, `${d.id} cutout outside`);
        assert.ok(d.safe.portrait.top >= c.top + c.height, `${d.id}: safe top ${d.safe.portrait.top} < cutout bottom ${c.top + c.height}`);
    }
});

test('iOS insets match the points × scale (notch, Dynamic Island, landscape)', () => {
    const x = findDevice('iphone-x');
    assert.deepStrictEqual(x.safe.portrait, { top: 132, bottom: 102, left: 0, right: 0 });
    assert.deepStrictEqual(x.safe.landscape, { top: 0, bottom: 63, left: 132, right: 132 });
    const pro = findDevice('iphone-14-pro');
    assert.strictEqual(pro.safe.portrait.top, 177);
    assert.strictEqual(findDevice('iphone-11').safe.portrait.top, 96);
});

console.log('\nsimulator: orientation');

test('landscape swaps the resolution and moves the bezels with the device', () => {
    const d = findDevice('iphone-8');
    const p = deviceLayout(d, 'portrait');
    const ll = deviceLayout(d, 'landscapeLeft');
    const lr = deviceLayout(d, 'landscapeRight');
    assert.deepStrictEqual([p.screenW, p.screenH], [750, 1334]);
    assert.deepStrictEqual([ll.screenW, ll.screenH], [1334, 750]);
    // top of the device to the left: the top bezel is on the left, the chin (home button) on the right
    assert.deepStrictEqual([ll.frame.left, ll.frame.right], [d.bezel.top, d.bezel.bottom]);
    assert.deepStrictEqual([lr.frame.left, lr.frame.right], [d.bezel.bottom, d.bezel.top]);
    assert.ok(ll.homeButton!.cx > ll.frame.left + ll.screenW, 'home button right of the screen (landscape left)');
    assert.ok(lr.homeButton!.cx < lr.frame.left, 'home button left of the screen (landscape right)');
    assert.ok(near(p.homeButton!.cx, p.totalW / 2) && p.homeButton!.cy > p.frame.top + p.screenH, 'portrait: under the screen');
    for (const l of [p, ll, lr]) assert.ok(near(l.totalW, l.screenW + l.frame.left + l.frame.right) && near(l.totalH, l.screenH + l.frame.top + l.frame.bottom));
});

test('the cutout turns with the device (left / right, centred)', () => {
    const d = findDevice('iphone-14-pro');
    const ll = deviceLayout(d, 'landscapeLeft');
    const lr = deviceLayout(d, 'landscapeRight');
    const a = ll.cutout!;
    const b = lr.cutout!;
    assert.ok(a.x + a.w < ll.screenW / 4, 'island on the left');
    assert.ok(b.x > lr.screenW * 0.75, 'island on the right');
    assert.ok(near(a.y + a.h / 2, ll.screenH / 2, 0.5) && near(b.y + b.h / 2, lr.screenH / 2, 0.5), 'vertically centred');
    assert.deepStrictEqual([a.w, a.h], [d.cutout.height, d.cutout.width]);
    // the notch side inset covers the cutout
    assert.ok(ll.safe.left >= a.x + a.w && lr.safe.right >= lr.screenW - b.x, 'landscape insets cover the island');
});

test('landscape right mirrors landscape left (Android: inset only on the cutout side)', () => {
    const d = findDevice('pixel-7');
    const ll = deviceLayout(d, 'landscapeLeft');
    const lr = deviceLayout(d, 'landscapeRight');
    assert.deepStrictEqual([ll.safe.left, ll.safe.right], [118, 0]);
    assert.deepStrictEqual([lr.safe.left, lr.safe.right], [0, 118]);
    assert.ok(lr.cutout!.x > lr.screenW / 2, 'punch hole on the right');
});

test('rotateRect keeps rects inside the rotated screen', () => {
    const r = { x: 10, y: 20, w: 30, h: 40 };
    for (const o of ORIENTATIONS) {
        const q = rotateRect(r, o, 100, 200);
        const W = o === 'portrait' ? 100 : 200;
        const H = o === 'portrait' ? 200 : 100;
        assert.ok(q.x >= 0 && q.y >= 0 && q.x + q.w <= W && q.y + q.h <= H, `${o} ${JSON.stringify(q)}`);
    }
    assert.deepStrictEqual(rotateRect({ x: 0, y: 0, w: 0, h: 0 }, 'landscapeLeft', 100, 200), { x: 0, y: 100, w: 0, h: 0 }, 'top-left goes bottom-left');
    assert.deepStrictEqual(rotateRect({ x: 0, y: 0, w: 0, h: 0 }, 'landscapeRight', 100, 200), { x: 200, y: 0, w: 0, h: 0 }, 'top-left goes top-right');
});

console.log('\nsimulator: safe area and pointer');

test('safe area in game pixels and as fractions', () => {
    const l = deviceLayout(findDevice('iphone-14-pro'), 'portrait');
    assert.deepStrictEqual(safeRect(l), { x: 0, y: 177, w: 1179, h: 2556 - 177 - 102 });
    const f = safeFractions(l);
    assert.ok(near(f.top, 177 / 2556) && near(f.bottom, 102 / 2556) && f.left === 0);
    const ll = deviceLayout(findDevice('iphone-14-pro'), 'landscapeLeft');
    const g = safeFractions(ll);
    assert.ok(near(g.left, 177 / 2556) && near(g.right, 177 / 2556) && near(g.bottom, 63 / 1179) && g.top === 0);
});

test('pointer: inside the screen maps to (u, v); the bezel is outside', () => {
    const screen = { left: 100, top: 50, width: 200, height: 400 };
    const a = pointerOnScreen(150, 150, screen);
    assert.ok(near(a.u, 0.25) && near(a.v, 0.25) && a.inside);
    assert.strictEqual(pointerOnScreen(95, 150, screen).inside, false);
    assert.strictEqual(pointerOnScreen(150, 460, screen).inside, false);
    const c = pointerOnScreen(300, 450, screen);
    assert.ok(near(c.u, 1) && near(c.v, 1) && c.inside, 'edges count');
});

test('cutout paths and their rotation', () => {
    for (const k of ['notch', 'island', 'punch', 'waterdrop'] as const) assert.ok(/^M.*Z$/.test(cutoutPath(k, 100, 30)), k);
    assert.strictEqual(cutoutPath('none', 10, 10), '');
    assert.strictEqual(cutoutTransform('portrait', 100, 30), '');
    assert.strictEqual(cutoutTransform('landscapeLeft', 100, 30), 'translate(0 100) rotate(-90)');
    assert.strictEqual(cutoutTransform('landscapeRight', 100, 30), 'translate(30 0) rotate(90)');
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exitCode = 1;
