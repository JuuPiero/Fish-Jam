import { _decorator, Component, instantiate, Node } from 'cc';
import { GameConfigSA } from '../Data/GameConfigSA';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { Fish } from '../Fish/Fish';
const { ccclass, property } = _decorator;

@ccclass('SlotManager')
export class SlotManager extends Component {
    @property spacing: number = 0;
    @property count: number = 5;

    private _slots: Node[] = [];
    // Parallel to _slots: the fish waiting in that slot, or null if it's free.
    private _occupants: (Fish | null)[] = [];

    initialize() {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this._slots = [];
        this._occupants = [];

        const slotPrefab = ServiceLocator.get(GameConfigSA).slotPrefab;

        const startX = -(this.count - 1) * this.spacing * 0.5;
        for (let i = 0; i < this.count; i++) {
            const slotNode = instantiate(slotPrefab);
            slotNode.setParent(this.node);
            slotNode.setPosition(startX + i * this.spacing, 0, 0);
            this._slots.push(slotNode);
            this._occupants.push(null);
        }
    }

    hasFreeSlot(): boolean {
        return this._occupants.some(fish => fish === null);
    }

    // Parks a fish in the first free slot. Returns false if the bench is full.
    park(fish: Fish, flyLayer: Node): boolean {
        const index = this._occupants.indexOf(null);
        if (index === -1) {
            return false;
        }
        this._occupants[index] = fish;
        fish.flyToSlot(this._slots[index], flyLayer);
        return true;
    }

    // Removes and returns a waiting fish of the given type, if any, freeing its slot.
    takeMatching(fishId: number): Fish | null {
        const index = this._occupants.findIndex(fish => fish !== null && fish.id === fishId);
        if (index === -1) {
            return null;
        }
        const fish = this._occupants[index];
        this._occupants[index] = null;
        return fish;
    }
}


