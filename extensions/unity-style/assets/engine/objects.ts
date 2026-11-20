import {
    BoxCollider, CapsuleCollider, Component, CylinderCollider, director, EffectAsset, find, instantiate, Material, MeshRenderer, Node, Prefab, primitives, Quat,
    SphereCollider, utils, Vec3,
} from 'cc';
import { Tag } from './Tag';
import { frameLoop } from './time';

type Ctor<T> = abstract new (...args: any[]) => T;

/** Unity's PrimitiveType (GameObject.CreatePrimitive). */
export enum PrimitiveType {
    Sphere = 0,
    Capsule = 1,
    Cylinder = 2,
    Cube = 3,
    Plane = 4,
    Quad = 5,
}

function nodeOf(o: Node | Component): Node {
    return o instanceof Node ? o : o.node;
}

function walk(root: Node, includeInactive: boolean, visit: (n: Node) => boolean): boolean {
    if (!includeInactive && !root.activeInHierarchy) return false;
    if (visit(root)) return true;
    const ch = root.children;
    for (let i = 0; i < ch.length; i++) {
        const c = ch[i];
        if (!includeInactive && !c.active) continue;
        if (walk(c, includeInactive, visit)) return true;
    }
    return false;
}

/**
 * Destroys a node or component, after `t` seconds of scaled time when given.
 * As in Unity (and Cocos) the object goes away at the end of the frame.
 */
export function Destroy(obj: Node | Component | null | undefined, t = 0): void {
    if (!obj || !obj.isValid) return;
    if (t > 0) {
        frameLoop.addTimer(null, obj, () => {
            if (obj.isValid) obj.destroy();
        }, t, 0);
        return;
    }
    obj.destroy();
}

/** Cocos has no immediate destroy for user code: this is Destroy(obj) (end of frame). */
export function DestroyImmediate(obj: Node | Component | null | undefined): void {
    Destroy(obj, 0);
}

/**
 * Clones a prefab, node or component (returning the clone's matching component).
 *   Instantiate(original)                         at the original's world pose, in the scene root
 *   Instantiate(original, parent)                 under parent (local pose kept)
 *   Instantiate(original, parent, true)           under parent, world pose kept
 *   Instantiate(original, position, rotation)     in the scene root
 *   Instantiate(original, position, rotation, parent)
 */
export function Instantiate<T extends Node | Component | Prefab>(original: T, a?: Node | Vec3 | null, b?: Quat | boolean, c?: Node | null): T extends Prefab ? Node : T {
    let srcNode: Node | null = null;
    let comp: Component | null = null;
    let made: Node;
    if (original instanceof Prefab) {
        made = instantiate(original);
    } else if (original instanceof Component) {
        comp = original;
        srcNode = original.node;
        made = instantiate(srcNode);
    } else {
        srcNode = original as Node;
        made = instantiate(srcNode);
    }
    let parent: Node | null = null;
    let pos: Vec3 | null = null;
    let rot: Quat | null = null;
    let worldStays = false;
    if (a instanceof Node) {
        parent = a;
        worldStays = b === true;
    } else if (a && typeof (a as any).x === 'number') {
        pos = a as Vec3;
        rot = b && typeof b === 'object' ? (b as Quat) : null;
        parent = c || null;
    } else if (a === null || a === undefined) {
        worldStays = !!srcNode;
    }
    const target = parent || director.getScene();
    if (target) target.addChild(made);
    if (worldStays && srcNode) {
        made.setWorldPosition(srcNode.worldPosition);
        made.setWorldRotation(srcNode.worldRotation);
        made.setWorldScale(srcNode.worldScale);
    }
    if (pos) made.setWorldPosition(pos);
    if (rot) made.setWorldRotation(rot);
    if (comp && srcNode) {
        const ctor = comp.constructor as Ctor<Component>;
        const idx = srcNode.getComponents(ctor).indexOf(comp);
        const list = made.getComponents(ctor);
        return (list[idx >= 0 ? idx : 0] || null) as any;
    }
    return made as any;
}

/** Keeps the node across scene loads (moved to the scene root first, as Unity requires a root). */
export function DontDestroyOnLoad(target: Node | Component): void {
    const node = nodeOf(target);
    const scene = director.getScene();
    if (scene && node.parent && node.parent !== scene) {
        const p = node.worldPosition.clone();
        const r = node.worldRotation.clone();
        const s = node.worldScale.clone();
        node.setParent(scene);
        node.setWorldPosition(p);
        node.setWorldRotation(r);
        node.setWorldScale(s);
    }
    director.addPersistRootNode(node);
}

/** The first component of a type in the scene (active nodes only unless includeInactive). */
export function FindObjectOfType<T extends Component>(type: Ctor<T>, includeInactive = false): T | null {
    const scene = director.getScene();
    if (!scene) return null;
    let found: T | null = null;
    walk(scene, includeInactive, (n) => {
        const c = n.getComponent(type as any) as T | null;
        if (c) {
            found = c;
            return true;
        }
        return false;
    });
    return found;
}

export function FindObjectsOfType<T extends Component>(type: Ctor<T>, includeInactive = false): T[] {
    const scene = director.getScene();
    const out: T[] = [];
    if (!scene) return out;
    walk(scene, includeInactive, (n) => {
        const cs = n.getComponents(type as any) as T[];
        for (let i = 0; i < cs.length; i++) out.push(cs[i]);
        return false;
    });
    return out;
}

