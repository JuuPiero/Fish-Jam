/*
 * super-html engine adapter for Cocos Creator 3.x — readable port of the super-html extension's
 * `cocos/34x.js`. Every file of the web-mobile build lives in `window.__res` (path -> UTF-8 text
 * or base64 data URL); this makes the engine read from there instead of the network:
 *
 * - SystemJS: the build step rewrites `document.createElement("script")` to
 *   `_createLocalJSElement()`, a fake element that evals the module source out of `__res`.
 * - XHR: the build step rewrites `new XMLHttpRequest` to `new _XMLLocalRequest` (except in
 *   `index.js` game bundles, which may make real network calls).
 * - `new URL(...)`: rewritten to `new _SUPER_URL(...)`, which still works when the page itself is
 *   an `about:srcdoc` / `data:` document (common in ad network iframes).
 * - fetch (wasm), images, fonts and videos are hooked at runtime below.
 */

window.super_reg_search = function (pattern) {
  for (var key in window.__res) {
    if (pattern.test(key)) return key;
  }
  return '';
};

window.super_check_channel = function (sdk) {
  if (!sdk) {
    console.error('[super-html] Unable to run, please run on {' + window.super_html_channel + '}');
    return false;
  }
  return true;
};

window._SUPER_URL = function (url, base) {
  if (typeof base === 'string' && (base.indexOf('data:') === 0 || base.indexOf('about:') === 0)) {
    var path = base.replace('data:', '').replace('about:', '');
    var segments = path.split('/');
    return { href: path.replace(segments[segments.length - 1], url) };
  }
  return base === undefined ? new URL(url) : new URL(url, base);
};

