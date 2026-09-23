import { _decorator, Component, Node, RigidBody2D, UITransform, tween, Tween, Vec3 } from 'cc';
import { ServiceLocator } from '../../_iKame/Scripts/ServiceLocator';
import { EventBus } from '../../_iKame/Scripts/EventBus';
import { GameEvents } from './GameEvents';
import { LevelManager } from './LevelManager';
import { Bubble } from './Bubble/Bubble';
import { Fish } from './Fish/Fish';
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

    // How many consecutive calm polls in a row before we trust the bubbles are actually done
    // rising, not just momentarily calm between jostles.
    private static readonly SETTLE_STREAK_REQUIRED = 3;

    private _pointTween: Tween<Node> | null = null;
    private _waitingForSettle = false;
    private _settledStreak = 0;
    // The hint is only ever for the very first fish of a level - once the player taps any fish
    // (presumably having gotten the idea), it's done for the rest of that level.
    private _done = false;

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
        this._settledStreak = 0;
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
        this._settledStreak = 0;
    }

    private tryPoint = () => {
        this._settledStreak = this.allBubblesSettled() ? this._settledStreak + 1 : 0;
        if (this._settledStreak < TutorialController.SETTLE_STREAK_REQUIRED) {
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

        this.hand.active = true;
        const localPos = new Vec3();
        const parent = this.hand.parent;
        if (parent) {
            parent.inverseTransformPoint(localPos, target.node.worldPosition);
        } else {
            Vec3.copy(localPos, target.node.worldPosition);
        }
        this.hand.setPosition(localPos);
        this.playPointTween();
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

    // First on-screen fish, among those still waiting in a bubble, whose id currently has an
    // unclaimed order.
    private findFishWithOrder(): Fish | null {
        const levelManager = ServiceLocator.get(LevelManager);
        const orderManager = levelManager?.orderManager;
        const bubbleManager = levelManager?.bubbleManager;
        if (!orderManager || !bubbleManager) {
            return null;
        }

        for (const bubbleNode of bubbleManager.node.children) {
            const bubble = bubbleNode.getComponent(Bubble);
            if (!bubble) {
                continue;
            }
            for (const fish of bubble.fishes) {
                if (orderManager.findMatchingOrder(fish.id) && this.isInView(fish.node)) {
                    return fish;
                }
            }
        }
        return null;
    }
}
