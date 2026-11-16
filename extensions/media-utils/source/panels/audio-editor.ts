/**
 * Audio Editor panel (Audacity-like): waveform with ruler, zoom and scroll,
 * selection with zero-crossing snap, transport, edits with multi-level undo,
 * effects (in a worker), markers / loop region, and export to WAV / MP3 / OGG
 * (overwrite keeping the asset's uuid, or save as a copy).
 *
 * Decoding uses Chromium's decodeAudioData (WAV goes through our own decoder,
 * which also reads markers and the loop). Large sample arrays live outside
 * Vue's reactivity (markRaw); a `rev` counter triggers re-rendering.
 */
import { createApp, markRaw } from 'vue';
import { AUDIO_STYLE } from './audio/style';
import { AUDIO_TEMPLATE } from './audio/template';
import { AudioEngine } from './audio/engine';
import { AudioPlayer, decodeCompressed } from './audio/player';
import { drawOverlay, drawRuler, drawWaves, markerAt, readTheme, Theme, ViewState } from './audio/view';
import { ICONS } from './common/icons';
import { baseName, call, dropItems, exactBuffer, formatBytes, message, plain, toBytes } from './common/ipc';
import { AudioDocument } from '../shared/audio/document';
import { EffectName, isFormatEffect, matchFormat } from '../shared/audio/effects';
import { buildPeaks, probeSampleRate, rangeMinMax, snapToZeroCrossing } from '../shared/audio/analysis';
import { decodeWav, isWav } from '../shared/audio/wav';
import { AudioData, formatTime, gainToDb, makeSilence, parseTime } from '../shared/audio/types';
import { DEFAULT_EXPORT, exportFormat, MP3_BITRATES, oggApproxKbps } from '../shared/audio/export';
import { defaultSaveOptions } from '../shared/image/options';

const STORE = 'media-utils.audio-editor';

/** Clipboard shared by every Audio Editor in this window. */
let clipboard: AudioData | null = null;

interface ParamDef {
    key: string;
    label: string;
    type?: 'number' | 'bool' | 'select';
    def: any;
    min?: number;
    max?: number;
    step?: number;
    options?: [any, string][];
    title?: string;
}

interface EffectDef {
    id: EffectName | 'silence';
    label: string;
    group: string;
    params: ParamDef[];
    hint?: string;
    /** Always applied to the whole file (format change). */
    whole?: boolean;
}

