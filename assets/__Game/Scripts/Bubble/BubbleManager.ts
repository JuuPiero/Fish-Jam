import { _decorator, Component, instantiate, Node } from 'cc';
import { LevelData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Bubble } from './Bubble';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
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

    @property({ tooltip: "Unity's maxGroupsOnScreen. The opening batch fills up to this many " +
                          'bubbles at once; the rest queue up and spawn one at a time, below the ' +
                          'screen, whenever a bubble pops and the board drops under this count. ' +
                          "Unity can get away with a small cap because PlayZoneMask hides its " +
                          "below-screen overflow outright; Cocos has no such mask, only physical " +
                          "depth, so this is set higher to still read as a full board." })
    maxBubblesOnScreen: number = 18;

    private _pendingBubbles: PendingBubble[] = [];
    // Bubbles past the opening batch: built and measured like the rest, but left inactive and
    // off the board until trySpawnNextFromQueue lets them in.
    private _queue: PendingBubble[] = [];
    private _stagingNode: Node | null = null;

    protected onEnable(): void {
        EventBus.on(GameEvents.BUBBLE_REMOVED, this.onBubbleRemoved);
    }

    protected onDisable(): void {
        EventBus.off(GameEvents.BUBBLE_REMOVED, this.onBubbleRemoved);
    }

    initialize(levelData: LevelData) {
        this.clearBubbles();

        if (!this.spawnPosNode || !this.leftBorder || !this.rightBorder) {
            console.error('[BubbleManager] SpawnPos, LeftBorder and RightBorder must be assigned.');
            return;
        }

        // Bubble radii depend on their fish layout. Measure each one while inactive so every
        // bubble can be packed before any of them are activated.
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

        // Unity's opening batch: pack as many bubbles as the board allows into the play zone
        // right away, in one frame. Everything after stays queued - inactive, parented straight
        // onto this.node so it survives past the staging node below - and trickles in later.
        const openingCount = Math.min(this._pendingBubbles.length, this.maxBubblesOnScreen);
        const opening = this._pendingBubbles.slice(0, openingCount);
        this._queue = this._pendingBubbles.slice(openingCount);
        for (const pending of this._queue) {
            pending.node.setParent(this.node);
        }

        const placements = this.planBubbles(opening);
        for (const placement of placements) {
            this.activateBubble(placement.pending, placement.x, placement.y);
        }
        this._pendingBubbles = [];
        this._stagingNode?.destroy();
        this._stagingNode = null;
    }

    private onBubbleRemoved = (): void => {
        this.trySpawnNextFromQueue();
    };

    // Unity's "spawns below the screen, in the edge column with the most room, once there is
    // room": releases one bubble from the queue when the board has dropped under the cap.
    private trySpawnNextFromQueue(): void {
        if (this._queue.length === 0 || this.getActiveBubbleCount() >= this.maxBubblesOnScreen) {
            return;
        }

        const pending = this._queue.shift();
        const { x, y } = this.findSpawnPosition(
            pending.bubble.radius,
            this.spawnPosNode.worldPosition.y,
            this.getActiveBubbleBounds(),
        );
        this.activateBubble(pending, x, y);
    }

    private getActiveBubbleCount(): number {
        let count = 0;
        for (const child of this.node.children) {
            if (child.active && child.getComponent(Bubble)) {
                count++;
            }
        }
        return count;
    }

    private getActiveBubbleBounds(): { x: number; y: number; radius: number }[] {
        const bounds: { x: number; y: number; radius: number }[] = [];
        for (const child of this.node.children) {
            if (!child.active) {
                continue;
            }
            const bubble = child.getComponent(Bubble);
            if (!bubble) {
                continue;
            }
            const pos = child.worldPosition;
            bounds.push({ x: pos.x, y: pos.y, radius: bubble.radius });
        }
        return bounds;
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

    // Largest number of `fishId` fish found together in any single active bubble right now - one
    // bubble holding enough on its own is a stronger "ready to go" signal than merely reachable
    // (the same total scattered across several bubbles/bench slots still needs several pops).
    getMaxFishInSingleBubble(fishId: number): number {
        let max = 0;
        for (const child of this.node.children) {
            if (!child.active) {
                continue;
            }
            const bubble = child.getComponent(Bubble);
            if (!bubble) {
                continue;
            }
            const count = bubble.fishes.reduce((total, fish) => total + (fish.id === fishId ? 1 : 0), 0);
            if (count > max) {
                max = count;
            }
        }
        return max;
    }

    private clearBubbles(): void {
        this._pendingBubbles = [];
        this._queue = [];
        this._stagingNode = null;
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
    }

    // Packs a list of not-yet-placed bubbles from the top down: each one lands as high as it can
    // in whichever lane the already-planned bubbles leave the most room. Once the visible tank is
    // full, the same packing continues below SpawnPos - there is no Cocos mask there, so a bubble
    // placed that deep is simply invisible until buoyancy carries it up.
    private planBubbles(pendings: PendingBubble[]): PlannedBubble[] {
        const top = this.getTopBorderY();
        const planned: PlannedBubble[] = [];

        for (const pending of pendings) {
            const obstacles = planned.map(p => ({ x: p.x, y: p.y, radius: p.pending.bubble.radius }));
            const { x, y } = this.findSpawnPosition(pending.bubble.radius, top, obstacles);
            planned.push({ pending, x, y });
        }

        return planned;
    }

    // Shared by the opening pack (ceiling = the top border, obstacles = the batch planned so
    // far) and the queue refill (ceiling = SpawnPos, obstacles = whatever is live on the board
    // right now): for each lane, find how high a circle of this radius could sit above `ceilingY`
    // without overlapping an obstacle, then take the lane that allows the highest (least
    // obstructed) result - Unity's "the edge column with the most room".
    private findSpawnPosition(
        radius: number,
        ceilingY: number,
        obstacles: { x: number; y: number; radius: number }[],
    ): { x: number; y: number } {
        const left = this.leftBorder.worldPosition.x;
        const right = this.rightBorder.worldPosition.x;
        const minX = left + radius + this.bubbleGap;
        const maxX = right - radius - this.bubbleGap;
        const columns = Math.max(1, Math.floor(this.spawnColumns));

        let bestX = (left + right) * 0.5;
        let bestY = Number.NEGATIVE_INFINITY;

        for (let column = 0; column < columns; column++) {
            const t = columns === 1 ? 0.5 : column / (columns - 1);
            const x = minX <= maxX ? minX + (maxX - minX) * t : (left + right) * 0.5;
            let y = ceilingY - radius - this.bubbleGap;

            for (const other of obstacles) {
                const requiredDistance = radius + other.radius + this.bubbleGap;
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

        return { x: bestX, y: bestY };
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
