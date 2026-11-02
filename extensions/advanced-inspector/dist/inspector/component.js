"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// source/inspector/component.ts
var component_exports = {};
__export(component_exports, {
  $: () => $,
  close: () => close,
  mountInspector: () => mountInspector,
  ready: () => ready,
  style: () => style2,
  template: () => template,
  update: () => update
});
module.exports = __toCommonJS(component_exports);

// source/inspector/logic.ts
function nicify(name) {
  let s = (name || "").trim().replace(/^_+/, "");
  s = s.replace(/^\S/, (c) => c.toUpperCase());
  s = s.replace(/_/g, " ");
  s = s.replace(/ \S/g, (c) => ` ${c.toUpperCase()}`);
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}
function lastSegment(path) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}
function inspectedMembers(meta, dump) {
  return ((meta == null ? void 0 : meta.members) || []).filter((m) => {
    var _a;
    return m.showInInspector && m.kind === "field" && !((_a = dump.value) == null ? void 0 : _a[m.name]);
  });
}
function ccGroupRef(prop, dump) {
  var _a, _b;
  const g = prop.group;
  if (!g || !g.name) return void 0;
  const id = g.id || "default";
  const style3 = g.style || ((_b = (_a = dump.groups) == null ? void 0 : _a[id]) == null ? void 0 : _b.style) || "tab";
  const name = String(g.name).replace(/\//g, " ");
  if (style3 === "section") return { kind: "foldout", path: `#${id}:${name}`, label: name, expanded: true };
  return { kind: "tab", path: `#${id}`, tab: name };
}
function toDef(path, ref, fallbackKind) {
  const kind = (ref == null ? void 0 : ref.kind) ?? fallbackKind;
  return {
    kind,
    path,
    label: (ref == null ? void 0 : ref.label) ?? nicify(lastSegment(path)),
    showLabel: (ref == null ? void 0 : ref.showLabel) ?? !path.startsWith("#"),
    expanded: (ref == null ? void 0 : ref.expanded) ?? false
  };
}
function buildLayout(dump, meta) {
  const metaByName = /* @__PURE__ */ new Map();
  for (const m of (meta == null ? void 0 : meta.members) || []) metaByName.set(m.name, m);
  const keys = Object.keys(dump.value || {});
  const keyIndex = new Map(keys.map((k, i) => [k, i]));
  const entries = [];
  let seq = 0;
  keys.forEach((key, i) => {
    const prop = dump.value[key];
    if (!prop || !prop.visible) return;
    const m = metaByName.get(key);
    entries.push({
      key,
      isMethod: false,
      isInspected: false,
      meta: m,
      group: (m == null ? void 0 : m.group) ?? ccGroupRef(prop, dump),
      order: (m == null ? void 0 : m.order) ?? 0,
      base: typeof prop.displayOrder === "number" ? prop.displayOrder : i,
      seq: seq++
    });
  });
  const perAnchor = /* @__PURE__ */ new Map();
  let head = 0;
  let tail = 0;
  const inspected = new Set(inspectedMembers(meta, dump));
  for (const m of (meta == null ? void 0 : meta.members) || []) {
    const isButton = m.kind === "method" && !!m.button;
    if (!isButton && !inspected.has(m)) continue;
    let base;
    if (m.anchor === null) {
      base = -1 + (head++ + 1) * 1e-4;
    } else if (typeof m.anchor === "string" && keyIndex.has(m.anchor)) {
      const n = (perAnchor.get(m.anchor) || 0) + 1;
      perAnchor.set(m.anchor, n);
      const anchorProp = dump.value[m.anchor];
      const anchorBase = typeof (anchorProp == null ? void 0 : anchorProp.displayOrder) === "number" ? anchorProp.displayOrder : keyIndex.get(m.anchor);
      base = anchorBase + n * 1e-4;
    } else {
      base = keys.length + tail++;
    }
    entries.push({ key: m.name, isMethod: isButton, isInspected: !isButton, meta: m, group: m.group, order: m.order ?? 0, base, seq: seq++ });
  }
  entries.sort((a, b) => a.order - b.order || a.base - b.base || a.seq - b.seq);
  const defs = /* @__PURE__ */ new Map();
  for (const e of entries) if (e.group && !defs.has(e.group.path)) defs.set(e.group.path, e.group);
  const root = [];
  const groups = /* @__PURE__ */ new Map();
  const getGroup = (path, parent, leafKind) => {
    let g = groups.get(path);
    if (g) return g;
    const fallback = leafKind === "foldout" ? "foldout" : "box";
    g = { kind: "group", id: `g:${path}`, def: toDef(path, defs.get(path), fallback), children: [], tabs: [] };
    groups.set(path, g);
    parent.push(g);
    return g;
  };
  const tabChildren = (g, name) => {
    let t = g.tabs.find((x) => x.name === name);
    if (!t) {
      t = { name, children: [] };
      g.tabs.push(t);
    }
    return t.children;
  };
  const containerFor = (ref) => {
    var _a;
    const segs = ref.path.split("/").filter(Boolean);
    let container = root;
    let prefix = "";
    for (let i = 0; i < segs.length; i++) {
      prefix = prefix ? `${prefix}/${segs[i]}` : segs[i];
      const g = getGroup(prefix, container, ref.kind);
      if (g.def.kind === "tab") {
        if (i + 1 < segs.length) {
          i++;
          prefix = `${prefix}/${segs[i]}`;
          container = tabChildren(g, segs[i]);
        } else {
          container = tabChildren(g, ref.tab ?? ((_a = g.tabs[0]) == null ? void 0 : _a.name) ?? "Tab");
        }
      } else {
        container = g.children;
      }
    }
    return container;
  };
  for (const e of entries) {
    const prefix = e.isMethod ? "m" : e.isInspected ? "s" : "f";
    const item = { kind: "item", id: `${prefix}:${e.key}`, key: e.key, isMethod: e.isMethod, isInspected: e.isInspected, meta: e.meta };
    (e.group ? containerFor(e.group) : root).push(item);
  }
  return root;
}
function dumpPlain(prop) {
  if (!prop) return void 0;
  const v = prop.value;
  if (prop.isArray) return Array.isArray(v) ? v.length : 0;
  if (v === null || v === void 0) return null;
  if (typeof v !== "object") return v;
  if ("uuid" in v) return v.uuid ? true : null;
  return true;
}
function splitNot(member) {
  const not = member.startsWith("!");
  return { name: (not ? member.slice(1) : member).trim(), not };
}
function readMember(name, dump, remote) {
  var _a, _b;
  const prop = (_a = dump.value) == null ? void 0 : _a[name];
  if (prop) return dumpPlain(prop);
  return (_b = remote == null ? void 0 : remote.values) == null ? void 0 : _b[name];
}
function looseEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === void 0 || b === void 0) return false;
  if (typeof a === "object" || typeof b === "object") return false;
  return String(a) === String(b);
}
function testCondition(c, dump, remote) {
  const { name, not } = splitNot(c.member);
  const v = readMember(name, dump, remote);
  const result = c.values && c.values.length ? c.values.some((x) => looseEqual(x, v)) : !!v;
  return not ? !result : result;
}
function memberState(m, dump, remote) {
  if (!m) return { hidden: false, disabled: false };
  const playing = !!(remote == null ? void 0 : remote.playing);
  const all = (cs) => !cs || cs.every((c) => testCondition(c, dump, remote));
  const any = (cs) => !!cs && cs.some((c) => testCondition(c, dump, remote));
  const hidden = !all(m.showIf) || any(m.hideIf) || !!m.hideInPlayMode && playing || !!m.hideInEditMode && !playing;
  const disabled = !!m.readOnly || !all(m.enableIf) || any(m.disableIf) || !!m.disableInPlayMode && playing || !!m.disableInEditMode && !playing;
  return { hidden, disabled };
}
function isEmptyValue(prop) {
  if (!prop) return false;
  const v = prop.value;
  if (prop.isArray) return false;
  if (v === null || v === void 0 || v === "") return true;
  if (typeof v === "object" && "uuid" in v) return !v.uuid;
  return false;
}
function buildEvalRequest(meta, dump) {
  var _a, _b, _c;
  const members = /* @__PURE__ */ new Set();
  const lists = /* @__PURE__ */ new Set();
  const validate = [];
  let playFlags = false;
  const need = (member) => {
    var _a2;
    if (!member) return;
    const { name } = splitNot(member);
    if (name && !((_a2 = dump.value) == null ? void 0 : _a2[name])) members.add(name);
  };
  for (const m of meta.members) {
    for (const c of [...m.showIf || [], ...m.hideIf || [], ...m.enableIf || [], ...m.disableIf || []]) need(c.member);
    for (const box of m.infoBoxes || []) need((_a = box.visibleIf) == null ? void 0 : _a.member);
    if (m.progressBar) {
      if (typeof m.progressBar.min === "string") need(m.progressBar.min);
      if (typeof m.progressBar.max === "string") need(m.progressBar.max);
    }
    if ((_b = m.dropdown) == null ? void 0 : _b.member) lists.add(m.dropdown.member);
    if (m.validate && m.kind === "field" && ((_c = dump.value) == null ? void 0 : _c[m.name])) validate.push({ method: m.validate.method, member: m.name });
    if (m.hideInPlayMode || m.hideInEditMode || m.disableInPlayMode || m.disableInEditMode) playFlags = true;
  }
  const inspect = inspectedMembers(meta, dump).map((m) => m.name);
  const request2 = { members: [...members], validate, lists: [...lists], inspect };
  return { request: request2, needed: playFlags || members.size > 0 || lists.size > 0 || validate.length > 0 || inspect.length > 0 };
}
function validationFor(member, request2, remote) {
  var _a;
  if (!remote) return void 0;
  const i = (request2.validate || []).findIndex((v) => v.member === member);
  return i < 0 ? void 0 : (_a = remote.validations) == null ? void 0 : _a[i];
}
function numberFrom(v, dump, remote, fallback) {
  if (typeof v === "number") return v;
  const r = Number(readMember(v, dump, remote));
  return Number.isFinite(r) ? r : fallback;
}
function dropdownItems(m, remote) {
  var _a, _b, _c;
  if ((_a = m.dropdown) == null ? void 0 : _a.items) return m.dropdown.items;
  if ((_b = m.dropdown) == null ? void 0 : _b.member) return ((_c = remote == null ? void 0 : remote.lists) == null ? void 0 : _c[m.dropdown.member]) || [];
  return [];
}
function valueSignature(prop) {
  if (!prop) return "";
  try {
    return JSON.stringify([prop.value, prop.values]);
  } catch {
    return String(prop.value);
  }
}

