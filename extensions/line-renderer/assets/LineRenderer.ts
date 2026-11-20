import {
    _decorator, AlphaKey, assetManager, Camera, CCInteger, ccenum, Color, ColorKey, director, gfx, Gradient, Mat4,
    Material, Mesh, ModelRenderer, Node, RealCurve, RealInterpolationMode, renderer, RenderingSubMesh, UIMeshRenderer, UITransform, utils, Vec2, Vec3,
} from 'cc';
import { EDITOR } from 'cc/env';
import {
    buildLine, emptyBuffers, expandVertex, FLOATS_PER_VERTEX, LineAlignment, LineBuffers, LineTextureMode, polylineLength,
    simplifyIndices, RGBA,
} from './core/line-geometry';

const { ccclass, property, executeInEditMode, menu, disallowMultiple } = _decorator;

ccenum(LineAlignment);
ccenum(LineTextureMode);

/** The default line material (alpha blended, shipped with the extension). */
export const DEFAULT_LINE_MATERIAL = '1f031d5f-24ab-45df-9a91-6d49278cd8ab';
/** Additive line material. */
export const ADDITIVE_LINE_MATERIAL = 'e8b52e84-63a6-4f64-b98c-4c027541348d';

const STRIDE = FLOATS_PER_VERTEX * 4;

let ATTRS: gfx.Attribute[] | null = null;
function attributes(): gfx.Attribute[] {
    if (!ATTRS) {
        ATTRS = [
            new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_NORMAL, gfx.Format.RGB32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_TANGENT, gfx.Format.RGBA32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD, gfx.Format.RG32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD1, gfx.Format.RGBA32F),
            new gfx.Attribute(gfx.AttributeName.ATTR_COLOR, gfx.Format.RGBA8, true),
        ];
    }
    return ATTRS;
}

const _m = new Mat4();
const _c = new Color();
const _v = new Vec3();

function constantCurve(value: number): RealCurve {
    const c = new RealCurve();
    c.addKeyFrame(0, value);
    c.addKeyFrame(1, value);
    return c;
}

function linearCurve(a: number, b: number): RealCurve {
    const c = new RealCurve();
    c.assignSorted([
        [0, { value: a, interpolationMode: RealInterpolationMode.LINEAR }],
        [1, { value: b, interpolationMode: RealInterpolationMode.LINEAR }],
    ] as any);
    return c;
}

function twoColorGradient(a: Readonly<Color>, b: Readonly<Color>): Gradient {
    const g = new Gradient();
    const k0 = new ColorKey();
    k0.color = new Color(a.r, a.g, a.b, 255);
    k0.time = 0;
    const k1 = new ColorKey();
    k1.color = new Color(b.r, b.g, b.b, 255);
    k1.time = 1;
    const a0 = new AlphaKey();
    a0.alpha = a.a;
    a0.time = 0;
    const a1 = new AlphaKey();
    a1.alpha = b.a;
    a1.time = 1;
    g.colorKeys = [k0, k1];
    g.alphaKeys = [a0, a1];
    return g;
}

function inCanvas(node: Node | null): boolean {
    for (let n = node; n; n = n.parent) if (n.getComponent(UITransform)) return true;
    return false;
}

/**
 * Draws a line through a list of points (Unity's LineRenderer): width curve,
 * color gradient, round corners and caps, camera-facing or flat, textured.
 *
 * Uses a material made from the line effect (assigned automatically). In a
 * 2D UI hierarchy add a UIMeshRenderer (done automatically when the
 * component is added under a Canvas) so the line sorts with the sprites.
 *
 * Change points through setPosition / setPositions (or call markDirty()
 * after changing the `positions` array directly).
 */
@ccclass('LineRenderer')
@executeInEditMode
@disallowMultiple
@menu('Effects/LineRenderer')
export class LineRenderer extends ModelRenderer {
    /** Enabled line renderers (used by the editor tools). */
    static readonly all = new Set<LineRenderer>();

