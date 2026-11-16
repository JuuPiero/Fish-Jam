/**
 * Profiler window (Unity's Profiler): CPU Usage by part of the frame,
 * Rendering and Memory charts over the last frames of a connected game, and
 * the Hierarchy of the selected frame (Total / Self / Calls).
 */
import { createApp } from 'vue';
import { formatBytes, formatCount, formatMs, frameAtX } from '../../assets/core/chart';
import { buildHierarchy, flattenHierarchy, HierarchyNode, SortColumn } from '../../assets/core/hierarchy';
import { CPU_CATEGORIES, cpuBreakdown, CpuCategory } from '../../assets/core/phases';
import { FrameData } from '../../assets/core/protocol';
import { ChartSeries, drawChart } from './charts';
import { BASE_CSS, SERIES } from './theme';

const PKG = 'profiler';
const CAPACITY = 300;

/** CPU categories drawn (Idle is the gap above the stack, not a series). */
const CPU_SERIES: CpuCategory[] = CPU_CATEGORIES.filter((c) => c !== 'Idle');

const STYLE = BASE_CSS + /* css */ `
.pf-modules { flex: 0 0 auto; display: flex; flex-direction: column; border-bottom: 1px solid var(--color-normal-border, #222); }
.pf-module { display: flex; height: 112px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.pf-module.cpu { height: 150px; }
.pf-legend { width: 176px; flex: none; padding: 4px 6px; box-sizing: border-box; overflow: hidden; border-right: 1px solid var(--color-normal-border, #222); }
.pf-legend .title { font-weight: bold; margin-bottom: 3px; }
.pf-legend .entry { display: flex; align-items: center; gap: 6px; height: 17px; cursor: pointer; user-select: none; }
.pf-legend .entry.off { opacity: 0.4; }
.pf-legend .sw { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.pf-legend .val { margin-left: auto; color: var(--color-normal-contrast-weaker, #c3c2b7); font-variant-numeric: tabular-nums; }
.pf-module canvas { flex: 1; min-width: 0; height: 100%; display: block; cursor: crosshair; }
.pf-details { padding: 4px 8px; display: flex; gap: 14px; flex-wrap: wrap; border-bottom: 1px solid var(--color-normal-border, #222); color: var(--color-normal-contrast-weaker, #c3c2b7); }
.pf-details b { color: var(--color-normal-contrast, #f0efec); font-weight: normal; font-variant-numeric: tabular-nums; }
.pf-hier { flex: 1; overflow: auto; min-height: 80px; }
.pf-hier .name { display: inline-flex; align-items: center; }
`;

