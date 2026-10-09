import { _decorator, Component, instantiate, Node, Prefab, tween, Tween, Vec3 } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Order } from './Order';
import { LevelData } from '../Data/LevelData';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
import { AudioManager } from 'db://assets/_iKame/Scripts/Audio/AudioManager';
import { BubbleManager } from '../Bubble/BubbleManager';
import { SlotManager } from '../Slot/SlotManager';
const { ccclass, property } = _decorator;

@ccclass('OrderManager')
export class OrderManager extends Component {
    @property(Node) orderContainer: Node = null;
    @property spacing: number = 0;
    @property count: number = 4;

    @property({ tooltip: 'Unity GeneralDifficulty.maxSameOrderInARow fallback.' })
    maxSameOrderInARow: number = 2;

    @property({ tooltip: 'Seconds for the row to slide into its re-centered layout when the visible count changes' })
    relayoutDuration: number = 0.25;

    @property({ type: [Order], readonly: true }) orders: Order[] = [];

    // Unity uses the number of slots on the bowl. The Cocos Order prefab currently has three.
    private static readonly FISH_PER_ORDER = 3;

    // Fish not yet assigned to an order. Unity calls this pendingCounts and decrements it only
    // when an order is actually created, not when the player taps one of its fish.
    private _pendingCounts = new Map<number, number>();
    private _totalOrderCount = 0;
    private _lastCreatedId = -1;
    private _sameOrderRun = 0;
    private _bubbleManager: BubbleManager | null = null;
    private _slotManager: SlotManager | null = null;

    // Kept separate from Order's pop tween: moving the row must not stop an order reset animation.
    private _relayoutTweens = new Map<Order, Tween<Node>>();

    get totalOrderCount(): number {
        return this._totalOrderCount;
    }

