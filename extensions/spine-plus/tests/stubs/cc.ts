/**
 * A small stand-in for the 'cc' engine module, enough to run the runtime
 * classes and the scene script in node. Math follows the engine's formulas.
 */

// ---------------------------------------------------------------- math

export class Vec3 {
    static readonly ZERO = Object.freeze(new Vec3(0, 0, 0));
    static readonly UNIT_X = Object.freeze(new Vec3(1, 0, 0));
    static readonly UNIT_Y = Object.freeze(new Vec3(0, 1, 0));
    static readonly UNIT_Z = Object.freeze(new Vec3(0, 0, 1));
    static readonly FORWARD = Object.freeze(new Vec3(0, 0, -1));

    constructor(public x = 0, public y = 0, public z = 0) {
        if (typeof x === 'object') {
            const v = x as any;
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
        }
    }

    set(x: any = 0, y = 0, z = 0): this {
        if (typeof x === 'object') {
            this.x = x.x;
            this.y = x.y;
            this.z = x.z;
        } else {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        return this;
    }

    clone() {
        return new Vec3(this.x, this.y, this.z);
    }

    add(v: any) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    lengthSqr() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    length() {
        return Math.sqrt(this.lengthSqr());
    }

    normalize() {
        const l = this.length();
        if (l > 0) {
            this.x /= l;
            this.y /= l;
            this.z /= l;
        }
        return this;
    }

    negative() {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        return this;
    }

    equals(v: any, eps = 1e-6) {
        return Math.abs(this.x - v.x) <= eps && Math.abs(this.y - v.y) <= eps && Math.abs(this.z - v.z) <= eps;
    }

    static transformMat4(out: any, a: any, m: any) {
        const { x, y, z } = a;
        let w = m.m03 * x + m.m07 * y + m.m11 * z + m.m15;
        w = w ? 1 / w : 1;
        out.x = (m.m00 * x + m.m04 * y + m.m08 * z + m.m12) * w;
        out.y = (m.m01 * x + m.m05 * y + m.m09 * z + m.m13) * w;
        out.z = (m.m02 * x + m.m06 * y + m.m10 * z + m.m14) * w;
        return out;
    }

    static transformMat4Normal(out: any, a: any, m: any) {
        const { x, y, z } = a;
        out.x = m.m00 * x + m.m04 * y + m.m08 * z;
        out.y = m.m01 * x + m.m05 * y + m.m09 * z;
        out.z = m.m02 * x + m.m06 * y + m.m10 * z;
        return out;
    }

    static transformQuat(out: any, a: any, q: any) {
        const ix = q.w * a.x + q.y * a.z - q.z * a.y;
        const iy = q.w * a.y + q.z * a.x - q.x * a.z;
        const iz = q.w * a.z + q.x * a.y - q.y * a.x;
        const iw = -q.x * a.x - q.y * a.y - q.z * a.z;
        out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
        out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
        out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
        return out;
    }

    static normalize(out: any, a: any) {
        const l = Math.hypot(a.x, a.y, a.z);
        out.x = l ? a.x / l : 0;
        out.y = l ? a.y / l : 0;
        out.z = l ? a.z / l : 0;
        return out;
    }

    static dot(a: any, b: any) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    static cross(out: any, a: any, b: any) {
        const x = a.y * b.z - a.z * b.y;
        const y = a.z * b.x - a.x * b.z;
        const z = a.x * b.y - a.y * b.x;
        out.x = x;
        out.y = y;
        out.z = z;
        return out;
    }

    static distance(a: any, b: any) {
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    static subtract(out: any, a: any, b: any) {
        out.x = a.x - b.x;
        out.y = a.y - b.y;
        out.z = a.z - b.z;
        return out;
    }

    static lengthSqr(a: any) {
        return a.x * a.x + a.y * a.y + a.z * a.z;
    }
}

export class Vec2 {
    constructor(public x = 0, public y = 0) {}
    clone() {
        return new Vec2(this.x, this.y);
    }
    set(x: any = 0, y = 0): this {
        if (typeof x === 'object') {
            this.x = x.x;
            this.y = x.y;
        } else {
            this.x = x;
            this.y = y;
        }
        return this;
    }
}

export class Quat {
    static readonly IDENTITY = Object.freeze(new Quat());

    constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}

    set(x: any, y?: number, z?: number, w?: number): this {
        if (typeof x === 'object') {
            this.x = x.x;
            this.y = x.y;
            this.z = x.z;
            this.w = x.w;
        } else {
            this.x = x;
            this.y = y!;
            this.z = z!;
            this.w = w!;
        }
        return this;
    }

    clone() {
        return new Quat(this.x, this.y, this.z, this.w);
    }

    static multiply(out: any, a: any, b: any) {
        const x = a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y;
        const y = a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z;
        const z = a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x;
        const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
        out.x = x;
        out.y = y;
        out.z = z;
        out.w = w;
        return out;
    }

    static invert(out: any, a: any) {
        const d = a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w;
        const inv = d ? 1 / d : 0;
        out.x = -a.x * inv;
        out.y = -a.y * inv;
        out.z = -a.z * inv;
        out.w = a.w * inv;
        return out;
    }

    static fromAngleZ(out: any, z: number) {
        return Quat.fromEuler(out, 0, 0, z);
    }

    /** Euler angles in degrees (only Z matters for these tests). */
    static toEuler(out: any, q: any) {
        const { x, y, z, w } = q;
        out.x = (Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * 180) / Math.PI;
        out.y = (Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * 180) / Math.PI;
        out.z = (Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180) / Math.PI;
        return out;
    }

    static fromEuler(out: any, x: number, y: number, z: number) {
        const h = (0.5 * Math.PI) / 180;
        x *= h;
        y *= h;
        z *= h;
        const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
        out.x = sx * cy * cz + cx * sy * sz;
        out.y = cx * sy * cz + sx * cy * sz;
        out.z = cx * cy * sz - sx * sy * cz;
        out.w = cx * cy * cz - sx * sy * sz;
        return out;
    }

    /** Like Mat3.fromViewUp: +Z = view. */
    static fromViewUp(out: any, view: any, up: any = Vec3.UNIT_Y) {
        const x = Vec3.normalize(new Vec3(), Vec3.cross(new Vec3(), up, view));
        if (x.lengthSqr() < 1e-12) {
            out.x = 0; out.y = 0; out.z = 0; out.w = 1;
            return out;
        }
        const y = Vec3.cross(new Vec3(), view, x);
        const m00 = x.x, m01 = y.x, m02 = view.x;
        const m10 = x.y, m11 = y.y, m12 = view.y;
        const m20 = x.z, m21 = y.z, m22 = view.z;
        const trace = m00 + m11 + m22;
        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1);
            out.w = 0.25 / s; out.x = (m21 - m12) * s; out.y = (m02 - m20) * s; out.z = (m10 - m01) * s;
        } else if (m00 > m11 && m00 > m22) {
            const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
            out.w = (m21 - m12) / s; out.x = 0.25 * s; out.y = (m01 + m10) / s; out.z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
            out.w = (m02 - m20) / s; out.x = (m01 + m10) / s; out.y = 0.25 * s; out.z = (m12 + m21) / s;
        } else {
            const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
            out.w = (m10 - m01) / s; out.x = (m02 + m20) / s; out.y = (m12 + m21) / s; out.z = 0.25 * s;
        }
        return out;
    }
}

