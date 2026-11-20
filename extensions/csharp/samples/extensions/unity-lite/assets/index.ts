/**
 * Test fixture (not a real extension): unity-style's coroutines and decorators, through
 * byte-identical copies of its core/coroutines.ts and engine/decorators.ts, and its MonoBehaviour
 * reduced to coroutines. The clock is moved by hand (step), so the tests can run the C# output
 * in node against unity-style's own coroutine scheduler.
 */
import { _decorator, Component } from 'cc';
import { Coroutine, CoroutineScheduler, IteratorLike, PHASE_UPDATE } from './core/coroutines';

export {
    Coroutine, CustomYieldInstruction, WaitForEndOfFrame, WaitForFixedUpdate, WaitForSeconds, WaitForSecondsRealtime, WaitUntil, WaitWhile, YieldInstruction,
} from './core/coroutines';
export type { IteratorLike } from './core/coroutines';
export {
    AddComponentMenu, DefaultExecutionOrder, DisallowMultipleComponent, ExecuteAlways, ExecuteInEditMode, FormerlySerializedAs, Header, HelpURL, HideInInspector, Min,
    Multiline, NonSerialized, Range, RequireComponent, Serializable, SerializeField, Space, TextArea, Tooltip,
} from './engine/decorators';

const { ccclass } = _decorator;

/** Game time and frame count, moved by step(). */
export const clock = { time: 0, frame: 0 };

export const scheduler = new CoroutineScheduler({
    time: () => clock.time,
    realtime: () => clock.time,
    frame: () => clock.frame,
});

/** One frame of dt seconds: the coroutines due in the Update phase resume. */
export function step(dt: number): void {
    clock.frame++;
    clock.time += dt;
    scheduler.tick(PHASE_UPDATE);
}

/**
 * unity-style's MonoBehaviour reduced to coroutines. Like the real one, it calls the Unity
 * messages of its subclasses (here: the tests call them).
 *
 * @unityMessages
 */
@ccclass('lite.MonoBehaviour')
export class MonoBehaviour extends Component {
    /** A generator object, a method name (with an argument) or a function returning one. */
    StartCoroutine(routine: IteratorLike | string | (() => IteratorLike), value?: any): Coroutine | null {
        const self: any = this;
        let it: IteratorLike | null = null;
        let name = '';
        if (typeof routine === 'string') {
            name = routine;
            it = typeof self[routine] === 'function' ? self[routine](value) : null;
        } else if (typeof routine === 'function') it = (routine as () => IteratorLike).call(this);
        else it = routine;
        if (!it || typeof it.next !== 'function') return null;
        return scheduler.start(this, it, name);
    }

    StopCoroutine(routine: Coroutine | IteratorLike | string | null): void {
        if (!routine) return;
        if (routine instanceof Coroutine) scheduler.stop(routine);
        else scheduler.stopMatching(this, routine);
    }

    StopAllCoroutines(): void {
        scheduler.stopAll(this);
    }
}
