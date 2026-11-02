/// <reference path="../node_modules/@cocos/creator-types/engine/cc.d.ts" />
/**
 * Scene-process half of the Game panel. Runs inside the Scene panel's engine
 * webview (the same world the Scene panel edits), called from the Game panel via
 * Editor.Message.request('scene', 'execute-scene-script', { name: 'game-panel', method, args }).
 *
 * How "play while editing" works:
 *  1. The Game panel starts Cocos' Play-in-Editor (PIE) and puts it in its
 *     "paused" state - the state in which the Scene panel is editable.
 *  2. This script keeps the game logic running: when the editor ticks the
 *     director it resumes it at the start of the frame; when nobody ticks, it
 *     ticks the director itself from requestAnimationFrame.
 *  3. Every game Camera is mirrored by an extra camera rendering into a
 *     RenderTexture; the Game panel pulls frames from it (JPEG) and sends input
 *     back, which is injected through the engine's editor-only input hooks.
 *
 * Performance:
 *  - The game ticks at game.frameRate (like the built game), not at the
 *    screen's refresh rate.
 *  - While playing, the game cameras PIE parked on its hidden temp window are
 *    not rendered there (nobody sees it; the mirrors draw the Game view).
 *  - Frames are copied off the GPU asynchronously (capture.ts) and encoded on
 *    a worker, so capturing doesn't stall the GPU the whole editor shares.
 */
import { join } from 'path';
import type { Camera, RenderTexture, Scene, renderer } from 'cc';
import type { CaptureStats, FrameRequest, InputMessage } from './bridge';
import { fitToWindow } from './camera-fit';
import { AsyncReadback, JpegEncoder, Readback, toBase64, toOpaqueImage } from './capture';
import { FramePacer, frameInterval } from './pacing';

module.paths.push(join(Editor.App.path, 'node_modules'));

type CC = typeof import('cc');
let ccModule: CC | null = null;
function cc(): CC {
    if (!ccModule) ccModule = require('cc') as CC;
    return ccModule;
}
const legacy = () => (globalThis as any).cc || {};
const cce = () => (globalThis as any).cce || {};

type Mode = 'off' | 'run' | 'pause';
type Driver = 'editor' | 'self' | 'step';

const STALE_MS = 3000;
const SCAN_EVERY_MS = 500;
/** A full scan of the scene tree, as a safety net for the fast camera scan. */
const FULL_SCAN_EVERY_MS = 5000;
const MAX_DT = 0.1;
/** Frames are only copied right after a render while the panel is pulling them. */
const PULLING_MS = 1000;

const S = {
    mode: 'off' as Mode,
    driver: 'self' as Driver,
    stepOnce: false,
    stepping: false,
    selfTicking: false,
    hooked: false,
    rt: null as RenderTexture | null,
    mirrors: new Map<Camera, renderer.scene.Camera>(),
    scene: null as Scene | null,
    scanAt: 0,
    sentFrame: -1,
    mirrorSeq: -1,
    gameW: 1280,
    gameH: 720,
    maxW: 960,
    maxH: 540,
    display: 0,
    lastRequest: 0,
    raf: 0,
    lastRaf: 0,
    lastTotalFrames: -1,
    selfTicks: 0,
    editorTicks: 0,
    updates: 0,
    fps: 0,
    fpsAt: 0,
    lastFrameCount: 0,
    renderKey: '',
    renderSeq: 0,
    lastRepaint: 0,
    reattached: 0,
    inputs: 0,
    inputSwaps: 0,
    /** Change tracking of the captured image (diagnostics). */
    pixelHash: 0,
    pixelChanges: 0,
    pixelChangedAt: 0,
    framesEncoded: 0,
    encoder: null as null | { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: any },
    log: [] as string[],
    /** Ticks at game.frameRate. */
    pacer: new FramePacer(),
    /** Game cameras we stopped rendering to PIE's hidden temp window -> their component. */
    muted: new Map<renderer.scene.Camera, Camera>(),
    /** Last values applied to each mirror (to skip unchanged, dirtying setters). */
    applied: new WeakMap<renderer.scene.Camera, string>(),
    syncedAt: 0,
    fullScanAt: 0,
    /** Async capture: 'on' once it works, 'off' after a failure (old synchronous readPixels then). */
    asyncState: 'unknown' as 'unknown' | 'on' | 'off',
    asyncError: '',
    readback: null as AsyncReadback | null,
    jpeg: null as JpegEncoder | null,
    /** Frame queued for the async copy. */
    queuedSeq: -1,
    capture: { mode: 'sync', ms: 0, encodeMs: 0, kb: 0 } as CaptureStats,
};

function note(msg: string) {
    S.log.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
    if (S.log.length > 80) S.log.shift();
}

function repaint() {
    try {
        cce().Engine?.repaintInEditMode?.();
    } catch {
        // ignore
    }
}

/**
 * Monotonic "something was rendered" counter. root.frameCount alone cannot be
 * used: it resets every second (it is the FPS counter). Both values change in
 * root.frameMove only, so the counter is the same right after a render and
 * until the next one (the director's total frame count moves on after
 * AFTER_DRAW, which would count one render twice).
 */
function renderSeq(): number {
    const { director } = cc();
    const root: any = director.root;
    const key = root ? `${root.cumulativeTime ?? 0}|${root.frameCount ?? 0}` : `${director.getTotalFrames()}`;
    if (key !== S.renderKey) {
        S.renderKey = key;
        S.renderSeq++;
    }
    return S.renderSeq;
}

// ------------------------------------------------------------------ hooks

function onBeginFrame() {
    const { director } = cc();
    if (!S.selfTicking) S.editorTicks++;
    if (S.mode === 'run' || S.stepOnce) {
        if (director.isPaused()) director.resume();
        S.stepOnce = false;
    } else if (S.mode === 'pause' && !director.isPaused()) {
        director.pause();
    }
}

function onAfterUpdate() {
    S.updates++;
}

function onBeforeDraw() {
    if (S.mode === 'off' && Date.now() - S.lastRequest > STALE_MS) {
        detach();
        return;
    }
    syncMirrors();
}

