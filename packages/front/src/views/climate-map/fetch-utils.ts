/**
 * Shared fetch utilities — Kept in its own module to avoid circular dependencies
 * between climate-map.ts and georisques-viz.ts.
 */

/** Fetch with AbortController timeout — fail fast on slow APIs */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 4000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
