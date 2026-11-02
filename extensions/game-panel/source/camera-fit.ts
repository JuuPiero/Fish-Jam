/** Camera sizing helpers (no engine import, so they can be unit-tested). */

export interface SizedCamera {
    width: number;
    height: number;
    resize(width: number, height: number): void;
}

export interface SizedWindow {
    width: number;
    height: number;
    swapchain?: { surfaceTransform?: number } | null;
}

/** Sizes a camera like `win` would (what Camera.changeTargetWindow does), without moving it there. */
export function fitToWindow(cam: SizedCamera, win: SizedWindow | null | undefined) {
    if (!win) return;
    // Window sizes are pre-rotated: a 90/270 degree surface swaps them.
    const orientation = win.swapchain?.surfaceTransform ?? 0;
    const w = orientation % 2 ? win.height : win.width;
    const h = orientation % 2 ? win.width : win.height;
    if (w > 0 && h > 0 && (cam.width !== w || cam.height !== h)) cam.resize(w, h);
}
