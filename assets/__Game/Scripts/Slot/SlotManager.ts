import { _decorator, Color, Component, instantiate, Node, Sprite, SpriteFrame, tween } from 'cc';
import { GameConfigSA } from '../Data/GameConfigSA';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { Fish } from '../Fish/Fish';
import { Slot } from './Slot';
import { AudioManager } from 'db://assets/_iKame/Scripts/Audio/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('SlotManager')
export class SlotManager extends Component {

    @property(Node) slotContainer: Node = null;

    @property spacing: number = 0;
    @property count: number = 5;

    @property({ tooltip: 'Color flashed on every slot when only one free slot is left' })
    warningColor: Color = new Color(255, 60, 60, 255);

    @property({ tooltip: 'Seconds for one half of a flash (color in, or color back out)' })
    warningFlashDuration: number = 0.18;

    @property({ tooltip: 'How many times all slots flash before the warning turns off' })
    warningFlashCount: number = 3;

    private _slots: Node[] = [];
    // Parallel to _slots: the fish waiting in that slot, or null if it's free.
    private _occupants: (Fish | null)[] = [];
    // Fish whose slot has been reserved but whose landing animation has not finished yet.
    private _pendingParkArrivals = new Set<Fish>();
    // Guards against starting a second flash sequence while one is still playing - park()/
    // takeMatching() always change the free count by exactly 1, so a check right after either
    // call is already edge-triggered on "just reached exactly one free slot" without needing to
    // separately track the previous count.
    private _warningActive = false;

    // Flashes every slot's own background Sprite red warningFlashCount times, then restores each
    // one to whatever color it actually had (captured per-slot, not assumed to be plain white).
    private warnOneSlotLeft() {
        if (this._warningActive) {
            return;
        }

        const sprites = this._slots
            .map(slot => slot.getComponent(Sprite))
            .filter((sprite): sprite is Sprite => sprite !== null);
        if (sprites.length === 0) {
            return;
        }
        AudioManager.instance.playOneShot('Warning')
        this._warningActive = true;
        let remaining = sprites.length;
        for (const sprite of sprites) {
            const original = sprite.color.clone();
            tween(sprite)
                .repeat(Math.max(1, this.warningFlashCount),
                    tween()
                        .to(this.warningFlashDuration, { color: this.warningColor }, { easing: 'quadInOut' })
                        .to(this.warningFlashDuration, { color: original }, { easing: 'quadInOut' }),
                )
                .call(() => {
                    sprite.color = original;
                    remaining--;
                    if (remaining <= 0) {
                        this._warningActive = false;
                    }
                })
                .start();
        }
    }

    // Called after park()/takeMatching() change how many slots are free - the only two places
    // the occupant count moves.
    private checkWarning() {
        const freeCount = this._occupants.filter(fish => fish === null).length;
        if (freeCount === 1) {
            this.warnOneSlotLeft();
        }
    }

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
        this.checkWarning();
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
        this.checkWarning();
        return fish;
    }
}


