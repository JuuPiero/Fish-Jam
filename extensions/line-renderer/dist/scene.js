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

// source/scene/index.ts
var scene_exports = {};
__export(scene_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(scene_exports);

// source/scene/env.ts
var import_path = require("path");
module.paths.push((0, import_path.join)(Editor.App.path, "node_modules"));
var ccModule = null;
function cc() {
  return ccModule || (ccModule = require("cc")), ccModule;
}
var cce = () => globalThis.cce || {}, editorExtends = () => globalThis.EditorExtends;
function classByName(name) {
  try {
    return cc().js.getClassByName(name) || null;
  } catch {
    return null;
  }
}
var lineClass = () => classByName("LineRenderer");
function runtimeReady() {
  return !!lineClass();
}
function currentScene() {
  try {
    return cc().director.getScene();
  } catch {
    return null;
  }
}
function findNode(uuid) {
  var _a2, _b2;
  if (!uuid) return null;
  let ext = editorExtends();
  try {
    let n = (_b2 = (_a2 = ext == null ? void 0 : ext.Node) == null ? void 0 : _a2.getNode) == null ? void 0 : _b2.call(_a2, uuid);
    if (n) return n;
  } catch {
  }
  let scene = currentScene();
  if (!scene) return null;
  let found = null, walk = (n) => {
    if (!found) {
      if (n.uuid === uuid) {
        found = n;
        return;
      }
      for (let c2 of n.children) walk(c2);
    }
  };
  return walk(scene), found;
}
function findComponent(uuid) {
  var _a2, _b2;
  let ext = editorExtends();
  try {
    let c2 = (_b2 = (_a2 = ext == null ? void 0 : ext.Component) == null ? void 0 : _a2.getComponent) == null ? void 0 : _b2.call(_a2, uuid);
    if (c2) return c2;
  } catch {
  }
  for (let comp of allLines()) if (comp.uuid === uuid) return comp;
  let scene = currentScene();
  if (!scene) return null;
  let found = null, walk = (n) => {
    if (!found) {
      for (let c2 of n.components)
        if (c2.uuid === uuid) {
          found = c2;
          return;
        }
      for (let c2 of n.children) walk(c2);
    }
  };
  return walk(scene), found;
}
function allLines() {
  let C = lineClass();
  if (!C || !C.all) return [];
  let scene = currentScene(), res = [];
  for (let c2 of C.all)
    c2 && c2.isValid && c2.node && c2.node.isValid && c2.node.scene === scene && res.push(c2);
  return res;
}
function repaint() {
  var _a2, _b2;
  try {
    (_b2 = (_a2 = cce().Engine) == null ? void 0 : _a2.repaintInEditMode) == null || _b2.call(_a2);
  } catch {
  }
}
function notifyNodeChanged(node) {
  var _a2, _b2, _c;
  if (!(!node || !node.isValid))
    try {
      (_c = (_b2 = (_a2 = editorExtends()) == null ? void 0 : _a2.Node) == null ? void 0 : _b2.emit) == null || _c.call(_b2, "change", node.uuid, node);
    } catch {
    }
}
function selectedNodeUuids() {
  var _a2, _b2;
  try {
    let ids = (_b2 = (_a2 = cce().Selection) == null ? void 0 : _a2.query) == null ? void 0 : _b2.call(_a2);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}
function is2DView() {
  var _a2;
  try {
    let c2 = cce().Camera;
    return typeof (c2 == null ? void 0 : c2.is2D) == "boolean" ? c2.is2D : !!((_a2 = cce().Gizmo) != null && _a2.is2D);
  } catch {
    return !1;
  }
}
function transformToolName() {
  var _a2;
  try {
    return ((_a2 = cce().Gizmo) == null ? void 0 : _a2.transformToolName) || "position";
  } catch {
    return "position";
  }
}
function pivotMode() {
  var _a2;
  try {
    return ((_a2 = cce().Gizmo) == null ? void 0 : _a2.pivot) === "pivot" ? "pivot" : "center";
  } catch {
    return "center";
  }
}
function coordinateMode() {
  var _a2;
  try {
    return ((_a2 = cce().Gizmo) == null ? void 0 : _a2.coordinate) === "local" ? "local" : "global";
  } catch {
    return "global";
  }
}
function snapConfig() {
  var _a2, _b2;
  let fallback = {
    position: { x: 1, y: 1, z: 1 },
    rotation: 15,
    scale: 0.1,
    isPositionSnapEnabled: !1,
    isRotationSnapEnabled: !1,
    isScaleSnapEnabled: !1
  };
  try {
    let c2 = (_b2 = (_a2 = cce().Gizmo) == null ? void 0 : _a2.queryTransformSnapConfigs) == null ? void 0 : _b2.call(_a2);
    return c2 ? { ...fallback, ...c2 } : fallback;
  } catch {
    return fallback;
  }
}

// source/scene/state.ts
var DEFAULT_SETTINGS = {
  inputMode: "plane",
  minVertexDistance: 0.1,
  viewDistance: 5,
  surfaceOffset: 0.02,
  simplifyPreview: !1,
  tolerance: 0.1
}, S = {
  primary: !1,
  hooked: !1,
  mode: "none",
  /** The LineRenderer being edited. */
  target: null,
  /** Selected point indices, last = active. */
  selection: [],
  hover: null,
  /** Create Points preview position (world). */
  preview: null,
  settings: { ...DEFAULT_SETTINGS },
  deleteKeyAt: 0,
  selectAllKeyAt: 0,
  replaying: !1,
  stateVersion: 0,
  diag: {
    draws: 0,
    mouseDowns: 0,
    picks: 0,
    errors: []
  }
};
function note(msg) {
  S.diag.errors.push(`${(/* @__PURE__ */ new Date()).toISOString()} ${msg}`), S.diag.errors.length > 30 && S.diag.errors.shift();
}
function bumpState() {
  S.stateVersion++;
}
function isSelected(i) {
  return S.selection.includes(i);
}
function setSelection(list) {
  S.selection = [...new Set(list)], bumpState();
}
function toggleSelection(i) {
  let k = S.selection.indexOf(i);
  k >= 0 ? S.selection.splice(k, 1) : S.selection.push(i), bumpState();
}

// assets/core/math.ts
function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}
function q4(x = 0, y = 0, z = 0, w = 1) {
  return { x, y, z, w };
}
function set(out, x, y, z) {
  return out.x = x, out.y = y, out.z = z, out;
}
function copy(out, a) {
  return out.x = a.x, out.y = a.y, out.z = a.z, out;
}
function add(out, a, b) {
  return out.x = a.x + b.x, out.y = a.y + b.y, out.z = a.z + b.z, out;
}
function sub(out, a, b) {
  return out.x = a.x - b.x, out.y = a.y - b.y, out.z = a.z - b.z, out;
}
function scale(out, a, s) {
  return out.x = a.x * s, out.y = a.y * s, out.z = a.z * s, out;
}
function scaleAndAdd(out, a, b, s) {
  return out.x = a.x + b.x * s, out.y = a.y + b.y * s, out.z = a.z + b.z * s, out;
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(out, a, b) {
  let x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  return out.x = x, out.y = y, out.z = z, out;
}
function lenSq(a) {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}
function len(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function distSq(a, b) {
  let x = a.x - b.x, y = a.y - b.y, z = a.z - b.z;
  return x * x + y * y + z * z;
}
function dist(a, b) {
  return Math.sqrt(distSq(a, b));
}
function normalize(out, a) {
  let l = len(a);
  return l < 1e-6 ? set(out, 0, 0, 0) : scale(out, a, 1 / l);
}
function lerp(out, a, b, t) {
  return out.x = a.x + (b.x - a.x) * t, out.y = a.y + (b.y - a.y) * t, out.z = a.z + (b.z - a.z) * t, out;
}
function qSet(out, x, y, z, w) {
  return out.x = x, out.y = y, out.z = z, out.w = w, out;
}
function qRotate(out, q, v) {
  let tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x), x = v.x + q.w * tx + (q.y * tz - q.z * ty), y = v.y + q.w * ty + (q.z * tx - q.x * tz), z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  return set(out, x, y, z);
}
function qFromAxisAngle(out, axis, rad) {
  let n = normalize(v3(), axis), s = Math.sin(rad / 2);
  return qSet(out, n.x * s, n.y * s, n.z * s, Math.cos(rad / 2));
}
function m4TransformPoint(out, m, p) {
  let { x, y, z } = p, w = m.m03 * x + m.m07 * y + m.m11 * z + m.m15;
  return w = w ? 1 / w : 1, set(
    out,
    (m.m00 * x + m.m04 * y + m.m08 * z + m.m12) * w,
    (m.m01 * x + m.m05 * y + m.m09 * z + m.m13) * w,
    (m.m02 * x + m.m06 * y + m.m10 * z + m.m14) * w
  );
}

// assets/core/line-geometry.ts
function simplifyIndices(points, tolerance, loop = !1) {
  let n = points.length;
  if (n <= 2 || tolerance <= 0) return points.map((_, i) => i);
  let keep = new Uint8Array(n), rdp = (a, b) => {
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      let d = distToSegment(points[i], points[a], points[b]);
      d > worst && (worst = d, at = i);
    }
    worst > tolerance && at > 0 && (keep[at] = 1, rdp(a, at), rdp(at, b));
  };
  if (loop) {
    let far = 1;
    for (let i = 2; i < n; i++) dist(points[i], points[0]) > dist(points[far], points[0]) && (far = i);
    keep[0] = 1, keep[far] = 1, rdp(0, far);
    let ext = [...points, points[0]], keep2 = new Uint8Array(n + 1), rdp2 = (a, b) => {
      let worst = -1, at = -1;
      for (let i = a + 1; i < b; i++) {
        let d = distToSegment(ext[i], ext[a], ext[b]);
        d > worst && (worst = d, at = i);
      }
      worst > tolerance && at > 0 && (keep2[at] = 1, rdp2(a, at), rdp2(at, b));
    };
    rdp2(far, n);
    for (let i = far + 1; i < n; i++) keep2[i] && (keep[i] = 1);
  } else
    keep[0] = 1, keep[n - 1] = 1, rdp(0, n - 1);
  let res = [];
  for (let i = 0; i < n; i++) keep[i] && res.push(i);
  return res;
}
function distToSegment(p, a, b) {
  let ab = sub(v3(), b, a), l2 = lenSq(ab);
  if (l2 < 1e-12) return dist(p, a);
  let t = dot(sub(v3(), p, a), ab) / l2;
  return t = t < 0 ? 0 : t > 1 ? 1 : t, dist(p, scaleAndAdd(v3(), a, ab, t));
}

// source/scene/view.ts
var lastCamera = null;
function sceneCamera() {
  try {
    let { director, renderer } = cc(), root = director.root;
    if (!root) return null;
    if (lastCamera && lastCamera.enabled && lastCamera.window === root.mainWindow && root.cameraList.includes(lastCamera)) return lastCamera;
    for (let cam2 of root.cameraList)
      if (cam2.cameraUsage === renderer.scene.CameraUsage.SCENE_VIEW && cam2.enabled && cam2.window === root.mainWindow)
        return lastCamera = cam2, cam2;
  } catch {
  }
  return null;
}
var _tmp = v3();
function cameraPosition(cam2, out = v3()) {
  let p = cam2.node.worldPosition;
  return set(out, p.x, p.y, p.z);
}
function cameraForward(cam2, out = v3()) {
  let f = cam2.forward ?? cam2.node.forward;
  return normalize(out, set(out, f.x, f.y, f.z));
}
function cameraRight(cam2, out = v3()) {
  let r = cam2.node.right;
  return normalize(out, set(out, r.x, r.y, r.z));
}
function cameraUp(cam2, out = v3()) {
  let u = cam2.node.up;
  return normalize(out, set(out, u.x, u.y, u.z));
}
function isOrtho(cam2) {
  try {
    return cam2.projectionType === cc().renderer.scene.CameraProjection.ORTHO;
  } catch {
    return !1;
  }
}
var _ws = v3(), _fw = v3();
function toScreen(cam2, p, out = { x: 0, y: 0, visible: !0 }) {
  return cam2.worldToScreen(_ws, p), out.x = _ws.x, out.y = _ws.y, isOrtho(cam2) ? out.visible = !0 : (cameraPosition(cam2, _tmp), cameraForward(cam2, _fw), out.visible = dot(sub(_tmp, p, _tmp), _fw) > (cam2.nearClip ?? 0.01)), out;
}
function screenRay(cam2, x, y) {
  let { geometry } = cc(), r = new geometry.Ray();
  return cam2.screenPointToRay(r, x, y), { o: v3(r.o.x, r.o.y, r.o.z), d: normalize(v3(), v3(r.d.x, r.d.y, r.d.z)) };
}
function worldPerPixel(cam2, p) {
  let right = cameraRight(cam2), a = toScreen(cam2, p), b = toScreen(cam2, scaleAndAdd(v3(), p, right, 1)), d = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(d > 1e-6) || !a.visible) {
    let dist2 = len(sub(v3(), p, cameraPosition(cam2)));
    return Math.max(dist2, 1) * 2e-3;
  }
  return 1 / d;
}
function rayPlane(ray, point, normal, allowBehind = !1) {
  let denom = dot(ray.d, normal);
  if (Math.abs(denom) < 1e-6) return null;
  let t = dot(sub(v3(), point, ray.o), normal) / denom;
  return t < 0 && !allowBehind ? null : scaleAndAdd(v3(), ray.o, ray.d, t);
}
function closestOnLine(ray, origin, dir) {
  let d1 = normalize(v3(), dir), d2 = ray.d, r = sub(v3(), origin, ray.o), a = dot(d1, d1), b = dot(d1, d2), c2 = dot(d2, d2), d = dot(d1, r), e = dot(d2, r), denom = a * c2 - b * b;
  if (Math.abs(denom) < 1e-8) return null;
  let s = (b * e - c2 * d) / denom;
  return scaleAndAdd(v3(), origin, d1, s);
}
function distToSegment2(px, py, ax, ay, bx, by) {
  let dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, f = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  let x = ax + dx * f - px, y = ay + dy * f - py;
  return { dist: Math.sqrt(x * x + y * y), f };
}
function pointInPolygon(px, py, pts) {
  let inside = !1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    let a = pts[i], b = pts[j];
    a.y > py != b.y > py && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x && (inside = !inside);
  }
  return inside;
}
var coordMode = "unknown", coordSamples = 0;
function eventCoordMode() {
  return coordMode;
}
function canvasElement() {
  try {
    let c2 = cc().game.canvas;
    if (c2 && typeof c2.getBoundingClientRect == "function") return c2;
  } catch {
  }
  return typeof document < "u" ? document.querySelector("canvas") : null;
}
function eventToScreen(cam2, ev) {
  let canvas = canvasElement(), hasClient = typeof ev.clientX == "number" && typeof ev.clientY == "number", fromClient = null, css = null;
  if (canvas && hasClient) {
    let rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      let sx = cam2.width / rect.width, sy = cam2.height / rect.height, cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
      css = { x: cx, y: cy, sx, sy, h: rect.height }, fromClient = { x: cx * sx, y: (rect.height - cy) * sy };
    }
  }
  let hasXY = typeof ev.x == "number" && typeof ev.y == "number";
  if (coordMode === "unknown" || coordMode === "client" && coordSamples < 5)
    if (coordSamples++, hasXY && css) {
      let near = (a, b) => Math.abs(a - b) < 2.5;
      near(ev.x, css.x * css.sx) && near(ev.y, (css.h - css.y) * css.sy) ? coordMode = "event" : near(ev.x, css.x * css.sx) && near(ev.y, css.y * css.sy) ? coordMode = "event-flipped" : near(ev.x, css.x) && near(ev.y, css.h - css.y) ? coordMode = "event-css" : near(ev.x, css.x) && near(ev.y, css.y) ? coordMode = "event-css-flipped" : coordMode = "client";
    } else hasXY ? coordMode = "event" : css && (coordMode = "client");
  switch (coordMode) {
    case "event":
      return { x: ev.x, y: ev.y };
    case "event-flipped":
      return { x: ev.x, y: cam2.height - ev.y };
    case "event-css":
      return css ? { x: ev.x * css.sx, y: ev.y * css.sy } : { x: ev.x, y: ev.y };
    case "event-css-flipped":
      return css ? { x: ev.x * css.sx, y: (css.h - ev.y) * css.sy } : { x: ev.x, y: cam2.height - ev.y };
    default:
      return fromClient ?? { x: ev.x ?? 0, y: ev.y ?? 0 };
  }
}
var overlay = null;
function ensureOverlay() {
  if (overlay && overlay.root.isConnected) return overlay;
  if (typeof document > "u" || !document.body) return null;
  let root = document.createElement("div");
  root.id = "line-renderer-overlay", root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;font:11px/1.2 sans-serif;";
  let rect = document.createElement("div");
  rect.style.cssText = "position:fixed;display:none;border:1px solid rgba(80,170,255,0.9);background:rgba(80,170,255,0.15);pointer-events:none;", root.appendChild(rect);
  let tip = document.createElement("div");
  return tip.style.cssText = "position:fixed;display:none;padding:2px 6px;border-radius:3px;background:rgba(20,20,20,0.85);color:#ddd;white-space:nowrap;pointer-events:none;", root.appendChild(tip), document.body.appendChild(root), overlay = { root, labels: [], used: 0, rect, tip }, overlay;
}
function cssOf(cam2, x, y) {
  let canvas = canvasElement();
  if (!canvas) return null;
  let r = canvas.getBoundingClientRect();
  return !(r.width > 0) || !(r.height > 0) ? null : { left: r.left + x * r.width / cam2.width, top: r.top + r.height - y * r.height / cam2.height };
}
function beginLabels() {
  let o = ensureOverlay();
  o && (o.used = 0);
}
function addLabel(cam2, x, y, text, color2 = "#fff") {
  let o = ensureOverlay();
  if (!o) return;
  let css = cssOf(cam2, x, y);
  if (!css) return;
  let el = o.labels[o.used];
  el || (el = document.createElement("div"), el.style.cssText = "position:fixed;transform:translate(6px,-100%);text-shadow:0 0 2px #000,0 0 2px #000;pointer-events:none;white-space:nowrap;", o.root.appendChild(el), o.labels.push(el)), o.used++, el.textContent !== text && (el.textContent = text), el.style.color = color2, el.style.left = `${css.left}px`, el.style.top = `${css.top}px`, el.style.display = "block";
}
function endLabels() {
  let o = overlay;
  if (o)
    for (let i = o.used; i < o.labels.length; i++) o.labels[i].style.display = "none";
}
function showRect(cam2, x0, y0, x1, y1) {
  let o = ensureOverlay();
  if (!o) return;
  let a = cssOf(cam2, Math.min(x0, x1), Math.max(y0, y1)), b = cssOf(cam2, Math.max(x0, x1), Math.min(y0, y1));
  !a || !b || (o.rect.style.left = `${a.left}px`, o.rect.style.top = `${a.top}px`, o.rect.style.width = `${Math.max(0, b.left - a.left)}px`, o.rect.style.height = `${Math.max(0, b.top - a.top)}px`, o.rect.style.display = "block");
}
function hideRect() {
  overlay && (overlay.rect.style.display = "none");
}
function showTip(cam2, x, y, text) {
  let o = ensureOverlay();
  if (!o) return;
  let css = cssOf(cam2, x, y);
  css && (o.tip.textContent = text, o.tip.style.left = `${css.left + 14}px`, o.tip.style.top = `${css.top + 14}px`, o.tip.style.display = "block");
}
function hideTip() {
  overlay && (overlay.tip.style.display = "none");
}
function removeOverlay() {
  overlay != null && overlay.root.isConnected && overlay.root.remove(), overlay = null;
}

