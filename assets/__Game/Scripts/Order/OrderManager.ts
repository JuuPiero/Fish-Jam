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

    // Fish ids still waiting to become an order, once a visible slot frees up.
    private _queue: number[] = [];

    initialize(levelData: LevelData) {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this.orders = [];

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;

        // No order curve yet - just take the fish ids in the order/quantity they appear
        // across the level's bubbles and hand them out to the visible order slots in sequence.
        const fishIds: number[] = [];
        for (const bubble of levelData.bubbles) {
            fishIds.push(...bubble.fishes);
        }
        this._queue = fishIds.slice(this.count);

        const startX = -(this.count - 1) * this.spacing * 0.5;
        for (let i = 0; i < this.count; i++) {
            const orderNode = instantiate(orderPrefab);
            orderNode.setParent(this.node);
            orderNode.setPosition(startX + i * this.spacing, 0, 0);

            const order = orderNode.getComponent(Order);
            order.initialize(fishIds[i % fishIds.length]);
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