const TEMPLATE = /* html */ `
<div class="pf" tabindex="0" @keydown="onKey">
  <div class="pf-toolbar">
    <select class="pf-select" v-model.number="clientId" @change="loadFrames" :disabled="!clients.length" title="Connected game">
      <option v-if="!clients.length" :value="0">No game connected</option>
      <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.runtime }} · {{ c.platform }}</option>
    </select>
    <button class="pf-btn" :class="{ on: recording }" @click="setRecording(!recording)" title="Record frames from the game">Record</button>
    <button class="pf-btn" :class="{ on: deep }" @click="setDeep(!deep)" title="Time every script's update and lateUpdate (slower)">Deep Profile</button>
    <button class="pf-btn" @click="clear" title="Forget the recorded frames">Clear</button>
    <button class="pf-btn" :disabled="following" @click="follow" title="Follow the newest frame">Current</button>
    <span class="pf-grow"></span>
    <span class="pf-dim pf-mono">{{ frameText }}</span>
    <label class="pf-check" title="Accept games from other devices on the network (phones)"><input type="checkbox" :checked="lan" @change="setLan($event.target.checked)"> LAN</label>
  </div>

  <div v-if="!clients.length" class="pf-empty">
    <div><b>No game connected.</b></div>
    <div>Press Play in the editor or open a browser preview: debug builds connect by themselves.</div>
    <div v-if="lan && addresses.length">Phone: open the preview URL with this computer's address ({{ addresses.join(', ') }}) instead of localhost.</div>
    <div v-else-if="!lan">Turn on LAN to profile a phone on the same network.</div>
    <div class="pf-dim" v-if="serverText">{{ serverText }}</div>
  </div>

  <template v-else>
    <div class="pf-modules">
      <div class="pf-module cpu">
        <div class="pf-legend">
          <div class="title">CPU Usage</div>
          <div v-for="(c, i) in cpuSeries" :key="c" class="entry" :class="{ off: !visible[c] }" @click="toggle(c)">
            <span class="sw" :style="{ background: colors[i] }"></span><span>{{ c }}</span><span class="val">{{ legendCpu(c) }}</span>
          </div>
        </div>
        <canvas ref="cpu" @mousemove="onMove($event, 'cpu')" @mouseleave="onLeave" @click="onClick" @dblclick="follow"></canvas>
      </div>
      <div class="pf-module">
        <div class="pf-legend">
          <div class="title">Rendering</div>
          <div class="entry"><span class="sw" :style="{ background: colors[0] }"></span><span>Draw Calls</span><span class="val">{{ legendRender('drawCalls') }}</span></div>
          <div class="entry"><span class="sw" style="visibility:hidden"></span><span class="pf-dim">Triangles</span><span class="val">{{ legendRender('triangles') }}</span></div>
          <div class="entry"><span class="sw" style="visibility:hidden"></span><span class="pf-dim">Instances</span><span class="val">{{ legendRender('instances') }}</span></div>
        </div>
        <canvas ref="render" @mousemove="onMove($event, 'render')" @mouseleave="onLeave" @click="onClick" @dblclick="follow"></canvas>
      </div>
      <div class="pf-module">
        <div class="pf-legend">
          <div class="title">Memory</div>
          <div class="entry" :class="{ off: !visible.heap }" @click="toggle('heap')"><span class="sw" :style="{ background: colors[0] }"></span><span>JS Heap</span><span class="val">{{ legendMemory('heapUsed') }}</span></div>
          <div class="entry" :class="{ off: !visible.tex }" @click="toggle('tex')"><span class="sw" :style="{ background: colors[1] }"></span><span>Textures (est.)</span><span class="val">{{ legendMemory('textureBytes') }}</span></div>
          <div class="entry"><span class="sw" style="visibility:hidden"></span><span class="pf-dim">Assets / Nodes</span><span class="val">{{ legendCounts() }}</span></div>
        </div>
        <canvas ref="memory" @mousemove="onMove($event, 'memory')" @mouseleave="onLeave" @click="onClick" @dblclick="follow"></canvas>
      </div>
    </div>
    <div class="pf-details" v-if="current">
      <span>Frame <b>{{ current.index }}</b></span>
      <span>CPU <b>{{ ms(current.cpuMs) }}</b></span>
      <span>Frame <b>{{ ms(current.frameMs) }}</b> (<b>{{ fps(current.frameMs) }}</b> FPS)</span>
      <span v-if="current.render">Render passes <b>{{ current.render.passes >= 0 ? current.render.passes : 'n/a' }}</b></span>
    </div>
    <div class="pf-hier">
      <table class="pf-table">
        <thead><tr>
          <th @click="sortBy('name')">Overview{{ arrow('name') }}</th>
          <th @click="sortBy('total')">Total{{ arrow('total') }}</th>
          <th @click="sortBy('self')">Self{{ arrow('self') }}</th>
          <th @click="sortBy('calls')">Calls{{ arrow('calls') }}</th>
          <th @click="sortBy('total')">Time ms</th>
          <th @click="sortBy('self')">Self ms</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key" :class="{ sel: r.key === selectedKey }" @click="selectedKey = r.key">
            <td><span class="name" :style="{ paddingLeft: (r.depth * 14) + 'px' }"><span class="pf-caret" @click.stop="toggleRow(r)">{{ r.children.length ? (isOpen(r.key) ? '▾' : '▸') : '' }}</span>{{ r.name }}</span></td>
            <td>{{ pct(r.totalMs) }}</td>
            <td>{{ pct(r.selfMs) }}</td>
            <td>{{ r.calls }}</td>
            <td>{{ r.totalMs.toFixed(2) }}</td>
            <td>{{ r.selfMs.toFixed(2) }}</td>
          </tr>
          <tr v-if="!rows.length"><td colspan="6" class="pf-dim">{{ recording ? 'Waiting for frames...' : 'Recording is off.' }}</td></tr>
        </tbody>
      </table>
    </div>
  </template>

  <div class="pf-tip" v-show="tip.show" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
    <div class="pf-dim">Frame {{ tip.frame }}</div>
    <div class="row" v-for="t in tip.rows" :key="t.name"><span class="key" :style="{ background: t.color }"></span><span>{{ t.name }}</span><span class="v">{{ t.value }}</span></div>
  </div>
</div>
`;

