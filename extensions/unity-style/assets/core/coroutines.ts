/**
 * Unity-style coroutines on JavaScript iterators (generators), with no 'cc'
 * import: the engine side drives tick() from director events.
 *
 * A coroutine is any iterator: a generator (`function*`), or a hand-written
 * object with next(). What it yields decides when it resumes:
 *   null / undefined / a number   next frame (after the Update phase)
 *   WaitForSeconds(s)             s seconds of scaled game time
 *   WaitForSecondsRealtime(s)     s seconds of real time
 *   WaitUntil(fn) / WaitWhile(fn) when fn() becomes true / false (checked each frame)
 *   WaitForEndOfFrame             after the frame is drawn
 *   WaitForFixedUpdate            after the next FixedUpdate step
 *   a Coroutine (StartCoroutine)  when that one finishes
 *   an iterator                   runs it nested, then continues
 *   a Promise / thenable          when it settles (its value is sent back to the yield)
 *   a CustomYieldInstruction      while keepWaiting is true
 */

export const PHASE_UPDATE = 0;
export const PHASE_END_OF_FRAME = 1;
export const PHASE_FIXED = 2;

export class YieldInstruction {}

// (no TypeScript parameter properties in runtime code: some Babel plugin orders drop them)
export class WaitForSeconds extends YieldInstruction {
    seconds: number;

    constructor(seconds: number) {
        super();
        this.seconds = seconds;
    }
}

export class WaitForSecondsRealtime extends YieldInstruction {
    seconds: number;

    constructor(seconds: number) {
        super();
        this.seconds = seconds;
    }
}

export class WaitUntil extends YieldInstruction {
    predicate: () => boolean;

    constructor(predicate: () => boolean) {
        super();
        this.predicate = predicate;
    }
}

export class WaitWhile extends YieldInstruction {
    predicate: () => boolean;

    constructor(predicate: () => boolean) {
        super();
        this.predicate = predicate;
    }
}

export class WaitForEndOfFrame extends YieldInstruction {}

export class WaitForFixedUpdate extends YieldInstruction {}

/** Subclass and override keepWaiting (Unity's CustomYieldInstruction). */
export class CustomYieldInstruction extends YieldInstruction {
    get keepWaiting(): boolean {
        return false;
    }
}

export interface IteratorLike {
    next(value?: any): { value?: any; done?: boolean };
    return?(value?: any): any;
}

/** A running coroutine (what StartCoroutine returns). */
export class Coroutine extends YieldInstruction {
    /** The behaviour that owns it (stopped with it). */
    owner: any;
    /** Optional name (StartCoroutine('Name')), for StopCoroutine('Name'). */
    name = '';
    /** Iterators: [outer, ..., innermost]. */
    stack: IteratorLike[] = [];
    done = false;
    /** What it waits for. */
    phase = PHASE_UPDATE;
    resumeFrame = 0;
    until = 0;
    realUntil = 0;
    predicate: (() => boolean) | null = null;
    whileFalse = false;
    custom: CustomYieldInstruction | null = null;
    waitingOn: Coroutine | null = null;
    promise: { settled: boolean; value: any; error: any; failed: boolean } | null = null;
    sendValue: any = undefined;
    /** The iterator object the user passed (for StopCoroutine(iterator)). */
    root: IteratorLike | null = null;

    get isDone(): boolean {
        return this.done;
    }
}

function isIterator(v: any): v is IteratorLike {
    return !!v && typeof v === 'object' && typeof v.next === 'function' && !(v instanceof YieldInstruction);
}

function isThenable(v: any): boolean {
    return !!v && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';
}

export interface Clock {
    /** Scaled game time, seconds. */
    time(): number;
    /** Real time, seconds. */
    realtime(): number;
    /** Frame counter, incremented once per update tick. */
    frame(): number;
}

export class CoroutineScheduler {
    list: Coroutine[] = [];
    clock: Clock;
    /** Called when a coroutine throws; default logs with console.error. */
    onError: (e: any, co: Coroutine) => void = (e) => {
        console.error('[unity-style] Coroutine error:', e);
    };

    constructor(clock: Clock) {
        this.clock = clock;
    }

    /** Starts it and runs it up to its first yield right away (as Unity does). */
    start(owner: any, routine: IteratorLike, name = ''): Coroutine {
        const co = new Coroutine();
        co.owner = owner;
        co.name = name;
        co.root = routine;
        co.stack.push(routine);
        this.list.push(co);
        this.advance(co);
        return co;
    }

    stop(co: Coroutine | null | undefined): void {
        if (!co || co.done) return;
        this.finish(co, true);
    }

    /** Stops the owner's coroutines started from this name or iterator. */
    stopMatching(owner: any, key: string | IteratorLike): void {
        for (let i = 0; i < this.list.length; i++) {
            const co = this.list[i];
            if (co.owner !== owner || co.done) continue;
            if ((typeof key === 'string' && co.name === key) || co.root === key) this.finish(co, true);
        }
    }

    stopAll(owner: any): void {
        for (let i = 0; i < this.list.length; i++) {
            const co = this.list[i];
            if (co.owner === owner && !co.done) this.finish(co, true);
        }
    }

    countFor(owner: any): number {
        let n = 0;
        for (let i = 0; i < this.list.length; i++) if (this.list[i].owner === owner && !this.list[i].done) n++;
        return n;
    }

