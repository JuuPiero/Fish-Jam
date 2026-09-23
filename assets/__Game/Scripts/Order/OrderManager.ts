import { _decorator, Component, instantiate, Node, tween, Tween, Vec3 } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Order } from './Order';
import { LevelData } from '../Data/LevelData';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
import { AudioManager } from 'db://assets/_iKame/Scripts/Audio/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('OrderManager')
export class OrderManager extends Component {
    @property(Node) orderContainer: Node = null;
    @property spacing: number = 0;
    @property count: number = 4;

    @property({tooltip: 'Seconds for the row to slide into its re-centered layout when the visible count changes'})
    relayoutDuration: number = 0.25;

    @property({type: [Order], readonly: true}) orders: Order[] = []

    // Match-3: an order is fulfilled by delivering this many fish of the same id (matches the
    // number of placeholder slots on the Order prefab).
    private static readonly FISH_PER_ORDER = 3;

    // Order ids still waiting for a visible slot to free up.
    private _queue: number[] = [];

    // Orders that finished but had nowhere to go - every remaining queued id was already showing
    // on another visible order at the time. Kept alive (as a child of orderContainer) but
    // deactivated, so the game never shows two orders asking for the same fish id at once; a
    // pending order gets reactivated and reset() once one of those duplicate ids frees up.
    private _pendingOrders: Order[] = [];

    // Tracks each order's own in-flight relayout slide, if any, so a new one can stop just that
    // tween - Order's own node also carries its pop-in scale/shake tweens, and Tween.stopAllByTarget
    // would wrongly cancel those too if a relayout happens to land while one is still playing.
    private _relayoutTweens = new Map<Order, Tween<Node>>();

