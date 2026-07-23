import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../database/client.js';
import { properties } from '../database/schema.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const propertyRoutes = new Hono<AuthEnv>();

propertyRoutes.use('*', requireAuth);

propertyRoutes.get('/', async (c) => {
  const list = await db.select().from(properties);
  return c.json(list);
});

propertyRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const record = await db.select().from(properties).where(eq(properties.id, id)).get();
  if (!record) {
    return c.json({ error: 'NOT_FOUND', message: 'Propriété non trouvée' }, 404);
  }
  return c.json(record);
});

const createPropertySchema = z.object({
  clientId: z.string().min(1),
  address: z.string().min(1),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  dpeClass: z.string().optional(),
  builtYear: z.number().optional(),
  banId: z.string().optional(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
});

propertyRoutes.post('/', zValidator('json', createPropertySchema), async (c) => {
  const data = c.req.valid('json');
  const [newProp] = await db.insert(properties).values({
    clientId: data.clientId,
    address: data.address,
    postalCode: data.postalCode ?? null,
    city: data.city ?? null,
    dpeClass: data.dpeClass ?? null,
    builtYear: data.builtYear ?? null,
    banId: data.banId ?? null,
    longitude: data.longitude ?? null,
    latitude: data.latitude ?? null,
  }).returning();

  return c.json(newProp, 201);
});

propertyRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(properties).where(eq(properties.id, id));
  return c.json({ success: true });
});
