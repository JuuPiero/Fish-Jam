/**
 * Frame Debugger data helpers (pure): the event tree grouped by render pass,
 * and readable names for load ops.
 */
import { CaptureDrawEvent, CaptureEvent, CapturePassEvent, FrameCaptureData } from './protocol';

export interface PassGroup {
    pass: CapturePassEvent | null;
    draws: CaptureDrawEvent[];
}

/** Draws grouped under the render pass they are in (draws before any pass go to a group without one). */
export function groupByPass(events: CaptureEvent[]): PassGroup[] {
    const out: PassGroup[] = [];
    let cur: PassGroup | null = null;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.type === 'pass') {
            cur = { pass: e, draws: [] };
            out.push(cur);
        } else {
            if (!cur) {
                cur = { pass: null, draws: [] };
                out.push(cur);
            }
            cur.draws.push(e);
        }
    }
    return out;
}

/** gfx LoadOp value -> name. */
export function loadOpName(op: number | undefined): string {
    return op === 1 ? 'clear' : op === 2 ? 'discard' : op === 0 ? 'load' : '';
}

/** Short label of a draw for the event list. */
export function drawLabel(d: CaptureDrawEvent): string {
    const what = d.node || d.material || d.effect || d.shader || 'Draw';
    return 'Draw ' + (d.instances > 1 ? 'Instanced ' : '') + (d.indices ? 'Mesh' : 'Arrays') + ' ' + what;
}

/** Label of a pass for the event list. */
export function passLabel(p: CapturePassEvent | null): string {
    if (!p) return 'Draws outside a render pass';
    const clear = p.color.indexOf('clear') >= 0 || p.depth === 'clear' ? ' (Clear)' : '';
    return 'Render Pass #' + p.pass + ' ' + p.width + 'x' + p.height + clear;
}

/** Totals of a capture. */
export function summarize(c: FrameCaptureData): { draws: number; passes: number; triangles: number; instances: number } {
    let triangles = 0;
    let instances = 0;
    for (let i = 0; i < c.events.length; i++) {
        const e = c.events[i];
        if (e.type !== 'draw') continue;
        triangles += e.triangles;
        instances += Math.max(1, e.instances);
    }
    return { draws: c.draws, passes: c.passes, triangles, instances };
}
