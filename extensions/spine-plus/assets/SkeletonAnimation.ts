import {
    _decorator, assetManager, CCFloat, ccenum, Color, director, gfx, Mat4, Material, ModelRenderer, Node, Quat, renderer,
    RenderingSubMesh, sp, Texture2D, UIMeshRenderer, UITransform, Vec2, Vec3,
} from 'cc';
import { EDITOR, JSB } from 'cc/env';
import { BlendMode, BYTES_PER_VERTEX, MeshOptions, SpineMesh, defaultMeshOptions } from './core/spine-mesh';
import {
    AnyBone, AnySlot, AnyTrackEntry, BoneWorld, LoadedSkeleton, SkeletonInfo, SkeletonInstance, SpineSource, loadSkeleton,
    skeletonInfo,
} from './core/spine-runtime';

const { ccclass, property, executeInEditMode, menu, disallowMultiple, executionOrder } = _decorator;

/** How the atlas textures store alpha. */
export enum AlphaMode {
    /** Use the atlas setting ("pma: true" in the .atlas). */
    Auto = 0,
    Premultiplied = 1,
    Straight = 2,
}
ccenum(AlphaMode);

/** Default material for skeletons in a Canvas (no depth test, like sprites). */
export const SPINE_UI_MATERIAL = '503979e8-d8b9-4a73-b142-82ab9eed42db';
/** Default material for skeletons in a 3D scene (depth tested, no depth write). */
export const SPINE_WORLD_MATERIAL = '37761319-daa8-4e93-8ec6-225a8897e14a';

let ATTRS: gfx.Attribute[] | null = null;
function attributes(): gfx.Attribute[] {
    if (!ATTRS) {
        ATTRS = [
            new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD, gfx.Format.RG32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_COLOR, gfx.Format.RGBA8, true),
            new gfx.Attribute('a_color2', gfx.Format.RGBA8, true),
        ];
    }
    return ATTRS;
}

/** Blend factors per slot blend mode, as in the official Spine renderers. */
function blendFactors(mode: BlendMode, pma: boolean): [number, number, number, number] {
    const B = gfx.BlendFactor;
    switch (mode) {
        case BlendMode.Additive: return [pma ? B.ONE : B.SRC_ALPHA, B.ONE, B.ONE, B.ONE];
        case BlendMode.Multiply: return [B.DST_COLOR, B.ONE_MINUS_SRC_ALPHA, B.ONE, B.ONE_MINUS_SRC_ALPHA];
        case BlendMode.Screen: return [B.ONE, B.ONE_MINUS_SRC_COLOR, B.ONE, B.ONE_MINUS_SRC_COLOR];
        default: return [pma ? B.ONE : B.SRC_ALPHA, B.ONE_MINUS_SRC_ALPHA, B.ONE, B.ONE_MINUS_SRC_ALPHA];
    }
}

// ------------------------------------------------------------ data loading

const loadedCache = new WeakMap<object, { loaded: LoadedSkeleton | null; error: string }>();

/** What the Cocos spine-data asset (sp.SkeletonData) holds, as a runtime-neutral source. */
export function sourceFromAsset(asset: sp.SkeletonData): SpineSource {
    const a = asset as any;
    const json = a._skeletonJson || null;
    const buffer: ArrayBuffer | null = json ? null : a._nativeAsset || null;
    return {
        json,
        binary: buffer ? new Uint8Array(buffer) : null,
        atlasText: a.atlasText || '',
        pageImage: (name, index) => {
            const names: string[] = a.textureNames || [];
            const textures: Texture2D[] = a.textures || [];
            const k = names.indexOf(name);
            return textures[k >= 0 ? k : index] || null;
        },
        scale: a.scale || 1,
    };
}

/** Reads (once per asset) a spine-data asset with the runtime its version needs. */
export function loadFromAsset(asset: sp.SkeletonData): { loaded: LoadedSkeleton | null; error: string } {
    let entry = loadedCache.get(asset);
    if (!entry) {
        try {
            entry = { loaded: loadSkeleton(sourceFromAsset(asset)), error: '' };
        } catch (e) {
            entry = { loaded: null, error: (e as Error).message || String(e) };
        }
        loadedCache.set(asset, entry);
    }
    return entry;
}

function inCanvas(node: Node | null): boolean {
    for (let n = node; n; n = n.parent) if (n.getComponent(UITransform)) return true;
    return false;
}

function repaintEditor(): void {
    (globalThis as any).cce?.Engine?.repaintInEditMode?.();
}

const _m = new Mat4();
const _v = new Vec3();
const _v2 = new Vec3();
const _q = new Quat();
const _q2 = new Quat();
const _e = new Vec3();

export type TrackListener = (entry: AnyTrackEntry) => void;
export type EventListener = (entry: AnyTrackEntry, event: any) => void;