/** Frames and names of the selected game (outside Vue's reactivity: up to 300 frames of samples). */
const store = { frames: [] as FrameData[], names: {} as Record<number, string>, cpu: new WeakMap<FrameData, Record<CpuCategory, number>>() };

function nameOf(id: number): string {
    return store.names[id];
}

function cpuOf(f: FrameData): Record<CpuCategory, number> {
    let c = store.cpu.get(f);
    if (!c) {
        c = cpuBreakdown(f, nameOf);
        store.cpu.set(f, c);
    }
    return c;
}

/** Memory is sampled every few frames: carry the last value forward. */
function memorySeries(key: 'heapUsed' | 'textureBytes'): number[] {
    const out: number[] = [];
    let last = -1;
    for (let i = 0; i < store.frames.length; i++) {
        const m = store.frames[i].memory;
        if (m) last = m[key];
        out.push(last);
    }
    return out;
}

function lastMemory(upTo: number): FrameData['memory'] & { nodes?: number } | null {
    for (let i = Math.min(upTo, store.frames.length - 1); i >= 0; i--) {
        const f = store.frames[i];
        if (f.memory) return Object.assign({ nodes: f.nodes }, f.memory);
    }
    return null;
}

function req(msg: string, ...args: any[]): Promise<any> {
    return (Editor.Message.request as any)(PKG, msg, ...args);
}

interface PanelApp {
    onFrames(arg: any): void;
    onClients(list: any[]): void;
    dispose(): void;
}

