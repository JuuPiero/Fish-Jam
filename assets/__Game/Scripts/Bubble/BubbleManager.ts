import { _decorator, Collider2D, Component, Enum, instantiate, Node, Prefab, RigidBody2D } from 'cc';
import { LevelData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Bubble } from './Bubble';
const { ccclass, property } = _decorator;

export enum MoveType {
    None,
    Horizontal,
    Vertical,
}

interface MovingBubble {
    node: Node;
    bubble: Bubble;
    direction: number;
}

@ccclass('BubbleManager')
export class BubbleManager extends Component {
    @property(Node) spawnPosNode: Node = null;

    @property(Node) leftBorder: Node = null;
    @property(Node) rightBorder: Node = null;

    @property({ tooltip: 'Extra gap kept between two stacked bubbles waiting to float in' })
    bubbleGap: number = 20;


    @property({ type: Enum(MoveType) }) moveType: MoveType = MoveType.None;
    @property speed: number = 20;
    @property({ group: "Horizontal" }) rows: number = 5;
    @property({ group: "Horizontal", type: Node }) limitLeft: Node = null;
    @property({ group: "Horizontal", type: Node }) limitRight: Node = null;


    @property({ group: "Vertical" }) columns: number = 3;
    @property({ group: "Vertical", type: Node }) limitTop: Node = null;
    @property({ group: "Vertical", type: Node }) limitBottom: Node = null;

    private _movingBubbles: MovingBubble[] = [];


    initialize(levelData: LevelData) {
        this._movingBubbles = [];
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        const bubblePrefab = ServiceLocator.get(GameConfigSA).bubblePrefab;
        const spawnPos = this.spawnPosNode.worldPosition;

        if (this.moveType !== MoveType.None) {
            this.spawnMovingBubbles(levelData, bubblePrefab, spawnPos);
            return;
        }

        const leftLimit = this.leftBorder.worldPosition.x;
        const rightLimit = this.rightBorder.worldPosition.x;

        let y = spawnPos.y;
        let prevRadius = 0;

        let index = 0;
        for (const bubbleData of levelData.bubbles) {
            const bubbleNode = instantiate(bubblePrefab);
            bubbleNode.name = index.toString()
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
            index++;
        }
    }

    protected update(deltaTime: number): void {
        if (this.moveType === MoveType.None || this.speed <= 0) {
            return;
        }

        // Every bubble in a moving layout shares one loop. Giving each radius its own loop
        // makes bubbles wrap at different moments and gradually destroys the even spacing.
        const limits = this.getMoveLimits();
        if (!limits || limits.max <= limits.min) {
            return;
        }

        for (const movingBubble of this._movingBubbles) {
            if (!movingBubble.node.isValid) {
                continue;
            }

            const position = movingBubble.node.worldPosition;
            const next = this.moveWithWrap(
                this.moveType === MoveType.Horizontal ? position.x : position.y,
                movingBubble.direction * this.speed * deltaTime,
                limits.min,
                limits.max,
            );

            if (this.moveType === MoveType.Horizontal) {
                movingBubble.node.setWorldPosition(next, position.y, position.z);
            } else {
                movingBubble.node.setWorldPosition(position.x, next, position.z);
            }
        }
    }

