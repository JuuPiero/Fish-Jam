/**
 * Runs the real Game panel UI in a plain browser with a stub bridge that renders
 * a fake game. `npm run preview`, then open tests/preview/out/preview.html#<state>.
 * States: stopped | playing | aspect | display | more | add | nocam | error | interact | debug
 */
import { FrameRequest, FrameResult, GameBridge, InputMessage, PanelSettings } from '../../source/bridge';
import { createGamePanel } from '../../source/panels/default/app';
import { createAspectController } from '../../source/pie-aspect';

const state = location.hash.slice(1) || 'playing';

const stub = {
    mode: 'off' as 'off' | 'run' | 'pause',
    t: 0,
    frameId: 0,
    lastTick: performance.now(),
    inputs: [] as InputMessage[],
    cursor: null as null | { u: number; v: number },
    calls: [] as string[],
    lastReq: null as FrameRequest | null,
    saved: null as PanelSettings | null,
    /** Simulated Play-in-Editor screen size (device px); null = follows setGameAspect / the panel. */
    screen: null as null | [number, number],
    aspect: null as number | null,
    binaryFrames: 0,
    answeredAt: 0,
    gaps: [] as number[],
};

function render(w: number, h: number): Promise<string> {
    const now = performance.now();
    if (stub.mode === 'run') stub.t += (now - stub.lastTick) / 1000;
    stub.lastTick = now;
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#6f8fb8');
    sky.addColorStop(1, '#b9c6d3');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#4fbf3a';
    g.fillRect(0, h * 0.62, w, h * 0.38);
    const s = Math.min(w / 1280, h / 720);
    for (let i = 0; i < 5; i++) {
        g.fillStyle = '#9b9ba3';
        g.fillRect(w / 2 + (i - 2) * 210 * s - 75 * s, h * 0.45 - (i % 2) * 60 * s, 150 * s, 26 * s);
    }
    const bx = w / 2 + Math.sin(stub.t * 2) * 360 * s;
    g.fillStyle = '#c55fc5';
    g.beginPath();
    g.arc(bx, h * 0.4, 34 * s, 0, Math.PI * 2);
    g.fill();
    if (stub.cursor) {
        g.strokeStyle = '#ff3030';
        g.lineWidth = 3 * s;
        g.beginPath();
        g.arc(stub.cursor.u * w, stub.cursor.v * h, 18 * s, 0, Math.PI * 2);
        g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.font = `${Math.round(28 * s)}px sans-serif`;
    g.fillText(`Score: ${Math.floor(stub.t * 10)}`, 24 * s, 48 * s);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }).then((blob) => new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.readAsDataURL(blob);
    }));
}

async function stubFrame(req: FrameRequest): Promise<FrameResult> {
    const cameras = state === 'nocam' || req.display !== 0 ? 0 : 2;
    const scale = Math.min(1, req.maxWidth / req.gameWidth, req.maxHeight / req.gameHeight);
    const w = Math.max(2, Math.round(req.gameWidth * scale));
    const h = Math.max(2, Math.round(req.gameHeight * scale));
    stub.frameId++;
    const stats = {
        mode: stub.mode, driver: 'self' as const, fps: 60, drawCalls: 14, tris: 3420,
        gameWidth: req.gameWidth, gameHeight: req.gameHeight, designWidth: 1280, designHeight: 720,
        screenWidth: stub.screen ? stub.screen[0] : stub.aspect && stub.mode !== 'off' ? Math.round(600 * stub.aspect) : req.gameWidth,
        screenHeight: stub.screen ? stub.screen[1] : stub.aspect && stub.mode !== 'off' ? 600 : req.gameHeight,
        cameras, paused: stub.mode !== 'run',
        capture: { mode: 'async+worker', ms: 3.2, encodeMs: 3.2, kb: 41.5 },
        mutedCameras: stub.mode === 'off' ? 0 : 2,
    };
    if (!cameras) return { id: stub.frameId, frame: null, stats };
    const data = await render(w, h);
    // While playing frames come as bytes (the PIE webview channel), otherwise as base64.
    if (stub.mode !== 'off') {
        stub.binaryFrames++;
        return { id: stub.frameId, frame: { width: w, height: h, bytes: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) }, stats };
    }
    return { id: stub.frameId, frame: { width: w, height: h, data }, stats };
}

