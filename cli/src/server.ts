/**
 * Local HTTP API server — exposes annotation CRUD + pending-notes queue
 * on localhost. Enables Raycast, Alfred, the Handoff plugin, and other
 * tools to interact with annotations.
 */

import { createServer, type Server } from 'http';
import { loadAll, addAnnotation, deleteAnnotation, type Annotation } from './db.js';
import { randomUUID } from 'crypto';
import { PendingNotesStore } from './pending-notes.js';

const pending = new PendingNotesStore();

export function startServer(port: number = 7717): Server {
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
      if (path === '/health') return json({ ok: true });

      // ── Pending notes queue ──────────────────────────────────────
      if (path === '/pending-notes' && req.method === 'POST') {
        const body = await readBody(req) as Record<string, unknown>;
        const urlStr = body.url as string | undefined;
        const text = body.text as string | undefined;
        if (!urlStr || !text) return json({ error: 'url and text are required' }, 400);
        const id = pending.add({
          url: urlStr,
          text,
          color: typeof body.color === 'string' ? body.color : undefined,
          tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
        });
        return json({ id }, 201);
      }

      if (path === '/pending-notes' && req.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'url query param required' }, 400);
        return json({ notes: pending.findByUrl(target) });
      }

      if (path.startsWith('/pending-notes/') && req.method === 'DELETE') {
        const id = path.slice('/pending-notes/'.length);
        pending.delete(id);
        res.writeHead(204); res.end(); return;
      }

      // ── Legacy annotation endpoints (unchanged) ──────────────────
      if (path === '/annotations' && req.method === 'GET') {
        let all = loadAll();
        const filterUrl = url.searchParams.get('url');
        const filterType = url.searchParams.get('type');
        if (filterUrl) all = all.filter(a => a.url.includes(filterUrl));
        if (filterType) all = all.filter(a => a.type === filterType);
        return json({ annotations: all, count: all.length });
      }
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
      if (path.startsWith('/annotations/') && req.method === 'DELETE') {
        const id = path.split('/')[2];
        deleteAnnotation(id);
        return json({ ok: true });
      }

      json({ error: 'Not found' }, 404);
    } catch (err) {
      json({ error: (err as Error).message }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`ann serve — listening on http://localhost:${port}`);
    console.log(`  POST   /pending-notes         {url, text, color?, tags?}`);
    console.log(`  GET    /pending-notes?url=... queue drain for a URL`);
    console.log(`  DELETE /pending-notes/:id     acknowledge drained`);
    console.log(`  GET    /annotations           legacy read`);
  });

  return server;
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
