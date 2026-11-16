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
import { DiffCurveType } from '../DiffCurveType';
const { ccclass, property } = _decorator;

@ccclass('OrderManager')
export class OrderManager extends Component {
    @property(Node) orderContainer: Node = null;
    @property spacing: number = 0;
    @property count: number = 4;

    @property({tooltip: 'Seconds for the row to slide into its re-centered layout when the visible count changes'})
    relayoutDuration: number = 0.25;

    @property({ tooltip: 'Only applies when LevelManager.diffCurveType is not None - caps how many times in a row the same fish id can be (re)assigned to a freed order slot.' })
    maxSameOrderInARow: number = 2;

    @property({ tooltip: 'Custom curve: end of the easy stretch, as a share of the fish tapped (0-1).' })
    customEasyEnd: number = 0.15;

    @property({ tooltip: 'Custom curve: end of the first pressure stretch, as a share of the fish tapped (0-1).' })
    customPressureEnd: number = 0.35;

    @property({ tooltip: 'Custom curve: end of the relief stretch; from here to the end the pressure rises and the player may lose.' })
    customReliefEnd: number = 0.5;

    @property({ tooltip: 'Custom curve, first pressure stretch: the one automatic rescue fires when this many wait slots are taken.' })
    customRescueAtSlots: number = 3;

    @property({ tooltip: 'Custom curve: how many easy, slot-draining orders follow the rescue.' })
    customDrainOrders: number = 2;

    @property({ tooltip: 'Custom curve, late stretch: an order may only need fish from this many of the next bubbles to spawn, so it never waits on a fish buried far down the queue.' })
    customQueueReach: number = 3;

    @property({type: [Order], readonly: true}) orders: Order[] = []

    // Match-3: an order is fulfilled by delivering this many fish of the same id (matches the
    // number of placeholder slots on the Order prefab).
    private static readonly FISH_PER_ORDER = 3;

    // --- DiffCurveType.None path below: today's original behavior, kept byte-for-byte. ---

    // Order ids still waiting for a visible slot to free up.
    private _queue: number[] = [];

    // Orders that finished but had nowhere to go - every remaining queued id was already showing
    // on another visible order at the time. Kept alive (as a child of orderContainer) but
    // deactivated, so the game never shows two orders asking for the same fish id at once; a
    // pending order gets reactivated and reset() once one of those duplicate ids frees up.
    private _pendingOrders: Order[] = [];

    // --- DiffCurveType.Easy/Normal/Hard path below: reachability-aware picker. ---

    // Fish not yet assigned to an order. Unity calls this pendingCounts and decrements it only
    // when an order is actually created, not when the player taps one of its fish.
    private _pendingCounts = new Map<number, number>();
    private _lastCreatedId = -1;
    private _sameOrderRun = 0;
    private _bubbleManager: BubbleManager | null = null;
    private _slotManager: SlotManager | null = null;
    private _diffCurveType: DiffCurveType = DiffCurveType.None;

    // --- DiffCurveType.Custom: progress is the share of the level's fish the player has tapped. ---
    private _totalFish = 0;
    private _tappedFish = 0;
    private _rescueUsed = false;
    private _drainOrdersLeft = 0;

    protected onEnable(): void {
        EventBus.on(GameEvents.FISH_CLICKED, this.onFishTapped);
    }

    protected onDisable(): void {
        EventBus.off(GameEvents.FISH_CLICKED, this.onFishTapped);
    }

    private onFishTapped = (): void => {
        this._tappedFish++;
    };

    // Custom curve, first pressure stretch: the rescue fires once, the first time the wait slots
    // fill up to customRescueAtSlots.
    update(): void {
        if (this._diffCurveType !== DiffCurveType.Custom || this._rescueUsed || this.customPhase() !== 1) {
            return;
        }
        if ((this._slotManager?.getOccupiedCount() ?? 0) >= this.customRescueAtSlots) {
            this.rescue();
        }
    }

    // Tracks each order's own in-flight relayout slide, if any, so a new one can stop just that
    // tween - Order's own node also carries its pop-in scale/shake tweens, and Tween.stopAllByTarget
    // would wrongly cancel those too if a relayout happens to land while one is still playing.
    private _relayoutTweens = new Map<Order, Tween<Node>>();

