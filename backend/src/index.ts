import { Hono } from 'hono';
import type { Env, AuthUser } from './lib/types';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import annotationRoutes from './routes/annotations';
import friendRoutes from './routes/friends';
import voteRoutes from './routes/votes';
import { hashUrl } from './lib/url';

export { PageRoom } from './durable-objects/PageRoom';

type HonoEnv = { Bindings: Env; Variables: { user: AuthUser } };

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', corsMiddleware);

// Health check (no auth)
app.get('/health', (c) => c.json({ ok: true }));

// Auth-protected routes
app.use('/auth/*', authMiddleware);
app.use('/annotations/*', authMiddleware);
app.use('/friends/*', authMiddleware);
app.use('/votes/*', authMiddleware);

app.route('/auth', authRoutes);
app.route('/annotations', annotationRoutes);
app.route('/friends', friendRoutes);
app.route('/votes', voteRoutes);

// WebSocket upgrade — route to Durable Object for the page URL
app.get('/ws/page', authMiddleware, async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required' }, 400);

  const urlHash = await hashUrl(url);
  const roomId = c.env.PAGE_ROOM.idFromName(urlHash);
  const room = c.env.PAGE_ROOM.get(roomId);

  const user = c.get('user');
  const wsUrl = new URL(c.req.url);
  wsUrl.searchParams.set('userId', user.id);
  wsUrl.searchParams.set('displayName', user.displayName);
  wsUrl.searchParams.set('avatarUrl', user.avatarUrl || '');

  return room.fetch(new Request(wsUrl.toString(), {
    headers: c.req.raw.headers,
  }));
});

// Scheduled handler — decay old open annotations with negative scores
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env) {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);

    // Soft-delete open annotations with score <= 0 and no recent votes
    await env.DB.prepare(`
      UPDATE annotations SET deleted_at = ?, updated_at = ?
      WHERE privacy = 'open'
        AND deleted_at IS NULL
        AND created_at < ?
        AND id IN (
          SELECT annotation_id FROM annotation_scores
          WHERE score <= 0 AND (last_vote_at IS NULL OR last_vote_at < ?)
        )
    `).bind(now, now, thirtyDaysAgo, thirtyDaysAgo).run();
  },
};
