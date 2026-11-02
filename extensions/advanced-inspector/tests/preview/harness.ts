/**
 * Runs the real Inspector renderer on the project's demo component in a
 * browser, with stubbed ui-* elements and a fake scene behind Editor.Message.
 *
 *   index.html#interact   run the checks, print them into #result
 *   index.html#shot       initial state (for a screenshot)
 *   index.html#shot2      boss + debug mode + Combat tab
 */
import { calls, selections, setHandler } from './setup-editor';
import { defineStubs } from './ui-stubs';
import * as renderer from '../../source/inspector/component';
import { getClassMeta } from '../../assets/AdvancedInspector';
import { declared, Node, SpriteFrame, Vec2 } from 'cc';
import { AdvancedInspectorDemo } from '../../../../assets/AdvancedInspectorDemo';

defineStubs();

const logs: string[] = [];
const errors: string[] = [];
const log0 = console.log.bind(console);
console.log = (...a: any[]) => {
    logs.push(a.join(' '));
    log0(...a);
};
const err0 = console.error.bind(console);
console.error = (...a: any[]) => {
    errors.push(a.map(String).join(' '));
    err0(...a);
};
window.addEventListener('error', (e) => errors.push(String(e.message)));

// ------------------------------------------------------------ fake scene

const inst = new AdvancedInspectorDemo() as any;

function dumpOf(key: string, opt: any, v: any): any {
    const d: any = { name: key, visible: true, readonly: false, path: `__comps__.0.${key}` };
    const t = opt.type;
    if (t && t.__enums__) {
        d.type = 'Enum';
        d.enumList = Object.keys(t).filter((k) => isNaN(Number(k)) && !k.startsWith('__')).map((k) => ({ name: k, value: t[k] }));
    } else if (t && t.__bitmask__) {
        d.type = 'BitMask';
        d.bitmaskList = Object.keys(t).filter((k) => isNaN(Number(k)) && !k.startsWith('__')).map((k) => ({ name: k, value: t[k] }));
    } else if (t === 'Integer') {
        d.type = 'Integer';
    } else if (t === Node || t === SpriteFrame) {
        d.type = t === Node ? 'cc.Node' : 'cc.SpriteFrame';
        d.value = { uuid: v ? 'some-uuid' : '' };
        return d;
    } else if (v instanceof Vec2) {
        d.type = 'cc.Vec2';
        d.value = { x: v.x, y: v.y };
        return d;
    } else {
        d.type = typeof v === 'number' ? 'Number' : typeof v === 'boolean' ? 'Boolean' : 'String';
    }
    d.value = v;
    return d;
}

function buildDump(): any {
    const value: any = {
        node: { name: 'node', value: { uuid: 'node-1' }, visible: false, type: 'cc.Node' },
        uuid: { name: 'uuid', value: 'comp-1', visible: false, type: 'String' },
        enabled: { name: 'enabled', value: true, visible: false, type: 'Boolean' },
    };
    const props = declared.get(AdvancedInspectorDemo) || {};
    for (const key of Object.keys(props)) value[key] = dumpOf(key, props[key], inst[key]);
    return { type: 'AdvancedInspectorDemo', value };
}

function apply(d: any) {
    const key = String(d.path).split('.').pop()!;
    const cur = inst[key];
    if (cur instanceof Vec2) inst[key] = new Vec2(d.value.x, d.value.y);
    else if (d.value && typeof d.value === 'object' && 'uuid' in d.value) return;
    else inst[key] = d.value;
}

// ----------------------------------------------------------- the panel

