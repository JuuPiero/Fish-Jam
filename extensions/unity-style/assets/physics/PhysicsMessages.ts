import { _decorator, Collider, Collider2D, Component, Contact2DType, director, Director, ICollisionEvent, IPhysics2DContact, ITriggerEvent, Node, RigidBody, Vec3 } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { makeCollision, makeCollision2D } from './collision';
import { Physics } from './physics';
import { Physics2D } from './physics-2d';
import { Time } from '../engine/time';

const { ccclass, menu, disallowMultiple } = _decorator;

/** The Unity message names this component sends. */
export const PHYSICS_MESSAGES = [
    'OnCollisionEnter', 'OnCollisionStay', 'OnCollisionExit',
    'OnTriggerEnter', 'OnTriggerStay', 'OnTriggerExit',
    'OnCollisionEnter2D', 'OnCollisionStay2D', 'OnCollisionExit2D',
    'OnTriggerEnter2D', 'OnTriggerStay2D', 'OnTriggerExit2D',
];

const EVENTS_3D = ['onCollisionEnter', 'onCollisionStay', 'onCollisionExit', 'onTriggerEnter', 'onTriggerStay', 'onTriggerExit'];
const NAMES_3D = ['OnCollisionEnter', 'OnCollisionStay', 'OnCollisionExit', 'OnTriggerEnter', 'OnTriggerStay', 'OnTriggerExit'];

/** Does any component of the node define a Unity physics message? */
export function wantsPhysicsMessages(node: Node): boolean {
    const comps = node.components;
    for (let i = 0; i < comps.length; i++) {
        const c: any = comps[i];
        for (let j = 0; j < PHYSICS_MESSAGES.length; j++) if (typeof c[PHYSICS_MESSAGES[j]] === 'function') return true;
    }
    return false;
}

function hasCollider(node: Node): boolean {
    return (!!Collider && !!node.getComponent(Collider)) || (!!Collider2D && !!node.getComponent(Collider2D));
}

interface Active2D {
    self: Collider2D;
    other: Collider2D;
    trigger: boolean;
}

/**
 * Sends Unity's collision and trigger messages to the other components of
 * its node: OnCollisionEnter/Stay/Exit(collision), OnTriggerEnter/Stay/Exit(other)
 * and the 2D versions. Any component can implement them; no base class needed.
 *
 * Added automatically (in play mode) to nodes with a collider and a
 * component that defines one of the messages: when a MonoBehaviour loads,
 * and by a scene scan (PhysicsMessages.autoAttach). Add it yourself for
 * full control.
 *
 * As in Unity, messages also reach disabled components.
 */
@ccclass('unity.PhysicsMessages')
@menu('Physics/Physics Messages')
@disallowMultiple
export class PhysicsMessages extends Component {
    /** Scan the scene for nodes that need this component (play mode only). */
    static autoAttach = true;
    /** Seconds between scene scans (0: only at scene launch and MonoBehaviour load). */
    static autoAttachInterval = 0.5;

    private bound3D: Collider[] = [];
    private bound2D: Collider2D[] = [];
    private active2D: Active2D[] = [];
    /** Body velocity before the physics step, for relativeVelocity. */
    readonly preStepVelocity = new Vec3();

    /** Adds the component when the node has a collider and a receiver (not in the editor's scene view). */
    static ensureOn(node: Node): PhysicsMessages | null {
        if (EDITOR_NOT_IN_PREVIEW || !node || !node.isValid) return null;
        const have = node.getComponent(PhysicsMessages);
        if (have) return have;
        if (!hasCollider(node) || !wantsPhysicsMessages(node)) return null;
        return node.addComponent(PhysicsMessages);
    }

    onEnable(): void {
        this.refresh();
        hookDirector();
        if (enabledList.indexOf(this) < 0) enabledList.push(this);
    }

    onDisable(): void {
        this.unbind();
        const i = enabledList.indexOf(this);
        if (i >= 0) enabledList.splice(i, 1);
    }

    /** Re-binds to the node's colliders (call after adding colliders at run time). */
    refresh(): void {
        this.unbind();
        if (Collider) {
            const cols = this.node.getComponents(Collider);
            for (let i = 0; i < cols.length; i++) {
                for (let k = 0; k < EVENTS_3D.length; k++) cols[i].on(EVENTS_3D[k] as any, this.on3D, this);
                this.bound3D.push(cols[i]);
            }
        }
        if (Collider2D) {
            const cols = this.node.getComponents(Collider2D);
            for (let i = 0; i < cols.length; i++) {
                const c = cols[i];
                c.on(Contact2DType.BEGIN_CONTACT, this.onBegin2D, this);
                c.on(Contact2DType.END_CONTACT, this.onEnd2D, this);
                if (c.body) c.body.enabledContactListener = true;
                this.bound2D.push(c);
            }
        }
    }