interface BatchSlot {
    model: renderer.scene.Model;
    subMesh: RenderingSubMesh | null;
    material: renderer.MaterialInstance | null;
}

/**
 * Plays a Spine skeleton (4.2 or 4.3 exports) with the official runtimes,
 * including physics that reacts to the node's movement, like spine-unity's
 * SkeletonAnimation.
 *
 * Works in 3D scenes and in a Canvas (with a SkeletonUIRenderer, added
 * automatically, so it sorts with sprites).
 */
@ccclass('SkeletonAnimation')
@executeInEditMode
@disallowMultiple
@executionOrder(-50)
@menu('Spine/SkeletonAnimation')
export class SkeletonAnimation extends ModelRenderer {
    /** Enabled skeletons (used by the editor tools). */
    static readonly all = new Set<SkeletonAnimation>();

    @property({ type: sp.SkeletonData })
    private _skeletonData: sp.SkeletonData | null = null;
    @property
    private _skin = '';
    @property
    private _animation = '';
    @property
    private _loop = true;
    @property
    private _timeScale = 1;
    @property
    private _color = new Color(255, 255, 255, 255);
    @property
    private _alphaMode = AlphaMode.Auto;
    @property
    private _flipX = false;
    @property
    private _flipY = false;
    @property
    private _usePhysics = true;
    @property
    private _physicsPositionInheritance = new Vec2(1, 1);
    @property
    private _physicsRotationInheritance = 1;
    @property
    private _physicsPositionLimit = new Vec2(0, 0);
    @property
    private _physicsRotationLimit = 0;
    @property({ type: Node })
    private _physicsMovementRelativeTo: Node | null = null;
    @property
    private _useClipping = true;
    @property
    private _zSpacing = 0;
    @property
    private _playInEditor = true;
    @property
    private _debugBones = false;

    // ---------------------------------------------------------- properties

    @property({ type: sp.SkeletonData, tooltip: 'The Spine export (.json or .skel with its .atlas and textures). 4.2 and 4.3 are supported.' })
    get skeletonData(): sp.SkeletonData | null {
        return this._skeletonData;
    }
    set skeletonData(v: sp.SkeletonData | null) {
        if (v === this._skeletonData) return;
        this._skeletonData = v;
        this.reload();
        if (EDITOR && v && this._instance && inCanvas(this.node)) this.fitUITransform();
    }

    @property({ tooltip: 'Skin to show ("" or "default" for the default skin).' })
    get skin(): string {
        return this._skin;
    }
    set skin(v: string) {
        this._skin = v || '';
        this.applySkin();
    }

    @property({ tooltip: 'Animation played on track 0 when the skeleton starts ("" for the setup pose).' })
    get animation(): string {
        return this._animation;
    }
    set animation(v: string) {
        this._animation = v || '';
        this.applyAnimation();
    }

    @property({ tooltip: 'Loop the animation.' })
    get loop(): boolean {
        return this._loop;
    }
    set loop(v: boolean) {
        this._loop = v;
        const entry = this._instance?.getCurrent(0);
        if (entry) entry.loop = v;
    }

    @property({ type: CCFloat, tooltip: 'Speed of animations and physics.' })
    get timeScale(): number {
        return this._timeScale;
    }
    set timeScale(v: number) {
        this._timeScale = v;
    }

    @property({ type: Color, tooltip: 'Tint (multiplies the skeleton colors).' })
    get color(): Color {
        return this._color;
    }
    set color(v: Color) {
        this._color.set(v);
        this._meshDirty = true;
    }

    @property({ type: AlphaMode, tooltip: 'Whether the atlas textures have premultiplied alpha. Auto reads it from the atlas.' })
    get alphaMode(): AlphaMode {
        return this._alphaMode;
    }
    set alphaMode(v: AlphaMode) {
        this._alphaMode = v;
        this._meshDirty = true;
    }

    @property({ tooltip: 'Mirror horizontally (skeleton scale X = -1).' })
    get flipX(): boolean {
        return this._flipX;
    }
    set flipX(v: boolean) {
        this._flipX = v;
        this.applyFlip();
    }

    @property({ tooltip: 'Mirror vertically (skeleton scale Y = -1).' })
    get flipY(): boolean {
        return this._flipY;
    }
    set flipY(v: boolean) {
        this._flipY = v;
        this.applyFlip();
    }

    @property({ group: { name: 'Physics', displayOrder: 1 }, tooltip: 'Simulate physics constraints. Off: they keep their pose.' })
    get usePhysics(): boolean {
        return this._usePhysics;
    }
    set usePhysics(v: boolean) {
        this._usePhysics = v;
        this.resetLastPosition();
    }

