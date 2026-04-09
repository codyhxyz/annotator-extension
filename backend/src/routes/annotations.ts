import { Hono } from 'hono';
import type { Env, AuthUser, DbAnnotation, SyncRequest, SyncResponse } from '../lib/types';
import { hashUrl } from '../lib/url';
import { getFriendIds } from '../lib/privacy';

type HonoEnv = { Bindings: Env; Variables: { user: AuthUser } };

const annotations = new Hono<HonoEnv>();

/** Bidirectional delta sync. Client sends changes, receives server changes since last sync. */
annotations.post('/sync', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const body = await c.req.json<SyncRequest>();
  const now = Math.floor(Date.now() / 1000);

  // Apply client changes
  for (const change of body.changes) {
    if (change.action === 'upsert' && change.annotation) {
      const ann = change.annotation;
      const urlHash = await hashUrl(ann.url);

      await c.env.DB.prepare(`
        INSERT INTO annotations (id, user_id, url, url_hash, type, privacy, data, color, page_title, favicon, page_section, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          color = excluded.color,
          privacy = excluded.privacy,
          page_title = excluded.page_title,
          favicon = excluded.favicon,
          page_section = excluded.page_section,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at > annotations.updated_at
      `).bind(
        ann.id, user.id, ann.url, urlHash, ann.type, ann.privacy || 'private',
        ann.data, ann.color, ann.page_title, ann.favicon, ann.page_section,
        ann.created_at || now, ann.updated_at || now,
      ).run();
    } else if (change.action === 'delete') {
      await c.env.DB.prepare(`
        UPDATE annotations SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND (deleted_at IS NULL OR ? > updated_at)
      `).bind(change.deletedAt || now, change.deletedAt || now, change.id, user.id, change.deletedAt || now).run();
    }
  }

  // Fetch server changes since client's last sync
  const serverChanges = await c.env.DB.prepare(`
    SELECT * FROM annotations
    WHERE user_id = ? AND updated_at > ?
    ORDER BY updated_at ASC
  `).bind(user.id, body.lastSyncedAt).all<DbAnnotation>();

  // Update sync cursor
  await c.env.DB.prepare(`
    INSERT INTO sync_cursors (user_id, device_id, last_synced_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, device_id) DO UPDATE SET last_synced_at = excluded.last_synced_at
  `).bind(user.id, body.deviceId, now).run();

  const response: SyncResponse = {
    serverChanges: serverChanges.results.map(a => ({
      id: a.id,
      action: a.deleted_at ? 'delete' : 'upsert',
      annotation: a.deleted_at ? undefined : a,
      deletedAt: a.deleted_at || undefined,
    })),
    newCursor: now,
  };

  return c.json(response);
});

/** Get all visible annotations for a page (own + friends + open). */
annotations.get('/page', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required' }, 400);

  const urlHash = await hashUrl(url);
  const friendIds = await getFriendIds(c.env.DB, c.env.KV, user.id);

  // Build the query with privacy filtering
  let query: string;
  let params: (string | number)[];

  if (friendIds.length > 0) {
    const placeholders = friendIds.map((_, i) => `?${i + 3}`).join(',');
    query = `
      SELECT a.*, u.username, u.display_name, u.avatar_url
      FROM annotations a
      JOIN users u ON a.user_id = u.id
      WHERE a.url_hash = ?1
        AND a.deleted_at IS NULL
        AND (
          a.user_id = ?2
          OR (a.privacy = 'friends' AND a.user_id IN (${placeholders}))
          OR a.privacy = 'open'
        )
      ORDER BY a.created_at DESC
      LIMIT 200
    `;
    params = [urlHash, user.id, ...friendIds];
  } else {
    query = `
      SELECT a.*, u.username, u.display_name, u.avatar_url
      FROM annotations a
      JOIN users u ON a.user_id = u.id
      WHERE a.url_hash = ?1
        AND a.deleted_at IS NULL
        AND (a.user_id = ?2 OR a.privacy = 'open')
      ORDER BY a.created_at DESC
      LIMIT 200
    `;
    params = [urlHash, user.id];
  }

  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ annotations: result.results });
});

/** Update a single annotation. */
annotations.put('/:id', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<Partial<DbAnnotation>>();
  const now = Math.floor(Date.now() / 1000);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.data !== undefined) { updates.push('data = ?'); values.push(body.data); }
  if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color); }
  if (body.privacy !== undefined) { updates.push('privacy = ?'); values.push(body.privacy); }
  if (body.page_title !== undefined) { updates.push('page_title = ?'); values.push(body.page_title); }

  if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  updates.push('updated_at = ?');
  values.push(now);
  values.push(id, user.id);

  await c.env.DB.prepare(
    `UPDATE annotations SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...values).run();

  return c.json({ ok: true });
});

/** Soft-delete an annotation. */
annotations.delete('/:id', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const id = c.req.param('id');
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    'UPDATE annotations SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(now, now, id, user.id).run();

  return c.json({ ok: true });
});

/** Change privacy level of an annotation. */
annotations.patch('/:id/privacy', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{ privacy: string }>();

  if (!['private', 'friends', 'open'].includes(body.privacy)) {
    return c.json({ error: 'Invalid privacy level' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'UPDATE annotations SET privacy = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(body.privacy, now, id, user.id).run();

  return c.json({ ok: true });
});

export default annotations;