// source/scene/draw.ts
var gr = null, cam = null, camRight = v3(), camUp = v3(), camFwd = v3();
function beginDraw(camera) {
  return cam = camera, !camera.geometryRenderer && camera.initGeometryRenderer && camera.initGeometryRenderer(), gr = camera.geometryRenderer || null, gr ? (cameraRight(camera, camRight), cameraUp(camera, camUp), cameraForward(camera, camFwd), !0) : !1;
}
function color(r, g, b, a = 255) {
  return new (cc()).Color(r, g, b, a);
}
var Colors = {
  get curve() {
    return c("curve", 200, 200, 200);
  },
  get curveDim() {
    return c("curveDim", 140, 140, 140, 200);
  },
  get curveSelected() {
    return c("curveSelected", 240, 240, 240);
  },
  get curveHover() {
    return c("curveHover", 255, 255, 255);
  },
  get point() {
    return c("point", 52, 52, 52);
  },
  get pointOutline() {
    return c("pointOutline", 230, 230, 230);
  },
  get simplify() {
    return c("simplify", 255, 210, 60);
  },
  get selected() {
    return c("selected", 54, 179, 255);
  },
  get hover() {
    return c("hover", 255, 255, 255);
  },
  get linked() {
    return c("linked", 255, 196, 64);
  },
  get tangentLine() {
    return c("tangentLine", 160, 160, 160);
  },
  get tangent() {
    return c("tangent", 210, 210, 210);
  },
  get flow() {
    return c("flow", 255, 255, 255, 140);
  },
  get normal() {
    return c("normal", 120, 230, 120, 200);
  },
  get preview() {
    return c("preview", 255, 255, 255, 170);
  },
  get insert() {
    return c("insert", 120, 220, 120);
  },
  get axisX() {
    return c("axisX", 219, 62, 29);
  },
  get axisY() {
    return c("axisY", 154, 243, 72);
  },
  get axisZ() {
    return c("axisZ", 58, 122, 248);
  },
  get axisHot() {
    return c("axisHot", 246, 242, 50);
  },
  get axisView() {
    return c("axisView", 220, 220, 220);
  },
  get planeFill() {
    return c("planeFill", 255, 255, 255, 40);
  }
}, cache = /* @__PURE__ */ new Map();
function c(name, r, g, b, a = 255) {
  let col = cache.get(name);
  return col || (col = color(r, g, b, a), cache.set(name, col)), col;
}
function withAlpha(col, a) {
  let key = `${col.r},${col.g},${col.b},${a}`, res = cache.get(key);
  return res || (res = color(col.r, col.g, col.b, a), cache.set(key, res)), res;
}
function line(a, b, col, depthTest = !1) {
  gr.addLine(a, b, col, depthTest);
}
var _o = v3(), _a = v3(), _b = v3();
function thickLine(a, b, col, widthPx, depthTest = !1) {
  if (gr.addLine(a, b, col, depthTest), widthPx <= 1.2 || (sub(_o, b, a), cross(_o, _o, camFwd), lenSq(_o) < 1e-12)) return;
  normalize(_o, _o);
  let wpp = worldPerPixel(cam, a), half = Math.floor(widthPx / 2);
  for (let i = 1; i <= half; i++) {
    let s = wpp * i * 0.7;
    gr.addLine(scaleAndAdd(_a, a, _o, s), scaleAndAdd(_b, b, _o, s), col, depthTest), gr.addLine(scaleAndAdd(_a, a, _o, -s), scaleAndAdd(_b, b, _o, -s), col, depthTest);
  }
}
var circlePts = [];
function screenCirclePoints(center, radiusPx, segments) {
  let r = worldPerPixel(cam, center) * radiusPx;
  for (; circlePts.length <= segments; ) circlePts.push(v3());
  for (let i = 0; i <= segments; i++) {
    let a = i / segments * Math.PI * 2, p = circlePts[i];
    copy(p, center), scaleAndAdd(p, p, camRight, Math.cos(a) * r), scaleAndAdd(p, p, camUp, Math.sin(a) * r);
  }
  return circlePts;
}
function circle(center, radiusPx, col, segments = 16, depthTest = !1) {
  let pts = screenCirclePoints(center, radiusPx, segments);
  for (let i = 0; i < segments; i++) gr.addLine(pts[i], pts[i + 1], col, depthTest);
}
function disc(center, radiusPx, col, segments = 12, depthTest = !1) {
  let pts = screenCirclePoints(center, radiusPx, segments);
  for (let i = 0; i < segments; i++) gr.addTriangle(center, pts[i], pts[i + 1], col, !1, depthTest, !0);
}
function square(center, halfPx, col, filled, depthTest = !1) {
  let h = worldPerPixel(cam, center) * halfPx, p0 = add(v3(), scaleAndAdd(v3(), center, camRight, -h), scale(v3(), camUp, -h)), p1 = add(v3(), scaleAndAdd(v3(), center, camRight, h), scale(v3(), camUp, -h)), p2 = add(v3(), scaleAndAdd(v3(), center, camRight, h), scale(v3(), camUp, h)), p3 = add(v3(), scaleAndAdd(v3(), center, camRight, -h), scale(v3(), camUp, h));
  gr.addQuad(p0, p1, p2, p3, col, !filled, depthTest, !0);
}
function ring(center, normal, radius, col, segments = 48, depthTest = !1, frontOnly = !1) {
  let n = normalize(v3(), normal), u = normalize(v3(), cross(v3(), Math.abs(n.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0), n)), w = cross(v3(), n, u), prev = null, toCam = v3();
  for (let i = 0; i <= segments; i++) {
    let a = i / segments * Math.PI * 2, p = add(v3(), center, add(v3(), scale(v3(), u, Math.cos(a) * radius), scale(v3(), w, Math.sin(a) * radius)));
    if (prev) {
      let draw = !0;
      if (frontOnly) {
        let mid = scale(v3(), add(v3(), prev, p), 0.5);
        sub(toCam, mid, center), draw = toCam.x * camFwd.x + toCam.y * camFwd.y + toCam.z * camFwd.z <= radius * 0.05;
      }
      draw && gr.addLine(prev, p, col, depthTest);
    }
    prev = p;
  }
}
function cone(base, dir, height, radius, col, depthTest = !1, segments = 10) {
  let d = normalize(v3(), dir), apex = scaleAndAdd(v3(), base, d, height), u = normalize(v3(), cross(v3(), Math.abs(d.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0), d)), w = cross(v3(), d, u), pts = [];
  for (let i = 0; i <= segments; i++) {
    let a = i / segments * Math.PI * 2;
    pts.push(add(v3(), base, add(v3(), scale(v3(), u, Math.cos(a) * radius), scale(v3(), w, Math.sin(a) * radius))));
  }
  for (let i = 0; i < segments; i++)
    gr.addTriangle(apex, pts[i], pts[i + 1], col, !1, depthTest, !0), gr.addTriangle(base, pts[i + 1], pts[i], col, !1, depthTest, !0);
}
function cube(center, half, ax, ay, az, col, depthTest = !1) {
  let corner = (sx, sy, sz) => {
    let p = copy(v3(), center);
    return scaleAndAdd(p, p, ax, sx * half), scaleAndAdd(p, p, ay, sy * half), scaleAndAdd(p, p, az, sz * half), p;
  }, c000 = corner(-1, -1, -1), c100 = corner(1, -1, -1), c110 = corner(1, 1, -1), c010 = corner(-1, 1, -1), c001 = corner(-1, -1, 1), c101 = corner(1, -1, 1), c111 = corner(1, 1, 1), c011 = corner(-1, 1, 1), q = (a, b, cc2, d) => gr.addQuad(a, b, cc2, d, col, !1, depthTest, !0);
  q(c000, c100, c110, c010), q(c001, c011, c111, c101), q(c000, c010, c011, c001), q(c100, c101, c111, c110), q(c000, c001, c101, c100), q(c010, c110, c111, c011);
}
function quad(a, b, c2, d, col, filled, depthTest = !1) {
  gr.addQuad(a, b, c2, d, col, !filled, depthTest, !0);
}

