import { _decorator, Component, instantiate, Node } from 'cc';
import { LevelData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Bubble } from './Bubble';
const { ccclass, property } = _decorator;

@ccclass('BubbleManager')
export class BubbleManager extends Component {
    @property(Node) spawnPosNode: Node = null;

    @property(Node) leftBorder: Node = null;
    @property(Node) rightBorder: Node = null;

    @property({ tooltip: 'Extra gap kept between two stacked bubbles waiting to float in' })
    bubbleGap: number = 20;

    initialize(levelData: LevelData) {
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        const bubblePrefab = ServiceLocator.get(GameConfigSA).bubblePrefab;
        const spawnPos = this.spawnPosNode.worldPosition;
        const leftLimit = this.leftBorder.worldPosition.x;
        const rightLimit = this.rightBorder.worldPosition.x;

        let y = spawnPos.y;
        let prevRadius = 0;

        for (const bubbleData of levelData.bubbles) {
            const bubbleNode = instantiate(bubblePrefab);
            bubbleNode.setParent(this.node);
            const bubble = bubbleNode.getComponent(Bubble);
            bubble.initiallize(bubbleData);

            // Stack bubbles below the spawn point (further away from the tank) so no two of
            // them overlap in Y no matter what X they get - this alone guarantees zero
            // overlap at spawn time, regardless of how X is chosen below.
            if (prevRadius > 0) {
                y -= prevRadius + bubble.radius + this.bubbleGap;
            }
            prevRadius = bubble.radius;

            // Randomize X within the borders so the tank fills up in a natural, chaotic-looking
            // way (varied left/right) instead of lining up in neat columns.
            const minX = leftLimit + bubble.radius;
            const maxX = rightLimit - bubble.radius;
            const x = minX < maxX ? minX + Math.random() * (maxX - minX) : spawnPos.x;

            bubbleNode.setWorldPosition(x, y, spawnPos.z);
        }
    }
}


