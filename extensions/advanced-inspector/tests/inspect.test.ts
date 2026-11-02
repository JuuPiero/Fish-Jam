import assert from 'assert';
import { ccclass, Color, Component, Node, property, SpriteFrame, Vec3 } from 'cc';
import { getClassMeta, showInInspector } from '../assets/AdvancedInspector';
import type { InspectNode, InspectResult } from '../source/shared/meta';
import { addInfo, flattenInspect, keyLabel } from '../source/inspector/inspect-logic';
import { buildEvalRequest, buildLayout, type ComponentDump } from '../source/inspector/logic';
import { section, test } from './harness';

class Stats {
    level = 3;
    tags = ['a'];
}

@ccclass('Inventory')
class Inventory extends Component {
    @property
    gold = 10;

    @showInInspector
    items = new Map<string, number>([['potion', 3], ['arrow', 20]]);

    @showInInspector
    visited: string[] = ['Forest', 'Cave'];

    @property
    speed = 1;

    @showInInspector
    get total() {
        let n = 0;
        for (const v of this.items.values()) n += v;
        return n;
    }

    @showInInspector
    stats = new Stats();

    @showInInspector
    misc: any = {
        pos: new Vec3(1, 2, 3),
        tint: new Color(255, 0, 0, 128),
        target: new Node('Player', 'player-uuid'),
        icon: new SpriteFrame('hero', 'icon-uuid'),
        nothing: null,
        set: new Set([1, 2]),
        ints: new Int32Array([4, 5]),
        nested: new Map<Node, { hp: number }>([[new Node('Boss', 'b'), { hp: 50 }]]),
    };

    @showInInspector
    big = Array.from({ length: 150 }, (_, i) => i);
}

const comp = () => new Inventory() as any;
const evalOf = (c: any, open: string[] = []) => c.__advInspectorEval({ inspect: ['items', 'visited', 'total', 'stats', 'misc', 'big'], open }).inspected;
const node = (r: InspectResult): InspectNode => (r as any).node;

section('showInInspector: decorator and layout');

test('members after the property before them', () => {
    const m = new Map(getClassMeta(Inventory)!.members.map((x) => [x.name, x]));
    assert.strictEqual(m.get('items')!.anchor, 'gold');
    assert.strictEqual(m.get('visited')!.anchor, 'gold');
    assert.strictEqual(m.get('total')!.anchor, 'speed');
    assert.strictEqual(m.get('total')!.kind, 'field');
    assert.strictEqual(m.get('items')!.showInInspector, true);
});

const dump: ComponentDump = {
    type: 'Inventory',
    value: {
        uuid: { name: 'uuid', value: 'c', visible: false },
        gold: { name: 'gold', value: 10, visible: true },
        speed: { name: 'speed', value: 1, visible: true },
    },
};

test('layout places shown members by declaration', () => {
    const ids = buildLayout(dump, getClassMeta(Inventory)).map((n: any) => n.id);
    assert.deepStrictEqual(ids, ['f:gold', 's:items', 's:visited', 'f:speed', 's:total', 's:stats', 's:misc', 's:big']);
});

test('shown members are requested from the scene', () => {
    const r = buildEvalRequest(getClassMeta(Inventory)!, dump);
    assert.strictEqual(r.needed, true);
    assert.deepStrictEqual(r.request.inspect, ['items', 'visited', 'total', 'stats', 'misc', 'big']);
});

test('a @showInInspector @property is drawn as a normal property', () => {
    const d: ComponentDump = { type: 'X', value: { ...dump.value, items: { name: 'items', value: 1, visible: true } } };
    assert.deepStrictEqual(buildEvalRequest(getClassMeta(Inventory)!, d).request.inspect, ['visited', 'total', 'stats', 'misc', 'big']);
});

section('showInInspector: describing values');

test('collapsed collections only report their size', () => {
    const r = evalOf(comp(), []);
    assert.deepStrictEqual(node(r.items), { t: 'map', p: 'items', size: 2 });
    assert.deepStrictEqual(node(r.visited), { t: 'list', p: 'visited', cls: 'Array', size: 2 });
    assert.deepStrictEqual(node(r.total), { t: 'num', p: 'total', v: 23 });
    assert.strictEqual((r.total as any).writable, false);
    assert.strictEqual((r.items as any).writable, true);
});

