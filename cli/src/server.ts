/**
 * Local HTTP API server — exposes annotation CRUD on localhost.
 * Enables Raycast, Alfred, scripts, and other tools to interact.
 */

import { createServer } from 'http';
import { loadAll, saveAll, addAnnotation, deleteAnnotation, type Annotation } from './db.js';
import { randomUUID } from 'crypto';

export function startServer(port: number = 7717) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const path = url.pathname;

    // CORS — only allow local and extension origins
    const origin = req.headers['origin'];
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      // GET /health
      if (path === '/health') return json({ ok: true });

      // GET /annotations
      if (path === '/annotations' && req.method === 'GET') {
        let all = loadAll();
        const filterUrl = url.searchParams.get('url');
        const filterType = url.searchParams.get('type');
        const filterTag = url.searchParams.get('tag');
        const since = url.searchParams.get('since');
        const q = url.searchParams.get('q');

        if (filterUrl) all = all.filter(a => a.url.includes(filterUrl));
        if (filterType) all = all.filter(a => a.type === filterType);
        if (filterTag) all = all.filter(a => a.tags?.includes(filterTag));
        if (since) { const s = new Date(since).getTime(); all = all.filter(a => a.timestamp >= s); }
        if (q) {
          const ql = q.toLowerCase();
          all = all.filter(a => {
            const data = JSON.parse(a.data);
            const text = a.type === 'note' ? data.text : a.type === 'highlight' ? (JSON.parse(data.serializedRange || '{}')?.quote?.exact || '') : '';
            return text.toLowerCase().includes(ql) || a.url.toLowerCase().includes(ql) || (a.pageTitle || '').toLowerCase().includes(ql);
          });
        }

        return json({ annotations: all, count: all.length });
      }

      // POST /annotations
      if (path === '/annotations' && req.method === 'POST') {
        const body = await readBody(req) as Record<string, any>;
        const ann: Annotation = {
          id: (body.id as string) || randomUUID(),
          url: body.url as string,
          type: (body.type as Annotation['type']) || 'note',
          privacy: (body.privacy as Annotation['privacy']) || 'private',
          syncStatus: 'pending',
          data: typeof body.data === 'string' ? body.data : JSON.stringify(body.data),
          color: (body.color as string) || '#fef08a',
          timestamp: (body.timestamp as number) || Date.now(),
          updatedAt: Math.floor(Date.now() / 1000),
          pageTitle: (body.pageTitle as string) || '',
          favicon: (body.favicon as string) || '',
          pageSection: body.pageSection as string | undefined,
          tags: (body.tags as string[]) || [],
        };
        addAnnotation(ann);
        return json(ann, 201);
      }

      // DELETE /annotations/:id
      if (path.startsWith('/annotations/') && req.method === 'DELETE') {
        const id = path.split('/')[2];
        deleteAnnotation(id);
        return json({ ok: true });
      }

      // GET /tags
      if (path === '/tags' && req.method === 'GET') {
        const all = loadAll();
        const counts = new Map<string, number>();
        for (const a of all) {
          for (const t of a.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
        }
        return json({ tags: Object.fromEntries(counts) });
      }

      // GET /export
      if (path === '/export' && req.method === 'GET') {
        const format = url.searchParams.get('format') || 'jsonl';
        let all = loadAll();
        const filterUrl = url.searchParams.get('url');
        if (filterUrl) all = all.filter(a => a.url.includes(filterUrl));

        if (format === 'jsonl') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.end(all.map(a => JSON.stringify(a)).join('\n') + '\n');
        } else {
          return json(all);
        }
        return;
      }

      json({ error: 'Not found' }, 404);
    } catch (err) {
      json({ error: (err as Error).message }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`ann serve — listening on http://localhost:${port}`);
    console.log(`  GET  /annotations?url=...&type=...&tag=...&q=...`);
    console.log(`  POST /annotations`);
    console.log(`  DELETE /annotations/:id`);
    console.log(`  GET  /tags`);
    console.log(`  GET  /export?format=jsonl`);
    console.log(`  GET  /health`);
  });
}

function isAllowedOrigin(origin: string): boolean {
  return (
    origin.startsWith('chrome-extension://') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

function readBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
