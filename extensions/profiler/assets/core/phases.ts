/**
 * Names of the samples the runtime records for the parts of a frame, and the
 * CPU chart's categories (Unity's CPU Usage colors: Rendering, Scripts...). Pure.
 */
import { FrameData, SAMPLE_STRIDE } from './protocol';
import { BETWEEN_FRAMES } from './recorder';

export const PHASE = {
    input: 'Input & Events',
    start: 'Start (Scripts)',
    update: 'Update (Scripts)',
    lateUpdate: 'LateUpdate (Scripts)',
    postUpdate: 'Post Update',
    rendering: 'Rendering',
    pipeline: 'Render Pipeline',
    endOfFrame: 'End of Frame',
};

/** A director System's update / postUpdate sample: "System: physics.update". */
export function systemSample(id: string, method: 'update' | 'postUpdate'): string {
    return 'System: ' + (id || 'unnamed') + '.' + method;
}

export type CpuCategory = 'Scripts' | 'Systems' | 'Rendering' | 'Input' | 'Other' | 'Idle';

/** Stacking order of the CPU chart (bottom first). */
export const CPU_CATEGORIES: CpuCategory[] = ['Rendering', 'Scripts', 'Systems', 'Input', 'Other', 'Idle'];

/** Category of a top-level sample. */
export function categoryOf(name: string): CpuCategory {
    if (name === PHASE.rendering) return 'Rendering';
    if (name === PHASE.start || name === PHASE.update || name === PHASE.lateUpdate) return 'Scripts';
    if (name.indexOf('System: ') === 0) return 'Systems';
    if (name === PHASE.input || name === BETWEEN_FRAMES) return 'Input';
    return 'Other';
}

/**
 * Milliseconds per CPU category of a frame: top-level samples by category,
 * Other = the rest of the CPU time, Idle = waiting for the next frame.
 */
export function cpuBreakdown(frame: FrameData, names: (id: number) => string): Record<CpuCategory, number> {
    const out: Record<CpuCategory, number> = { Scripts: 0, Systems: 0, Rendering: 0, Input: 0, Other: 0, Idle: 0 };
    const s = frame.samples || [];
    let counted = 0;
    for (let k = 0; k + 3 < s.length; k += SAMPLE_STRIDE) {
        if (s[k + 1] !== -1) continue;
        const dur = Math.max(0, s[k + 3]);
        const name = names(s[k]) || '';
        const c = categoryOf(name);
        // work between frames happened before the frame started: it is not part of cpuMs
        if (name === BETWEEN_FRAMES) {
            out.Input += dur;
            continue;
        }
        out[c] += dur;
        counted += dur;
    }
    out.Other += Math.max(0, frame.cpuMs - counted);
    out.Idle = Math.max(0, frame.frameMs - frame.cpuMs);
    return out;
}
