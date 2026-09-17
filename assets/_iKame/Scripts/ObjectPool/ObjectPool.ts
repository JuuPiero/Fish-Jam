import { instantiate, Node, NodePool, Prefab } from 'cc';

export class ObjectPool {
    private static pools = new Map<Prefab, NodePool>();
    private static prefabOf = new WeakMap<Node, Prefab>();

    /**
     * Get a node for the given prefab, reusing a pooled instance when available.
     *
     * ObjectPool.get(bulletPrefab, this.node)
     */
    static get(prefab: Prefab, parent?: Node): Node {
        const pool = this.getPool(prefab);
        const node = pool.size() > 0 ? pool.get()! : instantiate(prefab);

        this.prefabOf.set(node, prefab);
        node.active = true;

        if (parent) {
            parent.addChild(node);
        }

        return node;
    }

    /**
     * Return a node to its pool. Nodes not created through ObjectPool.get() are destroyed instead.
     */
    static put(node: Node): void {
        const prefab = this.prefabOf.get(node);
        if (!prefab) {
            node.destroy();
            return;
        }

        this.getPool(prefab).put(node);
    }

    /**
     * Warm up a prefab's pool with a number of pre-instantiated nodes.
     */
    static preload(prefab: Prefab, count: number): void {
        const pool = this.getPool(prefab);

        for (let i = 0; i < count; i++) {
            pool.put(instantiate(prefab));
        }
    }

    /**
     * Number of idle nodes currently cached for a prefab.
     */
    static size(prefab: Prefab): number {
        return this.pools.get(prefab)?.size() ?? 0;
    }

    /**
     * Destroy cached nodes. Omit `prefab` to clear every pool.
     */
    static clear(prefab?: Prefab): void {
        if (prefab) {
            this.pools.get(prefab)?.clear();
            this.pools.delete(prefab);
            return;
        }

        this.pools.forEach(pool => pool.clear());
        this.pools.clear();
    }

    private static getPool(prefab: Prefab): NodePool {
        let pool = this.pools.get(prefab);
        if (!pool) {
            pool = new NodePool();
            this.pools.set(prefab, pool);
        }

        return pool;
    }
}