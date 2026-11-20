import { _decorator, Component, Node, Prefab, Quat, Vec3 } from 'cc';
import { Coroutine, IteratorLike } from '../core/coroutines';
import { PhysicsMessages, PHYSICS_MESSAGES } from '../physics/PhysicsMessages';
import { Destroy, DontDestroyOnLoad, FindObjectOfType, FindObjectsOfType, Instantiate } from './objects';
import { Space } from './decorators';
import { Tag } from './Tag';
import { coroutines, ensureLoop, frameLoop } from './time';

const { ccclass } = _decorator;

type Ctor<T> = abstract new (...args: any[]) => T;
type CompType<T> = Ctor<T> | string;


/** camelCase Cocos hook <- PascalCase Unity message. */
const HOOKS: string[][] = [
    ['onLoad', 'Awake'],
    ['onEnable', 'OnEnable'],
    ['start', 'Start'],
    ['update', 'Update'],
    ['lateUpdate', 'LateUpdate'],
    ['onDisable', 'OnDisable'],
    ['onDestroy', 'OnDestroy'],
];

const FORWARDERS: { [hook: string]: Function } = {
    onLoad(this: any) { this.Awake(); },
    onEnable(this: any) { this.OnEnable(); },
    start(this: any) { this.Start(); },
    update(this: any, dt: number) { this.Update(dt); },
    lateUpdate(this: any, dt: number) { this.LateUpdate(dt); },
    onDisable(this: any) { this.OnDisable(); },
    onDestroy(this: any) { this.OnDestroy(); },
};

const HOOKED = '__unityStyleHooked__';

/**
 * Gives a MonoBehaviour subclass the Cocos hooks for its Unity messages:
 * Awake -> onLoad, Update(dt) -> update... only where the class has no
 * camelCase hook of its own (a class that defines both gets only the Cocos
 * one, so nothing runs twice). Classes without an Update get no update hook,
 * so Cocos does not schedule them. Done once per class, before the first
 * instance is enabled.
 */
function installHooks(ctor: any): void {
    if (!ctor || ctor === MonoBehaviour || Object.prototype.hasOwnProperty.call(ctor, HOOKED)) return;
    ctor[HOOKED] = true;
    const proto = ctor.prototype;
    for (let i = 0; i < HOOKS.length; i++) {
        const camel = HOOKS[i][0];
        const pascal = HOOKS[i][1];
        if (typeof proto[camel] !== 'function' && typeof proto[pascal] === 'function') proto[camel] = FORWARDERS[camel];
    }
}

function nodeOf(o: Node | Component): Node {
    return o instanceof Node ? o : o.node;
}

function find<T>(node: Node, type: CompType<T>): T | null {
    return node.getComponent(type as any) as T | null;
}

/**
 * Unity's MonoBehaviour on a Cocos Component. Subclass it and write Unity
 * messages (Awake, Start, Update(dt), FixedUpdate, OnCollisionEnter...).
 * `this.node` is both Unity's gameObject and transform.
 *
 * @unityMessages (read by the csharp extension: Awake, Update... of C# subclasses are messages
 * this class calls, not misspelt Cocos hooks)
 */
@ccclass('unity.MonoBehaviour')
export class MonoBehaviour extends Component {
    constructor() {
        super();
        installHooks(this.constructor);
    }

    /** Cocos calls this before onLoad on every component. */
    protected __preload(): void {
        ensureLoop();
        const self: any = this;
        if (typeof self.FixedUpdate === 'function') frameLoop.registerFixed(this);
        for (let i = 0; i < PHYSICS_MESSAGES.length; i++) {
            if (typeof self[PHYSICS_MESSAGES[i]] === 'function') {
                PhysicsMessages.ensureOn(this.node);
                break;
            }
        }
    }

    // ------------------------------------------------------------ GameObject / Transform

    get gameObject(): Node { return this.node; }
    get transform(): Node { return this.node; }

    /** The node's Tag ('Untagged' without one); setting adds a Tag component. */
    get tag(): string { return Tag.of(this.node); }
    set tag(v: string) { Tag.set(this.node, v); }

    CompareTag(tag: string): boolean { return Tag.of(this.node) === tag; }

    get isActiveAndEnabled(): boolean { return this.enabledInHierarchy; }

    /** World position (a copy; assign to move). */
    get position(): Vec3 { return this.node.getWorldPosition(new Vec3()); }
    set position(v: Vec3) { this.node.setWorldPosition(v); }

    get localPosition(): Vec3 { return this.node.getPosition(new Vec3()); }
    set localPosition(v: Vec3) { this.node.setPosition(v); }

    get rotation(): Quat { return this.node.getWorldRotation(new Quat()); }
    set rotation(q: Quat) { this.node.setWorldRotation(q); }

