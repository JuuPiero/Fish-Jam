import { warn } from 'cc';
import type { UIDocument } from './UIDocument';
import type { UIScreen } from './UINavigation';

/**
 * Runs the inline `<script>` tags written in a UIDocument's HTML and in navigation screen templates:
 *
 *   <canvas class="fx"></canvas>
 *   <script>
 *       const ctx = el.querySelector('.fx').getContext('2d');
 *       loop(dt => { ... });                 // every frame, stopped automatically
 *       exports.burst = n => { ... };        // callable from TS: doc.exports.burst(20)
 *   </script>
 *
 * Each script runs once, when its content is attached (document build / reload, screen mount),
 * in its own function scope (top-level const / let / function stay local), with these variables:
 *   el         parent element of the <script> tag
 *   root       document root, or the screen root for a script in a screen template
 *   doc        the UIDocument
 *   screen     the UIScreen owning the template (null at document level)
 *   exports    object shared with TS: doc.exports / screen.exports
 *   onDispose  onDispose(fn): fn runs when the content goes away (reload, destroy, screen unmount)
 *   loop       loop(fn): fn(dt in seconds) every frame until disposed; returns stop()
 *
 * Only classic inline scripts run (no `type`, or a JavaScript type). Other types such as
 * `application/json` stay in the DOM as data. `src` and `type="module"` are not supported.
 * Executed scripts are removed from the DOM so they never affect layout or CSS selectors.
 */

export interface UIScriptScope {
    root: HTMLElement;
    doc: UIDocument;
    screen: UIScreen | null;
    exports: Record<string, any>;
    /** Used in error messages and as the source name shown in DevTools. */
    label: string;
}

const PARAMS = ['el', 'root', 'doc', 'screen', 'exports', 'onDispose', 'loop'];
const JS_TYPES = ['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'];
/** Max dt given to loop callbacks, so a hidden tab does not make particles jump. */
const MAX_DT = 0.1;

interface Session {
    alive: boolean;
    disposers: Set<() => void>;
}

function report(message: string, e: unknown) {
    console.error(`[UIScript] ${message}`, e);
}

export class UIScriptRunner {
    private _session: Session | null = null;

    /** Removes the runnable scripts among `scripts` from the DOM, then runs them in order. */
    run(scripts: HTMLScriptElement[], scope: UIScriptScope) {
        const runnable = scripts.filter(script => isRunnable(script, scope.label));
        if (!runnable.length) return;

        const items = runnable.map(script => ({ code: script.textContent || '', el: script.parentElement || scope.root }));
        for (const script of runnable) script.remove();

        const session = this._session || (this._session = { alive: true, disposers: new Set() });
        const file = scope.label.replace(/\s+/g, '_');
        items.forEach((item, i) => execute(item.code, item.el, scope, session, `${file}/script-${i}.js`));
    }

    /** Stops the loops and runs the onDispose callbacks (latest first) of every script run so far. */
    dispose() {
        const session = this._session;
        if (!session) return;
        this._session = null;
        session.alive = false;
        const disposers = Array.from(session.disposers).reverse();
        session.disposers.clear();
        for (const fn of disposers) fn();
    }
}

function isRunnable(script: HTMLScriptElement, label: string): boolean {
    const type = (script.getAttribute('type') || '').trim().toLowerCase();
    if (JS_TYPES.indexOf(type) < 0 && type !== 'module') return false;
    if (script.hasAttribute('src') || type === 'module') {
        warn(`[UIScript] ${label}: <script src> and <script type="module"> are not supported, write the code inline.`);
        return false;
    }
    return true;
}

function execute(code: string, el: HTMLElement, scope: UIScriptScope, session: Session, file: string) {
    const onDispose = (fn: () => void): (() => void) => {
        const entry = () => {
            try {
                fn();
            } catch (e) {
                report(`onDispose callback of ${file} failed:`, e);
            }
        };
        // Registered after disposal (e.g. from a setTimeout): run right away.
        if (!session.alive) {
            entry();
            return () => { };
        }
        session.disposers.add(entry);
        return () => { session.disposers.delete(entry); };
    };

    const loop = (fn: (dt: number) => void): (() => void) => {
        let running = true;
        let frame = 0;
        let last = performance.now();
        let unregister: (() => void) | null = null;
        const stop = () => {
            running = false;
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            if (unregister) unregister();
        };
        const tick = (now: number) => {
            frame = 0;
            // Content wiped without an unmount (e.g. doc.reload() with screens open).
            if (!scope.root.isConnected) return stop();
            const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
            last = now;
            if (scope.doc.enabledInHierarchy) {
                try {
                    fn(dt);
                } catch (e) {
                    report(`loop of ${file} threw and was stopped:`, e);
                    return stop();
                }
            }
            if (running) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        unregister = onDispose(stop);
        return stop;
    };

    try {
        const fn = new Function(...PARAMS, `${code}\n//# sourceURL=${file}`);
        fn(el, scope.root, scope.doc, scope.screen, scope.exports, onDispose, loop);
    } catch (e) {
        report(`${file} failed:`, e);
    }
}
