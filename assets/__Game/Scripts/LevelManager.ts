import { _decorator, Component, JsonAsset, Node } from 'cc';
import { LevelData } from './Data/LevelData';
import { OrderManager } from './Order/OrderManager';
import { SlotManager } from './Slot/SlotManager';
import { BubbleManager } from './Bubble/BubbleManager';
import { EDITOR, PREVIEW } from 'cc/env';
const { ccclass, property } = _decorator;

@ccclass('LevelManager')
export class LevelManager extends Component {
    @property(JsonAsset) levels: JsonAsset[] = [];
    @property levelIndex: number = 0;
    @property({ readonly: true, type: LevelData }) currentLevel: LevelData = null;
    @property(OrderManager) orderManager: OrderManager = null;
    @property(SlotManager) slotManager: SlotManager = null;
    @property(BubbleManager) bubbleManager: BubbleManager = null;

    initialize() {
        this.currentLevel = LevelData.Parse(this.levels[this.levelIndex]);

        if(PREVIEW || EDITOR) {
            this.logData();
        }
        this.bubbleManager?.initialize(this.currentLevel);
        this.orderManager?.initialize(this.currentLevel);
        this.slotManager?.initialize();
    }

    logData() {
        // Sử dụng Map để lưu trữ id và số lượng tương ứng
        const fishCountMap = new Map<number, number>();

        // Lặp qua toàn bộ bubble và fish
        this.currentLevel.bubbles.forEach(bubble => {
            bubble.fishes.forEach(fishId => {
                // Nếu id đã tồn tại thì cộng thêm 1, chưa thì khởi tạo là 1
                const currentCount = fishCountMap.get(fishId) || 0;
                fishCountMap.set(fishId, currentCount + 1);
            });
        });

        // Sắp xếp map theo ID tăng dần (tùy chọn, giúp log dễ nhìn hơn)
        const sortedFishes = Array.from(fishCountMap.entries()).sort((a, b) => a[0] - b[0]);

        // Log ra format: id => số lượng
        console.log("--- BẢNG THỐNG KÊ FISH ID ---");
        sortedFishes.forEach(([id, count]) => {
            console.log(`${id} => ${count}`);
        });
    }

}