    @property
    private _loop = false;
    @property({ type: [Vec3] })
    private _positions: Vec3[] = [new Vec3(0, 0, 0), new Vec3(0, 0, 1)];
    @property({ type: RealCurve })
    private _widthCurve: RealCurve = constantCurve(1);
    @property
    private _widthMultiplier = 0.1;
    @property({ type: Gradient })
    private _colorGradient: Gradient = twoColorGradient(Color.WHITE, Color.WHITE);
    @property
    private _numCornerVertices = 0;
    @property
    private _numCapVertices = 0;
    @property
    private _alignment = LineAlignment.View;
    @property
    private _textureMode = LineTextureMode.Stretch;
    @property
    private _textureScale = new Vec2(1, 1);
    @property
    private _useWorldSpace = true;

    @property({ tooltip: 'Connect the last point back to the first.' })
    get loop(): boolean {
        return this._loop;
    }
    set loop(v: boolean) {
        this._loop = v;
        this.markDirty();
    }

    @property({ type: [Vec3], tooltip: 'The points of the line (world space, or local with Use World Space off).' })
    get positions(): Vec3[] {
        return this._positions;
    }
    set positions(v: Vec3[]) {
        this._positions = v;
        this.markDirty();
    }

    @property({ type: RealCurve, tooltip: 'Width along the line (0 = start, 1 = end), times Width Multiplier.' })
    get widthCurve(): RealCurve {
        return this._widthCurve;
    }
    set widthCurve(v: RealCurve) {
        this._widthCurve = v;
        this.markDirty();
    }

    @property({ min: 0, tooltip: 'Scales the width curve (world units).' })
    get widthMultiplier(): number {
        return this._widthMultiplier;
    }
    set widthMultiplier(v: number) {
        this._widthMultiplier = Math.max(0, v);
        this.markDirty();
    }

    @property({ type: Gradient, tooltip: 'Color along the line (0 = start, 1 = end).' })
    get colorGradient(): Gradient {
        return this._colorGradient;
    }
    set colorGradient(v: Gradient) {
        this._colorGradient = v;
        this.markDirty();
    }

    @property({ type: CCInteger, range: [0, 90, 1], tooltip: 'Extra vertices that round each corner.' })
    get numCornerVertices(): number {
        return this._numCornerVertices;
    }
    set numCornerVertices(v: number) {
        this._numCornerVertices = Math.max(0, Math.min(90, Math.round(v)));
        this.markDirty();
    }

    @property({ type: CCInteger, range: [0, 90, 1], tooltip: 'Extra vertices that round both ends.' })
    get numCapVertices(): number {
        return this._numCapVertices;
    }
    set numCapVertices(v: number) {
        this._numCapVertices = Math.max(0, Math.min(90, Math.round(v)));
        this.markDirty();
    }

    @property({ type: LineAlignment, tooltip: 'View: face the camera. TransformZ: face the nodeâ€™s Z axis (flat in its XY plane).' })
    get alignment(): LineAlignment {
        return this._alignment;
    }
    set alignment(v: LineAlignment) {
        this._alignment = v;
        this.markDirty();
    }

    @property({ type: LineTextureMode, tooltip: 'How the texture maps along the line.' })
    get textureMode(): LineTextureMode {
        return this._textureMode;
    }
    set textureMode(v: LineTextureMode) {
        this._textureMode = v;
        this.markDirty();
    }

    @property({ tooltip: 'Texture repeats along (x) and across (y) the line.' })
    get textureScale(): Vec2 {
        return this._textureScale;
    }
    set textureScale(v: Vec2) {
        this._textureScale.set(v);
        this.markDirty();
    }

    @property({ tooltip: 'Points are in world space (on) or in the nodeâ€™s local space (off).' })
    get useWorldSpace(): boolean {
        return this._useWorldSpace;
    }
    set useWorldSpace(v: boolean) {
        if (v === this._useWorldSpace) return;
        this._useWorldSpace = v;
        this.markDirty();
    }

    private _model: renderer.scene.Model | null = null;
    private _buffers: LineBuffers = emptyBuffers();
    private _subMesh: RenderingSubMesh | null = null;
    private _vb: gfx.Buffer | null = null;
    private _ib: gfx.Buffer | null = null;
    private _vbCapacity = 0;
    private _ibCapacity = 0;
    private _dirty = true;
    private _stamp = NaN;
    private _warnedMaterial = false;

    // ------------------------------------------------------------- points

