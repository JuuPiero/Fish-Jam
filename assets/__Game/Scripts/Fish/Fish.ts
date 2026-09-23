import { _decorator, Button, Component, EventMouse, math, Node, sp, Sprite, tween, Tween, UITransform, Vec3 } from 'cc';
import { Order } from '../Order/Order';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
import { AudioManager } from 'db://assets/_iKame/Scripts/Audio/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('Fish')
export class Fish extends Component {

    _button: Button = null;

    @property({ readonly: true }) id: number = -1;

    @property(Node) visual: Node = null;
    @property(sp.Skeleton) fishAnim: sp.Skeleton = null;

    onclick: () => void = null;

    // Keep the Cocos path behavior aligned with GameItemController in the Unity project: path
    // duration is based on its total length, not a fixed duration per destination.
    @property({ tooltip: 'Flight speed in UI units per second' })
    flySpeed: number = 700;

    @property({ tooltip: 'Minimum duration so short flights remain visible' })
    flyMinDuration: number = 0.55;

    @property({ tooltip: 'Perpendicular offset of the default flight waypoint' })
    flyWaypointOffset: number = 100;

    @property({ tooltip: 'Vertical approach distance before landing in a waiting slot' })
    flySlotApproachDistance: number = 65;

    @property({ tooltip: 'Visual forward-angle correction while following the flight path' })
    flyAngleOffset: number = 180;

    @property({ tooltip: 'How quickly the fish turns toward its flight path each frame (0 = no turn, 1 = instant)' })
    flyRotationSmoothness: number = 0.18;

    @property({ tooltip: 'Normalized point on the flight path where the fish begins turning back to its stable 0-degree pose' })
    flyRotationSettleStart: number = 0.72;

    @property({ tooltip: 'How far above a slot the fish ends its flight before dropping in' })
    landingDropHeight: number = 26;

    @property({ tooltip: 'Height above an order lid before the fish descends into it' })
    flyOrderLidApproachDistance: number = 140;

    private static readonly PATH_SAMPLES_PER_SEGMENT = 16;
    private static readonly HOVER_SCALE = new Vec3(1.1, 1.1, 1.1);
    private static readonly HOVER_DURATION = 0.12;

    private _flyTween: Tween<{ progress: number }> | null = null;
    private _hoverTween: Tween<Node> | null = null;
    private _pathPoints: Vec3[] = [];
    private _pathSamples: Vec3[] = [];
    private _pathDistances: number[] = [];
    private _pathLength = 0;
    private _landingRotationTween: Tween<Node> | null = null;
    private _landingScaleTween: Tween<Node> | null = null;

    protected onLoad(): void {
        this._button = this.getComponent(Button)
        this.fishAnim = this.visual.getComponent(sp.Skeleton);
    }
    protected onEnable(): void {
        this._button.node.on(Button.EventType.CLICK, this.onFishClick, this)
        this._button.node.on(Node.EventType.MOUSE_ENTER, this.onMouseEnter, this);
        // Triggered when mouse moves out of the node bounding box
        this._button.node.on(Node.EventType.MOUSE_LEAVE, this.onMouseLeave, this);
    }
    protected onDisable(): void {
        this._button.node.off(Button.EventType.CLICK, this.onFishClick, this)
        this._button.node.off(Node.EventType.MOUSE_ENTER, this.onMouseEnter, this);
        this._button.node.off(Node.EventType.MOUSE_LEAVE, this.onMouseLeave, this);
    }
    initialize(id: number) {
        this.id = id;
        // const spriteFrame = ServiceLocator.get(FishConfigSA).fishs[id];
        // this.visual.getComponent(Sprite).spriteFrame = spriteFrame;
        this.fishAnim.setSkin(ServiceLocator.get(FishConfigSA).fishes[id]);
        // Match the visual to this sprite's real (trimmed) size instead of whatever size the
        // prefab happened to be baked with - fish types vary a lot in size, and that size is
        // what Bubble.calculateRadius() reads via getSize(), so bubbles size themselves
        // differently depending on which fish they actually contain.
        this.visual.getComponent(UITransform).setContentSize(this.fishAnim.getComponent(UITransform).contentSize);

        // Do not rely only on the prefab's defaultAnimation. Unlike Unity's
        // SkeletonAnimation (which reapplies its AnimationState after SetSkin), changing a
        // Cocos skin can leave the skeleton on its current setup pose. Explicitly keep the
        // swimming track looping so the tail/fins continue animating while this node tweens.
        this.fishAnim.timeScale = 1;
        this.fishAnim.setAnimation(0, 'animation', true);
    }

