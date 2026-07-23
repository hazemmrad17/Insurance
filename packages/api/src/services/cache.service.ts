/**
 * 24-hour In-Memory Assessment Cache with TTL
 */
import type { AssessResponse } from '@previa/shared/types';

interface CacheEntry {
  data: AssessResponse;
  timestamp: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CacheEntry>();

export function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

export function getCachedAssessment(lat: number, lon: number): AssessResponse | null {
  const key = getCacheKey(lat, lon);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setCachedAssessment(lat: number, lon: number, data: AssessResponse): void {
  const key = getCacheKey(lat, lon);
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}
