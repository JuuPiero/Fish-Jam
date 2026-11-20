// A browser-ish global environment for the engine (jsdom), set before any engine module loads.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><canvas id="GameCanvas"></canvas></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
const g: any = globalThis;
const w: any = dom.window;
const keys = ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement', 'Image', 'Event', 'KeyboardEvent', 'MouseEvent', 'TouchEvent', 'CustomEvent', 'XMLHttpRequest', 'DOMParser', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'screen', 'location', 'localStorage', 'devicePixelRatio', 'Node', 'Element'];
for (const k of keys) {
    if (k === 'window') g.window = w;
    else if (w[k] !== undefined && g[k] === undefined) {
        try {
            g[k] = typeof w[k] === 'function' && /^[a-z]/.test(k) ? w[k].bind(w) : w[k];
        } catch (e) {
            // read-only in node
        }
    }
}
try {
    Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true });
} catch (e) {
    // keep node's
}
g.__cc_test__ = { currentTestSuiteConfig: {} };
for (const k of ['CC_DEV', 'CC_TEST']) g[k] = true;
// silence the canvas-not-implemented noise
(w.HTMLCanvasElement.prototype as any).getContext = function () {
    return null;
};
