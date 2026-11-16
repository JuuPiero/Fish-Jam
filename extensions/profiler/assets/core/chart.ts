/**
 * Chart math for the Profiler window (pure): a "nice" vertical scale, stacked
 * series and the frame under the mouse.
 */

/** A round axis maximum at or above `v` (1, 2, 2.5, 5 x 10^n), for gridlines that read well. */
export function niceMax(v: number): number {
    if (!(v > 0) || !isFinite(v)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return step * p;
}

/** Gridline values (excluding 0) for a nice max: 2 to 5 lines. */
export function gridLines(max: number): number[] {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const m = max / p;
    const n = m === 1 || m === 2 || m === 10 ? 4 : m === 5 ? 5 : m === 2.5 ? 5 : 4;
    const out: number[] = [];
    for (let i = 1; i <= n; i++) out.push((max * i) / n);
    return out;
}

/** Cumulative tops of stacked series: tops[s][f] = sum of series 0..s at frame f. */
export function stack(series: number[][]): number[][] {
    const out: number[][] = [];
    for (let s = 0; s < series.length; s++) {
        const row: number[] = [];
        for (let f = 0; f < series[s].length; f++) row.push((s > 0 ? out[s - 1][f] : 0) + Math.max(0, series[s][f] || 0));
        out.push(row);
    }
    return out;
}

/**
 * Frame index under an x position: frames are drawn right-aligned, the newest
 * at the right edge, `slot` pixels each. -1 outside the data.
 */
export function frameAtX(x: number, width: number, count: number, capacity: number): number {
    const slot = width / Math.max(1, capacity);
    // frame count-1 covers [width - slot, width)
    const fromRight = Math.ceil((width - x) / slot) - 1;
    const i = count - 1 - fromRight;
    return i >= 0 && i < count ? i : -1;
}

/** x of a frame's slot (left edge), with the same layout as frameAtX. */
export function xOfFrame(i: number, width: number, count: number, capacity: number): number {
    const slot = width / Math.max(1, capacity);
    return width - (count - i) * slot;
}

/** Human units: 1.2 ms, 3.4 KB / MB / GB. */
export function formatMs(v: number): string {
    return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' ms';
}

export function formatBytes(v: number): string {
    if (!(v >= 0)) return 'n/a';
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
    return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export function formatCount(v: number): string {
    if (!(v >= 0)) return 'n/a';
    if (v < 10000) return String(Math.round(v));
    if (v < 1e6) return (v / 1000).toFixed(1) + 'k';
    return (v / 1e6).toFixed(2) + 'M';
}