const bridge: GameBridge = {
    async setPreviewPlay(play) {
        stub.calls.push(`setPreviewPlay(${play})`);
        return true;
    },
    async previewCall(method, ...args) {
        stub.calls.push(`previewCall(${method},${args.join(',')})`);
        return true;
    },
    async connectPie() {
        stub.calls.push('connectPie');
    },
    disconnectPie() {
        stub.calls.push('disconnectPie');
    },
    setGameAspect(a) {
        stub.calls.push(`setGameAspect(${a === null ? 'null' : a.toFixed(3)})`);
        stub.aspect = a;
    },
    async frame(req: FrameRequest): Promise<FrameResult> {
        stub.lastReq = req;
        // Gap between the last answer and this request (the panel's own delay).
        if (stub.mode === 'run' && stub.answeredAt) stub.gaps.push(performance.now() - stub.answeredAt);
        // Like the scene's long poll: while playing it answers when the next frame is rendered.
        if (stub.mode === 'run') await new Promise((r) => setTimeout(r, 16));
        try {
            return await stubFrame(req);
        } finally {
            stub.answeredAt = performance.now();
        }
    },
    async play() {
        stub.calls.push('play');
        stub.mode = 'run';
    },
    async pause(p) {
        stub.calls.push(`pause(${p})`);
        stub.mode = p ? 'pause' : 'run';
    },
    async step() {
        stub.calls.push('step');
        stub.mode = 'pause';
        stub.t += 1 / 60;
    },
    async stop() {
        stub.calls.push('stop');
        stub.mode = 'off';
    },
    async detach() {
        stub.calls.push('detach');
    },
    async input(m) {
        stub.inputs.push(m);
        if (m.u !== undefined && m.v !== undefined) stub.cursor = { u: m.u, v: m.v };
        return true;
    },
    async loadSettings() {
        return null;
    },
    async saveSettings(s) {
        stub.saved = s;
    },
    async diagnose() {
        stub.calls.push('diagnose');
        return 'E:/…/game-panel/diagnostics.json';
    },
};

const app = createGamePanel(document.getElementById('app')!, bridge, (window as any).__TEMPLATE__);
(window as any).gamePanel = app;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const click = (el: HTMLElement) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.click();
};
const menuItem = (text: string) => $$('.menu .mi').find((e) => e.textContent!.replace(/\s+/g, ' ').trim().startsWith(text))!;

/** The PIE webview sizing logic, on a fake "webview" inside a fake Preview panel. */
async function aspectControllerTests(check: (name: string, cond: boolean, detail?: unknown) => void) {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:400px;';
    const view = document.createElement('div');
    const cocosStyle = 'position: absolute; left: 150px; top: 0px; width: 200px; height: 400px;';
    view.setAttribute('style', cocosStyle);
    host.appendChild(view);
    document.body.appendChild(host);
    const rect = () => {
        const r = view.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    };

    const ctl = createAspectController(10);
    ctl.set(view, 16 / 9);
    check('aspect: fits 16:9 into the panel, centred', JSON.stringify(rect()) === JSON.stringify([0, 59, 500, 281]), rect());

    view.setAttribute('style', cocosStyle); // Cocos re-applies its device size
    await frame();
    await frame();
    check('aspect: takes the size back when Cocos resets it', JSON.stringify(rect()) === JSON.stringify([0, 59, 500, 281]), rect());

    host.style.width = '300px';
    await frame();
    await frame();
    check('aspect: re-fits when the panel resizes', JSON.stringify(rect()) === JSON.stringify([0, 116, 300, 168]), rect());

    ctl.set(view, 9 / 16);
    check('aspect: portrait', JSON.stringify(rect()) === JSON.stringify([37, 0, 225, 400]), rect());

    for (let i = 0; i < 15; i++) {
        view.setAttribute('style', cocosStyle);
        await frame();
    }
    check('aspect: stops fighting a Cocos that keeps resetting', ctl.info().gaveUp === true, ctl.info());

    ctl.release();
    check('aspect: release restores the original style', view.getAttribute('style') === cocosStyle, view.getAttribute('style'));

    // Element laid out by its parent (not absolute): only width/height are set.
    const flex = document.createElement('div');
    flex.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px;display:flex;align-items:center;justify-content:center;';
    const inner = document.createElement('div');
    flex.appendChild(inner);
    document.body.appendChild(flex);
    ctl.set(inner, 2);
    const r = inner.getBoundingClientRect();
    check('aspect: static layout sized 400x200', Math.round(r.width) === 400 && Math.round(r.height) === 200 && !inner.style.left, [r.width, r.height, inner.style.left]);
    ctl.release();
    check('aspect: release removes the style it added', !inner.hasAttribute('style'), inner.getAttribute('style'));
    host.remove();
    flex.remove();
}

