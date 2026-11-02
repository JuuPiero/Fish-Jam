import { writeFileSync } from 'fs';
import { join } from 'path';
import { FrameRequest, FrameResult, GameBridge, InputMessage, PanelSettings } from './bridge';
import { createAspectController } from './pie-aspect';

const PACKAGE = 'game-panel';
const CALL = 'game-panel:call';
const REPLY = 'game-panel:reply';
const request = Editor.Message.request as (...args: any[]) => Promise<any>;

/** Edit scene's process (the Scene panel's main webview). */
function sceneScript<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return request('scene', 'execute-scene-script', { name: PACKAGE, method, args });
}

// ------------------------------------------------- webview channel (PIE)

interface Waiter {
    resolve(v: unknown): void;
    reject(e: Error): void;
    timer: number;
}

let replySeq = 0;
const waiting = new Map<number, Waiter>();

function listen(el: any) {
    if (el.__gamePanelListening) return;
    el.__gamePanelListening = true;
    el.addEventListener('ipc-message', (e: any) => {
        if (e.channel !== REPLY) return;
        const [id, ok, result] = e.args || [];
        const w = waiting.get(id);
        if (!w) return;
        waiting.delete(id);
        clearTimeout(w.timer);
        if (ok) w.resolve(result);
        else w.reject(new Error(String(result)));
    });
}

function callWebview<T = unknown>(el: any, method: string, args: unknown[], timeout = 5000): Promise<T> {
    listen(el);
    const id = ++replySeq;
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            waiting.delete(id);
            reject(new Error(`No answer to ${method}`));
        }, timeout);
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        try {
            el.send(CALL, id, method, args);
        } catch (e) {
            clearTimeout(timer);
            waiting.delete(id);
            reject(e as Error);
        }
    });
}

/** All <webview> elements of the editor window, including inside panels' shadow DOM. */
function allWebviews(): any[] {
    const out: any[] = [];
    const walk = (root: Document | ShadowRoot) => {
        root.querySelectorAll('*').forEach((el) => {
            if (el.tagName === 'WEBVIEW') out.push(el);
            if ((el as any).shadowRoot) walk((el as any).shadowRoot);
        });
    };
    walk(document);
    return out;
}

function safe<T>(fn: () => T): T | null {
    try {
        return fn();
    } catch {
        return null;
    }
}

interface Who {
    instance: string;
    url: string;
    previewState: unknown;
    previewPaused: boolean;
    sceneName: string | null;
}

interface Probe {
    el: any;
    info: Record<string, unknown> & { who?: Who | null };
}

async function probeWebviews(): Promise<{ edit: Who | null; probes: Probe[] }> {
    const edit = await sceneScript<Who>('gpWho').catch(() => null);
    const probes = await Promise.all(allWebviews().map(async (el): Promise<Probe> => {
        const r = el.getBoundingClientRect();
        const info: Probe['info'] = {
            src: String(el.getAttribute('src') || '').slice(0, 160),
            url: String(safe(() => el.getURL()) || '').slice(0, 160),
            webContentsId: safe(() => el.getWebContentsId()),
            visible: r.width > 0 && r.height > 0,
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        };
        try {
            info.who = await callWebview<Who>(el, 'gpWho', [], 800);
        } catch (e) {
            info.who = null;
            info.error = (e as Error).message;
        }
        return { el, info };
    }));
    return { edit, probes };
}

let pie: { el: any; who: Who } | null = null;
/** Frames come as bytes over the PIE channel until that turns out not to work. */
let binaryOk = true;
let lastProbe: { edit: Who | null; webviews: unknown[] } | null = null;

// ------------------------------------------------ game aspect (PIE webview)

/** Sizes the PIE webview to the aspect chosen in the Game panel (see pie-aspect.ts). */
const aspect = createAspectController();

function aspectContainer(el: any): HTMLElement | null {
    return el.parentElement || (el.getRootNode() as ShadowRoot).host || null;
}

function describeElement(el: any) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
        tag: el.tagName,
        id: el.id,
        className: String(el.className || ''),
        style: el.getAttribute('style'),
        computed: { position: cs.position, display: cs.display, width: cs.width, height: cs.height, transform: cs.transform, left: cs.left, top: cs.top },
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    };
}

