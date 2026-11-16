import { _decorator, Camera, Canvas, Component, EventKeyboard, find, KeyCode, Node, RealCurve } from 'cc';
import { EventBus } from '../../_iKame/Scripts/EventBus';
import { GameEvents } from './GameEvents';
import { LevelManager } from './LevelManager';
import { GameConfigSA } from './Data/GameConfigSA';
import { ServiceLocator } from '../../_iKame/Scripts/ServiceLocator';
import { ETrackingEvent, TrackingManager } from '../../_iKame/Scripts/TrackingManager';
import { FishConfigSA } from './Data/FishConfigSA';
import { Fish } from './Fish/Fish';
import { Order } from './Order/Order';
import { Bubble } from './Bubble/Bubble';
import { AudioManager } from '../../_iKame/Scripts/Audio/AudioManager';
import { PREVIEW } from 'cc/env';
import { PlayableAdsManager } from '../../_iKame/Scripts/PlayableAdsManager';
import { NavigationContainer } from '../../_iKame/Scripts/Navigation/NavigationContainer';
import { FishCountUI } from './UI/FishCountUI';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(GameConfigSA) gameConfig: GameConfigSA = null;
    @property(FishConfigSA) fishConfig: FishConfigSA = null;
    @property(LevelManager) levelManager: LevelManager = null;
    @property({ type: Node, tooltip: 'Top-level node (e.g. the canvas root) fish are reparented onto while flying to a slot/order' })
    flyLayer: Node = null;



    private _isGameOver = false;
    public get IsGameOver(): boolean {
        return this._isGameOver;
    }

    protected onLoad(): void {
        ServiceLocator.register(GameManager, this)
        ServiceLocator.register(LevelManager, this.levelManager)
        ServiceLocator.register(GameConfigSA, this.gameConfig)
        ServiceLocator.register(FishConfigSA, this.fishConfig)
    }
    protected onEnable(): void {
        EventBus.on(GameEvents.NEW_LEVEL, this.onNewGame);
        EventBus.on(GameEvents.LEVEL_WIN, this.onWinGame);
        EventBus.on(GameEvents.LEVEL_LOSE, this.onLoseGame);
        EventBus.on(GameEvents.MATCHED, this.onProgress);
        EventBus.on(GameEvents.FISH_CLICKED, this.onFishClicked);
        EventBus.on(GameEvents.ORDER_READY, this.onOrderReady);
    }

    protected onDisable(): void {
        this.unschedule(this.checkDeadEndAtCriticalSlots);
        EventBus.off(GameEvents.NEW_LEVEL, this.onNewGame);
        EventBus.off(GameEvents.LEVEL_WIN, this.onWinGame);
        EventBus.off(GameEvents.LEVEL_LOSE, this.onLoseGame);
        EventBus.off(GameEvents.MATCHED, this.onProgress);
        EventBus.off(GameEvents.FISH_CLICKED, this.onFishClicked);
        EventBus.off(GameEvents.ORDER_READY, this.onOrderReady);
    }

    protected start(): void {
        TrackingManager.TrackEvent(ETrackingEvent.LOADING);
        TrackingManager.TrackEvent(ETrackingEvent.LOADED);
        TrackingManager.TrackEvent(ETrackingEvent.DISPLAYED);
        PlayableAdsManager.SetupLinkStore();
        EventBus.emit(GameEvents.NEW_LEVEL);
    }

    onNewGame = () => {
        AudioManager.instance.playMusic('BGMFish')
        this._isGameOver = false;
        this.progress = 0;
        this.progressTracked = { quarter: false, half: false, threeQuarter: false };
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_STARTED)
        this.levelManager.initialize()
        this.total = this.levelManager.currentLevel.getTotalFishes() / 3;

        // Also poll the live board: depending on the exact flight/tween ordering, a fish's
        // landing callback may not be the final state change that creates a dead end.
        this.unschedule(this.checkDeadEndAtCriticalSlots);
        this.schedule(this.checkDeadEndAtCriticalSlots, 0.25);

        ServiceLocator.get(FishCountUI).updateUI()

    }

    onWinGame = () => {
        if (this._isGameOver) {
            return;
        }
        AudioManager.instance.playOneShot('Win')
        this._isGameOver = true;
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_SOLVED)
        ServiceLocator.get(NavigationContainer).stack.navigate('EndGameScreen', { isWin: true })
    }

    onLoseGame = () => {
        if (this._isGameOver) {
            return;
        }
        AudioManager.instance.playOneShot('Lose')
        this._isGameOver = true;
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_FAILED)
        ServiceLocator.get(NavigationContainer).stack.navigate('EndGameScreen', { isWin: false })
    }

    isPlayMusic = true;
    toggleMusic(event: EventKeyboard) {
        if (event.keyCode === KeyCode.F12) {
            if (this.isPlayMusic) {
                AudioManager.instance.stopMusic()
                this.isPlayMusic = false;
            }
            else {
                AudioManager.instance.playMusic('BGM')
                this.isPlayMusic = true;
            }
        }
    }

    @property({ readonly: true }) public progress: number = 0
    @property({ readonly: true }) public total: number = 0
    progressTracked = {
        quarter: false,  // 25%
        half: false,     // 50%
        threeQuarter: false  // 75%
    }
    onProgress = () => {
        this.progress++
        const percentage = (this.progress / this.total) * 100

        if (PREVIEW) {
            console.log("progress " + percentage)

        }
        if (!this.progressTracked.quarter && percentage >= 25) {
            this.progressTracked.quarter = true
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_25)
        }

        if (!this.progressTracked.half && percentage >= 50) {
            this.progressTracked.half = true
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_50)
        }

        if (!this.progressTracked.threeQuarter && percentage >= 75) {
            this.progressTracked.threeQuarter = true
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_75)
        }

        if (this.progress === this.total) {
            // TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_SOLVED)
            EventBus.emit(GameEvents.LEVEL_WIN);

        }
    }

    onFishClicked = (fish: Fish) => {
        if (this._isGameOver) {
            return;
        }
        AudioManager.instance.playOneShot('Click')

        fish.setInteractable(false);

        // Detach from its bubble first (this may pop the bubble if it was the last fish in it)
        // so the fish is free to fly off wherever it ends up going.
        // Fish now live under Bubble.bubbleContainer, so the Bubble component is no longer on
        // their direct parent. Walk upward to find the owning bubble before detaching the fish.
        let bubble: Bubble | null = null;
        let parent: Node | null = fish.node.parent;
        while (parent && !bubble) {
            bubble = parent.getComponent(Bubble);
            parent = parent.parent;
        }
        bubble?.removeFish(fish);

        this.routeFish(fish);
    }

    // An order just got a fresh id and finished settling its pop-in animation (see
    // Order.playResetPop) - whether OrderManager reset it directly on completion or reactivated
    // it from being hidden as a pending duplicate, it's now actually safe to route a fish here.
    // Pull every fish already waiting on the bench for this id, not just one - the order has
    // room for up to 3, and a bench could easily be holding 2 or 3 of a kind that only just
    // became orderable.
    onOrderReady = (order: Order) => {
        const { slotManager } = this.levelManager;
        while (!order.isFullyClaimed) {
            const waitingFish = slotManager.takeMatching(order.id);
            if (!waitingFish) {
                break;
            }
            this.routeFish(waitingFish);
        }
    }

    // Sends `fish` to a matching order if one wants it, otherwise parks it on the waiting bench
    // (or ends the level if the bench is full). Also used to chain a waiting fish onward once a
    // freshly-spawned order turns out to want it.
    private routeFish(fish: Fish) {
        const { orderManager, slotManager } = this.levelManager;

        const order = orderManager.findMatchingOrder(fish.id);
        if (order) {
            fish.flyToOrder(order, this.flyLayer, () => {
                if (!order.isComplete) {
                    return;
                }
                // Reassigns this order's id (or hides it as a pending duplicate) and, either
                // way, eventually fires ORDER_READY once whichever order actually ends up
                // showing that next id has settled its pop-in - see onOrderReady.
                orderManager.completeOrder(order);
            });
            return;
        }

        // Like FoodJam, reserve immediately so rapid taps cannot claim the same slot, but only
        // declare defeat after every currently reserved fish has visibly landed. A matching
        // order may open while they are flying and free a reserved slot in time.
        const parked = slotManager.park(fish, this.flyLayer, () => {
            if (!slotManager.hasPendingParkArrivals() && !slotManager.hasFreeSlot()) {
                EventBus.emit(GameEvents.LEVEL_LOSE);
                return;
            }

            this.checkDeadEndAtCriticalSlots();
        });
        if (!parked) {
            EventBus.emit(GameEvents.LEVEL_LOSE);
            return;
        }
    }

    // The playable should not leave the player in a dead-end state: at least four of five slots
    // are occupied, but none of the fish still visible in bubbles can fill an open order. Check
    // this periodically as well as on landing so a completed tween cannot leave the game stuck.
    private checkDeadEndAtCriticalSlots = (): void => {
        if (this._isGameOver) {
            return;
        }

        const { bubbleManager, orderManager, slotManager } = this.levelManager;
        if (slotManager.getSlotCount() === 0 ||
            slotManager.getOccupiedCount() < slotManager.getSlotCount() - 1 ||
            slotManager.hasPendingParkArrivals()) {
            return;
        }

        const activeOrders = orderManager.orders.filter(order => order.node.active);
        if (activeOrders.some(order => order.isBusy)) {
            return;
        }

        const camera = this.getBoardCamera();
        if (!camera) {
            return;
        }

        // Fish the player can see in bubbles, plus bench fish (a bench fish matching an order is
        // pulled onto it, which frees a slot).
        const fishCounts = new Map<number, number>();
        bubbleManager.collectVisibleFishCounts(fishCounts, camera);
        slotManager.collectWaitingFishCounts(fishCounts);
        const hasVisibleMatch = activeOrders.some(order =>
            order.remainingCount > 0 && (fishCounts.get(order.id) ?? 0) > 0,
        );
        if (!hasVisibleMatch) {
            // The custom curve forbids a loss before its last stretch: it swaps the untouched
            // orders onto visible fish instead, and the next check sees the new orders.
            if (orderManager.tryUnstick(fishCounts)) {
                return;
            }
            // In a real playable this immediately invokes the platform CTA. The lose event also
            // keeps the game state and end-card UI in sync when running in the Cocos preview.
            PlayableAdsManager.OpenStore();
            EventBus.emit(GameEvents.LEVEL_LOSE);
        }
    }

    private _boardCamera: Camera | null = null;

    // The Canvas's own camera draws the board (CameraTutorial only copies it).
    private getBoardCamera(): Camera | null {
        if (!this._boardCamera || !this._boardCamera.isValid) {
            this._boardCamera = find('Canvas')?.getComponent(Canvas)?.cameraComponent ?? null;
        }
        return this._boardCamera;
    }

}


