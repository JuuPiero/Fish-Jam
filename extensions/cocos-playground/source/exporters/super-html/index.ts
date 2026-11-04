import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import mime from 'mime-types';
import { fieldOverridesScript } from '../overrides';
import type { ExportArtifact, StoreUrls } from '../types';
import type { SuperHtmlChannel } from './channels';
import { channelFile, escapeInlineScript, storeBridgeScript, superHtmlHelpersScript, SUPER_HTML_RUNTIME_DIR } from './sp';

/*
 * Port of the super-html Cocos Creator extension's build step (dist/core/build.js, run from its
 * `onAfterBuild` hook on web-mobile/web-desktop builds). The channel files themselves (script.js,
 * meta.html, head.js, config.json) and the store-open helpers are super-html's own, unchanged (see
 * sp.ts). Left out on purpose:
 * - its `check()` call, which posts the Cocos account's uid/email/nickname to
 *   http://chungames.cn/api/cocos and, if that server answers, ships the answer as the output HTML
 *   in place of the real build;
 * - the javascript-obfuscator / uglify pass (Cocos release builds are already minified);
 * - the random-digit-in-every-data-URL anti-copy trick (`window.oasjidx`).
 *
 * The page it produces: index.html with CSS inlined and every <script> removed, then a single
 * inline script carrying the channel script, super-html's helpers, our playground bridge, all
 * build files as `window.__res` (path -> text or base64 data URL), and the runtime
 * (cocos3x-adapter.js + common.js) that boots SystemJS against `__res` instead of the network.
 */

// In the extension: static/exporters/super-html (this code runs bundled in dist/estimate-worker.js).
const RUNTIME_DIR = SUPER_HTML_RUNTIME_DIR;

/** Packed as UTF-8 text; everything else becomes a base64 data URL. */
const TEXT_EXTNAMES = new Set([
  '.txt', '.xml', '.vsh', '.fsh', '.atlas', '.tmx', '.tsx', '.json', '.exportjson', '.plist', '.fnt', '.js',
]);
/** Never packed: the page itself and its stylesheets (inlined into it instead). */
const SKIPPED_EXTNAMES = new Set(['.ico', '.html', '.css']);

const STORE_URL_PATTERNS = [
  /https:\/\/play\.google\.com\/store\/apps[a-zA-Z0-9./?=\-_]*/g,
  /https:\/\/apps\.apple\.com\/[a-zA-Z0-9./=\-_]*/g,
];

function readRuntime(relativePath: string): string {
  return fs.readFileSync(path.join(RUNTIME_DIR, relativePath), 'utf-8');
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    });
}

function isRemote(url: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url) || url.startsWith('data:');
}

