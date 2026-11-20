/**
 * The LineRenderer Inspector in a browser page with fake editor data.
 * `#interact` clicks through it and writes the checks to #result.
 */
import { defineStubs } from './ui-stubs';
import * as inspector from '../../source/inspector/line-renderer';

defineStubs();

const calls: { method: string; args: any[] }[] = [];
let mode = 'none';
const settings = { inputMode: 'plane', minVertexDistance: 0.1, viewDistance: 5, surfaceOffset: 0.02, simplifyPreview: true, tolerance: 0.1 };

function state() {
    return { primary: true, target: 'comp-1', mode, selection: mode === 'edit' ? [1, 2] : [], count: 12, simplified: 5, settings: { ...settings }, is2D: false };
}

(window as any).Editor = {
    Message: {
        async request(_pkg: string, _msg: string, opts: any) {
            const method = opts?.method;
            const args = opts?.args ?? [];
            calls.push({ method, args });
            if (method === 'lrSetMode') mode = args[1];
            if (method === 'lrSetSetting') (settings as any)[args[0]] = args[1];
            if (method === 'lrInfo') return { points: 12, length: 23.5 };
            return state();
        },
        __protected__: { addBroadcastListener() {}, removeBroadcastListener() {} },
    },
    Selection: { getSelected: () => ['node-1'], clear() {}, select() {} },
};

const host = document.getElementById('inspector')!;
host.innerHTML = `<style>${inspector.style}</style>${inspector.template}`;
const ctx: any = { $: {}, $this: host };
for (const [k, sel] of Object.entries(inspector.$)) ctx.$[k] = host.querySelector(sel as string);
inspector.ready.call(ctx);
const prop = (displayName: string, value: any) => ({ visible: true, displayName, value });
inspector.update.call(ctx, {
    value: {
        uuid: { value: 'comp-1' },
        node: { value: { uuid: 'node-1' } },
        __scriptAsset: prop('Script', { uuid: 'LineRenderer.ts' }),
        sharedMaterials: prop('Materials', [{ uuid: 'line-default' }]),
        loop: prop('Loop', false),
        positions: prop('Positions', '12 items'),
        widthCurve: prop('Width Curve', 'curve'),
        widthMultiplier: prop('Width Multiplier', 0.1),
        colorGradient: prop('Color Gradient', 'gradient'),
        numCornerVertices: prop('Num Corner Vertices', 0),
        numCapVertices: prop('Num Cap Vertices', 0),
        alignment: prop('Alignment', 'View'),
        textureMode: prop('Texture Mode', 'Stretch'),
        textureScale: prop('Texture Scale', '(1, 1)'),
        useWorldSpace: prop('Use World Space', true),
    },
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function interact() {
    const out: string[] = [];
    const check = (name: string, ok: boolean) => out.push(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    await wait(100);
    check('status shows points and length', (ctx.$.status.textContent || '').includes('12 points · length 23.5'));
    check('simplify button shows the result', (host.textContent || '').includes('Simplify (12 → 5)'));
    check('properties listed', host.querySelectorAll('.props ui-prop').length === 13);
    (ctx.$.edit as HTMLElement).click();
    await wait(150);
    check('Edit Points sets the mode', calls.some((c) => c.method === 'lrSetMode' && c.args[1] === 'edit'));
    check('edit button highlighted', (ctx.$.edit as HTMLElement).classList.contains('blue'));
    check('selection count shown', (ctx.$.status.textContent || '').includes('2 selected'));
    const sub = [...host.querySelectorAll('ui-button')].find((b) => b.textContent === 'Subdivide Selected') as HTMLElement;
    sub.click();
    await wait(50);
    check('Subdivide action', calls.some((c) => c.method === 'lrAction' && c.args[1] === 'subdivide'));
    (ctx.$.create as HTMLElement).click();
    await wait(150);
    check('Create Points sets the mode', calls.some((c) => c.method === 'lrSetMode' && c.args[1] === 'create'));
    const input = host.querySelector('.options ui-select') as any;
    check('input options shown', !!input);
    input.value = 'view';
    input.dispatchEvent(new CustomEvent('change', { bubbles: true }));
    await wait(150);
    check('input mode saved', calls.some((c) => c.method === 'lrSetSetting' && c.args[0] === 'inputMode' && c.args[1] === 'view'));
    check('camera distance field appears', [...host.querySelectorAll('.lr-row span')].some((s) => s.textContent === 'Offset'));
    const res = document.createElement('div');
    res.id = 'result';
    res.textContent = out.join('\n');
    document.body.appendChild(res);
}

if (location.hash === '#interact') interact();
