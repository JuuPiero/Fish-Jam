import { _decorator, Component, Label, Node, ProgressBar } from 'cc';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameManager } from '../GameManager';


const { ccclass, property } = _decorator;

@ccclass('ProgressBarUI')
export class ProgressBarUI extends Component {
    timeCounter: number = 0;
    @property time: number = 180;
    @property(ProgressBar) progressbar: ProgressBar;
    @property(Label) timeCountLabel: Label;
    isStarted = false
    protected start(): void {
        this.timeCounter = this.time
        this.progressbar.progress = 1;
        this.timeCountLabel.string = this.timeCounter.toString();

    }

    protected onEnable(): void {
        EventBus.on(GameEvents.FISH_CLICKED, this.onClick);
    }


    protected onDisable(): void {
        EventBus.off(GameEvents.FISH_CLICKED, this.onClick);
    }

    onClick = () => {
        if (this.isStarted) return;
        this.isStarted = true;
    }

    protected update(dt: number): void {
        if (!this.isStarted) return;
        if (this.timeCounter <= 0) {
            this.timeCounter = 0;

            this.progressbar.progress = 0;
            this.timeCountLabel.string = "0";
            const gameManager = ServiceLocator.get(GameManager)
            if (!gameManager.IsGameOver) {
                EventBus.emit(GameEvents.LEVEL_LOSE);
            }

            return;
        }

        this.timeCounter -= dt;

        // Không cho thời gian xuống dưới 0
        this.timeCounter = Math.max(0, this.timeCounter);

        this.progressbar.progress = this.timeCounter / this.time;
        this.timeCountLabel.string = this.timeCounter.toFixed();
    }



}


