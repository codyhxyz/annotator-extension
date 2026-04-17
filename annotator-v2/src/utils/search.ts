import { type Annotation, getHighlightData, getNoteData } from '../store/annotation';
import { storage } from '../store/storage';

export interface SearchResult {
  id: string;
  type: 'highlight' | 'note' | 'drawing';
  text: string;
  url: string;
  page: string;
  color: string;
  timestamp: number;
  pageTitle?: string;
  favicon?: string;
}

const MAX_RESULTS = 50;

function hostnameFromUrl(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function extractText(ann: Annotation): string {
  switch (ann.type) {
    case 'highlight': {
      const d = getHighlightData(ann);
      try {
        const parsed = JSON.parse(d.serializedRange);
        if (parsed?.quote?.exact) return parsed.quote.exact;
      } catch { /* ignore */ }
      return 'Highlighted text';
    }
    case 'note':
      return getNoteData(ann).text || '(empty note)';
    case 'stroke':
      return `Drawing on ${ann.pageTitle || hostnameFromUrl(ann.url)}`;
  }
}

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

export type FilterType = 'highlight' | 'note' | 'drawing';

const FILTER_TO_TYPE: Record<FilterType, Annotation['type']> = {
  highlight: 'highlight',
  note: 'note',
  drawing: 'stroke',
};

export async function searchAnnotations(
  query: string,
  filter?: FilterType | null,
): Promise<SearchResult[]> {
  // SW routes filter-by-type through an index; unfiltered list scans.
  const all = filter
    ? await storage.list({ type: FILTER_TO_TYPE[filter] })
    : await storage.list();

  const q = query.trim();
  const results: SearchResult[] = [];
  const strokesByUrl = new Map<string, Annotation[]>();

  for (const ann of all) {
    const text = extractText(ann);

    if (ann.type === 'stroke') {
      if (q && !matchesQuery(ann.url, q) && !(ann.pageTitle && matchesQuery(ann.pageTitle, q))) continue;
      const existing = strokesByUrl.get(ann.url);
      if (existing) existing.push(ann); else strokesByUrl.set(ann.url, [ann]);
      continue;
    }

    if (q && !matchesQuery(text, q) && !matchesQuery(ann.url, q)) continue;
    results.push({
      id: ann.id,
      type: ann.type === 'highlight' ? 'highlight' : 'note',
      text, url: ann.url,
      page: hostnameFromUrl(ann.url),
      color: ann.color,
      timestamp: ann.timestamp,
      pageTitle: ann.pageTitle,
      favicon: ann.favicon,
    });
  }

  for (const [url, group] of strokesByUrl) {
    const latest = group.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
    results.push({
      id: latest.id,
      type: 'drawing',
      text: `${group.length} stroke${group.length !== 1 ? 's' : ''} on ${latest.pageTitle || hostnameFromUrl(url)}`,
      url, page: hostnameFromUrl(url),
      color: latest.color,
      timestamp: latest.timestamp,
      pageTitle: latest.pageTitle,
      favicon: latest.favicon,
    });
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return results.slice(0, MAX_RESULTS);
}

export async function getAnnotationCounts(): Promise<{ highlight: number; note: number; drawing: number }> {
  const [h, n, s] = await Promise.all([
    storage.list({ type: 'highlight' }),
    storage.list({ type: 'note' }),
    storage.list({ type: 'stroke' }),
  ]);
  return { highlight: h.length, note: n.length, drawing: s.length };
}
