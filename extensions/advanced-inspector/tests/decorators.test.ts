import assert from 'assert';
import { ccclass, Component, property } from 'cc';
import {
    button, buttonGroup, getClassMeta, guiColor, hideLabel, infoBox, inlineButton, onValueChanged, progressBar,
    readOnly, showIf, tabGroup, title, valueDropdown, type MemberMeta,
} from '../assets/AdvancedInspector';
import { section, test } from './harness';

@ccclass('Base')
class Base extends Component {
    @button('Before Any Property')
    early() {}

    @title('Stats')
    @property
    hp = 10;

    @button()
    heal() {}

    @readOnly
    @property
    speed = 1;

    @readOnly()
    @hideLabel
    @property
    armor = 0;

    @button('Kill', { size: 'large', color: 'red' })
    @buttonGroup('Actions')
    kill() {
        this.hp = 0;
    }

    helper() {}
}

@ccclass('Derived')
class Derived extends Base {
    @button()
    derivedFirst() {}

    @property
    @showIf('isBoss', true)
    @infoBox('Careful', 'warning', 'isBoss')
    phase = 1;

    @property
    @progressBar(0, 'maxHp', '#f80')
    @onValueChanged('onShield')
    @inlineButton('resetShield', 'R')
    shield = 5;

    @property
    @valueDropdown([1, 2, { label: 'Three', value: 3 }])
    @tabGroup('General')
    pick = 1;

    @property
    @tabGroup('Main', 'Audio')
    @guiColor([10, 20, 30])
    volume = 1;

    get isBoss() {
        return this.phase > 1;
    }

    get target(): object | null {
        return null;
    }

    items = [1, 2, 3];

    skins() {
        return ['red', { label: 'Blue', value: 'blue' }];
    }

    checkShield(v: number) {
        return v >= 0 ? true : 'Shield must be positive';
    }

    failing() {
        throw new Error('boom');
    }
}

const byName = (ctor: any) => new Map((getClassMeta(ctor)?.members || []).map((m) => [m.name, m] as [string, MemberMeta]));

section('decorators');

test('methods remember the property declared before them', () => {
    const m = byName(Base);
    assert.strictEqual(m.get('early')!.anchor, null);
    assert.strictEqual(m.get('heal')!.anchor, 'hp');
    assert.strictEqual(m.get('kill')!.anchor, 'armor');
    assert.strictEqual(m.get('kill')!.kind, 'method');
    assert.strictEqual(m.has('helper'), false);
});

test('a subclass starts with no anchor and inherits base members first', () => {
    const meta = getClassMeta(Derived)!;
    const names = meta.members.map((x) => x.name);
    assert.deepStrictEqual(names.slice(0, 5), ['early', 'hp', 'heal', 'speed', 'armor']);
    const m = byName(Derived);
    assert.strictEqual(m.get('derivedFirst')!.anchor, null);
    assert.strictEqual(getClassMeta(Base)!.members.some((x) => x.name === 'phase'), false);
});

test('flag decorators work with and without parentheses', () => {
    const m = byName(Base);
    assert.strictEqual(m.get('speed')!.readOnly, true);
    assert.strictEqual(m.get('armor')!.readOnly, true);
    assert.strictEqual(m.get('armor')!.hideLabel, true);
    assert.strictEqual(m.get('speed')!.kind, 'field');
});

test('options are recorded', () => {
    const m = byName(Derived);
    assert.deepStrictEqual(m.get('hp')!.title, { title: 'Stats', subtitle: undefined, bold: true, line: true });
    assert.deepStrictEqual(m.get('kill')!.button, { label: 'Kill', size: 'large', color: 'red' });
    assert.deepStrictEqual(m.get('kill')!.group, { kind: 'buttons', path: 'Actions' });
    assert.deepStrictEqual(m.get('phase')!.showIf, [{ member: 'isBoss', values: [true] }]);
    assert.deepStrictEqual(m.get('phase')!.infoBoxes, [{ message: 'Careful', type: 'warning', visibleIf: { member: 'isBoss' } }]);
    assert.deepStrictEqual(m.get('shield')!.progressBar, { min: 0, max: 'maxHp', color: [255, 136, 0, 255] });
    assert.deepStrictEqual(m.get('shield')!.onChanged, ['onShield']);
    assert.deepStrictEqual(m.get('shield')!.inlineButtons, [{ method: 'resetShield', label: 'R' }]);
    assert.deepStrictEqual(m.get('pick')!.dropdown, { items: [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: 'Three', value: 3 }] });
    assert.deepStrictEqual(m.get('pick')!.group, { kind: 'tab', path: 'Tabs', tab: 'General' });
    assert.deepStrictEqual(m.get('volume')!.group, { kind: 'tab', path: 'Main', tab: 'Audio' });
    assert.deepStrictEqual(m.get('volume')!.color, [10, 20, 30, 255]);
});

test('colors: #rgb, #rrggbbaa', () => {
    class C {}
    guiColor('#f80')(C.prototype, 'a');
    guiColor('#11223380')(C.prototype, 'b');
    const m = byName(C);
    assert.deepStrictEqual(m.get('a')!.color, [255, 136, 0, 255]);
    assert.deepStrictEqual(m.get('b')!.color, [17, 34, 51, 128]);
});

test('Babel-style field descriptors are fields', () => {
    class C {}
    showIf('x')(C.prototype, 'f', { initializer: () => 1, enumerable: true, configurable: true, writable: true });
    button()(C.prototype, 'm', { value() {}, enumerable: false, configurable: true, writable: true });
    const m = byName(C);
    assert.strictEqual(m.get('f')!.kind, 'field');
    assert.strictEqual(m.get('m')!.kind, 'method');
});

section('scene evaluation');

test('__advInspectorEval answers members, validations and lists', () => {
    const d = new Derived() as any;
    d.phase = 2;
    const r = d.__advInspectorEval({
        members: ['isBoss', 'target', 'items', 'skins', 'missing'],
        validate: [{ method: 'checkShield', member: 'shield' }, { method: 'failing', member: 'hp' }, { method: 'nope', member: 'hp' }],
        lists: ['skins', 'items'],
    });
    assert.strictEqual(r.playing, false);
    assert.deepStrictEqual(r.values, { isBoss: true, target: null, items: 3, skins: 2, missing: null });
    assert.deepStrictEqual(r.validations, [true, 'boom', true]);
    assert.deepStrictEqual(r.lists.skins, [{ label: 'red', value: 'red' }, { label: 'Blue', value: 'blue' }]);
    assert.deepStrictEqual(r.lists.items, [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 }]);
    d.shield = -1;
    assert.deepStrictEqual(d.__advInspectorEval({ validate: [{ method: 'checkShield', member: 'shield' }] }).validations, ['Shield must be positive']);
});

test('the scene script can look classes up', () => {
    const g = globalThis as any;
    assert.strictEqual(typeof g.__advInspectorGetClassMeta, 'function');
    assert.ok(g.__advInspectorClasses.has(Base) && g.__advInspectorClasses.has(Derived));
});
