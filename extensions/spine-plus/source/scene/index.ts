/**
 * Scene-process half of Spine Plus: draws the bones of skeletons with
 * Debug Bones on, creates skeleton nodes, and answers diagnostics.
 *
 * The runtime classes are compiled by the project (db://spine-plus) and are
 * looked up by class name.
 */
import { join } from 'path';

module.paths.push(join(Editor.App.path, 'node_modules'));

type CC = typeof import('cc');
let ccModule: CC | null = null;
function cc(): CC {
    if (!ccModule) ccModule = require('cc') as CC;
    return ccModule;
}
const cce = (): any => (globalThis as any).cce || {};

function skeletonClass(): any {
    try {
        return cc().js.getClassByName('SkeletonAnimation') || null;
    } catch {
        return null;
    }
}

function allSkeletons(): any[] {
    const C = skeletonClass();
    if (!C || !C.all) return [];
    const scene = cc().director.getScene();
    return [...C.all].filter((c: any) => c && c.isValid && c.node?.isValid && c.node.scene === scene);
}

function repaint(): void {
    try {
        cce().Engine?.repaintInEditMode?.();
    } catch {
        // editor shutting down
    }
}

let lastCamera: any = null;
function sceneCamera(): any {
    try {
        const { director, renderer } = cc();
        const root: any = director.root;
        if (!root) return null;
        if (lastCamera && lastCamera.enabled && lastCamera.window === root.mainWindow && root.cameraList.includes(lastCamera)) return lastCamera;
        for (const cam of root.cameraList) {
            if (cam.cameraUsage === renderer.scene.CameraUsage.SCENE_VIEW && cam.enabled && cam.window === root.mainWindow) {
                lastCamera = cam;
                return cam;
            }
        }
    } catch {
        // engine not ready
    }
    return null;
}

// ------------------------------------------------------------- bone overlay

let colors: { bone: any; root: any; tip: any } | null = null;
const tmp: any[] = [];

function v3(): any {
    return new (cc().Vec3)();
}

function drawBones(gr: any, comp: any): void {
    const inst = comp.instance;
    if (!inst) return;
    const { Vec3 } = cc();
    const m = comp.node.worldMatrix;
    while (tmp.length < 4) tmp.push(v3());
    const [a, b, c, d] = tmp;
    const bones = inst.skeleton.bones as any[];
    for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        if (bone.active === false) continue;
        const w = inst.boneWorld(bone);
        const len = bone.data.length;
        Vec3.transformMat4(a, a.set(w.x, w.y, 0), m);
        const col = i === 0 ? colors!.root : colors!.bone;
        if (len > 0) {
            // A thin diamond from the origin to the tip, like the Spine editor.
            const tx = w.x + w.a * len;
            const ty = w.y + w.c * len;
            const nx = -w.c * len * 0.08;
            const ny = w.a * len * 0.08;
            const mx = w.x + w.a * len * 0.15;
            const my = w.y + w.c * len * 0.15;
            Vec3.transformMat4(b, b.set(tx, ty, 0), m);
            Vec3.transformMat4(c, c.set(mx + nx, my + ny, 0), m);
            Vec3.transformMat4(d, d.set(mx - nx, my - ny, 0), m);
            gr.addLine(a, c, col, false);
            gr.addLine(c, b, col, false);
            gr.addLine(a, d, col, false);
            gr.addLine(d, b, col, false);
        } else {
            // Zero-length bones: a small cross.
            const s = 2;
            Vec3.transformMat4(b, b.set(w.x - s, w.y, 0), m);
            Vec3.transformMat4(c, c.set(w.x + s, w.y, 0), m);
            gr.addLine(b, c, colors!.tip, false);
            Vec3.transformMat4(b, b.set(w.x, w.y - s, 0), m);
            Vec3.transformMat4(c, c.set(w.x, w.y + s, 0), m);
            gr.addLine(b, c, colors!.tip, false);
        }
    }
}

function onBeforeCommit(): void {
    const list = allSkeletons().filter((c) => c.debugBones && c.enabledInHierarchy);
    if (!list.length) return;
    const cam = sceneCamera();
    if (!cam) return;
    if (!cam.geometryRenderer && cam.initGeometryRenderer) cam.initGeometryRenderer();
    const gr = cam.geometryRenderer;
    if (!gr) return;
    if (!colors) {
        const { Color } = cc();
        colors = { bone: new Color(255, 120, 40, 255), root: new Color(80, 220, 120, 255), tip: new Color(255, 220, 60, 255) };
    }
    for (const comp of list) drawBones(gr, comp);
}

let hooked = false;
function hook(): boolean {
    if (hooked) return true;
    try {
        const { director, Director } = cc();
        director.on(Director.EVENT_BEFORE_COMMIT, onBeforeCommit);
        hooked = true;
    } catch {
        hooked = false;
    }
    return hooked;
}

