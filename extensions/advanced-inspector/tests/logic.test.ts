import assert from 'assert';
import type { ClassMeta, EvalResult, MemberMeta } from '../source/shared/meta';
import {
    buildEvalRequest, buildLayout, isEmptyValue, memberState, nicify, testCondition, validationFor,
    type ComponentDump, type DumpProp, type LayoutNode,
} from '../source/inspector/logic';
import { section, test } from './harness';

// ---------------------------------------------------------------- helpers

function prop(name: string, value: any, extra: Partial<DumpProp> = {}): DumpProp {
    return { name, value, visible: true, path: `__comps__.0.${name}`, ...extra };
}

function dumpOf(props: DumpProp[], extra: Partial<ComponentDump> = {}): ComponentDump {
    const value: Record<string, DumpProp> = {
        node: prop('node', { uuid: 'n1' }, { visible: false }),
        uuid: prop('uuid', 'c1', { visible: false }),
        enabled: prop('enabled', true, { visible: false }),
    };
    for (const p of props) value[p.name!] = p;
    return { type: 'Test', value, ...extra };
}

let seq = 0;
function field(name: string, extra: Partial<MemberMeta> = {}): MemberMeta {
    return { name, kind: 'field', seq: seq++, ...extra };
}
function method(name: string, anchor: string | null | undefined, extra: Partial<MemberMeta> = {}): MemberMeta {
    return { name, kind: 'method', seq: seq++, anchor, button: {}, ...extra };
}
function metaOf(...members: MemberMeta[]): ClassMeta {
    return { version: 1, members };
}

/** Layout as plain data: item ids, groups as { path: kind, children | tabs }. */
function shape(nodes: LayoutNode[]): any[] {
    return nodes.map((n) => {
        if (n.kind === 'item') return n.id;
        if (n.def.kind === 'tab') return { [n.def.path]: 'tab', tabs: Object.fromEntries(n.tabs.map((t) => [t.name, shape(t.children)])) };
        return { [n.def.path]: n.def.kind, children: shape(n.children) };
    });
}

const abc = () => dumpOf([prop('a', 1), prop('b', 2), prop('c', 3)]);

// ----------------------------------------------------------------- naming

section('nicify');

test('splits camelCase and snake_case like the engine', () => {
    assert.strictEqual(nicify('moveSpeed'), 'Move Speed');
    assert.strictEqual(nicify('max_hp'), 'Max Hp');
    assert.strictEqual(nicify('_privateThing'), 'Private Thing');
    assert.strictEqual(nicify('resetAll'), 'Reset All');
});

// ----------------------------------------------------------------- layout

section('layout: order');

test('fields keep dump order and skip invisible ones', () => {
    const d = dumpOf([prop('a', 1), prop('b', 2, { visible: false }), prop('c', 3)]);
    assert.deepStrictEqual(shape(buildLayout(d, null)), ['f:a', 'f:c']);
});

test('buttons follow the property declared before them', () => {
    const meta = metaOf(method('first', null), method('m1', 'a'), method('m2', 'a'), method('last', undefined), method('afterC', 'c'));
    assert.deepStrictEqual(shape(buildLayout(abc(), meta)), ['m:first', 'f:a', 'm:m1', 'm:m2', 'f:b', 'f:c', 'm:afterC', 'm:last']);
});

test('methods without @button are not shown', () => {
    const meta = metaOf({ name: 'helper', kind: 'method', seq: seq++, anchor: 'a' });
    assert.deepStrictEqual(shape(buildLayout(abc(), meta)), ['f:a', 'f:b', 'f:c']);
});

test('a button anchored to a hidden property keeps its place', () => {
    const d = dumpOf([prop('a', 1), prop('b', 2, { visible: false }), prop('c', 3)]);
    assert.deepStrictEqual(shape(buildLayout(d, metaOf(method('m', 'b')))), ['f:a', 'm:m', 'f:c']);
});

test('@propertyOrder sorts on top of declaration order', () => {
    const meta = metaOf(field('c', { order: -1 }), method('m', 'a', { order: 5 }));
    assert.deepStrictEqual(shape(buildLayout(abc(), meta)), ['f:c', 'f:a', 'f:b', 'm:m']);
});

test("Cocos' displayOrder is respected", () => {
    const d = dumpOf([prop('a', 1), prop('b', 2), prop('c', 3, { displayOrder: 0 })]);
    assert.deepStrictEqual(shape(buildLayout(d, null)), ['f:c', 'f:a', 'f:b']);
});

section('layout: groups');

test('box groups nest by path and sit at their first member', () => {
    const meta = metaOf(
        field('b', { group: { kind: 'box', path: 'Settings' } }),
        field('c', { group: { kind: 'box', path: 'Settings/Advanced' } }),
    );
    assert.deepStrictEqual(shape(buildLayout(abc(), meta)), [
        'f:a',
        { Settings: 'box', children: ['f:b', { 'Settings/Advanced': 'box', children: ['f:c'] }] },
    ]);
});

