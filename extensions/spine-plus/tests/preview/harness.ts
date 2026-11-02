/**
 * The Preview panel with a fake bridge. With #interact it runs checks and
 * writes the results into #result (read by the headless test runner).
 */
import { createPreviewApp } from '../../source/panels/default/app';
import { Bridge, loadImage } from '../../source/panels/default/bridge';

const FIXTURES: Record<string, { name: string; json: string; atlas: string; pages: Record<string, string> }> = (window as any).FIXTURES;

function bytes(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

const bridge: Bridge = {
    async load(uuid) {
        const f = FIXTURES[uuid];
        if (!f) throw new Error(`no fixture ${uuid}`);
        const images = new Map<string, HTMLImageElement>();
        for (const [name, b64] of Object.entries(f.pages)) images.set(name, await loadImage(bytes(b64)));
        return {
            name: f.name,
            uuid,
            source: { json: JSON.parse(f.json), binary: null, atlasText: f.atlas, pageImage: (n: string) => images.get(n) ?? null },
        };
    },
    onSelection: () => () => undefined,
    pending: async () => (location.hash.includes('x43') ? 'x43' : 'fish'),
    loadSettings: async () => null,
    saveSettings: () => undefined,
};

const preview = createPreviewApp(document.getElementById('app')!, bridge);
(window as any).preview = preview;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(fn: () => boolean, ms = 8000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (fn()) return true;
        await wait(50);
    }
    return false;
}

/** Fraction of canvas pixels that differ from the background. */
function coverage(): number {
    const d = preview.debug();
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl') as WebGLRenderingContext;
    const w = canvas.width;
    const h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const bg = [px[0], px[1], px[2]];
    let n = 0;
    for (let i = 0; i < px.length; i += 16) {
        if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 24) n++;
    }
    void d;
    return n / (px.length / 16);
}

function bonesSnapshot(): number[] {
    const { inst } = preview.debug();
    const out: number[] = [];
    for (const b of inst.skeleton.bones) {
        const w = inst.boneWorld(b);
        out.push(w.a, w.c, w.x, w.y);
    }
    return out;
}

async function run(): Promise<void> {
    const lines: string[] = [];
    const check = (name: string, ok: boolean, detail = '') => lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
    try {
        for (const key of ['fish', 'x43']) {
            if (!FIXTURES[key]) {
                lines.push(`skip ${key}: no fixture`);
                continue;
            }
            await preview.show(key);
            const { vm } = preview.debug();
            check(`${key}: loads`, vm.status === 'ready', vm.message);
            check(`${key}: runtime`, vm.info?.runtime === (key === 'x43' ? '4.3' : '4.2'), `${vm.info?.runtime} for ${vm.info?.exported}`);
            await until(() => vm.batches > 0, 3000);
            check(`${key}: draws batches`, vm.batches > 0, `${vm.batches} batches, ${vm.vertices} vertices`);
            await wait(200);
            const cov = coverage();
            check(`${key}: pixels on screen`, cov > 0.01, `${(cov * 100).toFixed(1)}% covered`);
            check(`${key}: skin picked`, !!vm.skin && vm.skin !== '', vm.skin);
            check(`${key}: animation playing`, !!vm.animation && vm.time >= 0, `${vm.animation} t=${vm.time.toFixed(2)}`);
            // Physics: a shake must bend physics bones compared with no shake.
            vm.physics = true;
            const before = bonesSnapshot();
            vm.shake('x');
            await wait(300);
            const after = bonesSnapshot();
            let diff = 0;
            for (let i = 0; i < before.length; i++) diff = Math.max(diff, Math.abs(before[i] - after[i]));
            check(`${key}: shake moves the skeleton`, diff > 0.001, `max change ${diff.toFixed(4)}`);
            // Dragging the canvas moves the node and queues movement for physics.
            const canvas = document.querySelector('canvas')!;
            const r = canvas.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            vm.recenter();
            canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, pointerId: 1, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 60, clientY: cy, button: 0, pointerId: 1, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + 60, clientY: cy, button: 0, pointerId: 1, bubbles: true }));
            const { view } = preview.debug();
            check(`${key}: drag moves the node`, view.nodeX > 0, `nodeX ${view.nodeX.toFixed(1)}`);
            // Overlays and settings don't throw.
            vm.showBones = true;
            vm.showMesh = true;
            vm.showBounds = true;
            vm.background = 'light';
            await wait(150);
            check(`${key}: overlays draw`, coverage() > 0.01);
            if (vm.info.skins.length > 2) {
                vm.skin = vm.info.skins[2];
                vm.applySkin();
                await wait(100);
                check(`${key}: skin switch`, vm.batches > 0, vm.skin);
            }
            vm.scrub('0.1');
            check(`${key}: scrub pauses at time`, !vm.playing && Math.abs(vm.time - 0.1) < 1e-6);
            vm.togglePlay();
            vm.showBones = vm.showMesh = vm.showBounds = false;
            vm.background = 'dark';
        }
    } catch (e) {
        lines.push(`FAIL exception: ${(e as Error).stack || e}`);
    }
    const div = document.createElement('div');
    div.id = 'result';
    div.textContent = lines.join('\n');
    document.body.appendChild(div);
}

if (location.hash.includes('interact')) setTimeout(run, 300);
