/**
 * Channels: the `[Tag]` a message starts with (`[Hot Reload] ...`, `[C#] ...`),
 * and a guess of the process a Logger record came from.
 */
import { Level, Source } from './types';

/** Prefix the scene package puts on Play-in-Editor logs (`log.changePrefix("PreviewInEditor")`). */
export const PIE_PREFIX_RE = /^\s*\[?\s*PreviewInEditor\s*\]?\s*:?\s*/;

/** Tags that are really sources or noise, not channels. */
const NOT_TAGS = /^(previewineditor|object object|object|array|\d+|[\d.,:\s-]+|x|\s*|log|info|warn|warning|error|debug)$/i;

/**
 * The tag a message starts with, or ''. `[Hot Reload] Swapped` -> "Hot Reload".
 * Leading timestamps like "[12:00:01]" and the PIE prefix are skipped.
 */
export function detectTag(text: string): string {
    let s = (text || '').replace(PIE_PREFIX_RE, '');
    for (let guard = 0; guard < 3; guard++) {
        const m = /^\s*\[([^\[\]\r\n]{1,40})\]/.exec(s);
        if (!m) return '';
        const tag = m[1].trim();
        if (/^[\d:.\s/-]+$/.test(tag)) {
            s = s.slice(m[0].length); // a timestamp: look at the next bracket
            continue;
        }
        return NOT_TAGS.test(tag) ? '' : tag;
    }
    return '';
}

/** Hints of the scene process (engine, scene package, compiled project chunks) in a stack. */
const SCENE_HINTS = /builtin[\\/]scene[\\/]|[\\/]engine[\\/](?:bin|editor|cocos)[\\/]|cce:\/|pack:\/\/\/|[\\/]chunks[\\/][0-9a-f]{2}[\\/]|packer-driver/i;

/** Hints of a panel (editor windows, extension panels). */
const PANEL_HINTS = /packages:\/\/|[\\/]panels?[\\/]|[\\/]dist[\\/]panel|@editor[\\/]panel|[\\/]dock[\\/]/i;

/**
 * Source of a Logger record when the scene script did not confirm it:
 * the main process for "browser" records, PIE for the PreviewInEditor prefix,
 * the scene for engine / chunk frames, otherwise a panel.
 */
export function guessSource(process: string | undefined, text: string, stack: string): Source {
    const p = (process || '').toLowerCase();
    if (p === 'browser' || p === 'main' || p === 'worker') return 'main';
    if (PIE_PREFIX_RE.test(text || '') || /PreviewInEditor/.test((stack || '').slice(0, 300))) return 'game';
    const s = stack || '';
    if (SCENE_HINTS.test(s)) return PANEL_HINTS.test(firstFrames(s)) ? 'panel' : 'scene';
    if (PANEL_HINTS.test(s)) return 'panel';
    return p === 'renderer' ? 'panel' : 'main';
}

function firstFrames(stack: string): string {
    return stack.split(/\r?\n/).slice(0, 6).join('\n');
}

/** Logger "type" to a level ('debug' and unknown types are plain logs). */
export function toLevel(type: string): Level {
    const t = String(type || '').toLowerCase();
    if (t === 'warn' || t === 'warning') return 'warn';
    if (t === 'error' || t === 'fatal' || t === 'assert') return 'error';
    if (t === 'info') return 'info';
    if (t === 'success' || t === 'ok') return 'success';
    return 'log';
}

/**
 * The text a console call produces starts with its first string argument (up to a format
 * directive). Used to pair the scene script's console calls with Logger records.
 */
export function callHead(args: any[]): string {
    if (!args || !args.length || typeof args[0] !== 'string') return '';
    let s: string = args[0];
    const pct = s.search(/%[sdifjoOc%]/);
    if (pct >= 0) s = s.slice(0, pct);
    return s.replace(PIE_PREFIX_RE, '').slice(0, 80);
}

/** True when a Logger record's text can be the output of a call with this head. */
export function headMatches(text: string, head: string): boolean {
    if (!head) return true;
    const t = (text || '').replace(PIE_PREFIX_RE, '');
    if (t.startsWith(head)) return true;
    // a prefix added by the logger ("[Scene] ", a time) still keeps the head near the start
    const at = t.indexOf(head);
    return at >= 0 && at < 64;
}
