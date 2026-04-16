/**
 * Canonical page identity.
 *
 * Two URLs that a human would consider "the same page" should produce the
 * same key. Normalization is lossy on purpose: we strip tracking params,
 * sort remaining query params, lowercase the host, drop default ports,
 * and drop trailing slashes. The fragment is preserved — SPAs route on it
 * (`app.example.com/#/inbox` vs `.../#/archive` are different pages).
 *
 * Callers should use this for every Dexie lookup and every annotation
 * write. Display copy should use the original href.
 */

const TRACKING_PARAM_PREFIXES = ['utm_', 'ref_'];
const TRACKING_PARAM_EXACT = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'mc_cid', 'mc_eid', 'yclid', '_ga', '_gl',
  'ref', 'source', 'ref_src',
  'igshid', 'vero_id', 'vero_conv',
  'hsCtaTracking', '_hsenc', '_hsmi',
  'mkt_tok',
]);

function isTrackingParam(name: string): boolean {
  if (TRACKING_PARAM_EXACT.has(name)) return true;
  for (const prefix of TRACKING_PARAM_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);

    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === 'http:' && u.port === '80') ||
      (u.protocol === 'https:' && u.port === '443')
    ) {
      u.port = '';
    }

    const params = new URLSearchParams();
    const keys: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (!isTrackingParam(k)) keys.push(k);
    });
    keys.sort();
    for (const k of keys) {
      for (const v of u.searchParams.getAll(k)) {
        params.append(k, v);
      }
    }
    const qs = params.toString();
    u.search = qs ? `?${qs}` : '';

    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return raw;
  }
}

/** Current page's canonical key. Safe to call anywhere — falls back to href. */
export function currentPageKey(): string {
  return normalizeUrl(typeof window !== 'undefined' ? window.location.href : '');
}