    @property({ group: { name: 'Physics', displayOrder: 1 }, type: Vec2, tooltip: 'How much node movement (X, Y) moves physics (0 = none, 1 = all), like Unity\'s Position Inheritance.' })
    get physicsPositionInheritance(): Vec2 {
        return this._physicsPositionInheritance;
    }
    set physicsPositionInheritance(v: Vec2) {
        this._physicsPositionInheritance.set(v);
    }

    @property({ group: { name: 'Physics', displayOrder: 1 }, type: CCFloat, tooltip: 'How much node rotation rotates physics (0 = none, 1 = all).' })
    get physicsRotationInheritance(): number {
        return this._physicsRotationInheritance;
    }
    set physicsRotationInheritance(v: number) {
        this._physicsRotationInheritance = v;
    }

    @property({ group: { name: 'Physics', displayOrder: 1 }, type: Vec2, tooltip: 'Largest movement per frame passed to physics, in skeleton units (0 = no limit).' })
    get physicsPositionLimit(): Vec2 {
        return this._physicsPositionLimit;
    }
    set physicsPositionLimit(v: Vec2) {
        this._physicsPositionLimit.set(v);
    }

    @property({ group: { name: 'Physics', displayOrder: 1 }, type: CCFloat, tooltip: 'Largest rotation per frame passed to physics, in degrees (0 = no limit).' })
    get physicsRotationLimit(): number {
        return this._physicsRotationLimit;
    }
    set physicsRotationLimit(v: number) {
        this._physicsRotationLimit = Math.max(0, v);
    }

    @property({ group: { name: 'Physics', displayOrder: 1 }, type: Node, tooltip: 'Measure movement relative to this node (e.g. a moving vehicle or camera) instead of the world.' })
    get physicsMovementRelativeTo(): Node | null {
        return this._physicsMovementRelativeTo;
    }
    set physicsMovementRelativeTo(v: Node | null) {
        this._physicsMovementRelativeTo = v;
        this.resetLastPosition();
    }

    @property({ group: { name: 'Advanced', displayOrder: 2 }, tooltip: 'Apply clipping attachments.' })
    get useClipping(): boolean {
        return this._useClipping;
    }
    set useClipping(v: boolean) {
        this._useClipping = v;
        this._meshDirty = true;
    }

    @property({ group: { name: 'Advanced', displayOrder: 2 }, type: CCFloat, tooltip: 'Distance between slots along Z (helps depth sorting in 3D).' })
    get zSpacing(): number {
        return this._zSpacing;
    }
    set zSpacing(v: number) {
        this._zSpacing = v;
        this._meshDirty = true;
    }

    @property({ group: { name: 'Advanced', displayOrder: 2 }, tooltip: 'Play the animation and physics in the Scene view.' })
    get playInEditor(): boolean {
        return this._playInEditor;
    }
    set playInEditor(v: boolean) {
        this._playInEditor = v;
        if (EDITOR) this.applyAnimation();
    }

    @property({ group: { name: 'Advanced', displayOrder: 2 }, tooltip: 'Draw the bones in the Scene view.' })
    get debugBones(): boolean {
        return this._debugBones;
    }
    set debugBones(v: boolean) {
        this._debugBones = v;
    }

    /** Pauses animations and physics. */
    paused = false;

    /** Called after animations are applied, before world transforms (Unity's UpdateLocal). */
    onUpdateLocal: ((c: SkeletonAnimation) => void) | null = null;
    /** Called after world transforms are computed (Unity's UpdateWorld). */
    onUpdateWorld: ((c: SkeletonAnimation) => void) | null = null;
    /** Called when the frame's update is complete (Unity's UpdateComplete). */
    onUpdateComplete: ((c: SkeletonAnimation) => void) | null = null;

    private _instance: SkeletonInstance | null = null;
    private _loadedFrom: sp.SkeletonData | null = null;
    private _error = '';
    private _mesh = new SpineMesh();
    private _options: MeshOptions = defaultMeshOptions();
    private _meshDirty = true;
    private _batches: BatchSlot[] = [];
    private _activeBatches = 0;
    private _materialCache = new Map<string, renderer.MaterialInstance>();
    private _materialBase: Material | null = null;
    private _vb: gfx.Buffer | null = null;
    private _ib: gfx.Buffer | null = null;
    private _vbCapacity = 0;
    private _ibCapacity = 0;
    private _lastPosition = new Vec3();
    private _lastRotation = 0;
    private _hasLast = false;
    private _stamp = '';
    private _renderStamp = '';
    private _warned = '';
    private _listeners: {
        start: TrackListener | null; interrupt: TrackListener | null; end: TrackListener | null;
        dispose: TrackListener | null; complete: TrackListener | null; event: EventListener | null;
    } = { start: null, interrupt: null, end: null, dispose: null, complete: null, event: null };

    // ------------------------------------------------------------- runtime

    /** The skeleton and animation state wrapper (null until data is loaded). */
    get instance(): SkeletonInstance | null {
        return this._instance;
    }

