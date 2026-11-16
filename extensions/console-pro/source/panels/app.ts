/**
 * Console Pro panel app: Unity's Console with Console Pro's extras. A virtualized list
 * (fixed rows, or estimated heights when wrapping), level toggles with counts,
 * search (text / regex / case), channel chips (tags and sources, hide / solo),
 * collapse, a details pane with a clickable stack, copy and export.
 *
 * Entries live in a LogStore outside Vue's reactivity; Vue only renders the rows in view.
 */
import { createApp, nextTick } from 'vue';
import { compileQuery, cycleChip, highlight, makePredicate, ChipState, TextQuery } from '../shared/filter';
import { entryToText, exportHeader, firstLine, formatDate, formatTime } from '../shared/format';
import { entryFrames, isInternalFrame, messageLocations, messageOnly } from '../shared/stack';
import { LogStore } from '../shared/store';
import { ConsoleConfig, DEFAULT_CONFIG, Level, LEVELS, LogEntry, PlayState, ResolvedFrame, Source, SOURCES, StackFrame } from '../shared/types';
import { ICONS, LEVEL_ICONS } from './icons';
import { TEMPLATE } from './template';

const PKG = 'console-pro';
const UI_KEY = 'console-pro.ui';
const ROW_H = 20;
const WRAP_LINE_H = 16;
const WRAP_MAX_LINES = 12;
const OVERSCAN = 6;
/** Unity's "Log Entry > N Lines": text line height and the most lines a row shows. */
const ENTRY_LINE_H = 16;
const ENTRY_MAX_LINES = 10;

/** Height of a row showing `lines` text lines (1: the classic 20 px row). */
export function entryRowHeight(lines: number): number {
    const n = clampLines(lines);
    return n <= 1 ? ROW_H : n * ENTRY_LINE_H + 8;
}

export function clampLines(lines: any): number {
    const n = Math.round(Number(lines) || 1);
    return n < 1 ? 1 : n > ENTRY_MAX_LINES ? ENTRY_MAX_LINES : n;
}

/** The first `lines` lines of an entry, like Unity: the message, then its stack frames. */
export function entryPreview(text: string, stack: string, lines: number): string {
    const out: string[] = [];
    const msg = messageOnly(text) || text;
    const ml = msg.split('\n');
    for (let i = 0; i < ml.length && out.length < lines; i++) out.push(ml[i].length > 1000 ? ml[i].slice(0, 1000) : ml[i]);
    if (out.length < lines) {
        const frames = entryFrames(text, stack);
        for (let i = 0; i < frames.length && out.length < lines; i++) {
            if (isInternalFrame(frames[i])) continue;
            out.push(frames[i].raw.trim());
        }
    }
    return out.join('\n');
}

const LEVEL_TITLES: Record<Level, string> = { log: 'Logs', info: 'Info', warn: 'Warnings', error: 'Errors', success: 'Success' };
const SOURCE_LABELS: Record<Source, string> = { main: 'Main', scene: 'Scene', game: 'Game', panel: 'Panel' };
const SOURCE_TITLES: Record<Source, string> = {
    main: "The editor's main process (asset-db, builder, extensions' main scripts)",
    scene: 'The edit scene process (scene scripts, engine in the editor)',
    game: 'The game running in Play-in-Editor',
    panel: 'Editor panels',
};

export interface UiState {
    levels: Record<Level, boolean>;
    query: string;
    regex: boolean;
    caseSensitive: boolean;
    collapse: boolean;
    time: boolean;
    wrap: boolean;
    tags: Record<string, ChipState>;
    sources: Partial<Record<Source, ChipState>>;
    detailsH: number;
    sourceColumn: boolean;
    colorText: boolean;
    preferCs: boolean;
    /** Unity's "Log Entry": 1 to 10 text lines per row (not used while wrapping). */
    entryLines: number;
}

export function defaultUi(): UiState {
    return {
        levels: { log: true, info: true, warn: true, error: true, success: true },
        query: '',
        regex: false,
        caseSensitive: false,
        collapse: false,
        time: false,
        wrap: false,
        tags: {},
        sources: {},
        detailsH: 140,
        sourceColumn: true,
        colorText: true,
        preferCs: true,
        entryLines: 1,
    };
}

function loadUi(): UiState {
    const def = defaultUi();
    try {
        const raw = localStorage.getItem(UI_KEY);
        if (raw) {
            const o = JSON.parse(raw);
            const out = Object.assign(def, o);
            out.levels = Object.assign(defaultUi().levels, o.levels || {});
            out.entryLines = clampLines(out.entryLines);
            return out;
        }
    } catch (e) {
        // defaults
    }
    return def;
}

function request(method: string, ...args: any[]): Promise<any> {
    return Editor.Message.request(PKG, method, ...args) as Promise<any>;
}

/** A frame as shown in the details pane. */
interface FrameView {
    fn: string;
    display: string;
    file: string;
    line: number;
    col: number;
    user: boolean;
    internal: boolean;
    mapped: boolean;
    raw: string;
    cs: ResolvedFrame['cs'] | null;
}

interface DetailView {
    id: number;
    message: string;
    frames: FrameView[];
    fromMessage: boolean;
    meta: string;
}

interface RowView {
    key: string;
    index: number;
    top: number;
    height: number;
    level: Level;
    icon: string;
    html: string;
    time: string;
    source: string;
    count: number;
    odd: boolean;
    sel: boolean;
    tip: string;
}

