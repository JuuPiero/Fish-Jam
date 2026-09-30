import { _decorator, Component, Label, Node, Sprite } from 'cc';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { LevelManager } from '../LevelManager';
const { ccclass, property } = _decorator;

@ccclass('FishCountUI')
export class FishCountUI extends Component {
    
    @property({readonly: true}) total: number = 0;
    @property({readonly: true}) count: number = 0; 
    

    @property(Sprite) progressSprite: Sprite = null;
    @property(Label) countLabel: Label = null;


    protected onEnable(): void {
        EventBus.on(GameEvents.NEW_LEVEL, this.onNewGame)
        EventBus.on(GameEvents.FISH_CLICKED, this.onFishClicked)

    }

    protected onDisable(): void {
        EventBus.off(GameEvents.NEW_LEVEL, this.onNewGame)
        EventBus.off(GameEvents.FISH_CLICKED, this.onFishClicked)
    }
    protected onLoad(): void {
        ServiceLocator.register(FishCountUI, this)
    }
    protected start(): void {
        // this.updateUI();
        // this.countLabel.string = `${0}/${this.total}`

    }

    onFishClicked = () => {
        this.count++;
        this.updateUI();
    }

    onNewGame = () => {
    //    this.total = ServiceLocator.get(LevelManager).currentLevel.getTotalFishes()
    }


    updateUI() {
        this.total = ServiceLocator.get(LevelManager).currentLevel.getTotalFishes()
        this.progressSprite.fillRange = this.count / this.total;
        this.countLabel.string = `${this.count}/${this.total}`
    }
}


