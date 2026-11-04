import type { TChannel } from 'playable-adapter-core';
import { SUPER_HTML_CHANNELS } from './super-html/channels';
import type { PlayableBuilder } from './types';

/*
 * Plain data, safe to import from client components (the builders themselves are server-only).
 */

export const PNP_CHANNELS: readonly TChannel[] = [
  'AppLovin',
  'Facebook',
  'Google',
  'IronSource',
  'Liftoff',
  'Mintegral',
  'Moloco',
  'Pangle',
  'Rubeex',
  'Tiktok',
  'Unity',
];

const MB = 1024 * 1024;

/**
 * Documented size caps, from Luna-Destroyer's network presets (minify-html/src/packer/network.rs,
 * each checked against the network's own docs). Meta's pages disagree (2 MB index.html vs 5 MB zip),
 * so the stricter 2 MB is used. Networks with no confirmed cap aren't checked.
 */
const LIMIT_BY_NETWORK: Record<string, number> = {
  applovin: 5 * MB,
  unity: 5 * MB,
  ironsource: 5 * MB,
  vungle: 5 * MB,
  google: 5 * MB,
  facebook: 2 * MB,
  mintegral: 5 * MB,
  tiktok: 5 * MB,
  pangle: 5 * MB,
};

export interface ChannelOption {
  id: string;
  label: string;
  maxBytes: number | null;
}

/** The network a channel id belongs to: `google_portrait` / `facebook_zip` → `google` / `facebook`, `Facebook` → `facebook`. */
function networkOf(builder: PlayableBuilder, channel: string): string {
  if (builder === 'pnp') return channel.toLowerCase();
  return channel.replace(/_(portrait|landscape|zip)$/, '');
}

export function maxBytesFor(builder: PlayableBuilder, channel: string): number | null {
  return LIMIT_BY_NETWORK[networkOf(builder, channel)] ?? null;
}

export function channelOptions(builder: PlayableBuilder): ChannelOption[] {
  const options =
    builder === 'pnp'
      ? PNP_CHANNELS.map((id) => ({ id, label: id }))
      : SUPER_HTML_CHANNELS.map(({ id, label }) => ({ id, label }));
  return options.map((option) => ({ ...option, maxBytes: maxBytesFor(builder, option.id) }));
}

/**
 * Luna-Destroyer's `sanitize_filename`: anything but letters, digits, `-` and `_` becomes `-`;
 * a name with nothing left falls back to `playable`.
 */
export function safeFileName(name: string): string {
  const cleaned = Array.from(name, (char) => (/[\p{L}\p{N}_-]/u.test(char) ? char : '-')).join('');
  return cleaned.replace(/-/g, '') === '' ? 'playable' : cleaned;
}

/** `<playable>-<channel>.<ext>`, Luna-Destroyer's export download name (channel lowercased). */
export function exportFileName(playableName: string, channel: string, format: 'html' | 'zip'): string {
  return `${safeFileName(playableName)}-${channel.toLowerCase()}.${format}`;
}