    private spawnMovingBubbles(levelData: LevelData, bubblePrefab: Prefab, spawnPos: Readonly<{ x: number, y: number, z: number }>) {
        const bubbleCount = levelData.bubbles.length;
        if (bubbleCount === 0) {
            return;
        }

        const laneCount = Math.min(
            bubbleCount,
            Math.max(1, Math.floor(this.moveType === MoveType.Horizontal ? this.rows : this.columns)),
        );
        const lanes: MovingBubble[][] = Array.from({ length: laneCount }, () => []);

        for (let index = 0; index < bubbleCount; index++) {
            const bubbleNode = instantiate(bubblePrefab);
            bubbleNode.name = index.toString();
            bubbleNode.setParent(this.node);

            const bubble = bubbleNode.getComponent(Bubble);
            bubble.initiallize(levelData.bubbles[index]);
            this.removePhysics(bubbleNode);

            // Round-robin assignment keeps every row/column balanced (at most one bubble apart).
            const laneIndex = index % laneCount;
            const direction = this.moveType === MoveType.Horizontal
                ? (laneIndex % 2 === 0 ? 1 : -1)       // left -> right, then right -> left
                : (laneIndex % 2 === 0 ? -1 : 1);      // top -> bottom, then bottom -> top
            const movingBubble = { node: bubbleNode, bubble, direction };
            lanes[laneIndex].push(movingBubble);
            this._movingBubbles.push(movingBubble);
        }

        const laneRadii = lanes.map(lane => Math.max(...lane.map(item => item.bubble.radius)));
        const crossAxisPositions = this.getCrossAxisPositions(laneRadii, spawnPos);
        const limits = this.getMoveLimits();

        lanes.forEach((lane, laneIndex) => {
            lane.forEach((movingBubble, indexInLane) => {
                // Start at the matching end of the lane, so an initially right-to-left (or
                // top-to-bottom) bubble really does begin by travelling in that direction.
                const positionIndex = movingBubble.direction > 0 ? indexInLane : lane.length - 1 - indexInLane;
                const axisPosition = limits
                    ? this.getEvenAxisPosition(positionIndex, lane.length, limits.min, limits.max)
                    : (this.moveType === MoveType.Horizontal ? spawnPos.x : spawnPos.y);

                if (this.moveType === MoveType.Horizontal) {
                    movingBubble.node.setWorldPosition(axisPosition, crossAxisPositions[laneIndex], spawnPos.z);
                } else {
                    movingBubble.node.setWorldPosition(crossAxisPositions[laneIndex], axisPosition, spawnPos.z);
                }
            });
        });
    }

    // Moving bubbles are driven entirely by this manager, so they must not remain in the 2D
    // physics world or collide with the stationary bubble stack.
    private removePhysics(bubbleNode: Node) {
        for (const collider of bubbleNode.getComponents(Collider2D)) {
            collider.enabled = false;
            collider.destroy();
        }

        for (const rigidBody of bubbleNode.getComponents(RigidBody2D)) {
            rigidBody.enabled = false;
            rigidBody.destroy();
        }
    }

    private getCrossAxisPositions(laneRadii: number[], spawnPos: Readonly<{ x: number, y: number }>): number[] {
        const totalSize = laneRadii.reduce((sum, radius) => sum + radius * 2, 0)
            + this.bubbleGap * Math.max(0, laneRadii.length - 1);
        const positions: number[] = [];

        if (this.moveType === MoveType.Horizontal) {
            let y = spawnPos.y + totalSize * 0.5 - laneRadii[0];
            laneRadii.forEach((radius, index) => {
                positions.push(y);
                y -= radius + (laneRadii[index + 1] ?? 0) + this.bubbleGap;
            });
        } else {
            let x = spawnPos.x - totalSize * 0.5 + laneRadii[0];
            laneRadii.forEach((radius, index) => {
                positions.push(x);
                x += radius + (laneRadii[index + 1] ?? 0) + this.bubbleGap;
            });
        }

        return positions;
    }

    private getMoveLimits(): { min: number, max: number } | null {
        const start = this.moveType === MoveType.Horizontal ? this.limitLeft : this.limitBottom;
        const end = this.moveType === MoveType.Horizontal ? this.limitRight : this.limitTop;
        if (!start || !end) {
            return null;
        }

        const startValue = this.moveType === MoveType.Horizontal ? start.worldPosition.x : start.worldPosition.y;
        const endValue = this.moveType === MoveType.Horizontal ? end.worldPosition.x : end.worldPosition.y;
        return {
            min: Math.min(startValue, endValue),
            max: Math.max(startValue, endValue),
        };
    }

    private getEvenAxisPosition(index: number, count: number, min: number, max: number): number {
        // Leave one equal slot at each end, so no bubble starts by immediately wrapping.
        return min + (max - min) * ((index + 1) / (count + 1));
    }

    private moveWithWrap(value: number, delta: number, min: number, max: number): number {
        const range = max - min;
        let next = value + delta;

        // A bubble preserves its lane's direction. Once it leaves one limit, it re-enters at
        // the opposite limit; modulo also handles an unusually long frame correctly.
        if (delta > 0 && next >= max) {
            next = min + ((next - max) % range);
        } else if (delta < 0 && next <= min) {
            next = max - ((min - next) % range);
        }
        return next;
    }
}


