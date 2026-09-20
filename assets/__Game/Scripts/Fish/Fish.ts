import { _decorator, Button, Component, EventMouse, math, Node, Sprite, tween, Tween, UITransform, Vec3 } from 'cc';
import { Order } from '../Order/Order';
import { ServiceLocator } from 'db://assets/_iKame/Scripts/ServiceLocator';
import { FishConfigSA } from '../Data/FishConfigSA';
import { EventBus } from 'db://assets/_iKame/Scripts/EventBus';
import { GameEvents } from '../GameEvents';
const { ccclass, property } = _decorator;

@ccclass('Fish')
export class Fish extends Component {

    _button: Button = null;

    @property({ readonly: true }) id: number = -1;

    @property(Node) visual: Node = null;

    onclick: () => void = null;

    private static readonly FLY_DURATION = 0.42;
    private static readonly MIN_ARC_HEIGHT = 140;
    private static readonly ARC_HEIGHT_RATIO = 0.35;
    private static readonly PEAK_SCALE_BOOST = 1.25;

    // How many straight segments approximate the curved arc - this Cocos version's Tween has
    // no bezierTo, so the curve is sampled into a short polyline instead.
    private static readonly ARC_SEGMENTS = 10;

    private static readonly HOVER_SCALE = new Vec3(1.1, 1.1, 1.1);
    private static readonly HOVER_DURATION = 0.12;

    private _flyTween: Tween<Node> | null = null;
    private _hoverTween: Tween<Node> | null = null;

    protected onLoad(): void {
        this._button = this.getComponent(Button)
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
        const spriteFrame = ServiceLocator.get(FishConfigSA).fishs[id];
        this.visual.getComponent(Sprite).spriteFrame = spriteFrame;
        // Match the visual to this sprite's real (trimmed) size instead of whatever size the
        // prefab happened to be baked with - fish types vary a lot in size, and that size is
        // what Bubble.calculateRadius() reads via getSize(), so bubbles size themselves
        // differently depending on which fish they actually contain.
        this.visual.getComponent(UITransform).setContentSize(spriteFrame.rect.width, spriteFrame.rect.height);
    }

    onFishClick() {
        // Clear any hover animation and snap back to normal size first, so the fly tween (which
        // reads the current scale as its starting point) always starts from a clean baseline
        // instead of whatever size the hover happened to leave it at.
        this._hoverTween?.stop();
        this._hoverTween = null;
        this.node.setScale(1, 1, 1);

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

    // Flies to a waiting bench slot and stays there (still visible, waiting for a matching order).
    flyToSlot(slot: Node, flyLayer: Node, onArrive?: () => void) {
        this._flyTo(slot, flyLayer, onArrive);
    }

    // Claims the next empty placeholder on `order` right away (so a second matching fish can't
    // also get sent here mid-flight) and flies to it. On arrival, lights up that placeholder
    // and the fish itself is destroyed - the order's own icon now shows it was delivered.
    flyToOrder(order: Order, flyLayer: Node, onArrive?: () => void) {
        const slotPos = order.claimNextSlot();
        if (!slotPos) {
            return;
        }
        this._flyTo(slotPos, flyLayer, () => {
            order.fillSlot(slotPos);
            this.node.destroy();
            onArrive?.();
        });
    }

    // Pulls the fish out onto `flyLayer` (normally the canvas root, so it renders above
    // everything instead of being clipped/scaled by whatever local UI it started under) and
    // hops it over on a smooth curved arc to land exactly matching `target`'s world position
    // and scale - puffing up a bit at the apex, then shrinking back down to size as it settles.
    private _flyTo(target: Node, flyLayer: Node, onArrive?: () => void) {
        this._flyTween?.stop();
        // In case something still calls this without going through onFishClick's own reset
        // (e.g. re-routing a fish straight from the waiting bench), make sure a leftover hover
        // animation can't fight the flight tween over the same `scale` property. Note: don't
        // force the scale itself back to identity here - a re-routed bench fish's current scale
        // (matching whatever slot it's resting in) is the correct flight starting point.
        this._hoverTween?.stop();
        this._hoverTween = null;

        const endWorldPos = target.worldPosition.clone();
        const endWorldScale = target.worldScale.clone();

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
        const delta = new Vec3();
        Vec3.subtract(delta, endLocalPos, startPos);
        // Taller hops for longer trips, but never a flat, barely-there arc for short ones.
        const arcHeight = Math.max(Fish.MIN_ARC_HEIGHT, Math.abs(delta.x) * Fish.ARC_HEIGHT_RATIO);
        const peakY = Math.max(startPos.y, endLocalPos.y) + arcHeight;
        // Two control points spread along the way, both raised to peakY, describe one smooth
        // cubic-bezier hump instead of a straight-line "V" with a sharp corner at the top.
        const control1 = new Vec3(startPos.x + delta.x * 0.33, peakY, 0);
        const control2 = new Vec3(startPos.x + delta.x * 0.66, peakY, 0);
        const peakScale = new Vec3(endLocalScale.x * Fish.PEAK_SCALE_BOOST, endLocalScale.y * Fish.PEAK_SCALE_BOOST, 1);

        // This Cocos version's Tween has no bezierTo, so sample the same cubic-bezier curve
        // into a short chain of straight `.to()` steps - close enough together (at 60fps, a
        // new waypoint every couple of frames) to read as one smooth curve, not a polyline.
        let chain = tween(this.node);
        for (let i = 1; i <= Fish.ARC_SEGMENTS; i++) {
            const t = i / Fish.ARC_SEGMENTS;
            const u = 1 - t;
            const bx = u * u * u * startPos.x + 3 * u * u * t * control1.x + 3 * u * t * t * control2.x + t * t * t * endLocalPos.x;
            const by = u * u * u * startPos.y + 3 * u * u * t * control1.y + 3 * u * t * t * control2.y + t * t * t * endLocalPos.y;

            // Scale ramps up to its peak by the arc's apex (t=0.5), then eases back down to
            // the target's exact size by the time it lands.
            const scale = t <= 0.5
                ? Vec3.lerp(new Vec3(), startScale, peakScale, t / 0.5)
                : Vec3.lerp(new Vec3(), peakScale, endLocalScale, (t - 0.5) / 0.5);

            chain = chain.to(Fish.FLY_DURATION / Fish.ARC_SEGMENTS, { position: new Vec3(bx, by, 0), scale }, { easing: 'linear' });
        }

        this._flyTween = chain
            .call(() => {
                this._flyTween = null;
                onArrive?.();
            })
            .start();
    }

    getSize() {
        const size = this.visual.getComponent(UITransform).contentSize;
        const scale = this.visual.scale;
        return new math.Size(size.width * Math.abs(scale.x), size.height * Math.abs(scale.y));
    }
}


