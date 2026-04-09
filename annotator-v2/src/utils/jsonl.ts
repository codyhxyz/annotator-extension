/**
 * JSONL export/import — one annotation per line, full fidelity.
 * The canonical machine-readable interchange format.
 */

import { db, type Annotation } from '../store/db';

/** Export all annotations as JSONL string. */
export async function exportAsJsonl(options?: { url?: string }): Promise<string> {
  const all = options?.url
    ? await db.annotations.where('url').equals(options.url).toArray()
    : await db.annotations.toArray();

  return all.map(ann => JSON.stringify(ann)).join('\n') + (all.length > 0 ? '\n' : '');
}

/** Parse a JSONL string into Annotation objects. */
export function parseJsonl(jsonl: string): Annotation[] {
  return jsonl
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as Annotation);
}

/** Import annotations from JSONL, merging with existing data (LWW). */
export async function importFromJsonl(jsonl: string): Promise<{ imported: number; skipped: number }> {
  const incoming = parseJsonl(jsonl);
  let imported = 0;
  let skipped = 0;

  for (const ann of incoming) {
    const existing = await db.annotations.get(ann.id);
    if (existing && existing.updatedAt >= ann.updatedAt) {
      skipped++;
      continue;
    }
    await db.annotations.put({ ...ann, syncStatus: 'pending' });
    imported++;
  }

  return { imported, skipped };
}

/** Download JSONL as a file. */
export function downloadJsonl(content: string, filename?: string): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(content, filename ?? `annotations-${date}.jsonl`, 'application/x-ndjson;charset=utf-8');
}

/** Generic file download helper. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
