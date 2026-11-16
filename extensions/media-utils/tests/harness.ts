import assert from 'assert';

type Fn = () => void | Promise<void>;
const queue: { name: string; fn: Fn }[] = [];

export function test(name: string, fn: Fn): void {
    queue.push({ name, fn });
}

export function skip(name: string, why: string): void {
    queue.push({ name, fn: () => console.log(`  skip ${name}: ${why}`) });
}

/** Runs the queued tests in order; sets the exit code on failure. */
export async function run(): Promise<void> {
    let passed = 0;
    let failed = 0;
    for (const t of queue) {
        try {
            await t.fn();
            passed++;
            console.log(`  ok   ${t.name}`);
        } catch (e) {
            failed++;
            const err = e as Error;
            const detail = err instanceof assert.AssertionError ? err.message : String((err && err.stack) || err).split('\n').slice(0, 6).join('\n');
            console.log(`  FAIL ${t.name}\n       ${detail.split('\n').join('\n       ')}`);
        }
    }
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
}

export function near(actual: number, expected: number, eps: number, msg?: string): void {
    if (!(Math.abs(actual - expected) <= eps)) assert.fail(`${msg || 'value'}: expected ${expected} +- ${eps}, got ${actual}`);
}

export function sine(freq: number, sampleRate: number, seconds: number, amp = 0.5): Float32Array {
    const n = Math.round(sampleRate * seconds);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    return out;
}

/** Dominant frequency by counting zero crossings (good enough for a pure tone). */
export function zeroCrossFreq(x: Float32Array, sampleRate: number): number {
    let count = 0;
    for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0 && x[i] >= 0) || (x[i - 1] >= 0 && x[i] < 0)) count++;
    return (count / 2) * (sampleRate / x.length);
}

export { assert };
