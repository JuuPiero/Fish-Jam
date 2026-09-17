import { _decorator, Enum } from 'cc';
import { FlexViewWorld } from './FlexViewWorld';
import { GridConstraint } from './LayoutAtribute';
const { ccclass, property } = _decorator;

@ccclass('GridView')
export class GridView extends FlexViewWorld {
    @property({ type: Enum(GridConstraint) }) constraint: GridConstraint = GridConstraint.FixedColumnCount;
    @property columnCount: number = 3;
    @property rowCount: number = 3;

    layout(): void {
        const items = this.node.children;
        if (items.length === 0) return;

        const cellSize = this.itemSize;
        const columnCount = this.resolveColumnCount(items.length);
        const rowCount = Math.ceil(items.length / columnCount);

        const stepX = cellSize.width + this.gap.x;
        const stepY = cellSize.height + this.gap.y;
        const gridWidth = columnCount * stepX - this.gap.x;
        const gridHeight = rowCount * stepY - this.gap.y;

        const originX = -gridWidth / 2 + cellSize.width / 2;
        const originY = gridHeight / 2 - cellSize.height / 2;

        items.forEach((item, i) => {
            const col = i % columnCount;
            const row = Math.floor(i / columnCount);
            item.setPosition(originX + col * stepX, originY - row * stepY, item.position.z);
        });
    }

    private resolveColumnCount(itemCount: number): number {
        if (this.constraint === GridConstraint.FixedRowCount) {
            return Math.max(1, Math.ceil(itemCount / Math.max(1, this.rowCount)));
        }

        return Math.max(1, this.columnCount);
    }
}
