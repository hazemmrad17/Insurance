/**
 * Auth middleware — reads JWT from httpOnly cookie and injects user into context.
 */
import type { Context, Next } from 'hono';
import { verifyToken } from '../services/auth.service.js';
import type { JwtPayload } from '../services/auth.service.js';

export type AuthEnv = {
  Variables: {
    user: JwtPayload;
  };
};

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const cookie = c.req.header('cookie') ?? '';
  const token = parseCookie(cookie, 'token');

  if (!token) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid or expired session' }, 401);
  }

  c.set('user', payload);
  await next();
}

export async function optionalAuth(c: Context, next: Next): Promise<void> {
  const cookie = c.req.header('cookie') ?? '';
  const token = parseCookie(cookie, 'token');
  if (token) {
    const payload = await verifyToken(token);
    if (payload) c.set('user', payload);
  }
  await next();
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
