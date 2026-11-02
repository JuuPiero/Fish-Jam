import assert from 'assert';
import { binaryVersion, detectVersion } from '../assets/core/spine-libs';
import { BlendMode, defaultMeshOptions, FLOATS_PER_VERTEX, SpineMesh } from '../assets/core/spine-mesh';
import { loadSkeleton, physicsConstraintCount, SkeletonInstance, skeletonInfo, SpineLoadError } from '../assets/core/spine-runtime';
import { available, FIXTURES, source } from './fixtures';
import { done, skip, test } from './harness';

test('version detection: json and binary headers', () => {
    assert.deepStrictEqual(detectVersion({ skeleton: { spine: '4.2.43' } }, null), { exported: '4.2.43', runtime: '4.2' });
    assert.deepStrictEqual(detectVersion('{"skeleton":{"spine":"4.3.26"}}', null), { exported: '4.3.26', runtime: '4.3' });
    assert.strictEqual(detectVersion({ skeleton: { spine: '4.1.20' } }, null).runtime, '4.2');
    assert.strictEqual(detectVersion({ skeleton: { spine: '3.8.99' } }, null).runtime, null);
    // 4.x binary: 8 byte hash, then the version string (varint length + 1).
    const v = '4.3.26';
    const b4 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, v.length + 1, ...Array.from(v, (c) => c.charCodeAt(0))]);
    assert.strictEqual(binaryVersion(b4), '4.3.26');
    // 3.8 binary: hash string, then version string.
    const h = 'abcdefghijk';
    const v3 = '3.8.99';
    const b3 = new Uint8Array([h.length + 1, ...Array.from(h, (c) => c.charCodeAt(0)), v3.length + 1, ...Array.from(v3, (c) => c.charCodeAt(0))]);
    assert.strictEqual(binaryVersion(b3), '3.8.99');
});

test('3.8 data is refused with a clear message', () => {
    assert.throws(() => loadSkeleton({ json: { skeleton: { spine: '3.8.99' } }, binary: null, atlasText: '', pageImage: () => null }),
        (e: Error) => e instanceof SpineLoadError && /3\.8/.test(e.message));
});

test('mesh: batches split by texture and blend mode, indices offset', () => {
    const m = new SpineMesh();
    m.reset();
    const quad = [0, 0, 10, 0, 10, 10, 0, 10];
    const uv = [0, 1, 1, 1, 1, 0, 0, 0];
    const tri = [0, 1, 2, 2, 3, 0];
    m.add('A', BlendMode.Normal, quad, 2, uv, 4, tri, 6, 0, 1, 2);
    m.add('A', BlendMode.Normal, quad, 2, uv, 4, tri, 6, 0, 1, 2);
    m.add('A', BlendMode.Additive, quad, 2, uv, 4, tri, 6, 0, 1, 2);
    m.add('B', BlendMode.Additive, quad, 2, uv, 4, tri, 6, 0, 1, 2);
    assert.strictEqual(m.vertexCount, 16);
    assert.strictEqual(m.indexCount, 24);
    assert.strictEqual(m.batchCount, 3);
    assert.deepStrictEqual(m.batches.slice(0, 3).map((b) => [b.texture, b.blendMode, b.firstIndex, b.indexCount]),
        [['A', 0, 0, 12], ['A', 1, 12, 6], ['B', 1, 18, 6]]);
    assert.deepStrictEqual(Array.from(m.indices.subarray(6, 12)), [4, 5, 6, 6, 7, 4]);
    assert.strictEqual(m.colors[5], 1);
    assert.strictEqual(m.colors[FLOATS_PER_VERTEX + 6], 2);
    assert.deepStrictEqual([m.minX, m.minY, m.maxX, m.maxY], [0, 0, 10, 10]);
});

test('mesh: grows past the initial buffers and stops at 65535 vertices', () => {
    const m = new SpineMesh();
    m.reset();
    const n = 1000;
    const pos = new Float32Array(n * 2);
    const uv = new Float32Array(n * 2);
    const tri = new Uint16Array(n);
    for (let i = 0; i < 70; i++) m.add('A', 0, pos, 2, uv, n, tri, n, 0, 0, 0);
    assert.strictEqual(m.vertexCount, 65000);
    assert.ok(m.overflow);
});

