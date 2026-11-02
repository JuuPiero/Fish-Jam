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

// source/inspector/skeleton-animation.ts
var skeleton_animation_exports = {};
__export(skeleton_animation_exports, {
  $: () => $,
  close: () => close,
  ready: () => ready,
  style: () => style,
  template: () => template,
  update: () => update
});
module.exports = __toCommonJS(skeleton_animation_exports);

// source/inspector/shared.ts
function sceneTarget(ctx) {
  var _a, _b;
  let el = ctx.$this;
  for (; el; ) {
    if ((_a = el.messageProtocol) != null && _a.scene) return el.messageProtocol.scene;
    el = el.parentElement || ((_b = el.getRootNode) == null ? void 0 : _b.call(el).host);
  }
  return "scene";
}
function componentUuids(dump) {
  var _a;
  let u = (_a = dump == null ? void 0 : dump.value) == null ? void 0 : _a.uuid;
  return u ? Array.isArray(u.values) && u.values.length ? u.values : [u.value] : [];
}
function nodeUuids(dump) {
  var _a;
  let n = (_a = dump == null ? void 0 : dump.value) == null ? void 0 : _a.node;
  return ((n == null ? void 0 : n.values) ?? (n != null && n.value ? [n.value] : [])).map((v) => typeof v == "string" ? v : v == null ? void 0 : v.uuid).filter(Boolean);
}
async function callComponent(ctx, name, args = [], undoable = !0) {
  let target = sceneTarget(ctx), uuids = componentUuids(ctx.dump), undoId = null;
  if (undoable)
    try {
      undoId = await Editor.Message.request(target, "begin-recording", uuids);
    } catch {
      undoId = null;
    }
  let results = [];
  try {
    for (let uuid of uuids)
      results.push(await Editor.Message.request(target, "execute-component-method", { uuid, name, args }));
  } finally {
    undoId && await Editor.Message.request(target, "end-recording", undoId).catch(() => {
    });
  }
  return results;
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
var BASE_STYLE = `
.sp-section { margin: 6px 0 4px; padding: 6px; border: 1px solid var(--color-normal-border, rgba(255,255,255,0.08)); border-radius: 3px; }
.sp-bar { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.sp-bar > ui-button { flex: 1; min-width: 70px; }
.sp-note { color: var(--color-normal-contrast-weaker, #aaa); font-size: 11px; margin: 4px 0; line-height: 1.4; }
.sp-warn { color: var(--color-warn-fill, #d9a33a); font-size: 11px; margin: 4px 0; }
.sp-flex { flex: 1; }
`;

// source/inspector/skeleton-animation.ts
var template = (
  /* html */
  `
<div class="spa-inspector">
    <div class="sp-section">
        <div class="spa-status"></div>
        <div class="sp-warn spa-warn"></div>
        <div class="sp-bar">
            <ui-button class="preview" title="Open the Spine Preview panel on this skeleton">Preview</ui-button>
            <ui-button class="restart" title="Reload the data and restart the animation">Restart</ui-button>
            <ui-button class="reset" title="Put physics at rest">Reset Physics</ui-button>
            <ui-button class="fit" title="Size the UITransform to the skeleton">Fit UITransform</ui-button>
        </div>
    </div>
    <div class="spa-top"></div>
    <div class="props"></div>
</div>
`
), style = BASE_STYLE + /* css */
`
.spa-status { font-size: 11px; margin: 0 0 6px; line-height: 1.5; color: var(--color-normal-contrast-weaker, #aaa); }
.spa-status.error { color: var(--color-danger-fill, #e5674f); }
.spa-warn:empty { display: none; }
.spa-warn ui-button { margin-left: 6px; }
.spa-hidden { display: none; }
`, $ = {
  status: ".spa-status",
  warn: ".spa-warn",
  preview: ".preview",
  restart: ".restart",
  reset: ".reset",
  fit: ".fit",
  top: ".spa-top",
  props: ".props"
};
function writeDump(el, value) {
  let info = el == null ? void 0 : el.dump;
  info && (info.value = value, Array.isArray(info.values) && (info.values = info.values.map(() => value)), el.dispatch("change-dump"), el.dispatch("confirm-dump"));
}
function pickerRow(label, tooltip) {
  let select = h("ui-select", { slot: "content" });
  return { row: h("ui-prop", { tooltip }, [h("ui-label", { slot: "label", value: label }), select]), select };
}
function setOptions(select, values, current) {
  let key = JSON.stringify(values);
  if (select.__key !== key) {
    select.__key = key, select.innerHTML = "";
    for (let v of values) {
      let o = document.createElement("option");
      o.value = v.value, o.textContent = v.label, select.appendChild(o);
    }
  }
  select.value = current;
}
function buildTop(ctx) {
  if (ctx.top) return;
  let data = document.createElement("ui-prop");
  data.setAttribute("type", "dump");
  let skin = pickerRow("Skin", "Skin to show"), anim = pickerRow("Animation", "Animation on track 0 when the skeleton starts"), loop = document.createElement("ui-prop");
  loop.setAttribute("type", "dump");
  let skinDump = document.createElement("ui-prop");
  skinDump.setAttribute("type", "dump"), skinDump.className = "spa-hidden";
  let animDump = document.createElement("ui-prop");
  animDump.setAttribute("type", "dump"), animDump.className = "spa-hidden", skin.select.addEventListener("change", (e) => writeDump(skinDump, e.target.value === "<default>" ? "" : e.target.value)), anim.select.addEventListener("change", (e) => writeDump(animDump, e.target.value === "<none>" ? "" : e.target.value)), ctx.$.top.append(data, skin.row, anim.row, loop, skinDump, animDump), ctx.top = { data, skin: skin.row, skinSelect: skin.select, anim: anim.row, animSelect: anim.select, loop, skinDump, animDump };
}
function drawTop(ctx) {
  var _a, _b, _c, _d;
  buildTop(ctx);
  let t = ctx.top, v = ((_a = ctx.dump) == null ? void 0 : _a.value) || {};
  v.skeletonData && t.data.render(v.skeletonData), v.loop && t.loop.render(v.loop), v.skin && t.skinDump.render(v.skin), v.animation && t.animDump.render(v.animation);
  let info = (_b = ctx.editorInfo) == null ? void 0 : _b.info, skin = ((_c = v.skin) == null ? void 0 : _c.value) ?? "", anim = ((_d = v.animation) == null ? void 0 : _d.value) ?? "", skins = info ? info.skins : [], anims = info ? info.animations.map((a) => a.name) : [], skinOptions = skins.map((s) => ({ value: s === "default" ? "<default>" : s, label: s }));
  skins.includes("default") || skinOptions.unshift({ value: "<default>", label: "default" }), skin && !skins.includes(skin) && skinOptions.push({ value: skin, label: `${skin} (missing)` }), setOptions(t.skinSelect, skinOptions, skin && skin !== "default" ? skin : "<default>");
  let animOptions = [{ value: "<none>", label: "<None> (setup pose)" }, ...anims.map((a) => ({ value: a, label: a }))];
  anim && !anims.includes(anim) && animOptions.push({ value: anim, label: `${anim} (missing)` }), setOptions(t.animSelect, animOptions, anim || "<none>");
  let multi = componentUuids(ctx.dump).length > 1;
  t.skinSelect.disabled = !info || multi, t.animSelect.disabled = !info || multi;
}
function drawStatus(ctx) {
  var _a, _b, _c, _d;
  let e = ctx.editorInfo, status = ctx.$.status, warn = ctx.$.warn;
  status.classList.remove("error"), warn.textContent = "";
  let multi = componentUuids(ctx.dump).length > 1;
  if (!e)
    status.textContent = multi ? "Several skeletons selected." : "";
  else if (e.error)
    status.textContent = e.error, status.classList.add("error");
  else if (!e.hasData)
    status.textContent = "Assign a Spine export (.json or .skel with its atlas) to Skeleton Data. Spine 4.2 and 4.3 are supported.";
  else if (e.info) {
    let i = e.info;
    status.textContent = `Spine ${i.exported || "?"} \xB7 ${i.runtime} runtime \xB7 ${i.bones} bones \xB7 ${i.slots} slots \xB7 ${i.physics} physics \xB7 ${e.batches} batch${e.batches === 1 ? "" : "es"} \xB7 ${e.vertices} vertices${i.pma ? " \xB7 PMA" : ""}`;
  }
  e != null && e.overflow && warn.appendChild(document.createTextNode("More than 65535 vertices: the rest is not drawn.")), e && e.inCanvas && !e.uiRenderer && (warn.appendChild(document.createTextNode("In a Canvas: add a SkeletonUIRenderer to draw in the UI with sprites.")), warn.appendChild(h("ui-button", { class: "tiny", onclick: () => addUIRenderer(ctx) }, ["Add"]))), ctx.$.fit.disabled = !(e != null && e.inCanvas) || !(e != null && e.info), ctx.$.preview.disabled = !((_d = (_c = (_b = (_a = ctx.dump) == null ? void 0 : _a.value) == null ? void 0 : _b.skeletonData) == null ? void 0 : _c.value) != null && _d.uuid);
}
async function addUIRenderer(ctx) {
  for (let uuid of nodeUuids(ctx.dump))
    await Editor.Message.request("scene", "create-component", { uuid, component: "SkeletonUIRenderer" }).catch(() => {
    });
  schedule(ctx, 100);
}
async function refresh(ctx) {
  if (componentUuids(ctx.dump).length)
    try {
      let [info] = await callComponent(ctx, "getEditorInfo", [], !1);
      ctx.editorInfo = info || null;
    } catch {
      ctx.editorInfo = null;
    }
  else
    ctx.editorInfo = null;
  drawStatus(ctx), drawTop(ctx);
}
function schedule(ctx, delay = 30) {
  clearTimeout(ctx.timer), ctx.timer = setTimeout(() => refresh(ctx), delay);
}
function ready() {
  this.editorInfo = null, this.$.preview.addEventListener("click", () => {
    var _a, _b, _c, _d;
    let uuid = (_d = (_c = (_b = (_a = this.dump) == null ? void 0 : _a.value) == null ? void 0 : _b.skeletonData) == null ? void 0 : _c.value) == null ? void 0 : _d.uuid;
    uuid && Editor.Message.send("spine-plus", "open-preview", uuid);
  }), this.$.restart.addEventListener("click", async () => {
    await callComponent(this, "reload", [], !1), schedule(this, 50);
  }), this.$.reset.addEventListener("click", () => callComponent(this, "resetPhysics", [], !1)), this.$.fit.addEventListener("click", async () => {
    let nodes = nodeUuids(this.dump), undo = null;
    try {
      undo = await Editor.Message.request("scene", "begin-recording", nodes);
    } catch {
      undo = null;
    }
    await callComponent(this, "fitUITransform", [], !1), undo && await Editor.Message.request("scene", "end-recording", undo).catch(() => {
    });
  });
}
function update(dump) {
  this.dump = dump, drawTop(this), renderProps(this, this.$.props, dump, ["skeletonData", "skin", "animation", "loop"]), schedule(this, 60);
}
function close() {
  clearTimeout(this.timer);
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
//# sourceMappingURL=skeleton-animation.js.map