function pieElementInfo() {
    const el = pie?.el;
    if (!el) return null;
    const chain = [];
    for (let p = aspectContainer(el), i = 0; p && i < 4; p = aspectContainer(p), i++) chain.push(describeElement(p));
    return {
        webview: describeElement(el),
        parents: chain,
        aspect: aspect.info(),
    };
}

/** Edit process normally; the PIE webview while connected. */
function call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return pie ? callWebview<T>(pie.el, method, args) : sceneScript<T>(method, ...args);
}

export const editorBridge: GameBridge = {
    async setPreviewPlay(play: boolean) {
        const ok = await request('scene', 'editor-preview-set-play', play);
        return ok !== false;
    },
    previewCall(method: string, ...args: unknown[]) {
        return request('scene', 'editor-preview-call-method', method, ...args);
    },
    async connectPie() {
        pie = null;
        // The PIE webview may need a moment to appear after play starts.
        for (let attempt = 0; attempt < 10 && !pie; attempt++) {
            const { edit, probes } = await probeWebviews();
            lastProbe = { edit, webviews: probes.map((p) => p.info) };
            const candidates = probes
                .filter((p) => p.info.who && (!edit || p.info.who.instance !== edit.instance))
                .sort((a, b) => Number(!!b.info.who!.previewPaused) - Number(!!a.info.who!.previewPaused)
                    || Number(!!b.info.visible) - Number(!!a.info.visible));
            const best = candidates[0];
            if (best && best.info.who!.previewPaused) {
                pie = { el: best.el, who: best.info.who! };
                return;
            }
            // PIE in the edit process itself (other editor versions/settings).
            if (edit && edit.previewPaused) return;
            await new Promise((r) => setTimeout(r, 300));
        }
        throw new Error('Could not reach the Play-in-Editor scene view');
    },
    disconnectPie() {
        aspect.release();
        pie = null;
    },
    setGameAspect(value: number | null) {
        aspect.set(pie ? pie.el : null, value);
    },
    async frame(req: FrameRequest) {
        // The PIE webview channel (Electron IPC, structured clone) carries bytes:
        // no base64 encoding there, nor decoding on the editor's UI thread here.
        const binary = !!pie && binaryOk;
        const res = await call<FrameResult>('gpFrame', binary ? { ...req, binary: true } : req);
        const bytes: any = res?.frame?.bytes;
        if (bytes && !ArrayBuffer.isView(bytes) && !(bytes instanceof ArrayBuffer)) {
            // The channel didn't keep the bytes as bytes: use base64 from now on.
            binaryOk = false;
            res.frame!.bytes = Uint8Array.from(Object.values(bytes) as number[]);
        } else if (bytes instanceof ArrayBuffer) {
            res.frame!.bytes = new Uint8Array(bytes);
        }
        return res;
    },
    async play() {
        const res: any = await call('gpPlay');
        if (res && res.error) throw new Error(res.error);
        return res;
    },
    pause(paused: boolean) {
        return call('gpPause', paused);
    },
    step() {
        return call('gpStep');
    },
    stop() {
        return call('gpStop');
    },
    detach() {
        return call('gpDetach');
    },
    input(message: InputMessage) {
        return call('gpInput', message);
    },
    async loadSettings() {
        try {
            return (await Editor.Profile.getProject(PACKAGE, 'settings')) || null;
        } catch {
            return null;
        }
    },
    async saveSettings(settings: PanelSettings) {
        await Editor.Profile.setProject(PACKAGE, 'settings', settings as any);
    },
    async diagnose(extra: Record<string, unknown>) {
        const grab = async (fn: () => Promise<unknown>) => {
            try {
                return await fn();
            } catch (e) {
                return { error: String((e as Error)?.stack || e) };
            }
        };
        const data = {
            creator: Editor.App.version,
            panel: extra,
            target: pie ? { pie: true, who: pie.who } : { pie: false },
            pieGameView: await grab(() => Editor.Profile.getConfig('scene', 'game-view')),
            pieElement: pieElementInfo(),
            scene: await grab(() => call('gpDiagnose')),
            editScene: pie ? await grab(() => sceneScript('gpDiagnose')) : undefined,
            webviews: await grab(async () => (await probeWebviews()).probes.map((p) => p.info)),
            lastConnect: lastProbe,
            webContents: await grab(() => request(PACKAGE, 'query-web-contents')),
        };
        const file = join(__dirname, '..', '..', '..', 'diagnostics.json');
        writeFileSync(file, JSON.stringify(data, null, 2));
        return file;
    },
};
