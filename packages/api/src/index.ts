import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { corsConfig } from './config/cors.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { authRoutes } from './routes/auth.routes.js';
import { clientRoutes } from './routes/clients.routes.js';
import { riskRoutes } from './routes/risk.routes.js';
import { assessmentRoutes } from './routes/assessments.routes.js';
import { propertyRoutes } from './routes/properties.routes.js';

const app = new Hono();

app.use('*', cors(corsConfig));
app.onError(errorHandler);

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api/clients', clientRoutes);
app.route('/api/risk', riskRoutes);
app.route('/api/assessments', assessmentRoutes);
app.route('/api/properties', propertyRoutes);

console.log(`🚀 API Server starting on http://localhost:${env.PORT}`);

serve({
  fetch: app.fetch,
  port: env.PORT,
});
