import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { rateLimit } from '../db/schema.js';

export interface RateLimitResult {
  /** True once the caller has exceeded `max` hits in the current window. */
  readonly limited: boolean;
  /** Hits remaining before the caller is limited (0 once limited). */
  readonly remaining: number;
}

/**
 * Fixed-window IP limiter backed by a single atomic upsert, so the counter holds
 * across serverless instances instead of resetting on every cold start (as an
 * in-memory counter would). The whole read-modify-write is one statement, so
 * concurrent requests to the same key can't lose an increment to a race.
 *
 * On insert the window starts at `count` 1. On conflict the CASE resets the row
 * when the stored window has expired, otherwise increments in place — the window
 * therefore rolls forward lazily on the first hit past `expiresAt`.
 */
export const hitRateLimit = async (
  key: string,
  windowMs: number,
  max: number,
): Promise<RateLimitResult> => {
  const now = new Date();
  const freshExpiry = new Date(now.getTime() + windowMs);
  const [row] = await db
    .insert(rateLimit)
    .values({ key, count: 1, expiresAt: freshExpiry })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.expiresAt} < ${now} then 1 else ${rateLimit.count} + 1 end`,
        expiresAt: sql`case when ${rateLimit.expiresAt} < ${now} then ${freshExpiry} else ${rateLimit.expiresAt} end`,
      },
    })
    .returning({ count: rateLimit.count });

  const count = row?.count ?? 1;
  return { limited: count > max, remaining: Math.max(0, max - count) };
};
