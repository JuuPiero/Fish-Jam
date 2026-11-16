import { _decorator, Component, Label, Node, sp, tween, Tween, Vec3 } from 'cc';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
import { Fish } from '../Fish/Fish';
import { VFXManager } from '../VFXManager';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
const { ccclass, property } = _decorator;

@ccclass('Order')
export class Order extends Component {
    @property({readonly: true}) id: number = -1;
    @property({readonly: true}) requiredCount: number = 3;
    @property(Node) slotsPos: Node[] = []
    @property(Node) lidPos: Node = null;
    @property(Node) targetVisual: Node = null;

    @property(Label) countlabel: Label = null;

    @property({ tooltip: 'Distance above its slot where a replacement bowl starts falling. Unity drops it 5 units, ~480 px here.' })
    spawnDropDistance: number = 480;

    @property({ tooltip: "Local Y of the point the bowl squashes and tilts around. Unity pivots its Visual at the bowl's bottom (0.982 units under the bowl's middle, ~94 px)." })
    bodyPivotY: number = -94;

    // Claimed = already promised to a fish that's mid-flight here; delivered = that fish has
    // actually landed. Split in two so a second fish of the same type can't ALSO get sent to
    // this order while the first is still ~0.4s from landing on the last open slot.
    private _claimedCount = 0;
    private _deliveredCount = 0;
    private _popTweens: Tween<Node>[] = [];
    // Every child but the target fish, under one node pivoted at the bowl's bottom: Unity's Visual. The pop
    // animates it, never this.node, whose position OrderManager's relayout slides.
    private _body: Node | null = null;
    // True from reset() until playResetPop() fully settles. A fish lands by reparenting into
    // one of slotsPos, itself a descendant of this node - routing one here while still popping
    // would land it mid scale/rotation tween. Folded into isFullyClaimed (rather than a separate
    // check) so it blocks every route-to-this-order path - GameManager's auto-pull of bench fish
    // AND a fresh player click matching this order's new id - with a single guard.
    private _isPoppingIn = false;


    onLoad() {
        this.ensureBody();
    }

    private ensureBody(): Node {
        if (this._body) {
            return this._body;
        }
        const body = new Node('Body');
        body.layer = this.node.layer;
        const moved = this.node.children.filter(child => child !== this.targetVisual);
        this.node.insertChild(body, 0);
        body.setPosition(0, this.bodyPivotY, 0);
        for (const child of moved) {
            const pos = child.position;
            child.setParent(body, false);
            child.setPosition(pos.x, pos.y - this.bodyPivotY, pos.z);
        }
        this._body = body;
        return body;
    }

    get isComplete(): boolean {
        return this._deliveredCount >= this.requiredCount;
    }

    // True once every slot already has a fish either landed or currently flying toward it, OR
    // the order is still mid pop-in - either way, this (not isComplete) is what should stop new
    // fish from being routed here.
    get isFullyClaimed(): boolean {
        return this._isPoppingIn || this._claimedCount >= this.requiredCount;
    }

    get remainingCount(): number {
        return Math.max(0, this.requiredCount - this._claimedCount);
    }

    initialize(id: number, requiredCount: number = this.slotsPos.length) {
        this.id = id;
        this.setRequiredCount(requiredCount);
        this._claimedCount = 0;
        this._deliveredCount = 0;
        this.updateUI();
        this.applySlotVisuals();
    }

    // Called once this order has been fully delivered and reassigned to the next fish id.
    // State updates immediately so routing logic (isFullyClaimed/claimNextSlot) keeps working
    // right away; the visuals then copy Unity's OrderController: the full bowl pops out (PlayComplete),
    // then the new one drops in (PlayAppear).
    // fromHidden: the order was parked out of sight (a pending duplicate), so it has no full bowl to pop out first.
    reset(id: number, requiredCount: number = this.slotsPos.length, fromHidden: boolean = false) {
        this.id = id;
        this.setRequiredCount(requiredCount);
        this._claimedCount = 0;
        this._deliveredCount = 0;
        this.updateUI();
        this.playResetPop(fromHidden);
    }

    updateUI() {
        this.countlabel.string = this._claimedCount + '/' + this.requiredCount;
    }

    private setRequiredCount(requiredCount: number): void {
        this.requiredCount = Math.max(1, Math.min(requiredCount, this.slotsPos.length));
        this.slotsPos.forEach((slotNode, index) => {
            slotNode.active = index < this.requiredCount;
        });
    }

