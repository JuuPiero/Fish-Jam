// Runs the TypeScript generated from samples/assets/Scripts/Coroutines.cs with unity-style's own
// coroutine scheduler (unity-lite's byte-identical copy of core/coroutines.ts). Bundled by samples.js.
import { Coroutines } from '../../samples/assets/Scripts/Coroutines';
import { scheduler, step } from 'db://unity-lite/index';

export function run() {
    const out = {};
    const c = new Coroutines();
    c.Start(); // what MonoBehaviour does for the Unity message; runs Blink up to its first yield
    out.afterStart = c.trace.slice();
    const frames = [];
    for (let f = 1; f <= 20 && scheduler.list.length; f++) {
        const before = c.trace.length;
        step(0.25);
        for (let i = before; i < c.trace.length; i++) frames.push(f + ':' + c.trace[i]);
    }
    out.frames = frames;
    out.running = scheduler.list.length;
    out.evens = Coroutines.Evens(5);
    out.labels = c.Labels;
    c.trace.length = 0;
    out.sum = c.Sum();
    out.sumTrace = c.trace.slice();
    c.trace.length = 0;
    c.StartCoroutine(c.Steps(2));
    for (let f = 0; f < 5; f++) step(0.25);
    out.steps = c.trace.slice();
    // StopCoroutine with the Coroutine StartCoroutine returned
    c.trace.length = 0;
    const co = c.StartCoroutine(c.Blink(5));
    c.StopCoroutine(co);
    out.stopped = { trace: c.trace.slice(), done: co.isDone, running: scheduler.list.filter((x) => !x.done).length };
    return out;
}
