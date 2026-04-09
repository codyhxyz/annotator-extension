import { createMiddleware } from 'hono/factory';
import type { Env } from '../lib/types';

type HonoEnv = { Bindings: Env };

/** CORS middleware — allows Chrome extension origin. */
export const corsMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  // Chrome extensions use chrome-extension:// origin
  const origin = c.req.header('Origin') || '';
  const isExtension = origin.startsWith('chrome-extension://');
  const isDev = c.env.ENVIRONMENT === 'development';

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': isExtension || isDev ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (isExtension || isDev) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
});
