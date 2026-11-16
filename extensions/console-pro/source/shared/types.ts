/**
 * Data shared by the main process, the panel and the scene script. Everything here
 * crosses the editor's IPC, so it must stay plain JSON (no classes, no Vue proxies).
 */

export type Level = 'log' | 'info' | 'warn' | 'error' | 'success';

export const LEVELS: Level[] = ['log', 'info', 'warn', 'error', 'success'];

/** Where a line came from: the editor's main process, the edit scene, the running game (PIE) or a panel. */
export type Source = 'main' | 'scene' | 'game' | 'panel';

export const SOURCES: Source[] = ['main', 'scene', 'game', 'panel'];

export interface LogEntry {
    /** Increases with every line; unique for the editor session. */
    id: number;
    /** Milliseconds since the epoch. */
    t: number;
    level: Level;
    /** The full message, as Cocos recorded it. */
    text: string;
    /** The raw stack text ('' when there is none). */
    stack: string;
    source: Source;
    /** The `[Tag]` the message starts with, or ''. */
    tag: string;
    /** Logger's process field ('browser' / 'renderer' / ...). */
    process?: string;
    /** Caught by the scene script's error listener (Cocos did not record it). */
    uncaught?: boolean;
    /** True when the source was confirmed by the scene script, not guessed. */
    sure?: boolean;
}

/** One frame of a parsed stack trace. */
export interface StackFrame {
    /** Function name ('' for anonymous / top level). */
    fn: string;
    /** The url or path exactly as written in the stack. */
    url: string;
    /** 1-based; 0 when unknown. */
    line: number;
    /** 1-based; 0 when unknown. */
    col: number;
    /** The original text of the line. */
    raw: string;
}

/** A frame mapped to a real file (see main/resolve.ts). */
export interface ResolvedFrame {
    /** Absolute file path, '' when the frame points nowhere openable. */
    file: string;
    line: number;
    col: number;
    /** Short label: the path relative to the project, or the url. */
    display: string;
    /** Project code (assets/, extensions/), not engine or editor internals. */
    user: boolean;
    /** True when a source map was applied. */
    mapped?: boolean;
    /** The C# file a generated .ts came from; the line is approximate. */
    cs?: { file: string; line: number; display: string };
}

/** Settings kept by the main process (editor profile). */
export interface ConsoleConfig {
    errorPause: boolean;
    clearOnPlay: boolean;
    capacity: number;
    sceneHook: boolean;
}

export const DEFAULT_CONFIG: ConsoleConfig = {
    errorPause: false,
    clearOnPlay: false,
    capacity: 50000,
    sceneHook: true,
};

/** What a scene process sends to the main process (one batch). */
export interface SceneBatch {
    /** 'scene' for the edit scene process, 'game' for Play-in-Editor. */
    source: 'scene' | 'game';
    /** Console calls seen in that process, used to confirm the source of Logger records. */
    calls?: { level: Level; head: string; t: number }[];
    /** Uncaught errors / unhandled rejections. */
    errors?: { message: string; stack: string; t: number; kind: 'error' | 'rejection' }[];
    /** Play state of the PIE process. */
    play?: { playing: boolean; paused: boolean; t: number };
}

export interface PlayState {
    playing: boolean;
    paused: boolean;
}
