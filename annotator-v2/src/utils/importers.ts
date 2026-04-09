/**
 * Import annotations from external tools.
 * Each importer parses a source format → Annotation[] → bulk insert.
 */

import { db, type Annotation, type AnnotationInput } from '../store/db';
import { parseJsonl } from './jsonl';

// --- JSONL (our own format — backup/restore roundtrip) ---

export async function importJsonl(content: string): Promise<{ imported: number; skipped: number }> {
  const incoming = parseJsonl(content);
  const ids = incoming.map(a => a.id);
  const existing = await db.annotations.bulkGet(ids);
  const existingMap = new Map(existing.filter(Boolean).map(a => [a!.id, a!]));

  const toPut: Annotation[] = [];
  let skipped = 0;

  for (const ann of incoming) {
    const ex = existingMap.get(ann.id);
    if (ex && ex.updatedAt >= ann.updatedAt) { skipped++; continue; }
    toPut.push({ ...ann, syncStatus: 'pending' });
  }

  if (toPut.length > 0) await db.annotations.bulkPut(toPut);
  return { imported: toPut.length, skipped };
}

// --- Readwise CSV ---

export async function importReadwiseCsv(content: string): Promise<{ imported: number }> {
  const lines = content.split('\n');
  if (lines.length < 2) return { imported: 0 };

  const headers = parseCSVLine(lines[0]);
  const highlightIdx = headers.indexOf('Highlight');
  const noteIdx = headers.indexOf('Note');
  const titleIdx = headers.indexOf('Book Title');
  const urlIdx = headers.indexOf('URL');
  const dateIdx = headers.indexOf('Date');

  const annotations: AnnotationInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const highlight = cols[highlightIdx] || '';
    const note = cols[noteIdx] || '';
    const title = cols[titleIdx] || '';
    const url = cols[urlIdx] || `readwise://import/${encodeURIComponent(title)}`;
    const dateStr = cols[dateIdx] || '';
    const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();

    if (highlight) {
      annotations.push({
        id: crypto.randomUUID(),
        url,
        type: 'highlight',
        data: JSON.stringify({ serializedRange: JSON.stringify({ quote: { type: 'TextQuoteSelector', exact: highlight, prefix: '', suffix: '' }, position: { type: 'TextPositionSelector', start: 0, end: highlight.length } }) }),
        color: '#fde047',
        timestamp,
        pageTitle: title,
        favicon: '',
        tags: ['readwise-import'],
      });
    }

    if (note) {
      annotations.push({
        id: crypto.randomUUID(),
        url,
        type: 'note',
        data: JSON.stringify({ text: note, x: 100, y: 100, width: 250, height: 120 }),
        color: '#fef08a',
        timestamp,
        pageTitle: title,
        favicon: '',
        tags: ['readwise-import'],
      });
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const records: Annotation[] = annotations.map(a => ({
    ...a,
    privacy: 'private' as const,
    syncStatus: 'pending' as const,
    updatedAt: now,
  }));

  await db.annotations.bulkAdd(records);
  return { imported: records.length };
}

// --- Kindle "My Clippings.txt" ---

export async function importKindleClippings(content: string): Promise<{ imported: number }> {
  const entries = content.split('==========').filter(e => e.trim());
  const annotations: AnnotationInput[] = [];

  for (const entry of entries) {
    const lines = entry.trim().split('\n').filter(l => l.trim());
    if (lines.length < 3) continue;

    const titleLine = lines[0].trim();
    const metaLine = lines[1].trim();
    const text = lines.slice(2).join('\n').trim();

    if (!text) continue;

    // Parse metadata: "- Your Highlight on page 42 | Location 650-655 | Added on Monday, March 15, 2026 10:30:00 AM"
    const dateMatch = metaLine.match(/Added on (.+)/);
    const timestamp = dateMatch ? new Date(dateMatch[1]).getTime() : Date.now();

    const isNote = metaLine.includes('Your Note');
    const url = `kindle://book/${encodeURIComponent(titleLine)}`;

    annotations.push({
      id: crypto.randomUUID(),
      url,
      type: isNote ? 'note' : 'highlight',
      data: isNote
        ? JSON.stringify({ text, x: 100, y: 100, width: 250, height: 120 })
        : JSON.stringify({ serializedRange: JSON.stringify({ quote: { type: 'TextQuoteSelector', exact: text, prefix: '', suffix: '' }, position: { type: 'TextPositionSelector', start: 0, end: text.length } }) }),
      color: isNote ? '#fef08a' : '#fde047',
      timestamp: isNaN(timestamp) ? Date.now() : timestamp,
      pageTitle: titleLine,
      favicon: '',
      tags: ['kindle-import'],
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const records: Annotation[] = annotations.map(a => ({
    ...a,
    privacy: 'private' as const,
    syncStatus: 'pending' as const,
    updatedAt: now,
  }));

  await db.annotations.bulkAdd(records);
  return { imported: records.length };
}

// --- Hypothesis JSON export ---

export async function importHypothesisJson(content: string): Promise<{ imported: number }> {
  const data = JSON.parse(content);
  const rows = Array.isArray(data) ? data : data.rows || [];
  const annotations: AnnotationInput[] = [];

  for (const row of rows) {
    const url = row.uri || row.url || '';
    const text = row.text || '';
    const target = row.target?.[0];
    const selectors = target?.selector || [];

    const quoteSelector = selectors.find((s: { type: string }) => s.type === 'TextQuoteSelector');
    const positionSelector = selectors.find((s: { type: string }) => s.type === 'TextPositionSelector');

    const exact = quoteSelector?.exact || '';
    const timestamp = row.created ? new Date(row.created).getTime() : Date.now();

    if (exact) {
      annotations.push({
        id: crypto.randomUUID(),
        url,
        type: 'highlight',
        data: JSON.stringify({
          serializedRange: JSON.stringify({
            quote: { type: 'TextQuoteSelector', exact, prefix: quoteSelector?.prefix || '', suffix: quoteSelector?.suffix || '' },
            position: positionSelector || { type: 'TextPositionSelector', start: 0, end: exact.length },
          }),
        }),
        color: '#fde047',
        timestamp,
        pageTitle: row.document?.title?.[0] || '',
        favicon: '',
        tags: [...(row.tags || []), 'hypothesis-import'],
      });
    }

    if (text) {
      annotations.push({
        id: crypto.randomUUID(),
        url,
        type: 'note',
        data: JSON.stringify({ text, x: 100, y: 100, width: 250, height: 120 }),
        color: '#fef08a',
        timestamp,
        pageTitle: row.document?.title?.[0] || '',
        favicon: '',
        tags: [...(row.tags || []), 'hypothesis-import'],
      });
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const records: Annotation[] = annotations.map(a => ({
    ...a,
    privacy: 'private' as const,
    syncStatus: 'pending' as const,
    updatedAt: now,
  }));

  await db.annotations.bulkAdd(records);
  return { imported: records.length };
}

// --- CSV parsing helper ---

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
