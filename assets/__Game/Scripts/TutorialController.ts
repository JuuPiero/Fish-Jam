import { _decorator, Component, Layers, Node, RigidBody2D, UITransform, tween, Tween, Vec3, Color, Sprite } from 'cc';
import { ServiceLocator } from '../../_iKame/Scripts/ServiceLocator';
import { EventBus } from '../../_iKame/Scripts/EventBus';
import { GameEvents } from './GameEvents';
import { LevelManager } from './LevelManager';
import { Bubble } from './Bubble/Bubble';
import { Fish } from './Fish/Fish';
import { Order } from './Order/Order';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
const { ccclass, property } = _decorator;

@ccclass('TutorialController')
export class TutorialController extends Component {
    @property(Node) hand: Node = null;

    @property({ type: Node, tooltip: 'Area considered "on screen". Defaults to this node\'s parent (the Canvas).' })
    viewport: Node = null;

    @property({ tooltip: 'Scale the hand pulses down to while pointing, then back to 1' })
    tapScale: number = 0.82;

    @property({ tooltip: 'Seconds for each half of the pointing pulse (down, then back up)' })
    tapDuration: number = 0.35;

    @property({ tooltip: 'Bubbles slower than this (units/s) count as having stopped rising' })
    settleVelocityThreshold: number = 5;

    @property({ tooltip: 'Seconds between checks while waiting for bubbles to settle' })
    settlePollInterval: number = 0.15;

    // Bubbles packed under buoyancy can wedge into a stable arch and sit at ~0 velocity for a
    // while before a nudge frees them and they keep rising (see Bubble.ts's own notes on
    // granular jamming) - a short calm streak reads that temporary stall as "done" and points at
    // a fish that's about to move again. Require a much longer stretch of continuous calm so a
    // real jam (which does eventually break free) has time to prove itself not actually settled.
    @property({ tooltip: 'Seconds of CONTINUOUS calm required before bubbles are trusted to be fully settled (not just momentarily jammed)' })
    requiredCalmDuration: number = 1.5;

    private _pointTween: Tween<Node> | null = null;
    private _waitingForSettle = false;
    private _calmDuration = 0;
    // The hint is only ever for the very first fish of a level - once the player taps any fish
    // (presumably having gotten the idea), it's done for the rest of that level.
    private _done = false;

    @property(Node) tutOverlay: Node = null;
    @property(Node) countUI: Node = null;

    @property(Bubble) targetBubble: Bubble = null;
    @property(Order) targetOrder: Order = null;


    @playGroundField({type: Color, group: "TUTORIAL", label: "Màu overlay"}) public overlayColor: Color = new Color('#000000C8')
    protected start(): void {
        this.tutOverlay.getComponent(Sprite).color = this.overlayColor
    }
    protected onLoad(): void {
        ServiceLocator.register(TutorialController, this);
        if (!this.viewport) {
            this.viewport = this.node.parent;
        }
    }

    protected onEnable(): void {
        EventBus.on(GameEvents.NEW_LEVEL, this.onNewLevel);
        EventBus.on(GameEvents.FISH_CLICKED, this.onFishClicked);
        EventBus.on(GameEvents.LEVEL_WIN, this.hideHand);
        EventBus.on(GameEvents.LEVEL_LOSE, this.hideHand);
    }

    protected onDisable(): void {
        EventBus.off(GameEvents.NEW_LEVEL, this.onNewLevel);
        EventBus.off(GameEvents.FISH_CLICKED, this.onFishClicked);
        EventBus.off(GameEvents.LEVEL_WIN, this.hideHand);
        EventBus.off(GameEvents.LEVEL_LOSE, this.hideHand);
        this.stopWaitingForSettle();
        this.hideHand();
    }

    // Bubbles are usually still floating up from the spawn point at the start of a level - wait
    // until they've all come to rest before aiming the hand at whichever fish lands first.
    private onNewLevel = () => {
        this._done = false;
        this.hideHand();
        this.waitForSettleThenPoint();
    }

    private onFishClicked = () => {
        // The player has tapped a fish - the hint has done its job, so it's done for this level.
        this._done = true;
        this.stopWaitingForSettle();
        this.hideHand();
    }

