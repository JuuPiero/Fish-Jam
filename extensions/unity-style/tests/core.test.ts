import assert from 'assert';
import { test, results } from './harness';
import { bitIndex, collectNames, LayerTable, lowestBitIndex, matrixCollides, normalizeLayerName, setMatrixPair } from '../assets/core/layers';
import { closestPoint, overlaps, raycastShape, Shape3, sweepShape, travelToPoint, v3 } from '../assets/core/geometry3d';
import { cast2, overlapPoint2, overlaps2, raycast2, Shape2 } from '../assets/core/geometry2d';
import { Mathf } from '../assets/core/mathf';
import {
    CoroutineScheduler, CustomYieldInstruction, PHASE_END_OF_FRAME, PHASE_FIXED, PHASE_UPDATE, WaitForEndOfFrame, WaitForFixedUpdate, WaitForSeconds, WaitUntil, WaitWhile,
} from '../assets/core/coroutines';

function near(a: number, b: number, eps = 1e-4, msg = ''): void {
    assert.ok(Math.abs(a - b) <= eps, msg + ' expected ~' + b + ' got ' + a);
}

// ------------------------------------------------------------ layers

test('layer names: exact, then case/space/underscore-insensitive', () => {
    const t = new LayerTable().addGroupEnum({ DEFAULT: 1, Enemy: 2, 1: 'DEFAULT', NOTBIT: 6 }).addSettingsList([{ index: 2, name: 'IGNORE_RAYCAST' }, { index: 5, name: 'Water' }]);
    assert.strictEqual(t.nameToLayer('DEFAULT'), 0);
    assert.strictEqual(t.nameToLayer('Default'), 0);
    assert.strictEqual(t.nameToLayer('enemy'), 1);
    assert.strictEqual(t.nameToLayer('Ignore Raycast'), 2);
    assert.strictEqual(t.nameToLayer('Nope'), -1);
    assert.strictEqual(t.layerToName(5), 'Water');
    assert.strictEqual(t.layerToName(31), '');
    assert.strictEqual(t.layerToName(1.5), '');
    assert.strictEqual(t.getMask(['Enemy', 'Water', 'Nope']), (1 << 1) | (1 << 5));
    assert.strictEqual(normalizeLayerName(' Ignore_Raycast '), 'ignoreraycast');
});

test('settings names win over enum names', () => {
    const t = new LayerTable().addSettingsList([{ index: 1, name: 'Player' }]).addGroupEnum({ Other: 2 });
    assert.strictEqual(t.layerToName(1), 'Player');
});

test('bit helpers and rest-free name collection', () => {
    assert.strictEqual(bitIndex(1), 0);
    assert.strictEqual(bitIndex(1 << 31), 31);
    assert.strictEqual(bitIndex(6), -1);
    assert.strictEqual(lowestBitIndex(12), 2);
    assert.deepStrictEqual(collectNames('a', 'b', undefined, 'c'), ['a', 'b', 'c']);
    assert.deepStrictEqual(collectNames(['x', 'y']), ['x', 'y']);
});

test('collision matrix pairs are symmetric', () => {
    const m: { [k: string]: number } = { 1: 0xffffffff, 2: 0xffffffff, 8: 0xffffffff };
    setMatrixPair(m, 0, 3, false);
    assert.ok(!matrixCollides(m, 0, 3) && !matrixCollides(m, 3, 0));
    assert.ok(matrixCollides(m, 0, 1));
    setMatrixPair(m, 3, 0, true);
    assert.ok(matrixCollides(m, 0, 3) && matrixCollides(m, 3, 0));
    setMatrixPair(m, 31, 31, false);
    assert.ok(!matrixCollides(m, 31, 31));
});

// ------------------------------------------------------------ 3D geometry

const X = v3(1, 0, 0);
const Y = v3(0, 1, 0);
const Z = v3(0, 0, 1);

