import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { db } from '../database/client.js';
import { clients, properties } from '../database/schema.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const clientRoutes = new Hono<AuthEnv>();

clientRoutes.use('*', requireAuth);

clientRoutes.get('/', async (c) => {
  const user = c.get('user');
  const list = await db.select().from(clients).where(eq(clients.userId, user.sub));
  return c.json(list);
});

clientRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const client = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.userId, user.sub))).get();
  if (!client) {
    return c.json({ error: 'NOT_FOUND', message: 'Client non trouvé' }, 404);
  }

  const props = await db.select().from(properties).where(eq(properties.clientId, client.id));

  return c.json({
    ...client,
    properties: props,
  });
});

const createClientSchema = z.object({
  civility: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  insuredAddress: z.string().optional(),
  insuredPostalCode: z.string().optional(),
  insuredCity: z.string().optional(),
});

clientRoutes.post('/', zValidator('json', createClientSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  const [newClient] = await db.insert(clients).values({
    userId: user.sub,
    civility: data.civility ?? null,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone ?? null,
    insuredAddress: data.insuredAddress ?? null,
    insuredPostalCode: data.insuredPostalCode ?? null,
    insuredCity: data.insuredCity ?? null,
  }).returning();

  return c.json(newClient, 201);
});

const updateClientSchema = createClientSchema.partial().extend({
  status: z.enum(['active', 'pending', 'suspended']).optional(),
});

clientRoutes.put('/:id', zValidator('json', updateClientSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const existing = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.userId, user.sub))).get();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Client non trouvé' }, 404);
  }

  const [updated] = await db.update(clients)
    .set({
      ...data,
      email: data.email || existing.email,
    })
    .where(eq(clients.id, id))
    .returning();

  return c.json(updated);
});

clientRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const existing = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.userId, user.sub))).get();
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: 'Client non trouvé' }, 404);
  }

  await db.delete(clients).where(eq(clients.id, id));
  return c.json({ success: true });
});
