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

// source/inspector/line-renderer.ts
var line_renderer_exports = {};
__export(line_renderer_exports, {
  $: () => $,
  close: () => close,
  ready: () => ready,
  style: () => style,
  template: () => template,
  update: () => update
});
module.exports = __toCommonJS(line_renderer_exports);

// source/inspector/shared.ts
function callScene(method, ...args) {
  return Editor.Message.request("scene", "execute-scene-script", { name: "line-renderer", method, args });
}
function componentUuids(dump) {
  var _a;
  let u = (_a = dump == null ? void 0 : dump.value) == null ? void 0 : _a.uuid;
  return u ? Array.isArray(u.values) && u.values.length ? u.values : [u.value] : [];
}
function h(tag, attrs = {}, children = []) {
  let el = document.createElement(tag);
  for (let [k, v] of Object.entries(attrs))
    v == null || v === !1 || (k.startsWith("on") && typeof v == "function" ? el.addEventListener(k.slice(2).toLowerCase(), v) : k === "class" ? el.className = v : k === "style" && typeof v == "object" ? Object.assign(el.style, v) : k === "value" || k === "checked" || k === "disabled" ? el[k] = v : el.setAttribute(k, v === !0 ? "" : String(v)));
  for (let c of children)
    c == null || c === !1 || el.appendChild(typeof c == "string" ? document.createTextNode(c) : c);
  return el;
}
function renderProps(ctx, container, dump, skip = []) {
  let props = ctx.__props ||= {}, keys = Object.keys((dump == null ? void 0 : dump.value) || {}).filter((k) => dump.value[k] && dump.value[k].visible && !skip.includes(k)).map((k, i) => {
    var _a;
    let info = dump.value[k], order = ((_a = info.group) == null ? void 0 : _a.displayOrder) ?? info.displayOrder;
    return { k, order: order === void 0 ? i : Number(order), i };
  }).sort((a, b) => a.order - b.order || a.i - b.i).map((x) => x.k);
  for (let k of Object.keys(props))
    keys.includes(k) || (props[k].remove(), delete props[k]);
  let prev = null;
  for (let k of keys) {
    let el = props[k];
    el || (el = props[k] = document.createElement("ui-prop"), el.setAttribute("type", "dump"));
    let want = prev ? prev.nextElementSibling : container.firstElementChild;
    want !== el && container.insertBefore(el, want), el.render(dump.value[k]), prev = el;
  }
}
function isEditing(el) {
  let active = el.getRootNode().activeElement;
  return !!active && el.contains(active);
}
var BASE_STYLE = `
.sp-section { margin: 6px 0 4px; padding: 6px; border: 1px solid var(--color-normal-border, rgba(255,255,255,0.08)); border-radius: 3px; }
.sp-bar { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.sp-bar > ui-button { flex: 1; min-width: 70px; }
.sp-note { color: var(--color-normal-contrast-weaker, #aaa); font-size: 11px; margin: 4px 0; line-height: 1.4; }
.sp-warn { color: var(--color-warn-fill, #d9a33a); font-size: 11px; margin: 4px 0; }
.sp-flex { flex: 1; }
`;

// source/shared/broadcast.ts
function api() {
  let msg = Editor.Message, target = typeof msg.addBroadcastListener == "function" ? msg : msg.__protected__;
  return !target || typeof target.addBroadcastListener != "function" ? null : {
    add: (m, f) => target.addBroadcastListener(m, f),
    remove: (m, f) => target.removeBroadcastListener(m, f)
  };
}
function onBroadcast(messages, fn) {
  let a = api();
  if (!a) return () => {
  };
  let list = Array.isArray(messages) ? messages : [messages];
  for (let m of list) a.add(m, fn);
  return () => {
    for (let m of list) a.remove(m, fn);
  };
}

