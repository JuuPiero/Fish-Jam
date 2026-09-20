import { _decorator, Component, JsonAsset, Node } from 'cc';
import { LevelData } from './Data/LevelData';
import { OrderManager } from './Order/OrderManager';
import { SlotManager } from './Slot/SlotManager';
import { BubbleManager } from './Bubble/BubbleManager';
const { ccclass, property } = _decorator;

@ccclass('LevelManager')
export class LevelManager extends Component {
    @property(JsonAsset) levels: JsonAsset[] = [];
    @property levelIndex: number = 0;
    @property({readonly: true, type: LevelData}) currentLevel: LevelData = null;
    @property(OrderManager) orderManager: OrderManager = null;
    @property(SlotManager) slotManager: SlotManager = null;
    @property(BubbleManager) bubbleManager: BubbleManager = null;

    initialize() {
        this.currentLevel = LevelData.Parse(this.levels[this.levelIndex]);
        console.log(this.currentLevel);
        
        this.bubbleManager?.initialize(this.currentLevel);
        this.orderManager?.initialize(this.currentLevel);
        this.slotManager?.initialize();
    }

}


