import { Hono } from 'hono';
import type { Env, AuthUser } from '../lib/types';

type HonoEnv = { Bindings: Env; Variables: { user: AuthUser } };

const auth = new Hono<HonoEnv>();

/** Register a new user (called on first login from extension). */
auth.post('/register', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ username: string }>();

  if (!body.username || body.username.length < 3 || body.username.length > 30) {
    return c.json({ error: 'Username must be 3-30 characters' }, 400);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(body.username)) {
    return c.json({ error: 'Username may only contain letters, numbers, hyphens, and underscores' }, 400);
  }

  // Check if username is taken
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).bind(body.username).first();

  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  // Check if user already registered
  const existingUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ?'
  ).bind(user.id).first();

  if (existingUser) {
    return c.json({ error: 'User already registered' }, 409);
  }

  await c.env.DB.prepare(
    'INSERT INTO users (id, username, display_name, avatar_url) VALUES (?, ?, ?, ?)'
  ).bind(user.id, body.username, user.displayName || body.username, user.avatarUrl).run();

  return c.json({
    id: user.id,
    username: body.username,
    displayName: user.displayName || body.username,
    avatarUrl: user.avatarUrl,
  }, 201);
});

/** Get current user profile. */
auth.get('/me', async (c) => {
  const user = c.get('user');

  if (!user.username) {
    return c.json({ registered: false, clerkId: user.id }, 200);
  }

  return c.json({
    registered: true,
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });
});

/** Update current user profile. */
auth.patch('/me', async (c) => {
  const user = c.get('user');
  if (!user.username) {
    return c.json({ error: 'Not registered' }, 403);
  }

  const body = await c.req.json<{ displayName?: string; username?: string }>();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.displayName) {
    updates.push('display_name = ?');
    values.push(body.displayName);
  }

  if (body.username) {
    if (!/^[a-zA-Z0-9_-]+$/.test(body.username) || body.username.length < 3) {
      return c.json({ error: 'Invalid username' }, 400);
    }
    const taken = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND id != ?'
    ).bind(body.username, user.id).first();
    if (taken) return c.json({ error: 'Username taken' }, 409);
    updates.push('username = ?');
    values.push(body.username);
  }

  if (updates.length === 0) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  updates.push('updated_at = ?');
  values.push(Math.floor(Date.now() / 1000));
  values.push(user.id);

  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ ok: true });
});

export default auth;
