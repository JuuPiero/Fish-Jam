import { _decorator, Component, Enum, Node, NodeEventType, Size, Vec2 } from 'cc';
import { AlignItems, JustifyContent } from './LayoutAtribute';
const { property } = _decorator;

// @ccclass('FlexView')
export abstract class FlexView extends Component {
    @property({ type: Enum(JustifyContent) }) justifyContent: JustifyContent = JustifyContent.Center;
    @property({ type: Enum(AlignItems) }) alignItems: AlignItems = AlignItems.Start;
    @property(Vec2) gap: Vec2 = new Vec2();

    protected onLoad(): void {
        this.layout();
    }

    protected onEnable(): void {
        this.node.on(NodeEventType.CHILD_ADDED, this.onChildrenChanged, this);
        this.node.on(NodeEventType.CHILD_REMOVED, this.onChildrenChanged, this);
    }

    protected onDisable(): void {
        this.node.off(NodeEventType.CHILD_ADDED, this.onChildrenChanged, this);
        this.node.off(NodeEventType.CHILD_REMOVED, this.onChildrenChanged, this);
    }

    protected onChildrenChanged(): void {
        this.layout();
    }

    abstract layout(): void;

    protected abstract getContainerSize(): Size;

    protected abstract getItemSize(item: Node): Size;

    /**
     * Start-edge offset (0..containerSize) for each item along the main axis, honoring justifyContent.
     */
    protected getMainAxisOffsets(itemSizes: number[], containerSize: number, gap: number): number[] {
        const count = itemSizes.length;
        if (count === 0) return [];

        const totalItemSize = itemSizes.reduce((sum, size) => sum + size, 0);
        const totalGap = gap * (count - 1);

        let cursor = 0;
        let stepGap = gap;

        switch (this.justifyContent) {
            case JustifyContent.Center:
                cursor = (containerSize - totalItemSize - totalGap) / 2;
                break;
            case JustifyContent.End:
                cursor = containerSize - totalItemSize - totalGap;
                break;
            case JustifyContent.SpaceBetween:
                stepGap = count > 1 ? (containerSize - totalItemSize) / (count - 1) : 0;
                break;
            case JustifyContent.SpaceAround: {
                const space = (containerSize - totalItemSize) / count;
                cursor = space / 2;
                stepGap = space;
                break;
            }
            case JustifyContent.SpaceEvenly: {
                const space = (containerSize - totalItemSize) / (count + 1);
                cursor = space;
                stepGap = space;
                break;
            }
            case JustifyContent.Start:
            default:
                break;
        }

        const offsets: number[] = [];
        for (let i = 0; i < count; i++) {
            offsets.push(cursor);
            cursor += itemSizes[i] + stepGap;
        }

        return offsets;
    }

    /**
     * Start-edge offset (0..containerSize - itemSize) for one item on the cross axis, honoring alignItems.
     */
    protected getCrossAxisOffset(itemSize: number, containerSize: number): number {
        switch (this.alignItems) {
            case AlignItems.Center:
                return (containerSize - itemSize) / 2;
            case AlignItems.End:
                return containerSize - itemSize;
            case AlignItems.Start:
            default:
                return 0;
        }
    }
}
