/**
 * Frame Debugger, game side: records one frame's render passes and draw
 * calls, and can stop drawing after draw N on the following frames (Unity's
 * stepping). Both the builtin custom pipeline and the legacy pipeline record
 * into the device's primary command buffer, so the hook is that object: its
 * beginRenderPass / bindPipelineState / bindDescriptorSet / bindInputAssembler
 * / draw are shadowed by own properties while needed and deleted afterwards
 * (the prototype methods come back; nothing stays wrapped when off).
 *
 * Web only: on native the pipeline records in C++ and never calls these.
 */
import { director, Node } from 'cc';
import { loadOpName } from './core/capture';
import { CaptureDrawEvent, CaptureEvent, FrameCaptureData } from './core/protocol';

/** Descriptor set slots of the render pipelines (SetIndex: GLOBAL 0, MATERIAL 1, LOCAL 2). */
const SET_MATERIAL = 1;
const SET_LOCAL = 2;

const WRAPPED = ['beginRenderPass', 'bindPipelineState', 'bindDescriptorSet', 'bindInputAssembler', 'draw'];

interface MaterialInfo {
    material: string;
    effect: string;
    passIndex: number;
    phase: string;
}

function nodePath(n: Node | null): string {
    const parts: string[] = [];
    let cur: any = n;
    let guard = 0;
    while (cur && guard++ < 32) {
        if (cur.parent) parts.unshift(cur.name);
        cur = cur.parent;
    }
    return parts.join('/');
}

function primitiveTriangles(prim: number, count: number, instances: number): number {
    // PrimitiveMode: TRIANGLE_LIST 7, TRIANGLE_STRIP 8, TRIANGLE_FAN 9 (gfx define.ts)
    const inst = Math.max(1, instances);
    if (prim === 7) return Math.floor(count / 3) * inst;
    if (prim === 8 || prim === 9) return Math.max(0, count - 2) * inst;
    return 0;
}

export class FrameCapture {
    /** Draws allowed per frame while stepping (-1: off). */
    stepLimit = -1;
    /** Render passes begun this frame (when counting). */
    passCount = 0;
    /** Count render passes every frame (the Profiler's Rendering chart). */
    countPasses = false;

    private cb: any = null;
    private armed = false;
    private capturing = false;
    private events: CaptureEvent[] = [];
    private draws = 0;
    private passes = 0;
    private curPass = -1;
    private pso: any = null;
    private matSet: any = null;
    private localSet: any = null;
    private ia: any = null;
    private materials = new Map<any, MaterialInfo>();
    private locals = new Map<any, string>();
    private installed = false;
    private frameNo = 0;

    /** The hook works here (web gfx in JS). */
    static supported(): boolean {
        try {
            const dev: any = director.root && director.root.device;
            const cb = dev && dev.commandBuffer;
            return !!cb && typeof cb.draw === 'function' && typeof cb.beginRenderPass === 'function' && !(globalThis as any).jsb;
        } catch (e) {
            return false;
        }
    }

    /** Captures the next frame. */
    arm(): void {
        this.armed = true;
        this.sync();
    }

    setStep(limit: number): void {
        this.stepLimit = limit;
        this.sync();
    }

    /** Frame start (Director.EVENT_BEGIN_FRAME). */
    beginFrame(frame: number): void {
        this.frameNo = frame;
        this.draws = 0;
        this.passes = 0;
        this.passCount = 0;
        this.curPass = -1;
        if (this.armed) {
            this.armed = false;
            this.capturing = true;
            this.events = [];
            this.buildLookups();
        }
        this.sync();
    }

    /** Frame end (Director.EVENT_END_FRAME): the capture, when one was taken. */
    endFrame(): FrameCaptureData | null {
        if (!this.capturing) return null;
        this.capturing = false;
        const data: FrameCaptureData = { frame: this.frameNo, events: this.events, draws: this.draws, passes: this.passes };
        this.events = [];
        this.materials.clear();
        this.locals.clear();
        this.sync();
        return data;
    }

