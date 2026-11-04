# exporters/ — the dashboard's playable builders, for Sizes

A copy of next-playground's `lib/playable-export` (pnp + super-html), so the panel's **Sizes**
measures a package for an ad network right here instead of on the server. It runs in a child process
of the editor (`dist/estimate-worker.js`, see `connect/estimate.ts`), one network per run.

Copied from next-playground on 2026-11-04. Differences from the original:

- `super-html/sp.ts`: the runtime files are read from `static/exporters/super-html/` (a copy of
  `lib/playable-export/super-html/runtime/`) instead of the app's `process.cwd()`;
- `measure.ts` is extension-only: one network, the way the dashboard's `packNow` packs it;
- the modules the dashboard needs for real exports (`index.ts`, `slot.ts`) are left out.

`playable-adapter-core` is the same vendored cocos-pnp build (`vendor/*.tgz`), and `cheerio` is
pinned to the dashboard's version, so sizes match the dashboard's exports. **When the dashboard's
builders change, copy them over again.**