/** Right after a render: start copying the new frame while the panel is pulling frames. */
function onAfterDraw() {
    if (Date.now() - S.lastRequest > PULLING_MS || !S.rt || !S.mirrors.size) return;
    const seq = renderSeq();
    if (S.mirrorSeq >= seq || seq === S.queuedSeq || seq === S.sentFrame) return;
    queueReadback(seq);
}

function onSceneLaunch() {
    destroyMirrors();
    S.scene = null;
    note('scene launched');
}

function hook() {
    if (S.hooked) return;
    const { director, Director } = cc();
    director.on(Director.EVENT_BEGIN_FRAME, onBeginFrame);
    director.on(Director.EVENT_AFTER_UPDATE, onAfterUpdate);
    director.on(Director.EVENT_BEFORE_DRAW, onBeforeDraw);
    director.on(Director.EVENT_AFTER_DRAW, onAfterDraw);
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, onSceneLaunch);
    S.hooked = true;
}

function unhook() {
    if (!S.hooked) return;
    const { director, Director } = cc();
    director.off(Director.EVENT_BEGIN_FRAME, onBeginFrame);
    director.off(Director.EVENT_AFTER_UPDATE, onAfterUpdate);
    director.off(Director.EVENT_BEFORE_DRAW, onBeforeDraw);
    director.off(Director.EVENT_AFTER_DRAW, onAfterDraw);
    director.off(Director.EVENT_AFTER_SCENE_LAUNCH, onSceneLaunch);
    S.hooked = false;
}

// ----------------------------------------------------------------- driver

function selfTick(dt: number) {
    const { director } = cc();
    S.selfTicking = true;
    try {
        if (director.isPaused()) director.resume();
        director.tick(dt);
        S.selfTicks++;
    } catch (e) {
        note(`tick: ${(e as Error).message}`);
    } finally {
        S.selfTicking = false;
    }
}

function driverLoop(now: number) {
    S.raf = requestAnimationFrame(driverLoop);
    if (S.mode !== 'run') {
        S.lastRaf = now;
        S.pacer.reset();
        return;
    }
    // Run at the game's frame rate (60 by default), not at the screen's refresh rate.
    S.pacer.interval = frameInterval(cc().game.frameRate);
    if (!S.pacer.due(now)) return;
    const dt = Math.min(MAX_DT, Math.max(0, (now - (S.lastRaf || now)) / 1000));
    S.lastRaf = now;

    // PIE switched game mode off (paused editing): let PIE's own step run the frame.
    if (S.driver !== 'step' && legacy().GAME_VIEW === false) {
        S.driver = 'step';
        note('driver -> step (GAME_VIEW is false)');
    }
    if (S.driver === 'step') {
        if (!S.stepping) {
            S.stepping = true;
            Promise.resolve(cce().PreviewPlay?.step?.())
                .catch((e: Error) => note(`step: ${e.message}`))
                .finally(() => {
                    S.stepping = false;
                });
        }
        return;
    }

    // If the editor ticked the director since our last frame, it already ran the
    // game (we resumed it in BEGIN_FRAME); otherwise tick it ourselves.
    const total = cc().director.getTotalFrames();
    if (S.lastTotalFrames >= 0 && total !== S.lastTotalFrames) {
        S.driver = 'editor';
        S.lastTotalFrames = total;
        repaint();
        return;
    }
    S.driver = 'self';
    selfTick(dt);
    S.lastTotalFrames = cc().director.getTotalFrames();
}

function startDriver() {
    if (!S.raf) {
        S.lastRaf = 0;
        S.lastTotalFrames = -1;
        S.pacer.reset();
        S.raf = requestAnimationFrame(driverLoop);
    }
}

function stopDriver() {
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
}

// ---------------------------------------------------------------- mirrors

/**
 * Editor-internal nodes (gizmo cameras etc.): hidden/editor-only flags on the
 * node or a parent, or an editor layer (PIE uses the layer to tell them apart).
 */
function isEditorNode(node: any): boolean {
    const { CCObject, Layers } = cc();
    const flags = CCObject.Flags.HideInHierarchy | CCObject.Flags.EditorOnly;
    const layers = Layers.Enum.EDITOR | Layers.Enum.GIZMOS | Layers.Enum.SCENE_GIZMO;
    if ((node?.layer ?? 0) & layers) return true;
    for (let n = node; n; n = n.parent) {
        if ((n._objFlags ?? 0) & flags) return true;
    }
    return false;
}

/** Note: in the editor even game cameras report cameraUsage EDITOR, so usage is not used. */
function isGameCamera(comp: Camera): boolean {
    const src = comp.camera;
    if (!comp.isValid || !comp.enabledInHierarchy || comp.targetTexture || !src) return false;
    if ((src.systemWindowId ?? 0) !== S.display) return false;
    return !isEditorNode(comp.node);
}

function ensureRenderTexture() {
    const gw = Math.max(1, S.gameW);
    const gh = Math.max(1, S.gameH);
    const scale = Math.min(1, S.maxW / gw, S.maxH / gh, 2048 / gw, 2048 / gh);
    const w = Math.max(2, Math.round(gw * scale));
    const h = Math.max(2, Math.round(gh * scale));
    const { RenderTexture } = cc();
    if (!S.rt) {
        S.rt = new RenderTexture();
        S.rt.reset({ width: w, height: h });
        note(`render texture ${w}x${h}`);
    } else if (S.rt.width !== w || S.rt.height !== h) {
        S.rt.resize(w, h);
        for (const cam of S.mirrors.values()) cam.setFixedSize(w, h);
    }
}

function createMirror(comp: Camera, scene: Scene) {
    const { director, renderer } = cc();
    const src = comp.camera;
    const rt = S.rt;
    if (!src || !rt || !rt.window || !director.root) return;
    const cam = director.root.createCamera();
    cam.initialize({
        name: `[GamePanel] ${comp.node.name}`,
        node: comp.node,
        projection: src.projectionType,
        window: rt.window,
        priority: src.priority,
        cameraType: src.cameraType,
        trackingType: src.trackingType,
        // Render like the shipped game, not like an editor camera.
        usage: renderer.scene.CameraUsage.GAME,
    });
    cam.setFixedSize(rt.width, rt.height);
    (src.scene || scene.renderScene)?.addCamera(cam);
    S.mirrors.set(comp, cam);
    S.mirrorSeq = renderSeq();
    note(`mirror + ${comp.node.name} (usage ${src.cameraUsage}, priority ${src.priority}, display ${src.systemWindowId})`);
}

