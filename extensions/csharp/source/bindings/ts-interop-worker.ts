/**
 * Runs the TS interop generator in a worker thread (dist/ts-interop-worker.js), so parsing the
 * project's TypeScript never blocks the editor's main process.
 */
import { parentPort, workerData } from 'worker_threads';
import { runTsInterop } from './ts-interop-files';

try {
    const r = runTsInterop(workerData.root, workerData.exclude || [], workerData.gcs);
    parentPort!.postMessage({ ok: true, stats: r.result.stats, excluded: r.excluded, changed: r.changed, output: r.output, reportPath: r.reportPath });
} catch (e: any) {
    parentPort!.postMessage({ ok: false, error: String((e && e.message) || e) });
}
