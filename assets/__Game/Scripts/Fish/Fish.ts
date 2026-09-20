import { _decorator, Button, Component, math, Node, Sprite, UITransform } from 'cc';
import { Order } from '../Order/Order';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
const { ccclass, property } = _decorator;

@ccclass('Fish')
export class Fish extends Component {

    _button: Button = null;

    @property({readonly: true}) id: number = -1;

    @property(Node) visual: Node = null;

    onclick: () => void = null;

    protected onLoad(): void {
        this._button = this.getComponent(Button)
    }
    protected onEnable(): void {
        this._button.node.on(Button.EventType.CLICK, this.onFishClick, this)
    }
    protected onDisable(): void {
        this._button.node.off(Button.EventType.CLICK, this.onFishClick, this)
    }
    initialize(id: number) {
        this.id = id;
        const spriteFrame = ServiceLocator.get(FishConfigSA).fishs[id];
        this.visual.getComponent(Sprite).spriteFrame = spriteFrame;
    }

    onFishClick() {
        this.onclick?.();
        console.log("Hello world");
    }
    flyToSlot(slot: Node) {

    }

    flyToOrder(order: Order) {

    }

    getSize() {
        const size = this.visual.getComponent(UITransform).contentSize;
        const scale = this.visual.scale;
        return new math.Size(size.width * Math.abs(scale.x), size.height * Math.abs(scale.y));
    }
}


