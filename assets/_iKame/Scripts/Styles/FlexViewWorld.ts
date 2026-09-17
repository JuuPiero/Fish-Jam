import { _decorator, Node, Size } from 'cc';
import { FlexView } from './FlexView';
const { property } = _decorator;

/**
 * Base for layouts arranging regular (non-UI) nodes in the 3D world.
 * Unlike UI nodes, world nodes have no UITransform to read a size from,
 * so container/item bounds are configured manually in the Inspector.
 */
export abstract class FlexViewWorld extends FlexView {
    @property(Size) containerSize: Size = new Size(200, 200);
    @property(Size) itemSize: Size = new Size(100, 100);

    protected getContainerSize(): Size {
        return this.containerSize;
    }

    protected getItemSize(item: Node): Size {
        return this.itemSize;
    }
}