const CURVES: [string, string][] = [['linear', 'Linear'], ['exponential', 'Exponential'], ['logarithmic', 'Logarithmic'], ['scurve', 'S-Curve']];
const RATES = [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

const EFFECTS: EffectDef[] = [
    { id: 'amplify', group: 'Volume', label: 'Amplify', params: [{ key: 'db', label: 'Gain (dB)', def: 3, min: -48, max: 48, step: 0.1 }, { key: 'allowClipping', label: 'Allow Clipping', type: 'bool', def: false }] },
    {
        id: 'normalize', group: 'Volume', label: 'Normalize', params: [
            { key: 'peakDb', label: 'Peak (dB)', def: -1, min: -40, max: 0, step: 0.1 },
            { key: 'removeDc', label: 'Remove DC Offset', type: 'bool', def: true },
            { key: 'independent', label: 'Each Channel', type: 'bool', def: false, title: 'Normalize stereo channels independently' },
        ],
    },
    { id: 'fadeIn', group: 'Volume', label: 'Fade In', params: [{ key: 'curve', label: 'Curve', type: 'select', def: 'linear', options: CURVES }], hint: 'Fades over the whole selection.' },
    { id: 'fadeOut', group: 'Volume', label: 'Fade Out', params: [{ key: 'curve', label: 'Curve', type: 'select', def: 'linear', options: CURVES }], hint: 'Fades over the whole selection.' },
    {
        id: 'noiseGate', group: 'Volume', label: 'Noise Gate', params: [
            { key: 'thresholdDb', label: 'Threshold (dB)', def: -40, min: -90, max: 0, step: 1 },
            { key: 'reductionDb', label: 'Reduction (dB)', def: -100, min: -100, max: 0, step: 1, title: '-100 = full silence' },
            { key: 'attackMs', label: 'Attack (ms)', def: 5, min: 0, max: 200, step: 1 },
            { key: 'holdMs', label: 'Hold (ms)', def: 40, min: 0, max: 1000, step: 1 },
            { key: 'releaseMs', label: 'Release (ms)', def: 100, min: 1, max: 2000, step: 1 },
        ],
    },
    {
        id: 'trimSilence', group: 'Volume', label: 'Trim Silence', params: [
            { key: 'thresholdDb', label: 'Threshold (dB)', def: -50, min: -90, max: -6, step: 1 },
            { key: 'paddingMs', label: 'Keep (ms)', def: 10, min: 0, max: 1000, step: 1, title: 'Silence kept before and after the sound' },
            { key: 'leading', label: 'Leading', type: 'bool', def: true },
            { key: 'trailing', label: 'Trailing', type: 'bool', def: true },
        ],
        hint: 'Removes the silence before the first and after the last sound louder than the threshold.',
    },
    { id: 'silence', group: 'Edit', label: 'Silence / Insert Silence', params: [{ key: 'seconds', label: 'Insert (s)', def: 1, min: 0.01, max: 60, step: 0.01 }], hint: 'With a selection, it becomes silent. Without one, silence is inserted at the cursor.' },
    { id: 'reverse', group: 'Edit', label: 'Reverse', params: [] },
    { id: 'removeDc', group: 'Edit', label: 'Remove DC Offset', params: [] },
    { id: 'speed', group: 'Time & Pitch', label: 'Change Speed', params: [{ key: 'speed', label: 'Speed (x)', def: 1.25, min: 0.1, max: 4, step: 0.01 }], hint: 'Changes tempo and pitch together, like a tape played faster or slower.' },
    { id: 'tempo', group: 'Time & Pitch', label: 'Change Tempo', params: [{ key: 'tempo', label: 'Tempo (x)', def: 1.1, min: 0.25, max: 4, step: 0.01 }], hint: 'Changes the length and keeps the pitch (WSOLA time-stretch).' },
    { id: 'pitch', group: 'Time & Pitch', label: 'Change Pitch', params: [{ key: 'semitones', label: 'Semitones', def: 2, min: -24, max: 24, step: 0.1 }], hint: 'Keeps the length: WSOLA time-stretch, then resampling. Clean on voice and SFX; big shifts on dense music get a little phasey.' },
    { id: 'toMono', group: 'Format (whole file)', label: 'Convert to Mono', params: [], whole: true },
    { id: 'toStereo', group: 'Format (whole file)', label: 'Convert to Stereo', params: [], whole: true },
    { id: 'resample', group: 'Format (whole file)', label: 'Resample', params: [{ key: 'sampleRate', label: 'Sample Rate', type: 'select', def: 44100, options: RATES.map((r) => [r, r + ' Hz'] as [any, string]) }], whole: true, hint: 'Band-limited (windowed sinc) sample-rate conversion of the whole file.' },
];

function defaultParams(): Record<string, Record<string, any>> {
    const out: Record<string, Record<string, any>> = {};
    for (const e of EFFECTS) {
        out[e.id] = {};
        for (const p of e.params) out[e.id][p.key] = p.def;
    }
    return out;
}

function loadStore(): any {
    try {
        return JSON.parse(localStorage.getItem(STORE) || '{}') || {};
    } catch (e) {
        return {};
    }
}

function saveStore(data: any): void {
    try {
        localStorage.setItem(STORE, JSON.stringify(data));
    } catch (e) {
        // not remembered
    }
}

function createAudioApp(el: HTMLElement) {
    const stored = loadStore();
    const params = defaultParams();
    if (stored.params) for (const id of Object.keys(params)) Object.assign(params[id], stored.params[id] || {});

    const app = createApp({
        template: AUDIO_TEMPLATE,
        data() {
            return {
                ic: ICONS,
                rev: 0,
                file: null as null | { path: string; name: string; ext: string; size: number },
                info: { sampleRate: 0, channels: 0, length: 0 },
                sel: { start: 0, end: 0 },
                viewStart: 0,
                spp: 1,
                vzoom: 1,
                trackW: 0,
                wavesH: 0,
                playing: false,
                playPos: null as number | null,
                pausedAt: null as number | null,
                loopPlay: !!stored.loopPlay,
                volume: stored.volume === undefined ? 1 : stored.volume,
                snap: stored.snap !== false,
                effectId: stored.effectId || 'normalize',
                params,
                folds: Object.assign({ effects: true, markers: true, export: true }, stored.folds || {}),
                sideWidth: stored.sideWidth || 300,
                ex: Object.assign({}, DEFAULT_EXPORT, stored.ex || {}),
                save: Object.assign(defaultSaveOptions(), stored.save || {}),
                busy: { active: false, text: '', progress: -1 },
                notice: '',
                noticeKind: 'info',
                dragOver: false,
                modal: null as null | { text: string; ok: string; input?: string; resolve: (v: any) => void },
                mp3Bitrates: MP3_BITRATES.filter((b) => b >= 32),
                exportRates: RATES,
            };
        },
        computed: {
            hasDoc(this: any): boolean {
                this.rev;
                return !!this._doc;
            },
            hasSel(this: any): boolean {
                return this.hasDoc && this.sel.end > this.sel.start;
            },
            hasClip(this: any): boolean {
                this.rev;
                return !!clipboard;
            },
            dirty(this: any): boolean {
                this.rev;
                return !!this._doc && this._doc.dirty;
            },
            canUndo(this: any): boolean {
                this.rev;
                return !!this._doc && this._doc.canUndo();
            },
            canRedo(this: any): boolean {
                this.rev;
                return !!this._doc && this._doc.canRedo();
            },
            undoLabel(this: any): string {
                this.rev;
                return this._doc ? this._doc.undoLabel() : '';
            },
            redoLabel(this: any): string {
                this.rev;
                return this._doc ? this._doc.redoLabel() : '';
            },
            markerList(this: any) {
                this.rev;
                return this._doc ? this._doc.markers.map((m: any) => ({ id: m.id, name: m.name, position: m.position })) : [];
            },
            loopRegion(this: any) {
                this.rev;
                return this._doc && this._doc.loop ? { start: this._doc.loop.start, end: this._doc.loop.end } : null;
            },
            effect(this: any): EffectDef {
                return EFFECTS.find((e) => e.id === this.effectId) || EFFECTS[0];
            },
            effectGroups(this: any) {
                const groups: { label: string; items: EffectDef[] }[] = [];
                for (const e of EFFECTS) {
                    let g = groups.find((x) => x.label === e.group);
                    if (!g) groups.push((g = { label: e.group, items: [] }));
                    g.items.push(e);
                }
                return groups;
            },
            effectTarget(this: any): string {
                if (!this.hasDoc) return '';
                if (this.effect.whole) return 'Whole file';
                if (this.effect.id === 'silence') return this.hasSel ? `Silence ${this.time(this.sel.end - this.sel.start)}` : `Insert at ${this.time(this.sel.start)}`;
                return this.hasSel ? `Selection (${this.time(this.sel.end - this.sel.start)})` : 'Whole file';
            },
            peak(this: any): number {
                this.rev;
                const d: AudioDocument | null = this._doc;
                if (!d || !this._peaks) return 0;
                const a = this.hasSel ? this.sel.start : 0;
                const b = this.hasSel ? this.sel.end : d.length;
                let p = 0;
                for (let c = 0; c < d.channelCount; c++) {
                    const [lo, hi] = rangeMinMax(d.data.channels[c], this._peaks.channels[c], this._peaks.block, a, b);
                    p = Math.max(p, Math.abs(lo), Math.abs(hi));
                }
                return p;
            },
            peakText(this: any): string {
                return this.peak > 0 ? gainToDb(this.peak).toFixed(2) + ' dB' : 'silent';
            },
            maxGain(this: any): number {
                return this.peak > 0 ? Math.floor(-gainToDb(this.peak) * 100) / 100 : 0;
            },
            oggKbps(this: any): number {
                return oggApproxKbps(this.ex.oggQuality);
            },
            exportFmt(this: any) {
                this.rev;
                if (!this._doc) return null;
                return exportFormat(this._doc.data, this.ex);
            },
            exportNote(this: any): string {
                const f = this.exportFmt;
                if (!f) return '';
                const notes: string[] = [];
                if (this.ex.format === 'mp3' && this.ex.sampleRate === 0 && f.sampleRate !== this.info.sampleRate) notes.push(`MP3 does not support ${this.info.sampleRate} Hz; it will be written at ${f.sampleRate} Hz.`);
                if (this.ex.format !== 'wav' && this.info.channels > 2 && this.ex.channels === 0) notes.push('More than two channels are mixed to stereo.');
                return notes.join(' ');
            },
            exportTarget(this: any): string {
                if (!this.file) return '';
                const ext = '.' + this.ex.format;
                const stem = this.file.name.replace(/\.[^.]+$/, '');
                return this.save.mode === 'overwrite' ? `Overwrite as ${stem}${ext}` : `New file ${stem}${this.save.suffix || ''}${ext}`;
            },
            thumbStyle(this: any) {
                const n = this.info.length;
                if (!n || !this.trackW) return { left: '0px', width: '0px' };
                const visible = this.trackW * this.spp;
                const w = Math.max(16, Math.min(1, visible / n) * this.trackW);
                const left = (this.viewStart / Math.max(1, n - visible)) * (this.trackW - w);
                return { left: (isFinite(left) ? Math.max(0, left) : 0) + 'px', width: w + 'px' };
            },
            noticeClass(this: any): string {
                return this.noticeKind === 'error' ? 'mu-err' : this.noticeKind === 'warn' ? 'mu-warn' : this.noticeKind === 'ok' ? 'mu-ok' : '';
            },
        },
        watch: {
            volume(this: any, v: number) {
                this._player.setVolume(v);
                this.persist();
            },
            ex: { deep: true, handler(this: any) { this.persist(); } },
            save: { deep: true, handler(this: any) { this.persist(); } },
            params: { deep: true, handler(this: any) { this.persist(); } },
            folds: { deep: true, handler(this: any) { this.persist(); } },
            effectId(this: any) { this.persist(); },
            snap(this: any) { this.persist(); },
            loopPlay(this: any) { this.persist(); },
        },
        methods: {
            persist(this: any) {
                saveStore({ volume: this.volume, snap: this.snap, loopPlay: this.loopPlay, effectId: this.effectId, params: plain(this.params), folds: plain(this.folds), sideWidth: this.sideWidth, ex: plain(this.ex), save: plain(this.save) });
            },
            time(this: any, samples: number): string {
                const sr = this.info.sampleRate || 44100;
                return formatTime(samples / sr);
            },
            channelName(n: number): string {
                return n === 1 ? 'Mono' : n === 2 ? 'Stereo' : n + ' ch';
            },
            show(this: any, text: string, kind = 'info') {
                this.notice = text;
                this.noticeKind = kind;
            },
            ask(this: any, text: string, ok: string, input?: string): Promise<any> {
                return new Promise((resolve) => {
                    this.modal = { text, ok, input, resolve };
                    if (input !== undefined) this.$nextTick(() => {
                        const i = this.$refs.modalInput as HTMLInputElement;
                        if (i) {
                            i.focus();
                            i.select();
                        }
                    });
                });
            },
            closeModal(this: any, ok: boolean) {
                const m = this.modal;
                this.modal = null;
                if (!m) return;
                m.resolve(m.input !== undefined ? (ok ? m.input : null) : ok);
                (this.$refs.root as HTMLElement).focus();
            },
            setBusy(this: any, text: string, progress = -1) {
                this.busy = { active: !!text, text, progress };
            },

            // ------------------------------------------------ document sync
            /** Call after every change of the document. */
            changed(this: any, dataChanged = true) {
                const d: AudioDocument | null = this._doc;
                if (d) {
                    if (dataChanged) {
                        this._peaks = markRaw(buildPeaks(d.data.channels));
                        this._player.invalidate();
                        if (this.playing) this.stop();
                    }
                    this.info = { sampleRate: d.sampleRate, channels: d.channelCount, length: d.length };
                    this.sel = { start: d.selection.start, end: d.selection.end };
                }
                this.clampView();
                this.rev++;
                this.requestDraw();
            },
            setSelection(this: any, a: number, b: number) {
                const d: AudioDocument | null = this._doc;
                if (!d) return;
                const r = d.range(a, b);
                d.selection = r;
                this.sel = { start: r.start, end: r.end };
                this.requestDraw();
            },

            // ------------------------------------------------ opening
            async openPath(this: any, path: string) {
                if (this._doc && this._doc.dirty) {
                    const ok = await this.ask(`Discard the unsaved changes to ${this.file.name}?`, 'Discard');
                    if (!ok) return;
                }
                this.stop();
                this.setBusy('Decoding ' + baseName(path) + '...');
                try {
                    const info = await call('file-info', path);
                    const bytes = toBytes(await call('read-file', path));
                    let data: AudioData | null = null;
                    let markers: any[] = [];
                    let loop = null;
                    let wavError = '';
                    if (isWav(bytes)) {
                        try {
                            const w = decodeWav(bytes);
                            data = { sampleRate: w.sampleRate, channels: w.channels };
                            markers = w.markers;
                            loop = w.loop;
                        } catch (e) {
                            wavError = message(e);
                        }
                    }
                    if (!data) {
                        const rate = probeSampleRate(bytes) || (isWav(bytes) ? new DataView(bytes.buffer, bytes.byteOffset).getUint32(24, true) : 0) || 44100;
                        try {
                            data = await decodeCompressed(exactBuffer(bytes.slice()), rate);
                        } catch (e) {
                            throw new Error(`Could not decode ${baseName(path)}${wavError ? ' (' + wavError + ')' : ''}: ${message(e)}`);
                        }
                    }
                    if (!data.channels.length || !data.channels[0].length) throw new Error('The file has no audio.');
                    this._doc = markRaw(new AudioDocument(data, markers, loop));
                    this.file = { path, name: info.name, ext: info.ext, size: info.size };
                    const ext = String(info.ext || '').replace('.', '');
                    if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') this.ex.format = ext;
                    this.pausedAt = null;
                    this.changed();
                    this.$nextTick(() => this.zoomFit());
                    this.show(`Opened ${info.name}: ${data.sampleRate} Hz, ${this.channelName(data.channels.length)}, ${formatTime(data.channels[0].length / data.sampleRate)}, ${formatBytes(info.size)}.`);
                } catch (e) {
                    this.show(message(e), 'error');
                } finally {
                    this.setBusy('');
                }
            },
            async openDialog(this: any) {
                try {
                    const files: string[] = await call('pick-files', 'audio', false);
                    if (files[0]) await this.openPath(files[0]);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async openSelected(this: any) {
                try {
                    const files: string[] = await call('selected-assets', 'audio');
                    if (!files.length) this.show('Select an audio clip in the Assets panel first.', 'warn');
                    else await this.openPath(files[0]);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async takePending(this: any) {
                try {
                    const files: string[] = await call('take-pending', 'audio');
                    if (files[0]) await this.openPath(files[0]);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async onDrop(this: any, ev: DragEvent) {
                this.dragOver = false;
                const items = dropItems(ev);
                if (!items.length) return;
                try {
                    const files: string[] = await call('resolve-assets', 'audio', items);
                    if (!files.length) this.show('No supported audio in the drop.', 'warn');
                    else await this.openPath(files[0]);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            onRestored(this: any, files: string[]) {
                if (!this.file) return;
                const stem = (p: string) => p.replace(/\.[^./\\]+$/, '').toLowerCase();
                const hit = (files || []).find((p) => stem(p) === stem(this.file.path));
                if (hit) this.show(`${baseName(hit)} was restored from the backup. Reopen it to see the restored audio.`, 'warn');
            },

            // ------------------------------------------------ view
            clampView(this: any) {
                const n = this.info.length;
                const w = Math.max(1, this.trackW);
                const minSpp = 1 / 32;
                const maxSpp = Math.max(minSpp, n / w);
                this.spp = Math.max(minSpp, Math.min(maxSpp, this.spp || maxSpp));
                const maxStart = Math.max(0, n - w * this.spp);
                this.viewStart = Math.max(0, Math.min(maxStart, this.viewStart));
            },
            zoomFit(this: any) {
                const n = this.info.length;
                if (!n || !this.trackW) return;
                this.spp = n / this.trackW;
                this.viewStart = 0;
                this.clampView();
                this.requestDraw();
            },
            zoomBy(this: any, factor: number, anchorX?: number) {
                if (!this.hasDoc) return;
                const x = anchorX === undefined ? this.trackW / 2 : anchorX;
                const at = this.viewStart + x * this.spp;
                this.spp = this.spp / factor;
                const n = this.info.length;
                this.spp = Math.max(1 / 32, Math.min(Math.max(1 / 32, n / Math.max(1, this.trackW)), this.spp));
                this.viewStart = at - x * this.spp;
                this.clampView();
                this.requestDraw();
            },
            zoomSelection(this: any) {
                if (!this.hasSel) return;
                const len = this.sel.end - this.sel.start;
                this.spp = (len * 1.1) / Math.max(1, this.trackW);
                this.viewStart = this.sel.start - len * 0.05;
                this.clampView();
                this.requestDraw();
            },
            scrollTo(this: any, sample: number) {
                this.viewStart = sample;
                this.clampView();
                this.requestDraw();
            },
            /** Keeps `sample` visible (pages like Audacity during playback). */
            reveal(this: any, sample: number) {
                const visible = this.trackW * this.spp;
                if (sample < this.viewStart || sample > this.viewStart + visible) this.scrollTo(sample - visible * 0.05);
            },
            onWheel(this: any, ev: WheelEvent) {
                if (!this.hasDoc) return;
                const rect = (this.$refs.waves as HTMLElement).getBoundingClientRect();
                if (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
                    const d = ev.shiftKey ? ev.deltaY || ev.deltaX : ev.deltaX;
                    this.scrollTo(this.viewStart + d * this.spp);
                    return;
                }
                if (ev.altKey) {
                    this.vzoom = Math.max(0.25, Math.min(16, this.vzoom * Math.pow(1.0015, -ev.deltaY)));
                    this.requestDraw();
                    return;
                }
                this.zoomBy(Math.pow(1.0018, -ev.deltaY), ev.clientX - rect.left);
            },
            onScrollDown(this: any, ev: MouseEvent) {
                if (!this.hasDoc) return;
                ev.preventDefault();
                const track = this.$refs.hscroll as HTMLElement;
                const rect = track.getBoundingClientRect();
                const n = this.info.length;
                const visible = this.trackW * this.spp;
                const thumbW = Math.max(16, Math.min(1, visible / n) * rect.width);
                const range = Math.max(1, rect.width - thumbW);
                const thumbLeft = (this.viewStart / Math.max(1, n - visible)) * range;
                const onThumb = ev.clientX - rect.left >= thumbLeft && ev.clientX - rect.left <= thumbLeft + thumbW;
                if (!onThumb) this.scrollTo(((ev.clientX - rect.left - thumbW / 2) / range) * (n - visible));
                const sx = ev.clientX;
                const start = this.viewStart;
                const move = (e: MouseEvent) => this.scrollTo(start + ((e.clientX - sx) / range) * (n - visible));
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },
            startSideResize(this: any, ev: MouseEvent) {
                ev.preventDefault();
                const sx = ev.clientX;
                const start = this.sideWidth;
                const move = (e: MouseEvent) => {
                    this.sideWidth = Math.max(220, Math.min(560, start - (e.clientX - sx)));
                };
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                    this.persist();
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },

            // ------------------------------------------------ drawing
            requestDraw(this: any) {
                if (this._drawQueued) return;
                this._drawQueued = true;
                requestAnimationFrame(() => {
                    this._drawQueued = false;
                    this.draw();
                });
            },
            viewState(this: any): ViewState | null {
                const d: AudioDocument | null = this._doc;
                return {
                    channels: d ? d.data.channels : [],
                    peaks: this._peaks || null,
                    sampleRate: d ? d.sampleRate : 44100,
                    length: d ? d.length : 0,
                    viewStart: this.viewStart,
                    spp: this.spp,
                    selStart: this.sel.start,
                    selEnd: this.sel.end,
                    markers: d ? d.markers : [],
                    loop: d ? d.loop : null,
                    playhead: this.playing ? this.playPos : null,
                    vzoom: this.vzoom,
                };
            },
            draw(this: any) {
                const s = this.viewState();
                if (!s || !this.trackW) return;
                if (!this._theme) this._theme = readTheme(this.$refs.root as Element);
                const t: Theme = this._theme;
                drawRuler(this.$refs.ruler, this.trackW, s, t);
                drawWaves(this.$refs.wave, this.trackW, this.wavesH, s, t);
                drawOverlay(this.$refs.overlay, this.trackW, this.wavesH, s, t);
            },
            drawPlayhead(this: any) {
                const s = this.viewState();
                if (!s || !this.trackW || !this._theme) return;
                drawOverlay(this.$refs.overlay, this.trackW, this.wavesH, s, this._theme);
            },

            // ------------------------------------------------ mouse
            sampleAtX(this: any, x: number): number {
                return Math.max(0, Math.min(this.info.length, Math.round(this.viewStart + x * this.spp)));
            },
            snapped(this: any, s: number): number {
                if (!this.snap || !this._doc) return s;
                const radius = Math.max(16, Math.round(this.info.sampleRate * 0.01));
                return snapToZeroCrossing(this._doc.data.channels, s, radius);
            },
            onWaveDown(this: any, ev: MouseEvent) {
                (this.$refs.root as HTMLElement).focus();
                if (!this.hasDoc || ev.button !== 0) return;
                ev.preventDefault();
                const el = this.$refs.waves as HTMLElement;
                const rect = el.getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const s = this.sampleAtX(x);
                let anchor = s;
                if (this.hasSel) {
                    const ax = (this.sel.start - this.viewStart) / this.spp;
                    const bx = (this.sel.end - this.viewStart) / this.spp;
                    if (ev.shiftKey) anchor = Math.abs(s - this.sel.start) < Math.abs(s - this.sel.end) ? this.sel.end : this.sel.start;
                    else if (Math.abs(x - ax) <= 4) anchor = this.sel.end; // drag the start edge
                    else if (Math.abs(x - bx) <= 4) anchor = this.sel.start; // drag the end edge
                } else if (ev.shiftKey) {
                    anchor = this.sel.start;
                }
                this.setSelection(anchor, s);
                let lastX = x;
                let timer = 0;
                const update = () => {
                    // Auto-scroll when dragging past the edges.
                    if (lastX < 0) this.scrollTo(this.viewStart + lastX * this.spp * 0.5);
                    else if (lastX > rect.width) this.scrollTo(this.viewStart + (lastX - rect.width) * this.spp * 0.5);
                    this.setSelection(anchor, this.sampleAtX(Math.max(0, Math.min(rect.width, lastX))));
                };
                const move = (e: MouseEvent) => {
                    lastX = e.clientX - rect.left;
                    update();
                };
                timer = window.setInterval(() => {
                    if (lastX < 0 || lastX > rect.width) update();
                }, 50);
                const up = () => {
                    window.clearInterval(timer);
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                    const a = this.snapped(this.sel.start);
                    const b = this.sel.end > this.sel.start ? this.snapped(this.sel.end) : a;
                    this.setSelection(a, b);
                    this.pausedAt = null;
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },
            onRulerDown(this: any, ev: MouseEvent) {
                (this.$refs.root as HTMLElement).focus();
                if (!this.hasDoc || ev.button !== 0) return;
                ev.preventDefault();
                const rect = (this.$refs.ruler as HTMLElement).getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const y = ev.clientY - rect.top;
                const d: AudioDocument = this._doc;
                const m = markerAt(this.viewState(), x, y);
                if (m) {
                    const original = m.position;
                    let moved = false;
                    const move = (e: MouseEvent) => {
                        moved = true;
                        m.position = this.sampleAtX(e.clientX - rect.left);
                        this.requestDraw();
                    };
                    const up = () => {
                        window.removeEventListener('mousemove', move);
                        window.removeEventListener('mouseup', up);
                        if (!moved) {
                            this.setSelection(m.position, m.position);
                            return;
                        }
                        const to = this.snapped(m.position);
                        m.position = original;
                        d.updateMarker(m.id, { position: to });
                        this.changed(false);
                    };
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                    return;
                }
                const s = this.snapped(this.sampleAtX(x));
                this.setSelection(s, s);
                this.pausedAt = null;
                if (this.playing) this.playFrom(s);
            },
            async onRulerDblClick(this: any, ev: MouseEvent) {
                if (!this.hasDoc) return;
                const rect = (this.$refs.ruler as HTMLElement).getBoundingClientRect();
                const m = markerAt(this.viewState(), ev.clientX - rect.left, ev.clientY - rect.top);
                if (!m) return;
                const name = await this.ask('Marker name', 'Rename', m.name);
                if (name !== null && name !== undefined) this.renameMarker(m.id, name);
            },

            // ------------------------------------------------ transport
            playRange(this: any, from: number, to: number, loop: boolean) {
                const d: AudioDocument | null = this._doc;
                if (!d) return;
                this._player.setVolume(this.volume);
                const ok = this._player.play(d.data.channels, d.sampleRate, d.version, from, to, loop);
                this.playing = ok;
                this.pausedAt = null;
                this._playEnd = to;
                if (ok) this.tick();
            },
            /** The range Play uses: the selection, else from the cursor to the end. */
            playFrom(this: any, from: number) {
                const d: AudioDocument | null = this._doc;
                if (!d) return;
                const loop = this.loopPlay;
                if (this.hasSel) this.playRange(Math.max(from, this.sel.start) < this.sel.end ? Math.max(from, this.sel.start) : this.sel.start, this.sel.end, loop);
                else if (loop && d.loop) this.playRange(d.loop.start, d.loop.end, true);
                else this.playRange(from >= d.length - 1 ? 0 : from, d.length, loop);
            },
            play(this: any) {
                if (!this.hasDoc) return;
                this.playFrom(this.pausedAt !== null ? this.pausedAt : this.sel.start);
            },
            togglePause(this: any) {
                if (this.playing) {
                    this.pausedAt = this._player.position();
                    this._player.stop();
                    this.playing = false;
                    this.drawPlayhead();
                } else this.play();
            },
            playSelection(this: any) {
                if (this.hasSel) this.playRange(this.sel.start, this.sel.end, this.loopPlay);
            },
            stop(this: any) {
                if (this._player) this._player.stop();
                this.playing = false;
                this.playPos = null;
                this.pausedAt = null;
                cancelAnimationFrame(this._raf);
                this.drawPlayhead();
            },
            tick(this: any) {
                cancelAnimationFrame(this._raf);
                const step = () => {
                    if (!this.playing) return;
                    this.playPos = this._player.position();
                    if (this.playPos !== null) {
                        const before = this.viewStart;
                        this.reveal(this.playPos);
                        if (this.viewStart === before) this.drawPlayhead();
                    }
                    this._raf = requestAnimationFrame(step);
                };
                this._raf = requestAnimationFrame(step);
            },
            toStart(this: any) {
                this.setSelection(0, 0);
                this.scrollTo(0);
                if (this.playing) this.playFrom(0);
            },
            toEnd(this: any) {
                const n = this.info.length;
                this.setSelection(n, n);
                this.scrollTo(n);
                if (this.playing) this.stop();
            },
            goTo(this: any, s: number) {
                this.setSelection(s, s);
                this.reveal(s);
            },

            // ------------------------------------------------ edits
            undo(this: any) {
                if (this._doc && this._doc.undo()) this.changed();
            },
            redo(this: any) {
                if (this._doc && this._doc.redo()) this.changed();
            },
            cut(this: any) {
                if (!this.hasSel) return;
                clipboard = this._doc.cut();
                this.changed();
            },
            copy(this: any) {
                if (!this.hasSel) return;
                clipboard = this._doc.copy();
                this.rev++;
                this.show(`Copied ${this.time(this.sel.end - this.sel.start)}.`);
            },
            paste(this: any) {
                const d: AudioDocument | null = this._doc;
                if (!d || !clipboard) return;
                const converted = clipboard.sampleRate !== d.sampleRate || clipboard.channels.length !== d.channelCount;
                d.paste({ sampleRate: d.sampleRate, channels: matchFormat(clipboard, d.sampleRate, d.channelCount) });
                this.changed();
                if (converted) this.show(`Pasted audio was converted to ${d.sampleRate} Hz ${this.channelName(d.channelCount)}.`, 'warn');
            },
            del(this: any) {
                if (this._doc && this._doc.deleteSelection()) this.changed();
            },
            trim(this: any) {
                if (this._doc && this._doc.trimToSelection()) {
                    this.changed();
                    this.zoomFit();
                }
            },
            duplicate(this: any) {
                if (this._doc && this._doc.duplicate()) this.changed();
            },
            silence(this: any) {
                if (!this.hasDoc) return;
                this.effectId = 'silence';
                this.folds.effects = true;
                this.applyEffect();
            },
            selectAll(this: any) {
                this.setSelection(0, this.info.length);
            },

            // ------------------------------------------------ effects
            async applyEffect(this: any) {
                const d: AudioDocument | null = this._doc;
                if (!d || this.busy.active) return;
                const def: EffectDef = this.effect;
                const p = plain(this.params[def.id] || {});
                this.stop();
                if (def.id === 'silence') {
                    if (d.hasSelection()) d.splice('Silence', d.selection.start, d.selection.end, makeSilence(d.channelCount, d.selection.end - d.selection.start));
                    else d.insertSilence(Math.round((Number(p.seconds) || 1) * d.sampleRate));
                    this.changed();
                    return;
                }
                const hadSel = d.hasSelection();
                const cursor = d.selection.start;
                const whole = def.whole || isFormatEffect(def.id as EffectName);
                const range = whole ? { start: 0, end: d.length } : d.targetRange();
                if (range.end <= range.start) return;
                this.setBusy(`${def.label}...`);
                try {
                    const seg = d.slice(range.start, range.end);
                    const res = await this._engine.effect({ name: def.id as EffectName, params: p, sampleRate: d.sampleRate, channels: seg });
                    if (!res.channels.length || !res.channels[0].length) {
                        if (def.id === 'trimSilence') throw new Error('Everything is below the threshold; nothing would be left.');
                        throw new Error('The effect returned no audio.');
                    }
                    if (whole) {
                        const k = res.sampleRate / d.sampleRate;
                        d.replaceAll(def.label, { sampleRate: res.sampleRate, channels: res.channels }, (pos) => pos * k);
                    } else {
                        d.splice(def.label, range.start, range.end, res.channels);
                        if (!hadSel) d.selection = { start: Math.min(cursor, d.length), end: Math.min(cursor, d.length) };
                    }
                    this.changed();
                    if (whole || !hadSel) this.zoomFit();
                    this.show(`${def.label} applied.`, 'ok');
                } catch (e) {
                    this.show(`${def.label}: ${message(e)}`, 'error');
                } finally {
                    this.setBusy('');
                }
            },

            // ------------------------------------------------ markers
            addMarker(this: any) {
                const d: AudioDocument | null = this._doc;
                if (!d) return;
                const pos = this.playing && this.playPos !== null ? this.playPos : d.selection.start;
                d.addMarker(pos);
                this.changed(false);
            },
            removeMarker(this: any, id: number) {
                this._doc.removeMarker(id);
                this.changed(false);
            },
            renameMarker(this: any, id: number, name: string) {
                this._doc.updateMarker(id, { name: String(name || '').trim() || 'Marker' });
                this.changed(false);
            },
            setLoopFromSelection(this: any) {
                if (!this.hasSel) return;
                this._doc.setLoop({ start: this.sel.start, end: this.sel.end });
                this.changed(false);
            },
            selectLoop(this: any) {
                const l = this._doc && this._doc.loop;
                if (l) this.setSelection(l.start, l.end);
            },
            clearLoop(this: any) {
                this._doc.setLoop(null);
                this.changed(false);
            },
            setSelField(this: any, key: string, ev: Event) {
                const input = ev.target as HTMLInputElement;
                const secs = parseTime(input.value);
                if (!isFinite(secs)) {
                    input.value = this.time(key === 'length' ? this.sel.end - this.sel.start : this.sel[key]);
                    return;
                }
                const s = Math.round(secs * this.info.sampleRate);
                if (key === 'start') this.setSelection(s, Math.max(s, this.sel.end));
                else if (key === 'end') this.setSelection(Math.min(this.sel.start, s), s);
                else this.setSelection(this.sel.start, this.sel.start + s);
                this.reveal(this.sel.start);
            },

            // ------------------------------------------------ export
            async pickFolder(this: any) {
                try {
                    const dir = await call('pick-folder', this.save.folder || undefined);
                    if (dir) this.save.folder = dir;
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async encoderWasm(this: any, kind: 'mp3' | 'ogg'): Promise<Uint8Array> {
                if (!this._wasm) this._wasm = {};
                if (!this._wasm[kind]) this._wasm[kind] = toBytes(await call('encoder-wasm', kind)).slice();
                return this._wasm[kind];
            },
            async exportFile(this: any) {
                const d: AudioDocument | null = this._doc;
                if (!d || !this.file || this.busy.active) return;
                const overwrite = this.save.mode === 'overwrite';
                const ext = '.' + this.ex.format;
                if (overwrite) {
                    const renamed = ext !== String(this.file.ext).toLowerCase();
                    const ok = await this.ask(
                        `Overwrite ${this.file.name}${renamed ? ` as ${this.file.name.replace(/\.[^.]+$/, '')}${ext}` : ''}?\n\nThe asset keeps its uuid${renamed ? ' (the file and its .meta are renamed)' : ''}. The original is backed up to temp/media-utils/backup.`,
                        'Overwrite',
                    );
                    if (!ok) return;
                }
                this.stop();
                this.setBusy(`Encoding ${this.ex.format.toUpperCase()}...`, 0);
                try {
                    const wasm: any = {};
                    if (this.ex.format === 'mp3') wasm.mp3 = await this.encoderWasm('mp3');
                    if (this.ex.format === 'ogg') wasm.ogg = await this.encoderWasm('ogg');
                    const job = {
                        data: { sampleRate: d.sampleRate, channels: d.data.channels.map((c: Float32Array) => c.slice()) },
                        options: plain(this.ex),
                        wasm: { mp3: wasm.mp3 ? wasm.mp3.slice() : undefined, ogg: wasm.ogg ? wasm.ogg.slice() : undefined },
                        extra: { markers: d.markers.map((m) => ({ id: m.id, name: m.name, position: m.position })), loop: d.loop ? { start: d.loop.start, end: d.loop.end } : null },
                    };
                    const bytes: Uint8Array = await this._engine.encode(job, (f: number) => {
                        this.busy.progress = f;
                    });
                    this.setBusy('Saving...');
                    const session = overwrite ? await call('backup-begin', `Audio Editor: ${this.file.name}`) : undefined;
                    const r = await call('save-output', { source: this.file.path, ext, save: plain(this.save), session }, bytes);
                    if (overwrite) {
                        this.file = { path: r.path, name: baseName(r.path), ext, size: r.size };
                        d.markSaved();
                        this.rev++;
                    } else {
                        call('reveal', r.path).catch(() => undefined);
                    }
                    const dur = d.length / d.sampleRate;
                    this.show(`Exported ${baseName(r.path)}: ${formatBytes(r.size)} (${Math.round((r.size * 8) / Math.max(0.001, dur) / 1000)} kbps average).`, 'ok');
                } catch (e) {
                    this.show(`Export failed: ${message(e)}`, 'error');
                } finally {
                    this.setBusy('');
                }
            },

            // ------------------------------------------------ keyboard
            onKey(this: any, ev: KeyboardEvent) {
                const t = ev.target as HTMLElement;
                if (this.modal || (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))) return;
                const ctrl = ev.ctrlKey || ev.metaKey;
                const k = ev.key.toLowerCase();
                let handled = true;
                if (k === ' ') {
                    if (this.playing) this.stop();
                    else if (ev.shiftKey) {
                        const was = this.loopPlay;
                        this.loopPlay = true;
                        this.play();
                        this.loopPlay = was;
                    } else this.play();
                } else if (k === 'p' && !ctrl) this.togglePause();
                else if (ctrl && k === 'z' && !ev.shiftKey) this.undo();
                else if (ctrl && (k === 'y' || (k === 'z' && ev.shiftKey))) this.redo();
                else if (ctrl && k === 'x') this.cut();
                else if (ctrl && k === 'c') this.copy();
                else if (ctrl && k === 'v') this.paste();
                else if (ctrl && k === 'a') this.selectAll();
                else if (ctrl && k === 't') this.trim();
                else if (ctrl && k === 'd') this.duplicate();
                else if (ctrl && k === 'l') this.silence();
                else if (ctrl && k === 'm') this.addMarker();
                else if (ctrl && k === 'e') this.zoomSelection();
                else if (ctrl && k === 'f') this.zoomFit();
                else if (ctrl && k === '1') this.zoomBy(2);
                else if (ctrl && k === '3') this.zoomBy(0.5);
                else if (k === 'delete' || k === 'backspace') this.del();
                else if (k === 'home') this.toStart();
                else if (k === 'end') this.toEnd();
                else if (k === 'escape') this.setSelection(this.sel.start, this.sel.start);
                else handled = false;
                if (handled) {
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            },
        },
        mounted(this: any) {
            this._doc = null;
            this._peaks = null;
            this._player = new AudioPlayer();
            this._player.onEnded = () => {
                this.playing = false;
                this.playPos = null;
                this.drawPlayhead();
            };
            this._engine = new AudioEngine();
            if (!this._engine.usesWorker) console.warn('[Media Utils] Audio worker unavailable, effects run on the panel thread:', this._engine.workerError);
            let raf = 0;
            this._ro = new ResizeObserver(() => {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    const track = this.$refs.track as HTMLElement;
                    const waves = this.$refs.waves as HTMLElement;
                    if (!track || !waves) return;
                    const first = !this.trackW;
                    this.trackW = waves.clientWidth;
                    this.wavesH = waves.clientHeight;
                    if (first && this.hasDoc) this.zoomFit();
                    this.clampView();
                    this._theme = null;
                    this.draw();
                });
            });
            this._ro.observe(this.$refs.waves as HTMLElement);
            this.takePending();
        },
        beforeUnmount(this: any) {
            if (this._ro) this._ro.disconnect();
            cancelAnimationFrame(this._raf);
            if (this._player) this._player.dispose();
            if (this._engine) this._engine.dispose();
        },
    });
    app.config.compilerOptions.isCustomElement = (tag: string) => tag.startsWith('ui-');
    const vm: any = app.mount(el);
    return { app, vm };
}

const apps = new WeakMap<object, { app: any; vm: any }>();

module.exports = Editor.Panel.define({
    template: '<div id="app"></div>',
    style: AUDIO_STYLE,
    $: { app: '#app' },
    methods: {
        /** 'media-utils:pending-audio': the Assets panel menu asked to open a clip. */
        onPending(this: any) {
            const a = apps.get(this);
            if (a) a.vm.takePending();
        },
        onRestored(this: any, files: string[]) {
            const a = apps.get(this);
            if (a) a.vm.onRestored(files);
        },
    },
    ready(this: any) {
        apps.set(this, createAudioApp(this.$.app as HTMLElement));
    },
    beforeClose(this: any) {
        const a = apps.get(this);
        if (a && a.vm.dirty) {
            // Closing loses the edits; Cocos shows no prompt for us, so ask here.
            return window.confirm('The Audio Editor has unsaved changes. Close it anyway?');
        }
        return true;
    },
    close(this: any) {
        const a = apps.get(this);
        if (a) a.app.unmount();
        apps.delete(this);
    },
});

