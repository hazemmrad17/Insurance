import type { Context, Next } from 'hono';

export async function errorHandler(err: Error, c: Context): Promise<Response> {
  console.error('Unhandled API Error:', err);
  return c.json(
    {
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
    500
  );
}