// source/scene/model.ts
var _inv = /* @__PURE__ */ new Map();
function inverse(node) {
  let m = node.worldMatrix, stamp = `${m.m00},${m.m01},${m.m02},${m.m04},${m.m05},${m.m06},${m.m08},${m.m09},${m.m10},${m.m12},${m.m13},${m.m14}`, e = _inv.get(node);
  if (!e || e.stamp !== stamp) {
    let { Mat4 } = cc(), inv = new Mat4();
    Mat4.invert(inv, m), e = { stamp, m: inv }, _inv.set(node, e);
  }
  return e.m;
}
function pointWorld(comp, i, out = v3()) {
  let p = comp.positions[i];
  return p ? comp.useWorldSpace ? copy(out, p) : m4TransformPoint(out, comp.node.worldMatrix, p) : out;
}
function worldPoints(comp) {
  let res = [];
  for (let i = 0; i < comp.positions.length; i++) res.push(pointWorld(comp, i));
  return res;
}
function toPointSpace(comp, world, out = v3()) {
  return comp.useWorldSpace ? copy(out, world) : m4TransformPoint(out, inverse(comp.node), world);
}
function setPointWorld(comp, i, world) {
  let p = comp.positions[i];
  if (!p) return;
  let local = toPointSpace(comp, world);
  p.set(local.x, local.y, local.z);
}
function newPoint(comp, world) {
  let { Vec3 } = cc(), p = toPointSpace(comp, world);
  return new Vec3(p.x, p.y, p.z);
}
function nodeRotation(comp) {
  let r = comp.node.worldRotation;
  return { x: r.x, y: r.y, z: r.z, w: r.w };
}
function currentLine() {
  let C = lineClass();
  if (!C) return null;
  for (let uuid of selectedNodeUuids()) {
    let node = findNode(uuid);
    if (!node || !node.isValid || !node.activeInHierarchy) continue;
    let comp = node.getComponent(C);
    if (comp && comp.enabledInHierarchy) return comp;
  }
  return null;
}
function inCanvas(comp) {
  var _a2;
  let UITransform = cc().UITransform;
  for (let n = comp.node; n; n = n.parent) if ((_a2 = n.getComponent) != null && _a2.call(n, UITransform)) return !0;
  return !1;
}