    private waitForSettleThenPoint() {
        this._calmDuration = 0;
        if (this._waitingForSettle) {
            return;
        }
        this._waitingForSettle = true;
        this.schedule(this.tryPoint, this.settlePollInterval);
    }

    private stopWaitingForSettle() {
        if (this._waitingForSettle) {
            this.unschedule(this.tryPoint);
            this._waitingForSettle = false;
        }
        this._calmDuration = 0;
    }

    private tryPoint = () => {
        this._calmDuration = this.allBubblesSettled() ? this._calmDuration + this.settlePollInterval : 0;
        if (this._calmDuration < this.requiredCalmDuration) {
            return;
        }
        this.stopWaitingForSettle();
        this.pointToOrderedFish();
    }

    // Points the hand at the first on-screen bubble fish whose id currently has a claimable
    // order, and starts its pointing pulse. Hides the hand if no such fish exists right now.
    // A no-op once the hint has already been used this level (see onFishClicked).
    pointToOrderedFish() {
        if (this._done) {
            return;
        }

        const target = this.findFishWithOrder();
        if (!target || !this.hand) {
            this.hideHand();
            return;
        }

        this.highlightTarget(target.bubble, target.order);
        if (this.tutOverlay) {
            this.tutOverlay.active = true;
        }

        this.hand.active = true;
        const localPos = new Vec3();
        const parent = this.hand.parent;
        if (parent) {
            parent.inverseTransformPoint(localPos, target.fish.node.worldPosition);
        } else {
            Vec3.copy(localPos, target.fish.node.worldPosition);
        }
        this.hand.setPosition(localPos);
        this.playPointTween();
    }

    // Bit value for the TUTORIAL layer. Read off tutOverlay - already authored on that layer in
    // the scene - rather than resolved by name at runtime: Layers.nameToLayer('TUTORIAL') turned
    // out to be unreliable here (see VFXManager, which avoids the same named-layer API). A
    // hardcoded literal is even riskier - it's how a bubble once ended up tagged VFX (bit 1)
    // instead of TUTORIAL (bit 2) and got rendered through VFXCAMERA, a perspective camera never
    // meant for this, at the wrong scale. Falls back to the name lookup only if tutOverlay is
    // unassigned.
    private get tutorialLayerBit(): number {
        if (this.tutOverlay) {
            return this.tutOverlay.layer;
        }
        console.warn('[TutorialController] tutOverlay is not assigned - falling back to ' +
                     'Layers.nameToLayer("TUTORIAL"), which may resolve to the wrong bit.');
        return Layers.nameToLayer('TUTORIAL');
    }

    // Adds the TUTORIAL bit on top of whatever layer targetBubble/targetOrder's subtree already
    // has, rather than replacing it outright: replacing it would drop them from the main camera's
    // visibility entirely. Keeping their existing layer means the main camera still draws them
    // normally (covered by tutOverlay once that's shown); adding the TUTORIAL bit only makes them
    // *also* visible to CameraTutorial, which - drawn after the main camera, without clearing -
    // paints them again on top of tutOverlay.
    private highlightTarget(bubble: Bubble, order: Order) {
        this.clearHighlight();

        const bit = this.tutorialLayerBit;
        bubble.setHighlight(true, bit);
        this.targetBubble = bubble;

        order.setHighlight(true, bit);
        this.targetOrder = order;

        // countUI (the fish-count HUD) isn't a per-pick target like bubble/order - it's the same
        // node for the whole level - but it needs the same treatment so it too shows through
        // tutOverlay via CameraTutorial instead of getting dimmed with the rest of the board.
        if (this.countUI) {
            this.applyLayerBit(this.countUI, bit, true);
        }
    }

    // Removes the TUTORIAL bit from the previously-highlighted bubble/order/countUI. Guarded with
    // isValid - the bubble can have popped, or the order moved on to a new id and been reset,
    // while it was still wearing the bit.
    private clearHighlight() {
        const bit = this.tutorialLayerBit;
        if (this.targetBubble?.node?.isValid) {
            this.targetBubble.setHighlight(false, bit);
        }
        if (this.targetOrder?.node?.isValid) {
            this.targetOrder.setHighlight(false, bit);
        }
        if (this.countUI) {
            this.applyLayerBit(this.countUI, bit, false);
        }
        this.targetBubble = null;
        this.targetOrder = null;
    }

