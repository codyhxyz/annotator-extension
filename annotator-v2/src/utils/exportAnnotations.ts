import { type Annotation, getStrokeData, getNoteData, getHighlightData } from '../store/annotation';
import { storage } from '../store/storage';
import { downloadFile } from './jsonl';

interface ExportOptions {
  url?: string;
}

/**
 * Export as canonical Markdown with YAML frontmatter.
 * One file per URL when exporting all, or one document for a single URL.
 */
export async function exportAsMarkdown(options?: ExportOptions): Promise<string> {
  const all = options?.url
    ? await storage.list({ url: options.url })
    : await storage.list();

  // Group by URL
  const groups = new Map<string, { pageTitle: string; favicon: string; items: Annotation[] }>();
  for (const ann of all) {
    let group = groups.get(ann.url);
    if (!group) {
      group = { pageTitle: ann.pageTitle || ann.url, favicon: ann.favicon, items: [] };
      groups.set(ann.url, group);
    }
    if (ann.pageTitle) group.pageTitle = ann.pageTitle;
    if (ann.favicon) group.favicon = ann.favicon;
    group.items.push(ann);
  }

  if (groups.size === 0) return '---\ntitle: My Annotations\n---\n\nNo annotations found.\n';

  // Sort pages by most recent
  const pages = [...groups.entries()].sort((a, b) => {
    const latest = (items: Annotation[]) => Math.max(...items.map(i => i.timestamp), 0);
    return latest(b[1].items) - latest(a[1].items);
  });

  const docs: string[] = [];

  for (const [url, group] of pages) {
    const allTags = new Set<string>();
    for (const ann of group.items) {
      if (ann.tags) ann.tags.forEach(t => allTags.add(t));
    }
    const latestTs = Math.max(...group.items.map(i => i.timestamp));

    // YAML frontmatter
    const frontmatter = [
      '---',
      `url: "${url}"`,
      `title: "${group.pageTitle.replace(/"/g, '\\"')}"`,
      `annotated: ${new Date(latestTs).toISOString()}`,
      `type: annotation`,
    ];
    if (allTags.size > 0) {
      frontmatter.push(`tags: [${[...allTags].map(t => `"${t}"`).join(', ')}]`);
    }
    frontmatter.push('---', '');

    const lines: string[] = [...frontmatter];
    lines.push(`# ${group.pageTitle}`, `[Source](${url})`, '');

    const highlights = group.items.filter(a => a.type === 'highlight').sort((a, b) => a.timestamp - b.timestamp);
    const notes = group.items.filter(a => a.type === 'note').sort((a, b) => a.timestamp - b.timestamp);
    const strokes = group.items.filter(a => a.type === 'stroke').sort((a, b) => a.timestamp - b.timestamp);

    if (highlights.length > 0) {
      lines.push('## Highlights', '');
      for (const h of highlights) {
        const data = getHighlightData(h);
        try {
          const parsed = JSON.parse(data.serializedRange);
          if (parsed?.quote?.exact) {
            lines.push(`> ${parsed.quote.exact}`);
            if (h.pageSection) lines.push(`> — *${h.pageSection}*`);
            lines.push('');
            continue;
          }
        } catch { /* fallback */ }
        lines.push(`- Highlight — *${h.color}*`, '');
      }
    }

    if (notes.length > 0) {
      lines.push('## Notes', '');
      for (const n of notes) {
        const data = getNoteData(n);
        lines.push(`- ${data.text || '(empty note)'}`);
      }
      lines.push('');
    }

    if (strokes.length > 0) {
      lines.push('## Drawings', '');
      for (const s of strokes) {
        const data = getStrokeData(s);
        lines.push(`- Drawing (${data.points.length} points, ${s.color})`);
      }
      lines.push('');
    }

    docs.push(lines.join('\n'));
  }

  return docs.join('\n---\n\n');
}

export function downloadMarkdown(content: string, filename?: string): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(content, filename ?? `annotations-${date}.md`, 'text/markdown;charset=utf-8');
}

export async function exportAndDownload(options?: ExportOptions): Promise<void> {
  const md = await exportAsMarkdown(options);
  downloadMarkdown(md);
}