// ------------------------------------------------- temp-window rendering

/**
 * While PIE is "paused" (so the Scene stays editable) it parks the game
 * cameras on its hidden temp window, where they still render the whole scene
 * every frame for nobody to see - next to our mirrors, which draw the Game
 * view. While playing, those cameras are switched off there. Input hit tests
 * don't need them on (UITransform.hitTest reads the render scene's cameras),
 * but their view matrices must stay current: syncMirrors updates them.
 * The selected camera keeps rendering (the editor may preview it).
 */
function wantMuted(comp: Camera, src: renderer.scene.Camera, temp: unknown, selected: Set<string>): boolean {
    return S.mode !== 'off' && !!temp && src.window === temp && comp.enabledInHierarchy && !selected.has(comp.node.uuid);
}

function mute(comp: Camera, src: renderer.scene.Camera) {
    if (S.muted.has(src) || !src.enabled) return;
    src.enabled = false;
    S.muted.set(src, comp);
}

function unmute(src: renderer.scene.Camera) {
    const comp = S.muted.get(src);
    if (!comp) return;
    S.muted.delete(src);
    try {
        // It renders to its window again: give it that window's size back.
        if (src.window) fitToWindow(src, src.window);
        src.enabled = comp.isValid ? comp.enabledInHierarchy : true;
    } catch {
        // camera destroyed
    }
}

/**
 * A muted (parked) game camera does the game's math as if it were on the real
 * screen. The temp window keeps the size PIE gave it (only windows with a
 * swapchain follow screen resizes), so after the Game panel changed the
 * game's aspect, a parked camera would project with the old size: raycasts
 * (screenPointToRay) and UI hit tests would land off target.
 */
function fitToScreen(src: renderer.scene.Camera) {
    const main = cc().director.root?.mainWindow;
    if (main) fitToWindow(src, main);
    src.update(true);
}

function unmuteAll() {
    for (const src of [...S.muted.keys()]) unmute(src);
}

function selectedUuids(): Set<string> {
    try {
        return new Set<string>(cce().Selection?.query?.() || []);
    } catch {
        return new Set();
    }
}

function destroyMirror(comp: Camera) {
    const cam = S.mirrors.get(comp);
    S.mirrors.delete(comp);
    if (comp.camera) unmute(comp.camera);
    for (const [src, c] of S.muted) if (c === comp) unmute(src);
    if (!cam) return;
    try {
        cam.scene?.removeCamera(cam);
        cam.destroy();
    } catch (e) {
        note(`destroy mirror: ${(e as Error).message}`);
    }
}

function destroyMirrors() {
    for (const comp of [...S.mirrors.keys()]) destroyMirror(comp);
}

/**
 * Game cameras of the scene. Fast path: the cameras attached to the render
 * scenes (an enabled Camera component is always attached), instead of walking
 * every node; the full walk still runs now and then as a safety net.
 */
function liveCameras(scene: Scene, full: boolean): Camera[] {
    const { director, Camera } = cc();
    if (full) return scene.getComponentsInChildren(Camera).filter(isGameCamera);
    const mirrors = new Set(S.mirrors.values());
    const out: Camera[] = [];
    const seen = new Set<Camera>();
    for (const rs of director.root?.scenes || []) {
        for (const cam of rs.cameras) {
            if (mirrors.has(cam) || !cam.node) continue;
            for (const comp of cam.node.getComponents(Camera)) {
                if (comp.camera !== cam || seen.has(comp)) continue;
                seen.add(comp);
                if (comp.node.scene === scene && isGameCamera(comp)) out.push(comp);
            }
        }
    }
    return out;
}

function scanCameras(scene: Scene) {
    const now = Date.now();
    const full = now - S.fullScanAt > FULL_SCAN_EVERY_MS;
    if (full) S.fullScanAt = now;
    const live = liveCameras(scene, full);
    const set = new Set(live);
    for (const comp of [...S.mirrors.keys()]) {
        if (!set.has(comp)) destroyMirror(comp);
    }
    for (const comp of live) {
        if (!S.mirrors.has(comp)) createMirror(comp, scene);
    }
}

/**
 * Create/update mirror cameras for the current scene. Called before every draw
 * (BEFORE_DRAW) and from gpFrame, so it also works if the editor renders
 * without going through the director's events.
 */