// source/scene/handles.ts
var AXIS_PX = 90, HIT_PX = 7, AXIS_INDEX = { x: 0, y: 1, z: 2 }, AXES = ["x", "y", "z"], PLANES = [
  { axis: "xy", a: 0, b: 1, n: 2 },
  { axis: "yz", a: 1, b: 2, n: 0 },
  { axis: "xz", a: 0, b: 2, n: 1 }
];
function handleKind() {
  switch (transformToolName()) {
    case "position":
    case "rect":
      return "move";
    case "rotation":
      return "rotate";
    case "scale":
      return "scale";
    default:
      return null;
  }
}
function computeFrame(cam2, comp, indices, axesOverride2) {
  let kind = handleKind();
  if (!kind || !indices.length) return null;
  let pivot;
  if (pivotMode() === "pivot") pivot = pointWorld(comp, indices[indices.length - 1]);
  else {
    pivot = v3();
    for (let i of indices) add(pivot, pivot, pointWorld(comp, i));
    scale(pivot, pivot, 1 / indices.length);
  }
  let axes = [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)];
  if (coordinateMode() === "local") {
    let q = nodeRotation(comp);
    axes = [qRotate(v3(), q, v3(1, 0, 0)), qRotate(v3(), q, v3(0, 1, 0)), qRotate(v3(), q, v3(0, 0, 1))];
  }
  return { kind, pivot, axes: axesOverride2 ?? axes, size: worldPerPixel(cam2, pivot) * AXIS_PX, is2D: is2DView() };
}
function axisColor(i) {
  return i === 0 ? Colors.axisX : i === 1 ? Colors.axisY : Colors.axisZ;
}
function visibleAxes(f) {
  return f.is2D ? [0, 1] : [0, 1, 2];
}
function visiblePlanes(f) {
  return f.is2D ? PLANES.filter((p) => p.axis === "xy") : PLANES;
}
function planeQuad(cam2, f, p) {
  let toCam = sub(v3(), cameraPosition(cam2), f.pivot), sa = dot(f.axes[p.a], toCam) >= 0 ? 1 : -1, sb = dot(f.axes[p.b], toCam) >= 0 ? 1 : -1, lo = f.size * 0.16, hi = f.size * 0.4, pt = (x, y) => add(v3(), add(v3(), f.pivot, scale(v3(), f.axes[p.a], x * sa)), scale(v3(), f.axes[p.b], y * sb));
  return [pt(lo, lo), pt(hi, lo), pt(hi, hi), pt(lo, hi)];
}
function ringPoints(f, normal, radius, segments = 48) {
  let n = normalize(v3(), normal), u = normalize(v3(), cross(v3(), Math.abs(n.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0), n)), w = cross(v3(), n, u), pts = [];
  for (let i = 0; i <= segments; i++) {
    let a = i / segments * Math.PI * 2;
    pts.push(add(v3(), f.pivot, add(v3(), scale(v3(), u, Math.cos(a) * radius), scale(v3(), w, Math.sin(a) * radius))));
  }
  return pts;
}
function drawHandle(cam2, f, hot) {
  let hotColor = Colors.axisHot;
  if (f.kind === "rotate") {
    for (let i of [0, 1, 2])
      f.is2D && i !== 2 || ring(f.pivot, f.axes[i], f.size, hot === AXES[i] ? hotColor : axisColor(i), 64, !1, !f.is2D);
    ring(f.pivot, cameraForward(cam2), f.size * 1.15, hot === "view" ? hotColor : Colors.axisView, 64);
    return;
  }
  for (let i of visibleAxes(f)) {
    let col = hot === AXES[i] ? hotColor : axisColor(i), tip = scaleAndAdd(v3(), f.pivot, f.axes[i], f.size);
    thickLine(f.pivot, tip, col, 2), f.kind === "move" ? cone(scaleAndAdd(v3(), f.pivot, f.axes[i], f.size * 0.82), f.axes[i], f.size * 0.22, f.size * 0.07, col) : cube(tip, f.size * 0.06, f.axes[0], f.axes[1], f.axes[2], col);
  }
  if (f.kind === "move") {
    for (let p of visiblePlanes(f)) {
      let q = planeQuad(cam2, f, p), col = hot === p.axis ? hotColor : axisColor(p.n);
      quad(q[0], q[1], q[2], q[3], withAlpha(col, hot === p.axis ? 110 : 60), !0), quad(q[0], q[1], q[2], q[3], col, !1);
    }
    square(f.pivot, 5, hot === "free" ? hotColor : Colors.axisView, !1);
  } else
    cube(f.pivot, f.size * 0.08, f.axes[0], f.axes[1], f.axes[2], hot === "free" ? hotColor : Colors.axisView);
}
function hitHandle(cam2, f, mx, my) {
  let sp = toScreen(cam2, f.pivot);
  if (!sp.visible) return null;
  if (f.kind === "rotate") {
    let best2 = null, bestD2 = HIT_PX, test = (axis, pts) => {
      let prev = toScreen(cam2, pts[0]);
      for (let i = 1; i < pts.length; i++) {
        let cur = toScreen(cam2, pts[i]), d = distToSegment2(mx, my, prev.x, prev.y, cur.x, cur.y).dist;
        d < bestD2 && (bestD2 = d, best2 = axis), prev = cur;
      }
    };
    for (let i of [0, 1, 2])
      f.is2D && i !== 2 || test(AXES[i], ringPoints(f, f.axes[i], f.size));
    return test("view", ringPoints(f, cameraForward(cam2), f.size * 1.15)), best2;
  }
  if (Math.hypot(mx - sp.x, my - sp.y) <= (f.kind === "scale" ? 9 : 7)) return "free";
  let best = null, bestD = HIT_PX;
  for (let i of visibleAxes(f)) {
    let tip = toScreen(cam2, scaleAndAdd(v3(), f.pivot, f.axes[i], f.size * 1.05)), d = distToSegment2(mx, my, sp.x, sp.y, tip.x, tip.y).dist;
    d < bestD && (bestD = d, best = AXES[i]);
  }
  if (best) return best;
  if (f.kind === "move") {
    for (let p of visiblePlanes(f))
      if (pointInPolygon(mx, my, planeQuad(cam2, f, p).map((w) => toScreen(cam2, w)))) return p.axis;
  }
  return null;
}
function snapStep(v, step) {
  return step > 0 ? Math.round(v / step) * step : v;
}
function constraintPoint(cam2, f, axis, mx, my) {
  let ray = screenRay(cam2, mx, my);
  if (axis in AXIS_INDEX) return closestOnLine(ray, f.pivot, f.axes[AXIS_INDEX[axis]]);
  if (axis === "free") return rayPlane(ray, f.pivot, cameraForward(cam2), !0);
  let p = PLANES.find((pl) => pl.axis === axis);
  return p ? rayPlane(ray, f.pivot, f.axes[p.n], !0) : null;
}
function startHandleDrag(cam2, f, axis, mx, my, comp, indices) {
  let starts = indices.map((i) => ({ i, pos: pointWorld(comp, i) }));
  if (!starts.length) return null;
  let pivot = copy(v3(), f.pivot);
  if (f.kind === "move") {
    let start = constraintPoint(cam2, f, axis, mx, my);
    return start ? {
      frame: f,
      axis,
      update(x, y, ev) {
        let cur = constraintPoint(cam2, f, axis, x, y);
        if (!cur) return "";
        let delta = sub(v3(), cur, start), snap = snapConfig();
        if (snap.isPositionSnapEnabled !== !!(ev != null && ev.ctrlKey)) {
          let steps = [snap.position.x, snap.position.y, snap.position.z], out = v3();
          for (let i = 0; i < 3; i++) scaleAndAdd(out, out, f.axes[i], snapStep(dot(delta, f.axes[i]), steps[i]));
          copy(delta, out);
        }
        for (let s of starts) setPointWorld(comp, s.i, add(v3(), s.pos, delta));
        return `\u0394 ${[0, 1, 2].map((i) => dot(delta, f.axes[i]).toFixed(3)).join(", ")}`;
      }
    } : null;
  }
  if (f.kind === "rotate") {
    let n = axis === "view" ? scale(v3(), cameraForward(cam2), -1) : copy(v3(), f.axes[AXIS_INDEX[axis] ?? 2]), sp2 = toScreen(cam2, pivot), onPlane = (x, y) => {
      let hit = rayPlane(screenRay(cam2, x, y), pivot, n, !0);
      if (!hit) return null;
      let v = sub(v3(), hit, pivot);
      return lenSq(v) > 1e-6 ? v : null;
    }, v0 = Math.abs(dot(n, cameraForward(cam2))) < 0.15 ? null : onPlane(mx, my), a0 = Math.atan2(my - sp2.y, mx - sp2.x), screenSign = dot(n, cameraForward(cam2)) > 0 ? 1 : -1;
    return {
      frame: f,
      axis,
      update(x, y, ev) {
        let angle, v1 = v0 ? onPlane(x, y) : null;
        v0 && v1 ? angle = Math.atan2(dot(cross(v3(), v0, v1), n), dot(v0, v1)) : angle = (Math.atan2(y - sp2.y, x - sp2.x) - a0) * -screenSign;
        let deg = angle * 180 / Math.PI, snap = snapConfig();
        snap.isRotationSnapEnabled !== !!(ev != null && ev.ctrlKey) && (deg = snapStep(deg, snap.rotation || 15));
        let q = qFromAxisAngle(q4(), n, deg * Math.PI / 180);
        for (let s of starts) setPointWorld(comp, s.i, add(v3(), pivot, qRotate(v3(), q, sub(v3(), s.pos, pivot))));
        return `${deg.toFixed(1)}\xB0`;
      }
    };
  }
  let sp = toScreen(cam2, pivot), dirX = 1, dirY = 0, screenLen = 80;
  if (axis in AXIS_INDEX) {
    let tip = toScreen(cam2, scaleAndAdd(v3(), pivot, f.axes[AXIS_INDEX[axis]], f.size)), l = Math.hypot(tip.x - sp.x, tip.y - sp.y);
    l > 1 && (dirX = (tip.x - sp.x) / l, dirY = (tip.y - sp.y) / l, screenLen = l);
  }
  return {
    frame: f,
    axis,
    update(x, y, ev) {
      let factor = axis === "free" ? 1 + (x - mx + (y - my)) / 120 : 1 + ((x - mx) * dirX + (y - my) * dirY) / screenLen, snap = snapConfig();
      snap.isScaleSnapEnabled !== !!(ev != null && ev.ctrlKey) && (factor = 1 + snapStep(factor - 1, snap.scale || 0.1));
      let s = axis === "free" ? [factor, factor, factor] : [1, 1, 1];
      axis in AXIS_INDEX && (s[AXIS_INDEX[axis]] = factor);
      for (let st of starts) {
        let d = sub(v3(), st.pos, pivot), out = copy(v3(), pivot);
        for (let i = 0; i < 3; i++) scaleAndAdd(out, out, f.axes[i], dot(d, f.axes[i]) * s[i]);
        setPointWorld(comp, st.i, out);
      }
      return `\xD7 ${factor.toFixed(3)}`;
    }
  };
}

