import { _decorator, Component, instantiate, Node, ParticleSystem2D, Prefab, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VFXManager')
export class VFXManager extends Component {

    @property(Prefab) bubbleEffect: Prefab = null;

    @property(Prefab) orderEffect: Prefab = null;


    @property({ tooltip: 'Seconds a spawned bubble-pop effect stays alive' })
    bubbleEffectLifetime: number = 1.5;

    @property({ tooltip: 'Seconds a spawned order-complete effect stays alive' })
    orderEffectLifetime: number = 1.5;


    static instance: VFXManager;
    onLoad() {
        VFXManager.instance = this;

    }

    // `parent` should be in the same Canvas/game layer as the object that spawned the VFX.
    // VFXManager itself lives directly under Scene, so putting a UI particle under it can make
    // it miss the game camera even though its world position is correct.
    spawnBubbleEffect(worldPosition: Readonly<Vec3>, parent?: Node) {
        this.spawnEffect(this.bubbleEffect, worldPosition, this.bubbleEffectLifetime, parent);
    }

    // Same idea as spawnBubbleEffect, played when an order finishes being delivered.
    spawnOrderEffect(worldPosition: Readonly<Vec3>, parent?: Node) {
        this.spawnEffect(this.orderEffect, worldPosition, this.orderEffectLifetime, parent);
    }

    private spawnEffect(prefab: Prefab | null, worldPosition: Readonly<Vec3>, lifetime: number, parent?: Node) {
        if (!prefab) {
            return;
        }

        const effect = instantiate(prefab);
        effect.setParent(parent?.isValid ? parent : this.node);
        effect.setWorldPosition(worldPosition);
        this.setLayerRecursively(effect, effect.parent.layer);

        // A prefabricated particle can already have completed its short emission when cloned.
        // Explicitly reset every emitter so it reliably bursts at the moment it's spawned.
        for (const particle of effect.getComponentsInChildren(ParticleSystem2D)) {
            particle.resetSystem();
        }
        this.scheduleOnce(() => {
            if (effect.isValid) {
                effect.destroy();
            }
        }, lifetime);
    }

    private setLayerRecursively(node: Node, layer: number) {
        node.layer = layer;
        for (const child of node.children) {
            this.setLayerRecursively(child, layer);
        }
    }

}