// source/inspector/controls.ts
function h(tag, cls, attrs) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function syncChildren(container, els) {
  els.forEach((el, i) => {
    const at = container.children[i] || null;
    if (at !== el) container.insertBefore(el, at);
  });
  while (container.children.length > els.length) container.lastElementChild.remove();
}
function isFocused(el) {
  return el.matches(":focus, :focus-within");
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function rgba(c, alpha = 1) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] ?? 255) / 255 * alpha})`;
}
function labelOf(info, meta, key) {
  if (meta == null ? void 0 : meta.label) return meta.label;
  const d = typeof (info == null ? void 0 : info.displayName) === "string" ? info.displayName.trim() : "";
  if (d && !d.startsWith("i18n:")) return d;
  return nicify((info == null ? void 0 : info.name) || key);
}
function shell(hideLabel) {
  const prop = h("ui-prop", "ai-main");
  const label = h("ui-label", "", { slot: "label" });
  const content = h("div", "ai-custom", { slot: "content" });
  content.style.display = "flex";
  content.style.alignItems = "center";
  content.style.flex = "1 1 auto";
  content.style.minWidth = "0";
  if (hideLabel) prop.setAttribute("no-label", "");
  else prop.appendChild(label);
  prop.appendChild(content);
  return { prop, label, content };
}
function setLabel(label, input) {
  const text2 = labelOf(input.info, input.meta, input.info.name || "");
  if (label.getAttribute("value") !== text2) label.setAttribute("value", text2);
  const tip = input.info.tooltip && !String(input.info.tooltip).startsWith("i18n:") ? String(input.info.tooltip) : "";
  if (tip) label.setAttribute("tooltip", tip);
  else label.removeAttribute("tooltip");
}
function commit(prop, info, value, confirm) {
  info.value = value;
  if (Array.isArray(info.values)) info.values = info.values.map(() => value);
  prop.dump = info;
  prop.dispatch("change-dump");
  if (confirm) prop.dispatch("confirm-dump");
}
function isMultipleInvalid(info) {
  return Array.isArray(info.values) && info.values.some((v) => !looseEqual(v, info.value) && JSON.stringify(v) !== JSON.stringify(info.value));
}
function decimals(step) {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
function roundTo(v, step) {
  if (!(step > 0)) return v;
  return Number((Math.round(v / step) * step).toFixed(decimals(step)));
}
function capture(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
  }
}
function format(v) {
  if (!Number.isFinite(v)) return String(v);
  return String(Number(v.toFixed(3)));
}
function progressControl(hideLabel) {
  const { prop, label, content } = shell(hideLabel);
  const bar = h("div", "ai-progress");
  const fill = h("div", "ai-progress-fill");
  const text2 = h("div", "ai-progress-text");
  bar.append(fill, text2);
  content.appendChild(bar);
  let input = null;
  let dragging = false;
  const bounds = () => {
    const min = (input == null ? void 0 : input.min) ?? 0;
    const max = (input == null ? void 0 : input.max) ?? 100;
    return max > min ? { min, max } : { min, max: min + 1 };
  };
  const step = () => {
    const info = input.info;
    if (typeof info.step === "number" && info.step > 0) return info.step;
    if (info.type === "Integer") return 1;
    const { min, max } = bounds();
    return max - min > 1 ? 0.01 : 1e-3;
  };
  const valueAt = (clientX) => {
    const r = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    const { min, max } = bounds();
    return roundTo(min + t * (max - min), step());
  };
  const draw = (value, invalid) => {
    const { min, max } = bounds();
    const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
    fill.style.width = `${t * 100}%`;
    const suffix = (input == null ? void 0 : input.meta.suffix) ? ` ${input.meta.suffix}` : "";
    text2.textContent = invalid ? "-" : `${format(value)}${suffix}`;
  };
  bar.addEventListener("pointerdown", (e) => {
    if (!input || input.disabled || e.button !== 0) return;
    dragging = true;
    capture(bar, e.pointerId);
    const v = valueAt(e.clientX);
    draw(v, false);
    commit(prop, input.info, v, false);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!dragging || !input) return;
    const v = valueAt(e.clientX);
    if (v === input.info.value) return;
    draw(v, false);
    commit(prop, input.info, v, false);
  });
  const end = (e) => {
    if (!dragging || !input) return;
    dragging = false;
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    prop.dump = input.info;
    prop.dispatch("confirm-dump");
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  return {
    el: prop,
    update(next) {
      var _a;
      input = next;
      setLabel(label, next);
      const color = (_a = next.meta.progressBar) == null ? void 0 : _a.color;
      if (color) bar.style.setProperty("--ai-bar", rgba(color));
      else bar.style.removeProperty("--ai-bar");
      bar.style.cursor = next.disabled ? "default" : "";
      if (!dragging) draw(Number(next.info.value) || 0, isMultipleInvalid(next.info));
    }
  };
}
function minMaxControl(hideLabel) {
  const { prop, label, content } = shell(hideLabel);
  const box = h("div", "ai-minmax");
  const lo = h("ui-num-input");
  const hi = h("ui-num-input");
  const track = h("div", "ai-mm-track");
  const rail = h("div", "ai-mm-rail");
  const range = h("div", "ai-mm-range");
  const t0 = h("div", "ai-mm-thumb");
  const t1 = h("div", "ai-mm-thumb");
  track.append(rail, range, t0, t1);
  box.append(lo, track, hi);
  content.appendChild(box);
  let input = null;
  let drag = -1;
  let cur = { x: 0, y: 0 };
  const limits = () => {
    const mm = input == null ? void 0 : input.meta.minMax;
    const min = (mm == null ? void 0 : mm.min) ?? 0;
    const max = (mm == null ? void 0 : mm.max) ?? 1;
    return max > min ? { min, max } : { min, max: min + 1 };
  };
  const step = () => {
    const { min, max } = limits();
    return max - min > 10 ? 0.1 : max - min > 1 ? 0.01 : 1e-3;
  };
  const draw = () => {
    const { min, max } = limits();
    const p = (v) => `${Math.min(1, Math.max(0, (v - min) / (max - min))) * 100}%`;
    t0.style.left = p(cur.x);
    t1.style.left = p(cur.y);
    range.style.left = p(cur.x);
    range.style.width = `calc(${p(cur.y)} - ${p(cur.x)})`;
    if (!isFocused(lo)) lo.value = cur.x;
    if (!isFocused(hi)) hi.value = cur.y;
  };
  const send = (confirm) => {
    if (!input) return;
    const base = input.info.value && typeof input.info.value === "object" ? input.info.value : {};
    commit(prop, input.info, { ...base, x: cur.x, y: cur.y }, confirm);
  };
  const valueAt = (clientX) => {
    const r = track.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    const { min, max } = limits();
    return roundTo(min + t * (max - min), step());
  };
  const apply = (which, v) => {
    if (which === 0) cur = { x: Math.min(v, cur.y), y: cur.y };
    else cur = { x: cur.x, y: Math.max(v, cur.x) };
  };
  track.addEventListener("pointerdown", (e) => {
    if (!input || input.disabled || e.button !== 0) return;
    const v = valueAt(e.clientX);
    drag = Math.abs(v - cur.x) <= Math.abs(v - cur.y) && !(v > cur.y) ? 0 : 1;
    if (cur.x === cur.y) drag = v < cur.x ? 0 : 1;
    capture(track, e.pointerId);
    apply(drag, v);
    draw();
    send(false);
  });
  track.addEventListener("pointermove", (e) => {
    if (drag < 0) return;
    apply(drag, valueAt(e.clientX));
    draw();
    send(false);
  });
  const end = (e) => {
    if (drag < 0 || !input) return;
    drag = -1;
    if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
    prop.dump = input.info;
    prop.dispatch("confirm-dump");
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  const onField = (which) => (e) => {
    e.stopPropagation();
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    apply(which, v);
    draw();
    send(false);
  };
  const onConfirm = (e) => {
    e.stopPropagation();
    if (!input) return;
    prop.dump = input.info;
    prop.dispatch("confirm-dump");
  };
  lo.addEventListener("change", onField(0));
  hi.addEventListener("change", onField(1));
  lo.addEventListener("confirm", onConfirm);
  hi.addEventListener("confirm", onConfirm);
  return {
    el: prop,
    update(next) {
      var _a;
      input = next;
      setLabel(label, next);
      const show = ((_a = next.meta.minMax) == null ? void 0 : _a.showFields) !== false;
      lo.style.display = hi.style.display = show ? "" : "none";
      for (const f of [lo, hi]) {
        if (next.disabled) f.setAttribute("disabled", "");
        else f.removeAttribute("disabled");
      }
      if (drag < 0) {
        const v = next.info.value || {};
        cur = { x: Number(v.x) || 0, y: Number(v.y) || 0 };
        draw();
      }
    }
  };
}
function dropdownControl(hideLabel) {
  const { prop, label, content } = shell(hideLabel);
  const select = h("ui-select", "ai-dropdown");
  content.appendChild(select);
  let input = null;
  let items = [];
  let html = "";
  select.addEventListener("change", (e) => {
    e.stopPropagation();
    if (!input) return;
    const i = Number(e.target.value);
    const item = items[i];
    if (!item) return;
    let value = item.value;
    if (typeof input.info.value === "number" && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) value = Number(value);
    commit(prop, input.info, value, true);
  });
  select.addEventListener("confirm", (e) => e.stopPropagation());
  return {
    el: prop,
    update(next) {
      input = next;
      items = next.items || [];
      setLabel(label, next);
      const invalid = isMultipleInvalid(next.info);
      const index = invalid ? -1 : items.findIndex((it) => looseEqual(it.value, next.info.value));
      let options = items.map((it, i) => `<option value="${i}">${escapeHtml(it.label)}</option>`).join("");
      if (index < 0) options = `<option value="-1">${invalid ? "-" : escapeHtml(next.info.value)}</option>${options}`;
      if (options !== html) {
        select.innerHTML = options;
        html = options;
      }
      select.value = String(index);
      if (next.disabled) select.setAttribute("disabled", "");
      else select.removeAttribute("disabled");
    }
  };
}
function togglesControl(hideLabel) {
  const { prop, label, content } = shell(hideLabel);
  const row = h("div", "ai-toggles");
  content.appendChild(row);
  let input = null;
  let html = "";
  row.addEventListener("click", (e) => {
    var _a;
    const btn = e.target.closest("[data-v]");
    if (!btn || !input || input.disabled) return;
    const v = Number(btn.dataset.v);
    if ((_a = input.info.bitmaskList) == null ? void 0 : _a.length) {
      const cur = Number(input.info.value) || 0;
      commit(prop, input.info, v === 0 ? 0 : cur ^ v, true);
    } else {
      commit(prop, input.info, v, true);
    }
  });
  return {
    el: prop,
    update(next) {
      var _a, _b;
      input = next;
      setLabel(label, next);
      const list = ((_a = next.info.bitmaskList) == null ? void 0 : _a.length) ? next.info.bitmaskList : next.info.enumList || [];
      const markup = list.map((it) => `<button class="ai-btn ai-toggle" data-v="${Number(it.value)}">${escapeHtml(nicify(it.name))}</button>`).join("");
      if (markup !== html) {
        row.innerHTML = markup;
        html = markup;
      }
      const invalid = isMultipleInvalid(next.info);
      const value = Number(next.info.value) || 0;
      const bitmask = !!((_b = next.info.bitmaskList) == null ? void 0 : _b.length);
      row.querySelectorAll("[data-v]").forEach((b) => {
        const v = Number(b.dataset.v);
        const on = !invalid && (bitmask ? v === 0 ? value === 0 : (value & v) === v : v === value);
        b.classList.toggle("on", on);
        if (next.disabled) b.setAttribute("disabled", "");
        else b.removeAttribute("disabled");
      });
    }
  };
}

// source/shared/meta.ts
function childPath(p, kind, id) {
  return `${p}/${kind}${kind === "k" ? encodeURIComponent(String(id)) : id}`;
}

// source/inspector/inspect-logic.ts
var DEFAULTS = { num: 0, str: "", bool: false };
function isContainer(n) {
  return n.t === "list" || n.t === "map" || n.t === "obj";
}
function summary(n) {
  if (n.t === "list") return `${n.cls} (${n.size})`;
  if (n.t === "map") return `Map (${n.size})`;
  if (n.t === "obj") return n.size ? n.cls : `${n.cls} {}`;
  return "";
}
function keyLabel(n) {
  switch (n.t) {
    case "str":
    case "text":
      return n.v;
    case "num":
    case "bool":
      return String(n.v);
    case "null":
      return "null";
    case "undef":
      return "undefined";
    case "vec":
      return `(${Object.values(n.v).map((x) => Number(x.toFixed(3))).join(", ")})`;
    case "color":
      return `rgba(${n.v.r}, ${n.v.g}, ${n.v.b}, ${n.v.a})`;
    case "ref":
      return n.valid ? n.name || n.cls : "Missing";
    default:
      return summary(n);
  }
}
function primitiveType(nodes) {
  if (!nodes.length) return null;
  const t = nodes[0].t;
  if (t !== "num" && t !== "str" && t !== "bool") return null;
  return nodes.every((n) => n.t === t) ? t : null;
}
function canSetChild(parent) {
  return !(parent.t === "list" && parent.cls === "Set");
}
function canRemoveChild(parent) {
  return parent.t === "map" || parent.t === "list" && (parent.cls === "Array" || parent.cls === "Set");
}
function addInfo(n) {
  if (n.t === "list" && (n.cls === "Array" || n.cls === "Set")) {
    const t = primitiveType(n.items || []);
    return t ? { path: n.p, value: DEFAULTS[t] } : void 0;
  }
  if (n.t === "map") {
    const entries = n.entries || [];
    const kt = primitiveType(entries.map((e) => e.k));
    const vt = primitiveType(entries.map((e) => e.v));
    if ((kt === "num" || kt === "str") && vt) return { path: n.p, value: DEFAULTS[vt], keyType: kt };
  }
  return void 0;
}
function flattenInspect(result, o) {
  const base = { depth: 0, label: o.label, editable: false, removable: false };
  if (!result) return [{ ...base, key: "#loading", kind: "more", text: "\u2026" }];
  if ("error" in result) return [{ ...base, key: "#error", kind: "error", text: result.error }];
  const rows = [];
  const walk = (node, label, depth, parent) => {
    var _a, _b, _c;
    const container = isContainer(node);
    const editable = !o.disabled && !container && (parent ? canSetChild(parent) : result.writable);
    const removable = !o.disabled && !!parent && canRemoveChild(parent);
    rows.push({ key: node.p, kind: container ? "container" : "leaf", depth, label, node, editable, removable });
    if (!container || !o.isOpen(node.p, depth)) return;
    if (node.t === "list") (_a = node.items) == null ? void 0 : _a.forEach((c, i) => walk(c, String(i), depth + 1, node));
    else if (node.t === "map") (_b = node.entries) == null ? void 0 : _b.forEach((e) => walk(e.v, keyLabel(e.k), depth + 1, node));
    else (_c = node.keys) == null ? void 0 : _c.forEach((e) => walk(e.v, node.cls === "Object" ? e.k : nicify(e.k), depth + 1, node));
    const child = { depth: depth + 1, label: "", editable: false, removable: false };
    if (node.more) rows.push({ ...child, key: `${node.p}#more`, kind: "more", text: `\u2026 ${node.more} more` });
    const add = o.disabled ? void 0 : addInfo(node);
    if (add) rows.push({ ...child, key: `${node.p}#add`, kind: "add", add });
  };
  walk(result.node, o.label, 0, null);
  return rows;
}