function syncMirrors(force = false) {
    try {
        const { director } = cc();
        const scene = director.getScene();
        if (!scene) return;
        ensureRenderTexture();
        const now = Date.now();
        if (scene !== S.scene) {
            destroyMirrors();
            S.scene = scene;
            S.scanAt = 0;
        }
        if (force || now - S.scanAt > SCAN_EVERY_MS) {
            scanCameras(scene);
            S.scanAt = now;
        }
        let resort = false;
        const rt = S.rt!;
        const temp = director.root?.tempWindow;
        const selected = S.mode !== 'off' ? selectedUuids() : new Set<string>();
        for (const [comp, cam] of S.mirrors) {
            const src = comp.camera;
            if (!src || !comp.isValid) continue;
            // PIE's pause moves every non-editor camera of the scene to the hidden
            // temp window - including ours. Keep mirrors on the render texture.
            if (cam.window !== rt.window) {
                cam.changeTargetWindow(rt.window);
                resort = true;
            }
            // Render exactly what the game camera renders: PIE can swap the
            // RenderScene behind the same Scene (soft reload), so follow the source.
            const rs = src.scene || comp.node.scene?.renderScene || null;
            if (rs && cam.scene !== rs) {
                cam.scene?.removeCamera(cam);
                rs.addCamera(cam);
                S.reattached++;
                note(`mirror ${comp.node.name}: re-attached to the game camera's render scene`);
            }
            if (cam.width !== rt.width || cam.height !== rt.height) cam.setFixedSize(rt.width, rt.height);
            // Most of these setters mark the projection dirty: only copy what changed.
            const c = src.clearColor;
            const r = comp.rect;
            const key = [
                src.projectionType, src.fovAxis, src.fov, src.orthoHeight, src.nearClip, src.farClip,
                c.x, c.y, c.z, c.w, src.clearDepth, src.clearStencil, src.clearFlag, src.visibility,
                src.aperture, src.shutter, src.iso, r.x, r.y, r.width, r.height, rt.width, rt.height,
            ].join(',');
            if (S.applied.get(cam) !== key) {
                S.applied.set(cam, key);
                cam.projectionType = src.projectionType;
                cam.fovAxis = src.fovAxis;
                cam.fov = src.fov;
                cam.orthoHeight = src.orthoHeight;
                cam.nearClip = src.nearClip;
                cam.farClip = src.farClip;
                cam.clearColor = src.clearColor;
                cam.clearDepth = src.clearDepth;
                cam.clearStencil = src.clearStencil;
                cam.clearFlag = src.clearFlag;
                cam.visibility = src.visibility;
                cam.aperture = src.aperture;
                cam.shutter = src.shutter;
                cam.iso = src.iso;
                cam.setViewportInOrientedSpace(comp.rect);
            }
            cam.enabled = comp.enabledInHierarchy;
            if (cam.priority !== src.priority) {
                cam.priority = src.priority;
                resort = true;
            }
            // Camera.update() only rebuilds the view matrix when the node moved
            // this frame; a mirror created after the camera settled would keep an
            // identity view. Force it.
            cam.update(true);

            if (wantMuted(comp, src, temp, selected)) {
                mute(comp, src);
                // Disabled cameras aren't updated by the renderer; input (screenPointToRay,
                // screenToWorld) needs current matrices, for the real screen's size.
                if (S.muted.has(src)) fitToScreen(src);
                else src.update(true);
            } else {
                unmute(src);
            }
        }
        if (resort) S.rt?.window?.sortCameras();
        S.syncedAt = Date.now();
    } catch (e) {
        note(`syncMirrors: ${(e as Error).message}`);
    }
}

function attach() {
    hook();
    if (!S.rt) repaint();
}

function detach() {
    destroyMirrors();
    unmuteAll();
    disposeCapture();
    if (S.rt) {
        S.rt.destroy();
        S.rt = null;
    }
    S.scene = null;
    S.sentFrame = -1;
    if (S.mode === 'off') unhook();
}

// ---------------------------------------------------------------- capture

function needsFlip(): boolean {
    const { director, gfx } = cc();
    const api = director.root?.device?.gfxAPI;
    return api === gfx.API.WEBGL || api === gfx.API.WEBGL2 || api === gfx.API.GLES2 || api === gfx.API.GLES3;
}

function encoder(w: number, h: number) {
    if (!S.encoder) {
        const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(w, h)
            : document.createElement('canvas');
        S.encoder = { canvas, ctx: (canvas as any).getContext('2d') };
    }
    const { canvas } = S.encoder;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return S.encoder;
}

function trackPixels(px: Uint8Array) {
    let hash = 0;
    for (let i = 0; i < px.length; i += 1021) hash = (hash * 31 + px[i]) | 0;
    S.framesEncoded++;
    if (hash !== S.pixelHash) {
        S.pixelHash = hash;
        S.pixelChanges++;
        S.pixelChangedAt = Date.now();
    }
}

interface EncodedFrame {
    width: number;
    height: number;
    /** base64 JPEG (requests through Editor messages). */
    data?: string;
    /** JPEG bytes (the Play-in-Editor webview channel carries binary). */
    bytes?: Uint8Array;
}

function packFrame(jpeg: ArrayBuffer, width: number, height: number, binary: boolean): EncodedFrame {
    return binary ? { width, height, bytes: new Uint8Array(jpeg) } : { width, height, data: toBase64(jpeg) };
}

const capAcc = { n: 0, ms: 0, encodeMs: 0, bytes: 0, at: 0 };

/** Capture cost, averaged over half a second (so the stats don't change every frame). */
function recordCapture(mode: string, ms: number, encodeMs: number, bytes: number) {
    capAcc.n++;
    capAcc.ms += ms;
    capAcc.encodeMs += encodeMs;
    capAcc.bytes += bytes;
    const now = Date.now();
    if (now - capAcc.at < 500 && S.capture.mode === mode) return;
    S.capture = {
        mode,
        ms: Math.round((capAcc.ms / capAcc.n) * 10) / 10,
        encodeMs: Math.round((capAcc.encodeMs / capAcc.n) * 10) / 10,
        kb: Math.round(capAcc.bytes / capAcc.n / 102.4) / 10,
    };
    capAcc.n = capAcc.ms = capAcc.encodeMs = capAcc.bytes = 0;
    capAcc.at = now;
}

/** The old way (WebGL1, or after the async path failed): synchronous readPixels. */
async function encodeFrame(rt: RenderTexture, quality: number, flip: boolean | null, binary: boolean): Promise<EncodedFrame | null> {
    const start = performance.now();
    const w = rt.width;
    const h = rt.height;
    const px = rt.readPixels(0, 0, w, h);
    if (!px) return null;
    trackPixels(px);
    const doFlip = flip === null ? needsFlip() : flip;
    // Frames are opaque: a cleared alpha of 0 would otherwise look black.
    const rgba = toOpaqueImage(px, w, h, doFlip);
    const enc = encoder(w, h);
    enc.ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
    const canvas = enc.canvas as any;
    const blob: Blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
        : await new Promise<Blob>((resolve) => canvas.toBlob((b: Blob) => resolve(b), 'image/jpeg', quality));
    const jpeg = await blob.arrayBuffer();
    const ms = performance.now() - start;
    recordCapture('sync', ms, ms, jpeg.byteLength);
    return packFrame(jpeg, w, h, binary);
}

// ------------------------------------------------------- async capture

/** The WebGL2 context, when the editor renders with WebGL2. */
function gl2(): WebGL2RenderingContext | null {
    const { director, gfx } = cc();
    const device: any = director.root?.device;
    if (!device || device.gfxAPI !== gfx.API.WEBGL2) return null;
    const gl = device.gl as WebGL2RenderingContext | undefined;
    return gl && typeof gl.fenceSync === 'function' ? gl : null;
}