test('closest points: sphere, box, capsule, plane (inside returns the point)', () => {
    const out = v3();
    closestPoint(new Shape3().setSphere(v3(0, 0, 0), 1), v3(3, 0, 0), out);
    near(out.x, 1);
    closestPoint(new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(1, 2, 3)), v3(5, 5, 5), out);
    assert.deepStrictEqual([out.x, out.y, out.z], [1, 2, 3]);
    closestPoint(new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(1, 2, 3)), v3(0.5, 0, 0), out);
    near(out.x, 0.5);
    closestPoint(new Shape3().setCapsule(v3(0, -1, 0), v3(0, 1, 0), 0.5), v3(0, 5, 0), out);
    near(out.y, 1.5);
    closestPoint(new Shape3().setPlane(Y, 0), v3(1, 3, 1), out);
    near(out.y, 0);
});

test('overlaps: box-box SAT with rotation, capsule-box, sphere-plane', () => {
    const s = Math.SQRT1_2;
    const rotated = new Shape3().setBox(v3(0, 0, 0), v3(s, 0, -s), Y, v3(s, 0, s), v3(1, 1, 1));
    // a unit box rotated 45 deg reaches sqrt(2) along x
    assert.ok(overlaps(new Shape3().setBox(v3(1.9, 0, 0), X, Y, Z, v3(0.5, 0.5, 0.5)), rotated));
    assert.ok(!overlaps(new Shape3().setBox(v3(2.0, 0, 0), X, Y, Z, v3(0.5, 0.5, 0.5)), rotated));
    assert.ok(overlaps(new Shape3().setCapsule(v3(-5, 1.4, 0), v3(5, 1.4, 0), 0.5), new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(1, 1, 1))));
    assert.ok(!overlaps(new Shape3().setCapsule(v3(-5, 1.6, 0), v3(5, 1.6, 0), 0.5), new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(1, 1, 1))));
    assert.ok(overlaps(new Shape3().setSphere(v3(0, 0.5, 0), 0.6), new Shape3().setPlane(Y, 0)));
    assert.ok(!overlaps(new Shape3().setSphere(v3(0, 0.7, 0), 0.6), new Shape3().setPlane(Y, 0)));
});

test('raycasts: entry distance and normals; rays starting inside miss', () => {
    const h = { t: 0, normal: v3() };
    near(raycastShape(new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(1, 1, 1)), v3(0, 5, 0), v3(0, -1, 0), 100, h), 4);
    near(h.normal.y, 1);
    near(raycastShape(new Shape3().setCapsule(v3(0, -1, 0), v3(0, 1, 0), 0.5), v3(5, 0, 0), v3(-1, 0, 0), 100, h), 4.5);
    near(h.normal.x, 1);
    near(raycastShape(new Shape3().setCapsule(v3(0, -1, 0), v3(0, 1, 0), 0.5), v3(0, 5, 0), v3(0, -1, 0), 100, h), 3.5);
    assert.strictEqual(raycastShape(new Shape3().setSphere(v3(0, 0, 0), 1), v3(0, 0, 0), X, 100, h), -1);
    assert.strictEqual(raycastShape(new Shape3().setSphere(v3(0, 0, 0), 1), v3(0, 0, 0), X, 100, h, true), 0);
});

test('sweeps: sphere/box/capsule against boxes; start overlap returns -2', () => {
    const target = new Shape3().setBox(v3(0, 0, -5), X, Y, Z, v3(1, 1, 1));
    const hit = { t: 0, point: v3(), normal: v3() };
    near(sweepShape(new Shape3().setSphere(v3(0, 0, 0), 0.5), v3(0, 0, -1), 100, target, hit), 3.5, 1e-3);
    near(hit.normal.z, 1, 1e-3);
    near(sweepShape(new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(0.5, 0.5, 0.5)), v3(0, 0, -1), 100, target, hit), 3.5, 1e-3);
    near(hit.normal.z, 1, 1e-3);
    near(sweepShape(new Shape3().setCapsule(v3(0, -0.5, 0), v3(0, 0.5, 0), 0.25), v3(0, 0, -1), 100, target, hit), 3.75, 1e-3);
    assert.strictEqual(sweepShape(new Shape3().setSphere(v3(0, 0, -5), 0.5), v3(0, 0, 1), 100, target, hit), -2);
    assert.strictEqual(sweepShape(new Shape3().setSphere(v3(5, 0, 0), 0.5), v3(0, 0, -1), 100, target, hit), -1);
    // box against plane, analytic
    near(sweepShape(new Shape3().setBox(v3(0, 5, 0), X, Y, Z, v3(1, 1, 1)), v3(0, -1, 0), 100, new Shape3().setPlane(Y, 0), hit), 4, 1e-6);
});

