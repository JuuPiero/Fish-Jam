import { _decorator, Component, Graphics, MotionStreak, Node, SpriteFrame, Texture2D, UITransform, Color, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

interface TrailDot {
    x: number;
    y: number;
    spawnTime: number;
    radius: number;
}

/**
 * Leaves a trail of discrete, fading dots behind this node as it moves, drawn with a single
 * Graphics component instead of one spawned Sprite Node per dot - the same "one render
 * component, no per-point child Nodes" approach Cocos' own MotionStreak uses internally.
 */
@ccclass('TrailRenderer2D')
export class TrailRenderer2D extends Component {
    @property(SpriteFrame)
    spriteFrame: SpriteFrame = null;

    @property({ tooltip: 'Minimum distance moved before a new dot is spawned' })
    minDistance: number = 5;

    @property({ tooltip: 'Seconds each dot takes to shrink and fade out once spawned' })
    lifeTime: number = 0.3;

    @property({ tooltip: 'Max dots alive at once - oldest is dropped first when exceeded' })
    maxDots: number = 45;

    @property({ tooltip: 'Smallest random radius a spawned dot starts at' })
    dotRadiusMin: number = 4;

    @property({ tooltip: 'Largest random radius a spawned dot starts at' })
    dotRadiusMax: number = 10;

    @property(Color)
    dotColor: Color = new Color(255, 255, 255, 220);

    // Debug aid: draws a thick MotionStreak ribbon alongside the dots as a known-accurate
    // reference line, for comparing against if the dots ever look off again. Off by default.
    @property({ tooltip: 'Debug aid - draws a thick reference ribbon (known correct) next to the dots' })
    debugRibbon: boolean = false;

    private _debugStreak: MotionStreak | null = null;

    private _graphicsNode: Node | null = null;
    private _graphics: Graphics | null = null;
    private _dots: TrailDot[] = [];
    private _lastSpawnPos: Vec3 = new Vec3();
    private _emitting = false;
    private _elapsed = 0;

    onLoad() {
        if (this.debugRibbon) {
            this._debugStreak = this.getComponent(MotionStreak) ?? this.addComponent(MotionStreak);
            this._debugStreak.fadeTime = 0.5;
            this._debugStreak.stroke = 120;
            this._debugStreak.minSeg = 1;
            this._debugStreak.fastMode = true;
            this._debugStreak.color = new Color(255, 0, 255, 255);
            if (this.spriteFrame?.texture) {
                this._debugStreak.texture = this.spriteFrame.texture as Texture2D;
            }
            this._debugStreak.enabled = false;
        }
    }

    onDisable() {
        this.stopTrail();
    }

    onDestroy() {
        this._graphicsNode?.destroy();
        this._graphicsNode = null;
        this._graphics = null;
    }

    // `parent` MUST be a stable node that does not move/rotate/scale along with whatever this
    // trail is attached to (e.g. a top-level flight layer) - never this node itself.
    startTrail(parent: Node) {
        if (!parent || parent === this.node || parent.isChildOf(this.node)) {
            console.warn(`TrailRenderer2D: refusing bad trailParent "${parent?.name}" on "${this.node.name}".`);
            return;
        }
        this._ensureGraphics(parent);

        this._emitting = true;
        this._lastSpawnPos.set(this.node.worldPosition);
        this._spawnDot(this.node.worldPosition);

        if (this._debugStreak) {
            this._debugStreak.enabled = true;
            this._debugStreak.reset();
        }
    }

    stopTrail() {
        this._emitting = false;
        if (this._debugStreak) this._debugStreak.enabled = false;
    }

    /** Alias for stopTrail() - dots already fade out on their own over lifeTime once stopped. */
    fadeOutAll() {
        this.stopTrail();
    }

    private _ensureGraphics(parent: Node) {
        if (!this._graphicsNode) {
            this._graphicsNode = new Node('TrailGraphics');
            const uiTransform = this._graphicsNode.addComponent(UITransform);
            // A UITransform defaults to a (0,0) contentSize, which Cocos' UI renderer can treat
            // as "nothing to draw here" and cull entirely regardless of what Graphics actually
            // draws - give it a large, generous box so it's never culled. Anchored at (0,0) so
            // the box doesn't shift the Graphics node's own origin (where circle() coordinates
            // are relative to).
            uiTransform.setContentSize(4000, 4000);
            uiTransform.setAnchorPoint(0.5, 0.5);
            this._graphics = this._graphicsNode.addComponent(Graphics);
        }
        if (this._graphicsNode.parent !== parent) {
            this._graphicsNode.setParent(parent);
            this._graphicsNode.setPosition(0, 0, 0);
            this._graphicsNode.setSiblingIndex(-1);
        }
    }

    lateUpdate(dt: number) {
        this._elapsed += dt;

        if (this._emitting) {
            const worldPos = this.node.worldPosition;
            if (Vec3.distance(worldPos, this._lastSpawnPos) >= this.minDistance) {
                this._lastSpawnPos.set(worldPos);
                this._spawnDot(worldPos);
            }
        }

        if (this._dots.length > 0) {
            this._redraw();
        }
    }

    private _spawnDot(worldPos: Readonly<Vec3>) {
        if (!this._graphicsNode) return;

        const local = new Vec3();
        this._graphicsNode.inverseTransformPoint(local, worldPos as Vec3);
        this._dots.push({
            x: local.x,
            y: local.y,
            spawnTime: this._elapsed,
            radius: this.randomRange(this.dotRadiusMin, this.dotRadiusMax),
        });
        if (this._dots.length > this.maxDots) {
            this._dots.shift();
        }
    }

    private _redraw() {
        const g = this._graphics;
        if (!g) return;

        g.clear();
        for (let i = this._dots.length - 1; i >= 0; i--) {
            const dot = this._dots[i];
            const age = this._elapsed - dot.spawnTime;
            if (age >= this.lifeTime) {
                this._dots.splice(i, 1);
                continue;
            }
            const t = age / this.lifeTime;
            const alpha = Math.round((1 - t) * this.dotColor.a);
            const radius = dot.radius * (1 - t * 0.6);
            g.fillColor = new Color(this.dotColor.r, this.dotColor.g, this.dotColor.b, alpha);
            g.circle(dot.x, dot.y, radius);
            g.fill();
        }
    }

    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
}