// source/inspector/inspect-view.ts
function shapeOf(r) {
  var _a;
  const n = r.node;
  const axes = (n == null ? void 0 : n.t) === "vec" ? Object.keys(n.v).join(",") : "";
  return `${r.kind}|${(n == null ? void 0 : n.t) ?? ""}|${r.editable ? 1 : 0}|${r.removable ? 1 : 0}|${axes}|${((_a = r.add) == null ? void 0 : _a.keyType) ?? (r.add ? "list" : "")}`;
}
function text(cls, value = "") {
  const s = h("span", cls);
  s.textContent = value;
  return s;
}
function createInspectView(actions) {
  const el = h("div", "ai-inspect ai-main");
  const rows = /* @__PURE__ */ new Map();
  function leafEditor(row, r) {
    const c = row.__content;
    const n = r.node;
    const path = () => row.__row.node.p;
    const disable = (e) => {
      if (!r.editable) e.setAttribute("disabled", "");
    };
    if (n.t === "num") {
      const input = h("ui-num-input");
      disable(input);
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        const v = Number(input.value);
        if (Number.isFinite(v)) actions.set(path(), v);
      });
      input.addEventListener("confirm", (e) => e.stopPropagation());
      c.appendChild(input);
      return (x) => {
        if (x.t === "num" && !isFocused(input)) input.value = x.v;
      };
    }
    if (n.t === "str") {
      const input = h("ui-input");
      disable(input);
      input.addEventListener("change", (e) => e.stopPropagation());
      input.addEventListener("confirm", (e) => {
        e.stopPropagation();
        actions.set(path(), String(input.value ?? ""));
      });
      c.appendChild(input);
      return (x) => {
        if (x.t === "str" && !isFocused(input)) input.value = x.v;
      };
    }
    if (n.t === "bool") {
      const input = h("ui-checkbox");
      disable(input);
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        actions.set(path(), !!input.value);
      });
      input.addEventListener("confirm", (e) => e.stopPropagation());
      c.appendChild(input);
      return (x) => {
        if (x.t === "bool") input.value = x.v;
      };
    }
    if (n.t === "vec") {
      const box = h("div", "ai-ivec");
      const inputs = /* @__PURE__ */ new Map();
      for (const axis of Object.keys(n.v)) {
        const input = h("ui-num-input");
        disable(input);
        input.addEventListener("change", (e) => {
          e.stopPropagation();
          const v = Number(input.value);
          if (Number.isFinite(v)) actions.set(childPath(path(), "k", axis), v);
        });
        input.addEventListener("confirm", (e) => e.stopPropagation());
        box.append(text("ai-iaxis", axis.length > 1 ? axis[0].toUpperCase() : axis.toUpperCase()), input);
        inputs.set(axis, input);
      }
      c.appendChild(box);
      return (x) => {
        if (x.t !== "vec") return;
        for (const [axis, input] of inputs) if (!isFocused(input)) input.value = x.v[axis];
      };
    }
    if (n.t === "color") {
      const swatch = text("ai-iswatch");
      const label = text("ai-ivalue");
      c.append(swatch, label);
      return (x) => {
        if (x.t !== "color") return;
        const { r: R, g, b, a } = x.v;
        swatch.style.background = `rgba(${R}, ${g}, ${b}, ${a / 255})`;
        const hex = [R, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        label.textContent = `#${hex.toUpperCase()}${a < 255 ? `  ${Math.round(a / 255 * 100)}%` : ""}`;
      };
    }
    if (n.t === "ref") {
      const link = text("ai-iref");
      const cls = text("ai-idim");
      link.addEventListener("click", () => {
        const cur = row.__row.node;
        if ((cur == null ? void 0 : cur.t) === "ref" && cur.valid && cur.uuid) actions.select(cur);
      });
      c.append(link, cls);
      return (x) => {
        if (x.t !== "ref") return;
        link.textContent = x.valid ? x.name || "(unnamed)" : "Missing";
        link.classList.toggle("missing", !x.valid);
        cls.textContent = x.cls;
      };
    }
    const value = text("ai-ivalue ai-idim");
    c.appendChild(value);
    return (x) => {
      value.textContent = x.t === "null" ? "null" : x.t === "undef" ? "undefined" : x.t === "text" ? x.v : "";
    };
  }
  function createRow(r, shape) {
    var _a;
    const row = h("ui-prop", `ai-irow ai-irow-${r.kind}`);
    const label = h("div", "ai-ilabel", { slot: "label" });
    const arrow = text("ai-iarrow");
    const name = text("ai-itext");
    label.append(arrow, name);
    const content = h("div", "ai-icontent", { slot: "content" });
    row.append(label, content);
    Object.assign(row, { __row: r, __shape: shape, __label: label, __arrow: arrow, __text: name, __content: content });
    let refresh = () => void 0;
    if (r.kind === "container") {
      const sum = text("ai-idim");
      content.appendChild(sum);
      arrow.classList.add("toggle");
      label.addEventListener("click", () => actions.toggle(row.__row.node.p, row.__row.depth));
      refresh = (x) => {
        sum.textContent = x.node ? summary(x.node) : "";
      };
    } else if (r.kind === "leaf") {
      const show = leafEditor(row, r);
      refresh = (x) => x.node && show(x.node);
    } else if (r.kind === "more" || r.kind === "error") {
      const t = text(r.kind === "error" ? "ai-ierror" : "ai-idim");
      content.appendChild(t);
      refresh = (x) => {
        t.textContent = x.text || "";
      };
    } else if (r.kind === "add") {
      let key = null;
      if ((_a = r.add) == null ? void 0 : _a.keyType) {
        key = r.add.keyType === "num" ? h("ui-num-input") : h("ui-input");
        key.setAttribute("placeholder", "New key");
        key.classList.add("ai-ikey");
        key.addEventListener("change", (e) => e.stopPropagation());
        key.addEventListener("confirm", (e) => e.stopPropagation());
        content.appendChild(key);
      }
      const btn = h("button", "ai-btn ai-iadd");
      btn.textContent = key ? "Add Entry" : "Add Item";
      btn.addEventListener("click", () => {
        const add = row.__row.add;
        if (!add) return;
        if (!key) {
          actions.add(add.path, add.value);
          return;
        }
        const raw = key.value;
        const k = add.keyType === "num" ? Number(raw) : String(raw ?? "").trim();
        if (add.keyType === "num" ? !Number.isFinite(k) : k === "") return;
        actions.add(add.path, add.value, k);
        key.value = add.keyType === "num" ? 0 : "";
      });
      content.appendChild(btn);
    }
    if (r.removable) {
      const remove = h("button", "ai-btn ai-iremove", { title: "Remove" });
      remove.textContent = "\xD7";
      remove.addEventListener("click", () => actions.remove(row.__row.node.p));
      content.appendChild(remove);
    }
    row.__refresh = refresh;
    return row;
  }
  function update2(input) {
    const list = flattenInspect(input.result, { label: input.label, disabled: input.disabled, isOpen: actions.isOpen });
    const used = /* @__PURE__ */ new Set();
    const els = list.map((r, i) => {
      const shape = shapeOf(r);
      let row = rows.get(r.key);
      if (!row || row.__shape !== shape) {
        row == null ? void 0 : row.remove();
        row = createRow(r, shape);
        rows.set(r.key, row);
      }
      used.add(r.key);
      row.__row = r;
      row.__text.textContent = r.label;
      row.__label.style.paddingLeft = `${r.depth * 12}px`;
      if (r.kind === "container") row.__arrow.classList.toggle("open", actions.isOpen(r.node.p, r.depth));
      row.__arrow.style.display = r.depth === 0 && r.kind !== "container" ? "none" : "";
      if (i === 0 && input.hideLabel) row.setAttribute("no-label", "");
      else row.removeAttribute("no-label");
      row.__refresh(r);
      return row;
    });
    for (const [key, row] of rows) {
      if (!used.has(key)) {
        row.remove();
        rows.delete(key);
      }
    }
    syncChildren(el, els);
  }
  return { el, update: update2 };
}