/** Everything that must not be reactive (large, or changed outside Vue). */
interface Ctx {
    store: LogStore;
    query: TextQuery;
    /** Wrap mode: top of each row (length rows + 1). */
    offsets: number[] | null;
    charW: number;
    selection: Set<string>;
    anchorKey: string;
    focusKey: string;
    detailEntry: LogEntry | null;
    detailFrames: StackFrame[];
    resolved: Map<number, ResolvedFrame[]>;
    lastId: number;
    loaded: boolean;
    pending: LogEntry[];
    queryTimer: any;
    saveTimer: any;
    toastTimer: any;
    scrollRaf: number;
    resizeObs: ResizeObserver | null;
    stickBottom: boolean;
}

export function createConsoleApp(el: HTMLElement): { vm: any; dispose(): void } {
    const ctx: Ctx = {
        store: new LogStore(DEFAULT_CONFIG.capacity),
        query: compileQuery('', false, false),
        offsets: null,
        charW: 7,
        selection: new Set(),
        anchorKey: '',
        focusKey: '',
        detailEntry: null,
        detailFrames: [],
        resolved: new Map(),
        lastId: 0,
        loaded: false,
        pending: [],
        queryTimer: 0,
        saveTimer: 0,
        toastTimer: 0,
        scrollRaf: 0,
        resizeObs: null,
        stickBottom: true,
    };

    const app = createApp({
        template: TEMPLATE,
        data() {
            return {
                ui: loadUi(),
                config: Object.assign({}, DEFAULT_CONFIG) as ConsoleConfig,
                play: { playing: false, paused: false } as PlayState,
                version: 0,
                layoutTick: 0,
                selVersion: 0,
                scrollTop: 0,
                viewH: 300,
                viewW: 600,
                toast: '',
                detail: null as DetailView | null,
                queryError: '',
                icons: ICONS,
            };
        },
        computed: {
            rowCount(this: any): number {
                void this.version;
                return ctx.store.length;
            },
            totalHeight(this: any): number {
                void this.version;
                void this.layoutTick;
                const n = ctx.store.length;
                if (this.ui.wrap && ctx.offsets) return ctx.offsets[Math.min(n, ctx.offsets.length - 1)] || 0;
                return n * this.rowH;
            },
            /** Fixed row height (Log Entry lines); wrapped rows have their own heights. */
            rowH(this: any): number {
                return this.ui.wrap ? ROW_H : entryRowHeight(this.ui.entryLines);
            },
            /** Log Entry lines in use (1 while wrapping). */
            entryLinesUsed(this: any): number {
                return this.ui.wrap ? 1 : clampLines(this.ui.entryLines);
            },
            levelButtons(this: any) {
                void this.version;
                const counts = ctx.store.levelCounts;
                const out: { level: Level; icon: string; count: string; title: string }[] = [];
                for (let i = 0; i < LEVELS.length; i++) {
                    const lv = LEVELS[i];
                    const n = counts[lv] || 0;
                    // Unity shows logs, warnings and errors; info and success only when used
                    if ((lv === 'info' || lv === 'success') && !n && this.ui.levels[lv]) continue;
                    out.push({ level: lv, icon: LEVEL_ICONS[lv], count: n > 999 ? '999+' : String(n), title: LEVEL_TITLES[lv] + ': ' + n + ' (Alt+click: show only these)' });
                }
                return out;
            },
            chips(this: any) {
                void this.version;
                const ui: UiState = this.ui;
                const out: any[] = [];
                const store = ctx.store;
                const srcs = SOURCES.filter((s) => store.sourceCounts[s] > 0 || ui.sources[s]);
                const tags: [string, number][] = [];
                store.tagCounts.forEach((n, t) => {
                    if (t && n > 0) tags.push([t, n]);
                });
                for (const t in ui.tags) if (t && !store.tagCounts.get(t)) tags.push([t, 0]);
                tags.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
                if (srcs.length < 2 && !tags.length && !Object.keys(ui.sources).length) return out;
                for (let i = 0; i < srcs.length; i++) {
                    const s = srcs[i];
                    out.push({ id: 's:' + s, group: 'source', key: s, label: SOURCE_LABELS[s], count: store.sourceCounts[s] || 0, state: ui.sources[s] || '', title: SOURCE_TITLES[s] + '\nClick: hide / show. Double-click or Alt+click: solo.' });
                }
                if (srcs.length && tags.length) out.push({ id: 'sep', sep: true });
                const shown = tags.slice(0, 60);
                for (let i = 0; i < shown.length; i++) {
                    const [t, n] = shown[i];
                    out.push({ id: 't:' + t, group: 'tag', key: t, label: t, count: n, state: ui.tags[t] || '', title: '[' + t + ']\nClick: hide / show. Double-click or Alt+click: solo.' });
                }
                return out;
            },
            chipsActive(this: any): boolean {
                return Object.keys(this.ui.tags).length > 0 || Object.keys(this.ui.sources).length > 0;
            },
            visibleRows(this: any): RowView[] {
                void this.version;
                void this.layoutTick;
                void this.selVersion;
                const ui: UiState = this.ui;
                const store = ctx.store;
                const n = store.length;
                if (!n) return [];
                const top = this.scrollTop;
                const bottom = top + this.viewH;
                const first = Math.max(0, this.rowAt(top) - OVERSCAN);
                const rows: RowView[] = [];
                const q = ctx.query;
                for (let i = first; i < n; i++) {
                    const y = this.rowTop(i);
                    if (y > bottom + OVERSCAN * this.rowH) break;
                    const e = store.rowEntry(i)!;
                    const latest = store.rowLatest(i) || e;
                    const key = store.rowKey(i);
                    const lines = this.entryLinesUsed;
                    const text = ui.wrap
                        ? e.text.length > 4000
                            ? e.text.slice(0, 4000)
                            : e.text
                        : lines > 1
                          ? entryPreview(e.text, e.stack, lines)
                          : clip(firstLine(e.text), 1000);
                    rows.push({
                        key,
                        index: i,
                        top: y,
                        height: this.rowTop(i + 1) - y,
                        level: e.level,
                        icon: LEVEL_ICONS[e.level],
                        html: q.empty ? escape(text) : highlight(text, q.ranges(text)),
                        time: ui.time ? formatTime(latest.t) : '',
                        source: e.source,
                        count: store.rowCount(i),
                        odd: i % 2 === 1,
                        sel: ctx.selection.has(key),
                        tip: e.uncaught ? 'Uncaught (caught by Console Pro)' : '',
                    });
                }
                return rows;
            },
            detailMeta(this: any): string {
                void this.version;
                const d: DetailView | null = this.detail;
                return d ? d.meta : this.rowCount ? 'Select a line to see its details' : '';
            },
            emptyText(this: any): string {
                void this.version;
                if (!ctx.store.entries.length) return 'No messages';
                return 'No messages match the filter';
            },
        },
        methods: {
            // ---------------------------------------------------------------- layout
            rowTop(this: any, i: number): number {
                if (this.ui.wrap && ctx.offsets) {
                    const o = ctx.offsets;
                    return i < o.length ? o[i] : o[o.length - 1] + (i - o.length + 1) * ROW_H;
                }
                return i * this.rowH;
            },
            rowAt(this: any, y: number): number {
                if (this.ui.wrap && ctx.offsets) {
                    const o = ctx.offsets;
                    let lo = 0;
                    let hi = o.length - 2;
                    while (lo < hi) {
                        const mid = (lo + hi + 1) >> 1;
                        if (o[mid] <= y) lo = mid;
                        else hi = mid - 1;
                    }
                    return Math.max(0, lo);
                }
                return Math.floor(y / this.rowH);
            },
            /** Estimated height of a wrapped row (exact enough: the details pane shows everything). */
            wrapHeight(this: any, e: LogEntry): number {
                const fixed = 16 + 10 + (this.ui.time ? 90 : 0) + (this.ui.sourceColumn ? 46 : 0) + (this.ui.collapse ? 40 : 0) + 18;
                const perLine = Math.max(8, Math.floor((this.viewW - fixed) / ctx.charW));
                const text = e.text.length > 4000 ? e.text.slice(0, 4000) : e.text;
                let lines = 0;
                let start = 0;
                while (start <= text.length && lines < WRAP_MAX_LINES) {
                    let end = text.indexOf('\n', start);
                    if (end < 0) end = text.length;
                    lines += Math.max(1, Math.ceil((end - start) / perLine));
                    start = end + 1;
                }
                return Math.max(ROW_H, Math.min(WRAP_MAX_LINES, lines) * WRAP_LINE_H + 4);
            },
            relayout(this: any) {
                if (!this.ui.wrap) {
                    ctx.offsets = null;
                } else {
                    const n = ctx.store.length;
                    const o = new Array(n + 1);
                    o[0] = 0;
                    for (let i = 0; i < n; i++) o[i + 1] = o[i] + this.wrapHeight(ctx.store.rowEntry(i)!);
                    ctx.offsets = o;
                }
                this.layoutTick++;
            },
            extendLayout(this: any) {
                if (!this.ui.wrap || !ctx.offsets) return;
                const o = ctx.offsets;
                const n = ctx.store.length;
                for (let i = o.length - 1; i < n; i++) o.push(o[i] + this.wrapHeight(ctx.store.rowEntry(i)!));
                this.layoutTick++;
            },
            measureChar(this: any) {
                try {
                    const c = document.createElement('canvas').getContext('2d')!;
                    const cs = getComputedStyle(this.$refs.list as HTMLElement);
                    c.font = cs.fontSize + ' ' + cs.fontFamily;
                    const w = c.measureText('abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789').width / 64;
                    if (w > 2 && w < 20) ctx.charW = w;
                } catch (e) {
                    // keep the default
                }
            },

            // ---------------------------------------------------------------- data
            async loadInitial(this: any) {
                let r: any = null;
                try {
                    r = await request('query-logs');
                } catch (e) {
                    r = null;
                }
                if (r) {
                    if (r.config) this.config = Object.assign({}, DEFAULT_CONFIG, r.config);
                    if (r.play) this.play = r.play;
                    ctx.store.capacity = this.config.capacity;
                    const entries: LogEntry[] = Array.isArray(r.entries) ? r.entries : [];
                    ctx.store.reset(entries);
                    ctx.lastId = entries.length ? entries[entries.length - 1].id : 0;
                }
                ctx.loaded = true;
                const pend = ctx.pending.filter((e) => e.id > ctx.lastId);
                ctx.pending = [];
                if (pend.length) {
                    ctx.store.add(pend);
                    ctx.lastId = pend[pend.length - 1].id;
                }
                this.applyFilter(false);
                nextTick(() => this.scrollToBottom());
            },
            onEntries(this: any, batch: LogEntry[]) {
                if (!Array.isArray(batch) || !batch.length) return;
                if (!ctx.loaded) {
                    for (let i = 0; i < batch.length; i++) ctx.pending.push(batch[i]);
                    return;
                }
                let from = 0;
                while (from < batch.length && batch[from].id <= ctx.lastId) from++;
                if (from >= batch.length) return;
                const fresh = from ? batch.slice(from) : batch;
                const stick = this.isAtBottom();
                const how = ctx.store.add(fresh);
                ctx.lastId = fresh[fresh.length - 1].id;
                if (how === 'rebuild') this.relayout();
                else this.extendLayout();
                this.version++;
                if (stick) nextTick(() => this.scrollToBottom());
            },
            onRetag(this: any, changes: { id: number; source: Source }[]) {
                if (!Array.isArray(changes) || !changes.length) return;
                if (ctx.store.retag(changes)) {
                    this.relayout();
                    if (ctx.detailEntry) this.setDetail(ctx.detailEntry, false);
                }
                this.version++;
            },
            onCleared(this: any) {
                ctx.store.clear();
                ctx.selection.clear();
                ctx.anchorKey = ctx.focusKey = '';
                ctx.detailEntry = null;
                ctx.resolved.clear();
                this.detail = null;
                this.relayout();
                this.version++;
                this.selVersion++;
            },
            onPlayState(this: any, p: PlayState & { reason?: string }) {
                if (!p) return;
                this.play = { playing: !!p.playing, paused: !!p.paused };
                if (p.reason === 'error-pause') this.showToast('Play paused on error (Error Pause)');
            },
            onConfig(this: any, c: ConsoleConfig) {
                if (!c) return;
                this.config = Object.assign({}, DEFAULT_CONFIG, c);
                ctx.store.capacity = this.config.capacity;
            },

            // ---------------------------------------------------------------- filter
            applyFilter(this: any, keepScroll = true) {
                const ui: UiState = this.ui;
                ctx.query = compileQuery(ui.query, ui.regex, ui.caseSensitive);
                this.queryError = ctx.query.error;
                ctx.store.setPredicate(makePredicate({ levels: ui.levels, tags: ui.tags, sources: ui.sources }, ctx.query));
                this.relayout();
                this.version++;
                if (keepScroll) nextTick(() => this.revealFocus(true));
            },
            onQueryInput(this: any, v: string) {
                this.ui.query = v;
                if (ctx.queryTimer) clearTimeout(ctx.queryTimer);
                ctx.queryTimer = setTimeout(() => {
                    ctx.queryTimer = 0;
                    this.applyFilter();
                    this.saveUi();
                }, 120);
            },
            setQuery(this: any, v: string) {
                this.ui.query = v;
                this.applyFilter();
                this.saveUi();
            },
            toggleUi(this: any, key: keyof UiState) {
                (this.ui as any)[key] = !(this.ui as any)[key];
                if (key === 'regex' || key === 'caseSensitive') this.applyFilter();
                else if (key === 'wrap' || key === 'time' || key === 'sourceColumn') {
                    this.relayout();
                    nextTick(() => this.revealFocus(true));
                }
                this.saveUi();
            },
            /** Log Entry > N Lines. Keeps the focused line in view. */
            setEntryLines(this: any, n: number) {
                this.ui.entryLines = clampLines(n);
                if (this.ui.wrap) this.ui.wrap = false;
                this.relayout();
                nextTick(() => this.revealFocus(true));
                this.saveUi();
            },
            toggleCollapse(this: any) {
                this.ui.collapse = !this.ui.collapse;
                ctx.store.setCollapse(this.ui.collapse);
                ctx.selection.clear();
                ctx.anchorKey = ctx.focusKey = '';
                this.relayout();
                this.version++;
                this.selVersion++;
                this.saveUi();
            },
            toggleLevel(this: any, level: Level, ev?: MouseEvent) {
                const levels = this.ui.levels as Record<Level, boolean>;
                if (ev && (ev.altKey || ev.ctrlKey || ev.metaKey)) {
                    const only = LEVELS.every((l) => levels[l] === (l === level));
                    LEVELS.forEach((l) => (levels[l] = only ? true : l === level));
                } else {
                    levels[level] = !levels[level];
                }
                this.applyFilter();
                this.saveUi();
            },
            setChip(this: any, group: 'tag' | 'source', key: string, solo: boolean) {
                if (group === 'tag') this.ui.tags = cycleChip(this.ui.tags, key, solo);
                else this.ui.sources = cycleChip(this.ui.sources as Record<string, ChipState>, key, solo);
                this.applyFilter();
                this.saveUi();
            },
            chipClick(this: any, c: any, ev: MouseEvent) {
                this.setChip(c.group, c.key, ev.altKey || ev.ctrlKey || ev.metaKey);
            },
            chipSolo(this: any, c: any) {
                // the two clicks of the double-click toggled "hide" twice: back where it was
                this.setChip(c.group, c.key, true);
            },
            resetChips(this: any) {
                this.ui.tags = {};
                this.ui.sources = {};
                this.applyFilter();
                this.saveUi();
            },
            onChipsWheel(ev: WheelEvent) {
                const el = ev.currentTarget as HTMLElement;
                if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
                    el.scrollLeft += ev.deltaY;
                    ev.preventDefault();
                }
            },
            saveUi(this: any) {
                if (ctx.saveTimer) clearTimeout(ctx.saveTimer);
                ctx.saveTimer = setTimeout(() => {
                    ctx.saveTimer = 0;
                    try {
                        localStorage.setItem(UI_KEY, JSON.stringify(this.ui));
                    } catch (e) {
                        // storage full or blocked
                    }
                }, 200);
            },

            // ---------------------------------------------------------------- settings in the main process
            async toggleConfig(this: any, key: keyof ConsoleConfig) {
                const v = !(this.config as any)[key];
                (this.config as any)[key] = v;
                try {
                    const c = await request('set-config', key, v);
                    if (c) this.config = Object.assign({}, DEFAULT_CONFIG, c);
                } catch (e) {
                    // keep the local value
                }
            },
            async setCapacity(this: any, n: number) {
                try {
                    const c = await request('set-config', 'capacity', n);
                    if (c) this.onConfig(c);
                } catch (e) {
                    // unchanged
                }
            },

            // ---------------------------------------------------------------- scrolling
            onScroll(this: any) {
                if (ctx.scrollRaf) return;
                ctx.scrollRaf = requestAnimationFrame(() => {
                    ctx.scrollRaf = 0;
                    const list = this.$refs.list as HTMLElement;
                    if (list) this.scrollTop = list.scrollTop;
                });
            },
            isAtBottom(this: any): boolean {
                const list = this.$refs.list as HTMLElement;
                if (!list) return true;
                return list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
            },
            scrollToBottom(this: any) {
                const list = this.$refs.list as HTMLElement;
                if (!list) return;
                list.scrollTop = list.scrollHeight;
                this.scrollTop = list.scrollTop;
            },
            ensureVisible(this: any, row: number) {
                const list = this.$refs.list as HTMLElement;
                if (!list || row < 0) return;
                const top = this.rowTop(row);
                const bottom = this.rowTop(row + 1);
                if (top < list.scrollTop) list.scrollTop = top;
                else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
                this.scrollTop = list.scrollTop;
            },
            /** After a filter change: keep the focused row in view, else stay at the bottom. */
            revealFocus(this: any, bottomIfNone: boolean) {
                const row = ctx.store.findRow(ctx.focusKey);
                if (row >= 0) this.ensureVisible(row);
                else if (bottomIfNone) this.scrollToBottom();
            },
            focusList(this: any) {
                const list = this.$refs.list as HTMLElement;
                if (list) list.focus();
                if (!ctx.focusKey && ctx.store.length) this.selectRow(ctx.store.length - 1, false, false);
            },

            // ---------------------------------------------------------------- selection
            onListMouseDown(this: any, ev: MouseEvent) {
                const list = this.$refs.list as HTMLElement;
                if (list && ev.target === list) list.focus();
            },
            rowDown(this: any, r: RowView, ev: MouseEvent) {
                const list = this.$refs.list as HTMLElement;
                if (list) list.focus();
                if (ev.button === 2) {
                    if (!ctx.selection.has(r.key)) this.selectRow(r.index, false, false);
                    return;
                }
                this.selectRow(r.index, ev.shiftKey, ev.ctrlKey || ev.metaKey);
            },
            selectRow(this: any, row: number, extend: boolean, toggle: boolean) {
                const store = ctx.store;
                if (row < 0 || row >= store.length) return;
                const key = store.rowKey(row);
                if (extend && ctx.anchorKey) {
                    const a = store.findRow(ctx.anchorKey);
                    if (a >= 0) {
                        if (!toggle) ctx.selection.clear();
                        const lo = Math.min(a, row);
                        const hi = Math.max(a, row);
                        for (let i = lo; i <= hi; i++) ctx.selection.add(store.rowKey(i));
                    }
                } else if (toggle) {
                    if (ctx.selection.has(key)) ctx.selection.delete(key);
                    else ctx.selection.add(key);
                    ctx.anchorKey = key;
                } else {
                    ctx.selection.clear();
                    ctx.selection.add(key);
                    ctx.anchorKey = key;
                }
                ctx.focusKey = key;
                this.selVersion++;
                const e = store.rowEntry(row);
                if (e) this.setDetail(e, true, store.rowCount(row), store.rowLatest(row));
            },
            selectAll(this: any) {
                ctx.selection.clear();
                for (let i = 0; i < ctx.store.length; i++) ctx.selection.add(ctx.store.rowKey(i));
                this.selVersion++;
            },
            /** Selected rows in list order. */
            selectedEntries(this: any): { e: LogEntry; count: number }[] {
                const out: { e: LogEntry; count: number }[] = [];
                if (!ctx.selection.size) return out;
                const store = ctx.store;
                for (let i = 0; i < store.length; i++) if (ctx.selection.has(store.rowKey(i))) out.push({ e: store.rowEntry(i)!, count: store.rowCount(i) });
                return out;
            },

            // ---------------------------------------------------------------- details
            setDetail(this: any, e: LogEntry, resolve: boolean, count = 1, latest?: LogEntry) {
                ctx.detailEntry = e;
                let frames = entryFrames(e.text, e.stack);
                let fromMessage = false;
                if (!frames.length) {
                    frames = messageLocations(e.text);
                    fromMessage = frames.length > 0;
                }
                ctx.detailFrames = frames;
                const message = e.stack ? e.text : messageOnly(e.text);
                const when = latest && latest !== e ? formatTime(e.t) + ' .. ' + formatTime(latest.t) : formatTime(e.t);
                const meta =
                    (e.level === 'warn' ? 'Warning' : e.level.charAt(0).toUpperCase() + e.level.slice(1)) +
                    '  |  ' + SOURCE_LABELS[e.source] + (e.sure ? '' : ' (guessed)') +
                    (e.tag ? '  |  [' + e.tag + ']' : '') +
                    '  |  ' + when +
                    (count > 1 ? '  |  x' + count : '') +
                    (e.uncaught ? '  |  uncaught' : '');
                const cached = ctx.resolved.get(e.id);
                this.detail = { id: e.id, message, frames: frames.map((f, i) => frameView(f, cached ? cached[i] : null)), fromMessage, meta };
                if (resolve && !cached && frames.length) this.resolveDetail(e, frames);
            },
            async resolveFrames(this: any, e: LogEntry, frames: StackFrame[]): Promise<ResolvedFrame[]> {
                const cached = ctx.resolved.get(e.id);
                if (cached) return cached;
                let res: ResolvedFrame[] = [];
                try {
                    // plain copies: never hand reactive objects to IPC
                    res = (await request('resolve-frames', frames.map((f) => ({ fn: f.fn, url: f.url, line: f.line, col: f.col, raw: f.raw })))) || [];
                } catch (err) {
                    res = [];
                }
                if (ctx.resolved.size > 500) ctx.resolved.clear();
                ctx.resolved.set(e.id, res);
                return res;
            },
            async resolveDetail(this: any, e: LogEntry, frames: StackFrame[]) {
                const res = await this.resolveFrames(e, frames);
                if (!this.detail || this.detail.id !== e.id) return;
                this.detail.frames = frames.map((f, i) => frameView(f, res[i] || null));
            },
            /** Frames of an entry: stack frames, else locations written in the message. */
            framesOf(e: LogEntry): StackFrame[] {
                const frames = entryFrames(e.text, e.stack);
                return frames.length ? frames : messageLocations(e.text);
            },
            async openEntry(this: any, e: LogEntry) {
                const frames = this.framesOf(e);
                if (!frames.length) {
                    this.showToast('No source location in this message');
                    return;
                }
                const res = await this.resolveFrames(e, frames);
                let pick: ResolvedFrame | null = null;
                for (let i = 0; i < res.length && !pick; i++) if (res[i] && res[i].file && res[i].user) pick = res[i];
                for (let i = 0; i < res.length && !pick; i++) if (res[i] && res[i].file) pick = res[i];
                if (!pick) {
                    this.showToast('No openable file in the stack');
                    return;
                }
                if (pick.cs && this.ui.preferCs) await this.openLocation(pick.cs.file, pick.cs.line, 1, pick.cs.display + ' (C#, approximate line)');
                else await this.openLocation(pick.file, pick.line, pick.col, pick.display);
            },
            async openLocation(this: any, file: string, line: number, col: number, label: string) {
                let r: any = null;
                try {
                    r = await request('open-location', { file: String(file), line: Number(line) || 1, col: Number(col) || 1 });
                } catch (e) {
                    r = null;
                }
                this.showToast(r && r.ok ? 'Opened ' + label + (r.via && r.via !== 'system' ? ' in ' + r.via : '') : 'Could not open ' + label);
            },
            rowOpen(this: any, r: RowView) {
                const e = ctx.store.rowEntry(r.index);
                if (e) this.openEntry(e);
            },
            openDetail(this: any) {
                if (ctx.detailEntry) this.openEntry(ctx.detailEntry);
            },
            openFrame(this: any, f: FrameView) {
                this.openLocation(f.file, f.line, f.col, f.display);
            },
            openCs(this: any, f: FrameView) {
                if (f.cs) this.openLocation(f.cs.file, f.cs.line, 1, f.cs.display + ' (C#, approximate line)');
            },

            // ---------------------------------------------------------------- copy / export
            copy(this: any, text: string, what: string) {
                if (!text) return;
                request('copy-text', text).then(
                    () => this.showToast('Copied ' + what),
                    () => this.showToast('Could not copy')
                );
            },
            copySelection(this: any, withStack = false) {
                const sel = this.selectedEntries();
                if (!sel.length) return;
                const text = sel.map((s: any) => entryToText(s.e, { time: true, stack: withStack, count: s.count })).join('\n');
                this.copy(text, sel.length === 1 ? 'the line' : sel.length + ' lines');
            },
            copyDetail(this: any, withStack: boolean) {
                const e = ctx.detailEntry;
                if (!e) return;
                if (!withStack) this.copy(e.stack ? e.text : messageOnly(e.text), 'the message');
                else this.copy(e.text + (e.stack && e.text.indexOf(e.stack.trim()) < 0 ? '\n' + e.stack : ''), 'the message and stack');
            },
            copyStack(this: any, e: LogEntry) {
                const frames = entryFrames(e.text, e.stack);
                this.copy(frames.map((f) => f.raw).join('\n') || e.stack, 'the stack');
            },
            visibleText(this: any, withStack: boolean): string {
                const store = ctx.store;
                const lines: string[] = [];
                for (let i = 0; i < store.length; i++) lines.push(entryToText(store.rowLatest(i)!, { time: true, stack: withStack, count: store.rowCount(i) }));
                return lines.join('\n');
            },
            async exportVisible(this: any) {
                const text = exportHeader(this.projectName(), ctx.store.length, Date.now()) + this.visibleText(true) + '\n';
                let file = '';
                try {
                    file = await request('export-text', text, 'console-' + formatDate(Date.now()) + '.log');
                } catch (e) {
                    file = '';
                }
                if (file) this.showToast('Exported ' + ctx.store.length + ' lines to ' + file);
            },
            projectName(): string {
                try {
                    return Editor.Project.name || Editor.Project.path;
                } catch (e) {
                    return '';
                }
            },

            // ---------------------------------------------------------------- menus
            popup(items: any[]) {
                try {
                    Editor.Menu.popup({ menu: items } as any);
                } catch (e) {
                    // no native menu (tests)
                }
            },
            clearMenu(this: any) {
                this.popup([
                    { label: 'Clear on Play', type: 'checkbox', checked: !!this.config.clearOnPlay, click: () => this.toggleConfig('clearOnPlay') },
                    { type: 'separator' },
                    { label: "Clear Cocos' Console Too", click: () => this.clearBoth() },
                ]);
            },
            moreMenu(this: any) {
                const cap = this.config.capacity;
                const sizes = [10000, 50000, 100000, 200000];
                this.popup([
                    { label: 'Export Visible...', click: () => this.exportVisible() },
                    { label: 'Copy Visible', click: () => this.copy(this.visibleText(false), ctx.store.length + ' lines') },
                    { type: 'separator' },
                    {
                        label: 'Log Entry',
                        submenu: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                            label: n + (n === 1 ? ' Line' : ' Lines'),
                            type: 'radio',
                            checked: !this.ui.wrap && clampLines(this.ui.entryLines) === n,
                            click: () => this.setEntryLines(n),
                        })),
                    },
                    { label: 'Show Source Column', type: 'checkbox', checked: this.ui.sourceColumn, click: () => this.toggleUi('sourceColumn') },
                    { label: 'Color Warning and Error Text', type: 'checkbox', checked: this.ui.colorText, click: () => this.toggleUi('colorText') },
                    { label: 'Open C# Source on Double-click', type: 'checkbox', checked: this.ui.preferCs, click: () => this.toggleUi('preferCs') },
                    { label: 'Tag Scene / Game Lines (scene script)', type: 'checkbox', checked: !!this.config.sceneHook, click: () => this.toggleConfig('sceneHook') },
                    {
                        label: 'History Size',
                        submenu: sizes.map((n) => ({ label: n.toLocaleString('en-US') + ' lines', type: 'radio', checked: cap === n, click: () => this.setCapacity(n) })),
                    },
                    { type: 'separator' },
                    { label: "Open Cocos' Console", click: () => request('open-cocos-console') },
                    { label: 'Copy Diagnostics', click: () => this.copyDiagnostics() },
                    { label: 'Open README', click: () => request('open-docs') },
                ]);
            },
            chipMenu(this: any, c: any) {
                const solo = c.state === 'solo';
                const hidden = c.state === 'hide';
                this.popup([
                    { label: solo ? 'Unsolo' : 'Solo', click: () => this.setChip(c.group, c.key, true) },
                    { label: hidden ? 'Show' : 'Hide', click: () => this.setChip(c.group, c.key, false) },
                    { type: 'separator' },
                    { label: 'Show All Channels', click: () => this.resetChips() },
                ]);
            },
            rowMenu(this: any, r: RowView) {
                const e = ctx.store.rowEntry(r.index);
                if (!e) return;
                const many = ctx.selection.size > 1;
                const items: any[] = [
                    { label: many ? 'Copy ' + ctx.selection.size + ' Lines' : 'Copy', click: () => this.copySelection(false) },
                    { label: many ? 'Copy Lines with Stack' : 'Copy with Stack', click: () => this.copySelection(true) },
                    { label: 'Copy Stack', enabled: !!(e.stack || entryFrames(e.text, '').length), click: () => this.copyStack(e) },
                    { type: 'separator' },
                    { label: 'Open Source', click: () => this.openEntry(e) },
                    { type: 'separator' },
                ];
                if (e.tag) {
                    items.push({ label: 'Hide [' + e.tag + ']', click: () => this.setChip('tag', e.tag, false) });
                    items.push({ label: 'Solo [' + e.tag + ']', click: () => this.setChip('tag', e.tag, true) });
                }
                items.push({ label: 'Hide ' + SOURCE_LABELS[e.source] + ' Lines', click: () => this.setChip('source', e.source, false) });
                items.push({ label: 'Solo ' + SOURCE_LABELS[e.source] + ' Lines', click: () => this.setChip('source', e.source, true) });
                items.push({ type: 'separator' }, { label: 'Clear', click: () => this.clearAll() });
                this.popup(items);
            },
            async copyDiagnostics(this: any) {
                let s: any = null;
                try {
                    s = await request('status');
                } catch (e) {
                    s = { error: String(e) };
                }
                this.copy(JSON.stringify(s, null, 2), 'the diagnostics');
            },

            // ---------------------------------------------------------------- actions
            clearAll(this: any) {
                request('clear').catch(() => this.onCleared());
            },
            clearBoth(this: any) {
                this.clearAll();
                try {
                    Editor.Message.send('console', 'clear');
                } catch (e) {
                    // Cocos' console is not loaded
                }
            },
            showToast(this: any, msg: string) {
                this.toast = msg;
                if (ctx.toastTimer) clearTimeout(ctx.toastTimer);
                ctx.toastTimer = setTimeout(() => {
                    ctx.toastTimer = 0;
                    this.toast = '';
                }, 2600);
            },
            startSplit(this: any, ev: MouseEvent) {
                ev.preventDefault();
                const startY = ev.clientY;
                const startH = this.ui.detailsH;
                const root = this.$refs.root as HTMLElement;
                const maxH = Math.max(60, (root ? root.clientHeight : 400) - 90);
                const move = (e: MouseEvent) => {
                    this.ui.detailsH = Math.max(40, Math.min(maxH, startH - (e.clientY - startY)));
                };
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                    this.saveUi();
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },

            // ---------------------------------------------------------------- keyboard
            textSelectedInDetails(this: any): boolean {
                const root = this.$refs.root as HTMLElement;
                const node: any = root && root.getRootNode ? root.getRootNode() : document;
                const sel: Selection | null = node && typeof node.getSelection === 'function' ? node.getSelection() : document.getSelection();
                if (!sel || sel.isCollapsed || !String(sel)) return false;
                const details = this.$refs.details as HTMLElement;
                return !!details && !!sel.anchorNode && details.contains(sel.anchorNode);
            },
            onKey(this: any, ev: KeyboardEvent) {
                const mod = ev.ctrlKey || ev.metaKey;
                const target = ev.target as HTMLElement;
                const inInput = target && target.tagName === 'INPUT';
                if (mod && (ev.key === 'f' || ev.key === 'F')) {
                    ev.preventDefault();
                    const s = this.$refs.search as HTMLInputElement;
                    if (s) {
                        s.focus();
                        s.select();
                    }
                    return;
                }
                if (inInput) return;
                if (mod && (ev.key === 'c' || ev.key === 'C')) {
                    if (this.textSelectedInDetails()) return; // the browser copies the selected text
                    ev.preventDefault();
                    this.copySelection(ev.shiftKey);
                    return;
                }
                if (mod && (ev.key === 'a' || ev.key === 'A')) {
                    if ((this.$refs.details as HTMLElement)?.contains(target)) return;
                    ev.preventDefault();
                    this.selectAll();
                    return;
                }
                const n = ctx.store.length;
                if (!n) return;
                const cur = Math.max(-1, ctx.store.findRow(ctx.focusKey));
                const page = Math.max(1, Math.floor(this.viewH / this.rowH) - 1);
                let next = -2;
                switch (ev.key) {
                    case 'ArrowDown':
                        next = cur < 0 ? 0 : Math.min(n - 1, cur + 1);
                        break;
                    case 'ArrowUp':
                        next = cur < 0 ? n - 1 : Math.max(0, cur - 1);
                        break;
                    case 'PageDown':
                        next = Math.min(n - 1, Math.max(0, cur) + page);
                        break;
                    case 'PageUp':
                        next = Math.max(0, cur - page);
                        break;
                    case 'Home':
                        next = 0;
                        break;
                    case 'End':
                        next = n - 1;
                        break;
                    case 'Enter':
                        if (ctx.detailEntry) this.openEntry(ctx.detailEntry);
                        ev.preventDefault();
                        return;
                    case 'Escape':
                        ctx.selection.clear();
                        this.selVersion++;
                        return;
                    default:
                        return;
                }
                ev.preventDefault();
                if (next >= 0) {
                    this.selectRow(next, ev.shiftKey, false);
                    this.ensureVisible(next);
                }
            },
        },
        mounted(this: any) {
            const list = this.$refs.list as HTMLElement;
            this.measureChar();
            const measure = () => {
                const h = list.clientHeight;
                const w = list.clientWidth;
                const widthChanged = Math.abs(w - this.viewW) > 1;
                this.viewH = h || this.viewH;
                this.viewW = w || this.viewW;
                if (widthChanged && this.ui.wrap) this.relayout();
            };
            measure();
            try {
                ctx.resizeObs = new ResizeObserver(() => requestAnimationFrame(measure));
                ctx.resizeObs.observe(list);
            } catch (e) {
                // older Chromium: measure on window resize
                window.addEventListener('resize', measure);
            }
            ctx.store.setCollapse(this.ui.collapse);
            this.loadInitial();
        },
    });

    const vm = app.mount(el);
    return {
        vm,
        dispose() {
            if (ctx.resizeObs) ctx.resizeObs.disconnect();
            [ctx.queryTimer, ctx.saveTimer, ctx.toastTimer].forEach((t) => t && clearTimeout(t));
            app.unmount();
        },
    };
}

function clip(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '...' : s;
}

function escape(s: string): string {
    return highlight(s, []);
}

function frameView(f: StackFrame, r: ResolvedFrame | null): FrameView {
    const loc = f.url + (f.line ? ':' + f.line + (f.col ? ':' + f.col : '') : '');
    return {
        fn: f.fn,
        display: r && r.file ? r.display : loc || f.raw,
        file: r && r.file ? r.file : '',
        line: r ? r.line : f.line,
        col: r ? r.col : f.col,
        user: !!(r && r.user),
        internal: isInternalFrame(f) || !!(r && !r.user && !r.file),
        mapped: !!(r && r.mapped),
        raw: f.raw,
        cs: r && r.cs ? r.cs : null,
    };
}