    /** Number of points. Growing adds points at the origin; shrinking drops the last ones. */
    get positionCount(): number {
        return this._positions.length;
    }
    set positionCount(n: number) {
        n = Math.max(0, Math.floor(n));
        while (this._positions.length < n) this._positions.push(new Vec3());
        this._positions.length = n;
        this.markDirty();
    }

    setPosition(index: number, position: Readonly<Vec3>): void {
        const p = this._positions[index];
        if (!p) return;
        p.set(position);
        this.markDirty();
    }

    getPosition(index: number, out = new Vec3()): Vec3 {
        const p = this._positions[index];
        return p ? out.set(p) : out.set(0, 0, 0);
    }

    /** Replaces all points (copies them). */
    setPositions(positions: readonly Readonly<Vec3>[]): void {
        this._positions = positions.map((p) => new Vec3(p.x, p.y, p.z));
        this.markDirty();
    }

    /** Copies the points into `out` (resized). */
    getPositions(out: Vec3[] = []): Vec3[] {
        out.length = this._positions.length;
        for (let i = 0; i < out.length; i++) out[i] = (out[i] || new Vec3()).set(this._positions[i]);
        return out;
    }

    /** Width at the start (setting it makes the width curve a straight line to the end width). */
    get startWidth(): number {
        return this._widthCurve.evaluate(0) * this._widthMultiplier;
    }
    set startWidth(v: number) {
        const end = this.endWidth;
        this._widthCurve = linearCurve(v, end);
        this._widthMultiplier = 1;
        this.markDirty();
    }

    get endWidth(): number {
        return this._widthCurve.evaluate(1) * this._widthMultiplier;
    }
    set endWidth(v: number) {
        const start = this.startWidth;
        this._widthCurve = linearCurve(start, v);
        this._widthMultiplier = 1;
        this.markDirty();
    }

    /** Color at the start (setting it makes the gradient a blend to the end color). */
    get startColor(): Color {
        return this._colorGradient.evaluate(0);
    }
    set startColor(v: Color) {
        this._colorGradient = twoColorGradient(v, this.endColor);
        this.markDirty();
    }

    get endColor(): Color {
        return this._colorGradient.evaluate(1);
    }
    set endColor(v: Color) {
        this._colorGradient = twoColorGradient(this.startColor, v);
        this.markDirty();
    }

    /** Length of the line (in the space of the points). */
    getLength(): number {
        return polylineLength(this._positions, this._loop);
    }

    /** Removes points that change the shape by less than `tolerance` (Ramer-Douglas-Peucker, like Unity). */
    simplify(tolerance: number): void {
        const keep = simplifyIndices(this._positions, tolerance, this._loop);
        this._positions = keep.map((i) => this._positions[i]);
        this.markDirty();
    }

    /** Rebuild on the next frame (needed after changing the `positions` array directly). */
    markDirty(): void {
        this._dirty = true;
    }

    // ---------------------------------------------------------- lifecycle

    resetInEditor() {
        if (inCanvas(this.node)) {
            // UI units: a visible default in 2D.
            this._positions = [new Vec3(-100, 0, 0), new Vec3(100, 0, 0)];
            this._widthMultiplier = 10;
            this._useWorldSpace = false;
            if (!this.node.getComponent(UIMeshRenderer)) this.node.addComponent(UIMeshRenderer);
        }
        this.loadDefaultMaterial();
        this.markDirty();
    }

    private loadDefaultMaterial(): void {
        if (!EDITOR || this.getSharedMaterial(0)) return;
        assetManager.loadAny({ uuid: DEFAULT_LINE_MATERIAL }, (err: Error | null, mat: Material) => {
            if (err || !mat || !this.isValid || this.getSharedMaterial(0)) return;
            this.setSharedMaterial(mat, 0);
        });
    }

    onLoad() {
        const model = director.root!.createModel(renderer.scene.Model);
        model.visFlags = this.visibility;
        model.node = model.transform = this.node;
        this._model = model;
        this._models.length = 0;
        this._models.push(model);
        this.loadDefaultMaterial();
    }

    onEnable() {
        super.onEnable();
        LineRenderer.all.add(this);
        this._attachToScene();
        this.markDirty();
        this.rebuild();
    }

    onDisable() {
        LineRenderer.all.delete(this);
        this._detachFromScene();
    }

