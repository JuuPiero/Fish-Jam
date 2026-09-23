import {
    _decorator,
    Component,
    RigidBody2D,
    BoxCollider2D,
    Collider2D,
    Contact2DType,
    IPhysics2DContact,
    ERigidBody2DType,
    input,
    Input,
    EventKeyboard,
    KeyCode,
    game,
    Game,
    isValid,
} from 'cc';

const { ccclass, property, requireComponent } = _decorator;

@ccclass('PlatformerController2D')
@requireComponent([RigidBody2D, BoxCollider2D])
export class PlatformerController2D extends Component {
    @property({ min: 0, tooltip: 'Tốc độ di chuyển ngang.' })
    public moveSpeed = 8;

    @property({ min: 0, tooltip: 'Vận tốc ban đầu khi nhảy.' })
    public jumpSpeed = 14;

    @property({ min: 0, tooltip: 'Hệ số trọng lực của nhân vật.' })
    public gravityScale = 3;

    private _body!: RigidBody2D;
    private _collider!: BoxCollider2D;

    private _keys = new Set<KeyCode>();
    private _groundColliders = new Set<Collider2D>();

    private _jumpRequested = false;
    private _moveInput = 0;

    protected onLoad(): void {
        this._body = this.getComponent(RigidBody2D)!;
        this._collider = this.getComponent(BoxCollider2D)!;

        this._body.type = ERigidBody2DType.Dynamic;
        this._body.fixedRotation = true;
        this._body.gravityScale = this.gravityScale;
        this._body.linearDamping = 0;
        this._body.enabledContactListener = true;

        // Không dùng sensor; giảm hiện tượng dính tường do ma sát.
        this._collider.sensor = false;
        this._collider.friction = 0;
        this._collider.restitution = 0;
        this._collider.apply();
    }

    protected onEnable(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);

        game.on(Game.EVENT_HIDE, this.resetInput, this);

        this._collider.on(
            Contact2DType.POST_SOLVE,
            this.onGroundContact,
            this,
        );

        this._collider.on(
            Contact2DType.END_CONTACT,
            this.onEndContact,
            this,
        );

        this._body.wakeUp();
    }

    protected onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);

        game.off(Game.EVENT_HIDE, this.resetInput, this);

        this._collider.off(
            Contact2DType.POST_SOLVE,
            this.onGroundContact,
            this,
        );

        this._collider.off(
            Contact2DType.END_CONTACT,
            this.onEndContact,
            this,
        );

        this.resetInput();
        this._groundColliders.clear();

        if (isValid(this._body, true)) {
            const velocity = this._body.linearVelocity;
            velocity.x = 0;
            this._body.linearVelocity = velocity;
        }
    }

    protected update(): void {
        // Loại bỏ nền đã bị hủy hoặc tắt.
        for (const collider of this._groundColliders) {
            if (
                !isValid(collider, true)
                || !collider.enabledInHierarchy
                || collider.sensor
            ) {
                this._groundColliders.delete(collider);
            }
        }

        const left = this._keys.has(KeyCode.KEY_A)
            || this._keys.has(KeyCode.ARROW_LEFT);

        const right = this._keys.has(KeyCode.KEY_D)
            || this._keys.has(KeyCode.ARROW_RIGHT);

        // Giữ cả trái và phải thì đứng yên.
        const keyboardAxis = Number(right) - Number(left);

        // Có thể nhận thêm đầu vào từ joystick hoặc nút cảm ứng.
        const axis = this._moveInput !== 0
            ? this._moveInput
            : keyboardAxis;

        const velocity = this._body.linearVelocity;

        // Chỉ thay đổi X, giữ nguyên Y do vật lý tính toán.
        velocity.x = axis * this.moveSpeed;

        const canJump = this._groundColliders.size > 0
            && velocity.y <= 0.1;

        if (this._jumpRequested && canJump) {
            velocity.y = this.jumpSpeed;

            // Đã nhảy thì không được dùng lại lần tiếp đất này.
            this._groundColliders.clear();
        }

        this._jumpRequested = false;
        this._body.linearVelocity = velocity;
    }

    /**
     * Đầu vào từ script khác:
     * -1: trái; 0: thả; 1: phải.
     */
    public setMoveInput(axis: number): void {
        this._moveInput = Number.isFinite(axis)
            ? Math.max(-1, Math.min(1, axis))
            : 0;
    }

    /**
     * Yêu cầu nhảy ở lần update tiếp theo.
     * Chỉ thực hiện khi đủ điều kiện tiếp đất.
     */
    public jump(): void {
        if (this.enabledInHierarchy) {
            this._jumpRequested = true;
        }
    }

    private onKeyDown(event: EventKeyboard): void {
        // Không tự nhảy liên tục khi giữ phím.
        if (this._keys.has(event.keyCode)) return;

        this._keys.add(event.keyCode);

        if (
            event.keyCode === KeyCode.SPACE
            || event.keyCode === KeyCode.KEY_W
            || event.keyCode === KeyCode.ARROW_UP
        ) {
            this.jump();
        }
    }

    private onKeyUp(event: EventKeyboard): void {
        this._keys.delete(event.keyCode);
    }

    private resetInput(): void {
        this._keys.clear();
        this._moveInput = 0;
        this._jumpRequested = false;
    }

    private onGroundContact(
        selfCollider: Collider2D,
        otherCollider: Collider2D,
        contact: IPhysics2DContact | null,
    ): void {
        if (
            !contact
            || otherCollider.sensor
            || contact.disabled
            || contact.disabledOnce
        ) {
            this._groundColliders.delete(otherCollider);
            return;
        }

        const manifold = contact.getWorldManifold();

        // Normal của Box2D hướng từ colliderA sang colliderB.
        // Đổi về hướng đẩy nhân vật ra khỏi vật đang va chạm.
        const supportY = contact.colliderA === selfCollider
            ? -manifold.normal.y
            : manifold.normal.y;

        // Chỉ tính là tiếp đất khi nhân vật được đỡ từ phía dưới.
        // Chạm tường hoặc chạm trần không được tính.
        if (manifold.points.length > 0 && supportY > 0.6) {
            this._groundColliders.add(otherCollider);
        } else {
            this._groundColliders.delete(otherCollider);
        }
    }

    private onEndContact(
        _selfCollider: Collider2D,
        otherCollider: Collider2D,
    ): void {
        this._groundColliders.delete(otherCollider);
    }
}