const section = document.createElement('div');
section.className = 'section';
const engine = document.createElement('ui-panel');
engine.setAttribute('src', 'D:\\App\\cocos\\editors\\Creator\\3.8.6\\resources\\resources\\3d\\engine\\editor\\inspector\\components\\class.js');
engine.textContent = '(engine default panel)';
const host = document.createElement('ui-panel') as any;
host.setAttribute('src', 'E:\\advanced-inspector\\dist\\inspector\\component.js');
host.messageProtocol = { scene: 'scene' };
section.append(engine, host);
document.getElementById('inspector')!.append(section);
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>ui-prop, ui-section { margin-top: 4px; }</style><style>${renderer.style}</style>${renderer.template}`;
const panel: any = { $: { root: shadow.querySelector('.ai-root') }, $this: host };

let refreshQueued = false;
function refresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(() => {
        refreshQueued = false;
        renderer.update.call(panel, buildDump());
    }, 5);
}

// What the node Inspector does with change-dump: set-property, then re-query.
shadow.addEventListener('change-dump', (e: any) => {
    apply(e.target.dump);
    refresh();
});

setHandler((_target, message, ...args) => {
    if (message === 'execute-scene-script' && args[0].method === 'getMeta') {
        return args[0].args[0] === 'AdvancedInspectorDemo' ? JSON.parse(JSON.stringify(getClassMeta(AdvancedInspectorDemo))) : null;
    }
    if (message === 'execute-component-method') {
        const { name, args: a } = args[0];
        const r = inst[name](...(a || []));
        if (name !== '__advInspectorEval') refresh();
        return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
    }
    if (message === 'begin-recording') return 'undo-1';
    if (message === 'end-recording') refresh();
    return undefined;
});

renderer.ready.call(panel);

// ---------------------------------------------------------------- checks

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(120);
const root = panel.$.root as HTMLElement;
const item = (key: string) => Array.from(root.querySelectorAll('.ai-item')).find((e: any) => e.__aiKey === key) as HTMLElement | undefined;
const btn = (method: string) => root.querySelector(`[data-ai-method="${method}"]`) as HTMLButtonElement | null;
const shown = (el: Element | null | undefined) => !!el && el.getClientRects().length > 0;
const propShadow = (key: string) => (item(key)?.querySelector('ui-prop') as any)?.shadowRoot as ShadowRoot | undefined;

const results: string[] = [];
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
    if (!ok) failed++;
    results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` -> ${detail}` : ''}`);
}

function describe(el: Element): string {
    if (el.classList.contains('ai-item')) return (el as HTMLElement).dataset.aiId!.replace(/^f:/, '');
    return el.className.split(' ')[0];
}

