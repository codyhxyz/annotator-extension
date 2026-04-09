import { createMiddleware } from 'hono/factory';
import type { Env, AuthUser } from '../lib/types';

type HonoEnv = { Bindings: Env; Variables: { user: AuthUser } };

/** Verify Clerk JWT and attach user to context. */
export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    // Verify the JWT using Clerk's JWKS endpoint
    const clerkSecretKey = c.env.CLERK_SECRET_KEY;
    const payload = await verifyClerkToken(token, clerkSecretKey);

    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Look up the user in our DB
    const dbUser = await c.env.DB.prepare(
      'SELECT id, username, display_name, avatar_url FROM users WHERE id = ?'
    ).bind(payload.sub).first<{ id: string; username: string; display_name: string; avatar_url: string | null }>();

    if (!dbUser) {
      // User exists in Clerk but not in our DB — they need to register
      c.set('user', {
        id: payload.sub,
        username: '',
        displayName: payload.name || '',
        avatarUrl: payload.image_url || null,
      });
    } else {
      c.set('user', {
        id: dbUser.id,
        username: dbUser.username,
        displayName: dbUser.display_name,
        avatarUrl: dbUser.avatar_url,
      });
    }

    await next();
  } catch (e) {
    console.error('Auth error:', e);
    return c.json({ error: 'Authentication failed' }, 401);
  }
});

/** Verify a Clerk session JWT. Uses Clerk's Backend API for simplicity. */
async function verifyClerkToken(
  token: string,
  secretKey: string,
): Promise<{ sub: string; name?: string; image_url?: string } | null> {
  // Use Clerk Backend API to verify the session token
  const response = await fetch('https://api.clerk.com/v1/tokens/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) return null;

  const data = await response.json() as { sub: string; name?: string; image_url?: string };
  return data;
}
