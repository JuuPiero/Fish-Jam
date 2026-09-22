import { _decorator, Component, Node, NodePool, Sprite, SpriteFrame, UITransform, Color, Vec3, tween, Tween } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Leaves a fading/shrinking trail of sprite copies behind this node as it moves.
 * Attach to the moving node; spawned segments are parented to `trailParent`
 * (not to this node) so they stay put in world space while the emitter moves on.
 */
@ccclass('TrailRenderer2D')
export class TrailRenderer2D extends Component {
    @property(SpriteFrame)
    spriteFrame: SpriteFrame = null;

    @property({ type: Node, tooltip: 'Parent that holds spawned segments. Defaults to this node\'s parent.' })
    trailParent: Node = null;

    @property({ tooltip: 'Minimum distance the node must travel before a new segment is spawned.' })
    minDistance: number = 10;

    @property({ tooltip: 'How long (seconds) each segment stays visible before disappearing.' })
    lifeTime: number = 0.4;

    @property({ tooltip: 'Max segments alive at once; oldest is recycled first when exceeded.' })
    maxSegments: number = 20;

    @property(Color)
    startColor: Color = new Color(255, 255, 255, 255);

    @property(Color)
    endColor: Color = new Color(255, 255, 255, 0);

    @property
    startScale: number = 1;

    @property
    endScale: number = 0.3;

    @property({ tooltip: 'Segment size in pixels (square). 0 keeps the sprite frame\'s original size.' })
    segmentSize: number = 0;

    // Off by default: a caller that wants explicit start/stop control (e.g. Fish only playing
    // the trail while mid-flight) would otherwise race against this component's own onEnable,
    // which runs after the caller's onLoad and would re-enable emission regardless.
    @property
    autoStart: boolean = false;

    private _pool: NodePool = new NodePool();
    private _active: Node[] = [];
    private _lastPos: Vec3 = new Vec3();
    private _emitting: boolean = false;

    onLoad() {
        if (!this.trailParent) this.trailParent = this.node.parent;
    }

    onEnable() {
        if (this.autoStart) this.startTrail();
    }

    onDisable() {
        this.stopTrail();
    }

    onDestroy() {
        this.clear();
        this._pool.clear();
    }

    startTrail() {
        if (this._emitting) return;
        this._emitting = true;
        this._lastPos.set(this.node.worldPosition);
    }

    stopTrail() {
        this._emitting = false;
    }

    /** Removes all currently visible segments immediately. */
    clear() {
        for (const seg of this._active) {
            Tween.stopAllByTarget(seg);
            Tween.stopAllByTarget(seg.getComponent(Sprite));
            this._recycle(seg);
        }
        this._active.length = 0;
    }

    update() {
        if (!this._emitting || !this.spriteFrame) return;

        const worldPos = this.node.worldPosition;
        if (Vec3.distance(worldPos, this._lastPos) >= this.minDistance) {
            this._lastPos.set(worldPos);
            this._spawnSegment(worldPos);
        }
    }

    private _spawnSegment(worldPos: Readonly<Vec3>) {
        if (!this.trailParent) return;

        const seg = this._getSegmentNode();
        const sprite = seg.getComponent(Sprite);
        const uiTransform = seg.getComponent(UITransform);

        if (this.segmentSize > 0) {
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            uiTransform.setContentSize(this.segmentSize, this.segmentSize);
        } else {
            sprite.sizeMode = Sprite.SizeMode.TRIMMED;
        }
        sprite.spriteFrame = this.spriteFrame;
        sprite.color = this.startColor.clone();

        seg.setParent(this.trailParent);
        seg.setWorldPosition(worldPos as Vec3);
        seg.angle = this.node.angle;
        seg.setScale(this.startScale, this.startScale, 1);
        seg.active = true;

        this._active.push(seg);
        if (this._active.length > this.maxSegments) {
            const oldest = this._active.shift();
            Tween.stopAllByTarget(oldest);
            Tween.stopAllByTarget(oldest.getComponent(Sprite));
            this._recycle(oldest);
        }

        tween(seg)
            .to(this.lifeTime, { scale: new Vec3(this.endScale, this.endScale, 1) })
            .start();

        tween(sprite)
            .to(this.lifeTime, { color: this.endColor })
            .call(() => {
                const idx = this._active.indexOf(seg);
                if (idx >= 0) this._active.splice(idx, 1);
                this._recycle(seg);
            })
            .start();
    }

    private _getSegmentNode(): Node {
        if (this._pool.size() > 0) return this._pool.get();

        const node = new Node('TrailSegment');
        node.addComponent(UITransform);
        node.addComponent(Sprite);
        return node;
    }

    private _recycle(node: Node) {
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(node.getComponent(Sprite));
        node.removeFromParent();
        this._pool.put(node);
    }
}
