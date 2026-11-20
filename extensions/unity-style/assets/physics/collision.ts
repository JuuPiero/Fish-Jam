import { Collider, Collider2D, ICollisionEvent, IPhysics2DContact, Node, RigidBody, RigidBody2D, Vec2, Vec3 } from 'cc';

/** One contact of a 3D collision, from the receiving collider's side. */
export class ContactPoint {
    point: Vec3 = new Vec3();
    /** Points away from the other collider, into this one. */
    normal: Vec3 = new Vec3();
    /** Penetration as a negative distance (0 when the backend gives no depth). */
    separation = 0;
    /** Not reported by Cocos: zero. */
    impulse: Vec3 = new Vec3();
    thisCollider: Collider | null = null;
    otherCollider: Collider | null = null;
}

/**
 * Unity's Collision, built from a Cocos collision event for the receiving
 * collider. Data is copied (Cocos reuses its event objects).
 */
export class Collision {
    /** The other collider. */
    collider: Collider | null = null;
    /** The receiving collider. */
    thisCollider: Collider | null = null;
    contacts: ContactPoint[] = [];
    /** Other body's velocity minus this body's, before the step when known (see README). */
    relativeVelocity: Vec3 = new Vec3();
    /** Not reported by Cocos: zero. */
    impulse: Vec3 = new Vec3();

    get rigidbody(): RigidBody | null {
        return this.collider ? this.collider.attachedRigidBody : null;
    }

    get node(): Node | null {
        return this.collider ? this.collider.node : null;
    }

    get transform(): Node | null {
        return this.node;
    }

    get gameObject(): Node | null {
        return this.node;
    }

    get contactCount(): number {
        return this.contacts.length;
    }

    GetContact(index: number): ContactPoint {
        return this.contacts[index];
    }

    /** Copies the contacts into `out`; returns the count. */
    GetContacts(out: ContactPoint[]): number {
        for (let i = 0; i < this.contacts.length; i++) out[i] = this.contacts[i];
        return this.contacts.length;
    }
}

const _a = new Vec3();
const _b = new Vec3();

export function makeCollision(e: ICollisionEvent, self: Collider, other: Collider, velSelf: Readonly<Vec3>, velOther: Readonly<Vec3>): Collision {
    const c = new Collision();
    c.collider = other;
    c.thisCollider = self;
    Vec3.subtract(c.relativeVelocity, velOther, velSelf);
    const list = e && e.contacts ? e.contacts : [];
    for (let i = 0; i < list.length; i++) {
        const k = list[i];
        const p = new ContactPoint();
        p.thisCollider = self;
        p.otherCollider = other;
        // a contact's A side is the event's self collider when isBodyA
        const selfIsA = k.isBodyA;
        if (selfIsA) {
            k.getWorldPointOnB(_b);
            k.getWorldPointOnA(_a);
            k.getWorldNormalOnB(p.normal);
        } else {
            k.getWorldPointOnA(_b);
            k.getWorldPointOnB(_a);
            k.getWorldNormalOnA(p.normal);
        }
        // point: on the other collider's surface; separation from the two surface points along the normal
        p.point.set(_b);
        p.separation = Math.min(0, Vec3.dot(Vec3.subtract(new Vec3(), _a, _b), p.normal));
        p.normal.normalize();
        c.contacts.push(p);
    }
    return c;
}

/** One contact of a 2D collision. */
export class ContactPoint2D {
    point: Vec2 = new Vec2();
    /** Points away from the other collider, into this one. */
    normal: Vec2 = new Vec2();
    separation = 0;
    normalImpulse = 0;
    tangentImpulse = 0;
    relativeVelocity: Vec2 = new Vec2();
    /** The other collider (Unity's naming). */
    collider: Collider2D | null = null;
    /** The receiving collider. */
    otherCollider: Collider2D | null = null;

    get rigidbody(): RigidBody2D | null {
        return this.collider ? this.collider.body : null;
    }

    get otherRigidbody(): RigidBody2D | null {
        return this.otherCollider ? this.otherCollider.body : null;
    }
}

/**
 * Unity's Collision2D. As in Unity, `collider` is the other collider and
 * `otherCollider` the receiving one.
 */
export class Collision2D {
    collider: Collider2D | null = null;
    otherCollider: Collider2D | null = null;
    contacts: ContactPoint2D[] = [];
    relativeVelocity: Vec2 = new Vec2();
    enabled = true;

    get rigidbody(): RigidBody2D | null {
        return this.collider ? this.collider.body : null;
    }

    get otherRigidbody(): RigidBody2D | null {
        return this.otherCollider ? this.otherCollider.body : null;
    }

    get node(): Node | null {
        return this.collider ? this.collider.node : null;
    }

    get transform(): Node | null {
        return this.node;
    }

    get gameObject(): Node | null {
        return this.node;
    }

    get contactCount(): number {
        return this.contacts.length;
    }

    GetContact(index: number): ContactPoint2D {
        return this.contacts[index];
    }

    GetContacts(out: ContactPoint2D[]): number {
        for (let i = 0; i < this.contacts.length; i++) out[i] = this.contacts[i];
        return this.contacts.length;
    }
}

function vel2(c: Collider2D | null): Vec2 {
    const b = c ? c.body : null;
    return b ? b.linearVelocity.clone() : new Vec2();
}

export function makeCollision2D(self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null | undefined): Collision2D {
    const c = new Collision2D();
    c.collider = other;
    c.otherCollider = self;
    const vs = vel2(self);
    const vo = vel2(other);
    c.relativeVelocity.set(vo.x - vs.x, vo.y - vs.y);
    if (contact && typeof contact.getWorldManifold === 'function') {
        let wm: any = null;
        try {
            wm = contact.getWorldManifold();
        } catch (e) {
            wm = null;
        }
        if (wm && wm.points) {
            // Box2D's manifold normal points from A to B
            const sign = contact.colliderA === self ? -1 : 1;
            let imp: any = null;
            try {
                imp = contact.getImpulse ? contact.getImpulse() : null;
            } catch (e) {
                imp = null;
            }
            for (let i = 0; i < wm.points.length; i++) {
                const p = new ContactPoint2D();
                p.point.set(wm.points[i].x, wm.points[i].y);
                p.normal.set(wm.normal.x * sign, wm.normal.y * sign);
                p.separation = wm.separations && typeof wm.separations[i] === 'number' ? wm.separations[i] : 0;
                if (imp && imp.normalImpulses) {
                    p.normalImpulse = imp.normalImpulses[i] || 0;
                    p.tangentImpulse = imp.tangentImpulses ? imp.tangentImpulses[i] || 0 : 0;
                }
                p.relativeVelocity.set(c.relativeVelocity);
                p.collider = other;
                p.otherCollider = self;
                c.contacts.push(p);
            }
        }
    }
    return c;
}
