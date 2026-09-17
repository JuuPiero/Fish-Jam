import { _decorator, Enum, Size } from 'cc';
import { FlexViewUI } from './FlexViewUI';
import { GridConstraint } from '../LayoutAtribute';
import { ScreenOrientation } from './ScreenOrientation';
const { ccclass, property } = _decorator;

@ccclass('FlexGridViewUI')
export class FlexGridViewUI extends FlexViewUI {
    @property({ type: Enum(GridConstraint) }) constraint: GridConstraint = GridConstraint.FixedColumnCount;
    @property columnCount: number = 3;
    @property rowCount: number = 3;

    // Column count override per screen orientation: [Portrait, Landscape, Square]. 0 = fall back to columnCount/rowCount.
    @property([Number]) columnCountByOrientation: number[] = [2, 4, 3];

    layout(): void {
        const items = this.node.children;
        if (items.length === 0) return;

        const cellSize = items.reduce((max, item) => {
            const size = this.getItemSize(item);
            return new Size(Math.max(max.width, size.width), Math.max(max.height, size.height));
        }, new Size(0, 0));

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
        const override = this.columnCountByOrientation[this.getScreenOrientation()];
        if (override > 0) return override;

        if (this.constraint === GridConstraint.FixedRowCount) {
            return Math.max(1, Math.ceil(itemCount / Math.max(1, this.rowCount)));
        }

        return Math.max(1, this.columnCount);
    }

    private getScreenOrientation(): ScreenOrientation {
        const { width, height } = this.getScreenSize();
        if (Math.abs(width - height) < Math.min(width, height) * 0.1) return ScreenOrientation.Square;
        return width > height ? ScreenOrientation.Landscape : ScreenOrientation.Portrait;
    }
}
