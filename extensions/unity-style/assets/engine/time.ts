import { director, Director, game, PhysicsSystem, PhysicsSystem2D } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { CoroutineScheduler, PHASE_END_OF_FRAME, PHASE_FIXED, PHASE_UPDATE } from '../core/coroutines';
import { Mathf } from '../core/mathf';

/**
 * The frame loop of unity-style: Time, FixedUpdate, coroutines, Invoke and
 * delayed Destroy, all driven by director events.
 *
 * Time.timeScale: Cocos has no global time scale, so the first time the loop
 * starts it wraps director.tick (on the director instance, not a prototype)
 * and passes dt * timeScale to the whole frame: component updates, physics,
 * animation, tweens and the scheduler all see the scaled dt, as in Unity.
 * Not installed in the editor's scene view (only in preview / builds).
 */

interface Timer {
    owner: any;
    fn: () => void;
    key: any;
    at: number;
    repeat: number;
    dead: boolean;
}

const state = {
    installed: false,
    wrapped: false,
    timeScale: 1,
    deltaTime: 0,
    unscaledDeltaTime: 0,
    time: 0,
    unscaledTime: 0,
    fixedTime: 0,
    levelLoadTime: 0,
    frame: 0,
    inFixed: false,
    accumulator: 0,
    ownFixedStep: 0.02,
    tickedThisFrame: false,
};

const fixedBehaviours: any[] = [];
const timers: Timer[] = [];
const start = Date.now();

function realtime(): number {
    return (Date.now() - start) / 1000;
}

/** The shared coroutine scheduler. */
export const coroutines = new CoroutineScheduler({
    time: () => state.time,
    realtime,
    frame: () => state.frame,
});

/** Alive for coroutines and invokes: valid and in an active hierarchy. */
function behaviourAlive(owner: any): boolean {
    if (!owner) return true;
    if (owner.isValid === false) return false;
    const node = owner.node;
    return !node || node.activeInHierarchy !== false;
}

function fixedStep(): number {
    try {
        if (PhysicsSystem && PhysicsSystem.instance) return PhysicsSystem.instance.fixedTimeStep;
    } catch (e) {
        // no 3D physics
    }
    try {
        if (PhysicsSystem2D && PhysicsSystem2D.instance) return PhysicsSystem2D.instance.fixedTimeStep;
    } catch (e) {
        // no 2D physics
    }
    return state.ownFixedStep;
}

function maxSubSteps(): number {
    try {
        if (PhysicsSystem && PhysicsSystem.instance) return Math.max(1, PhysicsSystem.instance.maxSubSteps);
    } catch (e) {
        // no 3D physics
    }
    try {
        if (PhysicsSystem2D && PhysicsSystem2D.instance) return Math.max(1, PhysicsSystem2D.instance.maxSubSteps);
    } catch (e) {
        // no 2D physics
    }
    return 8;
}

function beginFrame(dt: number, unscaled: number): void {
    state.tickedThisFrame = true;
    state.deltaTime = dt;
    state.unscaledDeltaTime = unscaled;
    state.time += dt;
    state.unscaledTime += unscaled;
}

function onBeforeUpdate(): void {
    if (!state.tickedThisFrame) {
        // director.tick is not wrapped (editor): read the game's dt
        const dt = game.deltaTime || 0;
        beginFrame(dt * state.timeScale, dt);
    }
    state.tickedThisFrame = false;
    state.frame++;
    // FixedUpdate: same stepping rule as Cocos' physics system
    const step = fixedStep();
    if (!(step > 0)) return;
    state.accumulator += state.deltaTime;
    const max = maxSubSteps();
    let n = 0;
    while (n < max && state.accumulator >= step) {
        state.accumulator -= step;
        state.fixedTime += step;
        runFixed();
        n++;
    }
}

function runFixed(): void {
    state.inFixed = true;
    let w = 0;
    for (let i = 0; i < fixedBehaviours.length; i++) {
        const b = fixedBehaviours[i];
        if (!b || b.isValid === false) continue;
        fixedBehaviours[w++] = b;
        if (!b.enabledInHierarchy || typeof b.FixedUpdate !== 'function') continue;
        try {
            b.FixedUpdate();
        } catch (e) {
            console.error(e);
        }
    }
    fixedBehaviours.length = w;
    state.inFixed = false;
    coroutines.tick(PHASE_FIXED, behaviourAlive);
}

function onAfterUpdate(): void {
    runTimers();
    coroutines.tick(PHASE_UPDATE, behaviourAlive);
}

function onAfterDraw(): void {
    coroutines.tick(PHASE_END_OF_FRAME, behaviourAlive);
}

function runTimers(): void {
    const now = state.time;
    const n = timers.length;
    for (let i = 0; i < n; i++) {
        const t = timers[i];
        if (t.dead) continue;
        if (t.owner && t.owner.isValid === false) {
            t.dead = true;
            continue;
        }
        if (t.owner && !behaviourAlive(t.owner)) continue; // paused while inactive
        if (now < t.at) continue;
        if (t.repeat > 0) t.at += t.repeat;
        else t.dead = true;
        try {
            t.fn();
        } catch (e) {
            console.error(e);
        }
    }
    let w = 0;
    for (let i = 0; i < timers.length; i++) if (!timers[i].dead) timers[w++] = timers[i];
    timers.length = w;
}