window.super_boot_engine = function () {
  /**
   * Maps a requested URL (absolute, `./`-relative, `about:`-relative, ...) to a `__res` key: an
   * exact match, or else the longest key the URL ends with on a path boundary — so
   * `assets/main/index.js` can't be mistaken for the root `index.js`.
   */
  function resolveKey(url) {
    if (!url) return '';
    url = String(url).split('#')[0].split('?')[0];
    var res = window.__res;
    if (Object.prototype.hasOwnProperty.call(res, url)) return url;
    var candidates = [url];
    try {
      var decoded = decodeURI(url);
      if (decoded !== url) candidates.push(decoded);
    } catch (error) {}
    var best = '';
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      for (var key in res) {
        if (key.length <= best.length || candidate.length <= key.length) continue;
        if (candidate.slice(-key.length) !== key) continue;
        var boundary = candidate.charAt(candidate.length - key.length - 1);
        if (boundary === '/' || boundary === ':') best = key;
      }
    }
    return best || url;
  }

  // Unlike super-html, entries stay in `__res` after the first read: it deleted them, which made
  // any second request for the same file (through a differently-spelled URL) come back empty.
  window.getRes = function (url) {
    return window.__res[resolveKey(url)];
  };

  function isDataUrl(value) {
    return typeof value === 'string' && value.indexOf('data:') === 0;
  }

  function mimeOf(value) {
    var match = isDataUrl(value) ? /^data:([^;,]*)/.exec(value) : null;
    return (match && match[1]) || 'text/plain';
  }

  function toArrayBuffer(value) {
    if (!isDataUrl(value)) return new TextEncoder().encode(value).buffer;
    var binary = atob(value.substring(value.indexOf(',') + 1));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function toText(value) {
    return isDataUrl(value) ? new TextDecoder().decode(toArrayBuffer(value)) : value;
  }

  function toBlob(value) {
    return new Blob([toArrayBuffer(value)], { type: mimeOf(value) });
  }

  window._createLocalJSElement = function () {
    var element = document.createElement('_my');
    element.src = '';
    element.addEventListener = function (type, listener) {
      this[type] = listener;
      if (type !== 'load') return;
      setTimeout(function () {
        var key = resolveKey(element.src);
        try {
          super_eval(key);
        } catch (error) {
          console.error('[super-html] failed to evaluate ' + key, error);
          if (element.error) element.error(error);
          return;
        }
        if (window.cc) hookEngine();
        listener();
      });
    };
    return element;
  };

  var engineHooked = false;
  function hookEngine() {
    if (engineHooked) return;
    engineHooked = true;
    var downloader = cc.assetManager.downloader;

    if (cc.internal && cc.internal.VideoPlayerImplManager) {
      var downloadVideo = function (url, options, onComplete) {
        var video = document.createElement('video');
        video.appendChild(document.createElement('source'));
        onComplete(null, video);
      };
      downloader.register({
        '.mp4': downloadVideo,
        '.avi': downloadVideo,
        '.mov': downloadVideo,
        '.mpg': downloadVideo,
        '.mpeg': downloadVideo,
        '.rm': downloadVideo,
        '.rmvb': downloadVideo,
      });
      var getImpl = cc.internal.VideoPlayerImplManager.getImpl;
      cc.internal.VideoPlayerImplManager.getImpl = function (component) {
        var impl = getImpl.call(this, component);
        var createVideoPlayer = impl.createVideoPlayer;
        impl.createVideoPlayer = function (url) {
          var data = getRes(url);
          return createVideoPlayer.call(this, data ? URL.createObjectURL(toBlob(data)) : url);
        };
        return impl;
      };
    }

    // Channels that report the ad's mute state (super_html.is_audio) gate audio playback on it.
    try {
      if (window.super_html && super_html.is_audio && cc.AudioSourceComponent) {
        var play = cc.AudioSourceComponent.prototype.play;
        cc.AudioSourceComponent.prototype.play = function () {
          if (!super_html.is_audio()) {
            window.super_music_ins = [this];
            return;
          }
          play.call(this);
        };
        var playOneShot = cc.AudioSourceComponent.prototype.playOneShot;
        cc.AudioSourceComponent.prototype.playOneShot = function (clip, volume) {
          if (!super_html.is_audio()) return;
          playOneShot.call(this, clip, volume);
        };
      }
    } catch (error) {
      console.log(error);
    }

    var downloadFont = function (url, options, onComplete) {
      var family = url.replace(/[./ "']*/g, '');
      var data = getRes(url);
      if (data == null) {
        onComplete();
        return;
      }
      var face = new FontFace(family, 'url(' + data + ')');
      document.fonts.add(face);
      face.load();
      face.loaded.then(
        function () {
          onComplete(null, family);
        },
        function () {
          console.error('[super-html] font ' + url + ' load fail');
          onComplete(null, family);
        },
      );
    };
    downloader.register({
      '.font': downloadFont,
      '.eot': downloadFont,
      '.ttf': downloadFont,
      '.woff': downloadFont,
      '.svg': downloadFont,
      '.ttc': downloadFont,
    });

    var downloadImage = function (url, options, onComplete) {
      var image = new Image();
      function cleanup() {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      }
      function onLoad() {
        cleanup();
        if (onComplete) onComplete(null, image);
      }
      function onError() {
        cleanup();
        if (onComplete) onComplete(new Error('[super-html] failed to load image ' + url));
      }
      image.addEventListener('load', onLoad);
      image.addEventListener('error', onError);
      image.src = getRes(url) || url;
      return image;
    };
    downloader.register({
      '.png': downloadImage,
      '.jpg': downloadImage,
      '.bmp': downloadImage,
      '.jpeg': downloadImage,
      '.gif': downloadImage,
      '.webp': downloadImage,
      '.ico': downloadImage,
      '.tiff': downloadImage,
      '.image': downloadImage,
    });
  }

  // fetch: the engine loads .wasm through `fetch(new URL(file, import.meta.url))`. A real Response
  // (rather than super-html's bare `{ arrayBuffer }` stub) also covers `.json()`/`.text()`/`.ok`.
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var data = getRes(url);
    if (data == null) {
      return nativeFetch ? nativeFetch.call(window, input, init) : Promise.reject(new Error('fetch unavailable: ' + url));
    }
    super_log('fetch ' + url);
    return Promise.resolve(
      new Response(toArrayBuffer(data), { status: 200, headers: { 'Content-Type': mimeOf(data) } }),
    );
  };

  function LocalXMLHttpRequest() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.response = null;
    this.responseText = '';
    this.responseType = '';
    this.timeout = 0;
    this.withCredentials = false;
  }
  LocalXMLHttpRequest.prototype.open = function (method, url) {
    this.url = url;
    this.readyState = 1;
  };
  LocalXMLHttpRequest.prototype.setRequestHeader = function () {};
  LocalXMLHttpRequest.prototype.overrideMimeType = function () {};
  LocalXMLHttpRequest.prototype.abort = function () {};
  LocalXMLHttpRequest.prototype.getAllResponseHeaders = function () {
    return '';
  };
  LocalXMLHttpRequest.prototype.getResponseHeader = function () {
    return null;
  };
  LocalXMLHttpRequest.prototype.addEventListener = function (type, listener) {
    this['on' + type] = listener;
  };
  LocalXMLHttpRequest.prototype.removeEventListener = function (type) {
    this['on' + type] = null;
  };
  LocalXMLHttpRequest.prototype.send = function () {
    var request = this;
    var data = getRes(this.url);
    setTimeout(function () {
      function fire(type) {
        var handler = request['on' + type];
        if (typeof handler === 'function') handler.call(request, { type: type, target: request });
      }
      request.readyState = 4;
      if (data == null) {
        request.status = 404;
        console.error('[super-html] resource not found: ' + request.url);
        fire('readystatechange');
        fire('error');
        fire('loadend');
        return;
      }
      try {
        switch (request.responseType) {
          case 'json':
            request.response = JSON.parse(toText(data));
            break;
          case 'arraybuffer':
            request.response = toArrayBuffer(data);
            break;
          case 'blob':
            request.response = toBlob(data);
            break;
          default:
            request.response = request.responseText = toText(data);
        }
      } catch (error) {
        console.error('[super-html] failed to decode ' + request.url, error);
        request.status = 500;
        fire('readystatechange');
        fire('error');
        fire('loadend');
        return;
      }
      request.status = 200;
      request.statusText = 'OK';
      fire('readystatechange');
      fire('load');
      fire('loadend');
    });
  };
  window._XMLLocalRequest = LocalXMLHttpRequest;

  var entry = super_reg_search(/^index[a-zA-Z0-9.]*\.js$/);
  System.import('./' + entry).catch(function (error) {
    console.error(error);
  });
};
