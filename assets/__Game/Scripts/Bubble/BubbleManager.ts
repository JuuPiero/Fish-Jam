import { _decorator, Collider2D, Component, Enum, instantiate, Node, Prefab, RigidBody2D, tween, UITransform, Vec3 } from 'cc';
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
    axisPosition: number;
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
    @property({ tooltip: 'Seconds bubbles take to slide into a freed slot; all lane movement pauses until this finishes' })
    reflowPauseDuration: number = 0.2;
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
    private _spawnGeneration = 0;
    private _reflowTweenCount = 0;
    private _reflowGeneration = 0;


    initialize(levelData: LevelData, onSpawnComplete?: () => void) {
        const spawnGeneration = ++this._spawnGeneration;
        this._movingBubbles = [];
        this._movingLanes = [];
        this._moveTime = 0;
        this._reflowTweenCount = 0;
        this._reflowGeneration++;
        for (const child of this.node.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        const bubblePrefab = ServiceLocator.get(GameConfigSA).bubblePrefab;
        const spawnPos = this.spawnPosNode.worldPosition;

        if (this.moveType !== MoveType.None) {
            this.scheduleOnce(() => {
                if (spawnGeneration !== this._spawnGeneration || !this.node.isValid) {
                    return;
                }
                this.spawnMovingBubbles(levelData, bubblePrefab, spawnPos);
                onSpawnComplete?.();
            }, 0);
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
        onSpawnComplete?.();
    }

    protected update(deltaTime: number): void {
        if (this.moveType === MoveType.None) {
            return;
        }

        // A reflow owns the positions while bubbles slide into their newly freed slots. Do not
        // advance the lane or sine-wave at the same time, otherwise the two motions fight and
        // make the rows visibly jitter.
        if (this._reflowTweenCount > 0) {
            return;
        }
        if (this.reflowAfterDestroyedBubbles()) {
            return;
        }
        if (this.speed <= 0) {
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
            movingBubble.axisPosition = next;
            movingBubble.node.setWorldPosition(this.getMovingBubbleWorldPosition(movingBubble, next, position.z));
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
                axisPosition: 0,
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
                movingBubble.axisPosition = axisPosition;
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

    // Removes invalid bubbles once, then shifts only the bubbles necessary to fill the freed
    // slots. The previous implementation redistributed every bubble across a new loop length;
    // that changed the position of whole rows and caused the apparent "jump" on each pop.
    private reflowAfterDestroyedBubbles(): boolean {
        let hasDestroyedBubble = false;
        const bounds = this.getContainerBounds();
        const previousLaneCount = this._movingLanes.length;
        for (const lane of this._movingLanes) {
            const removedBubbles = lane.bubbles.filter(bubble => !bubble.node.isValid);
            if (removedBubbles.length === 0) {
                continue;
            }

            const activeBubbles = lane.bubbles.filter(bubble => bubble.node.isValid);
            this.compactLaneIntoFreedSlots(lane, activeBubbles, removedBubbles);
            if (bounds && activeBubbles.length > 0) {
                this.shortenLaneAfterCompaction(lane, activeBubbles, removedBubbles.length, bounds);
            }
            lane.bubbles = activeBubbles;
            hasDestroyedBubble = true;
        }
        if (!hasDestroyedBubble) {
            return false;
        }

        this._movingLanes = this._movingLanes.filter(lane => lane.bubbles.length > 0);
        this._movingBubbles = [];
        for (const lane of this._movingLanes) {
            this._movingBubbles.push(...lane.bubbles);
        }
        if (this._movingLanes.length === 0) {
            return true;
        }

        // A regular pop only changes one lane's loop length. Its row/column must stay on its
        // existing cross-axis position; recalculating every lane here can collapse them onto
        // one center when the UI bounds are temporarily constrained. Re-layout only after an
        // entire row/column has actually disappeared.
        if (this._movingLanes.length !== previousLaneCount) {
            this.relayoutRemainingLanes(bounds);
        }
        this.playReflowAnimation();
        return true;
    }

    // Vertical lanes always compact bottom -> top, as bubbles below a gap should rise into it.
    // Horizontal lanes follow their travel direction: left -> right rows fill from the left and
    // right -> left rows fill from the right. This covers all alternating-lane combinations.
    private compactLaneIntoFreedSlots(
        lane: MovingLane,
        activeBubbles: MovingBubble[],
        removedBubbles: MovingBubble[],
    ) {
        const compactTowardsPositiveAxis = this.moveType === MoveType.Vertical || lane.direction > 0;
        const removedSlots = removedBubbles.slice().sort((a, b) => a.axisPosition - b.axisPosition);

        for (const removedBubble of removedSlots) {
            if (compactTowardsPositiveAxis) {
                const bubblesBefore = activeBubbles
                    .filter(bubble => bubble.axisPosition < removedBubble.axisPosition)
                    .sort((a, b) => a.axisPosition - b.axisPosition);
                const slots = bubblesBefore.map(bubble => bubble.axisPosition);
                slots.push(removedBubble.axisPosition);
                bubblesBefore.forEach((bubble, index) => {
                    bubble.axisPosition = slots[index + 1];
                });
            } else {
                const bubblesAfter = activeBubbles
                    .filter(bubble => bubble.axisPosition > removedBubble.axisPosition)
                    .sort((a, b) => a.axisPosition - b.axisPosition);
                const slots = [removedBubble.axisPosition, ...bubblesAfter.map(bubble => bubble.axisPosition)];
                bubblesAfter.forEach((bubble, index) => {
                    bubble.axisPosition = slots[index];
                });
            }
        }
    }

    // A lane is a loop. Filling a gap alone only moves that empty slot to its reset edge, where
    // it becomes visible again after the next wrap. Shorten the loop as well, then space its
    // remaining bubbles evenly across the shorter loop so there is no hidden "missing slot".
    private shortenLaneAfterCompaction(
        lane: MovingLane,
        activeBubbles: MovingBubble[],
        removedCount: number,
        bounds: { xMin: number, xMax: number, yMin: number, yMax: number },
    ) {
        const previousBubbleCount = activeBubbles.length + removedCount;
        const previousMin = lane.bubbles[0].min;
        const previousMax = lane.bubbles[0].max;
        const previousRange = previousMax - previousMin;
        if (previousBubbleCount <= 0 || previousRange <= 0) {
            return;
        }

        const laneRadius = Math.max(...activeBubbles.map(bubble => bubble.radius));
        const naturalLimits = this.getLaneMoveLimits(bounds, activeBubbles.length, laneRadius);
        const shortenedRange = Math.min(previousRange, naturalLimits.max - naturalLimits.min);
        const compactTowardsPositiveAxis = this.moveType === MoveType.Vertical || lane.direction > 0;
        const min = compactTowardsPositiveAxis ? previousMax - shortenedRange : previousMin;
        const max = compactTowardsPositiveAxis ? previousMax : previousMin + shortenedRange;
        const orderedBubbles = activeBubbles.slice().sort((a, b) => a.axisPosition - b.axisPosition);

        orderedBubbles.forEach((bubble, index) => {
            bubble.min = min;
            bubble.max = max;
            // Slots include min and exclude max, matching moveWithWrap: a bubble reaching max
            // immediately returns to min and keeps the row/column continuously filled.
            bubble.axisPosition = min + shortenedRange * index / activeBubbles.length;
        });
    }

    // Only a completely empty lane changes the number of rows/columns. Re-center those lanes,
    // restore the alternating direction pattern, and animate the cross-axis change as well.
    private relayoutRemainingLanes(bounds: { xMin: number, xMax: number, yMin: number, yMax: number } | null) {
        if (!bounds) {
            return;
        }

        const laneRadii = this._movingLanes.map(lane => Math.max(...lane.bubbles.map(bubble => bubble.radius)));
        const crossAxisPositions = this.getCrossAxisPositions(laneRadii, bounds, this.spawnPosNode.worldPosition);
        this._movingLanes.forEach((lane, laneIndex) => {
            const direction = this.getLaneDirection(laneIndex);
            lane.direction = direction;
            lane.bubbles.forEach(bubble => {
                bubble.direction = direction;
                bubble.baseCrossAxis = crossAxisPositions[laneIndex];
                bubble.bobPhase = laneIndex * Math.PI;
                if (this.moveType === MoveType.Horizontal) {
                    for (const fish of bubble.bubble.fishes) {
                        fish.setFacingRight(direction > 0);
                    }
                }
            });
        });
    }

    private getLaneDirection(laneIndex: number): number {
        return this.moveType === MoveType.Horizontal
            ? (laneIndex % 2 === 0 ? 1 : -1)
            : (laneIndex % 2 === 0 ? -1 : 1);
    }

    private playReflowAnimation() {
        const duration = Math.max(0, this.reflowPauseDuration);
        const reflowGeneration = this._reflowGeneration;

        for (const movingBubble of this._movingBubbles) {
            if (!movingBubble.node.isValid) {
                continue;
            }

            const start = movingBubble.node.worldPosition.clone();
            const target = this.getMovingBubbleWorldPosition(movingBubble, movingBubble.axisPosition, start.z);
            const distance = Vec3.distance(start, target);
            if (duration <= 0 || distance <= 0.01) {
                movingBubble.node.setWorldPosition(target);
                continue;
            }

            const animation = { progress: 0 };
            this._reflowTweenCount++;
            tween(animation)
                .to(duration, { progress: 1 }, {
                    easing: 'sineInOut',
                    onUpdate: () => {
                        if (reflowGeneration !== this._reflowGeneration || !movingBubble.node.isValid) {
                            return;
                        }
                        movingBubble.node.setWorldPosition(
                            start.x + (target.x - start.x) * animation.progress,
                            start.y + (target.y - start.y) * animation.progress,
                            start.z + (target.z - start.z) * animation.progress,
                        );
                    },
                })
                .call(() => {
                    if (reflowGeneration !== this._reflowGeneration) {
                        return;
                    }
                    if (movingBubble.node.isValid) {
                        movingBubble.node.setWorldPosition(target);
                    }
                    this._reflowTweenCount = Math.max(0, this._reflowTweenCount - 1);
                })
                .start();
        }
    }

    // Keep the same sine calculation for normal movement and for a reflow target. When a slide
    // finishes, the next movement frame therefore starts at exactly the same world position.
    private getMovingBubbleWorldPosition(movingBubble: MovingBubble, axisPosition: number, z: number): Vec3 {
        if (this.moveType === MoveType.Horizontal) {
            const bobOffset = Math.sin(
                axisPosition / Math.max(1, this.bobWavelength) * Math.PI * 2
                + this._moveTime * this.bobFrequency * Math.PI * 2
                + movingBubble.bobPhase,
            ) * this.bobAmplitude;
            return new Vec3(axisPosition, movingBubble.baseCrossAxis + bobOffset, z);
        }

        const waveOffset = Math.sin(
            axisPosition / Math.max(1, this.waveLength) * Math.PI * 2
            + this._moveTime * this.waveFrequency * Math.PI * 2
            + movingBubble.bobPhase,
        ) * this.waveAmplitude;
        return new Vec3(movingBubble.baseCrossAxis + waveOffset, axisPosition, z);
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
            return this.getPackedCrossAxisPositions(laneRadii, center);
        }

        const totalLaneSize = laneRadii.reduce((sum, radius) => sum + radius * 2, 0)
            + this.movingBubbleGap * Math.max(0, laneRadii.length - 1);
        if (totalLaneSize > max - min) {
            // Never collapse every lane onto one center. This fallback is only reached when the
            // container was resized smaller than the bubble layout; keeping the lanes packed
            // (even if their outer edges clip slightly) is much less disruptive than overlap.
            return this.getPackedCrossAxisPositions(laneRadii, (min + max) * 0.5);
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

    private getPackedCrossAxisPositions(laneRadii: number[], center: number): number[] {
        const totalLaneSize = laneRadii.reduce((sum, radius) => sum + radius * 2, 0)
            + this.movingBubbleGap * Math.max(0, laneRadii.length - 1);
        const positions: number[] = [];
        let cursor = center - totalLaneSize * 0.5;
        for (const radius of laneRadii) {
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


