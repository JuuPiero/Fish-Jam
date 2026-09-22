import { _decorator, Component, EventKeyboard, KeyCode, Node } from 'cc';
import { EventBus } from '../../_iKame/Scripts/EventBus';
import { GameEvents } from './GameEvents';
import { LevelManager } from './LevelManager';
import { GameConfigSA } from './Data/GameConfigSA';
import { ServiceLocator } from '../../_iKame/Scripts/ServiceLocator';
import { ETrackingEvent, TrackingManager } from '../../_iKame/Scripts/TrackingManager';
import { FishConfigSA } from './Data/FishConfigSA';
import { Fish } from './Fish/Fish';
import { Bubble } from './Bubble/Bubble';
import { AudioManager } from '../../_iKame/Scripts/Audio/AudioManager';
import { PREVIEW } from 'cc/env';
import { PlayableAdsManager } from '../../_iKame/Scripts/PlayableAdsManager';
import { NavigationContainer } from '../../_iKame/Scripts/Navigation/NavigationContainer';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(GameConfigSA) gameConfig: GameConfigSA = null;
    @property(FishConfigSA) fishConfig: FishConfigSA = null;
    @property(LevelManager) levelManager: LevelManager = null;
    @property({ type: Node, tooltip: 'Top-level node (e.g. the canvas root) fish are reparented onto while flying to a slot/order' })
    flyLayer: Node = null;
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
    }

    protected onDisable(): void {
        EventBus.off(GameEvents.NEW_LEVEL, this.onNewGame);
        EventBus.off(GameEvents.LEVEL_WIN, this.onWinGame);
        EventBus.off(GameEvents.LEVEL_LOSE, this.onLoseGame);
        EventBus.off(GameEvents.MATCHED, this.onProgress);
        EventBus.off(GameEvents.FISH_CLICKED, this.onFishClicked);
    }

    protected start(): void {
        TrackingManager.TrackEvent(ETrackingEvent.LOADING);
        TrackingManager.TrackEvent(ETrackingEvent.LOADED);
        TrackingManager.TrackEvent(ETrackingEvent.DISPLAYED);
        PlayableAdsManager.SetupLinkStore();
        EventBus.emit(GameEvents.NEW_LEVEL);
    }

    onNewGame = () => {
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_STARTED)
        this.levelManager.initialize()
        this.total = this.levelManager.currentLevel.getTotalFishes() / 3;
    }

    onWinGame = () => {
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_SOLVED)
        ServiceLocator.get(NavigationContainer).stack.navigate('EndGameScreen')
    }

    onLoseGame = () => {
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_FAILED)
        ServiceLocator.get(NavigationContainer).stack.navigate('EndGameScreen')
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
        fish.setInteractable(false);

        // Detach from its bubble first (this may pop the bubble if it was the last fish in it)
        // so the fish is free to fly off wherever it ends up going.
        const bubble = fish.node.parent?.getComponent(Bubble);
        bubble?.removeFish(fish);

        this.routeFish(fish);
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
                const nextId = orderManager.completeOrder(order);
                if (nextId === null) {
                    return;
                }
                // Pull every fish already waiting on the bench for this id, not just one - the
                // order has room for up to 3, and a bench could easily be holding 2 or 3 of a
                // kind that only just became orderable.
                while (!order.isFullyClaimed) {
                    const waitingFish = slotManager.takeMatching(nextId);
                    if (!waitingFish) {
                        break;
                    }
                    this.routeFish(waitingFish);
                }
            });
            return;
        }

        // Reserve the slot first: checking before park() would miss the moment this fish fills
        // the final available slot, leaving a full bench without triggering the lose state.
        const parked = slotManager.park(fish, this.flyLayer);
        if (!parked || !slotManager.hasFreeSlot()) {
            EventBus.emit(GameEvents.LEVEL_LOSE);
            return;
        }
    }

}