/** Unity 2023 names. */
export const FindFirstObjectByType = FindObjectOfType;
export const FindAnyObjectByType = FindObjectOfType;
export const FindObjectsByType = FindObjectsOfType;

/** Unity's Object statics in one place (Object itself would shadow JavaScript's Object). */
export class UnityObject {
    static Destroy = Destroy;
    static DestroyImmediate = DestroyImmediate;
    static Instantiate = Instantiate;
    static DontDestroyOnLoad = DontDestroyOnLoad;
    static FindObjectOfType = FindObjectOfType;
    static FindObjectsOfType = FindObjectsOfType;
    static FindFirstObjectByType = FindObjectOfType;
    static FindAnyObjectByType = FindObjectOfType;
    static FindObjectsByType = FindObjectsOfType;
}

let litMaterial: Material | null = null;

/** GameObject.defaultMaterial, else a builtin-standard material made once, else null (Cocos shows its missing material). */
function primitiveMaterial(): Material | null {
    if (GameObject.defaultMaterial) return GameObject.defaultMaterial;
    if (litMaterial) return litMaterial;
    try {
        if (EffectAsset.get('builtin-standard')) {
            const m = new Material();
            m.initialize({ effectName: 'builtin-standard' });
            litMaterial = m;
        }
    } catch (e) {
        litMaterial = null;
    }
    return litMaterial;
}

/** Unity's GameObject statics. A Cocos Node is the GameObject (and the Transform). */
export class GameObject {
    /** Material for CreatePrimitive (default: a builtin-standard material). */
    static defaultMaterial: Material | null = null;

    /**
     * A node by name anywhere in the scene (active nodes only), or by path
     * when the name has a '/' ("Canvas/Panel/Button", from the scene root).
     */
    static Find(name: string): Node | null {
        const scene = director.getScene();
        if (!scene) return null;
        if (name.indexOf('/') >= 0) {
            const n = find(name.charAt(0) === '/' ? name.substring(1) : name, scene);
            return n && n.activeInHierarchy ? n : null;
        }
        let found: Node | null = null;
        walk(scene, false, (n) => {
            if (n !== scene && n.name === name) {
                found = n;
                return true;
            }
            return false;
        });
        return found;
    }

    /** First active node with the tag (see Tag). */
    static FindWithTag(tag: string): Node | null {
        const r = Tag.nodesWith(tag);
        return r.length ? r[0] : null;
    }

    static FindGameObjectWithTag(tag: string): Node | null {
        return GameObject.FindWithTag(tag);
    }

    static FindGameObjectsWithTag(tag: string): Node[] {
        return Tag.nodesWith(tag);
    }

    /** A new node in the scene root (Unity's new GameObject(name, components)). */
    static Create(name = 'New Node', components?: Ctor<Component>[]): Node {
        const n = new Node(name);
        const scene = director.getScene();
        if (scene) scene.addChild(n);
        if (components) for (let i = 0; i < components.length; i++) n.addComponent(components[i] as any);
        return n;
    }

    /**
     * A node with a primitive mesh (Unity's sizes: 1 m cube, 0.5 radius sphere,
     * 2 m capsule and cylinder, 10 m plane, 1 m quad), the builtin default
     * material, and a matching 3D collider when 3D physics is in the build.
     */
    static CreatePrimitive(type: PrimitiveType): Node {
        const names = ['Sphere', 'Capsule', 'Cylinder', 'Cube', 'Plane', 'Quad'];
        const n = GameObject.Create(names[type] || 'Primitive');
        const p: any = primitives;
        let geo: any;
        if (type === PrimitiveType.Sphere) geo = p.sphere(0.5);
        else if (type === PrimitiveType.Capsule) geo = p.capsule(0.5, 0.5, 2);
        else if (type === PrimitiveType.Cylinder) geo = p.cylinder(0.5, 0.5, 2);
        else if (type === PrimitiveType.Plane) geo = p.plane({ width: 10, length: 10 });
        else if (type === PrimitiveType.Quad) geo = p.quad();
        else geo = p.box({ width: 1, height: 1, length: 1 });
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = utils.MeshUtils ? utils.MeshUtils.createMesh(geo) : (utils as any).createMesh(geo);
        const mat = primitiveMaterial();
        if (mat) mr.setSharedMaterial(mat, 0);
        try {
            if (type === PrimitiveType.Sphere && SphereCollider) n.addComponent(SphereCollider).radius = 0.5;
            else if (type === PrimitiveType.Capsule && CapsuleCollider) {
                const c = n.addComponent(CapsuleCollider);
                c.radius = 0.5;
                c.cylinderHeight = 1;
            } else if (type === PrimitiveType.Cylinder && CylinderCollider) {
                const c = n.addComponent(CylinderCollider);
                c.radius = 0.5;
                c.height = 2;
            } else if (type === PrimitiveType.Cube && BoxCollider) n.addComponent(BoxCollider).size = new Vec3(1, 1, 1);
            else if (type === PrimitiveType.Plane && BoxCollider) n.addComponent(BoxCollider).size = new Vec3(10, 0.001, 10);
            else if (type === PrimitiveType.Quad && BoxCollider) n.addComponent(BoxCollider).size = new Vec3(1, 1, 0.001);
        } catch (e) {
            // 3D physics not in the build
        }
        return n;
    }
}
