import { _decorator, Component, Label, Node, sp, tween, Tween, Vec3 } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
import { Fish } from '../Fish/Fish';
import { VFXManager } from '../VFXManager';
const { ccclass, property } = _decorator;

@ccclass('Order')
export class Order extends Component {
    @property({readonly: true}) id: number = -1;
    @property(Node) slotsPos: Node[] = []
    @property(Node) lidPos: Node = null;
    @property(Node) targetVisual: Node = null;

    @property(Label) countlabel: Label = null;


    @property({ tooltip: 'Total seconds for the whole complete-then-spawn pop (anticipation + shrink + pause + bounce-in + settle)' })
    popDuration: number = 1.3;

    @property({ tooltip: 'Scale the order shrinks to on completion, right before the next order pops in' })
    popMinScale: number = 0.05;

    @property({ tooltip: 'How far past full size the new order overshoots on its first bounce while popping in' })
    popOvershootScale: number = 1.2;

    @property({ tooltip: 'Degrees of wobble shake layered on top of the scale pop' })
    popShakeAngle: number = 12;

    // Claimed = already promised to a fish that's mid-flight here; delivered = that fish has
    // actually landed. Split in two so a second fish of the same type can't ALSO get sent to
    // this order while the first is still ~0.4s from landing on the last open slot.
    private _claimedCount = 0;
    private _deliveredCount = 0;
    private _popTween: Tween<Node> | null = null;
    private _shakeTween: Tween<Node> | null = null;
    // True from reset() until playResetPop() fully settles. A fish lands by reparenting into
    // one of slotsPos, itself a descendant of this node - routing one here while still popping
    // would land it mid scale/rotation tween. Folded into isFullyClaimed (rather than a separate
    // check) so it blocks every route-to-this-order path - GameManager's auto-pull of bench fish
    // AND a fresh player click matching this order's new id - with a single guard.
    private _isPoppingIn = false;


    get isComplete(): boolean {
        return this._deliveredCount >= this.slotsPos.length;
    }

    // True once every slot already has a fish either landed or currently flying toward it, OR
    // the order is still mid pop-in - either way, this (not isComplete) is what should stop new
    // fish from being routed here.
    get isFullyClaimed(): boolean {
        return this._isPoppingIn || this._claimedCount >= this.slotsPos.length;
    }

    initialize(id: number) {
        this.id = id;
        this._claimedCount = 0;
        this._deliveredCount = 0;
        this.updateUI();
        this.applySlotVisuals();
    }

    // Called once this order has been fully delivered and reassigned to the next fish id.
    // State updates immediately so routing logic (isFullyClaimed/claimNextSlot) keeps working
    // right away; only the visuals play a shrink-then-grow pop, swapping the slot icons over to
    // the new id at the bottom of the shrink so the change happens while the order is smallest.
    reset(id: number) {
        this.id = id;
        this._claimedCount = 0;
        this._deliveredCount = 0;
        this.updateUI();
        this.playResetPop();
    }

    updateUI() {
        this.countlabel.string = this._claimedCount + '/3';
    }

    private applySlotVisuals() {
        // Slots now use the delivered Fish node itself as their visual. Remove the previous
        // delivered fish only while this order is hidden during its reset pop.
        this.clearDeliveredFishes();
        this.targetVisual.getComponentInChildren(sp.Skeleton).setSkin(ServiceLocator.get(FishConfigSA).fishes[this.id]);
    }

    private clearDeliveredFishes() {
        for (const slotNode of this.slotsPos) {
            for (const child of slotNode.children.slice()) {
                if (child.getComponent(Fish)) {
                    child.destroy();
                }
            }
        }
    }

    // A juicier "gone, then materialize" pop: a slow anticipation bump, an unhurried shrink away,
    // a brief hidden pause (icons swap here), then a slow decaying multi-bounce grow-out - like
    // Bubble's own squash/stretch bounce() - with a wobble shake layered on top of just the
    // grow-out, so the shake reads as part of the order bouncing back into place, not the shrink.
    private playResetPop() {
        this._popTween?.stop();
        this._shakeTween?.stop();
        this.node.setScale(1, 1, 1);
        this.node.angle = 0;
        this._isPoppingIn = true;

        const anticipateDuration = this.popDuration * 0.08;
        const shrinkDuration = this.popDuration * 0.20;
        const pauseDuration = this.popDuration * 0.08;
        const bounce1Duration = this.popDuration * 0.22;
        const bounce2Duration = this.popDuration * 0.16;
        const bounce3Duration = this.popDuration * 0.14;
        const settleDuration = this.popDuration * 0.12;

        this._popTween = tween(this.node)
            .to(anticipateDuration, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'quadOut' })
            .to(shrinkDuration, { scale: new Vec3(this.popMinScale, this.popMinScale, 1) }, { easing: 'quadIn' })
            .call(() => this.applySlotVisuals())
            .delay(pauseDuration)
            .to(bounce1Duration, { scale: new Vec3(this.popOvershootScale, this.popOvershootScale, 1) }, { easing: 'quadOut' })
            .to(bounce2Duration, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'sineInOut' })
            .to(bounce3Duration, { scale: new Vec3(1.03, 1.03, 1) }, { easing: 'sineInOut' })
            .to(settleDuration, { scale: Vec3.ONE }, { easing: 'sineOut' })
            .call(() => {
                this._popTween = null;
                this._isPoppingIn = false;
            })
            .start();

        // Shake only kicks in once the order starts growing back out (after the anticipate +
        // shrink + hidden pause), and decays across the whole bounce-in span so it settles flat
        // right as the scale itself finishes settling.
        const growStart = anticipateDuration + shrinkDuration + pauseDuration;
        const shakeTotal = bounce1Duration + bounce2Duration + bounce3Duration + settleDuration;
        this._shakeTween = tween(this.node)
            .delay(growStart)
            .to(shakeTotal * 0.2, { angle: this.popShakeAngle }, { easing: 'quadOut' })
            .to(shakeTotal * 0.25, { angle: -this.popShakeAngle * 0.6 }, { easing: 'sineInOut' })
            .to(shakeTotal * 0.2, { angle: this.popShakeAngle * 0.3 }, { easing: 'sineInOut' })
            .to(shakeTotal * 0.15, { angle: -this.popShakeAngle * 0.12 }, { easing: 'sineInOut' })
            .to(shakeTotal * 0.2, { angle: 0 }, { easing: 'sineOut' })
            .call(() => { this._shakeTween = null; })
            .start();
    }

    // Reserves the next open slot for a fish about to start flying here. Called at dispatch
    // time (not on arrival) so the slot is immediately unavailable to any other fish.
    claimNextSlot(): Node | null {
        if (this.isFullyClaimed) {
            return null;
        }
        const slot = this.slotsPos[this._claimedCount++] ?? null;
        this.updateUI();
        return slot;
    }

    // Marks a previously-claimed slot as delivered once its fish actually lands, and reports
    // whether the order is now fully complete.
    fillSlot(slotNode: Node): boolean {
        this._deliveredCount++;
        if (this.isComplete) {
            // Keep the burst beside the order (same Canvas/camera and draw layer), not as a
            // child of it, since this node scales down to ~0 right after via playResetPop().
            VFXManager.instance?.spawnOrderEffect(this.node.worldPosition, this.node.parent);
        }
        return this.isComplete;
    }
}


