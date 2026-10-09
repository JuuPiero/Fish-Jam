import { _decorator, Component, instantiate, Node } from 'cc';
import { GameConfigSA } from '../Data/GameConfigSA';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { Fish } from '../Fish/Fish';
import { Slot } from './Slot';
const { ccclass, property } = _decorator;

@ccclass('SlotManager')
export class SlotManager extends Component {

    @property(Node) slotContainer: Node = null;

    @property spacing: number = 0;
    @property count: number = 5;

    private _slots: Node[] = [];
    // Parallel to _slots: the fish waiting in that slot, or null if it's free.
    private _occupants: (Fish | null)[] = [];
    // Fish whose slot has been reserved but whose landing animation has not finished yet.
    private _pendingParkArrivals = new Set<Fish>();




    initialize() {
        // for (const child of this.slotContainer.children.slice()) {
        //     child.removeFromParent();
        //     child.destroy();
        // }
        this._slots = [];
        this._occupants = [];
        this._pendingParkArrivals.clear();

        this._slots = this.slotContainer.children

        for (let i = 0; i < this._slots.length; i++) {
            this._occupants.push(null);
        }
        // for (const element of this._slots) {

        // }

        // const slotPrefab = ServiceLocator.get(GameConfigSA).slotPrefab;

        // const startX = -(this.count - 1) * this.spacing * 0.5;
        // for (let i = 0; i < this.count; i++) {
        //     const slotNode = instantiate(slotPrefab);
        //     slotNode.setParent(this.slotContainer);
        //     slotNode.setPosition(startX + i * this.spacing, 0, 0);
        //     this._slots.push(slotNode);
        //     this._occupants.push(null);
        // }
    }
    hasFreeSlot(): boolean {
        return this._occupants.some(fish => fish === null);
    }

    hasPendingParkArrivals(): boolean {
        return this._pendingParkArrivals.size > 0;
    }

    // Unity's WaitSlotsManager.CollectWaitingItemCounts equivalent. Occupants are registered
    // before their fly-to-slot animation begins, so an in-flight fish counts as reachable too.
    collectWaitingFishCounts(counts: Map<number, number>): void {
        for (const fish of this._occupants) {
            if (fish) {
                counts.set(fish.id, (counts.get(fish.id) ?? 0) + 1);
            }
        }
    }

    // Parks a fish in the first free slot. Returns false if the bench is full.
    park(fish: Fish, flyLayer: Node, onArrive?: () => void): boolean {
        const index = this._occupants.indexOf(null);
        if (index === -1) {
            return false;
        }
        this._occupants[index] = fish;
        this._pendingParkArrivals.add(fish);
        const slot = this._slots[index].getComponent(Slot);
        // Fish belong inside the Slot's content container, not on the slot root. This keeps
        // decorative/background nodes on the slot independent of the parked-fish hierarchy.
        const landingContainer = slot?.container ?? this._slots[index];
        fish.flyToSlot(landingContainer, flyLayer, () => {
            this._pendingParkArrivals.delete(fish);
            onArrive?.();
        });
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
        this._pendingParkArrivals.delete(fish);
        return fish;
    }
}


