/**
 * Canvas drawing for the Audio Editor: time ruler (with loop region and
 * markers) and the waveform lanes (min/max per pixel column when zoomed out,
 * a line through the samples when zoomed in), selection and playhead.
 */
import { PeakCache, rangeMinMax } from '../../shared/audio/analysis';
import { formatTime } from '../../shared/audio/types';
import type { Marker, LoopRegion } from '../../shared/audio/types';

export interface ViewState {
    channels: Float32Array[];
    peaks: PeakCache | null;
    sampleRate: number;
    length: number;
    /** First visible sample (may be fractional). */
    viewStart: number;
    /** Samples per CSS pixel (< 1 when zoomed in past one sample per pixel). */
    spp: number;
    selStart: number;
    selEnd: number;
    markers: Marker[];
    loop: LoopRegion | null;
    playhead: number | null;
    /** Vertical zoom of the lanes (1 = full scale). */
    vzoom: number;
}

export interface Theme {
    bg: string;
    lane: string;
    wave: string;
    waveSel: string;
    center: string;
    grid: string;
    text: string;
    selection: string;
    cursor: string;
    playhead: string;
    marker: string;
    loop: string;
    rulerBg: string;
    clip: string;
}

function cssVar(el: Element, name: string, fallback: string): string {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
}

export function readTheme(el: Element): Theme {
    return {
        bg: cssVar(el, '--color-normal-fill-emphasis', '#2b2b2b'),
        lane: cssVar(el, '--color-normal-fill-important', '#262626'),
        wave: cssVar(el, '--color-info-fill', '#4d8fd6'),
        waveSel: cssVar(el, '--color-focus-contrast', '#ffffff'),
        center: cssVar(el, '--color-normal-border', '#191919'),
        grid: cssVar(el, '--color-normal-fill-weaker', '#3c3c3c'),
        text: cssVar(el, '--color-normal-contrast', '#cccccc'),
        selection: cssVar(el, '--color-focus-fill-important', '#2c5d87'),
        cursor: cssVar(el, '--color-normal-contrast-emphasis', '#eeeeee'),
        playhead: cssVar(el, '--color-success-fill', '#5fbf5f'),
        marker: cssVar(el, '--color-warn-fill', '#e0a030'),
        loop: cssVar(el, '--color-primary-fill', '#3a72a8'),
        rulerBg: cssVar(el, '--color-normal-fill-weaker', '#3c3c3c'),
        clip: cssVar(el, '--color-danger-fill', '#e05555'),
    };
}

export const RULER_HEIGHT = 34;
const MARKER_STRIP = 13;

/** Seconds between major ruler ticks so they are at least `minPx` apart. */
export function tickStep(secondsPerPixel: number, minPx = 90): number {
    const steps = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
    for (const s of steps) if (s / secondsPerPixel >= minPx) return s;
    return 3600;
}

function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

function xOf(s: ViewState, sample: number): number {
    return (sample - s.viewStart) / s.spp;
}

