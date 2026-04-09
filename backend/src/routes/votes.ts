import { Hono } from 'hono';
import type { Env, AuthUser } from '../lib/types';

type HonoEnv = { Bindings: Env; Variables: { user: AuthUser } };

const votes = new Hono<HonoEnv>();

/** Cast a vote on an open annotation. Updates score + strand affinity. */
votes.post('/', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const body = await c.req.json<{ annotationId: string; value: number }>();

  if (body.value !== 1 && body.value !== -1) {
    return c.json({ error: 'Vote value must be 1 or -1' }, 400);
  }

  // Verify annotation exists and is open
  const annotation = await c.env.DB.prepare(
    'SELECT id, user_id, privacy FROM annotations WHERE id = ? AND deleted_at IS NULL'
  ).bind(body.annotationId).first<{ id: string; user_id: string; privacy: string }>();

  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);
  if (annotation.privacy !== 'open') return c.json({ error: 'Can only vote on open annotations' }, 400);
  if (annotation.user_id === user.id) return c.json({ error: 'Cannot vote on your own annotation' }, 400);

  const now = Math.floor(Date.now() / 1000);

  // Check for existing vote
  const existingVote = await c.env.DB.prepare(
    'SELECT value FROM votes WHERE user_id = ? AND annotation_id = ?'
  ).bind(user.id, body.annotationId).first<{ value: number }>();

  const oldValue = existingVote?.value || 0;
  const scoreDelta = body.value - oldValue;

  // Upsert vote
  await c.env.DB.prepare(`
    INSERT INTO votes (user_id, annotation_id, value, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, annotation_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at
  `).bind(user.id, body.annotationId, body.value, now).run();

  // Update denormalized score
  await c.env.DB.prepare(`
    INSERT INTO annotation_scores (annotation_id, score, vote_count, last_vote_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(annotation_id) DO UPDATE SET
      score = annotation_scores.score + ?,
      vote_count = annotation_scores.vote_count + CASE WHEN ? = 0 THEN 1 ELSE 0 END,
      last_vote_at = ?
  `).bind(body.annotationId, body.value, now, scoreDelta, oldValue, now).run();

  // Update strand affinity — upvotes increase, downvotes decrease (asymmetric)
  const affinityDelta = body.value === 1 ? 1.0 : -0.5;
  await c.env.DB.prepare(`
    INSERT INTO strand_affinity (user_id, target_user_id, affinity, interaction_count, updated_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(user_id, target_user_id) DO UPDATE SET
      affinity = strand_affinity.affinity + ?,
      interaction_count = strand_affinity.interaction_count + 1,
      updated_at = ?
  `).bind(user.id, annotation.user_id, affinityDelta, now, affinityDelta, now).run();

  return c.json({ ok: true, scoreDelta });
});

/** Get open annotations for a URL, weighted by strand affinity. */
votes.get('/open', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required' }, 400);

  const { hashUrl } = await import('../lib/url');
  const urlHash = await hashUrl(url);

  // Fetch open annotations with scores and user's strand affinity
  const result = await c.env.DB.prepare(`
    SELECT
      a.*,
      u.username, u.display_name, u.avatar_url,
      COALESCE(s.score, 0) as score,
      COALESCE(s.vote_count, 0) as vote_count,
      COALESCE(sa.affinity, 0.0) as strand_affinity,
      v.value as my_vote
    FROM annotations a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN annotation_scores s ON s.annotation_id = a.id
    LEFT JOIN strand_affinity sa ON sa.user_id = ? AND sa.target_user_id = a.user_id
    LEFT JOIN votes v ON v.user_id = ? AND v.annotation_id = a.id
    WHERE a.url_hash = ?
      AND a.privacy = 'open'
      AND a.deleted_at IS NULL
    ORDER BY (COALESCE(s.score, 0) + COALESCE(sa.affinity, 0.0) * 2.0) DESC
    LIMIT 50
  `).bind(user.id, user.id, urlHash).all();

  return c.json({ annotations: result.results });
});

export default votes;
