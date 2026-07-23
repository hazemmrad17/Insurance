import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { env } from '../config/env.js';

const client = createClient({ url: env.DATABASE_URL });
export const db = drizzle(client, { schema });