    /** Removes the hooks for good. */
    dispose(): void {
        this.armed = false;
        this.capturing = false;
        this.stepLimit = -1;
        this.countPasses = false;
        this.uninstall();
    }

    // ------------------------------------------------------------------ hooks

    /** Installs the wrappers only while something needs them. */
    private sync(): void {
        const need = this.armed || this.capturing || this.stepLimit >= 0 || this.countPasses;
        if (need) this.install();
        else this.uninstall();
    }

    private install(): void {
        let cb: any = null;
        try {
            const dev: any = director.root && director.root.device;
            cb = dev ? dev.commandBuffer : null;
        } catch (e) {
            cb = null;
        }
        if (!cb) return;
        if (this.installed && this.cb === cb) return;
        this.uninstall();
        this.cb = cb;
        const proto = Object.getPrototypeOf(cb);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const orig = (name: string) => proto[name];
        const beginRenderPass = orig('beginRenderPass');
        const bindPipelineState = orig('bindPipelineState');
        const bindDescriptorSet = orig('bindDescriptorSet');
        const bindInputAssembler = orig('bindInputAssembler');
        const draw = orig('draw');
        if (!beginRenderPass || !draw) return;
        cb.beginRenderPass = function (renderPass: any, framebuffer: any, renderArea: any, clearColors: any, clearDepth: any, clearStencil: any) {
            self.onPass(renderPass, framebuffer, clearColors);
            return beginRenderPass.apply(this, arguments as any);
        };
        cb.bindPipelineState = function (pso: any) {
            self.pso = pso;
            return bindPipelineState.apply(this, arguments as any);
        };
        cb.bindDescriptorSet = function (set: number, ds: any) {
            if (set === SET_MATERIAL) self.matSet = ds;
            else if (set === SET_LOCAL) self.localSet = ds;
            return bindDescriptorSet.apply(this, arguments as any);
        };
        cb.bindInputAssembler = function (ia: any) {
            self.ia = ia;
            return bindInputAssembler.apply(this, arguments as any);
        };
        cb.draw = function (arg: any) {
            const n = self.draws++;
            if (self.capturing) self.onDraw(n, arg);
            // stepping: the frame stops after draw `stepLimit`
            if (self.stepLimit >= 0 && n > self.stepLimit) return undefined;
            return draw.apply(this, arguments as any);
        };
        this.installed = true;
    }

    private uninstall(): void {
        const cb = this.cb;
        if (cb && this.installed) {
            for (let i = 0; i < WRAPPED.length; i++) {
                try {
                    delete cb[WRAPPED[i]];
                } catch (e) {
                    // not configurable: leave it
                }
            }
        }
        this.installed = false;
        this.cb = null;
        this.pso = null;
        this.matSet = null;
        this.localSet = null;
        this.ia = null;
    }

    // ------------------------------------------------------------------ recording

    private onPass(renderPass: any, framebuffer: any, clearColors: any): void {
        this.passCount++;
        const n = this.passes++;
        this.curPass = n;
        if (!this.capturing) return;
        let color: string[] = [];
        let depth = '';
        try {
            const atts = renderPass && renderPass.colorAttachments ? renderPass.colorAttachments : [];
            color = Array.prototype.map.call(atts, (a: any) => loadOpName(a.loadOp)) as string[];
            const ds = renderPass ? renderPass.depthStencilAttachment : null;
            depth = ds ? loadOpName(ds.depthLoadOp) : '';
        } catch (e) {
            // older gfx
        }
        let clear: [number, number, number, number] | null = null;
        if (clearColors && clearColors.length && clearColors[0]) {
            const c = clearColors[0];
            clear = [Number(c.x) || 0, Number(c.y) || 0, Number(c.z) || 0, Number(c.w) || 0];
        }
        this.events.push({
            type: 'pass',
            pass: n,
            width: framebuffer ? Number(framebuffer.width) || 0 : 0,
            height: framebuffer ? Number(framebuffer.height) || 0 : 0,
            color,
            depth,
            clearColor: clear,
        });
    }