    /** The spine-core Skeleton (4.2 or 4.3 class, see `runtimeVersion`). */
    get skeleton(): any {
        return this._instance?.skeleton ?? null;
    }

    /** The spine-core AnimationState. */
    get state(): any {
        return this._instance?.state ?? null;
    }

    /** '4.2' or '4.3': the runtime reading this skeleton. */
    get runtimeVersion(): string {
        return this._instance?.runtime ?? '';
    }

    /** Why the skeleton couldn't be loaded ('' when fine). */
    get loadError(): string {
        return this._error;
    }

    /** The mesh of the last frame (skeleton space = node local space). */
    get mesh(): SpineMesh {
        return this._mesh;
    }

    get info(): SkeletonInfo | null {
        return this._instance ? skeletonInfo(this._instance.loaded) : null;
    }

    /** Sets an animation on a track, replacing what plays there. Returns the track entry (null if the name is unknown). */
    setAnimation(trackIndex: number, name: string, loop: boolean): AnyTrackEntry | null {
        const inst = this.ensureInstance();
        const entry = inst?.setAnimation(trackIndex, name, loop) ?? null;
        if (!entry && inst) this.warnOnce(`anim:${name}`, `animation "${name}" not found`);
        this._meshDirty = true;
        return entry;
    }

    /** Queues an animation after the current one on a track. */
    addAnimation(trackIndex: number, name: string, loop: boolean, delay = 0): AnyTrackEntry | null {
        const inst = this.ensureInstance();
        const entry = inst?.addAnimation(trackIndex, name, loop, delay) ?? null;
        if (!entry && inst) this.warnOnce(`anim:${name}`, `animation "${name}" not found`);
        return entry;
    }

    /** Mixes out the track to the setup pose. */
    setEmptyAnimation(trackIndex: number, mixDuration = 0): AnyTrackEntry | null {
        return this.ensureInstance()?.setEmptyAnimation(trackIndex, mixDuration) ?? null;
    }

    addEmptyAnimation(trackIndex: number, mixDuration = 0, delay = 0): AnyTrackEntry | null {
        return this.ensureInstance()?.addEmptyAnimation(trackIndex, mixDuration, delay) ?? null;
    }

    getCurrent(trackIndex: number): AnyTrackEntry | null {
        return this._instance?.getCurrent(trackIndex) ?? null;
    }

    clearTrack(trackIndex: number): void {
        this._instance?.clearTrack(trackIndex);
    }

    clearTracks(): void {
        this._instance?.clearTracks();
    }

    /** Mix duration between two animations (seconds). */
    setMix(from: string, to: string, duration: number): void {
        this.ensureInstance()?.setMix(from, to, duration);
    }

    /** Shows a skin ('' or 'default' = default skin). */
    setSkin(name: string): void {
        this.skin = name;
    }

    /** Sets a slot's attachment (null to clear it). */
    setAttachment(slotName: string, attachmentName: string | null): void {
        this.ensureInstance()?.setAttachment(slotName, attachmentName);
        this._meshDirty = true;
    }

    findBone(name: string): AnyBone | null {
        return this.ensureInstance()?.findBone(name) ?? null;
    }

    findSlot(name: string): AnySlot | null {
        return this.ensureInstance()?.findSlot(name) ?? null;
    }

    /** A bone's world transform in skeleton space (= the node's local space). */
    getBoneLocal(bone: AnyBone | string): BoneWorld | null {
        const inst = this.ensureInstance();
        const b = typeof bone === 'string' ? inst?.findBone(bone) : bone;
        return inst && b ? inst.boneWorld(b) : null;
    }

    /** A bone's position in world space. */
    getBoneWorldPosition(bone: AnyBone | string, out = new Vec3()): Vec3 | null {
        const w = this.getBoneLocal(bone);
        if (!w) return null;
        return Vec3.transformMat4(out, _v.set(w.x, w.y, 0), this.node.worldMatrix);
    }

    setStartListener(fn: TrackListener | null): void {
        this._listeners.start = fn;
    }
    setInterruptListener(fn: TrackListener | null): void {
        this._listeners.interrupt = fn;
    }
    setEndListener(fn: TrackListener | null): void {
        this._listeners.end = fn;
    }
    setDisposeListener(fn: TrackListener | null): void {
        this._listeners.dispose = fn;
    }
    setCompleteListener(fn: TrackListener | null): void {
        this._listeners.complete = fn;
    }
    setEventListener(fn: EventListener | null): void {
        this._listeners.event = fn;
    }

    /** Moves physics as if the skeleton moved (x, y) in its own space. */
    physicsTranslate(x: number, y: number): void {
        this._instance?.physicsTranslate(x, y);
    }

    /** Rotates physics as if the skeleton rotated `degrees` around (x, y). */
    physicsRotate(x: number, y: number, degrees: number): void {
        this._instance?.physicsRotate(x, y, degrees);
    }