test('expanded map, list and object', () => {
    const r = evalOf(comp(), ['items', 'visited', 'stats']);
    assert.deepStrictEqual(node(r.items), {
        t: 'map', p: 'items', size: 2, entries: [
            { k: { t: 'str', p: '', v: 'potion' }, v: { t: 'num', p: 'items/e0', v: 3 } },
            { k: { t: 'str', p: '', v: 'arrow' }, v: { t: 'num', p: 'items/e1', v: 20 } },
        ],
    });
    assert.deepStrictEqual((node(r.visited) as any).items.map((x: any) => [x.p, x.v]), [['visited/i0', 'Forest'], ['visited/i1', 'Cave']]);
    const stats = node(r.stats) as any;
    assert.strictEqual(stats.cls, 'Stats');
    assert.deepStrictEqual(stats.keys.map((k: any) => [k.k, k.v.t, k.v.p]), [['level', 'num', 'stats/klevel'], ['tags', 'list', 'stats/ktags']]);
});

test('engine types, references and other containers', () => {
    const r = evalOf(comp(), ['misc', 'misc/kset', 'misc/kints', 'misc/knested']);
    const keys = Object.fromEntries((node(r.misc) as any).keys.map((k: any) => [k.k, k.v]));
    assert.deepStrictEqual(keys.pos, { t: 'vec', p: 'misc/kpos', cls: 'Vec3', v: { x: 1, y: 2, z: 3 } });
    assert.deepStrictEqual(keys.tint, { t: 'color', p: 'misc/ktint', v: { r: 255, g: 0, b: 0, a: 128 } });
    assert.deepStrictEqual(keys.target, { t: 'ref', p: 'misc/ktarget', kind: 'node', cls: 'cc.Node', name: 'Player', uuid: 'player-uuid', valid: true });
    assert.strictEqual(keys.icon.kind, 'asset');
    assert.strictEqual(keys.icon.uuid, 'icon-uuid');
    assert.deepStrictEqual(keys.nothing, { t: 'null', p: 'misc/knothing' });
    assert.deepStrictEqual(keys.set.items.map((x: any) => x.v), [1, 2]);
    assert.strictEqual(keys.ints.cls, 'Int32Array');
    assert.deepStrictEqual(keys.ints.items.map((x: any) => x.v), [4, 5]);
    assert.strictEqual(keys.nested.entries[0].k.t, 'ref');
    assert.deepStrictEqual(keys.nested.entries[0].v, { t: 'obj', p: 'misc/knested/e0', cls: 'Object', size: 1 });
});

test('long lists are cut, cycles are marked', () => {
    const c = comp();
    const big = node(evalOf(c, ['big']).big) as any;
    assert.strictEqual(big.items.length, 100);
    assert.strictEqual(big.more, 50);
    c.misc.self = c.misc;
    const misc = node(evalOf(c, ['misc']).misc) as any;
    const self = misc.keys.find((k: any) => k.k === 'self').v;
    assert.deepStrictEqual(self, { t: 'text', p: 'misc/kself', v: '(circular) Object' });
});

test('a throwing getter reports its error', () => {
    const c = comp();
    Object.defineProperty(c, 'items', { get() { throw new Error('not ready'); } });
    assert.deepStrictEqual(evalOf(c).items, { error: 'not ready' });
});

section('showInInspector: editing');

test('set values by path', () => {
    const c = comp();
    assert.strictEqual(c.__advInspectorSet('items/e1', 'set', 99), true);
    assert.strictEqual(c.items.get('arrow'), 99);
    assert.strictEqual(c.__advInspectorSet('visited/i0', 'set', 'Town'), true);
    assert.deepStrictEqual(c.visited, ['Town', 'Cave']);
    assert.strictEqual(c.__advInspectorSet('stats/klevel', 'set', 7), true);
    assert.strictEqual(c.stats.level, 7);
    assert.strictEqual(c.__advInspectorSet('misc/kpos/ky', 'set', 9), true);
    assert.strictEqual(c.misc.pos.y, 9);
    assert.strictEqual(c.__advInspectorSet('misc/kints/i1', 'set', 8), true);
    assert.strictEqual(c.misc.ints[1], 8);
    assert.strictEqual(c.__advInspectorSet('stats', 'set', null), true);
    assert.strictEqual(c.stats, null);
});

test('read-only getters and Set items', () => {
    const c = comp();
    assert.strictEqual(c.__advInspectorSet('total', 'set', 1), 'total is read-only.');
    assert.strictEqual(c.__advInspectorSet('misc/kset/i0', 'set', 5), 'Set items cannot be changed, only removed.');
});