function toDataUrl(filePath: string): string {
  const type = mime.lookup(filePath) || 'application/octet-stream';
  return `data:${type};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .trim();
}

/** `<` can't close the inline <script> if it never appears literally (JSON-safe escape). */
function toInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** super-html's `_add_meta_to_meta`: right before the page's first <style> (the inlined CSS). */
function insertMeta(html: string, meta: string): string {
  if (!meta) return html;
  const anchor = html.includes('<style>') ? '<style>' : '</head>';
  return html.replace(anchor, () => `${meta}\n${anchor}`);
}

/**
 * super-html's `_add_script_to_head`, which wraps head.js in a <script> before </head>. TikTok's
 * head.js is a `<script src>` tag already, though, and wrapped that is a syntax error that leaves the
 * TikTok SDK unloaded; markup goes in as-is.
 */
function insertHeadScript(html: string, headJs: string): string {
  if (!headJs) return html;
  const tag = headJs.trimStart().startsWith('<')
    ? headJs
    : `<script type="text/javascript">\n${escapeInlineScript(headJs)}\n</script>`;
  return html.replace('</head>', () => `${tag}\n</head>`);
}

/**
 * The same source rewrites super-html applies to every 3.x script, so the engine resolves files
 * against `window.__res` (see runtime/cocos3x-adapter.js for the other side of each one).
 */
function transformScript(key: string, code: string): string {
  // `index.js` bundles are game/user code, which may make genuine network requests.
  if (path.posix.basename(key) !== 'index.js') {
    code = code.replace(/new XMLHttpRequest\b/g, 'new _XMLLocalRequest');
  }
  return (
    code
      .replace(/[A-Za-z$0-9_]*\.createElement\(['"]script['"]\)/g, '_createLocalJSElement()')
      // \b on both sides: super-html's bare /new URL/ also turned `new URLSearchParams` into
      // `new _SUPER_URLSearchParams`, a ReferenceError at runtime.
      .replace(/\bnew URL\b/g, 'new _SUPER_URL')
  );
}

/** The import map moves from `src/import-map.json` into the page, so its relative paths must too. */
function rebaseImportMap(importMap: Record<string, unknown>, fromDir: string): Record<string, unknown> {
  const rebase = (target: unknown) =>
    typeof target === 'string' && (target.startsWith('./') || target.startsWith('../'))
      ? `./${path.posix.normalize(path.posix.join(fromDir, target))}`
      : target;
  const rebaseAll = (map: unknown) =>
    Object.fromEntries(Object.entries((map ?? {}) as Record<string, unknown>).map(([k, v]) => [k, rebase(v)]));

  const result: Record<string, unknown> = { ...importMap };
  if (importMap.imports) result.imports = rebaseAll(importMap.imports);
  if (importMap.scopes) {
    result.scopes = Object.fromEntries(
      Object.entries(importMap.scopes as Record<string, unknown>).map(([scope, map]) => [scope, rebaseAll(map)]),
    );
  }
  return result;
}

interface PreparedBuild {
  /** index.html with CSS inlined, every local <script> removed and the import map inlined. */
  html: string;
  /** Build-relative path -> file content (UTF-8 text, or base64 data URL for binaries). */
  resources: Record<string, string>;
  /** `__res` keys of the page's own <script src> tags, eval'd in this order before the engine. */
  preload: string[];
  /** Store links found in the game's scripts — Unity's review wants them visible in the HTML. */
  embeddedStoreUrls: string[];
}

function prepareBuild(buildDir: string): PreparedBuild {
  const toKey = (fullPath: string) => path.relative(buildDir, fullPath).split(path.sep).join('/');
  const resolveLocal = (fromDir: string, ref: string) => {
    const fullPath = path.resolve(fromDir, ref.split(/[?#]/)[0]);
    return fullPath.startsWith(buildDir + path.sep) && fs.existsSync(fullPath) ? fullPath : undefined;
  };
  const consumed = new Set<string>();

  const $ = cheerio.load(fs.readFileSync(path.join(buildDir, 'index.html'), 'utf-8'));

  $('link[rel="stylesheet"]').each((_, element) => {
    const href = $(element).attr('href');
    const cssPath = href && !isRemote(href) ? resolveLocal(buildDir, href) : undefined;
    if (!cssPath) return;
    const css = fs.readFileSync(cssPath, 'utf-8').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, _quote, ref: string) => {
      const assetPath = isRemote(ref) || ref.startsWith('#') ? undefined : resolveLocal(path.dirname(cssPath), ref);
      if (!assetPath) return match;
      consumed.add(toKey(assetPath));
      return `url(${toDataUrl(assetPath)})`;
    });
    $('head').append(`<style>${minifyCss(css)}</style>\n`);
    consumed.add(toKey(cssPath));
    $(element).remove();
  });

  const preload: string[] = [];
  $('script').each((_, element) => {
    const $script = $(element);
    // super-html's opt-out marker: `<script super-html>` in a custom build template stays as-is.
    if ($script.attr('super-html') !== undefined) return;
    const src = $script.attr('src');
    if (src && isRemote(src)) return;
    const scriptPath = src ? resolveLocal(buildDir, src) : undefined;
    if (src && !scriptPath) {
      throw new Error(`index.html references a script that is not in the build: ${src}`);
    }
    if (scriptPath) {
      const key = toKey(scriptPath);
      const type = $script.attr('type');
      if (type && key.endsWith('.json')) {
        const importMap = rebaseImportMap(JSON.parse(fs.readFileSync(scriptPath, 'utf-8')), path.posix.dirname(key));
        $('body').append(`<script type="${type}">${toInlineJson(importMap)}</script>\n`);
        consumed.add(key);
      } else {
        preload.push(key);
      }
    }
    // Inline scripts go too: the template's `System.import('./index.js')` is the adapter's job now.
    $script.remove();
  });

  $('link[rel="icon"]').remove();
  const html = $.html()
    .replace(/ *<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\n/gm, '');

  const resources: Record<string, string> = {};
  const embeddedStoreUrls = new Set<string>();
  for (const filePath of listFiles(buildDir)) {
    const key = toKey(filePath);
    const extname = path.extname(filePath).toLowerCase();
    if (SKIPPED_EXTNAMES.has(extname) || consumed.has(key)) continue;

    if (extname === '.js') {
      const code = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of STORE_URL_PATTERNS) {
        for (const match of code.match(pattern) ?? []) embeddedStoreUrls.add(match);
      }
      resources[key] = transformScript(key, code);
    } else if (TEXT_EXTNAMES.has(extname)) {
      resources[key] = fs.readFileSync(filePath, 'utf-8');
    } else {
      // Includes .wasm: super-html refuses those outright, but on Cocos 3.8 the engine fetches
      // them via `fetch(new URL(file, import.meta.url))`, which the adapter's fetch hook serves.
      resources[key] = toDataUrl(filePath);
    }
  }

  return { html, resources, preload, embeddedStoreUrls: [...embeddedStoreUrls] };
}

export interface SuperHtmlBuildOptions {
  /** An extracted Cocos Creator 3.x web-mobile build folder. */
  buildDir: string;
  channels: SuperHtmlChannel[];
  fieldValues?: Record<string, unknown>;
  storeUrls?: StoreUrls;
}

export async function buildSuperHtml({ buildDir, channels, fieldValues, storeUrls }: SuperHtmlBuildOptions): Promise<ExportArtifact[]> {
  const build = prepareBuild(path.resolve(buildDir));

  const runtimeScripts = escapeInlineScript(`${readRuntime('cocos3x-adapter.js')};\n${readRuntime('common.js')}`);
  const helpers = escapeInlineScript(superHtmlHelpersScript());
  const bridge = escapeInlineScript(`${fieldOverridesScript(fieldValues)}\n${storeBridgeScript(storeUrls)}`);
  const preload = `window.super_preload = ${toInlineJson(build.preload)};`;

  const inlinePayload = channels.some((channel) => channel.payload === 'inline')
    ? `window.__res = ${toInlineJson(build.resources)};`
    : '';
  let zipPayload = '';
  if (channels.some((channel) => channel.payload === 'compressed')) {
    const zip = new JSZip();
    for (const [key, content] of Object.entries(build.resources)) zip.file(key, content);
    const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    zipPayload = `window.__zip = ${JSON.stringify(base64)};\n${escapeInlineScript(readRuntime('jszip.min.js'))}`;
  }

  // The Application's links win (sp.ts storeBridgeScript): a link found in the game's code only
  // stands in for a store the Application leaves empty.
  const fromGame = build.embeddedStoreUrls.filter((url) =>
    url.startsWith('https://play.google.com/') ? !storeUrls?.googleplay_store_url : !storeUrls?.apple_store_url,
  );
  const storeUrlComments = [...(storeUrls ? [storeUrls.googleplay_store_url, storeUrls.apple_store_url] : []), ...fromGame]
    .filter((url, index, all) => url && all.indexOf(url) === index)
    .map((url) => `<!-- ${url} -->\n`)
    .join('');

  const artifacts: ExportArtifact[] = [];
  for (const channel of channels) {
    const template = channel.template;
    let meta = template ? channelFile(template, 'meta.html') : '';
    if (template === 'unity') meta = storeUrlComments + meta;

    const bodyScript = [
      template ? escapeInlineScript(channelFile(template, 'script.js')) : '',
      helpers,
      `window.super_html_channel = ${JSON.stringify(channel.id)};`,
      preload,
      bridge,
      channel.payload === 'inline' ? inlinePayload : channel.splitRes ? '' : zipPayload,
      runtimeScripts,
    ]
      .filter(Boolean)
      .join(';\n');

    let html = insertMeta(build.html, meta);
    html = insertHeadScript(html, template ? channelFile(template, 'head.js') : '');
    if (channel.splitRes) html = insertMeta(html, "<script src='res.js'></script>");
    html = html.replace('</body>', () => `<script type="text/javascript">\n${bodyScript}\n</script>\n</body>`);

    if (!channel.zip) {
      artifacts.push({ path: `${channel.id}.html`, content: html });
      continue;
    }

    const zip = new JSZip();
    if (channel.splitRes) zip.file('res.js', zipPayload);
    const config = template ? channelFile(template, 'config.json') : '';
    if (config) {
      zip.file('config.json', config);
      const thumbnailName: string | undefined = JSON.parse(config).thumbnailName;
      const thumbnailPath = thumbnailName ? path.join(buildDir, thumbnailName) : '';
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        zip.file(thumbnailName!, fs.readFileSync(thumbnailPath));
      } else if (thumbnailName) {
        console.warn(`[export:super-html] [${channel.id}] ${thumbnailName} not found in the build`);
      }
    }
    zip.file('index.html', html);
    artifacts.push({
      path: `${channel.id}.zip`,
      content: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }),
    });
  }
  return artifacts;
}
