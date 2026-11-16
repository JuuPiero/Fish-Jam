/**
 * Stack trace parsing. Handles V8 (Chrome / Electron / Node) frames, including
 * `async`, `new`, `[as x]` and `eval at` frames, Windows paths with a drive
 * colon, and Firefox / Safari `fn@url:line:col` frames (browser preview logs).
 */
import { StackFrame } from './types';

/** "url:line:col" or "url:line" or "url" (the url may itself contain colons: drives, schemes). */
export function splitLocation(loc: string): { url: string; line: number; col: number } {
    const s = loc.trim();
    let m = /^(.*):(\d+):(\d+)$/.exec(s);
    if (m) return { url: m[1], line: Number(m[2]), col: Number(m[3]) };
    m = /^(.*):(\d+)$/.exec(s);
    if (m && !/^[a-z]$/i.test(m[1])) return { url: m[1], line: Number(m[2]), col: 0 };
    return { url: s, line: 0, col: 0 };
}

/** One stack line as a frame, or null when the line is not a frame. */
export function parseFrameLine(raw: string): StackFrame | null {
    const line = raw.trim();
    if (!line) return null;

    // V8: "at fn (loc)" / "at loc"
    if (/^at\s/.test(line)) {
        let rest = line.slice(3).trim();
        if (/^async\s/.test(rest)) rest = rest.slice(6).trim();
        let fn = '';
        let loc = rest;
        if (rest.endsWith(')')) {
            const open = matchingOpen(rest, rest.length - 1);
            if (open > 0) {
                fn = rest.slice(0, open).trim();
                loc = rest.slice(open + 1, -1);
            } else if (open === 0) {
                loc = rest.slice(1, -1);
            }
        }
        // "eval at outer (url:1:2), <anonymous>:3:4": the caller's location is the useful one
        if (/^eval at /.test(loc)) {
            const inner = /\(([^()]+:\d+(?::\d+)?)\)/.exec(loc);
            loc = inner ? inner[1] : '';
        }
        let { url, line: ln, col } = splitLocation(loc);
        // "(index 0)", "(native)": no location
        if (!/[/\\:]/.test(url) && url !== '<anonymous>') {
            if (!fn) return null; // "at least one item": prose, not a frame
            url = '';
        }
        if (!url && !fn) return null;
        return { fn, url, line: ln, col, raw: line };
    }

    // Firefox / Safari: "fn@url:line:col", "@url:line:col"
    const at = line.indexOf('@');
    if (at >= 0 && /:\d+(?::\d+)?$/.test(line)) {
        const fn = line.slice(0, at);
        if (/\s/.test(fn)) return null; // a sentence that happens to contain '@'
        const { url, line: ln, col } = splitLocation(line.slice(at + 1));
        if (!/[/\\]/.test(url)) return null;
        return { fn, url, line: ln, col, raw: line };
    }
    return null;
}

/** Index of the '(' matching the ')' at `close`, or -1. */
function matchingOpen(s: string, close: number): number {
    let depth = 0;
    for (let i = close; i >= 0; i--) {
        const c = s.charCodeAt(i);
        if (c === 41 /* ) */) depth++;
        else if (c === 40 /* ( */) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** Every frame found in a block of text (other lines are skipped). */
export function parseStack(text: string): StackFrame[] {
    const out: StackFrame[] = [];
    if (!text) return out;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const f = parseFrameLine(lines[i]);
        if (f) out.push(f);
    }
    return out;
}

/** True for a line that is a stack frame (used to split a message from the stack printed in it). */
export function isFrameLine(line: string): boolean {
    return parseFrameLine(line) !== null;
}

/**
 * Splits an entry into the message and its frames. The stack field wins; when it is empty
 * (console.error(err) prints the stack into the message) the frames come from the text.
 */
export function entryFrames(text: string, stack: string): StackFrame[] {
    const fromStack = parseStack(stack);
    if (fromStack.length) return dropInternal(fromStack);
    return dropInternal(parseStack(text));
}

/**
 * The message without stack lines that were printed into it (a logged Error).
 * Lines after the first frame line are dropped.
 */
export function messageOnly(text: string): string {
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
        if (isFrameLine(lines[i])) return lines.slice(0, i).join('\n').replace(/\s+$/, '');
    }
    return text;
}

/**
 * File locations written inside a message rather than as stack frames:
 * compiler output such as `assets/Player.cs(12,9): error CS0103` or `assets/a.ts:4:2`,
 * and file / db urls with a line. Used when an entry has no stack.
 */
export function messageLocations(text: string): StackFrame[] {
    const out: StackFrame[] = [];
    const seen: Record<string, true> = {};
    const re = /(?<![\w.:/\\-])((?:file:\/\/\/|db:\/\/|[A-Za-z]:[\\/]|\/|(?:assets|extensions)[\\/])[^\s()'"<>|*?,;]*?\.(?:ts|tsx|js|mjs|cjs|cs|json|effect|chunk|scene|prefab|mtl))(?:\((\d+)(?:,(\d+))?\)|:(\d+)(?::(\d+))?)?(?![\w.])/g;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(text || '')) && guard++ < 50) {
        const url = m[1];
        const line = Number(m[2] || m[4] || 0);
        const col = Number(m[3] || m[5] || 0);
        const key = url + ':' + line + ':' + col;
        if (seen[key]) continue;
        seen[key] = true;
        out.push({ fn: '', url, line, col, raw: m[0] });
    }
    return out;
}

/**
 * Frames that belong to the logging machinery, not to the code that logged:
 * Cocos' logger, the console wrappers (ours included), Node / Electron internals.
 */
const INTERNAL = [
    /electron-logger/,
    /@base[\\/]electron/,
    /^node:/,
    /^internal[\\/]/,
    /electron[\\/]js2c/,
    /console-pro[\\/]dist[\\/]scene\.js/,
];

export function isInternalFrame(f: StackFrame): boolean {
    for (let i = 0; i < INTERNAL.length; i++) if (INTERNAL[i].test(f.url)) return true;
    return false;
}

/** Drops logging frames from the top of the stack only (the rest is kept as written). */
export function dropInternal(frames: StackFrame[]): StackFrame[] {
    let i = 0;
    while (i < frames.length && (isInternalFrame(frames[i]) || /^console\.(log|info|warn|error|debug)$/.test(frames[i].fn))) i++;
    return i ? frames.slice(i) : frames;
}
