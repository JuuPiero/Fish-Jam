"use strict";

// source/main/pixel-worker.ts
var import_worker_threads = require("worker_threads");

// source/shared/image/options.ts
function parseColor(hex) {
  let h = String(hex || "").trim().replace(/^#/, "");
  (h.length === 3 || h.length === 4) && (h = h.split("").map((c) => c + c).join(""));
  let n = (i) => parseInt(h.slice(i, i + 2), 16);
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h) ? { r: n(0), g: n(2), b: n(4), alpha: h.length === 8 ? n(6) / 255 : 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
}

// source/shared/image/pixels.ts
function opaqueBounds(rgba, width, height, threshold = 0) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    let row = y * width * 4;
    for (let x = 0; x < width; x++)
      rgba[row + x * 4 + 3] > threshold && (x < minX && (minX = x), x > maxX && (maxX = x), y < minY && (minY = y), y > maxY && (maxY = y));
  }
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
function mul(a, b) {
  let o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}
function saturateMatrix(s) {
  return [
    0.2126 + 0.7874 * s,
    0.7152 - 0.7152 * s,
    0.0722 - 0.0722 * s,
    0.2126 - 0.2126 * s,
    0.7152 + 0.2848 * s,
    0.0722 - 0.0722 * s,
    0.2126 - 0.2126 * s,
    0.7152 - 0.7152 * s,
    0.0722 + 0.9278 * s
  ];
}
function hueMatrix(deg) {
  let a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072
  ];
}
function isIdentity(o) {
  return !o.brightness && !o.contrast && !o.saturation && !o.hue && !o.grayscale && !(o.tintAmount > 0);
}
function adjustPixels(rgba, o) {
  if (isIdentity(o)) return;
  let lut = new Uint8ClampedArray(256), b = Math.max(-100, Math.min(100, o.brightness || 0)) / 100 * 255, C = Math.max(-100, Math.min(100, o.contrast || 0)) * 2.55, cf = 259 * (C + 255) / (255 * (259 - C));
  for (let v = 0; v < 256; v++) lut[v] = cf * (v + b - 128) + 128;
  let m = null, sat = o.grayscale ? 0 : 1 + Math.max(-100, Math.min(100, o.saturation || 0)) / 100;
  sat !== 1 && (m = saturateMatrix(sat)), o.hue && (m = m ? mul(hueMatrix(o.hue), m) : hueMatrix(o.hue));
  let t = parseColor(o.tint || "#ffffff"), ta = Math.max(0, Math.min(100, o.tintAmount || 0)) / 100, tr = 1 - ta + ta * t.r / 255, tg = 1 - ta + ta * t.g / 255, tb = 1 - ta + ta * t.b / 255;
  for (let i = 0; i < rgba.length; i += 4) {
    let r = lut[rgba[i]], g = lut[rgba[i + 1]], bl = lut[rgba[i + 2]];
    if (m) {
      let nr = m[0] * r + m[1] * g + m[2] * bl, ng = m[3] * r + m[4] * g + m[5] * bl, nb = m[6] * r + m[7] * g + m[8] * bl;
      r = nr, g = ng, bl = nb;
    }
    r *= tr, g *= tg, bl *= tb, rgba[i] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r), rgba[i + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g), rgba[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : Math.round(bl);
  }
}
function premultiply(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    let a = rgba[i + 3];
    a !== 255 && (rgba[i] = Math.round(rgba[i] * a / 255), rgba[i + 1] = Math.round(rgba[i + 1] * a / 255), rgba[i + 2] = Math.round(rgba[i + 2] * a / 255));
  }
}
function alphaBleed(rgba, width, height) {
  let n = width * height, filled = new Uint8Array(n), frontier = [];
  for (let i = 0; i < n; i++) rgba[i * 4 + 3] > 0 && (filled[i] = 1);
  let isEdge = (i) => {
    let x = i % width, y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      let yy = y + dy;
      if (!(yy < 0 || yy >= height))
        for (let dx = -1; dx <= 1; dx++) {
          let xx = x + dx;
          if ((dx || dy) && xx >= 0 && xx < width && filled[yy * width + xx]) return !0;
        }
    }
    return !1;
  };
  for (let i = 0; i < n; i++) !filled[i] && isEdge(i) && frontier.push(i);
  if (!frontier.length) return;
  let queued = new Uint8Array(n);
  for (let i of frontier) queued[i] = 1;
  for (; frontier.length; ) {
    let done = [];
    for (let i of frontier) {
      let x = i % width, y = (i - x) / width, r = 0, g = 0, b = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        let yy = y + dy;
        if (!(yy < 0 || yy >= height))
          for (let dx = -1; dx <= 1; dx++) {
            let xx = x + dx;
            if (!(dx || dy) || xx < 0 || xx >= width) continue;
            let j = yy * width + xx;
            filled[j] && (r += rgba[j * 4], g += rgba[j * 4 + 1], b += rgba[j * 4 + 2], count++);
          }
      }
      count && (rgba[i * 4] = Math.round(r / count), rgba[i * 4 + 1] = Math.round(g / count), rgba[i * 4 + 2] = Math.round(b / count), done.push(i));
    }
    for (let i of done) filled[i] = 1;
    let next = [];
    for (let i of done) {
      let x = i % width, y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        let yy = y + dy;
        if (!(yy < 0 || yy >= height))
          for (let dx = -1; dx <= 1; dx++) {
            let xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            let j = yy * width + xx;
            !filled[j] && !queued[j] && (queued[j] = 1, next.push(j));
          }
      }
    }
    frontier = next;
  }
}
function hasTransparency(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return !0;
  return !1;
}

// source/main/pixel-job.ts
function countColours(rgba, limit) {
  let seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    let key = (rgba[i] << 24 | rgba[i + 1] << 16 | rgba[i + 2] << 8 | rgba[i + 3]) >>> 0;
    if (!seen.has(key) && (seen.add(key), seen.size > limit))
      return seen.size;
  }
  return seen.size;
}
function runPixelJob(data, job) {
  let out = {};
  return job.boundsThreshold !== void 0 && (out.bounds = opaqueBounds(data, job.width, job.height, job.boundsThreshold)), job.adjust && adjustPixels(data, job.adjust), job.alpha === "premultiply" ? premultiply(data) : job.alpha === "bleed" && alphaBleed(data, job.width, job.height), job.transparency && (out.transparent = hasTransparency(data)), job.countColours !== void 0 && (out.colours = countColours(data, job.countColours)), out;
}
var INLINE_PIXELS = 512 * 512;

// source/main/pixel-worker.ts
if (import_worker_threads.parentPort) {
  let port = import_worker_threads.parentPort;
  port.on("message", (msg) => {
    try {
      let data = new Uint8Array(msg.data), result = runPixelJob(data, msg.job);
      port.postMessage({ id: msg.id, ok: !0, result, data: data.buffer }, [data.buffer]);
    } catch (e) {
      port.postMessage({ id: msg.id, ok: !1, error: e && e.message ? e.message : String(e) });
    }
  });
}
//# sourceMappingURL=pixel-worker.js.map
