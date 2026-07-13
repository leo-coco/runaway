import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiCache } from '../db/schema.js';

/**
 * Shared, DB-backed cache for third-party market API responses.
 *
 * One row per `key` is reused by every user until it expires, collapsing what
 * would be N identical upstream calls (one per browser session) into one call
 * per key per TTL. This is what keeps the free-tier quotas viable — see
 * server/routes/market.ts for the concrete FX / quote / search keys.
 *
 * `fetcher` must throw on any upstream failure (network error, non-2xx,
 * schema mismatch, provider throttle) so we never cache a bad payload. When it
 * throws, a previously cached-but-expired row is served as a fallback (stale),
 * which matters most for Alpha Vantage's ~25 req/day cap: a throttled refresh
 * keeps returning yesterday's good quote instead of surfacing an error.
 */

export type CacheStatus = 'hit' | 'miss' | 'stale';

export interface CachedResult<T> {
  readonly value: T;
  readonly status: CacheStatus;
}

/**
 * Note: two concurrent misses can both call `fetcher` (cache stampede). At
 * free-tier request volumes this is acceptable; a stale-while-revalidate lock
 * can be layered on later if traffic warrants it.
 */
export const getCached = async <T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> => {
  const now = Date.now();

  const [row] = await db.select().from(apiCache).where(eq(apiCache.key, key));
  if (row && row.expiresAt.getTime() > now) {
    return { value: row.payload as T, status: 'hit' };
  }

  try {
    const value = await fetcher();
    const expiresAt = new Date(now + ttlMs);
    await db
      .insert(apiCache)
      .values({ key, payload: value, expiresAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: apiCache.key,
        set: { payload: value, expiresAt, updatedAt: new Date() },
      });
    return { value, status: 'miss' };
  } catch (cause) {
    // Upstream failed: serve the last known-good payload if we have one.
    if (row) return { value: row.payload as T, status: 'stale' };
    throw cause;
  }
};
