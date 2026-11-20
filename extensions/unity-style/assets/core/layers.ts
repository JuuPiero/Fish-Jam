/**
 * Pure layer <-> physics group logic (no 'cc'), so it is unit tested.
 *
 * Unity layer index i is Cocos physics collision group bit (1 << i). The
 * group names come from Project Settings > Physics > Collision Groups
 * (index 0 is "DEFAULT"). A layer mask is a group bit mask, the same number
 * Cocos' ray casts take as `mask`.
 */

/** Unity's 32 layers, as Cocos' 32 collision groups. */
export const LAYER_COUNT = 32;

/** "Ignore Raycast", "IGNORE_RAYCAST", "ignoreRaycast" all compare equal. */
export function normalizeLayerName(name: string): string {
    return String(name).replace(/[\s_\-.]/g, '').toLowerCase();
}

/**
 * A table of layer names by index (index -> name, '' when unused).
 * Built from a group enum ({ NAME: bit }) and/or a settings list ([{ name, index }]).
 */
export class LayerTable {
    names: string[] = [];

    constructor() {
        for (let i = 0; i < LAYER_COUNT; i++) this.names.push('');
    }

    /** From an object such as PhysicsSystem.PhysicsGroup: { DEFAULT: 1, Enemy: 4, ... }. Single-bit values only. */
    addGroupEnum(groups: { [k: string]: any } | null | undefined): this {
        if (!groups) return this;
        const keys = Object.keys(groups);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const v = groups[k];
            if (typeof v !== 'number' || !/^[^0-9]/.test(k)) continue;
            const idx = bitIndex(v);
            if (idx >= 0 && !this.names[idx]) this.names[idx] = k;
        }
        return this;
    }

    /** From the project settings list [{ name, index }]. These names win. */
    addSettingsList(list: { name: string; index: number }[] | null | undefined): this {
        if (!list || !Array.isArray(list)) return this;
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e && typeof e.index === 'number' && e.index >= 0 && e.index < LAYER_COUNT && e.name) this.names[e.index] = String(e.name);
        }
        return this;
    }

    /** Layer index of a name, or -1 (exact first, then case/space/underscore-insensitive). */
    nameToLayer(name: string): number {
        if (name === undefined || name === null) return -1;
        for (let i = 0; i < LAYER_COUNT; i++) if (this.names[i] === name) return i;
        const n = normalizeLayerName(name);
        if (!n) return -1;
        for (let i = 0; i < LAYER_COUNT; i++) if (this.names[i] && normalizeLayerName(this.names[i]) === n) return i;
        return -1;
    }

    layerToName(layer: number): string {
        if (layer < 0 || layer >= LAYER_COUNT || layer !== Math.floor(layer)) return '';
        return this.names[layer] || '';
    }

    /** Mask of the named layers; unknown names are ignored (as in Unity). */
    getMask(names: string[]): number {
        let m = 0;
        for (let i = 0; i < names.length; i++) {
            const l = this.nameToLayer(names[i]);
            if (l >= 0) m |= 1 << l;
        }
        return m | 0;
    }
}

/** Index of a single-bit value, -1 otherwise. */
export function bitIndex(v: number): number {
    const u = v >>> 0;
    if (u === 0 || (u & (u - 1)) !== 0) return -1;
    for (let i = 0; i < 32; i++) if (u === (1 << i) >>> 0) return i;
    return -1;
}

/** The lowest set bit's index of a group value (a body's group can carry several bits). */
export function lowestBitIndex(v: number): number {
    const u = v >>> 0;
    if (u === 0) return -1;
    for (let i = 0; i < 32; i++) if (u & ((1 << i) >>> 0)) return i;
    return -1;
}

/**
 * Collects names into an array from either an array or up to eight separate
 * arguments (runtime code may not use rest parameters).
 */
export function collectNames(a: any, b?: any, c?: any, d?: any, e?: any, f?: any, g?: any, h?: any): string[] {
    if (Array.isArray(a)) return a.slice();
    const out: string[] = [];
    const all = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < all.length; i++) if (typeof all[i] === 'string') out.push(all[i]);
    return out;
}

/**
 * Sets or clears the collision between two groups in a Cocos collision
 * matrix ({ [groupBit]: maskOfGroupsItCollidesWith }), symmetrically.
 */
export function setMatrixPair(matrix: { [bit: string]: number }, l1: number, l2: number, collide: boolean): void {
    const b1 = (1 << l1) >>> 0;
    const b2 = (1 << l2) >>> 0;
    const k1 = String(1 << l1);
    const k2 = String(1 << l2);
    const m1 = (matrix[k1] || 0) >>> 0;
    const m2 = (matrix[k2] || 0) >>> 0;
    matrix[k1] = collide ? (m1 | b2) >>> 0 : (m1 & ~b2) >>> 0;
    if (l1 !== l2) matrix[k2] = collide ? (m2 | b1) >>> 0 : (m2 & ~b1) >>> 0;
}

export function matrixCollides(matrix: { [bit: string]: number }, l1: number, l2: number): boolean {
    const k1 = String(1 << l1);
    return (((matrix[k1] || 0) >>> 0) & ((1 << l2) >>> 0)) !== 0;
}