// source/inspector/style.ts
var style = (
  /* css */
  `
:host { display: block; }
.ai-root { display: flex; flex-direction: column; }
.ai-hidden { display: none !important; }

/* ---------------------------------------------------------------- items */
.ai-item { position: relative; min-width: 0; }
.ai-item.ai-tinted { background: var(--ai-tint-bg); box-shadow: inset 2px 0 0 var(--ai-tint); border-radius: 2px; padding-left: 4px; }
.ai-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; min-width: 0; }
.ai-row > ui-prop { margin-top: 0 !important; }
.ai-main { flex: 1 1 auto; min-width: 0; }
.ai-extra { display: flex; align-items: center; gap: 2px; flex: none; }
.ai-extra:empty { display: none; }
.ai-suffix { color: var(--color-normal-contrast-emphasis, #999); font-size: 12px; padding: 0 2px; }
.ai-disabled .ai-custom { opacity: 0.55; pointer-events: none; }

/* ---------------------------------------------------------------- title */
.ai-title { margin: 10px 0 2px; }
.ai-title.line { border-bottom: 1px solid var(--color-normal-border, #444); padding-bottom: 3px; }
.ai-title-text { font-size: 12px; color: var(--color-normal-contrast-weakest, #eee); }
.ai-title-text.bold { font-weight: bold; }
.ai-subtitle { font-size: 11px; margin-top: 1px; color: var(--color-normal-contrast-emphasis, #999); }

/* ------------------------------------------------------------- info box */
.ai-info {
    display: flex; align-items: flex-start; gap: 7px; margin-top: 4px; padding: 6px 8px;
    border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.18);
    font-size: 12px; line-height: 16px; color: var(--color-normal-contrast, #ccc);
    white-space: pre-wrap; word-break: break-word;
}
.ai-info-icon {
    flex: none; width: 16px; height: 16px; border-radius: 50%; color: #fff;
    font: bold 11px/16px sans-serif; text-align: center;
}
.ai-info-info .ai-info-icon { background: #3d7fd6; }
.ai-info-info .ai-info-icon::before { content: 'i'; }
.ai-info-warning { border-color: rgba(217, 164, 0, 0.45); }
.ai-info-warning .ai-info-icon { background: #d9a400; border-radius: 0; clip-path: polygon(50% 0, 100% 100%, 0 100%); line-height: 19px; color: #222; }
.ai-info-warning .ai-info-icon::before { content: '!'; }
.ai-info-error { border-color: rgba(217, 69, 61, 0.55); }
.ai-info-error .ai-info-icon { background: #d9453d; }
.ai-info-error .ai-info-icon::before { content: '\\00d7'; font-size: 13px; }

/* --------------------------------------------------------------- button */
.ai-btn {
    box-sizing: border-box; display: flex; align-items: center; justify-content: center;
    width: 100%; height: 24px; padding: 0 8px; margin: 0;
    font-family: inherit; font-size: 12px; color: var(--color-normal-contrast, #ccc);
    background: var(--color-default-fill, #3c3c3c); border: 1px solid var(--color-default-border, #1e1e1e);
    border-radius: var(--size-normal-radius, 3px); outline: none; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ai-btn:hover { filter: brightness(1.18); }
.ai-btn:active { filter: brightness(0.88); }
.ai-btn:focus-visible { border-color: var(--color-focus-border, #2f7de1); }
.ai-btn[disabled] { opacity: 0.45; cursor: default; filter: none; }
.ai-btn.blue { background: #2c66bd; border-color: #1d4686; color: #fff; }
.ai-btn.red { background: #b5433b; border-color: #7f2c26; color: #fff; }
.ai-btn.green { background: #3d8a47; border-color: #2a6031; color: #fff; }
.ai-btn.tint { background: var(--ai-tint); color: #fff; }
.ai-method { margin-top: 4px; }
.ai-inline { width: auto; height: 20px; padding: 0 6px; }

/* --------------------------------------------------------------- groups */
.ai-box { margin-top: 6px; border: 1px solid var(--color-normal-border, #1d1d1d); border-radius: 3px; background: rgba(0, 0, 0, 0.12); }
.ai-box-header {
    padding: 3px 6px; font-size: 12px; font-weight: bold; color: var(--color-normal-contrast-weakest, #eee);
    background: rgba(255, 255, 255, 0.05); border-bottom: 1px solid var(--color-normal-border, #1d1d1d);
}
.ai-box-body { padding: 0 6px 6px; }

.ai-foldout { margin-top: 4px; }
.ai-foldout-body { padding-bottom: 4px; }

.ai-tabs { margin-top: 6px; border: 1px solid var(--color-normal-border, #1d1d1d); border-radius: 3px; background: rgba(0, 0, 0, 0.12); }
.ai-tabbar { display: flex; background: rgba(0, 0, 0, 0.2); border-bottom: 1px solid var(--color-normal-border, #1d1d1d); }
.ai-tab {
    flex: 1 1 0; min-width: 0; padding: 4px 6px; font-size: 12px; text-align: center; cursor: pointer;
    color: var(--color-normal-contrast-emphasis, #999); border-bottom: 2px solid transparent;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ai-tab:hover { color: var(--color-normal-contrast, #ccc); }
.ai-tab.active { color: var(--color-normal-contrast-weakest, #fff); font-weight: bold; background: rgba(255, 255, 255, 0.06); border-bottom-color: var(--color-focus-border, #2f7de1); }
.ai-tabpage { padding: 0 6px 6px; }
.ai-tabpage:not(.active) { display: none; }

/* Bottom-aligned, so a title or space above one member keeps the fields in line. */
.ai-hgroup { display: flex; gap: 6px; align-items: flex-end; min-width: 0; }
.ai-hgroup > * { flex: 1 1 0; min-width: 0; }
.ai-bgroup { display: flex; gap: 2px; margin-top: 4px; min-width: 0; }
.ai-bgroup > * { flex: 1 1 0; min-width: 0; }
.ai-bgroup .ai-method { margin-top: 0; }

/* ---------------------------------------------------------- progress bar */
.ai-progress {
    position: relative; flex: 1; height: 18px; border-radius: 2px; overflow: hidden; cursor: ew-resize;
    background: rgba(0, 0, 0, 0.35); border: 1px solid var(--color-normal-border, #1a1a1a);
}
.ai-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ai-bar, #4caf50); }
.ai-progress-text {
    position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none;
    font-size: 11px; line-height: 18px; text-align: center; color: #fff; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}

/* -------------------------------------------------------- min max slider */
.ai-minmax { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.ai-minmax ui-num-input { width: 56px; flex: none; }
.ai-mm-track { position: relative; flex: 1; min-width: 40px; height: 18px; cursor: pointer; }
.ai-mm-rail { position: absolute; left: 0; right: 0; top: 8px; height: 3px; border-radius: 2px; background: rgba(0, 0, 0, 0.45); }
.ai-mm-range { position: absolute; top: 8px; height: 3px; background: var(--color-focus-fill, #2f7de1); }
.ai-mm-thumb {
    position: absolute; top: 3px; width: 8px; height: 12px; margin-left: -4px; border-radius: 2px;
    background: #d0d0d0; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
}

/* ------------------------------------------------------- toggle buttons */
.ai-toggles { display: flex; flex: 1; min-width: 0; }
.ai-toggle { height: 20px; flex: 1 1 0; min-width: 0; border-radius: 0; margin-left: -1px; }
.ai-toggle:first-child { margin-left: 0; border-top-left-radius: 3px; border-bottom-left-radius: 3px; }
.ai-toggle:last-child { border-top-right-radius: 3px; border-bottom-right-radius: 3px; }
.ai-toggle.on { background: var(--color-focus-fill, #2f7de1); border-color: var(--color-focus-border, #1d5fb8); color: #fff; }

.ai-dropdown { flex: 1; min-width: 0; }

/* ------------------------------------------------------ show in inspector */
.ai-inspect { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.ai-inspect > ui-prop:first-child { margin-top: 0 !important; }
.ai-ilabel { display: flex; align-items: center; min-width: 0; overflow: hidden; white-space: nowrap; }
.ai-iarrow { flex: none; width: 12px; font-size: 9px; color: var(--color-normal-contrast-emphasis, #999); }
.ai-iarrow.toggle::before { content: '\\25B6'; }
.ai-iarrow.toggle.open::before { content: '\\25BC'; }
.ai-irow-container .ai-ilabel { cursor: pointer; }
.ai-itext { overflow: hidden; text-overflow: ellipsis; }
.ai-icontent { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; }
.ai-icontent > ui-num-input, .ai-icontent > ui-input { flex: 1 1 auto; min-width: 0; }
.ai-icontent > ui-checkbox { flex: none; }
.ai-icontent > .ai-ikey { flex: 1 1 auto; }
.ai-idim, .ai-ivalue { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-idim { color: var(--color-normal-contrast-emphasis, #999); }
.ai-ierror { flex: 1 1 auto; color: #e0625b; white-space: normal; }
.ai-ivec { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; }
.ai-ivec > ui-num-input { flex: 1 1 0; min-width: 0; }
.ai-iaxis { flex: none; font-size: 11px; color: var(--color-normal-contrast-emphasis, #999); }
.ai-iswatch { flex: none; width: 32px; height: 14px; border-radius: 2px; border: 1px solid var(--color-normal-border, #1b1b1b); }
.ai-iref { flex: none; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; color: var(--color-normal-contrast-weakest, #eee); }
.ai-iref:hover { text-decoration: underline; }
.ai-iref.missing { color: #e0625b; cursor: default; text-decoration: none; }
.ai-iremove { flex: none; width: 20px; height: 20px; padding: 0; font-size: 14px; }
.ai-iadd { flex: none; width: auto; height: 20px; padding: 0 8px; }
`
);

