import { _decorator, CircleCollider2D, Collider2D, Component, Contact2DType, ICollisionEvent, instantiate, IPhysics2DContact, Node, RigidBody2D, Size, UITransform, tween, Tween } from 'cc';
import { BubbleData } from '../Data/LevelData';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { GameConfigSA } from '../Data/GameConfigSA';
import { Fish } from '../Fish/Fish';
const { ccclass, property } = _decorator;

@ccclass('Bubble')
export class Bubble extends Component {
    @property({ readonly: true }) radius: number = 0;
    _uiTransform: UITransform;
    _collider: CircleCollider2D = null;


    @property({ readonly: true, type: [Fish] }) fishes: Fish[] = []

    private static readonly FISH_GAP = 10;
    private static readonly BUBBLE_PADDING = 30;
    private static readonly MIN_RADIUS = 100;

    // Only bounce when the bubble is actually moving with some speed - e.g. floating up at the
    // start, or resettling after a neighbor gets destroyed. Bubbles already at rest constantly
    // re-trigger BEGIN_CONTACT against their neighbors from tiny physics jitter; that jitter
    // never reaches this speed, so it no longer spams the bounce effect.
    @property({ tooltip: 'Minimum speed (units/s) a bubble must have on contact to play the bounce effect' })
    bounceSpeedThreshold: number = 40;

    private _rigidBody: RigidBody2D | null = null;
    private _bounceTween: Tween<UITransform> | null = null;
    private _wobbleTween: Tween<Node> | null = null;

    protected onLoad(): void {
        this._uiTransform = this.getComponent(UITransform);
        this._collider = this.getComponent(CircleCollider2D);
        this._rigidBody = this.getComponent(RigidBody2D);
        this._collider.on(Contact2DType.BEGIN_CONTACT, this.onCollisionEnter, this);
    }
    protected start(): void {
        // this._collider.on('onCollisionEnter', this.onCollisionEnter, this)

    }
    getRadius() {
        return this._uiTransform.contentSize.x;
    }

    // Resize the bubble to fit its fishes and lay them out evenly spaced on a ring,
    // taking each fish's own (possibly different) size into account.
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
        const angleStep = (Math.PI * 2) / count;

        // Ring radius must be big enough that every pair of neighboring fish
        // (which can have different sizes) doesn't overlap.
        let ringRadius = 0;
        if (count > 1) {
            for (let i = 0; i < count; i++) {
                const next = (i + 1) % count;
                const minCenterDistance = fishRadii[i] + fishRadii[next] + Bubble.FISH_GAP;
                const requiredRingRadius = minCenterDistance / (2 * Math.sin(angleStep / 2));
                ringRadius = Math.max(ringRadius, requiredRingRadius);
            }
        }

        const bubbleRadius = Math.max(Bubble.MIN_RADIUS, ringRadius + maxFishRadius + Bubble.BUBBLE_PADDING);

        this.radius = bubbleRadius;
        this._uiTransform.setContentSize(bubbleRadius * 2, bubbleRadius * 2);
        this._collider.radius = bubbleRadius;

        this.fishes.forEach((fish, index) => {
            if (count === 1) {
                fish.node.setPosition(0, 0, 0);
                return;
            }
            const angle = angleStep * index;
            fish.node.setPosition(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0);
        });
    }

    initiallize(data: BubbleData) {
        const fishPrefab = ServiceLocator.get(GameConfigSA).fishPrefab;
        //spawn fishes
        for (const fishId of data.fishes) {
            const fishNode = instantiate(fishPrefab)
            fishNode.setParent(this.node);
            const fish = fishNode.getComponent(Fish)
            this.fishes.push(fish);
            fish.initialize(fishId);
        }
        this.calculateRadius();
    }


    onCollisionEnter(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        const speedSqr = this._rigidBody ? this._rigidBody.linearVelocity.lengthSqr() : 0;
        if (speedSqr < this.bounceSpeedThreshold * this.bounceSpeedThreshold) {
            return;
        }
        this.bounce();
    }

    // Juicy jelly "boing" on impact: a couple of damped squash/stretch oscillations plus a
    // matching rotation wobble. Both only ever touch the sprite's contentSize and the node's
    // z-angle - a circle collider doesn't care about rotation, so the CircleCollider2D radius
    // and the fish children's local positions never move, and bubbles can't drift into
    // overlapping each other.
    bounce() {
        this._bounceTween?.stop();
        this._wobbleTween?.stop();

        const size = this.radius * 2;
        this._bounceTween = tween(this._uiTransform)
            .to(0.06, { contentSize: new Size(size * 1.1, size * 0.92) }, { easing: 'quadOut' })
            .to(0.09, { contentSize: new Size(size * 0.96, size * 1.05) }, { easing: 'sineInOut' })
            .to(0.11, { contentSize: new Size(size * 1.02, size * 0.98) }, { easing: 'sineInOut' })
            .to(0.16, { contentSize: new Size(size, size) }, { easing: 'elasticOut' })
            .call(() => { this._bounceTween = null; })
            .start();

        const kick = (Math.random() < 0.5 ? 1 : -1) * (10 + Math.random() * 8);
        this._wobbleTween = tween(this.node)
            .to(0.06, { angle: kick }, { easing: 'quadOut' })
            .to(0.09, { angle: -kick * 0.5 }, { easing: 'sineInOut' })
            .to(0.11, { angle: kick * 0.2 }, { easing: 'sineInOut' })
            .to(0.16, { angle: 0 }, { easing: 'elasticOut' })
            .call(() => { this._wobbleTween = null; })
            .start();
    }


}


