import { Node, tween, Vec3 } from "cc"

/**
 * Moves the node to an absolute target position.
 */
export const moveTo = (node: Node, target: Vec3, duration: number, onComplete?: () => void) => {
    tween(node)
        .to(duration, { position: target }, { easing: 'quadInOut' })
        .call(() => onComplete?.())
        .start();
}

/**
 * A single vertical hop in place, e.g. an icon/character jumping for attention.
 */
export const jump = (node: Node, duration: number, onComplete?: () => void, height: number = 60) => {
    tween(node)
        .by(duration / 2, { position: new Vec3(0, height, 0) }, { easing: 'quadOut' })
        .by(duration / 2, { position: new Vec3(0, -height, 0) }, { easing: 'quadIn' })
        .call(() => onComplete?.())
        .start();
}

/**
 * Drops the node from above down onto its current position, like gravity pulling it into place.
 */
export const fall = (node: Node, duration: number, onComplete?: () => void, fallHeight: number = 300) => {
    const targetPosition = node.position.clone();
    node.setPosition(targetPosition.x, targetPosition.y + fallHeight, targetPosition.z);

    tween(node)
        .to(duration, { position: targetPosition }, { easing: 'quadIn' })
        .call(() => onComplete?.())
        .start();
}

/**
 * Two decaying hops in place, like a ball bouncing to a stop.
 */
export const bounce = (node: Node, duration: number, onComplete?: () => void, height: number = 40) => {
    const hopDuration = duration / 4;

    tween(node)
        .by(hopDuration, { position: new Vec3(0, height, 0) }, { easing: 'quadOut' })
        .by(hopDuration, { position: new Vec3(0, -height, 0) }, { easing: 'quadIn' })
        .by(hopDuration, { position: new Vec3(0, height * 0.5, 0) }, { easing: 'quadOut' })
        .by(hopDuration, { position: new Vec3(0, -height * 0.5, 0) }, { easing: 'quadIn' })
        .call(() => onComplete?.())
        .start();
}

/**
 * Quick scale punch that overshoots and settles back, for tap/hit feedback.
 */
export const punch = (node: Node, duration: number, onComplete?: () => void, strength: number = 0.3) => {
    const originalScale = node.scale.clone();
    const punchScale = new Vec3(originalScale.x * (1 + strength), originalScale.y * (1 + strength), originalScale.z);
    const overshoot = new Vec3(originalScale.x * (1 - strength * 0.4), originalScale.y * (1 - strength * 0.4), originalScale.z);

    tween(node)
        .to(duration * 0.2, { scale: punchScale }, { easing: 'quadOut' })
        .to(duration * 0.3, { scale: overshoot }, { easing: 'sineInOut' })
        .to(duration * 0.5, { scale: originalScale }, { easing: 'elasticOut' })
        .call(() => onComplete?.())
        .start();
}
