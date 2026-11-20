/**
 * Access to the engine and the editor's scene-process globals.
 *
 * The runtime class (LineRenderer) is compiled by the project, not bundled
 * here: it is looked up by class name. The geometry core (assets/core) is
 * plain functions and is bundled into this script.
 */
import { join } from 'path';

module.paths.push(join(Editor.App.path, 'node_modules'));

export type CC = typeof import('cc');

let ccModule: CC | null = null;
export function cc(): CC {
    if (!ccModule) ccModule = require('cc') as CC;
    return ccModule;
}

export const cce = (): any => (globalThis as any).cce || {};
export const editorExtends = (): any => (globalThis as any).EditorExtends;

export function classByName(name: string): any {
    try {
        return cc().js.getClassByName(name) || null;
    } catch {
        return null;
    }
}

export const lineClass = () => classByName('LineRenderer');

/** Runtime classes loaded (the project compiled the mounted scripts). */
export function runtimeReady(): boolean {
    return !!lineClass();
}

export function currentScene(): any {
    try {
        return cc().director.getScene();
    } catch {
        return null;
    }
}

export function findNode(uuid: string): any {
    if (!uuid) return null;
    const ext = editorExtends();
    try {
        const n = ext?.Node?.getNode?.(uuid);
        if (n) return n;
    } catch {
        // fall through to a walk
    }
    const scene = currentScene();
    if (!scene) return null;
    let found: any = null;
    const walk = (n: any) => {
        if (found) return;
        if (n.uuid === uuid) {
            found = n;
            return;
        }
        for (const c of n.children) walk(c);
    };
    walk(scene);
    return found;
}

/** Component by uuid on any node of the scene. */
export function findComponent(uuid: string): any {
    const ext = editorExtends();
    try {
        const c = ext?.Component?.getComponent?.(uuid);
        if (c) return c;
    } catch {
        // fall through
    }
    for (const comp of allLines()) if (comp.uuid === uuid) return comp;
    const scene = currentScene();
    if (!scene) return null;
    let found: any = null;
    const walk = (n: any) => {
        if (found) return;
        for (const c of n.components) {
            if (c.uuid === uuid) {
                found = c;
                return;
            }
        }
        for (const c of n.children) walk(c);
    };
    walk(scene);
    return found;
}

/** Enabled LineRenderers in the open scene. */
export function allLines(): any[] {
    const C = lineClass();
    if (!C || !C.all) return [];
    const scene = currentScene();
    const res: any[] = [];
    for (const c of C.all) {
        if (c && c.isValid && c.node && c.node.isValid && c.node.scene === scene) res.push(c);
    }
    return res;
}

export function repaint(): void {
    try {
        cce().Engine?.repaintInEditMode?.();
    } catch {
        // editor shutting down
    }
}

/** Tells the editor a node changed (Inspector refresh, scene dirty). */
export function notifyNodeChanged(node: any): void {
    if (!node || !node.isValid) return;
    try {
        editorExtends()?.Node?.emit?.('change', node.uuid, node);
    } catch {
        // not in the editor
    }
}

export function selectedNodeUuids(): string[] {
    try {
        const ids = cce().Selection?.query?.();
        return Array.isArray(ids) ? ids : [];
    } catch {
        return [];
    }
}

export function is2DView(): boolean {
    try {
        const c = cce().Camera;
        if (typeof c?.is2D === 'boolean') return c.is2D;
        return !!cce().Gizmo?.is2D;
    } catch {
        return false;
    }
}

/** The Cocos transform tool: 'position' | 'rotation' | 'scale' | 'rect' | 'view'. */
export function transformToolName(): string {
    try {
        return cce().Gizmo?.transformToolName || 'position';
    } catch {
        return 'position';
    }
}

export function pivotMode(): 'pivot' | 'center' {
    try {
        return cce().Gizmo?.pivot === 'pivot' ? 'pivot' : 'center';
    } catch {
        return 'center';
    }
}

export function coordinateMode(): 'local' | 'global' {
    try {
        return cce().Gizmo?.coordinate === 'local' ? 'local' : 'global';
    } catch {
        return 'global';
    }
}

export interface SnapConfig {
    position: { x: number; y: number; z: number };
    rotation: number;
    scale: number;
    isPositionSnapEnabled: boolean;
    isRotationSnapEnabled: boolean;
    isScaleSnapEnabled: boolean;
}

export function snapConfig(): SnapConfig {
    const fallback: SnapConfig = {
        position: { x: 1, y: 1, z: 1 }, rotation: 15, scale: 0.1,
        isPositionSnapEnabled: false, isRotationSnapEnabled: false, isScaleSnapEnabled: false,
    };
    try {
        const c = cce().Gizmo?.queryTransformSnapConfigs?.();
        return c ? { ...fallback, ...c } : fallback;
    } catch {
        return fallback;
    }
}
