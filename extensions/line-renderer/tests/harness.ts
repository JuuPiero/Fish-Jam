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
