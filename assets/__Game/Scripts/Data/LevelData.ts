import { _decorator, Component, JsonAsset, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('BubbleData')
export class BubbleData {
    @property({ type: [Number] }) fishes: number[] = [];
}

@ccclass('LevelData')
export class LevelData {
    @property({ type: [BubbleData] })
    bubbles: BubbleData[] = [];

    static Parse(jsonAsset: JsonAsset): LevelData {
        const levelData = new LevelData();

        if (!jsonAsset || !jsonAsset.json) {
            console.warn("JsonAsset is null or empty!");
            return levelData;
        }

        const rawData: any = jsonAsset.json;

        if (rawData.bubbles && Array.isArray(rawData.bubbles)) {
            levelData.bubbles = rawData.bubbles.map(rawBubble => {
                const bubbleData = new BubbleData();
                if (rawBubble.fishes && Array.isArray(rawBubble.fishes)) {
                    bubbleData.fishes = [...rawBubble.fishes];
                }
                return bubbleData;
            });
        }

        return levelData;
    }

    getTotalFishes(): number {
        return this.bubbles.reduce((total, bubble) => {
            // Cộng dồn độ dài của mảng fishes trong từng bubble
            return total + (bubble.fishes ? bubble.fishes.length : 0);
        }, 0);
    }
}