export function drawRuler(canvas: HTMLCanvasElement, w: number, s: ViewState, t: Theme): void {
    const ctx = sizeCanvas(canvas, w, RULER_HEIGHT);
    ctx.fillStyle = t.rulerBg;
    ctx.fillRect(0, 0, w, RULER_HEIGHT);
    // loop region
    if (s.loop) {
        const a = Math.max(0, xOf(s, s.loop.start));
        const b = Math.min(w, xOf(s, s.loop.end));
        if (b > a) {
            ctx.fillStyle = t.loop;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(a, 0, b - a, MARKER_STRIP);
            ctx.globalAlpha = 1;
            ctx.fillStyle = t.text;
            ctx.font = '10px sans-serif';
            // Right-aligned so it does not collide with a marker label at the loop start.
            if (b - a > 40) {
                ctx.textAlign = 'right';
                ctx.fillText('Loop', b - 3, 10);
                ctx.textAlign = 'left';
            }
        }
    }
    // selection band
    if (s.selEnd > s.selStart) {
        const a = Math.max(0, xOf(s, s.selStart));
        const b = Math.min(w, xOf(s, s.selEnd));
        if (b > a) {
            ctx.fillStyle = t.selection;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(a, MARKER_STRIP, b - a, RULER_HEIGHT - MARKER_STRIP);
            ctx.globalAlpha = 1;
        }
    }
    // ticks
    const spx = s.spp / s.sampleRate;
    const step = tickStep(spx);
    const minor = step / 5;
    const t0 = s.viewStart / s.sampleRate;
    const t1 = t0 + w * spx;
    ctx.strokeStyle = t.text;
    ctx.fillStyle = t.text;
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const first = Math.floor(t0 / minor) * minor;
    for (let k = 0; ; k++) {
        const time = first + k * minor;
        if (time > t1) break;
        const x = Math.round((time - t0) / spx) + 0.5;
        const major = Math.abs(time / step - Math.round(time / step)) < 1e-6;
        ctx.moveTo(x, RULER_HEIGHT);
        ctx.lineTo(x, RULER_HEIGHT - (major ? 10 : 4));
        if (major && time >= -1e-9) {
            const decimals = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
            ctx.fillText(tickLabel(time, decimals), x + 3, RULER_HEIGHT - 12);
        }
    }
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // markers
    for (const m of s.markers) {
        const x = Math.round(xOf(s, m.position)) + 0.5;
        if (x < -100 || x > w + 2) continue;
        ctx.fillStyle = t.marker;
        ctx.beginPath();
        ctx.moveTo(x - 5, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x + 5, 7);
        ctx.lineTo(x, MARKER_STRIP - 1);
        ctx.lineTo(x - 5, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = t.text;
        ctx.fillText(m.name, x + 7, 10);
    }
    ctx.strokeStyle = t.center;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(w, RULER_HEIGHT - 0.5);
    ctx.stroke();
}

/** Marker under a ruler x position (within 6 px), or null. */
export function markerAt(s: ViewState, x: number, y: number): Marker | null {
    if (y > MARKER_STRIP + 2) return null;
    let best: Marker | null = null;
    let bestD = 7;
    for (const m of s.markers) {
        const d = Math.abs(xOf(s, m.position) - x);
        if (d < bestD) {
            bestD = d;
            best = m;
        }
    }
    return best;
}

export function drawWaves(canvas: HTMLCanvasElement, w: number, h: number, s: ViewState, t: Theme): void {
    const ctx = sizeCanvas(canvas, w, h);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, w, h);
    const n = s.channels.length;
    if (!n) return;
    const gap = 2;
    const laneH = (h - gap * (n - 1)) / n;
    const selA = xOf(s, s.selStart);
    const selB = xOf(s, s.selEnd);
    const hasSel = s.selEnd > s.selStart;
    const endX = Math.min(w, xOf(s, s.length));

    for (let c = 0; c < n; c++) {
        const top = c * (laneH + gap);
        const mid = top + laneH / 2;
        const amp = (laneH / 2 - 1) * s.vzoom;
        ctx.fillStyle = t.lane;
        ctx.fillRect(0, top, Math.max(0, endX), laneH);
        if (hasSel) {
            const a = Math.max(0, selA);
            const b = Math.min(endX, selB);
            if (b > a) {
                ctx.fillStyle = t.selection;
                ctx.fillRect(a, top, Math.max(1, b - a), laneH);
            }
        }
        // grid lines at +-0.5
        ctx.strokeStyle = t.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const g of [-0.5, 0.5]) {
            const y = Math.round(mid - g * amp) + 0.5;
            if (y > top && y < top + laneH) {
                ctx.moveTo(0, y);
                ctx.lineTo(endX, y);
            }
        }
        ctx.stroke();
        ctx.strokeStyle = t.center;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(mid) + 0.5);
        ctx.lineTo(endX, Math.round(mid) + 0.5);
        ctx.stroke();

        const ch = s.channels[c];
        const peaks = s.peaks ? s.peaks.channels[c] : null;
        const block = s.peaks ? s.peaks.block : 256;
        const clampY = (v: number) => Math.max(top, Math.min(top + laneH, mid - v * amp));
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, top, w, laneH);
        ctx.clip();
        if (s.spp >= 1) {
            const cols = Math.ceil(endX);
            for (let x = 0; x < cols; x++) {
                const s0 = s.viewStart + x * s.spp;
                const s1 = s0 + s.spp;
                if (s1 <= 0) continue;
                const [lo, hi] = rangeMinMax(ch, peaks, block, Math.max(0, s0), Math.min(s.length, s1));
                const inSel = hasSel && x >= selA && x < selB;
                ctx.fillStyle = hi > 1 || lo < -1 ? t.clip : inSel ? t.waveSel : t.wave;
                const y0 = clampY(hi);
                const y1 = clampY(lo);
                ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
            }
        } else {
            const i0 = Math.max(0, Math.floor(s.viewStart) - 1);
            const i1 = Math.min(s.length - 1, Math.ceil(s.viewStart + w * s.spp) + 1);
            ctx.strokeStyle = t.wave;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = i0; i <= i1; i++) {
                const x = xOf(s, i);
                const y = clampY(ch[i]);
                if (i === i0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            if (1 / s.spp >= 6) {
                ctx.fillStyle = t.wave;
                for (let i = i0; i <= i1; i++) {
                    const x = xOf(s, i);
                    ctx.fillRect(x - 1.5, clampY(ch[i]) - 1.5, 3, 3);
                }
            }
        }
        ctx.restore();
        ctx.fillStyle = t.text;
        ctx.globalAlpha = 0.6;
        ctx.font = '10px sans-serif';
        ctx.fillText(n === 2 ? (c === 0 ? 'L' : 'R') : n === 1 ? 'Mono' : `Ch ${c + 1}`, 4, top + 11);
        ctx.globalAlpha = 1;
    }
    // loop region edges
    if (s.loop) {
        ctx.strokeStyle = t.loop;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (const p of [s.loop.start, s.loop.end]) {
            const x = Math.round(xOf(s, p)) + 0.5;
            if (x >= 0 && x <= w) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    // markers
    ctx.strokeStyle = t.marker;
    ctx.beginPath();
    for (const m of s.markers) {
        const x = Math.round(xOf(s, m.position)) + 0.5;
        if (x >= 0 && x <= w) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
    }
    ctx.stroke();
    // cursor (empty selection)
    if (!hasSel) {
        const x = Math.round(selA) + 0.5;
        if (x >= 0 && x <= w) {
            ctx.strokeStyle = t.cursor;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    }
}

export function drawOverlay(canvas: HTMLCanvasElement, w: number, h: number, s: ViewState, t: Theme): void {
    const ctx = sizeCanvas(canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    if (s.playhead === null) return;
    const x = Math.round(xOf(s, s.playhead)) + 0.5;
    if (x < 0 || x > w) return;
    ctx.strokeStyle = t.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = t.playhead;
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
}

/** "m:ss" or "m:ss.ddd" with `decimals` fraction digits. */
export function tickLabel(time: number, decimals: number): string {
    const k = Math.pow(10, decimals);
    const total = Math.round(Math.max(0, time) * k);
    const whole = Math.floor(total / k);
    if (!decimals) return formatTime(whole, false);
    return formatTime(whole, false) + '.' + String(total % k).padStart(decimals, '0');
}
