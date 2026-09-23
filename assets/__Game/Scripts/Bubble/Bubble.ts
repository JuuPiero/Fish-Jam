import { _decorator, CircleCollider2D, Collider2D, Color, Component, Contact2DType, ICollisionEvent, instantiate, IPhysics2DContact, Node, RigidBody2D, Size, Sprite, UITransform, tween, Tween, Vec3 } from 'cc';
import { BubbleData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Fish } from '../Fish/Fish';
import { AudioManager } from 'db://assets/_iKame/Scripts/Audio/AudioManager';
import { VFXManager } from '../VFXManager';
const { ccclass, property } = _decorator;

@ccclass('Bubble')
export class Bubble extends Component {
    @property({ readonly: true }) radius: number = 0;
    private _visualTransform: UITransform;
    _collider: CircleCollider2D = null;


    @property(Node) visual: Node = null;
    @property(Node) bubbleContainer: Node = null;


    @property({ readonly: true, type: [Fish] }) fishes: Fish[] = []

    // A small visual overlap makes the fish cluster feel fuller and lets the bubble stay compact.
    private static readonly FISH_OVERLAP = 8;
    // Keep small groups compact; the packing routine grows the bubble only when a particular
    // random layout genuinely needs more room.
    private static readonly MIN_RADIUS = 55;

    @property({ tooltip: 'Smallest extra gap between neighboring fish in a bubble' })
    fishGapMin: number = -2;

    @property({ tooltip: 'Largest extra gap between neighboring fish in a bubble' })
    fishGapMax: number = 10;

    @property({ tooltip: 'Smallest empty space between the fish ring and bubble edge' })
    bubbleEdgePaddingMin: number = 5;

    @property({ tooltip: 'Largest empty space between the fish ring and bubble edge' })
    bubbleEdgePaddingMax: number = 23;

    private _fishGap = 0;
    private _bubbleEdgePadding = 10;

    // Only bounce when the bubble is actually moving with some speed - e.g. floating up at the
    // start, or resettling after a neighbor gets destroyed. Bubbles already at rest constantly
    // re-trigger BEGIN_CONTACT against their neighbors from tiny physics jitter; that jitter
    // never reaches this speed, so it no longer spams the bounce effect.
    @property({ tooltip: 'Minimum speed (units/s) a bubble must have on contact to play the bounce effect' })
    bounceSpeedThreshold: number = 40;

    // A wall of circles all pushed the same way by a constant force can still wedge into a
    // stable arch and stop moving well before reaching the top - classic granular jamming.
    // Multiplying gravity's effect on the bubble (instead of just relying on the project's
    // global gravity value) and cutting contact friction both make that arch much less stable,
    // so a stuck bubble is far more likely to keep getting nudged upward instead of freezing.
    @property({ tooltip: "Multiplies the global gravity's pull on this bubble - higher pushes it toward the top harder, helping it break out of jams against neighbors" })
    buoyancyScale: number = 1.6;

    @property({ tooltip: 'Contact friction against other bubbles/borders - kept low so bubbles slide past each other instead of locking into a stuck arch' })
    friction: number = 0.02;

    @property({ tooltip: 'How much the bubble gently expands while idle' })
    idleBounceScale: number = 1.015;

    @property({ tooltip: 'Seconds for each half of the idle bounce' })
    idleBounceDuration: number = 0.8;

    @property({ tooltip: 'Chance that this bubble slowly rotates while idle' })
    idleRotationChance: number = 0.6;

    @property({ tooltip: 'Average seconds for one full idle rotation' })
    idleRotationDuration: number = 20;

    @property({ tooltip: 'Maximum extra delay before an idle rotation starts' })
    idleRotationStartDelay: number = 4;

    private _rigidBody: RigidBody2D | null = null;
    private _bounceTween: Tween<UITransform> | null = null;
    private _idleBounceTween: Tween<UITransform> | null = null;
    private _idleWobbleTween: Tween<Node> | null = null;
    private _wobbleTween: Tween<Node> | null = null;

    protected onLoad(): void {
        this._visualTransform = this.visual.getComponent(UITransform);
        this._collider = this.getComponent(CircleCollider2D);
        this._rigidBody = this.getComponent(RigidBody2D);
        this._collider.friction = this.friction;
        if (this._rigidBody) {
            this._rigidBody.gravityScale = this.buoyancyScale;
            // The root only drives physics. Keep it unrotated so its BubbleContainer (and the
            // fish inside it) never inherit angular motion from physics contacts.
            this._rigidBody.fixedRotation = true;
        }
        this._collider.on(Contact2DType.BEGIN_CONTACT, this.onCollisionEnter, this);
    }
    protected start(): void {
        // this._collider.on('onCollisionEnter', this.onCollisionEnter, this)

    }
    getRadius() {
        return this.radius;
    }

