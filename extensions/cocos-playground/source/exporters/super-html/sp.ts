import * as fs from 'fs';
import * as path from 'path';
import type { StoreUrls } from '../types';

/*
 * super-html's own channel code, used as-is by both builders. `runtime/sp` is a byte-for-byte copy of
 * the extension's `static/sp` (base64 of a JSON map: path -> file), so updating super-html means
 * copying that one file over. Per network it holds `channel/<name>/script.js` (defines
 * `window.super_html` = { download, game_ready, game_end?, ... }), `meta.html`, `head.js` and
 * `config.json`; plus `common.js`, home of the `super_log` / `super_get_url` / `super_open` the channel
 * scripts call.
 */

/** In the extension: static/exporters/super-html, next to dist/ (this code runs bundled in dist/estimate-worker.js). */
export const SUPER_HTML_RUNTIME_DIR = path.join(__dirname, '..', 'static', 'exporters', 'super-html');
const SP_PATH = path.join(SUPER_HTML_RUNTIME_DIR, 'sp');

let spFiles: Record<string, string> | undefined;

function readSp(): Record<string, string> {
  spFiles ??= JSON.parse(Buffer.from(fs.readFileSync(SP_PATH, 'utf-8'), 'base64').toString('utf-8')) as Record<string, string>;
  return spFiles;
}

export type ChannelFile = 'script.js' | 'meta.html' | 'head.js' | 'config.json';

/** super-html's `_get_channel_script`: the file's content, or '' when the channel has none. */
export function channelFile(channel: string, file: ChannelFile): string {
  return readSp()[`channel/${channel}/${file}`] ?? '';
}

/**
 * super-html's `common.js` defines `super_log`, `super_get_url` and `super_open`, then ends by starting
 * its own loader (`super_load();`). The engine is booted by runtime/common.js instead, so this runs the
 * file as-is minus that last call, inside a function so the rest of it stays private, and publishes
 * the two helpers it declares (`super_log` it already sets on `window` itself).
 */
export function superHtmlHelpersScript(): string {
  const common = readSp()['common.js'].trimEnd();
  const autostart = 'super_load();';
  if (!common.endsWith(autostart)) {
    throw new Error(`super-html's common.js no longer ends with \`${autostart}\`: check lib/playable-export/super-html/runtime/sp`);
  }
  return `(function () {\n${common.slice(0, -autostart.length)}\nwindow.super_get_url = super_get_url;\nwindow.super_open = super_open;\n})();`;
}

/**
 * Only a channel's `window.super_html = {...}` statement (always its script's last one), without the
 * rest of script.js: that rest is super-html's engine start-up (MRAID ready/viewable waits ending in
 * `super_boot_engine()`), for pages whose engine boot belongs to someone else (pnp).
 */
export function channelSuperHtmlObject(channel: string): string {
  const script = channelFile(channel, 'script.js');
  const at = script.lastIndexOf('window.super_html=');
  if (at < 0) throw new Error(`super-html channel "${channel}" defines no window.super_html`);
  return script.slice(at);
}

/**
 * The page's link between the game and the channel: the cocos-playground extension's OpenStore.ts
 * calls `__pgOpenStore__()` / `__pgGameEnd__()`, which go to the channel's own `super_html.download()`
 * / `super_html.game_end()`. Store URLs go where super-html's own setters put them
 * (`super_html_playable.set_google_play_url`), for `super_get_url`. With no channel script (plain
 * HTML outputs, pnp's Rubeex) it's super-html's `super_open`: the store URL for the device.
 *
 * The Application's links always win: each one it has is locked in (a getter, and a setter that
 * ignores writes — not read-only, so a strict-mode game assigning it doesn't throw), so a game
 * calling `set_google_play_url` / `set_app_store_url` (super-html's adapter, often still carrying the
 * demo's Unity test links) can't replace it. A store the Application leaves empty stays the game's.
 */
export function storeBridgeScript(storeUrls: StoreUrls | undefined): string {
  const lines = ['window.super_html = window.super_html || {};'];
  if (storeUrls) {
    const urls = { google_play_url: storeUrls.googleplay_store_url ?? '', appstore_url: storeUrls.apple_store_url ?? '' };
    lines.push(
      `(function (target, urls) {
  Object.keys(urls).forEach(function (key) {
    var url = urls[key];
    if (!url) {
      target[key] = target[key] || '';
      return;
    }
    Object.defineProperty(target, key, { configurable: true, enumerable: true, get: function () { return url; }, set: function () {} });
  });
})(super_html, ${JSON.stringify(urls)});`,
    );
  }
  lines.push(
    'globalThis.__pgOpenStore__ = function () { if (super_html.download) { super_html.download(); } else { super_open(); } };',
    'globalThis.__pgGameEnd__ = function () { if (super_html.game_end) { super_html.game_end(); } };',
  );
  return lines.join('\n');
}

/** For JS source that isn't pure JSON: only the sequence that would end the <script> element. */
export function escapeInlineScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}