function createProfilerApp(el: HTMLElement): PanelApp {
    let raf = 0;
    let poll: any = null;
    const expanded = new Set<string>();
    const app = createApp({
        template: TEMPLATE,
        data() {
            return {
                clients: [] as any[],
                clientId: 0,
                recording: true,
                deep: false,
                lan: false,
                addresses: [] as string[],
                serverText: '',
                version: 0,
                selected: -1,
                hover: -1,
                following: true,
                sortCol: 'total' as SortColumn,
                sortDesc: true,
                openVersion: 0,
                selectedKey: '',
                visible: { Rendering: true, Scripts: true, Systems: true, Input: true, Other: true, heap: true, tex: true } as Record<string, boolean>,
                colors: SERIES,
                cpuSeries: CPU_SERIES,
                tip: { show: false, x: 0, y: 0, frame: 0, rows: [] as { name: string; color: string; value: string }[] },
            };
        },
        computed: {
            frameIndex(this: any): number {
                void this.version;
                const n = store.frames.length;
                if (!n) return -1;
                return this.following || this.selected < 0 || this.selected >= n ? n - 1 : this.selected;
            },
            current(this: any): FrameData | null {
                void this.version;
                return this.frameIndex >= 0 ? store.frames[this.frameIndex] : null;
            },
            frameText(this: any): string {
                const f: FrameData | null = this.current;
                if (!f) return '';
                return (this.following ? 'Current ' : 'Selected ') + 'frame ' + f.index + ' · ' + f.cpuMs.toFixed(2) + ' ms CPU';
            },
            hierarchy(this: any): HierarchyNode[] {
                const f: FrameData | null = this.current;
                return f ? buildHierarchy(f, nameOf) : [];
            },
            rows(this: any): HierarchyNode[] {
                void this.openVersion;
                return flattenHierarchy(this.hierarchy, (k) => expanded.has(k), this.sortCol, this.sortDesc);
            },
        },
        methods: {
            ms(v: number): string {
                return formatMs(v);
            },
            fps(frameMs: number): string {
                return frameMs > 0 ? (1000 / frameMs).toFixed(0) : '-';
            },
            pct(this: any, v: number): string {
                const f: FrameData | null = this.current;
                return f && f.cpuMs > 0 ? ((v / f.cpuMs) * 100).toFixed(1) + '%' : '-';
            },
            arrow(this: any, col: SortColumn): string {
                return this.sortCol === col ? (this.sortDesc ? ' ▾' : ' ▴') : '';
            },
            sortBy(this: any, col: SortColumn) {
                if (this.sortCol === col) this.sortDesc = !this.sortDesc;
                else {
                    this.sortCol = col;
                    this.sortDesc = col !== 'name';
                }
            },
            isOpen(k: string): boolean {
                return expanded.has(k);
            },
            toggleRow(this: any, r: HierarchyNode) {
                if (!r.children.length) return;
                if (expanded.has(r.key)) expanded.delete(r.key);
                else expanded.add(r.key);
                this.openVersion++;
            },
            toggle(this: any, key: string) {
                this.visible[key] = !this.visible[key];
                this.draw();
            },
            legendCpu(this: any, c: CpuCategory): string {
                const f: FrameData | null = this.current;
                return f ? cpuOf(f)[c].toFixed(2) + ' ms' : '';
            },
            legendRender(this: any, k: 'drawCalls' | 'triangles' | 'instances'): string {
                const f: FrameData | null = this.current;
                return f && f.render ? formatCount(f.render[k]) : '';
            },
            legendMemory(this: any, k: 'heapUsed' | 'textureBytes'): string {
                const m = lastMemory(this.frameIndex);
                return m ? formatBytes(m[k]) : '';
            },
            legendCounts(this: any): string {
                const m = lastMemory(this.frameIndex);
                return m ? formatCount(m.assets) + ' / ' + (m.nodes !== undefined ? formatCount(m.nodes) : '-') : '';
            },
            // ------------------------------------------------ data
            async refreshStatus(this: any) {
                try {
                    const s = await req('status');
                    this.applyStatus(s);
                } catch (e) {
                    // extension reloading
                }
            },
            applyStatus(this: any, s: any) {
                if (!s) return;
                this.recording = !!s.recording;
                this.deep = !!s.deep;
                this.lan = !!s.lan;
                this.addresses = s.addresses || [];
                this.serverText = s.running ? 'Listening on ' + s.host + ':' + s.port : 'Server not running: ' + s.error;
                this.onClientList(s.clients || []);
            },
            onClientList(this: any, list: any[]) {
                this.clients = list;
                if (!list.some((c: any) => c.id === this.clientId)) {
                    this.clientId = list.length ? list[list.length - 1].id : 0;
                    this.loadFrames();
                }
            },
            async loadFrames(this: any) {
                store.frames = [];
                store.names = {};
                store.cpu = new WeakMap();
                this.selected = -1;
                this.following = true;
                if (this.clientId) {
                    try {
                        const r = await req('get-frames', this.clientId);
                        if (r) {
                            store.names = r.names || {};
                            store.frames = r.frames || [];
                        }
                    } catch (e) {
                        // nothing kept
                    }
                }
                this.version++;
                this.draw();
            },
            addFrames(this: any, arg: any) {
                if (!arg || arg.client !== this.clientId) return;
                if (arg.names) Object.keys(arg.names).forEach((k) => (store.names[Number(k)] = arg.names[k]));
                const fs: FrameData[] = arg.frames || [];
                for (let i = 0; i < fs.length; i++) store.frames.push(fs[i]);
                const over = store.frames.length - CAPACITY;
                if (over > 0) {
                    store.frames.splice(0, over);
                    if (!this.following) this.selected = Math.max(0, this.selected - over);
                }
                this.version++;
                this.draw();
            },
            async setRecording(this: any, on: boolean) {
                this.applyStatus(await req('set-recording', { on }));
            },
            async setDeep(this: any, on: boolean) {
                this.applyStatus(await req('set-recording', { deep: on }));
            },
            async setLan(this: any, on: boolean) {
                this.applyStatus(await req('set-lan', on));
            },
            async clear(this: any) {
                await req('clear-frames', this.clientId);
                store.frames = [];
                store.cpu = new WeakMap();
                this.selected = -1;
                this.following = true;
                this.version++;
                this.draw();
            },
            follow(this: any) {
                this.following = true;
                this.selected = -1;
                this.draw();
            },
            // ------------------------------------------------ charts
            draw(this: any) {
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    this.paint();
                });
            },
            paint(this: any) {
                const refs = this.$refs as any;
                if (!refs.cpu) return;
                const sel = this.following ? -1 : this.selected;
                const cpu: ChartSeries[] = CPU_SERIES.map((c, i) => ({ name: c, color: SERIES[i], visible: !!this.visible[c], values: store.frames.map((f) => cpuOf(f)[c]) }));
                drawChart({
                    canvas: refs.cpu,
                    capacity: CAPACITY,
                    stacked: true,
                    series: cpu,
                    format: (v) => v.toFixed(v < 10 ? 1 : 0) + 'ms',
                    refLines: [{ value: 1000 / 60, label: '16.7ms (60 FPS)' }, { value: 1000 / 30, label: '33.3ms (30 FPS)' }],
                    minMax: 8,
                    selected: sel,
                    hover: this.hover,
                });
                drawChart({
                    canvas: refs.render,
                    capacity: CAPACITY,
                    stacked: false,
                    series: [{ name: 'Draw Calls', color: SERIES[0], visible: true, values: store.frames.map((f) => (f.render ? f.render.drawCalls : -1)) }],
                    format: (v) => formatCount(v),
                    minMax: 10,
                    selected: sel,
                    hover: this.hover,
                });
                drawChart({
                    canvas: refs.memory,
                    capacity: CAPACITY,
                    stacked: false,
                    series: [
                        { name: 'JS Heap', color: SERIES[0], visible: !!this.visible.heap, values: memorySeries('heapUsed') },
                        { name: 'Textures (est.)', color: SERIES[1], visible: !!this.visible.tex, values: memorySeries('textureBytes') },
                    ],
                    format: (v) => formatBytes(v),
                    minMax: 1024 * 1024,
                    selected: sel,
                    hover: this.hover,
                });
            },
            onMove(this: any, ev: MouseEvent, which: string) {
                const c = ev.currentTarget as HTMLCanvasElement;
                const r = c.getBoundingClientRect();
                const i = frameAtX(ev.clientX - r.left, r.width, store.frames.length, CAPACITY);
                if (i !== this.hover) {
                    this.hover = i;
                    this.draw();
                }
                if (i < 0) {
                    this.tip.show = false;
                    return;
                }
                const f = store.frames[i];
                const rows: { name: string; color: string; value: string }[] = [];
                if (which === 'cpu') {
                    const b = cpuOf(f);
                    CPU_SERIES.forEach((cat, k) => {
                        if (this.visible[cat]) rows.push({ name: cat, color: SERIES[k], value: b[cat].toFixed(2) + ' ms' });
                    });
                    rows.push({ name: 'Frame', color: 'transparent', value: f.frameMs.toFixed(2) + ' ms' });
                } else if (which === 'render') {
                    if (f.render) {
                        rows.push({ name: 'Draw Calls', color: SERIES[0], value: formatCount(f.render.drawCalls) });
                        rows.push({ name: 'Triangles', color: 'transparent', value: formatCount(f.render.triangles) });
                        rows.push({ name: 'Instances', color: 'transparent', value: formatCount(f.render.instances) });
                    }
                } else {
                    const m = lastMemory(i);
                    if (m) {
                        rows.push({ name: 'JS Heap', color: SERIES[0], value: formatBytes(m.heapUsed) });
                        rows.push({ name: 'Textures (est.)', color: SERIES[1], value: formatBytes(m.textureBytes) });
                    }
                }
                this.tip.rows = rows;
                this.tip.frame = f.index;
                this.tip.x = Math.min(ev.clientX + 14, window.innerWidth - 200);
                this.tip.y = ev.clientY + 12;
                this.tip.show = true;
            },
            onLeave(this: any) {
                this.hover = -1;
                this.tip.show = false;
                this.draw();
            },
            onClick(this: any) {
                if (this.hover < 0) return;
                this.selected = this.hover;
                this.following = false;
                this.draw();
            },
            onKey(this: any, ev: KeyboardEvent) {
                if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
                const n = store.frames.length;
                if (!n) return;
                const cur = this.following ? n - 1 : this.selected;
                this.selected = Math.max(0, Math.min(n - 1, cur + (ev.key === 'ArrowLeft' ? -1 : 1)));
                this.following = false;
                this.draw();
                ev.preventDefault();
            },
        },
        mounted(this: any) {
            this.refreshStatus();
            poll = setInterval(() => this.refreshStatus(), 3000);
            window.addEventListener('resize', () => this.draw());
        },
    });
    app.config.compilerOptions.isCustomElement = (tag: string) => tag.startsWith('ui-');
    const vm: any = app.mount(el);
    return {
        onFrames: (arg) => vm.addFrames(arg),
        onClients: (list) => vm.onClientList(list || []),
        dispose() {
            if (poll) clearInterval(poll);
            if (raf) cancelAnimationFrame(raf);
            app.unmount();
        },
    };
}

const apps = new WeakMap<object, PanelApp>();

module.exports = Editor.Panel.define({
    template: '<div id="app" style="height:100%"></div>',
    style: STYLE,
    $: { app: '#app' },
    methods: {
        onFrames(this: any, arg: any) {
            const a = apps.get(this);
            if (a) a.onFrames(arg);
        },
        onClients(this: any, list: any[]) {
            const a = apps.get(this);
            if (a) a.onClients(list);
        },
    },
    ready(this: any) {
        apps.set(this, createProfilerApp(this.$.app as HTMLElement));
    },
    close(this: any) {
        const a = apps.get(this);
        if (a) a.dispose();
    },
});
