/**
 * How the build's resources travel inside the page:
 * - `inline`: plain `window.__res = {...}` JSON. Biggest file, no JSZip needed at runtime.
 * - `compressed`: one DEFLATE zip, base64'd into `window.__zip`, unpacked by JSZip on load.
 */
export type SuperHtmlPayloadMode = 'inline' | 'compressed';

export interface SuperHtmlChannel {
  id: string;
  label: string;
  /** super-html's `channel/<template>/` files (see sp.ts); none for the generic HTML outputs. */
  template?: string;
  payload: SuperHtmlPayloadMode;
  /** Deliver as `<id>.zip` (index.html + config.json + ...) instead of a single `<id>.html`. */
  zip?: boolean;
  /** Zip only: move the compressed payload into `res.js` next to index.html. */
  splitRes?: boolean;
}

/**
 * super-html's own channel table (core/build.js `inject_channel_adapter`), one entry per output.
 * IronSource is its MRAID template, `ironsource2025`; the older DAPI `ironsource` one is no longer
 * in its table.
 */
export const SUPER_HTML_CHANNELS: readonly SuperHtmlChannel[] = [
  { id: 'html', label: 'HTML', payload: 'inline' },
  { id: 'html_min', label: 'HTML (compressed)', payload: 'compressed' },
  { id: 'applovin', label: 'AppLovin', template: 'applovin', payload: 'compressed' },
  { id: 'ironsource', label: 'IronSource', template: 'ironsource2025', payload: 'compressed' },
  { id: 'mintegral', label: 'Mintegral', template: 'mintegral', payload: 'inline', zip: true },
  { id: 'unity', label: 'Unity', template: 'unity', payload: 'compressed' },
  { id: 'chartboost', label: 'Chartboost', template: 'chartboost', payload: 'compressed' },
  { id: 'google', label: 'Google', template: 'google', payload: 'compressed', zip: true },
  { id: 'google_portrait', label: 'Google (portrait)', template: 'google_portrait', payload: 'compressed', zip: true },
  { id: 'google_landscape', label: 'Google (landscape)', template: 'google_landscape', payload: 'compressed', zip: true },
  { id: 'facebook', label: 'Facebook', template: 'facebook', payload: 'compressed' },
  { id: 'facebook_zip', label: 'Facebook (zip)', template: 'facebook', payload: 'compressed', zip: true, splitRes: true },
  { id: 'pangle', label: 'Pangle', template: 'pangle', payload: 'inline', zip: true },
  { id: 'pangle_portrait', label: 'Pangle (portrait)', template: 'pangle_portrait', payload: 'inline', zip: true },
  { id: 'pangle_landscape', label: 'Pangle (landscape)', template: 'pangle_landscape', payload: 'inline', zip: true },
  { id: 'liftoff', label: 'Liftoff', template: 'liftoff', payload: 'inline', zip: true },
  { id: 'moloco', label: 'Moloco', template: 'moloco', payload: 'compressed' },
  { id: 'tiktok', label: 'TikTok', template: 'tiktok', payload: 'inline', zip: true },
  { id: 'vungle', label: 'Vungle', template: 'vungle', payload: 'inline', zip: true },
  { id: 'bigo', label: 'Bigo', template: 'bigo', payload: 'inline', zip: true },
  { id: 'kwai', label: 'Kwai', template: 'kwai', payload: 'inline', zip: true },
  { id: 'nefta', label: 'Nefta', template: 'nefta', payload: 'compressed' },
  { id: 'nefta_zip', label: 'Nefta (zip)', template: 'nefta', payload: 'inline', zip: true },
  { id: 'snapchat', label: 'Snapchat', template: 'snapchat', payload: 'compressed', zip: true },
  { id: 'gdt', label: 'Tencent GDT', template: 'gdt', payload: 'compressed', zip: true },
  { id: 'gdt_portrait', label: 'Tencent GDT (portrait)', template: 'gdt_portrait', payload: 'compressed', zip: true },
  { id: 'gdt_landscape', label: 'Tencent GDT (landscape)', template: 'gdt_landscape', payload: 'compressed', zip: true },
  { id: 'news_break', label: 'NewsBreak', template: 'news_break', payload: 'compressed' },
  { id: 'inmobi', label: 'InMobi', template: 'inmobi', payload: 'compressed' },
  { id: 'yandex', label: 'Yandex', template: 'yandex', payload: 'compressed', zip: true, splitRes: true },
];