test('travelToPoint recovers a sweep distance from a hit point (Bullet fix-up)', () => {
    near(travelToPoint(new Shape3().setSphere(v3(0, 10, 0), 0.5), v3(0, 2, 0), v3(0, -1, 0)), 7.5);
    near(travelToPoint(new Shape3().setBox(v3(0, 0, 0), X, Y, Z, v3(0.5, 0.5, 0.5)), v3(0.2, 0, -4), v3(0, 0, -1)), 3.5);
});

// ------------------------------------------------------------ 2D geometry

const hit2 = { t: 0, px: 0, py: 0, nx: 0, ny: 0, cx: 0, cy: 0 };

test('2D ray against box and circle', () => {
    near(raycast2(0, 10, 0, -1, 100, new Shape2().setBox(0, 0, 4, 2, 0), hit2), 9);
    near(hit2.ny, 1);
    near(raycast2(10, 0, -1, 0, 100, new Shape2().setCircle(0, 0, 2), hit2), 8);
    near(hit2.nx, 1);
    assert.strictEqual(raycast2(0, 10, 0, 1, 100, new Shape2().setCircle(0, 0, 2), hit2), -1);
    assert.strictEqual(raycast2(0, 0, 1, 0, 100, new Shape2().setBox(0, 0, 4, 2, 0), hit2), 0);
});

test('2D casts: circle, rotated box, capsule; concave polygon', () => {
    const ground = new Shape2().setBox(0, -1, 100, 2, 0);
    near(cast2(new Shape2().setCircle(0, 10, 1), 0, -1, 100, ground, hit2), 9);
    near(hit2.py, 0);
    near(cast2(new Shape2().setBox(0, 10, 2, 2, 45), 0, -1, 100, ground, hit2), 10 - Math.SQRT2, 1e-6);
    near(cast2(new Shape2().setCapsule(0, 9, 0, 11, 0.5), 0, -1, 100, ground, hit2), 8.5);
    // a "U" shape: a ray down the middle passes the notch and hits the bottom
    const u = new Shape2().setPolygon([-3, 0, 3, 0, 3, 4, 1, 4, 1, 1, -1, 1, -1, 4, -3, 4]);
    near(raycast2(0, 10, 0, -1, 100, u, hit2), 9);
    assert.ok(overlapPoint2(u, 2, 3) && !overlapPoint2(u, 0, 3));
    assert.ok(overlaps2(new Shape2().setCircle(0, 2.5, 0.9), u) === false);
    assert.ok(overlaps2(new Shape2().setCircle(0, 2.5, 1.1), u));
});

// ------------------------------------------------------------ Mathf

test('Mathf: Unity rounding, angles, repeat, ping-pong, smooth damp', () => {
    assert.strictEqual(Mathf.Round(2.5), 2);
    assert.strictEqual(Mathf.Round(3.5), 4);
    assert.strictEqual(Mathf.Round(-2.5), -2);
    assert.strictEqual(Mathf.Sign(0), 1);
    near(Mathf.DeltaAngle(350, 10), 20);
    near(Mathf.LerpAngle(350, 10, 0.5), 360);
    near(Mathf.Repeat(-1, 3), 2);
    near(Mathf.PingPong(4, 3), 2);
    near(Mathf.InverseLerp(10, 20, 15), 0.5);
    assert.strictEqual(Mathf.Min(3, 1, 2), 1);
    assert.strictEqual(Mathf.Max([3, 7, 2]), 7);
    assert.strictEqual(Mathf.NextPowerOfTwo(33), 64);
    assert.strictEqual(Mathf.ClosestPowerOfTwo(40), 32);
    const vel = { value: 0 };
    let x = 0;
    for (let i = 0; i < 600; i++) x = Mathf.SmoothDamp(x, 10, vel, 0.3, Infinity, 1 / 60);
    near(x, 10, 1e-3);
    const n = Mathf.PerlinNoise(1.3, 2.7);
    assert.ok(n >= 0 && n <= 1);
    assert.strictEqual(Mathf.PerlinNoise(3, 4), 0.5); // integer lattice points are 0 noise
});

// ------------------------------------------------------------ coroutines

