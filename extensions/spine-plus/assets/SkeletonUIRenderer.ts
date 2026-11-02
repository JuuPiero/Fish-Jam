import { _decorator, renderer, Material, UIMeshRenderer } from 'cc';
import { JSB } from 'cc/env';

const { ccclass, executeInEditMode, menu } = _decorator;

interface UIBatchSource {
    _uiBatches(out?: { model: renderer.scene.Model; material: Material }[]): { model: renderer.scene.Model; material: Material }[];
    _detachFromScene(): void;
}

/**
 * Draws a SkeletonAnimation inside a Canvas, in hierarchy order with the
 * sprites (masks and UI opacity included). Added automatically when the
 * skeleton is created under a Canvas.
 *
 * Unlike the plain UIMeshRenderer, every draw batch keeps its own material
 * (atlas page + blend mode).
 */
@ccclass('SkeletonUIRenderer')
@executeInEditMode
@menu('Spine/SkeletonUIRenderer')
export class SkeletonUIRenderer extends UIMeshRenderer {
    private _list: { model: renderer.scene.Model; material: Material }[] = [];

    private source(): UIBatchSource | null {
        let comp = this.modelComponent as unknown as UIBatchSource | null;
        if (!comp || typeof comp._uiBatches !== 'function') {
            // Added before the skeleton: find it now.
            const found = this.getComponent('SkeletonAnimation') as unknown as UIBatchSource | null;
            if (found) (this as any)._modelComponent = found;
            comp = found;
        }
        return comp && typeof comp._uiBatches === 'function' ? comp : null;
    }

    public _render(render: any): boolean {
        const comp = this.source();
        if (!comp) return super._render(render);
        comp._detachFromScene();
        for (const b of comp._uiBatches(this._list)) render.commitModel(this, b.model, b.material);
        return true;
    }

    public update(): void {
        // The base class re-tunes the shared material every frame; the skeleton manages its own.
        if (JSB) this.markForUpdateRenderData();
    }
}