    onFishClick() {
        // Clear any hover animation and snap back to normal size first, so the fly tween (which
        // reads the current scale as its starting point) always starts from a clean baseline
        // instead of whatever size the hover happened to leave it at.
        this._hoverTween?.stop();
        this._hoverTween = null;
        this.node.setScale(1, 1, 1);
        this.node.angle = 0;

        this.onclick?.();
        EventBus.emit(GameEvents.FISH_CLICKED, this);
    }

    onMouseEnter(event: EventMouse) {
        // Ignore hover once the fish is no longer clickable - already tapped and flying off,
        // parked on the bench, or delivered - so it can't start growing again mid-flight.
        if (!this._button.interactable) {
            return;
        }
        this._hoverTween?.stop();
        this._hoverTween = tween(this.node)
            .to(Fish.HOVER_DURATION, { scale: Fish.HOVER_SCALE }, { easing: 'quadOut' })
            .start();
    }

    onMouseLeave(event: EventMouse) {
        // Always reset regardless of interactable - if the mouse leaves right as the fish gets
        // clicked, it must still shrink back so it doesn't fly off stuck at the hover size.
        this._hoverTween?.stop();
        this._hoverTween = tween(this.node)
            .to(Fish.HOVER_DURATION, { scale: Vec3.ONE }, { easing: 'quadOut' })
            .start();
    }

    setInteractable(value: boolean) {
        this._button.interactable = value;
    }

    // A waiting slot uses the default curved path and a short vertical approach before landing.
    flyToSlot(slot: Node, flyLayer: Node, onArrive?: () => void) {
        this._flyTo(slot, flyLayer, null, () => {
            this.landInSlot(slot);
            onArrive?.();
        });
    }

    // Claims the next empty placeholder on `order` right away (so a second matching fish can't
    // also get sent here mid-flight). On arrival, the Fish itself becomes the slot visual.
    flyToOrder(order: Order, flyLayer: Node, onArrive?: () => void) {
        const slotPos = order.claimNextSlot();
        if (!slotPos) {
            return;
        }
        // lidPos is the order's entry waypoint. Supplying an empty path still deliberately
        // disables the waiting-slot approach, matching Unity's entryPath behavior.
        this._flyTo(slotPos, flyLayer, order.lidPos ? [order.lidPos] : [], () => {
            this.landInSlot(slotPos);
            order.fillSlot(slotPos);
            onArrive?.();
        });
    }

    // The root canvas is only a temporary flight layer. Once landed, restore ownership to the
    // destination slot so hierarchy, clipping, and later slot animation stay correct.
    private landInSlot(slot: Node) {
        if (!slot?.isValid) {
            return;
        }
        // Preserve the raised end-of-flight world position, then let the fish visibly drop
        // into its slot. This reads much better for the game's jars and glass tube than a
        // scale-only punch at a stationary point.
        this.node.setParent(slot, true);
        this.node.setScale(Vec3.ONE);
        // Restore the authored Spine pose after flight. Never keep procedural bone offsets on
        // a fish that has landed and now acts as a persistent order/slot visual.
        this.fishAnim.setAnimation(0, 'animation', true);
        this._landingRotationTween?.stop();
        this._landingScaleTween?.stop();
        // `angle: 0` in a normal tween can choose the long numerical route (for example
        // 270 -> 0). Use the equivalent of 0 degrees nearest to the current angle instead.
        const stableAngle = this.nearestEquivalentAngle(this.node.angle, 0);
        this._landingRotationTween = tween(this.node)
            .to(0.16, { angle: stableAngle }, { easing: 'sineOut' })
            .call(() => {
                this.node.angle = 0;
                this._landingRotationTween = null;
            })
            .start();
        // A water-like landing: drop past the resting point, squash on contact, rebound once,
        // then settle. Keep it on the root so the Spine swim animation stays untouched.
        this._landingScaleTween = tween(this.node)
            .to(0.10, { position: new Vec3(0, -5, 0), scale: new Vec3(1.10, 0.88, 1) }, { easing: 'quadIn' })
            .to(0.09, { position: new Vec3(0, 2, 0), scale: new Vec3(0.97, 1.04, 1) }, { easing: 'sineOut' })
            .to(0.16, { position: Vec3.ZERO, scale: Vec3.ONE }, { easing: 'elasticOut' })
            .call(() => { this._landingScaleTween = null; })
            .start();
    }

