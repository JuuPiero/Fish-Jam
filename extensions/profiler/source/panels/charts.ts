/**
 * Canvas charts of the Profiler window: stacked bands (CPU) or lines
 * (Rendering, Memory) over the last N frames, newest at the right. Marks
 * follow the data-viz specs: 2px lines, band washes with a surface-colored
 * gap between bands, hairline solid gridlines, muted axis text.
 */
import { gridLines, niceMax, stack, xOfFrame } from '../../assets/core/chart';
import { INK } from './theme';

export interface ChartSeries {
    name: string;
    color: string;
    values: number[];
    visible: boolean;
}

export interface ChartOptions {
    canvas: HTMLCanvasElement;
    capacity: number;
    stacked: boolean;
    series: ChartSeries[];
    /** Axis label text for a value. */
    format: (v: number) => string;
    /** Extra reference lines ("16.7ms (60 FPS)"), drawn when inside the scale. */
    refLines?: { value: number; label: string }[];
    /** A minimum top of the scale (so a quiet chart is not blown up). */
    minMax?: number;
    selected: number;
    hover: number;
}

function hexAlpha(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/** Sizes the canvas backing store to its CSS box. Returns the CSS size. */
export function fitCanvas(c: HTMLCanvasElement): { w: number; h: number; dpr: number } {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
    }
    return { w, h, dpr };
}

export function drawChart(o: ChartOptions): void {
    const { w, h, dpr } = fitCanvas(o.canvas);
    const ctx = o.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK.surface;
    ctx.fillRect(0, 0, w, h);
    const vis = o.series.filter((s) => s.visible);
    const count = o.series.length ? o.series[0].values.length : 0;
    const top = 6;
    const plotH = h - top - 1;
    // scale
    let max = 0;
    if (o.stacked) {
        const tops = stack(vis.map((s) => s.values));
        const last = tops.length ? tops[tops.length - 1] : [];
        for (let i = 0; i < last.length; i++) max = Math.max(max, last[i]);
    } else {
        for (let s = 0; s < vis.length; s++) for (let i = 0; i < vis[s].values.length; i++) max = Math.max(max, vis[s].values[i] || 0);
    }
    max = niceMax(Math.max(max * 1.05, o.minMax || 0));
    const y = (v: number) => top + plotH - (Math.max(0, v) / max) * plotH;
    // grid (hairline, solid) with muted labels
    ctx.font = '10px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'bottom';
    const lines = gridLines(max);
    for (let i = 0; i < lines.length; i++) {
        const gy = Math.round(y(lines[i])) + 0.5;
        ctx.strokeStyle = INK.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
        ctx.fillStyle = INK.muted;
        ctx.fillText(o.format(lines[i]), 4, gy - 1);
    }
    // baseline
    ctx.strokeStyle = INK.baseline;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y(0)) + 0.5);
    ctx.lineTo(w, Math.round(y(0)) + 0.5);
    ctx.stroke();
    const slot = w / Math.max(1, o.capacity);
    const xc = (i: number) => xOfFrame(i, w, count, o.capacity) + slot / 2;
    if (count > 0) {
        if (o.stacked) drawBands(ctx, vis, y, xc, count);
        else drawLines(ctx, vis, y, xc, count);
    }
    // reference lines (frame budgets)
    if (o.refLines) {
        for (let i = 0; i < o.refLines.length; i++) {
            const r = o.refLines[i];
            if (r.value > max) continue;
            const ry = Math.round(y(r.value)) + 0.5;
            ctx.strokeStyle = INK.baseline;
            ctx.beginPath();
            ctx.moveTo(0, ry);
            ctx.lineTo(w, ry);
            ctx.stroke();
            ctx.fillStyle = INK.secondary;
            ctx.textAlign = 'right';
            ctx.fillText(r.label, w - 4, ry - 1);
            ctx.textAlign = 'left';
        }
    }
    // cursors: hover (secondary), selected frame (primary)
    if (o.hover >= 0 && o.hover < count && o.hover !== o.selected) {
        const hx = Math.round(xc(o.hover)) + 0.5;
        ctx.strokeStyle = INK.secondary;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, h);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    if (o.selected >= 0 && o.selected < count) {
        const sx = Math.round(xc(o.selected)) + 0.5;
        ctx.strokeStyle = INK.primary;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
    }
}

function drawBands(ctx: CanvasRenderingContext2D, vis: ChartSeries[], y: (v: number) => number, xc: (i: number) => number, count: number): void {
    const tops = stack(vis.map((s) => s.values));
    for (let s = 0; s < vis.length; s++) {
        const upper = tops[s];
        const lower = s > 0 ? tops[s - 1] : null;
        // wash
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const px = xc(i);
            if (i === 0) ctx.moveTo(px, y(upper[i]));
            else ctx.lineTo(px, y(upper[i]));
        }
        for (let i = count - 1; i >= 0; i--) ctx.lineTo(xc(i), y(lower ? lower[i] : 0));
        ctx.closePath();
        ctx.fillStyle = hexAlpha(vis[s].color, 0.32);
        ctx.fill();
    }
    // band edges: 2px series line, then a surface gap below each band so neighbours separate
    for (let s = 0; s < vis.length; s++) {
        const upper = tops[s];
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (s > 0) {
            const lower = tops[s - 1];
            ctx.strokeStyle = INK.surface;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
                if (i === 0) ctx.moveTo(xc(i), y(lower[i]));
                else ctx.lineTo(xc(i), y(lower[i]));
            }
            ctx.stroke();
        }
        ctx.strokeStyle = vis[s].color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            if (i === 0) ctx.moveTo(xc(i), y(upper[i]));
            else ctx.lineTo(xc(i), y(upper[i]));
        }
        ctx.stroke();
    }
}

function drawLines(ctx: CanvasRenderingContext2D, vis: ChartSeries[], y: (v: number) => number, xc: (i: number) => number, count: number): void {
    for (let s = 0; s < vis.length; s++) {
        const v = vis[s].values;
        // a single series gets a light wash under its line
        if (vis.length === 1) {
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
                if (i === 0) ctx.moveTo(xc(i), y(v[i] || 0));
                else ctx.lineTo(xc(i), y(v[i] || 0));
            }
            ctx.lineTo(xc(count - 1), y(0));
            ctx.lineTo(xc(0), y(0));
            ctx.closePath();
            ctx.fillStyle = hexAlpha(vis[s].color, 0.1);
            ctx.fill();
        }
        ctx.strokeStyle = vis[s].color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < count; i++) {
            const val = v[i];
            if (val === undefined || val < 0 || !isFinite(val)) {
                started = false;
                continue;
            }
            if (!started) {
                ctx.moveTo(xc(i), y(val));
                started = true;
            } else ctx.lineTo(xc(i), y(val));
        }
        ctx.stroke();
    }
}
