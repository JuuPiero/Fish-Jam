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
var import_path = require("path");
module.paths.push((0, import_path.join)(Editor.App.path, "node_modules"));
var ccModule = null;
function cc() {
  return ccModule || (ccModule = require("cc")), ccModule;
}
var cce = () => globalThis.cce || {};
function skeletonClass() {
  try {
    return cc().js.getClassByName("SkeletonAnimation") || null;
  } catch {
    return null;
  }
}
function allSkeletons() {
  let C = skeletonClass();
  if (!C || !C.all) return [];
  let scene = cc().director.getScene();
  return [...C.all].filter((c) => {
    var _a;
    return c && c.isValid && ((_a = c.node) == null ? void 0 : _a.isValid) && c.node.scene === scene;
  });
}
function repaint() {
  var _a, _b;
  try {
    (_b = (_a = cce().Engine) == null ? void 0 : _a.repaintInEditMode) == null || _b.call(_a);
  } catch {
  }
}
var lastCamera = null;
function sceneCamera() {
  try {
    let { director, renderer } = cc(), root = director.root;
    if (!root) return null;
    if (lastCamera && lastCamera.enabled && lastCamera.window === root.mainWindow && root.cameraList.includes(lastCamera)) return lastCamera;
    for (let cam of root.cameraList)
      if (cam.cameraUsage === renderer.scene.CameraUsage.SCENE_VIEW && cam.enabled && cam.window === root.mainWindow)
        return lastCamera = cam, cam;
  } catch {
  }
  return null;
}
var colors = null, tmp = [];
function v3() {
  return new (cc()).Vec3();
}
function drawBones(gr, comp) {
  let inst = comp.instance;
  if (!inst) return;
  let { Vec3 } = cc(), m = comp.node.worldMatrix;
  for (; tmp.length < 4; ) tmp.push(v3());
  let [a, b, c, d] = tmp, bones = inst.skeleton.bones;
  for (let i = 0; i < bones.length; i++) {
    let bone = bones[i];
    if (bone.active === !1) continue;
    let w = inst.boneWorld(bone), len = bone.data.length;
    Vec3.transformMat4(a, a.set(w.x, w.y, 0), m);
    let col = i === 0 ? colors.root : colors.bone;
    if (len > 0) {
      let tx = w.x + w.a * len, ty = w.y + w.c * len, nx = -w.c * len * 0.08, ny = w.a * len * 0.08, mx = w.x + w.a * len * 0.15, my = w.y + w.c * len * 0.15;
      Vec3.transformMat4(b, b.set(tx, ty, 0), m), Vec3.transformMat4(c, c.set(mx + nx, my + ny, 0), m), Vec3.transformMat4(d, d.set(mx - nx, my - ny, 0), m), gr.addLine(a, c, col, !1), gr.addLine(c, b, col, !1), gr.addLine(a, d, col, !1), gr.addLine(d, b, col, !1);
    } else
      Vec3.transformMat4(b, b.set(w.x - 2, w.y, 0), m), Vec3.transformMat4(c, c.set(w.x + 2, w.y, 0), m), gr.addLine(b, c, colors.tip, !1), Vec3.transformMat4(b, b.set(w.x, w.y - 2, 0), m), Vec3.transformMat4(c, c.set(w.x, w.y + 2, 0), m), gr.addLine(b, c, colors.tip, !1);
  }
}
function onBeforeCommit() {
  let list = allSkeletons().filter((c) => c.debugBones && c.enabledInHierarchy);
  if (!list.length) return;
  let cam = sceneCamera();
  if (!cam) return;
  !cam.geometryRenderer && cam.initGeometryRenderer && cam.initGeometryRenderer();
  let gr = cam.geometryRenderer;
  if (gr) {
    if (!colors) {
      let { Color } = cc();
      colors = { bone: new Color(255, 120, 40, 255), root: new Color(80, 220, 120, 255), tip: new Color(255, 220, 60, 255) };
    }
    for (let comp of list) drawBones(gr, comp);
  }
}
var hooked = !1;
function hook() {
  if (hooked) return !0;
  try {
    let { director, Director } = cc();
    director.on(Director.EVENT_BEFORE_COMMIT, onBeforeCommit), hooked = !0;
  } catch {
    hooked = !1;
  }
  return hooked;
}
function selectedNodeUuids() {
  var _a, _b;
  try {
    let ids = (_b = (_a = cce().Selection) == null ? void 0 : _a.query) == null ? void 0 : _b.call(_a);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}
function findNode(uuid) {
  var _a, _b, _c;
  try {
    return ((_c = (_b = (_a = globalThis.EditorExtends) == null ? void 0 : _a.Node) == null ? void 0 : _b.getNode) == null ? void 0 : _c.call(_b, uuid)) ?? null;
  } catch {
    return null;
  }
}
function inCanvas(node) {
  var _a;
  let { UITransform } = cc();
  for (let n = node; n; n = n.parent) if ((_a = n.getComponent) != null && _a.call(n, UITransform)) return !0;
  return !1;
}
function is2DView() {
  var _a;
  try {
    let c = cce().Camera;
    return typeof (c == null ? void 0 : c.is2D) == "boolean" ? c.is2D : !!((_a = cce().Gizmo) != null && _a.is2D);
  } catch {
    return !1;
  }
}
function loadAsset(uuid) {
  return new Promise((resolve) => cc().assetManager.loadAny({ uuid }, (err, asset) => resolve(err ? null : asset)));
}
async function createSkeleton(assetUuid) {
  var _a, _b, _c;
  let sel = selectedNodeUuids(), parentNode = sel.length ? findNode(sel[0]) : null, options = { name: "Spine" };
  parentNode && (options.parent = parentNode.uuid), (is2DView() || parentNode && inCanvas(parentNode)) && (options.canvasRequired = !0);
  let asset = null;
  assetUuid && (asset = await loadAsset(assetUuid), asset != null && asset.name && (options.name = asset.name.replace(/\.(json|skel)$/i, "")));
  let uuid = await Editor.Message.request("scene", "create-node", options);
  if (!uuid || typeof uuid != "string") return null;
  await Editor.Message.request("scene", "create-component", { uuid, component: "SkeletonAnimation" });
  let node = findNode(uuid), C = skeletonClass(), comp = node && C ? node.getComponent(C) : null;
  if (comp && asset) {
    let undo = null;
    try {
      undo = await Editor.Message.request("scene", "begin-recording", [node.uuid]);
    } catch {
      undo = null;
    }
    comp.skeletonData = asset;
    let info = comp.info;
    info && (info.skins.length > 1 && (comp.skin = info.skins[1]), info.animations.length && (comp.animation = info.animations[0].name)), inCanvas(node) && comp.fitUITransform();
    try {
      (_c = (_b = (_a = globalThis.EditorExtends) == null ? void 0 : _a.Node) == null ? void 0 : _b.emit) == null || _c.call(_b, "change", node.uuid, node);
    } catch {
    }
    undo && await Editor.Message.request("scene", "end-recording", undo).catch(() => {
    });
  }
  try {
    Editor.Selection.clear("node"), Editor.Selection.select("node", uuid);
  } catch {
  }
  return repaint(), uuid;
}
var methods = {
  spCreate(assetUuid) {
    return hook(), createSkeleton(assetUuid || null).catch((e) => (console.error("[Spine Plus] Could not create the skeleton:", e), null));
  },
  spDiagnostics() {
    return {
      hooked,
      runtime: !!skeletonClass(),
      camera: !!sceneCamera(),
      skeletons: allSkeletons().map((c) => {
        var _a, _b, _c, _d, _e, _f, _g;
        let info = c.info;
        return {
          node: (_a = c.node) == null ? void 0 : _a.name,
          data: ((_b = c.skeletonData) == null ? void 0 : _b.name) ?? null,
          error: c.loadError,
          runtime: c.runtimeVersion,
          exported: info == null ? void 0 : info.exported,
          skin: c.skin,
          animation: c.animation,
          physics: info == null ? void 0 : info.physics,
          usePhysics: c.usePhysics,
          playInEditor: c.playInEditor,
          material: ((_c = c.getSharedMaterial(0)) == null ? void 0 : _c.name) ?? null,
          vertices: (_d = c.mesh) == null ? void 0 : _d.vertexCount,
          batches: (_e = c.getEditorInfo) == null ? void 0 : _e.call(c).batches,
          uiRenderer: (_f = c.getEditorInfo) == null ? void 0 : _f.call(c).uiRenderer,
          inCanvas: (_g = c.getEditorInfo) == null ? void 0 : _g.call(c).inCanvas
        };
      })
    };
  }
};
function load() {
  let tryHook = (n) => {
    hook() || n <= 0 || setTimeout(() => tryHook(n - 1), 1e3);
  };
  tryHook(30);
}
function unload() {
  try {
    if (hooked) {
      let { director, Director } = cc();
      director.off(Director.EVENT_BEFORE_COMMIT, onBeforeCommit);
    }
  } catch {
  }
  hooked = !1;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