    /**
     * Resumes what is due in this phase. isAlive(owner) false stops the
     * owner's coroutines (destroyed or deactivated).
     */
    tick(phase: number, isAlive?: (owner: any) => boolean): void {
        const n = this.list.length;
        for (let i = 0; i < n && i < this.list.length; i++) {
            const co = this.list[i];
            if (co.done) continue;
            if (isAlive && co.owner && !isAlive(co.owner)) {
                this.finish(co, true);
                continue;
            }
            if (this.ready(co, phase)) this.advance(co);
        }
        // compact
        let w = 0;
        for (let i = 0; i < this.list.length; i++) if (!this.list[i].done) this.list[w++] = this.list[i];
        this.list.length = w;
    }

    private ready(co: Coroutine, phase: number): boolean {
        if (co.waitingOn) return phase === PHASE_UPDATE && co.waitingOn.done;
        if (co.promise) return co.promise.settled;
        if (co.phase !== phase) return false;
        if (phase === PHASE_UPDATE) {
            if (this.clock.frame() < co.resumeFrame) return false;
            if (co.until && this.clock.time() < co.until) return false;
            if (co.realUntil && this.clock.realtime() < co.realUntil) return false;
            if (co.predicate) {
                const v = !!co.predicate();
                if (co.whileFalse ? v : !v) return false;
            }
            if (co.custom && co.custom.keepWaiting) return false;
        }
        return true;
    }

    private clearWait(co: Coroutine): void {
        co.phase = PHASE_UPDATE;
        co.resumeFrame = 0;
        co.until = 0;
        co.realUntil = 0;
        co.predicate = null;
        co.whileFalse = false;
        co.custom = null;
        co.waitingOn = null;
        co.promise = null;
    }

    private finish(co: Coroutine, stopped: boolean): void {
        co.done = true;
        if (stopped) {
            for (let i = co.stack.length - 1; i >= 0; i--) {
                const it = co.stack[i];
                try {
                    if (it.return) it.return(undefined);
                } catch (e) {
                    // finally blocks may throw; nothing to resume anyway
                }
            }
        }
        co.stack.length = 0;
    }

    private advance(co: Coroutine): void {
        let send = co.sendValue;
        if (co.promise) {
            const p = co.promise;
            if (p.failed) {
                this.clearWait(co);
                this.throwInto(co, p.error);
                return;
            }
            send = p.value;
        }
        this.clearWait(co);
        co.sendValue = undefined;
        for (let guard = 0; guard < 10000; guard++) {
            if (co.done) return;
            const top = co.stack[co.stack.length - 1];
            if (!top) {
                this.finish(co, false);
                return;
            }
            let r: { value?: any; done?: boolean };
            try {
                r = top.next(send);
            } catch (e) {
                this.onError(e, co);
                this.finish(co, true);
                return;
            }
            send = undefined;
            if (r.done) {
                co.stack.pop();
                if (!co.stack.length) {
                    this.finish(co, false);
                    return;
                }
                continue; // the parent continues in the same frame
            }
            if (this.setWait(co, r.value)) return;
        }
        this.onError(new Error('coroutine yielded nested iterators without waiting 10000 times'), co);
        this.finish(co, true);
    }

    private throwInto(co: Coroutine, err: any): void {
        const top = co.stack[co.stack.length - 1] as any;
        if (!top || typeof top.throw !== 'function') {
            this.onError(err, co);
            this.finish(co, true);
            return;
        }
        let r: { value?: any; done?: boolean };
        try {
            r = top.throw(err);
        } catch (e) {
            this.onError(e, co);
            this.finish(co, true);
            return;
        }
        if (r.done) {
            co.stack.pop();
            if (!co.stack.length) this.finish(co, false);
            else this.advance(co);
            return;
        }
        if (!this.setWait(co, r.value)) this.advance(co);
    }

    /** Sets what the coroutine waits for; false when it should continue right away (a nested iterator). */
    private setWait(co: Coroutine, v: any): boolean {
        const frame = this.clock.frame();
        if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') {
            co.resumeFrame = frame + 1;
            return true;
        }
        if (v instanceof WaitForSeconds) {
            co.until = this.clock.time() + v.seconds;
            co.resumeFrame = frame + 1;
            return true;
        }
        if (v instanceof WaitForSecondsRealtime) {
            co.realUntil = this.clock.realtime() + v.seconds;
            co.resumeFrame = frame + 1;
            return true;
        }
        if (v instanceof WaitUntil || v instanceof WaitWhile) {
            co.predicate = v.predicate;
            co.whileFalse = v instanceof WaitWhile;
            co.resumeFrame = frame; // checked from this frame's update phase on
            return true;
        }
        if (v instanceof WaitForEndOfFrame) {
            co.phase = PHASE_END_OF_FRAME;
            return true;
        }
        if (v instanceof WaitForFixedUpdate) {
            co.phase = PHASE_FIXED;
            return true;
        }
        if (v instanceof Coroutine) {
            if (v.done) {
                co.resumeFrame = frame + 1;
                return true;
            }
            co.waitingOn = v;
            return true;
        }
        if (v instanceof CustomYieldInstruction) {
            co.custom = v;
            co.resumeFrame = frame;
            return true;
        }
        if (isIterator(v)) {
            co.stack.push(v);
            return false;
        }
        if (isThenable(v)) {
            const state = { settled: false, value: undefined as any, error: undefined as any, failed: false };
            co.promise = state;
            v.then(
                (val: any) => {
                    state.value = val;
                    state.settled = true;
                },
                (err: any) => {
                    state.error = err;
                    state.failed = true;
                    state.settled = true;
                },
            );
            return true;
        }
        // anything else: next frame
        co.resumeFrame = frame + 1;
        return true;
    }
}
