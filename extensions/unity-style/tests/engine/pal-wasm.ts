// Node version of pal/wasm (like the engine's tests/utils/pal-wasm-testing.ts).
import { join } from 'path';
import { readFileSync } from 'fs';

declare const __ENGINE_ROOT__: string;
const externalHome = __ENGINE_ROOT__ + '/native/external';

export async function fetchBuffer(binaryUrl: string): Promise<ArrayBuffer> {
    const m = /^external:(.*)/.exec(binaryUrl);
    if (!m) throw new Error('unknown wasm url ' + binaryUrl);
    const buf = readFileSync(join(externalHome, m[1]));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function instantiateWasm(wasmUrl: string, importObject: WebAssembly.Imports): Promise<any> {
    const ab = await fetchBuffer(wasmUrl);
    return WebAssembly.instantiate(ab, importObject);
}

export async function ensureWasmModuleReady(): Promise<void> {
    return Promise.resolve();
}