// source/inspector/component.ts
var PKG = "advanced-inspector";
var META_TTL = 1500;
var POLL_MS = 500;
var CHANGE_WINDOW_MS = 2e3;
var request = Editor.Message.request.bind(Editor.Message);
function sceneProtocol(el) {
  var _a, _b, _c;
  let e = el;
  while (e) {
    if ((_a = e.messageProtocol) == null ? void 0 : _a.scene) return e.messageProtocol.scene;
    e = e.parentElement || ((_c = (_b = e.getRootNode) == null ? void 0 : _b.call(e)) == null ? void 0 : _c.host) || null;
  }
  return "scene";
}
function componentUuids(dump) {
  var _a;
  const u = (_a = dump == null ? void 0 : dump.value) == null ? void 0 : _a.uuid;
  if (!u) return [];
  return Array.isArray(u.values) && u.values.length ? u.values : u.value ? [u.value] : [];
}
var activeTabs = /* @__PURE__ */ new Map();
var openStates = /* @__PURE__ */ new Map();
function openState(type) {
  let s = openStates.get(type);
  if (!s) openStates.set(type, s = /* @__PURE__ */ new Map());
  return s;
}
function isOpen(type, path, depth) {
  return openState(type).get(path) ?? depth === 0;
}
function openPaths(type, meta, dump) {
  const paths = inspectedMembers(meta, dump).map((m) => m.name).filter((name) => isOpen(type, name, 0));
  for (const [path, open] of openState(type)) if (open && path.includes("/")) paths.push(path);
  return paths;
}
var metaCache = /* @__PURE__ */ new Map();
function isEngineType(type) {
  return /^(cc|sp|dragonBones)\./.test(type);
}
function loadMeta(protocol, type) {
  const entry = metaCache.get(type);
  if (entry == null ? void 0 : entry.loading) return entry.loading;
  const loading = request(protocol, "execute-scene-script", { name: PKG, method: "getMeta", args: [type] }).then((m) => m && Array.isArray(m.members) ? m : null).catch(() => null).then((meta) => {
    const json = JSON.stringify(meta);
    const prev = metaCache.get(type);
    metaCache.set(type, { at: Date.now(), json, meta: prev && prev.json === json ? prev.meta : meta });
  });
  metaCache.set(type, { ...entry || { json: "null", meta: null }, at: (entry == null ? void 0 : entry.at) ?? 0, loading });
  return loading;
}
async function getMeta(protocol, type, onChange) {
  var _a;
  if (!type || isEngineType(type)) return null;
  const entry = metaCache.get(type);
  if (!entry || entry.at === 0 && entry.loading) {
    await loadMeta(protocol, type);
    return ((_a = metaCache.get(type)) == null ? void 0 : _a.meta) ?? null;
  }
  if (Date.now() - entry.at > META_TTL && !entry.loading) {
    const before = entry.json;
    loadMeta(protocol, type).then(() => {
      var _a2;
      if (((_a2 = metaCache.get(type)) == null ? void 0 : _a2.json) !== before) onChange();
    });
  }
  return entry.meta;
}
function componentHost(panel) {
  const uuids = () => {
    var _a;
    return componentUuids(((_a = panel.__ai) == null ? void 0 : _a.dump) ?? null);
  };
  const protocol = () => sceneProtocol(panel.$this);
  return {
    ids: (dump) => componentUuids(dump),
    protocol,
    async eval(req) {
      const uuid = uuids()[0];
      if (!uuid) return null;
      try {
        const r = await request(protocol(), "execute-component-method", { uuid, name: "__advInspectorEval", args: [req] });
        return r && typeof r === "object" ? r : null;
      } catch {
        return null;
      }
    },
    /** Calls the method on every selected component, as one undo step. */
    async invoke(method) {
      const ids = uuids();
      if (!ids.length) return;
      let undo;
      try {
        undo = await request(protocol(), "begin-recording", ids);
      } catch {
      }
      try {
        for (const uuid of ids) await request(protocol(), "execute-component-method", { uuid, name: method, args: [] });
      } finally {
        if (undo) await request(protocol(), "end-recording", undo).catch(() => void 0);
      }
    },
    /** Not recorded: these values aren't saved. */
    async set(path, op, value, key) {
      let result = true;
      for (const uuid of uuids()) {
        const r = await request(protocol(), "execute-component-method", { uuid, name: "__advInspectorSet", args: [path, op, value, key] });
        if (r !== true) result = r;
      }
      return result;
    },
    showDefault(show) {
      const host = panel.$this;
      host.style.display = show ? "none" : "";
      const parent = host.parentElement;
      if (!parent) return;
      for (const el of Array.from(parent.children)) {
        if (el !== host && el.tagName === "UI-PANEL" && isEngineClassPanel(el)) el.style.display = show ? "" : "none";
      }
    }
  };
}
function hostOf(panel) {
  if (!panel.__aiHost) panel.__aiHost = componentHost(panel);
  return panel.__aiHost;
}
async function evalRemote(panel) {
  const st = panel.__ai;
  if (!st.request) return null;
  try {
    return await hostOf(panel).eval(st.request);
  } catch {
    return null;
  }
}
async function invoke(panel, method) {
  try {
    await hostOf(panel).invoke(method);
  } catch (e) {
    console.error(`[Advanced Inspector] ${method}():`, e);
  }
  refreshRemote(panel, true);
}
async function refreshRemote(panel, force = false) {
  const st = panel.__ai;
  if (!st || !st.meta || !st.needsRemote) return;
  if (st.polling) {
    if (force) st.again = true;
    return;
  }
  st.polling = true;
  try {
    do {
      st.again = false;
      const r = await evalRemote(panel);
      const sig = JSON.stringify(r);
      if (r && sig !== st.remoteSig && st.meta) {
        st.remote = r;
        st.remoteSig = sig;
        render(panel);
      }
    } while (st.again);
  } finally {
    st.polling = false;
  }
}
async function inspectEdit(panel, path, op, value, key) {
  try {
    const r = await hostOf(panel).set(path, op, value, key);
    if (r !== true && r) console.warn(`[Advanced Inspector] ${r}`);
  } catch (e) {
    console.error("[Advanced Inspector]", e);
  }
  refreshRemote(panel, true);
}
function inspectActions(panel) {
  const type = () => {
    var _a, _b;
    return ((_b = (_a = panel.__ai) == null ? void 0 : _a.dump) == null ? void 0 : _b.type) || "";
  };
  return {
    isOpen: (path, depth) => isOpen(type(), path, depth),
    toggle(path, depth) {
      const st = panel.__ai;
      if (!(st == null ? void 0 : st.dump) || !st.meta || !st.request) return;
      openState(type()).set(path, !isOpen(type(), path, depth));
      st.request.open = openPaths(type(), st.meta, st.dump);
      render(panel);
      refreshRemote(panel, true);
    },
    set: (path, value) => inspectEdit(panel, path, "set", value),
    remove: (path) => inspectEdit(panel, path, "delete"),
    add: (path, value, key) => inspectEdit(panel, path, "add", value, key),
    select(node) {
      var _a, _b;
      const kind = node.kind === "asset" ? "asset" : "node";
      const selection = Editor.Selection;
      (_a = selection == null ? void 0 : selection.clear) == null ? void 0 : _a.call(selection, kind);
      (_b = selection == null ? void 0 : selection.select) == null ? void 0 : _b.call(selection, kind, [node.uuid]);
    }
  };
}
function startPoll(panel) {
  const st = panel.__ai;
  if (st.timer) return;
  st.timer = setInterval(() => {
    if (!panel.$this.isConnected) {
      stopPoll(st);
      return;
    }
    if (document.hidden || !panel.$.root.offsetParent) return;
    refreshRemote(panel);
  }, POLL_MS);
}
function stopPoll(st) {
  if (st.timer) clearInterval(st.timer);
  st.timer = null;
}
function isEngineClassPanel(el) {
  const src = (el.getAttribute("src") || "").replace(/\\/g, "/");
  return /\/editor\/inspector\/components\/class\.js$/.test(src);
}
function showDefault(panel, show) {
  hostOf(panel).showDefault(show);
}
function controlKind(node, info) {
  var _a, _b;
  if (node.isMethod) return "method";
  if (node.isInspected) return "inspect";
  const m = node.meta;
  const v = info == null ? void 0 : info.value;
  if ((m == null ? void 0 : m.progressBar) && typeof v === "number") return "progress";
  if ((m == null ? void 0 : m.minMax) && v && typeof v === "object" && "x" in v && "y" in v) return "minmax";
  if ((m == null ? void 0 : m.dropdown) && !(info == null ? void 0 : info.isArray)) return "dropdown";
  if ((m == null ? void 0 : m.toggleButtons) && (((_a = info == null ? void 0 : info.enumList) == null ? void 0 : _a.length) || ((_b = info == null ? void 0 : info.bitmaskList) == null ? void 0 : _b.length))) return "toggles";
  return "dump";
}
function createItemView(ctx, id, sig, kind, node) {
  var _a;
  const root = h("div", "ai-item", { "data-ai-id": id });
  const pre = h("div");
  const row = h("div", "ai-row");
  const extra = h("div", "ai-extra");
  const post = h("div");
  root.append(pre, row, post);
  const view = {
    id,
    sig,
    root,
    pre,
    row,
    extra,
    post,
    control: null,
    dumpProp: null,
    button: null,
    inspect: null,
    html: { pre: "", extra: "", post: "", button: "" }
  };
  const hideLabel = !!((_a = node.meta) == null ? void 0 : _a.hideLabel);
  if (kind === "method") {
    root.classList.add("ai-method");
    row.style.marginTop = "0";
    view.button = h("button", "ai-btn");
    view.button.dataset.aiMethod = node.key;
    row.appendChild(view.button);
  } else if (kind === "inspect") {
    view.inspect = createInspectView(inspectActions(ctx.panel));
    row.appendChild(view.inspect.el);
  } else if (kind === "dump") {
    const prop = h("ui-prop", "ai-main", { type: "dump" });
    if (hideLabel) prop.setAttribute("no-label", "");
    view.dumpProp = prop;
    row.appendChild(prop);
  } else {
    view.control = kind === "progress" ? progressControl(hideLabel) : kind === "minmax" ? minMaxControl(hideLabel) : kind === "dropdown" ? dropdownControl(hideLabel) : togglesControl(hideLabel);
    row.appendChild(view.control.el);
  }
  row.appendChild(extra);
  if (!node.isMethod && !node.isInspected) root.__aiKey = node.key;
  return view;
}
function getItemView(ctx, node) {
  var _a;
  const info = node.isMethod ? void 0 : ctx.dump.value[node.key];
  const kind = controlKind(node, info);
  const sig = `${kind}|${((_a = node.meta) == null ? void 0 : _a.hideLabel) ? 1 : 0}`;
  let view = ctx.st.views.get(node.id);
  if (view && view.sig !== sig) {
    view.root.remove();
    view = void 0;
  }
  if (!view) {
    view = createItemView(ctx, node.id, sig, kind, node);
    ctx.st.views.set(node.id, view);
  }
  return view;
}
function infoBoxHtml(type, message) {
  const icon = type === "none" ? "" : '<span class="ai-info-icon"></span>';
  return `<div class="ai-info ai-info-${escapeHtml(type)}">${icon}<span>${escapeHtml(message)}</span></div>`;
}
function preHtml(ctx, m) {
  if (!m) return "";
  let s = "";
  if (m.spaceBefore) s += `<div style="height:${Number(m.spaceBefore) || 0}px"></div>`;
  if (m.title) {
    const t = m.title;
    s += `<div class="ai-title${t.line !== false ? " line" : ""}"><div class="ai-title-text${t.bold !== false ? " bold" : ""}">${escapeHtml(t.title)}</div>` + (t.subtitle ? `<div class="ai-subtitle">${escapeHtml(t.subtitle)}</div>` : "") + "</div>";
  }
  for (const box of m.infoBoxes || []) {
    if (box.visibleIf && !testCondition(box.visibleIf, ctx.dump, ctx.remote)) continue;
    s += infoBoxHtml(box.type, box.message);
  }
  return s;
}
function postHtml(ctx, node, info) {
  const m = node.meta;
  if (!m) return "";
  let s = "";
  if (info && m.required && isEmptyValue(info)) {
    s += infoBoxHtml("error", m.required.message || `${labelOf(info, m, node.key)} is required.`);
  }
  if (info && m.validate && ctx.st.request) {
    const r = validationFor(node.key, ctx.st.request, ctx.remote);
    if (r !== void 0 && r !== true) s += infoBoxHtml("error", r || m.validate.message || "Invalid value.");
  }
  if (m.spaceAfter) s += `<div style="height:${Number(m.spaceAfter) || 0}px"></div>`;
  return s;
}
function extraHtml(node, info, kind, disabled) {
  const m = node.meta;
  if (!m || node.isMethod) return "";
  let s = "";
  if (m.suffix && !(kind === "dump" && typeof (info == null ? void 0 : info.value) === "number") && kind !== "progress") {
    s += `<span class="ai-suffix">${escapeHtml(m.suffix)}</span>`;
  }
  for (const b of m.inlineButtons || []) {
    s += `<button class="ai-btn ai-inline" data-ai-method="${escapeHtml(b.method)}"${disabled ? " disabled" : ""}>${escapeHtml(b.label || nicify(b.method))}</button>`;
  }
  return s;
}
function setReadonlyDeep(d) {
  if (!d || typeof d !== "object") return;
  if ("readonly" in d || "value" in d) d.readonly = true;
  const v = d.value;
  if (Array.isArray(v)) v.forEach(setReadonlyDeep);
  else if (v && typeof v === "object") {
    for (const k in v) if (v[k] && typeof v[k] === "object" && "value" in v[k]) setReadonlyDeep(v[k]);
  }
}
function updateItem(ctx, view, node, state2) {
  var _a, _b;
  const m = node.meta;
  const info = node.isMethod ? void 0 : ctx.dump.value[node.key];
  const pre = preHtml(ctx, m);
  if (pre !== view.html.pre) {
    view.pre.innerHTML = pre;
    view.html.pre = pre;
  }
  if (m == null ? void 0 : m.color) {
    view.root.classList.add("ai-tinted");
    view.root.style.setProperty("--ai-tint", rgba(m.color));
    view.root.style.setProperty("--ai-tint-bg", rgba(m.color, 0.14));
  } else {
    view.root.classList.remove("ai-tinted");
  }
  view.root.classList.toggle("ai-disabled", state2.disabled);
  if (view.button) {
    const b = (m == null ? void 0 : m.button) || {};
    const markup = escapeHtml(b.label || nicify(node.key));
    if (markup !== view.html.button) {
      view.button.innerHTML = markup;
      view.html.button = markup;
    }
    const size = b.size === "small" ? 20 : b.size === "large" ? 34 : typeof b.size === "number" ? b.size : 24;
    view.button.style.height = `${size}px`;
    view.button.className = `ai-btn${b.color && b.color !== "default" ? ` ${b.color}` : ""}${(m == null ? void 0 : m.color) ? " tint" : ""}`;
    view.button.disabled = state2.disabled;
    view.root.classList.remove("ai-tinted");
  } else if (view.inspect) {
    view.inspect.update({
      result: (_b = (_a = ctx.remote) == null ? void 0 : _a.inspected) == null ? void 0 : _b[node.key],
      label: labelOf(void 0, m, node.key),
      disabled: state2.disabled,
      hideLabel: !!(m == null ? void 0 : m.hideLabel)
    });
  } else if (view.dumpProp && info) {
    let d = { ...info };
    if (m == null ? void 0 : m.label) d.displayName = m.label;
    if ((m == null ? void 0 : m.suffix) && typeof info.value === "number") d.unit = m.suffix;
    if (state2.disabled) {
      d = JSON.parse(JSON.stringify(d));
      setReadonlyDeep(d);
    }
    view.dumpProp.render(d);
  } else if (view.control && info && m) {
    view.control.update({
      info: { ...info },
      meta: m,
      disabled: state2.disabled || !!info.readonly,
      min: m.progressBar ? numberFrom(m.progressBar.min, ctx.dump, ctx.remote, 0) : void 0,
      max: m.progressBar ? numberFrom(m.progressBar.max, ctx.dump, ctx.remote, 100) : void 0,
      items: m.dropdown ? dropdownItems(m, ctx.remote) : void 0
    });
  }
  const extra = extraHtml(node, info, view.sig.split("|")[0], state2.disabled);
  if (extra !== view.html.extra) {
    view.extra.innerHTML = extra;
    view.html.extra = extra;
  }
  const post = postHtml(ctx, node, info);
  if (post !== view.html.post) {
    view.post.innerHTML = post;
    view.html.post = post;
  }
}
function createGroupView(ctx, node) {
  const def = node.def;
  const type = ctx.dump.type;
  switch (def.kind) {
    case "foldout": {
      const root = h("ui-section", "ai-foldout");
      root.setAttribute("cache-expand", `advanced-inspector:${type}:${def.path}`);
      if (def.expanded) root.setAttribute("expand", "");
      const header = h("ui-label", "", { slot: "header" });
      const body = h("div", "ai-foldout-body");
      root.append(header, body);
      return { id: node.id, kind: def.kind, root, body, header };
    }
    case "tab": {
      const root = h("div", "ai-tabs");
      const bar = h("div", "ai-tabbar");
      const body = h("div", "ai-tabpages");
      root.append(bar, body);
      bar.dataset.aiTabs = `${type}|${def.path}`;
      return { id: node.id, kind: def.kind, root, body, bar, pages: /* @__PURE__ */ new Map() };
    }
    case "horizontal": {
      const root = h("div", "ai-hgroup");
      return { id: node.id, kind: def.kind, root, body: root };
    }
    case "buttons": {
      const root = h("div", "ai-bgroup");
      return { id: node.id, kind: def.kind, root, body: root };
    }
    default: {
      const root = h("div", "ai-box");
      const header = h("div", "ai-box-header");
      const body = h("div", "ai-box-body");
      root.append(header, body);
      return { id: node.id, kind: def.kind, root, body, header };
    }
  }
}
function getGroupView(ctx, node) {
  let view = ctx.st.groups.get(node.id);
  if (view && view.kind !== node.def.kind) {
    view.root.remove();
    view = void 0;
  }
  if (!view) {
    view = createGroupView(ctx, node);
    ctx.st.groups.set(node.id, view);
  }
  if (view.header) {
    if (view.kind === "foldout") {
      if (view.header.getAttribute("value") !== node.def.label) view.header.setAttribute("value", node.def.label);
    } else {
      view.header.textContent = node.def.label;
      view.header.classList.toggle("ai-hidden", !node.def.showLabel);
    }
  }
  return view;
}
function selectTab(bar, pages, name) {
  for (const [n, page] of pages) page.classList.toggle("active", n === name);
  bar.querySelectorAll("[data-ai-tab]").forEach((t) => t.classList.toggle("active", t.dataset.aiTab === name));
}
function syncNodes(ctx, container, nodes, pass) {
  const els = [];
  let anyVisible = false;
  for (const node of nodes) {
    if (node.kind === "item") {
      const view = getItemView(ctx, node);
      pass.usedViews.add(node.id);
      const state2 = memberState(node.meta, ctx.dump, ctx.remote);
      view.root.classList.toggle("ai-hidden", state2.hidden);
      els.push(view.root);
      if (!state2.hidden) {
        anyVisible = true;
        pass.updates.push(() => updateItem(ctx, view, node, state2));
      }
      continue;
    }
    const g = getGroupView(ctx, node);
    pass.usedGroups.add(node.id);
    let visible;
    if (g.kind === "tab" && g.pages && g.bar) {
      const pages = [];
      const shown = [];
      for (const tab of node.tabs) {
        let page = g.pages.get(tab.name);
        if (!page) {
          page = h("div", "ai-tabpage");
          g.pages.set(tab.name, page);
        }
        if (syncNodes(ctx, page, tab.children, pass)) shown.push(tab.name);
        pages.push(page);
      }
      for (const name of [...g.pages.keys()]) if (!node.tabs.some((t) => t.name === name)) g.pages.delete(name);
      syncChildren(g.body, pages);
      const barHtml = node.tabs.filter((t) => shown.includes(t.name)).map((t) => `<div class="ai-tab" data-ai-tab="${escapeHtml(t.name)}">${escapeHtml(nicify(t.name))}</div>`).join("");
      if (barHtml !== g.barHtml) {
        g.bar.innerHTML = barHtml;
        g.barHtml = barHtml;
      }
      const key = g.bar.dataset.aiTabs;
      let active = activeTabs.get(key);
      if (!active || !shown.includes(active)) active = shown[0];
      if (active) selectTab(g.bar, g.pages, active);
      visible = shown.length > 0;
    } else {
      visible = syncNodes(ctx, g.body, node.children, pass);
    }
    g.root.classList.toggle("ai-hidden", !visible);
    if (visible) anyVisible = true;
    els.push(g.root);
  }
  syncChildren(container, els);
  return anyVisible;
}
function render(panel) {
  const st = panel.__ai;
  if (!st.dump || !st.meta) return;
  const ctx = { panel, st, dump: st.dump, remote: st.remote };
  const pass = { usedViews: /* @__PURE__ */ new Set(), usedGroups: /* @__PURE__ */ new Set(), updates: [] };
  syncNodes(ctx, panel.$.root, buildLayout(st.dump, st.meta), pass);
  for (const [id, v] of st.views) {
    if (!pass.usedViews.has(id)) {
      v.root.remove();
      st.views.delete(id);
    }
  }
  for (const [id, g] of st.groups) {
    if (!pass.usedGroups.has(id)) {
      g.root.remove();
      st.groups.delete(id);
    }
  }
  for (const u of pass.updates) {
    try {
      u();
    } catch (e) {
      console.error("[Advanced Inspector]", e);
    }
  }
}
function clear(panel) {
  const st = panel.__ai;
  panel.$.root.innerHTML = "";
  st.views.clear();
  st.groups.clear();
}
function fireValueChanged(panel) {
  var _a;
  const st = panel.__ai;
  if (!st.dump || !st.meta) return;
  const now = Date.now();
  for (const m of st.meta.members) {
    if (!((_a = m.onChanged) == null ? void 0 : _a.length) || m.kind !== "field") continue;
    const sig = valueSignature(st.dump.value[m.name]);
    const prev = st.lastValues.get(m.name);
    st.lastValues.set(m.name, sig);
    const at = st.pending.get(m.name);
    if (prev === void 0 || prev === sig || !at || now - at > CHANGE_WINDOW_MS) continue;
    for (const method of m.onChanged) invoke(panel, method);
  }
}
function keyOfEvent(e) {
  for (const t of e.composedPath()) {
    const key = t.__aiKey;
    if (typeof key === "string") return key;
  }
  return void 0;
}
var template = '<div class="ai-root"></div>';
var style2 = style;
var $ = { root: ".ai-root" };
function state(panel) {
  if (!panel.__ai) {
    panel.__ai = {
      token: 0,
      dump: null,
      meta: null,
      request: null,
      needsRemote: false,
      remote: null,
      remoteSig: "",
      views: /* @__PURE__ */ new Map(),
      groups: /* @__PURE__ */ new Map(),
      uuid: "",
      lastValues: /* @__PURE__ */ new Map(),
      pending: /* @__PURE__ */ new Map(),
      timer: null,
      polling: false,
      again: false
    };
  }
  return panel.__ai;
}
function ready() {
  const panel = this;
  state(panel);
  panel.$this.style.display = "none";
  const root = panel.$.root;
  root.addEventListener("click", (e) => {
    const target = e.target;
    const btn = target.closest("[data-ai-method]");
    if (btn) {
      if (!btn.disabled) invoke(panel, btn.dataset.aiMethod);
      return;
    }
    const tab = target.closest("[data-ai-tab]");
    if (tab) {
      const bar = tab.parentElement;
      const key = bar.dataset.aiTabs;
      const view = [...panel.__ai.groups.values()].find((g) => g.bar === bar);
      activeTabs.set(key, tab.dataset.aiTab);
      if (view == null ? void 0 : view.pages) selectTab(bar, view.pages, tab.dataset.aiTab);
    }
  });
  root.addEventListener("change-dump", (e) => {
    const key = keyOfEvent(e);
    if (key) panel.__ai.pending.set(key, Date.now());
  });
}
async function update(dump) {
  const panel = this;
  const st = state(panel);
  st.dump = dump;
  const token = ++st.token;
  const host = hostOf(panel);
  const uuid = host.ids(dump).join(",");
  if (uuid !== st.uuid) {
    st.uuid = uuid;
    st.lastValues.clear();
    st.pending.clear();
    st.remote = null;
  }
  const protocol = host.protocol();
  const meta = await getMeta(protocol, dump == null ? void 0 : dump.type, () => {
    var _a;
    if ((_a = panel.__ai) == null ? void 0 : _a.dump) update.call(panel, panel.__ai.dump);
  });
  if (token !== st.token) return;
  if (!meta || !meta.members.length) {
    st.meta = null;
    stopPoll(st);
    clear(panel);
    showDefault(panel, true);
    return;
  }
  if (st.meta !== meta) st.remote = null;
  st.meta = meta;
  const { request: req, needed } = buildEvalRequest(meta, dump);
  req.open = openPaths(dump.type, meta, dump);
  st.request = req;
  st.needsRemote = needed;
  let fresh = false;
  if (!needed) {
    st.remote = null;
    st.remoteSig = "";
  } else if (!st.remote) {
    st.remote = await evalRemote(panel);
    st.remoteSig = JSON.stringify(st.remote);
    fresh = true;
    if (token !== st.token) return;
  }
  showDefault(panel, false);
  render(panel);
  fireValueChanged(panel);
  if (needed) {
    startPoll(panel);
    if (!fresh) refreshRemote(panel);
  } else {
    stopPoll(st);
  }
}
function close() {
  const st = this.__ai;
  if (st) stopPoll(st);
}
function mountInspector(container, host) {
  const wrapper = document.createElement("div");
  const styleEl = document.createElement("style");
  styleEl.textContent = style;
  const root = document.createElement("div");
  root.className = "ai-root";
  wrapper.append(styleEl, root);
  container.appendChild(wrapper);
  let ours = false;
  const panel = { $: { root }, $this: wrapper };
  panel.__aiHost = {
    ...host,
    showDefault(show) {
      ours = !show;
      wrapper.style.display = show ? "none" : "";
      host.showDefault(show);
    }
  };
  ready.call(panel);
  return {
    async update(dump) {
      await update.call(panel, dump);
      return ours;
    },
    close() {
      close.call(panel);
      wrapper.remove();
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  $,
  close,
  mountInspector,
  ready,
  style,
  template,
  update
});
//# sourceMappingURL=component.js.map