for (const f of FIXTURES) {
    if (!available(f)) {
        skip(f.name, 'files not found');
        continue;
    }
    test(`${f.name}: loads, animates, simulates physics, builds a mesh`, () => {
        const loaded = loadSkeleton(source(f));
        const info = skeletonInfo(loaded);
        const expect43 = f.name.includes('4.3');
        assert.strictEqual(info.runtime, expect43 ? '4.3' : '4.2', `runtime for ${info.exported}`);
        assert.ok(info.bones > 0 && info.slots > 0);
        const inst = new SkeletonInstance(loaded);
        assert.ok(inst.setSkin('default'));
        // The samples keep their images in named skins (the default skin only has bones).
        if (info.skins.length > 1) assert.ok(inst.setSkin(info.skins[1]));
        const anim = info.animations[0]?.name;
        if (anim) assert.ok(inst.setAnimation(0, anim, true));
        assert.strictEqual(inst.setAnimation(0, '__missing__', true), null);
        const mesh = new SpineMesh();
        let maxBatches = 0;
        for (let i = 0; i < 30; i++) {
            inst.advance(1 / 30);
            inst.pose(true);
            inst.buildMesh(defaultMeshOptions(), mesh);
            maxBatches = Math.max(maxBatches, mesh.batchCount);
        }
        assert.ok(mesh.vertexCount > 0, 'vertices');
        assert.ok(mesh.indexCount % 3 === 0 && mesh.indexCount > 0, 'triangles');
        for (let i = 0; i < mesh.indexCount; i++) assert.ok(mesh.indices[i] < mesh.vertexCount);
        let sum = 0;
        for (let i = 0; i < mesh.batchCount; i++) {
            const b = mesh.batches[i];
            assert.strictEqual(b.firstIndex, sum);
            assert.ok(b.texture && typeof b.texture.getImage === 'function', 'batch texture is the page texture');
            sum += b.indexCount;
        }
        assert.strictEqual(sum, mesh.indexCount);
        for (let i = 0; i < mesh.vertexCount * FLOATS_PER_VERTEX; i++) {
            if ((i % FLOATS_PER_VERTEX) < 5) assert.ok(Number.isFinite(mesh.vertices[i]), 'finite vertex data');
        }
        assert.ok(mesh.maxX > mesh.minX && mesh.maxY > mesh.minY, 'bounds');
        if (f.name.startsWith('whirly')) assert.ok(maxBatches > 1, 'blend modes split batches');
        if (f.name.startsWith('dragon')) assert.ok(loaded.pages.length === 6, 'six atlas pages');
    });
}

/** Bone world transforms (physics bones are often leaves: only their rotation moves). */
function snapshot(inst: SkeletonInstance): number[] {
    const out: number[] = [];
    for (const b of inst.skeleton.bones as any[]) {
        const w = inst.boneWorld(b);
        out.push(w.x, w.y, w.a * 100, w.b * 100, w.c * 100, w.d * 100);
    }
    return out;
}

function maxDiff(a: number[], b: number[]): number {
    let m = 0;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
}

for (const f of FIXTURES.filter((x) => /Fish|exports_4\.3|sack|celestial/.test(x.name))) {
    if (!available(f)) continue;
    test(`${f.name}: moving the skeleton drives physics (inertia), reset settles it`, () => {
        const loaded = loadSkeleton(source(f));
        assert.ok(physicsConstraintCount(loaded) > 0, 'has physics constraints');
        const info = skeletonInfo(loaded);
        const make = () => {
            const inst = new SkeletonInstance(loaded);
            inst.setSkin(info.skins[1] ?? 'default');
            // Some exports key the physics mix in their animation.
            if (info.animations[0]) inst.setAnimation(0, info.animations[0].name, true);
            return inst;
        };
        const run = (move: boolean) => {
            const inst = make();
            // Settle in the setup pose.
            for (let i = 0; i < 60; i++) {
                inst.advance(1 / 60);
                inst.pose(true);
            }
            // Then shake sideways for a few frames (or stay still).
            for (let i = 0; i < 6; i++) {
                if (move) inst.physicsTranslate(i % 2 ? -40 : 40, 0);
                inst.advance(1 / 60);
                inst.pose(true);
            }
            return { inst, bones: snapshot(inst) };
        };
        const still = run(false);
        const moved = run(true);
        const d = maxDiff(still.bones, moved.bones);
        assert.ok(d > 0.05, `physics reacted to movement (max bone delta ${d.toFixed(3)})`);
        // Without physics, movement has no effect.
        const a = make();
        const b = make();
        for (let i = 0; i < 6; i++) {
            b.physicsTranslate(40, 0);
            a.advance(1 / 60);
            a.pose(false);
            b.advance(1 / 60);
            b.pose(false);
        }
        assert.ok(maxDiff(snapshot(a), snapshot(b)) < 1e-6, 'physics off ignores movement');
        // Reset puts the moved instance back at rest.
        moved.inst.resetPhysics();
        still.inst.resetPhysics();
        assert.ok(maxDiff(snapshot(moved.inst), snapshot(still.inst)) < 1e-3, 'reset settles physics');
    });
}

done();