// source/scene/render.ts
var POINT_PX = 4.5, HIT_POINT = 8, HIT_SEGMENT = 6;
function updateTarget() {
  let comp = currentLine();
  if (comp !== S.target && (S.target = comp, S.selection = [], S.hover = null, S.preview = null, comp || (S.mode = "none"), S.stateVersion++), comp) {
    let n = comp.positions.length, valid = S.selection.filter((i) => i >= 0 && i < n);
    valid.length !== S.selection.length && (S.selection = valid, S.stateVersion++);
  }
  return comp;
}
var axesOverride = null, dragAxis = null;
function setHandleAxesOverride(axes) {
  axesOverride = axes;
}
function setDragAxis(a) {
  dragAxis = a;
}
function currentHandleFrame(cam2) {
  return S.mode !== "edit" || !S.target || !S.selection.length ? null : computeFrame(cam2, S.target, S.selection, axesOverride);
}
var extraDrawer = null;
function setExtraDrawer(fn) {
  extraDrawer = fn;
}
function drawFrame() {
  var _a2, _b2, _c, _d;
  if (!runtimeReady()) return;
  let cam2 = sceneCamera();
  if (!cam2) return;
  let comp = updateTarget();
  if (!comp) {
    endLabels();
    return;
  }
  if (!beginDraw(cam2)) return;
  S.diag.draws++, beginLabels();
  let pts = worldPoints(comp), editing = S.mode !== "none";
  if (editing) {
    for (let i = 0; i + 1 < pts.length; i++) {
      let hot = ((_a2 = S.hover) == null ? void 0 : _a2.kind) === "segment" && S.hover.index === i;
      line(pts[i], pts[i + 1], hot ? Colors.curveHover : Colors.curveDim);
    }
    if (comp.loop && pts.length > 2) {
      let hot = ((_b2 = S.hover) == null ? void 0 : _b2.kind) === "segment" && S.hover.index === pts.length - 1;
      line(pts[pts.length - 1], pts[0], hot ? Colors.curveHover : Colors.curveDim);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    let p = pts[i];
    if (!editing) {
      disc(p, 2.5, Colors.curveSelected, 8);
      continue;
    }
    let selected = S.mode === "edit" && isSelected(i), hovered = ((_c = S.hover) == null ? void 0 : _c.kind) === "point" && S.hover.index === i, r = selected || hovered ? POINT_PX + 1 : POINT_PX;
    disc(p, r, selected ? Colors.selected : Colors.point, 12), circle(p, r, hovered ? Colors.hover : Colors.pointOutline, 12);
  }
  if (editing && S.settings.simplifyPreview && pts.length > 2) {
    let keep = simplifyIndices(comp.positions, S.settings.tolerance, comp.loop);
    for (let k = 0; k + 1 < keep.length; k++) thickLine(pts[keep[k]], pts[keep[k + 1]], Colors.simplify, 2);
    comp.loop && keep.length > 2 && thickLine(pts[keep[keep.length - 1]], pts[keep[0]], Colors.simplify, 2);
    let sp = toScreen(cam2, pts[0]);
    sp.visible && addLabel(cam2, sp.x, sp.y + 14, `Simplify: ${pts.length} \u2192 ${keep.length} points`, "#ffd23c");
  }
  if (S.mode === "edit") {
    let f = currentHandleFrame(cam2);
    f && drawHandle(cam2, f, ((_d = S.hover) == null ? void 0 : _d.kind) === "handle" ? S.hover.axis : dragAxis);
  }
  extraDrawer == null || extraDrawer(cam2), endLabels();
}
function hitTest(cam2, mx, my, opts = {}) {
  let comp = S.target;
  if (!comp) return null;
  if (S.mode === "edit" && opts.handles !== !1) {
    let f = currentHandleFrame(cam2);
    if (f) {
      let axis = hitHandle(cam2, f, mx, my);
      if (axis) return { kind: "handle", axis };
    }
  }
  let sp = { x: 0, y: 0, visible: !0 }, best = -1, bestD = HIT_POINT;
  for (let i = 0; i < comp.positions.length; i++) {
    if (toScreen(cam2, pointWorld(comp, i), sp), !sp.visible) continue;
    let d = Math.hypot(sp.x - mx, sp.y - my);
    d < bestD && (bestD = d, best = i);
  }
  return best >= 0 ? { kind: "point", index: best } : opts.segments === !1 ? null : hitSegment(cam2, comp, mx, my, HIT_SEGMENT);
}
function hitSegment(cam2, comp, mx, my, maxPx) {
  let pts = worldPoints(comp), n = pts.length, count = comp.loop && n > 2 ? n : n - 1, best = null, bestD = maxPx, a = { x: 0, y: 0, visible: !0 }, b = { x: 0, y: 0, visible: !0 };
  for (let i = 0; i < count; i++) {
    let pa = pts[i], pb = pts[(i + 1) % n];
    if (toScreen(cam2, pa, a), toScreen(cam2, pb, b), !a.visible || !b.visible) continue;
    let r = distToSegment2(mx, my, a.x, a.y, b.x, b.y);
    r.dist < bestD && (bestD = r.dist, best = { kind: "segment", index: i, t: r.f, world: lerp(v3(), pa, pb, r.f) });
  }
  return best;
}
function pointsInRect(cam2, x0, y0, x1, y1) {
  let comp = S.target;
  if (!comp) return [];
  let minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1), res = [], sp = { x: 0, y: 0, visible: !0 };
  for (let i = 0; i < comp.positions.length; i++)
    toScreen(cam2, pointWorld(comp, i), sp), sp.visible && sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY && res.push(i);
  return res;
}
function pickLine(cam2, mx, my) {
  var _a2, _b2, _c, _d;
  let best = null, bestD = 1 / 0;
  for (let comp of allLines()) {
    if (!comp.positions || comp.positions.length < 2) continue;
    let p0 = pointWorld(comp, 0), halfPx = comp.widthMultiplier * Math.max(((_b2 = (_a2 = comp.widthCurve) == null ? void 0 : _a2.evaluate) == null ? void 0 : _b2.call(_a2, 0)) ?? 1, ((_d = (_c = comp.widthCurve) == null ? void 0 : _c.evaluate) == null ? void 0 : _d.call(_c, 1)) ?? 1) / 2 / worldPerPixel(cam2, p0), hit = hitSegment(cam2, comp, mx, my, Math.max(5, Math.min(halfPx + 2, 60)));
    if (hit) {
      let sp = toScreen(cam2, hit.world), d = Math.hypot(sp.x - mx, sp.y - my);
      d < bestD && (bestD = d, best = comp);
    }
  }
  return best;
}

