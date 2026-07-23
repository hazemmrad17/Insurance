import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../database/client.js';
import { assessments } from '../database/schema.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const assessmentRoutes = new Hono<AuthEnv>();

assessmentRoutes.use('*', requireAuth);

assessmentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const list = await db.select().from(assessments).where(eq(assessments.userId, user.sub));
  return c.json(list);
});

assessmentRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const record = await db.select().from(assessments).where(eq(assessments.id, id)).get();

  if (!record) {
    return c.json({ error: 'NOT_FOUND', message: 'Evaluation non trouvée' }, 404);
  }

  return c.json(record);
});

assessmentRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(assessments).where(eq(assessments.id, id));
  return c.json({ success: true });
});
