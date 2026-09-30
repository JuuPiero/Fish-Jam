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
    radius: number;
}

interface MovingLane {
    bubbles: MovingBubble[];
    direction: number;
}

@ccclass('BubbleManager')
export class BubbleManager extends Component {
    @property(Node) spawnPosNode: Node = null;

    @property(Node) leftBorder: Node = null;
    @property(Node) rightBorder: Node = null;

    @property({ tooltip: 'Extra gap kept between two stacked bubbles waiting to float in' })
    bubbleGap: number = 20;

    @property({ tooltip: 'Gap between moving bubbles; use a small negative value when sprite padding still looks separated' })
    movingBubbleGap: number = 0;


    @property({ type: Enum(MoveType) }) moveType: MoveType = MoveType.None;
    @property speed: number = 20;
    @property padding: number = 50; // horizontal: top and bottom - vertical: left and right

    @property({ group: "Horizontal" }) rows: number = 5;
    @property({ group: "Horizontal", tooltip: 'Maximum bubbles visible in each moving row' }) columnsDisplay: number = 2.5;
    @property({ group: "Horizontal" }) bobAmplitude: number = 8;
    @property({ group: "Horizontal" }) bobFrequency: number = 0.6;
    @property({ group: "Horizontal" }) bobWavelength: number = 420;

    @property({ group: "Vertical" }) columns: number = 3;
    @property({ group: "Vertical", tooltip: 'Maximum bubbles visible in each moving column' }) rowsDisplay: number = 3;
    @property({ group: "Vertical" }) waveAmplitude: number = 8;
    @property({ group: "Vertical" }) waveFrequency: number = 0.6;
    @property({ group: "Vertical" }) waveLength: number = 420;

    private _movingBubbles: MovingBubble[] = [];
    private _movingLanes: MovingLane[] = [];
    private _moveTime = 0;


