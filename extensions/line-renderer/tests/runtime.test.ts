/**
 * The LineRenderer component with the engine stub: model, GPU buffers,
 * rebuilds, world space, 2D defaults and the scripting API.
 */
import assert from 'assert';
import * as cc from './stubs/cc';
import { LineRenderer, LineAlignment, DEFAULT_LINE_MATERIAL } from '../assets/LineRenderer';
import { FLOATS_PER_VERTEX } from '../assets/core/line-geometry';
import { test, results } from './harness';

const scene = new cc.Node('Scene');
(scene as any).isScene = true;
(scene as any).renderScene = new cc.RenderScene();
cc.director._scene = scene;
const rs = (scene as any).renderScene as cc.RenderScene;

function near(a: number, b: number, eps = 1e-5, msg = '') {
    assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b} (±${eps})`);
}

function make(name = 'Line'): { node: cc.Node; line: LineRenderer } {
    const node = new cc.Node(name);
    node.setParent(scene);
    const line = node.addComponent(LineRenderer) as LineRenderer;
    return { node, line };
}

const ia = (line: LineRenderer) => (line as any)._model.subModels[0].inputAssembler;

console.log('\nLineRenderer');

test('adds a model to the scene and draws the default two points with the default material', () => {
    const { line } = make();
    const model = (line as any)._model;
    assert.ok(rs.models.includes(model), 'model in the render scene');
    assert.strictEqual((line.getSharedMaterial(0) as any).name, DEFAULT_LINE_MATERIAL);
    assert.strictEqual(ia(line).indexCount, 6);
    assert.strictEqual(ia(line).vertexCount, 4);
    assert.ok(model.enabled);
    assert.ok(model.bounds, 'bounds for culling');
});

test('setPositions rebuilds on the next frame', () => {
    const { line } = make();
    line.setPositions([new cc.Vec3(0, 0, 0), new cc.Vec3(1, 0, 0), new cc.Vec3(1, 1, 0)] as any);
    line.lateUpdate();
    assert.strictEqual(ia(line).indexCount, 12);
    assert.strictEqual(line.positionCount, 3);
    line.positionCount = 5;
    line.lateUpdate();
    assert.strictEqual(line.positions.length, 5);
});

test('buffers grow for long lines', () => {
    const { line } = make();
    const first = (line as any)._subMesh;
    const pts = [];
    for (let i = 0; i < 300; i++) pts.push(new cc.Vec3(i, Math.sin(i), 0));
    line.setPositions(pts as any);
    line.numCornerVertices = 4;
    line.lateUpdate();
    assert.notStrictEqual((line as any)._subMesh, first);
    assert.ok(first.destroyed, 'old buffers released');
    assert.strictEqual(ia(line).indexCount, 299 * 6 + 298 * 4 * 3);
});

test('world-space points are converted into the node space, and follow when the node moves', () => {
    const { node, line } = make();
    line.useWorldSpace = true;
    line.setPositions([new cc.Vec3(10, 0, 0), new cc.Vec3(20, 0, 0)] as any);
    node.setPosition(10, 0, 0);
    node.hasChangedFlags = 1;
    line.lateUpdate();
    const vb = (line as any)._vb;
    const data = new Float32Array(vb.data);
    near(data[0], 0, 1e-5, 'first point at the node origin');
    near(data[2 * FLOATS_PER_VERTEX], 10, 1e-5);
    line.useWorldSpace = false;
    line.lateUpdate();
    near(new Float32Array(vb.data)[0], 10, 1e-5, 'local points used as they are');
});

test('width and color API', () => {
    const { line } = make();
    line.startWidth = 2;
    line.endWidth = 0.5;
    near(line.startWidth, 2);
    near(line.endWidth, 0.5);
    line.startColor = new cc.Color(255, 0, 0, 255) as any;
    line.endColor = new cc.Color(0, 0, 255, 128) as any;
    near(line.startColor.r, 255);
    near(line.endColor.a, 128);
    line.lateUpdate();
    const data = new Float32Array((line as any)._vb.data);
    near(data[12], 1, 1e-5, 'half width at the start');
});

test('simplify and length', () => {
    const { line } = make();
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(new cc.Vec3(i, 0, 0));
    line.setPositions(pts as any);
    near(line.getLength(), 10);
    line.simplify(0.01);
    assert.strictEqual(line.positionCount, 2);
});

test('bakeMesh expands the ribbon on the CPU', () => {
    const { line } = make();
    line.alignment = LineAlignment.TransformZ;
    line.widthMultiplier = 2;
    line.setPositions([new cc.Vec3(0, 0, 0), new cc.Vec3(5, 0, 0)] as any);
    const mesh: any = line.bakeMesh();
    const p = mesh.geometry.positions;
    assert.strictEqual(p.length, 4 * 3);
    near(Math.abs(p[1] - p[4]), 2, 1e-5, 'width across Y');
});

test('added under a Canvas: UI-sized defaults and a UIMeshRenderer', () => {
    const canvas = new cc.Node('Canvas');
    canvas.setParent(scene);
    canvas.addComponent(cc.UITransform);
    const node = new cc.Node('Line2D');
    node.setParent(canvas);
    const line = node.addComponent(LineRenderer) as LineRenderer;
    line.resetInEditor();
    assert.ok(node.getComponent(cc.UIMeshRenderer), 'UIMeshRenderer added');
    assert.strictEqual(line.useWorldSpace, false);
    near(line.widthMultiplier, 10);
    assert.strictEqual(line.positions[1].x, 100);
});

test('disable and destroy release the model', () => {
    const { node, line } = make();
    const model = (line as any)._model;
    line.enabled = false;
    assert.ok(!rs.models.includes(model));
    line.enabled = true;
    assert.ok(rs.models.includes(model));
    node.destroy();
    assert.ok(model.destroyed);
    assert.ok(!LineRenderer.all.has(line));
});

test('editor: changes made behind the setters are picked up', () => {
    const { line } = make();
    line.lateUpdate();
    const before = (line as any)._vb.updates;
    line.positions[1].x = 3;
    line.lateUpdate();
    assert.ok((line as any)._vb.updates > before, 'rebuilt after an in-place change');
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exitCode = results.failed ? 1 : 0;