    private unbind(): void {
        for (let i = 0; i < this.bound3D.length; i++) {
            const c = this.bound3D[i];
            if (!c.isValid) continue;
            for (let k = 0; k < EVENTS_3D.length; k++) c.off(EVENTS_3D[k] as any, this.on3D, this);
        }
        for (let i = 0; i < this.bound2D.length; i++) {
            const c = this.bound2D[i];
            if (!c.isValid) continue;
            c.off(Contact2DType.BEGIN_CONTACT, this.onBegin2D, this);
            c.off(Contact2DType.END_CONTACT, this.onEnd2D, this);
        }
        this.bound3D.length = 0;
        this.bound2D.length = 0;
        this.active2D.length = 0;
    }

    /** Calls `method(arg)` on every other component of the node. */
    send(method: string, arg: any): void {
        const comps = this.node.components.slice();
        for (let i = 0; i < comps.length; i++) {
            const c: any = comps[i];
            if (c === this || !c.isValid || typeof c[method] !== 'function') continue;
            try {
                c[method](arg);
            } catch (e) {
                console.error(e);
            }
        }
    }

    private on3D(e: ICollisionEvent | ITriggerEvent): void {
        const self = e.selfCollider;
        const other = e.otherCollider;
        if (!self || !other || Physics.GetIgnoreCollision(self, other)) return;
        const name = NAMES_3D[EVENTS_3D.indexOf(e.type)];
        if (!name) return;
        if (name.indexOf('OnTrigger') === 0) {
            this.send(name, other);
            return;
        }
        const otherMsgs = other.node.getComponent(PhysicsMessages);
        const vOther = otherMsgs ? otherMsgs.preStepVelocity : velocityOf(other.attachedRigidBody);
        this.send(name, makeCollision(e as ICollisionEvent, self, other, this.preStepVelocity, vOther));
    }

    private onBegin2D(self: Collider2D, other: Collider2D, contact?: IPhysics2DContact | null): void {
        if (!self || !other || Physics2D.GetIgnoreCollision(self, other)) return;
        const trigger = self.sensor || other.sensor;
        for (let i = 0; i < this.active2D.length; i++) {
            const a = this.active2D[i];
            if (a.self === self && a.other === other) return; // one Enter per pair (Box2D reports per fixture)
        }
        this.active2D.push({ self, other, trigger });
        if (trigger) this.send('OnTriggerEnter2D', other);
        else this.send('OnCollisionEnter2D', makeCollision2D(self, other, contact));
    }

    private onEnd2D(self: Collider2D, other: Collider2D, contact?: IPhysics2DContact | null): void {
        for (let i = 0; i < this.active2D.length; i++) {
            const a = this.active2D[i];
            if (a.self !== self || a.other !== other) continue;
            this.active2D.splice(i, 1);
            if (Physics2D.GetIgnoreCollision(self, other)) return;
            if (a.trigger) this.send('OnTriggerExit2D', other);
            else this.send('OnCollisionExit2D', makeCollision2D(self, other, contact));
            return;
        }
    }

    /** 2D Stay messages (Box2D has no stay event): once a frame for each touching pair. */
    lateUpdate(): void {
        for (let i = this.active2D.length - 1; i >= 0; i--) {
            const a = this.active2D[i];
            if (!a.self.isValid || !a.other.isValid || !a.other.enabledInHierarchy) {
                this.active2D.splice(i, 1);
                continue;
            }
            if (Physics2D.GetIgnoreCollision(a.self, a.other)) continue;
            if (a.trigger) this.send('OnTriggerStay2D', a.other);
            else this.send('OnCollisionStay2D', makeCollision2D(a.self, a.other, null));
        }
    }

    /** @internal */
    capturePreStep(): void {
        const rb = RigidBody ? this.node.getComponent(RigidBody) : null;
        if (rb && rb.isValid) rb.getLinearVelocity(this.preStepVelocity);
        else this.preStepVelocity.set(0, 0, 0);
    }
}

function velocityOf(rb: RigidBody | null): Vec3 {
    const v = new Vec3();
    if (rb && rb.isValid) rb.getLinearVelocity(v);
    return v;
}

const enabledList: PhysicsMessages[] = [];
let hooked = false;
let scanClock = 0;

function scan(): void {
    if (!PhysicsMessages.autoAttach || EDITOR_NOT_IN_PREVIEW) return;
    const scene = director.getScene();
    if (!scene) return;
    const visit = (n: Node): void => {
        if (!n.activeInHierarchy) return;
        if (!n.getComponent(PhysicsMessages) && hasCollider(n) && wantsPhysicsMessages(n)) n.addComponent(PhysicsMessages);
        const ch = n.children;
        for (let i = 0; i < ch.length; i++) visit(ch[i]);
    };
    visit(scene);
}

function hookDirector(): void {
    if (hooked) return;
    hooked = true;
    director.on(Director.EVENT_BEFORE_PHYSICS, () => {
        for (let i = 0; i < enabledList.length; i++) enabledList[i].capturePreStep();
    });
}

/** Installs the scene scan (called once by the package index in play mode). */
export function installAutoAttach(): void {
    if (EDITOR_NOT_IN_PREVIEW) return;
    hookDirector();
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, scan);
    director.on(Director.EVENT_AFTER_UPDATE, () => {
        const iv = PhysicsMessages.autoAttachInterval;
        if (!(iv > 0)) return;
        scanClock += Time.unscaledDeltaTime;
        if (scanClock < iv) return;
        scanClock = 0;
        scan();
    });
}
