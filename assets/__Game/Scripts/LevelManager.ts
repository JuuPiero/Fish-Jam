import { _decorator, Component, JsonAsset, Node } from 'cc';
import { LevelData } from './Data/LevelData';
import { OrderManager } from './Order/OrderManager';
const { ccclass, property } = _decorator;

@ccclass('LevelManager')
export class LevelManager extends Component {
    @property(JsonAsset) levels: JsonAsset[] = [];
    @property levelIndex: number = 0;
    @property({readonly: true, type: LevelData}) currentLevel: LevelData = null;
    @property(OrderManager) orderManager: OrderManager = null;
    initialize() {
        this.orderManager?.initialize();


    }

}