    onDestroy() {
        LineRenderer.all.delete(this);
        this._detachFromScene();
        if (this._model) director.root?.destroyModel(this._model);
        this._model = null;
        this._models.length = 0;
        this._subMesh?.destroy();
        this._subMesh = null;
        this._vb = this._ib = null;
    }

    lateUpdate() {
        if (!this._model) return;
        if (EDITOR) {
            // Inspector edits and undo change the data behind the setters.
            const stamp = this.fingerprint();
            if (stamp !== this._stamp) {
                this._stamp = stamp;
                this._dirty = true;
            }
        }
        if (this._useWorldSpace && this.node.hasChangedFlags) this._dirty = true;
        if (this._dirty) this.rebuild();
    }

    protected _attachToScene(): void {
        if (!this.node.scene || !this._model) return;
        if (this._model.scene) this._detachFromScene();
        this._getRenderScene().addModel(this._model);
    }

    /** @engineInternal Called by UIMeshRenderer too. */
    public _detachFromScene(): void {
        if (this._model && this._model.scene) this._model.scene.removeModel(this._model);
    }

    protected _onMaterialModified(index: number, material: Material | null): void {
        super._onMaterialModified(index, material);
        if (this._model && this._model.subModels.length) {
            const mat = this.getRenderMaterial(index);
            if (mat) this._model.setSubModelMaterial(index, mat);
        } else {
            this.markDirty();
        }
    }

    public _onRebuildPSO(index: number, material: Material | null): void {
        if (this._model && this._model.subModels.length && material) this._model.setSubModelMaterial(index, material);
    }

    protected _onVisibilityChange(val: number): void {
        if (this._model) this._model.visFlags = val;
    }

    // ---------------------------------------------------------- geometry

