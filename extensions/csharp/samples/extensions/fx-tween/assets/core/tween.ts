// Fixture: a small fluent tween API in an extension runtime (db://fx-tween/core/tween).
import { Node, Vec3 } from 'cc';

export enum FxEase {
    Linear,
    OutQuad,
    OutBack,
}

export class FxTween {
    private _ease = FxEase.Linear;
    private _done: (() => void) | null = null;
    private _t = 0;

    constructor(readonly node: Node, readonly from: Vec3, readonly to: Vec3, readonly duration: number) {}

    static move(node: Node, to: Vec3, duration: number): FxTween {
        return new FxTween(node, node.position.clone(), to.clone(), duration);
    }

    setEase(ease: FxEase): this {
        this._ease = ease;
        return this;
    }

    onComplete(cb: () => void): this {
        this._done = cb;
        return this;
    }

    get progress(): number {
        return this.duration > 0 ? Math.min(1, this._t / this.duration) : 1;
    }

    step(dt: number): boolean {
        this._t += dt;
        const p = this.progress;
        const k = this._ease === FxEase.OutQuad ? 1 - (1 - p) * (1 - p) : this._ease === FxEase.OutBack ? 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2) : p;
        const out = new Vec3();
        Vec3.lerp(out, this.from, this.to, k);
        this.node.setPosition(out);
        if (p >= 1 && this._done) {
            this._done();
            this._done = null;
        }
        return p < 1;
    }
}
