import { _decorator, Color, Component, Node, Sprite } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
const { ccclass, property } = _decorator;

// The placeholder icons start translucent and light up to full opacity as they get delivered.
const EMPTY_SLOT_COLOR = new Color(255, 255, 255, 150);

@ccclass('Order')
export class Order extends Component {
    @property({readonly: true}) id: number = -1;
    @property(Node) slotsPos: Node[] = []

    // Claimed = already promised to a fish that's mid-flight here; delivered = that fish has
    // actually landed. Split in two so a second fish of the same type can't ALSO get sent to
    // this order while the first is still ~0.4s from landing on the last open slot.
    private _claimedCount = 0;
    private _deliveredCount = 0;

    get isComplete(): boolean {
        return this._deliveredCount >= this.slotsPos.length;
    }

    // True once every slot already has a fish either landed or currently flying toward it -
    // this (not isComplete) is what should stop new fish from being routed here.
    get isFullyClaimed(): boolean {
        return this._claimedCount >= this.slotsPos.length;
    }

    initialize(id: number) {
        this.reset(id);
    }

    reset(id: number) {
        this.id = id;
        this._claimedCount = 0;
        this._deliveredCount = 0;
        this.slotsPos.forEach(slotNode => {
            const sprite = slotNode.getComponent(Sprite);
            sprite.spriteFrame = ServiceLocator.get(FishConfigSA).fishs[id];
            sprite.color = EMPTY_SLOT_COLOR;
        })
    }

    // Reserves the next open slot for a fish about to start flying here. Called at dispatch
    // time (not on arrival) so the slot is immediately unavailable to any other fish.
    claimNextSlot(): Node | null {
        if (this.isFullyClaimed) {
            return null;
        }
        return this.slotsPos[this._claimedCount++] ?? null;
    }

    // Marks a previously-claimed slot as delivered once its fish actually lands, and reports
    // whether the order is now fully complete.
    fillSlot(slotNode: Node): boolean {
        slotNode.getComponent(Sprite).color = Color.WHITE;
        this._deliveredCount++;
        return this.isComplete;
    }
}


