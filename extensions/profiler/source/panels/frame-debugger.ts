/**
 * Frame Debugger window (Unity's Frame Debugger): captures one frame of a
 * connected game, lists its render passes and draw calls, and steps the
 * game's rendering to a draw so the view shows the frame up to that point.
 */
import { createApp } from 'vue';
import { drawLabel, groupByPass, passLabel, PassGroup, summarize } from '../../assets/core/capture';
import { formatCount } from '../../assets/core/chart';
import { CaptureDrawEvent, FrameCaptureData } from '../../assets/core/protocol';
import { BASE_CSS } from './theme';

const PKG = 'profiler';

const STYLE = BASE_CSS + /* css */ `
.fd-body { flex: 1; display: flex; min-height: 0; }
.fd-tree { width: 46%; min-width: 240px; overflow: auto; border-right: 1px solid var(--color-normal-border, #222); }
.fd-pass { display: flex; align-items: center; gap: 4px; padding: 3px 6px; cursor: pointer; font-weight: bold; user-select: none; }
.fd-draw { padding: 2px 6px 2px 24px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fd-draw.sel { background: var(--color-focus-fill-important, #2c5d87); color: var(--color-focus-contrast, #fff); }
.fd-draw.after { opacity: 0.45; }
.fd-draw:not(.sel):hover { background: rgba(255,255,255,0.04); }
.fd-detail { flex: 1; overflow: auto; padding: 8px 10px; }
.fd-step { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--color-normal-border, #222); }
.fd-step input[type=range] { flex: 1; }
.fd-kv { display: grid; grid-template-columns: 120px 1fr; row-gap: 3px; column-gap: 10px; }
.fd-kv .k { color: var(--color-normal-contrast-weaker, #c3c2b7); }
.fd-kv .v { font-variant-numeric: tabular-nums; word-break: break-all; }
.fd-h { font-weight: bold; margin: 10px 0 4px; }
.fd-sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: -2px; margin-right: 6px; border: 1px solid rgba(255,255,255,0.10); }
.fd-err { color: #fab219; padding: 8px; }
`;

