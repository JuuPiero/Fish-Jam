/**
 * Spine Preview panel: plays a Spine export with the same runtime, mesh
 * builder and physics handling as the SkeletonAnimation component. Drag the
 * character to feel its physics react to movement.
 */
import { createApp } from 'vue';
import { defaultMeshOptions, SpineMesh } from '../../../assets/core/spine-mesh';
import { loadSkeleton, SkeletonInfo, SkeletonInstance, skeletonInfo } from '../../../assets/core/spine-runtime';
import { Bridge, NodeSkeleton } from './bridge';
import { GLRenderer, rgba, View } from './gl-renderer';

export interface PreviewApp {
    show(assetUuid: string, node?: NodeSkeleton): Promise<void>;
    dispose(): void;
    /** For tests: the live state. */
    debug(): any;
}

const BACKGROUNDS: Record<string, [number, number, number]> = {
    dark: [0.16, 0.16, 0.17],
    gray: [0.36, 0.36, 0.38],
    light: [0.82, 0.82, 0.84],
    green: [0.2, 0.45, 0.25],
};

const TEMPLATE = /* html */ `
<div class="sp-root">
  <div class="sp-toolbar">
    <span class="sp-title" :title="name">{{ name || 'Spine Preview' }}</span>
    <span v-if="info" class="sp-badge" :title="'Exported from Spine ' + info.exported + ', read with the ' + info.runtime + ' runtime'">Spine {{ info.exported || '?' }} · runtime {{ info.runtime }}</span>
    <span class="sp-flex"></span>
    <label class="sp-check" title="Show the Spine asset or SkeletonAnimation selected in the editor"><input type="checkbox" v-model="follow" @change="save"> Follow Selection</label>
  </div>
  <div class="sp-body">
    <div class="sp-side">
      <div class="sp-section">
        <div class="sp-head">Animation</div>
        <input class="sp-input sp-filter" placeholder="Filter" v-model="filter">
        <div class="sp-list">
          <div v-for="a in filteredAnimations" :key="a.name" class="sp-item" :class="{ on: a.name === animation }" @click="play(a.name)" :title="a.name">
            <span class="sp-item-name">{{ a.name }}</span><span class="sp-dim">{{ a.duration.toFixed(2) }}s</span>
          </div>
          <div v-if="info && !info.animations.length" class="sp-dim sp-pad">No animations</div>
        </div>
        <div class="sp-row">
          <button class="sp-btn" @click="togglePlay" :title="playing ? 'Pause' : 'Play'">{{ playing ? 'Pause' : 'Play' }}</button>
          <button class="sp-btn" @click="restart" title="Play from the start">Restart</button>
          <button class="sp-btn" @click="stop" title="Clear the track (setup pose)">Setup Pose</button>
        </div>
        <div class="sp-row">
          <label class="sp-check"><input type="checkbox" v-model="loop" @change="applyLoop"> Loop</label>
          <span class="sp-flex"></span>
          <span class="sp-label">Mix</span>
          <input class="sp-input sp-num" type="number" min="0" step="0.05" v-model.number="mix" @change="applyMix" title="Default mix duration between animations (seconds)">
        </div>
        <div class="sp-row">
          <span class="sp-label">Speed</span>
          <input class="sp-range" type="range" min="0" max="3" step="0.05" v-model.number="speed" @change="save">
          <span class="sp-value">{{ speed.toFixed(2) }}x</span>
        </div>
        <div class="sp-row">
          <span class="sp-label">Time</span>
          <input class="sp-range" type="range" min="0" :max="duration || 1" step="0.001" :value="time" @input="scrub($event.target.value)" :disabled="!animation">
          <span class="sp-value">{{ time.toFixed(2) }}s</span>
        </div>
      </div>

      <div class="sp-section">
        <div class="sp-head">Skin</div>
        <select class="sp-input" v-model="skin" @change="applySkin">
          <option v-for="s in (info ? info.skins : [])" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="sp-section">
        <div class="sp-head">Physics <span class="sp-dim" v-if="info">({{ info.physics }} constraints)</span></div>
        <label class="sp-check"><input type="checkbox" v-model="physics" @change="save"> Simulate</label>
        <div class="sp-row" title="How much moving the character moves physics (Position Inheritance)">
          <span class="sp-label">Position</span>
          <span class="sp-dim">X</span><input class="sp-input sp-num" type="number" step="0.1" v-model.number="inheritX" @change="save">
          <span class="sp-dim">Y</span><input class="sp-input sp-num" type="number" step="0.1" v-model.number="inheritY" @change="save">
        </div>
        <div class="sp-row" title="How much rotating the character rotates physics (Rotation Inheritance)">
          <span class="sp-label">Rotation</span>
          <input class="sp-input sp-num" type="number" step="0.1" v-model.number="inheritRotation" @change="save">
        </div>
        <div class="sp-row">
          <button class="sp-btn" @click="shake('x')" title="Shake sideways">Shake X</button>
          <button class="sp-btn" @click="shake('y')" title="Bounce up and down">Shake Y</button>
          <button class="sp-btn" @click="shake('r')" title="Wobble the rotation">Wobble</button>
        </div>
        <div class="sp-row">
          <button class="sp-btn" @click="resetPhysics" title="Put physics at rest">Reset Physics</button>
          <button class="sp-btn" @click="recenter" title="Move the character back to the origin (without physics)">Recenter</button>
        </div>
      </div>

      <div class="sp-section">
        <div class="sp-head">View</div>
        <div class="sp-row">
          <label class="sp-check"><input type="checkbox" v-model="showBones" @change="save"> Bones</label>
          <label class="sp-check"><input type="checkbox" v-model="showMesh" @change="save"> Mesh</label>
          <label class="sp-check"><input type="checkbox" v-model="showBounds" @change="save"> Bounds</label>
        </div>
        <div class="sp-row">
          <span class="sp-label">Background</span>
          <select class="sp-input" v-model="background" @change="save">
            <option value="dark">Dark</option><option value="gray">Gray</option><option value="light">Light</option><option value="green">Green</option>
          </select>
        </div>
        <div class="sp-row">
          <span class="sp-label">Alpha</span>
          <select class="sp-input" v-model="alphaMode" title="Premultiplied alpha textures: Auto reads the atlas">
            <option value="auto">Auto ({{ info && info.pma ? 'premultiplied' : 'straight' }})</option><option value="pma">Premultiplied</option><option value="straight">Straight</option>
          </select>
        </div>
        <div class="sp-row">
          <button class="sp-btn" @click="frame" title="Frame the skeleton (double-click the view)">Frame</button>
          <span class="sp-dim">Zoom {{ Math.round(zoom * 100) }}%</span>
        </div>
      </div>

      <div class="sp-section" v-if="info">
        <div class="sp-head">Info</div>
        <div class="sp-grid">
          <span>Bones</span><span>{{ info.bones }}</span>
          <span>Slots</span><span>{{ info.slots }}</span>
          <span>Physics</span><span>{{ info.physics }}</span>
          <span>Animations</span><span>{{ info.animations.length }}</span>
          <span>Skins</span><span>{{ info.skins.length }}</span>
          <span>Events</span><span>{{ info.events.length }}</span>
          <span>Size</span><span>{{ Math.round(info.width) }} × {{ Math.round(info.height) }}</span>
        </div>
      </div>

      <div class="sp-section" v-if="events.length">
        <div class="sp-head">Events</div>
        <div v-for="(e, i) in events" :key="i" class="sp-event"><span>{{ e.name }}</span><span class="sp-dim">{{ e.time }}</span></div>
      </div>
    </div>

    <div class="sp-view" ref="view">
      <canvas ref="canvas" class="sp-canvas"
        @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp"
        @wheel.prevent="wheel" @dblclick="frame" @contextmenu.prevent></canvas>
      <div v-if="status !== 'ready'" class="sp-overlay" :class="status">{{ message }}</div>
      <div class="sp-hint">Drag: move (physics) · Shift+drag: rotate · Right / middle drag: pan · Wheel: zoom · Double-click: frame</div>
      <div class="sp-stats">{{ fps }} fps · {{ batches }} batch{{ batches === 1 ? '' : 'es' }} · {{ vertices }} vertices · {{ triangles }} triangles</div>
    </div>
  </div>
</div>
`;

