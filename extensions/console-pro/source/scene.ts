/**
 * Scene script of Console Pro. Cocos loads it in the edit scene process and in the
 * Play-in-Editor (PIE) process. It sends small batches over one fixed message
 * (`console-pro` / `scene-events`); it never evaluates code it receives.
 *
 * Every line already reaches Cocos' log hub (and so Console Pro) without this script.
 * It only adds what the hub does not say:
 * - which process a line came from: each console call is reported as
 *   {level, first words, time}, and the main process pairs it with the hub's record
 *   (the call itself still goes to Cocos' console unchanged);
 * - uncaught errors and unhandled promise rejections (window events);
 * - the PIE play state (Clear on Play, Error Pause).
 */
import { callHead } from './shared/tags';
import { Level, SceneBatch } from './shared/types';

const PKG = 'console-pro';
const METHODS: Level[] = ['log', 'info', 'warn', 'error'];

type AnyMap = Record<string, any>;

const g = globalThis as AnyMap;
const SOURCE: 'scene' | 'game' = g.isPreviewProcess ? 'game' : 'scene';

const S = {
    calls: [] as NonNullable<SceneBatch['calls']>,
    errors: [] as NonNullable<SceneBatch['errors']>,
    play: null as SceneBatch['play'] | null,
    lastPlay: '',
    timer: 0 as any,
    poll: 0 as any,
    restore: [] as (() => void)[],
    consoleRestore: [] as (() => void)[],
    consoleWrapped: false,
    /** Set by the PreviewPlay.start / stop wrappers (more reliable than polling the state). */
    startStop: null as boolean | null,
};

function send(batch: SceneBatch): void {
    try {
        if (g.Editor && g.Editor.Message && g.Editor.Message.send) g.Editor.Message.send(PKG, 'scene-events', batch);
    } catch (e) {
        // no editor messaging in this process
    }
}

function flush(): void {
    S.timer = 0;
    const batch: SceneBatch = { source: SOURCE };
    if (S.calls.length) batch.calls = S.calls.splice(0, S.calls.length);
    if (S.errors.length) batch.errors = S.errors.splice(0, S.errors.length);
    if (S.play) {
        batch.play = S.play;
        S.play = null;
    }
    if (batch.calls || batch.errors || batch.play) send(batch);
}

function queue(now = false): void {
    if (now) {
        if (S.timer) clearTimeout(S.timer);
        flush();
        return;
    }
    if (!S.timer) S.timer = setTimeout(flush, 40);
}

// ------------------------------------------------------------------ console calls

function wrapConsole(): void {
    if (S.consoleWrapped) return;
    const c: AnyMap = console;
    METHODS.forEach((level) => {
        const orig = c[level];
        if (typeof orig !== 'function') return;
        const wrapper = function (this: any) {
            try {
                S.calls.push({ level, head: callHead(Array.prototype.slice.call(arguments, 0, 1)), t: Date.now() });
                if (S.calls.length > 5000) S.calls.splice(0, S.calls.length - 5000);
                queue();
            } catch (e) {
                // never break the call itself
            }
            return orig.apply(this === undefined ? console : this, arguments as any);
        };
        c[level] = wrapper;
        S.consoleRestore.push(() => {
            // only when nobody wrapped on top of ours since
            if (c[level] === wrapper) c[level] = orig;
        });
    });
    S.consoleWrapped = true;
}

function unwrapConsole(): void {
    S.consoleRestore.splice(0).forEach((fn) => {
        try {
            fn();
        } catch (e) {
            // already gone
        }
    });
    S.consoleWrapped = false;
}

// ------------------------------------------------------------------ uncaught errors

