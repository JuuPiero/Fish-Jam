/** Text forms of entries: timestamps, copied lines, exported files. */
import { LogEntry } from './types';

function pad(n: number, w = 2): string {
    let s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
}

/** "HH:MM:SS.mmm" in local time. */
export function formatTime(t: number): string {
    const d = new Date(t);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
}

/** "YYYY-MM-DD" in local time (export file names). */
export function formatDate(t: number): string {
    const d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** The first line of a message (the list shows it when wrapping is off). */
export function firstLine(text: string): string {
    const i = text.indexOf('\n');
    return i < 0 ? text : text.slice(0, i).replace(/\r$/, '');
}

export interface LineOptions {
    time?: boolean;
    stack?: boolean;
    count?: number;
}

/** One entry as text: "[12:00:01.250] [Warning] (scene) message" plus its stack when asked. */
export function entryToText(e: LogEntry, opts: LineOptions = {}): string {
    const lvl = e.level === 'warn' ? 'Warning' : e.level === 'error' ? 'Error' : e.level === 'info' ? 'Info' : e.level === 'success' ? 'Success' : 'Log';
    let s = '';
    if (opts.time !== false) s += '[' + formatTime(e.t) + '] ';
    s += '[' + lvl + '] ';
    s += '(' + e.source + ') ';
    if (opts.count && opts.count > 1) s += '(x' + opts.count + ') ';
    s += e.text;
    if (opts.stack && e.stack && e.text.indexOf(e.stack.trim()) < 0) s += '\n' + e.stack.replace(/\s+$/, '');
    return s;
}

/** The header of an exported file. */
export function exportHeader(project: string, count: number, now: number): string {
    return '# Console Pro export\n# Project: ' + project + '\n# Date: ' + formatDate(now) + ' ' + formatTime(now) + '\n# Lines: ' + count + '\n\n';
}