/** Hooks the director once (idempotent). */
export function ensureLoop(): void {
    if (state.installed) return;
    state.installed = true;
    Mathf.deltaTime = () => Time.deltaTime;
    if (!EDITOR_NOT_IN_PREVIEW) {
        const d: any = director;
        const orig = d.tick;
        if (typeof orig === 'function') {
            d.tick = function (dt: number): void {
                const scaled = dt * state.timeScale;
                beginFrame(scaled, dt);
                orig.call(this, scaled);
            };
            state.wrapped = true;
        }
    }
    director.on(Director.EVENT_BEFORE_UPDATE, onBeforeUpdate);
    director.on(Director.EVENT_AFTER_UPDATE, onAfterUpdate);
    director.on(Director.EVENT_AFTER_DRAW, onAfterDraw);
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
        state.levelLoadTime = state.time;
    });
}

/** Registers a behaviour whose FixedUpdate runs each fixed step (kept until destroyed). Not in the editor scene view. */
function registerFixed(b: any): void {
    if (EDITOR_NOT_IN_PREVIEW) return;
    ensureLoop();
    if (fixedBehaviours.indexOf(b) < 0) fixedBehaviours.push(b);
}

/** Calls fn after `delay` seconds of scaled time (then every `repeat` seconds when > 0). */
function addTimer(owner: any, key: any, fn: () => void, delay: number, repeat: number): void {
    ensureLoop();
    timers.push({ owner, key, fn, at: state.time + Math.max(0, delay), repeat: repeat > 0 ? repeat : 0, dead: false });
}

/** Cancels the owner's timers with this key (any key when undefined). */
function cancelTimers(owner: any, key?: any): void {
    for (let i = 0; i < timers.length; i++) {
        const t = timers[i];
        if (t.owner === owner && (key === undefined || t.key === key)) t.dead = true;
    }
}

function hasTimer(owner: any, key?: any): boolean {
    for (let i = 0; i < timers.length; i++) {
        const t = timers[i];
        if (!t.dead && t.owner === owner && (key === undefined || t.key === key)) return true;
    }
    return false;
}

/** Unity's Time. */
export class Time {
    /** Seconds since the last frame, scaled (fixedDeltaTime inside FixedUpdate). */
    static get deltaTime(): number {
        ensureLoop();
        return state.inFixed ? fixedStep() : state.deltaTime;
    }

    static get unscaledDeltaTime(): number {
        ensureLoop();
        return state.unscaledDeltaTime;
    }

    /** Scaled seconds since the loop started (the first frame after unity-style was loaded). */
    static get time(): number {
        ensureLoop();
        return state.inFixed ? state.fixedTime : state.time;
    }

    static get unscaledTime(): number {
        ensureLoop();
        return state.unscaledTime;
    }

    static get timeSinceLevelLoad(): number {
        ensureLoop();
        return state.time - state.levelLoadTime;
    }

    /** Real seconds since the game started. */
    static get realtimeSinceStartup(): number {
        return game.totalTime / 1000;
    }

    /** Frames since the engine started (director's frame counter). */
    static get frameCount(): number {
        return director.getTotalFrames();
    }

    /** The physics fixed step (3D, else 2D, else 0.02); setting it sets the physics step too. */
    static get fixedDeltaTime(): number {
        return fixedStep();
    }

    static set fixedDeltaTime(v: number) {
        state.ownFixedStep = v;
        try {
            if (PhysicsSystem && PhysicsSystem.instance) PhysicsSystem.instance.fixedTimeStep = v;
        } catch (e) {
            // no 3D physics
        }
        try {
            if (PhysicsSystem2D && PhysicsSystem2D.instance) PhysicsSystem2D.instance.fixedTimeStep = v;
        } catch (e) {
            // no 2D physics
        }
    }

    static get fixedTime(): number {
        ensureLoop();
        return state.fixedTime;
    }

    static get inFixedTimeStep(): boolean {
        return state.inFixed;
    }

    /**
     * Scales the dt of the whole frame (0 pauses updates and physics). Takes
     * effect from the next frame. In the editor's scene view it is ignored.
     */
    static get timeScale(): number {
        return state.timeScale;
    }

    static set timeScale(v: number) {
        ensureLoop();
        state.timeScale = v > 0 ? v : 0;
    }

    /** Whether director.tick was wrapped (false in the editor scene view: timeScale does nothing there). */
    static get timeScaleSupported(): boolean {
        ensureLoop();
        return state.wrapped;
    }
}

/**
 * The loop's helpers for the other modules (one object, so tools that scan
 * exports, like the csharp extension's TS interop, do not take them for
 * decorators).
 */
export const frameLoop = {
    registerFixed,
    addTimer,
    cancelTimers,
    hasTimer,
    alive: behaviourAlive,
};
