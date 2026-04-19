#!/usr/bin/env node
/**
 * ann — CLI companion for Web Annotator.
 *
 * Usage:
 *   ann list [--url URL] [--type TYPE] [--tag TAG] [--since DATE] [--format json|tsv|md|jsonl]
 *   ann search QUERY [--type TYPE] [--format json|tsv]
 *   ann tags                          # list all tags with counts
 *   ann export [--format md|jsonl|w3c] [--url URL] [--out FILE]
 *   ann import FILE [--from jsonl|readwise|kindle|hypothesis]
 *   ann serve [--port PORT]           # start local HTTP API
 *   ann watch --out DIR               # live sync to markdown files
 *   ann orphans --url URL             # list broken annotations
 *   ann count                         # annotation counts by type
 */

import { Command } from 'commander';
import { loadAll, getDbPath, type Annotation } from './db.js';
import { startServer } from './server.js';
import { startWatch } from './watch.js';
import { readFileSync } from 'fs';

const program = new Command();
program.name('ann').description('CLI companion for Web Annotator').version('1.0.0');

// --- ann list ---
program.command('list')
  .description('List annotations')
  .option('--url <url>', 'Filter by URL')
  .option('--type <type>', 'Filter by type (stroke|note|highlight)')
  .option('--tag <tag>', 'Filter by tag')
  .option('--since <date>', 'Only after this date')
  .option('--format <fmt>', 'Output format: json (default), tsv, jsonl', 'json')
  .action((opts) => {
    let all = loadAll();
    if (opts.url) all = all.filter(a => a.url.includes(opts.url));
    if (opts.type) all = all.filter(a => a.type === opts.type);
    if (opts.tag) all = all.filter(a => a.tags?.includes(opts.tag));
    if (opts.since) {
      const since = new Date(opts.since).getTime();
      all = all.filter(a => a.timestamp >= since);
    }
    output(all, opts.format);
  });

// --- ann search ---
program.command('search <query>')
  .description('Search annotations')
  .option('--type <type>', 'Filter by type')
  .option('--format <fmt>', 'Output format', 'json')
  .action((query, opts) => {
    let all = loadAll();
    const q = query.toLowerCase();
    all = all.filter(a => {
      const text = extractText(a);
      return text.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q) ||
        a.pageTitle?.toLowerCase().includes(q);
    });
    if (opts.type) all = all.filter(a => a.type === opts.type);
    output(all, opts.format);
  });

// --- ann tags ---
program.command('tags')
  .description('List all tags with counts')
  .action(() => {
    const all = loadAll();
    const counts = new Map<string, number>();
    for (const a of all) {
      for (const t of a.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sorted) {
      console.log(`${count}\t${tag}`);
    }
  });

// --- ann count ---
program.command('count')
  .description('Count annotations by type')
  .action(() => {
    const all = loadAll();
    const counts = { stroke: 0, note: 0, highlight: 0, total: 0 };
    for (const a of all) {
      counts[a.type]++;
      counts.total++;
    }
    console.log(JSON.stringify(counts, null, 2));
  });

// --- ann export ---
program.command('export')
  .description('Export annotations')
  .option('--format <fmt>', 'Export format: jsonl (default), md, w3c', 'jsonl')
  .option('--url <url>', 'Filter by URL')
  .option('--out <file>', 'Write to file instead of stdout')
  .action((opts) => {
    let all = loadAll();
    if (opts.url) all = all.filter(a => a.url.includes(opts.url));

    let content: string;
    switch (opts.format) {
      case 'md':
        content = toMarkdown(all);
        break;
      case 'w3c':
        content = JSON.stringify(all.map(toW3C), null, 2);
        break;
      default:
        content = all.map(a => JSON.stringify(a)).join('\n') + '\n';
    }

    if (opts.out) {
      const { writeFileSync } = require('fs');
      writeFileSync(opts.out, content);
      console.error(`Wrote ${all.length} annotations to ${opts.out}`);
    } else {
      process.stdout.write(content);
    }
  });

// --- ann import ---
program.command('import <file>')
  .description('Import annotations from file')
  .option('--from <format>', 'Source format: jsonl (default)', 'jsonl')
  .action((file, opts) => {
    const content = readFileSync(file, 'utf-8');
    const incoming = content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) as Annotation[];
    const existing = loadAll();
    const existingIds = new Set(existing.map(a => a.id));

    let imported = 0;
    for (const ann of incoming) {
      if (!existingIds.has(ann.id)) {
        existing.push(ann);
        imported++;
      }
    }

    const { saveAll } = require('./db.js');
    saveAll(existing);
    console.error(`Imported ${imported} annotations (${incoming.length - imported} skipped)`);
  });

