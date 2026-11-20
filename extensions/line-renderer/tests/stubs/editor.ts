/**
 * A fake editor for running the scene script in node: Editor, cce,
 * EditorExtends, a top-down orthographic Scene view camera and a scene.
 * Import this before anything from source/scene.
 */
import * as cc from './cc';

export const W = 800;
export const H = 600;
/** Pixels per world unit of the fake Scene view camera. */
export const PX = 20;

export const log = {
    requests: [] as { msg: string; args: any[] }[],
    broadcasts: [] as { msg: string; data: any }[],
    changes: [] as string[],
    repaints: 0,
    removed: [] as any[],
    selectAllNodes: 0,
    /** Events that reached the editor's own handlers (below our priority). */
    editorEvents: [] as string[],
};

// ------------------------------------------------------------- scene graph

export const scene = new cc.Node('Scene');
(scene as any).isScene = true;
(scene as any).renderScene = new cc.RenderScene();
cc.director._scene = scene;

export function walk(n: cc.Node, fn: (n: cc.Node) => void) {
    fn(n);
    for (const c of n.children) walk(c, fn);
}

export function findNode(uuid: string): cc.Node | null {
    let found: cc.Node | null = null;
    walk(scene, (n) => {
        if (n.uuid === uuid) found = n;
    });
    return found;
}

export function findComponent(uuid: string): any {
    let found: any = null;
    walk(scene, (n) => {
        for (const c of n.components) if (c.uuid === uuid) found = c;
    });
    return found;
}

// ------------------------------------------------------------------ camera

export const geometry = {
    lines: 0,
    triangles: 0,
    quads: 0,
    reset() {
        this.lines = 0;
        this.triangles = 0;
        this.quads = 0;
    },
    addLine() {
        this.lines++;
    },
    addTriangle() {
        this.triangles++;
    },
    addQuad() {
        this.quads++;
    },
};

