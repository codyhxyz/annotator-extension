/**
 * Live vault sync — watch the JSONL store and write Markdown files.
 * One file per annotated URL, named by slugified title.
 */

import { watch } from 'chokidar';
import { loadAll, getDbPath, type Annotation } from './db.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function extractText(ann: Annotation): string {
  const data = JSON.parse(ann.data);
  switch (ann.type) {
    case 'highlight': {
      try {
        const sr = JSON.parse(data.serializedRange);
        return sr?.quote?.exact || 'Highlight';
      } catch { return 'Highlight'; }
    }
    case 'note': return data.text || '';
    case 'stroke': return `Drawing (${data.points?.length || 0} points)`;
  }
}

function writeVaultFiles(outDir: string) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const all = loadAll();
  const groups = new Map<string, Annotation[]>();
  for (const a of all) {
    if (!groups.has(a.url)) groups.set(a.url, []);
    groups.get(a.url)!.push(a);
  }

  let written = 0;
  for (const [url, anns] of groups) {
    const title = anns[0].pageTitle || new URL(url).hostname;
    const filename = slugify(title) + '.md';
    const filepath = join(outDir, filename);

    const tags = new Set<string>();
    anns.forEach(a => a.tags?.forEach(t => tags.add(t)));

    const lines: string[] = [
      '---',
      `url: "${url}"`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      `annotated: ${new Date(Math.max(...anns.map(a => a.timestamp))).toISOString()}`,
      `type: annotation`,
    ];
    if (tags.size > 0) lines.push(`tags: [${[...tags].map(t => `"${t}"`).join(', ')}]`);
    lines.push('---', '', `# ${title}`, `[Source](${url})`, '');

    const highlights = anns.filter(a => a.type === 'highlight').sort((a, b) => a.timestamp - b.timestamp);
    const notes = anns.filter(a => a.type === 'note').sort((a, b) => a.timestamp - b.timestamp);

    if (highlights.length > 0) {
      lines.push('## Highlights', '');
      for (const h of highlights) lines.push(`> ${extractText(h)}`, '');
    }

    if (notes.length > 0) {
      lines.push('## Notes', '');
      for (const n of notes) lines.push(`- ${extractText(n)}`);
      lines.push('');
    }

    writeFileSync(filepath, lines.join('\n'));
    written++;
  }

  return written;
}

export function startWatch(outDir: string) {
  const dbPath = getDbPath();

  console.log(`ann watch — syncing to ${outDir}`);
  console.log(`  watching ${dbPath}`);

  // Initial sync
  const count = writeVaultFiles(outDir);
  console.log(`  wrote ${count} files`);

  // Watch for changes
  const watcher = watch(dbPath, { persistent: true, ignoreInitial: true });
  watcher.on('change', () => {
    const c = writeVaultFiles(outDir);
    console.log(`  updated ${c} files`);
  });

  console.log('  watching for changes... (Ctrl+C to stop)');
}
