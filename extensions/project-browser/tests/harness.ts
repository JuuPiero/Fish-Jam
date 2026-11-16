import assert from 'assert';

export const results = { passed: 0, failed: 0 };

export function test(name: string, fn: () => void) {
    try {
        fn();
        results.passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        results.failed++;
        const err = e as Error;
        const detail = err instanceof assert.AssertionError ? err.message : String(err?.stack || err).split('\n').slice(0, 5).join('\n');
        console.log(`  FAIL ${name}\n       ${detail.split('\n').join('\n       ')}`);
    }
}

const queued: { name: string; fn: () => Promise<void> }[] = [];

/** An async test: runs in order when finish() is called. */
export function testAsync(name: string, fn: () => Promise<void>) {
    queued.push({ name, fn });
}

/** Runs the queued async tests, prints the summary and sets the exit code. */
export async function finish(): Promise<void> {
    for (const t of queued) {
        try {
            await t.fn();
            results.passed++;
            console.log(`  ok   ${t.name}`);
        } catch (e) {
            results.failed++;
            const err = e as Error;
            const detail = err instanceof assert.AssertionError ? err.message : String(err?.stack || err).split('\n').slice(0, 6).join('\n');
            console.log(`  FAIL ${t.name}\n       ${detail.split('\n').join('\n       ')}`);
        }
    }
    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    if (results.failed) process.exitCode = 1;
}
