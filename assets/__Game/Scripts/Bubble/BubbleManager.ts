import { _decorator, Component, instantiate, Node } from 'cc';
import { LevelData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Bubble } from './Bubble';
const { ccclass, property } = _decorator;

interface PendingBubble {
    node: Node;
    bubble: Bubble;
}

interface PlannedBubble {
    pending: PendingBubble;
    x: number;
    y: number;
}

@ccclass('BubbleManager')
export class BubbleManager extends Component {
    @property(Node) spawnPosNode: Node = null;

    @property(Node) leftBorder: Node = null;
    @property(Node) rightBorder: Node = null;

    @property({ tooltip: 'Optional ceiling border. If empty, the sibling node named TopBorder is used.' })
    topBorder: Node = null;

    @property({ tooltip: 'Minimum free space between bubbles while arranging the opening batch.' })
    bubbleGap: number = 20;

    @property({ tooltip: 'Number of lanes considered when packing bubbles.' })
    spawnColumns: number = 48;

    private _pendingBubbles: PendingBubble[] = [];
    private _stagingNode: Node | null = null;

    initialize(levelData: LevelData) {
        this.clearBubbles();

        if (!this.spawnPosNode || !this.leftBorder || !this.rightBorder) {
            console.error('[BubbleManager] SpawnPos, LeftBorder and RightBorder must be assigned.');
            return;
        }

        // Bubble radii depend on their fish layout. Measure each one while inactive so every
        // bubble can be packed before they are all activated together.
        this._stagingNode = new Node('PendingBubbleStaging');
        this._stagingNode.setParent(this.node);

        const bubblePrefab = ServiceLocator.get(GameConfigSA).bubblePrefab;
        let index = 0;
        for (const bubbleData of levelData.bubbles) {
            const bubbleNode = instantiate(bubblePrefab);
            bubbleNode.name = index.toString();
            bubbleNode.setParent(this.node);

            const bubble = bubbleNode.getComponent(Bubble);
            if (!bubble) {
                console.error('[BubbleManager] Bubble prefab is missing its Bubble component.');
                bubbleNode.destroy();
                continue;
            }

            // The node is active only during this synchronous setup, so Bubble.onLoad can read
            // its visual components. It is disabled before a physics/render frame can process it.
            bubble.initiallize(bubbleData);
            bubbleNode.active = false;
            bubbleNode.setParent(this._stagingNode);
            this._pendingBubbles.push({ node: bubbleNode, bubble });
            index++;
        }

        const placements = this.planAllBubbles();
        for (const placement of placements) {
            this.activateBubble(placement.pending, placement.x, placement.y);
        }
        this._pendingBubbles = [];
        this._stagingNode?.destroy();
        this._stagingNode = null;
    }

    // Unity's CollectReachableItemCounts equivalent for the Cocos order picker. Only fish still
    // inside active bubbles are counted; fish in an order have already left this source.
    collectReachableFishCounts(counts: Map<number, number>): void {
        for (const child of this.node.children) {
            if (!child.active) {
                continue;
            }
            const bubble = child.getComponent(Bubble);
            if (!bubble) {
                continue;
            }
            for (const fish of bubble.fishes) {
                counts.set(fish.id, (counts.get(fish.id) ?? 0) + 1);
            }
        }
    }

    private clearBubbles(): void {
        this._pendingBubbles = [];
        this._stagingNode = null;
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
    }

    private planAllBubbles(): PlannedBubble[] {
        const spawnPos = this.spawnPosNode.worldPosition;
        const left = this.leftBorder.worldPosition.x;
        const right = this.rightBorder.worldPosition.x;
        const top = this.getTopBorderY();
        const planned: PlannedBubble[] = [];

        const columns = Math.max(1, Math.floor(this.spawnColumns));
        for (const pending of this._pendingBubbles) {
            const radius = pending.bubble.radius;
            const minX = left + radius + this.bubbleGap;
            const maxX = right - radius - this.bubbleGap;
            let bestX = spawnPos.x;
            let bestY = Number.NEGATIVE_INFINITY;

            for (let column = 0; column < columns; column++) {
                const t = columns === 1 ? 0.5 : column / (columns - 1);
                const x = minX <= maxX
                    ? minX + (maxX - minX) * t
                    : (left + right) * 0.5;
                let y = top - radius - this.bubbleGap;

                // Solve the circle intersection in this lane, then keep the highest candidate.
                for (const other of planned) {
                    const requiredDistance = radius + other.pending.bubble.radius + this.bubbleGap;
                    const dx = Math.abs(x - other.x);
                    if (dx >= requiredDistance) {
                        continue;
                    }
                    y = Math.min(y, other.y - Math.sqrt(requiredDistance * requiredDistance - dx * dx));
                }

                if (y > bestY) {
                    bestX = x;
                    bestY = y;
                }
            }

            // Once the visible tank is full, the same packing continues below SpawnPos. There is
            // no Cocos mask there, but every bubble is still activated immediately and floats up.
            planned.push({ pending, x: bestX, y: bestY });
        }

        return planned;
    }

    private activateBubble(pending: PendingBubble, x: number, y: number): void {
        pending.node.setParent(this.node);
        pending.node.setWorldPosition(x, y, this.spawnPosNode.worldPosition.z);
        pending.node.active = true;
    }

    private getTopBorderY(): number {
        const topBorder = this.topBorder ?? this.leftBorder.parent?.getChildByName('TopBorder');
        // Game.scene already has TopBorder beside LeftBorder/RightBorder. The fallback keeps
        // other scenes working until their optional Inspector reference is assigned.
        return topBorder ? topBorder.worldPosition.y : this.spawnPosNode.worldPosition.y + 1200;
    }
}


