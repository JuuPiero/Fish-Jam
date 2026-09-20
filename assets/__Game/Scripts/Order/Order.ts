import { _decorator, Component, Node, Sprite } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
const { ccclass, property } = _decorator;

@ccclass('Order')
export class Order extends Component {
    @property({readonly: true}) id: number = -1;
    @property(Node) slotsPos: Node[] = []
    initialize(id: number) {
        this.reset(id);
    }

    reset(id: number) {
        this.id = id;
        this.slotsPos.forEach(slotNode => {
            slotNode.getComponent(Sprite).spriteFrame = ServiceLocator.get(FishConfigSA).fishs[id];
        })
    }
}