    get localRotation(): Quat { return this.node.getRotation(new Quat()); }
    set localRotation(q: Quat) { this.node.setRotation(q); }

    /** World Euler angles in degrees (Cocos' convention). */
    get eulerAngles(): Vec3 {
        const q = this.node.getWorldRotation(new Quat());
        return Quat.toEuler(new Vec3(), q) as Vec3;
    }
    set eulerAngles(e: Vec3) {
        this.node.setWorldRotationFromEuler(e.x, e.y, e.z);
    }

    get localEulerAngles(): Vec3 { return this.node.eulerAngles.clone(); }
    set localEulerAngles(e: Vec3) { this.node.setRotationFromEuler(e.x, e.y, e.z); }

    get localScale(): Vec3 { return this.node.getScale(new Vec3()); }
    set localScale(v: Vec3) { this.node.setScale(v); }

    get lossyScale(): Vec3 { return this.node.getWorldScale(new Vec3()); }

    /** World forward: -Z, as Cocos' node.forward. */
    get forward(): Vec3 { return this.node.forward; }
    set forward(v: Vec3) { this.node.forward = v; }
    get right(): Vec3 { return this.node.right; }
    get up(): Vec3 { return this.node.up; }

    get parent(): Node | null { return this.node.parent; }
    set parent(p: Node | null) { this.node.setParent(p, true); }

    get childCount(): number { return this.node.children.length; }

    GetChild(index: number): Node { return this.node.children[index]; }

    /** A descendant by path ("Arm/Hand"). */
    Find(path: string): Node | null { return this.node.getChildByPath(path); }

    SetParent(parent: Node | Component | null, worldPositionStays = true): void {
        this.node.setParent(parent ? nodeOf(parent) : null, worldPositionStays);
    }

    GetSiblingIndex(): number { return this.node.getSiblingIndex(); }
    SetSiblingIndex(i: number): void { this.node.setSiblingIndex(i); }
    SetAsFirstSibling(): void { this.node.setSiblingIndex(0); }
    SetAsLastSibling(): void { this.node.setSiblingIndex(Number.MAX_SAFE_INTEGER); }

    /**
     * Moves by a vector or (x, y, z). Space.Self (default) moves along the
     * node's own world-rotated axes, Space.World along world axes.
     */
    Translate(x: Vec3 | number, y?: number | Space, z?: number, relativeTo?: Space): void {
        let v: Vec3;
        let space: Space;
        if (typeof x === 'object') {
            v = new Vec3(x.x, x.y, x.z);
            space = y === undefined ? Space.Self : (y as Space);
        } else {
            v = new Vec3(x, (y as number) || 0, z || 0);
            space = relativeTo === undefined ? Space.Self : relativeTo;
        }
        if (space === Space.Self) Vec3.transformQuat(v, v, this.node.worldRotation);
        const p = this.node.getWorldPosition(new Vec3());
        this.node.setWorldPosition(p.add(v));
    }

    /** Rotates by Euler angles in degrees, a vector or (x, y, z); Space.Self by default. */
    Rotate(x: Vec3 | number, y?: number | Space, z?: number, relativeTo?: Space): void {
        let e: Vec3;
        let space: Space;
        if (typeof x === 'object') {
            e = x;
            space = y === undefined ? Space.Self : (y as Space);
        } else {
            e = new Vec3(x, (y as number) || 0, z || 0);
            space = relativeTo === undefined ? Space.Self : relativeTo;
        }
        const q = Quat.fromEuler(new Quat(), e.x, e.y, e.z);
        this.rotateBy(q, space);
    }

    /** Rotates by `angle` degrees around `axis` (Unity's Rotate(axis, angle, space)). */
    RotateAxis(axis: Readonly<Vec3>, angle: number, relativeTo: Space = Space.Self): void {
        const n = new Vec3(axis.x, axis.y, axis.z).normalize();
        this.rotateBy(Quat.fromAxisAngle(new Quat(), n, (angle * Math.PI) / 180), relativeTo);
    }

    private rotateBy(q: Quat, space: Space): void {
        if (space === Space.Self) {
            const lr = this.node.getRotation(new Quat());
            this.node.setRotation(Quat.multiply(lr, lr, q));
        } else {
            const wr = this.node.getWorldRotation(new Quat());
            this.node.setWorldRotation(Quat.multiply(wr, q, wr));
        }
    }

    /** Orbits around a world point. */
    RotateAround(point: Readonly<Vec3>, axis: Readonly<Vec3>, angle: number): void {
        const q = Quat.fromAxisAngle(new Quat(), new Vec3(axis.x, axis.y, axis.z).normalize(), (angle * Math.PI) / 180);
        const p = this.node.getWorldPosition(new Vec3());
        const rel = Vec3.subtract(new Vec3(), p, point);
        Vec3.transformQuat(rel, rel, q);
        this.node.setWorldPosition(Vec3.add(rel, rel, point));
        const wr = this.node.getWorldRotation(new Quat());
        this.node.setWorldRotation(Quat.multiply(wr, q, wr));
    }