function clock() {
    const c = { t: 0, r: 0, f: 0 };
    const s = new CoroutineScheduler({ time: () => c.t, realtime: () => c.r, frame: () => c.f });
    const frame = (dt = 0.1): void => {
        c.f++;
        c.t += dt;
        c.r += dt;
        s.tick(PHASE_FIXED);
        s.tick(PHASE_UPDATE);
        s.tick(PHASE_END_OF_FRAME);
    };
    return { c, s, frame };
}

test('coroutine yields: null, WaitForSeconds, WaitUntil/While, nested, end of frame, fixed', () => {
    const { s, frame } = clock();
    const log: string[] = [];
    let flag = false;
    function* child(): Generator<any, string, any> {
        log.push('c1');
        yield null;
        log.push('c2');
        return 'r';
    }
    function* main(): Generator<any, void, any> {
        log.push('a');
        yield null;
        log.push('b');
        yield new WaitForSeconds(0.35);
        log.push('c');
        yield new WaitUntil(() => flag);
        log.push('d');
        yield new WaitWhile(() => flag);
        log.push('e');
        yield child();
        log.push('f');
        yield new WaitForEndOfFrame();
        log.push('g');
        yield new WaitForFixedUpdate();
        log.push('h');
    }
    const co = s.start(null, main());
    assert.deepStrictEqual(log, ['a']);
    frame();
    assert.deepStrictEqual(log, ['a', 'b']);
    frame();
    frame();
    frame();
    assert.strictEqual(log.length, 2);
    frame();
    assert.deepStrictEqual(log.slice(2), ['c']);
    frame();
    flag = true;
    frame();
    assert.deepStrictEqual(log.slice(3), ['d']);
    flag = false;
    frame();
    assert.deepStrictEqual(log.slice(4), ['e', 'c1']);
    frame();
    assert.deepStrictEqual(log.slice(6), ['c2', 'f', 'g']);
    frame();
    assert.deepStrictEqual(log.slice(9), ['h']);
    assert.ok(co.isDone);
});

test('coroutine: waiting on another, custom instruction, stop, owner death, errors', () => {
    const { s, frame } = clock();
    const log: string[] = [];
    const owner = { alive: true };
    class Wait3 extends CustomYieldInstruction {
        n = 0;
        get keepWaiting(): boolean {
            return ++this.n < 3;
        }
    }
    function* inner(): Generator<any, void, any> {
        yield null;
        yield null;
        log.push('inner done');
    }
    const innerCo = s.start(owner, inner());
    function* outer(): Generator<any, void, any> {
        yield innerCo;
        log.push('outer after inner');
        yield new Wait3();
        log.push('custom done');
        try {
            yield null;
            yield null;
        } finally {
            log.push('finally');
        }
    }
    const o = s.start(owner, outer());
    for (let i = 0; i < 6; i++) frame();
    assert.deepStrictEqual(log, ['inner done', 'outer after inner', 'custom done']);
    s.stop(o);
    assert.deepStrictEqual(log.slice(3), ['finally']);
    const errs: any[] = [];
    s.onError = (e) => errs.push(e);
    function* bad(): Generator<any, void, any> {
        yield null;
        throw new Error('boom');
    }
    s.start(owner, bad());
    function* forever(): Generator<any, void, any> {
        for (;;) {
            log.push('t');
            yield null;
        }
    }
    s.start(owner, forever());
    frame();
    assert.strictEqual(errs.length, 1);
    owner.alive = false;
    const before = log.length;
    s.tick(PHASE_UPDATE, (ow: any) => ow.alive);
    frame();
    assert.strictEqual(log.length, before);
    assert.strictEqual(s.countFor(owner), 0);
});

test('coroutine: a promise resumes with its value, a rejection is thrown inside', async () => {
    const { s, frame } = clock();
    const log: any[] = [];
    function* p(): Generator<any, void, any> {
        const v = yield Promise.resolve(5);
        log.push(v);
        try {
            yield Promise.reject(new Error('no'));
        } catch (e: any) {
            log.push('caught ' + e.message);
        }
    }
    s.start(null, p());
    await Promise.resolve();
    frame();
    await Promise.resolve();
    await Promise.resolve();
    frame();
    assert.deepStrictEqual(log, [5, 'caught no']);
});

setTimeout(() => {
    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    if (results.failed) process.exitCode = 1;
}, 50);
