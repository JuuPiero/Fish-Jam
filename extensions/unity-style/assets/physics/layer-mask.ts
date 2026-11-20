import { Collider, Collider2D, Component, Node, PhysicsSystem, PhysicsSystem2D, RigidBody, RigidBody2D, settings } from 'cc';
import { bitIndex, collectNames, LayerTable, lowestBitIndex } from '../core/layers';

/**
 * Unity's LayerMask over Cocos physics collision groups.
 *
 * - A layer index i is the collision group bit (1 << i). Index 0 is the
 *   project's "DEFAULT" group, which also answers to "Default".
 * - Names come from Project Settings > Physics > Collision Groups (the same
 *   list for 2D and 3D). Lookups ignore case, spaces and underscores:
 *   "Ignore Raycast" finds a group named IGNORE_RAYCAST.
 * - A mask is a plain number: the group bits, as Cocos ray casts take it.
 *
 * Unlike Unity, a Cocos layer belongs to the physics body of a node, not to
 * the node: use LayerMask.SetLayer / GetLayer (they also apply the collision
 * matrix to the body's mask, which Cocos does not do when a group changes).
 */
export class LayerMask {
    private static _table: LayerTable | null = null;

    /** Everything / nothing, as masks. */
    static readonly Everything = -1;
    static readonly Nothing = 0;

    /** The layer name table (rebuilt by refresh()). */
    static get table(): LayerTable {
        if (!LayerMask._table) LayerMask.refresh();
        return LayerMask._table as LayerTable;
    }

    /** Re-reads the group names (only needed if groups were added at run time). */
    static refresh(): void {
        const t = new LayerTable();
        try {
            const list = settings ? settings.querySettings<{ name: string; index: number }[]>('physics', 'collisionGroups') : null;
            t.addSettingsList(list);
        } catch (e) {
            // settings not ready: the enums below still have the names
        }
        try {
            if (PhysicsSystem) t.addGroupEnum(PhysicsSystem.PhysicsGroup as any);
        } catch (e) {
            // 3D physics stripped
        }
        try {
            if (PhysicsSystem2D) t.addGroupEnum(PhysicsSystem2D.PhysicsGroup as any);
        } catch (e) {
            // 2D physics stripped
        }
        if (!t.names[0]) t.names[0] = 'DEFAULT';
        LayerMask._table = t;
    }

    /**
     * Mask of the named layers: GetMask('Ground', 'Water') or GetMask(['Ground', 'Water']).
     * Up to eight names as separate arguments; pass an array for more.
     */
    static GetMask(names: string | string[], n2?: string, n3?: string, n4?: string, n5?: string, n6?: string, n7?: string, n8?: string): number {
        return LayerMask.table.getMask(collectNames(names, n2, n3, n4, n5, n6, n7, n8));
    }

    /** Layer index of a group name, or -1. */
    static NameToLayer(layerName: string): number {
        return LayerMask.table.nameToLayer(layerName);
    }

    /** Group name of a layer index, or ''. */
    static LayerToName(layer: number): string {
        return LayerMask.table.layerToName(layer);
    }

    /** Group bit of a layer index (1 << layer). */
    static LayerToMask(layer: number): number {
        return layer >= 0 && layer < 32 ? 1 << layer : 0;
    }

    /** Layer index of a single group bit, or -1. */
    static MaskToLayer(groupBit: number): number {
        return bitIndex(groupBit);
    }

    /**
     * The layer of a node (or of the node of a component): its RigidBody's
     * group, else its first collider's group (3D, then 2D). 0 when none.
     */
    static GetLayer(target: Node | Component): number {
        const node = target instanceof Node ? target : target.node;
        const rb = RigidBody ? node.getComponent(RigidBody) : null;
        if (rb) return lowestBitIndex(rb.group) >= 0 ? lowestBitIndex(rb.group) : 0;
        const col = Collider ? node.getComponent(Collider) : null;
        if (col) {
            try {
                return Math.max(0, lowestBitIndex(col.getGroup()));
            } catch (e) {
                return 0;
            }
        }
        const rb2 = RigidBody2D ? node.getComponent(RigidBody2D) : null;
        if (rb2) return Math.max(0, lowestBitIndex(rb2.group));
        const c2 = Collider2D ? node.getComponent(Collider2D) : null;
        if (c2) return Math.max(0, lowestBitIndex(c2.group));
        return 0;
    }

    /**
     * Puts a node's physics body (RigidBody / colliders, 3D and 2D) in a
     * layer, and gives the 3D body the collision matrix row of that layer as
     * its mask, like a Unity layer change. Only this node, not its children
     * (pass recursive = true for those).
     */
    static SetLayer(target: Node | Component, layer: number, recursive = false): void {
        const node = target instanceof Node ? target : target.node;
        const bit = LayerMask.LayerToMask(layer);
        if (!bit) return;
        if (RigidBody) {
            const rb = node.getComponent(RigidBody);
            if (rb) rb.group = bit;
            const cols = node.getComponents(Collider);
            const sys = PhysicsSystem ? PhysicsSystem.instance : null;
            for (let i = 0; i < cols.length; i++) {
                const c = cols[i];
                try {
                    c.setGroup(bit);
                    if (sys) c.setMask((sys.collisionMatrix as any)[bit] >>> 0);
                } catch (e) {
                    // not initialized yet (node not in a scene): the RigidBody group still applies
                }
            }
        }
        if (RigidBody2D) {
            const rb2 = node.getComponent(RigidBody2D);
            if (rb2) rb2.group = bit;
            const c2 = node.getComponents(Collider2D);
            for (let i = 0; i < c2.length; i++) c2[i].group = bit;
        }
        if (recursive) {
            const ch = node.children;
            for (let i = 0; i < ch.length; i++) LayerMask.SetLayer(ch[i], layer, true);
        }
    }
}