function setInput(input: HTMLInputElement | HTMLSelectElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The native input inside a ui-num-input / ui-input / ui-checkbox stub. */
const inner = (el: Element | null | undefined) => (el as any)?.shadowRoot?.querySelector('input') as HTMLInputElement;

/** Rows of a @showInInspector member: [label, depth, summary or value]. */
function inspectRows(key: string): HTMLElement[] {
    return Array.from(root.querySelectorAll(`[data-ai-id="s:${key}"] .ai-irow`)) as HTMLElement[];
}
const rowLabel = (r: HTMLElement) => r.querySelector('.ai-itext')!.textContent;
const rowByLabel = (key: string, label: string) => inspectRows(key).find((r) => rowLabel(r) === label);

function click(el: Element | null | undefined) {
    (el as HTMLElement)?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

async function interact() {
    await renderer.update.call(panel, buildDump());
    await settle();

    check('engine panel hidden, ours shown', engine.style.display === 'none' && host.style.display === '');

    const order = Array.from(root.children).map(describe);
    const expected = ['enemyName', 'kind', 'phases', 'attackRange', 'hp', 'maxHp', 'mana', 'damageRange', 'm:healToFull',
        'ai-tabs', 'ai-foldout', 'ai-box', 'ai-hgroup', 'seed', 'spawnCount', 'kills', 'notes', 'ai-bgroup', 'm:kill',
        's:inventory', 's:visited', 's:lastHit', 's:dps', 's:aliveTime'];
    check('top-level order', JSON.stringify(order) === JSON.stringify(expected), JSON.stringify(order));

    const t = item('enemyName')!;
    check('title + subtitle', t.querySelector('.ai-title-text')?.textContent === 'Identity' && t.querySelector('.ai-subtitle')?.textContent === 'Who this enemy is');
    check('required message', t.querySelector('.ai-info-error')?.textContent === 'Every enemy needs a name.');

    // enum toggle buttons + showIf on an enum value
    const toggles = Array.from(item('kind')!.querySelectorAll('.ai-toggle'));
    check('enum toggles', toggles.map((b) => b.textContent).join() === 'Melee,Ranged,Boss' && toggles[0].classList.contains('on'));
    check('phases hidden for Melee', !shown(item('phases')) && !shown(item('attackRange')));
    click(toggles[2]);
    await settle();
    check('click Boss sets kind', inst.kind === 2, String(inst.kind));
    check('phases shown for Boss, with warning', shown(item('phases')) && item('phases')!.querySelector('.ai-info-warning')?.textContent === 'Bosses ignore knockback and have several phases.');
    check('toggle follows value', item('kind')!.querySelectorAll('.ai-toggle')[2].classList.contains('on'));

    // progress bar + onValueChanged
    const bar = item('hp')!.querySelector('.ai-progress') as HTMLElement;
    check('progress text', item('hp')!.querySelector('.ai-progress-text')?.textContent === '80');
    const r = bar.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.25, clientY: r.top + 5, button: 0, pointerId: 1, bubbles: true };
    bar.dispatchEvent(new PointerEvent('pointerdown', at));
    bar.dispatchEvent(new PointerEvent('pointerup', at));
    await settle();
    check('drag progress bar', Math.abs(inst.hp - 25) <= 1 && Number.isInteger(inst.hp), String(inst.hp));
    check('onValueChanged called', logs.some((l) => l.includes('hp is now')), logs.join('|'));
    check('mana label', (item('mana')!.querySelector('ui-label') as HTMLElement)?.textContent === 'Mana');

    // suffix as unit + validateInput
    check('suffix as unit', propShadow('maxHp')?.querySelector('.unit')?.textContent === 'hp');
    setInput(propShadow('maxHp')!.querySelector('input')!, '10');
    await settle();
    await settle();
    check('maxHp set', inst.maxHp === 10, String(inst.maxHp));
    check('validateInput message', item('maxHp')!.querySelector('.ai-info-error')?.textContent === 'Max HP must be at least HP.', item('maxHp')!.innerText);

    // min max slider
    const nums = item('damageRange')!.querySelectorAll('ui-num-input');
    check('min max fields', nums.length === 2 && (nums[0] as any).value === 4 && (nums[1] as any).value === 9);
    setInput((nums[0] as any).shadowRoot.querySelector('input'), '6');
    await settle();
    check('min max edit', inst.damageRange.x === 6 && inst.damageRange.y === 9, JSON.stringify(inst.damageRange));

    // button with undo recording
    click(btn('healToFull'));
    await settle();
    check('button calls method', inst.hp === inst.maxHp, `${inst.hp}/${inst.maxHp}`);
    check('button is recorded', calls.includes('begin-recording') && calls.includes('end-recording'));

    // tabs
    const tabs = Array.from(root.querySelectorAll('.ai-tab'));
    check('tab names', tabs.map((x) => x.textContent).join() === 'Movement,Combat');
    check('first tab active', tabs[0].classList.contains('active') && shown(item('speed')) && !shown(item('attackSpeed')));
    click(tabs[1]);
    await settle();
    check('switch tab', shown(item('attackSpeed')) && !shown(item('speed')));
    const speedSel = item('attackSpeed')!.querySelector('ui-select') as any;
    check('dropdown items', speedSel.options.join() === '0.5,1,1.5,2' && speedSel.value === '1', speedSel.options.join());
    const skinSel = item('skin')!.querySelector('ui-select') as any;
    check('dropdown from member', skinSel.options.join() === 'default,gold,Night (rare)' && skinSel.value === '0', skinSel.options.join());
    setInput(skinSel.shadowRoot.querySelector('select'), '2');
    await settle();
    check('dropdown edit', inst.skin === 'night', inst.skin);
    const masks = Array.from(item('damageTypes')!.querySelectorAll('.ai-toggle'));
    check('bitmask toggles', masks.map((b) => b.textContent).join() === 'Physical,Fire,Ice,Poison' && masks[0].classList.contains('on'));
    click(masks[1]);
    await settle();
    check('bitmask edit', inst.damageTypes === 3, String(inst.damageTypes));
    check('tab stays selected after refresh', shown(item('attackSpeed')));

    // foldout + required object reference
    const fold = root.querySelector('.ai-foldout')!;
    check('foldout', fold.tagName === 'UI-SECTION' && fold.hasAttribute('expand') && fold.querySelector('ui-label')?.getAttribute('value') === 'Loot');
    check('required reference', item('icon')!.querySelector('.ai-info-error')?.textContent === 'Icon is required.');

    // box group with enableIf / showIf / hideIf
    check('box header', root.querySelector('.ai-box-header')?.textContent === 'Debug');
    check('enableIf off -> read only', (propShadow('logLevel')!.querySelector('input') as HTMLInputElement).disabled);
    check('showIf off -> hidden', !shown(item('debugTarget')));
    check('hideIf off -> shown', shown(item('notes')) && !!item('notes')!.querySelector('.ai-info-none'));
    const debugBox = propShadow('debugMode')!.querySelector('input') as HTMLInputElement;
    debugBox.checked = true;
    debugBox.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    check('debugMode on', inst.debugMode === true);
    check('enableIf on -> editable', !(propShadow('logLevel')!.querySelector('input') as HTMLInputElement).disabled);
    check('showIf on -> shown, tinted', shown(item('debugTarget')) && item('debugTarget')!.classList.contains('ai-tinted'));
    check('hideIf on -> hidden', !shown(item('notes')));

    // horizontal group, inline button, read only, play mode
    check('horizontal group', root.querySelector('.ai-hgroup')!.children.length === 2);
    click(btn('randomizeSeed'));
    await settle();
    check('inline button', inst.seed !== 1234, String(inst.seed));
    check('readOnly', (propShadow('spawnCount')!.querySelector('input') as HTMLInputElement).disabled);
    check('hideInEditMode', !shown(item('kills')));
    check('disableInPlayMode is editable in edit mode', !(propShadow('seed')!.querySelector('input') as HTMLInputElement).disabled);

    // button group + showIf on a getter
    const group = root.querySelector('.ai-bgroup')!;
    check('button group', Array.from(group.querySelectorAll('.ai-btn')).map((b) => b.textContent).join() === 'Spawn,Reset');
    check('button colors', group.querySelectorAll('.ai-btn')[1].classList.contains('red'));
    click(btn('spawn'));
    await settle();
    check('spawn', inst.spawnCount === 1 && (propShadow('spawnCount')!.querySelector('input') as HTMLInputElement).value === '1');
    const kill = btn('kill')!;
    check('large blue button', shown(kill) && kill.style.height === '34px' && kill.classList.contains('blue'));
    check('no dead box while alive', !item('hp') || !root.textContent!.includes('This enemy is dead.'));
    click(kill);
    await settle();
    await settle();
    check('kill', inst.hp === 0);
    check('showIf getter hides Kill', !shown(btn('kill')));
    check('infoBox visibleIf !isAlive', !!btn('healToFull')!.closest('.ai-item')!.querySelector('.ai-info-error'));

    // @showInInspector: a Map
    let rows = inspectRows('inventory');
    check('map rows', rows.map(rowLabel).join() === 'Inventory,Potion,Arrow,Bomb,' && rows[0].querySelector('.ai-idim')?.textContent === 'Map (3)',
        rows.map(rowLabel).join());
    check('map title', !!root.querySelector('[data-ai-id="s:inventory"] .ai-title-text')?.textContent?.includes('Runtime'));
    check('map values', (rowByLabel('inventory', 'Arrow')!.querySelector('ui-num-input') as any).value === 20);
    setInput(inner(rowByLabel('inventory', 'Arrow')!.querySelector('ui-num-input')), '25');
    await settle();
    check('edit map value', inst.inventory.get('Arrow') === 25, String(inst.inventory.get('Arrow')));
    click(rowByLabel('inventory', 'Bomb')!.querySelector('.ai-iremove'));
    await settle();
    check('remove map entry', !inst.inventory.has('Bomb') && inspectRows('inventory').length === 4, [...inst.inventory.keys()].join());
    const addRow = inspectRows('inventory').find((r) => r.classList.contains('ai-irow-add'))!;
    setInput(inner(addRow.querySelector('ui-input')), 'Shield');
    click(addRow.querySelector('.ai-iadd'));
    await settle();
    check('add map entry', inst.inventory.get('Shield') === 0 && !!rowByLabel('inventory', 'Shield'), [...inst.inventory.keys()].join());
    click(inspectRows('inventory')[0].querySelector('.ai-ilabel'));
    await settle();
    check('collapse', inspectRows('inventory').length === 1 && !inspectRows('inventory')[0].querySelector('.ai-iarrow.open'));
    click(inspectRows('inventory')[0].querySelector('.ai-ilabel'));
    await settle();
    check('expand', inspectRows('inventory').length === 5);

    // arrays, objects, vectors, getters
    const cave = rowByLabel('visited', '1')!;
    setInput(inner(cave.querySelector('ui-input')), 'Town');
    await settle();
    check('edit array item', inst.visited[1] === 'Town', inst.visited.join());
    check('object rows', inspectRows('lastHit').map(rowLabel).join() === 'Last Hit,from,damage,critical,at');
    const crit = inner(rowByLabel('lastHit', 'critical')!.querySelector('ui-checkbox'));
    crit.checked = true;
    crit.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    check('edit boolean', inst.lastHit.critical === true);
    const axes = rowByLabel('lastHit', 'at')!.querySelectorAll('ui-num-input');
    check('vector fields', axes.length === 2 && (axes[0] as any).value === 3 && (axes[1] as any).value === 4);
    setInput(inner(axes[1]), '7');
    await settle();
    check('edit vector', inst.lastHit.at.y === 7, JSON.stringify(inst.lastHit.at));
    const dps = inspectRows('dps')[0].querySelector('ui-num-input') as any;
    const expectedDps = Math.round(inst.attackSpeed * (inst.damageRange.x + inst.damageRange.y) * 5) / 10;
    check('getter is read-only', dps.hasAttribute('disabled') && dps.value === expectedDps, `${dps.value} vs ${expectedDps}`);
    inst.aliveTime = 5;
    await sleep(800);
    check('live refresh', (inspectRows('aliveTime')[0].querySelector('ui-num-input') as any).value === 5);

    // a class without attributes falls back to the engine panel
    await renderer.update.call(panel, { type: 'PlainComponent', value: { uuid: { value: 'p', visible: false } } });
    check('no attributes -> engine panel', host.style.display === 'none' && engine.style.display === '');
    await renderer.update.call(panel, buildDump());
    check('back to attributes', host.style.display === '' && engine.style.display === 'none');

    check('no errors', errors.length === 0, errors.join(' | '));
    report(`${results.join('\n')}\n\n${results.length - failed} passed, ${failed} failed`);
}

/** The runner waits for #result to appear. */
function report(text: string) {
    const out = document.createElement('div');
    out.id = 'result';
    out.textContent = text;
    document.body.appendChild(out);
}

async function shot(boss: boolean) {
    if (boss) {
        inst.kind = 2;
        inst.debugMode = true;
        inst.enemyName = 'Goblin King';
    }
    await renderer.update.call(panel, buildDump());
    await settle();
    if (boss) {
        click(root.querySelectorAll('.ai-tab')[1]);
        await settle();
    }
    document.body.classList.add('ready');
}

const mode = location.hash.slice(1);
if (mode === 'interact') interact().catch((e) => report(`CRASH ${e?.stack || e}\n${results.join('\n')}`));
else shot(mode === 'shot2');