// source/scene/undo.ts
async function request(name, ...args) {
  return Editor.Message.request("scene", name, ...args);
}
async function beginRecording(uuids) {
  if (!uuids.length) return null;
  try {
    let id = await request("begin-recording", uuids);
    return typeof id == "string" && id ? id : null;
  } catch (e) {
    return console.warn("[LineRenderer] begin-recording failed:", e), null;
  }
}
async function endRecording(id, cancel = !1) {
  if (id)
    try {
      await request(cancel ? "cancel-recording" : "end-recording", id);
    } catch (e) {
      console.warn("[LineRenderer] end-recording failed:", e);
    }
}
function nodesOf(comps) {
  let set2 = /* @__PURE__ */ new Set();
  for (let c2 of comps) c2 && c2.isValid && c2.node && c2.node.isValid && set2.add(c2.node);
  return [...set2];
}
function afterEdit(comps) {
  var _a2, _b2;
  for (let c2 of comps)
    if (!(!c2 || !c2.isValid))
      try {
        (_a2 = c2.markDirty) == null || _a2.call(c2), (_b2 = c2.rebuild) == null || _b2.call(c2);
      } catch {
      }
  for (let n of nodesOf(comps)) notifyNodeChanged(n);
  repaint();
}
async function recordEdit(comps, fn) {
  let id = await beginRecording(nodesOf(comps).map((n) => n.uuid)), ok = !1;
  try {
    fn(), ok = !0;
  } finally {
    afterEdit(comps), await endRecording(id, !ok);
  }
}
var NOTIFY_MS = 120, EditSession = class {
  constructor(comps) {
    this.comps = comps;
    this.id = null;
    this.opened = !1;
    this.ended = !1;
    this.pending = null;
    this.changed = !1;
    this.notifiedAt = 0;
    this.ready = beginRecording(nodesOf(comps).map((n) => n.uuid)).then((id) => {
      if (this.id = id, this.opened = !0, this.pending && !this.ended) {
        let fn = this.pending;
        this.pending = null, this.run(fn);
      }
    });
  }
  /** Applies an edit (now, or as soon as the recording is open). */
  apply(fn) {
    if (!this.ended) {
      if (!this.opened) {
        this.pending = fn;
        return;
      }
      this.run(fn);
    }
  }
  run(fn) {
    var _a2, _b2;
    fn(), this.changed = !0;
    for (let c2 of this.comps)
      (_a2 = c2.markDirty) == null || _a2.call(c2), (_b2 = c2.rebuild) == null || _b2.call(c2);
    let now2 = Date.now();
    if (now2 - this.notifiedAt > NOTIFY_MS) {
      this.notifiedAt = now2;
      for (let n of nodesOf(this.comps)) notifyNodeChanged(n);
    }
    repaint();
  }
  async end() {
    if (!this.ended) {
      if (this.ended = !0, await this.ready, this.pending) {
        let fn = this.pending;
        this.pending = null, this.run(fn);
      }
      this.changed && afterEdit(this.comps), await endRecording(this.id, !this.changed);
    }
  }
};