function asyncOff(reason: string) {
    if (S.asyncState === 'off') return;
    S.asyncState = 'off';
    S.asyncError = reason;
    note(`async capture off: ${reason}`);
    S.readback?.dispose();
    S.readback = null;
    S.queuedSeq = -1;
}

/** The async readback, created on first use; null when it isn't available. */
function readback(): AsyncReadback | null {
    if (S.asyncState === 'off') return null;
    if (S.readback) return S.readback;
    const gl = gl2();
    if (!gl) {
        asyncOff('the editor does not render with WebGL2');
        return null;
    }
    try {
        S.readback = new AsyncReadback(gl);
        S.jpeg = S.jpeg || new JpegEncoder();
        S.asyncState = 'on';
        note(`async capture on (encoder: ${S.jpeg.mode})`);
        return S.readback;
    } catch (e) {
        asyncOff((e as Error).message);
        return null;
    }
}

/** Starts copying frame `seq` of the render texture off the GPU. */
function queueReadback(seq: number): boolean {
    const rb = readback();
    const rt = S.rt;
    if (!rb || !rt || rb.busy) return false;
    const tex: any = rt.getGFXTexture();
    const glTexture: WebGLTexture | null = tex?.gpuTexture?.glTexture ?? null;
    if (!glTexture) {
        asyncOff('no GL texture behind the render texture');
        return false;
    }
    try {
        rb.start(glTexture, rt.width, rt.height, seq);
        S.queuedSeq = seq;
        return true;
    } catch (e) {
        asyncOff((e as Error).message);
        return false;
    }
}

async function encodeReadback(done: Readback, req: FrameRequest): Promise<EncodedFrame | null> {
    const start = performance.now();
    trackPixels(done.pixels);
    const flip = req.flip === null || req.flip === undefined ? needsFlip() : req.flip;
    const mode = S.jpeg!.mode === 'worker' ? 'async+worker' : 'async';
    const jpeg = await S.jpeg!.encode(done.pixels, done.width, done.height, flip, req.quality ?? 0.85);
    const ms = performance.now() - start;
    recordCapture(mode, ms, ms, jpeg.byteLength);
    return packFrame(jpeg, done.width, done.height, !!req.binary);
}

const WAIT_FRAME_MS = 40;
const tick = () => new Promise((r) => setTimeout(r, 1));

/**
 * The next finished copy: polls the copy in flight, and starts one for a
 * newer render (while playing, frames keep coming), until `maxMs`. Waiting
 * yields between polls, so the game keeps running meanwhile.
 */
async function waitForCopy(rb: AsyncReadback, maxMs: number): Promise<Readback | null> {
    const end = performance.now() + maxMs;
    const alloc = (bytes: number) => S.jpeg!.buffer(bytes);
    for (;;) {
        const done = rb.poll(alloc);
        if (done) return done;
        if (!rb.busy) {
            const seq = renderSeq();
            if (S.mirrors.size && S.mirrorSeq < seq && seq !== S.sentFrame && seq !== S.queuedSeq) queueReadback(seq);
        }
        if (performance.now() >= end || S.asyncState === 'off') return null;
        await tick();
    }
}

function disposeCapture() {
    S.readback?.dispose();
    S.readback = null;
    S.queuedSeq = -1;
    if (S.asyncState === 'on') S.asyncState = 'unknown';
}

function stats() {
    const { director, view } = cc();
    const device: any = director.root?.device;
    const design = view.getDesignResolutionSize();
    // Frames the engine rendered per second (director ticks).
    const now = performance.now();
    const frames = director.getTotalFrames();
    if (!S.fpsAt) {
        S.fpsAt = now;
        S.lastFrameCount = frames;
    } else if (now - S.fpsAt >= 500) {
        S.fps = Math.round(((frames - S.lastFrameCount) * 1000) / (now - S.fpsAt));
        S.fpsAt = now;
        S.lastFrameCount = frames;
    }
    return {
        mode: S.mode,
        driver: S.driver,
        fps: S.fps,
        drawCalls: device?.numDrawCalls ?? 0,
        tris: device?.numTris ?? 0,
        gameWidth: S.gameW,
        gameHeight: S.gameH,
        designWidth: design.width,
        designHeight: design.height,
        // The game's real screen (the canvas its cameras render to).
        screenWidth: Math.round(director.root?.mainWindow?.width ?? 0),
        screenHeight: Math.round(director.root?.mainWindow?.height ?? 0),
        cameras: S.mirrors.size,
        paused: director.isPaused(),
        capture: { ...S.capture, mode: S.asyncState === 'off' ? 'sync' : S.capture.mode },
        mutedCameras: S.muted.size,
    };
}

// ------------------------------------------------------------------ input

/** Viewport (normalized, y from bottom) of the top game camera, used to map input. */
function inputViewport() {
    let best: renderer.scene.Camera | null = null;
    for (const comp of S.mirrors.keys()) {
        const src = comp.camera;
        if (src && (!best || src.priority >= best.priority)) best = src;
    }
    const vp = best?.viewport;
    return vp && vp.width > 0 && vp.height > 0 ? vp : { x: 0, y: 0, width: 1, height: 1 };
}

/**
 * Run `fn` with the game cameras on the real screen. While PIE is paused (so
 * the Scene stays editable) Cocos parks game cameras on the hidden temp window,
 * and UITransform.hitTest ignores cameras without a swapchain - so UI would not
 * receive clicks. Input is dispatched synchronously, between two renders, so
 * moving the cameras just for the dispatch does not show anywhere. Editor
 * cameras are muted meanwhile so they cannot produce hits of their own.
 */
