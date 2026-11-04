/**
 * `window.__pgvo__`: the `@playGroundField` overrides, read by the Cocos extension's
 * PlayGroundField.ts right before each component's own onLoad. Base64 of UTF-8 JSON — not real
 * security, it only keeps field names/values out of a casual view-source.
 */
export function fieldOverridesScript(fieldValues: Record<string, unknown> | undefined): string {
  const encoded = Buffer.from(JSON.stringify(fieldValues ?? {}), 'utf-8').toString('base64');
  return `window.__pgvo__ = ${JSON.stringify(encoded)};`;
}