// source/scene/ops.ts
function touched() {
  bumpState(), repaint();
}
async function deleteSelected() {
  let comp = S.target;
  if (!comp || !S.selection.length) return;
  let drop = new Set(S.selection);
  await recordEdit([comp], () => {
    comp.positions = comp.positions.filter((_, i) => !drop.has(i));
  }), setSelection([]), touched();
}
async function subdivideSelected() {
  let comp = S.target;
  if (!comp || !S.selection.length) return;
  let n = comp.positions.length, sel = new Set(S.selection), segs = [], count = comp.loop && n > 2 ? n : n - 1;
  for (let i = 0; i < count; i++) sel.has(i) && sel.has((i + 1) % n) && segs.push(i);
  if (!segs.length)
    for (let i of sel)
      (i > 0 || comp.loop) && segs.push((i - 1 + n) % n), (i < n - 1 || comp.loop) && segs.push(i);
  let unique = [...new Set(segs)].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
  if (!unique.length) return;
  let newSel = [];
  await recordEdit([comp], () => {
    let pts = comp.positions.slice(), out = [];
    for (let i = 0; i < n; i++)
      out.push(pts[i]), sel.has(i) && newSel.push(out.length - 1), unique.includes(i) && (out.push(newPoint(comp, lerp(v3(), pointWorld(comp, i), pointWorld(comp, (i + 1) % n), 0.5))), newSel.push(out.length - 1));
    comp.positions = out;
  }), setSelection(newSel), touched();
}
function selectAll() {
  let comp = S.target;
  comp && (S.mode !== "edit" && (S.mode = "edit"), setSelection(comp.positions.map((_, i) => i)), touched());
}
async function simplifyLine(tolerance) {
  let comp = S.target;
  if (!comp) return 0;
  let keep = simplifyIndices(comp.positions, tolerance, comp.loop), removed = comp.positions.length - keep.length;
  return removed ? (await recordEdit([comp], () => {
    comp.positions = keep.map((i) => comp.positions[i]);
  }), setSelection([]), touched(), removed) : 0;
}
async function insertOnSegment(comp, index, world) {
  let at = index + 1;
  return await recordEdit([comp], () => {
    let pts = comp.positions.slice();
    pts.splice(at, 0, newPoint(comp, world)), comp.positions = pts;
  }), setSelection([at]), touched(), at;
}
function niceSize(v) {
  if (!(v > 0)) return 1;
  let p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function viewCenter(is2D) {
  let cam2 = sceneCamera();
  if (!cam2) return { pos: v3(), size: is2D ? 100 : 1 };
  let ray = screenRay(cam2, cam2.width / 2, cam2.height / 2), pos = rayPlane(ray, v3(), is2D ? v3(0, 0, 1) : v3(0, 1, 0));
  if (!pos) {
    let f = cameraForward(cam2), c2 = cameraPosition(cam2);
    pos = v3(c2.x + f.x * 10, c2.y + f.y * 10, c2.z + f.z * 10);
  }
  return { pos, size: niceSize(worldPerPixel(cam2, pos) * Math.min(cam2.width, cam2.height) * 0.2) };
}
async function createLineNode(kind) {
  let is2D = is2DView(), sel = selectedNodeUuids(), options = { name: "Line" };
  sel.length && (options.parent = sel[0]), is2D && (options.canvasRequired = !0);
  let uuid = await Editor.Message.request("scene", "create-node", options);
  if (!uuid || typeof uuid != "string") return null;
  await Editor.Message.request("scene", "create-component", { uuid, component: "LineRenderer" });
  let node = findNode(uuid), C = lineClass(), comp = node && C ? node.getComponent(C) : null;
  if (!comp) return uuid;
  let { pos, size } = viewCenter(is2D);
  await recordEdit([comp], () => {
    if (node.setWorldPosition(pos.x, pos.y, pos.z), kind === "draw")
      comp.positions = [];
    else {
      let half = size, a = is2D ? v3(pos.x - half, pos.y, 0) : v3(pos.x - half, pos.y, pos.z), b = is2D ? v3(pos.x + half, pos.y, 0) : v3(pos.x + half, pos.y, pos.z);
      comp.positions = [newPoint(comp, a), newPoint(comp, b)], is2D || (comp.widthMultiplier = niceSize(size * 0.1));
    }
  });
  try {
    Editor.Selection.clear("node"), Editor.Selection.select("node", uuid);
  } catch {
  }
  return pendingMode = { comp, mode: kind === "draw" ? "create" : "none", until: Date.now() + 3e3 }, repaint(), uuid;
}
var pendingMode = null;
function takePendingMode(target) {
  let p = pendingMode;
  return p ? p.comp === target ? (pendingMode = null, p.mode) : (Date.now() > p.until && (pendingMode = null), null) : null;
}

// source/scene/input.ts
var PRIORITY = 100, PICK_PRIORITY = 100, GIZMO_RADIUS_PX = 110, DRAG_PX = 4, active = null, lastHoverKey = "";
function changed() {
  bumpState(), repaint();
}
function canEdit() {
  return S.primary && !S.replaying && runtimeReady();
}
function pointer(ev) {
  let cam2 = sceneCamera();
  if (!cam2) return null;
  let p = eventToScreen(cam2, ev);
  return { cam: cam2, x: p.x, y: p.y };
}
function hitKey(h) {
  return h ? h.kind === "handle" ? `h:${h.axis}` : `${h.kind}:${h.index}` : "";
}
function setHover(h) {
  S.hover = h;
  let key = hitKey(h);
  key !== lastHoverKey && (lastHoverKey = key, repaint());
}
function setMode(mode) {
  S.mode !== mode && (cancelActive(), S.mode = mode, S.hover = null, S.preview = null, mode !== "edit" && (S.selection = []), changed());
}
function onMouseDown(ev) {
  if (!canEdit() || (active && cancelActive(), S.diag.mouseDowns++, !(ev.button === 0 || ev.button === void 0 && ev.leftButton) || ev.altKey)) return !0;
  let p = pointer(ev);
  if (!p) return !0;
  let comp = updateTarget();
  if (!comp) return !0;
  try {
    return S.mode === "create" ? createDown(p.cam, p.x, p.y, comp, ev) : editDown(p.cam, p.x, p.y, comp, ev);
  } catch (e) {
    return note(`mousedown: ${(e == null ? void 0 : e.stack) || e}`), active = null, !0;
  }
}
function editDown(cam2, x, y, comp, ev) {
  let hit = hitTest(cam2, x, y, { segments: S.mode === "edit" });
  if (S.mode === "none") {
    if ((hit == null ? void 0 : hit.kind) !== "point") return !0;
    setMode("edit");
  }
  if ((hit == null ? void 0 : hit.kind) === "handle") {
    let frame = currentHandleFrame(cam2);
    if (!frame) return !1;
    let drag = startHandleDrag(cam2, frame, hit.axis, x, y, comp, S.selection);
    return drag && (setHandleAxesOverride(frame.axes), setDragAxis(hit.axis), active = { kind: "handle", drag, session: new EditSession([comp]) }), !1;
  }
  if ((hit == null ? void 0 : hit.kind) === "point") {
    let additive = !!(ev.shiftKey || ev.ctrlKey || ev.metaKey), toggled = !1;
    return additive ? (toggleSelection(hit.index), toggled = !0) : isSelected(hit.index) ? setSelection([...S.selection.filter((i) => i !== hit.index), hit.index]) : setSelection([hit.index]), changed(), active = { kind: "point", index: hit.index, x0: x, y0: y, dragging: !1, toggled, session: null, grab: null, starts: [] }, !1;
  }
  return active = {
    kind: "rect",
    x0: x,
    y0: y,
    moved: !1,
    additive: !!(ev.shiftKey || ev.ctrlKey || ev.metaKey),
    base: S.selection.slice(),
    down: cloneEvent(ev),
    onSegment: (hit == null ? void 0 : hit.kind) === "segment"
  }, !1;
}
function cloneEvent(ev) {
  let o = {};
  for (let k in ev) typeof ev[k] != "function" && (o[k] = ev[k]);
  return o;
}
function onMouseMove(ev) {
  if (!canEdit()) return !0;
  let p = pointer(ev);
  if (!p) return !0;
  try {
    return active ? dragMove(p.cam, p.x, p.y, ev) : (hover(p.cam, p.x, p.y), !0);
  } catch (e) {
    return note(`mousemove: ${(e == null ? void 0 : e.stack) || e}`), !0;
  }
}
function hover(cam2, x, y) {
  let comp = S.target;
  if (!comp || S.mode === "none") {
    S.hover && setHover(null);
    return;
  }
  if (S.mode === "create") {
    let place = placement(cam2, x, y, comp);
    S.preview = place ? place.world : null, repaint();
    return;
  }
  setHover(hitTest(cam2, x, y));
}
function dragMove(cam2, x, y, ev) {
  let a = active, comp = S.target;
  switch (a.kind) {
    case "handle": {
      let text = "";
      return a.session.apply(() => {
        text = a.drag.update(x, y, ev);
      }), text && showTip(cam2, x, y, text), !1;
    }
    case "point": {
      if (!comp) return !1;
      if (!a.dragging) {
        if (Math.hypot(x - a.x0, y - a.y0) < DRAG_PX || a.toggled) return !1;
        a.dragging = !0, a.starts = S.selection.map((i) => ({ i, pos: pointWorld(comp, i) })), a.grab = pointWorld(comp, a.index), a.session = new EditSession([comp]);
      }
      let grab = a.grab, hit = rayPlane(screenRay(cam2, x, y), grab, cameraForward(cam2), !0);
      if (!hit) return !1;
      let delta = sub(v3(), hit, grab), snap = snapConfig();
      if (snap.isPositionSnapEnabled !== !!ev.ctrlKey) {
        let t = add(v3(), grab, delta);
        t.x = Math.round(t.x / (snap.position.x || 1)) * (snap.position.x || 1), t.y = Math.round(t.y / (snap.position.y || 1)) * (snap.position.y || 1), is2DView() || (t.z = Math.round(t.z / (snap.position.z || 1)) * (snap.position.z || 1)), sub(delta, t, grab);
      }
      return a.session.apply(() => {
        for (let s of a.starts) setPointWorld(comp, s.i, add(v3(), s.pos, delta));
      }), !1;
    }
    case "rect": {
      if (!a.moved && Math.hypot(x - a.x0, y - a.y0) < DRAG_PX) return !1;
      a.moved = !0, showRect(cam2, a.x0, a.y0, x, y);
      let inside = pointsInRect(cam2, a.x0, a.y0, x, y);
      return setSelection(a.additive ? [...a.base, ...inside] : inside), repaint(), !1;
    }
    case "create": {
      if (!comp) return !1;
      let place = placement(cam2, x, y, comp);
      if (!place) return !1;
      S.preview = place.world;
      let minDist = Math.max(S.settings.minVertexDistance, worldPerPixel(cam2, place.world) * 3);
      if (dist(place.world, a.last) >= minDist) {
        a.last = place.world;
        let w = place.world;
        a.session.apply(() => {
          comp.positions = [...comp.positions, newPoint(comp, w)];
        });
      }
      return repaint(), !1;
    }
  }
  return !1;
}
function onMouseUp(ev) {
  if (S.replaying || !active) return !0;
  let a = active;
  active = null;
  try {
    switch (a.kind) {
      case "handle":
        a.session.end(), setHandleAxesOverride(null), setDragAxis(null), hideTip();
        break;
      case "point":
        a.session ? a.session.end() : !a.toggled && S.selection.length > 1 && setSelection([a.index]);
        break;
      case "rect":
        hideRect(), !a.moved && !a.additive && (a.onSegment || S.selection.length ? setSelection([]) : replayClick(a.down, ev));
        break;
      case "create":
        a.session.end();
        break;
    }
  } catch (e) {
    note(`mouseup: ${(e == null ? void 0 : e.stack) || e}`);
  }
  return changed(), !1;
}
function replayClick(down, up) {
  let op = cce().Operation;
  if (op != null && op.emit) {
    S.replaying = !0;
    try {
      op.emit("mousedown", down), op.emit("mouseup", up);
    } catch (e) {
      note(`replay: ${e}`);
    } finally {
      S.replaying = !1;
    }
  }
}
function onDblClick(ev) {
  if (!canEdit() || S.mode !== "edit" || !S.target) return !0;
  let p = pointer(ev);
  if (!p) return !0;
  let hit = hitTest(p.cam, p.x, p.y, { handles: !1 });
  return (hit == null ? void 0 : hit.kind) !== "segment" ? !0 : (insertOnSegment(S.target, hit.index, hit.world), !1);
}
function cancelActive() {
  if (!active) return;
  let a = active;
  active = null, (a.kind === "handle" || a.kind === "create") && a.session.end(), a.kind === "point" && a.session && a.session.end(), setHandleAxesOverride(null), setDragAxis(null), hideRect(), hideTip();
}
function isDragging() {
  return !!active;
}
function createDown(cam2, x, y, comp, _ev) {
  let place = placement(cam2, x, y, comp);
  if (!place) return !1;
  let session = new EditSession([comp]), w = place.world;
  return session.apply(() => {
    comp.positions = [...comp.positions, newPoint(comp, w)];
  }), active = { kind: "create", session, last: w, normal: place.normal }, !1;
}
function placement(cam2, x, y, comp) {
  let ray = screenRay(cam2, x, y), mode = S.settings.inputMode;
  if (mode === "view")
    return { world: scaleAndAdd(v3(), ray.o, ray.d, Math.max(0, S.settings.viewDistance)), normal: null };
  if (mode === "surface" && !is2DView()) {
    let hit = raycastScene(ray);
    if (hit) return { world: scaleAndAdd(v3(), hit, ray.d, -S.settings.surfaceOffset), normal: null };
  }
  let flat = is2DView() || inCanvas(comp), normal, origin, wp = comp.node.worldPosition;
  if (flat) {
    let r = comp.node.worldRotation, z = { x: 2 * (r.x * r.z + r.w * r.y), y: 2 * (r.y * r.z - r.w * r.x), z: 1 - 2 * (r.x * r.x + r.y * r.y) };
    normal = normalize(v3(), v3(z.x, z.y, z.z)), origin = v3(wp.x, wp.y, wp.z);
  } else {
    normal = v3(0, 1, 0);
    let n = comp.positions.length;
    origin = n ? pointWorld(comp, n - 1) : v3(wp.x, wp.y, wp.z);
  }
  let p = null;
  return Math.abs(dot(ray.d, normal)) > 0.02 && (p = rayPlane(ray, origin, normal)), p || (p = rayPlane(ray, origin, cameraForward(cam2), !0)), p ? { world: p, normal } : null;
}
function hasFlags(node, flags) {
  for (let n = node; n; n = n.parent) if (n._objFlags & flags) return !0;
  return !1;
}
function raycastScene(ray) {
  try {
    let { director, geometry, CCObject } = cc(), scene = director.getScene(), rs = scene == null ? void 0 : scene.renderScene;
    if (!rs) return null;
    let r = new geometry.Ray(ray.o.x, ray.o.y, ray.o.z, ray.d.x, ray.d.y, ray.d.z), hidden = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy, best = 1 / 0, opts = { mode: geometry.ERaycastMode.CLOSEST, distance: 1 / 0, doubleSided: !1 };
    for (let model of rs.models) {
      let node = model.node;
      if (!model.enabled || !node || !node.activeInHierarchy || node.scene !== scene || hasFlags(node, hidden) || S.target && node === S.target.node || model.worldBounds && !geometry.intersect.rayAABB(r, model.worldBounds)) continue;
      let d = geometry.intersect.rayModel(r, model, opts);
      d > 0 && d < best && (best = d);
    }
    return isFinite(best) ? scaleAndAdd(v3(), ray.o, ray.d, best) : null;
  } catch (e) {
    return note(`raycast: ${e}`), null;
  }
}
function drawCreatePreview(_cam) {
  let comp = S.target;
  if (S.mode !== "create" || !comp || !S.preview) return;
  disc(S.preview, 4, Colors.preview);
  let n = comp.positions.length;
  n && !active && line(pointWorld(comp, n - 1), S.preview, Colors.preview);
}
setExtraDrawer(drawCreatePreview);
function nearSelectedGizmo(cam2, x, y) {
  for (let uuid of selectedNodeUuids()) {
    let n = findNode(uuid);
    if (!n || !n.isValid) continue;
    let wp = n.worldPosition, sp = toScreen(cam2, v3(wp.x, wp.y, wp.z));
    if (sp.visible && Math.hypot(sp.x - x, sp.y - y) < GIZMO_RADIUS_PX) return !0;
  }
  return !1;
}
function onPickMouseDown(ev) {
  var _a2;
  if (!canEdit() || S.mode !== "none" || !(ev.button === 0 || ev.button === void 0 && ev.leftButton) || ev.altKey) return !0;
  let p = pointer(ev);
  if (!p || nearSelectedGizmo(p.cam, p.x, p.y)) return !0;
  let comp = pickLine(p.cam, p.x, p.y);
  if (!comp) return !0;
  if (comp === S.target)
    return ((_a2 = hitTest(p.cam, p.x, p.y, { handles: !1, segments: !1 })) == null ? void 0 : _a2.kind) === "point";
  S.diag.picks++;
  try {
    ev.shiftKey || ev.ctrlKey || ev.metaKey || Editor.Selection.clear("node"), Editor.Selection.select("node", comp.node.uuid);
  } catch (e) {
    note(`pick: ${e}`);
  }
  return !1;
}
function onKeyDown(ev) {
  if (!canEdit() || S.mode === "none" || !S.target) return !0;
  let key = String(ev.key || "").toLowerCase();
  try {
    switch (key) {
      case "escape":
        return active ? (cancelActive(), !1) : (S.mode === "edit" && S.selection.length ? setSelection([]) : setMode("none"), changed(), !1);
      case "enter":
        return S.mode === "create" ? (setMode("none"), !1) : !0;
      case "delete":
      case "backspace":
        return S.mode !== "edit" || !S.selection.length ? !0 : (deleteKey(), !1);
      case "a":
        return !(ev.ctrlKey || ev.metaKey) || ev.altKey ? !0 : (S.selectAllKeyAt = Date.now(), selectAll(), !1);
    }
  } catch (e) {
    note(`keydown: ${(e == null ? void 0 : e.stack) || e}`);
  }
  return !0;
}
function onKeyUp(_ev) {
  return !0;
}
function deleteKey() {
  let now2 = Date.now();
  now2 - S.deleteKeyAt < 150 || (S.deleteKeyAt = now2, deleteSelected());
}

// source/scene/guards.ts
var KEY_WINDOW_MS = 800, undo = [], installed = !1;
function isTyping(e) {
  let t = e.target, tag = t == null ? void 0 : t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || !!(t != null && t.isContentEditable);
}
function onKeyDownCapture(e) {
  if (!S.primary || S.mode !== "edit" || isTyping(e)) return;
  let k = e.key;
  (k === "Delete" || k === "Backspace") && S.selection.length && !e.ctrlKey && !e.metaKey ? (e.preventDefault(), e.stopImmediatePropagation(), deleteKey()) : (k === "a" || k === "A") && (e.ctrlKey || e.metaKey) && S.target && (S.selectAllKeyAt = Date.now());
}
function onBlur() {
  isDragging() && cancelActive();
}
function involvesTarget(options) {
  let ids = options == null ? void 0 : options.uuid, list = Array.isArray(ids) ? ids : typeof ids == "string" ? [ids] : [];
  return !list.length || !!S.target && list.includes(S.target.node.uuid);
}
function wrap(target, name, guard) {
  let orig = target == null ? void 0 : target[name];
  if (typeof orig != "function" || orig.__lineGuard) return;
  let wrapped = function(...args) {
    try {
      if (guard(args)) return;
    } catch (e) {
      note(`guard ${name}: ${e}`);
    }
    return orig.apply(this, args);
  };
  wrapped.__lineGuard = !0, target[name] = wrapped, undo.push(() => {
    target[name] === wrapped && (target[name] = orig);
  });
}
function installGuards() {
  if (installed) return;
  installed = !0, window.addEventListener("keydown", onKeyDownCapture, !0), window.addEventListener("blur", onBlur), undo.push(() => {
    window.removeEventListener("keydown", onKeyDownCapture, !0), window.removeEventListener("blur", onBlur);
  });
  let facade = cce().SceneFacadeManager, target = typeof facade == "function" ? facade.prototype : facade;
  target && (wrap(target, "removeNode", (args) => S.mode === "edit" && Date.now() - S.deleteKeyAt < KEY_WINDOW_MS && involvesTarget(args[0]) ? (note("Delete went to the selected points, not the node"), !0) : !1), wrap(target, "selectAllNodes", () => S.mode === "edit" && Date.now() - S.selectAllKeyAt < KEY_WINDOW_MS));
}
function uninstallGuards() {
  for (; undo.length; ) undo.pop()();
  installed = !1;
}
function guardsInfo() {
  var _a2, _b2;
  let facade = cce().SceneFacadeManager, target = typeof facade == "function" ? facade.prototype : facade;
  return {
    installed,
    facadeType: typeof facade,
    removeNodeGuarded: !!((_a2 = target == null ? void 0 : target.removeNode) != null && _a2.__lineGuard),
    selectAllGuarded: !!((_b2 = target == null ? void 0 : target.selectAllNodes) != null && _b2.__lineGuard)
  };
}

// source/scene/index.ts
var PKG = "line-renderer", BROADCAST_MS = 80, hooked = !1, opHooked = !1, listeners = [
  ["mousedown", onMouseDown, PRIORITY],
  ["mousemove", onMouseMove, PRIORITY],
  ["mouseup", onMouseUp, PRIORITY],
  ["dblclick", onDblClick, PRIORITY],
  ["keydown", onKeyDown, PRIORITY],
  ["keyup", onKeyUp, PRIORITY],
  ["mousedown", onPickMouseDown, PICK_PRIORITY]
];
function toolState() {
  var _a2;
  let comp = S.target;
  return {
    primary: S.primary,
    target: comp ? comp.uuid : null,
    mode: S.mode,
    selection: S.selection.slice(),
    count: comp ? comp.positions.length : 0,
    simplified: comp ? simplifyIndices(comp.positions, S.settings.tolerance, comp.loop).length : 0,
    settings: { ...S.settings },
    is2D: !!((_a2 = cce().Camera) != null && _a2.is2D)
  };
}
var lastSent = "", lastSentAt = 0, timer = null;
function maybeBroadcast(force = !1) {
  if (!S.primary) return;
  let now2 = Date.now(), wait = BROADCAST_MS - (now2 - lastSentAt);
  if (!force && wait > 0) {
    timer || (timer = setTimeout(() => {
      timer = null, maybeBroadcast();
    }, wait));
    return;
  }
  let state = toolState(), json = JSON.stringify(state);
  if (!(!force && json === lastSent)) {
    lastSent = json, lastSentAt = now2;
    try {
      Editor.Message.broadcast("line-renderer:state", state);
    } catch {
    }
  }
}
function onBeforeCommit() {
  try {
    drawFrame();
    let pending = S.target ? takePendingMode(S.target) : null;
    pending && pending !== "none" && setMode(pending), maybeBroadcast();
  } catch (e) {
    note(`draw: ${(e == null ? void 0 : e.stack) || e}`);
  }
}
function hook() {
  if (!hooked) {
    let { director, Director } = cc();
    director.on(Director.EVENT_BEFORE_COMMIT, onBeforeCommit), hooked = !0;
  }
  if (!opHooked) {
    let op = cce().Operation;
    if (op != null && op.addListener) {
      for (let [type, fn, priority] of listeners) op.addListener(type, fn, priority);
      opHooked = !0;
    }
  }
  installGuards(), S.hooked = hooked && opHooked;
}
function unhook() {
  try {
    if (hooked) {
      let { director, Director } = cc();
      director.off(Director.EVENT_BEFORE_COMMIT, onBeforeCommit);
    }
  } catch {
  }
  hooked = !1;
  try {
    let op = cce().Operation;
    if (opHooked && (op != null && op.removeListener)) for (let [type, fn] of listeners) op.removeListener(type, fn);
  } catch {
  }
  opHooked = !1, uninstallGuards();
}
function markPrimary() {
  S.primary || (S.primary = !0, bumpState()), hook();
}
async function loadSettings() {
  try {
    let saved = await Editor.Profile.getConfig(PKG, "settings");
    saved && typeof saved == "object" && (S.settings = { ...DEFAULT_SETTINGS, ...saved });
  } catch {
  }
}
async function saveSettings() {
  try {
    await Editor.Profile.setConfig(PKG, "settings", { ...S.settings }, "global");
  } catch {
  }
}
function focus(compUuid) {
  return updateTarget(), compUuid && (!S.target || S.target.uuid !== compUuid) ? null : S.target;
}
function now() {
  return maybeBroadcast(!0), repaint(), toolState();
}
var methods = {
  lrPrimary() {
    return markPrimary(), !0;
  },
  lrState(compUuid) {
    return markPrimary(), focus(compUuid), toolState();
  },
  lrSetMode(compUuid, mode) {
    return markPrimary(), focus(compUuid) ? (setMode(mode === "edit" || mode === "create" ? mode : "none"), now()) : toolState();
  },
  lrSetSetting(key, value) {
    return key in S.settings ? (S.settings[key] = value, saveSettings(), now()) : toolState();
  },
  async lrAction(compUuid, name, arg) {
    if (markPrimary(), !focus(compUuid)) return toolState();
    switch (name) {
      case "delete":
        await deleteSelected();
        break;
      case "subdivide":
        await subdivideSelected();
        break;
      case "selectAll":
        selectAll();
        break;
      case "clearSelection":
        setSelection([]);
        break;
      case "simplify":
        await simplifyLine(Number(arg ?? S.settings.tolerance));
        break;
    }
    return now();
  },
  async lrCreate(kind) {
    markPrimary();
    try {
      return await createLineNode(kind);
    } catch (e) {
      return note(`create: ${(e == null ? void 0 : e.stack) || e}`), console.error("[LineRenderer] Could not create the line:", e), null;
    }
  },
  /** Inspector: geometry info of a line. */
  lrInfo(compUuid) {
    let comp = findComponent(compUuid);
    return comp ? { points: comp.positions.length, length: Math.round(comp.getLength() * 1e3) / 1e3 } : null;
  },
  lrDiagnostics() {
    var _a2, _b2, _c;
    let cam2 = sceneCamera();
    return {
      primary: S.primary,
      hooked: S.hooked,
      runtimeReady: runtimeReady(),
      lineClass: !!lineClass(),
      mode: S.mode,
      target: ((_b2 = (_a2 = S.target) == null ? void 0 : _a2.node) == null ? void 0 : _b2.name) ?? null,
      selection: S.selection,
      settings: S.settings,
      lines: allLines().map((c2) => {
        var _a3;
        return `${(_a3 = c2.node) == null ? void 0 : _a3.name} (${c2.positions.length} points)`;
      }),
      camera: cam2 ? { name: cam2.name, width: cam2.width, height: cam2.height, projection: cam2.projectionType } : null,
      eventCoords: eventCoordMode(),
      operation: !!((_c = cce().Operation) != null && _c.addListener),
      guards: guardsInfo(),
      diag: S.diag
    };
  }
};
function load() {
  loadSettings();
  let tryHook = (n) => {
    try {
      if (hook(), S.hooked) return;
    } catch {
    }
    n > 0 && setTimeout(() => tryHook(n - 1), 1e3);
  };
  tryHook(30);
}
function unload() {
  cancelActive(), unhook(), removeOverlay(), S.mode = "none";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
