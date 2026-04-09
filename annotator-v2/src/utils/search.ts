import { db, type Annotation, getHighlightData, getNoteData } from '../store/db';

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

export async function searchAnnotations(
  query: string,
  filter?: FilterType | null,
): Promise<SearchResult[]> {
  let all = await db.annotations.toArray();

  // Map filter to annotation type
  if (filter === 'highlight') all = all.filter(a => a.type === 'highlight');
  else if (filter === 'note') all = all.filter(a => a.type === 'note');
  else if (filter === 'drawing') all = all.filter(a => a.type === 'stroke');

  const q = query.trim();
  const results: SearchResult[] = [];

  // Group strokes by URL
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
  const all = await db.annotations.toArray();
  let highlight = 0, note = 0, drawing = 0;
  for (const a of all) {
    if (a.type === 'highlight') highlight++;
    else if (a.type === 'note') note++;
    else if (a.type === 'stroke') drawing++;
  }
  return { highlight, note, drawing };
}