    /** Puts physics at rest (e.g. after teleporting the node). */
    resetPhysics(): void {
        this._instance?.resetPhysics();
        this.resetLastPosition();
        this._meshDirty = true;
    }

    /** Forget the last node position, so the next move isn't passed to physics (call after teleporting). */
    resetLastPosition(): void {
        this._hasLast = false;
    }

    /** Reloads the skeleton data and restarts skin and animation. */
    reload(): void {
        this._instance = null;
        this._loadedFrom = null;
        this._error = '';
        this._materialCache.forEach((m) => m.destroy());
        this._materialCache.clear();
        this.ensureInstance();
        this._meshDirty = true;
    }

    /** Sizes the UITransform to the skeleton's current bounds. */
    fitUITransform(): void {
        const t = this.node.getComponent(UITransform);
        const inst = this.ensureInstance();
        if (!t || !inst) return;
        this.buildMesh();
        const m = this._mesh;
        const w = Math.max(1, m.maxX - m.minX);
        const h = Math.max(1, m.maxY - m.minY);
        t.setContentSize(w, h);
        t.setAnchorPoint(-m.minX / w, -m.minY / h);
    }

    /** Names and counts for the editor (Inspector). */
    getEditorInfo(): any {
        const inst = this.ensureInstance();
        const info = this.info;
        return {
            error: this._error,
            info,
            batches: this._activeBatches,
            vertices: this._mesh.vertexCount,
            overflow: this._mesh.overflow,
            inCanvas: inCanvas(this.node),
            uiRenderer: !!this.node.getComponent(UIMeshRenderer),
            hasData: !!this._skeletonData,
            animationTime: inst ? (inst.getCurrent(0) as any)?.trackTime ?? 0 : 0,
        };
    }

    // ----------------------------------------------------------- lifecycle

    resetInEditor() {
        if (inCanvas(this.node) && !this.node.getComponent(UIMeshRenderer)) this.node.addComponent('SkeletonUIRenderer');
        this.loadDefaultMaterial();
    }

    private loadDefaultMaterial(): void {
        if (this.getSharedMaterial(0)) return;
        const uuid = inCanvas(this.node) ? SPINE_UI_MATERIAL : SPINE_WORLD_MATERIAL;
        assetManager.loadAny({ uuid }, (err: Error | null, mat: Material) => {
            if (err || !mat || !this.isValid || this.getSharedMaterial(0)) {
                if (err && !EDITOR) this.warnOnce('material', 'no material (assign spine-default or spine-world from db://spine-plus/materials)');
                return;
            }
            this.setSharedMaterial(mat, 0);
            this._meshDirty = true;
        });
    }

    onLoad() {
        this.loadDefaultMaterial();
    }

    onEnable() {
        super.onEnable();
        SkeletonAnimation.all.add(this);
        this.ensureInstance();
        this.resetLastPosition();
        this._meshDirty = true;
        this._attachToScene();
    }

    onDisable() {
        SkeletonAnimation.all.delete(this);
        this._detachFromScene();
    }

    onDestroy() {
        SkeletonAnimation.all.delete(this);
        this._detachFromScene();
        for (const b of this._batches) director.root?.destroyModel(b.model);
        this._batches.length = 0;
        this._models.length = 0;
        this._materialCache.forEach((m) => m.destroy());
        this._materialCache.clear();
        this._vb?.destroy();
        this._ib?.destroy();
        this._vb = this._ib = null;
        this._instance = null;
    }

    update(dt: number) {
        if (EDITOR) this.checkEditorChanges();
        const inst = this.ensureInstance();
        if (!inst) return;
        if (EDITOR && !this._playInEditor) return;
        if (this.paused) return;
        const delta = dt * this._timeScale;
        this.gatherMovement();
        inst.advance(delta);
        this.onUpdateLocal?.(this);
        inst.pose(this._usePhysics);
        this.onUpdateWorld?.(this);
        this.onUpdateComplete?.(this);
        this._meshDirty = true;
        if (EDITOR) repaintEditor();
    }

    lateUpdate() {
        if (!this._instance) {
            this.setActiveBatches(0);
            return;
        }
        // Color, UI opacity and render options can change without a setter (UIOpacity, undo).
        const c = this._color;
        const stamp = `${c.r},${c.g},${c.b},${c.a},${this.uiOpacity()},${this._alphaMode},${this._useClipping},${this._zSpacing}`;
        if (stamp !== this._renderStamp) {
            this._renderStamp = stamp;
            this._meshDirty = true;
        }
        if (!this._meshDirty) return;
        this._meshDirty = false;
        this.buildMesh();
        this.upload();
    }

    // -------------------------------------------------------- skeleton state