    // Same contract as Bubble.setHighlight/Order.setHighlight, for a plain Node like countUI that
    // has no component of its own to own this logic.
    private applyLayerBit(node: Node, layerBit: number, enable: boolean) {
        node.layer = enable ? (node.layer | layerBit) : (node.layer & ~layerBit);
        for (const child of node.children) {
            this.applyLayerBit(child, layerBit, enable);
        }
    }

    private playPointTween() {
        this._pointTween?.stop();
        this.hand.setScale(1, 1, 1);
        this._pointTween = tween(this.hand)
            .repeatForever(
                tween()
                    .to(this.tapDuration, { scale: new Vec3(this.tapScale, this.tapScale, 1) }, { easing: 'quadOut' })
                    .to(this.tapDuration, { scale: Vec3.ONE }, { easing: 'quadIn' }),
            )
            .start();
    }

    private hideHand = () => {
        this._pointTween?.stop();
        this._pointTween = null;
        if (this.hand) {
            this.hand.active = false;
            this.hand.setScale(1, 1, 1);
        }
        if (this.tutOverlay) {
            this.tutOverlay.active = false;
        }
        this.clearHighlight();
    }

    // True once every bubble currently in play has slowed below the settle threshold - i.e. the
    // whole rising wave from the spawn point has finished, not just the one we'd point at.
    private allBubblesSettled(): boolean {
        const bubbleManager = ServiceLocator.get(LevelManager)?.bubbleManager;
        if (!bubbleManager) {
            return true;
        }

        const thresholdSqr = this.settleVelocityThreshold * this.settleVelocityThreshold;
        for (const bubbleNode of bubbleManager.node.children) {
            // Bubbles still waiting in BubbleManager's spawn queue are inactive children of the
            // same node - not on the board yet, so they must not factor into "has it settled".
            if (!bubbleNode.active) {
                continue;
            }
            const rigidBody = bubbleNode.getComponent(RigidBody2D);
            if (rigidBody && rigidBody.linearVelocity.lengthSqr() > thresholdSqr) {
                return false;
            }
        }
        return true;
    }

    // Whether `node` currently sits inside the viewport's world-space bounds - excludes fish
    // still stacked below the spawn point, or backed up off-screen waiting their turn.
    private isInView(node: Node): boolean {
        const viewTransform = this.viewport?.getComponent(UITransform);
        if (!viewTransform) {
            return true;
        }

        const rect = viewTransform.getBoundingBoxToWorld();
        const pos = node.worldPosition;
        return pos.x >= rect.x && pos.x <= rect.x + rect.width
            && pos.y >= rect.y && pos.y <= rect.y + rect.height;
    }

    // Highest on-screen fish (largest world Y), among those still waiting in a bubble, whose id
    // currently has an unclaimed order - along with the bubble holding it and that order, so the
    // caller can highlight both. Picking the topmost one - rather than just the first found -
    // gives a consistent, prominent target now that orders themselves keep moving along the
    // belt, so "the first match iterated" would otherwise jump around fairly arbitrarily.
    private findFishWithOrder(): { fish: Fish; bubble: Bubble; order: Order } | null {
        const levelManager = ServiceLocator.get(LevelManager);
        const orderManager = levelManager?.orderManager;
        const bubbleManager = levelManager?.bubbleManager;
        if (!orderManager || !bubbleManager) {
            return null;
        }

        let best: { fish: Fish; bubble: Bubble; order: Order } | null = null;
        let bestY = -Infinity;
        for (const bubbleNode of bubbleManager.node.children) {
            // Same as allBubblesSettled: a bubble still waiting in the spawn queue is an inactive
            // child here, sitting wherever it was last parented rather than its real board
            // position - its fish must never be offered as the hint target.
            if (!bubbleNode.active) {
                continue;
            }
            const bubble = bubbleNode.getComponent(Bubble);
            if (!bubble) {
                continue;
            }
            for (const fish of bubble.fishes) {
                if (!this.isInView(fish.node)) {
                    continue;
                }
                const order = orderManager.findMatchingOrder(fish.id);
                if (!order) {
                    continue;
                }
                const y = fish.node.worldPosition.y;
                if (y > bestY) {
                    bestY = y;
                    best = { fish, bubble, order };
                }
            }
        }
        return best;
    }
}