function withGameCamerasOnScreen(fn: () => void) {
    const { director } = cc();
    const main = director.root?.mainWindow;
    const game = new Set<renderer.scene.Camera>();
    for (const comp of S.mirrors.keys()) if (comp.camera) game.add(comp.camera);
    const moved: [renderer.scene.Camera, any][] = [];
    const muted: [renderer.scene.Camera, number][] = [];
    try {
        if (main) {
            for (const cam of game) {
                if (cam.window !== main) {
                    moved.push([cam, cam.window]);
                    cam.changeTargetWindow(main);
                    // changeTargetWindow only marks the projection dirty: rebuild the
                    // matrices now, or raycasts in the handlers use the old window's.
                    cam.update(true);
                }
            }
            const mirrors = new Set(S.mirrors.values());
            for (const cam of director.getScene()?.renderScene?.cameras || []) {
                if (game.has(cam) || mirrors.has(cam)) continue;
                muted.push([cam, cam.visibility]);
                cam.visibility = 0;
            }
        }
        fn();
    } finally {
        for (const [cam, visibility] of muted) cam.visibility = visibility;
        for (const [cam, win] of moved) {
            cam.changeTargetWindow(win);
            // Parked cameras keep the real screen's size (raycasts in update() between frames).
            if (S.muted.has(cam)) fitToScreen(cam);
            else cam.update(true);
        }
        S.inputs++;
        if (moved.length) S.inputSwaps++;
    }
}

function injectInput(m: InputMessage) {
    const { input, screen } = cc();
    const target: any = input;
    const noop = () => undefined;
    if (m.type === 'keydown' || m.type === 'keyup') {
        const ev = {
            type: m.type, key: m.key, code: m.code, keyCode: m.keyCode, which: m.keyCode, repeat: !!m.repeat,
            altKey: !!m.altKey, ctrlKey: !!m.ctrlKey, shiftKey: !!m.shiftKey, metaKey: !!m.metaKey,
            target: null, stopPropagation: noop, preventDefault: noop,
        };
        if (m.type === 'keydown') target._dispatchKeyboardDownEvent(ev);
        else target._dispatchKeyboardUpEvent(ev);
        return;
    }
    // The engine turns clientX/Y into a location relative to #GameCanvas (CSS px
    // times the device pixel ratio, y from the bottom); the game cameras render to
    // that canvas. Build clientX/Y so the location lands on (u, v) inside the top
    // game camera's viewport.
    const vp = inputViewport();
    const u = Math.min(1, Math.max(0, m.u ?? 0));
    const v = Math.min(1, Math.max(0, m.v ?? 0));
    const canvas = document.getElementById('GameCanvas');
    let r = canvas ? canvas.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) {
        const dpr = screen.devicePixelRatio || 1;
        r = { x: 0, y: 0, width: screen.windowSize.width / dpr, height: screen.windowSize.height / dpr } as DOMRect;
    }
    const lx = (vp.x + u * vp.width) * r.width;
    const ly = (vp.y + (1 - v) * vp.height) * r.height;
    const ev = {
        clientX: r.x + lx,
        clientY: r.y + r.height - ly,
        button: m.button ?? 0,
        buttons: m.buttons ?? 0,
        movementX: m.dx ?? 0,
        movementY: m.dy ?? 0,
        deltaX: m.deltaX ?? 0,
        deltaY: m.deltaY ?? 0,
        target: null,
        stopPropagation: noop,
        preventDefault: noop,
    };
    withGameCamerasOnScreen(() => {
        if (m.type === 'down') target._dispatchMouseDownEvent(ev);
        else if (m.type === 'move') target._dispatchMouseMoveEvent(ev);
        else if (m.type === 'up') target._dispatchMouseUpEvent(ev);
        else if (m.type === 'wheel') target._dispatchMouseScrollEvent(ev);
    });
}

// ---------------------------------------------------------------- methods

function src(fn: unknown, max = 2500): string {
    try {
        return typeof fn === 'function' ? String(fn).slice(0, max) : String(fn);
    } catch (e) {
        return `[${(e as Error).message}]`;
    }
}

function size(s: { width: number; height: number } | null | undefined) {
    return s ? [s.width, s.height] : null;
}