    // Resize the bubble to fit its fishes. Fish are arranged in a balanced circle around the
    // center, using each fish's largest dimension to keep their visuals from overlapping too far.
    calculateRadius() {
        const count = this.fishes.length;
        if (count === 0) {
            return;
        }

        const fishRadii = this.fishes.map(fish => {
            const size = fish.getSize();
            return Math.max(size.width, size.height) * 0.5;
        });
        const maxFishRadius = Math.max(...fishRadii);
        const bubbleRadius = this.positionFishesInCircle(fishRadii, maxFishRadius);

        this.radius = bubbleRadius;
        this._visualTransform.setContentSize(bubbleRadius * 2, bubbleRadius * 2);
        this._collider.radius = bubbleRadius;
    }

    private positionFishesInCircle(fishRadii: number[], maxFishRadius: number): number {
        const count = this.fishes.length;
        if (count === 1) {
            this.fishes[0].node.setPosition(0, 0, 0);
            return Math.max(Bubble.MIN_RADIUS, maxFishRadius + this._bubbleEdgePadding);
        }

        const angleStep = (Math.PI * 2) / count;
        let ringRadius = 0;
        for (let index = 0; index < count; index++) {
            const nextIndex = (index + 1) % count;
            const minCenterDistance = fishRadii[index] + fishRadii[nextIndex]
                - Bubble.FISH_OVERLAP + this._fishGap;
            ringRadius = Math.max(ringRadius, minCenterDistance / (2 * Math.sin(angleStep * 0.5)));
        }

        // Randomize only the orientation and a tiny amount of spacing; the group remains a
        // centered, recognizable circle instead of scattering through the entire bubble.
        ringRadius *= 1 + Math.random() * 0.06;
        const startAngle = Math.random() * Math.PI * 2;
        this.fishes.forEach((fish, index) => {
            const angle = startAngle + angleStep * index;
            fish.node.setPosition(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0);
        });
        return Math.max(Bubble.MIN_RADIUS, ringRadius + maxFishRadius + this._bubbleEdgePadding);
    }

    // Called when a fish inside this bubble gets clicked and flies off. Detaches it from the
    // bubble node BEFORE possibly destroying the (now-empty) bubble, so the fish survives to
    // keep flying to wherever it's headed next.
    removeFish(fish: Fish) {
        const index = this.fishes.indexOf(fish);
        if (index === -1) {
            return;
        }
        this.fishes.splice(index, 1);
        // keepWorldTransform=true - otherwise the fish's bubble-relative local position gets
        // reinterpreted as an absolute one the instant it has no parent, snapping it elsewhere
        // right before it starts flying.
        fish.node.setParent(null, true);

        if (this.fishes.length === 0) {
            // const effect = instantiate(VFXManager.instance.bubbleEffect);
            // effect.setParent(this.node);
            // effect.setPosition(0, 0, 0);
            this.pop();
        }
    }

    // Satisfying "burst" once the last fish leaves: a quick anticipation squeeze, then a fast
    // scale-up while fading out, like a real bubble popping. Physics is switched off right away
    // so the popping bubble stops pushing/getting pushed by its neighbors.
    private pop() {
        this._bounceTween?.stop();
        this.stopIdleBounce();
        this._wobbleTween?.stop();
        // Keep the burst beside other bubbles (same Canvas/camera and draw layer), but not as
        // a child of this bubble because this root is destroyed when the pop animation ends.
        VFXManager.instance?.spawnBubbleEffect(this.node.worldPosition, this.node.parent);
        AudioManager.instance.playOneShot('Pop')
      


        if (this._collider) {
            this._collider.enabled = false;
        }
        if (this._rigidBody) {
            this._rigidBody.enabled = false;
        }

        tween(this.visual)
            .to(0.05, { scale: new Vec3(0.85, 0.85, 1) }, { easing: 'quadOut' })
            .to(0.18, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'quadOut' })
            .call(() => {
                // effect.destroy()
                this.node.destroy()
            })
            .start();

