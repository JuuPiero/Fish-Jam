/**
 * - `pnp`: playable-adapter-core — our cocos-pnp build (vendor/README.md). Handles WebAssembly
 *   builds, in the networks' preview frames too; each network gets that build's `super_html`
 *   runtime (pnp/runtime.ts).
 * - `super-html`: a port of the super-html Cocos Creator extension's build step, with its channel
 *   files unchanged: each network's own CTA/lifecycle glue (`super_html.download()`, MRAID
 *   viewability, ...).
 */
export type PlayableBuilder = 'pnp' | 'super-html';

export const PLAYABLE_BUILDERS: readonly PlayableBuilder[] = ['pnp', 'super-html'];

/** Same shape the Rust backend already sends to the old export service. */
export interface StoreUrls {
  googleplay_store_url: string;
  apple_store_url: string;
}

export interface ExportPlayableRequest {
  builder: PlayableBuilder;
  /** Zip of a Cocos Creator 3.x web-mobile build: `index.html` at the root or under one folder. */
  buildZip: Buffer;
  channels: string[];
  /** `@playGroundField` values, applied by PlayGroundField.ts before each component's onLoad. */
  fieldValues?: Record<string, unknown>;
  /** Where the field files those values reference are stored (`<sha256>.<ext>`). */
  fieldFilesDir?: string;
  storeUrls?: StoreUrls;
  /** The playable's name: pnp names its outputs inside after it (Mintegral's folder and page). */
  name?: string;
}

/** One file of the export result, at `path` inside the returned zip. */
export interface ExportArtifact {
  path: string;
  content: Buffer | string;
}