export function createPreviewApp(el: HTMLElement, bridge: Bridge): PreviewApp {
    // Everything heavy lives outside Vue's reactivity.
    let renderer: GLRenderer | null = null;
    let inst: SkeletonInstance | null = null;
    const mesh = new SpineMesh();
    const options = defaultMeshOptions();
    const view: View = { width: 1, height: 1, zoom: 1, panX: 0, panY: 0, nodeX: 0, nodeY: 0, nodeRotation: 0 };
    let raf = 0;
    let last = 0;
    let frames = 0;
    let fpsTime = 0;
    let loadToken = 0;
    let drag: { mode: 'move' | 'rotate' | 'pan'; x: number; y: number; angle: number } | null = null;
    // Movement since the last frame, handed to physics like the component does.
    const pending = { x: 0, y: 0, rotation: 0 };
    let shakeAnim: { axis: string; t: number; prev: number } | null = null;
    let offSelection: (() => void) | null = null;
    let vm: any = null;
    let saveTimer: any = null;

    const app = createApp({
        template: TEMPLATE,
        data() {
            return {
                status: 'empty',
                message: 'Select a Spine export (spine-data) or a node with a SkeletonAnimation, or right-click a Spine asset → Spine Plus: Preview.',
                name: '',
                info: null as SkeletonInfo | null,
                filter: '',
                animation: '',
                skin: '',
                loop: true,
                playing: true,
                speed: 1,
                mix: 0.2,
                time: 0,
                duration: 0,
                physics: true,
                inheritX: 1,
                inheritY: 1,
                inheritRotation: 1,
                showBones: false,
                showMesh: false,
                showBounds: false,
                background: 'dark',
                alphaMode: 'auto',
                follow: true,
                zoom: 1,
                fps: 0,
                batches: 0,
                vertices: 0,
                triangles: 0,
                events: [] as { name: string; time: string }[],
            };
        },
        computed: {
            filteredAnimations(this: any) {
                const list = this.info ? this.info.animations : [];
                const f = this.filter.trim().toLowerCase();
                return f ? list.filter((a: any) => a.name.toLowerCase().includes(f)) : list;
            },
        },
        methods: {
            save(this: any) {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => bridge.saveSettings({
                    follow: this.follow, speed: this.speed, physics: this.physics, inheritX: this.inheritX, inheritY: this.inheritY,
                    inheritRotation: this.inheritRotation, showBones: this.showBones, showMesh: this.showMesh, showBounds: this.showBounds,
                    background: this.background, mix: this.mix,
                }), 300);
            },
            play(this: any, name: string) {
                if (!inst) return;
                this.animation = name;
                inst.setAnimation(0, name, this.loop);
                this.playing = true;
            },
            togglePlay(this: any) {
                this.playing = !this.playing;
                if (this.playing && inst && !inst.getCurrent(0) && this.animation) inst.setAnimation(0, this.animation, this.loop);
            },
            restart(this: any) {
                if (!inst || !this.animation) return;
                const entry: any = inst.setAnimation(0, this.animation, this.loop);
                if (entry) entry.mixDuration = 0;
                this.playing = true;
            },
            stop(this: any) {
                if (!inst) return;
                inst.clearTracks();
                inst.setupPose();
                this.animation = '';
                this.time = 0;
                this.duration = 0;
                inst.pose(false);
            },
            applyLoop(this: any) {
                const e = inst?.getCurrent(0);
                if (e) e.loop = this.loop;
            },
            applyMix(this: any) {
                if (inst) (inst.loaded.stateData as any).defaultMix = Math.max(0, Number(this.mix) || 0);
                this.save();
            },
            applySkin(this: any) {
                if (!inst) return;
                inst.setSkin(this.skin);
                (inst.state as any).apply(inst.skeleton);
                inst.pose(false);
            },
            scrub(this: any, value: string) {
                const e: any = inst?.getCurrent(0);
                if (!inst || !e) return;
                this.playing = false;
                e.trackTime = Number(value);
                inst.advance(0);
                inst.pose(this.physics);
                this.time = Number(value);
            },
            resetPhysics() {
                inst?.resetPhysics();
            },
            recenter() {
                view.nodeX = view.nodeY = view.nodeRotation = 0;
                pending.x = pending.y = pending.rotation = 0;
                inst?.resetPhysics();
            },
            shake(axis: string) {
                shakeAnim = { axis, t: 0, prev: 0 };
            },
            frame(this: any) {
                if (!inst) return;
                inst.buildMesh(options, mesh);
                if (mesh.empty) return;
                const bw = Math.max(1, mesh.maxX - mesh.minX);
                const bh = Math.max(1, mesh.maxY - mesh.minY);
                view.zoom = Math.min((view.width * 0.8) / bw, (view.height * 0.8) / bh);
                const cx = (mesh.minX + mesh.maxX) / 2;
                const cy = (mesh.minY + mesh.maxY) / 2;
                const r = (view.nodeRotation * Math.PI) / 180;
                const wx = Math.cos(r) * cx - Math.sin(r) * cy + view.nodeX;
                const wy = Math.sin(r) * cx + Math.cos(r) * cy + view.nodeY;
                view.panX = -wx * view.zoom;
                view.panY = -wy * view.zoom;
                this.zoom = view.zoom;
            },
            wheel(this: any, e: WheelEvent) {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                const sx = e.clientX - rect.left - rect.width / 2;
                const sy = rect.height / 2 - (e.clientY - rect.top);
                const factor = Math.exp(-e.deltaY * 0.0015);
                const zoom = Math.min(50, Math.max(0.02, view.zoom * factor));
                // Keep the point under the cursor in place.
                view.panX = sx - ((sx - view.panX) * zoom) / view.zoom;
                view.panY = sy - ((sy - view.panY) * zoom) / view.zoom;
                view.zoom = zoom;
                this.zoom = zoom;
            },
            pointerDown(e: PointerEvent) {
                const canvas = e.target as HTMLElement;
                canvas.setPointerCapture?.(e.pointerId);
                const mode = e.button === 1 || e.button === 2 ? 'pan' : e.shiftKey ? 'rotate' : 'move';
                drag = { mode, x: e.clientX, y: e.clientY, angle: pointerAngle(e) };
            },
            pointerMove(e: PointerEvent) {
                if (!drag) return;
                const dx = e.clientX - drag.x;
                const dy = e.clientY - drag.y;
                drag.x = e.clientX;
                drag.y = e.clientY;
                if (drag.mode === 'pan') {
                    view.panX += dx;
                    view.panY -= dy;
                } else if (drag.mode === 'move') {
                    moveNode(dx / view.zoom, -dy / view.zoom);
                } else {
                    const a = pointerAngle(e);
                    let d = a - drag.angle;
                    if (d > 180) d -= 360;
                    else if (d < -180) d += 360;
                    drag.angle = a;
                    rotateNode(d);
                }
            },
            pointerUp(e: PointerEvent) {
                (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                drag = null;
            },
        },
        mounted(this: any) {
            vm = this;
            try {
                renderer = new GLRenderer(this.$refs.canvas as HTMLCanvasElement);
            } catch (e) {
                this.status = 'error';
                this.message = `WebGL is not available: ${(e as Error).message}`;
            }
            raf = requestAnimationFrame(tick);
        },
    });

    function pointerAngle(e: PointerEvent): number {
        const canvas = vm.$refs.canvas as HTMLElement;
        const rect = canvas.getBoundingClientRect();
        const ox = rect.left + rect.width / 2 + view.panX + view.nodeX * view.zoom;
        const oy = rect.top + rect.height / 2 - (view.panY + view.nodeY * view.zoom);
        return (Math.atan2(-(e.clientY - oy), e.clientX - ox) * 180) / Math.PI;
    }

    /** Moves the previewed "node" (skeleton units); physics gets the movement in skeleton space. */
    function moveNode(x: number, y: number): void {
        view.nodeX += x;
        view.nodeY += y;
        const r = (-view.nodeRotation * Math.PI) / 180;
        pending.x += Math.cos(r) * x - Math.sin(r) * y;
        pending.y += Math.sin(r) * x + Math.cos(r) * y;
    }

    function rotateNode(degrees: number): void {
        view.nodeRotation += degrees;
        pending.rotation += degrees;
    }

    function pma(): boolean {
        if (vm.alphaMode === 'pma') return true;
        if (vm.alphaMode === 'straight') return false;
        return !!inst?.loaded.pma;
    }

    function stepShake(dt: number): void {
        if (!shakeAnim) return;
        shakeAnim.t += dt;
        const T = 0.8;
        const t = Math.min(shakeAnim.t, T);
        const amp = shakeAnim.axis === 'r' ? 25 : Math.max(20, ((vm.info?.height || 200) * 0.15));
        const v = Math.sin(t * Math.PI * 2 * 3) * amp * (1 - t / T);
        const d = v - shakeAnim.prev;
        shakeAnim.prev = v;
        if (shakeAnim.axis === 'x') moveNode(d, 0);
        else if (shakeAnim.axis === 'y') moveNode(0, d);
        else rotateNode(d);
        if (shakeAnim.t >= T) shakeAnim = null;
    }

    function drawOverlays(): void {
        if (!renderer || !inst) return;
        const r = renderer;
        if (vm.showMesh) {
            const col = rgba(90, 200, 255, 140);
            const v = mesh.vertices;
            const idx = mesh.indices;
            const n = Math.min(mesh.indexCount, 30000);
            for (let i = 0; i + 2 < n; i += 3) {
                const a = idx[i] * 7;
                const b = idx[i + 1] * 7;
                const c = idx[i + 2] * 7;
                r.line(v[a], v[a + 1], v[b], v[b + 1], col);
                r.line(v[b], v[b + 1], v[c], v[c + 1], col);
                r.line(v[c], v[c + 1], v[a], v[a + 1], col);
            }
        }
        if (vm.showBounds && !mesh.empty) {
            const col = rgba(255, 220, 60, 200);
            r.line(mesh.minX, mesh.minY, mesh.maxX, mesh.minY, col);
            r.line(mesh.maxX, mesh.minY, mesh.maxX, mesh.maxY, col);
            r.line(mesh.maxX, mesh.maxY, mesh.minX, mesh.maxY, col);
            r.line(mesh.minX, mesh.maxY, mesh.minX, mesh.minY, col);
        }
        if (vm.showBones) {
            const bones = inst.skeleton.bones as any[];
            const physicsBones = physicsBoneSet();
            for (let i = 0; i < bones.length; i++) {
                const bone = bones[i];
                if (bone.active === false) continue;
                const w = inst.boneWorld(bone);
                const len = bone.data.length || 0;
                const col = i === 0 ? rgba(80, 220, 120) : physicsBones.has(bone) ? rgba(255, 90, 200) : rgba(255, 140, 40);
                if (len > 0) {
                    const tx = w.x + w.a * len;
                    const ty = w.y + w.c * len;
                    const nx = -w.c * len * 0.08;
                    const ny = w.a * len * 0.08;
                    const mx = w.x + w.a * len * 0.15;
                    const my = w.y + w.c * len * 0.15;
                    r.line(w.x, w.y, mx + nx, my + ny, col);
                    r.line(mx + nx, my + ny, tx, ty, col);
                    r.line(w.x, w.y, mx - nx, my - ny, col);
                    r.line(mx - nx, my - ny, tx, ty, col);
                } else {
                    const s = 3 / view.zoom;
                    r.line(w.x - s, w.y, w.x + s, w.y, col);
                    r.line(w.x, w.y - s, w.x, w.y + s, col);
                }
            }
        }
        r.flushLines();
    }

    let physicsBonesCache: { inst: SkeletonInstance | null; set: Set<any> } = { inst: null, set: new Set() };
    function physicsBoneSet(): Set<any> {
        if (physicsBonesCache.inst === inst) return physicsBonesCache.set;
        const set = new Set<any>();
        const sk: any = inst?.skeleton;
        const list: any[] = inst?.runtime === '4.3' ? sk.physics : sk.physicsConstraints;
        for (const c of list || []) {
            const b = c.bone?.bone ?? c.bone;
            if (b) set.add(b);
        }
        physicsBonesCache = { inst, set };
        return set;
    }

    function drawAxes(): void {
        if (!renderer) return;
        // World origin cross, in screen pixels.
        const col = rgba(255, 255, 255, 40);
        const ox = view.panX;
        const oy = view.panY;
        renderer.line(ox - view.width, oy, ox + view.width, oy, col);
        renderer.line(ox, oy - view.height, ox, oy + view.height, col);
        renderer.flushLines(view);
    }

    function tick(now: number): void {
        raf = requestAnimationFrame(tick);
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        if (!vm || !renderer) return;
        const holder = vm.$refs.view as HTMLElement | undefined;
        if (!holder) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(holder.clientWidth * dpr));
        const h = Math.max(1, Math.floor(holder.clientHeight * dpr));
        renderer.resize(w, h);
        // The view works in CSS pixels; scale for the device.
        view.width = w / dpr;
        view.height = h / dpr;
        renderer.begin(view, BACKGROUNDS[vm.background] || BACKGROUNDS.dark);
        drawAxes();
        if (inst) {
            stepShake(dt);
            if (vm.playing) {
                if (vm.physics) {
                    const fx = Number(vm.inheritX) || 0;
                    const fy = Number(vm.inheritY) || 0;
                    const fr = Number(vm.inheritRotation) || 0;
                    if (pending.x || pending.y) inst.physicsTranslate(pending.x * fx, pending.y * fy);
                    if (pending.rotation) inst.physicsRotate(0, 0, pending.rotation * fr);
                }
                pending.x = pending.y = pending.rotation = 0;
                inst.advance(dt * vm.speed);
                inst.pose(vm.physics);
            } else {
                pending.x = pending.y = pending.rotation = 0;
            }
            const e: any = inst.getCurrent(0);
            if (e && e.animation) {
                const dur = e.animation.duration || 0;
                vm.duration = dur;
                vm.time = dur > 0 ? (e.loop ? e.trackTime % dur : Math.min(e.trackTime, dur)) : 0;
            }
            options.pma = pma();
            inst.buildMesh(options, mesh);
            renderer.drawMesh(mesh, options.pma);
            drawOverlays();
            vm.batches = mesh.batchCount;
            vm.vertices = mesh.vertexCount;
            vm.triangles = mesh.indexCount / 3;
        }
        frames++;
        if (now - fpsTime > 500) {
            vm.fps = Math.round((frames * 1000) / (now - fpsTime || 1));
            frames = 0;
            fpsTime = now;
        }
    }

    async function show(assetUuid: string, node?: NodeSkeleton): Promise<void> {
        const token = ++loadToken;
        vm.status = 'loading';
        vm.message = 'Loading…';
        try {
            const files = await bridge.load(assetUuid);
            if (token !== loadToken) return;
            const loaded = loadSkeleton(files.source);
            const next = new SkeletonInstance(loaded);
            renderer?.clearTextures();
            inst = next;
            const info = skeletonInfo(loaded);
            vm.info = info;
            vm.name = files.name;
            vm.events = [];
            (loaded.stateData as any).defaultMix = Math.max(0, Number(vm.mix) || 0);
            (inst.state as any).addListener({
                event: (_e: any, ev: any) => {
                    vm.events.unshift({ name: ev.data?.name ?? '?', time: `${(ev.time ?? 0).toFixed(2)}s` });
                    if (vm.events.length > 8) vm.events.length = 8;
                },
            });
            // Skin: the node's, else the default one, else the first skin with images.
            let skin = node?.skin || 'default';
            if (!inst.setSkin(skin)) skin = 'default';
            inst.setSkin(skin);
            inst.pose(false);
            inst.buildMesh(options, mesh);
            if (mesh.empty && info.skins.length > 1 && !node?.skin) {
                skin = info.skins[1];
                inst.setSkin(skin);
            }
            vm.skin = info.skins.includes(skin) ? skin : info.skins[0] ?? '';
            const anim = node?.animation && inst.hasAnimation(node.animation) ? node.animation : info.animations[0]?.name ?? '';
            if (node) vm.loop = node.loop;
            vm.animation = anim;
            if (anim) inst.setAnimation(0, anim, vm.loop);
            inst.advance(0);
            inst.pose(false);
            inst.resetPhysics();
            view.nodeX = view.nodeY = view.nodeRotation = 0;
            vm.playing = true;
            vm.status = 'ready';
            vm.message = '';
            vm.frame();
        } catch (e) {
            if (token !== loadToken) return;
            inst = null;
            vm.info = null;
            vm.status = 'error';
            vm.message = (e as Error).message || String(e);
        }
    }

    app.config.compilerOptions.isCustomElement = (tag: string) => tag.startsWith('ui-');
    app.mount(el);

    bridge.loadSettings().then((s) => {
        if (!s || typeof s !== 'object') return;
        for (const k of ['follow', 'speed', 'physics', 'inheritX', 'inheritY', 'inheritRotation', 'showBones', 'showMesh', 'showBounds', 'background', 'mix']) {
            if (k in s && s[k] !== undefined) vm[k] = s[k];
        }
    });

    let lastShown = '';
    offSelection = bridge.onSelection((sel) => {
        if (!vm.follow) return;
        const uuid = sel.asset ?? sel.node?.assetUuid;
        if (!uuid) return;
        const key = sel.node ? `${uuid}|${sel.node.skin}|${sel.node.animation}` : uuid;
        if (key === lastShown && vm.status === 'ready') return;
        lastShown = key;
        show(uuid, sel.node);
    });

    bridge.pending().then((uuid) => {
        if (uuid && !lastShown) {
            lastShown = uuid;
            show(uuid);
        }
    });

    return {
        show: (uuid, node) => {
            lastShown = uuid;
            return show(uuid, node);
        },
        dispose() {
            cancelAnimationFrame(raf);
            offSelection?.();
            renderer?.dispose();
            renderer = null;
            app.unmount();
        },
        debug: () => ({ vm, view, mesh, inst, pending }),
    };
}
