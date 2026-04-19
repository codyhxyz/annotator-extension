/**
 * Canonicalizes a URL for pending-notes queue matching. Rules:
 * - Lowercase scheme and host
 * - Strip trailing slash from pathname (keep bare '/')
 * - Drop fragment
 * - Keep query string verbatim (sites care about order)
 * Invalid URLs are returned unchanged — caller decides whether to reject.
 *
 * Not the same as `annotator-v2/src/utils/normalizeUrl.ts`. That one is
 * the extension's page-identity key: it strips tracking params, sorts
 * query keys, and keeps the fragment (SPAs route on it). This one must
 * preserve whatever Claude emits verbatim so the Handoff queue key
 * matches the exact URL the browser is about to navigate to. Do not
 * merge without reconciling those two goals — they pull opposite ways.
 */
export function canonicalizeUrl(input: string): string {
  let u: URL;
  try { u = new URL(input); } catch { return input; }
  u.hash = '';
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}
