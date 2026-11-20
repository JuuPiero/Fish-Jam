import assert from 'assert';
import { v3, V3, M4, dist, dot, sub, normalize, len } from '../assets/core/math';
import {
    buildLine, cleanPoints, expandVertex, simplifyIndices, polylineLength, LineInput, LineAlignment, LineTextureMode,
    FLOATS_PER_VERTEX, KIND_CORNER, KIND_CAP, RGBA,
} from '../assets/core/line-geometry';
import { test, results } from './harness';

const IDENTITY: M4 = {
    m00: 1, m01: 0, m02: 0, m03: 0, m04: 0, m05: 1, m06: 0, m07: 0,
    m08: 0, m09: 0, m10: 1, m11: 0, m12: 0, m13: 0, m14: 0, m15: 1,
};

function input(points: V3[], o: Partial<LineInput> = {}): LineInput {
    return {
        points,
        loop: false,
        width: () => 1,
        color: (_t: number, out: RGBA) => Object.assign(out, { r: 255, g: 255, b: 255, a: 255 }),
        cornerVertices: 0,
        capVertices: 0,
        alignment: LineAlignment.View,
        textureMode: LineTextureMode.Stretch,
        textureScale: { x: 1, y: 1 },
        ...o,
    };
}

/** Viewer looking down from +Y (towards = +Y). */
const fromAbove = () => v3(0, 1, 0);

function expanded(b: ReturnType<typeof buildLine>, towards = fromAbove): V3[] {
    const res: V3[] = [];
    for (let i = 0; i < b.vertexCount; i++) res.push(expandVertex(v3(), b, i, IDENTITY, towards));
    return res;
}