    // Pull the fish onto the flight layer, then follow the same sampled centripetal Catmull-Rom
    // path style as Unity's GameItemController. Sampling by distance keeps speed consistent
    // across short and long routes.
    private _flyTo(target: Node, flyLayer: Node, entryPath: readonly Node[] | null, onArrive?: () => void) {
        this._flyTween?.stop();
        this._hoverTween?.stop();
        this._landingRotationTween?.stop();
        this._landingScaleTween?.stop();
        this._hoverTween = null;

        const endWorldPos = target.worldPosition.clone();
        endWorldPos.y += this.landingDropHeight;
        const endWorldScale = target.worldScale.clone();
        AudioManager.instance.playOneShot('Swim')
        const parent = flyLayer ?? target.parent;
        if (parent) {
            this.node.setParent(parent, true);
        }

        const endLocalPos = new Vec3();
        if (parent) {
            parent.inverseTransformPoint(endLocalPos, endWorldPos);
        } else {
            Vec3.copy(endLocalPos, endWorldPos);
        }

        const parentWorldScale = parent ? parent.worldScale : Vec3.ONE;
        const endLocalScale = new Vec3(
            endWorldScale.x / (parentWorldScale.x || 1),
            endWorldScale.y / (parentWorldScale.y || 1),
            1,
        );

        const startPos = this.node.position.clone();
        const startScale = this.node.scale.clone();
        this.buildFlightPath(startPos, endLocalPos, parent, entryPath);

        const duration = Math.max(this.flyMinDuration, this.flySpeed > 0 ? this._pathLength / this.flySpeed : 0);
        const flight = { progress: 0 };
        this._flyTween = tween(flight)
            .to(duration, { progress: 1 }, {
                easing: 'sineInOut',
                onUpdate: state => {
                    const position = this.evaluateFlightPath(state.progress);
                    const lookAhead = this.evaluateFlightPath(Math.min(1, state.progress + 0.01));
                    this.node.setPosition(position);
                    const dx = lookAhead.x - position.x;
                    const dy = lookAhead.y - position.y;
                    if (dx * dx + dy * dy > 0.001) {
                        const direction = Math.atan2(dy, dx) * 180 / Math.PI;
                        const directionAngle = direction + this.flyAngleOffset;
                        // Near the destination, smoothly favor the stable slot pose (0°)
                        // rather than following a rapidly changing final spline tangent.
                        const settleStart = Math.max(0, Math.min(0.99, this.flyRotationSettleStart));
                        const settleProgress = Math.max(0, Math.min(1,
                            (state.progress - settleStart) / (1 - settleStart),
                        ));
                        const targetAngle = this.lerpAngleShortest(directionAngle, 0, settleProgress);
                        this.node.angle = this.smoothAngle(
                            this.node.angle,
                            targetAngle,
                            this.flyRotationSmoothness,
                        );
                    }
                    this.node.setScale(
                        startScale.x + (endLocalScale.x - startScale.x) * state.progress,
                        startScale.y + (endLocalScale.y - startScale.y) * state.progress,
                        1,
                    );
                },
            })
            .call(() => {
                this._flyTween = null;
                onArrive?.();
            })
            .start();
    }

    // Interpolate along the shortest circular arc. A normal numeric lerp would occasionally
    // rotate almost a full circle when the target crosses -180/180 degrees.
    private smoothAngle(from: number, to: number, amount: number): number {
        const delta = this.shortestAngleDelta(from, to);
        return from + delta * Math.max(0, Math.min(1, amount));
    }

    private lerpAngleShortest(from: number, to: number, amount: number): number {
        return from + this.shortestAngleDelta(from, to) * Math.max(0, Math.min(1, amount));
    }

    private nearestEquivalentAngle(from: number, target: number): number {
        return from + this.shortestAngleDelta(from, target);
    }

    private shortestAngleDelta(from: number, to: number): number {
        let delta = (to - from) % 360;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    }