// source/inspector/line-renderer.ts
var template = (
  /* html */
  `
<div class="lr-inspector">
    <div class="sp-section tools">
        <div class="sp-bar">
            <ui-button class="edit" title="Select and move points in the Scene view">Edit Points</ui-button>
            <ui-button class="create" title="Click or drag in the Scene view to add points">Create Points</ui-button>
        </div>
        <div class="sp-note status"></div>
        <div class="options"></div>
    </div>
    <div class="props"></div>
</div>
`
), style = BASE_STYLE + /* css */
`
.lr-row { display: flex; align-items: center; gap: 6px; min-height: 24px; }
.lr-row > span { width: 120px; flex: none; color: var(--color-normal-contrast-weaker, #aaa); }
.lr-row > ui-num-input, .lr-row > ui-select { flex: 1; min-width: 0; }
.lr-sub { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-normal-border, rgba(255,255,255,0.08)); }
.lr-keys { color: var(--color-normal-contrast-weaker, #999); font-size: 11px; line-height: 1.5; margin-top: 4px; }
`, $ = {
  edit: ".edit",
  create: ".create",
  status: ".status",
  options: ".options",
  props: ".props"
};
function uuid(ctx) {
  let ids = componentUuids(ctx.dump);
  return ids.length === 1 ? ids[0] : null;
}
async function refresh(ctx) {
  let id = uuid(ctx);
  if (!id) {
    ctx.state = null, draw(ctx);
    return;
  }
  try {
    let [state, info] = await Promise.all([callScene("lrState", id), callScene("lrInfo", id)]);
    ctx.state = state, ctx.info = info;
  } catch {
    ctx.state = null;
  }
  draw(ctx);
}
function schedule(ctx, delay = 30) {
  clearTimeout(ctx.timer), ctx.timer = setTimeout(() => refresh(ctx), delay);
}
async function call(ctx, method, ...args) {
  try {
    let s = await callScene(method, ...args);
    s && typeof s == "object" && "mode" in s && (ctx.state = s);
  } catch (e) {
    console.warn("[LineRenderer]", e);
  }
  schedule(ctx, 0);
}
function num(value, onConfirm, step = 0.1, min = 0) {
  let el = h("ui-num-input", { step: String(step), min: String(min) });
  return el.value = value, el.addEventListener("confirm", (e) => {
    let v = Number(e.target.value);
    isFinite(v) && onConfirm(v);
  }), el;
}
function row(label, control, title) {
  return h("div", { class: "lr-row", title }, [h("span", {}, [label]), control]);
}
function draw(ctx) {
  let s = ctx.state, id = uuid(ctx), mine = !!s && !!id && s.target === id, mode = mine ? s.mode : "none", edit = ctx.$.edit, create = ctx.$.create;
  edit.classList.toggle("blue", mode === "edit"), create.classList.toggle("blue", mode === "create"), edit.disabled = !id, create.disabled = !id;
  let info = ctx.info, status = id ? info ? `${info.points} points \xB7 length ${info.length}` : "" : "Select a single node to edit its points.";
  id && s && !mine && (status += " \xB7 select this node to use the tools"), mode === "edit" && s && (status += s.selection.length ? ` \xB7 ${s.selection.length} selected` : " \xB7 click points, drag a rectangle"), mode === "create" && (status += " \xB7 click or drag in the Scene view, Esc to stop"), ctx.$.status.textContent = status;
  let root = ctx.$.options;
  if (isEditing(root)) {
    ctx.pending = !0;
    return;
  }
  if (ctx.pending = !1, root.textContent = "", !s || !id) return;
  let set = (key, value) => call(ctx, "lrSetSetting", key, value);
  if (mode === "edit" && (root.appendChild(h("div", { class: "sp-bar" }, [
    h("ui-button", { class: "tiny", disabled: !s.selection.length, title: "Add a point in the middle of each segment between selected points", onclick: () => call(ctx, "lrAction", id, "subdivide") }, ["Subdivide Selected"]),
    h("ui-button", { class: "tiny", onclick: () => call(ctx, "lrAction", id, "selectAll") }, ["Select All"]),
    h("ui-button", { class: "tiny red", disabled: !s.selection.length, onclick: () => call(ctx, "lrAction", id, "delete") }, ["Delete"])
  ])), root.appendChild(h("div", { class: "lr-keys" }, [
    "Click / Shift+click points \xB7 drag to move (Ctrl: snap) \xB7 W / E / R handles \xB7 double-click a segment to insert \xB7 Delete \xB7 Ctrl+A \xB7 Esc"
  ]))), mode === "create") {
    let input = h("ui-select", {}, [
      h("option", { value: "plane" }, [s.is2D ? "Plane (node XY)" : "Plane (ground)"]),
      h("option", { value: "view" }, ["Camera Distance"]),
      h("option", { value: "surface" }, ["Surfaces"])
    ]);
    input.value = s.settings.inputMode, input.addEventListener("change", (e) => set("inputMode", e.target.value)), root.appendChild(row("Input", input, "Where new points go")), root.appendChild(row("Min Vertex Distance", num(s.settings.minVertexDistance, (v) => set("minVertexDistance", v), 0.01), "Dragging adds a point every this distance")), s.settings.inputMode === "view" ? root.appendChild(row("Offset", num(s.settings.viewDistance, (v) => set("viewDistance", v), 0.5), "Distance from the camera")) : s.settings.inputMode === "surface" && root.appendChild(row("Offset", num(s.settings.surfaceOffset, (v) => set("surfaceOffset", v), 0.01), "Lift off the surface towards the camera"));
  }
  let simp = h("div", { class: "lr-sub" }), preview = h("ui-checkbox", {}, ["Simplify Preview"]);
  preview.value = s.settings.simplifyPreview, preview.addEventListener("change", (e) => set("simplifyPreview", !!e.target.value)), simp.appendChild(h("div", { class: "lr-row" }, [preview])), simp.appendChild(row("Tolerance", num(s.settings.tolerance, (v) => set("tolerance", v), 0.01), "Points closer than this to the simplified line are removed")), simp.appendChild(h("div", { class: "sp-bar" }, [
    h("ui-button", { title: `Remove points (${s.count} \u2192 ${s.simplified})`, disabled: !mine || s.simplified >= s.count, onclick: () => call(ctx, "lrAction", id, "simplify", s.settings.tolerance) }, [`Simplify (${s.count} \u2192 ${s.simplified})`])
  ])), root.appendChild(simp);
}
async function selectThisNode(ctx) {
  var _a, _b, _c, _d, _e, _f, _g;
  let node = ((_d = (_c = (_b = (_a = ctx.dump) == null ? void 0 : _a.value) == null ? void 0 : _b.node) == null ? void 0 : _c.value) == null ? void 0 : _d.uuid) ?? ((_g = (_f = (_e = ctx.dump) == null ? void 0 : _e.value) == null ? void 0 : _f.node) == null ? void 0 : _g.value), nodeUuid = typeof node == "string" ? node : null;
  if (nodeUuid)
    try {
      Editor.Selection.getSelected("node").includes(nodeUuid) || (Editor.Selection.clear("node"), Editor.Selection.select("node", nodeUuid), await new Promise((r) => setTimeout(r, 80)));
    } catch {
    }
}
function ready() {
  this.state = null, this.info = null;
  let toggle = async (mode) => {
    var _a;
    let id = uuid(this);
    if (!id) return;
    let current = ((_a = this.state) == null ? void 0 : _a.target) === id ? this.state.mode : "none";
    await selectThisNode(this), call(this, "lrSetMode", id, current === mode ? "none" : mode);
  };
  this.$.edit.addEventListener("click", () => toggle("edit")), this.$.create.addEventListener("click", () => toggle("create")), this.off = onBroadcast("line-renderer:state", () => schedule(this, 40)), this.$.options.addEventListener("focusout", () => {
    this.pending && setTimeout(() => draw(this), 0);
  });
}
function update(dump) {
  this.dump = dump, renderProps(this, this.$.props, dump), schedule(this);
}
function close() {
  var _a;
  clearTimeout(this.timer), (_a = this.off) == null || _a.call(this);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  $,
  close,
  ready,
  style,
  template,
  update
});
//# sourceMappingURL=line-renderer.js.map
