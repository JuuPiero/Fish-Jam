/**
 * The scene tools against a fake editor (top-down orthographic Scene view):
 * Edit Points, Create Points, picking, keyboard, undo and Inspector methods.
 */
import { log, scene, cce, cc, screen, selectNodes, geometry, setSceneMethods, domKey, findNode } from './stubs/editor';
import { LineRenderer } from '../assets/LineRenderer';
import { methods, load } from '../source/scene/index';
import { S } from '../source/scene/state';
import assert from 'assert';
import { results } from './harness';

setSceneMethods(methods);

const tests: { name: string; fn: () => Promise<void> | void }[] = [];
function test(name: string, fn: () => Promise<void> | void) {
    tests.push({ name, fn });
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const tick = () => (cc.director as any).tick();

function near(a: number, b: number, eps: number, msg = '') {
    assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b} (±${eps})`);
}

function mouse(type: string, x: number, y: number, mods: Record<string, any> = {}) {
    return cce.Operation.emit(type, { x, y, button: 0, leftButton: true, ...mods });
}

async function click(x: number, y: number, mods: Record<string, any> = {}) {
    mouse('mousedown', x, y, mods);
    await flush();
    mouse('mouseup', x, y, mods);
    await flush();
    tick();
}

async function drag(from: { x: number; y: number }, to: { x: number; y: number }, mods: Record<string, any> = {}, steps = 5) {
    mouse('mousedown', from.x, from.y, mods);
    await flush();
    for (let i = 1; i <= steps; i++) {
        mouse('mousemove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, mods);
        await flush();
    }
    mouse('mouseup', to.x, to.y, mods);
    await flush();
    await flush();
    tick();
}

function key(k: string, mods: Record<string, any> = {}) {
    return cce.Operation.emit('keydown', { key: k, ...mods });
}

// ------------------------------------------------------------------ setup

const node = new cc.Node('Laser');
node.setParent(scene);
const line = node.addComponent(LineRenderer) as LineRenderer;

function reset() {
    line.useWorldSpace = true;
    line.loop = false;
    line.setPositions([new cc.Vec3(0, 0, 0), new cc.Vec3(5, 0, 0), new cc.Vec3(10, 0, 5)] as any);
    S.mode = 'none';
    S.selection = [];
    selectNodes([node.uuid]);
    log.editorEvents.length = 0;
    log.removed.length = 0;
    tick();
}

load();
methods.lrPrimary();

const pointScreen = (i: number) => {
    const p = line.positions[i];
    return screen(p.x, p.y, p.z);
};

// ------------------------------------------------------------------ tests

test('hooks into the editor and marks the points of the selected line', () => {
    reset();
    assert.ok(S.hooked);
    geometry.reset();
    tick();
    assert.ok(geometry.triangles > 0, 'points drawn');
    assert.strictEqual(S.target, line);
});

test('clicking a point starts Edit Points and selects it; the editor never sees the click', async () => {
    reset();
    await click(pointScreen(1).x, pointScreen(1).y);
    assert.strictEqual(S.mode, 'edit');
    assert.deepStrictEqual(S.selection, [1]);
    assert.ok(!log.editorEvents.includes('mousedown'));
});

test('dragging a point moves it as one undo step', async () => {
    reset();
    const begins = log.requests.filter((r) => r.msg === 'begin-recording').length;
    await drag(pointScreen(1), screen(5, 0, 3));
    near(line.positions[1].x, 5, 0.05);
    near(line.positions[1].z, 3, 0.05);
    assert.strictEqual(log.requests.filter((r) => r.msg === 'begin-recording').length - begins, 1);
});

test('move handle along X', async () => {
    reset();
    await click(pointScreen(2).x, pointScreen(2).y);
    const p = pointScreen(2);
    await drag({ x: p.x + 45, y: p.y }, { x: p.x + 85, y: p.y + 30 });
    near(line.positions[2].x, 12, 0.05);
    near(line.positions[2].z, 5, 1e-6);
});

test('rectangle selection and Ctrl+A', async () => {
    reset();
    S.mode = 'edit';
    await drag(screen(-1, 0, -1), screen(6, 0, 1));
    assert.deepStrictEqual([...S.selection].sort(), [0, 1]);
    domKey('a', { ctrlKey: true });
    key('a', { ctrlKey: true });
    cce.SceneFacadeManager.selectAllNodes();
    assert.deepStrictEqual(S.selection, [0, 1, 2]);
    assert.strictEqual(log.selectAllNodes, 0, 'nodes not selected');
});

test('double-click a segment inserts a point', async () => {
    reset();
    S.mode = 'edit';
    const p = screen(2.5, 0, 0);
    assert.strictEqual(cce.Operation.emit('dblclick', { x: p.x, y: p.y, button: 0 }), false);
    await flush();
    await flush();
    assert.strictEqual(line.positionCount, 4);
    near(line.positions[1].x, 2.5, 0.05);
});

test('Delete removes the selected points, not the node', async () => {
    reset();
    await click(pointScreen(1).x, pointScreen(1).y);
    const ev = domKey('Delete');
    assert.ok(ev.defaultPrevented && ev.stopped);
    key('Delete');
    await flush();
    await flush();
    assert.strictEqual(line.positionCount, 2);
    cce.SceneFacadeManager.removeNode({ uuid: node.uuid });
    assert.strictEqual(log.removed.length, 0);
});

test('Create Points: clicks add points on the ground; dragging draws', async () => {
    reset();
    methods.lrSetMode(line.uuid, 'create');
    assert.strictEqual(S.mode, 'create');
    await click(screen(0, 0, 8).x, screen(0, 0, 8).y);
    assert.strictEqual(line.positionCount, 4);
    near(line.positions[3].z, 8, 0.05);
    near(line.positions[3].y, 0, 1e-6);
    // A stroke 10 units long with points at least 1 unit apart.
    methods.lrSetSetting('minVertexDistance', 1);
    await drag(screen(0, 0, 10), screen(10, 0, 10), {}, 20);
    const added = line.positionCount - 4;
    assert.ok(added >= 9 && added <= 12, `stroke points ${added}`);
    key('Escape');
    assert.strictEqual(S.mode, 'none');
});

test('Create Points: camera distance input', async () => {
    reset();
    methods.lrSetMode(line.uuid, 'create');
    methods.lrSetSetting('inputMode', 'view');
    methods.lrSetSetting('viewDistance', 5);
    await click(screen(1, 0, 1).x, screen(1, 0, 1).y);
    near(line.positions[3].y, 95, 1e-4, 'five units below the camera at y = 100');
    methods.lrSetSetting('inputMode', 'plane');
    methods.lrSetMode(line.uuid, 'none');
});

test('Inspector actions: subdivide, simplify', async () => {
    reset();
    methods.lrSetMode(line.uuid, 'edit');
    await methods.lrAction(line.uuid, 'selectAll');
    await methods.lrAction(line.uuid, 'subdivide');
    assert.strictEqual(line.positionCount, 5);
    near(line.positions[1].x, 2.5, 1e-6);
    let st = methods.lrState(line.uuid);
    assert.strictEqual(st.count, 5);
    await methods.lrAction(line.uuid, 'simplify', 0.01);
    st = methods.lrState(line.uuid);
    assert.strictEqual(st.count, 3, 'midpoints removed again');
    assert.ok(log.broadcasts.some((b) => b.msg === 'line-renderer:state'));
});

test('clicking a line selects its node', async () => {
    reset();
    selectNodes([]);
    tick();
    log.editorEvents.length = 0;
    const p = screen(2, 0, 0);
    mouse('mousedown', p.x, p.y);
    await flush();
    assert.deepStrictEqual(cce.Selection.query(), [node.uuid]);
    assert.ok(!log.editorEvents.includes('mousedown'), 'the editor did not deselect it');
    mouse('mouseup', p.x, p.y);
});

test('Node > Effects > Line Renderer creates a selected line; Draw Line starts Create Points', async () => {
    reset();
    selectNodes([]);
    tick();
    const uuid = await methods.lrCreate('line');
    const n = findNode(uuid)!;
    const l = n.getComponent(LineRenderer)!;
    assert.strictEqual(l.positionCount, 2);
    assert.deepStrictEqual(cce.Selection.query(), [uuid]);
    const uuid2 = await methods.lrCreate('draw');
    tick();
    const l2 = findNode(uuid2)!.getComponent(LineRenderer)!;
    assert.strictEqual(l2.positionCount, 0);
    assert.strictEqual(S.mode, 'create');
    methods.lrSetMode(l2.uuid, 'none');
    // The second line was created under the selected first one.
    assert.strictEqual(findNode(uuid2)!.parent, n);
    n.destroy();
});

test('diagnostics are JSON', () => {
    const d = methods.lrDiagnostics();
    JSON.stringify(d);
    assert.strictEqual(d.primary, true);
});

(async () => {
    for (const t of tests) {
        try {
            await t.fn();
            results.passed++;
            console.log(`  ok   ${t.name}`);
        } catch (e) {
            results.failed++;
            console.log(`  FAIL ${t.name}\n       ${String((e as Error)?.stack || e).split('\n').slice(0, 6).join('\n       ')}`);
        }
    }
    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    process.exitCode = results.failed ? 1 : 0;
})();