    private buildFlightPath(from: Vec3, to: Vec3, flightParent: Node | null, entryPath: readonly Node[] | null) {
        this._pathPoints = [from.clone()];
        if (entryPath !== null) {
            // Unity stores entry points from inner to outer, so fly through them in reverse.
            const entryPoints: Vec3[] = [];
            for (let index = entryPath.length - 1; index >= 0; index--) {
                const point = entryPath[index];
                if (!point || !point.isValid) {
                    continue;
                }
                const localPoint = new Vec3();
                if (flightParent) {
                    flightParent.inverseTransformPoint(localPoint, point.worldPosition);
                } else {
                    Vec3.copy(localPoint, point.worldPosition);
                }
                localPoint.z = from.z;
                entryPoints.push(localPoint);
            }

            // The Cocos order currently exposes its innermost entry marker as lidPos. Add the
            // outer approach point here so a fish reaches the lid from above, then descends into
            // the order instead of curving straight toward a slot from the side.
            if (entryPoints.length > 0) {
                const outerPoint = entryPoints[0];
                this._pathPoints.push(new Vec3(
                    outerPoint.x,
                    outerPoint.y + this.flyOrderLidApproachDistance,
                    outerPoint.z,
                ));
                this._pathPoints.push(...entryPoints);
            }
        } else {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0.001) {
                this._pathPoints.push(new Vec3(
                    from.x + dx * 0.5 - dy / distance * this.flyWaypointOffset,
                    from.y + dy * 0.5 + dx / distance * this.flyWaypointOffset,
                    from.z,
                ));
            }
            if (this.flySlotApproachDistance > 0) {
                this._pathPoints.push(new Vec3(to.x, to.y - this.flySlotApproachDistance, to.z));
            }
        }
        this._pathPoints.push(to.clone());
        this.sampleFlightPath();
    }

    private sampleFlightPath() {
        this._pathSamples = [this._pathPoints[0].clone()];
        this._pathDistances = [0];
        const segmentCount = this._pathPoints.length - 1;
        for (let segment = 0; segment < segmentCount; segment++) {
            for (let step = 1; step <= Fish.PATH_SAMPLES_PER_SEGMENT; step++) {
                const point = this.evaluateFlightSegment(segment, step / Fish.PATH_SAMPLES_PER_SEGMENT);
                const previous = this._pathSamples[this._pathSamples.length - 1];
                this._pathSamples.push(point);
                this._pathDistances.push(this._pathDistances[this._pathDistances.length - 1] + Vec3.distance(previous, point));
            }
        }
        this._pathLength = this._pathDistances[this._pathDistances.length - 1];
    }

    private evaluateFlightSegment(segment: number, u: number): Vec3 {
        const last = this._pathPoints.length - 1;
        const p1 = this._pathPoints[segment];
        const p2 = this._pathPoints[segment + 1];
        const p0 = segment > 0 ? this._pathPoints[segment - 1] : new Vec3(p1.x * 2 - p2.x, p1.y * 2 - p2.y, p1.z);
        const p3 = segment + 2 <= last ? this._pathPoints[segment + 2] : new Vec3(p2.x * 2 - p1.x, p2.y * 2 - p1.y, p2.z);
        const t0 = 0;
        const t1 = t0 + Fish.knotSpan(p0, p1);
        const t2 = t1 + Fish.knotSpan(p1, p2);
        const t3 = t2 + Fish.knotSpan(p2, p3);
        const t = t1 + (t2 - t1) * u;
        const a1 = Fish.interpolateKnot(p0, p1, t0, t1, t);
        const a2 = Fish.interpolateKnot(p1, p2, t1, t2, t);
        const a3 = Fish.interpolateKnot(p2, p3, t2, t3, t);
        const b1 = Fish.interpolateKnot(a1, a2, t0, t2, t);
        const b2 = Fish.interpolateKnot(a2, a3, t1, t3, t);
        return Fish.interpolateKnot(b1, b2, t1, t2, t);
    }

    private evaluateFlightPath(progress: number): Vec3 {
        if (this._pathLength <= 0.001) {
            return this._pathSamples[0].clone();
        }
        const distance = progress * this._pathLength;
        const last = this._pathSamples.length - 1;
        let low = 0;
        let high = last;
        while (high - low > 1) {
            const middle = (low + high) >> 1;
            if (this._pathDistances[middle] <= distance) {
                low = middle;
            } else {
                high = middle;
            }
        }
        const span = this._pathDistances[high] - this._pathDistances[low];
        const ratio = span > 0.001 ? (distance - this._pathDistances[low]) / span : 0;
        return Vec3.lerp(new Vec3(), this._pathSamples[low], this._pathSamples[high], ratio);
    }

    private static knotSpan(from: Vec3, to: Vec3): number {
        return Math.max(Math.sqrt(Vec3.distance(from, to)), 0.0001);
    }

    private static interpolateKnot(from: Vec3, to: Vec3, fromKnot: number, toKnot: number, knot: number): Vec3 {
        const ratio = (knot - fromKnot) / (toKnot - fromKnot);
        return new Vec3(
            from.x + (to.x - from.x) * ratio,
            from.y + (to.y - from.y) * ratio,
            from.z + (to.z - from.z) * ratio,
        );
    }

    getSize() {
        const size = this.visual.getComponent(UITransform).contentSize;
        const scale = this.visual.scale;
        return new math.Size(size.width * Math.abs(scale.x), size.height * Math.abs(scale.y));
    }
}


