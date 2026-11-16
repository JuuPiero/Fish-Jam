import assert from 'assert';

/** Bound now: tests may replace console.log. */
const print = (s: string) => process.stdout.write(s + '\n');

const queue: { name: string; fn: () => void | Promise<void> }[] = [];

/** Registers a test (sync or async). Call run() at the end of the file. */
export function test(name: string, fn: () => void | Promise<void>) {
    queue.push({ name, fn });
}

export async function run() {
    let passed = 0;
    let failed = 0;
    for (let i = 0; i < queue.length; i++) {
        const t = queue[i];
        try {
            await t.fn();
            passed++;
            print(`  ok   ${t.name}`);
        } catch (e) {
            failed++;
            const err = e as Error;
            const detail = err instanceof assert.AssertionError ? err.message : String((err && err.stack) || err).split('\n').slice(0, 6).join('\n');
            print(`  FAIL ${t.name}\n       ${detail.split('\n').join('\n       ')}`);
        }
    }
    print(`\n${passed} passed, ${failed} failed`);
    // timers of the code under test (intervals in main.ts) must not keep the process alive
    process.exit(failed ? 1 : 0);
}