    private ensureInstance(): SkeletonInstance | null {
        const data = this._skeletonData;
        if (this._instance && this._loadedFrom === data) return this._instance;
        this._instance = null;
        this._loadedFrom = data;
        this._error = '';
        if (!data) return null;
        const { loaded, error } = loadFromAsset(data);
        if (!loaded) {
            this._error = error;
            this.warnOnce(`load:${error}`, error);
            return null;
        }
        const inst = new SkeletonInstance(loaded);
        this._instance = inst;
        this.hookListeners(inst);
        this.applyFlip();
        if (this._skin && !inst.setSkin(this._skin)) this.warnOnce(`skin:${this._skin}`, `skin "${this._skin}" not found`);
        this.applyAnimation();
        this._stamp = this.editorStamp();
        return inst;
    }

    private hookListeners(inst: SkeletonInstance): void {
        const l = this._listeners;
        (inst.state as any).addListener({
            start: (e: AnyTrackEntry) => l.start?.(e),
            interrupt: (e: AnyTrackEntry) => l.interrupt?.(e),
            end: (e: AnyTrackEntry) => l.end?.(e),
            dispose: (e: AnyTrackEntry) => l.dispose?.(e),
            complete: (e: AnyTrackEntry) => l.complete?.(e),
            event: (e: AnyTrackEntry, ev: any) => l.event?.(e, ev),
        });
    }

    private applyFlip(): void {
        this._instance?.setScale(this._flipX ? -1 : 1, this._flipY ? -1 : 1);
        this._instance?.pose(false);
        this._meshDirty = true;
    }

    private applySkin(): void {
        const inst = this._instance;
        if (!inst) return;
        if (!inst.setSkin(this._skin)) this.warnOnce(`skin:${this._skin}`, `skin "${this._skin}" not found`);
        // Re-apply the current animation so keyed attachments win over the skin's setup pose.
        (inst.state as any).apply(inst.skeleton);
        inst.pose(false);
        this._meshDirty = true;
    }

    private applyAnimation(): void {
        const inst = this._instance;
        if (!inst) return;
        inst.clearTracks();
        inst.setupPose();
        if (this._animation) {
            if (!inst.setAnimation(0, this._animation, this._loop)) this.warnOnce(`anim:${this._animation}`, `animation "${this._animation}" not found`);
        }
        // Show the first frame right away (and in the editor when not playing).
        inst.advance(0);
        inst.pose(false);
        inst.resetPhysics();
        this.resetLastPosition();
        this._meshDirty = true;
    }

    private editorStamp(): string {
        return [this._skin, this._animation, this._loop, this._flipX, this._flipY, this._playInEditor].join('|');
    }

    /** Inspector edits and undo can change the serialized fields directly: restart with the new settings. */
    private checkEditorChanges(): void {
        if (this._loadedFrom !== this._skeletonData) return; // ensureInstance reloads
        const stamp = this.editorStamp();
        if (stamp === this._stamp) return;
        this._stamp = stamp;
        const inst = this._instance;
        if (!inst) return;
        this.applyFlip();
        inst.setSkin(this._skin);
        this.applyAnimation();
    }

    private warnOnce(key: string, message: string): void {
        if (this._warned === key) return;
        this._warned = key;
        console.warn(`[SkeletonAnimation] ${this.node?.name}: ${message}`);
    }

    // ------------------------------------------------------------- physics

    private physicsPosition(out: Vec3): Vec3 {
        const rel = this._physicsMovementRelativeTo;
        if (!rel || !rel.isValid) return out.set(this.node.worldPosition);
        if (rel === this.node.parent) return out.set(this.node.position);
        Mat4.invert(_m, rel.worldMatrix);
        return Vec3.transformMat4(out, this.node.worldPosition, _m);
    }

    private physicsRotation(): number {
        const rel = this._physicsMovementRelativeTo;
        let q: Readonly<Quat> = this.node.worldRotation;
        if (rel && rel.isValid) {
            if (rel === this.node.parent) q = this.node.rotation;
            else q = Quat.multiply(_q2, Quat.invert(_q, rel.worldRotation), this.node.worldRotation);
        }
        return Quat.toEuler(_e, q).z;
    }

