import * as fs from 'fs';
import * as path from 'path';
import { exec3xAdapter, type TAdapterRC, type TChannel } from 'playable-adapter-core';
import { fieldOverridesScript } from '../overrides';
import { escapeInlineScript, storeBridgeScript, superHtmlHelpersScript } from '../super-html/sp';
import type { ExportArtifact, StoreUrls } from '../types';
import { pnpRuntimeScript } from './runtime';

/*
 * playable-adapter-core is our cocos-pnp build (vendor/README.md): pnp loads each network's SDK,
 * gives the page that network's `window.super_html` runtime (`download()` / `game_end()`, the
 * lifecycle hooks its checker looks for) and works with WebAssembly builds in the networks' preview
 * frames.
 */

/**
 * What runs before the game: the network's runtime (runtime.ts — pnp's own, which it leaves out
 * because `injectOptions` configures the channel), then the playground bridge (the Application's
 * store links locked in, `__pgOpenStore__` / `__pgGameEnd__` for OpenStore.ts).
 */
function storeScript(channel: TChannel, storeUrls: StoreUrls | undefined): string {
  return [
    // super-html's super_open: the bridge's fallback for a channel without `download()`.
    superHtmlHelpersScript(),
    pnpRuntimeScript(channel),
    storeBridgeScript(storeUrls),
    'if (!super_html.is_hide_download) { super_html.is_hide_download = function () { return false; }; }',
    "if (!super_html.game_end) { super_html.game_end = function () { super_log('game end'); }; }",
  ]
    .filter(Boolean)
    .join(';\n');
}

/**
 * Unity's checker looks for the store links in the page; pnp writes them as comments only for a
 * channel `injectOptions` doesn't configure, so they go in here: the Application's links.
 */
function withStoreComments(html: string, storeUrls: StoreUrls | undefined): string {
  const urls = [storeUrls?.googleplay_store_url, storeUrls?.apple_store_url].filter((url): url is string => !!url);
  if (!urls.length) return html;
  const comments = urls.map((url) => `<!-- ${url.replace(/--/g, '%2D%2D')} -->`).join('\n');
  return html.replace(/<\/head>/i, (head) => `\n${comments}\n${head}`);
}

/**
 * Where pnp left a channel's output: `<build name>/<build name>_<Channel>.html`, or `.zip` for the
 * networks that take a zip (folder-style ones, Google, Mintegral's `<name>/<name>.html`).
 */
function findOutput(workDir: string, channel: TChannel): string | null {
  for (const folder of fs.readdirSync(workDir, { withFileTypes: true })) {
    if (!folder.isDirectory() || folder.name === 'web-mobile') continue;
    for (const file of fs.readdirSync(path.join(workDir, folder.name))) {
      if (/^(?:.*_)?([A-Za-z]+)\.(html|zip)$/.exec(file)?.[1] === channel) return path.join(workDir, folder.name, file);
    }
  }
  return null;
}

interface PnpExportOptions {
  /** Folder containing `web-mobile/` (see extractWebMobileBuild); pnp writes its output here too. */
  workDir: string;
  channels: TChannel[];
  fieldValues?: Record<string, unknown>;
  storeUrls?: StoreUrls;
  /** Names the outputs inside (Mintegral's folder and page); `playable` without one. */
  buildName?: string;
}

/**
 * Runs playable-adapter-core's 3.x export for the requested channels and returns each channel's
 * deliverable as `<Channel>.html` or `<Channel>.zip`.
 *
 * Our script goes in through `injectOptions[channel].body` — pnp's own extension point (its
 * `src/helpers/dom.ts:injectFromRCJson`), which places it right before the adapter's bootstrap
 * scripts, so `window.__pgvo__` / `__pgOpenStore__` / `__pgGameEnd__` exist before any game code runs.
 */
async function runPnpExport({ workDir, channels, fieldValues, storeUrls, buildName }: PnpExportOptions): Promise<ExportArtifact[]> {
  const injectOptions = {} as NonNullable<TAdapterRC['injectOptions']>;
  for (const channel of channels) {
    // Installed even without store URLs: most networks resolve the destination themselves.
    const script = `${fieldOverridesScript(fieldValues)}\n${storeScript(channel, storeUrls)}`;
    injectOptions[channel] = { head: '', body: `<script>${escapeInlineScript(script)}</script>`, sdkScript: '' };
  }

  await exec3xAdapter(
    {
      buildFolderPath: workDir,
      buildName: buildName?.trim() || 'playable',
      adapterBuildConfig: { exportChannels: channels, injectOptions, tinify: false },
    },
    { mode: 'serial' },
  );

  const artifacts: ExportArtifact[] = [];
  for (const channel of channels) {
    const output = findOutput(workDir, channel);
    if (!output) {
      console.warn(`[export:pnp] channel "${channel}" produced no output in ${workDir}`);
      continue;
    }
    const extension = path.extname(output);
    const content = fs.readFileSync(output);
    artifacts.push({
      path: `${channel}${extension}`,
      content: channel === 'Unity' && extension === '.html' ? Buffer.from(withStoreComments(content.toString('utf8'), storeUrls), 'utf8') : content,
    });
  }
  return artifacts;
}

// playable-adapter-core keeps its build config on a single process-global (see
// `mountGlobalVars`/`unmountGlobalVars` in its src/global.ts) and silently no-ops a mount while
// one is already active, so concurrent exports would corrupt each other's config. Every pnp export
// in this process goes through one queue.
let pnpQueue: Promise<unknown> = Promise.resolve();

export function runPnpExportSerialized(options: PnpExportOptions): Promise<ExportArtifact[]> {
  const result = pnpQueue.then(() => runPnpExport(options));
  pnpQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
