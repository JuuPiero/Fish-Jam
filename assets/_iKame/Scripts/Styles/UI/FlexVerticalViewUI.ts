import { _decorator } from 'cc';
import { FlexViewUI } from './FlexViewUI';
const { ccclass } = _decorator;

@ccclass('FlexVerticalViewUI')
export class FlexVerticalViewUI extends FlexViewUI {
    layout(): void {
        const items = this.node.children;
        if (items.length === 0) return;

        const containerSize = this.getContainerSize();
        const itemSizes = items.map(item => this.getItemSize(item));
        const mainOffsets = this.getMainAxisOffsets(itemSizes.map(size => size.height), containerSize.height, this.gap.y);

        items.forEach((item, i) => {
            const y = containerSize.height / 2 - mainOffsets[i] - itemSizes[i].height / 2;
            const crossOffset = this.getCrossAxisOffset(itemSizes[i].width, containerSize.width);
            const x = crossOffset - containerSize.width / 2 + itemSizes[i].width / 2;
            item.setPosition(x, y, item.position.z);
        });
    }
}