test('tab groups collect members per tab', () => {
    const meta = metaOf(
        field('a', { group: { kind: 'tab', path: 'Tabs', tab: 'General' } }),
        field('b', { group: { kind: 'tab', path: 'Tabs', tab: 'Audio' } }),
        field('c', { group: { kind: 'tab', path: 'Tabs', tab: 'General' } }),
    );
    assert.deepStrictEqual(shape(buildLayout(abc(), meta)), [
        { Tabs: 'tab', tabs: { General: ['f:a', 'f:c'], Audio: ['f:b'] } },
    ]);
});

test('a group path through a tab group lands in that tab', () => {
    const d = dumpOf([prop('a', 1), prop('b', 2), prop('c', 3)]);
    const meta = metaOf(
        field('a', { group: { kind: 'tab', path: 'Tabs', tab: 'General' } }),
        field('b', { group: { kind: 'box', path: 'Tabs/General/Box' } }),
        field('c', { group: { kind: 'tab', path: 'Tabs', tab: 'Audio' } }),
    );
    assert.deepStrictEqual(shape(buildLayout(d, meta)), [
        { Tabs: 'tab', tabs: { General: ['f:a', { 'Tabs/General/Box': 'box', children: ['f:b'] }], Audio: ['f:c'] } },
    ]);
});

test('horizontal and button groups keep their kind; parents default to boxes', () => {
    const meta = metaOf(
        field('a', { group: { kind: 'horizontal', path: 'Row' } }),
        field('b', { group: { kind: 'horizontal', path: 'Row' } }),
        method('go', 'c', { group: { kind: 'buttons', path: 'Actions/Buttons' } }),
        method('stop', 'c', { group: { kind: 'buttons', path: 'Actions/Buttons' } }),
    );
    assert.deepStrictEqual(shape(buildLayout(abc(), meta)), [
        { Row: 'horizontal', children: ['f:a', 'f:b'] },
        'f:c',
        { Actions: 'box', children: [{ 'Actions/Buttons': 'buttons', children: ['m:go', 'm:stop'] }] },
    ]);
});

test('undeclared parents of foldouts are foldouts', () => {
    const meta = metaOf(field('a', { group: { kind: 'foldout', path: 'A/B' } }));
    assert.deepStrictEqual(shape(buildLayout(abc(), meta))[0], { A: 'foldout', children: [{ 'A/B': 'foldout', children: ['f:a'] }] });
});

test("Cocos' own property groups map to tabs and foldouts", () => {
    const d = dumpOf([
        prop('a', 1, { group: { name: 'Physics' } }),
        prop('b', 2, { group: { name: 'Physics' } }),
        prop('c', 3, { group: { id: 's', name: 'Debug', style: 'section' } }),
    ]);
    assert.deepStrictEqual(shape(buildLayout(d, null)), [
        { '#default': 'tab', tabs: { Physics: ['f:a', 'f:b'] } },
        { '#s:Debug': 'foldout', children: ['f:c'] },
    ]);
});

// ------------------------------------------------------------- conditions

section('conditions');

const remote = (values: Record<string, unknown>, playing = false): EvalResult => ({ playing, values, validations: [], lists: {} });

test('truthy members, values and negation', () => {
    const d = dumpOf([prop('isBoss', true), prop('mode', 2), prop('name', ''), prop('label', '1')]);
    assert.strictEqual(testCondition({ member: 'isBoss' }, d, null), true);
    assert.strictEqual(testCondition({ member: '!isBoss' }, d, null), false);
    assert.strictEqual(testCondition({ member: 'name' }, d, null), false);
    assert.strictEqual(testCondition({ member: 'mode', values: [1, 2] }, d, null), true);
    assert.strictEqual(testCondition({ member: 'mode', values: [0] }, d, null), false);
    assert.strictEqual(testCondition({ member: 'label', values: [1] }, d, null), true);
});

test('references and arrays', () => {
    const d = dumpOf([
        prop('target', { uuid: '' }, { type: 'cc.Node' }),
        prop('other', { uuid: 'x' }, { type: 'cc.Node' }),
        prop('list', [prop('0', 1)], { isArray: true }),
        prop('empty', [], { isArray: true }),
    ]);
    assert.strictEqual(testCondition({ member: 'target' }, d, null), false);
    assert.strictEqual(testCondition({ member: 'other' }, d, null), true);
    assert.strictEqual(testCondition({ member: 'list' }, d, null), true);
    assert.strictEqual(testCondition({ member: 'empty' }, d, null), false);
});

