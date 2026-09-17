import { EventMouse, EventTouch } from "cc";
export interface IPointerDownHandler {
    onPointerDown(event: EventMouse | EventTouch): void;
}

export interface IPointerUpHandler {
    onPointerUp(event: EventMouse | EventTouch): void;
}

export interface IPointerClickHandler {
    onPointerClick(event: EventMouse | EventTouch): void;
}

export interface IPointerEnterHandler {
    onPointerEnter(event: EventMouse | EventTouch): void;
}

export interface IPointerExitHandler {
    onPointerExit(event: EventMouse | EventTouch): void;
}

export interface IDragHandler {
    onDragStart(event: EventMouse | EventTouch): void;
    onDrag(event: EventMouse | EventTouch): void;
    onDragEnd(event: EventMouse | EventTouch): void;
}