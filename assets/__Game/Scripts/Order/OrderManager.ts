import { _decorator, Component, instantiate, Node, Prefab, Vec3 } from 'cc';
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

    @property({ tooltip: 'How many order slots exist on the belt at once - set higher than what fits on screen (e.g. 6+) so there is always a queued order ready to scroll into view' })
    count: number = 4;

    @property({ tooltip: 'Unity GeneralDifficulty.maxSameOrderInARow fallback.' })
    maxSameOrderInARow: number = 2;

    @property({ tooltip: 'Conveyor scroll speed, in units/second, moving right to left' })
    beltSpeed: number = 60;

    @property({ type: Node, tooltip: 'Marks where an order wraps back around to the right side of the belt - drag this to wherever "off-screen left" should be' })
    leftLimitNode: Node = null;

    @property({ type: Node, tooltip: 'Left edge of the zone an order must be within for fish to be able to fly to it - independent of leftLimitNode (the belt wrap point)' })
    interactableLeftNode: Node = null;

    @property({ type: Node, tooltip: 'Right edge of the zone an order must be within for fish to be able to fly to it' })
    interactableRightNode: Node = null;

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

    // spacing * however many order slots actually spawned - an order wrapping past the left
    // limit jumps forward by exactly this much, so the belt's spacing stays even through the wrap
    // instead of snapping to some fixed "start" position.
    private _beltLength = 0;

    // leftLimitNode/interactableLeftNode/interactableRightNode's X, converted once into
    // orderContainer's local space so the per-frame belt math below stays simple local-X
    // arithmetic instead of a world<->local conversion for every order every frame.
    private _leftLimit = 0;
    private _interactableLeft = 0;
    private _interactableRight = 0;

    // How many fish are currently mid-flight toward an order. The belt freezes entirely while
    // this is above 0 - Fish.flyToOrder() snapshots its destination once at the start of the
    // flight, so a moving order would leave the fish landing wherever that slot used to be.
    private _activeFlights = 0;

    // The belt stays frozen until the player's very first tap - same moment TutorialController
    // marks its hint as done - so the hand has something stationary to point at instead of a
    // target that immediately starts sliding away.
    private _beltEnabled = false;

    get totalOrderCount(): number {
        return this._totalOrderCount;
    }

    protected onEnable(): void {
        EventBus.on(GameEvents.FISH_CLICKED, this.onFishClicked);
    }

    protected onDisable(): void {
        EventBus.off(GameEvents.FISH_CLICKED, this.onFishClicked);
    }

    private onFishClicked = () => {
        this._beltEnabled = true;
    }

    // Call right before sending a fish toward an order (see GameManager.routeFish), and
    // endFlight() once it lands - pairs of these may overlap if more than one fish is flying at
    // once, so the belt only resumes once every in-flight fish has arrived.
    beginFlight() {
        this._activeFlights++;
    }

    endFlight() {
        this._activeFlights = Math.max(0, this._activeFlights - 1);
    }

    initialize(levelData: LevelData, bubbleManager?: BubbleManager, slotManager?: SlotManager): void {
        for (const child of this.orderContainer.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        this.orders = [];
        this._pendingCounts.clear();
        this._bubbleManager = bubbleManager ?? null;
        this._slotManager = slotManager ?? null;
        this._lastCreatedId = -1;
        this._sameOrderRun = 0;
        this._beltEnabled = false;

        const leftLocal = new Vec3();
        this.orderContainer.inverseTransformPoint(leftLocal, this.leftLimitNode.worldPosition);
        this._leftLimit = leftLocal.x;

        const interactableLeftLocal = new Vec3();
        this.orderContainer.inverseTransformPoint(interactableLeftLocal, this.interactableLeftNode.worldPosition);
        this._interactableLeft = interactableLeftLocal.x;
        const interactableRightLocal = new Vec3();
        this.orderContainer.inverseTransformPoint(interactableRightLocal, this.interactableRightNode.worldPosition);
        this._interactableRight = interactableRightLocal.x;

        for (const bubble of levelData.bubbles) {
            for (const fishId of bubble.fishes) {
                this._pendingCounts.set(fishId, (this._pendingCounts.get(fishId) ?? 0) + 1);
            }
        }
        this._totalOrderCount = Array.from(this._pendingCounts.values())
            .reduce((total, fishCount) => total + Math.ceil(fishCount / OrderManager.FISH_PER_ORDER), 0);

        this._beltLength = this.spacing * this.count;

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;
        for (let slotIndex = 0; slotIndex < this.count; slotIndex++) {
            if (!this.createOrder(orderPrefab, this._leftLimit + slotIndex * this.spacing)) {
                break;
            }
        }
    }

    update(dt: number) {
        if (!this._beltEnabled || this._beltLength <= 0 || this._activeFlights > 0) {
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

    // True while an order sits between interactableLeftNode and interactableRightNode - the only
    // zone fish are allowed to fly into it from. This is independent of leftLimitNode (which only
    // controls where an order wraps back around the belt), so it can be a narrower window
    // wherever on screen actually makes sense for gameplay.
    private isInView(x: number): boolean {
        return x >= this._interactableLeft && x <= this._interactableRight;
    }

    // The first order of this type that still has an unclaimed slot AND is currently scrolled
    // into view, if any. Claimed fish are already on the way, so a second rapid tap must not
    // reserve the same placeholder. An off-screen order (still queued up on the belt) isn't a
    // valid target yet - see update(), which pulls any waiting bench fish once it actually
    // scrolls into view.
    findMatchingOrder(fishId: number): Order | null {
        return this.orders.find(order => order.id === fishId && !order.isFullyClaimed && this.isInView(order.node.position.x)) ?? null;
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
        order.node.destroy();
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

    private createOrder(orderPrefab: Prefab, x: number): boolean {
        const id = this.pickNextOrderId();
        if (id === null) {
            return false;
        }

        const requiredCount = this.reserveOrderFish(id);
        const orderNode = instantiate(orderPrefab);
        orderNode.setParent(this.orderContainer);
        orderNode.setPosition(x, 0, 0);

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
}
