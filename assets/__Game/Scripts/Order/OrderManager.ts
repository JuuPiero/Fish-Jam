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
}


