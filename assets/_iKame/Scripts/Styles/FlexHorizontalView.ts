import { _decorator } from 'cc';
import { FlexViewWorld } from './FlexViewWorld';
const { ccclass } = _decorator;

@ccclass('FlexHorizontalView')
export class FlexHorizontalView extends FlexViewWorld {
    layout(): void {
        const items = this.node.children;
        if (items.length === 0) return;

        const containerSize = this.getContainerSize();
        const itemSizes = items.map(item => this.getItemSize(item));
        const mainOffsets = this.getMainAxisOffsets(itemSizes.map(size => size.width), containerSize.width, this.gap.x);

        items.forEach((item, i) => {
            const x = mainOffsets[i] - containerSize.width / 2 + itemSizes[i].width / 2;
            const crossOffset = this.getCrossAxisOffset(itemSizes[i].height, containerSize.height);
            const y = containerSize.height / 2 - crossOffset - itemSizes[i].height / 2;
            item.setPosition(x, y, item.position.z);
        });
    }
}
