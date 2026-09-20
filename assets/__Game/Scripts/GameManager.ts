import { _decorator, Component, Node } from 'cc';
import { EventBus } from '../../_iKame/Scripts/EventBus';
import { GameEvents } from './GameEvents';
import { LevelManager } from './LevelManager';
import { GameConfigSA } from './Data/GameConfigSA';
import { ServiceLocator } from '../../_iKame/Scripts/ServiceLocator';
import { ETrackingEvent, TrackingManager } from '../../_iKame/Scripts/TrackingManager';
import { FishConfigSA } from './Data/FishConfigSA';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(GameConfigSA) gameConfig: GameConfigSA = null;
    @property(FishConfigSA) fishConfig: FishConfigSA = null;
    @property(LevelManager) levelManager: LevelManager = null;
    protected onLoad(): void {
        ServiceLocator.register(GameManager, this)
        ServiceLocator.register(LevelManager, this.levelManager)
        ServiceLocator.register(GameConfigSA, this.gameConfig)
        ServiceLocator.register(FishConfigSA, this.fishConfig)
    }
    protected onEnable(): void {
        EventBus.on(GameEvents.NEW_LEVEL, this.onNewGame);
        EventBus.on(GameEvents.LEVEL_WIN, this.onWinGame);
    }

    protected onDisable(): void {
        EventBus.off(GameEvents.NEW_LEVEL, this.onNewGame);
        EventBus.off(GameEvents.LEVEL_WIN, this.onWinGame);
    }

    protected start(): void {
        TrackingManager.TrackEvent(ETrackingEvent.LOADING)
        TrackingManager.TrackEvent(ETrackingEvent.LOADED)
        TrackingManager.TrackEvent(ETrackingEvent.DISPLAYED)

        EventBus.emit(GameEvents.NEW_LEVEL);
    }

    onNewGame = () => {
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_STARTED)
        this.levelManager.initialize()
    }

    onWinGame = () => {
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_SOLVED)
    }

    onLoseGame = () => {
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_FAILED)
    }

}


