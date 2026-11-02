"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/scene.ts
var scene_exports = {};
__export(scene_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(scene_exports);
var import_path = require("path");

// source/camera-fit.ts
function fitToWindow(cam, win) {
  var _a;
  if (!win) return;
  let orientation = ((_a = win.swapchain) == null ? void 0 : _a.surfaceTransform) ?? 0, w = orientation % 2 ? win.height : win.width, h = orientation % 2 ? win.width : win.height;
  w > 0 && h > 0 && (cam.width !== w || cam.height !== h) && cam.resize(w, h);
}

// source/capture.ts
var AsyncReadback = class {
  constructor(gl) {
    this.gl = gl;
    this.size = 0;
    this.attached = null;
    this.pending = null;
    if (this.fbo = gl.createFramebuffer(), this.pbo = gl.createBuffer(), !this.fbo || !this.pbo) throw new Error("could not create readback objects");
  }
  get busy() {
    return !!this.pending;
  }
  get pendingTag() {
    return this.pending ? this.pending.tag : -1;
  }
  /**
   * Queues a copy of `texture` (RGBA8). Restores every binding it touches,
   * so the engine's own state cache stays right.
   */
  start(texture, width, height, tag) {
    if (this.pending) throw new Error("a readback is already in flight");
    let gl = this.gl, len = width * height * 4, prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    try {
      if (gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo), this.attached !== texture) {
        gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0), this.attached = texture;
        let status = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE)
          throw this.attached = null, new Error(`readback framebuffer incomplete (0x${status.toString(16)})`);
      }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo), this.size !== len && (gl.bufferData(gl.PIXEL_PACK_BUFFER, len, gl.STREAM_READ), this.size = len), gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    } finally {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack), gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
    }
    let sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) throw new Error("fenceSync failed");
    gl.flush(), this.pending = { sync, width, height, tag, at: performance.now() };
  }
  /**
   * The copied pixels (rows bottom-up) once the GPU is done, else null. Never
   * waits. `alloc` provides the buffer to read into.
   */
  poll(alloc) {
    let p = this.pending;
    if (!p) return null;
    let gl = this.gl, status = gl.clientWaitSync(p.sync, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED)
      return performance.now() - p.at > 2e3 && this.drop(), null;
    if (gl.deleteSync(p.sync), this.pending = null, status === gl.WAIT_FAILED) return null;
    let len = p.width * p.height * 4, given = alloc == null ? void 0 : alloc(len), out = given && given.length >= len ? given.subarray(0, len) : new Uint8Array(len), prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    try {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo), gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out, 0, len);
    } finally {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
    }
    return { pixels: out, width: p.width, height: p.height, tag: p.tag };
  }
  /** Forget the copy in flight (e.g. the texture was resized). */
  drop() {
    this.pending && (this.gl.deleteSync(this.pending.sync), this.pending = null);
  }
  dispose() {
    this.drop(), this.gl.deleteFramebuffer(this.fbo), this.gl.deleteBuffer(this.pbo), this.fbo = null, this.pbo = null, this.attached = null;
  }
};
function toOpaqueImage(src2, width, height, flip, out) {
  let len = width * height * 4, dst = out && out.length === len ? out : new Uint8ClampedArray(len), row = width * 4;
  if (flip)
    for (let y = 0; y < height; y++) dst.set(src2.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  else
    dst.set(src2.subarray(0, len));
  let px = new Uint32Array(dst.buffer, dst.byteOffset, len >> 2);
  for (let i = 0; i < px.length; i++) px[i] |= 4278190080;
  return dst;
}
var WORKER_SOURCE = `
const toOpaqueImage = (${toOpaqueImage.toString()});
let canvas = null;
let ctx = null;
let image = null;
self.onmessage = async (e) => {
    const { id, buffer, width, height, flip, quality } = e.data;
    try {
        image = toOpaqueImage(new Uint8Array(buffer), width, height, flip, image && image.length === width * height * 4 ? image : undefined);
        if (!canvas || canvas.width !== width || canvas.height !== height) {
            canvas = new OffscreenCanvas(width, height);
            ctx = canvas.getContext('2d');
        }
        ctx.putImageData(new ImageData(image, width, height), 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        const jpeg = await blob.arrayBuffer();
        self.postMessage({ id, ok: true, jpeg, buffer }, [jpeg, buffer]);
    } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.message || err), buffer }, [buffer]);
    }
};
`, JpegEncoder = class {
  constructor(useWorker = !0) {
    this.worker = null;
    this.jobs = /* @__PURE__ */ new Map();
    this.seq = 0;
    this.spare = [];
    this.canvas = null;
    this.image = null;
    /** 'worker' or 'main' (after the worker failed or wasn't available). */
    this.mode = "main";
    if (!(!useWorker || typeof Worker > "u" || typeof OffscreenCanvas > "u"))
      try {
        let url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
        this.worker = new Worker(url), URL.revokeObjectURL(url), this.worker.onmessage = (e) => this.onMessage(e.data), this.worker.onerror = (e) => this.fail(new Error(e.message || "encoder worker error")), this.mode = "worker";
      } catch {
        this.worker = null;
      }
  }
  /** A buffer of at least `size` bytes to read pixels into (reused between frames). */
  buffer(size2) {
    let i = this.spare.findIndex((b) => b.byteLength >= size2), buf = i >= 0 ? this.spare.splice(i, 1)[0] : new ArrayBuffer(size2);
    return new Uint8Array(buf, 0, size2);
  }
  /** Encodes `pixels` (from buffer(); handed over, don't use it afterwards). */
  encode(pixels, width, height, flip, quality) {
    if (this.worker) {
      let id = ++this.seq, worker = this.worker;
      return new Promise((resolve, reject) => {
        this.jobs.set(id, { resolve, reject }), worker.postMessage({ id, buffer: pixels.buffer, width, height, flip, quality }, [pixels.buffer]);
      });
    }
    return this.encodeHere(pixels, width, height, flip, quality);
  }
  async encodeHere(pixels, width, height, flip, quality) {
    try {
      this.image = toOpaqueImage(pixels, width, height, flip, this.image && this.image.length === width * height * 4 ? this.image : void 0), this.canvas || (this.canvas = typeof OffscreenCanvas < "u" ? new OffscreenCanvas(width, height) : document.createElement("canvas"));
      let canvas = this.canvas;
      return canvas.width !== width && (canvas.width = width), canvas.height !== height && (canvas.height = height), canvas.getContext("2d").putImageData(new ImageData(this.image, width, height), 0, 0), await (canvas.convertToBlob ? await canvas.convertToBlob({ type: "image/jpeg", quality }) : await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality))).arrayBuffer();
    } finally {
      this.recycle(pixels.buffer);
    }
  }
  recycle(buf) {
    buf.byteLength && this.spare.length < 3 && this.spare.push(buf);
  }
  onMessage(m) {
    m.buffer && this.recycle(m.buffer);
    let job = this.jobs.get(m.id);
    job && (this.jobs.delete(m.id), m.ok && m.jpeg ? job.resolve(m.jpeg) : job.reject(new Error(m.error || "encode failed")));
  }
  fail(e) {
    var _a;
    (_a = this.worker) == null || _a.terminate(), this.worker = null, this.mode = "main";
    for (let job of this.jobs.values()) job.reject(e);
    this.jobs.clear();
  }
  dispose() {
    var _a;
    (_a = this.worker) == null || _a.terminate(), this.worker = null, this.jobs.clear(), this.spare = [];
  }
};
function toBase64(bytes) {
  let B = globalThis.Buffer;
  if (B) return B.from(bytes).toString("base64");
  let s = "", u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return btoa(s);
}

