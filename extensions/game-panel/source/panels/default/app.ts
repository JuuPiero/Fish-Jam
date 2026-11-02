/**
 * Vue app of the Game panel (Unity-style Game view). Free of Node/Editor APIs:
 * everything goes through the GameBridge, so it also runs in a browser preview.
 */
import { computed, createApp, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { FrameRequest, FrameResult, FrameStats, GameBridge, InputMessage, PanelSettings, Resolution } from '../../bridge';
import { fromBase64 } from '../../capture';

export type Phase = 'stopped' | 'starting' | 'playing' | 'paused' | 'stopping';
export type ShortcutAction = 'play' | 'pause' | 'step';
type MenuName = '' | 'display' | 'aspect' | 'more';

export const DISPLAY_COUNT = 8;
const SCALE_MAX = 5;

export const BUILTIN_RESOLUTIONS: Resolution[] = [
    { id: 'free', label: 'Free Aspect', kind: 'free', w: 0, h: 0 },
    { id: 'design', label: 'Design Resolution', kind: 'design', w: 0, h: 0 },
    { id: 'a5x4', label: '5:4', kind: 'aspect', w: 5, h: 4 },
    { id: 'a4x3', label: '4:3', kind: 'aspect', w: 4, h: 3 },
    { id: 'a3x2', label: '3:2', kind: 'aspect', w: 3, h: 2 },
    { id: 'a16x10', label: '16:10', kind: 'aspect', w: 16, h: 10 },
    { id: 'a16x9', label: '16:9', kind: 'aspect', w: 16, h: 9 },
    { id: 'a18x9', label: '18:9', kind: 'aspect', w: 18, h: 9 },
    { id: 'a19.5x9', label: '19.5:9', kind: 'aspect', w: 19.5, h: 9 },
    { id: 'a3x4', label: '3:4 Portrait', kind: 'aspect', w: 3, h: 4 },
    { id: 'a9x16', label: '9:16 Portrait', kind: 'aspect', w: 9, h: 16 },
    { id: 'a9x19.5', label: '9:19.5 Portrait', kind: 'aspect', w: 9, h: 19.5 },
    { id: 'r1280x720', label: 'HD', kind: 'fixed', w: 1280, h: 720 },
    { id: 'r1920x1080', label: 'Full HD', kind: 'fixed', w: 1920, h: 1080 },
    { id: 'r2560x1440', label: 'QHD', kind: 'fixed', w: 2560, h: 1440 },
    { id: 'r720x1280', label: 'HD Portrait', kind: 'fixed', w: 720, h: 1280 },
    { id: 'r1080x1920', label: 'Full HD Portrait', kind: 'fixed', w: 1080, h: 1920 },
    { id: 'r750x1334', label: 'iPhone 8', kind: 'fixed', w: 750, h: 1334 },
    { id: 'r1125x2436', label: 'iPhone X / 11 Pro', kind: 'fixed', w: 1125, h: 2436 },
    { id: 'r1170x2532', label: 'iPhone 13 / 14', kind: 'fixed', w: 1170, h: 2532 },
    { id: 'r2048x1536', label: 'iPad', kind: 'fixed', w: 2048, h: 1536 },
    { id: 'r1536x2048', label: 'iPad Portrait', kind: 'fixed', w: 1536, h: 2048 },
];

export interface GamePanelApp {
    readonly state: ReturnType<typeof createState>;
    togglePlay(): Promise<void>;
    togglePause(): Promise<void>;
    step(): Promise<void>;
    /** Panel-scoped editor shortcut (contributions.shortcuts). */
    shortcut(action: ShortcutAction): void;
    /** Broadcast scene:preview-stop (PIE stopped from elsewhere). */
    onPreviewStop(): void;
    setVisible(visible: boolean): void;
    destroy(): Promise<void>;
}

function defaultSettings(): PanelSettings {
    return {
        resolutionId: 'free',
        display: 0,
        quality: 'high',
        previewWhenStopped: true,
        showStats: false,
        custom: [],
    };
}

function createState() {
    return reactive({
        phase: 'stopped' as Phase,
        hasFrame: false,
        frameW: 0,
        frameH: 0,
        stats: null as FrameStats | null,
        settings: defaultSettings(),
        /** Device pixels per game pixel chosen with the slider; null = fit. */
        zoom: null as number | null,
        flip: null as boolean | null,
        menu: '' as MenuName,
        menuLeft: 0,
        adding: null as null | { label: string; kind: 'aspect' | 'fixed'; w: number; h: number },
        visible: true,
        error: '',
        notice: '',
        noticeSeq: 0,
        viewW: 0,
        viewH: 0,
        dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** Fields the layout depends on: applied at once. The rest (fps, draw calls, ...) at most every STATS_MS. */
const LAYOUT_STATS: (keyof FrameStats)[] = ['mode', 'driver', 'cameras', 'paused', 'gameWidth', 'gameHeight', 'designWidth', 'designHeight', 'screenWidth', 'screenHeight'];
const STATS_MS = 250;

/** Should `next` replace the shown stats? Avoids re-rendering the panel for every frame. */
function statsDue(shown: FrameStats | null, next: FrameStats, shownAt: number, now: number): boolean {
    if (!shown) return true;
    if (LAYOUT_STATS.some((k) => shown[k] !== next[k])) return true;
    return now - shownAt >= STATS_MS && JSON.stringify(shown) !== JSON.stringify(next);
}

function errorText(e: unknown): string {
    return (e as Error)?.message || String(e);
}

export function createGamePanel(el: HTMLElement, bridge: GameBridge, template: string): GamePanelApp {
    const state = createState();
    let alive = true;
    let lastId = -1;
    let looping = false;
    let canvasEl: HTMLCanvasElement | null = null;
    let viewEl: HTMLElement | null = null;
    let pressedKeys = new Map<string, InputMessage>();
    let inputChain: Promise<unknown> = Promise.resolve();
    let pendingMove: InputMessage | null = null;
    let settingsLoaded = false;

    const active = () => state.phase === 'playing' || state.phase === 'paused';

    function notify(msg: string) {
        state.notice = msg;
        state.noticeSeq++;
    }

    function fail(msg: string, e?: unknown) {
        state.error = e ? `${msg}: ${errorText(e)}` : msg;
    }

    // -------------------------------------------------------- resolution

    function resolutions(): Resolution[] {
        return [...BUILTIN_RESOLUTIONS, ...state.settings.custom];
    }

    function currentResolution(): Resolution {
        return resolutions().find((r) => r.id === state.settings.resolutionId) || BUILTIN_RESOLUTIONS[0];
    }

    /**
     * While playing, the size the game really runs at, when it differs from the
     * choice (resolution changed after Play started, or Cocos ignored it).
     */
    function actualMismatch(): { w: number; h: number } | null {
        const s = state.stats;
        if (!active() || !s || !s.screenWidth || !s.screenHeight) return null;
        const want = chosenSize();
        const a = s.screenWidth / s.screenHeight;
        if (Math.abs(a - want.w / want.h) / a < 0.01) return null;
        const k = want.h / s.screenHeight;
        return { w: Math.max(1, Math.round(s.screenWidth * k)), h: Math.max(1, Math.round(want.h)) };
    }

    /** Game resolution in device pixels: the choice, or the real one if they differ. */
    function gameSize(): { w: number; h: number } {
        return actualMismatch() || chosenSize();
    }

    /** Game resolution in device pixels for the current choice and view size. */
    function chosenSize(): { w: number; h: number } {
        const r = currentResolution();
        const vw = Math.max(1, Math.floor(state.viewW * state.dpr));
        const vh = Math.max(1, Math.floor(state.viewH * state.dpr));
        if (r.kind === 'fixed') return { w: r.w, h: r.h };
        if (r.kind === 'design') {
            const s = state.stats;
            return s && s.designWidth ? { w: s.designWidth, h: s.designHeight } : { w: 1280, h: 720 };
        }
        if (r.kind === 'aspect') {
            const s = Math.min(vw / r.w, vh / r.h);
            return { w: Math.max(1, Math.floor(r.w * s)), h: Math.max(1, Math.floor(r.h * s)) };
        }
        return { w: vw, h: vh };
    }

    /** Device pixels per game pixel that makes the game fit the view. */
    function fitScale(): number {
        const g = gameSize();
        return Math.min((state.viewW * state.dpr) / g.w, (state.viewH * state.dpr) / g.h) || 1;
    }

    function scaleRange() {
        const fit = fitScale();
        return { min: Math.min(fit, 1), max: Math.max(SCALE_MAX, fit) };
    }

    function scale(): number {
        const { min, max } = scaleRange();
        return Math.min(max, Math.max(min, state.zoom ?? fitScale()));
    }

    // ------------------------------------------------------------ frames

    function measureView() {
        if (!viewEl) return;
        const r = viewEl.getBoundingClientRect();
        state.viewW = r.width;
        state.viewH = r.height;
        state.dpr = window.devicePixelRatio || 1;
    }

    function frameRequest(): FrameRequest | null {
        if (state.viewW < 8 || state.viewH < 8) measureView();
        if (state.viewW < 8 || state.viewH < 8) return null;
        const g = gameSize();
        const s = Math.min(1, scale());
        return {
            gameWidth: g.w,
            gameHeight: g.h,
            maxWidth: Math.round(g.w * s),
            maxHeight: Math.round(g.h * s),
            quality: state.settings.quality === 'high' ? 0.88 : 0.6,
            after: lastId,
            flip: state.flip,
            display: state.settings.display,
        };
    }

    let ctx2d: CanvasRenderingContext2D | null = null;
    let statsAt = 0;

    async function draw(frame: NonNullable<FrameResult['frame']>) {
        if (!canvasEl) return;
        // JPEG decoding happens off this (the editor's UI) thread.
        const bytes = frame.bytes || fromBase64(frame.data || '');
        const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
        if (canvasEl.width !== frame.width) canvasEl.width = frame.width;
        if (canvasEl.height !== frame.height) canvasEl.height = frame.height;
        // Frames are opaque: no alpha channel to blend.
        if (!ctx2d) ctx2d = canvasEl.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
        ctx2d.drawImage(bitmap, 0, 0);
        bitmap.close();
        state.frameW = frame.width;
        state.frameH = frame.height;
        state.hasFrame = true;
    }

    /**
     * Decodes and draws frames while the next one is being fetched. If frames
     * arrive faster than they can be drawn, only the newest waiting one is.
     */
    let waitingFrame: NonNullable<FrameResult['frame']> | null = null;
    let drawing = false;
    async function present(frame: NonNullable<FrameResult['frame']>) {
        waitingFrame = frame;
        if (drawing) return;
        drawing = true;
        try {
            while (waitingFrame) {
                const f = waitingFrame;
                waitingFrame = null;
                await draw(f).catch((e) => fail('Could not draw a frame', e));
            }
        } finally {
            drawing = false;
        }
    }

    async function loop() {
        if (looping) return;
        looping = true;
        while (alive) {
            const wantFrames = state.visible && (active() || state.phase === 'starting' || state.settings.previewWhenStopped);
            const req = wantFrames ? frameRequest() : null;
            if (!req) {
                await sleep(250);
                continue;
            }
            let got = false;
            try {
                const res = await bridge.frame(req);
                const now = performance.now();
                if (statsDue(state.stats, res.stats, statsAt, now)) {
                    state.stats = res.stats;
                    statsAt = now;
                }
                if (res.stats.cameras === 0) state.hasFrame = false;
                if (res.frame) {
                    lastId = res.id;
                    present(res.frame);
                    got = true;
                }
                if (state.error.startsWith('Could not get frames')) state.error = '';
            } catch (e) {
                fail('Could not get frames from the Scene', e);
                await sleep(1000);
            }
            // Playing: after a frame, ask for the next one at once (the scene answers
            // when it has one), so what you see lags the game as little as possible.
            if (state.phase === 'playing') {
                if (!got) await nextFrame();
            } else {
                await sleep(state.phase === 'paused' ? 50 : 120);
            }
        }
        looping = false;
    }

    // -------------------------------------------- live game aspect (PIE)

    /** Exact aspect of the choice (Free Aspect follows the panel size). */
    function chosenAspect(): number {
        const r = currentResolution();
        if ((r.kind === 'aspect' || r.kind === 'fixed') && r.w > 0 && r.h > 0) return r.w / r.h;
        const g = chosenSize();
        return g.w / g.h;
    }

    /** Give the running game the aspect chosen here. */
    function pushGameAspect() {
        if (active()) bridge.setGameAspect(chosenAspect());
    }

    let aspectTimer = 0;
    watch(() => (active() ? chosenAspect().toFixed(4) : ''), (key) => {
        if (!key) return;
        clearTimeout(aspectTimer);
        aspectTimer = window.setTimeout(pushGameAspect, 120);
    });

    // ------------------------------------------------------------- play

    async function start() {
        state.phase = 'starting';
        state.error = '';
        try {
            const ok = await bridge.setPreviewPlay(true);
            if (!ok) throw new Error('Cocos refused to start Play-in-Editor, check the Console');
            // PIE "paused" is the state in which the Scene panel stays editable;
            // the scene script keeps the game logic running from there.
            await bridge.previewCall('pause', true);
            // PIE runs in its own scene webview: talk to that one from now on.
            await bridge.connectPie();
            lastId = -1;
            await bridge.play();
            state.phase = 'playing';
            pushGameAspect();
        } catch (e) {
            fail('Could not start play mode', e);
            // Capture the state of the failed start for troubleshooting.
            await bridge.diagnose(diagnosticsExtra()).catch(() => undefined);
            state.phase = 'stopped';
            try {
                await bridge.stop();
            } catch {
                // not connected
            }
            bridge.disconnectPie();
            await bridge.setPreviewPlay(false).catch(() => undefined);
        }
    }

    async function stop() {
        state.phase = 'stopping';
        releaseKeys();
        try {
            await bridge.stop().catch(() => undefined);
            bridge.disconnectPie();
            lastId = -1;
            await bridge.setPreviewPlay(false);
        } catch (e) {
            fail('Could not stop Play-in-Editor', e);
        } finally {
            state.phase = 'stopped';
        }
    }

    async function togglePlay() {
        if (state.phase === 'starting' || state.phase === 'stopping') return;
        if (active()) await stop();
        else await start();
    }

    async function togglePause() {
        if (state.phase === 'playing') {
            await bridge.pause(true);
            state.phase = 'paused';
        } else if (state.phase === 'paused') {
            await bridge.pause(false);
            state.phase = 'playing';
        }
    }

    async function step() {
        if (!active()) return;
        await bridge.step();
        state.phase = 'paused';
    }

    // A key press can arrive twice: as a DOM keydown here and as an Editor
    // shortcut message. The keydown runs; the message is skipped if it just ran.
    let keyAction = '';
    let keyTime = 0;
    function runShortcut(action: ShortcutAction, fromKeydown: boolean) {
        const now = Date.now();
        if (fromKeydown) {
            keyAction = action;
            keyTime = now;
        } else if (action === keyAction && now - keyTime < 250) {
            return;
        }
        if (action === 'play') togglePlay();
        else if (action === 'pause') togglePause();
        else step();
    }

    // ------------------------------------------------------------ input

    function send(msg: InputMessage) {
        if (!active()) return;
        if (msg.type === 'move') {
            const scheduled = !!pendingMove;
            pendingMove = msg;
            if (scheduled) return;
            inputChain = inputChain.then(() => {
                const m = pendingMove;
                pendingMove = null;
                return m ? bridge.input(m) : undefined;
            }).catch(() => undefined);
            return;
        }
        inputChain = inputChain.then(() => bridge.input(msg)).catch(() => undefined);
    }

    function pointer(e: MouseEvent) {
        const r = canvasEl!.getBoundingClientRect();
        return {
            u: (e.clientX - r.left) / r.width,
            v: (e.clientY - r.top) / r.height,
            button: e.button,
            buttons: e.buttons,
            dx: e.movementX,
            dy: e.movementY,
        };
    }

    function keyMessage(type: 'keydown' | 'keyup', e: KeyboardEvent): InputMessage {
        return {
            type, key: e.key, code: e.code, keyCode: e.keyCode, repeat: e.repeat,
            altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
        };
    }

    function releaseKeys() {
        for (const msg of pressedKeys.values()) send({ ...msg, type: 'keyup' });
        pressedKeys = new Map();
    }

    // ---------------------------------------------------------- settings

    let saveTimer = 0;
    watch(() => JSON.stringify(state.settings), () => {
        if (!settingsLoaded) return;
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
            bridge.saveSettings(JSON.parse(JSON.stringify(state.settings))).catch(() => undefined);
        }, 400);
    });

    bridge.loadSettings().then((saved) => {
        if (saved) Object.assign(state.settings, defaultSettings(), saved);
        if (!resolutions().some((r) => r.id === state.settings.resolutionId)) state.settings.resolutionId = 'free';
    }).catch(() => undefined).finally(() => {
        settingsLoaded = true;
    });

    // ------------------------------------------------------- diagnostics

    function diagnosticsExtra() {
        return {
            phase: state.phase,
            stats: state.stats,
            resolution: currentResolution(),
            chosenSize: chosenSize(),
            gameSize: gameSize(),
            scale: scale(),
            frame: [state.frameW, state.frameH],
            view: [state.viewW, state.viewH],
            devicePixelRatio: state.dpr,
            display: state.settings.display,
            error: state.error,
        };
    }

    // -------------------------------------------------------------- vue

    const Root = defineComponent({
        name: 'GamePanel',
        setup() {
            const root = ref<HTMLElement | null>(null);
            const view = ref<HTMLElement | null>(null);
            const canvas = ref<HTMLCanvasElement | null>(null);
            let resizeObserver: ResizeObserver | null = null;
            let noticeTimer = 0;
            const noticeVisible = ref(false);

            const onWindowMove = (e: MouseEvent) => send({ type: 'move', ...pointer(e) });
            const onWindowUp = (e: MouseEvent) => {
                send({ type: 'up', ...pointer(e) });
                if (!e.buttons) {
                    window.removeEventListener('mousemove', onWindowMove, true);
                    window.removeEventListener('mouseup', onWindowUp, true);
                }
            };

            onMounted(() => {
                canvasEl = canvas.value;
                viewEl = view.value;
                measureView();
                resizeObserver = new ResizeObserver(measureView);
                resizeObserver.observe(view.value!);
                loop();
            });
            onBeforeUnmount(() => {
                resizeObserver?.disconnect();
                window.removeEventListener('mousemove', onWindowMove, true);
                window.removeEventListener('mouseup', onWindowUp, true);
                clearTimeout(noticeTimer);
            });

            watch(() => state.noticeSeq, () => {
                noticeVisible.value = true;
                clearTimeout(noticeTimer);
                noticeTimer = window.setTimeout(() => (noticeVisible.value = false), 4000);
            });

            const game = computed(() => gameSize());
            const currentScale = computed(() => scale());
            const range = computed(() => scaleRange());
            const display = computed(() => {
                const g = game.value;
                const s = currentScale.value / state.dpr;
                return { width: `${Math.max(1, g.w * s)}px`, height: `${Math.max(1, g.h * s)}px` };
            });
            const resolution = computed(() => currentResolution());
            const resolutionList = computed(() => ({
                special: BUILTIN_RESOLUTIONS.filter((r) => r.kind === 'free' || r.kind === 'design'),
                aspects: BUILTIN_RESOLUTIONS.filter((r) => r.kind === 'aspect'),
                fixed: BUILTIN_RESOLUTIONS.filter((r) => r.kind === 'fixed'),
                custom: state.settings.custom,
            }));
            const scaleLabel = computed(() => {
                const s = currentScale.value;
                return `${s < 1 ? s.toFixed(2) : s.toFixed(1)}x`;
            });
            const playing = computed(() => active() || state.phase === 'starting');

            const sizeLabel = (r: Resolution) => {
                if (r.kind === 'fixed') return `${r.w}×${r.h}`;
                if (r.kind === 'design') {
                    const s = state.stats;
                    return s && s.designWidth ? `${s.designWidth}×${s.designHeight}` : '';
                }
                return '';
            };

            const openMenu = (name: MenuName, e: MouseEvent) => {
                const target = e.currentTarget as HTMLElement;
                const rootRect = root.value!.getBoundingClientRect();
                const rect = target.getBoundingClientRect();
                state.menuLeft = name === 'more' ? -1 : rect.left - rootRect.left;
                state.menu = state.menu === name ? '' : name;
                state.adding = null;
            };
            const closeMenus = () => {
                state.menu = '';
            };
            const chooseResolution = (r: Resolution) => {
                const changed = state.settings.resolutionId !== r.id;
                state.settings.resolutionId = r.id;
                state.zoom = null;
                state.menu = '';
                if (changed) pushGameAspect();
            };
            const mismatch = computed(() => actualMismatch());
            const removeResolution = (r: Resolution) => {
                state.settings.custom = state.settings.custom.filter((c) => c.id !== r.id);
                if (state.settings.resolutionId === r.id) state.settings.resolutionId = 'free';
            };
            const startAdd = () => {
                state.adding = { label: '', kind: 'fixed', w: 1920, h: 1080 };
                nextTick(() => {
                    const menu = root.value?.querySelector('.aspect-menu') as HTMLElement | null;
                    if (!menu) return;
                    menu.scrollTop = menu.scrollHeight;
                    (menu.querySelector('.add-form input') as HTMLInputElement | null)?.focus();
                });
            };
            const confirmAdd = () => {
                const a = state.adding;
                if (!a || !(a.w > 0) || !(a.h > 0)) return;
                const label = a.label.trim() || (a.kind === 'aspect' ? `${a.w}:${a.h}` : `${a.w}×${a.h}`);
                const r: Resolution = { id: `custom-${Date.now()}`, label, kind: a.kind, w: Number(a.w), h: Number(a.h), custom: true };
                state.settings.custom = [...state.settings.custom, r];
                state.adding = null;
                chooseResolution(r);
            };
            const chooseDisplay = (i: number) => {
                state.settings.display = i;
                state.hasFrame = false;
                state.menu = '';
            };
            const onScale = (e: Event) => {
                state.zoom = Number((e.target as HTMLInputElement).value);
            };

            const onDown = (e: MouseEvent) => {
                root.value?.focus({ preventScroll: true });
                state.menu = '';
                if (!active()) return;
                e.preventDefault();
                send({ type: 'down', ...pointer(e) });
                window.addEventListener('mousemove', onWindowMove, true);
                window.addEventListener('mouseup', onWindowUp, true);
            };
            const onHover = (e: MouseEvent) => {
                if (e.buttons) return; // dragging is handled by the window listeners
                send({ type: 'move', ...pointer(e) });
            };
            const onWheel = (e: WheelEvent) => {
                if (!active()) return;
                e.preventDefault();
                send({ type: 'wheel', ...pointer(e), deltaX: e.deltaX, deltaY: e.deltaY });
            };

            const onKeyDown = (e: KeyboardEvent) => {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'SELECT') return;
                const ctrl = e.ctrlKey || e.metaKey;
                // Unity shortcuts: Ctrl+P play/stop, Ctrl+Shift+P pause, Ctrl+Alt+P step.
                if (ctrl && e.code === 'KeyP') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!e.repeat) runShortcut(e.altKey ? 'step' : e.shiftKey ? 'pause' : 'play', true);
                    return;
                }
                if (e.key === 'Escape' && (state.menu || state.adding)) {
                    state.menu = '';
                    state.adding = null;
                    return;
                }
                if (!active()) return;
                // Keys go to the game, not to the editor's shortcuts.
                e.preventDefault();
                e.stopPropagation();
                if (!e.repeat) pressedKeys.set(e.code, keyMessage('keydown', e));
                send(keyMessage('keydown', e));
            };
            const onKeyUp = (e: KeyboardEvent) => {
                if (!active()) return;
                e.preventDefault();
                e.stopPropagation();
                pressedKeys.delete(e.code);
                send(keyMessage('keyup', e));
            };
            const onBlur = () => releaseKeys();

            const saveDiagnostics = async () => {
                state.menu = '';
                try {
                    const file = await bridge.diagnose(diagnosticsExtra());
                    notify(`Saved: ${file}`);
                } catch (e) {
                    fail('Could not save diagnostics', e);
                }
            };
            const cycleFlip = () => {
                state.flip = state.flip === null ? true : state.flip ? false : null;
                lastId = -1;
            };

            return {
                s: state,
                root,
                view,
                canvas,
                game,
                display,
                range,
                currentScale,
                scaleLabel,
                resolution,
                resolutionList,
                sizeLabel,
                mismatch,
                playing,
                noticeVisible,
                displayCount: DISPLAY_COUNT,
                togglePlay,
                togglePause,
                step,
                openMenu,
                closeMenus,
                chooseResolution,
                removeResolution,
                startAdd,
                confirmAdd,
                chooseDisplay,
                onScale,
                onDown,
                onHover,
                onWheel,
                onKeyDown,
                onKeyUp,
                onBlur,
                saveDiagnostics,
                cycleFlip,
                flipLabel: computed(() => (state.flip === null ? 'Auto' : state.flip ? 'On' : 'Off')),
            };
        },
        template,
    });

    const app = createApp(Root);
    app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
    app.mount(el);

    return {
        state,
        togglePlay,
        togglePause,
        step,
        shortcut(action) {
            runShortcut(action, false);
        },
        onPreviewStop() {
            if (state.phase === 'stopping' || state.phase === 'stopped') return;
            releaseKeys();
            const stopped = bridge.stop().catch(() => undefined);
            stopped.finally(() => bridge.disconnectPie());
            lastId = -1;
            state.phase = 'stopped';
            notify('Play-in-Editor was stopped');
        },
        setVisible(visible: boolean) {
            state.visible = visible;
            if (!visible && !active()) bridge.detach().catch(() => undefined);
        },
        async destroy() {
            alive = false;
            if (active()) await stop();
            else await bridge.detach().catch(() => undefined);
            app.unmount();
        },
    };
}
