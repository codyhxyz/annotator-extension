import { Hono } from 'hono';
import type { Env, AuthUser } from '../lib/types';
import { invalidateFriendCache } from '../lib/privacy';

type HonoEnv = { Bindings: Env; Variables: { user: AuthUser } };

const friends = new Hono<HonoEnv>();

/** List all friends + pending requests. */
friends.get('/', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const result = await c.env.DB.prepare(`
    SELECT f.id, f.status, f.created_at,
      CASE WHEN f.requester_id = ? THEN 'outgoing' ELSE 'incoming' END as direction,
      u.id as friend_id, u.username, u.display_name, u.avatar_url
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE (f.requester_id = ? OR f.addressee_id = ?)
      AND f.status IN ('pending', 'accepted')
    ORDER BY f.updated_at DESC
  `).bind(user.id, user.id, user.id, user.id).all();

  return c.json({ friends: result.results });
});

/** Send a friend request by username. */
friends.post('/request', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const body = await c.req.json<{ username: string }>();

  const target = await c.env.DB.prepare(
    'SELECT id, username, display_name, avatar_url FROM users WHERE username = ?'
  ).bind(body.username).first<{ id: string; username: string; display_name: string; avatar_url: string | null }>();

  if (!target) return c.json({ error: 'User not found' }, 404);
  if (target.id === user.id) return c.json({ error: 'Cannot friend yourself' }, 400);

  // Check for existing friendship in either direction
  const existing = await c.env.DB.prepare(`
    SELECT id, status FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).bind(user.id, target.id, target.id, user.id).first<{ id: string; status: string }>();

  if (existing) {
    if (existing.status === 'accepted') return c.json({ error: 'Already friends' }, 409);
    if (existing.status === 'pending') return c.json({ error: 'Request already pending' }, 409);
    if (existing.status === 'blocked') return c.json({ error: 'Unable to send request' }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO friendships (id, requester_id, addressee_id, status) VALUES (?, ?, ?, ?)'
  ).bind(id, user.id, target.id, 'pending').run();

  return c.json({ id, status: 'pending', target: { id: target.id, username: target.username } }, 201);
});

/** Accept a pending friend request. */
friends.post('/:id/accept', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const friendshipId = c.req.param('id');
  const now = Math.floor(Date.now() / 1000);

  const friendship = await c.env.DB.prepare(
    'SELECT requester_id, addressee_id, status FROM friendships WHERE id = ?'
  ).bind(friendshipId).first<{ requester_id: string; addressee_id: string; status: string }>();

  if (!friendship) return c.json({ error: 'Request not found' }, 404);
  if (friendship.addressee_id !== user.id) return c.json({ error: 'Not your request to accept' }, 403);
  if (friendship.status !== 'pending') return c.json({ error: 'Request is not pending' }, 400);

  await c.env.DB.prepare(
    'UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?'
  ).bind('accepted', now, friendshipId).run();

  await invalidateFriendCache(c.env.KV, friendship.requester_id, friendship.addressee_id);

  return c.json({ ok: true });
});

/** Reject a pending request. */
friends.post('/:id/reject', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const friendshipId = c.req.param('id');

  const friendship = await c.env.DB.prepare(
    'SELECT requester_id, addressee_id FROM friendships WHERE id = ? AND status = ?'
  ).bind(friendshipId, 'pending').first<{ requester_id: string; addressee_id: string }>();

  if (!friendship) return c.json({ error: 'Request not found' }, 404);
  if (friendship.addressee_id !== user.id && friendship.requester_id !== user.id) {
    return c.json({ error: 'Not your request' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM friendships WHERE id = ?').bind(friendshipId).run();

  return c.json({ ok: true });
});

/** Remove an existing friend. */
friends.delete('/:id', async (c) => {
  const user = c.get('user');
  if (!user.username) return c.json({ error: 'Not registered' }, 403);

  const friendshipId = c.req.param('id');

  const friendship = await c.env.DB.prepare(
    'SELECT requester_id, addressee_id FROM friendships WHERE id = ?'
  ).bind(friendshipId).first<{ requester_id: string; addressee_id: string }>();

  if (!friendship) return c.json({ error: 'Friendship not found' }, 404);
  if (friendship.requester_id !== user.id && friendship.addressee_id !== user.id) {
    return c.json({ error: 'Not your friendship' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM friendships WHERE id = ?').bind(friendshipId).run();
  await invalidateFriendCache(c.env.KV, friendship.requester_id, friendship.addressee_id);

  return c.json({ ok: true });
});

export default friends;
