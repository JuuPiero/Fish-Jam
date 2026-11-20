/**
 * Scene tool state (Unity's LineRenderer scene tools: Edit Points / Create Points).
 */
import { V3 } from '../../assets/core/math';

export type Mode = 'none' | 'edit' | 'create';

/** Where Create Points puts new points. */
export type InputMode = 'plane' | 'view' | 'surface';

export interface Settings {
    /** plane: the ground (XZ) or, in 2D, the node's XY plane; view: in front of the camera; surface: on scene geometry. */
    inputMode: InputMode;
    /** Dragging in Create Points adds a point every this distance. */
    minVertexDistance: number;
    /** View input: distance from the camera. */
    viewDistance: number;
    /** Surface input: lift off the surface towards the camera. */
    surfaceOffset: number;
    /** Show the result of Simplify in the Scene view. */
    simplifyPreview: boolean;
    tolerance: number;
}

export const DEFAULT_SETTINGS: Settings = {
    inputMode: 'plane',
    minVertexDistance: 0.1,
    viewDistance: 5,
    surfaceOffset: 0.02,
    simplifyPreview: false,
    tolerance: 0.1,
};

export type HandleAxis = 'x' | 'y' | 'z' | 'xy' | 'yz' | 'xz' | 'view' | 'free';

export type Hit =
    | { kind: 'handle'; axis: HandleAxis }
    | { kind: 'point'; index: number }
    | { kind: 'segment'; index: number; t: number; world: V3 };

export const S = {
    primary: false,
    hooked: false,
    mode: 'none' as Mode,
    /** The LineRenderer being edited. */
    target: null as any,
    /** Selected point indices, last = active. */
    selection: [] as number[],
    hover: null as Hit | null,
    /** Create Points preview position (world). */
    preview: null as V3 | null,
    settings: { ...DEFAULT_SETTINGS },
    deleteKeyAt: 0,
    selectAllKeyAt: 0,
    replaying: false,
    stateVersion: 0,
    diag: {
        draws: 0,
        mouseDowns: 0,
        picks: 0,
        errors: [] as string[],
    },
};

export function note(msg: string): void {
    S.diag.errors.push(`${new Date().toISOString()} ${msg}`);
    if (S.diag.errors.length > 30) S.diag.errors.shift();
}

export function bumpState(): void {
    S.stateVersion++;
}

export function isSelected(i: number): boolean {
    return S.selection.includes(i);
}

export function setSelection(list: number[]): void {
    S.selection = [...new Set(list)];
    bumpState();
}

export function toggleSelection(i: number): void {
    const k = S.selection.indexOf(i);
    if (k >= 0) S.selection.splice(k, 1);
    else S.selection.push(i);
    bumpState();
}