const TEMPLATE = /* html */ `
<div class="pf" tabindex="0" @keydown="onKey">
  <div class="pf-toolbar">
    <select class="pf-select" v-model.number="clientId" :disabled="!clients.length" title="Connected game">
      <option v-if="!clients.length" :value="0">No game connected</option>
      <option v-for="c in clients" :key="c.id" :value="c.id" :disabled="!c.frameDebugger">{{ c.runtime }} · {{ c.platform }}{{ c.frameDebugger ? '' : ' (not supported)' }}</option>
    </select>
    <button class="pf-btn" :class="{ on: enabled }" :disabled="!canCapture" @click="enabled ? disable() : enable()">{{ enabled ? 'Disable' : 'Enable' }}</button>
    <button class="pf-btn" :disabled="!enabled" @click="recapture" title="Capture the current frame again">Capture</button>
    <span class="pf-grow"></span>
    <span class="pf-dim" v-if="totals">{{ totals.passes }} passes · {{ totals.draws }} draws · {{ fmt(totals.triangles) }} tris</span>
  </div>
  <div v-if="error" class="fd-err">{{ error }}</div>
  <div v-if="!clients.length" class="pf-empty"><div><b>No game connected.</b></div><div>Press Play in the editor or open a browser preview, then Enable.</div></div>
  <div v-else-if="!enabled" class="pf-empty"><div>Press <b>Enable</b> to capture a frame of the game: its render passes and draw calls are listed here, and stepping through them shows the frame drawn up to that point.</div><div class="pf-dim">Works with the web renderer (Play in Editor, browser previews, web builds).</div></div>
  <template v-else>
    <div class="fd-step">
      <button class="pf-btn" :disabled="step <= 0" @click="setStep(step - 1)">◀</button>
      <input type="range" min="0" :max="Math.max(0, draws.length - 1)" :value="step" @input="setStep(Number($event.target.value))">
      <button class="pf-btn" :disabled="step >= draws.length - 1" @click="setStep(step + 1)">▶</button>
      <span class="pf-mono">{{ draws.length ? (step + 1) + ' of ' + draws.length : 'waiting...' }}</span>
    </div>
    <div class="fd-body">
      <div class="fd-tree">
        <template v-for="(g, gi) in groups" :key="gi">
          <div class="fd-pass" @click="togglePass(gi)"><span class="pf-caret">{{ closed[gi] ? '▸' : '▾' }}</span>{{ passText(g) }}</div>
          <template v-if="!closed[gi]">
            <div v-for="d in g.draws" :key="d.draw" class="fd-draw" :class="{ sel: d.draw === step, after: d.draw > step }" @click="setStep(d.draw)" :title="label(d)">{{ label(d) }}</div>
          </template>
        </template>
      </div>
      <div class="fd-detail" v-if="selected">
        <div class="fd-h">{{ label(selected) }}</div>
        <div class="fd-kv">
          <span class="k">Shader</span><span class="v">{{ selected.shader || '-' }}</span>
          <span class="k">Effect</span><span class="v">{{ selected.effect || '-' }}</span>
          <span class="k">Material</span><span class="v">{{ selected.material || '-' }}</span>
          <span class="k">Pass</span><span class="v">{{ selected.passIndex >= 0 ? selected.passIndex : '-' }}{{ selected.phase ? ' (' + selected.phase + ')' : '' }}</span>
          <span class="k">Node</span><span class="v">{{ selected.node || '(UI batch, post effect or editor gizmo)' }}</span>
          <span class="k">Vertices</span><span class="v">{{ fmt(selected.vertices) }}</span>
          <span class="k">Indices</span><span class="v">{{ fmt(selected.indices) }}</span>
          <span class="k">Instances</span><span class="v">{{ selected.instances || 1 }}</span>
          <span class="k">Triangles</span><span class="v">{{ fmt(selected.triangles) }}</span>
        </div>
        <template v-if="selectedPass">
          <div class="fd-h">Render Pass #{{ selectedPass.pass }}</div>
          <div class="fd-kv">
            <span class="k">Target size</span><span class="v">{{ selectedPass.width }} x {{ selectedPass.height }}</span>
            <span class="k">Color</span><span class="v">{{ selectedPass.color.join(', ') || '-' }}</span>
            <span class="k">Depth / stencil</span><span class="v">{{ selectedPass.depth || '-' }}</span>
            <span class="k">Clear color</span><span class="v"><template v-if="selectedPass.clearColor"><span class="fd-sw" :style="{ background: rgba(selectedPass.clearColor) }"></span>{{ selectedPass.clearColor.map((v) => v.toFixed(2)).join(', ') }}</template><template v-else>-</template></span>
          </div>
        </template>
      </div>
    </div>
  </template>
</div>
`;

function req(msg: string, ...args: any[]): Promise<any> {
    return (Editor.Message.request as any)(PKG, msg, ...args);
}

interface PanelApp {
    onCapture(arg: any): void;
    onClients(list: any[]): void;
    dispose(): void;
}

