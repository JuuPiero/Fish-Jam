import { _decorator, Camera, Component, EventMouse, EventTouch, geometry, Input, input, Node, PhysicsSystem, sys } from 'cc';
import { IDragHandler, IPointerClickHandler, IPointerDownHandler, IPointerEnterHandler, IPointerExitHandler, IPointerUpHandler } from './PointerEvent';
const { ccclass, property } = _decorator;

@ccclass('PhysicsRaycaster')
export class PhysicsRaycaster extends Component {
    private _camera!: Camera;

    private _currentHoverNode: Node | null = null;
    private _pointerDownNode: Node | null = null;
    private _draggingNode: Node | null = null;

    protected onLoad(): void {
        const camera = this.getComponent(Camera);

        if (!camera) {
            console.error('Camera component not found on PhysicsRaycaster');
            return;
        }

        this._camera = camera;
    }

    protected onEnable(): void {
        if (sys.isMobile) {
            input.on(Input.EventType.TOUCH_START, this.onPointerDown, this);
            input.on(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
            input.on(Input.EventType.TOUCH_END, this.onPointerUp, this);
            input.on(Input.EventType.TOUCH_CANCEL, this.onPointerUp, this);
        } else {
            input.on(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
            input.on(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
            input.on(Input.EventType.MOUSE_UP, this.onPointerUp, this);
        }
    }

    protected onDisable(): void {
        if (sys.isMobile) {
            input.off(Input.EventType.TOUCH_START, this.onPointerDown, this);
            input.off(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
            input.off(Input.EventType.TOUCH_END, this.onPointerUp, this);
            input.off(Input.EventType.TOUCH_CANCEL, this.onPointerUp, this);
        } else {
            input.off(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
            input.off(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
            input.off(Input.EventType.MOUSE_UP, this.onPointerUp, this);
        }
    }

    /*
    ========================================
    Events
    ========================================
    */

    private onPointerDown(event: EventMouse | EventTouch): void {
        const node = this.raycastNode(event);
        if (!node) return;

        this._pointerDownNode = node;

        const downHandler = this.findHandler<IPointerDownHandler>(
            node,
            'onPointerDown'
        );

        downHandler?.onPointerDown(event);

        const dragHandler = this.findHandler<IDragHandler>(
            node,
            'onDragStart'
        );

        if (dragHandler) {
            this._draggingNode = node;
            dragHandler.onDragStart(event);
        }
    }

    private onPointerMove(event: EventMouse | EventTouch): void {
        const node = this.raycastNode(event);

        /*
        Hover Enter / Exit
        */

        if (node !== this._currentHoverNode) {
            if (this._currentHoverNode) {
                const exitHandler =
                    this.findHandler<IPointerExitHandler>(
                        this._currentHoverNode,
                        'onPointerExit'
                    );

                exitHandler?.onPointerExit(event);
            }

            if (node) {
                const enterHandler =
                    this.findHandler<IPointerEnterHandler>(
                        node,
                        'onPointerEnter'
                    );

                enterHandler?.onPointerEnter(event);
            }

            this._currentHoverNode = node;
        }

        /*
        Drag
        */

        if (this._draggingNode) {
            const dragHandler = this.findHandler<IDragHandler>(
                this._draggingNode,
                'onDrag'
            );

            dragHandler?.onDrag(event);
        }
    }

    private onPointerUp(event: EventMouse | EventTouch): void {
        const node = this.raycastNode(event);

        /*
        Pointer Up
        */

        if (node) {
            const upHandler = this.findHandler<IPointerUpHandler>(
                node,
                'onPointerUp'
            );

            upHandler?.onPointerUp(event);
        }

        /*
        Click
        click only if pointer down/up on same node
        */

        if (
            node &&
            this._pointerDownNode &&
            node === this._pointerDownNode
        ) {
            const clickHandler =
                this.findHandler<IPointerClickHandler>(
                    node,
                    'onPointerClick'
                );

            clickHandler?.onPointerClick(event);
        }

        /*
        Drag End
        */

        if (this._draggingNode) {
            const dragHandler = this.findHandler<IDragHandler>(
                this._draggingNode,
                'onDragEnd'
            );

            dragHandler?.onDragEnd(event);
        }

        this._pointerDownNode = null;
        this._draggingNode = null;
    }

    /*
    ========================================
    Helpers
    ========================================
    */

    private raycastNode(
        event: EventMouse | EventTouch
    ): Node | null {
        const pos = event.getLocation();

        const ray = new geometry.Ray();
        this._camera.screenPointToRay(pos.x, pos.y, ray);

        if (!PhysicsSystem.instance.raycast(ray)) {
            return null;
        }

        const result = PhysicsSystem.instance.raycastResults[0];
        if (!result || !result.collider || !result.collider.node) {
            return null;
        }

        const node = result.collider.node;
        return node.isValid ? node : null;
    }

    private findHandler<T>(
        node: Node,
        methodName: keyof T
    ): T | null {
        if (!node || !node.isValid) {
            return null;
        }

        const components = node.getComponents(Component) as unknown as { length?: number; [index: number]: Component };
        if (!components || typeof components.length !== 'number' || components.length === 0) {
            return null;
        }
        

        for (let i = 0; i < components?.length; i++) {
            const comp = components[i];
            if (!comp) {
                continue;
            }

            const handler = comp as unknown as Partial<T>;
            if (typeof handler[methodName] === 'function') {
                return handler as T;
            }
        }

        return null;
    }
}