    /** Passes the node's movement since last frame to physics (spine-unity's Transform movement inheritance). */
    private gatherMovement(): void {
        const inst = this._instance;
        if (!inst || !this._usePhysics) return;
        const pos = this.physicsPosition(_v);
        const rot = this.physicsRotation();
        if (!this._hasLast) {
            this._lastPosition.set(pos);
            this._lastRotation = rot;
            this._hasLast = true;
            return;
        }
        const f = this._physicsPositionInheritance;
        if (f.x !== 0 || f.y !== 0) {
            const d = Vec3.subtract(_v2, pos, this._lastPosition);
            // Movement measured relative to another node: back to world directions.
            const rel = this._physicsMovementRelativeTo;
            if (rel && rel.isValid) Vec3.transformMat4Normal(d, d, rel.worldMatrix);
            // World movement into the node's space = skeleton space.
            Mat4.invert(_m, this.node.worldMatrix);
            Vec3.transformMat4Normal(d, d, _m);
            let x = d.x * f.x;
            let y = d.y * f.y;
            const lim = this._physicsPositionLimit;
            if (lim.x > 0) x = Math.max(-lim.x, Math.min(lim.x, x));
            if (lim.y > 0) y = Math.max(-lim.y, Math.min(lim.y, y));
            if (x !== 0 || y !== 0) inst.physicsTranslate(x, y);
        }
        this._lastPosition.set(pos);
        if (this._physicsRotationInheritance !== 0) {
            let d = rot - this._lastRotation;
            if (d > 180) d -= 360;
            else if (d < -180) d += 360;
            const lim = this._physicsRotationLimit;
            if (lim > 0) d = Math.max(-lim, Math.min(lim, d));
            if (d !== 0) inst.physicsRotate(0, 0, this._physicsRotationInheritance * d);
        }
        this._lastRotation = rot;
    }

    // ------------------------------------------------------------ rendering

    private uiOpacity(): number {
        const props = (this.node as any)._uiProps;
        return props && typeof props.opacity === 'number' ? props.opacity : 1;
    }

    private pma(): boolean {
        if (this._alphaMode === AlphaMode.Premultiplied) return true;
        if (this._alphaMode === AlphaMode.Straight) return false;
        return !!this._instance?.loaded.pma;
    }

    private buildMesh(): void {
        const inst = this._instance;
        if (!inst) return;
        const o = this._options;
        const c = this._color;
        const opacity = this.uiOpacity();
        o.pma = this.pma();
        o.r = c.r / 255;
        o.g = c.g / 255;
        o.b = c.b / 255;
        o.a = (c.a / 255) * opacity;
        o.clipping = this._useClipping;
        o.zSpacing = this._zSpacing;
        inst.buildMesh(o, this._mesh);
        if (this._mesh.overflow) this.warnOnce('overflow', 'more than 65535 vertices, the rest is not drawn');
    }

    /** True when a SkeletonUIRenderer (or UIMeshRenderer) draws the models in the UI pass. */
    private get uiMode(): boolean {
        const ui = this.node.getComponent(UIMeshRenderer);
        return !!ui && ui.enabledInHierarchy;
    }

    private baseMaterial(): Material | null {
        const mat = this.getSharedMaterial(0);
        if (mat !== this._materialBase) {
            this._materialCache.forEach((m) => m.destroy());
            this._materialCache.clear();
            this._materialBase = mat;
        }
        return mat;
    }

    private materialFor(texture: any, blend: BlendMode, pma: boolean, index: number): renderer.MaterialInstance | null {
        const base = this.baseMaterial();
        const image: Texture2D | null = texture?.image ?? null;
        if (!base || !image) return null;
        const key = `${texture.page}|${blend}|${pma ? 1 : 0}`;
        let mat = this._materialCache.get(key);
        if (!mat) {
            mat = new renderer.MaterialInstance({ parent: base, owner: this, subModelIdx: index });
            const [src, dst, srcA, dstA] = blendFactors(blend, pma);
            mat.overridePipelineStates({
                blendState: {
                    targets: [{ blend: true, blendSrc: src, blendDst: dst, blendSrcAlpha: srcA, blendDstAlpha: dstA }],
                },
            } as any);
            mat.setProperty('mainTexture', image);
            this._materialCache.set(key, mat);
        }
        return mat;
    }

    private ensureBuffers(vertexCount: number, indexCount: number): boolean {
        if (this._vb && vertexCount <= this._vbCapacity && indexCount <= this._ibCapacity) return false;
        const device = director.root!.device;
        let vCap = Math.max(256, this._vbCapacity);
        while (vCap < vertexCount) vCap *= 2;
        let iCap = Math.max(768, this._ibCapacity);
        while (iCap < indexCount) iCap *= 2;
        const old = [this._vb, this._ib];
        this._vb = device.createBuffer(new gfx.BufferInfo(
            gfx.BufferUsageBit.VERTEX | gfx.BufferUsageBit.TRANSFER_DST, gfx.MemoryUsageBit.DEVICE, vCap * BYTES_PER_VERTEX, BYTES_PER_VERTEX,
        ));
        this._ib = device.createBuffer(new gfx.BufferInfo(
            gfx.BufferUsageBit.INDEX | gfx.BufferUsageBit.TRANSFER_DST, gfx.MemoryUsageBit.DEVICE, iCap * 2, 2,
        ));
        this._vbCapacity = vCap;
        this._ibCapacity = iCap;
        // Every batch model draws a range of the shared buffers: point them at the new ones.
        for (const b of this._batches) {
            const sub = this.subMesh();
            b.model.setSubModelMesh(0, sub);
            b.subMesh = sub;
        }
        for (const buf of old) buf?.destroy();
        return true;
    }