// source/pacing.ts
var FramePacer = class {
  constructor(tolerance = 2) {
    this.tolerance = tolerance;
    /** Milliseconds between frames; 0 = every call. */
    this.interval = 0;
    this.next = 0;
  }
  /** Is a frame due at `now` (ms)? Moves the schedule on when it is. */
  due(now) {
    return this.interval <= 0 ? !0 : this.next && now + this.tolerance < this.next ? !1 : (this.next = this.next && now - this.next < this.interval ? this.next + this.interval : now + this.interval, !0);
  }
  reset() {
    this.next = 0;
  }
};
function frameInterval(frameRate) {
  let fps = Number(frameRate);
  return !Number.isFinite(fps) || fps <= 0 ? 1e3 / 60 : 1e3 / Math.min(240, Math.max(1, fps));
}

// source/scene.ts
module.paths.push((0, import_path.join)(Editor.App.path, "node_modules"));
var ccModule = null;
function cc() {
  return ccModule || (ccModule = require("cc")), ccModule;
}
var legacy = () => globalThis.cc || {}, cce = () => globalThis.cce || {}, STALE_MS = 3e3, SCAN_EVERY_MS = 500, FULL_SCAN_EVERY_MS = 5e3, MAX_DT = 0.1, PULLING_MS = 1e3, S = {
  mode: "off",
  driver: "self",
  stepOnce: !1,
  stepping: !1,
  selfTicking: !1,
  hooked: !1,
  rt: null,
  mirrors: /* @__PURE__ */ new Map(),
  scene: null,
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
  renderKey: "",
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
  encoder: null,
  log: [],
  /** Ticks at game.frameRate. */
  pacer: new FramePacer(),
  /** Game cameras we stopped rendering to PIE's hidden temp window -> their component. */
  muted: /* @__PURE__ */ new Map(),
  /** Last values applied to each mirror (to skip unchanged, dirtying setters). */
  applied: /* @__PURE__ */ new WeakMap(),
  syncedAt: 0,
  fullScanAt: 0,
  /** Async capture: 'on' once it works, 'off' after a failure (old synchronous readPixels then). */
  asyncState: "unknown",
  asyncError: "",
  readback: null,
  jpeg: null,
  /** Frame queued for the async copy. */
  queuedSeq: -1,
  capture: { mode: "sync", ms: 0, encodeMs: 0, kb: 0 }
};
function note(msg) {
  S.log.push(`${(/* @__PURE__ */ new Date()).toISOString().slice(11, 23)} ${msg}`), S.log.length > 80 && S.log.shift();
}
function repaint() {
  var _a, _b;
  try {
    (_b = (_a = cce().Engine) == null ? void 0 : _a.repaintInEditMode) == null || _b.call(_a);
  } catch {
  }
}
function renderSeq() {
  let { director } = cc(), root = director.root, key = root ? `${root.cumulativeTime ?? 0}|${root.frameCount ?? 0}` : `${director.getTotalFrames()}`;
  return key !== S.renderKey && (S.renderKey = key, S.renderSeq++), S.renderSeq;
}
function onBeginFrame() {
  let { director } = cc();
  S.selfTicking || S.editorTicks++, S.mode === "run" || S.stepOnce ? (director.isPaused() && director.resume(), S.stepOnce = !1) : S.mode === "pause" && !director.isPaused() && director.pause();
}
function onAfterUpdate() {
  S.updates++;
}
function onBeforeDraw() {
  if (S.mode === "off" && Date.now() - S.lastRequest > STALE_MS) {
    detach();
    return;
  }
  syncMirrors();
}
function onAfterDraw() {
  if (Date.now() - S.lastRequest > PULLING_MS || !S.rt || !S.mirrors.size) return;
  let seq = renderSeq();
  S.mirrorSeq >= seq || seq === S.queuedSeq || seq === S.sentFrame || queueReadback(seq);
}
function onSceneLaunch() {
  destroyMirrors(), S.scene = null, note("scene launched");
}
function hook() {
  if (S.hooked) return;
  let { director, Director } = cc();
  director.on(Director.EVENT_BEGIN_FRAME, onBeginFrame), director.on(Director.EVENT_AFTER_UPDATE, onAfterUpdate), director.on(Director.EVENT_BEFORE_DRAW, onBeforeDraw), director.on(Director.EVENT_AFTER_DRAW, onAfterDraw), director.on(Director.EVENT_AFTER_SCENE_LAUNCH, onSceneLaunch), S.hooked = !0;
}
function unhook() {
  if (!S.hooked) return;
  let { director, Director } = cc();
  director.off(Director.EVENT_BEGIN_FRAME, onBeginFrame), director.off(Director.EVENT_AFTER_UPDATE, onAfterUpdate), director.off(Director.EVENT_BEFORE_DRAW, onBeforeDraw), director.off(Director.EVENT_AFTER_DRAW, onAfterDraw), director.off(Director.EVENT_AFTER_SCENE_LAUNCH, onSceneLaunch), S.hooked = !1;
}
function selfTick(dt) {
  let { director } = cc();
  S.selfTicking = !0;
  try {
    director.isPaused() && director.resume(), director.tick(dt), S.selfTicks++;
  } catch (e) {
    note(`tick: ${e.message}`);
  } finally {
    S.selfTicking = !1;
  }
}
function driverLoop(now) {
  var _a, _b;
  if (S.raf = requestAnimationFrame(driverLoop), S.mode !== "run") {
    S.lastRaf = now, S.pacer.reset();
    return;
  }
  if (S.pacer.interval = frameInterval(cc().game.frameRate), !S.pacer.due(now)) return;
  let dt = Math.min(MAX_DT, Math.max(0, (now - (S.lastRaf || now)) / 1e3));
  if (S.lastRaf = now, S.driver !== "step" && legacy().GAME_VIEW === !1 && (S.driver = "step", note("driver -> step (GAME_VIEW is false)")), S.driver === "step") {
    S.stepping || (S.stepping = !0, Promise.resolve((_b = (_a = cce().PreviewPlay) == null ? void 0 : _a.step) == null ? void 0 : _b.call(_a)).catch((e) => note(`step: ${e.message}`)).finally(() => {
      S.stepping = !1;
    }));
    return;
  }
  let total = cc().director.getTotalFrames();
  if (S.lastTotalFrames >= 0 && total !== S.lastTotalFrames) {
    S.driver = "editor", S.lastTotalFrames = total, repaint();
    return;
  }
  S.driver = "self", selfTick(dt), S.lastTotalFrames = cc().director.getTotalFrames();
}
function startDriver() {
  S.raf || (S.lastRaf = 0, S.lastTotalFrames = -1, S.pacer.reset(), S.raf = requestAnimationFrame(driverLoop));
}
function stopDriver() {
  S.raf && cancelAnimationFrame(S.raf), S.raf = 0;
}
function isEditorNode(node) {
  let { CCObject, Layers } = cc(), flags = CCObject.Flags.HideInHierarchy | CCObject.Flags.EditorOnly, layers = Layers.Enum.EDITOR | Layers.Enum.GIZMOS | Layers.Enum.SCENE_GIZMO;
  if (((node == null ? void 0 : node.layer) ?? 0) & layers) return !0;
  for (let n = node; n; n = n.parent)
    if ((n._objFlags ?? 0) & flags) return !0;
  return !1;
}
function isGameCamera(comp) {
  let src2 = comp.camera;
  return !comp.isValid || !comp.enabledInHierarchy || comp.targetTexture || !src2 || (src2.systemWindowId ?? 0) !== S.display ? !1 : !isEditorNode(comp.node);
}
function ensureRenderTexture() {
  let gw = Math.max(1, S.gameW), gh = Math.max(1, S.gameH), scale = Math.min(1, S.maxW / gw, S.maxH / gh, 2048 / gw, 2048 / gh), w = Math.max(2, Math.round(gw * scale)), h = Math.max(2, Math.round(gh * scale)), { RenderTexture } = cc();
  if (!S.rt)
    S.rt = new RenderTexture(), S.rt.reset({ width: w, height: h }), note(`render texture ${w}x${h}`);
  else if (S.rt.width !== w || S.rt.height !== h) {
    S.rt.resize(w, h);
    for (let cam of S.mirrors.values()) cam.setFixedSize(w, h);
  }
}
function createMirror(comp, scene) {
  var _a;
  let { director, renderer } = cc(), src2 = comp.camera, rt = S.rt;
  if (!src2 || !rt || !rt.window || !director.root) return;
  let cam = director.root.createCamera();
  cam.initialize({
    name: `[GamePanel] ${comp.node.name}`,
    node: comp.node,
    projection: src2.projectionType,
    window: rt.window,
    priority: src2.priority,
    cameraType: src2.cameraType,
    trackingType: src2.trackingType,
    // Render like the shipped game, not like an editor camera.
    usage: renderer.scene.CameraUsage.GAME
  }), cam.setFixedSize(rt.width, rt.height), (_a = src2.scene || scene.renderScene) == null || _a.addCamera(cam), S.mirrors.set(comp, cam), S.mirrorSeq = renderSeq(), note(`mirror + ${comp.node.name} (usage ${src2.cameraUsage}, priority ${src2.priority}, display ${src2.systemWindowId})`);
}
function wantMuted(comp, src2, temp, selected) {
  return S.mode !== "off" && !!temp && src2.window === temp && comp.enabledInHierarchy && !selected.has(comp.node.uuid);
}
function mute(comp, src2) {
  S.muted.has(src2) || !src2.enabled || (src2.enabled = !1, S.muted.set(src2, comp));
}
function unmute(src2) {
  let comp = S.muted.get(src2);
  if (comp) {
    S.muted.delete(src2);
    try {
      src2.window && fitToWindow(src2, src2.window), src2.enabled = comp.isValid ? comp.enabledInHierarchy : !0;
    } catch {
    }
  }
}
function fitToScreen(src2) {
  var _a;
  let main = (_a = cc().director.root) == null ? void 0 : _a.mainWindow;
  main && fitToWindow(src2, main), src2.update(!0);
}
function unmuteAll() {
  for (let src2 of [...S.muted.keys()]) unmute(src2);
}
function selectedUuids() {
  var _a, _b;
  try {
    return new Set(((_b = (_a = cce().Selection) == null ? void 0 : _a.query) == null ? void 0 : _b.call(_a)) || []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function destroyMirror(comp) {
  var _a;
  let cam = S.mirrors.get(comp);
  S.mirrors.delete(comp), comp.camera && unmute(comp.camera);
  for (let [src2, c] of S.muted) c === comp && unmute(src2);
  if (cam)
    try {
      (_a = cam.scene) == null || _a.removeCamera(cam), cam.destroy();
    } catch (e) {
      note(`destroy mirror: ${e.message}`);
    }
}
function destroyMirrors() {
  for (let comp of [...S.mirrors.keys()]) destroyMirror(comp);
}
function liveCameras(scene, full) {
  var _a;
  let { director, Camera } = cc();
  if (full) return scene.getComponentsInChildren(Camera).filter(isGameCamera);
  let mirrors = new Set(S.mirrors.values()), out = [], seen = /* @__PURE__ */ new Set();
  for (let rs of ((_a = director.root) == null ? void 0 : _a.scenes) || [])
    for (let cam of rs.cameras)
      if (!(mirrors.has(cam) || !cam.node))
        for (let comp of cam.node.getComponents(Camera))
          comp.camera !== cam || seen.has(comp) || (seen.add(comp), comp.node.scene === scene && isGameCamera(comp) && out.push(comp));
  return out;
}
function scanCameras(scene) {
  let now = Date.now(), full = now - S.fullScanAt > FULL_SCAN_EVERY_MS;
  full && (S.fullScanAt = now);
  let live = liveCameras(scene, full), set = new Set(live);
  for (let comp of [...S.mirrors.keys()])
    set.has(comp) || destroyMirror(comp);
  for (let comp of live)
    S.mirrors.has(comp) || createMirror(comp, scene);
}
function syncMirrors(force = !1) {
  var _a, _b, _c, _d, _e;
  try {
    let { director } = cc(), scene = director.getScene();
    if (!scene) return;
    ensureRenderTexture();
    let now = Date.now();
    scene !== S.scene && (destroyMirrors(), S.scene = scene, S.scanAt = 0), (force || now - S.scanAt > SCAN_EVERY_MS) && (scanCameras(scene), S.scanAt = now);
    let resort = !1, rt = S.rt, temp = (_a = director.root) == null ? void 0 : _a.tempWindow, selected = S.mode !== "off" ? selectedUuids() : /* @__PURE__ */ new Set();
    for (let [comp, cam] of S.mirrors) {
      let src2 = comp.camera;
      if (!src2 || !comp.isValid) continue;
      cam.window !== rt.window && (cam.changeTargetWindow(rt.window), resort = !0);
      let rs = src2.scene || ((_b = comp.node.scene) == null ? void 0 : _b.renderScene) || null;
      rs && cam.scene !== rs && ((_c = cam.scene) == null || _c.removeCamera(cam), rs.addCamera(cam), S.reattached++, note(`mirror ${comp.node.name}: re-attached to the game camera's render scene`)), (cam.width !== rt.width || cam.height !== rt.height) && cam.setFixedSize(rt.width, rt.height);
      let c = src2.clearColor, r = comp.rect, key = [
        src2.projectionType,
        src2.fovAxis,
        src2.fov,
        src2.orthoHeight,
        src2.nearClip,
        src2.farClip,
        c.x,
        c.y,
        c.z,
        c.w,
        src2.clearDepth,
        src2.clearStencil,
        src2.clearFlag,
        src2.visibility,
        src2.aperture,
        src2.shutter,
        src2.iso,
        r.x,
        r.y,
        r.width,
        r.height,
        rt.width,
        rt.height
      ].join(",");
      S.applied.get(cam) !== key && (S.applied.set(cam, key), cam.projectionType = src2.projectionType, cam.fovAxis = src2.fovAxis, cam.fov = src2.fov, cam.orthoHeight = src2.orthoHeight, cam.nearClip = src2.nearClip, cam.farClip = src2.farClip, cam.clearColor = src2.clearColor, cam.clearDepth = src2.clearDepth, cam.clearStencil = src2.clearStencil, cam.clearFlag = src2.clearFlag, cam.visibility = src2.visibility, cam.aperture = src2.aperture, cam.shutter = src2.shutter, cam.iso = src2.iso, cam.setViewportInOrientedSpace(comp.rect)), cam.enabled = comp.enabledInHierarchy, cam.priority !== src2.priority && (cam.priority = src2.priority, resort = !0), cam.update(!0), wantMuted(comp, src2, temp, selected) ? (mute(comp, src2), S.muted.has(src2) ? fitToScreen(src2) : src2.update(!0)) : unmute(src2);
    }
    resort && ((_e = (_d = S.rt) == null ? void 0 : _d.window) == null || _e.sortCameras()), S.syncedAt = Date.now();
  } catch (e) {
    note(`syncMirrors: ${e.message}`);
  }
}
function attach() {
  hook(), S.rt || repaint();
}
function detach() {
  destroyMirrors(), unmuteAll(), disposeCapture(), S.rt && (S.rt.destroy(), S.rt = null), S.scene = null, S.sentFrame = -1, S.mode === "off" && unhook();
}
function needsFlip() {
  var _a, _b;
  let { director, gfx } = cc(), api = (_b = (_a = director.root) == null ? void 0 : _a.device) == null ? void 0 : _b.gfxAPI;
  return api === gfx.API.WEBGL || api === gfx.API.WEBGL2 || api === gfx.API.GLES2 || api === gfx.API.GLES3;
}
function encoder(w, h) {
  if (!S.encoder) {
    let canvas2 = typeof OffscreenCanvas < "u" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
    S.encoder = { canvas: canvas2, ctx: canvas2.getContext("2d") };
  }
  let { canvas } = S.encoder;
  return canvas.width !== w && (canvas.width = w), canvas.height !== h && (canvas.height = h), S.encoder;
}
function trackPixels(px) {
  let hash = 0;
  for (let i = 0; i < px.length; i += 1021) hash = hash * 31 + px[i] | 0;
  S.framesEncoded++, hash !== S.pixelHash && (S.pixelHash = hash, S.pixelChanges++, S.pixelChangedAt = Date.now());
}
function packFrame(jpeg, width, height, binary) {
  return binary ? { width, height, bytes: new Uint8Array(jpeg) } : { width, height, data: toBase64(jpeg) };
}
var capAcc = { n: 0, ms: 0, encodeMs: 0, bytes: 0, at: 0 };
function recordCapture(mode, ms, encodeMs, bytes) {
  capAcc.n++, capAcc.ms += ms, capAcc.encodeMs += encodeMs, capAcc.bytes += bytes;
  let now = Date.now();
  now - capAcc.at < 500 && S.capture.mode === mode || (S.capture = {
    mode,
    ms: Math.round(capAcc.ms / capAcc.n * 10) / 10,
    encodeMs: Math.round(capAcc.encodeMs / capAcc.n * 10) / 10,
    kb: Math.round(capAcc.bytes / capAcc.n / 102.4) / 10
  }, capAcc.n = capAcc.ms = capAcc.encodeMs = capAcc.bytes = 0, capAcc.at = now);
}
async function encodeFrame(rt, quality, flip, binary) {
  let start = performance.now(), w = rt.width, h = rt.height, px = rt.readPixels(0, 0, w, h);
  if (!px) return null;
  trackPixels(px);
  let doFlip = flip === null ? needsFlip() : flip, rgba = toOpaqueImage(px, w, h, doFlip), enc = encoder(w, h);
  enc.ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  let canvas = enc.canvas, jpeg = await (canvas.convertToBlob ? await canvas.convertToBlob({ type: "image/jpeg", quality }) : await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality))).arrayBuffer(), ms = performance.now() - start;
  return recordCapture("sync", ms, ms, jpeg.byteLength), packFrame(jpeg, w, h, binary);
}
function gl2() {
  var _a;
  let { director, gfx } = cc(), device = (_a = director.root) == null ? void 0 : _a.device;
  if (!device || device.gfxAPI !== gfx.API.WEBGL2) return null;
  let gl = device.gl;
  return gl && typeof gl.fenceSync == "function" ? gl : null;
}
function asyncOff(reason) {
  var _a;
  S.asyncState !== "off" && (S.asyncState = "off", S.asyncError = reason, note(`async capture off: ${reason}`), (_a = S.readback) == null || _a.dispose(), S.readback = null, S.queuedSeq = -1);
}
function readback() {
  if (S.asyncState === "off") return null;
  if (S.readback) return S.readback;
  let gl = gl2();
  if (!gl)
    return asyncOff("the editor does not render with WebGL2"), null;
  try {
    return S.readback = new AsyncReadback(gl), S.jpeg = S.jpeg || new JpegEncoder(), S.asyncState = "on", note(`async capture on (encoder: ${S.jpeg.mode})`), S.readback;
  } catch (e) {
    return asyncOff(e.message), null;
  }
}
function queueReadback(seq) {
  var _a;
  let rb = readback(), rt = S.rt;
  if (!rb || !rt || rb.busy) return !1;
  let tex = rt.getGFXTexture(), glTexture = ((_a = tex == null ? void 0 : tex.gpuTexture) == null ? void 0 : _a.glTexture) ?? null;
  if (!glTexture)
    return asyncOff("no GL texture behind the render texture"), !1;
  try {
    return rb.start(glTexture, rt.width, rt.height, seq), S.queuedSeq = seq, !0;
  } catch (e) {
    return asyncOff(e.message), !1;
  }
}
async function encodeReadback(done, req) {
  let start = performance.now();
  trackPixels(done.pixels);
  let flip = req.flip === null || req.flip === void 0 ? needsFlip() : req.flip, mode = S.jpeg.mode === "worker" ? "async+worker" : "async", jpeg = await S.jpeg.encode(done.pixels, done.width, done.height, flip, req.quality ?? 0.85), ms = performance.now() - start;
  return recordCapture(mode, ms, ms, jpeg.byteLength), packFrame(jpeg, done.width, done.height, !!req.binary);
}
var WAIT_FRAME_MS = 40, tick = () => new Promise((r) => setTimeout(r, 1));
async function waitForCopy(rb, maxMs) {
  let end = performance.now() + maxMs, alloc = (bytes) => S.jpeg.buffer(bytes);
  for (; ; ) {
    let done = rb.poll(alloc);
    if (done) return done;
    if (!rb.busy) {
      let seq = renderSeq();
      S.mirrors.size && S.mirrorSeq < seq && seq !== S.sentFrame && seq !== S.queuedSeq && queueReadback(seq);
    }
    if (performance.now() >= end || S.asyncState === "off") return null;
    await tick();
  }
}
function disposeCapture() {
  var _a;
  (_a = S.readback) == null || _a.dispose(), S.readback = null, S.queuedSeq = -1, S.asyncState === "on" && (S.asyncState = "unknown");
}
function stats() {
  var _a, _b, _c, _d, _e;
  let { director, view } = cc(), device = (_a = director.root) == null ? void 0 : _a.device, design = view.getDesignResolutionSize(), now = performance.now(), frames = director.getTotalFrames();
  return S.fpsAt ? now - S.fpsAt >= 500 && (S.fps = Math.round((frames - S.lastFrameCount) * 1e3 / (now - S.fpsAt)), S.fpsAt = now, S.lastFrameCount = frames) : (S.fpsAt = now, S.lastFrameCount = frames), {
    mode: S.mode,
    driver: S.driver,
    fps: S.fps,
    drawCalls: (device == null ? void 0 : device.numDrawCalls) ?? 0,
    tris: (device == null ? void 0 : device.numTris) ?? 0,
    gameWidth: S.gameW,
    gameHeight: S.gameH,
    designWidth: design.width,
    designHeight: design.height,
    // The game's real screen (the canvas its cameras render to).
    screenWidth: Math.round(((_c = (_b = director.root) == null ? void 0 : _b.mainWindow) == null ? void 0 : _c.width) ?? 0),
    screenHeight: Math.round(((_e = (_d = director.root) == null ? void 0 : _d.mainWindow) == null ? void 0 : _e.height) ?? 0),
    cameras: S.mirrors.size,
    paused: director.isPaused(),
    capture: { ...S.capture, mode: S.asyncState === "off" ? "sync" : S.capture.mode },
    mutedCameras: S.muted.size
  };
}
function inputViewport() {
  let best = null;
  for (let comp of S.mirrors.keys()) {
    let src2 = comp.camera;
    src2 && (!best || src2.priority >= best.priority) && (best = src2);
  }
  let vp = best == null ? void 0 : best.viewport;
  return vp && vp.width > 0 && vp.height > 0 ? vp : { x: 0, y: 0, width: 1, height: 1 };
}
function withGameCamerasOnScreen(fn) {
  var _a, _b, _c;
  let { director } = cc(), main = (_a = director.root) == null ? void 0 : _a.mainWindow, game = /* @__PURE__ */ new Set();
  for (let comp of S.mirrors.keys()) comp.camera && game.add(comp.camera);
  let moved = [], muted = [];
  try {
    if (main) {
      for (let cam of game)
        cam.window !== main && (moved.push([cam, cam.window]), cam.changeTargetWindow(main), cam.update(!0));
      let mirrors = new Set(S.mirrors.values());
      for (let cam of ((_c = (_b = director.getScene()) == null ? void 0 : _b.renderScene) == null ? void 0 : _c.cameras) || [])
        game.has(cam) || mirrors.has(cam) || (muted.push([cam, cam.visibility]), cam.visibility = 0);
    }
    fn();
  } finally {
    for (let [cam, visibility] of muted) cam.visibility = visibility;
    for (let [cam, win] of moved)
      cam.changeTargetWindow(win), S.muted.has(cam) ? fitToScreen(cam) : cam.update(!0);
    S.inputs++, moved.length && S.inputSwaps++;
  }
}
function injectInput(m) {
  let { input, screen } = cc(), target = input, noop = () => {
  };
  if (m.type === "keydown" || m.type === "keyup") {
    let ev2 = {
      type: m.type,
      key: m.key,
      code: m.code,
      keyCode: m.keyCode,
      which: m.keyCode,
      repeat: !!m.repeat,
      altKey: !!m.altKey,
      ctrlKey: !!m.ctrlKey,
      shiftKey: !!m.shiftKey,
      metaKey: !!m.metaKey,
      target: null,
      stopPropagation: noop,
      preventDefault: noop
    };
    m.type === "keydown" ? target._dispatchKeyboardDownEvent(ev2) : target._dispatchKeyboardUpEvent(ev2);
    return;
  }
  let vp = inputViewport(), u = Math.min(1, Math.max(0, m.u ?? 0)), v = Math.min(1, Math.max(0, m.v ?? 0)), canvas = document.getElementById("GameCanvas"), r = canvas ? canvas.getBoundingClientRect() : null;
  if (!r || !r.width || !r.height) {
    let dpr = screen.devicePixelRatio || 1;
    r = { x: 0, y: 0, width: screen.windowSize.width / dpr, height: screen.windowSize.height / dpr };
  }
  let lx = (vp.x + u * vp.width) * r.width, ly = (vp.y + (1 - v) * vp.height) * r.height, ev = {
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
    preventDefault: noop
  };
  withGameCamerasOnScreen(() => {
    m.type === "down" ? target._dispatchMouseDownEvent(ev) : m.type === "move" ? target._dispatchMouseMoveEvent(ev) : m.type === "up" ? target._dispatchMouseUpEvent(ev) : m.type === "wheel" && target._dispatchMouseScrollEvent(ev);
  });
}
function src(fn, max = 2500) {
  try {
    return typeof fn == "function" ? String(fn).slice(0, max) : String(fn);
  } catch (e) {
    return `[${e.message}]`;
  }
}
function size(s) {
  return s ? [s.width, s.height] : null;
}
var methods = {
  /**
   * Latest rendered frame (JPEG) if the engine rendered since `after`.
   * Also keeps the capture alive and carries the panel's resolution/display.
   *
   * Async capture answers with the frame whose GPU copy has finished (at most
   * one frame behind) and starts the next copy; until a copy finishes it
   * answers without a frame, and the panel asks again.
   */
  async gpFrame(req) {
    S.lastRequest = Date.now(), S.gameW = Math.max(1, Math.round(req.gameWidth || 1280)), S.gameH = Math.max(1, Math.round(req.gameHeight || 720)), S.maxW = Math.max(16, Math.min(2048, Math.round(req.maxWidth || 960))), S.maxH = Math.max(16, Math.min(2048, Math.round(req.maxHeight || 540))), (req.display ?? 0) !== S.display && (S.display = req.display ?? 0, destroyMirrors()), attach(), (!S.mirrors.size || Date.now() - S.syncedAt > 250) && syncMirrors(!S.mirrors.size);
    let seq = renderSeq(), info = stats(), rt = S.rt, rendered = S.mirrorSeq < seq, fresh = seq !== S.sentFrame || req.after !== S.sentFrame, nudge = () => {
      let wait = !rendered || S.sentFrame < 0 ? 150 : 1e3;
      S.mode !== "run" && Date.now() - S.lastRepaint > wait && (S.lastRepaint = Date.now(), repaint());
    };
    if (!rt || !S.mirrors.size || !rendered)
      return nudge(), { id: seq, frame: null, stats: info };
    let rb = readback();
    if (rb) {
      req.after !== S.sentFrame && !rb.busy && queueReadback(seq);
      let done = await waitForCopy(rb, fresh || S.mode === "run" ? WAIT_FRAME_MS : 0);
      if (done) {
        let latest = renderSeq();
        latest !== done.tag && S.mirrorSeq < latest && queueReadback(latest);
        try {
          let frame = await encodeReadback(done, req);
          return S.sentFrame = done.tag, { id: done.tag, frame, stats: stats() };
        } catch (e) {
          return note(`encode: ${e.message}`), { id: seq, frame: null, stats: info };
        }
      }
      if (fresh && !rb.busy && (seq !== S.queuedSeq || req.after !== S.sentFrame) && queueReadback(seq), S.asyncState !== "off")
        return fresh || nudge(), { id: seq, frame: null, stats: info };
    }
    if (!fresh)
      return nudge(), { id: seq, frame: null, stats: info };
    S.sentFrame = seq;
    let encoded = await encodeFrame(rt, req.quality ?? 0.85, req.flip ?? null, !!req.binary);
    return { id: seq, frame: encoded, stats: info };
  },
  /** Who is this scene process? Used to find the Play-in-Editor webview. */
  gpWho() {
    var _a, _b, _c;
    let pp = cce().PreviewPlay, { director, screen } = cc();
    return {
      instance: INSTANCE,
      url: location.href,
      previewState: (pp == null ? void 0 : pp._state) ?? null,
      previewPaused: !!((_a = pp == null ? void 0 : pp.isPause) != null && _a.call(pp)),
      engineManagerPaused: ((_b = cce().Engine) == null ? void 0 : _b._paused) ?? null,
      sceneName: ((_c = director.getScene()) == null ? void 0 : _c.name) ?? null,
      windowSize: size(screen.windowSize)
    };
  },
  /** Called by the panel right after PIE was started and paused. */
  gpPlay() {
    let pp = cce().PreviewPlay;
    return pp != null && pp.isPause && !pp.isPause() ? (note("play refused: Play-in-Editor is not paused in this process"), { error: "This scene process is not running Play-in-Editor" }) : (S.mode = "run", S.driver = "self", hook(), startDriver(), note("play"), stats());
  },
  gpPause(paused) {
    return S.mode = paused ? "pause" : "run", paused && cc().director.pause(), repaint(), note(paused ? "pause" : "resume"), stats();
  },
  async gpStep() {
    var _a, _b;
    return S.mode = "pause", S.driver === "step" ? await ((_b = (_a = cce().PreviewPlay) == null ? void 0 : _a.step) == null ? void 0 : _b.call(_a)) : (selfTick(1 / 60), cc().director.pause()), stats();
  },
  gpStop() {
    var _a;
    return S.mode = "off", S.stepOnce = !1, stopDriver(), destroyMirrors(), unmuteAll(), S.scene = null, S.sentFrame = -1, S.queuedSeq = -1, (_a = S.readback) == null || _a.drop(), note("stop"), !0;
  },
  gpDetach() {
    return S.mode === "off" && detach(), !0;
  },
  gpInput(message) {
    if (S.mode === "off") return !1;
    try {
      return injectInput(message), !0;
    } catch (e) {
      return note(`input: ${e.message}`), !1;
    }
  },
  /** Read-only snapshot of the editor/engine state, for troubleshooting. */
  gpDiagnose() {
    var _a, _b, _c, _d, _e, _f;
    let { director, screen, view, Camera } = cc(), root = director.root, canvas = document.getElementById("GameCanvas"), rect = canvas ? canvas.getBoundingClientRect() : null, pp = cce().PreviewPlay, em = cce().Engine, sfm = cce().SceneFacadeManager, scene = director.getScene(), dpr = screen.devicePixelRatio || 1, proto = (o) => {
      let names = /* @__PURE__ */ new Set();
      for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        Object.getOwnPropertyNames(p).forEach((n) => names.add(n));
      return [...names].filter((n) => n !== "constructor").sort();
    }, winName = (w) => {
      var _a2;
      return w === (root == null ? void 0 : root.mainWindow) ? "main" : w === (root == null ? void 0 : root.tempWindow) ? "temp" : w === ((_a2 = S.rt) == null ? void 0 : _a2.window) ? "game-panel" : w ? "other" : "none";
    }, comps = scene ? scene.getComponentsInChildren(Camera) : [], renderScenes = [], rsId = (rs) => {
      if (!rs) return -1;
      let i = renderScenes.indexOf(rs);
      return i < 0 && (i = renderScenes.push(rs) - 1), i;
    };
    rsId(scene == null ? void 0 : scene.renderScene);
    let meshes = scene ? scene.getComponentsInChildren(cc().MeshRenderer) : [];
    return {
      time: (/* @__PURE__ */ new Date()).toISOString(),
      state: {
        ...stats(),
        renderSeq: S.renderSeq,
        totalFrames: director.getTotalFrames(),
        selfTicks: S.selfTicks,
        editorTicks: S.editorTicks,
        updates: S.updates,
        hooked: S.hooked,
        display: S.display,
        sentFrame: S.sentFrame,
        mirrorSeq: S.mirrorSeq,
        frameRate: cc().game.frameRate,
        asyncCapture: S.asyncState,
        asyncError: S.asyncError,
        encoder: ((_a = S.jpeg) == null ? void 0 : _a.mode) ?? null,
        queuedSeq: S.queuedSeq,
        mutedCameras: [...S.muted.values()].map((c) => {
          var _a2;
          return (_a2 = c.node) == null ? void 0 : _a2.name;
        })
      },
      gameView: legacy().GAME_VIEW ?? "undefined",
      directorPaused: director.isPaused(),
      gamePaused: cc().game.isPaused(),
      previewPlayPaused: (_b = pp == null ? void 0 : pp.isPause) == null ? void 0 : _b.call(pp),
      engineManager: em ? { paused: em._paused, tickInEM: em._tickInEM, sceneTick: em._sceneTick, stateRecord: em._stateRecord } : null,
      sceneName: scene == null ? void 0 : scene.name,
      screenWindowSize: size(screen.windowSize),
      devicePixelRatio: dpr,
      frameSizeCss: [screen.windowSize.width / dpr, screen.windowSize.height / dpr],
      viewVisibleSize: size(view.getVisibleSize()),
      viewVisibleSizeInPixel: size(view.getVisibleSizeInPixel()),
      designResolution: size(view.getDesignResolutionSize()),
      resolutionPolicy: (_d = (_c = view.getResolutionPolicy()) == null ? void 0 : _c.constructor) == null ? void 0 : _d.name,
      mainWindow: root != null && root.mainWindow ? [root.mainWindow.width, root.mainWindow.height] : null,
      tempWindow: root != null && root.tempWindow ? [root.tempWindow.width, root.tempWindow.height] : null,
      gameCanvas: canvas ? {
        rect: rect && [rect.x, rect.y, rect.width, rect.height],
        size: [canvas.width, canvas.height],
        style: canvas.getAttribute("style"),
        parent: canvas.parentElement ? `${canvas.parentElement.tagName}#${canvas.parentElement.id}.${canvas.parentElement.className}` : null,
        parentStyle: ((_e = canvas.parentElement) == null ? void 0 : _e.getAttribute("style")) ?? null
      } : null,
      gfxAPI: (_f = root == null ? void 0 : root.device) == null ? void 0 : _f.gfxAPI,
      renderTexture: S.rt ? [S.rt.width, S.rt.height] : null,
      capture: {
        framesEncoded: S.framesEncoded,
        pixelChanges: S.pixelChanges,
        msSincePixelChange: S.pixelChangedAt ? Date.now() - S.pixelChangedAt : null,
        reattached: S.reattached,
        inputs: S.inputs,
        inputCameraSwaps: S.inputSwaps
      },
      meshRenderers: meshes.slice(0, 30).map((m) => {
        var _a2, _b2, _c2, _d2;
        return {
          node: (_a2 = m.node) == null ? void 0 : _a2.name,
          active: (_b2 = m.node) == null ? void 0 : _b2.activeInHierarchy,
          enabled: m.enabledInHierarchy,
          model: !!m.model,
          modelEnabled: (_c2 = m.model) == null ? void 0 : _c2.enabled,
          modelScene: rsId((_d2 = m.model) == null ? void 0 : _d2.scene)
        };
      }),
      renderCameras: ((root == null ? void 0 : root.cameraList) || []).map((c) => ({
        name: c.name,
        scene: rsId(c.scene),
        usage: c.cameraUsage,
        priority: c.priority,
        enabled: c.enabled,
        display: c.systemWindowId,
        window: winName(c.window),
        size: [c.width, c.height],
        viewport: c.viewport && [c.viewport.x, c.viewport.y, c.viewport.width, c.viewport.height],
        visibility: c.visibility,
        clearFlag: c.clearFlag
      })),
      cameraComponents: comps.map((c) => {
        var _a2, _b2, _c2, _d2, _e2;
        return {
          node: (_a2 = c.node) == null ? void 0 : _a2.name,
          enabled: c.enabledInHierarchy,
          editorNode: isEditorNode(c.node),
          flags: (_b2 = c.node) == null ? void 0 : _b2._objFlags,
          usage: (_c2 = c.camera) == null ? void 0 : _c2.cameraUsage,
          mirrored: S.mirrors.has(c),
          scene: rsId((_d2 = c.camera) == null ? void 0 : _d2.scene),
          mirrorScene: rsId((_e2 = S.mirrors.get(c)) == null ? void 0 : _e2.scene),
          rect: c.rect && [c.rect.x, c.rect.y, c.rect.width, c.rect.height]
        };
      }),
      // Index 0 is the director scene's RenderScene.
      renderScenes: renderScenes.map((rs, i) => {
        var _a2;
        return {
          id: i,
          models: (_a2 = rs.models) == null ? void 0 : _a2.length,
          sample: (rs.models || []).slice(0, 25).map((m) => {
            var _a3;
            return `${(_a3 = m.node) == null ? void 0 : _a3.name}${m.enabled ? "" : "(off)"}`;
          })
        };
      }),
      log: S.log.slice(),
      sceneFacadeManagerMethods: sfm ? proto(sfm) : null,
      previewPlayMethods: pp ? proto(pp) : null,
      sources: {
        "SceneFacadeManager.changeTargetResolution": src(sfm == null ? void 0 : sfm.changeTargetResolution, 4e3),
        "PreviewPlay.getGameScene": src(pp == null ? void 0 : pp.getGameScene),
        "PreviewPlay.hideEditorCamera": src(pp == null ? void 0 : pp.hideEditorCamera),
        "PreviewPlay.start": src(pp == null ? void 0 : pp.start),
        "PreviewPlay.pause": src(pp == null ? void 0 : pp.pause),
        "PreviewPlay.step": src(pp == null ? void 0 : pp.step),
        "PreviewPlay.setResolution": src(pp == null ? void 0 : pp.setResolution),
        "PreviewPlay.rotateScene": src(pp == null ? void 0 : pp.rotateScene),
        "PreviewPlay.showEditorCamera": src(pp == null ? void 0 : pp.showEditorCamera),
        "PreviewPlay.onDirectorEndFrame": src(pp == null ? void 0 : pp.onDirectorEndFrame),
        "Engine._tick": src(em == null ? void 0 : em._tick),
        "Engine.tickInEditMode": src(em == null ? void 0 : em.tickInEditMode),
        "Engine._isTickAllowed": src(em == null ? void 0 : em._isTickAllowed),
        "Engine._updateTickState": src(em == null ? void 0 : em._updateTickState)
      }
    };
  }
}, CALL = "game-panel:call", REPLY = "game-panel:reply", IPC_KEY = "__gamePanelIpc";
async function onIpcCall(_event, id, method, args) {
  let { ipcRenderer } = require("electron"), ok = !0, result;
  try {
    let fn = Object.prototype.hasOwnProperty.call(methods, method) ? methods[method] : null;
    if (!fn) throw new Error(`Unknown method ${method}`);
    result = await fn(...Array.isArray(args) ? args : []);
  } catch (e) {
    ok = !1, result = (e == null ? void 0 : e.message) || String(e);
  }
  ipcRenderer.sendToHost(REPLY, id, ok, result);
}
function listenIpc() {
  try {
    let { ipcRenderer } = require("electron"), g = globalThis;
    g[IPC_KEY] && ipcRenderer.removeListener(CALL, g[IPC_KEY]), g[IPC_KEY] = onIpcCall, ipcRenderer.on(CALL, onIpcCall);
  } catch (e) {
    note(`ipc unavailable: ${e.message}`);
  }
}
function unlistenIpc() {
  try {
    let g = globalThis;
    g[IPC_KEY] && require("electron").ipcRenderer.removeListener(CALL, g[IPC_KEY]), g[IPC_KEY] = null;
  } catch {
  }
}
var INSTANCE = Math.random().toString(36).slice(2, 10);
listenIpc();
function load() {
}
function unload() {
  var _a;
  try {
    unlistenIpc(), methods.gpStop(), detach(), unhook(), (_a = S.jpeg) == null || _a.dispose(), S.jpeg = null;
  } catch {
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
