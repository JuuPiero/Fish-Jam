import { _decorator, Component, instantiate, Node } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Order } from './Order';
import { LevelData } from '../Data/LevelData';
const { ccclass, property } = _decorator;

@ccclass('OrderManager')
export class OrderManager extends Component {
    @property spacing: number = 0;
    @property count: number = 4;

    @property({type: [Order], readonly: true}) orders: Order[] = []

    // Match-3: an order is fulfilled by delivering this many fish of the same id (matches the
    // number of placeholder slots on the Order prefab).
    private static readonly FISH_PER_ORDER = 3;

    // Order ids still waiting for a visible slot to free up.
    private _queue: number[] = [];

    initialize(levelData: LevelData) {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this.orders = [];

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;

        const fishIds: number[] = [];
        for (const bubble of levelData.bubbles) {
            fishIds.push(...bubble.fishes);
        }

        // No order curve yet - group the level's fish into one order per every 3 of the same
        // id, in the sequence each id first shows up. The previous version generated one order
        // PER FISH instead of per group of 3, so the same id could get queued up again after its
        // only 3 fish were already used, leaving a permanently unfulfillable order.
        const remainingCount = new Map<number, number>();
        for (const id of fishIds) {
            remainingCount.set(id, (remainingCount.get(id) ?? 0) + 1);
        }
        const orderIds: number[] = [];
        const seen = new Set<number>();
        for (const id of fishIds) {
            if (seen.has(id)) {
                continue;
            }
            seen.add(id);
            const ordersForId = Math.floor((remainingCount.get(id) ?? 0) / OrderManager.FISH_PER_ORDER);
            for (let i = 0; i < ordersForId; i++) {
                orderIds.push(id);
            }
        }
        // Never wrap around to reuse an id for two visible slots at once - a level with fewer
        // distinct orders than `count` just shows fewer of them, rather than creating two
        // orders asking for the same id when there are only 3 fish of it in the whole level.
        const visibleCount = Math.min(this.count, orderIds.length);
        this._queue = orderIds.slice(visibleCount);

        const startX = -(this.count - 1) * this.spacing * 0.5;
        for (let i = 0; i < visibleCount; i++) {
            const orderNode = instantiate(orderPrefab);
            orderNode.setParent(this.node);
            orderNode.setPosition(startX + i * this.spacing, 0, 0);

            const order = orderNode.getComponent(Order);
            order.initialize(orderIds[i]);
            this.orders.push(order);
        }
    }

    // The first order asking for this fish id that still has an unclaimed slot, if any. Checks
    // isFullyClaimed (not isComplete) so a slot already promised to an in-flight fish can't
    // also get a second fish sent to it before the first one lands.
    findMatchingOrder(fishId: number): Order | null {
        return this.orders.find(order => order.id === fishId && !order.isFullyClaimed) ?? null;
    }

    // Call once `order` has been fully delivered. Reuses its slot for the next queued fish id
    // and returns that id, or destroys the order (returning null) if the level has none left.
    completeOrder(order: Order): number | null {
        const index = this.orders.indexOf(order);
        if (index === -1) {
            return null;
        }

        const nextId = this._queue.shift();
        if (nextId === undefined) {
            this.orders.splice(index, 1);
            order.node.destroy();
            return null;
        }

        order.reset(nextId);
        return nextId;
    }
}