test('members missing from the dump come from the scene', () => {
    const d = dumpOf([prop('a', 1)]);
    assert.strictEqual(testCondition({ member: 'isAlive' }, d, null), false);
    assert.strictEqual(testCondition({ member: 'isAlive' }, d, remote({ isAlive: true })), true);
    assert.strictEqual(testCondition({ member: 'phase', values: ['boss'] }, d, remote({ phase: 'boss' })), true);
});

test('showIf needs all, hideIf any', () => {
    const d = dumpOf([prop('x', true), prop('y', false)]);
    const s = (m: Partial<MemberMeta>) => memberState(field('f', m), d, null);
    assert.strictEqual(s({ showIf: [{ member: 'x' }, { member: 'y' }] }).hidden, true);
    assert.strictEqual(s({ showIf: [{ member: 'x' }] }).hidden, false);
    assert.strictEqual(s({ hideIf: [{ member: 'y' }, { member: 'x' }] }).hidden, true);
    assert.strictEqual(s({ hideIf: [{ member: 'y' }] }).hidden, false);
});

test('readOnly, enableIf, disableIf', () => {
    const d = dumpOf([prop('x', true), prop('y', false)]);
    const s = (m: Partial<MemberMeta>) => memberState(field('f', m), d, null);
    assert.strictEqual(s({ readOnly: true }).disabled, true);
    assert.strictEqual(s({ enableIf: [{ member: 'y' }] }).disabled, true);
    assert.strictEqual(s({ enableIf: [{ member: 'x' }] }).disabled, false);
    assert.strictEqual(s({ disableIf: [{ member: 'x' }] }).disabled, true);
    assert.strictEqual(s({}).disabled, false);
});

test('play mode flags', () => {
    const d = dumpOf([]);
    const edit = remote({}, false);
    const play = remote({}, true);
    assert.strictEqual(memberState(field('f', { hideInPlayMode: true }), d, play).hidden, true);
    assert.strictEqual(memberState(field('f', { hideInPlayMode: true }), d, edit).hidden, false);
    assert.strictEqual(memberState(field('f', { hideInEditMode: true }), d, edit).hidden, true);
    assert.strictEqual(memberState(field('f', { disableInPlayMode: true }), d, play).disabled, true);
    assert.strictEqual(memberState(field('f', { disableInEditMode: true }), d, edit).disabled, true);
});

section('scene requests');

test('only conditions on non-dump members need the scene', () => {
    const d = dumpOf([prop('a', true)]);
    assert.strictEqual(buildEvalRequest(metaOf(field('b', { showIf: [{ member: 'a' }] })), d).needed, false);
    const r = buildEvalRequest(metaOf(field('b', { showIf: [{ member: '!isAlive' }] }), field('c', { infoBoxes: [{ message: 'm', type: 'info', visibleIf: { member: 'warn' } }] })), d);
    assert.strictEqual(r.needed, true);
    assert.deepStrictEqual(r.request.members, ['isAlive', 'warn']);
});

test('validation, dropdown lists, progress bounds and play flags', () => {
    const d = dumpOf([prop('hp', 5), prop('maxHp', 10)]);
    const r = buildEvalRequest(metaOf(
        field('hp', { validate: { method: 'checkHp' }, progressBar: { min: 0, max: 'maxHp' } }),
        field('skin', { dropdown: { member: 'skins' } }),
        field('ghost', { validate: { method: 'nope' } }),
    ), d);
    assert.deepStrictEqual(r.request.validate, [{ method: 'checkHp', member: 'hp' }]);
    assert.deepStrictEqual(r.request.lists, ['skins']);
    assert.deepStrictEqual(r.request.members, []);
    assert.strictEqual(r.needed, true);
    assert.strictEqual(buildEvalRequest(metaOf(field('a', { hideInPlayMode: true })), d).needed, true);
});

test('validation results map back to their member', () => {
    const request = { validate: [{ method: 'v1', member: 'a' }, { method: 'v2', member: 'b' }] };
    const r: EvalResult = { playing: false, values: {}, validations: [true, 'Too big'], lists: {} };
    assert.strictEqual(validationFor('a', request, r), true);
    assert.strictEqual(validationFor('b', request, r), 'Too big');
    assert.strictEqual(validationFor('c', request, r), undefined);
    assert.strictEqual(validationFor('a', request, null), undefined);
});

test('required: empty values', () => {
    assert.strictEqual(isEmptyValue(prop('a', null)), true);
    assert.strictEqual(isEmptyValue(prop('a', '')), true);
    assert.strictEqual(isEmptyValue(prop('a', { uuid: '' })), true);
    assert.strictEqual(isEmptyValue(prop('a', { uuid: 'x' })), false);
    assert.strictEqual(isEmptyValue(prop('a', 0)), false);
    assert.strictEqual(isEmptyValue(prop('a', false)), false);
});
