import { env } from './env.js';

export const corsConfig = {
  origin: env.CORS_ORIGIN,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept'],
  credentials: true,   // required for cookies to be sent cross-origin
  maxAge: 86400,
};
