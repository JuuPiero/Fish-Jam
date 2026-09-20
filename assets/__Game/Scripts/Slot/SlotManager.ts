import { _decorator, Component, instantiate, Node } from 'cc';
import { GameConfigSA } from '../Data/GameConfigSA';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
const { ccclass, property } = _decorator;

@ccclass('SlotManager')
export class SlotManager extends Component {
    @property spacing: number = 0;
    @property count: number = 5;
    initialize() {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        const slotPrefab = ServiceLocator.get(GameConfigSA).slotPrefab;

        const startX = -(this.count - 1) * this.spacing * 0.5;
        for (let i = 0; i < this.count; i++) {
            const slotNode = instantiate(slotPrefab);
            slotNode.setParent(this.node);
            slotNode.setPosition(startX + i * this.spacing, 0, 0);
        }
    }
}


