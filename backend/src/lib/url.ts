/** Normalize a URL for consistent room/key identity. Strips fragment, sorts query params. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.searchParams.sort();
    return url.toString();
  } catch {
    return raw;
  }
}

/** SHA-256 hash of a normalized URL, returned as hex. Used as DO room key and D1 index. */
export async function hashUrl(raw: string): Promise<string> {
  const normalized = normalizeUrl(raw);
  const data = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
