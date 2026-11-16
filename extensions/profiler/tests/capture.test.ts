/**
 * The Frame Debugger hook on a fake command buffer: wrappers only while
 * needed, one frame recorded with its lookups, stepping skips later draws,
 * and the prototype methods come back afterwards.
 */
import assert from 'assert';
import { test, results } from './harness';
import { director } from './stubs/cc';
import { FrameCapture } from '../assets/FrameCapture';

class FakeCommandBuffer {
    drawn: string[] = [];
    beginRenderPass(_rp: any, _fb: any) {
        this.drawn.push('pass');
    }
    bindPipelineState(_p: any) {}
    bindDescriptorSet(_s: number, _d: any) {}
    bindInputAssembler(_ia: any) {}
    draw(arg: any) {
        this.drawn.push('draw:' + (arg.tag || ''));
    }
}

const matSet = { id: 'mat' };
const localSet = { id: 'local' };
const scene = { name: 'Scene', parent: null, children: [] as any[], components: [] as any[] };
const heroNode = { name: 'Hero', parent: scene, children: [], components: [] as any[] };
scene.children.push(heroNode);
const pass = { descriptorSet: matSet, program: 'standard' };
heroNode.components.push({ sharedMaterials: [1], getRenderMaterial: () => ({ name: 'HeroMat', effectName: 'builtin-standard', passes: [pass] }) });
const cb = new FakeCommandBuffer();
director.root = { device: { commandBuffer: cb }, scenes: [{ models: [{ node: heroNode, subModels: [{ descriptorSet: localSet, passes: [pass] }] }] }] };
director.scene = scene;

function frame(fc: FrameCapture, n: number) {
    fc.beginFrame(n);
    cb.beginRenderPass({ colorAttachments: [{ loadOp: 1 }], depthStencilAttachment: { depthLoadOp: 1 } }, { width: 800, height: 600 });
    cb.bindPipelineState({ shader: { name: 'standard|vs|fs' }, primitive: 7 });
    cb.bindDescriptorSet(1, matSet);
    cb.bindDescriptorSet(2, localSet);
    cb.draw({ tag: 'a', indexCount: 36, vertexCount: 24, instanceCount: 0 });
    cb.draw({ tag: 'b', drawInfo: { indexCount: 6, vertexCount: 4, instanceCount: 3 } });
    cb.draw({ tag: 'c', indexCount: 3, vertexCount: 3, instanceCount: 0 });
    return fc.endFrame();
}

const own = () => ['beginRenderPass', 'bindPipelineState', 'bindDescriptorSet', 'bindInputAssembler', 'draw'].filter((k) => Object.prototype.hasOwnProperty.call(cb, k));

test('frame debugger: nothing wrapped until needed', () => {
    const fc = new FrameCapture();
    assert.strictEqual(frame(fc, 1), null);
    assert.deepStrictEqual(own(), [], 'no own properties: the prototype methods run');
});

test('frame debugger: one frame captured with names, then unwrapped', () => {
    const fc = new FrameCapture();
    fc.arm();
    const cap = frame(fc, 2)!;
    assert.ok(cap, 'captured');
    assert.strictEqual(cap.draws, 3);
    assert.strictEqual(cap.passes, 1);
    const p = cap.events[0] as any;
    assert.strictEqual(p.type, 'pass');
    assert.deepStrictEqual([p.width, p.height, p.color[0], p.depth], [800, 600, 'clear', 'clear']);
    const d = cap.events[1] as any;
    assert.deepStrictEqual([d.material, d.effect, d.node, d.shader, d.triangles], ['HeroMat', 'builtin-standard', 'Hero', 'standard|vs|fs', 12]);
    const inst = cap.events[2] as any;
    assert.deepStrictEqual([inst.indices, inst.instances, inst.triangles], [6, 3, 6], 'drawInfo of an input assembler, instanced');
    assert.deepStrictEqual(own(), [], 'unwrapped after the capture');
});

test('frame debugger: stepping skips the draws after the limit until disabled', () => {
    const fc = new FrameCapture();
    fc.setStep(0);
    cb.drawn.length = 0;
    frame(fc, 3);
    assert.deepStrictEqual(cb.drawn, ['pass', 'draw:a'], 'only the first draw');
    fc.setStep(1);
    cb.drawn.length = 0;
    frame(fc, 4);
    assert.deepStrictEqual(cb.drawn, ['pass', 'draw:a', 'draw:b']);
    fc.setStep(-1);
    assert.deepStrictEqual(own(), [], 'off: unwrapped');
    cb.drawn.length = 0;
    frame(fc, 5);
    assert.strictEqual(cb.drawn.length, 4, 'everything drawn again');
});

test('frame debugger: counting render passes for the Profiler', () => {
    const fc = new FrameCapture();
    fc.countPasses = true;
    fc.setStep(-1);
    frame(fc, 6);
    assert.strictEqual(fc.passCount, 1);
    fc.dispose();
    assert.deepStrictEqual(own(), []);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed) process.exit(1);
