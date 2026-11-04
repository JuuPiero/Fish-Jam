/*
 * super-html bootstrap — readable port of the loader half of the super-html Cocos Creator extension's
 * `common.js` (https://store.cocos.com/app/detail/3657). Runs last in the page's single inline
 * <script>, after:
 *   1. the channel script (defines `window.super_html` = { download, game_ready, game_end, ... }),
 *   2. super-html's own `common.js` helpers, unchanged (`super_log`, `super_get_url`, `super_open`;
 *      see sp.ts),
 *   3. the playground bridge (field overrides, store URLs, `__pgOpenStore__`),
 *   4. the resource payload (`window.__res` as plain JSON, or `window.__zip` + JSZip),
 *   5. cocos3x-adapter.js (defines `super_boot_engine`).
 */

/** Evaluates a script resource in global scope (like a <script> tag would), then frees it. */
function super_eval(key) {
  var code = window.__res[key];
  if (!code) return;
  delete window.__res[key];
  (0, eval)(code);
}

function super_load() {
  window.__res = window.__res || {};
  if (!window.__zip || !window.JSZip) {
    super_boot();
    return;
  }
  JSZip.loadAsync(window.__zip, { base64: true })
    .then(function (zip) {
      var names = Object.keys(zip.files).filter(function (name) {
        return !zip.files[name].dir;
      });
      return Promise.all(
        names.map(function (name) {
          return zip
            .file(name)
            .async('string')
            .then(function (content) {
              window.__res[name] = content;
            });
        }),
      );
    })
    .then(
      function () {
        delete window.__zip;
        super_boot();
      },
      function (error) {
        console.error('[super-html] failed to unpack resources', error);
      },
    );
}

function super_boot() {
  // The build's own <script src> tags (polyfills, SystemJS), in their original document order.
  // super-html relied on object key order here, which isn't stable once resources come out of
  // JSZip asynchronously — so the order is passed explicitly instead.
  (window.super_preload || []).forEach(super_eval);

  try {
    if (!window.VConsole) {
      var vconsoleKey = super_reg_search(/vconsole\.min/);
      if (vconsoleKey) super_eval(vconsoleKey);
    }
    if (window.VConsole) {
      super_log('load VConsole');
      window.vConsole = new VConsole();
    }
  } catch (error) {
    super_log('error ' + error.message);
  }

  if (window.super_html) {
    if (!super_html.is_hide_download) {
      super_html.is_hide_download = function () {
        return false;
      };
    }
    if (!super_html.game_end) {
      super_html.game_end = function () {
        super_log('game end');
      };
    }
  }

  // The channel decides when the engine may start (e.g. only once the MRAID ad is viewable).
  if (window.super_html && super_html.game_ready) {
    super_html.game_ready();
  } else {
    super_boot_engine();
  }
}

super_load();