    private applySlotVisuals() {
        // Slots now use the delivered Fish node itself as their visual. Remove the previous
        // delivered fish only while the bowl is hidden between its pop-out and drop-in.
        this.clearDeliveredFishes();
        this.targetVisual.getComponentInChildren(sp.Skeleton).setSkin(ServiceLocator.get(FishConfigSA).getAnimationName(this.id));
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

    // A port of the PrimeTweenAnimationComponent on Unity's Order.prefab. Hide (0.2 s): bowl and target fish
    // scale to 0, InBack. Show (0.6 s): the bowl falls 5 units (InQuad, 0.26 s) while growing from 0 into a
    // stretch, squashes on landing and springs back (OutElastic), with a tilt that settles over the impact; the
    // target fish pops in on its own (OutBack) from 0.3 s.
    private playResetPop(fromHidden: boolean) {
        this.stopPopTweens();
        const body = this.ensureBody();
        const target = this.targetVisual;
        this._isPoppingIn = true;

        if (fromHidden) {
            this.applySlotVisuals();
            this.playAppear(body, target);
            return;
        }

        body.setPosition(0, this.bodyPivotY, 0);
        body.angle = 0;
        this._popTweens.push(
            tween(body)
                .to(0.2, { scale: Vec3.ZERO }, { easing: 'backIn' })
                .call(() => {
                    this.applySlotVisuals();
                    this.playAppear(body, target);
                })
                .start(),
            tween(target).to(0.2, { scale: Vec3.ZERO }, { easing: 'backIn' }).start(),
        );
    }

    private playAppear(body: Node, target: Node) {
        this.stopPopTweens();
        const pivotY = this.bodyPivotY;
        body.setScale(0, 0, 1);
        body.angle = 0;
        body.setPosition(0, pivotY + this.spawnDropDistance, 0);
        target.setScale(0, 0, 1);

        this._popTweens.push(
            tween(body).to(0.26, { position: new Vec3(0, pivotY, 0) }, { easing: 'quadIn' }).start(),
            tween(body)
                .to(0.26, { scale: new Vec3(0.85, 1.18, 1) }, { easing: 'quadIn' })
                .to(0.06, { scale: new Vec3(1.2, 0.78, 1) }, { easing: 'quadOut' })
                .to(0.24, { scale: Vec3.ONE }, { easing: 'elasticOut' })
                .start(),
            tween(body)
                .delay(0.26)
                .to(0.06, { angle: 6 }, { easing: 'quadOut' })
                .to(0.1, { angle: -5 }, { easing: 'quadInOut' })
                .to(0.1, { angle: 2 }, { easing: 'quadInOut' })
                .to(0.08, { angle: 0 }, { easing: 'quadOut' })
                .call(() => this.onAppeared())
                .start(),
            tween(target)
                .delay(0.3)
                .to(0.25, { scale: Vec3.ONE }, { easing: 'backOut' })
                .start(),
        );
    }

    private onAppeared() {
        this._popTweens = [];
        this._isPoppingIn = false;
        // Only now is it actually safe to route a fish here (see isFullyClaimed) -
        // GameManager listens for this to pull any bench-waiting fish matching this id,
        // regardless of whether OrderManager reset this order directly or reactivated it
        // from being hidden as a pending duplicate.
        EventBus.emit(GameEvents.ORDER_READY, this);
    }

    private stopPopTweens() {
        for (const t of this._popTweens) {
            t.stop();
        }
        this._popTweens = [];
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
            // child of it, since this node pops out to 0 right after via playResetPop().
            VFXManager.instance?.spawnOrderEffect(this.node.worldPosition, this.node.parent);
        }
        return this.isComplete;
    }

    // Same contract as Bubble.setHighlight: adds/removes the TUTORIAL bit across this order's
    // whole subtree (targetVisual, slots, any delivered fish parked in them, the count label) so
    // the spotlight camera sees the whole bowl, not just one piece of it.
    setHighlight(enable: boolean, layerBit: number) {
        this.applyLayerBit(this.node, layerBit, enable);
    }

    private applyLayerBit(node: Node, layerBit: number, enable: boolean) {
        node.layer = enable ? (node.layer | layerBit) : (node.layer & ~layerBit);
        for (const child of node.children) {
            this.applyLayerBit(child, layerBit, enable);
        }
    }
}