async function interact() {
    const out: string[] = [];
    const check = (name: string, cond: boolean, detail: unknown = '') =>
        out.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' -> ' + JSON.stringify(detail)}`);
    const root = $('.gp');
    const canvas = $('canvas.game') as HTMLCanvasElement;
    const playBtn = $('.pbtn') as HTMLButtonElement;
    const view = () => $('.view').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    await wait(500);
    check('stopped: shows camera preview', app.state.hasFrame && app.state.phase === 'stopped', app.state.phase);
    let box = canvas.getBoundingClientRect();
    check('Free Aspect fills the view', Math.abs(box.width - view().width) < 1.5 && Math.abs(box.height - view().height) < 1.5, [box.width, box.height, view().width, view().height]);
    check('Free Aspect game size = view size in device px', stub.lastReq!.gameWidth === Math.floor(view().width * dpr), stub.lastReq);

    // Aspect menu -> 16:9
    click($('.tb-aspect'));
    await wait(50);
    check('aspect menu opens', !!$('.aspect-menu'));
    menuItem('16:9').click();
    await wait(400);
    box = canvas.getBoundingClientRect();
    check('16:9 letterboxed inside the view', Math.abs(box.width / box.height - 16 / 9) < 0.02 && box.width <= view().width + 0.5 && box.height <= view().height + 0.5, [box.width, box.height]);
    check('16:9 game size sent to the scene', Math.abs(stub.lastReq!.gameWidth / stub.lastReq!.gameHeight - 16 / 9) < 0.01, stub.lastReq);

    // Fixed resolution -> 1920x1080: renders at most the displayed size
    click($('.tb-aspect'));
    await wait(50);
    menuItem('Full HD1920').click();
    await wait(400);
    check('Full HD: game 1920x1080', stub.lastReq!.gameWidth === 1920 && stub.lastReq!.gameHeight === 1080, stub.lastReq);
    check('Full HD: render capped to displayed size', stub.lastReq!.maxWidth <= Math.ceil(view().width * dpr) + 1, stub.lastReq);
    check('scale label < 1x when it does not fit', /^0\.\d\dx$/.test($('.tb-scale em').textContent!.trim()), $('.tb-scale em').textContent);

    // Custom size
    click($('.tb-aspect'));
    await wait(50);
    menuItem('Add').click();
    await wait(50);
    const inputs = $$('.add-form input.field') as HTMLInputElement[];
    inputs[0].value = 'Tablet';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '1000';
    inputs[1].dispatchEvent(new Event('input'));
    inputs[2].value = '600';
    inputs[2].dispatchEvent(new Event('input'));
    await wait(20);
    ($$('.add-form .btn').find((b) => b.textContent === 'OK') as HTMLButtonElement).click();
    await wait(600);
    check('custom size added and selected', app.state.settings.custom.length === 1 && stub.lastReq!.gameWidth === 1000 && stub.lastReq!.gameHeight === 600, app.state.settings.custom);
    check('settings saved', !!stub.saved && stub.saved.custom.length === 1, stub.saved);

    // Display 2 has no camera
    click($('.tb-drop'));
    await wait(50);
    menuItem('Display 2').click();
    await wait(400);
    check('Display 2: "No cameras rendering"', $('.empty') !== null && $('.empty').textContent!.includes('No cameras rendering') && stub.lastReq!.display === 1, $('.empty')?.textContent);
    click($('.tb-drop'));
    await wait(50);
    menuItem('Display 1').click();
    await wait(400);

    // Back to 16:9 for the play tests
    click($('.tb-aspect'));
    await wait(50);
    menuItem('16:9').click();
    await wait(300);
    box = canvas.getBoundingClientRect();

    playBtn.click();
    await wait(600);
    const playCalls = stub.calls.filter((c) => !c.startsWith('diagnose'));
    check('Play: starts PIE, pauses it, connects to its webview, starts the driver',
        playCalls.slice(0, 4).join(' | ') === 'setPreviewPlay(true) | previewCall(pause,true) | connectPie | play', playCalls);

    box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1, clientX: box.left + box.width * 0.25, clientY: box.top + box.height * 0.75 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: box.left + box.width * 0.3, clientY: box.top + box.height * 0.7 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0, clientX: box.left + box.width * 0.3, clientY: box.top + box.height * 0.7 }));
    await wait(100);
    const d = stub.inputs.find((m) => m.type === 'down');
    check('mouse down mapped to (0.25, 0.75)', !!d && Math.abs(d.u! - 0.25) < 0.01 && Math.abs(d.v! - 0.75) < 0.01, d);
    check('binary frames (PIE channel) are drawn', stub.binaryFrames > 2 && app.state.hasFrame && app.state.frameW > 0, [stub.binaryFrames, app.state.frameW]);
    const gaps = stub.gaps.slice(-20).sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1];
    check('playing: the next frame is asked for at once (no extra screen-refresh wait)', gaps.length > 5 && median < 6, { median, gaps });
    app.state.settings.showStats = true;
    await wait(400);
    const capRow = $$('.stats-row').find((r) => r.textContent!.includes('Capture'));
    check('stats show the capture path', !!capRow && capRow.textContent!.includes('async+worker') && capRow.textContent!.includes('41.5 KB'), capRow?.textContent);
    app.state.settings.showStats = false;

    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true, cancelable: true }));
    root.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true, cancelable: true }));
    await wait(50);
    const keys = stub.inputs.filter((m) => m.type.startsWith('key')).map((m) => `${m.type}:${m.code}`);
    check('keys go to the game', keys.join(',') === 'keydown:KeyA,keyup:KeyA', keys);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await wait(50);
    check('Ctrl+Shift+P pauses', app.state.phase === 'paused', app.state.phase);
    app.shortcut('pause');
    await wait(50);
    check('same press via shortcut message is ignored', app.state.phase === 'paused', app.state.phase);

    check('Play gives the game the chosen 16:9 aspect', stub.calls.includes('setGameAspect(1.778)'), stub.calls);

    // Change the aspect while playing (Unity-style): applied live.
    click($('.tb-aspect'));
    await wait(50);
    menuItem('4:3').click();
    await wait(500);
    box = canvas.getBoundingClientRect();
    check('choosing 4:3 while playing resizes the game', stub.calls.includes('setGameAspect(1.333)') && Math.abs(box.width / box.height - 4 / 3) < 0.02 && !$('.tb-aspect .tb-warn'), [box.width, box.height, stub.calls.slice(-3)]);
    click($('.tb-aspect'));
    await wait(50);
    menuItem('16:9').click();
    await wait(300);

    // Cocos keeps the game portrait (it did not accept the size).
    stub.screen = [275, 598];
    await wait(500);
    box = canvas.getBoundingClientRect();
    check('playing at another resolution: shows the real aspect', Math.abs(box.width / box.height - 275 / 598) < 0.02, [box.width, box.height]);
    check('... with a warning on the resolution button', !!$('.tb-aspect .tb-warn'));
    check('... and requests frames at that aspect', Math.abs(stub.lastReq!.gameWidth / stub.lastReq!.gameHeight - 275 / 598) < 0.01, stub.lastReq);
    stub.screen = null;

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(150);
    check('Ctrl+P stops, disconnects and ends PIE', app.state.phase === 'stopped'
        && stub.calls.slice(-3).join(' | ') === 'stop | disconnectPie | setPreviewPlay(false)', stub.calls.slice(-4));
    await wait(400);
    check('stopped: back to the chosen 16:9', Math.abs(canvas.getBoundingClientRect().width / canvas.getBoundingClientRect().height - 16 / 9) < 0.02 && !$('.tb-aspect .tb-warn'));

    await aspectControllerTests(check);

    const pre = document.createElement('pre');
    pre.id = 'result';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
}

(async () => {
    if (state === 'debug') {
        await wait(1000);
        const pre = document.createElement('pre');
        pre.id = 'result';
        pre.textContent = JSON.stringify({ state: app.state, frameId: stub.frameId, calls: stub.calls, req: stub.lastReq }, null, 1);
        document.body.appendChild(pre);
        return;
    }
    if (state === 'interact') {
        try {
            await interact();
        } catch (e) {
            const pre = document.createElement('pre');
            pre.id = 'result';
            pre.textContent = 'FAIL exception ' + ((e as Error).stack || e);
            document.body.appendChild(pre);
        }
        return;
    }
    await wait(300);
    if (state === 'playing' || state === 'more') {
        app.state.settings.resolutionId = 'a16x9';
        await app.togglePlay();
        app.state.settings.showStats = true;
        stub.cursor = { u: 0.62, v: 0.4 };
        if (state === 'more') {
            await wait(300);
            click($$('.tb-side.right .tb-btn')[1]);
        }
    } else if (state === 'aspect' || state === 'add') {
        app.state.settings.custom = [{ id: 'c1', label: 'Tablet', kind: 'fixed', w: 1000, h: 600, custom: true }];
        app.state.settings.resolutionId = 'r1920x1080';
        await wait(300);
        click($('.tb-aspect'));
        if (state === 'add') {
            await wait(100);
            menuItem('Add').click();
        }
    } else if (state === 'display') {
        await wait(300);
        click($('.tb-drop'));
    } else if (state === 'error') {
        app.state.error = 'Could not start play mode: Cocos refused to start Play-in-Editor, check the Console';
    }
})();