    initialize(levelData: LevelData) {
        for (const child of this.orderContainer.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this.orders = [];
        this._pendingOrders = [];

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;

        const fishIds: number[] = [];
        for (const bubble of levelData.bubbles) {
            fishIds.push(...bubble.fishes);
        }

        const remainingCount = new Map<number, number>();
        for (const id of fishIds) {
            remainingCount.set(id, (remainingCount.get(id) ?? 0) + 1);
        }

        const idsInOrder: number[] = [];
        const seen = new Set<number>();
        for (const id of fishIds) {
            if (seen.has(id)) {
                continue;
            }
            seen.add(id);
            idsInOrder.push(id);
        }

        // Round-robin the order queue across distinct ids (id A, id B, id C, id A again, ...)
        // instead of grouping every copy of the same id consecutively. That guarantees the
        // FIRST pass through all qualifying ids - i.e. the first `distinctIdsWithOrders` entries
        // - are all distinct, so capping the initial visible batch at that count (below) can
        // never show the same id twice at once, even when a level has enough of one fish for
        // multiple orders of it.
        const remainingOrdersForId = new Map<number, number>();
        let distinctIdsWithOrders = 0;
        for (const id of idsInOrder) {
            const ordersForId = Math.floor((remainingCount.get(id) ?? 0) / OrderManager.FISH_PER_ORDER);
            remainingOrdersForId.set(id, ordersForId);
            if (ordersForId > 0) {
                distinctIdsWithOrders++;
            }
        }
        const queue: number[] = [];
        let addedAny = true;
        while (addedAny) {
            addedAny = false;
            for (const id of idsInOrder) {
                const remaining = remainingOrdersForId.get(id) ?? 0;
                if (remaining > 0) {
                    queue.push(id);
                    remainingOrdersForId.set(id, remaining - 1);
                    addedAny = true;
                }
            }
        }

        const visibleCount = Math.min(this.count, distinctIdsWithOrders);
        this._queue = queue.slice(visibleCount);

        for (let i = 0; i < visibleCount; i++) {
            const orderNode = instantiate(orderPrefab);
            orderNode.setParent(this.orderContainer);

            const order = orderNode.getComponent(Order);
            order.initialize(queue[i]);
            this.orders.push(order);
        }
        // Snap straight to a centered row sized for however many orders actually spawned, rather
        // than always assuming `count` slots - a level with fewer distinct ids than `count` just
        // shows a shorter, still-centered row instead of a left-shifted partial one.
        this.relayoutOrders(false);
    }

    // The first order asking for this fish id that still has an unclaimed slot, if any. Checks
    // isFullyClaimed (not isComplete) so a slot already promised to an in-flight fish can't
    // also get a second fish sent to it before the first one lands.
    findMatchingOrder(fishId: number): Order | null {
        return this.orders.find(order => order.id === fishId && !order.isFullyClaimed) ?? null;
    }

    // Call once `order` has been fully delivered. Reuses its slot for the next queued fish id
    // that isn't already showing on another visible order, or destroys the order (returning
    // null) if the level has none left to give it at all. Returns null too if every remaining
    // queued id is currently a duplicate - `order` is kept alive but hidden in that case (see
    // fillPendingOrders()) rather than shown with a repeated id.
    completeOrder(order: Order): number | null {
        const index = this.orders.indexOf(order);
        if (index === -1) {
            return null;
        }
        AudioManager.instance.playOneShot('BoxClear')
        // Every completed order counts toward level progress. This must happen before checking
        // the queue: the final visible orders have no replacement, but are still valid matches.
        EventBus.emit(GameEvents.MATCHED);

        const nextId = this.takeNextAvailableId(order);
        if (nextId !== null) {
            order.reset(nextId);
            // This order's old id just went away - that may be exactly what a hidden order was
            // waiting on.
            this.fillPendingOrders();
            return nextId;
        }

        if (this._queue.length === 0) {
            this.orders.splice(index, 1);
            this._relayoutTweens.delete(order);
            order.node.destroy();
            // One fewer order left for the rest of the level - slide the remaining ones back
            // into a centered row instead of leaving a gap where this one used to be.
            this.relayoutOrders(true);
            return null;
        }

        // Every id still in the queue is already showing on another visible order right now -
        // hide this slot instead of duplicating one of them; completeOrder() on whichever
        // duplicate finishes first will free its id and pull this order back in via
        // fillPendingOrders().
        order.node.active = false;
        this._pendingOrders.push(order);
        this.relayoutOrders(true);
        return null;
    }

    // Removes and returns the first queued id not already shown by any OTHER currently visible
    // (non-pending) order, or null if the queue is empty or every remaining id is a duplicate.
    private takeNextAvailableId(excluding: Order): number | null {
        const activeIds = new Set(
            this.orders
                .filter(candidate => candidate !== excluding && this._pendingOrders.indexOf(candidate) === -1)
                .map(candidate => candidate.id),
        );
        for (let i = 0; i < this._queue.length; i++) {
            if (!activeIds.has(this._queue[i])) {
                return this._queue.splice(i, 1)[0];
            }
        }
        return null;
    }

    // An id just freed up - see if any hidden order can finally be shown with something.
    private fillPendingOrders() {
        let filledAny = false;
        for (let i = this._pendingOrders.length - 1; i >= 0; i--) {
            const pending = this._pendingOrders[i];
            const nextId = this.takeNextAvailableId(pending);
            if (nextId === null) {
                continue;
            }
            this._pendingOrders.splice(i, 1);
            pending.node.active = true;
            pending.reset(nextId);
            filledAny = true;
        }
        if (filledAny) {
            this.relayoutOrders(true);
        }
    }

    // Slides every currently visible order into a horizontally centered row, sized for however
    // many are actually visible right now (active orders minus hidden/pending ones) instead of
    // always assuming `count` slots - keeps the row centered as orders get destroyed near the
    // end of a level, or hidden/reactivated while waiting out a duplicate id.
    private relayoutOrders(animate: boolean) {
        const visible = this.orders.filter(order => order.node.active);
        const startX = -(visible.length - 1) * this.spacing * 0.5;
        visible.forEach((order, i) => {
            const targetX = startX + i * this.spacing;
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