export const methods: Record<string, (...args: any[]) => any> = {
    /**
     * Latest rendered frame (JPEG) if the engine rendered since `after`.
     * Also keeps the capture alive and carries the panel's resolution/display.
     *
     * Async capture answers with the frame whose GPU copy has finished (at most
     * one frame behind) and starts the next copy; until a copy finishes it
     * answers without a frame, and the panel asks again.
     */
    async gpFrame(req: FrameRequest) {
        S.lastRequest = Date.now();
        S.gameW = Math.max(1, Math.round(req.gameWidth || 1280));
        S.gameH = Math.max(1, Math.round(req.gameHeight || 720));
        S.maxW = Math.max(16, Math.min(2048, Math.round(req.maxWidth || 960)));
        S.maxH = Math.max(16, Math.min(2048, Math.round(req.maxHeight || 540)));
        if ((req.display ?? 0) !== S.display) {
            S.display = req.display ?? 0;
            destroyMirrors();
        }
        attach();
        // BEFORE_DRAW keeps the mirrors in sync while the engine renders; sync
        // here only when it doesn't (no mirrors yet, or nothing rendered lately).
        if (!S.mirrors.size || Date.now() - S.syncedAt > 250) syncMirrors(!S.mirrors.size);
        const seq = renderSeq();
        const info = stats();
        const rt = S.rt;
        // A mirror created since the last render has not drawn anything yet.
        const rendered = S.mirrorSeq < seq;
        const fresh = seq !== S.sentFrame || req.after !== S.sentFrame;
        const nudge = () => {
            // Not playing: the editor only renders when something changes. Nudge it
            // now and then so the first frame and outside changes show up.
            const wait = !rendered || S.sentFrame < 0 ? 150 : 1000;
            if (S.mode !== 'run' && Date.now() - S.lastRepaint > wait) {
                S.lastRepaint = Date.now();
                repaint();
            }
        };
        if (!rt || !S.mirrors.size || !rendered) {
            nudge();
            return { id: seq, frame: null, stats: info };
        }

        const rb = readback();
        if (rb) {
            // The panel is missing the frame that was sent last (e.g. the flip
            // option changed): copy the current one again.
            if (req.after !== S.sentFrame && !rb.busy) queueReadback(seq);
            // Wait for the newest frame's copy instead of making the panel ask
            // again a screen refresh later: less latency between the game and
            // what you see (and aim at).
            const done = await waitForCopy(rb, fresh || S.mode === 'run' ? WAIT_FRAME_MS : 0);
            if (done) {
                // Copy the newest frame while this one is encoded.
                const latest = renderSeq();
                if (latest !== done.tag && S.mirrorSeq < latest) queueReadback(latest);
                try {
                    const frame = await encodeReadback(done, req);
                    S.sentFrame = done.tag;
                    return { id: done.tag, frame, stats: stats() };
                } catch (e) {
                    // The encoder worker failed: later frames encode on this thread.
                    note(`encode: ${(e as Error).message}`);
                    return { id: seq, frame: null, stats: info };
                }
            }
            // Nothing copied yet for what the panel is missing: start now.
            if (fresh && !rb.busy && (seq !== S.queuedSeq || req.after !== S.sentFrame)) queueReadback(seq);
            if (S.asyncState !== 'off') {
                if (!fresh) nudge();
                return { id: seq, frame: null, stats: info };
            }
        }

        if (!fresh) {
            nudge();
            return { id: seq, frame: null, stats: info };
        }
        S.sentFrame = seq;
        const encoded = await encodeFrame(rt, req.quality ?? 0.85, req.flip ?? null, !!req.binary);
        return { id: seq, frame: encoded, stats: info };
    },

    /** Who is this scene process? Used to find the Play-in-Editor webview. */
    gpWho() {
        const pp = cce().PreviewPlay;
        const { director, screen } = cc();
        return {
            instance: INSTANCE,
            url: location.href,
            previewState: pp?._state ?? null,
            previewPaused: !!pp?.isPause?.(),
            engineManagerPaused: cce().Engine?._paused ?? null,
            sceneName: director.getScene()?.name ?? null,
            windowSize: size(screen.windowSize),
        };
    },

    /** Called by the panel right after PIE was started and paused. */
    gpPlay() {
        // Only drive the game in the process where PIE is running (and paused by
        // the panel). Ticking the edit scene's process would run its systems.
        const pp = cce().PreviewPlay;
        if (pp?.isPause && !pp.isPause()) {
            note('play refused: Play-in-Editor is not paused in this process');
            return { error: 'This scene process is not running Play-in-Editor' };
        }
        S.mode = 'run';
        S.driver = 'self';
        hook();
        startDriver();
        note('play');
        return stats();
    },

    gpPause(paused: boolean) {
        S.mode = paused ? 'pause' : 'run';
        if (paused) cc().director.pause();
        repaint();
        note(paused ? 'pause' : 'resume');
        return stats();
    },

    async gpStep() {
        S.mode = 'pause';
        if (S.driver === 'step') {
            await cce().PreviewPlay?.step?.();
        } else {
            selfTick(1 / 60);
            cc().director.pause();
        }
        return stats();
    },

    gpStop() {
        S.mode = 'off';
        S.stepOnce = false;
        stopDriver();
        destroyMirrors();
        unmuteAll();
        S.scene = null;
        S.sentFrame = -1;
        S.queuedSeq = -1;
        S.readback?.drop();
        note('stop');
        return true;
    },

    gpDetach() {
        if (S.mode === 'off') detach();
        return true;
    },

    gpInput(message: InputMessage) {
        if (S.mode === 'off') return false;
        try {
            injectInput(message);
            return true;
        } catch (e) {
            note(`input: ${(e as Error).message}`);
            return false;
        }
    },

    /** Read-only snapshot of the editor/engine state, for troubleshooting. */
    gpDiagnose() {
        const { director, screen, view, Camera } = cc();
        const root: any = director.root;
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement | null;
        const rect = canvas ? canvas.getBoundingClientRect() : null;
        const pp = cce().PreviewPlay;
        const em = cce().Engine;
        const sfm = cce().SceneFacadeManager;
        const scene = director.getScene();
        const dpr = screen.devicePixelRatio || 1;
        const proto = (o: any) => {
            const names = new Set<string>();
            for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
                Object.getOwnPropertyNames(p).forEach((n) => names.add(n));
            }
            return [...names].filter((n) => n !== 'constructor').sort();
        };
        const winName = (w: any) => (w === root?.mainWindow ? 'main' : w === root?.tempWindow ? 'temp' : w === S.rt?.window ? 'game-panel' : w ? 'other' : 'none');
        const comps = scene ? scene.getComponentsInChildren(Camera) : [];
        // Number every RenderScene we meet so cameras/models can be compared.
        const renderScenes: any[] = [];
        const rsId = (rs: any) => {
            if (!rs) return -1;
            let i = renderScenes.indexOf(rs);
            if (i < 0) i = renderScenes.push(rs) - 1;
            return i;
        };
        rsId(scene?.renderScene);
        const meshes = scene ? scene.getComponentsInChildren(cc().MeshRenderer as any) as any[] : [];
        return {
            time: new Date().toISOString(),
            state: {
                ...stats(), renderSeq: S.renderSeq, totalFrames: director.getTotalFrames(),
                selfTicks: S.selfTicks, editorTicks: S.editorTicks, updates: S.updates, hooked: S.hooked,
                display: S.display, sentFrame: S.sentFrame, mirrorSeq: S.mirrorSeq,
                frameRate: cc().game.frameRate, asyncCapture: S.asyncState, asyncError: S.asyncError,
                encoder: S.jpeg?.mode ?? null, queuedSeq: S.queuedSeq,
                mutedCameras: [...S.muted.values()].map((c) => c.node?.name),
            },
            gameView: legacy().GAME_VIEW ?? 'undefined',
            directorPaused: director.isPaused(),
            gamePaused: cc().game.isPaused(),
            previewPlayPaused: pp?.isPause?.(),
            engineManager: em ? { paused: em._paused, tickInEM: em._tickInEM, sceneTick: em._sceneTick, stateRecord: em._stateRecord } : null,
            sceneName: scene?.name,
            screenWindowSize: size(screen.windowSize),
            devicePixelRatio: dpr,
            frameSizeCss: [screen.windowSize.width / dpr, screen.windowSize.height / dpr],
            viewVisibleSize: size(view.getVisibleSize()),
            viewVisibleSizeInPixel: size(view.getVisibleSizeInPixel()),
            designResolution: size(view.getDesignResolutionSize()),
            resolutionPolicy: (view.getResolutionPolicy() as any)?.constructor?.name,
            mainWindow: root?.mainWindow ? [root.mainWindow.width, root.mainWindow.height] : null,
            tempWindow: root?.tempWindow ? [root.tempWindow.width, root.tempWindow.height] : null,
            gameCanvas: canvas ? {
                rect: rect && [rect.x, rect.y, rect.width, rect.height],
                size: [canvas.width, canvas.height],
                style: canvas.getAttribute('style'),
                parent: canvas.parentElement ? `${canvas.parentElement.tagName}#${canvas.parentElement.id}.${canvas.parentElement.className}` : null,
                parentStyle: canvas.parentElement?.getAttribute('style') ?? null,
            } : null,
            gfxAPI: root?.device?.gfxAPI,
            renderTexture: S.rt ? [S.rt.width, S.rt.height] : null,
            capture: {
                framesEncoded: S.framesEncoded,
                pixelChanges: S.pixelChanges,
                msSincePixelChange: S.pixelChangedAt ? Date.now() - S.pixelChangedAt : null,
                reattached: S.reattached,
                inputs: S.inputs,
                inputCameraSwaps: S.inputSwaps,
            },
            meshRenderers: meshes.slice(0, 30).map((m: any) => ({
                node: m.node?.name, active: m.node?.activeInHierarchy, enabled: m.enabledInHierarchy,
                model: !!m.model, modelEnabled: m.model?.enabled, modelScene: rsId(m.model?.scene),
            })),
            renderCameras: (root?.cameraList || []).map((c: any) => ({
                name: c.name, scene: rsId(c.scene), usage: c.cameraUsage, priority: c.priority, enabled: c.enabled, display: c.systemWindowId,
                window: winName(c.window), size: [c.width, c.height],
                viewport: c.viewport && [c.viewport.x, c.viewport.y, c.viewport.width, c.viewport.height],
                visibility: c.visibility, clearFlag: c.clearFlag,
            })),
            cameraComponents: comps.map((c: any) => ({
                node: c.node?.name, enabled: c.enabledInHierarchy, editorNode: isEditorNode(c.node),
                flags: c.node?._objFlags, usage: c.camera?.cameraUsage, mirrored: S.mirrors.has(c),
                scene: rsId(c.camera?.scene), mirrorScene: rsId(S.mirrors.get(c)?.scene),
                rect: c.rect && [c.rect.x, c.rect.y, c.rect.width, c.rect.height],
            })),
            // Index 0 is the director scene's RenderScene.
            renderScenes: renderScenes.map((rs: any, i: number) => ({
                id: i,
                models: rs.models?.length,
                sample: (rs.models || []).slice(0, 25).map((m: any) => `${m.node?.name}${m.enabled ? '' : '(off)'}`),
            })),
            log: S.log.slice(),
            sceneFacadeManagerMethods: sfm ? proto(sfm) : null,
            previewPlayMethods: pp ? proto(pp) : null,
            sources: {
                'SceneFacadeManager.changeTargetResolution': src(sfm?.changeTargetResolution, 4000),
                'PreviewPlay.getGameScene': src(pp?.getGameScene),
                'PreviewPlay.hideEditorCamera': src(pp?.hideEditorCamera),
                'PreviewPlay.start': src(pp?.start),
                'PreviewPlay.pause': src(pp?.pause),
                'PreviewPlay.step': src(pp?.step),
                'PreviewPlay.setResolution': src(pp?.setResolution),
                'PreviewPlay.rotateScene': src(pp?.rotateScene),
                'PreviewPlay.showEditorCamera': src(pp?.showEditorCamera),
                'PreviewPlay.onDirectorEndFrame': src(pp?.onDirectorEndFrame),
                'Engine._tick': src(em?._tick),
                'Engine.tickInEditMode': src(em?.tickInEditMode),
                'Engine._isTickAllowed': src(em?._isTickAllowed),
                'Engine._updateTickState': src(em?._updateTickState),
            },
        };
    },
};