function near(a: number, b: number, eps = 1e-6, msg = '') {
    assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b} (±${eps})`);
}

console.log('\ngeometry');

test('a straight line becomes a ribbon of the given width, facing the viewer', () => {
    const b = buildLine(input([v3(0, 0, 0), v3(10, 0, 0)], { width: () => 2 }));
    assert.strictEqual(b.vertexCount, 4);
    assert.strictEqual(b.indexCount, 6);
    const pts = expanded(b);
    // Seen from above, the ribbon spreads along Z.
    near(Math.abs(pts[0].z - pts[1].z), 2);
    near(pts[0].y, 0);
    near(b.length, 10);
});

test('TransformZ lines lie flat in the XY plane whatever the camera', () => {
    const b = buildLine(input([v3(0, 0, 0), v3(10, 0, 0)], { alignment: LineAlignment.TransformZ, width: () => 2 }));
    const pts = expanded(b, fromAbove);
    near(Math.abs(pts[0].y - pts[1].y), 2);
    near(pts[0].z, 0);
});

test('duplicate points are ignored; fewer than two points draws nothing', () => {
    assert.strictEqual(cleanPoints([v3(), v3(), v3(1, 0, 0), v3(1, 0, 0)], false).length, 2);
    assert.strictEqual(buildLine(input([v3(1, 2, 3)])).vertexCount, 0);
    assert.strictEqual(buildLine(input([v3(), v3()])).vertexCount, 0);
});

test('joints without corner vertices share vertices (bisector)', () => {
    const b = buildLine(input([v3(0, 0, 0), v3(5, 0, 0), v3(5, 0, 5)]));
    assert.strictEqual(b.vertexCount, 6);
    assert.strictEqual(b.indexCount, 12);
    const o = FLOATS_PER_VERTEX * 2;
    const dir = v3(b.data[o + 3], b.data[o + 4], b.data[o + 5]);
    near(dot(dir, normalize(v3(), v3(1, 0, 1))), 1, 1e-6);
});

test('round corners fill the outer side of the turn', () => {
    const b = buildLine(input([v3(0, 0, 0), v3(5, 0, 0), v3(5, 0, 5)], { cornerVertices: 4, width: () => 2 }));
    const pts = expanded(b);
    const corner = v3(5, 0, 0);
    // Turning from +X to +Z: the outer side of the corner is towards +X / -Z.
    let found = 0;
    for (let i = 0; i < b.vertexCount; i++) {
        if (b.data[i * FLOATS_PER_VERTEX + 9] !== KIND_CORNER) continue;
        const off = sub(v3(), pts[i], corner);
        near(len(off), 1, 1e-6, 'fan radius');
        assert.ok(off.x - off.z > 0.5, `outer side (${off.x}, ${off.z})`);
        found++;
    }
    assert.strictEqual(found, 5);
});

test('round caps extend past the ends', () => {
    const b = buildLine(input([v3(0, 0, 0), v3(10, 0, 0)], { capVertices: 6, width: () => 2 }));
    const pts = expanded(b);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < b.vertexCount; i++) {
        if (b.data[i * FLOATS_PER_VERTEX + 9] !== KIND_CAP) continue;
        minX = Math.min(minX, pts[i].x);
        maxX = Math.max(maxX, pts[i].x);
    }
    near(minX, -1, 1e-6);
    near(maxX, 11, 1e-6);
});

test('loops close with a seam: u reaches the total at the first point again', () => {
    const square = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 0, 4), v3(0, 0, 4)];
    const b = buildLine(input(square, { loop: true, textureMode: LineTextureMode.Tile }));
    assert.strictEqual(b.vertexCount, 10);
    assert.strictEqual(b.indexCount, 24);
    const lastU = b.data[(b.vertexCount - 1) * FLOATS_PER_VERTEX + 10];
    near(lastU, 16);
    near(b.length, 16);
    // With corners too.
    const c = buildLine(input(square, { loop: true, cornerVertices: 3 }));
    assert.strictEqual(c.vertexCount, 4 * (3 + 6));
});

test('texture modes', () => {
    const pts = [v3(0, 0, 0), v3(1, 0, 0), v3(4, 0, 0)];
    const u = (mode: number, sx = 1) => {
        const b = buildLine(input(pts, { textureMode: mode, textureScale: { x: sx, y: 1 } }));
        return [0, 2, 4].map((i) => b.data[i * FLOATS_PER_VERTEX + 10]);
    };
    assert.deepStrictEqual(u(LineTextureMode.Stretch), [0, 0.25, 1]);
    assert.deepStrictEqual(u(LineTextureMode.Tile, 0.5), [0, 0.5, 2]);
    assert.deepStrictEqual(u(LineTextureMode.DistributePerSegment), [0, 0.5, 1]);
    assert.deepStrictEqual(u(LineTextureMode.RepeatPerSegment), [0, 1, 2]);
});

test('width and color follow the normalized length', () => {
    const b = buildLine(input([v3(0, 0, 0), v3(1, 0, 0), v3(4, 0, 0)], {
        width: (t) => 1 + t,
        color: (t, out) => Object.assign(out, { r: t * 255, g: 0, b: 0, a: 255 }),
    }));
    near(b.data[2 * FLOATS_PER_VERTEX + 12], (1 + 0.25) / 2, 1e-6);
    near(b.maxHalfWidth, 1, 1e-6);
    const c = b.u32[2 * FLOATS_PER_VERTEX + 16];
    near(c & 255, 64, 1);
    near(c >>> 24, 255);
});

test('simplify keeps the shape within the tolerance (Ramer-Douglas-Peucker)', () => {
    const pts: V3[] = [];
    for (let i = 0; i <= 20; i++) pts.push(v3(i, 0, Math.sin(i / 3) * 0.01));
    pts.push(v3(20, 0, 5));
    const keep = simplifyIndices(pts, 0.05);
    assert.deepStrictEqual(keep, [0, 20, 21]);
    assert.strictEqual(simplifyIndices(pts, 0).length, pts.length);
    const loop = [v3(0, 0, 0), v3(1, 0, 0.001), v3(2, 0, 0), v3(2, 0, 2), v3(0, 0, 2)];
    const lk = simplifyIndices(loop, 0.01, true);
    assert.ok(!lk.includes(1), 'collinear point dropped');
    assert.strictEqual(lk.length, 4);
});

test('lengths', () => {
    near(polylineLength([v3(0, 0, 0), v3(3, 4, 0)], false), 5);
    near(polylineLength([v3(0, 0, 0), v3(3, 0, 0), v3(3, 4, 0)], true), 12);
    near(dist(v3(), v3(0, 0, 0)), 0);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exitCode = results.failed ? 1 : 0;
