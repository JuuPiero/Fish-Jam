import { Node, Size, UITransform, view } from 'cc';
import { FlexView } from '../FlexView';

export abstract class FlexViewUI extends FlexView {
    protected _uiTransform: UITransform = null;

    protected onLoad(): void {
        this._uiTransform = this.getComponent(UITransform);
        super.onLoad();
    }

    getScreenSize(): Size {
        return view.getVisibleSize();
    }

    protected getContainerSize(): Size {
        return this._uiTransform.contentSize;
    }

    protected getItemSize(item: Node): Size {
        return item.getComponent(UITransform)?.contentSize ?? new Size(0, 0);
    }
}
