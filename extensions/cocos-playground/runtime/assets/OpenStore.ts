/**
 * The single, overridable "go to the store" / "game finished" entry points a playable calls. Every
 * ad network has its own real mechanism — `ExitApi.exit()` for Google, `mraid.open(url)` for
 * AppLovin/Unity/Liftoff, `window.gameEnd()` for Mintegral, and so on — with no unified API.
 *
 * So these functions do nothing on their own by design: the export step (next-playground's
 * `lib/playable-export`, for both the pnp and super-html builders) injects a `<script>` before any
 * of the game's own scripts run that assigns `globalThis.__pgOpenStore__` / `__pgGameEnd__` to the
 * channel-specific implementation (super-html's `super_html.download()` / `game_end()` for that
 * network). Game code should never call a network's API directly — always go through here, so the
 * same compiled build behaves correctly no matter which channel it's exported to.
 *
 * Built with the super-html extension itself instead (no next-playground export, so no hooks),
 * they call that build's `window.super_html.download()` / `game_end()` directly.
 */
declare global {
    // eslint-disable-next-line no-var
    var __pgOpenStore__: (() => void) | undefined;
    // eslint-disable-next-line no-var
    var __pgGameEnd__: (() => void) | undefined;
}

/** What the super-html extension's channel script defines on `window` in its own builds. */
interface SuperHtml {
    download?: () => void;
    game_end?: () => void;
}

function superHtml(): SuperHtml | undefined {
    return (globalThis as unknown as { super_html?: SuperHtml }).super_html;
}

export function openStore(): void {
    if (typeof globalThis.__pgOpenStore__ === 'function') {
        globalThis.__pgOpenStore__();
        return;
    }
    const channel = superHtml();
    if (channel && typeof channel.download === 'function') {
        channel.download();
        return;
    }
    console.warn(
        '[cocos-playground] openStore() called with no channel override installed — this is a ' +
            'no-op. It only does something real once exported for a specific ad network (or ' +
            'previewed with a channel selected).',
    );
}

/**
 * Tells the ad network the playable has finished (win/lose/end card). Only some networks act on
 * it — Mintegral (`window.gameEnd()`), Vungle (`postMessage('complete')`), Bigo
 * (`BGY_MRAID.gameEnd()`) — so unlike openStore() a missing override is expected and stays silent.
 */
export function gameEnd(): void {
    if (typeof globalThis.__pgGameEnd__ === 'function') {
        globalThis.__pgGameEnd__();
        return;
    }
    const channel = superHtml();
    if (channel && typeof channel.game_end === 'function') {
        channel.game_end();
    }
}
