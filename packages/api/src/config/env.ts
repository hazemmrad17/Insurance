/**
 * Environment variable validation with Zod.
 * Loads .env manually if process.env values are missing.
 */
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Parse .env file if available
try {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const fileContent = readFileSync(envPath, 'utf-8');
    for (const line of fileContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valParts] = trimmed.split('=');
      const val = valParts.join('=').trim();
      if (key && val && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
} catch {
  // Ignore file read errors
}

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('file:./data/previa.db'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default('change-me-to-a-long-random-secret-in-production'),
  JWT_EXPIRATION: z.string().default('24h'),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  GEORISQUES_V2_TOKEN: z.string().default(''),
  BDNB_API_KEY: z.string().default(''),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  for (const [key, errors] of Object.entries(result.error.flatten().fieldErrors)) {
    console.error(`  ${key}: ${(errors as string[]).join(', ')}`);
  }
  process.exit(1);
}

export const env = result.data;