    initialize(levelData: LevelData, bubbleManager?: BubbleManager, slotManager?: SlotManager, diffCurveType: DiffCurveType = DiffCurveType.None) {
        for (const child of this.orderContainer.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this.orders = [];
        this._pendingOrders = [];
        this._relayoutTweens.clear();
        this._bubbleManager = bubbleManager ?? null;
        this._slotManager = slotManager ?? null;
        this._diffCurveType = diffCurveType;
        this._totalFish = levelData.getTotalFishes();
        this._tappedFish = 0;
        this._rescueUsed = false;
        this._drainOrdersLeft = 0;

        const orderPrefab = ServiceLocator.get(GameConfigSA).orderPrefab;

        if (this._diffCurveType === DiffCurveType.None) {
            this.initializeClassic(levelData, orderPrefab);
            return;
        }

        this._pendingCounts.clear();
        this._lastCreatedId = -1;
        this._sameOrderRun = 0;
        for (const bubble of levelData.bubbles) {
            for (const fishId of bubble.fishes) {
                this._pendingCounts.set(fishId, (this._pendingCounts.get(fishId) ?? 0) + 1);
            }
        }

        for (let slotIndex = 0; slotIndex < this.count; slotIndex++) {
            if (!this.createOrder(orderPrefab)) {
                break;
            }
        }
        this.relayoutOrders(false);
    }

    // Original round-robin queue setup - only reached when diffCurveType is None, kept exactly as
    // it was before the difficulty curve existed.
    private initializeClassic(levelData: LevelData, orderPrefab: Prefab) {
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

    // Call once `order` has been fully delivered. Reuses its slot for the next fish id the level
    // still owes an order, or destroys the order (returning null) if there's none left to give it.
    completeOrder(order: Order): number | null {
        const index = this.orders.indexOf(order);
        if (index === -1) {
            return null;
        }
        AudioManager.instance.playOneShot('BoxClear')
        // Every completed order counts toward level progress. This must happen before checking
        // the queue: the final visible orders have no replacement, but are still valid matches.
        EventBus.emit(GameEvents.MATCHED);

        if (this._diffCurveType === DiffCurveType.None) {
            return this.completeOrderClassic(order, index);
        }

        // Unity removes the completed order from its active slot before choosing the replacement,
        // so its old id must not count as an already-open order for this pick.
        const nextId = this.pickNextOrderId(order);
        if (nextId !== null) {
            const requiredCount = this.reserveOrderFish(nextId);
            order.reset(nextId, requiredCount);
            this.recordCreatedOrder(nextId);
            if (this._diffCurveType === DiffCurveType.Custom && this.customPhase() === 2) {
                this.promoteNeededBubbles();
            }
            return nextId;
        }

        this.orders.splice(index, 1);
        this._relayoutTweens.delete(order);
        order.node.destroy();
        this.relayoutOrders(true);
        return null;
    }

    // Original duplicate-hiding completion flow - only reached when diffCurveType is None.
    private completeOrderClassic(order: Order, index: number): number | null {
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
            pending.reset(nextId, undefined, true);
            filledAny = true;
        }
        if (filledAny) {
            this.relayoutOrders(true);
        }
    }

    // Port of Unity's OrdersManager.PickNextOrderItemId, with the reachability requirement eased
    // or dropped entirely depending on diffCurveType (see filterByReachability). Duplicate-avoidance
    // and the same-id-run limit are resolved FIRST, before reachability even gets a say - otherwise
    // a bubble that happens to be "ready to go" for id X could get X offered to two order slots at
    // once (the first order claims X; the second slot's pick still sees that same bubble sitting
    // there, since nothing is actually removed from it until the player pops it). Only once no
    // other id can satisfy those two rules at all does a duplicate/overused id get allowed back in.
    private pickNextOrderId(excluding: Order | null = null): number | null {
        if (this._pendingCounts.size === 0) {
            return null;
        }

        const ids = Array.from(this._pendingCounts.keys());
        const notAlreadyOpen = (id: number) => !this.orders.some(order => order !== excluding && order.id === id);

        // Easy's whole point is always handing over the single easiest pick available. Enforcing
        // the run-limit there would fight that goal directly: once an abundant, bubble-complete id
        // wins the reachability check twice in a row, the run-limit would forcibly evict it in
        // favor of some type that hasn't surfaced yet and is often much LESS reachable - which is
        // exactly backwards for Easy. Only Normal/Hard keep it, where some forced variety is an
        // intentional part of the added challenge.
        const withinRunLimit = (id: number) =>
            id !== this._lastCreatedId || this._sameOrderRun < this.maxSameOrderInARow;
        const dedupeRules = this.picksEasily()
            ? [notAlreadyOpen]
            : [withinRunLimit, notAlreadyOpen];
        const idPool = this.filterByPriority(ids, dedupeRules);

        const candidates = this.filterByReachability(idPool, excluding);
        if (candidates.length === 0) {
            return null;
        }

        // Easy stays deterministic - always the single best option (see filterByReachability) - so
        // a level's easiest path is reliably repeatable. Normal/Hard instead roll randomly among
        // whichever candidates tied for best under their own tier's bar: always taking the same
        // "first declared in the level" id on every tie made replays feel oddly rigid, as if some
        // fish types were being favored or ignored outright rather than the tier's difficulty rule
        // actually doing the work - rolling among the tie lets the same level play out differently
        // from one attempt to the next.
        if (this.picksEasily()) {
            return candidates[0];
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Easy, and the custom curve's easy, relief and draining picks: no run limit, no random tie roll.
    private picksEasily(): boolean {
        if (this._diffCurveType === DiffCurveType.Easy) {
            return true;
        }
        if (this._diffCurveType !== DiffCurveType.Custom) {
            return false;
        }
        const phase = this.customPhase();
        return this._drainOrdersLeft > 0 || phase === 0 || phase === 2;
    }

    // The actual difficulty knob: how much a candidate id is required to already be reachable -
    // on screen right now, either still inside a bubble or already waiting on the bench - before
    // it's allowed to become the next order. Every tier is built on the same safety net: if
    // nothing in `ids` is currently reachable at all, fall back to `ids` itself unfiltered rather
    // than returning empty. Without that, a tier that insists on reachability could make
    // pickNextOrderId return null and destroy/stall an order slot outright whenever the board
    // temporarily has nothing visible for any remaining type - not just unhelpful, but a real way
    // to lose progress through no fault of the player's. Reachability can be preferred, never
    // required to the point of refusing to spawn anything.
    // - Easy: strongest preference goes to an id some single on-screen bubble can finish by itself
    //   outright (one pop = a complete order); otherwise, picks whichever reachable id simply has
    //   the MOST fish visible right now, summed across bubbles/bench. Ranking by raw abundance
    //   (instead of a flat "enough for a full order, else just 1 is fine" cutoff) matters a lot in
    //   practice: once nothing fully qualifies, a flat cutoff falls back to the first id with even
    //   a single reachable fish, which can and does commit a fresh order to something with only 1
    //   fish on screen while another type sits there with 5+ - leaving the order stuck waiting on
    //   its last couple fish to ever surface. Picking the max-abundance id instead keeps giving the
    //   player the genuinely easiest option on screen every time, not just a bare-minimum one.
    // - Normal: requires enough reachable fish to fill the WHOLE order (scattered across
    //   bubbles/bench is fine) as a real bar to clear - but, unlike Easy, doesn't then rank
    //   qualifiers by abundance, just takes the first one that clears the bar. That makes it
    //   harder than a straight "always grab the single most abundant id": a candidate with 3
    //   reachable can lose out to an earlier-declared one that also has 3, even if a third id has
    //   8. Only falls back to ranking by raw abundance when nothing fully clears the bar.
    // - Hard: a light nudge toward abundance - just avoids settling for an id that's barely hanging
    //   on with exactly 1 reachable fish when another candidate has a more comfortable cushion (2,
    //   or however many the order even needs if it needs fewer), without chasing the outright
    //   maximum the way Normal/Easy do.
    private filterByReachability(ids: number[], excluding: Order | null): number[] {
        if (this._diffCurveType === DiffCurveType.Custom) {
            return this.filterCustom(ids, excluding);
        }
        const reachableCounts = this.collectReachableCounts(excluding);
        const reachable = ids.filter(id => (reachableCounts.get(id) ?? 0) > 0);
        if (reachable.length === 0) {
            return ids;
        }

        const requiredFor = (id: number) => Math.min(OrderManager.FISH_PER_ORDER, this._pendingCounts.get(id) ?? 0);
        const maxReachableAmong = (pool: number[]) => {
            const max = Math.max(0, ...pool.map(id => reachableCounts.get(id) ?? 0));
            return pool.filter(id => (reachableCounts.get(id) ?? 0) === max);
        };

        if (this._diffCurveType === DiffCurveType.Hard) {
            const comfortable = reachable.filter(id => (reachableCounts.get(id) ?? 0) >= Math.min(2, requiredFor(id)));
            return comfortable.length > 0 ? comfortable : reachable;
        }

        if (this._diffCurveType === DiffCurveType.Normal) {
            const fullyReachable = reachable.filter(id => (reachableCounts.get(id) ?? 0) >= requiredFor(id));
            return fullyReachable.length > 0 ? fullyReachable : maxReachableAmong(reachable);
        }

        const instantWin = reachable.filter(id => (this._bubbleManager?.getMaxFishInSingleBubble(id) ?? 0) >= requiredFor(id));
        return instantWin.length > 0 ? instantWin : maxReachableAmong(reachable);
    }

    // 0: easy (to customEasyEnd), 1: pressure (to customPressureEnd), 2: relief (to customReliefEnd),
    // 3: rising pressure to the end. By the share of fish tapped, never by time.
    private customPhase(): number {
        const progress = this._totalFish > 0 ? this._tappedFish / this._totalFish : 0;
        if (progress < this.customEasyEnd) {
            return 0;
        }
        if (progress < this.customPressureEnd) {
            return 1;
        }
        return progress < this.customReliefEnd ? 2 : 3;
    }

    // The custom curve's pick, by phase. Every branch falls back to something non-empty, so it
    // never refuses to spawn an order.
    // - Drain (the orders after the rescue, the easy phase, the relief phase): ids with fish on
    //   the wait slots first, most of them first, so a finished order empties slots; otherwise the
    //   Easy pick (a bubble that finishes it alone, else the most fish on the board).
    // - Pressure: an id with some fish on the board but not enough, the rest still in bubbles that
    //   have not spawned, so the order sits half done and the slots fill while the player waits.
    // - Late: the same kind of short order, but only if the missing fish are in the next
    //   customQueueReach bubbles to spawn; failing that the fewest fish on the board that still
    //   completes. The player can lose, but never to an order that waits on a fish far down.
    private filterCustom(ids: number[], excluding: Order | null): number[] {
        const reach = this.collectReachableCounts(excluding);
        const requiredFor = (id: number) => Math.min(OrderManager.FISH_PER_ORDER, this._pendingCounts.get(id) ?? 0);
        const reachOf = (id: number) => reach.get(id) ?? 0;
        const reachable = ids.filter(id => reachOf(id) > 0);
        const pool = reachable.length > 0 ? reachable : ids;

        const easy = (): number[] => {
            const instantWin = pool.filter(id => (this._bubbleManager?.getMaxFishInSingleBubble(id) ?? 0) >= requiredFor(id));
            if (instantWin.length > 0) {
                return instantWin;
            }
            const max = Math.max(...pool.map(reachOf));
            return pool.filter(id => reachOf(id) === max);
        };
        const drain = (): number[] => {
            const bench = new Map<number, number>();
            this._slotManager?.collectWaitingFishCounts(bench);
            const onBench = ids.filter(id => (bench.get(id) ?? 0) > 0);
            if (onBench.length === 0) {
                return easy();
            }
            const max = Math.max(...onBench.map(id => bench.get(id) ?? 0));
            return onBench.filter(id => (bench.get(id) ?? 0) === max);
        };

        const phase = this.customPhase();
        if (this._drainOrdersLeft > 0) {
            this._drainOrdersLeft--;
            return drain();
        }
        if (phase === 0 || phase === 2) {
            return drain();
        }

        const queued = new Map<number, number>();
        this._bubbleManager?.collectQueuedFishCounts(queued, phase === 3 ? this.customQueueReach : Number.POSITIVE_INFINITY);
        const short = reachable.filter(id =>
            reachOf(id) < requiredFor(id) && reachOf(id) + (queued.get(id) ?? 0) >= requiredFor(id));
        if (short.length > 0) {
            return short;
        }
        if (phase === 1) {
            return pool;
        }
        const completes = reachable.filter(id => reachOf(id) >= requiredFor(id));
        if (completes.length === 0) {
            return easy();
        }
        const min = Math.min(...completes.map(reachOf));
        return completes.filter(id => reachOf(id) === min);
    }

    // Relief phase and after a rescue: the queued bubbles holding fish an open order still lacks
    // move to the front of the spawn queue.
    private promoteNeededBubbles(): void {
        if (!this._bubbleManager) {
            return;
        }
        const reach = this.collectReachableCounts();
        const needed = new Set<number>();
        for (const order of this.orders) {
            if (order.node.active && (reach.get(order.id) ?? 0) < 0) {
                needed.add(order.id);
            }
        }
        this._bubbleManager.promoteQueuedBubblesWith(needed);
    }

    // Gives an order a new id: the fish reserved for its old id go back to the pool first. Only
    // ever called on an order no fish has been sent to, so nothing is lost.
    private replaceOrderId(order: Order, nextId: number): void {
        if (order.requiredCount > 0) {
            this._pendingCounts.set(order.id, (this._pendingCounts.get(order.id) ?? 0) + order.requiredCount);
        }
        const requiredCount = this.reserveOrderFish(nextId);
        order.reset(nextId, requiredCount);
        this.recordCreatedOrder(nextId);
    }

    private isUntouched(order: Order): boolean {
        return order.node.active && order.claimedCount === 0 && !order.isBusy;
    }

    // The custom curve's one automatic rescue: each order nothing has been sent to yet, while some
    // fish on the wait slots has no order, is switched to the slot fish with the most copies
    // there (its pop-in pulls them off the slots); then the next customDrainOrders orders drain.
    private rescue(): void {
        this._rescueUsed = true;
        const bench = new Map<number, number>();
        this._slotManager?.collectWaitingFishCounts(bench);
        for (const order of this.orders) {
            const uncovered = Array.from(bench.keys())
                .filter(id => !this.orders.some(other => other.node.active && other.id === id))
                .sort((a, b) => (bench.get(b) ?? 0) - (bench.get(a) ?? 0));
            if (uncovered.length === 0) {
                break;
            }
            if (!this.isUntouched(order) || bench.has(order.id)) {
                continue;
            }
            const nextId = uncovered.find(id => (this._pendingCounts.get(id) ?? 0) > 0);
            if (nextId === undefined) {
                break;
            }
            this.replaceOrderId(order, nextId);
        }
        this._drainOrdersLeft = this.customDrainOrders;
        this.promoteNeededBubbles();
    }

    // Anti-stuck, asked by GameManager before it ends a stuck game. Custom curve before its last
    // stretch only (from customReliefEnd the player may lose): each order nothing has been sent to
    // whose fish the player cannot see is switched to the visible fish with the most copies.
    // Orders already filling up keep their id. True when something changed.
    tryUnstick(visibleCounts: Map<number, number>): boolean {
        if (this._diffCurveType !== DiffCurveType.Custom || this.customPhase() === 3) {
            return false;
        }
        let changed = false;
        for (const order of this.orders) {
            if (!this.isUntouched(order) || (visibleCounts.get(order.id) ?? 0) > 0) {
                continue;
            }
            const candidates = Array.from(visibleCounts.keys())
                .filter(id => (this._pendingCounts.get(id) ?? 0) > 0 || id === order.id)
                .filter(id => !this.orders.some(other => other !== order && other.node.active && other.id === id))
                .sort((a, b) => (visibleCounts.get(b) ?? 0) - (visibleCounts.get(a) ?? 0));
            if (candidates.length === 0) {
                continue;
            }
            this.replaceOrderId(order, candidates[0]);
            changed = true;
        }
        if (changed) {
            this.promoteNeededBubbles();
        }
        return changed;
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