// --- ann serve ---
program.command('serve')
  .description('Start local HTTP API server')
  .option('--port <port>', 'Port number', '7717')
  .action((opts) => {
    void startServer(parseInt(opts.port));
  });

// --- ann watch ---
program.command('watch')
  .description('Live sync annotations to markdown files')
  .requiredOption('--out <dir>', 'Output directory')
  .action((opts) => {
    startWatch(opts.out);
  });

// --- ann path ---
program.command('path')
  .description('Print the annotation database file path')
  .action(() => {
    console.log(getDbPath());
  });

program.parse();

// --- Helpers ---

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

function output(annotations: Annotation[], format: string) {
  switch (format) {
    case 'tsv':
      console.log('id\ttype\turl\ttext\ttimestamp\ttags');
      for (const a of annotations) {
        console.log(`${a.id}\t${a.type}\t${a.url}\t${extractText(a)}\t${new Date(a.timestamp).toISOString()}\t${(a.tags || []).join(',')}`);
      }
      break;
    case 'jsonl':
      for (const a of annotations) console.log(JSON.stringify(a));
      break;
    default:
      console.log(JSON.stringify(annotations, null, 2));
  }
}

function toMarkdown(annotations: Annotation[]): string {
  const groups = new Map<string, Annotation[]>();
  for (const a of annotations) {
    if (!groups.has(a.url)) groups.set(a.url, []);
    groups.get(a.url)!.push(a);
  }

  const lines: string[] = [];
  for (const [url, anns] of groups) {
    const title = anns[0].pageTitle || url;
    const tags = new Set<string>();
    anns.forEach(a => a.tags?.forEach(t => tags.add(t)));

    lines.push('---');
    lines.push(`url: "${url}"`);
    lines.push(`title: "${title.replace(/"/g, '\\"')}"`);
    lines.push(`annotated: ${new Date(Math.max(...anns.map(a => a.timestamp))).toISOString()}`);
    if (tags.size > 0) lines.push(`tags: [${[...tags].map(t => `"${t}"`).join(', ')}]`);
    lines.push('---', '', `# ${title}`, `[Source](${url})`, '');

    const highlights = anns.filter(a => a.type === 'highlight');
    const notes = anns.filter(a => a.type === 'note');

    if (highlights.length > 0) {
      lines.push('## Highlights', '');
      for (const h of highlights) {
        const text = extractText(h);
        lines.push(`> ${text}`, '');
      }
    }
    if (notes.length > 0) {
      lines.push('## Notes', '');
      for (const n of notes) {
        lines.push(`- ${extractText(n)}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function toW3C(ann: Annotation) {
  const base: Record<string, unknown> = {
    '@context': 'http://www.w3.org/ns/anno.jsonld',
    id: `ann://${ann.type[0]}/${ann.id}`,
    type: 'Annotation',
    created: new Date(ann.timestamp).toISOString(),
    target: { source: ann.url },
  };

  if (ann.type === 'highlight') {
    base.motivation = 'highlighting';
    try {
      const data = JSON.parse(ann.data);
      const sr = JSON.parse(data.serializedRange);
      if (sr?.quote) {
        (base.target as Record<string, unknown>).selector = { type: 'TextQuoteSelector', exact: sr.quote.exact, prefix: sr.quote.prefix, suffix: sr.quote.suffix };
      }
    } catch { /* skip */ }
  } else if (ann.type === 'note') {
    base.motivation = 'commenting';
    const data = JSON.parse(ann.data);
    if (data.text) base.body = { type: 'TextualBody', value: data.text, format: 'text/plain' };
  }

  return base;
}