    private fingerprint(): number {
        let h = 2166136261 | 0;
        const mix = (v: number) => {
            h = Math.imul(h ^ Math.round(v * 1e4), 16777619);
        };
        mix(this._positions.length);
        for (const p of this._positions) {
            mix(p.x);
            mix(p.y);
            mix(p.z);
        }
        for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            mix(this._widthCurve.evaluate(t));
            this._colorGradient.evaluateFast(_c, t);
            mix(_c.r + _c.g * 256 + _c.b * 65536 + _c.a * 16777216);
        }
        mix(this._widthMultiplier);
        mix(this._loop ? 1 : 0);
        mix(this._numCornerVertices);
        mix(this._numCapVertices);
        mix(this._alignment);
        mix(this._textureMode);
        mix(this._textureScale.x);
        mix(this._textureScale.y);
        mix(this._useWorldSpace ? 1 : 0);
        return h;
    }

    /** Points in the node's local space (where the vertices are built). */
    private localPoints(): Vec3[] {
        if (!this._useWorldSpace) return this._positions;
        Mat4.invert(_m, this.node.worldMatrix);
        return this._positions.map((p) => Vec3.transformMat4(new Vec3(), p, _m));
    }

    /** Regenerates the geometry now. */
    rebuild(): void {
        this._dirty = false;
        if (EDITOR) this._stamp = this.fingerprint();
        const model = this._model;
        if (!model) return;
        const curve = this._widthCurve;
        const mult = this._widthMultiplier;
        const grad = this._colorGradient;
        const b = buildLine({
            points: this.localPoints(),
            loop: this._loop,
            width: (t) => curve.evaluate(t) * mult,
            color: (t, out: RGBA) => {
                grad.evaluateFast(_c, t);
                out.r = _c.r;
                out.g = _c.g;
                out.b = _c.b;
                out.a = _c.a;
                return out;
            },
            cornerVertices: this._numCornerVertices,
            capVertices: this._numCapVertices,
            alignment: this._alignment,
            textureMode: this._textureMode,
            textureScale: this._textureScale,
        }, this._buffers);
        this.upload(b);
    }

    private upload(b: LineBuffers): void {
        const model = this._model!;
        if (!b.vertexCount || !b.indexCount) {
            if (model.subModels.length) model.subModels[0].inputAssembler.indexCount = 0;
            return;
        }
        const material = this.getRenderMaterial(0);
        if (!material) {
            if (!this._warnedMaterial && !EDITOR) console.warn(`[LineRenderer] ${this.node.name}: no material.`);
            this._warnedMaterial = true;
            return;
        }
        if (!this._subMesh || b.vertexCount > this._vbCapacity || b.indexCount > this._ibCapacity) this.createBuffers(b, material);
        this._vb!.update(b.data as unknown as ArrayBuffer, b.vertexCount * STRIDE);
        this._ib!.update(b.indices as unknown as ArrayBuffer, b.indexCount * 2);
        const ia = model.subModels[0].inputAssembler;
        ia.firstIndex = 0;
        ia.indexCount = b.indexCount;
        ia.vertexCount = b.vertexCount;

        // Bounds for culling, padded by the width (vertices move sideways in the shader).
        const s = this.node.worldScale;
        const minScale = Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) || 1;
        const pad = b.maxHalfWidth / minScale;
        model.createBoundingShape(
            new Vec3(b.min.x - pad, b.min.y - pad, b.min.z - pad),
            new Vec3(b.max.x + pad, b.max.y + pad, b.max.z + pad),
        );
        model.updateWorldBound();
    }

    private createBuffers(b: LineBuffers, material: Material): void {
        const device = director.root!.device;
        let vCap = Math.max(64, this._vbCapacity);
        while (vCap < b.vertexCount) vCap *= 2;
        let iCap = Math.max(96, this._ibCapacity);
        while (iCap < b.indexCount) iCap *= 2;
        const vb = device.createBuffer(new gfx.BufferInfo(
            gfx.BufferUsageBit.VERTEX | gfx.BufferUsageBit.TRANSFER_DST, gfx.MemoryUsageBit.DEVICE, vCap * STRIDE, STRIDE,
        ));
        const ib = device.createBuffer(new gfx.BufferInfo(
            gfx.BufferUsageBit.INDEX | gfx.BufferUsageBit.TRANSFER_DST, gfx.MemoryUsageBit.DEVICE, iCap * 2, 2,
        ));
        const subMesh = new RenderingSubMesh([vb], attributes(), gfx.PrimitiveMode.TRIANGLE_LIST, ib);
        const model = this._model!;
        const old = this._subMesh;
        if (model.subModels.length) model.setSubModelMesh(0, subMesh);
        else model.initSubModel(0, subMesh, material);
        model.enabled = true;
        old?.destroy();
        this._subMesh = subMesh;
        this._vb = vb;
        this._ib = ib;
        this._vbCapacity = vCap;
        this._ibCapacity = iCap;
    }

    // -------------------------------------------------------------- bake

    /**
     * The line as a mesh, as seen from `camera` (Unity's BakeMesh). Without a
     * camera, View-aligned lines face +Z. Vertices are in the node's local
     * space, or in world space with `worldSpace`.
     */
    bakeMesh(camera: Camera | null = null, worldSpace = false): Mesh | null {
        this.rebuild();
        const b = this._buffers;
        if (!b.vertexCount) return null;
        const world = this.node.worldMatrix;
        const cam = camera?.camera ?? null;
        const camPos = camera ? camera.node.worldPosition : null;
        const ortho = cam ? cam.projectionType === 0 : false;
        const back = camera ? Vec3.transformQuat(new Vec3(), Vec3.UNIT_Z, camera.node.worldRotation) : new Vec3(0, 0, 1);
        const towards = (p: { x: number; y: number; z: number }) => {
            if (!camPos || ortho) return { x: back.x, y: back.y, z: back.z };
            const d = new Vec3(camPos.x - p.x, camPos.y - p.y, camPos.z - p.z).normalize();
            return { x: d.x, y: d.y, z: d.z };
        };
        Mat4.invert(_m, world);
        const positions: number[] = [];
        const uvs: number[] = [];
        const colors: number[] = [];
        for (let i = 0; i < b.vertexCount; i++) {
            const p = expandVertex(_v, b, i, world, towards);
            if (!worldSpace) Vec3.transformMat4(_v, p as Vec3, _m);
            positions.push(_v.x, _v.y, _v.z);
            const o = i * FLOATS_PER_VERTEX;
            uvs.push(b.data[o + 10], b.data[o + 11]);
            const c = b.u32[o + 16];
            colors.push((c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 24) & 255) / 255);
        }
        return utils.MeshUtils.createMesh({
            positions,
            uvs,
            colors,
            indices: Array.from(b.indices.subarray(0, b.indexCount)),
        });
    }
}

export { LineAlignment, LineTextureMode };
