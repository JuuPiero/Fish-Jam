/**
 * Runs frames at a target rate from a faster requestAnimationFrame: a game
 * capped at 60 fps (Cocos' game.frameRate) on a 144 Hz screen ticks on 2 or 3
 * rAFs alternately, averaging 60, like the built game would.
 */
export class FramePacer {
    /** Milliseconds between frames; 0 = every call. */
    interval = 0;
    private next = 0;

    constructor(private tolerance = 2) {}

    /** Is a frame due at `now` (ms)? Moves the schedule on when it is. */
    due(now: number): boolean {
        if (this.interval <= 0) return true;
        if (this.next && now + this.tolerance < this.next) return false;
        // Keep a steady schedule; after a long stall start over from now.
        this.next = this.next && now - this.next < this.interval ? this.next + this.interval : now + this.interval;
        return true;
    }

    reset() {
        this.next = 0;
    }
}

/** Interval for a game.frameRate value (number or string, as Cocos stores it). */
export function frameInterval(frameRate: unknown): number {
    const fps = Number(frameRate);
    if (!Number.isFinite(fps) || fps <= 0) return 1000 / 60;
    return 1000 / Math.min(240, Math.max(1, fps));
}