    private subMesh(): RenderingSubMesh {
        return new RenderingSubMesh([this._vb!], attributes(), gfx.PrimitiveMode.TRIANGLE_LIST, this._ib!);
    }

    private batchSlot(index: number, material: renderer.MaterialInstance): BatchSlot {
        let b = this._batches[index];
        if (!b) {
            const model = director.root!.createModel(renderer.scene.Model);
            model.visFlags = this.visibility;
            model.node = model.transform = this.node;
            model.priority = this.priority + index;
            const sub = this.subMesh();
            model.initSubModel(0, sub, material);
            b = { model, subMesh: sub, material };
            this._batches[index] = b;
            this._models.push(model);
        } else if (b.material !== material) {
            b.model.setSubModelMaterial(0, material);
            b.material = material;
        }
        return b;
    }

    private setActiveBatches(n: number): void {
        for (let i = 0; i < this._batches.length; i++) {
            const model = this._batches[i].model;
            const on = i < n;
            if (model.enabled !== on) model.enabled = on;
        }
        this._activeBatches = n;
    }

    private upload(): void {
        const mesh = this._mesh;
        if (!mesh.vertexCount || !mesh.indexCount || !director.root) {
            this.setActiveBatches(0);
            return;
        }
        if (!this.baseMaterial()) {
            this.setActiveBatches(0);
            return;
        }
        this.ensureBuffers(mesh.vertexCount, mesh.indexCount);
        this._vb!.update(mesh.vertices as unknown as ArrayBuffer, mesh.vertexCount * BYTES_PER_VERTEX);
        this._ib!.update(mesh.indices as unknown as ArrayBuffer, mesh.indexCount * 2);
        const pma = this._options.pma;
        let drawn = 0;
        const depth = (this._instance?.skeleton.slots.length ?? 0) * this._zSpacing;
        const min = _v.set(mesh.minX, mesh.minY, Math.min(0, depth));
        const max = _v2.set(mesh.maxX, mesh.maxY, Math.max(0, depth));
        for (let i = 0; i < mesh.batchCount; i++) {
            const batch = mesh.batches[i];
            const mat = this.materialFor(batch.texture, batch.blendMode, pma, drawn);
            if (!mat) continue;
            const slot = this.batchSlot(drawn, mat);
            const ia = slot.model.subModels[0].inputAssembler;
            ia.firstIndex = batch.firstIndex;
            ia.indexCount = batch.indexCount;
            ia.vertexCount = mesh.vertexCount;
            slot.model.createBoundingShape(min, max);
            slot.model.updateWorldBound();
            drawn++;
        }
        this.setActiveBatches(drawn);
        this._attachToScene();
    }

    /** Batch models and their materials, in draw order (used by SkeletonUIRenderer). */
    _uiBatches(out: { model: renderer.scene.Model; material: Material }[] = []): { model: renderer.scene.Model; material: Material }[] {
        out.length = 0;
        for (let i = 0; i < this._activeBatches; i++) {
            const b = this._batches[i];
            if (b.material) out.push({ model: b.model, material: b.material });
        }
        return out;
    }

    protected _attachToScene(): void {
        if (!this.node.scene || this.uiMode || !this.enabledInHierarchy) return;
        const scene = this._getRenderScene();
        for (let i = 0; i < this._batches.length; i++) {
            const model = this._batches[i].model;
            if (model.scene !== scene) {
                if (model.scene) model.scene.removeModel(model);
                scene.addModel(model);
            }
        }
    }

    /** @engineInternal Called by UIMeshRenderer too. */
    public _detachFromScene(): void {
        for (const b of this._batches) if (b.model.scene) b.model.scene.removeModel(b.model);
    }

    protected _onMaterialModified(index: number, material: Material | null): void {
        super._onMaterialModified(index, material);
        if (index === 0) {
            this.baseMaterial();
            this._meshDirty = true;
        }
    }

    public _onRebuildPSO(index: number, material: Material | null): void {
        for (const b of this._batches) {
            if (material && b.material === material) b.model.setSubModelMaterial(0, material);
        }
    }

    protected _onVisibilityChange(val: number): void {
        if (this._batches) for (const b of this._batches) b.model.visFlags = val;
    }

    /** Later batches draw after earlier ones (transparent objects sort by priority first). */
    protected _updatePriority(): void {
        if (this._batches) this._batches.forEach((b, i) => (b.model.priority = this.priority + i));
    }

    /** On native, UIMeshRenderer asks for one material per model. */
    public getMaterialInstance(idx: number): renderer.MaterialInstance | null {
        if (JSB && idx < this._activeBatches && this._batches[idx]?.material) return this._batches[idx].material;
        return super.getMaterialInstance(idx);
    }
}

export { BlendMode };