export class Mat4 {
    m00 = 1; m01 = 0; m02 = 0; m03 = 0;
    m04 = 0; m05 = 1; m06 = 0; m07 = 0;
    m08 = 0; m09 = 0; m10 = 1; m11 = 0;
    m12 = 0; m13 = 0; m14 = 0; m15 = 1;

    static readonly IDENTITY = Object.freeze(new Mat4());

    static toArray(out: number[], m: any) {
        const keys = ['m00', 'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15'];
        keys.forEach((k, i) => (out[i] = m[k]));
        return out;
    }

    static fromArray(out: any, a: number[]) {
        const keys = ['m00', 'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15'];
        keys.forEach((k, i) => (out[k] = a[i]));
        return out;
    }

    static multiply(out: any, a: any, b: any) {
        const A = Mat4.toArray([], a);
        const B = Mat4.toArray([], b);
        const R: number[] = new Array(16).fill(0);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += A[k * 4 + r] * B[c * 4 + k];
            R[c * 4 + r] = s;
        }
        return Mat4.fromArray(out, R);
    }

    static invert(out: any, m: any) {
        const a = Mat4.toArray([], m);
        const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
        const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return Mat4.fromArray(out, Mat4.toArray([], Mat4.IDENTITY));
        det = 1 / det;
        return Mat4.fromArray(out, [
            (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det,
            (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
            (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
            (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
            (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det,
            (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
            (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det,
            (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
        ]);
    }

    /** Rotation around Z of a matrix (the 2D tests only rotate around Z). */
    static getRotation(out: any, m: any) {
        const angle = Math.atan2(m.m01, m.m00);
        return Quat.fromEuler(out, 0, 0, (angle * 180) / Math.PI);
    }

    /** Translation * rotation * scale. */
    static fromRTS(out: any, q: any, t: any, s: any) {
        const { x, y, z, w } = q;
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
        return Mat4.fromArray(out, [
            (1 - (yy + zz)) * s.x, (xy + wz) * s.x, (xz - wy) * s.x, 0,
            (xy - wz) * s.y, (1 - (xx + zz)) * s.y, (yz + wx) * s.y, 0,
            (xz + wy) * s.z, (yz - wx) * s.z, (1 - (xx + yy)) * s.z, 0,
            t.x, t.y, t.z, 1,
        ]);
    }
}

export class Color {
    static readonly WHITE = Object.freeze(new Color(255, 255, 255, 255));
    static readonly BLACK = Object.freeze(new Color(0, 0, 0, 255));
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    set(c: any) {
        this.r = c.r;
        this.g = c.g;
        this.b = c.b;
        this.a = c.a;
        return this;
    }
}

// -------------------------------------------------------------- objects

export const CCObject = {
    Flags: {
        DontSave: 1 << 3,
        EditorOnly: 1 << 4,
        LockedInEditor: 1 << 9,
        HideInHierarchy: 1 << 10,
    },
};

let uuidSeq = 0;
export function makeUuid(prefix = 'id') {
    return `${prefix}-${++uuidSeq}`;
}

type Ctor<T> = new (...args: any[]) => T;

export class Node {
    uuid = makeUuid('node');
    name: string;
    parent: Node | null = null;
    children: Node[] = [];
    components: Component[] = [];
    layer = 1;
    active = true;
    isValid = true;
    _objFlags = 0;
    position = new Vec3();
    rotation = new Quat();
    scale = new Vec3(1, 1, 1);
    private listeners = new Map<string, Function[]>();

    constructor(name = 'Node') {
        this.name = name;
    }

    get activeInHierarchy(): boolean {
        return this.active && (!this.parent || this.parent.activeInHierarchy);
    }

    get scene(): any {
        let n: Node = this;
        while (n.parent) n = n.parent;
        return n;
    }

    setParent(p: Node | null) {
        if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = p;
        if (p) p.children.push(this);
    }

    get worldMatrix(): Mat4 {
        const local = Mat4.fromRTS(new Mat4(), this.rotation, this.position, this.scale);
        return this.parent && !(this.parent as any).isScene ? Mat4.multiply(new Mat4(), this.parent.worldMatrix, local) : local;
    }

    get worldPosition(): Vec3 {
        const m = this.worldMatrix;
        return new Vec3(m.m12, m.m13, m.m14);
    }

    get worldRotation(): Quat {
        const local = this.rotation.clone();
        return this.parent && !(this.parent as any).isScene ? Quat.multiply(new Quat(), this.parent.worldRotation, local) : local;
    }

    get forward() {
        return Vec3.transformQuat(new Vec3(), new Vec3(0, 0, -1), this.worldRotation);
    }
    get right() {
        return Vec3.transformQuat(new Vec3(), new Vec3(1, 0, 0), this.worldRotation);
    }
    get up() {
        return Vec3.transformQuat(new Vec3(), new Vec3(0, 1, 0), this.worldRotation);
    }

    setPosition(x: any, y?: number, z?: number) {
        this.position.set(x, y, z);
    }

    setWorldPosition(x: any, y?: number, z?: number) {
        const p = typeof x === 'object' ? new Vec3(x.x, x.y, x.z) : new Vec3(x, y, z);
        if (this.parent && !(this.parent as any).isScene) Vec3.transformMat4(p, p, Mat4.invert(new Mat4(), this.parent.worldMatrix));
        this.position.set(p);
    }

    setWorldRotation(x: any, y?: number, z?: number, w?: number) {
        const q = typeof x === 'object' ? new Quat(x.x, x.y, x.z, x.w) : new Quat(x, y, z, w);
        if (this.parent && !(this.parent as any).isScene) Quat.multiply(q, Quat.invert(new Quat(), this.parent.worldRotation), q);
        this.rotation.set(q);
    }

    setScale(x: any, y?: number, z?: number) {
        this.scale.set(x, y, z);
    }

    // Loosely typed: the runtime classes are typed against the real engine.
    getComponent(C: any): any {
        const Ctor = typeof C === 'string' ? classes.get(C) : C;
        return this.components.find((c) => (Ctor ? c instanceof Ctor : (c.constructor as any).__cid === C)) ?? null;
    }

    hasChangedFlags = 0;

    get worldScale(): Vec3 {
        const s = this.scale.clone();
        for (let p = this.parent; p && !(p as any).isScene; p = p.parent) {
            s.x *= p.scale.x;
            s.y *= p.scale.y;
            s.z *= p.scale.z;
        }
        return s;
    }

    addComponent(C: any): any {
        if (typeof C === 'string') C = classes.get(C);
        const c = new C();
        c.node = this;
        this.components.push(c);
        c.__start();
        return c;
    }

    on(type: string, fn: Function) {
        const l = this.listeners.get(type) || [];
        l.push(fn);
        this.listeners.set(type, l);
    }

    off(type: string, fn: Function) {
        const l = this.listeners.get(type) || [];
        this.listeners.set(type, l.filter((f) => f !== fn));
    }

    hasEventListener(type: string) {
        return (this.listeners.get(type) || []).length > 0;
    }

    emit(type: string, ...args: any[]) {
        for (const f of this.listeners.get(type) || []) f(...args);
    }

    destroy() {
        this.isValid = false;
        for (const c of this.components) c.__destroy();
        this.setParent(null);
    }
}

export class Component {
    node!: Node;
    uuid = makeUuid('comp');
    private _enabled = true;
    isValid = true;

    get enabled() {
        return this._enabled;
    }
    set enabled(v: boolean) {
        if (v === this._enabled) return;
        this._enabled = v;
        if (v) (this as any).onEnable?.();
        else (this as any).onDisable?.();
    }

    get enabledInHierarchy() {
        return this._enabled && this.node.activeInHierarchy;
    }

    getComponent<T>(C: Ctor<T> | string): T | null {
        return this.node.getComponent(C);
    }

    _getRenderScene(): any {
        return (this.node.scene as any).renderScene;
    }

    __start() {
        (this as any).onLoad?.();
        if (this._enabled) (this as any).onEnable?.();
    }

    __destroy() {
        if (this._enabled) (this as any).onDisable?.();
        (this as any).onDestroy?.();
        this.isValid = false;
    }

    destroy() {
        this.__destroy();
        this.node.components.splice(this.node.components.indexOf(this), 1);
    }
}

// ------------------------------------------------------------ decorators

const classes = new Map<string, any>();

function ccclass(name: string) {
    return (ctor: any) => {
        ctor.__cid = name;
        classes.set(name, ctor);
        return ctor;
    };
}

const noopDecorator = (..._a: any[]) => (..._b: any[]) => undefined;

function property(...args: any[]): any {
    // @property or @property({...})
    if (args.length >= 2 && typeof args[1] === 'string') return undefined;
    return () => undefined;
}

export const _decorator = {
    ccclass,
    property,
    executeInEditMode: (ctor: any) => ctor,
    disallowMultiple: (ctor: any) => ctor,
    menu: noopDecorator,
    requireComponent: noopDecorator,
    executionOrder: noopDecorator,
};

export function ccenum(_e: any) {
    return _e;
}

export const CCInteger = 'Integer';
export const CCFloat = 'Float';

export const js = {
    getClassByName(name: string) {
        return classes.get(name) ?? null;
    },
};

// --------------------------------------------------------------- engine

export class EventHandler {
    static emitEvents(_handlers: any[], ..._args: any[]) {}
}

export class Mesh {
    constructor(public geometry: any) {}
    destroy() {}
}

export class MeshRenderer extends Component {
    mesh: any = null;
    materials: any[] = [];
    shadowCastingMode = 0;
    receiveShadow = 0;
    setSharedMaterial(m: any, i: number) {
        this.materials[i] = m;
    }
}

export class Prefab {
    constructor(public data: Node) {}
}

export function instantiate(p: Prefab): Node {
    const n = new Node(p.data.name);
    n.scale.set(p.data.scale);
    return n;
}

export const utils = {
    MeshUtils: {
        createMesh(geometry: any) {
            return new Mesh(geometry);
        },
    },
};

const directorListeners = new Map<string, Function[]>();
let totalFrames = 0;

export const director: any = {
    root: null as any,
    _scene: null as any,
    getScene() {
        return this._scene;
    },
    getTotalFrames() {
        return totalFrames;
    },
    getTotalTime() {
        return totalFrames * 16;
    },
    on(type: string, fn: Function) {
        const l = directorListeners.get(type) || [];
        l.push(fn);
        directorListeners.set(type, l);
    },
    off(type: string, fn: Function) {
        directorListeners.set(type, (directorListeners.get(type) || []).filter((f) => f !== fn));
    },
    /** Test helper: one editor frame. */
    tick() {
        for (const f of directorListeners.get('director_before_commit') || []) f();
        totalFrames++;
    },
};

export const Director = { EVENT_BEFORE_COMMIT: 'director_before_commit' };

export const geometry = {
    Ray: class {
        o: Vec3;
        d: Vec3;
        constructor(ox = 0, oy = 0, oz = 0, dx = 0, dy = 0, dz = -1) {
            this.o = new Vec3(ox, oy, oz);
            this.d = new Vec3(dx, dy, dz);
        }
    },
    ERaycastMode: { ALL: 0, CLOSEST: 1, ANY: 2 },
    intersect: {
        rayAABB: () => true,
        rayModel: () => 0,
    },
};

export const game: any = { canvas: null };

// ------------------------------------------------- rendering (line renderer)

export class RenderScene {
    models: any[] = [];
    addModel(m: any) {
        m.scene = this;
        this.models.push(m);
    }
    removeModel(m: any) {
        this.models = this.models.filter((x) => x !== m);
        m.scene = null;
    }
}

class FakeBuffer {
    data: ArrayBuffer | null = null;
    updates = 0;
    constructor(public info: any) {}
    update(src: ArrayBufferView | ArrayBuffer, size?: number) {
        const bytes = src instanceof ArrayBuffer ? new Uint8Array(src) : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
        this.data = bytes.slice(0, size ?? bytes.length).buffer;
        this.updates++;
    }
    destroy() {}
}

export const gfx = {
    Attribute: class {
        constructor(public name: string, public format: number, public isNormalized = false) {}
    },
    AttributeName: {
        ATTR_POSITION: 'a_position', ATTR_NORMAL: 'a_normal', ATTR_TANGENT: 'a_tangent',
        ATTR_TEX_COORD: 'a_texCoord', ATTR_TEX_COORD1: 'a_texCoord1', ATTR_COLOR: 'a_color',
    },
    Format: { RGB32F: 1, RGBA32F: 2, RG32F: 3, RGBA8: 4 },
    BufferInfo: class {
        constructor(public usage: number, public memUsage: number, public size: number, public stride: number) {}
    },
    BufferUsageBit: { VERTEX: 1, INDEX: 2, TRANSFER_DST: 4 },
    MemoryUsageBit: { DEVICE: 1 },
    PrimitiveMode: { TRIANGLE_LIST: 4 },
    BlendFactor: {
        ZERO: 0, ONE: 1, SRC_ALPHA: 2, DST_ALPHA: 3, ONE_MINUS_SRC_ALPHA: 4, ONE_MINUS_DST_ALPHA: 5,
        SRC_COLOR: 6, DST_COLOR: 7, ONE_MINUS_SRC_COLOR: 8, ONE_MINUS_DST_COLOR: 9,
    },
};

export class RenderingSubMesh {
    destroyed = false;
    constructor(public vertexBuffers: FakeBuffer[], public attributes: any[], public primitiveMode: number, public indexBuffer: FakeBuffer) {}
    destroy() {
        this.destroyed = true;
    }
}

class SubModel {
    inputAssembler: any;
    constructor(public subMesh: RenderingSubMesh, public material: any) {
        this.inputAssembler = { vertexBuffers: subMesh.vertexBuffers, indexBuffer: subMesh.indexBuffer, firstIndex: 0, indexCount: 0, vertexCount: 0 };
    }
}

class SceneModel {
    node: any = null;
    transform: any = null;
    scene: any = null;
    visFlags = 0;
    enabled = false;
    priority = 0;
    subModels: SubModel[] = [];
    bounds: { min: Vec3; max: Vec3 } | null = null;
    destroyed = false;
    initSubModel(i: number, subMesh: RenderingSubMesh, mat: any) {
        this.subModels[i] = new SubModel(subMesh, mat);
    }
    setSubModelMesh(i: number, subMesh: RenderingSubMesh) {
        const mat = this.subModels[i].material;
        this.subModels[i] = new SubModel(subMesh, mat);
    }
    setSubModelMaterial(i: number, mat: any) {
        this.subModels[i].material = mat;
    }
    createBoundingShape(min: Vec3, max: Vec3) {
        this.bounds = { min, max };
    }
    updateWorldBound() {}
}

export class Material {
    constructor(public name = 'material') {}
    initialize(_info: any) {}
}

class MaterialInstance extends Material {
    parent: Material;
    owner: any;
    props: Record<string, any> = {};
    states: any = null;
    destroyed = false;
    constructor(info: { parent: Material; owner?: any; subModelIdx?: number }) {
        super(`${info.parent.name} (instance)`);
        this.parent = info.parent;
        this.owner = info.owner;
    }
    overridePipelineStates(states: any) {
        this.states = states;
    }
    setProperty(name: string, value: any) {
        this.props[name] = value;
    }
    destroy() {
        this.destroyed = true;
        return true;
    }
}

export const renderer = {
    scene: {
        CameraUsage: { SCENE_VIEW: 5 },
        CameraProjection: { ORTHO: 0, PERSPECTIVE: 1 },
        Model: SceneModel,
    },
    MaterialInstance,
};

export class Texture2D {
    constructor(public name = 'texture') {}
}

class SkeletonData {
    _uuid = makeUuid('skeleton');
    name = 'skeleton';
    _skeletonJson: any = null;
    _buffer: ArrayBuffer | null = null;
    atlasText = '';
    textures: Texture2D[] = [];
    textureNames: string[] = [];
    scale = 1;
    get _nativeAsset() {
        return this._buffer;
    }
    set _nativeAsset(v: any) {
        this._buffer = v;
    }
}

export const sp = { SkeletonData };

export class Renderer extends Component {
    protected _materials: (Material | null)[] = [];
    getSharedMaterial(i: number) {
        return this._materials[i] ?? null;
    }
    setSharedMaterial(m: Material | null, i: number) {
        this._materials[i] = m;
        this._onMaterialModified(i, m);
    }
    get sharedMaterials() {
        return this._materials;
    }
    getRenderMaterial(i: number) {
        return this._materials[i] ?? null;
    }
    getMaterialInstance(i: number) {
        return this._materials[i] ?? null;
    }
    get material() {
        return this._materials[0] ?? null;
    }
    protected _onMaterialModified(_i: number, _m: Material | null) {}
}

export class ModelRenderer extends Renderer {
    protected _models: any[] = [];
    protected _visFlags = 0;
    protected _priority = 0;
    get visibility() {
        return this._visFlags;
    }
    get priority() {
        return this._priority;
    }
    _collectModels() {
        return this._models;
    }
    protected onEnable() {}
    protected _attachToScene() {}
    public _detachFromScene() {}
    public _onRebuildPSO(_i: number, _m: any) {}
    protected _onVisibilityChange(_v: number) {}
    protected _updatePriority() {}
}
classes.set('cc.ModelRenderer', ModelRenderer);

export class UITransform extends Component {
    width = 100;
    height = 100;
    anchorX = 0.5;
    anchorY = 0.5;
    setContentSize(w: number, h: number) {
        this.width = w;
        this.height = h;
    }
    setAnchorPoint(x: number, y: number) {
        this.anchorX = x;
        this.anchorY = y;
    }
}
classes.set('cc.UITransform', UITransform);

export class UIMeshRenderer extends Component {
    protected _modelComponent: any = null;
    stencilStage = 0;
    get modelComponent() {
        return this._modelComponent;
    }
    onLoad() {
        if (!this.node.getComponent(UITransform)) this.node.addComponent(UITransform);
        this._modelComponent = this.node.getComponent('cc.ModelRenderer');
    }
    _render(render: any): boolean {
        const m = this._modelComponent;
        if (!m) return false;
        for (const model of m._collectModels()) if (model.enabled) render.commitModel(this, model, m.material);
        return true;
    }
    markForUpdateRenderData() {}
}
classes.set('cc.UIMeshRenderer', UIMeshRenderer);

export enum RealInterpolationMode { LINEAR = 0, CONSTANT = 1, CUBIC = 2 }

/** Piecewise-linear stand-in for the engine's curve. */
export class RealCurve {
    keys: [number, number][] = [];
    addKeyFrame(time: number, value: any) {
        this.keys.push([time, typeof value === 'number' ? value : value.value]);
        this.keys.sort((a, b) => a[0] - b[0]);
        return this.keys.length - 1;
    }
    assignSorted(frames: any) {
        this.keys = [...frames].map(([t, v]: any) => [t, typeof v === 'number' ? v : v.value]);
    }
    evaluate(t: number) {
        const k = this.keys;
        if (!k.length) return 0;
        if (t <= k[0][0]) return k[0][1];
        for (let i = 1; i < k.length; i++) {
            if (t <= k[i][0]) {
                const f = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1);
                return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f;
            }
        }
        return k[k.length - 1][1];
    }
}

export class ColorKey {
    color = new Color();
    time = 0;
}

export class AlphaKey {
    alpha = 255;
    time = 0;
}

export class Gradient {
    colorKeys: ColorKey[] = [];
    alphaKeys: AlphaKey[] = [];
    evaluateFast(out: Color, t: number) {
        const lerpKeys = (keys: any[], get: (k: any) => number[]) => {
            if (!keys.length) return null;
            if (t <= keys[0].time) return get(keys[0]);
            for (let i = 1; i < keys.length; i++) {
                if (t <= keys[i].time) {
                    const f = (t - keys[i - 1].time) / (keys[i].time - keys[i - 1].time || 1);
                    const a = get(keys[i - 1]);
                    const b = get(keys[i]);
                    return a.map((v, j) => v + (b[j] - v) * f);
                }
            }
            return get(keys[keys.length - 1]);
        };
        const rgb = lerpKeys(this.colorKeys, (k) => [k.color.r, k.color.g, k.color.b]) ?? [255, 255, 255];
        const a = lerpKeys(this.alphaKeys, (k) => [k.alpha]) ?? [255];
        out.r = rgb[0];
        out.g = rgb[1];
        out.b = rgb[2];
        out.a = a[0];
        return out;
    }
    evaluate(t: number) {
        return this.evaluateFast(new Color(), t);
    }
}

export class Camera extends Component {
    camera: any = null;
}

export const assetManager = {
    loaded: new Map<string, any>(),
    loadAny(req: any, cb: (err: Error | null, asset: any) => void) {
        const a = this.loaded.get(req.uuid) ?? new Material(req.uuid);
        cb(null, a);
    },
};

const fakeRoot = {
    device: { createBuffer: (info: any) => new FakeBuffer(info) },
    createModel: (C: any) => new C(),
    destroyModel: (m: any) => {
        m.destroyed = true;
    },
};

director.root = fakeRoot;
