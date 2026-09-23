import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    UIOpacity,
    Vec3,
    Color,
    isValid,
} from 'cc';

const { ccclass, property, requireComponent } = _decorator;

interface Ghost {
    node: Node;
    sprite: Sprite;
    ui: UITransform;
    opacity: UIOpacity;
    timeLeft: number;
}

@ccclass('AfterImage2D')
@requireComponent(UITransform)
export class AfterImage2D extends Component {
    // Property duy nhất hiển thị trong Inspector.
    @property(SpriteFrame)
    public spriteFrame: SpriteFrame | null = null;

    // Chỉnh các thông số hiệu ứng tại đây.
    private readonly SPAWN_INTERVAL = 0.04; // Khoảng cách thời gian giữa các bóng.
    private readonly LIFE_TIME = 1;       // Thời gian bóng mờ hết, tính bằng giây - tăng lên để vệt dài hơn.
    private readonly START_OPACITY = 255;  // Độ đậm ban đầu: 0 đến 255 - tăng lên cho bóng đậm màu hơn.
    private readonly MIN_DISTANCE = 22;    // Di chuyển tối thiểu để tạo bóng tiếp - giảm lại một chút để có nhiều bóng hơn.
    private readonly MAX_GHOSTS = 300;      // Giới hạn số bóng - tăng lên để chứa đủ số lượng bóng nhiều hơn.
    private readonly GHOST_SCALE_MIN = 0.1; // Scale nhỏ nhất của bóng, chọn ngẫu nhiên mỗi lần spawn.
    private readonly GHOST_SCALE_MAX = 0.4; // Scale lớn nhất của bóng, chọn ngẫu nhiên mỗi lần spawn.
    private readonly JITTER_AMOUNT = 12;   // Lệch ngẫu nhiên (x/y) mỗi bóng, để không thẳng hàng tăm tắp.
    private readonly GHOSTS_PER_SPAWN = 4; // Số bóng tạo cùng lúc tại mỗi điểm spawn, thay vì 1 hàng dài.

    private _ui!: UITransform;
    private _sourceSprite: Sprite | null = null;

    private _timer = 0;
    private _emitting = true;
    private _lastPosition = new Vec3();

    private _active: Ghost[] = [];
    private _pool: Ghost[] = [];

    protected onLoad(): void {
        this._ui = this.getComponent(UITransform)!;
        this._sourceSprite = this.getComponent(Sprite);
    }

    protected onEnable(): void {
        this._timer = 0;
        this._lastPosition.set(this.node.position);
    }

    /**
     * Bật/tắt việc tạo bóng mới.
     * Khi tắt, những bóng đã tạo vẫn tiếp tục mờ dần.
     */
    public setEmitting(value: boolean): void {
        if (this._emitting === value) return;

        this._emitting = value;
        this._timer = 0;
        this._lastPosition.set(this.node.position);
    }

    protected lateUpdate(dt: number): void {
        // Cập nhật các bóng đang tồn tại.
        for (let i = this._active.length - 1; i >= 0; i--) {
            const ghost = this._active[i];

            if (!isValid(ghost.node, true)) {
                this._active.splice(i, 1);
                continue;
            }

            ghost.timeLeft -= dt;

            if (ghost.timeLeft <= 0) {
                this.recycleGhost(i);
            } else {
                ghost.opacity.opacity = Math.round(
                    this.START_OPACITY
                    * ghost.timeLeft
                    / this.LIFE_TIME,
                );
            }
        }

        const parent = this.node.parent;
        const frame = this.spriteFrame;

        if (!this._emitting || !frame || !parent) return;

        this._timer += dt;

        if (this._timer < this.SPAWN_INTERVAL) return;

        // Không tạo hàng loạt bóng trùng vị trí khi một frame bị chậm.
        this._timer %= this.SPAWN_INTERVAL;

        const position = this.node.position;
        const distanceSq = Vec3.squaredDistance(
            position,
            this._lastPosition,
        );

        // Đứng yên thì không tạo thêm bóng.
        if (distanceSq < this.MIN_DISTANCE * this.MIN_DISTANCE) {
            return;
        }

        this._lastPosition.set(position);
        // Tạo cả cụm bóng tại cùng một điểm thay vì rải thành 1 hàng dọc đường đi - mỗi bóng
        // đã tự lệch ngẫu nhiên (JITTER_AMOUNT) và tự chọn scale ngẫu nhiên trong spawnGhost().
        for (let i = 0; i < this.GHOSTS_PER_SPAWN; i++) {
            this.spawnGhost(frame, parent);
        }
    }

