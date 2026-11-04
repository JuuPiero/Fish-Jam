import type { TChannel } from 'playable-adapter-core';

/*
 * Each network's `window.super_html` runtime, as our cocos-pnp build injects it (vendor/README.md;
 * cocos-pnp packages/playable-adapter-core/src/channels/runtime-scripts.ts, copied unchanged). It is
 * what passes the networks' preview tools and checkers: MRAID ready and resize handling for Unity,
 * the callbacks Mintegral looks for, the IronSource DAPI and so on. pnp leaves it out for a channel
 * that `injectOptions` configures, and ours always does (for the field overrides), so it comes
 * along in our own script instead. Keep it in step with cocos-pnp.
 */

const PRELUDE = `function super_log(){try{console.log.apply(console,["[super-html]"].concat([].slice.call(arguments)))}catch(e){}}`;

const GAME_END = `game_end:function(){super_log("game end")}`;
const NOT_HIDE_DOWNLOAD = `is_hide_download:function(){return false}`;

const api = (download: string, gameReady = '', gameEnd = GAME_END, extra = '') =>
  `window.super_html={download:function(){super_log("game download");${download}},game_ready:function(){super_log("game ready");${gameReady}},${gameEnd},${NOT_HIDE_DOWNLOAD}${extra}};`;

const MRAID = api(`window.mraid?mraid.open():window.open(arguments[0],"_blank")`);
const FB = api(`window.FbPlayableAd&&FbPlayableAd.onCTAClick()`);
const OPEN_APP_STORE = api(`window.openAppStore&&window.openAppStore()`);

// super-html reports "game ready" itself once the engine boots; games do not call it. Report once
// on page load, and ignore later calls.
const AUTO_READY = `(function(){var s=window.super_html,r=s.game_ready,done=false;s.game_ready=function(){if(done)return;done=true;r.apply(s,arguments)};window.addEventListener("load",function(){s.game_ready()})})();`;

const SCRIPTS: Record<TChannel, string> = {
  AppLovin: MRAID,
  Liftoff: MRAID,
  Facebook: `try{navigator.getGamepads=null}catch(e){}${FB}`,
  Moloco: FB,
  Google: api(`window.ExitApi&&ExitApi.exit()`),
  IronSource:
    `var super_is_audio=false;` +
    `function super_dapi_ready(){dapi.removeEventListener("ready",super_dapi_ready);super_is_audio=!!dapi.getAudioVolume();dapi.addEventListener("audioVolumeChange",function(v){super_is_audio=!!v})}` +
    `window.addEventListener("load",function(){if(!window.dapi)return;dapi.isReady()?super_dapi_ready():dapi.addEventListener("ready",super_dapi_ready)});` +
    api(
      `window.dapi&&dapi.openStoreUrl&&dapi.openStoreUrl()`,
      '',
      `game_end:function(){super_log("game end");window.gameEnd&&window.gameEnd()}`,
      `,is_audio:function(){return super_is_audio}`,
    ),
  Mintegral:
    // Callbacks the platform invokes (and its checker looks for).
    `window.gameStart=function(){super_log("game start")};window.gameClose=function(){super_log("game close")};` +
    api(
      `window.install&&window.install()`,
      `window.gameReady&&window.gameReady()`,
      `game_end:function(){super_log("game end");window.gameEnd&&window.gameEnd()}`,
      `,game_retry:function(){super_log("game retry");window.gameRetry&&window.gameRetry()}`,
    ),
  Pangle: OPEN_APP_STORE,
  Tiktok: OPEN_APP_STORE,
  Rubeex: api(`var f=window.openAppStore||window.install;f&&f()`),
  Unity:
    // Unity's checker looks for an MRAID ready handler and resize handling.
    `function super_mraid_ready(){super_log("mraid ready");mraid.addEventListener("viewableChange",function(v){super_log("viewable",v)})}` +
    `window.addEventListener("load",function(){if(!window.mraid)return;mraid.getState()==="loading"?mraid.addEventListener("ready",super_mraid_ready):super_mraid_ready()});` +
    `function super_on_resize(){super_log("resize")}window.addEventListener("resize",super_on_resize);window.addEventListener("orientationchange",super_on_resize);` +
    api(
      `var android=/android/i.test(navigator.userAgent||navigator.vendor);` +
        `var url=android?super_html.google_play_url:super_html.appstore_url;` +
        `if(!url)console.error("[super-html] not set "+(android?"google_play_url":"appstore_url"));` +
        `window.mraid?mraid.open(url):window.open(url,"_blank")`,
    ),
};

/** The channel's runtime, as plain script (no <script> tag); '' for a channel cocos-pnp has none for. */
export function pnpRuntimeScript(channel: TChannel): string {
  const script = SCRIPTS[channel];
  return script ? `${PRELUDE}${script}${AUTO_READY}` : '';
}