function createFrameDebuggerApp(el: HTMLElement): PanelApp {
    let poll: any = null;
    const app = createApp({
        template: TEMPLATE,
        data() {
            return {
                clients: [] as any[],
                clientId: 0,
                enabled: false,
                cap: null as FrameCaptureData | null,
                step: 0,
                closed: {} as Record<number, boolean>,
                error: '',
            };
        },
        computed: {
            client(this: any): any {
                return this.clients.find((c: any) => c.id === this.clientId) || null;
            },
            canCapture(this: any): boolean {
                return !!this.client && !!this.client.frameDebugger;
            },
            groups(this: any): PassGroup[] {
                return this.cap ? groupByPass(this.cap.events) : [];
            },
            draws(this: any): CaptureDrawEvent[] {
                return this.cap ? (this.cap.events.filter((e: any) => e.type === 'draw') as CaptureDrawEvent[]) : [];
            },
            selected(this: any): CaptureDrawEvent | null {
                return this.draws.find((d: CaptureDrawEvent) => d.draw === this.step) || null;
            },
            selectedPass(this: any): any {
                const d: CaptureDrawEvent | null = this.selected;
                if (!d || !this.cap) return null;
                return this.cap.events.find((e: any) => e.type === 'pass' && e.pass === d.pass) || null;
            },
            totals(this: any): any {
                return this.cap ? summarize(this.cap) : null;
            },
        },
        methods: {
            fmt(v: number): string {
                return formatCount(v);
            },
            label(d: CaptureDrawEvent): string {
                return '#' + d.draw + ' ' + drawLabel(d);
            },
            passText(g: PassGroup): string {
                return passLabel(g.pass) + ' · ' + g.draws.length + ' draws';
            },
            rgba(c: number[]): string {
                const k = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
                return 'rgba(' + k(c[0]) + ',' + k(c[1]) + ',' + k(c[2]) + ',' + Math.max(0, Math.min(1, c[3])) + ')';
            },
            togglePass(this: any, i: number) {
                this.closed[i] = !this.closed[i];
            },
            async refresh(this: any) {
                try {
                    const s = await req('status');
                    this.onClientList((s && s.clients) || []);
                } catch (e) {
                    // extension reloading
                }
            },
            onClientList(this: any, list: any[]) {
                this.clients = list;
                if (!list.some((c: any) => c.id === this.clientId)) {
                    const pick = list.filter((c: any) => c.frameDebugger);
                    this.clientId = pick.length ? pick[pick.length - 1].id : list.length ? list[0].id : 0;
                    this.enabled = false;
                    this.cap = null;
                }
            },
            async enable(this: any) {
                this.error = '';
                this.enabled = true;
                this.cap = null;
                await this.recapture();
            },
            async recapture(this: any) {
                await req('fd-capture', this.clientId);
            },
            async disable(this: any) {
                this.enabled = false;
                this.cap = null;
                await req('fd-disable', this.clientId);
            },
            onCaptureMessage(this: any, arg: any) {
                if (!arg || arg.client !== this.clientId || !this.enabled) return;
                if (!arg.capture) {
                    this.error = arg.error || 'The game did not capture a frame.';
                    this.enabled = false;
                    return;
                }
                this.error = '';
                this.cap = arg.capture;
                const n = this.draws.length;
                this.setStep(n ? n - 1 : 0);
            },
            setStep(this: any, i: number) {
                const n = this.draws.length;
                if (!n) return;
                this.step = Math.max(0, Math.min(n - 1, i));
                req('fd-step', this.clientId, this.step);
            },
            onKey(this: any, ev: KeyboardEvent) {
                if (!this.enabled) return;
                if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') this.setStep(this.step - 1);
                else if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') this.setStep(this.step + 1);
                else return;
                ev.preventDefault();
            },
        },
        mounted(this: any) {
            this.refresh();
            poll = setInterval(() => this.refresh(), 3000);
        },
    });
    const vm: any = app.mount(el);
    return {
        onCapture: (arg) => vm.onCaptureMessage(arg),
        onClients: (list) => vm.onClientList(list || []),
        dispose() {
            if (poll) clearInterval(poll);
            try {
                if (vm.enabled) req('fd-disable', vm.clientId);
            } catch (e) {
                // closing
            }
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
        onCapture(this: any, arg: any) {
            const a = apps.get(this);
            if (a) a.onCapture(arg);
        },
        onClients(this: any, list: any[]) {
            const a = apps.get(this);
            if (a) a.onClients(list);
        },
    },
    ready(this: any) {
        apps.set(this, createFrameDebuggerApp(this.$.app as HTMLElement));
    },
    close(this: any) {
        const a = apps.get(this);
        if (a) a.dispose();
    },
});
