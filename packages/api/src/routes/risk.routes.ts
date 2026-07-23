import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { runRiskAssessment } from '../services/orchestrator.service.js';
import { optionalAuth, type AuthEnv } from '../middleware/auth.js';

export const riskRoutes = new Hono<AuthEnv>();

const assessSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  banId: z.string().optional(),
  communeCode: z.string().optional(),
  communeName: z.string().optional(),
  departmentCode: z.string().optional(),
  propertyId: z.string().optional(),
});

riskRoutes.post('/assess', optionalAuth, zValidator('json', assessSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const result = await runRiskAssessment(data, user?.sub);
  return c.json(result);
});