// ----------------------------------------------------------------- creation

function selectedNodeUuids(): string[] {
    try {
        const ids = cce().Selection?.query?.();
        return Array.isArray(ids) ? ids : [];
    } catch {
        return [];
    }
}

function findNode(uuid: string): any {
    try {
        return (globalThis as any).EditorExtends?.Node?.getNode?.(uuid) ?? null;
    } catch {
        return null;
    }
}

function inCanvas(node: any): boolean {
    const { UITransform } = cc();
    for (let n = node; n; n = n.parent) if (n.getComponent?.(UITransform)) return true;
    return false;
}

function is2DView(): boolean {
    try {
        const c = cce().Camera;
        if (typeof c?.is2D === 'boolean') return c.is2D;
        return !!cce().Gizmo?.is2D;
    } catch {
        return false;
    }
}

function loadAsset(uuid: string): Promise<any> {
    return new Promise((resolve) => cc().assetManager.loadAny({ uuid }, (err: any, asset: any) => resolve(err ? null : asset)));
}

/** New node with a SkeletonAnimation (under the selection, in a Canvas when the view is 2D). */
async function createSkeleton(assetUuid: string | null): Promise<string | null> {
    const sel = selectedNodeUuids();
    const parentNode = sel.length ? findNode(sel[0]) : null;
    const options: any = { name: 'Spine' };
    if (parentNode) options.parent = parentNode.uuid;
    if (is2DView() || (parentNode && inCanvas(parentNode))) options.canvasRequired = true;
    let asset: any = null;
    if (assetUuid) {
        asset = await loadAsset(assetUuid);
        if (asset?.name) options.name = asset.name.replace(/\.(json|skel)$/i, '');
    }
    const uuid = (await Editor.Message.request('scene', 'create-node', options)) as unknown as string;
    if (!uuid || typeof uuid !== 'string') return null;
    await Editor.Message.request('scene', 'create-component', { uuid, component: 'SkeletonAnimation' } as any);
    const node = findNode(uuid);
    const C = skeletonClass();
    const comp = node && C ? node.getComponent(C) : null;
    if (comp && asset) {
        let undo: any = null;
        try {
            undo = await Editor.Message.request('scene', 'begin-recording', [node.uuid]);
        } catch {
            undo = null;
        }
        comp.skeletonData = asset;
        // The first animation and the first skin with images, so something shows.
        const info = comp.info;
        if (info) {
            if (info.skins.length > 1) comp.skin = info.skins[1];
            if (info.animations.length) comp.animation = info.animations[0].name;
        }
        if (inCanvas(node)) comp.fitUITransform();
        try {
            (globalThis as any).EditorExtends?.Node?.emit?.('change', node.uuid, node);
        } catch {
            // not in the editor
        }
        if (undo) await Editor.Message.request('scene', 'end-recording', undo).catch(() => undefined);
    }
    try {
        Editor.Selection.clear('node');
        Editor.Selection.select('node', uuid);
    } catch {
        // selection API missing
    }
    repaint();
    return uuid;
}

export const methods: Record<string, (...args: any[]) => any> = {
    spCreate(assetUuid?: string) {
        hook();
        return createSkeleton(assetUuid || null).catch((e) => {
            console.error('[Spine Plus] Could not create the skeleton:', e);
            return null;
        });
    },

    spDiagnostics() {
        return {
            hooked,
            runtime: !!skeletonClass(),
            camera: !!sceneCamera(),
            skeletons: allSkeletons().map((c: any) => {
                const info = c.info;
                return {
                    node: c.node?.name,
                    data: c.skeletonData?.name ?? null,
                    error: c.loadError,
                    runtime: c.runtimeVersion,
                    exported: info?.exported,
                    skin: c.skin,
                    animation: c.animation,
                    physics: info?.physics,
                    usePhysics: c.usePhysics,
                    playInEditor: c.playInEditor,
                    material: c.getSharedMaterial(0)?.name ?? null,
                    vertices: c.mesh?.vertexCount,
                    batches: c.getEditorInfo?.().batches,
                    uiRenderer: c.getEditorInfo?.().uiRenderer,
                    inCanvas: c.getEditorInfo?.().inCanvas,
                };
            }),
        };
    },
};

export function load(): void {
    const tryHook = (n: number) => {
        if (hook() || n <= 0) return;
        setTimeout(() => tryHook(n - 1), 1000);
    };
    tryHook(30);
}

export function unload(): void {
    try {
        if (hooked) {
            const { director, Director } = cc();
            director.off(Director.EVENT_BEFORE_COMMIT, onBeforeCommit);
        }
    } catch {
        // editor shutting down
    }
    hooked = false;
}
