/**
 * The search box (plain text or regex, case sensitive or not), the level toggles and
 * the channel chips (hide / solo per tag and per source), as one predicate.
 */
import { Level, LogEntry, Source } from './types';

export interface TextQuery {
    /** Empty when the query matches everything. */
    test(text: string): boolean;
    /** [start, end) ranges to highlight in a text. */
    ranges(text: string): number[];
    /** The regex did not compile (shown in the search box). */
    error: string;
    empty: boolean;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileQuery(query: string, regex: boolean, caseSensitive: boolean): TextQuery {
    const q = query || '';
    if (!q) return { test: () => true, ranges: () => [], error: '', empty: true };
    let re: RegExp;
    let error = '';
    try {
        re = new RegExp(regex ? q : escapeRe(q), caseSensitive ? 'g' : 'gi');
    } catch (e) {
        error = String((e as Error).message || e);
        re = new RegExp(escapeRe(q), caseSensitive ? 'g' : 'gi');
    }
    const plain = !regex || !!error;
    const needle = caseSensitive ? q : q.toLowerCase();
    return {
        error,
        empty: false,
        test(text: string): boolean {
            if (plain) return (caseSensitive ? text : text.toLowerCase()).indexOf(needle) >= 0;
            re.lastIndex = 0;
            return re.test(text);
        },
        ranges(text: string): number[] {
            const out: number[] = [];
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            let guard = 0;
            while ((m = re.exec(text)) && guard++ < 500) {
                if (m[0].length === 0) {
                    re.lastIndex++;
                    continue;
                }
                out.push(m.index, m.index + m[0].length);
            }
            return out;
        },
    };
}

export type ChipState = 'hide' | 'solo';

export interface FilterState {
    levels: Record<Level, boolean>;
    /** Per tag ('' is "no tag"). */
    tags: Record<string, ChipState>;
    sources: Partial<Record<Source, ChipState>>;
}

/** Hidden/solo rule for one chip group: any solo shows only the solo'd ones, else hidden ones go. */
export function chipPass(states: Record<string, ChipState | undefined>, key: string, hasSolo: boolean): boolean {
    const s = states[key];
    if (hasSolo) return s === 'solo';
    return s !== 'hide';
}

export function anySolo(states: Record<string, ChipState | undefined>): boolean {
    for (const k in states) if (states[k] === 'solo') return true;
    return false;
}

/** The whole predicate for one entry. Build once per filter change, call per entry. */
export function makePredicate(state: FilterState, query: TextQuery): (e: LogEntry) => boolean {
    const tagSolo = anySolo(state.tags);
    const srcSolo = anySolo(state.sources as Record<string, ChipState>);
    const levels = state.levels;
    return (e: LogEntry) => {
        if (!levels[e.level]) return false;
        if (!chipPass(state.sources as Record<string, ChipState>, e.source, srcSolo)) return false;
        if (!chipPass(state.tags, e.tag, tagSolo)) return false;
        return query.empty || query.test(e.text);
    };
}

/** Next state of a chip: click toggles hide, solo click toggles solo. */
export function cycleChip(states: Record<string, ChipState>, key: string, solo: boolean): Record<string, ChipState> {
    const next: Record<string, ChipState> = {};
    for (const k in states) next[k] = states[k];
    if (solo) {
        if (next[key] === 'solo') delete next[key];
        else next[key] = 'solo';
    } else if (next[key] === 'hide') {
        delete next[key];
    } else {
        next[key] = 'hide';
    }
    return next;
}

/** HTML-escapes a text and wraps the given ranges in <mark>. */
export function highlight(text: string, ranges: number[]): string {
    if (!ranges.length) return escapeHtml(text);
    let out = '';
    let at = 0;
    for (let i = 0; i < ranges.length; i += 2) {
        const s = Math.max(at, ranges[i]);
        const e = ranges[i + 1];
        if (e <= s) continue;
        out += escapeHtml(text.slice(at, s)) + '<mark>' + escapeHtml(text.slice(s, e)) + '</mark>';
        at = e;
    }
    return out + escapeHtml(text.slice(at));
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