    private spawnGhost(frame: SpriteFrame, parent: Node): void {
        let ghost = this._pool.pop();

        // Bỏ qua node đã bị hủy từ bên ngoài.
        while (ghost && !isValid(ghost.node, true)) {
            ghost = this._pool.pop();
        }

        if (!ghost) {
            if (this._active.length >= this.MAX_GHOSTS) return;
            ghost = this.createGhost();
        }

        const node = ghost.node;

        node.layer = this.node.layer;

        // Bóng là node cùng cấp, KHÔNG phải con của nhân vật.
        node.setParent(parent);

        // Cùng parent nên có thể sao chép local transform trực tiếp. Lệch ngẫu nhiên một chút
        // theo x/y để các bóng không nằm thẳng tắp trên đúng một đường thẳng.
        const position = this.node.position;
        const jitterX = (Math.random() * 2 - 1) * this.JITTER_AMOUNT;
        const jitterY = (Math.random() * 2 - 1) * this.JITTER_AMOUNT;
        node.setPosition(position.x + jitterX, position.y + jitterY, position.z);
        node.setRotation(this.node.rotation);
        const ghostScale = this.GHOST_SCALE_MIN + Math.random() * (this.GHOST_SCALE_MAX - this.GHOST_SCALE_MIN);
        node.setScale(
            this.node.scale.x * ghostScale,
            this.node.scale.y * ghostScale,
            this.node.scale.z,
        );

        // Dùng đúng SpriteFrame bạn kéo vào Inspector.
        ghost.sprite.spriteFrame = frame;
        ghost.sprite.trim = this._sourceSprite?.trim ?? true;
        ghost.sprite.color = this._sourceSprite?.color ?? Color.WHITE;

        // Giữ kích thước và anchor của node gốc.
        ghost.ui.setContentSize(this._ui.contentSize);
        ghost.ui.setAnchorPoint(this._ui.anchorPoint);

        ghost.timeLeft = this.LIFE_TIME;
        ghost.opacity.opacity = this.START_OPACITY;

        // Bóng vừa được thêm vào cuối danh sách con.
        // Đưa về ngay trước nhân vật để vẽ phía sau nhân vật.
        node.setSiblingIndex(this.node.getSiblingIndex());

        node.active = true;
        this._active.push(ghost);
    }

    private createGhost(): Ghost {
        const node = new Node('AfterImage_Ghost');
        node.active = false;

        const ui = node.addComponent(UITransform);

        const sprite = node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        return {
            node,
            ui,
            sprite,
            opacity: node.addComponent(UIOpacity),
            timeLeft: 0,
        };
    }

    private recycleGhost(index: number): void {
        const ghost = this._active[index];
        this._active.splice(index, 1);

        if (!isValid(ghost.node, true)) return;

        ghost.node.active = false;
        ghost.node.removeFromParent();
        ghost.timeLeft = 0;

        this._pool.push(ghost);
    }

    protected onDisable(): void {
        // Tắt component hoặc node nhân vật: thu hồi toàn bộ bóng.
        for (let i = this._active.length - 1; i >= 0; i--) {
            this.recycleGhost(i);
        }

        this._timer = 0;
    }

    protected onDestroy(): void {
        // Hủy cả những node đã được tách khỏi Hierarchy trong pool.
        for (const ghost of [...this._active, ...this._pool]) {
            if (isValid(ghost.node, true)) {
                ghost.node.destroy();
            }
        }

        this._active.length = 0;
        this._pool.length = 0;
    }
}