    /** Turns the node's forward (-Z) toward a node or point. */
    LookAt(target: Node | Component | Readonly<Vec3>, worldUp?: Readonly<Vec3>): void {
        const pos = target instanceof Node || target instanceof Component ? nodeOf(target).worldPosition : target;
        this.node.lookAt(pos, worldUp);
    }

    TransformPoint(p: Readonly<Vec3>): Vec3 {
        return Vec3.transformMat4(new Vec3(), p, this.node.worldMatrix);
    }

    InverseTransformPoint(p: Readonly<Vec3>): Vec3 {
        return this.node.inverseTransformPoint(new Vec3(), p as Vec3);
    }

    /** Rotation only (no scale), like Unity. */
    TransformDirection(d: Readonly<Vec3>): Vec3 {
        return Vec3.transformQuat(new Vec3(), d, this.node.worldRotation);
    }

    InverseTransformDirection(d: Readonly<Vec3>): Vec3 {
        return Vec3.transformQuat(new Vec3(), d, Quat.invert(new Quat(), this.node.worldRotation));
    }

    // ------------------------------------------------------------ components

    GetComponent<T extends Component>(type: CompType<T>): T | null {
        return find(this.node, type);
    }

    GetComponents<T extends Component>(type: CompType<T>): T[] {
        return this.node.getComponents(type as any) as T[];
    }

    /** Fills result.value; true when found (Unity's TryGetComponent(out T)). */
    TryGetComponent<T extends Component>(type: CompType<T>, result?: { value: T | null }): boolean {
        const c = find(this.node, type);
        if (result) result.value = c;
        return !!c;
    }

    AddComponent<T extends Component>(type: Ctor<T>): T {
        return this.node.addComponent(type as any) as T;
    }

    /** On this node or a descendant, depth first; inactive nodes are skipped unless includeInactive. */
    GetComponentInChildren<T extends Component>(type: CompType<T>, includeInactive = false): T | null {
        return MonoBehaviour.inChildren(this.node, type, includeInactive);
    }

    GetComponentsInChildren<T extends Component>(type: CompType<T>, includeInactive = false): T[] {
        const out: T[] = [];
        MonoBehaviour.allInChildren(this.node, type, includeInactive, out);
        return out;
    }

    /** On this node or an ancestor. */
    GetComponentInParent<T extends Component>(type: CompType<T>, includeInactive = false): T | null {
        for (let n: Node | null = this.node; n; n = n.parent) {
            if (!includeInactive && !n.activeInHierarchy) continue;
            const c = find(n, type);
            if (c) return c;
        }
        return null;
    }

    GetComponentsInParent<T extends Component>(type: CompType<T>, includeInactive = false): T[] {
        const out: T[] = [];
        for (let n: Node | null = this.node; n; n = n.parent) {
            if (!includeInactive && !n.activeInHierarchy) continue;
            const cs = n.getComponents(type as any) as T[];
            for (let i = 0; i < cs.length; i++) out.push(cs[i]);
        }
        return out;
    }

    static inChildren<T>(node: Node, type: CompType<T>, includeInactive: boolean): T | null {
        if (!includeInactive && !node.activeInHierarchy) return null;
        const c = find(node, type);
        if (c) return c;
        const ch = node.children;
        for (let i = 0; i < ch.length; i++) {
            const r = MonoBehaviour.inChildren(ch[i], type, includeInactive);
            if (r) return r;
        }
        return null;
    }

    static allInChildren<T>(node: Node, type: CompType<T>, includeInactive: boolean, out: T[]): void {
        if (!includeInactive && !node.activeInHierarchy) return;
        const cs = node.getComponents(type as any) as any[];
        for (let i = 0; i < cs.length; i++) out.push(cs[i]);
        const ch = node.children;
        for (let i = 0; i < ch.length; i++) MonoBehaviour.allInChildren(ch[i], type, includeInactive, out);
    }

    // ------------------------------------------------------------ messages

    /** Calls `methodName(value)` on every component of this node that has it. */
    SendMessage(methodName: string, value?: any): void {
        MonoBehaviour.sendTo(this.node, methodName, value);
    }

    /** This node and its descendants. */
    BroadcastMessage(methodName: string, value?: any): void {
        const visit = (n: Node): void => {
            MonoBehaviour.sendTo(n, methodName, value);
            const ch = n.children.slice();
            for (let i = 0; i < ch.length; i++) visit(ch[i]);
        };
        visit(this.node);
    }