    private onDraw(n: number, arg: any): void {
        let info: any = arg;
        try {
            if (arg && arg.drawInfo) info = arg.drawInfo;
        } catch (e) {
            info = arg;
        }
        const vertices = info ? Number(info.vertexCount) || 0 : 0;
        const indices = info ? Number(info.indexCount) || 0 : 0;
        const instances = info ? Number(info.instanceCount) || 0 : 0;
        let shader = '';
        let prim = 7;
        try {
            const pso = this.pso;
            if (pso) {
                shader = pso.shader ? String(pso.shader.name || '') : '';
                prim = Number(pso.primitive);
            }
        } catch (e) {
            // ignore
        }
        const mat = this.matSet ? this.materials.get(this.matSet) : undefined;
        const ev: CaptureDrawEvent = {
            type: 'draw',
            draw: n,
            pass: this.curPass,
            shader,
            effect: mat ? mat.effect : '',
            material: mat ? mat.material : '',
            passIndex: mat ? mat.passIndex : -1,
            phase: mat ? mat.phase : '',
            node: this.localSet ? this.locals.get(this.localSet) || '' : '',
            vertices,
            indices,
            instances,
            triangles: primitiveTriangles(prim, indices || vertices, instances),
        };
        this.events.push(ev);
    }

    /** Descriptor sets -> what they belong to, from the scene's models and renderers. */
    private buildLookups(): void {
        this.materials.clear();
        this.locals.clear();
        const root: any = director.root;
        const scenes: any[] = root && root.scenes ? root.scenes : [];
        for (let s = 0; s < scenes.length; s++) {
            const models: any[] = scenes[s].models || [];
            for (let m = 0; m < models.length; m++) {
                const model = models[m];
                const path = nodePath(model.node);
                const subs: any[] = model.subModels || [];
                for (let k = 0; k < subs.length; k++) {
                    const sm = subs[k];
                    if (sm.descriptorSet) this.locals.set(sm.descriptorSet, subs.length > 1 ? path + ' [' + k + ']' : path);
                    const passes: any[] = sm.passes || [];
                    for (let p = 0; p < passes.length; p++) {
                        const pass = passes[p];
                        if (pass && pass.descriptorSet && !this.materials.has(pass.descriptorSet)) {
                            this.materials.set(pass.descriptorSet, { material: '', effect: String(pass.program || ''), passIndex: p, phase: phaseName(pass) });
                        }
                    }
                }
            }
        }
        // material names from the renderers of the scene
        const scene = director.getScene();
        if (!scene) return;
        const walk = (n: any) => {
            const comps = n.components;
            for (let i = 0; i < comps.length; i++) {
                const c = comps[i];
                if (!c || typeof c.getRenderMaterial !== 'function') continue;
                const count = c.sharedMaterials ? c.sharedMaterials.length : 1;
                for (let k = 0; k < Math.max(1, count); k++) {
                    let mat: any = null;
                    try {
                        mat = c.getRenderMaterial(k);
                    } catch (e) {
                        mat = null;
                    }
                    if (!mat || !mat.passes) continue;
                    const name = mat.name || (mat.parent && mat.parent.name) || '';
                    const effect = mat.effectName || '';
                    for (let p = 0; p < mat.passes.length; p++) {
                        const pass = mat.passes[p];
                        if (!pass || !pass.descriptorSet) continue;
                        this.materials.set(pass.descriptorSet, { material: name, effect: effect || String(pass.program || ''), passIndex: p, phase: phaseName(pass) });
                    }
                }
            }
            const ch = n.children;
            for (let i = 0; i < ch.length; i++) walk(ch[i]);
        };
        walk(scene);
    }
}

function phaseName(pass: any): string {
    try {
        const s = pass._phaseString || pass.phaseString;
        if (typeof s === 'string') return s;
    } catch (e) {
        // ignore
    }
    return '';
}