    initialize(levelData: LevelData) {
        this._movingBubbles = [];
        this._movingLanes = [];
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
        this.reflowAfterDestroyedBubbles();

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
                // Same travelling-wave treatment for vertical lanes: Y drives the sine phase
                // and the bubble shifts gently along X.
                const waveOffset = Math.sin(
                    next / Math.max(1, this.waveLength) * Math.PI * 2
                    + this._moveTime * this.waveFrequency * Math.PI * 2
                    + movingBubble.bobPhase,
                )
                    * this.waveAmplitude;
                movingBubble.node.setWorldPosition(movingBubble.baseCrossAxis + waveOffset, next, position.z);
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
                radius: 0,
            };
            lanes[laneIndex].push(movingBubble);
            this._movingBubbles.push(movingBubble);
        }

        const nativeLaneRadii = lanes.map(lane => Math.max(...lane.map(item => item.bubble.radius)));
        const maxBubblesPerLane = Math.max(...lanes.map(lane => lane.length));
        const bubbleScale = this.getMovingBubbleScale(maxBubblesPerLane, nativeLaneRadii, containerBounds);
        for (const movingBubble of this._movingBubbles) {
            const originalScale = movingBubble.node.scale;
            movingBubble.node.setScale(
                originalScale.x * bubbleScale,
                originalScale.y * bubbleScale,
                originalScale.z,
            );
            movingBubble.radius = movingBubble.bubble.radius * bubbleScale;
            if (this.moveType === MoveType.Horizontal) {
                for (const fish of movingBubble.bubble.fishes) {
                    fish.setFacingRight(movingBubble.direction > 0);
                }
            }
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
        this._movingLanes = lanes.map(lane => ({ bubbles: lane, direction: lane[0].direction }));
    }

    private reflowAfterDestroyedBubbles() {
        let hasDestroyedBubble = false;
        for (const lane of this._movingLanes) {
            const activeBubbles = lane.bubbles.filter(bubble => bubble.node.isValid);
            if (activeBubbles.length !== lane.bubbles.length) {
                lane.bubbles = activeBubbles;
                hasDestroyedBubble = true;
            }
        }
        if (!hasDestroyedBubble) {
            return;
        }

        const activeLanes = this._movingLanes.filter(lane => lane.bubbles.length > 0);
        this._movingLanes = activeLanes;
        this._movingBubbles = [];
        for (const lane of activeLanes) {
            this._movingBubbles.push(...lane.bubbles);
        }
        if (activeLanes.length === 0) {
            return;
        }

        const bounds = this.getContainerBounds();
        if (!bounds) {
            return;
        }

        const laneRadii = activeLanes.map(lane => Math.max(...lane.bubbles.map(bubble => bubble.radius)));
        const crossAxisPositions = this.getCrossAxisPositions(laneRadii, bounds, this.spawnPosNode.worldPosition);

        activeLanes.forEach((lane, laneIndex) => {
            const laneRadius = laneRadii[laneIndex];
            const limits = this.getLaneMoveLimits(bounds, lane.bubbles.length, laneRadius);
            const oldAxisRange = lane.bubbles[0].max - lane.bubbles[0].min;
            const getAxis = (bubble: MovingBubble) => this.moveType === MoveType.Horizontal
                ? bubble.node.worldPosition.x
                : bubble.node.worldPosition.y;
            const orderedBubbles = lane.bubbles.slice().sort((a, b) => {
                const order = getAxis(a) - getAxis(b);
                return lane.direction > 0 ? order : -order;
            });
            const firstBubble = orderedBubbles[0];
            const oldProgress = oldAxisRange > 0
                ? (getAxis(firstBubble) - firstBubble.min) / oldAxisRange
                : 0;
            const newAxisRange = limits.max - limits.min;
            const firstAxis = limits.min + Math.max(0, Math.min(1, oldProgress)) * newAxisRange;
            const spacing = newAxisRange / orderedBubbles.length;

            orderedBubbles.forEach((bubble, index) => {
                const axis = this.wrapAxisValue(firstAxis + lane.direction * spacing * index, limits.min, limits.max);
                bubble.min = limits.min;
                bubble.max = limits.max;
                bubble.baseCrossAxis = crossAxisPositions[laneIndex];

                const position = bubble.node.worldPosition;
                if (this.moveType === MoveType.Horizontal) {
                    bubble.node.setWorldPosition(axis, bubble.baseCrossAxis, position.z);
                } else {
                    bubble.node.setWorldPosition(bubble.baseCrossAxis, axis, position.z);
                }
            });
        });
    }

    private wrapAxisValue(value: number, min: number, max: number): number {
        const range = max - min;
        const wrapped = (value - min) % range;
        return min + (wrapped < 0 ? wrapped + range : wrapped);
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
        const waveMargin = this.moveType === MoveType.Horizontal
            ? Math.max(0, this.bobAmplitude)
            : Math.max(0, this.waveAmplitude);
        const min = this.moveType === MoveType.Horizontal
            ? bounds.yMin + this.padding + waveMargin
            : bounds.xMin + this.padding + waveMargin;
        const max = this.moveType === MoveType.Horizontal
            ? bounds.yMax - this.padding - waveMargin
            : bounds.xMax - this.padding - waveMargin;

        if (max <= min) {
            const center = this.moveType === MoveType.Horizontal ? spawnPos.y : spawnPos.x;
            return laneRadii.map(() => center);
        }

        const totalLaneSize = laneRadii.reduce((sum, radius) => sum + radius * 2, 0)
            + this.movingBubbleGap * Math.max(0, laneRadii.length - 1);
        if (totalLaneSize > max - min) {
            const center = (min + max) * 0.5;
            return laneRadii.map(() => center);
        }

        // Pack lane edges with exactly movingBubbleGap between them. Unlike equal center slots, this
        // leaves no artificial half-row of empty space at the top and bottom of the container.
        const positions: number[] = [];
        // Keep the tightly packed rows/columns centered in the available container area rather
        // than anchoring the whole group to one edge and leaving all unused space on the other.
        let cursor = min + (max - min - totalLaneSize) * 0.5;
        for (let index = 0; index < laneRadii.length; index++) {
            const radius = laneRadii[index];
            cursor += radius;
            positions.push(cursor);
            cursor += radius + this.movingBubbleGap;
        }
        return positions;
    }

    private getLaneMoveLimits(
        bounds: { xMin: number, xMax: number, yMin: number, yMax: number },
        bubbleCount: number,
        laneRadius: number,
    ): { min: number, max: number } {
        const visibleMin = this.moveType === MoveType.Horizontal ? bounds.xMin : bounds.yMin;
        const visibleMax = this.moveType === MoveType.Horizontal ? bounds.xMax : bounds.yMax;
        const visibleSize = visibleMax - visibleMin;
        const desiredVisibleBubbles = Math.min(
            bubbleCount,
            Math.max(1, this.moveType === MoveType.Horizontal ? this.columnsDisplay : this.rowsDisplay),
        );

        // Make the loop long enough that only the requested number of bubbles appears in the
        // container at once; the physical-size minimum still prevents overlapping bubbles.
        const requestedCycleSize = visibleSize * bubbleCount / desiredVisibleBubbles;
        const contentCycleSize = (laneRadius * 2 + this.movingBubbleGap) * bubbleCount;
        const minimumCycleSize = visibleSize + laneRadius * 2;
        const cycleSize = Math.max(requestedCycleSize, contentCycleSize, minimumCycleSize);
        return {
            min: visibleMin - laneRadius,
            max: visibleMin - laneRadius + cycleSize,
        };
    }

    private getMovingBubbleScale(
        maxBubblesPerLane: number,
        laneRadii: number[],
        bounds: { xMin: number, xMax: number, yMin: number, yMax: number },
    ): number {
        const mainAxisSize = this.moveType === MoveType.Horizontal
            ? bounds.xMax - bounds.xMin
            : bounds.yMax - bounds.yMin;
        const crossAxisSize = this.moveType === MoveType.Horizontal
            ? bounds.yMax - bounds.yMin
            : bounds.xMax - bounds.xMin;
        const desiredVisibleBubbles = Math.max(
            1,
            Math.min(maxBubblesPerLane, this.moveType === MoveType.Horizontal ? this.columnsDisplay : this.rowsDisplay),
        );
        const waveSpace = (this.moveType === MoveType.Horizontal
            ? Math.max(0, this.bobAmplitude)
            : Math.max(0, this.waveAmplitude)) * 2;

        // Fit both the requested on-screen density and tightly packed lanes. The latter uses
        // their actual radii rather than reserving an additional empty half-slot at each edge.
        const largestRadius = Math.max(...laneRadii);
        const scaleForMovingSlots = (mainAxisSize / desiredVisibleBubbles - this.movingBubbleGap) / (largestRadius * 2);
        const totalNativeDiameter = laneRadii.reduce((sum, radius) => sum + radius * 2, 0);
        const scaleForLanes = (crossAxisSize - this.padding * 2 - waveSpace
            - this.movingBubbleGap * Math.max(0, laneRadii.length - 1)) / totalNativeDiameter;
        return Math.max(0.01, Math.min(1, scaleForMovingSlots, scaleForLanes));
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


