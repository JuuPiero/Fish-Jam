import { _decorator, CircleCollider2D, Collider2D, Component, Contact2DType, ICollisionEvent, instantiate, IPhysics2DContact, Size, UITransform, tween, Tween } from 'cc';
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

    private _bounceTween: Tween<UITransform> | null = null;

    protected onLoad(): void {
        this._uiTransform = this.getComponent(UITransform);
        this._collider = this.getComponent(CircleCollider2D);
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
        console.log("va chạm");
        
        this.bounce();

    }

    // Squishy "boing" pop on impact. Tweens the bubble sprite's contentSize (not the node's
    // scale), so only the visual bulges/squashes - the CircleCollider2D radius and the fish
    // children's positions never move, so bubbles can't drift into overlapping each other.
    bounce() {
        this._bounceTween?.stop();
        const size = this.radius * 2;
        this._bounceTween = tween(this._uiTransform)
            .to(0.05, { contentSize: new Size(size * 1.15, size * 0.85) }, { easing: 'quadOut' })
            .to(0.3, { contentSize: new Size(size, size) }, { easing: 'elasticOut' })
            .call(() => { this._bounceTween = null; })
            .start();
    }


}