const camNode = new cc.Node('Editor Camera');
// Looking straight down: forward -Y, screen up = world -Z, right = +X.
camNode.rotation.set(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
camNode.position.set(0, 100, 0);

export const camera: any = {
    name: 'Editor Camera',
    cameraUsage: cc.renderer.scene.CameraUsage.SCENE_VIEW,
    enabled: true,
    window: null,
    width: W,
    height: H,
    projectionType: cc.renderer.scene.CameraProjection.ORTHO,
    nearClip: 0.1,
    node: camNode,
    get forward() {
        return new cc.Vec3(0, -1, 0);
    },
    geometryRenderer: geometry,
    initGeometryRenderer() {},
    worldToScreen(out: any, p: any) {
        out.x = p.x * PX + W / 2;
        out.y = -p.z * PX + H / 2;
        out.z = 0.5;
        return out;
    },
    screenPointToRay(ray: any, x: number, y: number) {
        ray.o.set((x - W / 2) / PX, 100, -(y - H / 2) / PX);
        ray.d.set(0, -1, 0);
        return ray;
    },
};

const mainWindow = {};
camera.window = mainWindow;
Object.assign(cc.director.root, { mainWindow, cameraList: [camera] });

/** Screen position of a world point (bottom-left origin, like the engine). */
export function screen(x: number, y: number, z: number) {
    return { x: x * PX + W / 2, y: -z * PX + H / 2 };
}

// ------------------------------------------------------------------- cce

type Listener = { fn: (ev: any) => any; priority: number };
const opListeners = new Map<string, Listener[]>();

export let selectedNodes: string[] = [];
export function selectNodes(ids: string[]) {
    selectedNodes = ids;
}

export const cce: any = {
    Operation: {
        addListener(type: string, fn: any, priority = 0) {
            const l = opListeners.get(type) || [];
            l.push({ fn, priority });
            l.sort((a, b) => b.priority - a.priority);
            opListeners.set(type, l);
        },
        removeListener(type: string, fn: any) {
            opListeners.set(type, (opListeners.get(type) || []).filter((l) => l.fn !== fn));
        },
        emit(type: string, ev: any) {
            for (const l of opListeners.get(type) || []) {
                if (l.fn(ev) === false) return false;
            }
            return true;
        },
    },
    Selection: {
        query: () => [...selectedNodes],
    },
    Camera: { is2D: false },
    Gizmo: {
        transformToolName: 'position',
        pivot: 'center',
        coordinate: 'global',
        is2D: false,
        queryTransformSnapConfigs: () => ({
            position: { x: 1, y: 1, z: 1 }, rotation: 15, scale: 0.1,
            isPositionSnapEnabled: false, isRotationSnapEnabled: false, isScaleSnapEnabled: false,
        }),
    },
    Engine: {
        repaintInEditMode() {
            log.repaints++;
        },
    },
    SceneFacadeManager: {
        removeNode(opts: any) {
            log.removed.push(opts);
        },
        selectAllNodes() {
            log.selectAllNodes++;
        },
    },
};

// The editor's own handlers, below the extension's priority.
for (const type of ['mousedown', 'mousemove', 'mouseup', 'dblclick', 'keydown']) {
    cce.Operation.addListener(type, () => {
        log.editorEvents.push(type);
        return true;
    }, 98);
}

(globalThis as any).cce = cce;
(globalThis as any).EditorExtends = {
    Node: {
        getNode: (uuid: string) => findNode(uuid),
        emit: (type: string, uuid: string) => log.changes.push(`${type}:${uuid}`),
    },
    Component: {
        getComponent: (uuid: string) => findComponent(uuid),
    },
};

// ---------------------------------------------------------------- Editor

let undoSeq = 0;
export let sceneMethods: Record<string, (...args: any[]) => any> = {};
export function setSceneMethods(m: Record<string, (...args: any[]) => any>) {
    sceneMethods = m;
}

async function request(pkg: string, msg: string, ...args: any[]): Promise<any> {
    log.requests.push({ msg, args });
    if (pkg !== 'scene') return undefined;
    switch (msg) {
        case 'begin-recording':
            return `undo-${++undoSeq}`;
        case 'end-recording':
        case 'cancel-recording':
            return true;
        case 'create-node': {
            const o = args[0] || {};
            const n = new cc.Node(o.name || 'Node');
            n.setParent((o.parent && findNode(o.parent)) || scene);
            return n.uuid;
        }
        case 'create-component': {
            const o = args[0];
            const n = findNode(o.uuid);
            const C = cc.js.getClassByName(o.component);
            if (n && C) n.addComponent(C);
            return true;
        }
        case 'execute-scene-script': {
            const o = args[0];
            return sceneMethods[o.method]?.(...(o.args || []));
        }
    }
    return undefined;
}

(globalThis as any).Editor = {
    App: { path: __dirname, version: 'test' },
    Message: {
        request,
        broadcast(msg: string, data: any) {
            log.broadcasts.push({ msg, data });
        },
        __protected__: {
            addBroadcastListener() {},
            removeBroadcastListener() {},
        },
    },
    Profile: {
        getConfig: async () => undefined,
        setConfig: async () => undefined,
    },
    Selection: {
        clear() {
            selectedNodes = [];
        },
        select(_type: string, uuid: string) {
            selectedNodes = [...selectedNodes, uuid];
        },
        getSelected() {
            return [...selectedNodes];
        },
    },
};

const windowListeners = new Map<string, Function[]>();
(globalThis as any).window = {
    addEventListener(type: string, fn: Function) {
        const l = windowListeners.get(type) || [];
        l.push(fn);
        windowListeners.set(type, l);
    },
    removeEventListener(type: string, fn: Function) {
        windowListeners.set(type, (windowListeners.get(type) || []).filter((f) => f !== fn));
    },
};

/** Dispatches a DOM-like key event to window listeners. */
export function domKey(key: string, mods: { ctrlKey?: boolean } = {}) {
    const ev = {
        key, ctrlKey: !!mods.ctrlKey, metaKey: false, target: null,
        defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
    };
    for (const f of windowListeners.get('keydown') || []) f(ev);
    return ev;
}

export { cc };