// ------------------------------------------------------------------- ipc

/**
 * Play-in-Editor runs in its own scene webview, which `execute-scene-script`
 * does not reach. The Game panel talks to that webview directly over this
 * channel (webview.send -> ipcRenderer.sendToHost). Only the methods above can
 * be called; nothing is evaluated.
 */
const CALL = 'game-panel:call';
const REPLY = 'game-panel:reply';
const IPC_KEY = '__gamePanelIpc';

async function onIpcCall(_event: unknown, id: number, method: string, args: unknown[]) {
    const { ipcRenderer } = require('electron');
    let ok = true;
    let result: unknown;
    try {
        const fn = Object.prototype.hasOwnProperty.call(methods, method) ? methods[method] : null;
        if (!fn) throw new Error(`Unknown method ${method}`);
        result = await fn(...(Array.isArray(args) ? args : []));
    } catch (e) {
        ok = false;
        result = (e as Error)?.message || String(e);
    }
    ipcRenderer.sendToHost(REPLY, id, ok, result);
}

function listenIpc() {
    try {
        const { ipcRenderer } = require('electron');
        const g = globalThis as any;
        if (g[IPC_KEY]) ipcRenderer.removeListener(CALL, g[IPC_KEY]);
        g[IPC_KEY] = onIpcCall;
        ipcRenderer.on(CALL, onIpcCall);
    } catch (e) {
        note(`ipc unavailable: ${(e as Error).message}`);
    }
}

function unlistenIpc() {
    try {
        const g = globalThis as any;
        if (g[IPC_KEY]) require('electron').ipcRenderer.removeListener(CALL, g[IPC_KEY]);
        g[IPC_KEY] = null;
    } catch {
        // ignore
    }
}

const INSTANCE = Math.random().toString(36).slice(2, 10);
listenIpc();

export function load() {}

export function unload() {
    try {
        unlistenIpc();
        methods.gpStop();
        detach();
        unhook();
        S.jpeg?.dispose();
        S.jpeg = null;
    } catch {
        // editor shutting down
    }
}
