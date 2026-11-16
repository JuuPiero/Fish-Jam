/**
 * worker_threads worker for the pure-JS pixel steps of the image pipeline
 * (trim bounds, colour adjust, alpha bleed / premultiply, colour count), so a
 * large texture does not stall the editor's main process. sharp itself is
 * asynchronous and stays on the main thread.
 */
import { parentPort } from 'worker_threads';
import { runPixelJob, PixelJob } from './pixel-job';

if (parentPort) {
    const port = parentPort;
    port.on('message', (msg: { id: number; job: PixelJob; data: ArrayBuffer }) => {
        try {
            const data = new Uint8Array(msg.data);
            const result = runPixelJob(data, msg.job);
            port.postMessage({ id: msg.id, ok: true, result, data: data.buffer }, [data.buffer]);
        } catch (e: any) {
            port.postMessage({ id: msg.id, ok: false, error: e && e.message ? e.message : String(e) });
        }
    });
}