function onError(ev: any): void {
    // resource load errors (img/script elements) are not ErrorEvents: skip them
    if (!ev || typeof ev.message !== 'string') return;
    const err = ev.error;
    let stack = err && err.stack ? String(err.stack) : '';
    if (!stack && ev.filename) stack = '    at ' + ev.filename + ':' + (ev.lineno || 0) + ':' + (ev.colno || 0);
    S.errors.push({ message: String(ev.message).replace(/^Uncaught\s+/, ''), stack, t: Date.now(), kind: 'error' });
    queue();
}

function onRejection(ev: any): void {
    const r = ev && ev.reason;
    const message = r && r.message ? String(r.message) : String(r);
    S.errors.push({ message, stack: r && r.stack ? String(r.stack) : '', t: Date.now(), kind: 'rejection' });
    queue();
}

// ------------------------------------------------------------------ play state (PIE process only)

function previewPlay(): AnyMap | null {
    const cce = g.cce;
    return (cce && cce.PreviewPlay) || null;
}

function stateSaysPlaying(pp: AnyMap): boolean {
    const st = pp._state;
    if (typeof st === 'number') return st > 0;
    if (typeof st !== 'string' || !st) return false;
    return !/^(stop|stopped|none|idle|init|ready)$/i.test(st);
}

function reportPlay(now = false): void {
    const pp = previewPlay();
    if (!pp) return;
    let playing = S.startStop !== null ? S.startStop : stateSaysPlaying(pp);
    let paused = false;
    try {
        paused = playing && typeof pp.isPause === 'function' ? !!pp.isPause() : false;
    } catch (e) {
        paused = false;
    }
    const key = playing + '/' + paused;
    if (key === S.lastPlay) return;
    S.lastPlay = key;
    S.play = { playing, paused, t: Date.now() };
    queue(now);
}

function hook(obj: AnyMap, key: string, make: (orig: any) => any): void {
    const orig = obj[key];
    if (typeof orig !== 'function') return;
    const wrapped = make(orig);
    obj[key] = wrapped;
    S.restore.push(() => {
        if (obj[key] === wrapped) obj[key] = orig;
    });
}

let wrappedPreview: AnyMap | null = null;

/** Play start is reported before the game runs a frame, so Clear on Play never eats the game's first lines. */
function wrapPreviewPlay(): void {
    const pp = previewPlay();
    if (!pp || pp === wrappedPreview) return;
    wrappedPreview = pp;
    hook(pp, 'start', (orig) => function (this: any) {
        S.startStop = true;
        reportPlay(true);
        return orig.apply(this, arguments as any);
    });
    hook(pp, 'stop', (orig) => function (this: any) {
        const r = orig.apply(this, arguments as any);
        Promise.resolve(r).then(
            () => {
                S.startStop = false;
                reportPlay(true);
            },
            () => undefined
        );
        return r;
    });
}

// ------------------------------------------------------------------ lifecycle

export function load(): void {
    wrapConsole();
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        S.restore.push(() => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        });
    }
    try {
        Promise.resolve(g.Editor.Message.request(PKG, 'get-config'))
            .then((cfg: AnyMap) => {
                if (cfg && cfg.sceneHook === false) unwrapConsole();
            })
            .catch(() => undefined);
    } catch (e) {
        // keep the defaults
    }
    if (SOURCE === 'game') {
        wrapPreviewPlay();
        reportPlay();
        S.poll = setInterval(() => {
            wrapPreviewPlay();
            reportPlay();
        }, 250);
    }
}

export function unload(): void {
    if (S.poll) clearInterval(S.poll);
    if (S.timer) clearTimeout(S.timer);
    flush();
    unwrapConsole();
    S.restore.splice(0).forEach((fn) => {
        try {
            fn();
        } catch (e) {
            // already gone
        }
    });
}

export const methods: Record<string, (...args: any[]) => any> = {
    /** Read-only state of this process (diagnostics). */
    cpState() {
        const pp = previewPlay();
        return { source: SOURCE, consoleWrapped: S.consoleWrapped, previewState: pp ? String(pp._state) : null, startStop: S.startStop };
    },
};