    initialize(levelData: LevelData, bubbleManager?: BubbleManager, slotManager?: SlotManager): void {
        for (const child of this.orderContainer.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        this.orders = [];
        this._relayoutTweens.clear();
        this._pendingCounts.clear();
        this._bubbleManager = bubbleManager ?? null;
        this._slotManager = slotManager ?? null;
        this._lastCreatedId = -1;
        this._sameOrderRun = 0;

        for (const bubble of levelData.bubbles) {
            for (const fishId of bubble.fishes) {
                this._pendingCounts.set(fishId, (this._pendingCounts.get(fishId) ?? 0) + 1);
            }
        }
        this._totalOrderCount = Array.from(this._pendingCounts.values())
            .reduce((total, fishCount) => total + Math.ceil(fishCount / OrderManager.FISH_PER_ORDER), 0);

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;
        for (let slotIndex = 0; slotIndex < this.count; slotIndex++) {
            if (!this.createOrder(orderPrefab)) {
                break;
            }
        }

        this.relayoutOrders(false);
    }

    // The first visible order of this type that still has an unclaimed slot. Claimed fish are
    // already on the way, so a second rapid tap must not reserve the same placeholder.
    findMatchingOrder(fishId: number): Order | null {
        return this.orders.find(order => order.id === fishId && !order.isFullyClaimed) ?? null;
    }

    completeOrder(order: Order): number | null {
        const index = this.orders.indexOf(order);
        if (index === -1) {
            return null;
        }

        AudioManager.instance.playOneShot('BoxClear');
        EventBus.emit(GameEvents.MATCHED);

        // Unity removes the completed order from its active slot before choosing the replacement,
        // so its old id must not count as an already-open order for this pick.
        const nextId = this.pickNextOrderId(order);
        if (nextId !== null) {
            const requiredCount = this.reserveOrderFish(nextId);
            order.reset(nextId, requiredCount);
            this.recordCreatedOrder(nextId);
            return nextId;
        }

        this.orders.splice(index, 1);
        this._relayoutTweens.delete(order);
        order.node.destroy();
        this.relayoutOrders(true);
        return null;
    }

    // Port of Unity's no-AB-config path in OrdersManager.PickNextOrderItemId:
    // 1) only types with reachable fish can be considered;
    // 2) require a full order when possible, otherwise allow the last partial order;
    // 3) avoid a long same-id run, then avoid an id already on screen, only relaxing a rule
    //    when no candidate can satisfy it;
    // 4) Unity falls back to a random survivor when no difficulty curve is configured.
    private pickNextOrderId(excluding: Order | null = null): number | null {
        if (this._pendingCounts.size === 0) {
            return null;
        }

        const reachableCounts = this.collectReachableCounts(excluding);
        const ids = Array.from(this._pendingCounts.keys());
        let candidates = ids.filter(id =>
            (reachableCounts.get(id) ?? 0) >= Math.min(OrderManager.FISH_PER_ORDER, this._pendingCounts.get(id) ?? 0),
        );
        if (candidates.length === 0) {
            candidates = ids.filter(id => (reachableCounts.get(id) ?? 0) > 0);
        }
        if (candidates.length === 0) {
            return null;
        }

        const withinRunLimit = (id: number) =>
            id !== this._lastCreatedId || this._sameOrderRun < this.maxSameOrderInARow;
        const notAlreadyOpen = (id: number) => !this.orders.some(order => order !== excluding && order.id === id);
        candidates = this.filterByPriority(candidates, [withinRunLimit, notAlreadyOpen]);

        return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    }

    private createOrder(orderPrefab: Prefab): boolean {
        const id = this.pickNextOrderId();
        if (id === null) {
            return false;
        }

        const requiredCount = this.reserveOrderFish(id);
        const orderNode = instantiate(orderPrefab);
        orderNode.setParent(this.orderContainer);

        const order = orderNode.getComponent(Order);
        if (!order) {
            console.error('[OrderManager] Order prefab is missing its Order component.');
            orderNode.destroy();
            return false;
        }

        order.initialize(id, requiredCount);
        this.orders.push(order);
        this.recordCreatedOrder(id);
        return true;
    }

    private reserveOrderFish(id: number): number {
        const available = this._pendingCounts.get(id) ?? 0;
        const requiredCount = Math.min(OrderManager.FISH_PER_ORDER, available);
        const remaining = available - requiredCount;
        if (remaining > 0) {
            this._pendingCounts.set(id, remaining);
        } else {
            this._pendingCounts.delete(id);
        }
        return requiredCount;
    }

    private collectReachableCounts(excluding: Order | null = null): Map<number, number> {
        const counts = new Map<number, number>();
        this._bubbleManager?.collectReachableFishCounts(counts);
        this._slotManager?.collectWaitingFishCounts(counts);

        // Fish claimed by an order are still visually in flight or already in its bowl; remove
        // them from the available source exactly as Unity subtracts RequiredCount - CurrentCount.
        for (const order of this.orders) {
            if (order === excluding) {
                continue;
            }
            const available = (counts.get(order.id) ?? 0) - order.remainingCount;
            counts.set(order.id, available);
        }
        return counts;
    }

    private filterByPriority(candidates: number[], predicatesWeakToStrong: Array<(id: number) => boolean>): number[] {
        for (let dropped = 0; dropped < predicatesWeakToStrong.length; dropped++) {
            const survivors = candidates.filter(id =>
                predicatesWeakToStrong.slice(dropped).every(predicate => predicate(id)),
            );
            if (survivors.length > 0) {
                return survivors;
            }
        }
        return candidates;
    }

    private recordCreatedOrder(id: number): void {
        this._sameOrderRun = id === this._lastCreatedId ? this._sameOrderRun + 1 : 1;
        this._lastCreatedId = id;
    }

    private relayoutOrders(animate: boolean): void {
        const startX = -(this.orders.length - 1) * this.spacing * 0.5;
        this.orders.forEach((order, index) => {
            const targetX = startX + index * this.spacing;
            this._relayoutTweens.get(order)?.stop();
            if (animate) {
                const slide = tween(order.node)
                    .to(this.relayoutDuration, { position: new Vec3(targetX, 0, 0) }, { easing: 'quadOut' })
                    .call(() => { this._relayoutTweens.delete(order); })
                    .start();
                this._relayoutTweens.set(order, slide);
            } else {
                this._relayoutTweens.delete(order);
                order.node.setPosition(targetX, 0, 0);
            }
        });
    }
}