    /** This node and its ancestors. */
    SendMessageUpwards(methodName: string, value?: any): void {
        for (let n: Node | null = this.node; n; n = n.parent) MonoBehaviour.sendTo(n, methodName, value);
    }

    static sendTo(node: Node, methodName: string, value: any): void {
        const cs = node.components.slice();
        for (let i = 0; i < cs.length; i++) {
            const c: any = cs[i];
            if (typeof c[methodName] === 'function') c[methodName](value);
        }
    }

    // ------------------------------------------------------------ Invoke

    /** Calls a method (by name, or a function) after `time` seconds of scaled time. */
    Invoke(method: string | (() => void), time = 0): void {
        const fn = this.callable(method);
        if (fn) frameLoop.addTimer(this, method, fn, time, 0);
    }

    /** First after `time`, then every `repeatRate` seconds. */
    InvokeRepeating(method: string | (() => void), time: number, repeatRate: number): void {
        const fn = this.callable(method);
        if (!fn) return;
        if (!(repeatRate > 0)) {
            console.error('[unity-style] InvokeRepeating: repeatRate must be > 0');
            return;
        }
        frameLoop.addTimer(this, method, fn, time, repeatRate);
    }

    /** All invokes of this behaviour, or the ones of a method. */
    CancelInvoke(method?: string | (() => void)): void {
        frameLoop.cancelTimers(this, method);
    }

    IsInvoking(method?: string | (() => void)): boolean {
        return frameLoop.hasTimer(this, method);
    }

    private callable(method: string | (() => void)): (() => void) | null {
        if (typeof method === 'function') return () => method.call(this);
        const self: any = this;
        if (typeof self[method] !== 'function') {
            console.error('[unity-style] ' + method + ' is not a method of ' + this.name);
            return null;
        }
        return () => self[method]();
    }

    // ------------------------------------------------------------ coroutines

    /**
     * Runs a coroutine: a generator object (StartCoroutine(this.Fade())),
     * a generator method name (StartCoroutine('Fade', arg)) or a function
     * returning one. It runs to its first yield now. It stops when this
     * behaviour is destroyed or its node is deactivated (not when it is
     * only disabled), as in Unity.
     */
    StartCoroutine(routine: IteratorLike | string | (() => IteratorLike), value?: any): Coroutine | null {
        ensureLoop();
        let it: IteratorLike | null = null;
        let name = '';
        const self: any = this;
        if (typeof routine === 'string') {
            name = routine;
            if (typeof self[routine] !== 'function') {
                console.error('[unity-style] StartCoroutine: ' + routine + ' is not a method of ' + this.name);
                return null;
            }
            it = self[routine](value);
        } else if (typeof routine === 'function') {
            it = (routine as () => IteratorLike).call(this);
        } else {
            it = routine;
        }
        if (!it || typeof it.next !== 'function') {
            console.error('[unity-style] StartCoroutine needs an iterator (a generator: function* ...).');
            return null;
        }
        return coroutines.start(this, it, name);
    }

    /** Stops one coroutine: the Coroutine returned by StartCoroutine, its iterator, or its method name. */
    StopCoroutine(routine: Coroutine | IteratorLike | string | null): void {
        if (!routine) return;
        if (routine instanceof Coroutine) coroutines.stop(routine);
        else coroutines.stopMatching(this, routine);
    }

    StopAllCoroutines(): void {
        coroutines.stopAll(this);
    }

    /**
     * A promise resolved after `seconds` of scaled time (paused while the node
     * is inactive, never resolved if this behaviour is destroyed). For async
     * code: `await this.Delay(0.5)` (C# async methods too).
     */
    Delay(seconds: number): Promise<void> {
        return new Promise<void>((resolve) => frameLoop.addTimer(this, resolve, () => resolve(), seconds, 0));
    }

    // ------------------------------------------------------------ Object statics, as inherited members

    Destroy(obj: Node | Component | null | undefined, t = 0): void { Destroy(obj, t); }
    Instantiate<T extends Node | Component | Prefab>(original: T, a?: Node | Vec3 | null, b?: Quat | boolean, c?: Node | null): T extends Prefab ? Node : T { return Instantiate(original, a, b, c); }
    DontDestroyOnLoad(target: Node | Component): void { DontDestroyOnLoad(target); }
    FindObjectOfType<T extends Component>(type: Ctor<T>, includeInactive = false): T | null { return FindObjectOfType(type, includeInactive); }
    FindObjectsOfType<T extends Component>(type: Ctor<T>, includeInactive = false): T[] { return FindObjectsOfType(type, includeInactive); }

    /** Unity's MonoBehaviour.print. */
    print(message: any): void {
        console.log(message);
    }
}
