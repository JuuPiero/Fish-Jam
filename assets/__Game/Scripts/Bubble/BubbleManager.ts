import { _decorator, Collider2D, Component, Enum, instantiate, Node, Prefab, RigidBody2D, UITransform } from 'cc';
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
    min: number;
    max: number;
    baseCrossAxis: number;
    bobPhase: number;
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
    @property padding: number = 50; // horizontal: top and bottom - vertical: left and right

    @property({ group: "Horizontal" }) rows: number = 5;
    @property({ group: "Horizontal" }) bobAmplitude: number = 8;
    @property({ group: "Horizontal" }) bobFrequency: number = 0.6;
    @property({ group: "Horizontal" }) bobWavelength: number = 420;

    @property({ group: "Vertical" }) columns: number = 3;

    private _movingBubbles: MovingBubble[] = [];
    private _moveTime = 0;


    initialize(levelData: LevelData) {
        this._movingBubbles = [];
        this._moveTime = 0;
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
        this._moveTime += deltaTime;

        for (const movingBubble of this._movingBubbles) {
            if (!movingBubble.node.isValid || movingBubble.max <= movingBubble.min) {
                continue;
            }

            const position = movingBubble.node.worldPosition;
            const next = this.moveWithWrap(
                this.moveType === MoveType.Horizontal ? position.x : position.y,
                movingBubble.direction * this.speed * deltaTime,
                movingBubble.min,
                movingBubble.max,
            );

            if (this.moveType === MoveType.Horizontal) {
                // Phase comes from X as well as time, so the bubbles form one travelling sine
                // wave across a row instead of every bubble rising and falling together.
                const bobOffset = Math.sin(
                    next / Math.max(1, this.bobWavelength) * Math.PI * 2
                    + this._moveTime * this.bobFrequency * Math.PI * 2
                    + movingBubble.bobPhase,
                )
                    * this.bobAmplitude;
                movingBubble.node.setWorldPosition(next, movingBubble.baseCrossAxis + bobOffset, position.z);
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

        const containerBounds = this.getContainerBounds();
        if (!containerBounds) {
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
            const movingBubble = {
                node: bubbleNode,
                bubble,
                direction,
                min: 0,
                max: 0,
                baseCrossAxis: 0,
                bobPhase: laneIndex * Math.PI,
            };
            lanes[laneIndex].push(movingBubble);
            this._movingBubbles.push(movingBubble);
        }

        const nativeLaneRadii = lanes.map(lane => Math.max(...lane.map(item => item.bubble.radius)));
        const bubbleScale = this.getMovingBubbleScale(laneCount, nativeLaneRadii, containerBounds);
        for (const movingBubble of this._movingBubbles) {
            const originalScale = movingBubble.node.scale;
            // Bubble art faces left by default. Mirror only lanes travelling left -> right so
            // the fishes visually lead the direction in which their bubble is moving.
            const directionScaleX = this.moveType === MoveType.Horizontal && movingBubble.direction > 0 ? -1 : 1;
            movingBubble.node.setScale(
                originalScale.x * bubbleScale * directionScaleX,
                originalScale.y * bubbleScale,
                originalScale.z,
            );
        }

        // All layout measurements below use the visual radius after the common root scale.
        const laneRadii = nativeLaneRadii.map(radius => radius * bubbleScale);
        const crossAxisPositions = this.getCrossAxisPositions(laneRadii, containerBounds, spawnPos);

        lanes.forEach((lane, laneIndex) => {
            const limits = this.getLaneMoveLimits(containerBounds, lane.length, laneRadii[laneIndex]);
            lane.forEach((movingBubble, indexInLane) => {
                // Start at the matching end of the lane, so an initially right-to-left (or
                // top-to-bottom) bubble really does begin by travelling in that direction.
                const positionIndex = movingBubble.direction > 0 ? indexInLane : lane.length - 1 - indexInLane;
                const axisPosition = limits.min + (limits.max - limits.min) * (positionIndex / lane.length);
                movingBubble.min = limits.min;
                movingBubble.max = limits.max;
                movingBubble.baseCrossAxis = crossAxisPositions[laneIndex];

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

    private getContainerBounds(): { xMin: number, xMax: number, yMin: number, yMax: number } | null {
        const transform = this.getComponent(UITransform);
        if (!transform) {
            return null;
        }

        const rect = transform.getBoundingBoxToWorld();
        return {
            xMin: rect.x,
            xMax: rect.x + rect.width,
            yMin: rect.y,
            yMax: rect.y + rect.height,
        };
    }

    private getCrossAxisPositions(
        laneRadii: number[],
        bounds: { xMin: number, xMax: number, yMin: number, yMax: number },
        spawnPos: Readonly<{ x: number, y: number }>,
    ): number[] {
        const largestRadius = Math.max(...laneRadii);
        const bobMargin = this.moveType === MoveType.Horizontal ? Math.max(0, this.bobAmplitude) : 0;
        const min = this.moveType === MoveType.Horizontal
            ? bounds.yMin + this.padding + bobMargin + largestRadius
            : bounds.xMin + this.padding + largestRadius;
        const max = this.moveType === MoveType.Horizontal
            ? bounds.yMax - this.padding - bobMargin - largestRadius
            : bounds.xMax - this.padding - largestRadius;

        if (max <= min) {
            const center = this.moveType === MoveType.Horizontal ? spawnPos.y : spawnPos.x;
            return laneRadii.map(() => center);
        }

        return laneRadii.map((_, index) => min + (max - min) * ((index + 0.5) / laneRadii.length));
    }

    private getLaneMoveLimits(
        bounds: { xMin: number, xMax: number, yMin: number, yMax: number },
        bubbleCount: number,
        laneRadius: number,
    ): { min: number, max: number } {
        const visibleMin = this.moveType === MoveType.Horizontal ? bounds.xMin : bounds.yMin;
        const visibleMax = this.moveType === MoveType.Horizontal ? bounds.xMax : bounds.yMax;
        const visibleSize = visibleMax - visibleMin;

        // A slot is just large enough for the widest bubble in its lane plus the configured
        // gap. This makes density follow bubble size instead of a fixed "visible count".
        const slotSize = laneRadius * 2 + this.bubbleGap;
        const contentCycleSize = slotSize * bubbleCount;
        const minimumCycleSize = visibleSize + laneRadius * 2;
        const cycleSize = Math.max(contentCycleSize, minimumCycleSize);
        return {
            min: visibleMin - laneRadius,
            max: visibleMin - laneRadius + cycleSize,
        };
    }

    private getMovingBubbleScale(
        laneCount: number,
        laneRadii: number[],
        bounds: { xMin: number, xMax: number, yMin: number, yMax: number },
    ): number {
        const largestRadius = Math.max(...laneRadii);
        const crossAxisSize = this.moveType === MoveType.Horizontal
            ? bounds.yMax - bounds.yMin
            : bounds.xMax - bounds.xMin;
        const bobSpace = this.moveType === MoveType.Horizontal ? Math.max(0, this.bobAmplitude) * 2 : 0;

        // The lane layout is the only scale constraint. Along the moving axis, spacing is
        // derived from the scaled bubble diameter, avoiding large gaps as density changes.
        const scaleForLanes = (crossAxisSize - this.padding * 2 - bobSpace - this.bubbleGap * laneCount)
            / (largestRadius * 2 * (laneCount + 1));
        return Math.max(0.01, Math.min(1, scaleForLanes));
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


