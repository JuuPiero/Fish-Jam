/** Minimal synchronous test runner; results are summed by tests/run.js. */
const results: { passed: number; failed: number } = ((globalThis as any).__aiTestResults ??= { passed: 0, failed: 0 });

export function test(name: string, fn: () => void) {
    try {
        fn();
        results.passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  FAIL ${name}\n       ${(e as Error)?.message?.split('\n').join('\n       ')}`);
    }
}

export function section(name: string) {
    console.log(`\n${name}`);
}
