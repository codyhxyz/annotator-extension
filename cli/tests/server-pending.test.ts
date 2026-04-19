import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import { startServer } from '../src/server.js';

let server: Server;
const PORT = 17717;
const BASE = `http://localhost:${PORT}`;

before(async () => {
  server = startServer(PORT);
  await new Promise<void>(resolve => {
    server.once('listening', () => resolve());
  });
});
after(() => {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

test('POST /pending-notes → { id }', async () => {
  const r = await fetch(`${BASE}/pending-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/a', text: 'do X' }),
  });
  assert.equal(r.status, 201);
  const body = await r.json() as { id: string };
  assert.ok(body.id);
});

test('GET /pending-notes?url=... returns matching notes', async () => {
  await fetch(`${BASE}/pending-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/b', text: 'do Y' }),
  });
  const r = await fetch(`${BASE}/pending-notes?url=${encodeURIComponent('https://example.com/b')}`);
  assert.equal(r.status, 200);
  const body = await r.json() as { notes: Array<{ text: string }> };
  assert.ok(body.notes.some(n => n.text === 'do Y'));
});

test('DELETE /pending-notes/:id removes the entry', async () => {
  const post = await fetch(`${BASE}/pending-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/c', text: 'delete me' }),
  });
  const { id } = await post.json() as { id: string };
  const del = await fetch(`${BASE}/pending-notes/${id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  const list = await fetch(`${BASE}/pending-notes?url=${encodeURIComponent('https://example.com/c')}`);
  const body = await list.json() as { notes: unknown[] };
  assert.deepEqual(body.notes, []);
});

test('POST /pending-notes rejects when url or text missing', async () => {
  const r = await fetch(`${BASE}/pending-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/d' }),
  });
  assert.equal(r.status, 400);
});
