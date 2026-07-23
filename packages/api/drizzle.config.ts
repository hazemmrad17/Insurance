import { defineConfig } from 'drizzle-kit';

const url = process.env['DATABASE_URL'] ?? 'file:./data/previa.db';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  dialect: url.startsWith('postgresql') ? 'postgresql' : 'sqlite',
  dbCredentials: { url },
});
