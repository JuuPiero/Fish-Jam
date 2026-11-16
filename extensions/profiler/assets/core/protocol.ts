/**
 * What travels between a running game and the editor. The game sends
 * telemetry (frames, frame captures); the editor sends a fixed set of
 * commands. Nothing else is accepted: no code is ever sent or run.
 */

/** Ports the editor tries (the first free one); games try them in order. */
export const PROFILER_PORTS = [7471, 7472, 7473];
/** WebSocket path (other tools on the same ports are refused). */
export const PROFILER_PATH = '/profiler';

/** Floats per sample in FrameData.samples: name id, parent index (-1: top level), start ms (from frame start), duration ms. */
export const SAMPLE_STRIDE = 4;

export interface RenderCounters {
    drawCalls: number;
    triangles: number;
    instances: number;
    /** Render passes begun (web only; -1 when unknown). */
    passes: number;
}

export interface MemoryCounters {
    /** JS heap used / total, bytes (-1 when the platform does not report it). */
    heapUsed: number;
    heapTotal: number;
    /** Loaded assets. */
    assets: number;
    /** Estimated texture memory, bytes. */
    textureBytes: number;
}

export interface FrameData {
    /** Frame number (Director's totalFrames when known). */
    index: number;
    /** Game clock at the start of the frame, ms. */
    time: number;
    /** Start to the next frame's start, ms (includes waiting for vsync). */
    frameMs: number;
    /** Begin to end of the frame's work, ms. */
    cpuMs: number;
    /** Flat samples, SAMPLE_STRIDE numbers each, depth-first (a parent before its children). */
    samples: number[];
    render?: RenderCounters;
    /** Sampled about twice a second; absent on the other frames. */
    memory?: MemoryCounters;
    /** Nodes in the scene (sampled with memory). */
    nodes?: number;
}

// ------------------------------------------------------------------ game -> editor

export interface HelloMessage {
    type: 'hello';
    runtime: string;
    url: string;
    agent: string;
    platform: string;
    /** The frame debugger can hook the renderer here (web: yes, native: no). */
    frameDebugger: boolean;
}

export interface FramesMessage {
    type: 'frames';
    /** Sample names first used in this batch (id -> name). */
    names?: Record<number, string>;
    frames: FrameData[];
}

export interface CaptureMessage {
    type: 'capture';
    capture: FrameCaptureData | null;
    error?: string;
}

export type GameMessage = HelloMessage | FramesMessage | CaptureMessage;

// ------------------------------------------------------------------ editor -> game

export type EditorCommand =
    | { cmd: 'record'; on: boolean; deep: boolean }
    | { cmd: 'capture' }
    | { cmd: 'step'; limit: number }
    | { cmd: 'fd-off' };

/** Parses an editor command; anything outside the fixed set is null. */
export function parseCommand(raw: string): EditorCommand | null {
    let m: any;
    try {
        m = JSON.parse(raw);
    } catch (e) {
        return null;
    }
    if (!m || typeof m !== 'object') return null;
    switch (m.cmd) {
        case 'record':
            return { cmd: 'record', on: !!m.on, deep: !!m.deep };
        case 'capture':
            return { cmd: 'capture' };
        case 'step': {
            const n = Math.floor(Number(m.limit));
            return isFinite(n) ? { cmd: 'step', limit: Math.max(-1, n) } : null;
        }
        case 'fd-off':
            return { cmd: 'fd-off' };
        default:
            return null;
    }
}

/** Parses a game message; anything else is null. */
export function parseGameMessage(raw: string): GameMessage | null {
    let m: any;
    try {
        m = JSON.parse(raw);
    } catch (e) {
        return null;
    }
    if (!m || typeof m !== 'object') return null;
    if (m.type === 'hello') {
        return {
            type: 'hello',
            runtime: String(m.runtime || 'Game'),
            url: String(m.url || ''),
            agent: String(m.agent || ''),
            platform: String(m.platform || ''),
            frameDebugger: !!m.frameDebugger,
        };
    }
    if (m.type === 'frames' && Array.isArray(m.frames)) return { type: 'frames', names: m.names && typeof m.names === 'object' ? m.names : undefined, frames: m.frames };
    if (m.type === 'capture') return { type: 'capture', capture: m.capture || null, error: m.error ? String(m.error) : undefined };
    return null;
}

// ------------------------------------------------------------------ frame debugger

export interface CapturePassEvent {
    type: 'pass';
    /** Render pass number in the frame. */
    pass: number;
    width: number;
    height: number;
    /** Color attachments cleared / loaded ("clear", "load", "discard"). */
    color: string[];
    depth: string;
    clearColor: [number, number, number, number] | null;
}

export interface CaptureDrawEvent {
    type: 'draw';
    /** Draw number in the frame (the step index). */
    draw: number;
    /** Render pass it is in. */
    pass: number;
    shader: string;
    effect: string;
    material: string;
    /** Pass index in its material, and the phase ("default", "shadow-caster"...). */
    passIndex: number;
    phase: string;
    /** The node drawn (path), or '' for UI batches, post effects, gizmos... */
    node: string;
    vertices: number;
    indices: number;
    instances: number;
    triangles: number;
}

export type CaptureEvent = CapturePassEvent | CaptureDrawEvent;

export interface FrameCaptureData {
    frame: number;
    events: CaptureEvent[];
    draws: number;
    passes: number;
}