test('remove and add items', () => {
    const c = comp();
    assert.strictEqual(c.__advInspectorSet('items/e0', 'delete'), true);
    assert.deepStrictEqual([...c.items.keys()], ['arrow']);
    assert.strictEqual(c.__advInspectorSet('items', 'add', 0, 'bomb'), true);
    assert.deepStrictEqual([...c.items], [['arrow', 20], ['bomb', 0]]);
    assert.strictEqual(c.__advInspectorSet('visited/i1', 'delete'), true);
    assert.strictEqual(c.__advInspectorSet('visited', 'add', ''), true);
    assert.deepStrictEqual(c.visited, ['Forest', '']);
    assert.strictEqual(c.__advInspectorSet('misc/kset/i0', 'delete'), true);
    assert.deepStrictEqual([...c.misc.set], [2]);
    assert.strictEqual(c.__advInspectorSet('misc/kints/i0', 'delete'), 'Items of fixed-size arrays cannot be removed.');
    assert.strictEqual(c.__advInspectorSet('items/e5', 'set', 1), 'The entry no longer exists.');
});

section('showInInspector: rows');

const flat = (r: InspectResult, open: string[] = [], disabled = false) =>
    flattenInspect(r, { label: 'Items', disabled, isOpen: (p, depth) => (depth === 0 ? !open.includes(`-${p}`) : open.includes(p)) });

test('a map becomes a foldout with one row per entry and an add row', () => {
    const rows = flat(evalOf(comp(), ['items']).items);
    assert.deepStrictEqual(rows.map((r) => [r.kind, r.depth, r.label, r.editable, r.removable]), [
        ['container', 0, 'Items', false, false],
        ['leaf', 1, 'potion', true, true],
        ['leaf', 1, 'arrow', true, true],
        ['add', 1, '', false, false],
    ]);
    assert.deepStrictEqual(rows[3].add, { path: 'items', value: 0, keyType: 'str' });
});

test('collapsed, read-only and disabled', () => {
    const r = evalOf(comp(), ['items']);
    assert.strictEqual(flat(r.items, ['-items']).length, 1);
    assert.deepStrictEqual(flat(r.total).map((x) => [x.kind, x.editable]), [['leaf', false]]);
    const disabled = flat(r.items, [], true);
    assert.ok(disabled.every((x) => !x.editable && !x.removable && x.kind !== 'add'));
});

test('nested rows, more rows and labels', () => {
    const c = comp();
    const misc = flat(evalOf(c, ['misc', 'misc/knested']).misc, ['misc/knested']);
    const nested = misc.find((r) => r.label === 'nested')!;
    assert.strictEqual(nested.kind, 'container');
    const entry = misc[misc.indexOf(nested) + 1];
    assert.deepStrictEqual([entry.label, entry.depth, entry.kind, entry.removable], ['Boss', 2, 'container', true]);
    assert.strictEqual(misc.find((r) => r.label === 'set')!.kind, 'container');
    const big = flat(evalOf(c, ['big']).big);
    assert.strictEqual(big[big.length - 2].text, '… 50 more');
    assert.deepStrictEqual(big[big.length - 1].add, { path: 'big', value: 0 });
    const stats = flat(evalOf(c, ['stats']).stats);
    assert.deepStrictEqual(stats.map((r) => r.label), ['Items', 'Level', 'Tags']);
});

test('add rows need known primitive types', () => {
    assert.strictEqual(addInfo({ t: 'list', p: 'a', cls: 'Array', size: 0, items: [] }), undefined);
    assert.strictEqual(addInfo({ t: 'list', p: 'a', cls: 'Float32Array', size: 1, items: [{ t: 'num', p: 'a/i0', v: 1 }] }), undefined);
    assert.strictEqual(addInfo({ t: 'list', p: 'a', cls: 'Array', size: 2, items: [{ t: 'num', p: 'a/i0', v: 1 }, { t: 'str', p: 'a/i1', v: 'x' }] }), undefined);
    assert.deepStrictEqual(addInfo({ t: 'map', p: 'm', size: 1, entries: [{ k: { t: 'num', p: '', v: 1 }, v: { t: 'bool', p: 'm/e0', v: true } }] }), { path: 'm', value: false, keyType: 'num' });
});

test('key labels', () => {
    assert.strictEqual(keyLabel({ t: 'vec', p: '', cls: 'Vec2', v: { x: 1.23456, y: 2 } }), '(1.235, 2)');
    assert.strictEqual(keyLabel({ t: 'ref', p: '', kind: 'node', cls: 'cc.Node', name: '', uuid: '', valid: false }), 'Missing');
    assert.strictEqual(keyLabel({ t: 'obj', p: '', cls: 'Stats', size: 2 }), 'Stats');
});
