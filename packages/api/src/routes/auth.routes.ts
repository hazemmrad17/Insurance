import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../database/client.js';
import { users } from '../database/schema.js';
import { hashPassword, verifyPassword, signToken, buildCookieHeader, clearCookieHeader } from '../services/auth.service.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const authRoutes = new Hono<AuthEnv>();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['assureur', 'assure']).default('assureur'),
});

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const data = c.req.valid('json');

  const existing = await db.select().from(users).where(eq(users.email, data.email)).get();
  if (existing) {
    return c.json({ error: 'EMAIL_EXISTS', message: 'Cet email est déjà utilisé' }, 409);
  }

  const passwordHash = await hashPassword(data.password);
  const [newUser] = await db.insert(users).values({
    email: data.email,
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role,
  }).returning();

  const token = await signToken({
    sub: newUser.id,
    email: newUser.email,
    role: newUser.role,
  });

  c.header('Set-Cookie', buildCookieHeader(token));
  return c.json({
    user: {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
    },
  }, 201);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const data = c.req.valid('json');

  const user = await db.select().from(users).where(eq(users.email, data.email)).get();
  if (!user) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }, 401);
  }

  const valid = await verifyPassword(data.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }, 401);
  }

  const token = await signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  c.header('Set-Cookie', buildCookieHeader(token));
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
});

authRoutes.post('/logout', (c) => {
  c.header('Set-Cookie', clearCookieHeader());
  return c.json({ success: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const jwtUser = c.get('user');
  const user = await db.select().from(users).where(eq(users.id, jwtUser.sub)).get();

  if (!user) {
    return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
});