        const sprite = this.visual.getComponent(Sprite);
        if (sprite) {
            tween(sprite)
                .delay(0.05)
                .to(0.18, { color: new Color(255, 255, 255, 0) }, { easing: 'quadOut' })
                .start();
        }
    }

    initiallize(data: BubbleData) {
        // Each bubble gets a stable layout variation at spawn: fish still form one centered
        // circle, but same-count bubbles no longer all have identical diameters.
        this._fishGap = this.randomRange(this.fishGapMin, this.fishGapMax);
        this._bubbleEdgePadding = this.randomRange(this.bubbleEdgePaddingMin, this.bubbleEdgePaddingMax);
        const fishPrefab = ServiceLocator.get(GameConfigSA).fishPrefab;
        //spawn fishes
        for (const fishId of data.fishes) {
            const fishNode = instantiate(fishPrefab)
            fishNode.setParent(this.bubbleContainer);
            const fish = fishNode.getComponent(Fish)
            this.fishes.push(fish);
            fish.initialize(fishId);
        }
        this.calculateRadius();
        this.startIdleBounce();
    }

    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }


    onCollisionEnter(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        const speedSqr = this._rigidBody ? this._rigidBody.linearVelocity.lengthSqr() : 0;
        if (speedSqr < this.bounceSpeedThreshold * this.bounceSpeedThreshold) {
            return;
        }
        this.bounce();
    }

    // Juicy jelly "boing" on impact: a couple of damped squash/stretch oscillations plus a
    // matching rotation wobble. Both only ever touch `visual`; the root node continues to own
    // physics/collider state, while fish stay in their separate bubbleContainer.
    bounce() {
        this.stopIdleBounce();
        this._bounceTween?.stop();
        this._wobbleTween?.stop();

        const size = this.radius * 2;
        this._bounceTween = tween(this._visualTransform)
            .to(0.06, { contentSize: new Size(size * 1.1, size * 0.92) }, { easing: 'quadOut' })
            .to(0.09, { contentSize: new Size(size * 0.96, size * 1.05) }, { easing: 'sineInOut' })
            .to(0.11, { contentSize: new Size(size * 1.02, size * 0.98) }, { easing: 'sineInOut' })
            .to(0.16, { contentSize: new Size(size, size) }, { easing: 'elasticOut' })
            .call(() => {
                this._bounceTween = null;
                this.startIdleBounce();
            })
            .start();

        const kick = (Math.random() < 0.5 ? 1 : -1) * (10 + Math.random() * 8);
        this._wobbleTween = tween(this.visual)
            .to(0.06, { angle: kick }, { easing: 'quadOut' })
            .to(0.09, { angle: -kick * 0.5 }, { easing: 'sineInOut' })
            .to(0.11, { angle: kick * 0.2 }, { easing: 'sineInOut' })
            .to(0.16, { angle: 0 }, { easing: 'elasticOut' })
            .call(() => { this._wobbleTween = null; })
            .start();
    }

    // Keep stationary bubbles feeling alive without changing their physics collider. The
    // alternating squash/stretch and a slow rotation make this read as a jelly bounce, rather
    // than simply a uniform breathing scale. A stronger collision bounce temporarily takes over.
    private startIdleBounce() {
        if (this._idleBounceTween || this.radius <= 0) {
            return;
        }

        const size = this.radius * 2;
        const stretchedSize = size * this.idleBounceScale;
        const squashedSize = size * (2 - this.idleBounceScale);
        const idleDelay = Math.random() * this.idleBounceDuration;
        this._idleBounceTween = tween(this._visualTransform)
            .delay(idleDelay)
            .repeatForever(
                tween()
                    .to(this.idleBounceDuration * 0.35, { contentSize: new Size(stretchedSize, squashedSize) }, { easing: 'sineOut' })
                    .to(this.idleBounceDuration * 0.45, { contentSize: new Size(squashedSize, stretchedSize) }, { easing: 'sineInOut' })
                    .to(this.idleBounceDuration * 0.4, { contentSize: new Size(size, size) }, { easing: 'sineInOut' })
                    .delay(this.idleBounceDuration * 1.5),
            )
            .start();

        // Vary whether, when, how fast, and in which direction each bubble rotates so groups
        // never look synchronized. Some bubbles intentionally remain still.
        if (Math.random() < this.idleRotationChance) {
            const rotationDuration = this.idleRotationDuration * (0.8 + Math.random() * 0.6);
            const rotationAngle = Math.random() < 0.5 ? 360 : -360;
            this._idleWobbleTween = tween(this.visual)
                .delay(idleDelay + Math.random() * this.idleRotationStartDelay)
                .repeatForever(
                    tween()
                        .by(rotationDuration, { angle: rotationAngle }, { easing: 'linear' }),
                )
                .start();
        }
    }

    private stopIdleBounce() {
        this._idleBounceTween?.stop();
        this._idleWobbleTween?.stop();
        this._idleBounceTween = null;
        this._idleWobbleTween = null;
        this.visual.angle = 0;
    }


}
