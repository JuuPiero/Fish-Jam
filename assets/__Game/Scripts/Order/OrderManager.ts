import { _decorator, Component, instantiate, Node, Vec3 } from 'cc';
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

    @property({ tooltip: 'How many order slots exist on the belt at once - set higher than what fits on screen (e.g. 6+) for a smooth continuous loop' })
    count: number = 6;

    @property({ tooltip: 'Conveyor scroll speed, in units/second, moving right to left' })
    beltSpeed: number = 60;

    @property({ type: Node, tooltip: 'Marks where an order wraps back around to the right side of the belt - drag this to wherever "off-screen left" should be' })
    leftLimitNode: Node = null;

    @property({ tooltip: 'How many of the belt\'s leftmost slot positions (spacing apart, starting at leftLimitNode) count as "in view"/matchable - the rest are still queued up further right' })
    visibleSlotCount: number = 4;

    @property({type: [Order], readonly: true}) orders: Order[] = []

    // Match-3: an order is fulfilled by delivering this many fish of the same id (matches the
    // number of placeholder slots on the Order prefab).
    private static readonly FISH_PER_ORDER = 3;

    // Order ids still waiting for a slot to free up.
    private _queue: number[] = [];

    // spacing * however many order slots actually spawned - an order wrapping past the left
    // limit jumps forward by exactly this much, so the belt's spacing stays even through the
    // wrap instead of snapping to some fixed "start" position.
    private _beltLength = 0;

    // leftLimitNode's X, converted once into orderContainer's local space so the per-frame belt
    // math below stays simple local-X arithmetic instead of a world<->local conversion for every
    // order every frame.
    private _leftLimit = 0;

    // How many fish are currently mid-flight toward an order. The belt freezes entirely while
    // this is above 0 - Fish.flyToOrder() snapshots its destination once at the start of the
    // flight, so a moving order would leave the fish landing wherever that slot used to be.
    private _activeFlights = 0;

    // Call right before sending a fish toward an order (see GameManager.routeFish), and
    // endFlight() once it lands - pairs of these may overlap if more than one fish is flying at
    // once, so the belt only resumes once every in-flight fish has arrived.
    beginFlight() {
        this._activeFlights++;
    }

    endFlight() {
        this._activeFlights = Math.max(0, this._activeFlights - 1);
    }

    initialize(levelData: LevelData) {
        for (const child of this.orderContainer.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this.orders = [];

        const leftLocal = new Vec3();
        this.orderContainer.inverseTransformPoint(leftLocal, this.leftLimitNode.worldPosition);
        this._leftLimit = leftLocal.x;

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;

        const fishIds: number[] = [];
        for (const bubble of levelData.bubbles) {
            fishIds.push(...bubble.fishes);
        }

        // One order per every 3 fish of the same id. Round-robin across distinct ids (id A, id
        // B, id C, id A again, ...) instead of grouping every copy of the same id consecutively,
        // so the belt never lines up several identical orders in a row - each repeat of an id is
        // always separated by every other distinct id at least once.
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
        const remainingOrdersForId = new Map<number, number>();
        for (const id of idsInOrder) {
            remainingOrdersForId.set(id, Math.floor((remainingCount.get(id) ?? 0) / OrderManager.FISH_PER_ORDER));
        }
        const orderIds: number[] = [];
        let addedAny = true;
        while (addedAny) {
            addedAny = false;
            for (const id of idsInOrder) {
                const remaining = remainingOrdersForId.get(id) ?? 0;
                if (remaining > 0) {
                    orderIds.push(id);
                    remainingOrdersForId.set(id, remaining - 1);
                    addedAny = true;
                }
            }
        }

        const visibleCount = Math.min(this.count, orderIds.length);
        this._queue = orderIds.slice(visibleCount);

        this._beltLength = this.spacing * visibleCount;
        for (let i = 0; i < visibleCount; i++) {
            const orderNode = instantiate(orderPrefab);
            orderNode.setParent(this.orderContainer);
            orderNode.setPosition(this._leftLimit + i * this.spacing, 0, 0);

            const order = orderNode.getComponent(Order);
            order.initialize(orderIds[i]);
            this.orders.push(order);
        }
    }

    update(dt: number) {
        if (this._beltLength <= 0 || this._activeFlights > 0) {
            return;
        }
        const delta = this.beltSpeed * dt;
        for (const order of this.orders) {
            const pos = order.node.position;
            const wasVisible = this.isInView(pos.x);
            let x = pos.x - delta;
            if (x < this._leftLimit) {
                x += this._beltLength;
            }
            order.node.setPosition(x, pos.y, pos.z);

            // Only just now scrolled into view - it may already have a fish waiting on the
            // bench for its id from before it was visible. GameManager's ORDER_READY handler
            // pulls any it finds, exactly as it does right after an order resets to a new id.
            if (!wasVisible && this.isInView(x)) {
                EventBus.emit(GameEvents.ORDER_READY, order);
            }
        }
    }

    // True for whichever slot position an order currently sits at - the leftmost visibleSlotCount
    // positions (0, 1, 2, 3 spacings from leftLimitNode) count as "in view"/matchable; anything
    // further right is still queued up off-screen, however close it visually looks to arriving.
    private isInView(x: number): boolean {
        return x >= this._leftLimit && x < this._leftLimit + this.visibleSlotCount * this.spacing;
    }

    // The first order asking for this fish id that still has an unclaimed slot AND is currently
    // scrolled into view, if any. Checks isFullyClaimed (not isComplete) so a slot already
    // promised to an in-flight fish can't also get a second fish sent to it before the first one
    // lands. An off-screen order (still queued up on the belt) isn't a valid target yet - see
    // update(), which pulls any waiting bench fish once it actually scrolls into view.
    findMatchingOrder(fishId: number): Order | null {
        return this.orders.find(order => order.id === fishId && !order.isFullyClaimed && this.isInView(order.node.position.x)) ?? null;
    }

    // Call once `order` has been fully delivered. Reuses its slot for the next queued fish id
    // and returns that id, or destroys the order (returning null) if the level has none left.
    completeOrder(order: Order): number | null {
        const index = this.orders.indexOf(order);
        if (index === -1) {
            return null;
        }
        AudioManager.instance.playOneShot('BoxClear')
        // Every completed order counts toward level progress. This must happen before checking
        // the queue: the final visible orders have no replacement, but are still valid matches.
        EventBus.emit(GameEvents.MATCHED);

        const nextId = this._queue.shift();
        if (nextId === undefined) {
            this.orders.splice(index, 1);
            order.node.destroy();
            return null;
        }

        order.reset(nextId);
        return nextId;
    }
}
