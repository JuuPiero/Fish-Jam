import { Collider, Collider2D, Node, RigidBody, RigidBody2D, Vec2, Vec3 } from 'cc';

/** Whether a query reports trigger colliders. */
export enum QueryTriggerInteraction {
    /** Use Physics.queriesHitTriggers (or Physics2D.queriesHitTriggers). */
    UseGlobal = 0,
    Ignore = 1,
    Collide = 2,
}

/**
 * What a 3D ray or shape cast hit. Pass one to Physics.Raycast & co. to have
 * it filled (TypeScript has no `out`), or read the arrays the *All queries
 * return.
 */
export class RaycastHit {
    /** World-space impact point. */
    point: Vec3 = new Vec3();
    /** World-space surface normal at the impact point. */
    normal: Vec3 = new Vec3();
    /** Distance from the ray origin (or how far the cast shape travelled). */
    distance = 0;
    /** The collider that was hit (null when cleared). */
    collider: Collider | null = null;
    /** Triangle index of a mesh hit. Cocos does not report it: always -1. */
    triangleIndex = -1;

    /** The hit collider's RigidBody (it lives on the same node in Cocos), or null. */
    get rigidbody(): RigidBody | null {
        return this.collider ? this.collider.attachedRigidBody : null;
    }

    /** The node of the hit collider (Unity's transform / gameObject). */
    get node(): Node | null {
        return this.collider ? this.collider.node : null;
    }

    /** Same as node: Cocos nodes are both the GameObject and the Transform. */
    get transform(): Node | null {
        return this.node;
    }

    get gameObject(): Node | null {
        return this.node;
    }

    /** Resets to "no hit". */
    clear(): this {
        this.point.set(0, 0, 0);
        this.normal.set(0, 0, 0);
        this.distance = 0;
        this.collider = null;
        this.triangleIndex = -1;
        return this;
    }

    copyFrom(o: RaycastHit): this {
        this.point.set(o.point);
        this.normal.set(o.normal);
        this.distance = o.distance;
        this.collider = o.collider;
        this.triangleIndex = o.triangleIndex;
        return this;
    }

    clone(): RaycastHit {
        return new RaycastHit().copyFrom(this);
    }
}

/**
 * What a 2D query hit. Physics2D.Raycast returns one, or null when nothing
 * was hit, so `if (hit)` works as it does in Unity.
 */
export class RaycastHit2D {
    point: Vec2 = new Vec2();
    normal: Vec2 = new Vec2();
    /** Distance from the origin (or how far the cast shape travelled). */
    distance = 0;
    /** distance / the query's maximum distance. */
    fraction = 0;
    /** Centre of the cast shape at the hit (the hit point for a ray). */
    centroid: Vec2 = new Vec2();
    collider: Collider2D | null = null;

    get rigidbody(): RigidBody2D | null {
        return this.collider ? this.collider.body : null;
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

    clone(): RaycastHit2D {
        const c = new RaycastHit2D();
        c.point.set(this.point);
        c.normal.set(this.normal);
        c.centroid.set(this.centroid);
        c.distance = this.distance;
        c.fraction = this.fraction;
        c.collider = this.collider;
        return c;
    }
}
