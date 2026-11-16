/**
 * Image Tools panel: a list of images, a zoomable before / after split
 * preview (rendered by the main process with Cocos' sharp), inspector-like
 * settings and batch apply with progress, overwrite (with backup) or copy.
 */
import { createApp } from 'vue';
import { IMAGE_STYLE } from './image/style';
import { IMAGE_TEMPLATE } from './image/template';
import { ICONS } from './common/icons';
import { baseName, call, dropItems, exactBuffer, formatBytes, message, plain, toBytes } from './common/ipc';
import { defaultImageOptions, defaultSaveOptions, mergeImageOptions, parseColor, resolveFormat } from '../shared/image/options';
import { cropRect, sizeHints } from '../shared/image/sizing';

const STORE = 'media-utils.image-tools';

interface ImageFile {
    path: string;
    name: string;
    size: number;
    width: number;
    height: number;
    format: string;
    hasAlpha: boolean;
    url: string | null;
    status: 'idle' | 'busy' | 'done' | 'skipped' | 'error';
    resultSize: number;
    error: string;
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
        // storage unavailable: settings are simply not remembered
    }
}

function hex2(n: number): string {
    return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
}

const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function createImageApp(el: HTMLElement) {
    const stored = loadStore();
    const app = createApp({
        template: IMAGE_TEMPLATE,
        data() {
            return {
                ic: ICONS,
                files: [] as ImageFile[],
                current: -1,
                o: mergeImageOptions(stored.options),
                save: Object.assign(defaultSaveOptions(), stored.save || {}),
                folds: Object.assign({ crop: false, trim: false, transform: true, resize: true, pad: false, adjust: false, alpha: false, encode: true, save: true }, stored.folds || {}),
                listWidth: stored.listWidth || 220,
                settingsWidth: stored.settingsWidth || 310,
                view: { mode: 'split', fit: true, zoom: 1, panX: 0, panY: 0, split: 0.5 },
                stageW: 0,
                stageH: 0,
                panning: false,
                originalUrl: '',
                resultUrl: '',
                preview: { busy: false, error: '', result: null as any, displayScale: 1, warnings: [] as string[] },
                cropEditing: false,
                cropHandles: CROP_HANDLES,
                batch: { running: false, done: 0, total: 0, cancel: false },
                backup: { sessions: 0, last: null as any },
                caps: { loaded: false, avif: false, error: '' },
                notice: '',
                noticeKind: 'info',
                dragOver: false,
                modal: null as null | { text: string; ok: string; resolve: (v: boolean) => void },
                adjustSliders: [
                    { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
                    { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
                    { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
                    { key: 'hue', label: 'Hue', min: -180, max: 180 },
                ],
            };
        },
        computed: {
            currentFile(this: any): ImageFile | null {
                return this.files[this.current] || null;
            },
            outFormat(this: any): string {
                return this.currentFile ? resolveFormat(this.currentFile.path, this.o.encode.format) : this.o.encode.format === 'keep' ? 'png' : this.o.encode.format;
            },
            currentFormatLabel(this: any): string {
                return this.currentFile ? resolveFormat(this.currentFile.path, 'keep').toUpperCase() : 'source';
            },
            transformOn(this: any): boolean {
                const t = this.o.transform;
                return !!(t.rotate || t.flipH || t.flipV);
            },
            backupTitle(this: any): string {
                const l = this.backup.last;
                if (!l) return 'No overwrite to restore';
                return `Restore the ${l.files} file(s) overwritten by "${l.label}" (${new Date(l.time).toLocaleString()})`;
            },
            noticeClass(this: any): string {
                return this.noticeKind === 'error' ? 'mu-err' : this.noticeKind === 'warn' ? 'mu-warn' : this.noticeKind === 'ok' ? 'mu-ok' : '';
            },
            fitScale(this: any): number {
                const f = this.currentFile;
                if (!f || !f.width || !this.stageW) return 1;
                return Math.max(0.01, Math.min((this.stageW - 24) / f.width, (this.stageH - 24) / f.height));
            },
            scale(this: any): number {
                return this.view.fit ? this.fitScale : this.view.zoom;
            },
            beforeRect(this: any) {
                const f = this.currentFile;
                if (!f) return { left: 0, top: 0, width: 0, height: 0 };
                const w = f.width * this.scale;
                const h = f.height * this.scale;
                return { left: this.stageW / 2 - w / 2 + this.view.panX, top: this.stageH / 2 - h / 2 + this.view.panY, width: w, height: h };
            },
            afterRect(this: any) {
                const r = this.preview.result;
                if (!r) return this.beforeRect;
                const k = this.scale * (this.preview.displayScale || 1);
                const w = r.width * k;
                const h = r.height * k;
                return { left: this.stageW / 2 - w / 2 + this.view.panX, top: this.stageH / 2 - h / 2 + this.view.panY, width: w, height: h };
            },
            beforeStyle(this: any) {
                const r = this.beforeRect;
                return { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', imageRendering: this.scale >= 2 ? 'pixelated' : 'auto' };
            },
            afterStyle(this: any) {
                const r = this.afterRect;
                return { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', imageRendering: this.scale * (this.preview.displayScale || 1) >= 2 ? 'pixelated' : 'auto' };
            },
            splitX(this: any): number {
                return Math.round(this.stageW * this.view.split);
            },
            beforeClip(this: any) {
                if (this.view.mode !== 'split' || this.cropEditing || !this.resultUrl) return {};
                return { clipPath: `inset(0 ${this.stageW - this.splitX}px 0 0)` };
            },
            afterClip(this: any) {
                if (this.view.mode !== 'split') return {};
                return { clipPath: `inset(0 0 0 ${this.splitX}px)` };
            },
            cropPx(this: any) {
                const f = this.currentFile;
                if (!f) return { left: 0, top: 0, width: 0, height: 0 };
                return cropRect(f.width, f.height, this.o.crop);
            },
            cropBoxStyle(this: any) {
                const b = this.beforeRect;
                const c = this.o.crop;
                return { left: b.left + c.x * b.width + 'px', top: b.top + c.y * b.height + 'px', width: c.width * b.width + 'px', height: c.height * b.height + 'px' };
            },
            /** Four rectangles dimming the stage outside the crop box. */
            cropShade(this: any) {
                const b = this.beforeRect;
                const c = this.o.crop;
                const x0 = b.left + c.x * b.width;
                const y0 = b.top + c.y * b.height;
                const x1 = x0 + c.width * b.width;
                const y1 = y0 + c.height * b.height;
                const W = this.stageW;
                const H = this.stageH;
                const px = (v: number) => Math.max(0, v) + 'px';
                return [
                    { left: '0px', top: '0px', width: px(W), height: px(y0) },
                    { left: '0px', top: px(y1), width: px(W), height: px(H - y1) },
                    { left: '0px', top: px(y0), width: px(x0), height: px(y1 - y0) },
                    { left: px(x1), top: px(y0), width: px(W - x1), height: px(y1 - y0) },
                ];
            },
            sizeDelta(this: any): string {
                const f = this.currentFile;
                const r = this.preview.result;
                if (!f || !r || !f.size) return '';
                const d = ((r.size - f.size) / f.size) * 100;
                return (d > 0 ? '+' : '') + d.toFixed(1) + '%';
            },
            sizeHint(this: any): string {
                const r = this.preview.result;
                return r ? sizeHints(r.width, r.height).join(' ') : '';
            },
        },
        watch: {
            o: {
                deep: true,
                handler(this: any) {
                    this.persist();
                    this.schedulePreview();
                },
            },
            save: { deep: true, handler(this: any) { this.persist(); } },
            folds: { deep: true, handler(this: any) { this.persist(); } },
        },
        methods: {
            bytes: formatBytes,
            persist(this: any) {
                saveStore({ options: plain(this.o), save: plain(this.save), folds: plain(this.folds), listWidth: this.listWidth, settingsWidth: this.settingsWidth });
            },
            show(this: any, text: string, kind = 'info') {
                this.notice = text;
                this.noticeKind = kind;
            },
            ask(this: any, text: string, ok: string): Promise<boolean> {
                return new Promise((resolve) => {
                    this.modal = { text, ok, resolve };
                });
            },
            closeModal(this: any, v: boolean) {
                const m = this.modal;
                this.modal = null;
                if (m) m.resolve(v);
            },
            toggleFold(this: any, key: string) {
                this.folds[key] = !this.folds[key];
            },

            // ---- files ----
            async addPaths(this: any, paths: string[], replace = false) {
                if (replace) {
                    this.files = [];
                    this.current = -1;
                }
                const known = new Set(this.files.map((f: ImageFile) => f.path.toLowerCase()));
                let added = 0;
                const errors: string[] = [];
                for (const p of paths) {
                    if (known.has(p.toLowerCase())) continue;
                    known.add(p.toLowerCase());
                    try {
                        const info = await call('image-info', p, false);
                        this.files.push({ path: p, name: info.name, size: info.size, width: info.width, height: info.height, format: info.format, hasAlpha: info.hasAlpha, url: info.url, status: 'idle', resultSize: 0, error: '' });
                        added++;
                    } catch (e) {
                        errors.push(`${baseName(p)}: ${message(e)}`);
                    }
                }
                if (this.current < 0 && this.files.length) this.select(0);
                if (errors.length) this.show(errors.join(' | '), 'error');
                else if (added) this.show(`Added ${added} image(s).`);
                return added;
            },
            async addSelected(this: any) {
                try {
                    const paths: string[] = await call('selected-assets', 'image');
                    if (!paths.length) this.show('Select image assets in the Assets panel first.', 'warn');
                    else await this.addPaths(paths);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async addFiles(this: any) {
                try {
                    await this.addPaths(await call('pick-files', 'image', true));
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async onDrop(this: any, ev: DragEvent) {
                this.dragOver = false;
                const items = dropItems(ev);
                if (!items.length) return;
                try {
                    const paths: string[] = await call('resolve-assets', 'image', items);
                    if (!paths.length) this.show('No supported images in the drop.', 'warn');
                    else await this.addPaths(paths);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            async takePending(this: any) {
                try {
                    const paths: string[] = await call('take-pending', 'image');
                    if (paths.length) await this.addPaths(paths, !this.batch.running);
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },
            clearFiles(this: any) {
                this.files = [];
                this.current = -1;
                this.setOriginal('');
                this.setResult('');
                this.preview.result = null;
                this.batch.total = 0;
            },
            removeFile(this: any, i: number) {
                if (this.batch.running) return;
                this.files.splice(i, 1);
                if (this.current >= this.files.length) this.current = this.files.length - 1;
                if (i <= this.current || !this.files.length) this.select(this.current);
            },
            select(this: any, i: number) {
                this.current = i;
                this.preview.result = null;
                this.preview.error = '';
                this.setResult('');
                this.view.fit = true;
                this.view.panX = 0;
                this.view.panY = 0;
                this.loadCurrent();
            },
            async loadCurrent(this: any) {
                const f: ImageFile | null = this.currentFile;
                if (!f) {
                    this.setOriginal('');
                    return;
                }
                try {
                    const info = await call('image-info', f.path, true);
                    if (this.currentFile !== f) return;
                    Object.assign(f, { size: info.size, width: info.width, height: info.height, format: info.format, hasAlpha: info.hasAlpha, url: info.url });
                    this.setOriginal(URL.createObjectURL(new Blob([exactBuffer(toBytes(info.display))], { type: info.displayMime })));
                    this.runPreview();
                } catch (e) {
                    this.setOriginal('');
                    this.preview.error = message(e);
                }
            },
            setOriginal(this: any, url: string) {
                if (this.originalUrl) URL.revokeObjectURL(this.originalUrl);
                this.originalUrl = url;
            },
            setResult(this: any, url: string) {
                if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
                this.resultUrl = url;
            },

            // ---- preview ----
            schedulePreview(this: any) {
                clearTimeout(this._previewTimer);
                this._previewTimer = setTimeout(() => this.runPreview(), 250);
            },
            async runPreview(this: any) {
                const f: ImageFile | null = this.currentFile;
                if (!f || !this.caps.loaded) return;
                const gen = (this._previewGen = (this._previewGen || 0) + 1);
                this.preview.busy = true;
                try {
                    const r = await call('image-preview', f.path, this.o);
                    if (gen !== this._previewGen) return;
                    this.setResult(URL.createObjectURL(new Blob([exactBuffer(toBytes(r.bytes))], { type: r.mime })));
                    this.preview.result = r.result;
                    this.preview.displayScale = r.displayScale || 1;
                    this.preview.warnings = r.warnings || [];
                    this.preview.error = '';
                } catch (e) {
                    if (gen !== this._previewGen) return;
                    this.preview.error = message(e);
                    this.preview.result = null;
                    this.setResult('');
                } finally {
                    if (gen === this._previewGen) this.preview.busy = false;
                }
            },

            // ---- view ----
            fitView(this: any) {
                this.view.fit = true;
                this.view.panX = 0;
                this.view.panY = 0;
            },
            zoomTo(this: any, z: number, cx?: number, cy?: number) {
                const old = this.scale;
                const nz = Math.max(0.02, Math.min(32, z));
                const px = cx === undefined ? this.stageW / 2 : cx;
                const py = cy === undefined ? this.stageH / 2 : cy;
                // Keep the point under the cursor fixed.
                const ux = (px - this.stageW / 2 - this.view.panX) / old;
                const uy = (py - this.stageH / 2 - this.view.panY) / old;
                this.view.fit = false;
                this.view.zoom = nz;
                this.view.panX = px - this.stageW / 2 - ux * nz;
                this.view.panY = py - this.stageH / 2 - uy * nz;
            },
            onWheel(this: any, ev: WheelEvent) {
                const rect = (this.$refs.stage as HTMLElement).getBoundingClientRect();
                const k = Math.pow(1.0015, -ev.deltaY);
                this.zoomTo(this.scale * k, ev.clientX - rect.left, ev.clientY - rect.top);
            },
            onStageDown(this: any, ev: MouseEvent) {
                if (ev.button !== 0 && ev.button !== 1) return;
                ev.preventDefault();
                const sx = ev.clientX;
                const sy = ev.clientY;
                const px = this.view.panX;
                const py = this.view.panY;
                if (this.view.fit) {
                    this.view.zoom = this.fitScale;
                }
                this.panning = true;
                const move = (e: MouseEvent) => {
                    this.view.fit = false;
                    this.view.panX = px + e.clientX - sx;
                    this.view.panY = py + e.clientY - sy;
                };
                const up = () => {
                    this.panning = false;
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },
            startSplitDrag(this: any, ev: MouseEvent) {
                ev.preventDefault();
                const rect = (this.$refs.stage as HTMLElement).getBoundingClientRect();
                const move = (e: MouseEvent) => {
                    this.view.split = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                };
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },
            startListResize(this: any, ev: MouseEvent) {
                this.dragWidth(ev, 'listWidth', 1);
            },
            startSettingsResize(this: any, ev: MouseEvent) {
                this.dragWidth(ev, 'settingsWidth', -1);
            },
            dragWidth(this: any, ev: MouseEvent, key: string, sign: number) {
                ev.preventDefault();
                const sx = ev.clientX;
                const start = this[key];
                const move = (e: MouseEvent) => {
                    this[key] = Math.max(140, Math.min(600, start + sign * (e.clientX - sx)));
                };
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                    this.persist();
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },
            onKey(this: any, ev: KeyboardEvent) {
                const t = ev.target as HTMLElement;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
                if (ev.key === 'ArrowDown' && this.current < this.files.length - 1) {
                    this.select(this.current + 1);
                    ev.preventDefault();
                } else if (ev.key === 'ArrowUp' && this.current > 0) {
                    this.select(this.current - 1);
                    ev.preventDefault();
                } else if (ev.key === 'f' || ev.key === 'F') {
                    this.fitView();
                } else if (ev.key === 'Escape' && this.cropEditing) {
                    this.cropEditing = false;
                }
            },

            // ---- crop ----
            toggleCropEdit(this: any) {
                this.cropEditing = !this.cropEditing;
                if (this.cropEditing) {
                    this.o.crop.enabled = true;
                    this.folds.crop = true;
                }
            },
            resetCrop(this: any) {
                Object.assign(this.o.crop, { x: 0, y: 0, width: 1, height: 1 });
            },
            setCropPx(this: any, key: string, ev: Event) {
                const f = this.currentFile;
                if (!f) return;
                const v = Math.round(Number((ev.target as HTMLInputElement).value) || 0);
                const px = Object.assign({}, this.cropPx);
                px[key] = v;
                px.left = Math.max(0, Math.min(f.width - 1, px.left));
                px.top = Math.max(0, Math.min(f.height - 1, px.top));
                px.width = Math.max(1, Math.min(f.width - px.left, px.width));
                px.height = Math.max(1, Math.min(f.height - px.top, px.height));
                Object.assign(this.o.crop, { enabled: true, x: px.left / f.width, y: px.top / f.height, width: px.width / f.width, height: px.height / f.height });
            },
            startCropDrag(this: any, ev: MouseEvent, handle: string) {
                ev.preventDefault();
                const f = this.currentFile;
                if (!f) return;
                const b = this.beforeRect;
                const start = Object.assign({}, this.o.crop);
                const sx = ev.clientX;
                const sy = ev.clientY;
                const minW = 1 / f.width;
                const minH = 1 / f.height;
                const move = (e: MouseEvent) => {
                    const dx = (e.clientX - sx) / b.width;
                    const dy = (e.clientY - sy) / b.height;
                    let x0 = start.x;
                    let y0 = start.y;
                    let x1 = start.x + start.width;
                    let y1 = start.y + start.height;
                    if (handle === 'move') {
                        const w = start.width;
                        const h = start.height;
                        x0 = Math.max(0, Math.min(1 - w, start.x + dx));
                        y0 = Math.max(0, Math.min(1 - h, start.y + dy));
                        x1 = x0 + w;
                        y1 = y0 + h;
                    } else {
                        if (handle.indexOf('w') >= 0) x0 = Math.max(0, Math.min(x1 - minW, start.x + dx));
                        if (handle.indexOf('e') >= 0) x1 = Math.min(1, Math.max(x0 + minW, start.x + start.width + dx));
                        if (handle.indexOf('n') >= 0) y0 = Math.max(0, Math.min(y1 - minH, start.y + dy));
                        if (handle.indexOf('s') >= 0) y1 = Math.min(1, Math.max(y0 + minH, start.y + start.height + dy));
                    }
                    // Snap to whole pixels.
                    const sxp = (v: number) => Math.round(v * f.width) / f.width;
                    const syp = (v: number) => Math.round(v * f.height) / f.height;
                    x0 = sxp(x0);
                    x1 = sxp(x1);
                    y0 = syp(y0);
                    y1 = syp(y1);
                    Object.assign(this.o.crop, { x: x0, y: y0, width: Math.max(minW, x1 - x0), height: Math.max(minH, y1 - y0) });
                };
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },

            // ---- settings helpers ----
            setResizeDim(this: any, key: 'width' | 'height', ev: Event) {
                const v = Math.max(0, Math.round(Number((ev.target as HTMLInputElement).value) || 0));
                const r = this.o.resize;
                r[key] = v;
                const f = this.currentFile;
                if (r.keepAspect && f && f.width && f.height && v) {
                    if (key === 'width') r.height = Math.round((v * f.height) / f.width);
                    else r.width = Math.round((v * f.width) / f.height);
                }
            },
            resetAdjust(this: any) {
                Object.assign(this.o.adjust, defaultImageOptions().adjust, { enabled: this.o.adjust.enabled });
            },
            hex6(c: string): string {
                const p = parseColor(c);
                return '#' + hex2(p.r) + hex2(p.g) + hex2(p.b);
            },
            alphaOf(c: string): number {
                return Math.round(parseColor(c).alpha * 255);
            },
            withAlpha(this: any, rgb: string, old: string): string {
                return rgb + hex2(this.alphaOf(old));
            },
            setAlpha(this: any, c: string, a: any): string {
                return this.hex6(c) + hex2(Number(a));
            },
            async pickFolder(this: any) {
                try {
                    const dir = await call('pick-folder', this.save.folder || undefined);
                    if (dir) this.save.folder = dir;
                } catch (e) {
                    this.show(message(e), 'error');
                }
            },

            // ---- apply ----
            async apply(this: any, all: boolean) {
                const list: ImageFile[] = all ? this.files.slice() : this.currentFile ? [this.currentFile] : [];
                if (!list.length || this.batch.running) return;
                const overwrite = this.save.mode === 'overwrite';
                if (overwrite) {
                    const ok = await this.ask(`Overwrite ${list.length} file(s) in place?\n\nThe assets keep their uuid and import settings. The originals are backed up to temp/media-utils/backup; use Restore Last to undo.`, 'Overwrite');
                    if (!ok) return;
                }
                let session: string | undefined;
                try {
                    if (overwrite) session = await call('backup-begin', `Image Tools: ${list.length === 1 ? list[0].name : list.length + ' images'}`);
                } catch (e) {
                    this.show(message(e), 'error');
                    return;
                }
                Object.assign(this.batch, { running: true, done: 0, total: list.length, cancel: false });
                let before = 0;
                let after = 0;
                let failed = 0;
                let lastOut = '';
                for (const f of list) {
                    if (this.batch.cancel) break;
                    f.status = 'busy';
                    try {
                        const r = await call('image-process', f.path, this.o, this.save, session);
                        f.status = r.skipped ? 'skipped' : 'done';
                        f.resultSize = r.size;
                        before += r.before;
                        after += r.size;
                        lastOut = r.path;
                        if (overwrite && r.path !== f.path) {
                            f.path = r.path;
                            f.name = baseName(r.path);
                        }
                    } catch (e) {
                        f.status = 'error';
                        f.error = message(e);
                        failed++;
                    }
                    this.batch.done++;
                }
                const cancelled = this.batch.cancel;
                this.batch.running = false;
                const saved = before ? ((before - after) / before) * 100 : 0;
                const summary = `${this.batch.done} processed${failed ? `, ${failed} failed` : ''}${cancelled ? ' (cancelled)' : ''}. ${formatBytes(before)} -> ${formatBytes(after)} (${saved >= 0 ? '-' : '+'}${Math.abs(saved).toFixed(1)}%).`;
                this.show(summary, failed ? 'error' : 'ok');
                this.refreshBackup();
                if (overwrite) {
                    for (const f of list) if (f.status === 'done') this.refreshInfo(f);
                    if (this.currentFile) this.loadCurrent();
                } else if (list.length === 1 && lastOut) {
                    call('reveal', lastOut).catch(() => undefined);
                }
            },
            async refreshInfo(this: any, f: ImageFile) {
                try {
                    const info = await call('image-info', f.path, false);
                    Object.assign(f, { size: info.size, width: info.width, height: info.height, format: info.format, hasAlpha: info.hasAlpha, url: info.url });
                } catch (e) {
                    f.status = 'error';
                    f.error = message(e);
                }
            },
            async refreshBackup(this: any) {
                try {
                    this.backup = await call('backup-info');
                } catch (e) {
                    // no backups yet
                }
            },
            async restoreLast(this: any) {
                const l = this.backup.last;
                if (!l) return;
                const ok = await this.ask(`Restore the ${l.files} file(s) overwritten by "${l.label}"?`, 'Restore');
                if (!ok) return;
                try {
                    const r = await call('restore-last');
                    this.show(`Restored ${r.files.length} file(s).`, 'ok');
                    this.onRestored(r.files);
                } catch (e) {
                    this.show(message(e), 'error');
                }
                this.refreshBackup();
            },
            onRestored(this: any, files: string[]) {
                // A restore can move a file back to its old extension: re-match by name stem.
                const stem = (p: string) => p.replace(/\.[^./\\]+$/, '').toLowerCase();
                for (const p of files || []) {
                    const f = this.files.find((x: ImageFile) => stem(x.path) === stem(p));
                    if (f) {
                        f.path = p;
                        f.name = baseName(p);
                        f.status = 'idle';
                        this.refreshInfo(f);
                    }
                }
                if (this.currentFile) this.loadCurrent();
                this.refreshBackup();
            },
        },
        async mounted(this: any) {
            const stage = this.$refs.stage as HTMLElement;
            let raf = 0;
            this._ro = new ResizeObserver(() => {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    const s = this.$refs.stage as HTMLElement;
                    if (!s) return;
                    this.stageW = s.clientWidth;
                    this.stageH = s.clientHeight;
                });
            });
            if (stage) this._ro.observe(stage);
            try {
                const caps = await call('image-capabilities');
                this.caps = { loaded: caps.loaded, avif: !!(caps.formats && (caps.formats.avif || caps.formats.heif)), error: caps.error };
                if (!caps.loaded) this.show(caps.error, 'error');
            } catch (e) {
                this.caps = { loaded: false, avif: false, error: message(e) };
            }
            this.refreshBackup();
            await this.takePending();
        },
        beforeUnmount(this: any) {
            if (this._ro) this._ro.disconnect();
            this.setOriginal('');
            this.setResult('');
        },
    });
    app.config.compilerOptions.isCustomElement = (tag: string) => tag.startsWith('ui-');
    const vm: any = app.mount(el);
    return { app, vm };
}

const apps = new WeakMap<object, { app: any; vm: any }>();

module.exports = Editor.Panel.define({
    template: '<div id="app"></div>',
    style: IMAGE_STYLE,
    $: { app: '#app' },
    methods: {
        /** 'media-utils:pending-image': the Assets panel menu queued images. */
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
        apps.set(this, createImageApp(this.$.app as HTMLElement));
    },
    close(this: any) {
        const a = apps.get(this);
        if (a) a.app.unmount();
        apps.delete(this);
    },
});
